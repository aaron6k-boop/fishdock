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
reel = pivot("reel", (0, 0, 0))
BY, BZ = -0.076, -0.012 # the gearbox's centre (below the rod, a little behind the seat's middle)
# the foot (it slides into the reel seat) and the stem, swept forward, down to the body
boxm("reel_foot", 0.011, 0.005, 0.052, (0, -0.0165, 0), M["body"], reel)
for k in range(6):
    t = k / 5; y = -0.019 - t * 0.034; z = -0.002 - t * 0.008; w = 0.009 + t * 0.006
    boxm(f"reel_stem{k}", w, 0.009, 0.016 - t * 0.002, (0, y, z), M["body"], reel)
# the body: a rounded gearbox lying across the rod (its axis along x), its domed back, the side covers
lathe("reel_body", [(0.0, -0.025), (0.022, -0.025), (0.029, -0.022), (0.031, -0.016), (0.031, 0.016), (0.029, 0.022), (0.022, 0.025), (0.0, 0.025)], M["body"], Tr(0, BY, BZ) @ ALONG_X, 36, reel)
lathe("reel_back", [(0.0, -0.034), (0.012, -0.033), (0.022, -0.028), (0.028, -0.018), (0.03, -0.005), (0.026, 0.004)], M["body"], Tr(0, BY, BZ - 0.004), 32, reel)
for s in (-1, 1): # a blue anodised ring and a gunmetal cover each side (the handle goes in on the left, x +)
    lathe(f"reel_cover{'L' if s > 0 else 'R'}", [(0.0, 0.0), (0.024, 0.0), (0.025, 0.002), (0.023, 0.004), (0.012, 0.0055), (0.0, 0.0055)], M["gun"], Tr(s * 0.0255, BY, BZ) @ (ALONG_X if s > 0 else Ry(-math.pi / 2)), 36, reel)
    torus(f"reel_trim{'L' if s > 0 else 'R'}", 0.0285, 0.0012, M["blue"], Tr(s * 0.0245, BY, BZ) @ ALONG_X, 40, 6, parent=reel)
# the shaft's housing in front of the gearbox, carrying the rotor
lathe("reel_nose", [(0.0, -0.004), (0.016, -0.004), (0.017, 0.006), (0.012, 0.012), (0.0, 0.012)], M["body"], Tr(0, BY, BZ + 0.024), 32, reel)

# ---- the rotor: turns about the spool's axis (z) as you wind; its cup, two arms, the bail on its pivot ----
RZ = 0.016 # the rotor's back face
rotor = pivot("rotor", (0, BY, RZ), reel)
lathe("rotor_cup", [(0.0, 0.0), (0.017, 0.0), (0.027, 0.006), (0.031, 0.016), (0.031, 0.026), (0.0285, 0.0265), (0.025, 0.012), (0.012, 0.004), (0.0, 0.004)], M["body"], Matrix.Identity(4), 40, rotor)
torus("rotor_trim", 0.0305, 0.0011, M["blue"], Tr(0, 0, 0.0255), 40, 6, parent=rotor)
for s in (-1, 1): # the arms reaching forward to the bail's pivots
    boxm(f"rotor_arm{'L' if s > 0 else 'R'}", 0.006, 0.012, 0.022, (s * 0.032, 0, 0.032), M["gun"], rotor)
bail = pivot("bail", (0, 0, 0.041), rotor) # the pivot axis runs across (x) through both arms' ends
# the wire: a half hoop over the spool's front from the roller's arm (x +) round to the other (x -)
pts = []
for i in range(25):
    a = math.pi * i / 24; pts.append((0.0335 * math.cos(a), 0.0335 * math.sin(a) * 1.02, 0.014 * math.sin(a)))
cu = bpy.data.curves.new("bail_wire", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.0014; cu.bevel_resolution = 2
sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
for i, p in enumerate(pts): sp.points[i].co = (*P(*p), 1)
bw = bpy.data.objects.new("bail_wire", cu); col.objects.link(bw); bw.parent = bail; bw.data.materials.append(M["chrome"])
boxm("bail_armL", 0.004, 0.006, 0.012, (0.0335, 0.0, -0.004), M["chrome"], bail)
boxm("bail_armR", 0.004, 0.006, 0.012, (-0.0335, 0.0, -0.004), M["chrome"], bail)
lathe("line_roller", [(0.0, -0.0035), (0.0028, -0.0035), (0.0033, -0.002), (0.0024, 0.0), (0.0033, 0.002), (0.0028, 0.0035), (0.0, 0.0035)], M["chrome"], Tr(0.0335, 0.0015, 0.0), 16, bail)
pivot("att_roller", (0.0335, 0.0015, 0.0), bail)

# ---- the spool: in and out along z as you wind (the game moves it), the blue braid, the front drag knob ----
SZ = 0.05
spool = pivot("spool", (0, BY, SZ), reel)
lathe("spool_body", [(0.0, -0.016), (0.0205, -0.016), (0.0215, -0.013), (0.024, -0.012), (0.024, 0.012), (0.0285, 0.014), (0.0295, 0.0165), (0.028, 0.018), (0.0, 0.018)], M["brushed"], Matrix.Identity(4), 48, spool)
lathe("spool_skirt", [(0.0295, -0.03), (0.031, -0.026), (0.031, -0.017), (0.025, -0.0135)], M["brushed"], Matrix.Identity(4), 48, spool)
lathe("spool_braid", [(0.0, -0.0128), (0.0262, -0.0128), (0.0268, -0.0115), (0.0268, 0.0115), (0.0262, 0.0128), (0.0, 0.0128)], M["line"], Matrix.Identity(4), 48, spool)
torus("spool_trim", 0.0292, 0.001, M["blue"], Tr(0, 0, 0.0165), 40, 6, parent=spool)
lathe("drag_knob", [(0.0, 0.018), (0.0135, 0.018), (0.0145, 0.021), (0.014, 0.028), (0.011, 0.031), (0.0, 0.031)], M["gun"], Matrix.Identity(4), 18, spool, 0.4)
torus("drag_trim", 0.0138, 0.0009, M["blue"], Tr(0, 0, 0.0205), 30, 6, parent=spool)

# ---- the handle, on the reel's left (x +): its axle out of the side cover, a folding arm and a round knob ----
crank = pivot("crank", (0.031, BY, BZ), reel)
lathe("crank_hub", [(0.0, 0.0), (0.0075, 0.0), (0.0075, 0.007), (0.006, 0.009), (0.0, 0.009)], M["gun"], ALONG_X, 20, crank)
ARM = 0.058
for k in range(5): # the arm: tapering, a little cranked outwards
    t = (k + 0.5) / 5; boxm(f"crank_arm{k}", 0.0045, ARM / 5 + 0.001, 0.0085 - t * 0.002, (0.008 + t * 0.006, -ARM * t, 0), M["gun"], crank)
lathe("crank_stud", [(0.0, 0.0), (0.0025, 0.0), (0.0025, 0.006), (0.0, 0.006)], M["chrome"], Tr(0.014, -ARM, 0) @ ALONG_X, 12, crank)
lathe("crank_knob", [(0.0, 0.0), (0.006, 0.0), (0.0092, 0.004), (0.0098, 0.012), (0.0092, 0.02), (0.007, 0.025), (0.0, 0.026)], M["rubber"], Tr(0.019, -ARM, 0) @ ALONG_X, 24, crank)
torus("crank_cap", 0.0062, 0.0008, M["blue"], Tr(0.0455, -ARM, 0) @ ALONG_X, 20, 6, parent=crank)
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
