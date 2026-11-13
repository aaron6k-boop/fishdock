for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 2: ten uninterrupted turns of the reel's handle on the Gate 1 hold (rig/gate1_v12.blend).
# The handle's own turn moves the knob (the reel drives the hand, never the other way); the knob turns freely in the
# fingers, so the hand keeps its grip and only its turn about the knob's axis changes, chosen each frame near the last
# to keep the wrist and forearm comfortable. The left shoulder lifts and drops a little with the hand and the elbow
# follows by IK (stretch off). The fingers' and thumb's gaps to the knob and the deepest point of the skin in the knob,
# the handle's arm, the reel and the rod are measured on every frame. One turn a second (24 frames), handle forwards
# over the top as a spinning reel is wound. Rendered from first person, the side and close to the knob.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v12.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
exec(open(ROOT + "/scripts/gatelib_v1.py").read())
rod = bpy.data.objects["ROD"]; RW = rod.matrix_world.copy(); RWi = RW.inverted()
crank = next(o for o in bpy.data.objects if o.name.startswith("crank") and o.type == "EMPTY")
knobE = next(o for o in bpy.data.objects if o.name.startswith("att_knob") and o.parent == crank)
HS = HandSkin(rig, body, "L"); sc = bpy.context.scene
TH0 = float(rig.get("fd_crank_deg", 30.0)); FPR_ = 24; REVS = 10; N = FPR_ * REVS
def knob_at(th):
    crank.rotation_euler = (math.radians(th), 0, 0); bpy.context.view_layer.update()
    CW = crank.matrix_world.copy(); kc = knobE.matrix_world.translation.copy(); kx = (CW.to_3x3() @ Vector((1, 0, 0))).normalized()
    return kc, kx, CW
kc0, kx0, CW0 = knob_at(TH0)
M0 = rig.matrix_world @ rig.pose.bones["DEF-hand.L"].matrix; R0 = M0.to_3x3().normalized(); off0 = M0.translation - kc0
SH0 = rig.pose.bones["shoulder.L"].matrix.copy(); hub = CW0.translation.copy()
H_ = lambda y0, y1: (tuple(RW @ Vector((0, y0, 0))), tuple(RW @ Vector((0, y1, 0))), handle_radius((y0 + y1) / 2))
REELBODY = (tuple(RW @ Vector((0, -SEAT - 0.015, -0.076))), tuple(RW @ Vector((0, -SEAT + 0.04, -0.076))), 0.028)
STEM = (tuple(RW @ Vector((0, -SEAT + 0.002, -0.014))), tuple(RW @ Vector((0, -SEAT + 0.010, -0.056))), 0.0055)
HANDLE = [H_(-0.025, -0.25), H_(-0.25, -0.40), H_(-0.40, -0.43), H_(-0.43, -0.50), H_(-0.50, -0.64)]
print("start: crank", TH0, "deg; left wrist (palm, thumb, turn, elbow)", [round(x, 1) for x in wrist("L")], "arm lengths", [round(x, 3) for x in lengths("L")])
ad = rig.animation_data_create(); ad.action = None
for o in (crank,):
    if o.animation_data: o.animation_data.action = None
