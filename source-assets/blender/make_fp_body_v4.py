# FishDock: the first-person arms, fourth build, step 1: new sleeves.
# The third build's sleeves were the MakeHuman jacket's, cut off round the arm: a ragged edge for a cuff, one skin
# thick, open so you saw into them. These are made for the arm they are on: a tube lofted ring by ring along each
# arm from just above the wrist to the shoulder, an elastic cuff that turns in on itself (a lining inside, so the
# open end is cloth all the way in), cloth bunched in folds above the cuff and at the elbow, mapped in metres.
import bpy, bmesh, os, math, random
from mathutils import Vector, Matrix
ROOT = r"C:\Users\aaron\Documents\FishDock-assets"
TAG = globals().get("TAG", "f")
exec(open(os.path.join(ROOT, "scripts", "grip_lib5.py")).read())
OUT = os.path.join(ROOT, "renders", "v4"); os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "source", "people", "fp_body_bs_c.blend"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arms = bpy.data.objects["fp_arms"]; old = bpy.data.objects.get("fp_sleeve")
print("OPENED", [(o.name, o.type) for o in bpy.data.objects], "rig world", [round(v, 3) for r in rig.matrix_world for v in r])
if old: bpy.data.objects.remove(old, do_unlink=True)
# the skin's new colour and roughness maps (paint_fp_skin.py), in place of the colour carried from the MakeHuman body
for nm, fn in (("fp_skin_albedo", "fp_skin_albedo_v4e.png"), ("fp_skin_rough", "fp_skin_rough_v4e.png")):
    im = bpy.data.images[nm]; im.filepath = os.path.join(ROOT, "source", "people", fn); im.reload(); print("MAP", nm, tuple(im.size))
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode="EDIT")
for s in "lr":
    eb = rig.data.edit_bones; la = eb["lowerarm_" + s]; tw = eb.new("lowerarm_twist_" + s)
    tw.head = la.head.lerp(la.tail, 0.55); tw.tail = la.tail.copy(); tw.roll = la.roll; tw.parent = la; tw.use_deform = True
bpy.ops.object.mode_set(mode="OBJECT")
for s in "lr":
    # (the skin of the lower forearm goes with it: it is all within 9 cm of the wrist)
    gl = arms.vertex_groups.get("lowerarm_" + s); gt = arms.vertex_groups.new(name="lowerarm_twist_" + s)
    for v in arms.data.vertices:
        for gq in v.groups:
            if gq.group == gl.index and gq.weight > 0: w = gq.weight; gl.add([v.index], w * 0.3, "REPLACE"); gt.add([v.index], w * 0.7, "REPLACE"); break
Mw = rig.matrix_world
BH = {b.name: (Mw @ b.head_local, Mw @ b.tail_local) for b in rig.data.bones}
# (the skin ends 9 cm up the forearm, well inside the sleeve, on a clean line: it used to end in steps further up)
bmk = bmesh.new(); bmk.from_mesh(arms.data); kill = []
for v in bmk.verts:
    P = arms.matrix_world @ v.co; s_ = "l" if P.x > 0 else "r"; Wr, El = BH["hand_" + s_][0], BH["lowerarm_" + s_][0]
    if (P - Wr).dot((El - Wr).normalized()) > 0.092: kill.append(v)
bmesh.ops.delete(bmk, geom=kill, context="VERTS"); bmk.to_mesh(arms.data); bmk.free(); arms.data.update(); print("SKIN cut", len(kill), "left", len(arms.data.vertices))
dg = bpy.context.evaluated_depsgraph_get(); ev = arms.evaluated_get(dg); me0 = ev.to_mesh(); SK = [arms.matrix_world @ v.co for v in me0.vertices]; ev.to_mesh_clear()
UVS = 7.0   # (the game lays its weave three times across one unit: about 5 cm a repeat)
NSEG = 36; STEP = 0.008; CUFF0 = 0.034; CUFFW = 0.026
for m_ in list(bpy.data.materials):
    if m_.name.startswith("jacket"): m_.name = "old_" + m_.name
