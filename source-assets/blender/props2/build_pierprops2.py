# FishDock: the pier's furniture, round 2, exported as pierprops.glb (replaces build_pierprops.py's)
#   lamp     Poly Haven street_lamp_01 (CC0), as before, its textures cut to 512 px for phones
#   station  a moulded red lifebuoy housing on a galvanised post with a bolted foot, its name board and the
#            999 notice (station_sign.jpg, drawn for FishDock), holding Poly Haven's lifebuoy (CC0) at 750 mm
#   bollard  a cast-iron mooring bollard: flanged foot bolted down, waisted body, a mushroom head with a lip
#   bench    a seaside bench: cast-iron ends with scrolled arms, back and feet (a rounded section swept along each
#            curve), hardwood slats with rounded edges textured with Poly Haven's brown_planks_03 (CC0), each slat
#            cut from its own board, carriage bolts where they meet the ends
# Each in three.js's frame (y up, metres), standing on the origin, its front towards +z. Attachment empties: att_*.
# The material names the game weathers (glbParts.js PROP_WEAR): cast_iron, galvanised, housing_red, bench_slat.
# Writes exports/pierprops.glb, source/pierprops2/pierprops2.blend and grey-free preview renders in renders/props2.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"; DL = OUT + "/downloads/polyhaven"; TX = OUT + "/textures/props2"
REND = OUT + "/renders/props2"; os.makedirs(REND, exist_ok=True)
P = lambda x, y, z: Vector((x, -z, y))  # three.js (x, y up, z front) -> Blender
def L(*a): print(*a, flush=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.cameras, bpy.data.lights): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection

# ---- materials ----
def mat(name, rgb, metal=0.0, rough=0.5):
  m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
  b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
  return m
def tex_mat(name, diff, nor=None, orm=None, rough=0.8):
  m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
  def img(path, data):
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(path)
    if data: n.image.colorspace_settings.name = "Non-Color"
    return n
  d = img(diff, False); nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
  if nor:
    n = img(nor, True); nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
  if orm:
    o = img(orm, True); sp = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(o.outputs["Color"], sp.inputs["Color"])
    nt.links.new(sp.outputs["Green"], b.inputs["Roughness"]); nt.links.new(sp.outputs["Blue"], b.inputs["Metallic"])
  else: b.inputs["Roughness"].default_value = rough
  b.inputs["Metallic"].default_value = 0.0
  return m
M = {"iron": mat("cast_iron", (0.035, 0.04, 0.045), 0.35, 0.55), "red": mat("housing_red", (0.5, 0.06, 0.04), 0.05, 0.45),
     "galv": mat("galvanised", (0.55, 0.57, 0.58), 0.75, 0.5),
     "slat": tex_mat("bench_slat", TX + "/bench_slat_diff.jpg", TX + "/bench_slat_nor.jpg", TX + "/bench_slat_orm.jpg"),
     "sign": tex_mat("station_sign", TX + "/station_sign.jpg", rough=0.45)}

def obj(name, me, m, parent=None, smooth=True):
  o = bpy.data.objects.new(name, me); col.objects.link(o)
  for mm in (m if isinstance(m, (list, tuple)) else [m]): o.data.materials.append(mm)
  if parent: o.parent = parent
  if smooth is not None:
    for p in o.data.polygons: p.use_smooth = smooth
  return o
def bevel(o, w=0.006, seg=2):
  b = o.modifiers.new("bevel", "BEVEL"); b.width = w; b.segments = seg; b.limit_method = "ANGLE"
  o.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
def box(name, sx, sy, sz, centre, m, parent=None, bw=0.006, seg=2, rot=None):
  # sx, sy, sz in three's axes (width, height, depth)
  me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
  bm.to_mesh(me); bm.free()
  o = obj(name, me, m, parent, smooth=False); o.location = centre
  if rot: o.rotation_euler = rot
  if bw: bevel(o, bw, seg)
  return o
