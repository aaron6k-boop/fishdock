# ---- make_granite: a seamless granite texture for the rock armour (colour, normal, roughness), made from noise ----
# Run: python3 source-assets/make_granite.py  (numpy and Pillow). Writes public/textures/rock_granite_{diff,nor,rough}.jpg
# Made here, from nothing but random numbers (seeded): no outside image, so no licence to carry (ASSET-LICENCES.json).
import numpy as np
from PIL import Image
N = 512
rng = np.random.default_rng(20261108)
fx = np.fft.fftfreq(N)[:, None]; fy = np.fft.fftfreq(N)[None, :]; f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
def field(slope, lo=0.0, hi=1.0):
  # periodic noise with a 1/f^slope spectrum between two bands (tiles seamlessly: it's made in frequency space)
  s = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) / f ** slope
  s[(f < lo) | (f > hi)] = 0; s[0, 0] = 0
  a = np.real(np.fft.ifft2(s)); return (a - a.mean()) / a.std()
big, mid, fine = field(2.2, 0, 0.05), field(1.6, 0.01, 0.2), field(0.6, 0.1, 0.5)
# cracks and joints: where a ridged noise is sharp
r1 = 1 - np.abs(field(2.0, 0, 0.06)); cracks = np.clip((r1 - 0.93) / 0.07, 0, 1) ** 2
r2 = 1 - np.abs(field(1.8, 0.01, 0.12)); cracks = np.maximum(cracks, np.clip((r2 - 0.95) / 0.05, 0, 1) ** 2 * 0.6)
height = big * 0.5 + mid * 0.35 + fine * 0.12 - cracks * 2.2
# grain: the crystals of the granite, dark mica, pale feldspar, a few warm grains
g = rng.random((N, N)); g2 = rng.random((N, N))
base = np.stack([0.43, 0.42, 0.405]) [None, None, :] * (1 + big[..., None] * 0.07 + mid[..., None] * 0.06)
col = base.copy()
mica = (g < 0.10) | (field(0.2, 0.25, 0.5) > 1.7)
felds = (g > 0.86)
warm = (g2 > 0.975)
col[mica] *= 0.42; col[felds] = col[felds] * 0.6 + np.array([0.66, 0.65, 0.62]) * 0.4
col[warm] = col[warm] * 0.5 + np.array([0.58, 0.46, 0.40]) * 0.5
# soften the grain a touch (a 3x3 box, periodic), so it reads as stone at a distance not salt and pepper
col = sum(np.roll(np.roll(col, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1)) / 9 * 0.5 + col * 0.5
# dirt in the hollows and cracks, paler weathered highs, patches of grey-yellow lichen
cav = np.clip(-height * 0.25, 0, 1)
col *= (1 - cav[..., None] * 0.45) * (1 - cracks[..., None] * 0.55)
col *= 1 + np.clip(height * 0.06, 0, 0.12)[..., None]
lich = np.clip((field(1.7, 0, 0.08) - 1.2) * 1.5, 0, 1) * np.clip(field(0.5, 0.15, 0.5) * 0.5 + 0.7, 0, 1)
col = col * (1 - lich[..., None] * 0.55) + np.array([0.62, 0.6, 0.45]) * lich[..., None] * 0.55
Image.fromarray((np.clip(col, 0, 1) ** (1 / 1.0) * 255).astype(np.uint8)).save("public/textures/rock_granite_diff.jpg", quality=88)
# normal map (OpenGL convention), from the height's slopes (periodic differences)
s = 3.2
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * s; dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * s
n = np.stack([-dx, dy, np.ones_like(dx)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save("public/textures/rock_granite_nor.jpg", quality=90)
rough = np.clip(0.82 + fine * 0.05 + cav * 0.1 - lich * 0.05, 0, 1)
Image.fromarray((rough * 255).astype(np.uint8)).resize((256, 256)).save("public/textures/rock_granite_rough.jpg", quality=90)
print("granite: done")