jm = bpy.data.materials.new("jacket"); jm.use_nodes = True
bs = jm.node_tree.nodes["Principled BSDF"]; bs.inputs["Base Color"].default_value = (0.05, 0.07, 0.16, 1); bs.inputs["Roughness"].default_value = 0.8
mesh = bpy.data.meshes.new("fp_sleeve"); slv = bpy.data.objects.new("fp_sleeve", mesh); bpy.context.scene.collection.objects.link(slv)
bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); WT = {}
def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def r_base(d, Lf):
    pts = [(CUFF0, 0.0365), (CUFF0 + CUFFW, 0.037), (CUFF0 + CUFFW + 0.03, 0.0425), (0.13, 0.048), (Lf, 0.056), (Lf + 0.12, 0.062), (Lf + 0.26, 0.068)]
    for (d0, r0), (d1, r1) in zip(pts, pts[1:]):
        if d <= d1: t = max(0, (d - d0) / (d1 - d0)); return r0 + (r1 - r0) * t
    return pts[-1][1]
DOME = []
for s in "lr":
    random.seed(7 if s == "l" else 11)
    Wr, El, Sh = BH["hand_" + s][0], BH["lowerarm_" + s][0], BH["upperarm_" + s][0]
    Lf, Lu = (El - Wr).length, (Sh - El).length; top = Lf + Lu - 0.02
    # the arm's line, the corner at the elbow rounded
    def centre(d):
        a = (El - Wr).normalized(); b = (Sh - El).normalized(); R = 0.05
        if d < Lf - R: return Wr + a * d, a
        if d > Lf + R: return El + b * (d - Lf), b
        t = (d - (Lf - R)) / (2 * R); p0 = Wr + a * (Lf - R); p2 = El + b * R
        P = p0 * (1 - t) ** 2 + El * 2 * t * (1 - t) + p2 * t * t; T = ((El - p0) * (1 - t) + (p2 - El) * t).normalized(); return P, T
    # a frame carried up the arm: n0 across the back of the wrist
    acr = (BH["index_01_" + s][0] - BH["pinky_01_" + s][0]).normalized()
    folds = []
    for dd, amp in [(0.072, 0.003), (0.092, 0.0032), (0.115, 0.003), (0.14, 0.0025), (0.17, 0.002), (Lf - 0.05, 0.004), (Lf - 0.022, 0.0055), (Lf + 0.004, 0.006), (Lf + 0.03, 0.005), (Lf + 0.06, 0.0035), (Lf + 0.11, 0.003), (Lf + 0.17, 0.003)]:
        folds.append((dd + random.uniform(-0.004, 0.004), amp * random.uniform(0.8, 1.2), random.uniform(0.007, 0.011), random.uniform(0, 6.283), random.choice([1, 1, 2]), random.uniform(0, 6.283)))
    def fold(d, th):
        f = 0
        for dd, amp, w, ph, m, th0 in folds:
            x = (d - dd - 0.006 * math.sin(th * m + ph)) / w; f += amp * math.exp(-x * x) * (0.62 + 0.38 * math.cos(th - th0))
        return f
    rings = []; d = CUFF0; ds = []
    while d < top: ds.append(d); d += STEP
    prevN = None
    def ring_at(d, shrink=0.0, uoff=0.0, inner=False):
        global prevN
        C, T = centre(d)
        n = acr - T * acr.dot(T) if prevN is None else prevN - T * prevN.dot(T); n.normalize(); prevN = n.copy(); b = T.cross(n)
        # the skin here, if the arm's skin reaches this far: the sleeve stands clear of it all the way round
        near = [P for P in SK if abs((P - C).dot(T)) < 0.007 and ((P - C) - T * (P - C).dot(T)).length < 0.075]
        if len(near) > 12:
            cs = sum(near, Vector((0, 0, 0))) / len(near); cs = C + (cs - C) - T * (cs - C).dot(T)
            C = C.lerp(cs, 1 - smooth(0.09, 0.15, d))
        out = []
        for k in range(NSEG):
            th = 2 * math.pi * k / NSEG; u = n * math.cos(th) + b * math.sin(th)
            r = r_base(d, Lf)
            if not inner and d > CUFF0 + CUFFW: r += fold(d, th)
            if d <= CUFF0 + CUFFW: r += 0.0008 * math.cos((d - CUFF0) / CUFFW * 2 * math.pi * 3)   # (the elastic's ribs)
            if len(near) > 12: r = max(r, max((P - C).dot(u) for P in near) + (0.0045 if d > CUFF0 + CUFFW else 0.003))
            r -= shrink
            v = bm.verts.new(C + u * r)
            # which bones move it: the forearm's to the elbow, the two blended across it
            wu = smooth(Lf - 0.055, Lf + 0.055, d); WT[v] = {"lowerarm_" + s: 1 - wu, "upperarm_" + s: wu}
            out.append((v, th * r_base(d, Lf), d + uoff))
        return out
    prevN = None
    rows = [ring_at(d) for d in ds]
    # (the shoulder's end closed over in a dome: looking down your own arm you saw into the open top of the sleeve)
    for a_ in (0.35, 0.7, 1.0, 1.25, 1.45):
        rows.append(ring_at(top + 0.075 * math.sin(a_), r_base(top, Lf) * (1 - math.cos(a_)), 0.0, True))
    DOME.append([q[0] for q in rows[-1]])
    # the cuff turned in on itself: its edge, then a lining back up inside
    prevN = None
    lip = [ring_at(CUFF0 - 0.0015, 0.0018, 0.0, True), ring_at(CUFF0 + 0.004, 0.0034, -0.01, True), ring_at(CUFF0 + 0.03, 0.0036, -0.04, True), ring_at(CUFF0 + 0.07, 0.003, -0.08, True)]
    strips = [list(reversed(lip)) + rows]
    for rs in strips:
        for a, b2 in zip(rs, rs[1:]):
            for k in range(NSEG):
                k2 = (k + 1) % NSEG
                quad = [a[k], a[k2], b2[k2], b2[k]]
                try: f = bm.faces.new([q[0] for q in quad])
                except ValueError: continue
                f.smooth = True
                for lp, q in zip(f.loops, quad):
                    uu = q[1] if not (k2 == 0 and q in (a[k2], b2[k2])) else 2 * math.pi * r_base(q[2], Lf)
                    lp[uvl].uv = (uu * UVS, q[2] * UVS)
