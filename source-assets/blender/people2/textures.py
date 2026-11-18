# FishDock people v2: the clothes' textures, made from the garments' own surfaces (a_build.py writes them out).
# Every texel of a garment's unwrapped texture is found on the garment (its point and its normal, which piece it is),
# and the detail is drawn there in three dimensions, so seams run where seams run on a jacket whatever the unwrap:
#   the jacket: coated nylon with a fine ripstop grid; seams pressed in (shoulders, yoke, sides, sleeves, armholes)
#     with a line of stitching beside each; the storm flap's, pockets' and bands' edges stitched; creases where the
#     cloth folds; salt left in pale tide marks, dirt at the hem and cuffs, the coating worn paler on edges
#   the trousers: the same cloth, a little rougher; knee darts, side seams, the cargo pocket; mud splashes low down
#   the boots: rubber, moulding lines, the top band, a tread on the sole and a heel; mud on the sole and splashed up
#   the beard: short strands growing down the face, dark brown with grey in it, thinner at its edges
# Writes, per garment, <name>_c.png (colour; the cloth's own detail in grey, so the game can colour it as your
# kit), <name>_n.png (tangent-space normal, the game's convention: x right, y up the texture), <name>_r.png (roughness).
#   python3 textures.py <folder with the .npz files> <tag> <out folder>
import sys, os, math, json
import numpy as np, cv2

SRC, TAG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(5)

def raster(Z, size, extra=None):
  """Every texel's point, normal, piece and the uv's metres-per-texel, by drawing each triangle into the texture (and
  any extra per-corner value, interpolated, in raster.extra)."""
  P, N, UV, T, K = Z["P"], Z["N"], Z["UV"], Z["T"], Z["K"]
  S = size; X = None if extra is None else np.asarray(extra, np.float32); ex = np.zeros((S, S), np.float32)
  pos = np.zeros((S, S, 3), np.float32); nor = np.zeros((S, S, 3), np.float32); piece = np.full((S, S), -1, np.int16); mpt = np.zeros((S, S), np.float32)
  du = np.zeros((S, S, 3), np.float32); dv = np.zeros((S, S, 3), np.float32)
  for ti, (a, b, c) in enumerate(T):
    uv = UV[[a, b, c]] * S; uv[:, 1] = S - uv[:, 1]   # (image rows run down; v runs up)
    x0, y0 = np.floor(uv.min(0)).astype(int) - 1; x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = uv
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9: continue
    w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den; w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den; w2 = 1 - w0 - w1
    m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
    if not m.any(): continue
    yy, xx = (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int)
    pa, pb, pc = P[a], P[b], P[c]
    pos[yy, xx] = w0[m, None] * pa + w1[m, None] * pb + w2[m, None] * pc
    n = w0[m, None] * N[a] + w1[m, None] * N[b] + w2[m, None] * N[c]; nor[yy, xx] = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    piece[yy, xx] = K[ti]
    if X is not None: ex[yy, xx] = w0[m] * X[a] + w1[m] * X[b] + w2[m] * X[c]
    # (the texture's own directions on the surface: how far one texel along u and along v goes, in metres)
    M = np.array([[bx - ax, cx - ax], [by - ay, cy - ay]])
    try: Mi = np.linalg.inv(M)
    except np.linalg.LinAlgError: continue
    E = np.stack([pb - pa, pc - pa], 1)   # 3 x 2
    J = E @ Mi                            # metres per texel along x and y of the image
    du[yy, xx] = J[:, 0]; dv[yy, xx] = J[:, 1]; mpt[yy, xx] = math.sqrt(np.linalg.norm(np.cross(pb - pa, pc - pa)) / max(abs(np.linalg.det(M)), 1e-12))
  raster.extra = ex
  return pos, nor, piece, du, dv, mpt

def frame_of(Z):
  f = Z["frame"]; return f[0], f[1], f[2], f[3], f[4:7], f[7:10], {k: np.array(v) for k, v in json.loads(str(Z["bones"][0])).items()}