def root(name):
  e = bpy.data.objects.new(name, None); col.objects.link(e); return e
def att(name, parent, p):
  e = bpy.data.objects.new(name, None); col.objects.link(e); e.parent = parent; e.location = p; return e
def import_ph(path, name, size=512):
  before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
  new = [o for o in bpy.data.objects if o not in before]
  for o in new:
    if o.type == "MESH":
      for s in o.material_slots:
        if s.material and s.material.use_nodes:
          for n in s.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and max(n.image.size) > size: n.image.scale(size, size)
  r = root(name)
  for o in new:
    if o.parent is None: o.parent = r
  return r, new

# ---- shapes: a lathe with uvs, a section swept along a path, smooth curves and scrolls ----
def lathe(name, prof, m, parent=None, seg=32, cap_top=True, cap_bottom=False, uv_v=1.0):
  # prof: [(radius, height)] from the bottom up, turned about three's y; u round, v along the profile (metres * uv_v)
  me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); rings = []; vs = [0.0]
  for i in range(1, len(prof)): vs.append(vs[-1] + math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]))
  for r, h in prof: rings.append([bm.verts.new(P(r * math.cos(2 * math.pi * k / seg), h, r * math.sin(2 * math.pi * k / seg))) for k in range(seg)])
  for i in range(len(rings) - 1):
    a, b = rings[i], rings[i + 1]
    for k in range(seg):
      f = bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
      u0, u1 = k / seg, (k + 1) / seg
      for lp, uv in zip(f.loops, ((u0, vs[i]), (u1, vs[i]), (u1, vs[i + 1]), (u0, vs[i + 1]))): lp[uvl].uv = (uv[0], uv[1] * uv_v)
  caps = []
  if cap_top and prof[-1][0] > 1e-4: caps.append(bm.faces.new(rings[-1]))
  if cap_bottom and prof[0][0] > 1e-4: caps.append(bm.faces.new(list(reversed(rings[0]))))
  for f in caps:
    for lp in f.loops: c = lp.vert.co; lp[uvl].uv = (0.5 + c.x, 0.5 + c.y)
  bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)  # (a profile that closes to a point)
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
  o = obj(name, me, m, parent)
  for p in o.data.polygons:
    if p.normal.z > 0.999 or p.normal.z < -0.999: p.use_smooth = len(p.vertices) < 5
  return o
def rrect(w, h, r, n=2):
  # a rounded rectangle, w across the first axis, h the second, corners of radius r in n steps: [(a, b)]
  out = []
  for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
    for k in range(n + 1):
      t = math.radians(a0 + 90 * k / n); out.append((cx + r * math.cos(t), cy + r * math.sin(t)))
  return out
def sweep(name, pts, sec, side, m, parent=None, uv=(0.0, 1.0, 0.0, 1.0), caps=True, taper=None):
  # pts: Blender-space points along the path; sec: the section [(a, b)], a across the path in its plane, b along
  # `side` (a fixed direction: the thickness); uv = (u0, u width for the whole perimeter, v0, v per metre)
  # taper: a function of the path's fraction (0-1) scaling the section (a scroll thinning to its eye)
  me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
  n, ns = len(pts), len(sec); Ls = [0.0]
  for i in range(1, n): Ls.append(Ls[-1] + (pts[i] - pts[i - 1]).length)
  per = [0.0]
  for k in range(ns): per.append(per[-1] + math.hypot(sec[(k + 1) % ns][0] - sec[k][0], sec[(k + 1) % ns][1] - sec[k][1]))
  rings = []
  for i, p in enumerate(pts):
    t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
    b = (side - t * side.dot(t)).normalized(); a = t.cross(b)
    s = taper(Ls[i] / max(Ls[-1], 1e-6)) if taper else 1.0
    rings.append([bm.verts.new(p + a * (x * s) + b * (y * s)) for x, y in sec])
  u0, uw, v0, vm = uv
  for i in range(n - 1):
    for k in range(ns):
      k2 = (k + 1) % ns; f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
      ua, ub = u0 + uw * per[k] / per[-1], u0 + uw * per[k + 1] / per[-1]
      for lp, q in zip(f.loops, ((ua, Ls[i]), (ub, Ls[i]), (ub, Ls[i + 1]), (ua, Ls[i + 1]))): lp[uvl].uv = (q[0], v0 + q[1] * vm)
  capf = []
  if caps:
    capf = [bm.faces.new(list(reversed(rings[0]))), bm.faces.new(rings[-1])]
    for f, vv in ((capf[0], Ls[0]), (capf[1], Ls[-1])):
      for lp in f.loops:
        k = rings[0].index(lp.vert) if lp.vert in rings[0] else rings[-1].index(lp.vert)
        lp[uvl].uv = (u0 + uw * (0.5 + sec[k][0] * 2.0), v0 + vv * vm + sec[k][1] * 2.0)
  bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
  bm.to_mesh(me); bm.free()
  o = obj(name, me, m, parent)
  if caps:
    for p in o.data.polygons[-2:]: p.use_smooth = False
  return o
