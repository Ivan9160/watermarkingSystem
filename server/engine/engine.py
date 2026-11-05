#!/usr/bin/env python3
"""Watermark engine: JSON job in -> JSON result out (PixelSeal only). Runs as a local subprocess of the image worker.

  python engine.py job.json     one job; prints one JSON line; exit code 0 (ok), 2 (bad input), 3 (error)
  python engine.py --serve      many jobs: one JSON job per stdin line, one JSON result per stdout line.
                                The model stays loaded between jobs (use this in production).
"""
import hashlib, hmac, json, os, re, sys, time
import numpy as np
import cv2

import wmcli
from wmcli import METHODS, CAPACITY, NBITS

ID_BITS = 40
TAG_TOLERANCE = 2
MAX_PIXELS = int(os.environ.get("WM_MAX_PIXELS", 40_000_000))


class JobError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code, self.msg = code, msg


def get_key(key_id):
    name = "WM_KEY_" + re.sub(r"[^A-Za-z0-9]", "_", key_id or "").upper()
    key = os.environ.get(name) or os.environ.get("WM_KEY")
    if not key:
        raise JobError(2, f"no secret key: set {name} (or WM_KEY) in the environment")
    return key


def make_payload(id_hex, key, cap):
    if not re.fullmatch(r"[0-9a-fA-F]{10}", id_hex or ""):
        raise JobError(2, "id must be exactly 10 hex characters (40 bits)")
    id_bits = [int(b) for b in bin(int(id_hex, 16))[2:].zfill(ID_BITS)]
    tag = hmac.new(key.encode(), bytes.fromhex(id_hex), hashlib.sha256).digest()
    tag_bits = [(tag[i // 8] >> (7 - i % 8)) & 1 for i in range(cap - ID_BITS)]
    return id_bits + tag_bits


def parse_payload(bits, key, cap):
    id_hex = f"{int(''.join(str(int(b)) for b in bits[:ID_BITS]), 2):010x}"
    expected = make_payload(id_hex, key, cap)[ID_BITS:]
    dist = int(np.sum(np.array(expected) != np.array(bits[ID_BITS:cap])))
    return id_hex, dist


def load_image(path):
    abs_path = os.path.abspath(path)
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise JobError(2, f"cannot read image: {path}")
    if img.dtype == np.uint16:
        img = (img // 257).astype(np.uint8)
    elif img.dtype != np.uint8:
        raise JobError(2, f"unsupported pixel type {img.dtype}")
    h, w = img.shape[:2]
    if h * w > MAX_PIXELS:
        raise JobError(2, f"image too large ({w}x{h}, limit {MAX_PIXELS} pixels)")
    alpha = None
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        alpha, img = img[:, :, 3], img[:, :, :3]
    return np.ascontiguousarray(img), alpha


def check_method(job):
    method = job.get("method", "pixelseal")
    if method != "pixelseal":
        raise JobError(2, f"only 'pixelseal' method is supported, got {method!r}")
    cap = CAPACITY["pixelseal"]
    return "pixelseal", cap


def op_embed(job):
    method, cap = check_method(job)
    key = get_key(job.get("keyId"))
    payload = make_payload(job.get("id"), key, cap)
    out_path = os.path.abspath(job.get("output"))
    if not out_path:
        raise JobError(2, "missing 'output'")
    img, alpha = load_image(job.get("input", ""))
    if alpha is not None and not out_path.lower().endswith(".png"):
        raise JobError(2, "a transparent image needs a .png output")
    emb, dec = METHODS["pixelseal"]
    t0 = time.time()
    wm = emb(img.copy(), payload + [0] * (NBITS - cap), key)
    seconds = time.time() - t0
    if wm.shape != img.shape:
        raise JobError(3, "watermarked image has a different size")
    mse = float(np.mean((img.astype(np.float64) - wm.astype(np.float64)) ** 2))
    result = {"ok": True, "op": "embed", "method": method, "id": job["id"].lower(), "keyId": job.get("keyId"),
              "width": int(img.shape[1]), "height": int(img.shape[0]),
              "psnr": round(10 * np.log10(255 ** 2 / max(mse, 1e-9)), 2), "seconds": round(seconds, 3)}
    if job.get("selfCheck", True):
        got = dec(wm, key)
        if got is None:
            raise JobError(3, "self-check failed: watermark not found after embedding")
        found_id, dist = parse_payload(list(got), key, cap)
        if found_id != result["id"] or dist > TAG_TOLERANCE:
            raise JobError(3, "self-check failed: ID did not read back correctly")
        result["selfCheck"] = True
    if alpha is not None:
        wm = cv2.merge([wm[:, :, 0], wm[:, :, 1], wm[:, :, 2], alpha])
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    if not cv2.imwrite(out_path, wm):
        raise JobError(3, f"cannot write {out_path}")
    return result


def op_verify(job):
    method, cap = check_method(job)
    key = get_key(job.get("keyId"))
    img, _ = load_image(job.get("input", ""))
    h, w = img.shape[:2]
    _, dec = METHODS["pixelseal"]
    got = dec(img, key)
    result = {"ok": True, "op": "verify", "method": method, "width": int(w), "height": int(h)}
    if got is None:
        return {**result, "found": False, "id": None, "tagDistance": None}
    found_id, dist = parse_payload(list(got), key, cap)
    found = dist <= TAG_TOLERANCE
    return {**result, "found": found, "id": found_id if found else None, "tagDistance": dist}


def op_warmup(job):
    method, cap = check_method(job)
    key = os.environ.get("WM_KEY") or next((v for k, v in os.environ.items() if k.startswith("WM_KEY_")), "warmup")
    dummy = np.random.default_rng(0).integers(0, 255, (256, 256, 3), dtype=np.uint8)
    emb, dec = METHODS["pixelseal"]
    dec(emb(dummy, [0] * NBITS, key), key)
    return {"ok": True, "op": "warmup", "method": method}


OPS = {"embed": op_embed, "verify": op_verify, "warmup": op_warmup}


def run_job(job):
    try:
        if not isinstance(job, dict) or job.get("op") not in OPS:
            raise JobError(2, f"unknown or missing 'op' (use one of {', '.join(OPS)})")
        result = OPS[job["op"]](job)
    except JobError as e:
        result = {"ok": False, "code": e.code, "error": e.msg}
    except SystemExit as e:
        result = {"ok": False, "code": 3, "error": str(e)}
    except Exception as e:
        result = {"ok": False, "code": 3, "error": f"{type(e).__name__}: {e}"}
    if isinstance(job, dict) and "jobId" in job:
        result["jobId"] = job["jobId"]
    return result


def main():
    out = sys.stdout
    sys.stdout = sys.stderr
    args = sys.argv[1:]
    if args == ["--serve"]:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                job = json.loads(line)
            except ValueError:
                result = {"ok": False, "code": 2, "error": "invalid JSON"}
            else:
                result = run_job(job)
            out.write(json.dumps(result) + "\n")
            out.flush()
        return
    if len(args) != 1:
        sys.exit(__doc__)
    try:
        with open(args[0], encoding="utf-8") as fh:
            job = json.load(fh)
    except (OSError, ValueError) as e:
        out.write(json.dumps({"ok": False, "code": 2, "error": f"cannot read job file: {e}"}) + "\n")
        sys.exit(2)
    result = run_job(job)
    out.write(json.dumps(result) + "\n")
    out.flush()
    sys.exit(0 if result["ok"] else result["code"])


if __name__ == "__main__":
    main()