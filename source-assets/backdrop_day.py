# The pier-end sheet (Geograph 6234922, habiloid, CC BY-SA 2.0) comes from a dusk photograph. Stage 10 lifted its colours
# towards the daylight photograph's (7618525), but it still read as evening against a sunlit pier: flat, dark under the
# eaves, with the lamps lit. Here the same contrast step is applied once more to that sheet, its shadows are lifted,
# the lit lamps and their glare are painted out from the wall around them (they are on their own sheet,
# gorleston_town_lights.webp, shown after dark), it is enlarged twice with a light sharpening so it is less soft when
# the phone magnifies it, and the sheet's cut end is broken up into a stipple so the picture thins out instead of
# stopping at a straight edge. The north bank's sheet gets the same sharpening and end. Nothing is added to a picture.
# python3 -I backdrop_day.py photosdir texturesdir outdir
import sys
from PIL import Image, ImageFilter
import numpy as np
P, T, O = sys.argv[1], sys.argv[2], sys.argv[3]
dusk = np.asarray(Image.open(P + "/town065.png")).astype(np.float32); day = np.asarray(Image.open(P + "/town261.png")).astype(np.float32)
dm = dusk[:, 950:][dusk[:, 950:, 3] > 200][:, :3]; ym = day[:, :1048][day[:, :1048, 3] > 200][:, :3]
k = ym.std(axis=0) / dm.std(axis=0) * 0.9; m0, m1 = dm.mean(axis=0), ym.mean(axis=0); print("k", k, "m0", m0, "m1", m1)

def fill(rgb, hole, rounds):
    # the hole filled inwards from its edge with the colours next to it
    ok = (~hole).astype(np.float32); rgb = rgb.copy()
    for _ in range(rounds):
        acc = np.zeros_like(rgb); ws = np.zeros_like(ok)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            acc += np.roll(rgb * ok[..., None], (dy, dx), (0, 1)); ws += np.roll(ok, (dy, dx), (0, 1))
        f = (ok < 0.5) & (ws > 0); rgb[f] = acc[f] / ws[f][:, None]; ok = np.where(f, 1, ok)
        if not (ok < 0.5).any(): break
    return rgb

def ends(alpha, left, right, n=70, seed=3):
    # the last n columns at an end thin out in a stipple (the material cuts at half alpha: a soft ramp would only move the edge)
    h, w = alpha.shape; rnd = np.random.default_rng(seed).random((h // 2 + 1, w // 2 + 1)).repeat(2, 0).repeat(2, 1)[:h, :w]
    ramp = np.ones(w, np.float32)
    if left: ramp[:n] = np.linspace(0, 1, n) ** 0.8
    if right: ramp[-n:] = np.linspace(1, 0, n) ** 0.8
    return np.where(rnd < ramp[None, :], alpha, 0)

def finish(rgb, alpha, name, left=False, right=False):
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)); w, h = im.size
    big = im.resize((w * 2, h * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
    A = Image.fromarray((alpha * 255).clip(0, 255).astype(np.uint8)).resize((w * 2, h * 2), Image.LANCZOS)
    a2 = ends(np.asarray(A).astype(np.float32) / 255, left, right)
    out = big.convert("RGBA"); out.putalpha(Image.fromarray((a2 * 255).astype(np.uint8)))
    out.save(O + "/" + name + ".webp", quality=86, method=6)
    chk = Image.new("RGBA", out.size, (150, 185, 225, 255)); chk.alpha_composite(Image.fromarray(np.dstack([np.asarray(big), (a2 > 0.5) * 255]).astype(np.uint8))); chk.convert("RGB").save(O + "/" + name + "_check.jpg", quality=90)
    print(name, out.size)

# ---- the pier end (dusk): to daylight, lamps painted out ----
src = np.asarray(Image.open(T + "/gorleston_pierhead.webp").convert("RGBA")).astype(np.float32)
rgb, alpha = src[..., :3], src[..., 3] / 255
r, b = rgb[..., 0], rgb[..., 2]; mx = rgb.max(axis=2); mn = rgb.min(axis=2)
# (a lit lamp is burnt out to white at its core, with a warm halo close round it; a painted sign that is merely yellow
# or orange has no white core and is left alone)
core = (mx > 222) & (mn > 165)
near = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(13))) > 0
glare = np.asarray(Image.fromarray(((core | (near & (r - b > 55) & (r > 140))) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
flat = fill(rgb, glare, 12)
sm = np.asarray(Image.fromarray(flat.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)
rgb = np.where(glare[..., None], sm, rgb)
dayrgb = (rgb - m0) * k + m1
# (a little of the picture's own contrast and colour given back: the dusk light had flattened both)
g = dayrgb.mean(axis=2, keepdims=True); dayrgb = g + (dayrgb - g) * 1.12
# (and the shadows lifted: daylight reaches under the eaves that dusk left black)
dayrgb = 255 * (dayrgb.clip(0, 255) / 255) ** 0.86
finish(dayrgb, alpha, "gorleston_pierhead", left=True)
# ---- the riverside and the north bank (already daylight): enlarged and sharpened the same way where they are small ----
for name, l, rgt in (("gorleston_northbank", False, True),):
    s2 = np.asarray(Image.open(T + "/" + name + ".webp").convert("RGBA")).astype(np.float32)
    im = Image.fromarray(s2[..., :3].astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    a2 = ends(s2[..., 3] / 255, l, rgt)
    out = im.convert("RGBA"); out.putalpha(Image.fromarray((a2 * 255).astype(np.uint8))); out.save(O + "/" + name + ".webp", quality=88, method=6); print(name, out.size)