def centripetal(ctrl, per_seg=14):
  # a smooth curve through 2D points (centripetal Catmull-Rom: no loops or overshoot at uneven spacing)
  pts = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
  pts[0] = (2 * pts[1][0] - pts[2][0], 2 * pts[1][1] - pts[2][1]); pts[-1] = (2 * pts[-2][0] - pts[-3][0], 2 * pts[-2][1] - pts[-3][1])
  out = []
  for i in range(1, len(pts) - 2):
    p0, p1, p2, p3 = [Vector(p) for p in pts[i - 1:i + 3]]
    t0 = 0.0; t1 = t0 + max((p1 - p0).length ** 0.5, 1e-4); t2 = t1 + max((p2 - p1).length ** 0.5, 1e-4); t3 = t2 + max((p3 - p2).length ** 0.5, 1e-4)
    for s in range(per_seg):
      t = t1 + (t2 - t1) * s / per_seg
      A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1; A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2; A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
      B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2; B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
      out.append((t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2)
  out.append(Vector(ctrl[-1]))
  return [(v.x, v.y) for v in out]
def scroll(pts, r0, r1, turn_deg, curl, steps=None):
  # carries a 2D curve on into a scroll: a spiral from its last point, the way it was heading, its radius going from
  # r0 to r1 over turn_deg; curl +1 or -1 picks the side it curls to
  (ax, ay), (bx, by) = pts[-2], pts[-1]; d = Vector((bx - ax, by - ay)).normalized()
  nrm = Vector((-d.y, d.x)) * curl; c = Vector((bx, by)) + nrm * r0; v0 = (Vector((bx, by)) - c).normalized()
  s = 1 if Vector((-v0.y, v0.x)).dot(d) > 0 else -1
  steps = steps or max(8, int(turn_deg / 20)); out = []
  for k in range(1, steps + 1):
    f = k / steps; a = math.radians(turn_deg * f) * s; r = r0 + (r1 - r0) * f
    out.append(((c.x + (v0.x * math.cos(a) - v0.y * math.sin(a)) * r), (c.y + (v0.x * math.sin(a) + v0.y * math.cos(a)) * r)))
  return pts + out
def thin(pts, turn=8.0, maxlen=0.06):
  # drop points along nearly straight stretches (fewer rings where nothing bends)
  out = [pts[0]]; last_d = None
  for i in range(1, len(pts) - 1):
    d0 = Vector(pts[i]) - Vector(out[-1]); d1 = Vector(pts[i + 1]) - Vector(pts[i])
    if d0.length < 1e-5: continue
    ang = math.degrees(d0.angle(d1)) if d1.length > 1e-6 else 0
    if ang > turn or d0.length > maxlen: out.append(pts[i])
  out.append(pts[-1]); return out

# ---- the lamp: Poly Haven's street lamp as it comes (3.87 m), its lantern lit at night by FishDock ----
lamp, parts = import_ph(DL + "/street_lamp_01/street_lamp_01_1k.gltf", "lamp")
att("att_light", lamp, P(0, 3.27, 0)); att("att_perch", lamp, P(0, 3.88, 0))
lamp.location = Vector((-4, 0, 0))

# ---- the lifebuoy station ----
# A moulded GRP housing (red, every edge rounded) open at the front, a lip along the sill that holds the buoy in, a
# fascia board across the top lettered LIFEBUOY and the 999 notice on the back panel, seen through the buoy's middle.
# On a 76 mm galvanised post with a domed cap, clamped to it by two U-bolts, the post welded to a square foot plate
# bolted to the deck. The buoy is Poly Haven's, sized to a standard 750 mm ring.
st = root("station")
PZ = -0.075; Y0, Y1 = 0.46, 1.56; HW = 0.43; ZB, ZF = -0.035, 0.165
lathe("post", [(0.046, 0.012), (0.04, 0.03), (0.038, 0.05), (0.038, 1.5), (0.041, 1.505), (0.041, 1.52), (0.03, 1.535), (0.0, 1.54)], M["galv"], st, seg=20).location = P(0, 0, PZ)
box("foot_plate", 0.2, 0.012, 0.2, P(0, 0.006, PZ), M["galv"], st, 0.004)
for sx in (-1, 1):
  for sz in (-1, 1):
    lathe(f"foot_bolt{sx}{sz}", [(0.013, 0.0), (0.013, 0.008), (0.009, 0.011), (0.006, 0.016), (0.0, 0.017)], M["galv"], st, seg=6).location = P(sx * 0.072, 0.012, PZ + sz * 0.072)
box("back", HW * 2, Y1 - Y0, 0.02, P(0, (Y0 + Y1) / 2, ZB + 0.01), M["red"], st, 0.008, 3)
for sx in (-1, 1):
  box(f"side{sx}", 0.026, Y1 - Y0, ZF - ZB, P(sx * (HW - 0.013), (Y0 + Y1) / 2, (ZB + ZF) / 2), M["red"], st, 0.01, 3)
  box(f"flange{sx}", 0.04, Y1 - Y0 - 0.02, 0.012, P(sx * (HW - 0.018), (Y0 + Y1) / 2, ZF - 0.002), M["red"], st, 0.005, 2)  # the lip round the opening
box("hood", HW * 2 + 0.05, 0.03, ZF - ZB + 0.06, P(0, Y1 + 0.006, (ZB + ZF) / 2 + 0.02), M["red"], st, 0.012, 3, rot=(math.radians(5), 0, 0))
box("sill", HW * 2, 0.032, ZF - ZB, P(0, Y0 + 0.016, (ZB + ZF) / 2), M["red"], st, 0.01, 3)
box("sill_lip", HW * 2 - 0.04, 0.07, 0.016, P(0, Y0 + 0.05, ZF - 0.008), M["red"], st, 0.006, 2)
box("fascia", HW * 2 - 0.03, 0.15, 0.016, P(0, Y1 - 0.09, ZF - 0.008), M["red"], st, 0.006, 2)
for yy in (0.62, 1.25):  # the U-bolt clamps round the post, their nuts on studs through the back panel
  pts = [P(0.044 * math.cos(math.radians(a)), yy, PZ + 0.044 * math.sin(math.radians(a))) for a in range(0, -181, -15)]
  pts = [P(0.044, yy, ZB)] + pts + [P(-0.044, yy, ZB)]
  sweep("clamp", pts, rrect(0.009, 0.009, 0.0044, 2), Vector((0, 0, 1)), M["galv"], st, caps=True)
  for sx in (-1, 1): lathe("nut", [(0.009, 0.0), (0.009, 0.008), (0.0, 0.008)], M["galv"], st, seg=6).matrix_world = Matrix.Translation(P(sx * 0.044, yy, ZB + 0.02)) @ Matrix.Rotation(math.radians(90), 4, "X")
# the signs: name board on the fascia, the notice on the back panel (uv cut from station_sign.jpg: the board its top
# quarter, the notice the left half below it)
def quad(name, cx, cy, z, w, h, uv, m, parent):
  me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
  vs = [bm.verts.new(P(cx + sx * w / 2, cy + sy * h / 2, z)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
  f = bm.faces.new(vs)
  (u0, v0, u1, v1) = uv
  for lp, q in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))): lp[uvl].uv = q
  bm.normal_update()
  if f.normal.dot(Vector((0, -1, 0))) < 0: f.normal_flip()  # facing out (+z in three: -y in Blender)
  bm.to_mesh(me); bm.free(); return obj(name, me, m, parent, smooth=False)
