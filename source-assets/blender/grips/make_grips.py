# ---- the two hand grips the game brings in (src/lib/world3d/grips.js) ----
# Run in Blender 5.x:  blender --background --factory-startup --python make_grips.py
# It loads the arms model (public/models/fp_body.glb, kept on the asset machine as exports/fp_body_bs_c.glb), poses
# each hand onto the shape it holds and writes exports/grips_v14.json, six check renders of each grip in
# renders/grips/ and source/grip_lab.blend. Paste the json into grips.js (AUTHORED).
#   seat: the right hand round a 29 mm handle, the reel's stem between the middle and ring fingers at their roots.
#         Each finger is closed joint by joint until its skin touches (grip_lib.close_onto).
#   crank: the left hand on the reel's knob (20 mm across, 26 mm long): the knob across the hooked first two
#         fingers, its length along the knuckles, the thumb's turn searched for so its pad lies on the far side.
# Paths below are the asset machine's (ROOT in grip_lib.py); change them to run elsewhere.
import os, math, json
exec(open(r"C:\Users\aaron\Documents\FishDock-assets\scripts\grip_lib.py").read())
OUT = os.path.join(ROOT, "renders", "grips"); os.makedirs(OUT, exist_ok=True)
wipe()
rig, skin, sleeve = load_arms(os.path.join(ROOT, "exports", "fp_body_bs_c.glb"))
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

# ---------------- the right hand on the rod at the reel seat ----------------
H = Hand(rig, skin, "r"); H.reset()
R = 0.0145; phi = math.radians(18)
t = (H.rad * math.cos(phi) + H.f * math.sin(phi)).normalized()
palm_len = ((H.K["middle"] + H.K["ring"]) * 0.5 - H.W).length
open_thumb(H, 30)
c = H.W + H.f * (palm_len - 0.014) + H.p * (R + 0.009) + H.rad * 0.004
a0, a1 = c - t * 0.3, c + t * 0.3
SPREAD = (("index", 7), ("middle", 6), ("ring", -6), ("pinky", -9))
for fn, deg in SPREAD: spread(H, H.bones[fn][0], deg)
# the reel's stem: down between the middle and ring fingers, part of the way round from the palm (the hand lies on
# the upper right of the handle, not flat on top of it)
PSI = math.radians(65)
fperp = (H.f - t * H.f.dot(t)).normalized()
sd = (-H.p * math.cos(PSI) + fperp * math.sin(PSI)).normalized()
mr = [(Mw @ H.bones[f][0].head + Mw @ H.bones[f][0].tail) * 0.5 for f in ("middle", "ring")]
g = (mr[0] + mr[1]) * 0.5; s0 = a0 + t * (g - a0).dot(t)
handle = cyl_dist(a0, a1, R); stem = cyl_dist(s0, s0 + sd * 0.09, 0.0045, capped=True)
dist = handle
both = lambda P: min(handle(P), stem(P))
ang = {}
for fn in FINGERS:
    # closed round the handle with the reel's stem in the way; a finger the stem stops from closing at all (it
    # catches its side) is closed round the handle alone, and lies against the stem
    ang[fn] = close_onto(H, fn, handle if fn in ("middle", "ring") else both)   # (the stem lies between these two, pressed by their sides)
    if fn in ("middle", "ring") and ang[fn][1] < 45:
        for pb in H.bones[fn]: pb.rotation_quaternion = (1, 0, 0, 0)
        upd(); spread(H, H.bones[fn][0], dict(SPREAD)[fn]); ang[fn] = close_onto(H, fn, handle); print("SEAT", fn, "closed past the stem")
print("SEAT thumb before", gaps(H, dist)["thumb"])
th = close_thumb(H, dist, a0, t)
print("SEAT closed", ang, "thumb", th); print("SEAT gaps mm", gaps(H, dist))
objs = [cyl_obj("handle", a0, a1, R, mrod), cyl_obj("stem", s0 + sd * R * 0.5, s0 + sd * 0.075, 0.0055, mmetal, 16), cyl_obj("reel", s0 + sd * 0.075 - t * 0.012, s0 + sd * 0.075 + t * 0.02, 0.022, mmetal, 32)]
sy = -sd; sz = t; sx = sy.cross(sz).normalized()
record("seat", H, s0, sx, sy, sz)
side = t.cross(H.p).normalized()
for name, d in (("above", sy), ("right", sx), ("left", -sx), ("below", -sy + sz * 0.3), ("eye", sy * 0.8 - sz * 0.9 - sx * 0.1), ("tip", sz + sy * 0.3)):
    shoot(cam, s0, d, 0.36, os.path.join(OUT, f"g14_seat_{name}.png"), up=sy)
