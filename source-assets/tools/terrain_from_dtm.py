# terrain_from_dtm.py: a place's ground from the Environment Agency's LIDAR survey (the Composite DTM's GeoTIFF, British
# National Grid metres), for src/lib/world3d/terrain3d.js. The environment system's one route from a survey to the game,
# the same for every place (Whitby's was made by hand with these steps on 18 November 2026).
#
#   python3 terrain_from_dtm.py <dtm.tif> <lat> <lon> <name> [--half 640] [--step 5] [--floor F]
#                               [--relief x0 z0 nx nz] [--out DIR]
#
# Writes DIR/terrain_<name>.json (and the same bytes raw, DIR/terrain_<name>_5m.bin): the 5 m grid for TERRAIN[name] (each height the mean of the survey's 1 m cells in its
# step-wide box, centimetres, each row's first height then the changes as zigzag varints, base64: enc "dv16"); with
# --relief, DIR/terrain_<name>_1m.bin: the survey's 1 m heights over that rectangle (x0, z0 its first point in the
# place's metres, x east and z south of the mark; nx by nz points) minus the 5 m terrain's own there (as the game works
# it out: Catmull-Rom over the grid, the floor and below left flat), in 2 cm steps, coded the same way, for RELIEF[name].
# Without --floor, the floor is the land's usual level: the 30th percentile of the survey's land within 150 m of the
# mark (heights above 0.5 m OD). The place's metres map to the grid by an affine fitted to exact conversions (bng.py,
# the Ordnance Survey's published method) at 81 points over the square: within a centimetre over 1.3 km.
import sys, os, json, math, base64, argparse
import numpy as np, tifffile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bng import osgb_to_en, wgs_to_osgb
def to_bng(lat, lon): return osgb_to_en(*wgs_to_osgb(lat, lon))

ap = argparse.ArgumentParser()
ap.add_argument("dtm"); ap.add_argument("lat", type=float); ap.add_argument("lon", type=float); ap.add_argument("name")
ap.add_argument("--half", type=float, default=640); ap.add_argument("--step", type=float, default=5); ap.add_argument("--floor", type=float)
ap.add_argument("--relief", type=float, nargs=4); ap.add_argument("--out", default=".")
a = ap.parse_args()

# ---- the survey ----
with tifffile.TiffFile(a.dtm) as t:
  pg = t.pages[0]; D = pg.asarray().astype("float64"); tags = {tg.name: tg.value for tg in pg.tags.values()}
if "ModelTransformationTag" in tags: tr = tags["ModelTransformationTag"]; E0, N0, dx, dy = tr[3], tr[7], tr[0], -tr[5]
else: tp, sc = tags["ModelTiepointTag"], tags["ModelPixelScaleTag"]; E0, N0, dx, dy = tp[3], tp[4], sc[0], sc[1]
D[(D < -50) | (D > 2000) | ~np.isfinite(D)] = np.nan

# ---- the place's metres to the grid's: an affine fitted to exact conversions ----
R = 111320.0; k = math.cos(math.radians(a.lat)) * R
pts = [(x, z) for x in np.linspace(-a.half, a.half, 9) for z in np.linspace(-a.half, a.half, 9)]
X = np.array([[x, z, 1] for x, z in pts]); EN = np.array([to_bng(a.lat - z / R, a.lon + x / k) for x, z in pts])
M, *_ = np.linalg.lstsq(X, EN, rcond=None); err = np.abs(X @ M - EN).max()
def px(x, z):
  E = M[0, 0] * x + M[1, 0] * z + M[2, 0]; N = M[0, 1] * x + M[1, 1] * z + M[2, 1]
  return (E - E0) / dx - 0.5, (N0 - N) / dy - 0.5
def bilinear(x, z):
  u, v = px(np.asarray(x, float), np.asarray(z, float)); i = np.floor(u).astype(int); j = np.floor(v).astype(int); fu, fv = u - i, v - j
  H, W = D.shape; ok = (i >= 0) & (j >= 0) & (i < W - 1) & (j < H - 1); i = np.clip(i, 0, W - 2); j = np.clip(j, 0, H - 2)
  h = D[j, i] * (1 - fu) * (1 - fv) + D[j, i + 1] * fu * (1 - fv) + D[j + 1, i] * (1 - fu) * fv + D[j + 1, i + 1] * fu * fv
  return np.where(ok, h, np.nan)