quad("name_board", 0, Y1 - 0.09, ZF + 0.0005, 0.58, 0.145, (0.0, 0.75, 1.0, 1.0), M["sign"], st)
BUOY_Y = Y0 + 0.07 + 0.375 + 0.005
quad("notice", 0, BUOY_Y, ZB + 0.0205, 0.2, 0.25, (0.0, 0.0625, 0.5, 0.6875), M["sign"], st)
att("att_plate", st, P(0, Y1 - 0.09, ZF + 0.002))
buoy, bparts = import_ph(DL + "/lifebuoy/lifebuoy_1k.gltf", "buoy")
buoy.parent = st
# (Poly Haven's buoy stands in its own x-y plane, z thin: as imported it faces three's +z already) sized to 750 mm
bpy.context.view_layer.update()
mins = Vector((1e9, 1e9, 1e9)); maxs = Vector((-1e9, -1e9, -1e9))
for o in bparts:
  if o.type == "MESH":
    for v in o.data.vertices:
      w = o.matrix_world @ v.co; mins = Vector(map(min, mins, w)); maxs = Vector(map(max, maxs, w))
dims = maxs - mins; L("buoy as imported", [round(x, 3) for x in dims])
k = 0.75 / max(dims.x, dims.z); buoy.scale = (k, k, k)
ctr = (mins + maxs) / 2
buoy.location = P(0, BUOY_Y, (ZB + 0.02 + ZF - 0.016) / 2) - Vector((ctr.x, ctr.y, ctr.z)) * k
st.location = Vector((-2, 0, 0))

