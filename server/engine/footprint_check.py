#!/usr/bin/env python3
"""footprint_check.py - is OUR watermark's difference still inside a suspect image?  Three files in, one answer out.

  python footprint_check.py --original I.png --master W1.png --suspect S.jpg [--embedder pixelseal|sim|none] [--nulls 12]

  I.png   the original picture (before our watermark)          W1.png  our watermarked picture
  S.jpg   the suspect (overwritten by someone, re-saved, maybe resized/cropped/rotated: it is aligned automatically if its size differs)

How it decides (see footprint_lib.py):  D = S - I,  R1 = W1 - I,  fit D ~ a * R1,  then compare a with what OTHER random messages of
the same model give (z). The null needs the embedder: --embedder pixelseal (your wmcli.py next to this file) or sim (toy model).
--embedder none falls back to random shifts of D: weaker, inflated when the model's patterns share structure.
--threshold: z needed to say "present". There is no universal value: take the highest z you see on control images (a suspect that
carries a foreign mark and nothing of ours) and put the threshold clearly above it.
"""
import argparse, os, sys
import numpy as np
import cv2

sys.path.insert(0, os.getcwd())
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import footprint_lib as fl


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--original", required=True)
    ap.add_argument("--master", required=True)
    ap.add_argument("--suspect", required=True)
    ap.add_argument("--embedder", default="sim", choices=["sim", "pixelseal", "none"])
    ap.add_argument("--nulls", type=int, default=12)
    ap.add_argument("--threshold", type=float, default=6.0)
    ap.add_argument("--seed", type=int, default=3)
    a = ap.parse_args()
    I, W1, S = (cv2.imread(p, cv2.IMREAD_COLOR) for p in (a.original, a.master, a.suspect))
    for name, im in (("original", I), ("master", W1), ("suspect", S)):
        if im is None:
            sys.exit(f"cannot read the {name} image")
    if I.shape != W1.shape:
        sys.exit("original and master must have the same size")
    aligned = False
    if S.shape != I.shape:
        try:
            S, aligned = fl.align_to(S, I), True
        except ValueError as e:
            sys.exit(f"cannot compare: the suspect has a different size and could not be aligned ({e})")
    win = fl.window(I.shape)
    if a.embedder == "none":
        z = fl.shift_null_z(I, W1, S, win=win)
        D, R1 = fl.difference(S, I, win), fl.difference(W1, I, win)
        info = {"a": fl.ls_coefficient(D, R1), "retention": float("nan")}
        note = "null = random shifts (weak)"
    else:
        if a.embedder == "pixelseal":
            import wmcli
            embed = lambda im, bits: wmcli.ps_embed(im, bits, "k")
        else:
            embed = fl.SimNeuralWatermark().embed
        rng = np.random.default_rng(a.seed)
        others = [embed(I.copy(), rng.integers(0, 2, 64).tolist()) for _ in range(a.nulls)]
        info = fl.footprint(I, W1, S, others, win)
        z = info["z"]
        note = f"null = {a.nulls} other random messages"
    print(f"suspect {'aligned to the original first' if aligned else 'same size as the original'}")
    print(f"retention a = {info['a']:.3f}   (1 = our change untouched, 0 = gone)")
    print(f"z = {z:.2f}   ({note})   threshold {a.threshold}")
    print(f"=> {fl.verdict(z, a.threshold)}")
    sys.exit(0 if z >= a.threshold else 1)


if __name__ == "__main__":
    main()
