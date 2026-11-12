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


# ---------------- the right hand on the rod at the reel seat: on the game's own rod and reel ----------------
# The tackle here is the game's: every triangle of the handle, reel seat and reel within 30 cm of the seat, written
# out by the game in the seat's own frame (x to your left, y up, z to the tip; seat_geo.json). The hand closes on that.
from mathutils.bvhtree import BVHTree
GEO = json.load(open(os.path.join(ROOT, "source", "tackle", "seat_geo.json")))
PHI = math.radians(globals().get("PHI_DEG", 12)); ULNAR = math.radians(globals().get("ULNAR_DEG", 35)); TAG = globals().get("TAG", "g")
H = Hand(rig, skin, "r"); H.reset()
# A rod is held like a handshake, not like a hammer: the palm against the right of the handle facing left, the handle
# lying across the palm on a slant from the heel of the hand to the root of the first finger, the thumb's side to the
# tip. The fingers go down the right side and round underneath, the reel's stem between the second and third.
sz = (H.rad * math.cos(PHI) + H.f * math.sin(PHI)).normalized()      # to the tip
sx = H.p.copy()                                                      # to your left: the way the palm faces
sy = sz.cross(sx).normalized()                                       # up
for fn, deg in (("index", 6), ("middle", 5), ("ring", -6), ("pinky", -9)): spread(H, H.bones[fn][0], deg)
g = sum(((Mw @ H.bones[fn][0].head + Mw @ H.bones[fn][0].tail) * 0.5 for fn in ("middle", "ring")), Vector((0, 0, 0))) * 0.5
palm_len = ((H.K["middle"] + H.K["ring"]) * 0.5 - H.W).length
def tackle(O, held=False):
    # (held: only what the hand closes round, the handle, the seat and the reel's foot and stem; the reel's body hangs
    # below, where straight fingers reach before they have curled)
    vs = []; ts = []
    for m in GEO["meshes"]:
        b = len(vs); v = m["v"]
        vs += [O + sx * v[i] + sy * v[i + 1] + sz * v[i + 2] for i in range(0, len(v), 3)]
        for i in range(0, len(m["t"]), 3):
            tri = (m["t"][i], m["t"][i + 1], m["t"][i + 2])
            if held and min(v[k * 3 + 1] for k in tri) < -0.046: continue
            ts.append((b + tri[0], b + tri[1], b + tri[2]))
    return vs, ts
def dist_of(O, held=True):
    vs, ts = tackle(O, held); bvh = BVHTree.FromPolygons(vs, ts)
    def d(P):
        loc, nrm, idx, dd = bvh.find_nearest(P)
        # (inside or out, by the shapes themselves: the handle is a round bar on the axis, the reel's foot and stem
        # two blocks under it. The triangles' own facing can't say, the reel being many open pieces)
        q = P - O; x, y, z = q.dot(sx), q.dot(sy), q.dot(sz)
        inside = math.hypot(x, y) < 0.0148 or (abs(x) < 0.0048 and -0.046 < y < -0.012 and -0.013 < z < 0.003) or (abs(x) < 0.0052 and -0.024 < y < -0.012 and -0.025 < z < 0.025)
        if not held and not inside: inside = (P - loc).dot(nrm) < 0 and y < -0.046
        return -dd if inside else dd
    return d
# the handle laid in the palm: slid in from the palm's side until the palm's skin touches it
palm_pts = H.points(["hand_r"])
best = None
for k in range(80):
    off = 0.06 - k * 0.0005
    c = H.W + H.f * (palm_len - globals().get("UP", 0.031)) + H.p * off
    O = c + sz * ((g - c).dot(sz) + 0.005)             # (the stem, 5 mm behind the seat's middle, between the second and third fingers)
    O = O + sy * 0.0                                    # on the rod's axis
    d = dist_of(O); m = min(d(P) for P in palm_pts)
    if m < 0.0004: break
    best = (off, O, m)
off, O, m = best; dist = dist_of(O); print("SEAT palm to rod axis %.1f mm, palm gap %.2f mm" % (off * 1000, m * 1000))
ang = {}
for fn in ("middle", "ring", "index", "pinky"):
    ang[fn] = close_onto(H, fn, dist, step=1.0, gap=(0.0002 if fn in ("middle", "ring") else 0.0008))
print("SEAT closed", ang); print("SEAT gaps mm", gaps(H, dist))
# the thumb along the top of the handle, ahead of the seat
kct = O + sz * 0.045; nav = (sy * 0.92 + sx * 0.38).normalized(); KRt = 0.0163
fit_thumb(H, kct, sz, nav, KRt, dist, "SEAT")
print("SEAT gaps mm", gaps(H, dist))
print("SEAT gaps to the whole reel mm", gaps(H, dist_of(O, False)))
record("seat", H, O, sx, sy, sz)
# where the forearm comes from: the wrist dropped towards the little finger (as it is with a rod in the hand) and a
# little back, so the forearm lies nearer the rod's own line
fd = (H.f * math.cos(ULNAR) + H.rad * math.sin(ULNAR)).normalized(); fd = (fd + H.p * 0.12).normalized()
el = -fd; EXPORT["seat"]["elbow"] = [round(el.dot(sx), 4), round(el.dot(sy), 4), round(el.dot(sz), 4)]
print("SEAT wrist", EXPORT["seat"]["Ph"], "elbow from wrist", EXPORT["seat"]["elbow"])
vs, ts = tackle(O); me = bpy.data.meshes.new("tackle"); me.from_pydata([tuple(v) for v in vs], [], ts); me.update(); tk = bpy.data.objects.new("tackle", me); scene.collection.objects.link(tk); me.materials.append(mrod)
for name, d in (("eye", -sz * 0.75 + sy * 0.62 + sx * 0.25), ("right", -sx), ("left", sx), ("below", -sy + sz * 0.15), ("above", sy), ("front", sz + sy * 0.25), ("back", -sz + sy * 0.15), ("underleft", -sy * 0.8 + sx * 0.6)):
    shoot(cam, O + sy * 0.0, d, 0.5, os.path.join(OUT, f"s{TAG}_seat_{name}.png"))
json.dump(EXPORT, open(os.path.join(ROOT, "exports", f"grip_seat_{TAG}.json"), "w"), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "source", f"grip_seat_{TAG}.blend"))
print("SEAT DONE")