def vnoise(p, s, seed=0):
  """Smooth value noise in 3D at scale s (metres), 0..1, over arrays of points."""
  q = p / s + seed * 17.13; i = np.floor(q); f = q - i; f = f * f * (3 - 2 * f)
  def h(o):
    k = i + o; return np.modf(np.sin(k[..., 0] * 127.1 + k[..., 1] * 311.7 + k[..., 2] * 74.7 + seed) * 43758.5453)[0] % 1.0
  c = [[[h(np.array([x, y, z])) for z in (0, 1)] for y in (0, 1)] for x in (0, 1)]
  l = lambda a, b, t: a + (b - a) * t
  x0 = l(l(c[0][0][0], c[0][0][1], f[..., 2]), l(c[0][1][0], c[0][1][1], f[..., 2]), f[..., 1])
  x1 = l(l(c[1][0][0], c[1][0][1], f[..., 2]), l(c[1][1][0], c[1][1][1], f[..., 2]), f[..., 1])
  return l(x0, x1, f[..., 0])
def fbm(p, s, oct=4, seed=0):
  a, t, w = 0.0, 0.0, 1.0
  for o in range(oct): a = a + w * vnoise(p, s / 2 ** o, seed + o); t += w; w *= 0.5
  return a / t

# ---- photographed cloth and rubber (CC0: Poly Haven, ambientCG), laid on the surface at their real size ----
CC0 = os.environ.get("CC0", "")
def cc0_maps(pid):
  """A CC0 set's height, roughness and colour, as float arrays (missing ones None), from CC0/<id>/..."""
  import glob
  d = f"{CC0}/{pid}"
  def one(*keys):
    for k in keys:
      g = sorted(glob.glob(f"{d}/**/*{k}*", recursive=True))
      g = [x for x in g if x.lower().endswith((".jpg", ".png"))]
      if g:
        im = cv2.imread(g[0], cv2.IMREAD_UNCHANGED).astype(np.float32)
        if im.ndim == 3: im = im[..., :3].mean(2) if k not in ("diff", "Color") else cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2RGB)
        return im / (65535.0 if im.max() > 255 else 255.0)
    return None
  return {"h": one("disp", "Displacement"), "r": one("rough", "Roughness"), "c": one("diff", "Color")}
