# FishDock rig rebuild (v3: the wrist and forearm counted too when seating the handle, so a handle running down the
# hand towards the wrist lies on the skin there rather than through it. v2: the thumb's base pad counted when seating the handle, the thumb searched wider with only its
# last two bones kept out of the handle, and each finger's joints kept in the proportion a closing finger has):
# the grasp search of Gate 1 (09_gate1_grips.py) as a library (exec'd after riglib.py, griplib.py,
# posing_v3.py, skin_v2.py and gatelib_v1.py, with `rig` and HS = {side: HandSkin} set). The hand's skin is deformed by
# Blender's own weights in numpy, fast enough to try a handle across the palm at many places and close every finger at
# each; each finger's knuckle and middle joint are searched together (the last joint bending with the middle one) for
# the shape in which every bone touches without going in, scored on how far round the handle it curls.
FING = ("index", "middle", "ring", "pinky")
def Mhand(S): return rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix
def deform_sub(S, mask):
    hs = HS[S]; M = np.array([np.array(rig.matrix_world @ rig.pose.bones[n].matrix) for n in hs.names]) @ hs.rest_inv
    return np.einsum("vb,bij,vj->vi", hs.W[mask], M, hs.V[mask])[:, :3]
def hand_local_pts(S, mask):
    P = deform_sub(S, mask); Mi = np.array(Mhand(S).inverted()); return (Mi[:3, :3] @ P.T).T + Mi[:3, 3]
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
WRAP = {}
def wrap_deg(S, p):
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
            sc_ = touch * 10 - gaps + wb - (max(0, 45 - b) * 0.3 if S else 0) - abs(a - 0.75 * b) * 0.1
            if best is None or sc_ > best[0]: best = (sc_, a, b, min(88, b * k3), [round(x, 4) for x in cl], round(wr))
    return best or (-60.0, 0, 0, 0, None, 0)
def seat_line(Pts, c0, d, n, r, want=0.0015, half=None):
    lo, hi = -0.04, 0.08
    for _ in range(30):
        h = (lo + hi) / 2; g = float(line_clear(Pts, c0 + n * h, d, r, half).min())
        if g < want: lo = h
        else: hi = h
    return c0 + n * ((lo + hi) / 2)
def apply(S, f, a, b, c, z=0.0):
    pbs = [rig.pose.bones[n] for n in chain(rig, f, S)]
    for pb in pbs: pb.rotation_mode = "XYZ"
    pbs[0].rotation_euler = (math.radians(a), 0, math.radians(z)); pbs[1].rotation_euler = (math.radians(b), 0, 0); pbs[2].rotation_euler = (math.radians(c), 0, 0)
def open_hand(S):
    for f in FING + ("thumb",): apply(S, f, 0, 0, 0)
    bpy.context.view_layer.update()
def finger_pose(S):
    """the finger and thumb controls' turns (degrees, XYZ) as they are now"""
    return {nm: [round(math.degrees(a), 2) for a in rig.pose.bones[nm].rotation_euler] for f in FING + ("thumb",) for nm in chain(rig, f, S)}
def set_finger_pose(pose):
    for nm, v in pose.items():
        pb = rig.pose.bones[nm]; pb.rotation_mode = "XYZ"; pb.rotation_euler = tuple(math.radians(x) for x in v)
    bpy.context.view_layer.update()
