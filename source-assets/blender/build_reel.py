# FishDock: a fixed-spool (spinning) reel, modelled properly in Blender and exported as reel.glb
# Built in three.js's own frame (x left of the rod, y up, z along the rod towards the tip; metres) so it drops straight
# into angler.js: P(x, y, z) turns a three.js point into Blender's Z-up space (the glTF exporter turns it back).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"
P = lambda x, y, z: Vector((x, -z, y))
# a clean scene (without touching your preferences or extensions)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection
def mat(name, rgb, metal=0.0, rough=0.5, clear=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = clear
    return m
M = {"body": mat("reel_body", (0.05, 0.055, 0.065), 0.7, 0.32, 0.4), "spool": mat("reel_spool", (0.55, 0.57, 0.6), 1.0, 0.25), "accent": mat("reel_accent", (0.02, 0.18, 0.42), 0.8, 0.3, 0.5),
     "chrome": mat("reel_chrome", (0.85, 0.86, 0.88), 1.0, 0.12), "rubber": mat("reel_knob", (0.03, 0.03, 0.035), 0.0, 0.75), "line": mat("reel_line", (0.86, 0.88, 0.84), 0.0, 0.55)}
def obj(name, me, m, parent=None, smooth=True):
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m)
    if parent: o.parent = parent
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o
def bevel(o, w=0.0012, seg=2):
    b = o.modifiers.new("bevel", "BEVEL"); b.width = w; b.segments = seg; b.limit_method = "ANGLE"
    o.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
def cyl(name, r1, r2, length, centre, axis, m, verts=32, parent=None, cap=True):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=verts, radius1=r1, radius2=r2, depth=length)
    bm.to_mesh(me); bm.free(); o = obj(name, me, m, parent)
    ax = Vector(axis).normalized(); o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(ax); o.location = centre
    return o
def box(name, sx, sy, sz, centre, m, parent=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts); bm.to_mesh(me); bm.free()
    o = obj(name, me, m, parent, smooth=False); o.location = centre; return o
root = bpy.data.objects.new("reel", None); col.objects.link(root)
# the foot (slides into the reel seat) and the stem down to the body (three.js sizes: x 0.009, y 0.006, z 0.05)
foot = box("foot", 0.01, 0.05, 0.006, P(0, -0.016, 0), M["body"], root); bevel(foot, 0.0015, 3)
stem = box("stem", 0.0085, 0.016, 0.046, P(0, -0.04, -0.004), M["body"], root); stem.rotation_euler = (math.radians(-8), 0, 0); bevel(stem, 0.002, 3)
# the gearbox: a rounded drum lying across (its axis along x), a domed back, a side plate where the handle goes in
gb_c = P(0, -0.072, -0.012)
gear = cyl("gearbox", 0.03, 0.03, 0.044, gb_c, P(1, 0, 0) - P(0, 0, 0), M["body"], 40, root); bevel(gear, 0.004, 4)
back = bpy.data.meshes.new("back"); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.03)
for v in bm.verts:
    if v.co.y > 0.0: v.co.y *= 1.25   # (pushed back along the rod, blender -y is three +z... the back is towards the butt: three -z = blender +y)
bm.to_mesh(back); bm.free(); bk = obj("back", back, M["body"], root); bk.location = gb_c; bk.scale = (0.98, 0.9, 0.95)
plate = cyl("sideplate", 0.022, 0.024, 0.006, P(0.024, -0.072, -0.012), P(1, 0, 0) - P(0, 0, 0), M["accent"], 40, root); bevel(plate, 0.001, 2)
# the rotor (turns as you wind: about the rod's axis) with its cup, the bail arm and its line roller
rotor = bpy.data.objects.new("rotor", None); col.objects.link(rotor); rotor.parent = root; rotor.location = P(0, -0.072, 0.018)
cup = cyl("rotor_cup", 0.026, 0.031, 0.024, Vector((0, 0, 0)), (0, -1, 0), M["body"], 48, rotor, cap=False); sol = cup.modifiers.new("thick", "SOLIDIFY"); sol.thickness = 0.0025; bevel(cup, 0.001, 2)
for s in (-1, 1):
    arm = box(f"bail_arm_{'L' if s < 0 else 'R'}", 0.006, 0.02, 0.012, Vector((s * 0.03, -0.012, 0)), M["body"], rotor); bevel(arm, 0.002, 3)