# ---- the bollard: a cast-iron mooring post, flanged foot bolted down, a mushroom head with a lip ----
bo = root("bollard")
lathe("bollard_body", [(0.205, 0.0), (0.205, 0.022), (0.198, 0.03), (0.17, 0.034), (0.15, 0.048), (0.137, 0.075), (0.128, 0.11),
                       (0.122, 0.2), (0.121, 0.3), (0.124, 0.37), (0.132, 0.405), (0.152, 0.428), (0.18, 0.447), (0.196, 0.465),
                       (0.199, 0.478), (0.193, 0.492), (0.178, 0.503), (0.15, 0.512), (0.11, 0.518), (0.05, 0.521), (0.0, 0.522)], M["iron"], bo, seg=36)
for k6 in range(6):
  a = math.radians(30 + 60 * k6); x, z = 0.178 * math.cos(a), 0.178 * math.sin(a)
  lathe(f"bolt{k6}", [(0.019, 0.0), (0.019, 0.012), (0.009, 0.014), (0.008, 0.024), (0.0, 0.026)], M["iron"], bo, seg=6).location = P(x, 0.02, z)
bo.location = Vector((0, 0, 0))

# ---- the bench ----
# The ends in the y-z plane (z forward), at x = +-EX: front leg rising from a scrolled foot into the arm's support;
# the back leg rising from its foot, through the seat, on up and back as the back's upright to a scroll; the seat
# rail between them; the arm from the upright forward to a scroll curling down; a C scroll under the seat. Every
# piece a rounded section (cast iron's soft edges) swept along its curve. Five seat slats and three back slats with
# rounded edges, each cut along the grain from its own board of the planks texture; a tie bar under the seat.
be = root("bench"); EX = 0.84
SEC = rrect(0.044, 0.024, 0.008, 1); SEC_ARM = rrect(0.032, 0.058, 0.01, 2); SEC_RAIL = rrect(0.04, 0.022, 0.007, 1)  # (the arm, seen most, a rounder section)
XS = Vector((1, 0, 0))
def end_piece(name, ctrl, sec, scr=None, taper=None):
  pts = centripetal(ctrl)
  if scr: pts = scroll(pts, *scr)
  pts = thin(pts, 12.0, 0.08)
  for sx in (-1, 1): sweep(f"{name}{sx}", [P(sx * EX, y, z) for y, z in pts], sec, XS, M["iron"], be, taper=taper)
  return pts