rows = []; beta = 0.0; LIFT = 0.2
pbH = rig.pose.bones["hand_ik.L"]; pbS = rig.pose.bones["shoulder.L"]
for f in range(N + 1):
    th = TH0 + 360.0 * f / FPR_
    kc, kx, CW = knob_at(th); crank.keyframe_insert("rotation_euler", index=0, frame=f + 1)
    dz = (kc - CW.translation).dot(Vector((0, 0, 1)))
    lift_shoulder("L", math.atan2(LIFT * dz, 0.17), SH0)
    best = None
    for db in range(-8, 9, 2):
        b = beta + db; Rb = Quaternion(kx, math.radians(b)).to_matrix()
        M = (Rb @ R0).to_4x4(); M.translation = kc + Rb @ off0
        set_hand(rig, "L", M); w_ = wrist("L"); m_ = miss("L", M)
        c_ = limits_pen(*w_) * 4 + abs(b) * 0.004 + abs(db) * 0.05 + abs(w_[0]) * 0.02 + abs(w_[1]) * 0.02 + m_ * 400
        if best is None or c_ < best[0]: best = (c_, b, M, w_, m_)
    beta = best[1]; set_hand(rig, "L", best[2])
    key_pose_bone(pbH, f + 1); key_pose_bone(pbS, f + 1)
    P = HS.deform(); knob = (tuple(kc - kx * 0.013), tuple(kc + kx * 0.013), 0.010); carm = (tuple(CW.translation), tuple(kc - kx * 0.013), 0.0045)
    g = {fn: float(seg_clear(P[HS.sel("DEF-f_" + fn)], [knob]).min()) for fn in ("index", "middle", "ring", "pinky")}; g["thumb"] = float(seg_clear(P[HS.sel("DEF-thumb")], [knob]).min())
    deep = float(seg_clear(P, [knob, carm, REELBODY, STEM] + HANDLE).min())
    Mh = rig.matrix_world @ rig.pose.bones["DEF-hand.L"].matrix
    rows.append(dict(f=f, th=round(th % 360, 2), beta=round(beta, 2), wrist=[round(x, 2) for x in best[3]], miss=round(best[4], 5), len=[round(x, 4) for x in lengths("L")], deep=round(deep, 5), lift=round(math.degrees(math.atan2(LIFT * dz, 0.17)), 2),
                     elbow=[round(x, 4) for x in wpos(rig, "DEF-forearm.L")], hand_rod=[[round(x, 6) for x in r] for r in (RWi @ Mh)], knob_rod=[round(x, 6) for x in (RWi @ kc)], **{k: round(v, 5) for k, v in g.items()}))
print("frames", len(rows))
for k in ("index", "middle", "ring", "pinky", "thumb"): print(k, "gap to the knob over ten turns (m):", stats([r[k] for r in rows]))
print("deepest skin into the knob, the handle's arm, the reel or the rod (m):", stats([r["deep"] for r in rows]))
for i, nm in enumerate(("palm bend", "thumb-side bend", "forearm turn", "elbow")): print(nm, "over ten turns (deg):", "%.1f to %.1f" % (min(r["wrist"][i] for r in rows), max(r["wrist"][i] for r in rows)))
print("hand's turn about the knob (deg):", "%.1f to %.1f" % (min(r["beta"] for r in rows), max(r["beta"] for r in rows)), "; hand off its target at most (m): %.5f" % max(r["miss"] for r in rows))
print("arm length ratios over ten turns:", "upper %.4f to %.4f, fore %.4f to %.4f" % (min(r["len"][0] for r in rows), max(r["len"][0] for r in rows), min(r["len"][1] for r in rows), max(r["len"][1] for r in rows)))
last = rows[N - FPR_:N]; prev = rows[N - 2 * FPR_:N - FPR_]
print("turn 9 against turn 10, the hand's turn about the knob differs by at most (deg): %.2f" % max(abs(a["beta"] - b["beta"]) for a, b in zip(last, prev)))
json.dump(dict(rows=rows, crank0=TH0, fpr=FPR_, revs=REVS, lift=LIFT), open(RIGDIR + "/gate2_rows.json", "w"))
sc.frame_start = 1; sc.frame_end = N; sc.render.fps = 24; sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/gate2_reel.blend"); print("saved gate2_reel.blend")
exec(open(ROOT + "/scripts/scene_v1.py").read())
kmid = RW @ Vector((0.063, -SEAT + 0.012, -0.076))
video("gate2_fp", (540, 960), (1, N), fp_cam(-15))
video("gate2_side", (720, 720), (1, N), look_cam(kmid + Vector((0.0, 0.05, 0.05)), kmid + Vector((1.15, -0.55, 0.35)), 45))
video("gate2_knob", (720, 720), (1, N), look_cam(kmid, kmid + Vector((0.28, -0.26, 0.12)), 50))
print("gate 2 done")
