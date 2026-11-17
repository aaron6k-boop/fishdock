# FishDock: the sea-spinning rod and reel, modelled in Blender and exported as rodkit.glb
# Everything is built in three.js's own frame (x to the left of the rod as you hold it, y up, z along the rod towards the
# tip; metres) so it drops straight into the game: P(x, y, z) turns a three.js point into Blender's Z-up space (the glTF
# exporter turns it back).
#
# What's in it (each a named node; angler.js / rodKit.js put them together and bend the rod):
#   reel        a 4000-5000 size spinning reel: body, stem and foot; "rotor" (turns about the spool's axis) carrying the
#               "bail" (its pivot across the arms: it flips open to cast) with the wire and the "line_roller"; "spool"
#               (it moves in and out as you wind) with the blue braid and the drag knob; "crank" (the handle on the
#               reel's left, turning about its own axle) with its arm and knob. Empties: att_knob, att_roller.
#   rodhandle   the handle of a pier rod (butt at z = 0, the reel's foot at z = 0.45): butt cap, rear EVA grip, the
#               screw-locking reel seat (gunmetal, blue anodised rings), the fore grip, the winding check, hook keeper
#   blank       a unit tube (radius 1, z from 0 to 1, rings closer together towards the tip): the game tapers and bends it
#   guide       a guide at ring radius 1, hanging below the blank (feet at y = 0): a gunmetal frame on two legs and a
#               polished ceramic insert. The line runs through the ring's centre at y = -GUIDE_DROP.
#   wrap        a unit thread whipping (radius 1, length 1 along z) for each guide's feet and the blank's trim bands
#   tiptop      the tip ring (the same, small, square to the tip)
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"
P = lambda x, y, z: Vector((x, -z, y))
GUIDE_DROP = 1.85
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection

def mat(name, rgb, metal=0.0, rough=0.5, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = coat
    return m
M = {
    "carbon": mat("rod_carbon", (0.025, 0.028, 0.034), 0.25, 0.32, 0.6),
    "eva": mat("rod_eva", (0.022, 0.022, 0.024), 0.0, 0.92),
    "gun": mat("gunmetal", (0.16, 0.17, 0.19), 1.0, 0.3),
    "chrome": mat("chrome", (0.8, 0.82, 0.85), 1.0, 0.14),
    "blue": mat("blue_anodised", (0.03, 0.16, 0.55), 1.0, 0.28),
    "ceramic": mat("ceramic", (0.18, 0.19, 0.2), 0.3, 0.08),
    "body": mat("reel_graphite", (0.03, 0.032, 0.036), 0.15, 0.48),
    "brushed": mat("reel_brushed", (0.55, 0.57, 0.6), 1.0, 0.3),
    "rubber": mat("rubber", (0.02, 0.02, 0.022), 0.0, 0.8),
    "line": mat("braid_blue", (0.08, 0.25, 0.62), 0.25, 0.45),
    "thread": mat("thread_blue", (0.04, 0.2, 0.62), 0.4, 0.35, 0.8),
}

def mesh_obj(name, verts, faces, m, parent=None, sharp=0.6):
    me = bpy.data.meshes.new(name); me.from_pydata([P(*v) for v in verts], [], faces); me.update()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    for p in me.polygons: p.use_smooth = True
    try: me.set_sharp_from_angle(angle=sharp)
    except Exception: pass
    if parent: o.parent = parent
    return o

def xf(v, T): # a three.js point through a 4x4 (three.js space)
    return tuple((T @ Vector((*v, 1.0)))[:3])

def lathe(name, prof, m, T=Matrix.Identity(4), seg=24, parent=None, sharp=0.6):
    """A surface of revolution about local z: prof is [(radius, z)], from the back to the front (outward normals)."""
    verts, faces = [], []
    for (r, z) in prof:
        for j in range(seg): a = 2 * math.pi * j / seg; verts.append(xf((r * math.cos(a), r * math.sin(a), z), T))
    for i in range(len(prof) - 1):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    return mesh_obj(name, verts, faces, m, parent, sharp)

def torus(name, R, r, m, T=Matrix.Identity(4), seg=28, rseg=8, arc=2 * math.pi, parent=None):
    verts, faces = [], []
    n = seg + (0 if arc >= 2 * math.pi - 1e-6 else 1)
    for i in range(n):
        a = arc * i / seg
        for j in range(rseg):
            b = 2 * math.pi * j / rseg; rr = R + r * math.cos(b)
            verts.append(xf((rr * math.cos(a), rr * math.sin(a), r * math.sin(b)), T))
    for i in range(seg if n == seg else seg):
        for j in range(rseg):
            i2 = (i + 1) % n; a, b, c, d = i * rseg + j, i * rseg + (j + 1) % rseg, i2 * rseg + (j + 1) % rseg, i2 * rseg + j
            faces.append((a, d, c, b))
    return mesh_obj(name, verts, faces, m, parent, 1.2)

def boxm(name, sx, sy, sz, c, m, parent=None, T=None):
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    vs = [(x, y, z) for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]
    T = T or Matrix.Identity(4)
    vs = [xf((v[0] + c[0], v[1] + c[1], v[2] + c[2]), T) for v in vs]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    o = mesh_obj(name, vs, faces, m, parent, 0.5)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    bv = o.modifiers.new("bevel", "BEVEL"); bv.width = min(sx, sy, sz) * 0.25; bv.segments = 2; bv.limit_method = "ANGLE"
    return o

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); col.objects.link(e); e.location = P(*loc)
    if parent: e.parent = parent; e.location = P(*loc) - parent.matrix_world.translation if False else P(*loc)
    return e

