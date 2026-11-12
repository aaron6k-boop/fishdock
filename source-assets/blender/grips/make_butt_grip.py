import os, math, json
exec(open(r"C:\Users\aaron\Documents\FishDock-assets\scripts\grip_lib.py").read())
OUT = os.path.join(ROOT, "renders", "grips"); os.makedirs(OUT, exist_ok=True)
wipe()
rig, skin, sleeve = load_arms(os.path.join(ROOT, "exports", "fp_body_v4g.glb"))
scene = bpy.context.scene; cam = studio(scene)
Mw = rig.matrix_world
mrod = mat("rod", (0.03, 0.03, 0.035), 0.6); mmetal = mat("metal", (0.25, 0.3, 0.45), 0.35, 0.8)
EXPORT = {}

def game_frame(H):
    """The hand's frame as the game measures it (fpHands.js): Yh to the middle knuckle, X across, Z = X x Yh."""
    P = Mw @ H.hand.bone.head_local
    Yh = (Mw @ H.bones["middle"][0].bone.head_local - P).normalized()
    across = Mw @ H.bones["index"][0].bone.head_local - Mw @ H.bones["pinky"][0].bone.head_local
    across = (across - Yh * across.dot(Yh)).normalized()
    X = across * (1 if H.s == "r" else -1); Z = X.cross(Yh).normalized(); X = Yh.cross(Z).normalized()
    return P, X, Yh, Z

def record(name, H, origin, sx, sy, sz):
    """The grip as the game takes it: the hand's frame and wrist in the socket's frame, and every finger bone's turn."""
    P, X, Yh, Z = game_frame(H)
    R = Matrix(((sx.dot(X), sx.dot(Yh), sx.dot(Z)), (sy.dot(X), sy.dot(Yh), sy.dot(Z)), (sz.dot(X), sz.dot(Yh), sz.dot(Z))))
    q = R.to_quaternion(); d = P - origin
    bones = {}
    Fq = Matrix((X, Yh, Z)).transposed().to_quaternion()   # the hand's own frame (its columns: across, along the fingers, the third)
    for bs in H.bones.values():
        for pb in bs:
            # (the bone's turn from rest, in the hand's own frame: the same however the model is stood or the bones are framed)
            b = Fq.inverted() @ (Mw.to_quaternion() @ pb.matrix.to_quaternion() @ pb.bone.matrix_local.to_quaternion().inverted() @ Mw.to_quaternion().inverted()) @ Fq; bones[pb.name] = [round(b.x, 6), round(b.y, 6), round(b.z, 6), round(b.w, 6)]
    EXPORT[name] = {"side": H.s, "Ph": [round(d.dot(sx), 5), round(d.dot(sy), 5), round(d.dot(sz), 5)], "Qh": [round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)], "bones": bones}
    print("RECORD", name, EXPORT[name]["Ph"], EXPORT[name]["Qh"], "det", round(R.determinant(), 4))

def spread(H, pb, deg):
    d0 = (Mw @ pb.tail - Mw @ pb.head).normalized(); H.turn(pb, H.p, math.radians(deg)); d1 = (Mw @ pb.tail - Mw @ pb.head).normalized()
    if (d1 - d0).dot(H.rad) * deg < 0: H.turn(pb, H.p, math.radians(-2 * deg))
def open_thumb(H, deg):
    pb = H.bones["thumb"][0]; d0 = (Mw @ pb.tail - Mw @ pb.head).normalized(); H.turn(pb, H.f, math.radians(deg)); d1 = (Mw @ pb.tail - Mw @ pb.head).normalized()
    if (d1 - d0).dot(H.p) > 0: H.turn(pb, H.f, math.radians(-2 * deg))
def close_thumb(H, dist, a0, t, limits=(70, 60, 70)):
    th = []
    for k, pb in enumerate(H.bones["thumb"]):
        ang = 0
        while ang < limits[k]:
            h = Mw @ pb.head; dvec = (Mw @ pb.tail - h).normalized(); near = a0 + t * (h - a0).dot(t); ax = dvec.cross(near - h)
            if ax.length < 1e-6: break
            ax.normalize(); H.turn(pb, ax, math.radians(2)); ang += 2
            if min((dist(P) for P in H.points_far([b.name for b in H.bones["thumb"][max(k, 1):]])), default=1) < 0.0006: H.turn(pb, ax, math.radians(-2)); ang -= 2; break
        th.append(ang)
    return th
def gaps(H, dist):
    return {fn: ["%.1f" % (min((dist(P) for P in H.points_far([b.name])), default=9) * 1000) for b in H.bones[fn]] for fn in FINGERS + ["thumb"]}
