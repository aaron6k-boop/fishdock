# lights from the dusk photographs, and the north bank's day sheet. python3 -I night.py photosdir outdir
import sys
from PIL import Image, ImageFilter
import numpy as np
P, O = sys.argv[1], sys.argv[2]
def lights(band):
    r, g, b = band[..., 0], band[..., 1], band[..., 2]; mx = band.max(axis=2)
    w = np.maximum((mx - 200) / 55, np.where(r > 150, (r - b - 45) / 60, 0)).clip(0, 1)
    core = band * w[..., None]
    # (lit lamps are burnt out to white in the photograph: give them back the warm colour of their own halo)
    im = Image.fromarray(core.clip(0, 255).astype(np.uint8)).resize((band.shape[1] * 2, band.shape[0] * 2), Image.LANCZOS)
    glow = np.asarray(im.filter(ImageFilter.GaussianBlur(4))).astype(np.float32) * 1.6
    halo = np.asarray(im.filter(ImageFilter.GaussianBlur(11))).astype(np.float32) * 1.2
    out = np.maximum(np.asarray(im).astype(np.float32), glow) + halo
    return Image.fromarray((out - 5).clip(0, 255).astype(np.uint8))  # (true black where there is no lamp)
# ---- the town (6234922): rows 215..306, nothing below the foreground cut (row 84 of the band) ----
a = np.asarray(Image.open(P + "/south_pier_6234922.jpg").convert("RGB")).astype(np.float32)
band = a[215:306].copy(); band[84:] = 0
L = lights(band); L.save(O + "/gorleston_town_lights.webp", quality=82, method=6); L.save(O + "/town_lights_check.jpg", quality=90); print("town lights", L.size)
# ---- dusk to day: measured where 6234922 and the daylight 7618525 show the same riverside ----
dusk = np.asarray(Image.open(P + "/town065.png")).astype(np.float32); day = np.asarray(Image.open(P + "/town261.png")).astype(np.float32)
dm = dusk[:, 950:][dusk[:, 950:, 3] > 200][:, :3]; ym = day[:, :1048][day[:, :1048, 3] > 200][:, :3]
k = ym.std(axis=0) / dm.std(axis=0) * 0.9; m0, m1 = dm.mean(axis=0), ym.mean(axis=0); print("dusk", m0, dm.std(axis=0), "day", m1, ym.std(axis=0), "k", k)
# ---- the north bank (6235518): columns 0..1130, rows 300..414 ----
n = Image.open(P + "/yare_from_south_pier_6235518.jpg").convert("RGB"); na = np.asarray(n).astype(np.float32)
y0, y1, x1 = 300, 414, 1130
sm = np.asarray(n.filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32)
alpha = np.zeros((y1 - y0, x1), np.float32)
for x in range(x1):
    ref = sm[y0 - 12:y0, x].mean(axis=0); hit = 0; idx = y1 - y0
    for y in range(y0, y1):
        p = sm[y, x]; dd = np.abs(p - ref).sum()
        if dd > 20: hit += 1
        else: hit = 0; ref = ref * 0.8 + p * 0.2
        if hit >= 2: idx = y - y0 - 1; break
    alpha[idx:, x] = 1
# (the cranes and the jack-up rigs moored behind the sheds that day are not part of the place: cut at the roofs there)
# (and the lamp heads against the sky came out as pale blocks: nothing is kept above the roofs anywhere)
for xa, xb, row in ((0, 70, 362), (70, 140, 346), (140, 590, 352), (283, 310, 359), (348, 366, 359), (430, 476, 359), (590, 650, 366), (650, 990, 379), (990, 1130, 394)): alpha[:row - y0, xa:xb] = 0
nb = na[y0:y1, :x1]
A = Image.fromarray((alpha * 255).astype(np.uint8))
# colour under the cut edge bled outwards, so the soft edge has no sky-coloured fringe
er = np.asarray(A.filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255
rgb = nb.copy()
for _ in range(4):
    wsum = np.zeros_like(er); acc = np.zeros_like(rgb)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        acc += np.roll(rgb * er[..., None], (dy, dx), (0, 1)); wsum += np.roll(er, (dy, dx), (0, 1))
    fill = (er < 0.5) & (wsum > 0); rgb[fill] = acc[fill] / wsum[fill][:, None]; er = np.where(fill, 1, er)
dayrgb = ((rgb - m0) * k + m1).clip(0, 255)
rgba = Image.fromarray(dayrgb.astype(np.uint8)).convert("RGBA"); rgba.putalpha(A.filter(ImageFilter.GaussianBlur(0.5)))
big = rgba.resize((x1 * 2, (y1 - y0) * 2), Image.LANCZOS); big.save(O + "/gorleston_northbank.webp", quality=88, method=6)
chk = Image.new("RGBA", big.size, (120, 160, 210, 255)); chk.alpha_composite(big); chk.convert("RGB").save(O + "/northbank_check.jpg", quality=90)
NL = lights(nb * alpha[..., None] + nb * (1 - alpha[..., None]) * (np.arange(y1 - y0)[:, None, None] > 20) * (1 - ((np.arange(x1)[None, :, None] > 590) & (np.arange(x1)[None, :, None] < 965))))
NL.save(O + "/gorleston_northbank_lights.webp", quality=82, method=6); NL.save(O + "/north_lights_check.jpg", quality=90); print("north", big.size)
