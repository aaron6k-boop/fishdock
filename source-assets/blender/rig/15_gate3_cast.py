for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 3 (v6: the rod turned rigidly from the hold, never rolled): the two-handed overhead cast of a 12 ft pier rod, on the Gate 1 hold. The body's turn
# comes from the Mixamo "fishing cast" motion capture (the chest's own turn against the hips: back for the wind-up,
# through for the release, settling after); the rod's path is chosen here at four moments, as the game times its cast
# (still at 0 s, wound up at 0.6 s, the release at 0.85 s, the follow-through by 1.25 s, back to the hold by 2.4 s), each
# searched for the place both arms reach without stretching, with the wrists inside their natural limits, the hands and
# arms clear of the head, and the rod at the angle that moment of a cast has (back over the right shoulder at 45 degrees
# past upright; near upright at the release; 35 degrees up towards the water to follow through). The right hand holds
# the reel seat with the Gate 1 grip; the left hand holds the butt with the grip searched for it (rig/grips.json,
# "butt_L"), turning about the butt for the most comfortable wrist, until it goes back to the reel's knob at 1.95 s.
# Each elbow goes where its wrist is most comfortable (its pole turned about the shoulder-to-hand line), and the left
# hand may hold the butt anywhere along its first 25 cm (as far up it as it needs to be reached), as the game's own IK
# does (fpRig.js). Every frame is measured (bone lengths, wrists, elbows, skin in the handle, hands from the eye) and the
# cast rendered from first person, the side and over the shoulder.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v12.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]; C = ctx3d()
exec(open(ROOT + "/scripts/gatelib_v1.py").read())
HS = {S: HandSkin(rig, body, S) for S in "LR"}
exec(open(ROOT + "/scripts/grasplib_v3.py").read())
GR = json.load(open(RIGDIR + "/grips.json")); BUTT = GR["butt_L"]
rod = bpy.data.objects["ROD"]; RW1 = rod.matrix_world.copy()
crank = next(o for o in bpy.data.objects if o.name.startswith("crank") and o.type == "EMPTY")
knobE = next(o for o in bpy.data.objects if o.name.startswith("att_knob") and o.parent == crank)
G_ROD = Matrix(rig["fd_rod_grip"]); G_KNOB = Matrix(rig["fd_knob_grip"])
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; EYE1 = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
HEAD = "DEF-spine.006" if "DEF-spine.006" in rig.pose.bones else next(n for n in ("DEF-head", "head") if n in rig.pose.bones)
EYE_H = (rig.matrix_world @ rig.pose.bones[HEAD].matrix).inverted() @ EYE1
def eye_now(): return rig.matrix_world @ rig.pose.bones[HEAD].matrix @ EYE_H
E_G1 = {S: wpos(rig, "DEF-forearm." + S) for S in "LR"}
POLE_OFF = {S: (rig.pose.bones["upper_arm_ik_target." + S].matrix.translation - rig.matrix_world.inverted() @ E_G1[S]) for S in "LR"}
CH0 = rig.pose.bones["chest"].matrix.copy(); POLE0 = {S: rig.pose.bones["upper_arm_ik_target." + S].matrix.copy() for S in "LR"}
hold_fingers = json.loads(rig["fd_hold_fingers"])
# ---- the body's turn from the motion capture ----
for o in bpy.context.view_layer.objects: o.select_set(False)
m = link(bpy.data.objects.new("dummy", None)); bpy.context.view_layer.objects.active = m; before = set(bpy.data.objects)
with bpy.context.temp_override(**C): bpy.ops.import_scene.fbx(filepath=ROOT + "/downloads/mixamo/fishing_cast.fbx", automatic_bone_orientation=False, ignore_leaf_bones=True)
src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"); src.name = "mx_cast"; src.hide_render = True   # (left in the view layer: a hidden armature isn't evaluated, and its turn read back as none)
P_ = "mixamorig:"; sc = bpy.context.scene
src_act = src.animation_data.action if src.animation_data else None
def q_src(n, rest=False): return (src.matrix_world @ (src.data.bones[P_ + n].matrix_local if rest else src.pose.bones[P_ + n].matrix)).to_quaternion()
TMAP = [(0.0, 1), (0.6, 43), (0.85, 64), (1.25, 85), (1.9, 106), (2.4, 190)]
def mx_frame(t):
    for (t0, f0), (t1, f1) in zip(TMAP, TMAP[1:]):
        if t <= t1: return f0 + (f1 - f0) * (t - t0) / (t1 - t0)
    return TMAP[-1][1]
