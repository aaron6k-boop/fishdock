# FishDock: first-person arms from the shoulder (upper arm, forearm, hand, fingers) cut from the MPFB angler, with a
# jacket sleeve modelled on the arm and skinned to the same bones (it bends at the elbow with the arm), exported as
# fp_body.glb. Bones keep the angler rig's names, so the hands' bones match fp_arms.glb.
import bpy, bmesh, os, math, traceback
from mathutils import Vector, noise
OUT = "C:/Users/aaron/Documents/FishDock-assets"
bpy.ops.wm.open_mainfile(filepath=OUT + "/source/people/angler_man.blend")
body = bpy.data.objects["angler_man"]; rig = bpy.data.objects["angler_man.rig"]
ARM = [f"{n}_{s}" for s in "lr" for n in ["upperarm", "lowerarm", "hand"] + [f"{f}_{i:02d}" for f in ["thumb", "index", "middle", "ring", "pinky"] for i in (1, 2, 3)]]
KEEP = ARM + ["clavicle_l", "clavicle_r"]
dg = bpy.context.evaluated_depsgraph_get()
def cut(name):
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.matrix_world = body.matrix_world.copy()
    for vg in body.vertex_groups: ob.vertex_groups.new(name=vg.name)
    return ob, me
idx = {vg.name: vg.index for vg in body.vertex_groups}
G = lambda names: {idx[k] for k in names if k in idx}
armIdx = G(ARM); handIdx = G([k for k in ARM if not k.startswith(("upperarm", "lowerarm"))]); upIdx = G(["upperarm_l", "upperarm_r"]); clavIdx = G(["clavicle_l", "clavicle_r"])
B = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
def along(co):  # how far up the forearm from the wrist (m), on the vertex's own side
    s = "l" if co.x > 0 else "r"; wrist = B["hand_" + s][0]; elbow = B["lowerarm_" + s][0]; ax = (elbow - wrist).normalized()
    return (co - wrist).dot(ax), s

# ---- the skin: the hands and the first 7 cm of forearm (the rest is under the sleeve) ----
arms, me = cut("fp_arms")
bm = bmesh.new(); bm.from_mesh(me); dl = bm.verts.layers.deform.verify(); kill = []
for v in bm.verts:
    d = v[dl]; w = sum(wt for g, wt in d.items() if g in armIdx); wh = sum(wt for g, wt in d.items() if g in handIdx)
    t, s = along(v.co)
    if w < 0.6 or (wh < 0.5 and t > 0.07): kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(me); bm.free()
print("skin verts", len(me.vertices))

# ---- the sleeve: the arm's own surface from the shoulder to 2.5 cm short of the wrist, let out from the skin (more
# at the elbow and the cuff, where a jacket stands off), with soft folds, and a turned-in edge at the cuff ----
slv, ms = cut("fp_sleeve")
bm = bmesh.new(); bm.from_mesh(ms); dl = bm.verts.layers.deform.verify(); kill = []
for v in bm.verts:
    d = v[dl]; w = sum(wt for g, wt in d.items() if g in armIdx | clavIdx); wh = sum(wt for g, wt in d.items() if g in handIdx); wa = sum(wt for g, wt in d.items() if g in armIdx)
    t, s = along(v.co)
    if wa < 0.35 or wh > 0.5 or t < 0.025: kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS")
bm.normal_update()
for v in bm.verts:
    t, s = along(v.co); fore = B["lowerarm_" + s][0].copy(); L = (B["lowerarm_" + s][0] - B["hand_" + s][0]).length
    cuff = max(0.0, 1.0 - (t - 0.025) / 0.07); elbow = math.exp(-((t - L) / 0.07) ** 2)
    fold = noise.noise(Vector((v.co.x * 9, v.co.y * 9, v.co.z * 26))) * 0.006 + noise.noise(v.co * 40) * 0.002
    v.co += v.normal * (0.011 + 0.004 * cuff + 0.005 * elbow + fold)
# the cuff's edge: the open rim nearest the wrist, turned in towards the arm so the sleeve has a thickness there
rim = [e for e in bm.edges if e.is_boundary and all(along(vv.co)[0] < 0.06 for vv in e.verts)]
if rim:
    r = bmesh.ops.extrude_edge_only(bm, edges=rim); nv = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    for v in nv:
        t, s = along(v.co); wrist = B["hand_" + s][0]; ax = (B["lowerarm_" + s][0] - wrist).normalized(); c = wrist + ax * t
        v.co = c + (v.co - c) * 0.80 + ax * 0.012
