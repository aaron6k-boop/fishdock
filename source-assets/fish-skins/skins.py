# FishDock (17 Nov): the sea fish's skins from photographs (Wikimedia Commons, each one's licence in
# source-assets/ASSET-LICENCES.json), laid into the frame of FishDock's own cut-out picture of the species, which the
# 3D models' uvs follow (fish3d.js fishShape, build_fish3.py). For each species:
#  - the photo is turned head-left and level (its silhouette's long axis), and the fish cut from its background;
#  - both the photo and the cut-out are read as fishShape reads them: the snout, the peduncle and the tail's end along
#    the length, and the body's top and bottom edges without the fins at every column;
#  - every pixel of the new skin (four times the cut-out's 480 by 320) is found in the photo by where it lies along
#    the body (its length from the snout, between marks such as the eye and the gill cover's edge, matched in both)
#    and across it (between the body's edges, or beyond them for a fin), so the photo's fish is stretched to the
#    model's shape and its eye lands on the modelled eye;
#  - the outline is the cut-out's (the model is cut by it); where the photo has no fish (a fin folded down in the
#    photo, spread on the model) the gap is filled from what surrounds it;
#  - the photo's own lighting is evened out (its broad shading divided out, its detail kept), since the game lights the fish;
#  - a normal map: the photo's fine detail as relief, and scales drawn over the body where the species has them,
#    each row following the body, smaller towards the head and tail, none on the fins, the snout or the eye.
# Writes public/fish/skin/<species>.webp (1920 x 1280, colour and the outline in alpha), <species>-m.webp (960 x 640)
# and <species>_n.webp / <species>_n-m.webp (normal maps).
import json, math, os, sys
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(HERE + "/../..")
FREE = (6, 6)  # (where in the cut-out's frame the pectoral fin is painted: its top left corner, empty in every cut-out)
K = 4  # (the skin's pixels per cut-out pixel)

def shape(alpha, thr=110):
  """fish3d.js fishShape, in numpy: x0, xp, x1 and the body's top and bottom (without fins) at each column."""
  h, w = alpha.shape; on = alpha > thr
  any_ = on.any(0); top = np.where(any_, on.argmax(0), -1); bot = np.where(any_, h - 1 - on[::-1].argmax(0), -1)
  xs = np.where(any_ & (bot - top >= 2))[0]; x0, x1 = int(xs[0]), int(xs[-1]); L = x1 - x0
  for x in range(x0 + 1, x1):
    if top[x] < 0: top[x], bot[x] = top[x - 1], bot[x - 1]
  a, b = int(round(x0 + L * 0.65)), int(round(x0 + L * 0.93)); d = (bot - top)[a:b + 1]; xp = a + int(np.argmin(d))
  r = max(2, round(L * 0.07))
  def filt(src, fn, a, b):
    o = src.astype(np.float32).copy()
    for x in range(a, b + 1): o[x] = fn(src[max(a, x - r):min(b, x + r) + 1])
    return o
  btop = filt(filt(top, np.max, x0, xp), np.min, x0, xp); bbot = filt(filt(bot, np.min, x0, xp), np.max, x0, xp)
  for x in range(x0, xp + 1): btop[x] = min(max(btop[x], top[x]), bot[x]); bbot[x] = min(max(bbot[x], btop[x]), bot[x])
  def sm(v):
    o = v.copy(); o[x0 + 1:xp] = (v[x0:xp - 1] + 2 * v[x0 + 1:xp] + v[x0 + 2:xp + 1]) / 4; return o
  T, B = sm(btop), sm(bbot)
  # (for laying a photo over it, the body's middle line and depth smoothed along the length, over 3.5% of it: a fin's
  # root, folded or standing, puts a step in the edges that a stripe along the body would follow)
  g = max(1.0, 0.035 * L); xs_ = np.arange(x0, xp + 1); mid = (T + B) / 2; half = (B - T) / 2
  def gs(v):
    o = v.copy(); seg = np.pad(v[x0:xp + 1], (int(3 * g), int(3 * g)), mode="edge"); k = np.exp(-0.5 * (np.arange(-int(3 * g), int(3 * g) + 1) / g) ** 2); k /= k.sum()
    o[x0:xp + 1] = np.convolve(seg, k, mode="valid")[: xp - x0 + 1]; return o
  ms, hs = gs(mid), gs(half)
  # (the head's end kept as it is: the smoothing would round the snout off)
  n = max(2, int(0.06 * L)); w8 = np.clip((np.arange(x0, xp + 1) - x0) / n, 0, 1)
  ms[x0:xp + 1] = mid[x0:xp + 1] * (1 - w8) + ms[x0:xp + 1] * w8; hs[x0:xp + 1] = half[x0:xp + 1] * (1 - w8) + hs[x0:xp + 1] * w8
  return dict(x0=x0, x1=x1, xp=xp, L=L, T=T, B=B, Ts=ms - hs, Bs=ms + hs, top=top.astype(np.float32), bot=bot.astype(np.float32), w=w, h=h)

def level(img, mask):
  """Turn so the silhouette's long axis is level; returns (img, mask)."""
  ys, xs = np.nonzero(mask > 127); c = np.cov(np.vstack([xs, ys])); ev, evec = np.linalg.eigh(c); v = evec[:, np.argmax(ev)]
  ang = math.degrees(math.atan2(v[1], v[0]))
  if ang > 90: ang -= 180
  if ang < -90: ang += 180
  h, w = mask.shape; M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
  return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT), cv2.warpAffine(mask, M, (w, h), flags=cv2.INTER_LINEAR), ang

