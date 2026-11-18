# FishDock people v2, stage 1, job A: the main male angler's fishing clothes, modelled in Blender on his own body
# (the Rocketbox man with short hair, m05, MIT licence) so every walk, move and grip on the shared skeleton fits.
# Made from the body's own surface, as a tailor's block is cut from a body, then made into clothes:
#  - a waterproof jacket to the upper thigh: cut loose of the body (more at the waist and hem, less on the shoulders),
#    a stand-up collar with the hood rolled down behind it, a storm flap down the front over the zip, two chest
#    pockets and two hand-warmer pockets with flaps, cuffs with a tab, a hem band; folds where cloth bunches (inside
#    the elbows, at the armpits, round the waist above the hem)
#  - waterproof over-trousers: loose, folds at the knees and bunched where they go into the boots, a cargo pocket
#  - knee-high wellington boots: a shaft wide round the calf, a top band, a strap and buckle at the side, a thick sole
#    and heel
#  - a short beard, as a shell of hair over the jaw, chin, cheeks and upper lip
# Each a separate mesh with the body's bone weights (copied from the nearest point of the body), unwrapped for its own
# textures (made from these meshes outside Blender: people2/textures.py), saved as a .blend, with each garment's
# surface written out for the textures (positions, normals, uvs, triangles, which part each point belongs to) and
# grey renders from the front, side and back.
import bpy, bmesh, os, math, json, traceback
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

OUT = "C:/Users/aaron/Documents/FishDock-assets"
WHO = globals().get("WHO", "m05")
SRC = f"{OUT}/source/people/{WHO}_hd.glb"
TAG = globals().get("TAG", "p2a"); SUBDIV = globals().get("SUBDIV", True); BEARD = globals().get("BEARD", True)
DST = f"{OUT}/people2"; os.makedirs(DST, exist_ok=True); os.makedirs(f"{OUT}/renders/people2", exist_ok=True)
log = []
def L(*a):
  log.append(" ".join(map(str, a))); print(*a, flush=True)

def kind_of(name):
  n = name.replace("Bip01_", "").replace("Bip01 ", "")
  if "Hand" in n or "Finger" in n: return "hand"
  if "Forearm" in n: return "forearm"
  if "UpperArm" in n: return "upperarm"
  if "Clavicle" in n or "Spine" in n or "Pelvis" in n: return "torso"
  if "Neck" in n: return "neck"
  if "Thigh" in n: return "thigh"
  if "Calf" in n: return "calf"
  if "Foot" in n or "Toe" in n: return "foot"
  if n in ("Bip01", ""): return "torso"
  return "head"