CHEST = {}
def chest_dq(t):
    f = mx_frame(t); sc.frame_set(int(f), subframe=f - int(f)); bpy.context.view_layer.update()
    return (q_src("Hips").inverted() @ q_src("Spine2")) @ (q_src("Hips", True).inverted() @ q_src("Spine2", True)).inverted()
def set_chest(dq):
    ch = rig.pose.bones["chest"]; piv = rig.matrix_world @ CH0.translation; T = Matrix.Translation(piv)
    ch.matrix = rig.matrix_world.inverted() @ (T @ dq.to_matrix().to_4x4() @ T.inverted()) @ rig.matrix_world @ CH0; bpy.context.view_layer.update()
DQ0 = chest_dq(0.0)
def chest_at(t): return DQ0.inverted() @ chest_dq(t)   # (the turn from where the capture starts, so the hold is the Gate 1 hold)
# ---- numpy arms: shoulder, elbow by the pole, wrist angles; for searching ----
L1 = {S: REST[S][0] for S in "LR"}; L2 = {S: REST[S][1] for S in "LR"}
def elbow_for(S, Sh, W, Pdir):
    v = W - Sh; d = v.length
    if d > L1[S] + L2[S] - 0.004: return None
    n = v / d; x = (L1[S] ** 2 - L2[S] ** 2 + d * d) / (2 * d); h = math.sqrt(max(0.0, L1[S] ** 2 - x * x))
    p = Pdir - n * Pdir.dot(n)
    if p.length < 1e-6: return None
    return Sh + n * x + p.normalized() * h
POLE_TURNS = tuple(range(-150, 181, 30))   # (all the way round: winding up, the elbow comes up and forwards)
def pole_dirs(S, Sh, W):
    """the elbow's directions tried: the hold's (down and out), turned about the shoulder-to-hand line"""
    base = pole_pt(S, Sh, W) - Sh; ax = (W - Sh).normalized(); return [(a, Quaternion(ax, math.radians(a)) @ base) for a in POLE_TURNS]
def wrist_np(S, Sh, E, W, R3):
    _, _, k_, p_, a_ = LOC[S]; kw, pw, aw = R3 @ k_, R3 @ p_, R3 @ a_; fo = (W - E).normalized()
    flex = math.degrees(math.atan2(-fo.dot(pw), fo.dot(aw))); rad = math.degrees(math.atan2(-fo.dot(kw), fo.dot(aw)))
    u = E - Sh; u = (u - u.dot(fo) * fo).normalized(); n_arm = (E - Sh).cross(W - E).normalized(); neu = -n_arm if S == "R" else n_arm
    pp_ = (pw - pw.dot(fo) * fo).normalized(); return flex, rad, math.degrees(math.atan2(pp_.dot(u), pp_.dot(neu))), math.degrees((Sh - E).angle(W - E))
def arm_best(S, Sh, M, prev_turn=None):
    """the most comfortable elbow for the hand at M: (cost, pole turn, wrist angles, elbow) or None if out of reach"""
    W = M.translation; R3 = M.to_3x3().normalized(); best = None
    for a, pd in pole_dirs(S, Sh, W):
        E = elbow_for(S, Sh, W, pd)
        if E is None: continue
        w = wrist_np(S, Sh, E, W, R3); c = limits_pen(*w) + abs(w[0]) * 0.01 + abs(w[1]) * 0.01 + abs(a) * 0.004 + (0 if prev_turn is None else abs(((a - prev_turn) + 180) % 360 - 180) * 0.01)
        if best is None or c < best[0]: best = (c, a, w, E)
    return best
def pt_seg(p, a, b):
    ab = b - a; L = ab.dot(ab); t = 0.0 if L < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / L)); return (p - (a + ab * t)).length
