# enrich_hand_maps.py: the hands' baked maps (bake_hand_maps.py: creases, nails, pads, veins, a faint multiplier round
# 0.85) given the life of skin, written back to public/textures/hand_colour.webp, hand_normal.webp, hand_rough.webp:
#   colour: the baked marks two and a half times as strong (they hardly showed: the hands read as one flat peach, a
#     mannequin's, in Aaron's phone screenshots of 19 November); skin's own uneven colour over them, redder and yellower
#     in soft blotches a centimetre or two across, finer mottling, the knuckles and fingertips pinker where the bake
#     marked them;
#   normal: the baked creases nearly twice as deep, and skin's fine relief under them: the net of tiny creases that
#     breaks a highlight up (the ridges of band-limited noise's zero crossings, under a millimetre apart at the hand's
#     size), finer still across them, kept faint;
#   roughness: a little rougher in the creases' net, smoother on the nails as baked.
# Run from the repository's root after bake_hand_maps.py:  python3 source-assets/hands/enrich_hand_maps.py <baked dir>
# (the baked originals are kept in source-assets/hands/baked/, so this can be run again).
import sys, os, numpy as np
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else "source-assets/hands/baked"; out = "public/textures"
rng = np.random.default_rng(1911)
def band(n, lo, hi):
  # noise with wavelengths between lo and hi pixels, tiling, unit variance
  f = np.fft.fft2(rng.standard_normal((n, n))); k = np.hypot(*np.meshgrid(np.fft.fftfreq(n), np.fft.fftfreq(n)))
  f[(k < 1 / hi) | (k > 1 / lo)] = 0; x = np.real(np.fft.ifft2(f)); return x / x.std()
C = np.asarray(Image.open(f"{src}/hand_colour.webp").convert("RGB")).astype(np.float64) / 255; n = C.shape[0]
N = np.asarray(Image.open(f"{src}/hand_normal.webp").convert("RGB")).astype(np.float64) / 255 * 2 - 1
R = np.asarray(Image.open(f"{src}/hand_rough.webp").convert("L")).astype(np.float64) / 255
NEUTRAL = 0.85
# ---- colour ----
c = NEUTRAL + (C - NEUTRAL) * 2.5
blot = band(n, 40, 160)[..., None] * np.array([0.008, -0.016, -0.022]) # (redder where up, sallower where down)
mott = band(n, 5, 14)[..., None] * np.array([0.01, -0.012, -0.014])
c = np.clip(c + blot + mott, 0, 1)
# ---- normal: the creases deeper, the fine net under them ----
h = -np.abs(band(n, 3.5, 8)) * 0.6 - np.abs(band(n, 2.2, 4)) * 0.25 # (creases where the noise crosses zero)
gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
# (the fine net faint: at 0.42 the forearm, where the map is stretched, read as orange peel)
nx = N[..., 0] * 1.8 - gx * 0.15; ny = N[..., 1] * 1.8 + gy * 0.15; nz = np.maximum(N[..., 2], 0.2)
l = np.sqrt(nx * nx + ny * ny + nz * nz); n2 = np.stack([nx / l, ny / l, nz / l], -1)
# ---- roughness ----
r = np.clip(R + (np.abs(band(n, 5, 11)) < 0.25) * 0.05 + band(n, 20, 60) * 0.02, 0, 1)
Image.fromarray(np.round(c * 255).astype(np.uint8)).save(f"{out}/hand_colour.webp", quality=86, method=6)
Image.fromarray(np.round((n2 * 0.5 + 0.5) * 255).astype(np.uint8)).save(f"{out}/hand_normal.webp", quality=80, method=6)
Image.fromarray(np.round(r * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f"{out}/hand_rough.webp", quality=80, method=6)
print("hand maps:", {f: os.path.getsize(f"{out}/{f}") // 1000 for f in ("hand_colour.webp", "hand_normal.webp", "hand_rough.webp")}, "kB")
