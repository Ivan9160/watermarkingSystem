"""footprint_lib.py - find OUR watermark's difference again after someone overwrote it.

Pure numpy + OpenCV. No app, no database, no model needed for the maths. Anything that embeds a watermark can be plugged in
as `embed(img, bits) -> img` and `decode(img) -> bits` (your PixelSeal, a classical method, or the toy model at the bottom).

NOTATION (images are compared as brightness = luma, float, over one window of N pixels)
    I      the ORIGINAL picture
    W1     OUR watermarked picture                     W1 = I + R1          R1 = W1 - I   "difference1", our footprint
    S      the SUSPECT (someone overwrote ours, maybe several times, maybe re-saved)
    D      what changed in the suspect                 D = S - I = R1 + (their changes) + noise
    T      THEIR change, when W1 is known              T = S - W1                          (so D - T = R1 exactly: no news)

Subtracting differences gives THEIR change T, never ours. What we can do is (1) test whether R1 is still inside D, and
(2) replay the attacker. Both are functions below.

1. RETENTION (least squares):      D ~ a * R1 + E          a = sum((D-mean D)(R1-mean R1)) / sum((R1-mean R1)^2)
     a = 1 untouched, 0 erased, < 0 cancelled.
   Models of the same family share structure, so we compare with the footprints of OTHER random messages embedded on the
   same original (R_other_j = f(I, m_j) - I):
     a*  = a(D, R1) - mean_j a(D, R_other_j)           z = a* / std_j a(D, R_other_j)
   z says how far our exact message-specific pattern stands above what any message of that model would show.
   With roughly white E:  z ~ a * (rms R1 / rms E) * sqrt(N)    so a million pixels make weak traces detectable.

2. REPLAY ("subtract their change"): the decoder reads the attacker's last message m_hat. Re-embed it on both candidates
     e(B) = mean | S - f(B, m_hat) |   for B = W1 and B = I        ratio = e(W1) / e(I)
   Built on our file -> e(W1) ~ 0 -> ratio ~ 0.  Built on the original -> ratio large.
   It also gives our footprint back:   R1_hat = D - (f(W1, m_hat) - W1)     error = (their earlier steps) + noise.
   With several overwrites only the last step is replayed, so the estimate is approximate. (A search for the unknown middle
   messages was tried and does NOT work: after the first overwrite the decoder reads the last message with a few bits wrong, which
   leaves an error floor larger than our footprint. For several overwrites use the retention test.)
"""
import numpy as np
import cv2

# ------------------------------------------------------------------ basic operations
def luma(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)