def pole_pt(S, Sh, T): E0 = E_G1[S]; return E0 + (E0 - (Sh + T) / 2).normalized() * 0.3 + Vector((-0.1 if S == "R" else 0.1, 0, -0.05))
UP = Vector((0, 0, 1))
D_HOLD = (RW1.to_3x3() @ Vector((0, -1, 0))).normalized(); Z_HOLD = (RW1.to_3x3() @ Vector((0, 0, 1))).normalized()
def rod_frame(seat, D):
    # (the rod turned from the hold as a rigid thing, the shortest way: through a cast the reel stays on the same side of
    # the rod as the hand that holds it, under it held forwards and on top of it back over the shoulder. Set from the
    # world's up instead, the rod rolled half a turn as it went past upright and took the right hand round with it)
    Yw = -D; Zw = D_HOLD.rotation_difference(D) @ Z_HOLD; Zw = (Zw - Zw.dot(D) * D).normalized(); Xw = Yw.cross(Zw)
    M = Matrix((Xw, Yw, Zw)).transposed().to_4x4(); M.translation = seat - D * SEAT; return M
def body_dir(e_deg, sw):
    e = math.radians(e_deg); return Vector((-math.cos(e) * math.sin(sw), -math.cos(e) * math.cos(sw), math.sin(e)))   # (x left in Blender; sw to the right)
def seat_from(eye, x, y, z): return eye + Vector((-x, -z, y))
cB, dB, pB = Vector(BUTT["c"]), Vector(BUTT["d"]), Vector(BUTT["pn"])
def butt_hand(RW_, sgn, phi, slide=0.0):
    D = (RW_.to_3x3() @ Vector((0, -1, 0))).normalized(); Pg = RW_ @ Vector((0, -0.065 - slide, 0))
    ref = (RW_.to_3x3() @ Vector((1, 0, 0))).normalized(); q = Quaternion(D, phi) @ ref
    dh = dB.normalized(); ph = (pB - pB.dot(dh) * dh).normalized()
    Fh = Matrix((dh, ph, dh.cross(ph))).transposed(); a = D * sgn; Fw = Matrix((a, q, a.cross(q))).transposed()
    R = Fw @ Fh.transposed()
    M = R.to_4x4(); M.translation = Pg - R @ cB; return M
SLIDES = (0.0, 0.12, 0.25)
def left_best(RW_, shL, prev=None, slides=SLIDES, phis=range(0, 360, 30)):
    best = None
    for sl in slides:
        for sgn in (1, -1):
            for ph_ in phis:
                ML = butt_hand(RW_, sgn, math.radians(ph_), sl); ab = arm_best("L", shL, ML, None if prev is None else prev[3])
                if ab is None: continue
                c = ab[0] + sl * 4 + (0 if prev is None else (abs(((ph_ - prev[1]) + 180) % 360 - 180) * 0.01 + (0.5 if sgn != prev[2] else 0) + abs(sl - prev[4]) * 6))
                if best is None or c < best[0]: best = (c, ph_, sgn, ab[1], sl, ab[2], ab[3], ML)
    return best
def score_both(t_, eye, x, y, z, e_deg, sw, want_e, want_sw):
    RW_ = rod_frame(seat_from(eye, x, y, z), body_dir(e_deg, sw)); MR = RW_ @ G_ROD
    shR = wpos(rig, "DEF-upper_arm.R"); r = arm_best("R", shR, MR)
    if r is None: return None
    shL = wpos(rig, "DEF-upper_arm.L"); l = left_best(RW_, shL)
    if l is None: return None
    ER, EL = r[3], l[6]; WR = MR.translation; butt = RW_ @ Vector((0, -0.065 - l[4], 0))
    hd = min(pt_seg(eye, ER, WR), pt_seg(eye, EL, butt), pt_seg(eye, RW_ @ Vector((0, 0, 0)), RW_ @ Vector((0, -1.2, 0))), pt_seg(eye, shR, ER), pt_seg(eye, shL, EL))
    s_ = -(r[0] + l[0]) - max(0, 0.15 - hd) * 300 - abs(e_deg - want_e) * 0.05 - abs(sw - want_sw) * 2
    return (s_, (x, y, z, e_deg, sw), r[2], l[5], l[2], l[1], round(hd, 3), r[1], l[3], l[4])
