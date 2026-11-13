exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/riglib.py").read())
# FishDock rig rebuild: the jacket from the rigged body's own mesh (rest pose), cut straight at the waist, the neck and
# 6 cm above each wrist (square to the forearm), smoothed into cloth, let out along fresh normals, given thickness and
# a hem, weighted from the skin
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]; J = json.load(open(RIGDIR + "/joints.json")); C = ctx3d()
for o in [o for o in bpy.data.objects if o.name.startswith("jacket")]: bpy.data.objects.remove(o, do_unlink=True)
me = body.data.copy(); me.name = "jacket"; jk = link(bpy.data.objects.new("jacket", me)); jk.matrix_world = body.matrix_world.copy()
mw = jk.matrix_world.copy(); mwi = mw.inverted()
bm = bmesh.new(); bm.from_mesh(me)
def cut(co, no):
    co = mwi @ Vector(co); no = (mwi.to_3x3() @ Vector(no)).normalized()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_inner=True)
print("start", len(bm.verts))
# the waist: only the torso is trimmed there (the arms hang below it in the rest pose and end at their own cuffs)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=mwi @ Vector((0, 0, 0.935)), plane_no=(mwi.to_3x3() @ Vector((0, 0, 1))).normalized(), clear_inner=False)
rem = [f for f in bm.faces if (mw @ f.calc_center_median()).z < 0.935 and abs((mw @ f.calc_center_median()).x) < 0.215]
bmesh.ops.delete(bm, geom=rem, context="FACES"); print("after waist", len(bm.verts))
cut((0, 0, 1.465), (0, 0, -1)); print("after neck", len(bm.verts))
for S in "LR":
    W = Vector(J["wrist." + S]); E = Vector(J["elbow." + S]); ax = (E - W).normalized(); pc = W + ax * 0.06
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=mwi @ pc, plane_no=(mwi.to_3x3() @ ax).normalized(), clear_inner=False)
    rem = [f for f in bm.faces if ((mw @ f.calc_center_median()) - pc).dot(ax) < 0 and ((mw @ f.calc_center_median()) - W).length < 0.32]
    bmesh.ops.delete(bm, geom=rem, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
print("after cuffs", len(bm.verts))
inner = [v for v in bm.verts if not v.is_boundary]
for _ in range(40): bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.normal_update()
for v in bm.verts:
    p = mw @ v.co; off = 0.018
    for S, s in (("L", 1), ("R", -1)):
        W = Vector(J["wrist." + S]); E = Vector(J["elbow." + S]); ax = (E - W).normalized(); t = (p - W).dot(ax)
        if p.x * s > 0.13 and (p - W).length < 0.5: off = 0.007 + min(1, max(0, (t - 0.06) / 0.10)) * 0.010
    v.co = v.co + v.normal * off
for _ in range(4): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me); bm.free()
for m in list(jk.modifiers): jk.modifiers.remove(m)
jk.vertex_groups.clear()
sol = jk.modifiers.new("thick", "SOLIDIFY"); sol.thickness = 0.003; sol.offset = 1.0; sol.use_rim = True
with bpy.context.temp_override(**C, active_object=jk, object=jk, selected_objects=[jk]): bpy.ops.object.modifier_apply(modifier=sol.name)
print("jacket points", len(me.vertices))
dt = jk.modifiers.new("weights", "DATA_TRANSFER"); dt.object = body; dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}; dt.vert_mapping = "POLYINTERP_NEAREST"
with bpy.context.temp_override(**C, active_object=jk, object=jk, selected_objects=[jk]):
    bpy.ops.object.datalayout_transfer(modifier=dt.name); bpy.ops.object.modifier_apply(modifier=dt.name)
arm = jk.modifiers.new("rig", "ARMATURE"); arm.object = rig; jk.parent = rig; jk.matrix_parent_inverse = rig.matrix_world.inverted()
for p in me.polygons: p.use_smooth = True
me.materials.clear(); me.materials.append(mat("jacket", (0.10, 0.14, 0.26), 0.85))
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved with jacket")
workbench(); body.data.materials.clear(); body.data.materials.append(mat("skin", (0.86, 0.68, 0.57)))
shot("jk4_front", (0, 0, 1.15), (0, -2.6, 1.2)); shot("jk4_arm", Vector(J["wrist.R"]) + Vector((0, 0, 0.12)), Vector(J["wrist.R"]) + Vector((-0.55, -0.35, 0.25)), 50)
