# Three faults left in Gorleston's photograph sheets, put right (16 November 2026). Nothing is added to a picture.
# 1. The town sheet (gorleston_pierhead.webp, Geograph 6234922): behind the houses at its right-hand end a big bare tree
#    stood against the bright evening sky. The cut-out kept the sky seen through its twigs, and lifting the colours to
#    daylight made that a white cloud sitting on the roofs. Those pixels are the sky: they are made see-through, so the
#    game's own sky shows round the branches, and the odd twig left floating on its own goes with them.
# 2. On the same sheet, one lamp on the cliff path was still lit (backdrop_day.py painted out the others).
# 3. The north bank's sheet (gorleston_northbank.webp, Geograph 6235518, the same evening) still had its street lamps lit
#    by day. Only a white core with a warm glare round it counts as a lamp: the lit office windows, the lights inside the
#    open shed and the white van are left alone. The lamps after dark are on their own sheets, as before.
# A lamp is filled from the wall round it: each pixel of the hole the mean of its four neighbours, over and over, so the
# hole takes the colours at its edge with no seam.
#   python3 -I backdrop_tidy.py texturesdir outdir
import sys
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage as nd

T, O = sys.argv[1], sys.argv[2]


def grow(mask, size):
  return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(size))) > 0


def fill(rgb, hole):
  f = rgb.copy(); f[hole] = rgb[grow(hole, 3) & ~hole].mean(axis=0)
  for _ in range(400):
    avg = (np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1)) / 4
    f[hole] = avg[hole]
  sm = np.asarray(Image.fromarray(f.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)
  return np.where(hole[..., None], sm, rgb)


def load(name):
  im = np.asarray(Image.open(T + "/" + name + ".webp").convert("RGBA")).astype(np.float32)
  return im[..., :3].copy(), im[..., 3].copy()


def save(rgb, a, name):
  Image.fromarray(np.dstack([rgb, a]).clip(0, 255).astype(np.uint8), "RGBA").save(O + "/" + name + ".webp", quality=90, method=6, exact=True)


# ---- the town sheet ----
rgb, a = load("gorleston_pierhead")
H, W = a.shape; yy, xx = np.mgrid[0:H, 0:W]
lum = rgb.mean(axis=2); mx = rgb.max(axis=2); mn = rgb.min(axis=2); sat = (mx - mn) / np.maximum(mx, 1)
# the tree's crown: above the roofs between x 3100 and 3300 (a little lower where the roofs are lower)
box = (xx >= 3100) & (xx < 3300) & ((yy < 158) | ((yy < 172) & (xx >= 3110) & (xx < 3265)))
sky = box & (a > 0) & (lum > 168) & (sat < 0.2)
see = (a < 128) | sky
fringe = box & grow(see, 3) & ~see & (lum > 140) & (sat < 0.22)  # (half sky, next to a see-through pixel)
a[sky | fringe] = 0
op = (a > 127).astype(np.float32)
around = np.asarray(Image.fromarray((op * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(2))).astype(np.float32) / 255 * 25
lone = box & (op > 0) & (around < 6)
a[lone] = 0
print("town: sky through the tree", int(sky.sum()), "+ its fringe", int(fringe.sum()), "+ lone twigs", int(lone.sum()))
r, b = rgb[..., 0], rgb[..., 2]
lamp = grow((np.hypot(xx - 738, yy - 190) < 20) & ((((r - b) > 22) & (r > 80)) | (lum > 170)), 7)
rgb = fill(rgb, lamp)
print("town: the lamp", int(lamp.sum()), "pixels")
save(rgb, a, "gorleston_pierhead")

# ---- the north bank ----
rgb, a = load("gorleston_northbank")
r, b = rgb[..., 0], rgb[..., 2]; mx = rgb.max(axis=2); mn = rgb.min(axis=2)
core = (mx > 222) & (mn > 165) & (a > 127)
warm = (r - b > 55) & (r > 140)
lab, n = nd.label(core); lamp = np.zeros_like(core)
for i, sl in enumerate(nd.find_objects(lab), 1):
  y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
  if warm[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6].mean() >= 0.27: lamp |= lab == i
glare = grow(lamp | (grow(lamp, 15) & ((r - b > 25) & (r > 110) | (mx > 190))), 5)
rgb = fill(rgb, glare)
print("north bank:", int(nd.label(lamp)[1]), "lamps,", int(glare.sum()), "pixels")
save(rgb, a, "gorleston_northbank")
