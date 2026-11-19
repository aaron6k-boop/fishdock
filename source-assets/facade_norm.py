# (kept with the bake: source-assets/blender/build_facades.py now does this itself when a kind has "norm"; this was used on the
# 19 November bake, made before that was in it)
# facnorm.py in.jpg out.jpg tint_r,g,b norm: a baked front's plain wall (its openings, frames, sills, door case, shop
# front and downpipe masked out, from build_facades.py's own layout) recoloured: tint x the scan's light and dark over
# its average, softened by norm. (The same as the bake with "norm" set, for a bake made before that was in it)
import sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; tint = np.array([float(v) for v in sys.argv[3].split(",")]); norm = float(sys.argv[4])
im = np.asarray(Image.open(src).convert("RGB"), dtype=np.float64) / 255; H, W = im.shape[:2]; ppm = W / 15.0
lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
mask = np.ones((H, W), bool)
def cut(x0, x1, y0, y1):  # metres: x along the strip, y up from the storey's floor
  mask[max(0, int(H - y1 * ppm)):min(H, int(np.ceil(H - y0 * ppm))), max(0, int(x0 * ppm)):min(W, int(np.ceil(x1 * ppm)))] = False
e = 0.012  # (a pixel or two round each piece)
for x0, w in ((0.0, 1.05), (12.0, 1.7)):
  xc = x0 + 1.5; xa, xb = xc - w / 2, xc + w / 2
  cut(xa - 0.12 - e, xb + 0.12 + e, 0.79 - e, 0.90 + e)   # the sill
  cut(xa - e, xb + e, 0.90 - e, 2.45 + e)                  # the opening, its frame and sashes
  cut(xa - 0.14 - e, xb + 0.14 + e, 2.45 - e, 2.65 + e)    # the lintel (or the brick arch, xa - 0.1 to xb + 0.1, 0.22 tall)
xa, xb = 4.5 - 0.475, 4.5 + 0.475
cut(xa - 0.16 - e, xb + 0.16 + e, 0.0, 2.46 + e)            # the pilasters and the opening
cut(xa - 0.24 - e, xb + 0.24 + e, 2.46 - e, 2.60 + e)       # the cornice
cut(xa - 0.15 - e, xb + 0.15 + e, 0.0, 0.08 + e)            # the step
cut(6.25 - e, 8.75 + e, 0.0, 2.45 + e)                      # the riser and the shop window
cut(6.05 - e, 8.95 + e, 2.45 - e, 2.95 + e); cut(6.0 - e, 9.0 + e, 2.92 - e, 3.0)  # the fascia and its cornice
cut(11.82 - e, 11.90 + e, 0.0, 3.0)                          # the downpipe
lum = lin @ np.array([0.2126, 0.7152, 0.0722]); mean = lum[mask].mean()
new = tint[None, None, :] * (1 - norm + norm * (lum / mean))[..., None]
out = lin.copy(); out[mask] = new[mask]
srgb = np.where(out <= 0.0031308, out * 12.92, 1.055 * np.clip(out, 0, None) ** (1 / 2.4) - 0.055)
Image.fromarray((np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst, quality=95)
print("wall share", round(mask.mean(), 3), "mean lum", round(mean, 3))
