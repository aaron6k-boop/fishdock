# FishDock: the pier's furniture, exported as pierprops.glb
#   lamp     Poly Haven street_lamp_01 (CC0), its textures cut to 512 px for phones
#   station  a lifebuoy housing (modelled here) holding Poly Haven's lifebuoy (CC0)
#   bollard  a cast-iron mooring bollard (modelled here)
#   bench    a slatted bench with cast-iron ends (modelled here)
# Each in three.js's frame (y up, metres), standing on the origin, its front towards +z. Attachment empties: att_*.
import bpy, bmesh, math, os
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"; DL = OUT + "/downloads/polyhaven"
P = lambda x, y, z: Vector((x, -z, y))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.cameras, bpy.data.lights): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection

def mat(name, rgb, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    return m
M = {"iron": mat("cast_iron", (0.035, 0.04, 0.045), 0.35, 0.55), "red": mat("housing_red", (0.5, 0.06, 0.04), 0.1, 0.45),
     "galv": mat("galvanised", (0.55, 0.57, 0.58), 0.75, 0.5), "wood": mat("bench_wood", (0.32, 0.2, 0.11), 0.0, 0.75),
     "yellow": mat("plate_yellow", (0.85, 0.62, 0.04), 0.0, 0.5)}
def obj(name, me, m, parent=None, smooth=True):
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    if parent: o.parent = parent
    for p in o.data.polygons: p.use_smooth = smooth
    return o
def bevel(o, w=0.006, seg=2):
    b = o.modifiers.new("bevel", "BEVEL"); b.width = w; b.segments = seg; b.limit_method = "ANGLE"
    o.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
def box(name, sx, sy, sz, centre, m, parent=None, bw=0.006):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts); bm.to_mesh(me); bm.free()
    o = obj(name, me, m, parent, smooth=False); o.location = centre; bevel(o, bw); return o
def lathe(name, prof, m, parent=None, seg=18):
    # prof: [(radius, height)] from the bottom up, turned about three's y
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for r, h in prof:
        ring = [bm.verts.new(P(r * math.cos(2 * math.pi * k / seg), h, r * math.sin(2 * math.pi * k / seg))) for k in range(seg)]; rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    return obj(name, me, m, parent)
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

# ---- the lamp: Poly Haven's street lamp as it comes (3.87 m), its lantern lit at night by FishDock ----
lamp, parts = import_ph(DL + "/street_lamp_01/street_lamp_01_1k.gltf", "lamp")
att("att_light", lamp, P(0, 3.27, 0))  # the bulb
att("att_perch", lamp, P(0, 3.88, 0))  # the top: somewhere for a gull
lamp.location = Vector((-4, 0, 0))

# ---- the lifebuoy station: a red housing on a galvanised post, the buoy in it facing out ----
st = root("station")
box("post", 0.08, 1.05, 0.08, P(0, 0.525, -0.06), M["galv"], st, 0.008)
box("base_plate", 0.22, 0.02, 0.22, P(0, 0.01, -0.06), M["galv"], st, 0.004)
box("housing_back", 0.9, 0.95, 0.03, P(0, 0.98, -0.01), M["red"], st)
for s in (-1, 1): box(f"housing_side_{s}", 0.03, 0.95, 0.16, P(s * 0.435, 0.98, 0.06), M["red"], st)
box("housing_roof", 0.94, 0.04, 0.2, P(0, 1.47, 0.07), M["red"], st)
box("housing_sill", 0.9, 0.035, 0.16, P(0, 0.52, 0.06), M["red"], st)
box("plate", 0.42, 0.09, 0.008, P(0, 1.39, 0.012), M["yellow"], st, 0.002)  # the label plate (lettered in FishDock)
att("att_plate", st, P(0, 1.39, 0.017))
buoy, bparts = import_ph(DL + "/lifebuoy/lifebuoy_1k.gltf", "buoy")
buoy.parent = st
# Poly Haven's buoy lies in its own x-y plane (z thin): stand it up facing out (+z), its centre in the housing
buoy.location = P(0, 1.0, 0.07); buoy.scale = (0.92, 0.92, 0.92)

st.location = Vector((-2, 0, 0))

# ---- the bollard: a cast-iron mooring post with a mushroom head ----
bo = root("bollard")
lathe("bollard_body", [(0.2, 0.0), (0.2, 0.04), (0.16, 0.06), (0.135, 0.1), (0.125, 0.4), (0.13, 0.43), (0.19, 0.47), (0.2, 0.5), (0.18, 0.53), (0.12, 0.55), (0.0, 0.555)], M["iron"], bo)
bo.location = Vector((0, 0, 0))

# ---- the bench: wooden slats on cast-iron ends ----
be = root("bench")
for s in (-1, 1):
    box(f"end_leg_f{s}", 0.05, 0.45, 0.05, P(s * 0.82, 0.225, 0.16), M["iron"], be, 0.008)
    box(f"end_leg_b{s}", 0.05, 0.85, 0.05, P(s * 0.82, 0.425, -0.2), M["iron"], be, 0.008)
    box(f"end_rail{s}", 0.05, 0.05, 0.42, P(s * 0.82, 0.42, -0.02), M["iron"], be, 0.008)
    box(f"arm{s}", 0.06, 0.04, 0.46, P(s * 0.82, 0.66, 0.0), M["iron"], be, 0.01)
    box(f"arm_post{s}", 0.04, 0.24, 0.04, P(s * 0.82, 0.54, 0.18), M["iron"], be, 0.006)
for k in range(4): box(f"seat{k}", 1.76, 0.03, 0.085, P(0, 0.455, 0.14 - k * 0.1), M["wood"], be, 0.008)
for k in range(3): box(f"back{k}", 1.76, 0.085, 0.025, P(0, 0.58 + k * 0.11, -0.21 - k * 0.012), M["wood"], be, 0.008)
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
                o.modifiers.remove(d); old = o.data; o.data = new
                print("DECIMATE", o.name, n0, "->", len(new.polygons))
    # parent transforms baked in, then joined
    for o in kids:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in kids: o.select_set(True)
    bpy.context.view_layer.objects.active = kids[0]; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join(); j = bpy.context.view_layer.objects.active; j.name = r.name + "_mesh"
    # back under the root, in the root's frame
    j.parent = r; j.matrix_parent_inverse = r.matrix_world.inverted()
    return j
join_under(lamp, 0.06); join_under(st, 0.08); join_under(bo); join_under(be)
for n in ("buoy",):
    e = bpy.data.objects.get(n)
    if e: bpy.data.objects.remove(e, do_unlink=True)
os.makedirs(OUT + "/source/pierprops", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/pierprops/pierprops.blend")
# export each at the origin
for r in (lamp, st, bo, be): r["home"] = list(r.location); r.location = Vector((0, 0, 0))
bpy.ops.export_scene.gltf(filepath=OUT + "/exports/pierprops.glb", export_format="GLB", export_apply=True, export_yup=True, export_extras=False,
                          export_cameras=False, export_lights=False, export_image_format="JPEG", export_jpeg_quality=80)
for r in (lamp, st, bo, be): r.location = Vector(r["home"])
tris = 0; dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if o.type == "MESH": me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles)
print("PROPS DONE", tris, "triangles", os.path.getsize(OUT + "/exports/pierprops.glb") // 1000, "kB")