print("cuff rim edges", len(rim))
# fabric UVs: round the arm (u) and along it (v), in metres, so a woven texture keeps its scale
uv = bm.loops.layers.uv.verify()
def cyl(co):
    s = "l" if co.x > 0 else "r"
    t, _ = along(co); wrist = B["hand_" + s][0]; ax = (B["lowerarm_" + s][0] - wrist).normalized()
    if t > (B["lowerarm_" + s][0] - wrist).length:  # above the elbow: along the upper arm
        el = B["lowerarm_" + s][0]; ax2 = (B["upperarm_" + s][0] - el).normalized(); t2 = (co - el).dot(ax2); c = el + ax2 * t2; ax = ax2; t = (el - wrist).length + t2
    else: c = wrist + ax * t
    r = co - c; ref = Vector((0, 0, 1)) - ax * ax.z; ref.normalize(); ref2 = ax.cross(ref)
    return math.atan2(r.dot(ref2), r.dot(ref)) / (2 * math.pi), t
for f in bm.faces:
    cu, _ = cyl(f.calc_center_median())
    for lp in f.loops:
        u, t = cyl(lp.vert.co)
        if u - cu > 0.5: u -= 1
        if cu - u > 0.5: u += 1
        lp[uv].uv = (u * 0.34 + (0.5 if lp.vert.co.x > 0 else 0), t)
    f.smooth = True
bm.to_mesh(ms); bm.free()
print("sleeve verts", len(ms.vertices))
mat = bpy.data.materials.new("jacket"); mat.use_nodes = True; bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.045, 0.075, 0.15, 1); bsdf.inputs["Roughness"].default_value = 0.78
ms.materials.clear(); ms.materials.append(mat)
for p in ms.polygons: p.material_index = 0

# ---- the skeleton: the angler's own rig, whole (the arms hang from its collar bones; the body's other bones cost nothing) ----
r2 = rig
for ob in (arms, slv):
    # only the arm's own bones move these: a share left on the collar bone or the spine pinned those points to the
    # body, and the sleeve's top tore into spikes as the arm moved
    for vg in list(ob.vertex_groups):
        if vg.name not in ARM: ob.vertex_groups.remove(vg)
    up = {s: ob.vertex_groups.get("upperarm_" + s) or ob.vertex_groups.new(name="upperarm_" + s) for s in "lr"}
    for v in ob.data.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot < 0.999: up["l" if v.co.x > 0 else "r"].add([v.index], 1.0 - tot + (up["l" if v.co.x > 0 else "r"].weight(v.index) if any(g.group == up["l" if v.co.x > 0 else "r"].index for g in v.groups) else 0.0), "REPLACE")
    mw = ob.matrix_world.copy(); ob.parent = r2; ob.matrix_world = mw
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    if ob is slv: sub = ob.modifiers.new("smooth", "SUBSURF"); sub.levels = 1; sub.render_levels = 1
    am = ob.modifiers.new("arm", "ARMATURE"); am.object = r2
for o in list(bpy.data.objects):
    if o not in (arms, slv, r2): bpy.data.objects.remove(o, do_unlink=True)
for m in arms.data.materials:
    if not m or not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 2048: n.image.scale(2048, 2048)
win = bpy.context.window_manager.windows[0]
with bpy.context.temp_override(window=win, screen=win.screen):
    bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/people/fp_body.blend")
    bpy.ops.export_scene.gltf(filepath=OUT + "/exports/fp_body.glb", export_format="GLB", export_skins=True, export_apply=True, export_image_format="WEBP", export_jpeg_quality=82, export_cameras=False, export_lights=False, export_animations=False)
print("exported kB", os.path.getsize(OUT + "/exports/fp_body.glb") // 1000)
# a look at it: the right arm from four sides
CHECK_NAME = "fp_body"; CHECK_DIST = 0.32; CHECK_TARGET = tuple((B["lowerarm_r"][0] + B["hand_r"][0]) / 2)
CHECK_ANGLES = [(200, 15), (250, 25), (120, 10), (200, -40)]
exec(compile(open(OUT + "/scripts/render_check.py").read(), "render_check", "exec"))