# ---- the 5 m grid: each height the mean of the 1 m cells round it ----
n = int(round(2 * a.half / a.step)) + 1; r = max(1, int(round(a.step / dx / 2)))
H5 = np.zeros((n, n)); miss = 0
for j in range(n):
  for i in range(n):
    u, v = px(-a.half + i * a.step, -a.half + j * a.step); u, v = int(round(u)), int(round(v))
    w = D[max(0, v - r):v + r + 1, max(0, u - r):u + r + 1]
    h = np.nanmean(w) if w.size and np.isfinite(w).any() else np.nan
    if not np.isfinite(h): miss += 1
    H5[j, i] = h
H5 = np.where(np.isfinite(H5), H5, 0.0) # (beyond the survey, the sea: at datum)
if a.floor is None:
  g = np.linspace(-150, 150, 61); xs, zs = np.meshgrid(g, g); hs = bilinear(xs.ravel(), zs.ravel()); hs = hs[np.isfinite(hs) & (hs > 0.5)]
  a.floor = round(float(np.percentile(hs, 30)), 1) if hs.size else 3.0
def code(rows):
  out = bytearray()
  for row in rows:
    prev = 0
    for v in row:
      d = int(v - prev); prev = int(v); z = 2 * d if d >= 0 else -2 * d - 1
      while True:
        b = z & 127; z >>= 7
        if z: out.append(b | 128)
        else: out.append(b); break
  return bytes(out)
cm = np.clip(np.round(H5 * 100), -100000, 1000000).astype(np.int64)
data = base64.b64encode(code(cm)).decode()
os.makedirs(a.out, exist_ok=True)
json.dump({"step": a.step, "n": n, "half": a.half, "floor": a.floor, "enc": "dv16", "data": data}, open(f"{a.out}/terrain_{a.name}.json", "w"))
open(f"{a.out}/terrain_{a.name}_5m.bin", "wb").write(code(cm)) # (the same bytes raw, for a TERRAIN entry with file: public/textures/)
print(f"terrain {a.name}: {n}x{n} every {a.step} m, floor {a.floor} m OD, highest {H5.max():.1f} m, {miss} beyond the survey, {len(data)} characters (affine within {err:.3f} m)")

# ---- the 1 m relief: the survey less the 5 m terrain as the game draws it ----
if a.relief:
  x0, z0, nx, nz = a.relief; nx, nz = int(nx), int(nz)
  def cr(p0, p1, p2, p3, t): return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  xs = x0 + np.arange(nx); zs = z0 + np.arange(nz); XX, ZZ = np.meshgrid(xs, zs)
  U = np.clip((XX + a.half) / a.step, 0, n - 1.001); V = np.clip((ZZ + a.half) / a.step, 0, n - 1.001); I = np.floor(U).astype(int); J = np.floor(V).astype(int); fa, fb = U - I, V - J
  at = lambda ii, jj: H5[np.clip(jj, 0, n - 1), np.clip(ii, 0, n - 1)]
  row = lambda jj: cr(at(I - 1, jj), at(I, jj), at(I + 1, jj), at(I + 2, jj), fa)
  T5 = np.maximum(a.floor, cr(row(J - 1), row(J), row(J + 1), row(J + 2), fb))
  H1 = bilinear(XX.ravel(), ZZ.ravel()).reshape(XX.shape)
  Dr = np.where(np.isfinite(H1), H1 - T5, 0.0)
  Dr = np.maximum(Dr, -0.5) # (low ground below the floor: a hollow of half a metre at most, the floor stands for the rest)
  q = np.clip(np.round(Dr / 0.02), -30000, 30000).astype(np.int64)
  open(f"{a.out}/terrain_{a.name}_1m.bin", "wb").write(code(q))
  print(f"relief {a.name}: {{ file: \"terrain_{a.name}_1m.bin\", x0: {int(x0)}, z0: {int(z0)}, nx: {nx}, nz: {nz}, q: 0.02 }}, {os.path.getsize(f'{a.out}/terrain_{a.name}_1m.bin')} bytes, residual {np.percentile(np.abs(Dr), 50):.2f} m median, {np.abs(Dr).max():.1f} m at most")