for ring_ in DOME:
    try: f_ = bm.faces.new(ring_); f_.smooth = True
    except ValueError: pass
TABS = []
for s in "lr":
    Wr, El = BH["hand_" + s][0], BH["lowerarm_" + s][0]; a_ = (El - Wr).normalized()
    acr = (BH["index_01_" + s][0] - BH["pinky_01_" + s][0]).normalized(); acr = (acr - a_ * acr.dot(a_)).normalized()
    sgn = 1 if s == "r" else -1
    back = a_.cross(acr) * sgn                        # out of the back of the wrist
    Hh = Hand(rig, arms, s); back = -Hh.p - a_ * (-Hh.p).dot(a_); back.normalize(); side = a_.cross(back)
    dmid = CUFF0 + CUFFW * 0.5; C = Wr + a_ * dmid
    near = [P for P in SK if abs((P - C).dot(a_)) < 0.007 and ((P - C) - a_ * (P - C).dot(a_)).length < 0.075]
    cs = sum(near, Vector((0, 0, 0))) / len(near); C = C + (cs - C) - a_ * (cs - C).dot(a_)
    # (laid on the cuff's own surface: a strip of quads following the cuff round, 16 mm wide, 62 mm long, 1.6 mm proud)
    def cuff_r(u): return max(0.037, max((P - C).dot(u) for P in near) + 0.003)
    cols = []
    for j in range(9):
        th = (-0.85 + 1.7 * j / 8); u = back * math.cos(th) + side * math.sin(th); r = cuff_r(u) + 0.0018
        cols.append((u, r))
    half = 0.008
    for face_r, zs in ((0.0, (-half, half)),):
        top = [[bm.verts.new(C + u * (r) + a_ * z) for z in zs] for u, r in cols]
        bot = [[bm.verts.new(C + u * (r - 0.0022) + a_ * z) for z in zs] for u, r in cols]
        for row in top + bot:
            for v in row: WT[v] = {"lowerarm_" + s: 1.0}
        def quad(vs, uv0):
            try: f = bm.faces.new(vs)
            except ValueError: return
            f.smooth = False
            for lp, (uu, vv) in zip(f.loops, uv0): lp[uvl].uv = (uu, vv)
        for j in range(8):
            u0, u1 = j * 0.008, (j + 1) * 0.008
            quad([top[j][0], top[j + 1][0], top[j + 1][1], top[j][1]], [(u0, 0.9), (u1, 0.9), (u1, 0.916), (u0, 0.916)])
            quad([bot[j][0], top[j][0], top[j][1], bot[j][1]][::1] if False else [top[j][0], bot[j][0], bot[j + 1][0], top[j + 1][0]], [(u0, 0.9), (u0, 0.898), (u1, 0.898), (u1, 0.9)])
            quad([top[j][1], top[j + 1][1], bot[j + 1][1], bot[j][1]], [(u0, 0.916), (u1, 0.916), (u1, 0.918), (u0, 0.918)])
        quad([top[0][0], top[0][1], bot[0][1], bot[0][0]], [(0, 0.9), (0, 0.916), (0.002, 0.916), (0.002, 0.9)])
        quad([top[8][0], bot[8][0], bot[8][1], top[8][1]], [(0.064, 0.9), (0.066, 0.9), (0.066, 0.916), (0.064, 0.916)])