BACK0, BACKD = Vector((0.385, -0.205)), Vector((0.966, -0.259)); BACKN = Vector((0.259, 0.966))
bk = lambda s: BACK0 + BACKD * s
front = end_piece("leg_front", [(0.022, 0.33), (0.024, 0.3), (0.045, 0.265), (0.11, 0.25), (0.24, 0.252), (0.4, 0.268), (0.52, 0.28), (0.6, 0.282), (0.646, 0.27)], SEC, scr=None)
# the foot's toe curled up and over at the front
toe = end_piece("toe", [(0.035, 0.3), (0.024, 0.33), (0.03, 0.355)], rrect(0.03, 0.024, 0.008, 1), scr=(0.022, 0.008, 250, -1), taper=lambda f: 1.0 - 0.35 * f)
back = end_piece("leg_back", [(0.022, -0.37), (0.026, -0.335), (0.06, -0.29), (0.16, -0.245), (0.3, -0.215), tuple(bk(0)), tuple(bk(0.15)), tuple(bk(0.3)), tuple(bk(0.42)), tuple(bk(0.5))], SEC,
                  scr=(0.032, 0.01, 330, -1), taper=lambda f: 1.0 - 0.3 * max(0.0, (f - 0.8) / 0.2))
heel = end_piece("heel", [(0.035, -0.34), (0.024, -0.37), (0.03, -0.395)], rrect(0.03, 0.024, 0.008, 1), scr=(0.02, 0.008, 250, 1), taper=lambda f: 1.0 - 0.35 * f)
rail = end_piece("seat_rail", [(0.4, 0.24), (0.395, 0.1), (0.388, -0.05), (0.383, -0.2)], SEC_RAIL)
ay = 0.66; az0 = (bk((ay - 0.385) / 0.966)).y
arm = end_piece("arm", [(ay - 0.004, az0), (ay, az0 + 0.1), (ay + 0.004, 0.08), (ay, 0.23), (ay - 0.012, 0.285)], SEC_ARM, scr=(0.036, 0.012, 300, 1), taper=lambda f: 1.0 - 0.45 * max(0.0, (f - 0.7) / 0.3))
cs = end_piece("c_scroll", [(0.38, 0.08), (0.33, 0.06), (0.27, 0.0), (0.24, -0.08)], rrect(0.026, 0.02, 0.007, 1), scr=(0.05, 0.014, 290, 1), taper=lambda f: 1.0 - 0.4 * max(0.0, (f - 0.5) / 0.5))
# the tie bar under the seat, nutted outside each end
sweep("tie_bar", [P(-EX - 0.03, 0.27, 0.0), P(EX + 0.03, 0.27, 0.0)], rrect(0.018, 0.018, 0.0089, 3), Vector((0, 0, 1)), M["iron"], be)
for sx in (-1, 1):
  n = lathe("tie_nut", [(0.016, 0.0), (0.016, 0.012), (0.011, 0.016), (0.0, 0.016)], M["iron"], be, seg=6)
  n.matrix_world = Matrix.Translation(P(sx * (EX + 0.012), 0.27, 0.0)) @ Matrix.Rotation(math.radians(90 * sx), 4, "Y")
