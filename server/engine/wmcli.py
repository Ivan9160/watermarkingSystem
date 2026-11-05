"""wmcli - console tool for Meta PixelSeal invisible image watermarking.

Commands
  embed    IN OUT  --key K [--id HEX10]      hide a 40-bit ID in an image using PixelSeal
  verify   IN      --key K --id HEX10        does this image carry this ID?
  visibility IN    --key K                   embed into images, save watermarked files, difference maps, and index.html
"""
import argparse, hashlib, os, sys, secrets
import numpy as np
import cv2

NBITS = 64
CAPACITY = {"pixelseal": 64}

def fit_id(hexid):
    return hexid.lower()

def hex_to_bits(h):
    v = int(h, 16)
    return [(v >> (NBITS - 1 - i)) & 1 for i in range(NBITS)]

def bits_to_hex(bits):
    return f"{int(''.join(str(int(b)) for b in bits), 2):0{NBITS // 4}x}"

def read_img(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f"cannot read image: {path}")
    return img

def write_img(path, img):
    if path.lower().endswith((".jpg", ".jpeg")):
        print("warning: JPEG output is lossy; use PNG to store the watermarked master", file=sys.stderr)
        cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    else:
        cv2.imwrite(path, img)

_PS = {}
def _ps():
    if not _PS:
        extra = os.environ.get("VIDEOSEAL_PATH")
        if extra and extra not in sys.path:
            sys.path.insert(0, extra)
        try:
            import torch
            import videoseal
        except ImportError as e:
            sys.exit(f"PixelSeal needs PyTorch and Meta's videoseal package ({e}). See README section 1d.")
        model = videoseal.load("pixelseal") 
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        try:
            model.eval()
        except Exception:
            pass
        model = model.to(dev)
        _PS.update(model=model, torch=torch, dev=dev, nbits=int(model.embedder.msg_processor.nbits))
    return _PS

def _ps_tensor(bgr):
    p = _ps()
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return p["torch"].from_numpy(rgb).permute(2, 0, 1).float().div(255).unsqueeze(0).to(p["dev"])