def window(shape, side=1024):
    h, w = shape[:2]
    return max(0, (h - side) // 2), max(0, (w - side) // 2), min(side, h), min(side, w)


def crop(a, win):
    y0, x0, hh, ww = win
    return a[y0:y0 + hh, x0:x0 + ww]


def ls_coefficient(D, R):
    """least-squares weight a in D ~ a*R (both mean-removed)"""
    R0, D0 = R - R.mean(), D - D.mean()
    return float((D0 * R0).sum() / ((R0 * R0).sum() + 1e-12))


def ncc(D, R):
    R0, D0 = R - R.mean(), D - D.mean()
    return float((D0 * R0).sum() / (np.sqrt((D0 ** 2).sum() * (R0 ** 2).sum()) + 1e-12))


def difference(a, b, win=None):
    """signed brightness difference a - b over the window"""
    d = luma(a) - luma(b)
    return crop(d, win) if win else d


# ------------------------------------------------------------------ test 1: retention and message-specific z
def footprint(original, master, suspect, others, win=None):
    """others = list of images f(I, m_other_j) (other random messages on the same original).
    Returns dict: a (retention of our exact pattern), a_null_mean, a_null_std, retention (= a*), z, ncc."""
    win = win or window(original.shape)
    R1 = difference(master, original, win)
    D = difference(suspect, original, win)
    a = ls_coefficient(D, R1)
    nulls = np.array([ls_coefficient(D, difference(o, original, win)) for o in others])
    return {"a": a, "a_null_mean": float(nulls.mean()), "a_null_std": float(nulls.std()),
            "retention": a - float(nulls.mean()), "z": (a - float(nulls.mean())) / (float(nulls.std()) + 1e-6),
            "ncc": ncc(D, R1)}


def shift_null_z(original, master, suspect, n_null=40, win=None, seed=1):
    """Weaker fallback when you cannot embed other messages: compare with random shifts of D. Inflated when all patterns
    of the model share structure (use `footprint` with `others` whenever you can)."""
    win = win or window(original.shape)
    R1 = difference(master, original, win)
    D = difference(suspect, original, win)
    rng = np.random.default_rng(seed)
    h, w = D.shape
    null = np.array([ncc(np.roll(D, (int(rng.integers(16, h - 16)), int(rng.integers(16, w - 16))), (0, 1)), R1) for _ in range(n_null)])
    return (ncc(D, R1) - float(null.mean())) / (float(null.std()) + 1e-9)


# ------------------------------------------------------------------ test 2: replay the attacker
def replay(original, master, suspect, embed, m_hat, win=None):
    """Return dict: e_master, e_original, ratio, r1_hat (our footprint estimate), ncc_r1 (vs the true R1)."""
    win = win or window(original.shape)
    Sl = crop(luma(suspect), win)
    rep_w = crop(luma(embed(master.copy(), m_hat)), win)      # f(W1, m_hat)
    rep_i = crop(luma(embed(original.copy(), m_hat)), win)    # f(I,  m_hat)
    e_w, e_i = float(np.abs(Sl - rep_w).mean()), float(np.abs(Sl - rep_i).mean())
    W1l, Il = crop(luma(master), win), crop(luma(original), win)
    r1_hat = (Sl - Il) - (rep_w - W1l)                         # D - their (replayed) change
    return {"e_master": e_w, "e_original": e_i, "ratio": min(e_w / (e_i + 1e-9), 99.0),
            "r1_hat": r1_hat, "ncc_r1": ncc(r1_hat, W1l - Il)}


# ------------------------------------------------------------------ alignment (when the suspect was resized, cropped, rotated)
def align_to(suspect, reference, max_side=1600, min_inliers=20):
    """Warp `suspect` into the frame of `reference` with ORB features + a RANSAC homography. Returns the warped image."""
    def small(im):
        g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
        s = min(1.0, max_side / max(g.shape))
        return (cv2.resize(g, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else g), s
    gs, ss = small(suspect)
    gr, sr = small(reference)
    orb = cv2.ORB_create(nfeatures=3000)
    ks, ds = orb.detectAndCompute(gs, None)
    kr, dr = orb.detectAndCompute(gr, None)
    if ds is None or dr is None or len(ks) < 20 or len(kr) < 20:
        raise ValueError("too few image features to align")
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(ds, dr, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < min_inliers:
        raise ValueError("not enough matching features to align")
    src = np.float32([ks[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kr[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if H is None or int(mask.sum()) < min_inliers:
        raise ValueError("no consistent geometry between the images")
    Hf = np.linalg.inv(np.diag([sr, sr, 1.0])) @ H @ np.diag([ss, ss, 1.0])
    return cv2.warpPerspective(suspect, Hf, (reference.shape[1], reference.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def verdict(z, threshold=8.0):
    return "OUR FOOTPRINT PRESENT" if z >= threshold else "not shown"


# ------------------------------------------------------------------ a TOY neural-style model, to run the maths without PyTorch
class SimNeuralWatermark:
    """NOT PixelSeal. A stand-in with the properties that matter for this maths:
       - public and deterministic (no key), so anyone can use it again on a watermarked image
       - image-adaptive: strength follows local texture (flat areas get little)
       - it writes ONE message and partly removes the pattern it finds already in the image:
             f(x, m) = x + alpha * mask(x) * P(m)  -  lam * (periodic pattern already in x)
         lam = 0 is pure addition, lam = 1 is a full overwrite. Decoding folds the picture onto a 64x64 tile and correlates
         with one carrier per bit, so the newest message wins and an older one fades but does not vanish.
    Treat results on it as a demonstration of the maths, not as evidence about any real model."""
    TILE = 64

    def __init__(self, nbits=64, lam=0.45, target_rms=1.2, seed=1234):
        self.nbits, self.lam, self.target_rms = nbits, lam, target_rms
        self.C = np.random.default_rng(seed).choice([-1.0, 1.0], size=(nbits, self.TILE, self.TILE)).astype(np.float32)

    def _fold(self, g):
        hp = g - cv2.GaussianBlur(g, (0, 0), 2.0)
        T = self.TILE
        h, w = hp.shape
        return hp[:h // T * T, :w // T * T].reshape(h // T, T, w // T, T).mean(axis=(0, 2))

    def _tile(self, tile, shape):
        T = self.TILE
        return np.tile(tile, (-(-shape[0] // T), -(-shape[1] // T)))[:shape[0], :shape[1]]

    def _mask(self, g):
        mean = cv2.blur(g, (9, 9))
        sd = np.sqrt(np.maximum(cv2.blur(g * g, (9, 9)) - mean * mean, 0))
        return cv2.GaussianBlur(np.clip(sd / 12.0, 0.15, 1.0), (0, 0), 4)

    def decode(self, img):
        corr = np.tensordot(self.C, self._fold(luma(img)), axes=([1, 2], [0, 1]))
        return (corr > 0).astype(int).tolist()

    def embed(self, img, bits):
        g = luma(img)
        s = np.where(np.array(bits[: self.nbits]) == 1, 1.0, -1.0).astype(np.float32)
        P = self._tile(np.tensordot(s, self.C, axes=1) / np.sqrt(self.nbits), g.shape)
        add = self._mask(g) * P
        add *= self.target_rms / (float(np.sqrt((add ** 2).mean())) + 1e-9)
        old = self._tile(self._fold(g), g.shape)                      # the periodic pattern already in the image
        res = add - self.lam * old
        return np.clip(np.round(img.astype(np.float32) + res[:, :, None]), 0, 255).astype(np.uint8)