def pivot(name, loc, parent=None):
    """An empty in three.js coordinates whose children are given in its own (local) frame."""
    e = bpy.data.objects.new(name, None); col.objects.link(e)
    if parent: e.parent = parent
    e.location = P(*loc); return e

def bar(name, p0, p1, r, m, parent=None):
    """A round bar from p0 to p1 (three.js space)."""
    d = p1 - p0; q = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    return lathe(name, [(0.0, 0.0), (r, 0.0), (r, d.length), (0.0, d.length)], m, Matrix.Translation(p0) @ q, 8, parent, 1.0)
Rx = lambda a: Matrix.Rotation(a, 4, "X")
Ry = lambda a: Matrix.Rotation(a, 4, "Y")
Tr = lambda x, y, z: Matrix.Translation(Vector((x, y, z)))
ALONG_X = Ry(math.pi / 2) # (a lathe about z laid along x)

# =========================================================================================== the reel
# (17 November: rebuilt as a sea-spinning reel's real shapes rather than boxes and cylinders: a swept leg, a gearbox
# housing lofted from rounded sections and smoothed, a rotor whose arms sweep forward from the cup to the bail's pivots,
# a machined spool with a tapered lip and grooved skirt, a knurled drag knob and a one-piece tapered handle arm. Every
# point the game and the hands rely on is where it was: the foot in the seat, the gearbox's centre (BY, BZ), the rotor's
# and spool's faces (RZ, SZ), the roller, the crank's axle and the knob, which is the same shape, so the grips hold.)
def ring_se(cx, cy, cz, w, h, n=2.6, seg=28, plane="xy", rot=0.0):
    """A superellipse ring (w by h, exponent n) round (cx, cy, cz), in the xy plane (along z) or the xz plane (along y)."""
    pts = []
    for j in range(seg):
        a = 2 * math.pi * j / seg + rot; c, s_ = math.cos(a), math.sin(a)
        u = w / 2 * math.copysign(abs(c) ** (2 / n), c); v = h / 2 * math.copysign(abs(s_) ** (2 / n), s_)
        pts.append((cx + u, cy + v, cz) if plane == "xy" else (cx + u, cy, cz + v))
    return pts

