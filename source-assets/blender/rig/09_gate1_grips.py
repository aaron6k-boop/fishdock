for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 1 (static grip), fifth approach: grasp search, each finger also scored on how far round the handle or knob it curls. (Fourth approach, kept below: grips from the hand's anatomy.)
# The hand's skin is deformed here by the same bone weights as Blender's, fast enough to try the handle across the palm
# at many places and angles and to close every finger at each; the place where the palm and all four fingers wrap the
# handle with nothing inside wins. Likewise the knob across the first two fingers, with the thumb opposite them. Right hand: the rod handle
# lies diagonally across the palm, from the heel of the hand on the little-finger side to the base of the first finger
# (a power grip, as a rod is held), and the reel's stem comes out between the middle and ring fingers where they wrap
# under it. Left hand: the knob lies across the first two fingers at their middle joints, they wrap round it and the
# thumb presses on it from the other side. Each finger's joints are searched together for the shape in which every bone
# of it touches the equipment without going in (the last joint bending with the middle one, as a finger does). The rod
# is then put within reach and in view, each arm brought to its grip by IK from its own shoulder (never stretched), the
# crank turned and the left hand turned about the knob for the most natural wrist and forearm.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/mocap_idle.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
jk = bpy.data.objects.get("jacket")
if jk: jk.hide_viewport = True
body.hide_viewport = True
EQ = build_equipment(); rod = EQ["rod"]; crank = EQ["crank"]
HS = {S: HandSkin(rig, body, S) for S in "LR"}
fmt = lambda v: [round(float(x), 3) for x in v]
UP = Vector((0, 0, 1))
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; EYE = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
HINT = {S: (wpos(rig, "DEF-upper_arm." + S), wpos(rig, "DEF-forearm." + S)) for S in "LR"}
LOC = {S: palm_frame(rig, S) for S in "LR"}

# ---- no stretching: the arm's IK may not pull a bone longer than it is ----
REST = {S: ((rig.data.bones["DEF-forearm." + S].head_local - rig.data.bones["DEF-upper_arm." + S].head_local).length, (rig.data.bones["DEF-hand." + S].head_local - rig.data.bones["DEF-forearm." + S].head_local).length) for S in "LR"}
print("rest arm lengths (upper, fore)", {S: fmt(v) for S, v in REST.items()})
ad = rig.animation_data; gone = 0
if ad:
    for fc in list(ad.drivers):
        if fc.data_path.endswith(".ik_stretch") or fc.data_path.endswith("ik_stretch"): ad.drivers.remove(fc); gone += 1
st = [pb.name for pb in rig.pose.bones if pb.ik_stretch > 0]
for pb in rig.pose.bones: pb.ik_stretch = 0.0
lim = []
for pb in rig.pose.bones:
    for c in pb.constraints:
        if c.type in ("LIMIT_DISTANCE", "STRETCH_TO") and (".L" in pb.name or ".R" in pb.name) and ("arm" in pb.name or "hand" in pb.name): lim.append((pb.name, c.type, round(c.influence, 2), c.mute))
print("stretch drivers removed", gone, "bones that had stretch", st, "distance/stretch constraints", lim)
for S in "LR":
    pp = rig.pose.bones["upper_arm_parent." + S]; print(S, "IK_Stretch was", pp.get("IK_Stretch")); pp["IK_Stretch"] = 0.0
def lengths(S):
    sh, el, wr = wpos(rig, "DEF-upper_arm." + S), wpos(rig, "DEF-forearm." + S), wpos(rig, "DEF-hand." + S); return (el - sh).length / REST[S][0], (wr - el).length / REST[S][1]


# ---- start from open hands, arms on IK ----
for S in "LR":
    pp = rig.pose.bones["upper_arm_parent." + S]; pp["IK_FK"] = 0.0; pp["pole_vector"] = True
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        for nm in chain(rig, f, S): pb = rig.pose.bones[nm]; pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
def own_sets(S, f):
    hs = HS[S]; return [hs.sel(("DEF-thumb.0%d" if f == "thumb" else "DEF-f_" + f + ".0%d") % (j + 1)) for j in range(3)]
def deform_sub(S, mask):
    hs = HS[S]; M = np.array([np.array(rig.matrix_world @ rig.pose.bones[n].matrix) for n in hs.names]) @ hs.rest_inv
    return np.einsum("vb,bij,vj->vi", hs.W[mask], M, hs.V[mask])[:, :3]
def Mhand(S): return rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix
def to_world(S, v, point=True):
    M = Mhand(S); return M @ v if point else (M.to_3x3().normalized() @ v)
def hand_local_pts(S, mask):
    P = deform_sub(S, mask); Mi = np.array(Mhand(S).inverted()); return (Mi[:3, :3] @ P.T).T + Mi[:3, 3]
def grasp(S, f, cols, a_rng, b_rng, k3=0.7, keep=0.0028, deep=-0.0012, fixed0=None, score_extra=None):
    """the finger's joint angles (knuckle a, middle b, last k3*b) at which the most of its bones touch the colliders
    with none inside; among equals, the least gap and then the least bend"""
    pbs = [rig.pose.bones[n] for n in chain(rig, f, S)]; own = own_sets(S, f); m = own[0] | own[1] | own[2]; idx = [o[m] for o in own]
    best = None; keep0 = [pb.rotation_euler.x for pb in pbs]
    for a in a_rng:
        for b in b_rng:
            c = min(88, b * k3)
            pbs[0].rotation_euler.x = math.radians(a if fixed0 is None else fixed0); pbs[1].rotation_euler.x = math.radians(b); pbs[2].rotation_euler.x = math.radians(c)
            bpy.context.view_layer.update(); P = deform_sub(S, m)
            cl = [float(seg_clear(P[i_], cols).min()) for i_ in idx]
            if min(cl) < deep: continue
            touch = sum(1 for x in cl if x < keep); gaps = sum(max(0.0, x) for x in cl)
            sc_ = touch * 10 - gaps * 400 + (a + b) * 0.004 + (score_extra() if score_extra else 0)   # (among equals, the more curled)
            if best is None or sc_ > best[0]: best = (sc_, a, b, c, [round(x, 4) for x in cl])
    if best is None:   # (nothing fits without going in: leave the finger as it was)
        for pb, v in zip(pbs, keep0): pb.rotation_euler.x = v
        bpy.context.view_layer.update(); return (-99, None, None, None, None)
    pbs[0].rotation_euler.x = math.radians(best[1] if fixed0 is None else fixed0); pbs[1].rotation_euler.x = math.radians(best[2]); pbs[2].rotation_euler.x = math.radians(best[3])
    bpy.context.view_layer.update(); return best
def grasp_thumb(S, cols, contact_cols, extra):
    """the thumb: its base turned across the palm (a) and out (z), its two joints bending together, for its tip on the
    equipment with nothing inside, as the extra score prefers"""
    pbs = [rig.pose.bones[n] for n in chain(rig, "thumb", S)]; own = own_sets(S, "thumb"); m = own[0] | own[1] | own[2]
    tip = own[2][m]; best = None
    for ax_ in range(-30, 41, 10):
        for az in range(-50, 51, 10):
            for b in range(0, 61, 10):
                pbs[0].rotation_euler = (math.radians(ax_), 0, math.radians(az)); pbs[1].rotation_euler.x = math.radians(b); pbs[2].rotation_euler.x = math.radians(b * 1.1)
                bpy.context.view_layer.update(); P = deform_sub(S, m)
                if float(seg_clear(P, cols).min()) < -0.0012: continue
                g = float(seg_clear(P[tip], contact_cols).min())
                sc_ = -abs(g) * 300 + extra()
                if best is None or sc_ > best[0]: best = (sc_, ax_, az, b, round(g, 4))
    if best:
        pbs[0].rotation_euler = (math.radians(best[1]), 0, math.radians(best[2])); pbs[1].rotation_euler.x = math.radians(best[3]); pbs[2].rotation_euler.x = math.radians(best[3] * 1.1)
    bpy.context.view_layer.update(); return best

# ---- fast finger kinematics in the hand's own frame (the same skin weights as Blender's, for searching) ----
def rot_about(axis, ang, pivot):
    R = np.array(Matrix.Rotation(ang, 4, Vector(axis))); T = np.eye(4); T[:3, 3] = pivot; Ti = np.eye(4); Ti[:3, 3] = -np.asarray(pivot); return T @ R @ Ti
class HandFK:
    def __init__(self, S):
        hs = HS[S]; self.S = S; self.hs = hs; Mhi = np.array(Mhand(S).inverted())
        self.Mloc = np.array([Mhi @ np.array(rig.matrix_world @ rig.pose.bones[n].matrix) for n in hs.names])
        self.Q = np.einsum("bij,vj->bvi", hs.rest_inv, hs.V); self.bi = {n: i for i, n in enumerate(hs.names)}
    def names(self, f): return [("DEF-thumb.0%d.%s" if f == "thumb" else "DEF-f_" + f + ".0%d.%s") % (j + 1, self.S) for j in range(3)]
    def prep(self, f):
        nm = self.names(f); bis = [self.bi[n] for n in nm]; W = self.hs.W
        idx = np.where(W[:, bis].sum(1) > 0.02)[0]; static = [b for b in range(len(self.hs.names)) if b not in bis]
        Pst = np.einsum("vb,bvi->vi", W[idx][:, static], np.einsum("bij,bvj->bvi", self.Mloc[static], self.Q[static][:, idx]))
        own = self.hs.own[idx]
        return dict(f=f, bis=bis, idx=idx, Pst=Pst, Wf=W[idx][:, bis], Qf=self.Q[bis][:, idx], seg=[own == n for n in nm],
                    joints=[self.Mloc[b][:3, 3].copy() for b in bis], ax=[self.Mloc[b][:3, 0] / np.linalg.norm(self.Mloc[b][:3, 0]) for b in bis],
                    az=self.Mloc[bis[0]][:3, 2] / np.linalg.norm(self.Mloc[bis[0]][:3, 2]), M0=self.Mloc[bis].copy())
def fk(pp, th, z0=0.0):
    """the finger's skin points (hand frame) with its joints turned th (radians) about their own X axes; z0 turns the
    first joint about its own Z axis too (a thumb's base, a finger spread), as Blender's XYZ order does"""
    R0 = rot_about(pp["ax"][0], th[0], pp["joints"][0])
    if z0: R0 = rot_about(pp["az"], z0, pp["joints"][0]) @ R0
    M = [R0 @ m for m in pp["M0"]]
    p1 = (R0 @ np.append(pp["joints"][1], 1))[:3]; a1 = R0[:3, :3] @ pp["ax"][1]; R1 = rot_about(a1, th[1], p1); M[1] = R1 @ M[1]; M[2] = R1 @ M[2]
    p2 = (R1 @ R0 @ np.append(pp["joints"][2], 1))[:3]; a2 = R1[:3, :3] @ R0[:3, :3] @ pp["ax"][2]; R2 = rot_about(a2, th[2], p2); M[2] = R2 @ M[2]
    return (pp["Pst"] + np.einsum("vb,bvi->vi", pp["Wf"], np.einsum("bij,bvj->bvi", np.array(M), pp["Qf"])))[:, :3]
def line_clear(P, c, d, r, half=None):
    v = P - c; t = v @ d
    if half is not None: t = np.clip(t, -half, half)
    return np.linalg.norm(v - np.outer(t, d), axis=1) - r
WRAP = {}   # (per hand: the handle or knob's axis, and the palm's and the fingers' directions round it)
def wrap_deg(S, p):
    """how far round the axis a fingertip has reached, in degrees from the palm's side (90 is where the fingers start,
    180 the far side, 270 back towards the thumb): a finger curled round the handle, not laid against it"""
    if S not in WRAP: return 0.0
    c, d, e_a, e_b = WRAP[S]; w = p - c; w = w - d * (w @ d)
    return (math.degrees(math.atan2(float(w @ e_b), float(w @ e_a))) + 360) % 360
def set_wrap(S, c, d, palm_n, along_n):
    e_a = -palm_n - d * (-palm_n @ d); e_a = e_a / np.linalg.norm(e_a); e_b = along_n - d * (along_n @ d) - e_a * (along_n @ e_a); e_b = e_b / np.linalg.norm(e_b)
    WRAP[S] = (np.asarray(c), np.asarray(d), e_a, e_b)
def grasp_np(pp, clear, a_rng, b_rng, k3=0.7, keep=0.0028, deep=-0.0012, S=None):
    best = None
    for a in a_rng:
        for b in b_rng:
            P = fk(pp, (math.radians(a), math.radians(b), math.radians(min(88, b * k3)))); cl_all = clear(P)
            cl = [float(cl_all[sg].min()) if sg.any() else 9.0 for sg in pp["seg"]]
            if min(cl) < deep: continue
            touch = sum(1 for x in cl if x < keep); gaps = max(0.0, cl[0]) * 100 + max(0.0, cl[1]) * 400 + max(0.0, cl[2]) * 400
            wr = wrap_deg(S, P[pp["seg"][2]].mean(0)) if S else 0.0
            wb = (20 if 170 <= wr <= 300 else 10 if 140 <= wr < 170 else 0) if S else 0
            sc_ = touch * 10 - gaps + wb - (max(0, 45 - b) * 0.3 if S else 0)
            if best is None or sc_ > best[0]: best = (sc_, a, b, min(88, b * k3), [round(x, 4) for x in cl], round(wr))
    return best or (-60.0, 0, 0, 0, None, 0)
def seat_line(Pts, c0, d, n, r, want=0.0015, half=None):
    """slide the line along n until the nearest of Pts is `want` from its surface"""
    lo, hi = -0.04, 0.08
    for _ in range(30):
        h = (lo + hi) / 2; g = float(line_clear(Pts, c0 + n * h, d, r, half).min())
        if g < want: lo = h
        else: hi = h
    return c0 + n * ((lo + hi) / 2)

# ---- the right hand round the reel seat: searched over where the handle crosses the palm ----
FKR = HandFK("R"); PPR = {f: FKR.prep(f) for f in ("index", "middle", "ring", "pinky", "thumb")}
_, mcR, kR, pR, alR = LOC["R"]; kRn, pRn, aRn = np.array(kR), np.array(pR), np.array(alR)
PZ = fk(PPR["index"], (0, 0, 0)); chk = hand_local_pts("R", np.isin(np.arange(len(HS["R"].own)), PPR["index"]["idx"]))
print("kinematics check at rest (m):", round(float(np.abs(PZ - chk).max()), 5))
PALM_R = hand_local_pts("R", HS["R"].sel("DEF-palm") | HS["R"].sel("DEF-hand"))
mcRc = np.array(sum(mcR.values(), Vector()) / 4)
RH = 0.0140; res = []
for gam in (25, 35, 45, 55, 65):
    d = kRn * math.cos(math.radians(gam)) + aRn * math.sin(math.radians(gam)); d /= np.linalg.norm(d)
    for u in (-0.02, -0.01, 0.0, 0.01, 0.02):
        for v in (-0.01, 0.0, 0.01, 0.02, 0.03):
            c0 = mcRc - aRn * 0.03 + kRn * u + aRn * v - pRn * 0.02
            c = seat_line(PALM_R, c0, d, pRn, RH); clr = lambda P, c=c, d=d: line_clear(P, c, d, RH); set_wrap("R", c, d, pRn, aRn)
            g = {f: grasp_np(PPR[f], clr, range(0, 91, 10), range(0, 101, 10), S="R") for f in ("index", "middle", "ring", "pinky")}
            palm_touch = int((line_clear(PALM_R, c, d, RH) < 0.003).sum())
            sc_ = sum(x[0] for x in g.values()) + min(palm_touch, 60) * 0.15
            res.append((sc_, gam, u, v, c, d, g, palm_touch))
res.sort(key=lambda x: -x[0])
for r_ in res[:5]: print("right try (angle from the knuckles, across, along)", (r_[1], r_[2], r_[3]), "score", round(r_[0], 1), "palm points on it", r_[7], {f: (x[1], x[2], x[4], x[5]) for f, x in r_[6].items()})
FING = ("index", "middle", "ring", "pinky"); rad3 = lambda v: [math.radians(x) for x in v]
def rod_caps_hand(R_h_):
    """the handle, the reel's stem, foot and body, in the hand's frame"""
    P_ = lambda x, y, z: np.array(R_h_ @ Vector((x, y, z)))
    caps = [(P_(0, y0, 0), P_(0, y1, 0), handle_radius((y0 + y1) / 2)) for y0, y1 in ((-0.25, -0.40), (-0.40, -0.43), (-0.43, -0.50), (-0.50, -0.64))]
    return caps + [(P_(0, -SEAT + 0.002, -0.014), P_(0, -SEAT + 0.010, -0.056), 0.0055), (P_(0, -SEAT - 0.024, -0.016), P_(0, -SEAT + 0.024, -0.016), 0.004), (P_(0, -SEAT - 0.015, -0.076), P_(0, -SEAT + 0.04, -0.076), 0.028)]
def caps_clear(P, caps):
    best = np.full(len(P), 9.0)
    for a_, b_, r_ in caps:
        ab = b_ - a_; t = np.clip((P - a_) @ ab / max(1e-12, ab @ ab), 0, 1); best = np.minimum(best, np.linalg.norm(P - (a_ + np.outer(t, ab)), axis=1) - r_)
    return best
# (the best few places for the handle, each finished: the fingers searched finely against the handle)
RCANDS = []
for r_ in res[:8]:
    _, gam_, u_, v_, c_, d_, g0_, _ = r_
    clr0 = lambda P, c_=c_, d_=d_: line_clear(P, c_, d_, RH); set_wrap("R", c_, d_, pRn, aRn); G = {}
    for f in FING:
        a0, b0 = g0_[f][1], g0_[f][2]; G[f] = grasp_np(PPR[f], clr0, range(max(0, a0 - 12), min(95, a0 + 13), 3), range(max(0, b0 - 12), min(106, b0 + 13), 3), S="R")
    RCANDS.append(dict(score=sum(x[0] for x in G.values()), key=(gam_, u_, v_), c=c_, d=d_, G=G, wrap=WRAP["R"]))
    print("right candidate (angle, across, along)", (gam_, u_, v_), round(RCANDS[-1]["score"], 1), {f: (x[1], x[2], x[4], x[5]) for f, x in G.items()})
# (which way the middle and ring fingers part: a turn about their first joint's own Z axis that moves their tips apart)
tipm = lambda z: fk(PPR["middle"], (0, 0, 0), z0=math.radians(z))[PPR["middle"]["seg"][2]].mean(0)
tipr = lambda z: fk(PPR["ring"], (0, 0, 0), z0=math.radians(z))[PPR["ring"]["seg"][2]].mean(0)
r0 = tipr(0); m0 = tipm(0)
SG_M = 1 if np.linalg.norm(tipm(5) - r0) > np.linalg.norm(tipm(-5) - r0) else -1
SG_R = 1 if np.linalg.norm(tipr(5) - m0) > np.linalg.norm(tipr(-5) - m0) else -1
def stem_frame(C_, psi):
    """the rod's frame in the hand's for the reel hanging at psi round the handle from the palm's side (90: towards the
    knuckles, 180: the far side), the stem at the middle and ring fingers' boundary along the handle; None if the
    middle and ring fingers are not both there"""
    c_, d_, G = C_["c"], np.asarray(C_["d"]), C_["G"]; _, _, e_a, e_b = C_["wrap"]
    sd = math.cos(math.radians(psi)) * e_a + math.sin(math.radians(psi)) * e_b
    ax = {}
    for f in ("middle", "ring"):
        P = fk(PPR[f], rad3(G[f][1:4])); w = P - c_; t = w @ d_; w = w - np.outer(t, d_); n_ = np.linalg.norm(w, axis=1) + 1e-9
        ang = np.degrees(np.arccos(np.clip((w @ sd) / n_, -1, 1))); sel = ang < 25
        if sel.sum() < 5: return None
        ax[f] = float(t[sel].mean())
    s_ = (ax["middle"] + ax["ring"]) / 2
    Yh = Vector(-d_); Zh = Vector(-sd); Xh = Yh.cross(Zh).normalized(); Zh = Xh.cross(Yh).normalized()
    Cs = Vector(c_ + d_ * s_); Rh_ = Matrix((Xh, Yh, Zh)).transposed().to_4x4(); Rh_.translation = Cs + Yh * (SEAT - 0.004)
    return Rh_, sd, s_, Cs
def stem_spread(C_, Rh_):
    """the least parting of the middle and ring fingers (degrees) that clears the stem, foot and reel body; and how far
    in anything still is at the most"""
    caps = rod_caps_hand(Rh_)[4:]
    for sp in (0, 3, 6, 9, 12, 15):
        cl = min(float(caps_clear(fk(PPR["middle"], rad3(C_["G"]["middle"][1:4]), z0=math.radians(SG_M * sp)), caps).min()),
                 float(caps_clear(fk(PPR["ring"], rad3(C_["G"]["ring"][1:4]), z0=math.radians(SG_R * sp)), caps).min()))
        oth = min(float(caps_clear(fk(PPR[f], rad3(C_["G"][f][1:4])), caps).min()) for f in ("index", "pinky"))
        if cl > -0.0008: return sp, min(cl, oth)
    return 15, min(cl, oth)
SPREAD = 0
def take_right(C_, psi, spread=0):
    global cR, dR, GRn, stemdir, s_stem, R_h, C_stem, clrR, SPREAD
    fr = stem_frame(C_, psi); R_h, stemdir, s_stem, C_stem = fr
    cR, dR, GRn, SPREAD = C_["c"], np.asarray(C_["d"]), C_["G"], spread
    caps_ = rod_caps_hand(R_h); clrR = lambda P: caps_clear(P, caps_); set_wrap("R", cR, dR, pRn, aRn)
first = next((C_, p_) for C_ in RCANDS for p_ in range(0, 360, 15) if stem_frame(C_, p_))
take_right(*first)
def thumb_search_R():
    """the thumb: its tip on the handle, pointing up it towards the tip, on the top, away from the stem"""
    best = None; dn = np.asarray(dR)
    for ax_ in range(-30, 41, 10):
        for az in range(-50, 51, 10):
            for b in range(0, 61, 10):
                P = fk(PPR["thumb"], (math.radians(ax_), math.radians(b), math.radians(b * 1.1)), z0=math.radians(az)); cl = clrR(P)
                if float(cl.min()) < -0.0012: continue
                tip = P[PPR["thumb"]["seg"][2]]; g = float(cl[PPR["thumb"]["seg"][2]].min()); tc = tip.mean(0)
                base = P[PPR["thumb"]["seg"][1]].mean(0); fwd = float(((tc - base) / np.linalg.norm(tc - base)) @ dn); top = float((tc - cR) @ (-stemdir))
                sc_ = -abs(g) * 300 + fwd * 6 + min(top, 0.02) * 200
                if best is None or sc_ > best[0]: best = (sc_, ax_, az, b, round(g, 4), round(fwd, 2), round(top, 3))
    return best or (0, 0, 0, 0, None, 0, 0)
bestT = thumb_search_R()
print("right thumb (score, base across, base out, bend, tip gap, along the rod, above the axis)", bestT)

# ---- the left hand on the knob: searched over where the knob lies across the first two fingers ----
FKL = HandFK("L"); PPL = {f: FKL.prep(f) for f in ("index", "middle", "ring", "pinky", "thumb")}
_, mcL, kL, pL, alL = LOC["L"]; kLn, pLn, aLn = np.array(kL), np.array(pL), np.array(alL)
PIPi = FKL.Mloc[FKL.bi["DEF-f_index.02.L"]][:3, 3]; PIPm = FKL.Mloc[FKL.bi["DEF-f_middle.02.L"]][:3, 3]
F12 = np.vstack([fk(PPL["index"], (0, 0, 0)), fk(PPL["middle"], (0, 0, 0))])
resK = []
for gam in (-40, -25, -10, 5, 20):
    d = kLn * math.cos(math.radians(gam)) + aLn * math.sin(math.radians(gam)); d /= np.linalg.norm(d)
    for lam in (0.3, 0.5, 0.7):
        for v in (-0.014, -0.007, 0.0, 0.007, 0.014):
            c0 = PIPi * (1 - lam) + PIPm * lam + aLn * v
            c = seat_line(F12, c0, d, pLn, 0.010, half=0.013); clr = lambda P, c=c, d=d: line_clear(P, c, d, 0.010, 0.013); set_wrap("L", c, d, pLn, aLn)
            gi = grasp_np(PPL["index"], clr, range(0, 81, 10), range(0, 106, 10), S="L"); gm = grasp_np(PPL["middle"], clr, range(0, 81, 10), range(0, 106, 10), S="L")
            Pi = fk(PPL["index"], [math.radians(x) for x in gi[1:4]]); fing = Pi[PPL["index"]["seg"][1]].mean(0)
            def rd(p, c=c, d=d): w = p - c; w = w - d * (w @ d); return w / (np.linalg.norm(w) + 1e-9)
            bt = None
            for ax_ in range(-30, 41, 14):
                for az in range(-50, 51, 20):
                    for b in range(0, 61, 15):
                        P = fk(PPL["thumb"], (math.radians(ax_), math.radians(b), math.radians(b * 1.1)), z0=math.radians(az)); cl = clr(P)
                        if float(cl.min()) < -0.0012: continue
                        g = float(cl[PPL["thumb"]["seg"][2]].min()); tc = P[PPL["thumb"]["seg"][2]].mean(0)
                        opp = math.degrees(math.acos(max(-1, min(1, float(rd(tc) @ rd(fing))))))
                        s2 = -abs(g) * 300 - max(0, 130 - opp) * 0.2
                        if bt is None or s2 > bt[0]: bt = (s2, ax_, az, b, round(g, 4), round(opp, 1))
            bt = bt or (-30, 0, 0, 0, None, 0)
            resK.append((gi[0] + gm[0] + bt[0], gam, lam, v, c, d, gi, gm, bt))
resK.sort(key=lambda x: -x[0])
for r_ in resK[:5]: print("left try (tilt, between, along)", (r_[1], r_[2], r_[3]), "score", round(r_[0], 1), "index", r_[6][1:], "middle", r_[7][1:], "thumb", r_[8][1:])
_, gamL, lamL, vL, cKn, dKn, gi0, gm0, bt0 = resK[0]
clrL = lambda P: line_clear(P, cKn, dKn, 0.010, 0.013)
GLn = {}
for f, g0 in (("index", gi0), ("middle", gm0)):
    GLn[f] = grasp_np(PPL[f], clrL, range(max(0, g0[1] - 12), min(95, g0[1] + 13), 3), range(max(0, g0[2] - 12), min(106, g0[2] + 13), 3), S="L"); print("left", f, GLn[f])
bestTL = bt0

# ---- the solved finger angles applied to the rig, and checked against Blender's own deformation ----
def apply(S, f, a, b, c, z=0.0):
    pbs = [rig.pose.bones[n] for n in chain(rig, f, S)]
    pbs[0].rotation_euler = (math.radians(a), 0, math.radians(z)); pbs[1].rotation_euler = (math.radians(b), 0, 0); pbs[2].rotation_euler = (math.radians(c), 0, 0)
for f in ("index", "middle", "ring", "pinky"): apply("R", f, *GRn[f][1:4])
apply("R", "thumb", bestT[1], bestT[3], bestT[3] * 1.1, bestT[2])
for f in ("index", "middle"): apply("L", f, *GLn[f][1:4])
for f, k_ in (("ring", 1.0), ("pinky", 1.05)): apply("L", f, *[x * k_ for x in GLn["middle"][1:4]])
apply("L", "thumb", bestTL[1], bestTL[3], bestTL[3] * 1.1, bestTL[2])
bpy.context.view_layer.update()
for S, PP, clr in (("R", PPR, clrR), ("L", PPL, clrL)):
    out = {}
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        mask = np.isin(np.arange(len(HS[S].own)), PP[f]["idx"]); Pb = hand_local_pts(S, mask); cl_b = clr(Pb)
        out[f] = [round(float(cl_b[sg].min()), 4) if sg.any() else None for sg in PP[f]["seg"]]
    print(S, "gaps measured on Blender's deformation (per bone, m)", out)
GR = {f: (GRn[f][0], GRn[f][1], GRn[f][2], GRn[f][3]) for f in ("index", "middle", "ring", "pinky")}
dKl, cKl = Vector(dKn), Vector(cKn)

# ---- the rod within reach and in view; the right arm to it by IK ----
def rod_world(fwd, down, el_deg, az_deg=10, right=0.07):
    el_, az_ = math.radians(el_deg), math.radians(az_deg)
    D = Vector((math.sin(az_) * math.cos(el_), -math.cos(az_) * math.cos(el_), math.sin(el_)))
    seat = EYE + Vector((-right, -fwd, -down)); Yw = -D; Zw = (UP - UP.dot(D) * D).normalized(); Xw = Yw.cross(Zw)
    M = Matrix((Xw, Yw, Zw)).transposed().to_4x4(); M.translation = seat - D * SEAT; return M, D, seat
def hand_R3(S): return (rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix).to_3x3().normalized()
def wrist(S):
    _, _, k_, p_, a_ = LOC[S]; R3 = hand_R3(S); kw, pw, aw = R3 @ k_, R3 @ p_, R3 @ a_
    sh, el, wr = wpos(rig, "DEF-upper_arm." + S), wpos(rig, "DEF-forearm." + S), wpos(rig, "DEF-hand." + S)
    fo = (wr - el).normalized()
    flex = math.degrees(math.atan2(-fo.dot(pw), fo.dot(aw))); rad = math.degrees(math.atan2(-fo.dot(kw), fo.dot(aw)))
    u = el - sh; u = (u - u.dot(fo) * fo).normalized(); n_arm = (el - sh).cross(wr - el).normalized()
    neu = -n_arm if S == "R" else n_arm; pp_ = (pw - pw.dot(fo) * fo).normalized()
    return flex, rad, math.degrees(math.atan2(pp_.dot(u), pp_.dot(neu))), math.degrees((sh - el).angle(wr - el))
def limits_pen(flex, rad, pron, elbow):
    return ((max(0, flex - 55) + max(0, -45 - flex)) * 0.15 + (max(0, rad - 15) + max(0, -30 - rad)) * 0.15
            + (max(0, pron - 85) + max(0, -75 - pron)) * 0.12 + (max(0, elbow - 150) + max(0, 60 - elbow)) * 0.1)
def miss(S, Mh): return (wpos(rig, "DEF-hand." + S) - Mh.translation).length
def pole_for(S, target, out=0.0):
    sh, el = HINT[S]; P = el + (el - (sh + target) / 2).normalized() * 0.3
    return P + Vector((-out if S == "R" else out, 0, 0))
def cols_for(RW_):
    H_ = lambda y0, y1: (tuple(RW_ @ Vector((0, y0, 0))), tuple(RW_ @ Vector((0, y1, 0))), handle_radius((y0 + y1) / 2))
    stem_ = (tuple(RW_ @ Vector((0, -SEAT + 0.002, -0.014))), tuple(RW_ @ Vector((0, -SEAT + 0.010, -0.056))), 0.0055)
    foot_ = (tuple(RW_ @ Vector((0, -SEAT - 0.024, -0.016))), tuple(RW_ @ Vector((0, -SEAT + 0.024, -0.016))), 0.004)
    body_ = (tuple(RW_ @ Vector((0, -SEAT - 0.015, -0.076))), tuple(RW_ @ Vector((0, -SEAT + 0.04, -0.076))), 0.028)
    return [H_(-0.025, -0.25), H_(-0.25, -0.40), H_(-0.40, -0.43), H_(-0.43, -0.50), H_(-0.50, -0.64)], stem_, foot_, body_
def forearm_rod_clear(RW_):
    el, wr = wpos(rig, "DEF-forearm.R"), wpos(rig, "DEF-hand.R"); return seg_dist(el, wr, RW_ @ Vector((0, 0, 0)), RW_ @ Vector((0, -SEAT + 0.07, 0))) - 0.034 - 0.017
# ---- the right hand's grip chosen with its arm: each finished candidate scored on its fingers and on the best its arm can do ----
def right_place_best():
    best = None
    for fwd in (0.26, 0.29, 0.32, 0.35):
        for down in (0.26, 0.30, 0.34):
            for el_deg in (35, 45):
                for az_deg in (0, 12):
                    RW_, D_, seat_ = rod_world(fwd, down, el_deg, az_deg); Mh = RW_ @ R_h.inverted()
                    for out in (0.0, 0.1, 0.2):
                        set_pole(rig, "R", pole_for("R", Mh.translation, out)); set_hand(rig, "R", Mh)
                        w_ = wrist("R"); m_ = miss("R", Mh); fc = forearm_rod_clear(RW_); view = math.degrees(math.atan2(down, fwd))
                        s_ = -limits_pen(*w_) - m_ * 200 - max(0, -fc) * 60 - max(0, view - 46) * 0.1 - abs(w_[1]) * 0.01 - abs(w_[0]) * 0.01
                        if best is None or s_ > best[0]: best = (s_, [round(x, 1) for x in w_])
    return best
def arm_at(fwd, down, el_deg, az_deg):
    RW_, D_, seat_ = rod_world(fwd, down, el_deg, az_deg); Mh = RW_ @ R_h.inverted(); best = None
    for out in (0.0, 0.1, 0.2):
        set_pole(rig, "R", pole_for("R", Mh.translation, out)); set_hand(rig, "R", Mh)
        w_ = wrist("R"); m_ = miss("R", Mh); fc = forearm_rod_clear(RW_); view = math.degrees(math.atan2(down, fwd))
        s_ = -limits_pen(*w_) - m_ * 200 - max(0, -fc) * 60 - max(0, view - 46) * 0.1 - abs(w_[1]) * 0.01 - abs(w_[0]) * 0.01
        if best is None or s_ > best[0]: best = (s_, [round(x, 1) for x in w_])
    return best
trials = []
for ci, C_ in enumerate(RCANDS):
    for psi in range(0, 360, 15):
        fr = stem_frame(C_, psi)
        if not fr: continue
        sp, cl = stem_spread(C_, fr[0]); take_right(C_, psi, sp); a_ = arm_at(0.30, 0.30, 40, 6)
        tot = C_["score"] + 4 * a_[0] - max(0, -cl - 0.0008) * 1500 - sp * 0.3
        trials.append((tot, ci, psi, sp, round(cl, 4), a_))
trials.sort(key=lambda x: -x[0])
for t_ in trials[:8]: print("right grip (candidate, reel round the handle, fingers parted)", (RCANDS[t_[1]]["key"], t_[2], t_[3]), "stem clearance", t_[4], "wrist (palm, thumb, turn, elbow)", t_[5][1], "total", round(t_[0], 2))
choice = None
for t_ in trials[:4]:
    C_ = RCANDS[t_[1]]; take_right(C_, t_[2], t_[3]); ps = right_place_best(); tot = t_[0] - 4 * t_[5][0] + 4 * ps[0]
    if choice is None or tot > choice[0]: choice = (tot, t_[1], t_[2], t_[3], ps)
take_right(RCANDS[choice[1]], choice[2], choice[3]); bestT = thumb_search_R()
print("right chosen", RCANDS[choice[1]]["key"], "reel at", choice[2], "deg round from the palm, fingers parted", choice[3], "deg; best arm", choice[4])
GR = {f: (GRn[f][0], GRn[f][1], GRn[f][2], GRn[f][3]) for f in FING}
for f in FING: apply("R", f, *GRn[f][1:4], z=(SG_M * SPREAD if f == "middle" else SG_R * SPREAD if f == "ring" else 0))
apply("R", "thumb", bestT[1], bestT[3], bestT[3] * 1.1, bestT[2]); bpy.context.view_layer.update()
print("right fingers", {f: GRn[f][1:] for f in FING}, "thumb", bestT, "stem towards", fmt(stemdir))
place = []
for fwd in (0.26, 0.29, 0.32, 0.35):
    for down in (0.26, 0.30, 0.34):
        for el_deg in (35, 45):
            for az_deg in (0, 12):
                RW_, D_, seat_ = rod_world(fwd, down, el_deg, az_deg); Mh = RW_ @ R_h.inverted()
                bestp = None
                for out in (0.0, 0.1, 0.2):
                    set_pole(rig, "R", pole_for("R", Mh.translation, out)); set_hand(rig, "R", Mh)
                    w_ = wrist("R"); m_ = miss("R", Mh); fc = forearm_rod_clear(RW_); ln = lengths("R")
                    view = math.degrees(math.atan2(down, fwd)); s_ = -limits_pen(*w_) - m_ * 200 - max(0, -fc) * 60 - max(0, view - 46) * 0.1 - abs(w_[1]) * 0.01 - abs(w_[0]) * 0.01
                    if bestp is None or s_ > bestp[0]: bestp = (s_, out, [round(x, 1) for x in w_], round(m_, 4), round(fc, 3), [round(x, 3) for x in ln], round(view, 1))
                place.append((bestp[0], (fwd, down, el_deg, az_deg), bestp))
place.sort(key=lambda x: -x[0])
for p_ in place[:8]: print("rod place (ahead, below, up, left)", p_[1], "right-arm score", round(p_[0], 2), "pole out", p_[2][1], "wrist (palm, thumb, turn, elbow)", p_[2][2], "forearm-rod", p_[2][4], "seat below the eye line (deg)", p_[2][6])
# ---- the rod's place, the crank's angle and the left hand's grip and turn on the knob, chosen together for both arms ----
def knob_at(th):
    crank.rotation_euler = (math.radians(th), 0, 0); bpy.context.view_layer.update()
    CW = crank.matrix_world.copy(); kc = EQ["knob"].matrix_world.translation.copy(); kx = (CW.to_3x3() @ Vector((1, 0, 0))).normalized()
    return kc, kx, (tuple(kc - kx * 0.013), tuple(kc + kx * 0.013), 0.010), (tuple(CW.translation), tuple(kc - kx * 0.013), 0.0045)
def left_pose(th, sgn, beta, dK, cK):
    kc, kx, knob, carm = knob_at(th)
    Rb = dK.rotation_difference(kx * sgn).to_matrix(); R = Quaternion(kx, math.radians(beta)).to_matrix() @ Rb
    M = R.to_4x4(); M.translation = kc - R @ cK; return M, knob, carm
def apply_left(cand):
    gi, gm, bt = cand[6], cand[7], cand[8]
    apply("L", "index", *gi[1:4]); apply("L", "middle", *gm[1:4])
    for f, k_ in (("ring", 1.0), ("pinky", 1.05)): apply("L", f, *[x * k_ for x in gm[1:4]])
    apply("L", "thumb", bt[1], bt[3], bt[3] * 1.1, bt[2]); bpy.context.view_layer.update()
byg = {}
for r_ in resK:
    if r_[1] not in byg or r_[0] > byg[r_[1]][0]: byg[r_[1]] = r_
LEFTC = sorted(byg.values(), key=lambda x: -x[0])
print("left grips tried with the arm (tilt, score):", [(c[1], round(c[0], 1)) for c in LEFTC])
best_all = None; n_ = 0
for pr in place[:6]:
    fwd, down, el_deg, az_deg = pr[1]; RW_, D_, seat_ = rod_world(fwd, down, el_deg, az_deg); rod.matrix_world = RW_; bpy.context.view_layer.update()
    HANDLE_, STEM_, FOOT_, BODY_ = cols_for(RW_); Mh = RW_ @ R_h.inverted(); set_pole(rig, "R", pole_for("R", Mh.translation, pr[2][1])); set_hand(rig, "R", Mh)
    PR_ = HS["R"].deform()[::7]
    for ci, cand in enumerate(LEFTC):
        apply_left(cand); dK, cK = Vector(cand[5]), Vector(cand[4])
        for th in range(0, 360, 30):
            for sgn in (1, -1):
                for beta in range(0, 360, 30):
                    M, knob, carm = left_pose(th, sgn, beta, dK, cK)
                    set_pole(rig, "L", pole_for("L", M.translation)); set_hand(rig, "L", M); n_ += 1
                    w_ = wrist("L"); m_ = miss("L", M)
                    if m_ > 0.02: continue
                    P = HS["L"].deform(); clash = float(seg_clear(P, HANDLE_ + [BODY_, STEM_, carm]).min())
                    hh = float(np.min(np.linalg.norm(P[::7, None, :] - PR_[None, :, :], axis=2))) - 0.012
                    sL = (-limits_pen(*w_) - max(0, w_[3] - 145) * 0.15 - m_ * 200 - max(0, -clash - 0.002) * 400 - max(0, -hh) * 300
                          - abs(w_[1]) * 0.01 - abs(w_[0]) * 0.01)
                    tot = pr[0] + sL + 0.12 * cand[0]
                    if best_all is None or tot > best_all[0]: best_all = (tot, pr, ci, (th, sgn, beta), [round(x, 1) for x in w_], round(clash, 4), round(hh, 3), round(sL, 2))
print("tried", n_, "arm placements; best: rod", best_all[1][1], "left grip tilt", LEFTC[best_all[2]][1], "crank, side, turn", best_all[3], "left wrist (palm, thumb, turn, elbow)", best_all[4], "clear of the reel", best_all[5], "clear of the other hand", best_all[6], "left score", best_all[7], "total", round(best_all[0], 2))
PB = best_all[1][2]; (FWD, DOWN, ELD, AZD) = best_all[1][1]
RW, DIRW, SEATW = rod_world(FWD, DOWN, ELD, AZD); rod.matrix_world = RW; bpy.context.view_layer.update(); RWi = RW.inverted()
HANDLE, STEM, FOOT, REELBODY = cols_for(RW); COL_R = HANDLE + [FOOT, REELBODY, STEM]
MhR = RW @ R_h.inverted(); set_pole(rig, "R", pole_for("R", MhR.translation, PB[1])); set_hand(rig, "R", MhR)
print("seat", fmt(SEATW), "butt", fmt(RW.translation), "right wrist (palm, thumb, turn, elbow)", [round(x, 1) for x in wrist("R")], "right arm lengths", [round(x, 3) for x in lengths("R")])
# (on the real handle and stem: the middle and ring fingers spread round the stem as far as it needs, then each finger
# searched again against the real equipment)
def stem_clear():
    P = HS["R"].deform(); return min(float(seg_clear(P[HS["R"].sel("DEF-f_middle")], [STEM]).min()), float(seg_clear(P[HS["R"].sel("DEF-f_ring")], [STEM]).min()))
def tipd(): return (wpos(rig, "DEF-f_middle.03.R", True) - wpos(rig, "DEF-f_ring.03.R", True)).length
sg = {}
for f_ in ("middle", "ring"):
    pb = rig.pose.bones[f"f_{f_}.01.R"]; d0 = tipd(); pb.rotation_euler.z = math.radians(5); bpy.context.view_layer.update(); d1 = tipd(); pb.rotation_euler.z = 0; bpy.context.view_layer.update()
    sg[f_] = 1 if d1 > d0 else -1
print("stem clearance before spreading", round(stem_clear(), 4))
spread = SPREAD
if stem_clear() < 0.0:
    for spread in (SPREAD + 3, SPREAD + 6, SPREAD + 9):
        rig.pose.bones["f_middle.01.R"].rotation_euler.z = math.radians(SG_M * spread); rig.pose.bones["f_ring.01.R"].rotation_euler.z = math.radians(SG_R * spread)
        bpy.context.view_layer.update()
        if stem_clear() > 0.0: break
print("spread round the stem", spread, "deg; stem clearance", round(stem_clear(), 4))
for f in ("index", "middle", "ring", "pinky"):
    if GR[f][1] is None: continue
    a0, b0 = GR[f][1], GR[f][2]
    GR[f] = grasp("R", f, COL_R, range(max(0, a0 - 6), min(95, a0 + 7), 2), range(max(0, b0 - 6), min(108, b0 + 7), 2)); print("right", f, "on the real handle", GR[f])
# (the left hand: its grip searched finely on the chosen knob place, then put there)
CAND = LEFTC[best_all[2]]; dKl, cKl = Vector(CAND[5]), Vector(CAND[4]); cKn, dKn = np.array(CAND[4]), np.array(CAND[5])
clrL = lambda P: line_clear(P, cKn, dKn, 0.010, 0.013); set_wrap("L", cKn, dKn, pLn, aLn)
gi0, gm0 = CAND[6], CAND[7]
GLn = {}
for f, g0 in (("index", gi0), ("middle", gm0)):
    GLn[f] = grasp_np(PPL[f], clrL, range(max(0, g0[1] - 12), min(95, g0[1] + 13), 3), range(max(0, g0[2] - 12), min(106, g0[2] + 13), 3), S="L"); print("left", f, "(score, knuckle, middle, last, gaps, round the knob)", GLn[f])
apply_left((0, 0, 0, 0, 0, 0, GLn["index"], GLn["middle"], CAND[8]))
TH, SG, BE = best_all[3]
MhL, KNOB, CARM = left_pose(TH, SG, BE, dKl, cKl); set_pole(rig, "L", pole_for("L", MhL.translation)); set_hand(rig, "L", MhL)
COL_L = [KNOB, CARM, REELBODY, STEM] + HANDLE
P = HS["L"].deform(); print("left on the real knob: gaps", {f: round(float(seg_clear(P[HS["L"].sel("DEF-f_" + f if f != "thumb" else "DEF-thumb")], [KNOB]).min()), 4) for f in ("index", "middle", "ring", "pinky", "thumb")})
for S, cols in (("R", COL_R), ("L", COL_L)):
    P = HS[S].deform(); print(S, "final wrist (palm, thumb, turn, elbow)", [round(x, 1) for x in wrist(S)], "arm length ratios", [round(x, 3) for x in lengths(S)], "deepest skin into the equipment", round(float(seg_clear(P, cols).min()), 4))

# ---- attachment points and the solved grips kept on the rig, saved, rendered ----
KW = EQ["knob"].matrix_world.copy()
for nm_, M_ in (("att_rod_grip.R", MhR), ("att_knob.L", MhL), ("att_reel_stem", RW @ Matrix.Translation(Vector((0, -SEAT + 0.002, -0.014))))):
    e = link(bpy.data.objects.new(nm_, None)); e.empty_display_type = "ARROWS"; e.empty_display_size = 0.03; e.matrix_world = M_
rig["fd_rod_grip"] = [list(r) for r in (RWi @ MhR)]; rig["fd_knob_grip"] = [list(r) for r in (KW.inverted() @ MhL)]; rig["fd_crank_deg"] = float(TH)
pose = {}
for S in "LR":
    for f in ("index", "middle", "ring", "pinky", "thumb"):
        for nm in chain(rig, f, S): pose[nm] = [round(math.degrees(a), 2) for a in rig.pose.bones[nm].rotation_euler]
rig["fd_hold_fingers"] = json.dumps(pose)
json.dump(dict(rod_world=[list(r) for r in RW], rod_grip=[list(r) for r in (RWi @ MhR)], knob_grip=[list(r) for r in (KW.inverted() @ MhL)], crank_deg=TH, fingers=pose, eye=list(EYE), seat=list(SEATW), place=[FWD, DOWN, ELD, AZD]), open(RIGDIR + "/gate1_v11.json", "w"), indent=1)
body.hide_viewport = False
if jk: jk.hide_viewport = False
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/gate1_v11.blend"); print("saved gate1_v11.blend")
PREFIX = "G1l"; exec(open(ROOT + "/scripts/render_g1_v1.py").read()); exec(open(ROOT + "/scripts/render_fp_v1.py").read())