KEYS = {}
GOAL = {"KM1": (0.3, 95, -0.2, (0.05, 0.4), (-0.35, 0.05), (0.0, 0.4)), "KB": (0.6, 135, -0.4, (0.1, 0.45), (-0.2, 0.2), (-0.05, 0.3)), "KM2": (0.72, 110, -0.25, (0.0, 0.4), (-0.3, 0.1), (0.0, 0.4)),
        "KF": (0.85, 72, 0.0, (0.0, 0.35), (-0.25, 0.15), (0.15, 0.5)), "KH": (1.25, 35, 0.0, (0.0, 0.3), (-0.4, -0.05), (0.25, 0.55))}
def score_right(eye, x, y, z, e_deg, sw, want_e, want_sw):
    RW_ = rod_frame(seat_from(eye, x, y, z), body_dir(e_deg, sw)); MR = RW_ @ G_ROD; shR = wpos(rig, "DEF-upper_arm.R"); r = arm_best("R", shR, MR)
    if r is None: return None
    hd = min(pt_seg(eye, r[3], MR.translation), pt_seg(eye, shR, r[3]), pt_seg(eye, RW_ @ Vector((0, 0, 0)), RW_ @ Vector((0, -1.2, 0))))
    return -r[0] - max(0, 0.15 - hd) * 300 - abs(e_deg - want_e) * 0.05 - abs(sw - want_sw) * 2
for nm, (t_, we, wsw, xr, yr, zr) in GOAL.items():
    set_chest(chest_at(t_)); eye = eye_now(); cands = []; n_ = 0
    # (first the right arm alone over every place and angle; then both arms on the best 60 of those)
    for x in np.arange(xr[0], xr[1] + 1e-6, 0.05):
        for y in np.arange(yr[0], yr[1] + 1e-6, 0.05):
            for z in np.arange(zr[0], zr[1] + 1e-6, 0.05):
                for de in (-15, 0, 15):
                    for dsw in (-0.25, 0, 0.25):
                        k_ = (float(x), float(y), float(z), we + de, wsw + dsw); sr = score_right(eye, *k_, we, wsw); n_ += 1
                        if sr is not None: cands.append((sr, k_))
    cands.sort(key=lambda c: -c[0]); best = None; ok_ = 0
    for sr, k_ in cands[:600]:
        r_ = score_both(t_, eye, *k_, we, wsw)
        if r_:
            ok_ += 1
            if best is None or r_[0] > best[0]: best = r_
        if ok_ >= 60: break
    KEYS[nm] = best; print("key", nm, "at", t_, "s: tried", n_, "best (right, up, ahead from the eye, rod up deg, round)", [round(v, 3) for v in best[1]], "score", round(best[0], 2), "right wrist", [round(v, 1) for v in best[2]], "left wrist", [round(v, 1) for v in best[3]], "left grip side, turn, slide", best[4], best[5], best[9], "elbow turns R, L", best[7], best[8], "nearest to the eye", best[6], "chest turn (deg)", round(math.degrees(chest_at(t_).angle), 1))
# the hold, as Gate 1 has it (relative to the eye, level)
s1 = RW1 @ Vector((0, -SEAT, 0)); D1 = (RW1.to_3x3() @ Vector((0, -1, 0))).normalized()
K0 = ((EYE1 - s1).x, (s1 - EYE1).z, (EYE1 - s1).y, math.degrees(math.asin(D1.z)), math.atan2(-D1.x, -D1.y))
print("key K0 (the hold)", [round(v, 3) for v in K0])
set_chest(chest_at(0.0))
# ---- every frame (24 a second), the rod along the game's own easing between the keys; both arms by IK ----
def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def seg(t, a, b): return max(0.0, min(1.0, (t - a) / (b - a)))
# the rod's path through the keys (the same in the game: fpRig.js castAt): a smooth curve through each, still at the
# hold, at the top of the wind-up and in the follow-through, moving through the moments in between
PATH_T = [0.0, 0.3, 0.6, 0.72, 0.85, 1.25, 1.9, 2.4]; STILL = {0, 2, 5, 6, 7}
def path_keys(): return [K0, KEYS["KM1"][1], KEYS["KB"][1], KEYS["KM2"][1], KEYS["KF"][1], KEYS["KH"][1], KEYS["KH"][1], K0]
def keys_at(t):
    P = path_keys(); T = PATH_T; t = max(0.0, min(T[-1], t)); i = 0
    while i < len(T) - 2 and t > T[i + 1]: i += 1
    def tan(k):
        if k in STILL: return [0.0] * 5
        return [(P[k + 1][c] - P[k - 1][c]) / (T[k + 1] - T[k - 1]) for c in range(5)]
    h = T[i + 1] - T[i]; u = (t - T[i]) / h; m0, m1 = tan(i), tan(i + 1)
    h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return tuple(h00 * P[i][c] + h10 * h * m0[c] + h01 * P[i + 1][c] + h11 * h * m1[c] for c in range(5))
