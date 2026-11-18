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
TAG = globals().get("TAG", "p2a"); SUBDIV = globals().get("SUBDIV", True); BEARD = globals().get("BEARD", True); SIM = globals().get("SIM", False)
# (TUBE: the welly shafts built as one clean tube from the ankle up, for a body whose own boots end below the knee with
# its trousers going in (the woman, f07): moulding her own points left two layers there that showed as a broken line.
# The man's are moulded from his own points, which joined cleanly)
TUBE = globals().get("TUBE", False)
# (SIM: Blender's cloth simulation, tried four times (h035 to h038): run headless here the cloth fell through the body
# wherever it wasn't pinned, whatever the collider's thickness, so the folds are modelled instead)
CT = globals().get("CT", 0.004); CD = globals().get("CD", 0.005); SLACK = globals().get("SLACK", 1.0)   # (the collider's thickness, the cloth's collision distance, how much of the slack to use)
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
  # ---- cloth: a garment let settle on the body under gravity in Blender's cloth simulation, pinned where it is held
  # (shoulders and collar, the hem band, the cuffs; the waistband and inside the boots), its cloth a few per cent longer
  # than the body under it so the slack falls into real folds where it gathers: above the hem band, down the sleeves
  # to the cuffs (gravity along the arm, as the arms hang), above the boots. The body is the collider. ----
  def cloth_settle(ob, pin_fn, gravity, frames=36, slack=0.04, label="", bending=0.6, mass=0.18):
    if not SIM: return 0
    sc0 = bpy.context.scene
    # (the body the collider for this settle only: copies made from it later must not carry it)
    col_m = body.modifiers.new("fd_collision", "COLLISION"); body.collision.thickness_outer = CT; body.collision.cloth_friction = 8.0
    # (both sides: the file's faces may wind either way in the world, and one-sided let the cloth fall through)
    for k3, v3 in (("use_culling", False), ("use_normal", False)):
      try: setattr(body.collision, k3, v3)
      except Exception: pass
    for m in [m for m in ob.modifiers if m.type == "COLLISION"]: ob.modifiers.remove(m)
    vg = ob.vertex_groups.get("fd_pin") or ob.vertex_groups.new(name="fd_pin")
    npin = 0
    for v in ob.data.vertices:
      w = float(pin_fn(np.array(tuple(mw @ v.co))))
      if w > 0.001: vg.add([v.index], min(1.0, w), "REPLACE"); npin += 1
    arms_m = [m for m in ob.modifiers if m.type == "ARMATURE"]
    for m in arms_m: m.show_viewport = False; m.show_render = False
    cl = ob.modifiers.new("cloth", "CLOTH"); st2 = cl.settings
    st2.quality = 7; st2.mass = mass; st2.air_damping = 2.0
    st2.tension_stiffness = 15; st2.compression_stiffness = 15; st2.shear_stiffness = 8; st2.bending_stiffness = bending
    st2.tension_damping = 5; st2.compression_damping = 5; st2.shear_damping = 5
    st2.vertex_group_mass = "fd_pin"; st2.pin_stiffness = 1.0
    st2.shrink_min = -slack * SLACK
    cs2 = cl.collision_settings; cs2.use_collision = True; cs2.distance_min = CD; cs2.collision_quality = 8; cs2.use_self_collision = False
    cl.point_cache.frame_start = 1; cl.point_cache.frame_end = frames
    sc0.gravity = tuple(gravity); sc0.frame_start = 1; sc0.frame_end = frames
    for f in range(1, frames + 1): sc0.frame_set(f)
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_move_to_index(modifier="cloth", index=0); bpy.ops.object.modifier_apply(modifier="cloth")
    for m in arms_m: m.show_viewport = True; m.show_render = True
    g0 = ob.vertex_groups.get("fd_pin")
    if g0 is not None: ob.vertex_groups.remove(g0)
    sc0.frame_set(1); sc0.gravity = (0, 0, -9.81)
    body.modifiers.remove(body.modifiers["fd_collision"])
    inside = 0
    for v in ob.data.vertices:
      pw3 = mw @ v.co; _, i3, d3 = kd.find(pw3)
      if (np.array(tuple(pw3)) - P[i3]) @ N0[i3] < 0.002: inside += 1
    L("cloth", label, "settled over", frames, "frames,", npin, "points pinned of", len(ob.data.vertices), "| within 2 mm of the skin or under it:", inside)
    return npin
  def rim_dist(bm, cap=0.05):
    # how far each point is from the piece's edge, over its surface (metres, up to cap), kept on the points as
    # fd_edge: the textures draw the stitching round each pocket, flap and band 4 mm in from its real edge with it
    import heapq
    lay = bm.verts.layers.float.get("fd_edge") or bm.verts.layers.float.new("fd_edge")
    bm.verts.index_update(); bm.verts.ensure_lookup_table()
    dist = [0.0 if v.is_boundary else cap for v in bm.verts]
    hq = [(0.0, v.index) for v in bm.verts if v.is_boundary]; heapq.heapify(hq)
    while hq:
      d0, i = heapq.heappop(hq)
      if d0 > dist[i] or d0 >= cap: continue
      v = bm.verts[i]
      for e in v.link_edges:
        o = e.other_vert(v); d1 = d0 + e.calc_length() * S
        if d1 < dist[o.index]: dist[o.index] = d1; heapq.heappush(hq, (d1, o.index))
    for v in bm.verts: v[lay] = dist[v.index]
    return lay
  def thicken_edges(bm, depth):
    bnd = [e for e in bm.edges if e.is_boundary]
    if not bnd: return
    lay = rim_dist(bm)
    ret = bmesh.ops.extrude_edge_only(bm, edges=bnd)
    for v in [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]: v[lay] = -0.002   # (the turned-back edge)
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
    # (its thickness shown by the edge turned back under it: a solidify threw points of thin folds half a metre off)
    bm2.normal_update(); thicken_edges(bm2, thick + lift * 0.8); bm2.to_mesh(ob.data); bm2.free(); return ob
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
  def fold(x, k=0.0):
    # one fold's profile along x (in wavelengths): wide soft crests and tight creases, each fold its own size
    ph = x + 0.18 * math.sin(x * 2.3 + k) + PH[int(k) % 64]
    v = abs(math.sin(math.pi * ph)) ** 0.55 - 0.62
    return v * (0.7 + 0.3 * math.sin(ph * 1.7 + 2 * k))
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
  nk0 = bone("Neck"); zN0 = zmin + neckZ * H
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
    z = (p[2] - zmin) / H; o = 0.011
    # (a little looser at the hem; close over the shoulders; the hang from the chest is added after)
    if z < HEM + 0.06: o += 0.006 * (1 - (z - HEM) / 0.06)
    if z > neckZ - 0.06: o -= 0.003
    for S2 in ("L", "R"):
      t, d = seg_param(p, sh[S2], wr[S2])
      if d < 0.09: o = 0.010 + 0.006 * t   # (the sleeve: a little wider towards the cuff)
    return o
  inflate(bm, jk_off, 10)
  # the hang: below the chest the cloth falls straight from the widest part above it (the chest in front, the shoulder
  # blades behind, the ribs at the sides), over the waist and the small of the back, as a shell jacket does, instead
  # of following every curve of the body under it
  def hang(bm, top_lo, top_hi, below, amount=1.0, arms_clear=0.11):
    pts = [(v, world(v)) for v in bm.verts]
    def is_arm(p): return min(seg_param(p, sh[S2], wr[S2])[1] for S2 in ("L", "R")) < arms_clear
    NB = 72; rmax = np.zeros(NB)
    tor = [(v, p) for v, p in pts if not is_arm(p)]
    for v, p in tor:
      q = p - np.array([cx, cy, p[2]]); a = int(((math.atan2(q @ side, q @ fwd) + math.pi) / (2 * math.pi)) * NB) % NB
      if top_lo < p[2] < top_hi: rmax[a] = max(rmax[a], math.hypot(q[0], q[1]))
    rmax = np.maximum(rmax, np.roll(rmax, 1) * 0.985); rmax = np.maximum(rmax, np.roll(rmax, -1) * 0.985)
    moved = 0
    for v, p in tor:
      if p[2] >= below: continue
      q = p - np.array([cx, cy, p[2]]); r = math.hypot(q[0], q[1]); a = int(((math.atan2(q @ side, q @ fwd) + math.pi) / (2 * math.pi)) * NB) % NB
      w = amount * min(1.0, (below - p[2]) / 0.08)
      want = rmax[a] * 0.97
      if r < want and r > 1e-6:
        r2 = r + (want - r) * w; d = (q / r) * (r2 - r); d[2] = 0
        v.co += mwi.to_3x3() @ Vector(d); moved += 1
    for _ in range(2): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update(); return moved
  L("jacket hang moved", hang(bm, zN0 - 0.30, zN0 - 0.13, zN0 - 0.22), "points")
  subdivide(bm)
  def jk_folds(p, n):
    z = (p[2] - zmin) / H; d = 0.0
    for k2, S2 in enumerate(("L", "R")):
      # inside the elbow: compression folds, set at an angle round the sleeve (they zigzag as cloth does), deepest on
      # the inside of the bend, a few long ones over the forearm
      a, e, w = sh[S2], el[S2], wr[S2]; ax = (w - a) / np.linalg.norm(w - a)
      s0 = (p - e) @ ax; t, r = seg_param(p, a, w)
      if r < 0.1 and -0.12 < s0 < 0.16:
        rad = (p - e) - ax * s0; rad = rad / (np.linalg.norm(rad) or 1); inside = max(0.0, rad @ fwd); ang = math.atan2(rad @ fwd, rad[2])
        env = (1 - abs(s0 - 0.02) / 0.14) if abs(s0 - 0.02) < 0.14 else 0.0
        d += 0.0056 * env * fold((s0 + 0.012 * math.sin(ang * 2 + k2)) / 0.038, 3 + k2) * (0.35 + 0.65 * inside)
      # stacked above the cuff: the sleeve is longer than the arm, so it gathers in three or four rings over the wrist,
      # each set at its own slant and broken round the sleeve
      Lw = np.linalg.norm(w - a); sw = (1 - t) * Lw
      if r < 0.1 and 0.05 < sw < 0.2:
        rad2 = (p - (a + ax * (t * Lw))); rad2 = rad2 / (np.linalg.norm(rad2) or 1); ang2 = math.atan2(rad2 @ fwd, rad2[2])
        env2 = math.sin(math.pi * (sw - 0.05) / 0.15) ** 0.7
        d += 0.0052 * env2 * fold((sw + 0.011 * math.sin(ang2 * 2 + 1.7 * k2) + 0.006 * math.sin(ang2 * 3 + 0.4)) / 0.034, 41 + k2)
      # drag lines from the armpit, down and across the side of the chest
      ap = sh[S2] - np.array([0, 0, 0.09]); q = p - ap; dd = np.linalg.norm(q)
      if dd < 0.16 and q[2] < 0.02:
        across = (q @ fwd) * 0.8 + q[2] * 0.6
        d += 0.0024 * (1 - dd / 0.16) * fold(across / 0.035, 9 + k2)
    # gathered above the hem band by its drawcord: soft horizontal folds over the waist, and short upright pleats
    # pulled in at the band itself
    zh = zmin + HEM * H
    if zh < p[2] < zh + 0.16:
      ang = math.atan2(lat(p), fro(p)); u = (p[2] - zh)
      d += 0.0026 * (1 - u / 0.16) * fold((p[2] + 0.015 * math.sin(ang * 3)) / 0.045, 17) * (0.6 + 0.4 * abs(math.sin(ang)))
      if u < 0.07: d += 0.0024 * (1 - u / 0.07) * fold(ang * 4.0, 19)   # (about 25 round the hem)
    # hanging folds: long soft upright folds down the back from the shoulder blades, and down the front below the
    # chest pockets, as a loose shell hangs (not on the sleeves)
    onsleeve = any(seg_param(p, sh[S2], wr[S2])[1] < 0.1 and seg_param(p, sh[S2], wr[S2])[0] > 0.1 for S2 in ("L", "R"))
    if not onsleeve and zh + 0.03 < p[2] < zN0 - 0.2:
      u2 = (p[2] - zh - 0.03) / (zN0 - 0.23 - zh); env3 = math.sin(math.pi * min(1.0, max(0.0, u2))) ** 0.6
      if fro(p) < 0: d += 0.0032 * env3 * fold((lat(p) + 0.012 * math.sin(p[2] * 21.0)) / 0.085, 45)
      elif p[2] < zN0 - 0.33: d += 0.0024 * env3 * fold((lat(p) + 0.01 * math.sin(p[2] * 17.0)) / 0.07, 47)
    # the small of the back: one or two long horizontal folds where the jacket hangs from the shoulder blades
    if fro(p) < 0 and zh + 0.12 < p[2] < zh + 0.30:
      d += 0.002 * fold((p[2] - zh) / 0.07, 23) * (1 - abs(lat(p)) / 0.2 if abs(lat(p)) < 0.2 else 0.0)
    return d
  if SIM:
    # (with the simulation the drawn folds stay only as faint hints where the arms bend, which a body standing with
    # its arms out never makes)
    def jk_hint(p, n): return jk_folds(p, n) * 0.35
    displace(bm, jk_hint)
  else:
    displace(bm, jk_folds)
  bm.to_mesh(jk.data); bm.free()
  def on_arm(p, S2):
    t, r = seg_param(p, sh[S2], wr[S2]); return t, r < 0.105
  zh0 = zmin + HEM * H
  def pin_torso(p):
    # held at the shoulders, yoke and collar, and round the hem band; the sleeves held still while the body settles
    for S2 in ("L", "R"):
      t, on = on_arm(p, S2)
      if on and t > 0.08: return 1.0
    if p[2] > zN0 - 0.13: return 1.0
    if p[2] > zN0 - 0.2: return (p[2] - (zN0 - 0.2)) / 0.07
    if p[2] < zh0 + 0.025: return 1.0
    return 0.0
  cloth_settle(jk, pin_torso, (0, 0, -9.81), label="jacket body", slack=0.035)
  for S2, sgn in (("L", 1), ("R", -1)):
    a_, w_ = sh[S2], wr[S2]; axv = (w_ - a_) / np.linalg.norm(w_ - a_)
    def pin_sleeve(p, S2=S2):
      t, on = on_arm(p, S2)
      if not on or t < 0.12: return 1.0          # (everything but this sleeve held)
      if t > 0.9: return 1.0                     # (the cuff and the wrist end)
      if t < 0.2: return (0.2 - t) / 0.08        # (eased in from the shoulder)
      return 0.0
    cloth_settle(jk, pin_sleeve, tuple(axv * 9.81 * 0.9 + np.array([0, 0, -9.81 * 0.25])), label=f"sleeve {S2}", slack=0.05)
  bm = bmesh.new(); bm.from_mesh(jk.data); bm.normal_update()
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
    # the pockets' flaps: a little wider than the pocket, over its top, standing further off (a flap over a pocket,
    # not a printed panel)
    parts["chestflap_" + S2] = cut_part(jk, f"fd2_jacket_pocket_chestflap_{S2}", slab(side * sg, 0.05, 0.17) + slab(UP, zN - 0.168, zN - 0.124), lambda c, n: n @ fwd > 0.3, 0.0068, 0.003)
    parts["lowflap_" + S2] = cut_part(jk, f"fd2_jacket_pocket_lowflap_{S2}", slab(side * sg, 0.065, 0.19) + slab(UP, zmin + (HEM + 0.1) * H - 0.042, zmin + (HEM + 0.1) * H + 0.005), lambda c, n: n @ fwd > 0.12, 0.006, 0.003)
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
    hgt = (0.064 - 0.022 * front) * min(1.0, H / 1.8); lean = 0.01 + 0.012 * front
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
  # the cuffs' adjusting tabs: a strap 5 cm long and 2.2 wide across the back of each wrist, 3 mm thick, rounded
  def tabs(name, specs):
    bms = bmesh.new()
    for c, along, nrm, (ln, wd, th2) in specs:
      m3 = bmesh.ops.create_cube(bms, size=1.0)
      a3 = along / np.linalg.norm(along); n3 = nrm - a3 * (nrm @ a3); n3 /= np.linalg.norm(n3); b3 = np.cross(n3, a3)
      R = np.stack([a3 * ln, b3 * wd, n3 * th2], 1)
      for v in m3["verts"]:
        q3 = R @ np.array(tuple(v.co)) + c; v.co = mwi @ Vector(q3)
    bmesh.ops.bevel(bms, geom=bms.edges[:], offset=0.0012 / S, segments=2, affect="EDGES")
    me3 = bpy.data.meshes.new(name); bms.to_mesh(me3); bms.free(); ob3 = bpy.data.objects.new(name, me3); bpy.context.collection.objects.link(ob3); ob3.matrix_world = mw_obj; return ob3
  tspecs = []
  for S2 in ("L", "R"):
    a, w = el[S2], wr[S2]; ax = (w - a) / np.linalg.norm(w - a); cmid = w - ax * 0.055
    top = on_surface(cmid + np.array([0, 0, 0.06]), 0.0) ; nrm = N0[kd.find(Vector(top))[1]]
    tspecs.append((top + nrm * 0.021, ax, nrm, (0.05, 0.022, 0.003)))
  parts["cufftabs"] = tabs("fd2_jacket_cufftabs", tspecs)
  L("jacket parts", {k: (len(v.data.vertices) if v else 0) for k, v in parts.items()})

  # ======== the trousers ========
  def tr_region(i):
    k = kinds[i]
    if k in ("hand", "head", "upperarm", "forearm"): return False
    return BOOT - 0.06 <= h[i] <= HEM + 0.045 and k in ("thigh", "calf", "torso", "foot")   # (their top well inside the jacket)
  tr, bm = from_body("fd2_trousers", tr_region, body_slot)
  def tr_off(p):
    z = (p[2] - zmin) / H; o = 0.013
    if z < BOOT + 0.02: o = 0.011  # (gathered in where they go into the boots, inside the boots' shafts)
    if z > HEM - 0.015: o = 0.013 - 0.007 * min(1.0, (z - HEM + 0.015) / 0.03)   # (snug at the waist, under the jacket)
    return o
  inflate(bm, tr_off, 10)
  subdivide(bm)
  def tr_folds(p, n):
    z = (p[2] - zmin) / H; d = 0.0
    for k2, S2 in enumerate(("L", "R")):
      k = kn[S2]; s0 = p[2] - k[2]; behind = fro(p) - fro(k) < 0; rr = np.linalg.norm((p - k)[:2])
      # behind the knee: cloth bunched into deep creases; in front, a few soft ones across the kneecap
      if abs(s0) < 0.11 and rr < 0.13: d += (0.0055 if behind else 0.003) * (1 - abs(s0) / 0.11) * fold((s0 + 0.01 * math.sin(math.atan2(lat(p - k), fro(p - k)) * 2)) / (0.03 if behind else 0.05), 21 + k2)
      # drag lines from the crotch across the inside of the thigh
      t0 = th[S2]; cr = np.array([cx, cy, t0[2] - 0.06]); q = p - cr
      if np.linalg.norm(q) < 0.2 and q[2] < 0.02:
        d += 0.0022 * (1 - np.linalg.norm(q) / 0.2) * fold(((q @ side) * (1 if S2 == "L" else -1) * 0.7 - q[2] * 0.7) / 0.04, 27 + k2)
      # the front of the hip: a crease where the leg meets the body
      hp = t0 + fwd * 0.08; q = p - hp
      if abs(q[2]) < 0.06 and fro(p) > fro(t0) and abs(lat(p) - lat(t0)) < 0.09: d += 0.0018 * (1 - abs(q[2]) / 0.06) * fold(q[2] / 0.03, 29 + k2)
    # long soft folds hanging down the shins from the knees to the boots
    for k2, S2 in enumerate(("L", "R")):
      k = kn[S2]
      if zmin + BOOT * H + 0.05 < p[2] < k[2] - 0.07 and np.linalg.norm((p - k)[:2]) < 0.14:
        ang = math.atan2(lat(p - k), fro(p - k)); u3 = (k[2] - 0.07 - p[2]) / (k[2] - 0.12 - zmin - BOOT * H)
        d += 0.0022 * math.sin(math.pi * min(1.0, max(0.0, u3))) * fold((ang + 0.15 * math.sin(p[2] * 13.0 + k2)) * 1.6, 51 + k2)
    # stacked folds where they go into the boots, settling down onto the boot tops
    zb = zmin + BOOT * H
    if p[2] < zb + 0.12:
      u = max(0.0, (p[2] - zb + 0.05) / 0.17); ang = math.atan2(lat(p), fro(p))
      d += 0.0052 * (1 - u) * fold((p[2] + 0.012 * math.sin(ang * 4)) / 0.03, 31)
    return d
  if SIM:
    def tr_hint(p, n): return tr_folds(p, n) * 0.4
    displace(bm, tr_hint)
  else:
    displace(bm, tr_folds)
  bm.to_mesh(tr.data); bm.free()
  zb0 = zmin + BOOT * H
  def pin_trousers(p):
    if p[2] > zmin + (HEM - 0.03) * H: return 1.0            # (the waistband, under the jacket)
    if p[2] < zb0 + 0.01: return 1.0                         # (tucked into the boots)
    if p[2] > zmin + (HEM - 0.07) * H: return (p[2] - (zmin + (HEM - 0.07) * H)) / (0.04 * H)
    return 0.0
  cloth_settle(tr, pin_trousers, (0, 0, -9.81), label="trousers", slack=0.045, bending=0.5)
  bm = bmesh.new(); bm.from_mesh(tr.data); bm.normal_update()
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
  # the shaft moulded: a welly's shaft is one smooth rubber surface, not the calf's every bump. Round each leg, in
  # slices 2 cm deep and 10-degree sectors, the widest the boot reaches; that kept smooth round the leg (its first
  # four harmonics) and up it, never narrower above the calf than at it (a welly stands open under the knee as its
  # mouth) and always clear of the body and the trousers inside; the foot eased out to it, the shaft built on it
  topz = zmin + BOOT * H; NA, DZ = 36, 0.02
  for S2 in ("L", "R"):
    k_, a_ = kn[S2], an[S2]
    def centre(z, k_=k_, a_=a_): t3 = (z - a_[2]) / (k_[2] - a_[2]); return a_[:2] + (k_[:2] - a_[:2]) * t3
    z0 = a_[2] + 0.02; nz = int((topz - z0) / DZ) + 2
    vs = [v for v in bm.verts if world(v)[2] > z0 - 0.01 and np.linalg.norm(world(v)[:2] - centre(world(v)[2])) < 0.16 and (lat(world(v)) > 0) == (S2 == "L")]
    if not vs: continue
    R = np.zeros((nz, NA))
    pol = []
    for v in vs:
      pw = world(v); q = pw[:2] - centre(pw[2]); r = math.hypot(*q); th3 = math.atan2(q[1], q[0])
      iz = min(nz - 1, max(0, int((pw[2] - z0) / DZ))); ia = int((th3 + math.pi) / (2 * math.pi) * NA) % NA
      R[iz, ia] = max(R[iz, ia], r); pol.append((v, pw, th3, iz))
    for iz in range(nz):
      row = R[iz]
      if (row > 0).sum() < NA // 3: R[iz] = 0; continue
      row = np.where(row > 0, row, row[row > 0].mean()); F = np.fft.rfft(row); F[5:] = 0; R[iz] = np.fft.irfft(F, NA)
    good = R.max(1) > 0; gi = [j for j in range(nz) if good[j]]
    for iz in range(nz):
      if not good[iz] and gi: R[iz] = R[min(gi, key=lambda j: abs(j - iz))]   # (a slice with too few points: its nearest full one)
    R = np.array([R[max(0, iz - 2):iz + 3].mean(0) for iz in range(nz)])
    ic = int(np.argmax(R.mean(1)[: max(1, nz - 2)]))
    for iz in range(ic + 1, nz): R[iz] = np.maximum(R[iz], R[iz - 1] * 0.995)
    R += 0.002
    # (never inside the body under it: smoothing took the shaft in below sharp ridges of the body's own clothes (the
    # woman's own boot tops at mid-calf), which then showed through it as a broken grey line)
    Rb = np.zeros((nz, NA)); c0 = centre
    for i in range(len(P)):
      pz = P[i][2]
      if pz < z0 - 0.01 or pz > topz + 0.01 or (lat(P[i]) > 0) != (S2 == "L"): continue
      q = P[i][:2] - c0(pz); r = math.hypot(*q)
      if r > 0.16: continue
      iz = min(nz - 1, max(0, int((pz - z0) / DZ))); ia = int((math.atan2(q[1], q[0]) + math.pi) / (2 * math.pi) * NA) % NA
      Rb[iz, ia] = max(Rb[iz, ia], r)
    Rb = np.maximum(Rb, np.maximum(np.roll(Rb, 1, 1), np.roll(Rb, -1, 1)))
    # (5 mm clear of the body; where the trousers go down inside the boot, clear of them too: their 11 mm and folds)
    zr = z0 + (np.arange(nz) + 0.5) * DZ; marg = np.where(zr > zmin + (BOOT - 0.035) * H, 0.018, 0.005)[:, None]
    R = np.maximum(R, np.where(Rb > 0, Rb + marg, 0))
    def set_out(v, R=R, nz=nz, z0=z0, centre=centre, ease=True):
      pw = world(v); c = centre(pw[2]); q = pw[:2] - c; r = math.hypot(*q)
      if r < 1e-6: return
      th3 = math.atan2(q[1], q[0])
      fz = (pw[2] - z0) / DZ - 0.5; i0 = int(min(nz - 1, max(0, math.floor(fz)))); i1 = min(nz - 1, i0 + 1); tz = min(1.0, max(0.0, fz - i0))
      fa = (th3 + math.pi) / (2 * math.pi) * NA - 0.5; j0 = int(math.floor(fa)) % NA; j1 = (j0 + 1) % NA; ta = fa - math.floor(fa)
      Rt = (R[i0, j0] * (1 - ta) + R[i0, j1] * ta) * (1 - tz) + (R[i1, j0] * (1 - ta) + R[i1, j1] * ta) * tz
      e = min(1.0, max(0.0, (pw[2] - z0) / 0.06)) if ease else 1.0; e = e * e * (3 - 2 * e)
      r2 = r + (Rt - r) * e; pw2 = pw.copy(); pw2[:2] = c + q / r * r2; v.co = mwi @ Vector(pw2)
    if not TUBE:
      # (the body's own points set out to the moulded surface, relaxed and set out again so no triangles fold over)
      for v, pw, th3, iz0 in pol: set_out(v)
      sv = [v for v, pw, th3, iz0 in pol if not v.is_boundary and pw[2] > z0 + 0.03]
      for _ in range(6):
        bmesh.ops.smooth_vert(bm, verts=sv, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for v in sv: set_out(v)
      L("boot", S2, "shaft moulded:", len(pol), "points; widest", round(float(R.max()), 3), "m from the leg's line")
      continue
    # the shaft built as one clean tube: the body's own surface above the ankle taken away, and the foot's open top
    # extruded upwards a centimetre at a time to the boot's top, each new ring set out to the moulded surface. (Setting
    # the body's own points out to it left a seam round the woman's calf where her own boots ended and her jeans went
    # in, two layers that no smoothing could join: a broken line in every render)
    zc = z0 + 0.035
    for v, pw, th3, iz0 in pol:
      if pw[2] < zc + 0.03: set_out(v)
    def fc(f): return np.array(tuple(mw @ f.calc_center_median()))
    gone = [f for f in bm.faces if fc(f)[2] > zc and (lat(fc(f)) > 0) == (S2 == "L") and np.linalg.norm(fc(f)[:2] - centre(fc(f)[2])) < 0.2]
    bmesh.ops.delete(bm, geom=gone, context="FACES"); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # (the open top: the longest loop of open edges there, the boot's outside; anything inside it is hidden)
    bnd = [e for e in bm.edges if e.is_boundary and all(world(v)[2] > zc - 0.03 for v in e.verts) and (lat(world(e.verts[0])) > 0) == (S2 == "L")]
    par = {}
    def fnd(x):
      while par.get(x, x) != x: x = par.get(x, x)
      return x
    for e in bnd:
      a1, b1 = fnd(e.verts[0].index), fnd(e.verts[1].index)
      if a1 != b1: par[a1] = b1
    groups = {}
    for e in bnd: groups.setdefault(fnd(e.verts[0].index), []).append(e)
    loop = max(groups.values(), key=lambda g: sum(e.calc_length() for e in g)) if groups else []
    lv = {v for e in loop for v in e.verts}
    for v in lv:
      pw = world(v); pw[2] = zc; v.co = mwi @ Vector(pw); set_out(v, ease=False)
    nring = max(1, int(round((topz - zc) / 0.01))); cur = loop
    for k3 in range(1, nring + 1):
      ret = bmesh.ops.extrude_edge_only(bm, edges=cur)
      nv = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]; nvs = set(nv)
      zk = zc + (topz - zc) * k3 / nring
      for v in nv:
        pw = world(v); pw[2] = zk; v.co = mwi @ Vector(pw); set_out(v, ease=False)
      cur = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMEdge) and all(x in nvs for x in g.verts)]
    L("boot", S2, "shaft built:", nring, "rings of", len(lv), "points from the foot's top (", len(groups), "open loops there)")
    L("boot", S2, "shaft moulded:", len(pol), "points; widest", round(float(R.max()), 3), "m from the leg's line")
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
  bm.normal_update()
  # the sole: everything near the ground pushed down to a flat, slightly wider sole 2 cm thick
  bm.normal_update()
  for v in bm.verts:
    pw = np.array(tuple(mw @ v.co)); nz = (mw.to_3x3() @ v.normal).normalized().z
    if pw[2] < zmin + 0.075 and nz < -0.3:
      # (the underside: one flat sole on the ground, heel to toe, whatever shoe the body had under it)
      pw2 = pw.copy(); pw2[2] = zmin - 0.002; v.co = mwi @ Vector(pw2)
    elif pw[2] < zmin + 0.035:
      pw2 = pw.copy(); pw2[2] = max(zmin - 0.002, pw[2] - 0.018)
      v.co = mwi @ Vector(pw2)
  # the arch: under the instep the sole lifts off the ground between the heel and the tread, 7 mm at most
  for S2 in ("L", "R"):
    a_ = an[S2]; f0 = fro(a_)
    for v in bm.verts:
      pw = np.array(tuple(mw @ v.co))
      if abs(pw[2] - (zmin - 0.002)) < 2e-4 and (lat(pw) > 0) == (S2 == "L"):
        u4 = (fro(pw) - f0 - 0.01) / 0.085
        if 0 < u4 < 1: pw[2] += 0.007 * math.sin(math.pi * u4) ** 0.8; v.co = mwi @ Vector(pw)
  thicken_edges(bm, 0.006)
  L("boots made", len(bm.faces))
  bm.to_mesh(bt.data); bm.free(); made["boots"] = bt
  # the top band, raised 2 mm, 4 cm deep
  topZ = zmin + BOOT * H
  # (no raised band at the top: cut from the shaft and turned under, its edge threw a row of small spikes round the
  # rim; the band is drawn in the textures instead)
  parts["band"] = None
  # the rand: the sole's moulded edge, a band of rubber 2.8 cm high round the foot standing 3 mm proud of the upper
  parts["sole"] = cut_part(bt, "fd2_boots_sole", slab(UP, -0.02, 0.028, np.array([cx, cy, zmin])), lambda c, n: n[2] > -0.45, 0.003, 0.003)
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
  # how far each point is in from the beard's edge, along the face (the shortest way over its edges): the hair thins to
  # nothing over the last centimetre or so, so the beard has no outline
  import heapq
  bmb.verts.index_update(); bmb.verts.ensure_lookup_table()
  vidx = {v.index: v for v in bmb.verts}
  Edist = {v.index: (0.0 if v.is_boundary else 9.0) for v in bmb.verts}
  heap = [(0.0, i) for i, d in Edist.items() if d == 0.0]; heapq.heapify(heap)
  while heap:
    d0, i = heapq.heappop(heap)
    if d0 > Edist[i]: continue
    v = vidx[i]; pv = np.array(tuple(mw @ v.co))
    for e in v.link_edges:
      o = e.other_vert(v); d1 = d0 + float(np.linalg.norm(np.array(tuple(mw @ o.co)) - pv))
      if d1 < Edist[o.index]: Edist[o.index] = d1; heapq.heappush(heap, (d1, o.index))
  L("beard depth from its edge: most", round(max(Edist.values()), 3), "m")
  # the body points of the beard (for the stubble drawn on the skin under and round it)
  beard_pts = np.array([tuple(mw @ v.co) for v in bmb.verts]); beard_E = np.array([Edist[v.index] for v in bmb.verts])
  # three layers of hair: close to the skin and dense over all of it, then two further out over less of it (in from
  # the edge 6 and 12 mm), so the beard is thick in the middle and thins out at its edges
  SHELLS = [("fd2_beard", 0.0007, 0.0, 0.0012), ("fd2_beard_b", 0.0017, 0.006, 0.0016), ("fd2_beard_c", 0.0028, 0.012, 0.0020)]
  for nm, lift, inset, extra in SHELLS:
    b2 = bmb.copy(); b2.verts.index_update(); b2.verts.ensure_lookup_table()
    E2 = [Edist[v.index] for v in bmb.verts]
    lay = b2.verts.layers.float.new("fd_edge")
    for k3, v in enumerate(b2.verts): v[lay] = E2[k3]
    if inset > 0:
      bad = [f for f in b2.faces if min(v[lay] for v in f.verts) < inset]
      bmesh.ops.delete(b2, geom=bad, context="FACES"); bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context="VERTS")
    if not b2.faces: b2.free(); continue
    b2.normal_update()
    for v in b2.verts:
      pw = np.array(tuple(mw @ v.co)); w = beard_w(pw); ramp = min(1.0, v[lay] / 0.012)
      v.co += v.normal * ((lift + extra * w * ramp) / S)
    subdivide(b2)
    ob = body.copy(); ob.data = body.data.copy(); ob.name = nm; bpy.context.collection.objects.link(ob); b2.to_mesh(ob.data); b2.free()
    parts["beard_" + nm] = ob if BEARD else None
    if not BEARD: bpy.data.objects.remove(ob, do_unlink=True)
  # the head's own surface written out for its textures (the stubble's shadow on the skin, the skin's roughness, finer
  # detail): every head triangle where he stands, its uvs, and how much beard is over or near each point
  kbe = KDTree(len(beard_pts))
  for i3, p3 in enumerate(beard_pts): kbe.insert(Vector(p3), i3)
  kbe.balance()
  dgh = bpy.context.evaluated_depsgraph_get(); eh = body.evaluated_get(dgh); mh = eh.to_mesh(); mh.calc_loop_triangles(); uvh = mh.uv_layers.active.data
  Ph = np.array([tuple(eh.matrix_world @ v.co) for v in mh.vertices]); Nh = np.array([tuple((eh.matrix_world.to_3x3() @ v.normal).normalized()) for v in mh.vertices])
  Wv = np.zeros(len(Ph))
  for i3 in range(len(Ph)):
    if kinds[i3] != "head" or not BEARD: continue
    _, j3, d3 = kbe.find(Vector(Ph[i3]))
    if d3 < 0.004: Wv[i3] = min(1.0, 0.45 + beard_E[j3] / 0.012)
    else: Wv[i3] = max(0.0, 0.45 * (1 - (d3 - 0.004) / 0.016))
    if in_mouth(Ph[i3]): Wv[i3] = 0.0
  HP, HN, HU, HW, HT = [], [], [], [], []; base3 = 0
  for tri in mh.loop_triangles:
    if mh.polygons[tri.polygon_index].material_index not in head_slot: continue
    for li, vi in zip(tri.loops, tri.vertices): HP.append(Ph[vi]); HN.append(Nh[vi]); HU.append(tuple(uvh[li].uv)); HW.append(Wv[vi])
    HT.append([base3, base3 + 1, base3 + 2]); base3 += 3
  eh.to_mesh_clear()
  eyes = [bh[n].tolist() for n in bh if n.endswith("LEye") or n.endswith("REye")]
  np.savez_compressed(f"{DST}/{TAG}_head.npz", P=np.array(HP, np.float32), N=np.array(HN, np.float32), UV=np.array(HU, np.float32), W=np.array(HW, np.float32), T=np.array(HT, np.int32), K=np.zeros(len(HT), np.int16), names=np.array(["head"]),
                      frame=np.array([cx, cy, zmin, H, *fwd, *side], np.float32), bones=np.array([json.dumps({k: v.tolist() for k, v in bh.items()})]), mouth=np.array([*mc, hw], np.float32), eyes=np.array(eyes, np.float32))
  L("head written", len(HT), "triangles; beard over", int((np.array(HW) > 0.4).sum() / 3), "of them")

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
    if ob.name in ("fd2_jacket_collar", "fd2_jacket_hood", "fd2_jacket_studs", "fd2_jacket_toggles", "fd2_boots_buckles", "fd2_jacket_cufftabs", "fd2_boots", "fd2_boots_sole"):
      # (each point takes the weights of the body's nearest point, both in the mesh's own numbers; the boots too, their
      # shaft built ring by ring from the ankle, so it moves with the calf, not the foot)
      ob.vertex_groups.clear()
      gs = [ob.vertex_groups.new(name=g.name) for g in body.vertex_groups]
      for v in ob.data.vertices:
        _, bi, _ = kdd.find(v.co)
        for g in body.data.vertices[bi].groups:
          if g.weight > 0: gs[g.group].add([v.index], g.weight, "REPLACE")
      if not any(m.type == "ARMATURE" for m in ob.modifiers): am = ob.modifiers.new("Armature", "ARMATURE"); am.object = arm
      if ob.parent != arm: ob.parent = arm; ob.matrix_parent_inverse = arm.matrix_world.inverted()   # (kept where it is; a copy of the body is already under it, as the body is)
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
    Ps, Ns, Us, Ts, Ks, names, Es = [], [], [], [], [], [], []; base = 0
    for pi, o in enumerate(obs):
      # (as he stands, posed by the skeleton: the frame the textures are drawn in)
      dg = bpy.context.evaluated_depsgraph_get(); eo = o.evaluated_get(dg); me = eo.to_mesh(); me.calc_loop_triangles(); uv = me.uv_layers.active.data
      vw = np.array([tuple(eo.matrix_world @ v.co) for v in me.vertices]); nw = np.array([tuple((eo.matrix_world.to_3x3() @ v.normal).normalized()) for v in me.vertices])
      ea = me.attributes.get("fd_edge"); ev2 = [a.value for a in ea.data] if ea is not None and len(ea.data) == len(me.vertices) else None
      for tri in me.loop_triangles:
        for li, vi in zip(tri.loops, tri.vertices): Ps.append(vw[vi]); Ns.append(nw[vi]); Us.append(tuple(uv[li].uv)); Es.append(ev2[vi] if ev2 else 1.0)
        Ts.append([base, base + 1, base + 2]); Ks.append(pi); base += 3
      names.append(o.name); eo.to_mesh_clear()
    np.savez_compressed(f"{DST}/{TAG}_{key}.npz", P=np.array(Ps, np.float32), N=np.array(Ns, np.float32), UV=np.array(Us, np.float32), T=np.array(Ts, np.int32), K=np.array(Ks, np.int16), names=np.array(names), E=np.array(Es, np.float32),
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
