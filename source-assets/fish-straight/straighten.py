# FishDock: a straight side picture of a fish FishDock draws curled (the conger and the eel), from its own picture.
# The 3D fish is lofted from a straight side picture (its top and bottom edges, fish3d.js fishShape), so a curled one
# gave a body as deep as the whole curl. Here the picture is sampled across the body along its spine, in two runs:
# the front (head to where it starts to curl) and the back (from the far side of the curl to the tail tip), both with
# the back (dorsal) side up; the curl itself, folded over on itself in the picture, is bridged by easing one into the
# other. Each sample line goes out from the spine only as far as the body runs unbroken, so the other half of the curl
# beside it is never picked up. Uniform scale (the picture's own proportions); 480 x 320, head left, as the others.
#   python3 straighten.py <in-s.webp> <out.webp> <spec.json key>
import json, math, sys
import numpy as np
from PIL import Image

SPECS = {
  # spines in the 480 x 320 picture: the front run from the snout, the back run from the far side of the curl to the
  # tail tip; bridge: how long the curl is along the spine (px), judged from the picture
  "conger": {"front": [(19, 152), (50, 158), (80, 155), (110, 151), (140, 147), (170, 143), (200, 139), (230, 135), (260, 128), (290, 120), (320, 116), (350, 115), (372, 117)],
             "back": [(366, 190), (350, 193), (320, 201), (290, 210), (262, 224), (243, 237)], "bridge": 95},
  "eel": {"front": [(19, 190), (50, 190), (80, 185), (110, 181), (140, 177), (170, 175), (200, 176), (230, 179), (260, 181), (290, 183), (320, 187), (350, 189), (375, 190)],
          "back": [(382, 123), (350, 119), (320, 119), (295, 121), (277, 123)], "bridge": 120},
}

def catmull(pts, step=0.5):
    P = [np.array(p, float) for p in pts]; P = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(np.array(pts[-1], float)); return np.array(out)

def resample(curve, ds=1.0):
    seg = np.linalg.norm(np.diff(curve, axis=0), axis=1); s = np.concatenate([[0], np.cumsum(seg)])
    q = np.arange(0, s[-1], ds); x = np.interp(q, s, curve[:, 0]); y = np.interp(q, s, curve[:, 1]); return np.stack([x, y], 1)

def bilinear(img, x, y):
    h, w = img.shape[:2]; x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a = img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy
    return a

def strip(img, spine, H=60):
    """Rows -H..H across the body at each point of the spine (dorsal up), cut at the first gap either side."""
    pts = resample(catmull(spine)); tang = np.gradient(pts, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    up = np.stack([tang[:, 1], -tang[:, 0]], 1)  # (going right, image up)
    if up[len(up) // 2, 1] > 0: up = -up  # (dorsal side kept to the top of the picture, whichever way this run goes)
    offs = np.arange(-H, H + 1)  # (negative: towards the back)
    X = pts[:, 0][None, :] - offs[:, None] * up[:, 0][None, :]; Y = pts[:, 1][None, :] - offs[:, None] * up[:, 1][None, :]
    S = bilinear(img, X, Y)  # rows x cols x 4
    a = S[..., 3]
    for c in range(S.shape[1]):  # each side: out from the spine while the body runs unbroken
        for rng in (range(H, -1, -1), range(H, 2 * H + 1)):
            cut = False
            for r in rng:
                if cut: a[r, c] = 0
                elif a[r, c] < 40 and abs(r - H) > 3: cut = True; a[r, c] = 0
    S[..., 3] = a
    return S

def blend_bridge(A, B, n):
    """The curl: n columns easing from A's last columns into B's first (shape and colour), with a gentle wobble of the
    texture so it doesn't read as one column stretched."""
    a_end, b_start = A[:, -12:].mean(1), B[:, :12].mean(1)
    out = np.zeros((A.shape[0], n, 4), float)
    for k in range(n):
        t = (k + 0.5) / n; e = t * t * (3 - 2 * t)
        src_a = A[:, -1 - (k % 24)] if (k // 24) % 2 == 0 else A[:, -24 + (k % 24)]
        src_b = B[:, (k % 24)]
        col = (1 - e) * (0.5 * a_end + 0.5 * src_a) + e * (0.5 * b_start + 0.5 * src_b)
        out[:, k] = col
    # (averaged, the edge went half see-through, a ghost of the outline: firmed up to the body's own edge)
    out[..., 3] = np.clip((out[..., 3] - 70) * 2.2, 0, 255)
    return out

def main(src, dst, key):
    sp = SPECS[key]
    img = np.array(Image.open(src).convert("RGBA").resize((480, 320), Image.LANCZOS)).astype(float)
    A, B = strip(img, sp["front"]), strip(img, sp["back"])
    full = np.concatenate([A, blend_bridge(A, B, sp["bridge"]), B], axis=1)
    # trim empty rows, scale to 445 px long (the others' length in their pictures), place snout at x 19, centred
    rows = np.where(full[..., 3].max(1) > 40)[0]; full = full[rows[0]:rows[-1] + 1]
    L = full.shape[1]; k = 445 / L
    im = Image.fromarray(np.clip(full, 0, 255).astype(np.uint8), "RGBA").resize((445, max(1, round(full.shape[0] * k))), Image.LANCZOS)
    out = Image.new("RGBA", (480, 320), (0, 0, 0, 0)); out.alpha_composite(im, (19, 160 - im.height // 2))
    out.save(dst, "WEBP", quality=92, method=6)
    print(key, "front", A.shape[1], "bridge", sp["bridge"], "back", B.shape[1], "px long in the picture; depth", full.shape[0], "->", im.height, "px; scale", round(k, 3))

if __name__ == "__main__": main(*sys.argv[1:4])