def segment(img, how):
  """The fish's silhouette (0-255) in a photo: against a plain background ('black', 'white', 'grey': its colour from the
  corners) or by GrabCut inside a box ('cut': [x0, y0, x1, y1] in the photo's pixels)."""
  h, w = img.shape[:2]
  if how["bg"] == "cut" and how.get("poly"):
    # (GrabCut from a rough outline: inside it probably fish, a band round it either, beyond it background)
    pm = np.zeros((h, w), np.uint8); cv2.fillPoly(pm, [np.array(how["poly"], np.int32)], 1)
    band = max(6, min(h, w) // 60); outer = cv2.dilate(pm, np.ones((band * 2 + 1, band * 2 + 1), np.uint8)); inner = cv2.erode(pm, np.ones((band * 4 + 1, band * 4 + 1), np.uint8))
    m = np.full((h, w), cv2.GC_BGD, np.uint8); m[outer > 0] = cv2.GC_PR_BGD; m[pm > 0] = cv2.GC_PR_FGD; m[inner > 0] = cv2.GC_FGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, m, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    mask = np.where((m == 1) | (m == 3), 255, 0).astype(np.uint8)
  elif how["bg"] == "cut":
    x0, y0, x1, y1 = how["box"]; m = np.zeros((h, w), np.uint8); bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, m, (x0, y0, x1 - x0, y1 - y0), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    mask = np.where((m == 1) | (m == 3), 255, 0).astype(np.uint8)
  else:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32); s = max(8, min(h, w) // 25)
    corners = np.concatenate([lab[:s, :s].reshape(-1, 3), lab[:s, -s:].reshape(-1, 3), lab[-s:, :s].reshape(-1, 3), lab[-s:, -s:].reshape(-1, 3)])
    bgc = np.median(corners, 0); d = np.linalg.norm(lab - bgc, axis=2)
    mask = (d > how.get("thr", 18)).astype(np.uint8) * 255
    if "box" in how: x0, y0, x1, y1 = how["box"]; keep = np.zeros_like(mask); keep[y0:y1, x0:x1] = 1; mask *= keep
  k = max(3, (min(h, w) // 300) | 1)
  mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((k, k), np.uint8)); mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((k * 3, k * 3), np.uint8))
  n, lab2, st, _ = cv2.connectedComponentsWithStats((mask > 127).astype(np.uint8)); big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
  mask = np.where(lab2 == big, 255, 0).astype(np.uint8)
  ff = mask.copy(); cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255); mask = mask | cv2.bitwise_not(ff)  # (holes filled)
  return cv2.GaussianBlur(mask, (0, 0), 1.2)

def lerp_anchor(u, A, B):
  """Piecewise-linear map of a body fraction u through matched anchors A -> B (both increasing, from 0 to 1)."""
  return np.interp(u, A, B)

def canvas_of(sp, head_right):
  """FishDock's cut-out of the species, 480 x 320, turned head-left where the game turns it (RGBA, uint8)."""
  im = np.array(Image.open(f"{REPO}/public/fish/{sp}-s.webp").convert("RGBA").resize((480, 320), Image.LANCZOS))
  return im[:, ::-1].copy() if head_right else im

def colcurve(S, key, x):
  """A shape's per-column value at fractional columns x (clamped to the fish)."""
  v = S[key]; xi = np.clip(x, S["x0"], S["x1"]); i = np.floor(xi).astype(int); f = xi - i; j = np.minimum(i + 1, S["x1"])
  return v[i] * (1 - f) + v[j] * f