for o in objs: bpy.data.objects.remove(o, do_unlink=True)

# ---------------- the left hand on the reel's knob ----------------
L = Hand(rig, skin, "l"); L.reset()
# (the fingers side by side, as a hand closes: at rest the model has them fanned apart)
for fn, deg in (("index", -2), ("ring", 5), ("pinky", 11)): spread(L, L.bones[fn][0], deg)
KR, KL = 0.010, 0.026
AX = {}
# The knob lies across the first two fingers, in the hook of their bent ends, its length along the line of the
# knuckles (the reel on the thumb's side); the thumb comes down onto it from the other side. First the hook:
for fn, bend in (("index", (30, 62, 40)), ("middle", (34, 64, 40))):
    ax = L.flex_axis(L.bones[fn][0]); AX[fn] = ax
    for pb, a in zip(L.bones[fn], bend): L.turn(pb, ax, math.radians(a))
ka = L.rad.copy()                                      # along the knuckles, towards the thumb's side (where the handle's arm is)
seg = lambda k: L.points([L.bones[fn][k].name for fn in ("index", "middle")])
P1, P2, P3 = seg(0), seg(1), seg(2)
mid = sum(P3, Vector((0, 0, 0))) / len(P3)
def rad_d(pts, c): return min(((P - c) - ka * (P - c).dot(ka)).length for P in pts) - KR
# (inside the hook, not against the backs of the fingers: on the pad's side of both the middle and the end segments)
sg = 1 if AX["index"].cross(L.f).dot(L.p) > 0 else -1
inside = []
for k in (1, 2):
    pb = L.bones["middle"][k]; d = (Mw @ pb.tail - Mw @ pb.head).normalized(); pts = seg(k)
    inside.append((sum(pts, Vector((0, 0, 0))) / len(pts), AX["index"].cross(d) * sg))
best = None
for ia in range(0, 56):
    for ib in range(0, 40):
        c = L.W + L.f * (0.05 + ia * 0.002) + L.p * (ib * 0.002)
        d1, d2, d3 = rad_d(P1, c), rad_d(P2, c), rad_d(P3, c)
        if min(d1, d2, d3) < -0.0003: continue
        if any((c - q).dot(n) - ka.dot(c - q) * ka.dot(n) < 0.004 for q, n in inside): continue
        sc = abs(d2) + abs(d3) + max(0, 0.004 - d1) * 0.2
        if best is None or sc < best[0]: best = (sc, c, d1, d2, d3)
print("KNOB seat score %.4f gaps mm %.1f %.1f %.1f" % (best[0], best[2] * 1000, best[3] * 1000, best[4] * 1000))
c = best[1]; kc = c + ka * (mid - c).dot(ka) + ka * 0.002   # (under the two fingers, a little towards the arm)
k0, k1 = kc - ka * KL / 2, kc + ka * KL / 2
kd = cyl_dist(k0, k1, KR, capped=True)
for fn in ("index", "middle"):
    for k in (1, 2):
        pb = L.bones[fn][k]; a = 0
        while a < 30:
            L.turn(pb, AX[fn], math.radians(2)); a += 2
            if min(kd(P) for P in L.points_far([b.name for b in L.bones[fn][k:]])) < 0.0006: L.turn(pb, AX[fn], math.radians(-2)); break
for fn, tuck in (("ring", (58, 80, 50)), ("pinky", (66, 84, 52))):
    ax = L.flex_axis(L.bones[fn][0])
    for pb, a in zip(L.bones[fn], tuck): L.turn(pb, ax, math.radians(a))