def ps_embed(bgr, bits, key):
    p = _ps(); torch = p["torch"]; n = p["nbits"]
    msg_bits = (list(bits) * (n // len(bits) + 1))[:n]
    msg = torch.tensor([msg_bits], dtype=torch.float32, device=p["dev"])
    with torch.no_grad():
        out = p["model"].embed(_ps_tensor(bgr), msgs=msg, is_video=False, lowres_attenuation=True)
    y = out["imgs_w"].clamp(0, 1)[0]
    arr = y.mul(255).round().byte().permute(1, 2, 0).cpu().numpy()
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

def vote_bits(raw, nbits=NBITS):
    return [int(sum(raw[i::nbits]) * 2 > len(raw[i::nbits])) for i in range(nbits)]

def ps_decode(bgr, key):
    p = _ps()
    with p["torch"].no_grad():
        det = p["model"].detect(_ps_tensor(bgr), is_video=False)
    raw = (det["preds"][0, 1:] > 0).int().cpu().flatten().tolist()
    return vote_bits(raw)

METHODS = {
    "pixelseal": (ps_embed, ps_decode),
}


def cmd_embed(a):
    img = read_img(a.input)
    hexid = a.id or secrets.token_hex(5) 
    bits = hex_to_bits(f"{int(hexid, 16):064x}")
    out = ps_embed(img, bits, a.key)
    write_img(a.output, out)
    mse = np.mean((img.astype(np.float64) - out.astype(np.float64)) ** 2)
    print(f"id={hexid} method=pixelseal size={img.shape[1]}x{img.shape[0]} "
          f"PSNR={10 * np.log10(255 ** 2 / max(mse, 1e-9)):.1f} dB -> {a.output}")

def cmd_verify(a):
    img = read_img(a.input)
    got = ps_decode(img, a.key)
    got_hex = f"{int(''.join(str(int(b)) for b in got[:40]), 2):010x}"
    ok = got_hex.lower() == a.id.lower()
    print(f"decoded_id={got_hex} target_id={a.id.lower()} -> {'VERIFIED' if ok else 'NOT VERIFIED'}")
    sys.exit(0 if ok else 1)

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

def _collect(path):
    if os.path.isdir(path):
        found = []
        for root, _, names in os.walk(path):
            found += [os.path.join(root, n) for n in names if os.path.splitext(n)[1].lower() in IMG_EXT]
        return sorted(found)
    return [path]

def _label(img, text):
    out = img.copy()
    cv2.rectangle(out, (0, 0), (out.shape[1], 24), (0, 0, 0), -1)
    cv2.putText(out, text, (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return out

def _pick_tiles(img, t):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = g.shape
    best_flat, best_tex = None, None
    for y in range(0, h - t + 1, t):
        for x in range(0, w - t + 1, t):
            v = float(g[y:y + t, x:x + t].var())
            if best_flat is None or v < best_flat[0]:
                best_flat = (v, y, x)
            if best_tex is None or v > best_tex[0]:
                best_tex = (v, y, x)
    return best_flat[1:], best_tex[1:]

def _panel(orig, wm, title, zoom=2):
    h, w = orig.shape[:2]
    t = min(256, h, w)
    diff = np.clip(np.abs(orig.astype(int) - wm.astype(int)) * 30, 0, 255).astype(np.uint8)
    rows = []
    for name, (y, x) in zip(("flat area", "textured area"), _pick_tiles(orig, t)):
        tiles = []
        for lab, im in (("original", orig), ("watermarked", wm), ("difference x30", diff)):
            tile = cv2.resize(im[y:y + t, x:x + t], None, fx=zoom, fy=zoom, interpolation=cv2.INTER_NEAREST)
            tiles.append(_label(tile, f"{lab} - {name}"))
        rows.append(np.hstack(tiles))
    return _label(np.vstack(rows), title)

def cmd_visibility(a):
    import csv, time, datetime
    files = _collect(a.input)
    if a.limit:
        files = files[:a.limit]
    if not files:
        sys.exit(f"no images found in {a.input}")
    
    out = a.out or os.path.join("reports", "visibility_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
    os.makedirs(out, exist_ok=True)
    rows, errors = [], []
    
    os.makedirs(os.path.join(out, "panels", "pixelseal"), exist_ok=True)
    if not a.no_images:
        os.makedirs(os.path.join(out, "watermarked", "pixelseal"), exist_ok=True)
        
    for i, p in enumerate(files, 1):
        img = cv2.imread(p, cv2.IMREAD_COLOR)
        if img is None:
            errors.append(f"pixelseal | {p} | cannot read image"); continue
        stem = os.path.splitext(os.path.basename(p))[0]
        try:
            t0 = time.time()
            bits = hex_to_bits(f"{int(a.id or secrets.token_hex(5), 16):064x}")
            wm = ps_embed(img.copy(), bits, a.key)
            t_emb = time.time() - t0
        except Exception as e:
            errors.append(f"pixelseal | {p} | embed failed: {e}"); continue
            
        d = np.abs(img.astype(np.int32) - wm.astype(np.int32))
        mse = float(np.mean(d.astype(np.float64) ** 2))
        psnr = 10 * np.log10(255 ** 2 / max(mse, 1e-9))
        panel_path = os.path.join(out, "panels", "pixelseal", f"{stem}.png")
        cv2.imwrite(panel_path, _panel(img, wm, f"pixelseal | {os.path.basename(p)} | PSNR {psnr:.1f} dB"))
        if not a.no_images:
            cv2.imwrite(os.path.join(out, "watermarked", "pixelseal", f"{stem}.png"), wm)
        rows.append({"method": "pixelseal", "image": p, "psnr": round(psnr, 2), "embed_seconds": round(t_emb, 3)})
        print(f"[pixelseal] {i}/{len(files)} {os.path.basename(p)}  PSNR {psnr:.1f} dB", flush=True)
        
    print(f"\nVisibility panels saved to {out}")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    
    p = sub.add_parser("embed"); p.add_argument("input"); p.add_argument("output"); p.add_argument("--id")
    p.add_argument("--key", default="change-me"); p.set_defaults(fn=cmd_embed)
    
    p = sub.add_parser("verify"); p.add_argument("input"); p.add_argument("--id", required=True)
    p.add_argument("--key", default="change-me"); p.set_defaults(fn=cmd_verify)
    
    p = sub.add_parser("visibility", help="embed into every image; save watermarked files, panels, PSNR table")
    p.add_argument("input"); p.add_argument("--key", default="change-me"); p.add_argument("--id")
    p.add_argument("--out"); p.add_argument("--limit", type=int)
    p.add_argument("--no-images", action="store_true")
    p.set_defaults(fn=cmd_visibility)
    
    a = ap.parse_args()
    a.fn(a)

if __name__ == "__main__":
    main()