def warp(sp, photo, mask, Sc, Sp, cut, anchors_c, anchors_p, eye_c=None, eye_p=None):
  """The skin: for every pixel of the K x cut-out frame, where in the (head-left, level) photo it is. Returns the
  colour (uint8 RGB), the cut-out's alpha at K x, and where the photo had no fish (a fin it doesn't show)."""
  H, W = 320 * K, 480 * K
  X, Y = np.meshgrid((np.arange(W) + 0.5) / K - 0.5, (np.arange(H) + 0.5) / K - 0.5)
  x0c, xpc, x1c = Sc["x0"], Sc["xp"], Sc["x1"]; x0p, xpp, x1p = Sp["x0"], Sp["xp"], Sp["x1"]
  body = X <= xpc
  # along the length: the body by its marks, the tail by its own length
  u = np.clip((X - x0c) / (xpc - x0c), -0.05, 1.0)
  up = lerp_anchor(u, anchors_c, anchors_p); xP_body = x0p + up * (xpp - x0p)
  t = np.clip((X - xpc) / max(1, x1c - xpc), 0, 1.0); xP_tail = xpp + t * (x1p - xpp - 2)
  xP = np.where(body, xP_body, xP_tail)
  # across: between the body's edges (s in -1..1), and beyond them to the silhouette's edge for a fin; the tail by its
  # silhouette alone
  Tc, Bc, tc, bc = (colcurve(Sc, k, X) for k in ("T", "B", "top", "bot"))
  Tp, Bp, tp, bp = (colcurve(Sp, k, xP) for k in ("T", "B", "top", "bot"))
  Tcs, Bcs, Tps, Bps = colcurve(Sc, "Ts", X), colcurve(Sc, "Bs", X), colcurve(Sp, "Ts", xP), colcurve(Sp, "Bs", xP)
  # (the body's edges past the peduncle: the tail's middle line, from the peduncle)
  midc_tail = (tc + bc) / 2; midp_tail = (tp + bp) / 2
  s_body = (Y - (Tcs + Bcs) / 2) / np.maximum(0.5, (Bcs - Tcs) / 2)
  if eye_c is not None:
    # (the eye where the model has it: a smooth nudge across the body round the eye)
    ex, ey, er = eye_c; exi = np.array([ex])
    s_ec = (ey - (colcurve(Sc, "Ts", exi) + colcurve(Sc, "Bs", exi)) / 2) / ((colcurve(Sc, "Bs", exi) - colcurve(Sc, "Ts", exi)) / 2)
    pxi = np.array([eye_p[0]]); s_ep = (eye_p[1] - (colcurve(Sp, "Ts", pxi) + colcurve(Sp, "Bs", pxi)) / 2) / ((colcurve(Sp, "Bs", pxi) - colcurve(Sp, "Ts", pxi)) / 2)
    g = np.exp(-(((X - ex) ** 2 + (Y - ey) ** 2) / (4.0 * er) ** 2)); s_body = s_body + (s_ep[0] - s_ec[0]) * g
  yP_in = (Tps + Bps) / 2 + s_body * (Bps - Tps) / 2
  # fins above and below: the fraction of the way from the body's edge to the silhouette's, matched
  fa_c = (Tc - Y) / np.maximum(0.5, Tc - tc); fa_p_h = Tp - tp
  yP_up = Tp - fa_c * fa_p_h
  fb_c = (Y - Bc) / np.maximum(0.5, bc - Bc); fb_p_h = bp - Bp
  yP_dn = Bp + fb_c * fb_p_h
  yP_body = np.where(Y < Tc, yP_up, np.where(Y > Bc, yP_dn, yP_in))
  st = (Y - midc_tail) / np.maximum(0.5, (bc - tc) / 2); yP_tail = midp_tail + st * (bp - tp) / 2
  yP = np.where(body, yP_body, yP_tail)
  # a fin the photo doesn't show (folded down, or cut off): marked to be filled
  thin = np.where(Y < Tc, fa_p_h < 0.25 * np.maximum(1, Tc - tc) * (Sp["L"] / Sc["L"]), np.where(Y > Bc, fb_p_h < 0.25 * np.maximum(1, bc - Bc) * (Sp["L"] / Sc["L"]), False)) & body
  col = cv2.remap(photo, xP.astype(np.float32), yP.astype(np.float32), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
  inside = cv2.remap(mask, xP.astype(np.float32), yP.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
  alpha = cv2.resize(cut[:, :, 3], (W, H), interpolation=cv2.INTER_CUBIC)
  hole = ((inside < 200) | thin) & (alpha > 20)
  fin = (alpha > 20) & body & ((Y < Tc - 1.0) | (Y > Bc + 1.0))
  tail = (alpha > 20) & ~body
  tail_ok = ((bp - tp) / np.maximum(1, bc - tc)) * (Sc["L"] / Sp["L"]) > 0.6
  return col, alpha, hole, dict(xP=xP, yP=yP, fin=fin, tail=tail, tail_ok=tail_ok, X=X, Y=Y, Tc=Tc, Bc=Bc)

# ---- each species' photo: the file (downloads/commons-fish/<species>_<n>.jpg, or a 1920-wide copy), which way its head
# faces, how to cut it from its background, and its eye (centre x, y and radius) and gill cover's rear edge (x), in the
# photo's own pixels as downloaded, placed by eye. The cut-out's are build_fish3.py's ANAT ----
PHOTOS = {
  # (eye: x, y, radius; op: a point on the gill cover's rear edge, about mid-body; erase: (polygon, (dx, dy)) a fin
  # lying across the flank, covered with the skin (dx, dy) away; eye_idx: which of the cut-out's eyes the photo's is)
  "cod": dict(file="cod_24", head="right", bg=dict(bg="black", thr=22), eye=(1652, 645, 25), op=(1410, 720),
              erase=[([(1372, 662), (1410, 680), (1402, 760), (1350, 862), (1305, 884), (1322, 820), (1352, 742)], (-200, -10))]),
  "bass": dict(file="bass_3", head="left", bg=dict(bg="black", thr=22), eye=(185, 865, 22), op=(432, 870)),
  "mackerel": dict(file="mackerel_0", head="right", bg=dict(bg="black", thr=22), eye=(1667, 695, 22), op=(1460, 740),
              erase=[([(1447, 682), (1442, 702), (1300, 714), (1252, 702), (1300, 686)], (-180, 0))]),
  "whiting": dict(file="whiting_13", head="right", bg=dict(bg="cut", box=[120, 520, 1600, 870]), eye=(1443, 640, 30), op=(1292, 690),
              erase=[([(1242, 638), (1248, 702), (1180, 728), (1035, 702), (1028, 678), (1120, 662), (1200, 648)], (-230, 0))]),
  "pollack": dict(file="pollack_4", head="left", bg=dict(bg="cut", poly=[(245, 805), (380, 690), (700, 470), (735, 320), (790, 300), (845, 400), (990, 255), (1040, 270), (1180, 330), (1320, 262), (1400, 330), (1460, 330), (1510, 210), (1545, 240), (1705, 455), (1450, 440), (1450, 520), (1280, 545), (1100, 720), (900, 790), (700, 830), (450, 850), (260, 840)]), eye=(405, 735, 30), op=(600, 760),
              erase=[([(612, 560), (650, 532), (702, 600), (692, 702), (640, 702), (612, 650)], (170, -60))]),
  "pouting": dict(file="pouting_12", head="right", bg=dict(bg="white", thr=26), eye=(1398, 440, 38), op=(1215, 520),
              erase=[([(1172, 498), (1168, 562), (1120, 556), (948, 526), (1000, 503)], (-220, 0))]),
  "flounder": dict(file="flounder_0", head="right", bg=dict(bg="black", thr=22), eye=(1712, 680, 18), op=(1450, 820)),
  "plaice": dict(file="plaice_0", head="right", bg=dict(bg="black", thr=22), eye=(881, 358, 8), op=(760, 430)),
  "dab": dict(file="dab_0", head="right", bg=dict(bg="black", thr=22), eye=(909, 369, 9), op=(811, 410), eye_idx=1),
  "sole": dict(file="sole_0", head="right", bg=dict(bg="black", thr=22), eye=(1718, 765, 14), op=(1525, 850)),
  "ballan-wrasse": dict(file="ballan-wrasse_19", head="left", bg=dict(bg="cut", box=[72, 202, 1433, 929]), eye=(194, 616, 25), op=(382, 677),
              erase=[([(406, 655), (432, 576), (547, 482), (598, 475), (641, 569), (619, 648), (475, 720)], (300, 0))]),
  "black-bream": dict(file="black-bream_23", head="left", bg=dict(bg="cut", box=[405, 308, 1600, 842]), wb=(1.0, 1.0, 1.04), eye=(481, 596, 24), op=(580, 680),
              erase=[([(624, 648), (859, 640), (907, 664), (842, 688), (648, 688)], (280, 0))]),
  "garfish": dict(file="garfish_29", head="right", bg=dict(bg="cut", box=[99, 486, 1656, 666]), eye=(1404, 572, 16), op=(1296, 576)),
  "smoothhound": dict(file="smoothhound_16", head="right", bg=dict(bg="black", thr=22), eye=(1643, 590, 12), op=None),
  "thick-lipped-mullet": dict(file="thick-lipped-mullet_2", head="left", bg=dict(bg="cut", box=[119, 179, 1799, 561]), wb=(0.98, 1.0, 1.05), eye=(243, 362, 26), op=(434, 442), tail="draw",
              erase=[([(485, 323), (782, 306), (791, 340), (508, 383)], (300, 0))]),
  "coalfish": dict(file="coalfish_7", head="left", bg=dict(bg="cut", poly=[(2, 618), (162, 486), (486, 405), (540, 330), (567, 267), (610, 330), (700, 330), (745, 262), (800, 300), (907, 348), (1000, 350), (1053, 332), (1166, 397), (1231, 429), (1377, 292), (1418, 324), (1395, 420), (1426, 535), (1264, 486), (1100, 560), (972, 616), (842, 713), (648, 680), (437, 729), (97, 680), (2, 652)]), eye=(183, 562, 32), op=(397, 600)),
  "thornback-ray": dict(file="thornback-ray_0", head="left", bg=dict(bg="black", thr=22), eye=(378, 645, 22), op=None, level=False),
}
ANAT = {  # (from build_fish3.py: eyes (x, y, r), op (the gill cover's edge, x) and pec in the cut-out's 480 x 320, head left)
  "cod": dict(eye=(88, 150, 9), op=150, pec=(170, 160, 242, 192), scales=95),
  "bass": dict(eye=(72, 157, 9), op=146, pec=(160, 163, 222, 196), scales=70, photo_scales=True),
  "whiting": dict(eye=(68, 158, 8), op=128, pec=(135, 168, 200, 190), scales=90),
  "mackerel": dict(eye=(73, 150, 9), op=126, pec=(143, 150, 190, 176), scales=140),
  "pollack": dict(eye=(80, 155, 9), op=140, pec=(158, 160, 228, 200), scales=95),
  "coalfish": dict(eye=(69, 164, 9), op=128, pec=(140, 155, 200, 190), scales=95),
  "pouting": dict(eye=(76, 148, 14), op=128, pec=(150, 170, 230, 210), scales=80),
  "black-bream": dict(eye=(79, 157, 13), op=140, pec=(155, 172, 245, 205), scales=60, photo_scales=True),
  "ballan-wrasse": dict(eye=(82, 140, 7), op=150, pec=(135, 168, 200, 205), scales=42, photo_scales=True),
  "thick-lipped-mullet": dict(eye=(68, 146, 8), op=122, pec=(143, 150, 185, 172), scales=45, photo_scales=True),
  "garfish": dict(eye=(111, 151, 5), op=140, scales=150),
  "gurnard": dict(eye=(88, 150, 9), op=150, scales=80),
  "smoothhound": dict(eye=(65, 167, 7), op=None, scales=0, denticles=True),
  "thornback-ray": dict(eye=(70, 132, 5), op=None, scales=0),
  "lesser-spotted-dogfish": dict(eye=(72, 164, 8), op=None, scales=0, spots=900, denticles=True),
  "conger": dict(eye=None, op=None, scales=0, pic="conger-straight"),
  "eel": dict(eye=None, op=None, scales=0, pic="eel-straight"),
  "tope": dict(eye=(67, 162, 6), op=None, scales=0, denticles=True),
  "plaice": dict(eye=(55, 135, 5), op=110, scales=0),
  "dab": dict(eye=(58, 150, 5), op=108, scales=0),
  "flounder": dict(eye=(69, 136, 5), op=114, scales=0),
  "sole": dict(eye=(43, 142, 3), op=90, scales=0),
}

def prepare(sp, cfg, photo_dir):
  """The photo turned head-left and level, its silhouette, and its marks moved with it."""
  img = cv2.imread(f"{photo_dir}/{cfg['file']}.jpg", cv2.IMREAD_COLOR)
  h, w = img.shape[:2]; scale = 1.0
  ex, ey, er = cfg["eye"]; op = cfg["op"] or (ex, ey)
  ox, oy = op
  for poly, (dx, dy) in cfg.get("erase", []):
    # (a fin lying across the flank in the photo, where the model has none: covered with the skin from beside it, the
    # source shifted by (dx, dy), feathered in)
    pm = np.zeros((h, w), np.float32); cv2.fillPoly(pm, [(np.array(poly, np.float32) * scale).astype(np.int32)], 1.0)
    pm = cv2.GaussianBlur(cv2.dilate(pm, np.ones((9, 9), np.uint8)), (0, 0), 4)[..., None]
    Msh = np.float32([[1, 0, -dx * scale], [0, 1, -dy * scale]]); src = cv2.warpAffine(img, Msh, (w, h), borderMode=cv2.BORDER_REFLECT)
    img = (img * (1 - pm) + src * pm).astype(np.uint8)
  if cfg["head"] == "right": img = img[:, ::-1].copy(); ex = w - 1 - ex; ox = w - 1 - ox
  bg = dict(cfg["bg"])
  if cfg["head"] == "right":
    if "box" in bg: bg["box"] = [w - bg["box"][2], bg["box"][1], w - bg["box"][0], bg["box"][3]]
    if "poly" in bg: bg["poly"] = [(w - 1 - x, y) for x, y in bg["poly"]]
  mask = segment(img, bg)
  if cfg.get("wb"):
    # (a photo taken under water: its blue-green cast taken off, the fish's own mean made grey, warmed by wb)
    sel = cv2.erode((mask > 200).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    m = img[sel].reshape(-1, 3).astype(np.float32).mean(0); tgt = m.mean() * np.array(cfg["wb"], np.float32)
    img = np.clip(img.astype(np.float32) * (tgt / np.maximum(1, m))[None, None, :], 0, 255).astype(np.uint8)
  img2, mask2, ang = level(img, mask) if cfg.get("level", True) else (img, mask, 0.0)
  M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0)
  p = M @ np.array([ex, ey, 1.0]); q = M @ np.array([ox, oy, 1.0])
  return img2, mask2, dict(eye=(p[0], p[1], er), op=q[0] if cfg["op"] else None, angle=ang)

def build(sp, photo_dir, out_dir, head_right_canvas=False, pic=None):
  an = ANAT[sp]; cfg = PHOTOS.get(sp) or dict(proc=True, op=an.get("op"))
  cut = canvas_of(pic or sp, head_right_canvas); Sc = shape(cut[:, :, 3])
  if cfg.get("proc"):
    # (no photograph fit to use: the cut-out itself, four times over, is the "photo"; detail is added after)
    img = cv2.resize(cv2.cvtColor(cut[:, :, :3], cv2.COLOR_RGB2BGR), (480 * K, 320 * K), interpolation=cv2.INTER_LANCZOS4)
    img = cv2.addWeighted(img, 1.5, cv2.GaussianBlur(img, (0, 0), 2.0), -0.5, 0)
    mask = cv2.resize(cut[:, :, 3], (480 * K, 320 * K), interpolation=cv2.INTER_CUBIC)
    ex, ey, er = an["eye"] or (Sc["x0"] + 0.05 * Sc["L"], (Sc["T"][Sc["x0"] + 2] + Sc["B"][Sc["x0"] + 2]) / 2, 1)
    mk = dict(eye=((ex + 0.5) * K - 0.5, (ey + 0.5) * K - 0.5, er * K), op=((an["op"] + 0.5) * K - 0.5) if an.get("op") else None, angle=0.0)
  else:
    img, mask, mk = prepare(sp, cfg, photo_dir)
  Sp = shape(mask)
  uc = lambda x: (x - Sc["x0"]) / (Sc["xp"] - Sc["x0"]); upf = lambda x: (x - Sp["x0"]) / (Sp["xp"] - Sp["x0"])
  if not an.get("eye"): A, B = [0.0, 1.0], [0.0, 1.0]
  elif an.get("op") and mk.get("op"): A = [0.0, uc(an["eye"][0]), uc(an["op"]), 1.0]; B = [0.0, upf(mk["eye"][0]), upf(mk["op"]), 1.0]
  else: A = [0.0, uc(an["eye"][0]), 1.0]; B = [0.0, upf(mk["eye"][0]), 1.0]
  col, alpha, hole, dbg = warp(sp, img, mask, Sc, Sp, cut, A, B, eye_c=an.get("eye"), eye_p=mk["eye"] if an.get("eye") else None)
  r = dict(col=col, alpha=alpha, hole=hole, dbg=dbg, Sc=Sc, Sp=Sp, mk=mk, A=A, B=B, img=img, mask=mask, cut=cut, cfg=cfg)
  r["skin"] = compose(r, pec=an.get("pec"))
  if cfg.get("proc"): r["skin"] = detail(r, an)
  return r

def detail(r, an):
  """Fine detail drawn over a skin made from the cut-out (no photograph): pigment cells over the body, darker and
  denser on the back, a shark's or a dogfish's small dark spots, and a slow unevenness of colour; the fins kept."""
  sk = r["skin"].copy(); H, W = sk.shape[:2]; d = r["dbg"]; rng = np.random.default_rng(11)
  body = (r["alpha"] > 128) & ~d["fin"] & ~d["tail"]
  Y, Tc, Bc = d["Y"], d["Tc"], d["Bc"]; up = np.clip((Bc - Y) / np.maximum(1, Bc - Tc), 0, 1)  # (1 the back, 0 the belly)
  lab = cv2.cvtColor(sk[:, :, :3], cv2.COLOR_BGR2LAB).astype(np.float32)
  # pigment cells: dots of a pixel or two, more and darker towards the back
  dots = np.zeros((H, W), np.float32); n = int(W * H / 55)
  xs = rng.integers(0, W, n); ys = rng.integers(0, H, n); keep = body[ys, xs] & (rng.random(n) < 0.25 + 0.75 * up[ys, xs] ** 1.5)
  for x, y, rr in zip(xs[keep], ys[keep], rng.uniform(0.6, 1.6, keep.sum())): cv2.circle(dots, (int(x), int(y)), int(round(rr)), 1.0, -1, lineType=cv2.LINE_AA)
  dots = cv2.GaussianBlur(dots, (0, 0), 0.6)
  lab[:, :, 0] -= dots * 22 * (0.5 + 0.5 * up)
  if an.get("spots"):
    # (a dogfish's: many small dark brown spots over the back and flanks)
    sp_ = np.zeros((H, W), np.float32); n2 = int(W * H / an["spots"])
    xs = rng.integers(0, W, n2); ys = rng.integers(0, H, n2); keep = (r["alpha"][ys, xs] > 128) & (rng.random(n2) < 0.2 + 0.8 * up[ys, xs])
    for x, y, rr in zip(xs[keep], ys[keep], rng.uniform(2.0, 5.5, keep.sum())): cv2.circle(sp_, (int(x), int(y)), int(round(rr)), 1.0, -1, lineType=cv2.LINE_AA)
    sp_ = cv2.GaussianBlur(sp_, (0, 0), 0.8); lab[:, :, 0] -= sp_ * 45; lab[:, :, 1] += sp_ * 3; lab[:, :, 2] += sp_ * 6
  # (a slow unevenness: no two scales' worth of skin quite the same shade)
  nz = cv2.resize(rng.standard_normal((H // 24 + 1, W // 24 + 1)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
  lab[:, :, 0] += np.where(body, nz * 3.0, 0)
  out = cv2.cvtColor(lab.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
  return np.dstack([np.where(body[..., None] | (r["alpha"][..., None] <= 128), out, sk[:, :, :3]), sk[:, :, 3]])

def lab_transfer(src_bgr, src_sel, ref_bgr, ref_sel, lim=(0.5, 1.6)):
  """src's colours (where src_sel) moved to ref's (where ref_sel): mean and spread in Lab, per channel."""
  A = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2LAB).astype(np.float32); R = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
  out = A.copy(); a = A[src_sel]; r = R[ref_sel]
  if len(a) < 50 or len(r) < 50: return src_bgr
  ma, sa, mr, sr = a.mean(0), a.std(0) + 1e-3, r.mean(0), r.std(0) + 1e-3
  k = np.clip(sr / sa, *lim); out[src_sel] = (a - ma) * k + mr
  return cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

def compose(r, pec=None, fin_tint=None):
  """The finished skin (BGRA): the photo over the body, fins made from the cut-out's own fins in the photo's fin colours
  with fine rays, the pectoral fan painted where the model's pectoral fin takes its picture from (pec: x0, y0, x1, y1 in
  the cut-out), gaps filled."""
  col, alpha, hole, d = r["col"].copy(), r["alpha"], r["hole"], r["dbg"]
  H, W = alpha.shape; X, Y = d["X"], d["Y"]
  cut = r["cut"]; cut4 = cv2.resize(cv2.cvtColor(cut[:, :, :3], cv2.COLOR_RGB2BGR), (W, H), interpolation=cv2.INTER_CUBIC)
  # the photo's fin colours: its fish outside its own body's edges (folded fins, tail), else its back's darker edge
  Sp, img, mask = r["Sp"], r["img"], r["mask"]
  hh, ww = mask.shape; xs = np.clip(np.arange(ww), Sp["x0"], Sp["x1"])
  Tp = Sp["T"][xs]; Bp = Sp["B"][xs]; yy = np.arange(hh)[:, None]
  # (the tail first: always a fin, seldom folded flat; else the fish outside its body's edges)
  er_ = cv2.erode((mask > 160).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
  outside = er_ & (np.arange(ww)[None, :] > Sp["xp"] + 0.03 * Sp["L"])
  if outside.sum() < 2000: outside = er_ & ((yy < Tp[None, :] - 3) | (yy > Bp[None, :] + 3))
  fins = d["fin"] | (d["tail"] & ~d["tail_ok"])
  # (the cut-out's fin colours only in broad strokes: its painted rays and marks dropped, its colouring kept)
  soft = cv2.GaussianBlur(cut4, (0, 0), 3.5 * K)
  synth = lab_transfer(soft, fins | d["tail"], img, outside, lim=(0.6, 1.3))
  # fine rays: dorsal and anal fins raked back from their roots, the tail's fanned from the peduncle; each ray a darker
  # line with the membrane between paler, a little wavy, and darker towards a fin's edge
  Sc = r["Sc"]; Tc, Bc = d["Tc"], d["Bc"]
  dist = np.where(Y < Tc, Tc - Y, Y - Bc)
  rng = np.random.default_rng(7); wob = cv2.GaussianBlur(rng.standard_normal((H // 8 + 1, W // 8 + 1)).astype(np.float32), (0, 0), 2)
  wob = cv2.resize(wob, (W, H), interpolation=cv2.INTER_CUBIC) * 0.35
  ph = (X - 0.55 * dist) / 3.4 + wob
  ycp = (Sc["T"][Sc["xp"]] + Sc["B"][Sc["xp"]]) / 2; tx0 = Sc["xp"] - 8
  ang = np.arctan2(Y - ycp, X - tx0); ph = np.where(d["tail"], ang * (Sc["x1"] - Sc["xp"]) / 3.0 + wob, ph)
  rays = 0.84 + 0.16 * np.abs(np.cos(np.pi * ph)) ** 0.7
  edge_f = np.where(d["tail"], np.clip((X - Sc["xp"]) / max(1, Sc["x1"] - Sc["xp"]), 0, 1), np.clip(dist / np.maximum(1, np.where(Y < Tc, Tc - colcurve(Sc, "top", X), colcurve(Sc, "bot", X) - Bc)), 0, 1))
  synth = (synth.astype(np.float32) * (rays * (1 - 0.18 * edge_f ** 2))[..., None]).clip(0, 255)
  # the tail: from the peduncle's skin in the photo into the drawn fin over a short way
  tw = np.clip((X - Sc["xp"]) / 6.0, 0, 1)[..., None]
  base = col.astype(np.float32)
  # (a fin the photo shows spread, as the model has it, kept from the photo; drawn where it is folded or missing)
  good = (~hole).astype(np.float32); good = cv2.GaussianBlur(cv2.erode(good, np.ones((5, 5), np.uint8)), (0, 0), 2.0)[..., None]
  out = np.where(fins[..., None], base * good + synth * (1 - good), base)
  tgood = good if d["tail_ok"].mean() > 0.5 and (r.get("cfg") or {}).get("tail") != "draw" else 0.0
  out = np.where(d["tail"][..., None], base * (1 - tw * (1 - tgood)) + synth * tw * (1 - tgood), out)
  col = out.clip(0, 255).astype(np.uint8); use_synth = fins | (d["tail"] & (tw[..., 0] > 0.5))
  # the photo's own highlights (a flash on wet skin) taken down: the game lights the fish itself
  lab = cv2.cvtColor(col, cv2.COLOR_BGR2LAB).astype(np.float32); Lm = cv2.medianBlur(lab[:, :, 0].astype(np.uint8), 31).astype(np.float32)
  ex_ = np.clip(lab[:, :, 0] - Lm - 10, 0, None); lab[:, :, 0] -= 0.7 * ex_ * (~use_synth); col = cv2.cvtColor(lab.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
  # the pectoral fin: painted into the empty corner of the picture (FREE), where the game points the model's fin plates
  # when it wears this skin (angler.js wearSkin), in the shape build_fish3.py gives the plate (a fan from its root just
  # behind the gill cover, back to a rounded point), its rays fanning along it; the flank under the fin keeps its skin
  if pec is not None:
    px0, py0, px1, py1 = pec; Hh = py1 - py0; yb = (py0 + py1) / 2 - 0.1 * Hh; hb = 0.18 * Hh
    Xo, Yo = X + (px0 - FREE[0]), Y + (py0 - FREE[1])
    t = np.clip((Xo - px0) / max(1, px1 - px0), -0.2, 1.2)
    half = (hb + (Hh / 2 - hb) * np.clip(t / 0.55, 0, 1) ** 2 * (3 - 2 * np.clip(t / 0.55, 0, 1))) * np.where(t > 0.55, np.sqrt(np.clip(1 - ((t - 0.55) / 0.45) ** 2, 0, 1)), 1.0)
    yc = yb + ((py0 + py1) / 2 - yb) * t; sv = (Yo - yc) / np.maximum(0.4, half)
    inbox = (X >= FREE[0] - 3) & (X <= FREE[0] + (px1 - px0) + 3) & (Y >= FREE[1] - 3) & (Y <= FREE[1] + (py1 - py0) + 3)
    fan = ((t >= -0.02) & (t <= 1.02) & (np.abs(sv) <= 1.04) & inbox).astype(np.float32)
    fr = (0.8 + 0.2 * np.abs(np.cos(np.pi * (np.clip(sv, -1, 1) * 7.5 + wob * 0.5))) ** 0.7) * (1.05 - 0.2 * np.clip(t, 0, 1)) * (1 - 0.15 * np.clip(np.abs(sv), 0, 1) ** 3)
    tint = np.median(synth[fins], 0) if fins.any() else np.array([90.0, 110.0, 120.0])
    # (its colour the fins', and a little of the flank's under it at the root: a pectoral fin is thin)
    flank = cv2.remap(cv2.GaussianBlur(col.astype(np.float32), (0, 0), 3 * K / 4), ((Xo + 0.5) * K - 0.5).astype(np.float32), ((Yo + 0.5) * K - 0.5).astype(np.float32), cv2.INTER_LINEAR)
    root = np.clip(1 - t / 0.35, 0, 1)[..., None]
    fanc = (tint[None, None, :] * (1 - 0.35 * root) + flank * 0.35 * root) * fr[..., None]
    sel = fan > 0
    col = col.copy(); col[sel] = np.clip(fanc[sel], 0, 255).astype(np.uint8)
    r["fan"] = cv2.GaussianBlur(fan, (0, 0), 0.6 * K / 4); r["fan_ph"] = np.clip(sv, -1, 1) * 7.5 + wob * 0.5
  # gaps in the body (where the photo's fish didn't reach): filled from round them
  gap = (hole & ~use_synth).astype(np.uint8) * 255
  if gap.any(): col = cv2.inpaint(col, gap, 6, cv2.INPAINT_TELEA)
  # (the edge: the colour carried a few pixels past the outline, so mipmaps and filtering never pull in black)
  edge = (np.maximum(alpha, r["fan"] * 255 if "fan" in r else 0) < 20).astype(np.uint8) * 255; col = cv2.inpaint(col, cv2.dilate(255 - edge, np.ones((3, 3), np.uint8)) & edge & cv2.dilate(255 - edge, np.ones((15, 15), np.uint8)), 3, cv2.INPAINT_TELEA)
  # (fins a little clearer towards their edges, as a membrane is)
  a = alpha.astype(np.float32)
  fa = np.clip(1 - dist / np.maximum(1, np.where(Y < Tc, Tc - colcurve(Sc, "top", X), colcurve(Sc, "bot", X) - Bc)), 0, 1)
  a = np.where(d["fin"], a * (0.8 + 0.2 * fa), a)
  if "fan" in r: a = np.maximum(a, r["fan"] * 255)
  return np.dstack([col, a.clip(0, 255).astype(np.uint8)])

def normal_map(r, scales=70, strength=2.2, skin=None):
  """A tangent-space normal map (BGR uint8, the game's convention: x right, y down the picture) over the same frame:
  the photo's fine detail as relief over the body and head, overlapping scales on the body behind the gill cover
  where the species has them (rows following the body, each scale's free edge towards the tail, none on fins, snout
  or eye), and the fins' rays as ridges."""
  d = r["dbg"]; X, Y, Tc, Bc = d["X"], d["Y"], d["Tc"], d["Bc"]; Sc = r["Sc"]; alpha = r["alpha"]
  H, W = alpha.shape; col = (skin if skin is not None else r["skin"])[:, :, :3]
  L = cv2.cvtColor(col, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32) / 255
  body = (alpha > 128) & ~d["fin"] & ~d["tail"]
  hp = L - cv2.GaussianBlur(L, (0, 0), 3.0); hp = cv2.GaussianBlur(hp, (0, 0), 0.7)
  hgt = np.where(body, hp / (hp[body].std() + 1e-4) * 0.03, 0)
  if scales > 0:
    cw = 480 / (scales * 1.1); rh = cw * 0.5; R = cw * 0.62
    mid = (colcurve(Sc, "Ts", X) + colcurve(Sc, "Bs", X)) / 2
    gx, gy = X / cw, (Y - mid) / rh
    best = np.full(X.shape, np.inf); hs = np.zeros(X.shape, np.float32)
    j0 = np.floor(gy).astype(int)
    for dj in (-2, -1, 0, 1, 2):
      j = j0 + dj; off = (np.mod(j, 2)) * 0.5
      i0 = np.floor(gx - off).astype(int)
      for di in (-1, 0, 1, 2):
        cx = (i0 + di + off) * cw; cy = j * rh; dx = X - cx; dy = ((Y - mid) - cy) * 1.25; dd = np.hypot(dx, dy)
        take = (dd < R) & (cx < best)  # (the scale nearer the head lies over the next)
        best = np.where(take, cx, best); hs = np.where(take, 0.45 + 0.55 * np.clip(dx / R, -1, 1) * (1 - (dd / R) ** 6), hs)
    an = r.get("anat") or {}; xop = an.get("op", Sc["x0"] + 0.25 * Sc["L"])
    sm_ = np.clip((X - xop) / 6, 0, 1) * np.clip((Sc["xp"] - X) / 4, 0, 1) * np.clip(np.minimum(Y - Tc, Bc - Y) / 2.5, 0, 1)
    hgt = hgt + np.where(body, hs * sm_ * 0.16, 0)
  # fins: rays as ridges
  fin = d["fin"] | d["tail"]
  dist = np.where(Y < Tc, Tc - Y, Y - Bc); ph = (X - 0.55 * dist) / 3.4
  ycp = (Sc["T"][Sc["xp"]] + Sc["B"][Sc["xp"]]) / 2; ang = np.arctan2(Y - ycp, X - (Sc["xp"] - 8))
  ph = np.where(d["tail"], ang * (Sc["x1"] - Sc["xp"]) / 3.0, ph)
  hgt = hgt + np.where(fin & (alpha > 20), 0.06 * np.abs(np.cos(np.pi * ph)) ** 2, 0)
  if "fan" in r: hgt = hgt + r["fan"] * 0.06 * np.abs(np.cos(np.pi * r["fan_ph"])) ** 2  # (the pectoral fin's rays, in its corner)
  if (r.get("anat") or {}).get("denticles"):
    # (a shark's skin: dermal denticles, a fine rasp all over, finer than any scale)
    rng = np.random.default_rng(5); dn = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 0.9)
    hgt = hgt + np.where(alpha > 128, dn * 0.012, 0)
  hgt = cv2.GaussianBlur(hgt.astype(np.float32), (0, 0), 0.6)
  gxp = cv2.Sobel(hgt, cv2.CV_32F, 1, 0, ksize=3) / 8 * K * strength; gyp = cv2.Sobel(hgt, cv2.CV_32F, 0, 1, ksize=3) / 8 * K * strength
  nx, ny = -gxp, gyp; l = np.sqrt(nx * nx + ny * ny + 1)
  n = np.dstack([(1 / l) * 0.5 + 0.5, (ny / l) * 0.5 + 0.5, (nx / l) * 0.5 + 0.5])  # (BGR: z, y, x)
  return (n * 255).clip(0, 255).astype(np.uint8)