def triplanar(img, pos, nor, size_m):
  """img (a tiling map size_m metres across) sampled at every texel's point, blended by which way it faces."""
  if img is None: return None
  Hh_, Ww_ = img.shape[:2]; w = np.abs(nor) ** 4; w = w / (w.sum(2, keepdims=True) + 1e-9); out = 0
  for ax, (i, j) in enumerate(((1, 2), (0, 2), (0, 1))):
    u = (pos[..., i] / size_m * Ww_).astype(np.float32); v = (pos[..., j] / size_m * Hh_).astype(np.float32)
    sm = cv2.remap(img, u % Ww_, v % Hh_, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    out = out + (sm * w[..., ax:ax + 1] if sm.ndim == 3 else sm * w[..., ax])
  return out
def detail(pid, pos, nor, size_m, m):
  """(height in 0..1 about its mean, roughness about its mean, colour's brightness about its mean) of a CC0 set here."""
  M = cc0_maps(pid) if CC0 else {"h": None, "r": None, "c": None}
  def centred(x):
    if x is None: return np.zeros(m.shape, np.float32)
    if x.ndim == 3: x = x.mean(2)
    return (x - x[m].mean()) if m.any() else x
  h = centred(triplanar(M["h"], pos, nor, size_m)); r = centred(triplanar(M["r"], pos, nor, size_m)); c = centred(triplanar(M["c"], pos, nor, size_m))
  print("  CC0", pid, "height" if M["h"] is not None else "-", "rough" if M["r"] is not None else "-", "colour" if M["c"] is not None else "-", flush=True)
  return h, r, c

def groove(dist, width):
  """A pressed seam's height: 0 off it, down to -1 in its middle (dist in metres from the seam's line)."""
  return -np.clip(1 - np.abs(dist) / width, 0, 1) ** 1.5
def stitches(dist, along, off, pitch=0.0035, w=0.0006):
  """A line of stitching off metres beside a seam: short dashes along it, raised."""
  on = (np.abs(np.abs(dist) - off) < w).astype(np.float32)
  dash = (np.modf(along / pitch)[0] % 1.0) < 0.62
  return on * dash

def normal_from_height(Hh, du, dv, strength=1.0, mask=None):
  """Tangent-space normal from a height field in metres, by its slopes along the texture's own directions."""
  if mask is not None: Hh = dilate(Hh, mask, 4)   # (so an island's edge doesn't slope down to the empty texture round it)
  gx = cv2.Sobel(Hh, cv2.CV_32F, 1, 0, ksize=3) / 8.0; gy = cv2.Sobel(Hh, cv2.CV_32F, 0, 1, ksize=3) / 8.0
  lu = np.linalg.norm(du, axis=2) + 1e-6; lv = np.linalg.norm(dv, axis=2) + 1e-6
  sx = gx / lu * strength; sy = gy / lv * strength    # (rise over run: metres of height per metre of surface)
  # (image y runs down the texture, v up it: the slope along v is minus the image's)
  nx, ny = -sx, sy; l = np.sqrt(nx * nx + ny * ny + 1)
  return np.dstack([nx / l, ny / l, 1 / l])

def dilate(img, mask, n=8):
  """Carry the colour a few texels past each island's edge (so filtering never pulls in the background)."""
  img = img.astype(np.float32).copy(); m = mask.astype(np.float32)
  for _ in range(n):
    k = np.ones((3, 3), np.float32)
    s = cv2.filter2D(img * m[..., None] if img.ndim == 3 else img * m, -1, k); c = cv2.filter2D(m, -1, k)
    grow = (m == 0) & (c > 0)
    if img.ndim == 3: img[grow] = s[grow] / c[grow][:, None]
    else: img[grow] = s[grow] / c[grow]
    m = np.maximum(m, grow.astype(np.float32))
  return img

def save(name, colour, nrm, rough, mask):
  c = dilate(colour, mask); n = dilate(nrm, mask); r = dilate(rough, mask)
  cv2.imwrite(f"{OUT}/{name}_c.png", cv2.cvtColor((np.clip(c, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
  nn = np.where(mask[..., None] > 0, n, np.array([0, 0, 1.0])) if False else n
  cv2.imwrite(f"{OUT}/{name}_n.png", cv2.cvtColor(((nn * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
  cv2.imwrite(f"{OUT}/{name}_r.png", (np.clip(r, 0, 1) * 255).astype(np.uint8))
  print(name, "written", colour.shape, flush=True)

# ---------------- the jacket ----------------
def jacket(size=2048):
  Z = np.load(f"{SRC}/{TAG}_jacket.npz"); names = [str(x) for x in Z["names"]]
  pos, nor, piece, du, dv, mpt = raster(Z, size); m = piece >= 0
  cx, cy, zmin, H, fwd, side, B = frame_of(Z)
  bone = lambda n: B.get("Bip01_" + n, B.get("Bip01 " + n))
  rel = pos - np.array([cx, cy, 0]); fro = rel @ fwd; lat = rel @ side; z = pos[..., 2]
  zN = bone("Neck")[2]; hem = zmin + 0.475 * H
  Hh = np.zeros(m.shape, np.float32); stitch = np.zeros(m.shape, np.float32); seamline = np.zeros(m.shape, np.float32)
  pname = np.array(names)[np.clip(piece, 0, None)]
  main = (pname == "fd2_jacket") & m
  # the fine ripstop: a square grid of slightly thicker threads every 5 mm, and the weave between, in the surface's
  # own two directions (the texture's u and v, which smart projection keeps square)
  u_m = np.cumsum(np.linalg.norm(du, axis=2), axis=1); v_m = np.cumsum(np.linalg.norm(dv, axis=2), axis=0)
  # the cloth's face: Poly Haven's woven polyester (bi_stretch, CC0) at its real size, and a faint ripstop grid
  wh, wr, wc = detail("bi_stretch", pos, nor, 0.25, m)
  grid = (np.abs(np.modf(u_m / 0.006)[0] - 0.5) > 0.46) | (np.abs(np.modf(v_m / 0.006)[0] - 0.5) > 0.46)
  Hh += wh * 0.00022 + grid * 0.00003 + (fbm(pos, 0.0012, 2, 3) - 0.5) * 0.00002
  # seams on the jacket's body: each a line on the surface, found as where a function of the point crosses zero
  def seam(fval, gradlen, sel, width=0.0016, st_off=0.004, along=None):
    nonlocal Hh, stitch, seamline
    d = fval / np.maximum(gradlen, 1e-6); s2 = sel & m
    g = groove(d, width); Hh[s2] += g[s2] * 0.0011
    a = along if along is not None else z
    st = stitches(d, a, st_off); stitch[s2] = np.maximum(stitch[s2], st[s2]); seamline[s2] = np.maximum(seamline[s2], -g[s2])
  torso = (z < zN + 0.02) & (z > hem - 0.02)
  arms = {}
  for S2, sg in (("L", 1), ("R", -1)):
    a, w = bone(f"{S2}_UpperArm"), bone(f"{S2}_Hand"); ax = (w - a) / np.linalg.norm(w - a)
    t = np.clip((pos - a) @ ax / np.linalg.norm(w - a), 0, 1); rad = pos - (a + np.outer(t.ravel(), w - a).reshape(pos.shape)); r = np.linalg.norm(rad, axis=2)
    arms[S2] = (t, r, rad, ax, a, w)
  onarm = {S2: (arms[S2][1] < 0.085) & (arms[S2][0] > 0.12) for S2 in arms}
  body_only = torso & ~onarm["L"] & ~onarm["R"]
  # side seams (the plane through his sides), the yoke across chest and back, the shoulder seams
  seam(fro, 1.0, body_only & (np.abs(lat) > 0.1))
  seam(z - (zN - 0.11), 1.0, body_only, along=lat)
  for S2 in arms:
    t, r, rad, ax, a, w = arms[S2]
    # the armhole: round the arm where it meets the shoulder; the sleeve seam along its underside
    seam(((pos - a) @ ax) - 0.07, 1.0, (r < 0.12) & (np.abs(((pos - a) @ ax) - 0.07) < 0.02), along=np.arctan2(rad @ fwd, rad[..., 2]) * 0.1)
    sg = 1 if S2 == "L" else -1; inner = rad @ (-side * sg)   # (the sleeve's seam runs down its inner side, towards the body)
    seam(rad @ fwd, 1.0, onarm[S2] & (inner > 0) & (np.abs(rad @ fwd) < 0.02), along=t)
  # the edges of the parts lying on the jacket (storm flap, pockets, cuffs, hem band, collar): stitched round 4 mm in
  part = m & ~main
  edge = np.zeros(m.shape, np.float32)
  for k, nm in enumerate(names):
    if nm == "fd2_jacket" or nm in ("fd2_jacket_studs", "fd2_jacket_toggles"): continue
    pm = (piece == k).astype(np.uint8)
    if not pm.any(): continue
    # (distance to the island's edge in texels, then in metres by the texel's size)
    dist = cv2.distanceTransform(pm, cv2.DIST_L2, 5) * np.maximum(np.linalg.norm(du, axis=2), 1e-5)
    on = (np.abs(dist - 0.004) < 0.0006) & (pm > 0)
    along = (pos @ np.array([0.31, 0.53, 0.79]))
    stitch[on] = np.maximum(stitch[on], ((np.modf(along[on] / 0.0035)[0] % 1.0) < 0.62).astype(np.float32))
    edge[pm > 0] = np.maximum(edge[pm > 0], np.clip(1 - dist[pm > 0] / 0.003, 0, 1))
  Hh += stitch * 0.00025 - edge * 0.0003
  # creases where cloth folds: inside the elbows and round the waist (finer than the modelled folds)
  for S2 in arms:
    t, r, rad, ax, a, w = arms[S2]; e = bone(f"{S2}_Forearm"); s = (pos - e) @ ax
    near = (np.abs(s) < 0.1) & (r < 0.1)
    cr = np.sin(s / 0.012 + 3 * fbm(pos, 0.04, 2, 7)) * (1 - np.abs(s) / 0.1)
    Hh[near] += cr[near] * 0.0005
  wz = (z > hem) & (z < hem + 0.12); cr = np.sin((z - hem) / 0.01 + 4 * fbm(pos, 0.05, 2, 9)) * (1 - np.abs(z - hem - 0.06) / 0.06)
  Hh[wz] += cr[wz] * 0.0004
  nrm = normal_from_height(Hh, du, dv, 1.0, m)
  # colour (grey, coloured in the game): the cloth a little uneven; the seams darker in their groove; the stitching a
  # touch lighter; salt in pale tide marks; dirt towards the hem and cuffs; the coating worn paler on edges
  base = 0.82 + (fbm(pos, 0.08, 3, 11) - 0.5) * 0.06 + wc * 0.12
  salt = np.clip((fbm(pos, 0.06, 4, 13) - 0.62) * 6, 0, 1) * np.clip((zN - z) / 0.5, 0.2, 1)
  saltline = np.clip(1 - np.abs(fbm(pos, 0.09, 3, 15) - 0.55) / 0.012, 0, 1) * 0.6
  cuffs = sum(np.clip(1 - (1 - arms[S2][0]) / 0.12, 0, 1) * (arms[S2][1] < 0.09) for S2 in arms)
  dirt = np.clip((hem + 0.12 - z) / 0.12, 0, 1) * 0.5 + cuffs * 0.4
  dirt = dirt * (0.6 + 0.8 * fbm(pos, 0.03, 3, 17))
  L = base * (1 - 0.45 * seamline) * (1 + 0.25 * stitch) * (1 - 0.25 * dirt) + 0.35 * np.maximum(salt * 0.5, saltline * (fbm(pos, 0.02, 2, 19) > 0.45))
  L = L + edge * 0.08
  col = np.dstack([L * 1.0, L * 0.995, L * 0.985]).astype(np.float32)
  # the studs and toggles: dark grey metal and black plastic, not coloured as the cloth
  for k, nm in enumerate(names):
    if nm in ("fd2_jacket_studs", "fd2_jacket_toggles"): col[piece == k] = 0.18
  # coated polyester: matte with a soft sheen (not plastic), rougher where salt has dried and dirt sits, the coating
  # worn a little rougher along edges and seams, the weave's own variation
  worn = np.clip(edge * 0.6 + seamline * 0.5, 0, 1)
  rough = np.clip(0.7 + 0.08 * (fbm(pos, 0.05, 3, 21) - 0.5) + wr * 0.35 + 0.15 * salt + 0.12 * dirt + 0.08 * worn, 0.5, 0.95)
  save(f"{TAG}_jacket", col, nrm, rough, m)

# ---------------- the trousers ----------------
def trousers(size=2048):
  Z = np.load(f"{SRC}/{TAG}_trousers.npz"); names = [str(x) for x in Z["names"]]
  pos, nor, piece, du, dv, mpt = raster(Z, size); m = piece >= 0
  cx, cy, zmin, H, fwd, side, B = frame_of(Z); bone = lambda n: B.get("Bip01_" + n, B.get("Bip01 " + n))
  rel = pos - np.array([cx, cy, 0]); fro = rel @ fwd; lat = rel @ side; z = pos[..., 2]
  th_, tr_, tc_ = detail("terlenka", pos, nor, 0.3, m)
  Hh = (fbm(pos, 0.0015, 2, 31) - 0.5) * 0.00002 + th_ * 0.0002; stitch = np.zeros(m.shape, np.float32); seamline = np.zeros(m.shape, np.float32)
  for S2, sg in (("L", 1), ("R", -1)):
    th, kn = bone(f"{S2}_Thigh"), bone(f"{S2}_Calf"); legc = th + (kn - th) * np.clip((th[2] - z) / (th[2] - kn[2]), 0, 1.6)[..., None]
    q = pos - legc; onleg = (np.abs(lat - (th - np.array([cx, cy, 0])) @ side) < 0.14) & (z < th[2] + 0.05)
    out = q @ (side * sg)   # outward
    d = q @ fwd; g = groove(d, 0.0016)
    sel = onleg & (out > 0)
    Hh[sel] += g[sel] * 0.001; seamline[sel] = np.maximum(seamline[sel], -g[sel])
    st = stitches(d, z, 0.004); stitch[sel] = np.maximum(stitch[sel], st[sel])
    # the knee: an articulation dart, a curved seam across the front of the knee
    kd = (z - kn[2] - 0.04 - 0.03 * np.cos(np.clip(q @ (side * sg), -0.1, 0.1) / 0.1 * 1.4))
    selk = onleg & (d > 0) & (np.abs(z - kn[2]) < 0.12)
    gk = groove(kd, 0.0016); Hh[selk] += gk[selk] * 0.001; seamline[selk] = np.maximum(seamline[selk], -gk[selk])
  edge = np.zeros(m.shape, np.float32)
  for k, nm in enumerate(names):
    if nm == "fd2_trousers": continue
    pm = (piece == k).astype(np.uint8); dist = cv2.distanceTransform(pm, cv2.DIST_L2, 5) * np.maximum(np.linalg.norm(du, axis=2), 1e-5)
    on = (np.abs(dist - 0.004) < 0.0006) & (pm > 0); along = pos @ np.array([0.31, 0.53, 0.79])
    stitch[on] = np.maximum(stitch[on], ((np.modf(along[on] / 0.0035)[0] % 1.0) < 0.62).astype(np.float32)); edge[pm > 0] = np.maximum(edge[pm > 0], np.clip(1 - dist[pm > 0] / 0.003, 0, 1))
  Hh += stitch * 0.00025 - edge * 0.0003
  nrm = normal_from_height(Hh, du, dv, 1.0, m)
  low = np.clip((zmin + 0.42 - z) / 0.25, 0, 1)
  mud = np.clip((fbm(pos, 0.015, 4, 33) - 0.55) * 5, 0, 1) * low
  L = (0.8 + (fbm(pos, 0.1, 3, 35) - 0.5) * 0.06 + tc_ * 0.1) * (1 - 0.45 * seamline) * (1 + 0.2 * stitch) + edge * 0.06
  col = np.dstack([L, L * 0.995, L * 0.985]).astype(np.float32)
  mudc = np.array([0.32, 0.27, 0.2])   # (mud stays mud whatever the trousers' colour: the game's tint takes it down with them)
  col = col * (1 - mud[..., None] * 0.7) + mudc * mud[..., None] * 0.7
  rough = np.clip(0.76 + 0.06 * (fbm(pos, 0.05, 3, 37) - 0.5) + tr_ * 0.3 + 0.18 * mud + 0.05 * seamline, 0.55, 0.97)
  save(f"{TAG}_trousers", col, nrm, rough, m)

# ---------------- the wellies ----------------
def boots(size=1024):
  Z = np.load(f"{SRC}/{TAG}_boots.npz"); names = [str(x) for x in Z["names"]]
  pos, nor, piece, du, dv, mpt = raster(Z, size); m = piece >= 0
  cx, cy, zmin, H, fwd, side, B = frame_of(Z); z = pos[..., 2]
  gh_, gr_, gc_ = detail(os.environ.get("RUBBER", "leather_white"), pos, nor, 0.12, m)
  Hh = (fbm(pos, 0.002, 2, 41) - 0.5) * 0.00002 + gh_ * 0.00008
  # the sole's edge: a moulded line 2.5 cm up, and the tread under it (blocks and grooves across the foot)
  rel = pos - np.array([cx, cy, 0]); fro = rel @ fwd
  sole = z < zmin + 0.025; underside = nor[..., 2] < -0.5
  tread = ((np.modf(fro / 0.011)[0] % 1.0) < 0.55).astype(np.float32) * ((np.modf((rel @ side) / 0.017)[0] % 1.0) < 0.75)
  Hh[underside] += tread[underside] * 0.0015
  ml = groove(z - (zmin + 0.026), 0.0012); Hh += ml * 0.0008
  # moulding lines up the sides of the shaft, and a band of texture round the ankle
  side_line = groove(rel @ fwd, 0.001) * (z > zmin + 0.03); Hh += side_line * 0.0004
  rib = (np.sin(z / 0.0025) * 0.5 + 0.5) * ((z > zmin + 0.035) & (z < zmin + 0.06)); Hh += rib * 0.0003
  nrm = normal_from_height(Hh, du, dv, 1.0, m)
  base = 0.82 + (fbm(pos, 0.05, 3, 43) - 0.5) * 0.05 + gc_ * 0.05
  # (the sole and heel a darker, browner rubber than the boot; the sole's top edge a crisp line)
  L = base * np.where(sole, 0.42, 1.0)
  col = np.dstack([L, L, L]).astype(np.float32)
  # mud: caked on the sole and the foot, splashed up the shaft
  mud = np.clip((zmin + 0.06 - z) / 0.05, 0, 1) * np.clip((fbm(pos, 0.01, 4, 45) - 0.35) * 3, 0, 1)
  spl = np.clip((fbm(pos, 0.006, 3, 47) - 0.72) * 8, 0, 1) * np.clip((zmin + 0.25 - z) / 0.2, 0, 1)
  mm = np.clip(mud + spl * 0.8, 0, 1)
  col = col * (1 - mm[..., None] * 0.8) + np.array([0.3, 0.25, 0.18]) * mm[..., None] * 0.8
  for k, nm in enumerate(names):
    if nm == "fd2_boots_buckles": col[piece == k] = 0.35
  # rubber: satin, a little glossier where it flexes and is rubbed (the ankle, the front of the foot), dull where
  # it has bloomed and where mud has dried, the sole matt
  flex = np.clip(1 - np.abs(z - (zmin + 0.09)) / 0.05, 0, 1) * 0.5
  bloom = np.clip((fbm(pos, 0.04, 3, 51) - 0.5) * 3, 0, 1) * 0.12
  rough = np.clip(0.55 + 0.06 * (fbm(pos, 0.03, 3, 49) - 0.5) + gr_ * 0.2 - 0.1 * flex + bloom + 0.35 * mm + 0.3 * sole, 0.32, 0.96)
  save(f"{TAG}_boots", col, nrm, rough, m)

# ---------------- the beard ----------------
def beard(size=2048):
  Z = np.load(f"{SRC}/{TAG}_beard.npz"); E = Z["E"] if "E" in Z.files else np.ones(len(Z["P"]), np.float32)
  pos, nor, piece, du, dv, mpt = raster(Z, size, E); Et = raster.extra; m = piece >= 0
  names = [str(x) for x in Z["names"]]
  layer = np.zeros(m.shape, np.int8)
  for k, nm in enumerate(names): layer[piece == k] = 2 if nm.startswith("fd2_beard_c") else 1 if nm.startswith("fd2_beard_b") else 0
  S = size; acc = np.zeros((S, S), np.float32); colacc = np.zeros((S, S, 3), np.float32)
  # strands: each grows down the face (the direction of falling z on the surface, turned a little), a dark root and a
  # paler tip; close to the skin they are short and dense, further out longer and fewer; all of them thin to nothing
  # over the beard's last 1.5 cm, so it has no outline
  dens = np.clip(Et / 0.015, 0, 1) ** 1.3
  ys, xs = np.nonzero(m)
  LAY = {0: (0.0018, 0.0045, 1.0), 1: (0.0035, 0.0075, 0.7), 2: (0.0055, 0.011, 0.45)}   # (length range in metres, density)
  per_t = np.maximum(np.linalg.norm(du, axis=2), 1e-6)
  # how many: about 110 strands a square centimetre in the inner layer at full density (a short beard has 100 to 150)
  area = (per_t[ys, xs] ** 2) * 1e4
  want = np.array([LAY[int(l)][2] for l in layer[ys, xs]]) * dens[ys, xs] * area * 110
  pick = np.nonzero(rng.random(len(ys)) < want)[0]
  print("  beard strands", len(pick), flush=True)
  for k in pick:
    y, x = ys[k], xs[k]; a, b = du[y, x], dv[y, x]
    gz = np.array([a[2], b[2]])
    if np.linalg.norm(gz) < 1e-9: continue
    d = -gz / np.linalg.norm(gz); d = d + rng.normal(0, 0.3, 2); d /= np.linalg.norm(d)
    lo, hi, _ = LAY[int(layer[y, x])]; per = max(np.linalg.norm(a), 1e-5)
    ln = rng.uniform(lo, hi) * (0.55 + 0.45 * dens[y, x]) / per
    xm, ym = x + d[0] * ln * 0.5, y + d[1] * ln * 0.5; x2, y2 = x + d[0] * ln + rng.normal(0, 0.6), y + d[1] * ln + rng.normal(0, 0.6)
    g = rng.random(); tip = 0.72 if g < 0.85 else 0.95   # (one strand in seven grey)
    root = 0.38 if tip < 0.9 else 0.8
    for (p0, p1, c) in (((x, y), (xm, ym), root), ((xm, ym), (x2, y2), tip)):
      cv2.line(acc, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), 1.0, 1, cv2.LINE_AA)
      cv2.line(colacc, (int(p0[0]), int(p0[1])), (int(p1[0]), int(p1[1])), (c, c, c), 1, cv2.LINE_AA)
  alpha = np.clip(acc * 1.5, 0, 1) * m * np.clip(dens * 1.4, 0, 1)
  col = np.where(acc[..., None] > 0, colacc / np.maximum(acc[..., None], 1e-3), np.array([0.5, 0.5, 0.5])).astype(np.float32)
  Hh = cv2.GaussianBlur(acc, (0, 0), 0.7) * 0.0003
  nrm = normal_from_height(Hh, du, dv, 1.0, m)
  c = dilate(col, m); n2 = dilate(nrm, m)
  cv2.imwrite(f"{OUT}/{TAG}_beard_c.png", cv2.cvtColor(np.dstack([np.clip(c, 0, 1) ** (1 / 2.2), alpha]).__mul__(255).astype(np.uint8), cv2.COLOR_RGBA2BGRA))
  cv2.imwrite(f"{OUT}/{TAG}_beard_n.png", cv2.cvtColor(((n2 * 0.5 + 0.5) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
  print("beard written", flush=True)

# ---------------- the head's skin ----------------
def head(size=2048):
  """The person's own head textures (from their file) with: the stubble's shadow drawn under and round the beard, a
  roughness map (oilier over the forehead and nose, the lips smoother, the cheeks drier, the beard's skin dull, the
  eyes wet) and fine pores and lines added to the normal map at their real size."""
  Z = np.load(f"{SRC}/{TAG}_head.npz"); pos, nor, piece, du, dv, mpt = raster(Z, size, Z["W"]); W = raster.extra; m = piece >= 0
  cx, cy, zmin, H, fwd, side, B = frame_of(Z); bone = lambda n: B.get("Bip01_" + n, B.get("Bip01 " + n))
  src_c = cv2.cvtColor(cv2.imread(f"{SRC}/{TAG}_headsrc_c.jpg"), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
  src_n = cv2.cvtColor(cv2.imread(f"{SRC}/{TAG}_headsrc_n.jpg"), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
  if src_c.shape[0] != size: src_c = cv2.resize(src_c, (size, size), interpolation=cv2.INTER_AREA)
  if src_n.shape[0] != size: src_n = cv2.resize(src_n, (size, size), interpolation=cv2.INTER_CUBIC if src_n.shape[0] < size else cv2.INTER_AREA)
  hd = bone("Head"); q = pos - hd; f = q @ fwd; z = pos[..., 2]
  nose = bone("MNose") if bone("MNose") is not None else hd + fwd * 0.1
  mouth = Z["mouth"]; mc, hw = mouth[:3], float(mouth[3])
  eyes = [np.array(e) for e in Z["eyes"]]
  # -- colour: the skin under a beard is darker and greyer, with the hairs' roots showing as fine dots, fading out
  # past its edge (on the skin, the beard has no hard line either)
  lin = src_c ** 2.2
  Wc = np.clip(W, 0, 1)
  roots = (fbm(pos, 0.0006, 2, 61) > 0.58).astype(np.float32) * Wc
  shadow = Wc * (0.32 + 0.18 * fbm(pos, 0.01, 2, 63))
  grey = np.array([0.055, 0.05, 0.048])
  out = lin * (1 - shadow[..., None]) + grey * (shadow[..., None] * 0.6) 
  out = out * (1 - roots[..., None] * 0.35)
  out = np.where(m[..., None], out, lin)
  # -- roughness
  front = f > 0.0
  tzone = np.clip(1 - np.abs(q @ side) / 0.025, 0, 1) * (z > nose[2] - 0.01) * front + np.clip(1 - np.abs(z - (hd[2] + 0.09)) / 0.04, 0, 1) * front * np.clip(1 - np.abs(q @ side) / 0.06, 0, 1)
  lips = np.clip(1 - (((pos - mc) @ side / (hw * 1.05)) ** 2 + ((pos[..., 2] - mc[2]) / 0.011) ** 2), 0, 1)
  rough = 0.57 + 0.05 * (fbm(pos, 0.01, 3, 65) - 0.5) - 0.12 * np.clip(tzone, 0, 1) - 0.12 * lips + 0.12 * Wc
  for e in eyes:
    de = np.linalg.norm(pos - e, axis=2); rough = np.where((de < 0.0135) & front, 0.08, rough)
  rough = np.clip(rough, 0.05, 0.9)
  # -- finer skin: pores (small pits, more on the nose and cheeks), faint lines; added to the head's own normals
  cheek = np.clip(1 - np.abs(z - (nose[2] + 0.005)) / 0.04, 0, 1) * front
  pores = np.clip((fbm(pos, 0.00045, 2, 67) - 0.6) * 4, 0, 1) * (0.5 + 0.5 * np.clip(cheek + tzone, 0, 1))
  lines = (fbm(pos, 0.003, 3, 69) - 0.5)
  Hh = -pores * 0.00004 + lines * 0.00002
  dn = normal_from_height(Hh, du, dv, 1.0, m)
  n0 = src_n * 2 - 1
  nb = np.dstack([n0[..., 0] + dn[..., 0], n0[..., 1] + dn[..., 1], n0[..., 2] * dn[..., 2]])
  nb = nb / (np.linalg.norm(nb, axis=2, keepdims=True) + 1e-9); nb = np.where(m[..., None], nb, n0)
  cv2.imwrite(f"{OUT}/{TAG}_head_c.png", cv2.cvtColor((np.clip(out, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
  cv2.imwrite(f"{OUT}/{TAG}_head_n.png", cv2.cvtColor(((nb * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
  cv2.imwrite(f"{OUT}/{TAG}_head_r.png", (dilate(rough.astype(np.float32), m, 6) * 255).clip(0, 255).astype(np.uint8))
  print("head written", flush=True)

for fn in sys.argv[4:] or ["jacket", "trousers", "boots", "beard", "head"]:
  globals()[fn]()
