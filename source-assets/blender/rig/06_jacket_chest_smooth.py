for _f in ("riglib",): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the jacket's chest smoothed. The jacket is the body's own surface pushed out a few millimetres,
# so it carried the bare chest's shape (it read as a figure-hugging top). A smoothing restricted to the front of the
# chest and the shoulders' fronts, before the jacket is bent by the bones, lets the cloth hang across instead.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
jk = bpy.data.objects["jacket"]; rig = bpy.data.objects["fp_rig"]
print("jacket modifiers before", [(m.name, m.type) for m in jk.modifiers])
vg = jk.vertex_groups.get("chest_smooth") or jk.vertex_groups.new(name="chest_smooth")
mw = jk.matrix_world; n_ = 0
for v in jk.data.vertices:
    p = mw @ v.co
    if p.y > 0.02: continue
    wz = max(0.0, 1 - abs(p.z - 1.30) / 0.17); wx = max(0.0, 1 - max(0.0, abs(p.x) - 0.12) / 0.08); w = min(1.0, wz * wx * 1.6)
    if w > 0.01: vg.add([v.index], w, "REPLACE"); n_ += 1
print("chest points weighted", n_)
sm = jk.modifiers.get("chest_smooth") or jk.modifiers.new("chest_smooth", "SMOOTH"); sm.factor = 1.0; sm.iterations = 60; sm.vertex_group = "chest_smooth"
try: jk.modifiers.move(list(jk.modifiers).index(sm), 0)
except Exception as e:
    print("move:", e)
    with bpy.context.temp_override(**ctx3d(), object=jk, active_object=jk): bpy.ops.object.modifier_move_to_index(modifier="chest_smooth", index=0)
print("jacket modifiers after", [(m.name, m.type) for m in jk.modifiers])
bpy.context.view_layer.update()
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(42), math.radians(12), math.radians(-35))
jk.data.materials.clear(); jk.data.materials.append(mat("jacket_e", (0.06, 0.09, 0.17), 0.88))
shot("jk5_front", (0, 0, 1.25), (0.4, -1.8, 1.4), 50, (900, 900)); shot("jk5_side", (0, 0, 1.25), (-1.8, -0.4, 1.4), 50, (900, 900))
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved fp_character.blend")