def loft(name, rings, m, parent=None, cap0=True, cap1=True, subd=0, sharp=1.2):
    """A surface through rings of points (each the same count), capped at either end, smoothed by subdivision if asked."""
    n = len(rings[0]); verts = [p for r in rings for p in r]; faces = []
    for i in range(len(rings) - 1):
        for j in range(n): a, b = i * n + j, i * n + (j + 1) % n; faces.append((a, b, b + n, a + n))
    if cap0:
        c = len(verts); verts.append(tuple(sum(p[k] for p in rings[0]) / n for k in range(3)))
        for j in range(n): faces.append((c, (j + 1) % n, j))
    if cap1:
        c = len(verts); verts.append(tuple(sum(p[k] for p in rings[-1]) / n for k in range(3))); o = (len(rings) - 1) * n
        for j in range(n): faces.append((c, o + j, o + (j + 1) % n))
    ob = mesh_obj(name, verts, faces, m, parent, sharp)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    if subd: sd = ob.modifiers.new("subd", "SUBSURF"); sd.levels = subd; sd.render_levels = subd
    return ob

def knurled(name, prof, m, T=Matrix.Identity(4), seg=64, ribs=18, depth=0.035, parent=None, rib_from=1, rib_to=-1):
    """A lathe whose outer rings (rib_from..rib_to) are fluted with ribs, as a drag knob or a screw cap is."""
    verts, faces = [], []; rt = len(prof) + rib_to if rib_to < 0 else rib_to
    for i, (r, z) in enumerate(prof):
        for j in range(seg):
            a = 2 * math.pi * j / seg; k = 1.0 - (depth * (0.5 - 0.5 * math.cos(ribs * a)) if rib_from <= i <= rt else 0.0)
            verts.append(xf((r * k * math.cos(a), r * k * math.sin(a), z), T))
    for i in range(len(prof) - 1):
        for j in range(seg): a, b = i * seg + j, i * seg + (j + 1) % seg; faces.append((a, b, b + seg, a + seg))
    return mesh_obj(name, verts, faces, m, parent, 0.5)

M["gloss"] = mat("reel_gloss", (0.012, 0.013, 0.016), 0.3, 0.22, 0.9)
reel = pivot("reel", (0, 0, 0))
BY, BZ = -0.076, -0.012 # the gearbox's centre (below the rod, a little behind the seat's middle)
# the foot: a flat bar with tapered ends that slides into the seat, and the leg swept down and back to the gearbox
foot = []
for z, w, t in ((-0.026, 0.006, 0.002), (-0.022, 0.0105, 0.0032), (-0.012, 0.011, 0.0036), (0.0, 0.011, 0.0038), (0.012, 0.011, 0.0036), (0.022, 0.0105, 0.0032), (0.026, 0.006, 0.002)):
    foot.append(ring_se(0.0, -0.0165, z, w, t, 4.0, 16))
loft("reel_foot", foot, M["body"], reel)
stem = []
for y, z, w, d in ((-0.0168, -0.001, 0.0092, 0.0155), (-0.0195, -0.0015, 0.0092, 0.016), (-0.026, -0.0035, 0.0098, 0.0158), (-0.033, -0.006, 0.0112, 0.0166), (-0.04, -0.0085, 0.0138, 0.019), (-0.046, -0.0105, 0.018, 0.024), (-0.05, -0.0115, 0.024, 0.03)):
    stem.append(ring_se(0.0, y, z, w, d, 3.0, 20, "xz"))
loft("reel_stem", stem, M["body"], reel, cap0=True, cap1=False, subd=1)
# the gearbox housing, lofted along the spool's axis from the rear cap to the nose under the rotor
body = []
for z, dy, w, h, n in ((-0.054, 0.004, 0.012, 0.014, 2.2), (-0.05, 0.0035, 0.024, 0.027, 2.3), (-0.042, 0.002, 0.04, 0.047, 2.5), (-0.03, 0.001, 0.051, 0.06, 2.7),
                       (-0.016, 0.0, 0.056, 0.066, 2.8), (-0.004, 0.0, 0.056, 0.066, 2.8), (0.006, 0.0005, 0.05, 0.057, 2.6), (0.012, 0.001, 0.038, 0.042, 2.3), (0.015, 0.0005, 0.031, 0.031, 2.0)):
    body.append(ring_se(0.0, BY + dy, z, w, h, n, 32))