try:
  for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
  bpy.ops.import_scene.gltf(filepath=SRC)
  meshes = [o for o in bpy.data.objects if o.type == "MESH"]
  body = max(meshes, key=lambda o: len(o.data.vertices))
  # (the armature that moves the body, not just the first one in the file)
  arm = next((m.object for m in body.modifiers if m.type == "ARMATURE" and m.object), None) or (body.parent if body.parent and body.parent.type == "ARMATURE" else None) or next(o for o in bpy.data.objects if o.type == "ARMATURE")
  L("meshes", [(o.name, len(o.data.vertices), [m.name for m in o.data.materials]) for o in meshes])
  mw_obj = body.matrix_world.copy(); mw = mw_obj; mwi = mw.inverted(); S = mw.to_scale().x
  # (the importer's bone-shape sphere and anything else that isn't him: gone)
  for o in meshes:
    if o is not body: bpy.data.objects.remove(o, do_unlink=True)
  # the body made smooth before anything is cut from it: the points the file splits along its texture seams joined
  # (so nothing opens along them), then one level of Catmull-Clark subdivision under the skeleton, so the head, the
  # hands and every garment cut from him are round rather than faceted (about 5,000 points to about 20,000)
  bm0 = bmesh.new(); bm0.from_mesh(body.data); n0 = len(bm0.verts)
  bmesh.ops.remove_doubles(bm0, verts=bm0.verts[:], dist=0.00005 / S); bm0.to_mesh(body.data); L("seam points joined", n0 - len(bm0.verts)); bm0.free()
  if SUBDIV:
    bpy.ops.object.select_all(action="DESELECT"); body.select_set(True); bpy.context.view_layer.objects.active = body
    sm = body.modifiers.new("smooth", "SUBSURF"); sm.levels = 1; sm.render_levels = 1; sm.uv_smooth = "PRESERVE_BOUNDARIES"
    bpy.ops.object.modifier_move_to_index(modifier="smooth", index=0); bpy.ops.object.modifier_apply(modifier="smooth")
    for poly in body.data.polygons: poly.use_smooth = True
    L("body subdivided", len(body.data.vertices), "points", sum(len(p.vertices) - 2 for p in body.data.polygons), "triangles")
  # the body as it stands (rest pose), in metres, Blender's z up
  dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); em = ev.to_mesh()
  P = np.array([tuple(ev.matrix_world @ v.co) for v in em.vertices]); N0 = np.array([tuple((ev.matrix_world.to_3x3() @ v.normal).normalized()) for v in em.vertices])
  ev.to_mesh_clear()
  # The mesh's own numbers are at another scale and place than the body as it stands (posed by the skeleton): every
  # garment is cut and shaped in the mesh's own numbers (so the skeleton moves it as it moves the body), and measured in
  # metres where he stands through one fitted transform from the one to the other (checked: the fit is to a millimetre
  # or so when the pose is the bind pose)
  Q = np.array([tuple(mw_obj @ v.co) for v in body.data.vertices]); Qh = np.c_[Q, np.ones(len(Q))]
  A = np.linalg.lstsq(Qh, P, rcond=None)[0]; res = np.linalg.norm(Qh @ A - P, axis=1)
  L("mesh to standing fit: rms", round(float(np.sqrt((res ** 2).mean())), 4), "m, worst", round(float(res.max()), 4), "m")
  Am = Matrix(((A[0, 0], A[1, 0], A[2, 0], A[3, 0]), (A[0, 1], A[1, 1], A[2, 1], A[3, 1]), (A[0, 2], A[1, 2], A[2, 2], A[3, 2]), (0, 0, 0, 1)))
  mw = Am @ mw_obj; mwi = mw.inverted(); S = abs(mw.to_3x3().determinant()) ** (1 / 3)
  L("metres per mesh unit", round(S, 6))
  zmin, zmax = P[:, 2].min(), P[:, 2].max(); H = zmax - zmin
  L("height", round(H, 3), "scale", round(S, 5), "x", P[:, 0].min().round(3), P[:, 0].max().round(3), "y", P[:, 1].min().round(3), P[:, 1].max().round(3))
  # the bones' heads in the same frame
  # the joints where the body stands: the posed bones (the mesh above is posed too), checked against where the bone
  # weights say each joint is (the points two neighbouring bones share); when the bones don't fit the mesh, the
  # weights win
  gname = {g.index: g.name for g in body.vertex_groups}
  bh = {pb.name: np.array(tuple(arm.matrix_world @ pb.head)) for pb in arm.pose.bones}
  Wg = {}
  for v in body.data.vertices:
    for g in v.groups:
      n = gname.get(g.group)
      if n: Wg.setdefault(n, {})[v.index] = g.weight
  par = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
  bw_j = {}
  for n in par:
    a = Wg.get(n, {}); pa = Wg.get(par[n], {}) if par[n] else {}
    both = [i for i, w in a.items() if w > 0.2 and pa.get(i, 0) > 0.2]
    if len(both) >= 4: bw_j[n] = P[both].mean(0)
    else:
      strong = [i for i, w in a.items() if w > 0.5]
      if strong: bw_j[n] = P[strong].mean(0)
  common = [n for n in bw_j if n in bh]
  dev = np.median([np.linalg.norm(bh[n] - bw_j[n]) for n in common]) if common else 9
  L("joints: posed bones against weights, median gap", round(float(dev), 3), "m over", len(common))
  if dev > 0.06:
    for n, p in bw_j.items(): bh[n] = p
    L("joints from the weights")
  def bone(n):
    for k in (f"Bip01_{n}", f"Bip01 {n}"):
      if k in bh: return bh[k]
    raise KeyError(n)
  # which way the body faces (front): from the pelvis to the toes' tips, level
  toe = (bone("L_Toe0") + bone("R_Toe0")) / 2; pel = bone("Pelvis"); fwd = np.array([toe[0] - pel[0], toe[1] - pel[1], 0.0]); fwd /= np.linalg.norm(fwd)
  side = np.cross(np.array([0, 0, 1.0]), fwd); side /= np.linalg.norm(side)  # (to the body's left)
  L("front", fwd.round(3), "left", side.round(3))
  cx, cy = pel[0], pel[1]
  def lat(p): return (p - np.array([cx, cy, 0])) @ side      # + to his left
  def fro(p): return (p - np.array([cx, cy, 0])) @ fwd       # + in front
  kinds, wk = [], []
  for v in body.data.vertices:
    acc = {}
    for g in v.groups: k = kind_of(gname.get(g.group, "")); acc[k] = acc.get(k, 0) + g.weight
    t = sum(acc.values()) or 1; kinds.append(max(acc, key=acc.get) if acc else "head"); wk.append({k: a / t for k, a in acc.items()})
  h = (P[:, 2] - zmin) / H
  body_slot = {i for i, m in enumerate(body.data.materials) if m and "body" in m.name.lower()}
  head_slot = {i for i, m in enumerate(body.data.materials) if m and "head" in m.name.lower()}
  # levels, as shares of his height
  neckZ = (bone("Neck")[2] - zmin) / H; wristL = bone("L_Hand"); wristR = bone("R_Hand")
  HEM, BOOT, KNEE = 0.475, (bone("L_Calf")[2] - zmin) / H * 0.62 + 0.0, (bone("L_Calf")[2] - zmin) / H
  BOOT = max(BOOT, 0.27); L("levels hem", HEM, "neck", round(neckZ, 3), "knee", round(KNEE, 3), "boot top", round(BOOT, 3))
  kd = KDTree(len(P))
  for i, p in enumerate(P): kd.insert(Vector(p), i)
  kd.balance()

  # ---- a garment from the body: faces whose corners are mostly in its region, pushed out and smoothed into cloth ----
  def from_body(name, region, slots):
    ob = body.copy(); ob.data = body.data.copy(); ob.name = name; bpy.context.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    keep = {f.index for f in bm.faces if f.material_index in slots and sum(region(v.index) for v in f.verts) * 2 > len(f.verts)}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    return ob, bm
  def world(bm_v): return np.array(tuple(mw @ bm_v.co))
  def cut_level(bm, level, keep_below):
    # cut along a level line (world z), the part above or below removed
    zc = zmin + level * H; co = mwi @ Vector((0, 0, zc)); no = (mwi.to_3x3() @ Vector((0, 0, 1))).normalized()
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=keep_below, clear_inner=not keep_below)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
  def cut_plane(bm, co_w, no_w, keep_neg):
    co = mwi @ Vector(co_w); no = (mwi.to_3x3() @ Vector(no_w)).normalized()
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=keep_neg, clear_inner=not keep_neg)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
  def inflate(bm, off_fn, smooth_n, hold_boundary=True):
    # out from the body by off_fn(world point) metres, then smoothed so it no longer follows every muscle, never
    # closer to the body than its own distance
    bm.normal_update()
    orig = {v.index: (v.co.copy(), v.normal.copy(), off_fn(world(v)) / S) for v in bm.verts}
    for v in bm.verts: v.co += v.normal * orig[v.index][2]
    inner = [v for v in bm.verts if not (hold_boundary and v.is_boundary)]
    for _ in range(smooth_n):
      bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
      for v in inner:
        o, n, off = orig[v.index]; d = (v.co - o).dot(n)
        if d < off: v.co += n * (off - d)
    bm.normal_update()
  def thicken_edges(bm, depth):
    bnd = [e for e in bm.edges if e.is_boundary]
    if not bnd: return
    ret = bmesh.ops.extrude_edge_only(bm, edges=bnd)
    for v in [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]:
      n = v.normal if v.normal.length > 0 else Vector((0, 0, 1)); v.co -= n * (depth / S)
    bm.normal_update()
  def subdivide(bm, cuts=1):
    # (no bulge along the normals: on the thin slivers a cut leaves those threw long spikes; one gentle smoothing instead)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True, smooth=0.0)
    bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
  # ---- a part cut from a garment by planes (clean straight edges), the faces left kept only where keep(centre,
  # normal) says, lifted off the garment and given a thickness ----
  def cut_part(src, name, planes, keep, lift, thick):
    ob = src.copy(); ob.data = src.data.copy(); ob.name = name; bpy.context.collection.objects.link(ob)
    bm2 = bmesh.new(); bm2.from_mesh(ob.data)
    for co_w, no_w in planes: cut_plane(bm2, tuple(co_w), tuple(no_w), keep_neg=True)
    bm2.normal_update()
    bad = [f for f in bm2.faces if not keep(np.array(tuple(mw @ f.calc_center_median())), np.array(tuple((mw.to_3x3() @ f.normal).normalized())))]
    bmesh.ops.delete(bm2, geom=bad, context="FACES"); bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context="VERTS")
    if not bm2.faces: L("  part", name, "empty"); bm2.free(); bpy.data.objects.remove(ob); return None
    bm2.normal_update()
    for v in bm2.verts: v.co += v.normal * (lift / S)
    bmesh.ops.solidify(bm2, geom=bm2.faces[:], thickness=-thick / S); bm2.normal_update(); bm2.to_mesh(ob.data); bm2.free(); return ob
  def slab(axis, lo, hi, at=None):
    # two planes keeping what lies between lo and hi along axis (measured from at, the pelvis's foot by default)
    o = np.array([cx, cy, 0.0]) if at is None else at; axis = np.asarray(axis, float)
    return [(o + axis * hi, axis), (o + axis * lo, -axis)]
  def displace(bm, fn):
    # along the normal by fn(world point, world normal) metres (folds)
    bm.normal_update(); mv = []
    for v in bm.verts:
      p = world(v); n = np.array(tuple((mw.to_3x3() @ v.normal).normalized())); d = fn(p, n)
      if d: mv.append((v, v.normal.copy() * (d / S)))
    for v, dv in mv: v.co += dv
    bm.normal_update()
  def seg_param(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1); return t, np.linalg.norm(p - (a + ab * t))

  # (fold patterns: rings of soft ridges round a limb near a joint, broken by noise so no two are alike)
  rng = np.random.default_rng(11)
  PH = rng.uniform(0, 6.28, 64)
  def ridges(s, lam, k=0.0):
    return np.sin(2 * math.pi * s / lam + PH[int(k) % 64] + 0.8 * math.sin(s * 23.0 + k)) * (0.6 + 0.4 * math.sin(s * 7.3 + 2 * k))

  sh = {S2: bone(f"{S2}_UpperArm") for S2 in ("L", "R")}; el = {S2: bone(f"{S2}_Forearm") for S2 in ("L", "R")}; wr = {S2: bone(f"{S2}_Hand") for S2 in ("L", "R")}
  th = {S2: bone(f"{S2}_Thigh") for S2 in ("L", "R")}; kn = {S2: bone(f"{S2}_Calf") for S2 in ("L", "R")}; an = {S2: bone(f"{S2}_Foot") for S2 in ("L", "R")}
  made = {}

  # ======== the jacket ========
  def jacket_region(i):
    k = kinds[i]
    if k in ("hand", "head") or wk[i].get("hand", 0) > 0.15 or wk[i].get("head", 0) > 0.3: return False
    if k in ("upperarm", "forearm"): return True
    return HEM - 0.04 <= h[i] <= neckZ + 0.03 and k not in ("calf", "foot")   # (the tops of the thighs too: the hem is cut below the seat)
  jk, bm = from_body("fd2_jacket", jacket_region, body_slot)
  nk0 = bone("Neck")
  def jk_cuts(bm):
    # (cut once the cloth has its shape: cut first, the thin slivers a cut leaves at the body's edge were pushed out
    # along their own wild normals into spikes)
    cut_level(bm, HEM, keep_below=False)
    # the neckline: one clean cut round the neck, lower at the front
    tilt = 0.32; nno = np.array([0, 0, 1.0]) * math.cos(tilt) + fwd * math.sin(tilt)
    cut_plane(bm, tuple(np.array([nk0[0], nk0[1], zmin + (neckZ + 0.012) * H])), tuple(nno), keep_neg=True)
    # the sleeves end 3 cm short of the wrist joint, square to the forearm
    for S2 in ("L", "R"):
      a = el[S2]; b = wr[S2]; d = (b - a) / np.linalg.norm(b - a); cut_plane(bm, tuple(b - d * 0.03), tuple(d), keep_neg=True)
  def jk_off(p):
    z = (p[2] - zmin) / H; o = 0.016
    # (looser at the waist and hem, a little standing off the hips; close over the shoulders: a shell, not a puffer)
    if z < HEM + 0.08: o += 0.012 * (1 - (z - HEM) / 0.08)
    if z > neckZ - 0.06: o -= 0.005
    for S2 in ("L", "R"):
      t, d = seg_param(p, sh[S2], wr[S2])
      if d < 0.09: o = 0.014 + 0.007 * t   # (the sleeve: wider towards the cuff)
    return o
  inflate(bm, jk_off, 16)
  subdivide(bm)
  def jk_folds(p, n):
    z = (p[2] - zmin) / H; d = 0.0
    for k2, S2 in enumerate(("L", "R")):
      # inside the elbow: rings of folds over 12 cm either side, strongest on the inside of the bend
      a, e, w = sh[S2], el[S2], wr[S2]; ax = (w - a) / np.linalg.norm(w - a)
      s = (p - e) @ ax; t, r = seg_param(p, a, w)
      if r < 0.1 and abs(s) < 0.13:
        rad = (p - e) - ax * s; rad = rad / (np.linalg.norm(rad) or 1); inside = max(0.0, rad @ fwd)   # (the inside of the bend faces forward as the arms hang)
        d += 0.0045 * (1 - abs(s) / 0.13) * ridges(s, 0.045, 3 + k2) * (0.5 + 0.5 * inside)
      # the armpit: folds fanning down from it
      ap = sh[S2] - np.array([0, 0, 0.08])
      dd = np.linalg.norm(p - ap)
      if dd < 0.12: d += 0.003 * (1 - dd / 0.12) * ridges(math.atan2(p[2] - ap[2], (p - ap) @ fwd) * 0.08, 0.03, 9 + k2)
    # round the waist above the hem: horizontal folds, deeper at the sides and back
    if HEM + 0.01 < z < HEM + 0.12:
      ang = math.atan2(lat(p), fro(p)); sideish = abs(math.sin(ang))
      d += 0.0035 * (1 - abs(z - HEM - 0.06) / 0.06) * ridges(p[2] + 0.02 * math.sin(ang * 3), 0.05, 17) * (0.5 + 0.5 * sideish)
    return d
  displace(bm, jk_folds)
  jk_cuts(bm)
  thicken_edges(bm, 0.006)
  bm.to_mesh(jk.data); bm.free(); made["jacket"] = jk
  L("jacket", len(jk.data.vertices), "verts", len(jk.data.polygons), "faces")

  # ---- the collar, the rolled hood, the storm flap, the pockets, the cuffs and the hem band: parts on the jacket ----
  jP = np.array([tuple(mw @ v.co) for v in jk.data.vertices])
  def jk_part(name, select, lift, thick):
    # the jacket's faces chosen by select(world centre, world normal), lifted off it and given a thickness
    ob = jk.copy(); ob.data = jk.data.copy(); ob.name = name; bpy.context.collection.objects.link(ob)
    bm2 = bmesh.new(); bm2.from_mesh(ob.data); bm2.normal_update()
    keep = set(f for f in bm2.faces if select(np.array(tuple(mw @ f.calc_center_median())), np.array(tuple((mw.to_3x3() @ f.normal).normalized()))))
    if not keep:
      bm2.faces.ensure_lookup_table(); f0 = bm2.faces[len(bm2.faces) // 2] if len(bm2.faces) else None
      L("  part", name, "nothing chosen of", len(bm2.faces), "faces; a face at", None if f0 is None else np.array(tuple(mw @ f0.calc_center_median())).round(3), "normal", None if f0 is None else np.array(tuple((mw.to_3x3() @ f0.normal).normalized())).round(2))
    bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f not in keep], context="FACES")
    bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context="VERTS")
    if not bm2.faces: bm2.free(); bpy.data.objects.remove(ob); return None
    bm2.normal_update()
    for v in bm2.verts: v.co += v.normal * (lift / S)
    ret = bmesh.ops.solidify(bm2, geom=bm2.faces[:], thickness=-thick / S)
    bm2.normal_update(); bm2.to_mesh(ob.data); bm2.free(); return ob
  front_mid = lambda c: abs(lat(c))
  zN = zmin + neckZ * H
  parts = {}
  UP = np.array([0, 0, 1.0])
  nkc = np.array([nk0[0], nk0[1], 0.0])
  parts["flap"] = cut_part(jk, "fd2_jacket_flap", slab(side, -0.03, 0.03, nkc) + slab(UP, zmin + (HEM + 0.004) * H, zN - 0.035), lambda c, n: fro(c) > 0 and n @ fwd > 0.3, 0.004, 0.003)
  for S2, sg in (("L", 1), ("R", -1)):
    parts["chest_" + S2] = cut_part(jk, f"fd2_jacket_pocket_chest_{S2}", slab(side * sg, 0.055, 0.165) + slab(UP, zN - 0.235, zN - 0.13), lambda c, n: n @ fwd > 0.35, 0.0035, 0.0025)
    parts["low_" + S2] = cut_part(jk, f"fd2_jacket_pocket_low_{S2}", slab(side * sg, 0.07, 0.185) + slab(UP, zmin + (HEM + 0.03) * H, zmin + (HEM + 0.1) * H), lambda c, n: n @ fwd > 0.15, 0.003, 0.0025)
  for S2 in ("L", "R"):
    a, w = el[S2], wr[S2]; ax = (w - a) / np.linalg.norm(w - a); cend = w - ax * 0.03
    parts["cuff_" + S2] = cut_part(jk, f"fd2_jacket_cuff_{S2}", [(cend + ax * 0.01, ax), (cend - ax * 0.055, -ax)], lambda c, n, a=a, w=w: seg_param(c, a, w)[1] < 0.09, 0.0025, 0.002)
  parts["hem"] = cut_part(jk, "fd2_jacket_hem", [(np.array([cx, cy, zmin + (HEM + 0.028) * H]), UP)], lambda c, n: n[2] < 0.6, 0.002, 0.002)
  # the collar: a band built round the neckline (extruding the cut's own edge tore it), standing up 7 cm at the back
  # and 5 at the front, leaning out a little, open at the front where the zip is; 4 mm thick with a rolled top
  nkc2 = np.array([nk0[0], nk0[1], 0.0])
  bmc = bmesh.new(); bmc.from_mesh(jk.data)
  rim = [np.array(tuple(mw @ v.co)) for v in bmc.verts if v.is_boundary]; bmc.free()
  rim = [p for p in rim if p[2] > zN - 0.09 and np.linalg.norm((p - nk0)[:2]) < 0.17]
  ang = lambda p: math.atan2((p - nkc2) @ side, (p - nkc2) @ fwd)   # (0 at the front, round to the left)
  NA, gap = 72, 0.16; ring = []
  for k2 in range(NA + 1):
    a = gap + (2 * math.pi - 2 * gap) * k2 / NA; a2 = a if a <= math.pi else a - 2 * math.pi
    near = [p for p in rim if abs((ang(p) - a2 + math.pi) % (2 * math.pi) - math.pi) < 0.09]
    if not near: continue
    far = max(near, key=lambda p: np.linalg.norm((p - nkc2)[:2]))   # (the outside of the cloth, not its turned-back edge)
    ring.append((a2, np.array([far[0], far[1], np.mean([q[2] for q in near])])))
  L("collar ring", len(ring), "of", NA + 1, "from", len(rim), "edge points")
  # (front: a = 0 at the zip, a = pi at the back; the ring runs from just left of the zip round the back to just right)
  ring = [(a2, p) for a2, p in sorted(ring, key=lambda t: (t[0] - gap) % (2 * math.pi))]
  bmc = bmesh.new(); rows = []
  for a2, p in ring:
    out = p - nkc2; out[2] = 0; out /= (np.linalg.norm(out) or 1); front = max(0.0, math.cos(a2))
    hgt = 0.072 - 0.022 * front; lean = 0.008 + 0.008 * front
    prof = [(-0.012, 0.0), (0.0, 0.003), (hgt * 0.55, 0.002 + lean * 0.45), (hgt, lean), (hgt + 0.004, lean - 0.003)]   # (up, out) from the neckline
    outer = [p + np.array([0, 0, u]) + out * (o + 0.003) for u, o in prof]
    inner = [q - out * 0.004 for q in outer]
    rows.append([bmc.verts.new(mwi @ Vector(q)) for q in outer] + [bmc.verts.new(mwi @ Vector(q)) for q in reversed(inner)])
  nr = len(rows[0]) if rows else 0
  for i2 in range(len(rows) - 1):
    for j2 in range(nr - 1):
      bmc.faces.new([rows[i2][j2], rows[i2 + 1][j2], rows[i2 + 1][j2 + 1], rows[i2][j2 + 1]])
  if rows:
    bmc.faces.new(rows[0]); bmc.faces.new(list(reversed(rows[-1])))   # (the ends at the zip)
  bmesh.ops.recalc_face_normals(bmc, faces=bmc.faces[:])
  me = bpy.data.meshes.new("collar"); bmc.to_mesh(me); bmc.free()
  col = bpy.data.objects.new("fd2_jacket_collar", me); bpy.context.collection.objects.link(col); col.matrix_world = mw_obj; parts["collar"] = col
  # the hood, rolled down behind the collar: a soft tube round the back of the neck, thick at the back, thin at the sides
  nk = bone("Neck"); hd = bone("Head")
  bmh = bmesh.new(); NU, NV = 24, 12; rows = []
  for i2 in range(NU + 1):
    a = -math.pi * 0.62 + (i2 / NU) * math.pi * 1.24   # (round the back of the neck, from one side to the other)
    dirv = -fwd * math.cos(a) + side * math.sin(a)
    rr = 0.01 + 0.02 * math.cos(a * 0.8) ** 2
    c0 = np.array([nk[0], nk[1], zN + 0.01]) + dirv * (0.08 + rr * 0.8)
    tang = np.cross(np.array([0, 0, 1.0]), dirv)
    row = []
    for j2 in range(NV):
      b = j2 / NV * 2 * math.pi; q = c0 + (dirv * math.cos(b) + np.array([0, 0, 1.0]) * math.sin(b) * 0.8) * rr
      row.append(bmh.verts.new(mwi @ Vector(q)))
    rows.append(row)
  for i2 in range(NU):
    for j2 in range(NV):
      bmh.faces.new([rows[i2][j2], rows[i2][(j2 + 1) % NV], rows[i2 + 1][(j2 + 1) % NV], rows[i2 + 1][j2]])
  bmh.normal_update(); me = bpy.data.meshes.new("hood"); bmh.to_mesh(me); bmh.free()
  hood = bpy.data.objects.new("fd2_jacket_hood", me); bpy.context.collection.objects.link(hood); hood.matrix_world = mw_obj
  parts["hood"] = hood
  # the toggles on the hem's drawcord, and press studs down the storm flap: small and simple
  def small(name, centres, rad, length, axis_fn):
    bms = bmesh.new()
    for c in centres:
      m = bmesh.ops.create_cone(bms, cap_ends=True, segments=10, radius1=rad / S, radius2=rad / S, depth=length / S)
      ax = axis_fn(c); q = Vector((0, 0, 1)).rotation_difference(mwi.to_3x3() @ Vector(ax))
      for v in m["verts"]: v.co = q @ v.co + (mwi @ Vector(c))
    me2 = bpy.data.meshes.new(name); bms.to_mesh(me2); bms.free(); ob = bpy.data.objects.new(name, me2); bpy.context.collection.objects.link(ob); ob.matrix_world = mw_obj; return ob
  def on_surface(p, nudge):
    _, idx, _ = kd.find(Vector(p)); return P[idx] + N0[idx] * nudge
  studs = [on_surface(np.array([cx, cy, 0]) + fwd * 0.2 + np.array([0, 0, z]), 0.033) for z in np.linspace(zmin + (HEM + 0.03) * H, zN - 0.04, 7)]
  studs = [s - side * lat(s) + fwd * 0.0 for s in studs]
  parts["studs"] = small("fd2_jacket_studs", studs, 0.0055, 0.004, lambda c: tuple(fwd))
  hemZ = zmin + (HEM + 0.012) * H
  tog = [on_surface(np.array([cx, cy, hemZ]) + sgn * side * 0.2, 0.035) for sgn in (1, -1)]
  parts["toggles"] = small("fd2_jacket_toggles", tog, 0.006, 0.022, lambda c: (0, 0, 1))
  L("jacket parts", {k: (len(v.data.vertices) if v else 0) for k, v in parts.items()})

  # ======== the trousers ========
  def tr_region(i):
    k = kinds[i]
    if k in ("hand", "head", "upperarm", "forearm"): return False
    return BOOT - 0.06 <= h[i] <= HEM + 0.09 and k in ("thigh", "calf", "torso", "foot")
  tr, bm = from_body("fd2_trousers", tr_region, body_slot)
  def tr_off(p):
    z = (p[2] - zmin) / H; o = 0.016
    if z < BOOT + 0.02: o = 0.012  # (gathered in where they go into the boots, inside the boots' shafts)
    return o
  inflate(bm, tr_off, 12)
  subdivide(bm)
  def tr_folds(p, n):
    z = (p[2] - zmin) / H; d = 0.0
    for k2, S2 in enumerate(("L", "R")):
      k = kn[S2]; s = p[2] - k[2]
      if abs(s) < 0.12 and np.linalg.norm((p - k)[:2]) < 0.14: d += 0.004 * (1 - abs(s) / 0.12) * ridges(s, 0.05, 21 + k2) * (1.0 if fro(p) - fro(k) < 0 else 0.5)
    if z < BOOT + 0.07: d += 0.006 * (1 - (z - BOOT + 0.03) / 0.1) * ridges(p[2] + 0.01 * math.sin(math.atan2(lat(p), fro(p)) * 4), 0.032, 31)
    return d
  displace(bm, tr_folds)
  cut_level(bm, BOOT - 0.03, keep_below=False)
  thicken_edges(bm, 0.005)
  bm.to_mesh(tr.data); bm.free(); made["trousers"] = tr
  trP = np.array([tuple(mw @ v.co) for v in tr.data.vertices])
  def tr_part(name, select, lift, thick):
    ob = tr.copy(); ob.data = tr.data.copy(); ob.name = name; bpy.context.collection.objects.link(ob)
    bm2 = bmesh.new(); bm2.from_mesh(ob.data); bm2.normal_update()
    keep = set(f for f in bm2.faces if select(np.array(tuple(mw @ f.calc_center_median())), np.array(tuple((mw.to_3x3() @ f.normal).normalized())))); bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f not in keep], context="FACES")
    bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context="VERTS")
    if not bm2.faces: bm2.free(); bpy.data.objects.remove(ob); return None
    for v in bm2.verts: v.co += v.normal * (lift / S)
    bmesh.ops.solidify(bm2, geom=bm2.faces[:], thickness=-thick / S); bm2.normal_update(); bm2.to_mesh(ob.data); bm2.free(); return ob
  for S2, sg in (("L", 1), ("R", -1)):
    t0 = th[S2]; zc = t0[2] - 0.2
    parts["cargo_" + S2] = cut_part(tr, f"fd2_trousers_cargo_{S2}", slab(UP, zc - 0.085, zc + 0.085) + slab(fwd, fro(t0) - 0.07, fro(t0) + 0.07), lambda c, n, sg=sg: n @ (side * sg) > 0.5, 0.004, 0.003)

  # ======== the wellies ========
  def bt_region(i):
    k = kinds[i]
    return k in ("calf", "foot", "thigh") and h[i] <= BOOT + 0.03
  bt, bm = from_body("fd2_boots", bt_region, body_slot)
  L("boots from the body", len(bm.faces), "faces; in the region", sum(1 for i in range(len(P)) if bt_region(i)), "points")
  def bt_off(p):
    z = (p[2] - zmin) / H; o = 0.012
    if z > 0.07: o += 0.015 * min(1.0, (z - 0.07) / 0.12)   # (the shaft stands off the calf, round the trousers)
    return o
  inflate(bm, bt_off, 10)
  subdivide(bm)
  cut_level(bm, BOOT, keep_below=True)
  L("boots after the cut", len(bm.faces))
  bm.normal_update()
  # the sole: everything near the ground pushed down to a flat, slightly wider sole 2 cm thick
  for v in bm.verts:
    pw = np.array(tuple(mw @ v.co))
    if pw[2] < zmin + 0.035:
      pw2 = pw.copy(); pw2[2] = max(zmin - 0.002, pw[2] - 0.018)
      v.co = mwi @ Vector(pw2)
  thicken_edges(bm, 0.006)
  L("boots made", len(bm.faces))
  bm.to_mesh(bt.data); bm.free(); made["boots"] = bt
  # the top band, raised 2 mm, 4 cm deep
  topZ = zmin + BOOT * H
  parts["band"] = cut_part(bt, "fd2_boots_band", slab(UP, topZ - 0.04, topZ - 0.004), lambda c, n: abs(n[2]) < 0.6, 0.002, 0.002)
  # a buckle on each boot's outer side under the band
  bk = []
  for S2, sg in (("L", 1), ("R", -1)):
    c = np.array([kn[S2][0], kn[S2][1], topZ - 0.06]); c = on_surface(c + side * sg * 0.07, 0.0)
    bk.append(c)
  parts["buckles"] = small("fd2_boots_buckles", [on_surface(c, 0.026) for c in bk], 0.012, 0.004, lambda c: tuple(side * (1 if lat(c) > 0 else -1)))

  # ======== the beard ========
  # the head's points below the nose and in front of the ears that the jaw, the mouth or the cheeks move, or in the
  # chin and jaw's line: lifted 4 mm into a shell of short hair (thicker under the chin, thinning up the cheeks)
  def jawish(i):
    return sum(w for k2, w in wk[i].items()) and any(k2 == "head" for k2 in wk[i])
  hdz = hd[2]; nose = bone("MNose") if any("MNose" in n for n in bh) else hd + fwd * 0.1
  jaw = bone("MJaw")
  hv = [i for i in range(len(P)) if kinds[i] == "head"]
  L("nose", (nose - hd).round(3), "jaw", (jaw - hd).round(3))
  def beard_w(p):
    q = p - hd; f = q @ fwd; l = q @ side; z = p[2]
    if f < 0.0: return 0.0
    if z > nose[2] - 0.012: return 0.0                     # (nothing above the nose's tip)
    if abs(l) > 0.075: return 0.0                          # (in front of the ears)
    if z < jaw[2] - 0.075: return 0.0
    ch = 1.0 if z < nose[2] - 0.045 else max(0.0, 1 - (z - (nose[2] - 0.045)) / 0.035)   # (thinning up the cheeks)
    lip = 1.0
    return ch * lip
  bmb = bmesh.new(); bmb.from_mesh(body.data); bmb.verts.ensure_lookup_table(); bmb.faces.ensure_lookup_table()
  # (the lips themselves left bare: points the lips' and mouth corners' bones move more than a third)
  lipw = np.zeros(len(P))
  for v in body.data.vertices:
    for g in v.groups:
      n = gname.get(g.group, "")
      if any(k in n for k in ("Lip", "MouthCorner", "MouthBottom", "Tongue")): lipw[v.index] += g.weight
  # (the lips themselves left bare, and only them: an oval round the mouth, centred where the lips' bones pull most and
  # as wide as the mouth's corners; the moustache over the upper lip and the beard under the lower one kept)
  hdv = [i for i in range(len(P)) if kinds[i] == "head" and (P[i] - hd) @ fwd > 0]
  w2 = lipw[hdv] ** 2
  mc = (P[hdv] * w2[:, None]).sum(0) / max(1e-6, w2.sum()) if w2.sum() > 0 else nose - np.array([0, 0, 0.032])
  cn = [bh[n] for n in bh if "Corner" in n]
  hw = max(0.022, min(0.032, max(abs((c - mc) @ side) for c in cn) + 0.003)) if cn else 0.026
  L("mouth at", (mc - hd).round(3), "half width", round(float(hw), 3), "lip and mouth bones", [n for n in bh if any(k in n for k in ("Lip", "Corner", "Mouth"))])
  def in_mouth(p):
    q = p - mc; x = (q @ side) / hw; zz = q[2] / (0.0095 if q[2] > 0 else 0.0115)
    return x * x + zz * zz < 1.0
  bw = np.array([beard_w(P[v.index]) * (not in_mouth(P[v.index])) if kinds[v.index] == "head" else 0.0 for v in bmb.verts])
  keep = set(f for f in bmb.faces if f.material_index in head_slot and min(bw[v.index] for v in f.verts) > 0.05)
  bmesh.ops.delete(bmb, geom=[f for f in bmb.faces if f not in keep], context="FACES"); bmesh.ops.delete(bmb, geom=[v for v in bmb.verts if not v.link_faces], context="VERTS")
  bmb.normal_update(); L("beard faces", len(bmb.faces))
  # (the mouth's opening kept clear: points within 1.2 cm of the lips' line left out)
  for v in bmb.verts:
    pw = np.array(tuple(mw @ v.co)); w = beard_w(pw); v.co += v.normal * ((0.0015 + 0.0035 * w) / S)
  subdivide(bmb)
  bd = body.copy(); bd.data = body.data.copy(); bd.name = "fd2_beard"; bpy.context.collection.objects.link(bd); bmb.to_mesh(bd.data); bmb.free(); parts["beard"] = bd if BEARD else None
  if not BEARD: bpy.data.objects.remove(bd, do_unlink=True)

  # ---- every part: one material slot, smooth, the body's bone weights from its nearest point, unwrapped ----
  allp = list(made.values()) + [o for o in parts.values() if o]
  for ob in allp:
    ob.data.materials.clear()
    mn = "fd2_" + ("jacket" if "jacket" in ob.name else "trousers" if "trousers" in ob.name else "boots" if "boots" in ob.name else "beard")
    m = bpy.data.materials.get(mn) or bpy.data.materials.new(mn); ob.data.materials.append(m)
    for poly in ob.data.polygons: poly.use_smooth = True; poly.material_index = 0
  # (bone weights for the parts made from scratch: copied from the body's nearest surface)
  kdd = KDTree(len(body.data.vertices))
  for v in body.data.vertices: kdd.insert(v.co, v.index)
  kdd.balance()
  for ob in allp:
    if ob.name in ("fd2_jacket_collar", "fd2_jacket_hood", "fd2_jacket_studs", "fd2_jacket_toggles", "fd2_boots_buckles"):
      # (each point takes the weights of the body's nearest point, both in the mesh's own numbers)
      gs = [ob.vertex_groups.new(name=g.name) for g in body.vertex_groups]
      for v in ob.data.vertices:
        _, bi, _ = kdd.find(v.co)
        for g in body.data.vertices[bi].groups:
          if g.weight > 0: gs[g.group].add([v.index], g.weight, "REPLACE")
      if not any(m.type == "ARMATURE" for m in ob.modifiers): am = ob.modifiers.new("Armature", "ARMATURE"); am.object = arm
      ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()   # (kept where it is)
  # unwrap each garment family into its own texture: the main pieces and their parts together (smart projection)
  fam = {"jacket": [o for o in allp if "jacket" in o.name], "trousers": [o for o in allp if "trousers" in o.name], "boots": [o for o in allp if "boots" in o.name], "beard": [o for o in allp if "beard" in o.name]}
  for key in list(fam):
    fam[key] = [o for o in fam[key] if len(o.data.polygons)]
    if not fam[key]: L(key, "EMPTY"); del fam[key]
  for key, obs in fam.items():
    if bpy.context.object and bpy.context.object.mode != "OBJECT": bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
      o.hide_set(False); o.hide_viewport = False; o.select_set(True)
      if not o.data.uv_layers: o.data.uv_layers.new(name="UVMap")
      while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[1])
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    try:
      bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    except RuntimeError as e:
      # (when the operator refuses this context: an explicit override with a 3D view's area, or failing that one object at a time)
      L(key, "smart project refused:", str(e).splitlines()[0], "mode", bpy.context.object.mode if bpy.context.object else None)
      win = bpy.context.window_manager.windows[0] if bpy.context.window_manager.windows else None
      try:
        with bpy.context.temp_override(window=win, active_object=obs[0], object=obs[0], selected_objects=obs, selected_editable_objects=obs, objects_in_mode=obs):
          bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
      except Exception as e2:
        L(key, "override refused too:", str(e2).splitlines()[0])
        bpy.ops.object.mode_set(mode="OBJECT")
        for o in obs:
          bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
          bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
          bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
          bpy.ops.object.mode_set(mode="OBJECT")
        L(key, "unwrapped one at a time: their islands overlap in the texture")
    if bpy.context.object and bpy.context.object.mode != "OBJECT": bpy.ops.object.mode_set(mode="OBJECT")
    L(key, "unwrapped", [(o.name, len(o.data.polygons)) for o in obs])
  # ---- the surfaces written out for the textures: per family, every triangle's world points, normals, uvs and part ----
  for key, obs in fam.items():
    Ps, Ns, Us, Ts, Ks, names = [], [], [], [], [], []; base = 0
    for pi, o in enumerate(obs):
      # (as he stands, posed by the skeleton: the frame the textures are drawn in)
      dg = bpy.context.evaluated_depsgraph_get(); eo = o.evaluated_get(dg); me = eo.to_mesh(); me.calc_loop_triangles(); uv = me.uv_layers.active.data
      vw = np.array([tuple(eo.matrix_world @ v.co) for v in me.vertices]); nw = np.array([tuple((eo.matrix_world.to_3x3() @ v.normal).normalized()) for v in me.vertices])
      for tri in me.loop_triangles:
        for li, vi in zip(tri.loops, tri.vertices): Ps.append(vw[vi]); Ns.append(nw[vi]); Us.append(tuple(uv[li].uv))
        Ts.append([base, base + 1, base + 2]); Ks.append(pi); base += 3
      names.append(o.name); eo.to_mesh_clear()
    np.savez_compressed(f"{DST}/{TAG}_{key}.npz", P=np.array(Ps, np.float32), N=np.array(Ns, np.float32), UV=np.array(Us, np.float32), T=np.array(Ts, np.int32), K=np.array(Ks, np.int16), names=np.array(names),
                        frame=np.array([cx, cy, zmin, H, *fwd, *side], np.float32), bones=np.array([json.dumps({k: v.tolist() for k, v in bh.items()})]))
    L(key, "written", len(Ts), "triangles")
  json.dump({"cx": float(cx), "cy": float(cy), "zmin": float(zmin), "H": float(H), "fwd": fwd.tolist(), "side": side.tolist(), "head": bone("Head").tolist(), "hem": HEM}, open(f"{DST}/{TAG}_frame.json", "w"))
  bpy.ops.wm.save_as_mainfile(filepath=f"{DST}/{TAG}.blend")
  # ---- grey renders: front, side, back, three-quarter ----
  sc = bpy.context.scene; eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]; sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
  sc.render.resolution_x, sc.render.resolution_y = 800, 1100
  w2 = bpy.data.worlds.new("w"); sc.world = w2; w2.use_nodes = True; w2.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.63, 0.67, 1); w2.node_tree.nodes["Background"].inputs[1].default_value = 1.0
  sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5; sun.rotation_euler = (0.8, 0.1, 0.9); sc.collection.objects.link(sun)
  greys = {"fd2_jacket": (0.06, 0.065, 0.07), "fd2_trousers": (0.09, 0.09, 0.085), "fd2_boots": (0.1, 0.16, 0.08), "fd2_beard": (0.12, 0.09, 0.07)}
  for mn, c in greys.items():
    m = bpy.data.materials.get(mn)
    if m: m.use_nodes = True; bsdf = m.node_tree.nodes.get("Principled BSDF"); bsdf.inputs["Base Color"].default_value = (*c, 1); bsdf.inputs["Roughness"].default_value = 0.5
  cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 70
  for i, ang in enumerate((0, 90, 180, 35)):
    a = math.radians(ang); dirv = fwd * math.cos(a) + side * math.sin(a); d = 4.6
    cam.location = Vector((cx + dirv[0] * d, cy + dirv[1] * d, zmin + H * 0.55))
    cam.rotation_euler = (Vector((cx, cy, zmin + H * 0.52)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{OUT}/renders/people2/{TAG}_{i}.png"; bpy.ops.render.render(write_still=True)
  # and the face close, for the beard
  cam.data.lens = 85; f0 = hd + fwd * 0.75 + side * 0.25; cam.location = Vector(f0); cam.rotation_euler = (Vector(hd - np.array([0, 0, 0.04])) - cam.location).to_track_quat("-Z", "Y").to_euler()
  sc.render.filepath = f"{OUT}/renders/people2/{TAG}_face.png"; bpy.ops.render.render(write_still=True)
  L("DONE")
except Exception:
  L("ERROR", traceback.format_exc())
open(f"{DST}/{TAG}.log", "w").write("\n".join(log))
print("PEOPLE2 A DONE")
