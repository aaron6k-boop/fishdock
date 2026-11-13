for _f in ("riglib",): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the jacket's chest, second step. The smoothing let the cloth sink into the chest; it is now held
# 6 mm outside the body's surface after smoothing (the smoothing and that hold both baked in with the rig at rest, so
# the bones bend the result as before).
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
jk = bpy.data.objects["jacket"]; rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]; C = ctx3d()
rig.data.pose_position = "REST"; bpy.context.view_layer.update()
sw = jk.modifiers.new("chest_hold", "SHRINKWRAP"); sw.target = body; sw.wrap_method = "NEAREST_SURFACEPOINT"; sw.wrap_mode = "OUTSIDE_SURFACE"; sw.offset = 0.006; sw.vertex_group = "chest_smooth"
try: jk.modifiers.move(list(jk.modifiers).index(sw), 1)
except Exception as e: print("move:", e)
print("jacket modifiers", [(m.name, m.type) for m in jk.modifiers])
for o in bpy.context.view_layer.objects: o.select_set(False)
jk.select_set(True); bpy.context.view_layer.objects.active = jk
for nm in ("chest_smooth", "chest_hold"):
    with bpy.context.temp_override(**C, object=jk, active_object=jk, selected_objects=[jk]): bpy.ops.object.modifier_apply(modifier=nm)
print("jacket modifiers after baking", [(m.name, m.type) for m in jk.modifiers])
rig.data.pose_position = "POSE"; bpy.context.view_layer.update()
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.0; sun.rotation_euler = (math.radians(42), math.radians(12), math.radians(-35))
jk.data.materials.clear(); jk.data.materials.append(mat("jacket_e", (0.06, 0.09, 0.17), 0.88))
body.data.materials.clear(); body.data.materials.append(mat("skin_e", (0.80, 0.58, 0.47), 0.48))
shot("jk6_front", (0, 0, 1.25), (0.4, -1.8, 1.4), 50, (900, 900)); shot("jk6_side", (0, 0, 1.25), (-1.8, -0.4, 1.4), 50, (900, 900))
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved fp_character.blend")