loft("reel_body", body, M["gloss"], reel, subd=1)
# the side plates: a polished cover on the handle's side (x +) and a knurled screw cap on the other
lathe("reel_coverL", [(0.0, 0.0), (0.0175, 0.0), (0.019, 0.0012), (0.0188, 0.0026), (0.017, 0.0034), (0.011, 0.0038), (0.0, 0.0038)], M["gun"], Tr(0.0268, BY, BZ) @ ALONG_X, 40, reel)
torus("reel_trimL", 0.0186, 0.0009, M["chrome"], Tr(0.0272, BY, BZ) @ ALONG_X, 40, 6, parent=reel)
knurled("reel_coverR", [(0.0, 0.0), (0.0115, 0.0), (0.0122, 0.001), (0.0122, 0.0042), (0.0112, 0.0052), (0.0, 0.0054)], M["gun"], Tr(-0.0268, BY, BZ) @ Ry(-math.pi / 2), 48, 20, 0.05, reel, 1, 3)
torus("reel_trimR", 0.0128, 0.0008, M["chrome"], Tr(-0.0272, BY, BZ) @ ALONG_X, 36, 6, parent=reel)
# the anti-reverse switch under the back, and a cap on the rear
boxm("reel_back_switch", 0.004, 0.006, 0.009, (0.0, BY - 0.0225, BZ - 0.027), M["gun"], reel)
lathe("reel_back", [(0.0, -0.0565), (0.005, -0.0563), (0.0068, -0.0548), (0.0072, -0.052), (0.006, -0.05)], M["body"], Tr(0, BY + 0.004, 0), 24, reel)
# the shaft's housing in front of the gearbox, carrying the rotor (mostly inside the rotor's cup)
lathe("reel_nose", [(0.0, -0.004), (0.016, -0.004), (0.0165, 0.004), (0.0125, 0.011), (0.0, 0.011)], M["body"], Tr(0, BY, BZ + 0.024), 32, reel)

# ---- the rotor: turns about the spool's axis (z) as you wind; its cup, two arms sweeping forward, the bail ----
RZ = 0.016 # the rotor's back face
rotor = pivot("rotor", (0, BY, RZ), reel)
lathe("rotor_cup", [(0.0, 0.0), (0.0165, 0.0), (0.0178, 0.0008), (0.0235, 0.0035), (0.0285, 0.0085), (0.0308, 0.0145), (0.0314, 0.0205), (0.031, 0.0245), (0.0298, 0.0262), (0.0262, 0.026), (0.0248, 0.018), (0.019, 0.009), (0.011, 0.005), (0.0, 0.005)], M["gloss"], Matrix.Identity(4), 56, rotor)
torus("rotor_trim", 0.0306, 0.001, M["chrome"], Tr(0, 0, 0.0254), 48, 6, parent=rotor)
for s in (-1, 1): # each arm: from the cup's rim, flaring out and forward to the bail's pivot boss
    arm = []
    for t in (0.0, 0.2, 0.45, 0.7, 0.88, 1.0):
        x = s * (0.0285 + 0.0062 * math.sin(t * math.pi * 0.9) + 0.003 * t); z = 0.017 + t * 0.024
        arm.append(ring_se(x, 0.0, z, 0.0062 - 0.0018 * t, 0.0135 - 0.0055 * t, 2.6, 16))
    loft(f"rotor_cup_arm{'L' if s > 0 else 'R'}", arm, M["gloss"], rotor, subd=1)
    lathe(f"rotor_arm_boss{'L' if s > 0 else 'R'}", [(0.0, -0.0026), (0.0042, -0.0026), (0.0046, 0.0), (0.0042, 0.0026), (0.0, 0.0026)], M["gun"], Tr(s * 0.0345, 0.0, 0.041) @ ALONG_X, 20, rotor)
bail = pivot("bail", (0, 0, 0.041), rotor) # the pivot axis runs across (x) through both arms' ends
# the wire: a full half hoop over the spool's front, a little forward of the arms, from the roller round to the far arm
pts = []
for i in range(41):
    a = math.pi * i / 40; pts.append((0.0335 * math.cos(a), 0.0338 * math.sin(a), 0.0115 * math.sin(a) ** 0.8 + 0.001))