bail = bpy.data.meshes.new("bail"); bm = bmesh.new()
bmesh.ops.create_circle(bm, segments=40, radius=0.034)
bm.free()
curve = bpy.data.curves.new("bail_wire", "CURVE"); curve.dimensions = "3D"; curve.bevel_depth = 0.0016; curve.bevel_resolution = 3
sp = curve.splines.new("POLY"); pts = [(0.034 * math.cos(a), -0.028 - 0.004 * math.sin(a), 0.034 * math.sin(a)) for a in [math.pi * i / 24 for i in range(25)]]
sp.points.add(len(pts) - 1)
for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
bw = bpy.data.objects.new("bail", curve); col.objects.link(bw); bw.parent = rotor; bw.data.materials.append(M["chrome"])
roller = cyl("line_roller", 0.0035, 0.0035, 0.006, Vector((0.033, -0.028, 0.003)), (0, 0, 1), M["chrome"], 16, rotor)
# the spool, its front drag knob, and the line wound on it
sp_c = P(0, -0.072, 0.05)
spool = cyl("spool", 0.0285, 0.0285, 0.032, sp_c, (0, -1, 0), M["spool"], 48, root); bevel(spool, 0.0015, 3)
lip = cyl("spool_lip", 0.031, 0.029, 0.004, sp_c + Vector((0, -0.017, 0)), (0, -1, 0), M["spool"], 48, root); bevel(lip, 0.001, 2)
linewound = cyl("line_on_spool", 0.0262, 0.0262, 0.027, sp_c + Vector((0, 0.001, 0)), (0, -1, 0), M["line"], 48, root)
drag = cyl("drag_knob", 0.012, 0.014, 0.012, sp_c + Vector((0, -0.024, 0)), (0, -1, 0), M["accent"], 24, root); bevel(drag, 0.0015, 3)
# the handle, on the reel's left (x +): an arm out from the side plate and a T-knob for the fingers
crank = bpy.data.objects.new("crank", None); col.objects.link(crank); crank.parent = root; crank.location = P(0.024, -0.072, -0.012)
hub = cyl("crank_hub", 0.006, 0.006, 0.01, P(0.005, 0, 0), P(1, 0, 0), M["chrome"], 20, crank); bevel(hub, 0.0008, 2)
arm = box("crank_arm", 0.004, 0.007, 0.05, P(0.008, -0.024, 0), M["body"], crank); bevel(arm, 0.0012, 3)
knob = cyl("crank_knob", 0.0072, 0.0078, 0.022, P(0.018, -0.048, 0), P(1, 0, 0), M["rubber"], 24, crank); bevel(knob, 0.002, 3)
# where things attach, for angler.js: the knob's centre, where the line leaves the spool
for n, p in {"att_knob": P(0.016, -0.048, 0), "att_line": P(0, -0.072, 0.066)}.items():
    e = bpy.data.objects.new(n, None); col.objects.link(e); e.parent = crank if n == "att_knob" else root; e.location = p - (crank.location if n == "att_knob" else Vector()) if False else p
# (att_knob sits in the crank's frame: its location is relative to the crank's pivot)
bpy.data.objects["att_knob"].location = P(0.016, -0.048, 0)
os.makedirs(OUT + "/source/reel", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/reel/reel.blend")
bpy.ops.export_scene.gltf(filepath=OUT + "/exports/reel.glb", export_format="GLB", export_apply=True, export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
tris = 0
for o in bpy.data.objects:
    if o.type == "MESH":
        dg = bpy.context.evaluated_depsgraph_get(); me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles)
print("REEL DONE", tris, "triangles", os.path.getsize(OUT + "/exports/reel.glb") // 1000, "kB")