# (where the fingers meet the knob, and so the side the thumb comes onto: straight across from them)
near = [P for P in L.points([L.bones[fn][k].name for fn in ("index", "middle") for k in (1, 2)]) if kd(P) < 0.003]
cen = sum(near, Vector((0, 0, 0))) / max(1, len(near)); nav = (kc - cen); nav -= ka * nav.dot(ka); nav.normalize()
# (the thumb opposes the fingertips more than the middle of the fingers: turned a third of the way to the palm's own way out)
nav = (nav * 0.75 - L.p * 0.25); nav -= ka * nav.dot(ka); nav.normalize()
F = kc - nav * KR
# the thumb: found, not guessed. Its first joint turns freely (a thumb's base is a saddle joint), the two beyond it
# hinge; the turn is searched for that lays the thumb's pad on the knob opposite the fingers, without passing through it
T = L.bones["thumb"]; tn = [b.name for b in T]
d2 = (Mw @ T[1].tail - Mw @ T[1].head).normalized(); h0 = d2.cross(L.p).normalized()
aim = L.K["index"] + L.p * 0.03 - Mw @ T[2].tail
if (h0.cross(d2)).dot(aim) < 0: h0 = -h0
def pose_thumb(x):
    for pb in T: pb.rotation_quaternion = (1, 0, 0, 0)
    upd()
    r = Vector(x[:3]); hinge = h0
    if r.length > 1e-6:
        L.turn(T[0], r.normalized(), r.length); hinge = Matrix.Rotation(r.length, 3, r.normalized()) @ h0
    L.turn(T[1], hinge, x[3]); L.turn(T[2], hinge, x[4])
    return hinge
TTH = [0.008]
def cost(x):
    r = Vector(x[:3])
    if r.length > math.radians(62) or not (-0.2 <= x[3] <= 1.25) or not (-0.2 <= x[4] <= 1.3): return 1e9
    hinge = pose_thumb(x)
    pts = L.points_far([tn[2]]); c = sum(pts, Vector((0, 0, 0))) / len(pts); u = c - kc
    d3 = (Mw @ T[2].tail - Mw @ T[2].head).normalized(); pad = hinge.cross(d3)
    e = (u.dot(nav) - (KR + TTH[0])) ** 2
    tr = u - nav * u.dot(nav); e += tr.dot(ka) ** 2 * 0.6 + (tr - ka * tr.dot(ka)).length_squared
    pen = min(kd(P) for P in L.points_far(tn)); e += (pen * 4) ** 2 if pen < 0 else 0
    e += 2e-5 * (1 + pad.dot(nav)) + 4e-6 * r.length_squared
    return e
# (the knob lies against the fingers' pads on its nav side, so the thumb comes onto the side facing -nav)
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
    pose_thumb(x); g = min(kd(P) for P in L.points_far([tn[2]]))
    print("THUMB round", rnd, "cost %.3e" % best, "gap mm %.2f" % (g * 1000), [round(math.degrees(v), 1) for v in x])
    if abs(g - 0.0005) < 0.0004: break
    TTH[0] -= (g - 0.0005); best = cost(x)
hinge = pose_thumb(x)
tg = lambda: min(kd(P) for P in L.points_far(tn))
g0 = tg(); hinge = pose_thumb(x); print("THUMB repeat gap mm %.2f %.2f" % (g0 * 1000, tg() * 1000))
# ease the thumb back off until its pad only presses the knob (half a millimetre into the skin), not through it
L.turn(T[0], hinge, math.radians(0.5)); sgn = 1 if tg() > g0 else -1; L.turn(T[0], hinge, math.radians(-0.5))
n = 0
while tg() < -0.0005 and n < 60: L.turn(T[0], hinge, math.radians(0.4 * sgn)); n += 1
print("THUMB eased", n, "steps, gap mm %.2f" % (tg() * 1000))
print("KNOB gaps mm", gaps(L, kd))
crank_dir = (L.f * 0.6 + L.p * 0.8).normalized()
objs = [cyl_obj("knob", k0, k1, KR, mrod), cyl_obj("arm", k1 + ka * 0.003, k1 + ka * 0.003 + crank_dir * 0.055, 0.004, mmetal, 12)]
kx = -ka; ky = (nav - kx * nav.dot(kx)).normalized(); kz = kx.cross(ky).normalized()   # (x: out from the handle's arm, as the game has the knob)
print("RIG", [round(v, 4) for row in rig.matrix_world for v in row], "parents", {pb.name: pb.parent.name for pb in [L.bones[f][0] for f in FINGERS + ["thumb"]]})
record("crank", L, kc, kx, ky, kz)
for name, d in (("palm", L.p), ("back", -L.p), ("axis", kx), ("side", kz), ("pinch", ky), ("under", -ky + kz * 0.4)):
    shoot(cam, kc, d, 0.3, os.path.join(OUT, f"g14_knob_{name}.png"))
json.dump(EXPORT, open(os.path.join(ROOT, "exports", "grips_v14.json"), "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "source", "grip_lab.blend"))
print("GRIPS DONE")