# the slats: (board in the planks texture: its u range, cut away from the joints between boards)
BOARDS = [(10 / 512, 82 / 512), (132 / 512, 71 / 512), (243 / 512, 71 / 512), (354 / 512, 64 / 512)]
TEXM = 2.7  # metres the texture's height stands for (its boards about 27 cm wide)
SLX = 0.915
def slat(name, centre_yz, width, thick, up_yz, k):
  u0, uw = BOARDS[k % 4]; v0 = (k * 0.37) % 1.0
  y, z = centre_yz; up = P(0, up_yz[0], up_yz[1]) - P(0, 0, 0)
  sec = rrect(width, thick, min(0.009, thick * 0.42), 2)
  o = sweep(name, [P(-SLX, y, z), P(SLX, y, z)], sec, up, M["slat"], be, uv=(u0, uw, v0, 1 / TEXM))
  return o
rail_top = lambda z: 0.4 + (z - 0.24) * (0.017 / 0.44) + 0.02
SEAT_Z = [0.205, 0.12, 0.035, -0.05, -0.135]
for k, z in enumerate(SEAT_Z): slat(f"seat{k}", (rail_top(z) + 0.0135, z), 0.068, 0.027, (1, 0), k)
BACK_S = [0.2, 0.31, 0.42]
for k, s in enumerate(BACK_S):
  c = bk(s) + BACKN * (0.022 + 0.0125); slat(f"back{k}", (c.x, c.y), 0.09, 0.025, (BACKN.x, BACKN.y), k + 5)
# carriage bolts: a low dome on each slat over each end
def dome(name, at, nrm):
  o = lathe(name, [(0.009, 0.0), (0.0065, 0.004), (0.0, 0.0055)], M["iron"], be, seg=6)
  q = Vector((0, 0, 1)).rotation_difference(nrm); o.matrix_world = Matrix.Translation(at) @ q.to_matrix().to_4x4()
for sx in (-1, 1):
  for k, z in enumerate(SEAT_Z): dome(f"bolt_s{k}{sx}", P(sx * EX, rail_top(z) + 0.027 - 0.0005, z), Vector((0, 0, 1)))
  for k, s in enumerate(BACK_S):
    c = bk(s) + BACKN * (0.022 + 0.025 - 0.0005); dome(f"bolt_b{k}{sx}", P(sx * EX, c.x, c.y), (P(0, BACKN.x, BACKN.y) - P(0, 0, 0)).normalized())
be.location = Vector((2.5, 0, 0))

# ---- for phones: each piece one mesh (a draw call per material), the scanned models thinned ----
def join_under(r, decimate=None):
  kids = [o for o in r.children_recursive if o.type == "MESH"]
  bpy.ops.object.select_all(action="DESELECT")
  for o in kids:
    o.select_set(True); bpy.context.view_layer.objects.active = o
    for mo in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mo.name)
  if decimate:
    for o in kids:
      n0 = len(o.data.polygons)
      if n0 > 2000:
        if o.data.users > 1: o.data = o.data.copy()
        d = o.modifiers.new("dec", "DECIMATE"); d.ratio = decimate; d.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get(); new = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.remove(d); o.data = new
        L("DECIMATE", o.name, n0, "->", len(new.polygons))
  for o in kids:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
  bpy.ops.object.select_all(action="DESELECT")
  for o in kids: o.select_set(True)
  bpy.context.view_layer.objects.active = kids[0]; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  bpy.ops.object.join(); j = bpy.context.view_layer.objects.active; j.name = r.name + "_mesh"
  j.parent = r; j.matrix_parent_inverse = r.matrix_world.inverted()
  return j
