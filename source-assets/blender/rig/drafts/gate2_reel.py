# (draft for Gate 2, not queued until Gate 1 is passed)
for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 2: ten uninterrupted turns of the reel's handle on the Gate 1 hold. The handle's own turn
# moves the knob (the reel drives the hand, never the other way); the knob turns freely in the fingers, so the hand
# keeps its grip and only its turn about the knob's axis changes, chosen each frame near the last to keep the wrist
# and forearm comfortable. The left shoulder lifts and drops a little with the hand and the elbow follows by IK. Contact
# of the fingers and thumb with the knob is measured every frame, and the turns are rendered from first person and the
# side as a video.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v2.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
crank = next(o for o in bpy.data.objects if o.name.startswith("crank") and o.type == "EMPTY")
knobE = next(o for o in bpy.data.objects if o.name.startswith("att_knob") and o.parent == crank)
HS = HandSkin(rig, body, "L"); sc = bpy.context.scene
LOC = palm_frame(rig, "L"); _, _, kL, pL, alL = LOC
FPR = 24; REVS = 10; N = FPR * REVS; sc.frame_start = 1; sc.frame_end = N; sc.render.fps = 24   # (one turn a second)
th0 = crank.rotation_euler.x
M0 = rig.matrix_world @ rig.pose.bones["DEF-hand.L"].matrix
kc0 = knobE.matrix_world.translation.copy(); CW = crank.matrix_world.copy(); kx = (CW.to_3x3() @ Vector((1, 0, 0))).normalized()
off0 = M0.translation - kc0; R0 = M0.to_3x3().normalized()
sh0 = rig.pose.bones["shoulder.L"].matrix.copy(); z_mid = None
def wrist_L():
    R3 = (rig.matrix_world @ rig.pose.bones["DEF-hand.L"].matrix).to_3x3().normalized(); kw, pw, aw = R3 @ kL, R3 @ pL, R3 @ alL
    sh, el, wr = wpos(rig, "DEF-upper_arm.L"), wpos(rig, "DEF-forearm.L"), wpos(rig, "DEF-hand.L"); fo = (wr - el).normalized()
    flex = math.degrees(math.atan2(-fo.dot(pw), fo.dot(aw))); rad = math.degrees(math.atan2(-fo.dot(kw), fo.dot(aw)))
    u = el - sh; u = (u - u.dot(fo) * fo).normalized(); n_arm = (el - sh).cross(wr - el).normalized(); pp_ = (pw - pw.dot(fo) * fo).normalized()
    return flex, rad, math.degrees(math.atan2(pp_.dot(u), pp_.dot(n_arm)))
def pen(fl, rd, pr): return (max(0, fl - 55) + max(0, -45 - fl)) + (max(0, rd - 15) + max(0, -30 - rd)) + (max(0, pr - 85) + max(0, -75 - pr))
rows = []; beta = 0.0
for f in range(N):
    th = th0 - 2 * math.pi * f / FPR
    crank.rotation_euler.x = th; crank.keyframe_insert("rotation_euler", index=0, frame=f + 1); bpy.context.view_layer.update()
    kc = knobE.matrix_world.translation.copy()
    best = None
    for db in range(-6, 7, 2):
        b = beta + db; Rb = Quaternion(kx, math.radians(b)).to_matrix()
        M = (Rb @ R0).to_4x4(); M.translation = kc + Rb @ off0
        set_hand(rig, "L", M); fl, rd, pr = wrist_L(); c_ = pen(fl, rd, pr) + abs(b) * 0.05 + abs(db) * 0.3 + abs(fl) * 0.02 + abs(rd) * 0.02
        if best is None or c_ < best[0]: best = (c_, b, M, (fl, rd, pr))
    beta = best[1]; set_hand(rig, "L", best[2])
    pb = rig.pose.bones["hand_ik.L"]; pb.keyframe_insert("location", frame=f + 1); pb.keyframe_insert("rotation_quaternion", frame=f + 1)
    P = HS.deform(); knob = (tuple(kc - kx * 0.013), tuple(kc + kx * 0.013), 0.010)
    g = {fn: float(seg_clear(P[HS.sel("DEF-f_" + fn)], [knob]).min()) for fn in ("index", "middle")}; g["thumb"] = float(seg_clear(P[HS.sel("DEF-thumb")], [knob]).min())
    el = wpos(rig, "DEF-forearm.L"); rows.append(dict(f=f, beta=round(beta, 1), wrist=[round(x, 1) for x in best[3]], elbow=[round(x, 3) for x in el], **{k: round(v, 4) for k, v in g.items()}))
for k in ("index", "middle", "thumb"):
    v = [r[k] for r in rows]; print(k, "gap to the knob over ten turns (m): min %.4f max %.4f" % (min(v), max(v)))
for i, nm in enumerate(("palm bend", "thumb bend", "forearm turn")):
    v = [r["wrist"][i] for r in rows]; print(nm, "over ten turns: %.1f to %.1f" % (min(v), max(v)))
json.dump(rows, open(RIGDIR + "/gate2_rows.json", "w"))
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/gate2_reel.blend"); print("saved gate2_reel.blend")