def solve_cylinder(S, r, gams=(30, 45, 60), us=(-0.01, 0.0, 0.01), vs=(0.0, 0.01, 0.02), half=None, label=""):
    """a power grip round a cylinder of radius r: the handle diagonally across the palm (gam degrees from the knuckles'
    line), the palm on it, every finger curled round it as far as it goes without going in, the thumb closing over from
    the other side. Returns the finger and thumb angles and the cylinder's axis (a point c and direction d) and the
    palm's normal pn, in the hand bone's own frame."""
    open_hand(S); FKs = HandFK(S); PP = {f: FKs.prep(f) for f in FING + ("thumb",)}
    _, mc, k, p, al = LOC[S]; kn, pn, an = np.array(k), np.array(p), np.array(al)
    PALM = hand_local_pts(S, HS[S].sel("DEF-palm") | HS[S].sel("DEF-hand") | HS[S].sel("DEF-thumb.01") | HS[S].sel("DEF-forearm")); mcc = np.array(sum(mc.values(), Vector()) / 4)
    res = []
    for gam in gams:
        d = kn * math.cos(math.radians(gam)) + an * math.sin(math.radians(gam)); d /= np.linalg.norm(d)
        for u in us:
            for v in vs:
                c0 = mcc - an * 0.03 + kn * u + an * v - pn * 0.02
                c = seat_line(PALM, c0, d, pn, r, half=half); clr = lambda P, c=c, d=d: line_clear(P, c, d, r, half); set_wrap(S, c, d, pn, an)
                g = {f: grasp_np(PP[f], clr, range(0, 91, 10), range(0, 106, 10), S=S) for f in FING}
                palm_touch = int((line_clear(PALM, c, d, r, half) < 0.003).sum())
                res.append((sum(x[0] for x in g.values()) + min(palm_touch, 60) * 0.15, gam, u, v, c, d, g, palm_touch))
    res.sort(key=lambda x: -x[0]); best = None
    for r_ in res[:3]:
        _, gam, u, v, c, d, g0, pt = r_; clr = lambda P, c=c, d=d: line_clear(P, c, d, r, half); set_wrap(S, c, d, pn, an); G = {}
        for f in FING:
            a0, b0 = g0[f][1], g0[f][2]; G[f] = grasp_np(PP[f], clr, range(max(0, a0 - 12), min(95, a0 + 13), 3), range(max(0, b0 - 12), min(108, b0 + 13), 3), S=S)
        sc_ = sum(x[0] for x in G.values()) + min(pt, 60) * 0.15
        if best is None or sc_ > best[0]: best = (sc_, gam, u, v, c, d, G, pt)
    sc_, gam, u, v, c, d, G, pt = best; clr = lambda P: line_clear(P, c, d, r, half)
    # the thumb: its tip on the cylinder, across from the first finger's middle bone (opposed), clear of the fingers
    Pf = np.vstack([fk(PP[f], [math.radians(x) for x in G[f][1:4]])[::3] for f in ("index", "middle")])
    Pi = fk(PP["index"], [math.radians(x) for x in G["index"][1:4]]); fing = Pi[PP["index"]["seg"][1]].mean(0)
    def rd(q): w = q - c; w = w - d * (w @ d); return w / (np.linalg.norm(w) + 1e-9)
    bt = None; sg = PP["thumb"]["seg"]
    for ax_ in range(-40, 71, 10):
        for az in range(-70, 61, 10):
            for b in range(0, 71, 10):
                P = fk(PP["thumb"], (math.radians(ax_), math.radians(b), math.radians(b * 1.1)), z0=math.radians(az)); cl = clr(P)
                if float(cl[sg[1] | sg[2]].min()) < -0.0012: continue
                tipm = sg[2]; tip = P[tipm]
                if float(np.min(np.linalg.norm(tip[::2, None, :] - Pf[None, :, :], axis=2))) < 0.004: continue
                gth = float(cl[tipm].min()); tc = tip.mean(0); opp = math.degrees(math.acos(max(-1, min(1, float(rd(tc) @ rd(fing))))))
                s2 = -abs(gth) * 300 - max(0, 110 - opp) * 0.15 - max(0.0, -float(cl[sg[0]].min()) - 0.002) * 500
                if bt is None or s2 > bt[0]: bt = (s2, ax_, az, b, round(gth, 4), round(opp, 1))
    bt = bt or (-30, 0, 0, 0, None, 0)
    for f in FING: apply(S, f, *G[f][1:4])
    apply(S, "thumb", bt[1], bt[3], bt[3] * 1.1, bt[2]); bpy.context.view_layer.update()
    # (checked on Blender's own deformation: every bone's gap)
    PPl = hand_local_pts(S, np.ones(len(HS[S].own), bool)); cl = line_clear(PPl, c, d, r, half)
    meta = HS[S].sel("DEF-thumb.01"); cl_nometa = cl[~meta]
    gaps = {f: round(float(cl[HS[S].sel("DEF-f_" + f if f != "thumb" else "DEF-thumb")].min()), 4) for f in FING + ("thumb",)}
    print("grip", label, S, "r", r, "angle across the palm", gam, "palm points on it", pt, "fingers (knuckle, middle, last, gaps, round)", {f: G[f][1:] for f in FING}, "thumb", bt[1:], "gaps on Blender's skin", gaps, "deepest", round(float(cl.min()), 4), "deepest outside the thumb's base pad", round(float(cl_nometa.min()), 4))
    return dict(r=r, gam=gam, c=[float(x) for x in c], d=[float(x) for x in d], pn=[float(x) for x in pn], an=[float(x) for x in an], kn=[float(x) for x in kn], fingers=finger_pose(S), gaps=gaps, deepest=round(float(cl.min()), 4), deepest_fingers=round(float(cl_nometa.min()), 4), thumb=bt[1:])
