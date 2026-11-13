for _f in ("riglib", "griplib", "posing_v3"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: why the right ring finger never reaches the handle. For each finger of each hand: which way its
# middle joint moves when the knuckle bends 60 degrees (towards the palm, sideways, back), the knuckle's hinge against
# its neighbours', and the finger controls' own poses (a master control left turned or scaled would skew it).
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v5.blend")
rig = bpy.data.objects["fp_rig"]
for S in "LR":
    M, mcp, k, palm, along = palm_frame(rig, S)
    Mh = rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix; R3 = Mh.to_3x3().normalized(); Mi = Mh.inverted()
    for f in ("index", "middle", "ring", "pinky"):
        names = chain(rig, f, S); saved = [tuple(rig.pose.bones[n].rotation_euler) for n in names]
        for n in names: rig.pose.bones[n].rotation_mode = "XYZ"; rig.pose.bones[n].rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update(); p0 = Mi @ wpos(rig, f"DEF-f_{f}.02.{S}"); t0 = Mi @ wpos(rig, f"DEF-f_{f}.03.{S}", True)
        xax = (Mi.to_3x3() @ (rig.matrix_world @ rig.pose.bones[f"DEF-f_{f}.01.{S}"].matrix).to_3x3().col[0]).normalized()
        rig.pose.bones[names[0]].rotation_euler.x = math.radians(60); bpy.context.view_layer.update(); p1 = Mi @ wpos(rig, f"DEF-f_{f}.02.{S}")
        for n, a in zip(names, (80, 95, 65)): rig.pose.bones[n].rotation_euler.x = math.radians(a)
        bpy.context.view_layer.update(); t1 = Mi @ wpos(rig, f"DEF-f_{f}.03.{S}", True)
        mv = (p1 - p0); L = mv.length
        print(S, f, "knuckle 60: middle joint moves %.3f m: towards the palm %.2f, sideways (to the first finger) %.2f, along %.2f" % (L, mv.dot(palm) / L, mv.dot(k) / L, mv.dot(along) / L),
              "| hinge vs knuckles' line %.1f deg, tilt out of the palm %.1f deg" % (math.degrees(xax.angle(k if xax.dot(k) > 0 else -k)), math.degrees(math.asin(max(-1, min(1, xax.dot(palm)))))),
              "| fist: tip moves", [round(x, 3) for x in (t1 - t0)], "tip at", [round(x, 3) for x in t1])
        for n, s_ in zip(names, saved): rig.pose.bones[n].rotation_euler = s_
    for f in ("index", "middle", "ring", "pinky"):
        for nm in (f"f_{f}.01_master.{S}", f"f_{f}.01.{S}.001"):
            pb = rig.pose.bones.get(nm)
            if pb: print("   control", nm, "rot", [round(x, 3) for x in (pb.rotation_quaternion if pb.rotation_mode == "QUATERNION" else pb.rotation_euler)], "scale", [round(x, 3) for x in pb.scale], "loc", [round(x, 4) for x in pb.location])
    for f in ("index", "middle", "ring", "pinky"):
        for j in (1, 2, 3):
            pb = rig.pose.bones[f"DEF-f_{f}.0{j}.{S}"]; print("   ", pb.name, "constraints", [(c.type, c.subtarget, round(c.influence, 2)) for c in pb.constraints])
bpy.context.view_layer.update(); print("done")