ad = rig.animation_data_create(); ad.action = None
NF = 58; rows = []; phi = None; prevR = None; prevL = None
pbHR, pbHL, pbC = rig.pose.bones["hand_ik.R"], rig.pose.bones["hand_ik.L"], rig.pose.bones["chest"]
H_ = lambda RW_, y0, y1: (tuple(RW_ @ Vector((0, y0, 0))), tuple(RW_ @ Vector((0, y1, 0))), handle_radius((y0 + y1) / 2))
cam = camera(); cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(78.7); cam.data.clip_start = 0.07
for f in range(NF):
    t = f / 24.0; set_chest(chest_at(t)); eye = eye_now(); x, y, z, e_deg, sw = keys_at(t)
    RW_ = rod_frame(seat_from(eye, x, y, z), body_dir(e_deg, sw)); rod.matrix_world = RW_; bpy.context.view_layer.update()
    rod.keyframe_insert("location", frame=f + 1); rod.keyframe_insert("rotation_euler", frame=f + 1)
    MR = RW_ @ G_ROD; shR = wpos(rig, "DEF-upper_arm.R"); rb = arm_best("R", shR, MR, prevR)
    if rb is None: print("frame", f, "right hand out of reach"); rb = (0, 0, None, elbow_for("R", shR, shR + (MR.translation - shR).normalized() * (L1["R"] + L2["R"] - 0.005), pole_pt("R", shR, MR.translation) - shR))
    prevR = rb[1]; Ewant = rb[3]; set_pole(rig, "R", Ewant + (Ewant - (shR + MR.translation) / 2).normalized() * 0.3); set_hand(rig, "R", MR)
    toKnob = ease(seg(t, 1.95, 2.25))
    shL = wpos(rig, "DEF-upper_arm.L")
    EL_want = None
    if toKnob < 1:
        lb = left_best(RW_, shL, prevL, slides=(0.0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25), phis=range(0, 360, 15))
        if lb is None: ML = butt_hand(RW_, 1, 0.0, 0.25); print("frame", f, "left hand out of reach of the butt")
        else: phi = lb[1]; ML = lb[7]; EL_want = lb[6]; prevL = lb
    if toKnob > 0:
        crank.rotation_euler = (math.radians(float(rig.get("fd_crank_deg", 30.0))), 0, 0); bpy.context.view_layer.update()
        MK = knobE.matrix_world @ G_KNOB
        if toKnob >= 1: ML = MK
        else:
            q = ML.to_quaternion().slerp(MK.to_quaternion(), toKnob); p = ML.translation.lerp(MK.translation, toKnob); ML = q.to_matrix().to_4x4(); ML.translation = p
    if toKnob > 0 or EL_want is None:
        ab = arm_best("L", shL, ML); EL_want = ab[3] if ab else elbow_for("L", shL, shL + (ML.translation - shL).normalized() * (L1["L"] + L2["L"] - 0.005), pole_pt("L", shL, ML.translation) - shL)
    set_pole(rig, "L", EL_want + (EL_want - (shL + ML.translation) / 2).normalized() * 0.3); set_hand(rig, "L", ML)
    set_finger_pose(hold_fingers if toKnob >= 0.5 else {**hold_fingers, **GR["butt_L"]["fingers"]})
    for pb in (pbHR, pbHL, pbC): key_pose_bone(pb, f + 1)
    for S in "LR": key_pose_bone(rig.pose.bones["upper_arm_ik_target." + S], f + 1)
    for S in "L":
        for fn in FING + ("thumb",):
            for nm in chain(rig, fn, S): rig.pose.bones[nm].keyframe_insert("rotation_euler", frame=f + 1)
    cam.location = eye + Vector((0, -0.01, 0)); cam.rotation_euler = Vector((0, -math.cos(math.radians(24)), -math.sin(math.radians(24)))).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f + 1); cam.keyframe_insert("rotation_euler", frame=f + 1)
    HANDLE_ = [H_(RW_, -0.0, -0.25), H_(RW_, -0.25, -0.40), H_(RW_, -0.40, -0.43), H_(RW_, -0.43, -0.50), H_(RW_, -0.50, -0.64)]
    deep = {S: round(float(seg_clear(HS[S].deform(), HANDLE_).min()), 4) for S in "LR"}
    wr = {S: [round(v, 1) for v in wrist(S)] for S in "LR"}; ln = {S: [round(v, 4) for v in lengths(S)] for S in "LR"}
    near = min(pt_seg(eye, wpos(rig, "DEF-forearm." + S), wpos(rig, "DEF-hand." + S)) for S in "LR")
    rows.append(dict(f=f, t=round(t, 3), key=[round(v, 4) for v in (x, y, z, e_deg, sw)], wrist=wr, len=ln, deep=deep, phi=phi, slide=(prevL[4] if prevL else None), poleR=prevR, toKnob=round(toKnob, 3), eye_forearm=round(near, 3),
                     missR=round(miss("R", MR), 4), missL=round(miss("L", ML), 4), hand_rod={S: [[round(v, 6) for v in r] for r in (RW_.inverted() @ rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix)] for S in "LR"}))