def fit_thumb(H, kc, ka, nav, KRt, kd, tag):
    """The thumb's turn searched for: its first joint free, the two beyond hinged, its pad laid on a round of radius
    KRt about the line through kc along ka, on the side nav points to."""
    T = H.bones["thumb"]; tn = [b.name for b in T]
    for pb in T: pb.rotation_quaternion = (1, 0, 0, 0)
    upd()
    d2 = (Mw @ T[1].tail - Mw @ T[1].head).normalized(); h0 = d2.cross(H.p).normalized()
    aim = H.K["index"] + H.p * 0.03 - Mw @ T[2].tail
    if (h0.cross(d2)).dot(aim) < 0: h0 = -h0
    def pose(x):
        for pb in T: pb.rotation_quaternion = (1, 0, 0, 0)
        upd()
        r = Vector(x[:3]); hinge = h0
        if r.length > 1e-6:
            H.turn(T[0], r.normalized(), r.length); hinge = Matrix.Rotation(r.length, 3, r.normalized()) @ h0
        H.turn(T[1], hinge, x[3]); H.turn(T[2], hinge, x[4])
        return hinge
    TTH = [0.008]
    def cost(x):
        r = Vector(x[:3])
        if r.length > math.radians(62) or not (-0.2 <= x[3] <= 1.25) or not (-0.2 <= x[4] <= 1.3): return 1e9
        hinge = pose(x)
        pts = H.points_far([tn[2]]); c = sum(pts, Vector((0, 0, 0))) / len(pts); u = c - kc
        d3 = (Mw @ T[2].tail - Mw @ T[2].head).normalized(); pad = hinge.cross(d3)
        e = (u.dot(nav) - (KRt + TTH[0])) ** 2
        tr = u - nav * u.dot(nav); e += tr.dot(ka) ** 2 * 0.6 + (tr - ka * tr.dot(ka)).length_squared
        pen = min(kd(P) for P in H.points_far(tn[1:])); e += (pen * 4) ** 2 if pen < 0 else 0
        e += 2e-5 * (1 + pad.dot(nav)) + 4e-6 * r.length_squared
        return e
    x = [0, 0, 0, 0.35, 0.35]; best = cost(x)
    for rnd in range(3):
        step = math.radians(12)
        while step > math.radians(0.6):
            moved = False
            for i in range(5):
                for sgn in (1, -1):
                    y = list(x); y[i] += sgn * step; cy = cost(y)
                    if cy < best - 1e-12: x, best, moved = y, cy, True; break
            if not moved: step *= 0.5
        pose(x); g = min(kd(P) for P in H.points_far([tn[2]]))
        print(tag, "THUMB round", rnd, "cost %.3e" % best, "gap mm %.2f" % (g * 1000), [round(math.degrees(v), 1) for v in x])
        if abs(g - 0.0005) < 0.0004: break
        TTH[0] -= (g - 0.0005); best = cost(x)
    hinge = pose(x)
    tg = lambda: min(kd(P) for P in H.points_far(tn[1:]))
    g0 = tg(); H.turn(T[0], hinge, math.radians(0.5)); sgn = 1 if tg() > g0 else -1; H.turn(T[0], hinge, math.radians(-0.5))
    n = 0
    while tg() < -0.0005 and n < 60: H.turn(T[0], hinge, math.radians(0.4 * sgn)); n += 1
    print(tag, "THUMB eased", n, "gap mm %.2f" % (tg() * 1000))



# ---------------- the left hand round the rod's butt (the pulling hand of a two-handed cast) ----------------
# A plain bar the size of the pier rod's butt grip (15.5 mm radius), its cap just past the little finger. Held as the
# lower hand holds a bat: the bar across the palm on a slight slant, the thumb's side towards the tip, the fingers
# round it and the thumb closed over them.
RB = 0.0155
EXPORT = {}
for PHI_DEG, UP, TAG in ((14, 0.022, "a"), (8, 0.028, "b")):
    H = Hand(rig, skin, "l"); H.reset()
    PHI = math.radians(PHI_DEG)
    sz = (H.rad * math.cos(PHI) + H.f * math.sin(PHI)).normalized()      # to the tip
    sx = H.p.copy(); sx = (sx - sz * sx.dot(sz)).normalized()
    sy = sz.cross(sx).normalized()
    palm_len = ((H.K["middle"] + H.K["ring"]) * 0.5 - H.W).length
    palm_pts = H.points(["hand_l"])
    mid = (H.K["middle"] + H.K["ring"]) * 0.5
    best = None
    for k in range(100):
        off = 0.07 - k * 0.0005
        c = H.W + H.f * (palm_len - UP) + H.p * off
        O = c + sz * (mid - c).dot(sz)
        a0, a1 = O - sz * 0.058, O + sz * 0.35
        d = cyl_dist(a0, a1, RB, capped=True); m = min(d(P) for P in palm_pts)
        if m < 0.0004: break
        best = (off, O, m)
    off, O, m = best; a0, a1 = O - sz * 0.058, O + sz * 0.35; dist = cyl_dist(a0, a1, RB, capped=True)
    print("BUTT", TAG, "palm to axis %.1f mm, palm gap %.2f mm" % (off * 1000, m * 1000))
    ang = {fn: close_onto(H, fn, dist, step=1.0, gap=0.0005) for fn in ("middle", "ring", "index", "pinky")}
    print("BUTT", TAG, "closed", ang); print("BUTT gaps mm", gaps(H, dist))
    # the thumb round the other way, its pad on the first finger's end
    ipts = H.points([H.bones["index"][2].name]) + H.points([H.bones["middle"][2].name]); icen = sum(ipts, Vector((0, 0, 0))) / len(ipts)
    nav = icen - O; nav -= sz * nav.dot(sz); KRt = max(((P - O) - sz * (P - O).dot(sz)).length for P in ipts) * 0.97; nav.normalize()
    kct = O + sz * ((icen - O).dot(sz) + 0.004)
    fit_thumb(H, kct, sz, nav, KRt, dist, "BUTT" + TAG)
    print("BUTT gaps mm", gaps(H, dist))
    name = "butt_l" if TAG == "a" else "butt_l_" + TAG
    record(name, H, O, sx, sy, sz)
    objs = [cyl_obj("bar", a0, a1, RB, mrod)]
    for nm, dv in (("palm", H.p), ("back", -H.p), ("tip", sz + sy * 0.3), ("cap", -sz + sy * 0.3), ("above", sy), ("below", -sy), ("three", sy + sz * 0.6 - sx * 0.6)):
        shoot(cam, O, dv, 0.42, os.path.join(OUT, f"b1{TAG}_butt_{nm}.png"))
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
    H.reset()
json.dump(EXPORT, open(os.path.join(ROOT, "exports", "grip_butt_v1.json"), "w"), indent=1)
print("BUTT DONE")