cu = bpy.data.curves.new("bail_wire", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.00135; cu.bevel_resolution = 3
sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
for i, p in enumerate(pts): sp.points[i].co = (*P(*p), 1)
bw = bpy.data.objects.new("bail_wire", cu); col.objects.link(bw); bw.parent = bail; bw.data.materials.append(M["chrome"])
for s, nm in ((1, "bail_armL"), (-1, "bail_armR")): # shaped plates from the pivot to the wire
    pl = [ring_se(s * 0.0335, 0.0, z, 0.0032, h, 2.4, 12) for z, h in ((-0.006, 0.006), (-0.002, 0.0075), (0.002, 0.0062), (0.005, 0.0045))]
    loft(nm, pl, M["chrome"], bail)
lathe("line_roller", [(0.0, -0.0036), (0.003, -0.0036), (0.0034, -0.0022), (0.0025, 0.0), (0.0034, 0.0022), (0.003, 0.0036), (0.0, 0.0036)], M["chrome"], Tr(0.0335, 0.0015, 0.0), 20, bail)
lathe("bail_roller_cover", [(0.0, -0.0044), (0.0042, -0.0044), (0.0046, -0.0038), (0.0046, -0.0036), (0.0, -0.0036)], M["gun"], Tr(0.0335, 0.0015, 0.0) @ Rx(0.0), 20, bail)
pivot("att_roller", (0.0335, 0.0015, 0.0), bail)

# ---- the spool: in and out along z as you wind (the game moves it), the blue braid, the knurled drag knob ----
SZ = 0.05
spool = pivot("spool", (0, BY, SZ), reel)
lathe("spool_body", [(0.0, -0.016), (0.0205, -0.016), (0.0212, -0.0145), (0.0236, -0.0128), (0.0236, 0.0118), (0.0262, 0.0128), (0.0288, 0.0142), (0.0298, 0.0158), (0.0296, 0.0172), (0.0284, 0.0182), (0.0, 0.0182)], M["brushed"], Matrix.Identity(4), 64, spool)
lathe("spool_skirt", [(0.0272, -0.0315), (0.0296, -0.0305), (0.0312, -0.0285), (0.0313, -0.0262), (0.0306, -0.0258), (0.0313, -0.0252), (0.0313, -0.0222), (0.0306, -0.0218), (0.0313, -0.0212), (0.0312, -0.0182), (0.0292, -0.0158), (0.025, -0.0135)], M["brushed"], Matrix.Identity(4), 64, spool)
lathe("spool_braid", [(0.0, -0.0126), (0.0258, -0.0126), (0.0266, -0.0114), (0.0268, 0.0), (0.0266, 0.0114), (0.0258, 0.0126), (0.0, 0.0126)], M["line"], Matrix.Identity(4), 64, spool)
torus("spool_trim", 0.0294, 0.0008, M["chrome"], Tr(0, 0, 0.0166), 48, 6, parent=spool)
knurled("drag_knob", [(0.0, 0.0182), (0.0128, 0.0182), (0.0142, 0.0205), (0.0146, 0.0225), (0.0144, 0.0275), (0.0132, 0.0302), (0.009, 0.0318), (0.0, 0.032)], M["body"], Matrix.Identity(4), 72, 18, 0.06, spool, 2, 4)
lathe("drag_cap", [(0.0, 0.0316), (0.0075, 0.0316), (0.0078, 0.0322), (0.0, 0.0326)], M["gun"], Matrix.Identity(4), 32, spool)
torus("drag_trim", 0.0139, 0.0007, M["chrome"], Tr(0, 0, 0.0204), 40, 6, parent=spool)

# ---- the handle, on the reel's left (x +): its axle out of the side cover, a one-piece tapered arm and a round knob ----
crank = pivot("crank", (0.031, BY, BZ), reel)
lathe("crank_hub", [(0.0, 0.0), (0.0078, 0.0), (0.0082, 0.0015), (0.0078, 0.0065), (0.0062, 0.0092), (0.0, 0.0094)], M["gun"], ALONG_X, 28, crank)
ARM = 0.058
arm = []
for t in (0.0, 0.08, 0.3, 0.55, 0.8, 0.94, 1.0):
    x = 0.0075 + t * 0.0062 + 0.0018 * math.sin(t * math.pi); y = -ARM * t
    arm.append(ring_se(x, y, 0.0, 0.0047 - 0.0011 * t, 0.0098 - 0.0028 * t, 3.2, 16, "xz"))
loft("crank_arm", arm, M["gun"], crank, subd=1)
lathe("crank_stud", [(0.0, 0.0), (0.0026, 0.0), (0.0026, 0.006), (0.0, 0.006)], M["chrome"], Tr(0.014, -ARM, 0) @ ALONG_X, 16, crank)
lathe("crank_knob", [(0.0, 0.0), (0.006, 0.0), (0.0092, 0.004), (0.0098, 0.012), (0.0092, 0.02), (0.007, 0.025), (0.0, 0.026)], M["rubber"], Tr(0.019, -ARM, 0) @ ALONG_X, 32, crank)
torus("crank_cap", 0.0062, 0.0008, M["chrome"], Tr(0.0455, -ARM, 0) @ ALONG_X, 24, 6, parent=crank)
pivot("att_knob", (0.032, -ARM, 0), crank)

# =========================================================================================== the rod's handle
# a pier rod's (3.6 m): butt at z = 0, the reel's foot in the seat at z = 0.45. The game scales it along z for other rods.
H = pivot("rodhandle", (0, 0, 0))
lathe("butt_cap", [(0.0, 0.0), (0.012, 0.0), (0.0165, 0.004), (0.0175, 0.012), (0.0172, 0.024)], M["rubber"], Matrix.Identity(4), 28, H)
torus("butt_trim", 0.0172, 0.0012, M["blue"], Tr(0, 0, 0.025), 32, 6, parent=H)
rear = [(0.0168, 0.026)] + [(0.0158 + 0.0012 * math.sin(math.pi * t) - 0.0012 * t, 0.026 + t * 0.372) for t in [i / 12 for i in range(1, 13)]]
lathe("grip_rear", rear + [(0.0128, 0.4)], M["eva"], Matrix.Identity(4), 28, H, 1.0)
# the reel seat: a gunmetal barrel with a slot for the foot underneath (the hood at the back, the screw lock in front)
lathe("seat_barrel", [(0.0128, 0.398), (0.0134, 0.4), (0.0134, 0.5), (0.0128, 0.502)], M["gun"], Matrix.Identity(4), 28, H)
lathe("seat_hood", [(0.0128, 0.4), (0.0152, 0.402), (0.0158, 0.41), (0.0156, 0.424), (0.0136, 0.428)], M["chrome"], Matrix.Identity(4), 28, H)
lathe("seat_locknut", [(0.0136, 0.472), (0.0156, 0.475), (0.016, 0.48), (0.016, 0.494), (0.0154, 0.499), (0.0136, 0.5)], M["gun"], Matrix.Identity(4), 18, H, 0.3) # (18 flats: the knurling)
torus("seat_trimA", 0.0156, 0.0011, M["blue"], Tr(0, 0, 0.4265), 32, 6, parent=H)
torus("seat_trimB", 0.0158, 0.0011, M["blue"], Tr(0, 0, 0.4705), 32, 6, parent=H)
boxm("seat_slot", 0.012, 0.004, 0.044, (0, -0.0135, 0.45), M["gun"], H)
fore = [(0.0136, 0.5)] + [(0.0146 - 0.0018 * t + 0.0006 * math.sin(math.pi * t), 0.502 + t * 0.155) for t in [i / 8 for i in range(9)]]
lathe("grip_fore", fore + [(0.0122, 0.66)], M["eva"], Matrix.Identity(4), 28, H, 1.0)
lathe("winding_check", [(0.0115, 0.658), (0.0128, 0.66), (0.0128, 0.668), (0.0116, 0.671)], M["gun"], Matrix.Identity(4), 24, H)
torus("check_trim", 0.0127, 0.0009, M["blue"], Tr(0, 0, 0.664), 32, 6, parent=H)
# a hook keeper on the blank above the fore grip
torus("hook_keeper", 0.0035, 0.0007, M["chrome"], Tr(0, -0.0145, 0.72) @ Ry(math.pi / 2), 16, 6, parent=H)
boxm("keeper_foot", 0.003, 0.0015, 0.014, (0, -0.0112, 0.72), M["chrome"], H)

# =========================================================================================== the blank
# a unit tube: radius 1, z from 0 (butt) to 1 (tip), rings closer together towards the tip (where it bends most)
SIDES, RINGS = 12, 56
verts, faces, uvs = [], [], []
zs = [1 - (1 - i / (RINGS - 1)) ** 1.6 for i in range(RINGS)]
for z in zs:
    for j in range(SIDES + 1): a = 2 * math.pi * j / SIDES; verts.append((math.cos(a), math.sin(a), z))
for i in range(RINGS - 1):
    for j in range(SIDES):
        a = i * (SIDES + 1) + j; faces.append((a, a + 1, a + SIDES + 2, a + SIDES + 1))
blank = mesh_obj("blank", verts, faces, M["carbon"], None, 3.0)
uvl = blank.data.uv_layers.new(name="UVMap")
for poly in blank.data.polygons:
    for li in poly.loop_indices:
        vi = blank.data.loops[li].vertex_index; j = vi % (SIDES + 1); i = vi // (SIDES + 1)
        uvl.data[li].uv = (j / SIDES, zs[i])
# (the seam vertices are doubled for the uvs: merging them by distance would undo that, so the normals across the seam
# are made smooth in the game)

# =========================================================================================== guides, wraps, tip
# a guide at ring radius 1: the ring's centre at y = -GUIDE_DROP, its frame up on two legs to feet along the blank (y = 0)
G = pivot("guide", (0, 0, 0))
torus("guide_insert", 1.0, 0.16, M["ceramic"], Tr(0, -GUIDE_DROP, 0), 32, 8, parent=G)
torus("guide_frame", 1.2, 0.1, M["gun"], Tr(0, -GUIDE_DROP, 0), 32, 6, parent=G)
for s in (-1, 1): # the legs: from the frame's sides up and out to the feet, fore and aft (round wire, bent once)
    for side in (-1, 1):
        p0 = Vector((side * 0.75, -GUIDE_DROP + 0.95, 0.0)); pm = Vector((side * 0.35, -0.55, s * 0.7)); p1 = Vector((side * 0.1, -0.06, s * 1.5))
        bar(f"guide_leg{s}{side}a", p0, pm, 0.075, M["gun"], G); bar(f"guide_leg{s}{side}b", pm, p1, 0.075, M["gun"], G)
    boxm(f"guide_foot{s}", 0.42, 0.08, 1.1, (0, -0.04, s * 1.8), M["gun"], G)
W_ = pivot("wrap", (0, 0, 0))
lathe("wrap_thread", [(1.0, -0.5), (1.0, 0.5)], M["thread"], Matrix.Identity(4), 16, W_)
lathe("wrap_edgeA", [(1.0, -0.5), (1.06, -0.47), (1.06, -0.44), (1.0, -0.41)], M["chrome"], Matrix.Identity(4), 16, W_)
lathe("wrap_edgeB", [(1.0, 0.41), (1.06, 0.44), (1.06, 0.47), (1.0, 0.5)], M["chrome"], Matrix.Identity(4), 16, W_)
TT = pivot("tiptop", (0, 0, 0))
lathe("tiptop_tube", [(0.0, -2.5), (1.2, -2.5), (1.2, 0.0), (0.0, 0.0)], M["gun"], Matrix.Identity(4), 12, TT)
torus("tiptop_insert", 1.0, 0.2, M["ceramic"], Tr(0, -1.6, 0.3) @ Rx(0.0), 24, 8, parent=TT)
torus("tiptop_frame", 1.22, 0.12, M["gun"], Tr(0, -1.6, 0.3), 24, 6, parent=TT)

# =========================================================================================== save and export
os.makedirs(OUT + "/source/rod", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/rod/rodkit.blend")
bpy.ops.export_scene.gltf(filepath=OUT + "/exports/rodkit.glb", export_format="GLB", export_apply=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
tris = 0; dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if o.type in ("MESH", "CURVE"):
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
print("RODKIT DONE", tris, "triangles", os.path.getsize(OUT + "/exports/rodkit.glb") // 1000, "kB")
