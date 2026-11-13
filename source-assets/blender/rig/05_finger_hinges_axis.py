for _f in ("riglib", "griplib", "posing_v3"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the fingers' hinges fixed, second step. Rigify's finger chains were working out their bend axis
# from each finger's own resting curve ("automatic"), and this body's fingers are nearly straight at rest, so that axis
# was close to random whatever the bones' roll. Each finger and thumb chain is now told to bend about the bone's own X
# axis, which the meta-rig now lays along the knuckles' line (fixed in the step before); the rig is generated again
# and checked: each knuckle bent 60 degrees must move the finger into the palm, and both hands are closed into fists.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
C = ctx3d(); meta = bpy.data.objects["metarig"]; body = bpy.data.objects["GEO-body_male_realistic"]
meta.hide_viewport = False
for S in "LR":
    for f in ("f_index", "f_middle", "f_ring", "f_pinky", "thumb"):
        pb = meta.pose.bones[f"{f}.01.{S}"]; rp = pb.rigify_parameters
        was = getattr(rp, "primary_rotation_axis", None)
        try: rp.primary_rotation_axis = "X"
        except Exception as e: print("could not set", pb.name, e)
        print(pb.name, "rig type", pb.rigify_type, "bend axis was", was, "now", getattr(rp, "primary_rotation_axis", None))
for o in bpy.context.view_layer.objects: o.select_set(False)
meta.select_set(True); bpy.context.view_layer.objects.active = meta
with bpy.context.temp_override(**C): bpy.ops.pose.rigify_generate()
rig = bpy.data.objects["fp_rig"]; print("generated again:", len(rig.data.bones), "bones")
for pb in rig.pose.bones: pb.ik_stretch = 0.0
for S in "LR":
    pp = rig.pose.bones["upper_arm_parent." + S]; pp["IK_Stretch"] = 0.0; pp["pole_vector"] = True
meta.hide_viewport = True; meta.hide_render = True
bpy.context.view_layer.update()
def palmdir(S):
    s = 1 if S == "L" else -1; mcp = {f: rig.data.bones[f"DEF-f_{f}.01.{S}"].head_local for f in ("index", "middle", "ring", "pinky")}
    wr = rig.data.bones[f"DEF-hand.{S}"].head_local; ha = (rig.data.bones[f"DEF-f_middle.03.{S}"].tail_local - wr).normalized()
    latp = (mcp["index"] - mcp["pinky"]).normalized(); dorsal = latp.cross(ha).normalized()
    if dorsal.dot(Vector((s, 0, 0))) < 0: dorsal = -dorsal
    return -dorsal, latp, ha
ok = True
for S in "LR":
    P, latp, ha = palmdir(S)
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        names = chain(rig, f, S)
        for n in names: rig.pose.bones[n].rotation_mode = "XYZ"; rig.pose.bones[n].rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update(); j = 2 if f != "thumb" else 3
        p0 = wpos(rig, (f"DEF-f_{f}.02.{S}" if f != "thumb" else f"DEF-thumb.03.{S}"), f == "thumb")
        k = 0 if f != "thumb" else 1
        rig.pose.bones[names[k]].rotation_euler.x = math.radians(60); bpy.context.view_layer.update()
        p1 = wpos(rig, (f"DEF-f_{f}.02.{S}" if f != "thumb" else f"DEF-thumb.03.{S}"), f == "thumb")
        mv = (p1 - p0).normalized(); side = mv.dot(latp); palmw = mv.dot(P)
        print(S, f, ("knuckle" if f != "thumb" else "thumb's middle joint"), "+60: towards the palm %.2f, sideways (to the first finger) %.2f, back along the hand %.2f" % (palmw, side, -mv.dot(ha)))
        if f != "thumb": ok = ok and palmw > 0.75 and abs(side) < 0.3
        rig.pose.bones[names[k]].rotation_euler.x = 0
print("FINGERS BEND INTO THE PALM:", ok)
for S in "LR":
    for f in ("index", "middle", "ring", "pinky"):
        for n, a in zip(chain(rig, f, S), (85, 100, 70)): rig.pose.bones[n].rotation_euler = (math.radians(a), 0, 0)
    for n, a in zip(chain(rig, "thumb", S), (20, 30, 40)): rig.pose.bones[n].rotation_euler = (math.radians(a), 0, 0)
bpy.context.view_layer.update()
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
body.data.materials.clear(); body.data.materials.append(mat("skin_e", (0.80, 0.58, 0.47), 0.48))
for S in "LR":
    P, latp, ha = palmdir(S); c = wpos(rig, f"DEF-hand.{S}") + ha * 0.07
    for nm_, dv in (("palm", P), ("back", -P), ("thumb", latp), ("little", -latp)): shot(f"fix2_fist_{S}_{nm_}", c, c + dv * 0.3 + ha * 0.05, 50, (700, 700))
for S in "LR":
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        for n in chain(rig, f, S): rig.pose.bones[n].rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved fp_character.blend")