print("frames", len(rows))
for S in "LR":
    print(S, "arm length ratios over the cast: upper %.4f to %.4f, fore %.4f to %.4f" % (min(r["len"][S][0] for r in rows), max(r["len"][S][0] for r in rows), min(r["len"][S][1] for r in rows), max(r["len"][S][1] for r in rows)))
    for i, nm in enumerate(("palm bend", "thumb-side bend", "forearm turn", "elbow")): print(S, nm, "%.1f to %.1f" % (min(r["wrist"][S][i] for r in rows), max(r["wrist"][S][i] for r in rows)))
    print(S, "deepest skin into the handle (m): %.4f" % min(r["deep"][S] for r in rows), "; hand off its target at most (m): %.4f" % max(r["miss" + S] for r in rows))
print("nearest forearm to the eye over the cast (m): %.3f" % min(r["eye_forearm"] for r in rows))
for r in rows[::4]: print("t", r["t"], "key", r["key"], "R", r["wrist"]["R"], "L", r["wrist"]["L"], "turn on the butt", r["phi"], "slide", r["slide"], "miss L", r["missL"])
json.dump(dict(path_t=PATH_T, still=sorted(STILL), keys={k: dict(t=GOAL[k][0], key=v[1], wristR=v[2], wristL=v[3], sideL=v[4], turnL=v[5], slideL=v[9]) for k, v in KEYS.items()}, K0=K0, rows=rows, eye=list(EYE1), tmap=TMAP), open(RIGDIR + "/gate3_cast.json", "w"), indent=1)
sc.frame_start = 1; sc.frame_end = NF; sc.render.fps = 24; sc.frame_set(1)
bpy.data.objects.remove(src, do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/gate3_cast.blend"); print("saved gate3_cast.blend")
exec(open(ROOT + "/scripts/scene_v1.py").read())
def keep_cam(c): pass
video("gate3_fp", (540, 960), (1, NF), keep_cam)
cam.animation_data_clear()
video("gate3_side", (720, 720), (1, NF), look_cam(Vector((0, -0.2, 1.45)), Vector((-2.6, -0.6, 1.5)), 35))
video("gate3_over_shoulder", (720, 720), (1, NF), look_cam(Vector((0, -0.6, 1.4)), Vector((-0.9, 1.1, 1.9)), 30))
print("gate 3 done")