bm.normal_update()
bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f.smooth])
# (faces the right way out: the first ring's face normal should point away from the arm's line)
bm.faces.ensure_lookup_table()
bm.to_mesh(mesh)
names = sorted({n for w in WT.values() for n in w}); vg = {n: slv.vertex_groups.new(name=n) for n in names}
bm.verts.ensure_lookup_table()
for v, w in WT.items():
    for n, x in w.items():
        if x > 1e-4: vg[n].add([v.index], x, "REPLACE")
bm.free()
mesh.materials.append(jm)
# outward normals: check one outer face against its ring's centre
import numpy as np
mesh.update()
slv.parent = rig; slv.matrix_parent_inverse = rig.matrix_world.inverted()
am = slv.modifiers.new("arm", "ARMATURE"); am.object = rig
# is it inside out? (an outer vertex's normal should point away from the forearm's line)
def outward_ok():
    s = "r"; Wr, El = BH["hand_" + s][0], BH["lowerarm_" + s][0]; a = (El - Wr).normalized(); good = bad = 0
    for p in mesh.polygons:
        c = slv.matrix_world @ p.center
        if c.x > 0: continue
        dd = (c - Wr).dot(a)
        if 0.12 < dd < 0.2:
            rad = (c - Wr) - a * dd
            if (slv.matrix_world.to_3x3() @ p.normal).dot(rad) > 0: good += 1
            else: bad += 1
    return good, bad
g, b = outward_ok(); print("OUTWARD", g, b)
if b > g:
    bmf = bmesh.new(); bmf.from_mesh(mesh); bmesh.ops.reverse_faces(bmf, faces=bmf.faces); bmf.to_mesh(mesh); bmf.free(); mesh.update(); print("flipped", outward_ok())
print("SLEEVE verts", len(mesh.vertices), "faces", len(mesh.polygons))
win = bpy.context.window_manager.windows[0] if bpy.context.window_manager.windows else None
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "source", "people", f"fp_body_v4{TAG}.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "exports", f"fp_body_v4{TAG}.glb"), export_format="GLB", export_skins=True, export_apply=True, export_image_format="WEBP", export_jpeg_quality=85, export_cameras=False, export_lights=False, export_animations=False)
print("EXPORTED kB", os.path.getsize(os.path.join(ROOT, "exports", f"fp_body_v4{TAG}.glb")) // 1000)
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene; cam = studio(sc)
H = Hand(rig, arms, "r")
ctr = H.W - H.f * 0.04
for name, d in (("back", -H.p), ("palm", H.p), ("thumbside", H.rad), ("cuff_in", H.f * 1.0 - H.p * 0.35 + H.rad * 0.2), ("three", -H.p + H.rad * 0.7 + H.f * 0.5)):
    shoot(cam, ctr, d, 0.5, os.path.join(OUT, f"v4{TAG}_{name}.png"))
shoot(cam, H.W - H.f * 0.25, -H.p + H.rad * 0.4, 1.0, os.path.join(OUT, f"v4{TAG}_arm.png"))
print("V4 DONE")