for r in (lamp, st, bo, be): r["home"] = list(r.location); r.location = Vector((0, 0, 0))
bpy.context.view_layer.update()
# (every part's uv map named alike before they're joined: a box with none, or the buoy's under its own name, left the
# joined mesh's maps mismatched and the exported sign and buoy textures pointing at no uv map at all)
for r in (lamp, st, bo, be):
  for o in r.children_recursive:
    if o.type != "MESH": continue
    uvs = o.data.uv_layers
    if not len(uvs): uvs.new(name="UVMap")
    while len(uvs) > 1: uvs.remove(uvs[-1])
    uvs[0].name = "UVMap"; uvs.active = uvs[0]; uvs[0].active_render = True
    for s in o.material_slots:
      if s.material and s.material.node_tree:
        for nd in s.material.node_tree.nodes:
          if nd.type == "UVMAP": nd.uv_map = "UVMap"
          if nd.type == "NORMAL_MAP": nd.uv_map = "UVMap"
J = {}
J["lamp"] = join_under(lamp, 0.06); J["station"] = join_under(st, 0.08); J["bollard"] = join_under(bo); J["bench"] = join_under(be)
for n in ("buoy",):
  e = bpy.data.objects.get(n)
  if e: bpy.data.objects.remove(e, do_unlink=True)
dg = bpy.context.evaluated_depsgraph_get(); tris = 0
for k, o in J.items():
  me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); n = len(me.loop_triangles); tris += n
  bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; lo = Vector(map(min, *bb)); hi = Vector(map(max, *bb))
  L("PIECE", k, n, "triangles", "size (three x, y, z):", round(hi.x - lo.x, 3), round(hi.z - lo.z, 3), round(hi.y - lo.y, 3), "materials:", [m.name for m in o.data.materials])
os.makedirs(OUT + "/source/pierprops2", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/pierprops2/pierprops2.blend")
EXPORT = globals().get("EXPORT_TO", OUT + "/exports/pierprops.glb")
kw = dict(filepath=EXPORT, export_format="GLB", export_apply=True, export_yup=True, export_extras=False, export_cameras=False, export_lights=False, export_image_format="WEBP")
try: bpy.ops.export_scene.gltf(**kw, export_image_quality=84)
except TypeError: bpy.ops.export_scene.gltf(**kw)
for r in (lamp, st, bo, be): r.location = Vector(r["home"])
bpy.context.view_layer.update()
L("PROPS DONE", tris, "triangles", os.path.getsize(EXPORT) // 1000, "kB", EXPORT)

# ---- renders to check the shapes: each piece from the front, three-quarter, side and close ----
sc = bpy.context.scene; eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 900, 700; sc.render.image_settings.file_format = "JPEG"
w2 = bpy.data.worlds.new("w"); sc.world = w2; w2.use_nodes = True; w2.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1); w2.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.2; sun.rotation_euler = (0.85, 0.15, 2.4); col.objects.link(sun)
me = bpy.data.meshes.new("ground"); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12); bm.to_mesh(me); bm.free()
gnd = obj("ground", me, mat("ground", (0.32, 0.31, 0.29), 0, 0.9), None, False)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); col.objects.link(cam); sc.camera = cam
for name, r, h, dist in (("bench", be, 0.85, 2.6), ("station", st, 1.56, 3.2), ("bollard", bo, 0.52, 1.6), ("lamp", lamp, 3.9, 7.0)):
  base = r.matrix_world.translation
  for tag, yaw, el, dk, lens in (("front", 0, 0.12, 1.0, 50), ("q", 35, 0.25, 1.0, 50), ("side", 90, 0.1, 1.0, 50), ("close", 20, 0.35, 0.5, 50)):
    if name == "lamp" and tag == "close": continue
    a = math.radians(yaw); fwd = P(math.sin(a), 0, math.cos(a)) - P(0, 0, 0)
    tgt = base + Vector((0, 0, h * (0.62 if tag == "close" else 0.5)))
    cam.location = tgt + fwd * dist * dk + Vector((0, 0, dist * dk * el)); cam.data.lens = lens
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{REND}/{name}_{tag}.jpg"; bpy.ops.render.render(write_still=True)
L("RENDERS DONE", REND)
