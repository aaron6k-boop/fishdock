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



# ---------------- the model looked at: its mesh, its skeleton, its skin weights, and how it bends ----------------
OUT = os.path.join(ROOT, "renders", "verify"); os.makedirs(OUT, exist_ok=True)
H = Hand(rig, skin, "r"); H.reset()
pb = rig.pose.bones
cen = (H.W + (H.K["middle"] + H.K["ring"]) * 0.5) * 0.5 + H.f * 0.03
fd = (H.W - Mw @ pb["lowerarm_r"].head).normalized()
views = (("back", -H.p), ("palm", H.p), ("thumb", H.rad + H.p * 0.25))
print("VERIFY skin verts", len(skin.data.vertices), "polys", len(skin.data.polygons), "quads", sum(1 for p in skin.data.polygons if len(p.vertices) == 4), "tris", sum(1 for p in skin.data.polygons if len(p.vertices) == 3))
if sleeve: print("VERIFY sleeve verts", len(sleeve.data.vertices), "polys", len(sleeve.data.polygons))
print("VERIFY bones", len(rig.data.bones), "skin groups with weight", sum(1 for g in skin.vertex_groups if any(any(gg.group == g.index and gg.weight > 0.01 for gg in v.groups) for v in skin.data.vertices)))
# how many bones move each skin point, and whether every point's weights add up to one
cnt = {}; bad = 0
for v in skin.data.vertices:
    ws = [g.weight for g in v.groups if g.weight > 0.001]; cnt[len(ws)] = cnt.get(len(ws), 0) + 1
    if abs(sum(ws) - 1) > 0.02: bad += 1
print("VERIFY bones per skin point", dict(sorted(cnt.items())), "points whose weights do not add up to one:", bad)

# 1. the mesh: its edges drawn over the skin
wire = skin.copy(); wire.data = skin.data.copy(); scene.collection.objects.link(wire)
mw_ = wire.modifiers.new("wire", "WIREFRAME"); mw_.thickness = 0.00035; mw_.use_replace = True
mk = mat("wire", (0.0, 0.0, 0.0), 0.9); wire.data.materials.clear(); wire.data.materials.append(mk)
for nm, d in views: shoot(cam, cen, d, 0.42, os.path.join(OUT, f"v1_mesh_{nm}.png"))
# 2. the skeleton: each bone a stick, seen through the mesh's edges alone
skin.hide_render = True
if sleeve: sleeve.hide_render = True
mb = mat("bone", (1.0, 0.45, 0.05), 0.5); mj = mat("joint", (1.0, 0.9, 0.2), 0.4); sticks = []
for b in rig.data.bones:
    if not b.name.endswith("_r") or b.name.startswith(("thigh", "calf", "foot", "ball")): continue
    a0, a1 = Mw @ b.head_local, Mw @ b.tail_local
    if (a1 - a0).length < 1e-4: continue
    sticks.append(cyl_obj("b_" + b.name, a0, a1, 0.0022, mb, 10))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0042, location=a0, segments=12, ring_count=8); o = bpy.context.object; o.data.materials.append(mj); sticks.append(o)
for nm, d in views: shoot(cam, cen, d, 0.42, os.path.join(OUT, f"v2_skeleton_{nm}.png"))
shoot(cam, Mw @ pb["lowerarm_r"].head, -H.p + H.rad * 0.4, 1.3, os.path.join(OUT, "v2_skeleton_arm.png"))
for o in sticks: bpy.data.objects.remove(o, do_unlink=True)
bpy.data.objects.remove(wire, do_unlink=True)
skin.hide_render = False
# 3. the skin weights: how much each bone moves each point (blue none, through green, to red all)
col = skin.data.color_attributes.new("wcol", "FLOAT_COLOR", "POINT")
mwt = bpy.data.materials.new("weights"); mwt.use_nodes = True; nt = mwt.node_tree; bs = nt.nodes["Principled BSDF"]
an = nt.nodes.new("ShaderNodeAttribute"); an.attribute_name = "wcol"; an.attribute_type = "GEOMETRY"
nt.links.new(an.outputs["Color"], bs.inputs["Base Color"]); bs.inputs["Roughness"].default_value = 0.7
try: nt.links.new(an.outputs["Color"], bs.inputs["Emission Color"]); bs.inputs["Emission Strength"].default_value = 0.6
except Exception: pass
old = [m for m in skin.data.materials]; skin.data.materials.clear(); skin.data.materials.append(mwt)
def ramp(w):
    w = max(0.0, min(1.0, w))
    if w < 0.5: t = w / 0.5; return (0.0, t, 1.0 - t, 1.0)
    t = (w - 0.5) / 0.5; return (t, 1.0 - t, 0.0, 1.0)
names = [g.name for g in skin.vertex_groups]
for bn, vw in (("hand_r", "back"), ("hand_r", "palm"), ("lowerarm_twist_r", "back"), ("lowerarm_r", "back"), ("index_01_r", "back"), ("index_01_r", "palm"), ("index_02_r", "back"), ("middle_01_r", "palm"), ("thumb_01_r", "thumb"), ("thumb_02_r", "thumb"), ("pinky_01_r", "palm")):
    gi = names.index(bn) if bn in names else -1
    for v in skin.data.vertices:
        w = 0.0
        for g in v.groups:
            if g.group == gi: w = g.weight
        col.data[v.index].color = ramp(w)
    skin.data.update()
    d = dict(views)[vw]
    shoot(cam, cen - fd * (0.05 if "lowerarm" in bn else 0), d, 0.42 if "lowerarm" not in bn else 0.5, os.path.join(OUT, f"v3_weights_{bn}_{vw}.png"))
skin.data.materials.clear()
for m_ in old: skin.data.materials.append(m_)
if sleeve: sleeve.hide_render = False
# 4. how it bends: a fist, the wrist bent each way, the forearm turned
def shots(tag):
    for nm, d in views: shoot(cam, cen, d, 0.5, os.path.join(OUT, f"v4_{tag}_{nm}.png"))
shots("rest")
a0 = H.W + H.f * 0.085 + H.p * 0.016 - H.rad * 0.2; a1 = a0 + H.rad * 0.4; dist = cyl_dist(a0, a1, 0.0055)
for fn in FINGERS: close_onto(H, fn, dist, limits=(84, 100, 62))
shots("fist"); H.reset()
H.turn(H.hand, H.rad, math.radians(55)); shots("wrist_a"); H.reset()
H.turn(H.hand, H.rad, math.radians(-55)); shots("wrist_b"); H.reset()
for tag, deg in (("turn_in", 80), ("turn_out", -80)):
    H.turn(pb["lowerarm_twist_r"], fd, math.radians(deg * 0.42)); H.turn(H.hand, fd, math.radians(deg * 0.5)); shots(tag)
    pb["lowerarm_twist_r"].rotation_mode = "QUATERNION"; pb["lowerarm_twist_r"].rotation_quaternion = (1, 0, 0, 0); H.reset()
print("VERIFY DONE")
