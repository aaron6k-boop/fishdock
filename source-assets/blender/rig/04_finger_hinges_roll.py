for _f in ("riglib", "griplib", "posing_v3"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the fingers' hinges fixed. Each finger bone's roll had been set from the plane of the finger's
# resting curl, but this body's fingers are nearly straight at rest, so that plane was close to random and a finger's
# knuckle bent it largely sideways. Now every finger bone's hinge (its X axis) lies along the knuckles' line, square to
# the bone, so a positive turn curls it straight into the palm; the thumb's hinge is set so it curls towards the palm's
# middle. The rig is generated again from the meta-rig (same bones, same places, same skin weights), stretch kept off,
# and checked: each knuckle bent 60 degrees must move the finger into the palm, and both hands are closed into fists.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character_before_finger_fix.blend")
C = ctx3d(); meta = bpy.data.objects["metarig"]; rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
print("metarig target", getattr(meta.data, "rigify_target_rig", None))
meta.hide_viewport = False
for o in bpy.context.view_layer.objects: o.select_set(False)
meta.select_set(True); bpy.context.view_layer.objects.active = meta
with bpy.context.temp_override(**C, active_object=meta, object=meta, selected_objects=[meta]): bpy.ops.object.mode_set(mode="EDIT")
eb = meta.data.edit_bones; PALMDIR = {}
for S, s in (("L", 1), ("R", -1)):
    mcp = {f: eb[f"f_{f}.01.{S}"].head.copy() for f in ("index", "middle", "ring", "pinky")}
    wr = eb[f"hand.{S}"].head.copy(); ha = (eb[f"f_middle.03.{S}"].tail - wr).normalized()
    latp = (mcp["index"] - mcp["pinky"]).normalized(); dorsal = latp.cross(ha).normalized()
    if dorsal.dot(Vector((s, 0, 0))) < 0: dorsal = -dorsal   # (the back of the hand faces out from the thigh at rest)
    P = -dorsal; PALMDIR[S] = (P, latp, ha)
    thumb_tip = eb[f"thumb.03.{S}"].tail; curl = sum(((eb[f"f_{f}.03.{S}"].tail - mcp[f]).dot(P)) for f in mcp)
    print(S, "palm faces", [round(x, 3) for x in P], "| thumb tip on the palm side by %.3f m, fingertips curl to the palm side by %.3f m (both should be positive)" % ((thumb_tip - mcp["index"]).dot(P), curl))
    old = {}
    for f in ("index", "middle", "ring", "pinky"):
        for j in (1, 2, 3):
            e = eb[f"f_{f}.0{j}.{S}"]; Y = e.vector.normalized(); old[e.name] = e.x_axis.copy()
            Z = P - P.dot(Y) * Y; e.align_roll(Z.normalized())   # (Z towards the palm; X = Y x Z along the knuckles' line)
            print("  ", e.name, "hinge was %.1f deg off the knuckles' line, now %.1f" % (math.degrees(min(old[e.name].angle(latp), old[e.name].angle(-latp))), math.degrees(min(e.x_axis.angle(latp), e.x_axis.angle(-latp)))))
    pc = (mcp["middle"] + mcp["ring"]) / 2 * 0.6 + wr * 0.4   # (the palm's middle, where the thumb curls to)
    for j in (1, 2, 3):
        e = eb[f"thumb.0{j}.{S}"]; Y = e.vector.normalized(); D = pc - e.head; Z = D - D.dot(Y) * Y
        if Z.length > 1e-5: e.align_roll(Z.normalized())
with bpy.context.temp_override(**C, active_object=meta, object=meta, selected_objects=[meta]): bpy.ops.object.mode_set(mode="OBJECT")
for o in bpy.context.view_layer.objects: o.select_set(False)
meta.select_set(True); bpy.context.view_layer.objects.active = meta
with bpy.context.temp_override(**C): bpy.ops.pose.rigify_generate()
rig = bpy.data.objects["fp_rig"]; print("generated again:", len(rig.data.bones), "bones")
for pb in rig.pose.bones: pb.ik_stretch = 0.0
for S in "LR":
    pp = rig.pose.bones["upper_arm_parent." + S]; pp["IK_Stretch"] = 0.0; pp["pole_vector"] = True
meta.hide_viewport = True; meta.hide_render = True
mods = [(o.name, m.object.name if m.object else None) for o in bpy.data.objects if o.type == "MESH" for m in o.modifiers if m.type == "ARMATURE"]
print("armature modifiers", mods)
bpy.context.view_layer.update()
# ---- check: a knuckle bent 60 degrees moves the finger into the palm ----
ok = True
for S in "LR":
    P, latp, ha = PALMDIR[S]
    for f in ("index", "middle", "ring", "pinky"):
        names = chain(rig, f, S)
        for n in names: rig.pose.bones[n].rotation_mode = "XYZ"; rig.pose.bones[n].rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update(); p0 = wpos(rig, f"DEF-f_{f}.02.{S}")
        rig.pose.bones[names[0]].rotation_euler.x = math.radians(60); bpy.context.view_layer.update(); p1 = wpos(rig, f"DEF-f_{f}.02.{S}")
        mv = (p1 - p0).normalized(); side = mv.dot(latp); palmw = mv.dot(P)
        print(S, f, "knuckle +60: towards the palm %.2f, sideways %.2f, back along the hand %.2f" % (palmw, side, -mv.dot(ha)))
        ok = ok and palmw > 0.75 and abs(side) < 0.25
        rig.pose.bones[names[0]].rotation_euler.x = 0
print("FINGERS BEND INTO THE PALM:", ok)
# ---- both hands closed into fists through the controls, rendered ----
for S in "LR":
    for f in ("index", "middle", "ring", "pinky"):
        for n, a in zip(chain(rig, f, S), (85, 100, 70)): rig.pose.bones[n].rotation_euler = (math.radians(a), 0, 0)
    for n, a in zip(chain(rig, "thumb", S), ((20, 0, 0), (30, 0, 0), (40, 0, 0))): rig.pose.bones[n].rotation_euler = tuple(math.radians(x) for x in a)
bpy.context.view_layer.update()
jk = bpy.data.objects.get("jacket")
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.5, 0.58, 1)
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
body.data.materials.clear(); body.data.materials.append(mat("skin_e", (0.80, 0.58, 0.47), 0.48))
for S in "LR":
    P, latp, ha = PALMDIR[S]; c = wpos(rig, f"DEF-hand.{S}") + ha * 0.07
    for nm_, dv in (("palm", P), ("back", -P), ("thumb", latp), ("little", -latp)): shot(f"fix_fist_{S}_{nm_}", c, c + dv * 0.3 + ha * 0.05, 50, (800, 800))
for S in "LR":
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        for n in chain(rig, f, S): rig.pose.bones[n].rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved fp_character.blend")
