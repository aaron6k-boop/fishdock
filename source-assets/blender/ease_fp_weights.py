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



# ---------------- the skin's weights eased round the knuckles and the thumb's web ----------------
# In a tight fist the knuckles came out angular and the web between thumb and first finger stretched flat: the skin
# there changed from one bone to the next over a single ring of points. The weights of the points round each knuckle
# and across the web are averaged with their neighbours' a few times, so the skin turns over a wider band. Nothing
# else is touched: the mesh, the bones, the maps and the sleeves are as they were.
OUT = os.path.join(ROOT, "renders", "verify"); os.makedirs(OUT, exist_ok=True)
pb = rig.pose.bones
def fist_shots(tag):
    for side in ("r",):
        H = Hand(rig, skin, side); H.reset()
        cen = (H.W + (H.K["middle"] + H.K["ring"]) * 0.5) * 0.5 + H.f * 0.03
        a0 = H.W + H.f * 0.085 + H.p * 0.016 - H.rad * 0.2; a1 = a0 + H.rad * 0.4; dist = cyl_dist(a0, a1, 0.0055)
        for fn in FINGERS: close_onto(H, fn, dist, limits=(84, 100, 62))
        for nm, d in (("back", -H.p), ("palm", H.p), ("thumb", H.rad + H.p * 0.25), ("knuckles", H.f - H.p * 0.5)):
            shoot(cam, cen, d, 0.34, os.path.join(OUT, f"{tag}_fist_{nm}.png"))
        H.reset()
fist_shots("x0")
me = skin.data; names = [g.name for g in skin.vertex_groups]; mw = skin.matrix_world
# (the exported mesh has a point for each side of every seam in its maps: points in the same place are one point of
# skin and must keep the same weights, or the skin tears along the seams as it bends)
key = {}; cl = []
for v in me.vertices:
    k = (round(v.co.x, 5), round(v.co.y, 5), round(v.co.z, 5))
    if k not in key: key[k] = len(cl); cl.append([])
    cl[key[k]].append(v.index)
cid = [0] * len(me.vertices)
for c, vs in enumerate(cl):
    for i in vs: cid[i] = c
nbs = [set() for _ in cl]
for e in me.edges:
    a, b = cid[e.vertices[0]], cid[e.vertices[1]]
    if a != b: nbs[a].add(b); nbs[b].add(a)
nb = [sorted(x) for x in nbs]
def avg(vs):
    acc = {}
    for i in vs:
        for g in me.vertices[i].groups:
            if g.weight > 1e-5: acc[g.group] = acc.get(g.group, 0.0) + g.weight / len(vs)
    return acc
W = [avg(vs) for vs in cl]
region = set()
for side in ("l", "r"):
    cs = [(Mw @ rig.data.bones[f"{f}_01_{side}"].head_local, 0.024) for f in FINGERS]
    t1, t2, i1 = (Mw @ rig.data.bones[f"{n}_{side}"].head_local for n in ("thumb_01", "thumb_02", "index_01"))
    cs += [(t2, 0.026), ((t2 + i1) * 0.5, 0.032), ((t1 + i1) * 0.5, 0.03)]
    for c, vs in enumerate(cl):
        P = mw @ me.vertices[vs[0]].co
        if any((P - cc).length < r for cc, r in cs): region.add(c)
print("WEIGHTS places eased", len(region), "of", len(cl), "(points", len(me.vertices), ")")
for it in range(5):
    new = {}
    for i in region:
        acc = {}
        for j in nb[i]:
            for g, w in W[j].items(): acc[g] = acc.get(g, 0.0) + w / len(nb[i])
        mix = {}
        for g in set(acc) | set(W[i]): mix[g] = 0.5 * W[i].get(g, 0.0) + 0.5 * acc.get(g, 0.0)
        top = sorted(mix.items(), key=lambda kv: -kv[1])[:4]; s = sum(w for _, w in top) or 1.0
        new[i] = {g: w / s for g, w in top if w / s > 0.004}
    for i, d in new.items(): W[i] = d
for c in region:
    sm = sum(W[c].values()) or 1.0
    for i in cl[c]:
        for g in skin.vertex_groups:
            try: g.remove([i])
            except Exception: pass
        for g, w in W[c].items(): skin.vertex_groups[g].add([i], w / sm, "REPLACE")
me.update()
bad = sum(1 for v in me.vertices if abs(sum(g.weight for g in v.groups) - 1) > 0.02); print("WEIGHTS points not adding up to one:", bad, "most bones on a point:", max(len([g for g in v.groups if g.weight > 0.001]) for v in me.vertices))
fist_shots("x1")
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "exports", "fp_body_v5b.glb"), export_format="GLB", export_skins=True, export_apply=True, export_image_format="WEBP", export_jpeg_quality=85, export_cameras=False, export_lights=False, export_animations=False)
print("WEIGHTS DONE", os.path.getsize(os.path.join(ROOT, "exports", "fp_body_v5b.glb")))
