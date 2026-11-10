# FishDock: the first-person arms, third build. The hands are no longer MakeHuman's: they are the hands of Blender
# Studio's realistic male body (Human Base Meshes 1.1.0, CC0), with its sculpted knuckles, tendons and nails, on the
# angler's skeleton with the finger joints moved to where this hand's are. The sleeves are the field jacket's, as in
# the second build (make_fp_body_hd.py), and the skin's colour is the angler's own, carried across.
import bpy, bmesh, os, glob, math
import numpy as np
from mathutils import Vector
ROOT = "C:/Users/aaron/Documents/FishDock-assets"
TAG = globals().get("TAG", "")
JACKET = globals().get("JACKET", "male_casualsuit05")
if "bl_ext.blender_org.mpfb" not in bpy.context.preferences.addons: bpy.ops.preferences.addon_enable(module="bl_ext.blender_org.mpfb")
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
DATA = LocationService.get_user_data()
bpy.ops.wm.open_mainfile(filepath=ROOT + "/source/people/angler_man.blend")
body = bpy.data.objects["angler_man"]; rig = bpy.data.objects["angler_man.rig"]
ARM = [f"{n}_{s}" for s in "lr" for n in ["upperarm", "lowerarm", "hand"] + [f"{f}_{i:02d}" for f in ["thumb", "index", "middle", "ring", "pinky"] for i in (1, 2, 3)]]
B = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
idx = {vg.name: vg.index for vg in body.vertex_groups}
G = lambda names: {idx[k] for k in names if k in idx}
armIdx = G(ARM); handIdx = G([k for k in ARM if not k.startswith(("upperarm", "lowerarm"))])
def along(co):  # how far up the forearm from the wrist (m), on the vertex's own side
    s = "l" if co.x > 0 else "r"; wrist = B["hand_" + s][0]; elbow = B["lowerarm_" + s][0]; ax = (elbow - wrist).normalized()
    return (co - wrist).dot(ax), s

# ---- the skin: the hands and the first 9 cm of forearm (the rest is under the sleeve), before the jacket hides it ----
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
arms = bpy.data.objects.new("fp_arms", me); bpy.context.scene.collection.objects.link(arms); arms.matrix_world = body.matrix_world.copy()
for vg in body.vertex_groups: arms.vertex_groups.new(name=vg.name)
bm = bmesh.new(); bm.from_mesh(me); dl = bm.verts.layers.deform.verify(); kill = []
for v in bm.verts:
    d = v[dl]; w = sum(wt for g, wt in d.items() if g in armIdx); wh = sum(wt for g, wt in d.items() if g in handIdx)
    t, s = along(v.co)
    if w < 0.6 or (wh < 0.5 and t > 0.09): kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(me); bm.free()
print("skin verts", len(me.vertices))

# ---- the jacket, fitted by MPFB; its sleeves cut off at the shoulder ----
before = set(bpy.data.objects)
win = bpy.context.window_manager.windows[0]; area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0]); region = next((r for r in area.regions if r.type == "WINDOW"), None)
with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region):
    HumanService.add_mhclo_asset(glob.glob(os.path.join(DATA, "clothes", JACKET, "*.mhclo"))[0], body, asset_type="Clothes", subdiv_levels=0, material_type="MAKESKIN")
jk = next(o for o in bpy.data.objects if o not in before and o.type == "MESH")
print("jacket", jk.name, len(jk.data.vertices), "groups", len(jk.vertex_groups), [g.name for g in jk.vertex_groups][:12], "mods", [(m.type, m.name) for m in jk.modifiers])
dg = bpy.context.evaluated_depsgraph_get()
jm = jk.data.copy(); slv = bpy.data.objects.new("fp_sleeve", jm); bpy.context.scene.collection.objects.link(slv); slv.matrix_world = jk.matrix_world.copy()
for vg in jk.vertex_groups: slv.vertex_groups.new(name=vg.name)
jidx = {vg.name: vg.index for vg in jk.vertex_groups}; jarm = {jidx[k] for k in ARM if k in jidx}
bm = bmesh.new(); bm.from_mesh(jm); dl = bm.verts.layers.deform.verify(); mw = slv.matrix_world; kill = []
for v in bm.verts:
    co = mw @ v.co; s = "l" if co.x > 0 else "r"
    sh = B["upperarm_" + s][0]; ax = (B["lowerarm_" + s][0] - sh).normalized(); t = (co - sh).dot(ax); rad = ((co - sh) - ax * t).length
    w = sum(wt for g, wt in v[dl].items() if g in jarm)
    # (a sleeve: on the arm's side of the shoulder, close round the arm's own line, and moved by the arm's bones)
    if t < 0.015 or rad > 0.16 or w < 0.3: kill.append(v)
bmesh.ops.delete(bm, geom=kill, context="VERTS")
# (only the two big pieces: buttons and tabs cut loose from the body of the jacket go)
bm.verts.ensure_lookup_table(); seen = set(); parts = []
for v0 in bm.verts:
    if v0.index in seen: continue
    stack = [v0]; part = []; seen.add(v0.index)
    while stack:
        v = stack.pop(); part.append(v)
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in seen: seen.add(o.index); stack.append(o)
    parts.append(part)
parts.sort(key=len, reverse=True); print("sleeve pieces", [len(p) for p in parts[:8]])
for part in parts:
    if len(part) < 60: bmesh.ops.delete(bm, geom=part, context="VERTS")
for f in bm.faces: f.smooth = True
# the part of the jacket's maps the sleeves use
uvl = bm.loops.layers.uv.verify(); us = [lp[uvl].uv.x for f in bm.faces for lp in f.loops]; vs = [lp[uvl].uv.y for f in bm.faces for lp in f.loops]
pad = 0.012; u0, u1, v0, v1 = max(0, min(us) - pad), min(1, max(us) + pad), max(0, min(vs) - pad), min(1, max(vs) + pad)
for f in bm.faces:
    for lp in f.loops: lp[uvl].uv = ((lp[uvl].uv.x - u0) / (u1 - u0), (lp[uvl].uv.y - v0) / (v1 - v0))
# the cuff drawn in round the wrist, as a fastened cuff sits (the jacket's hangs open like a bell, with a slit): the last
# 9 cm of each sleeve brought in towards the arm's own line, most at the edge
for v in bm.verts:
    co = mw @ v.co; t, s = along(co)
    if t < 0.09:
        wrist = B["hand_" + s][0]; ax = (B["lowerarm_" + s][0] - wrist).normalized(); c = wrist + ax * t; k = 0.7 + 0.3 * max(0.0, min(1.0, (t + 0.03) / 0.12)) ** 1.5
        v.co = mw.inverted() @ (c + (co - c) * k)
# (where the cuff is: how far up the forearm its lowest edge sits, for the game's cut of the skin under it)
cuff = min(along(mw @ v.co)[0] for v in bm.verts)
bm.to_mesh(jm); bm.free()
print("sleeve verts", len(jm.vertices), "uv box", [round(x, 3) for x in (u0, u1, v0, v1)], "cuff at", round(cuff, 4), "m up from the wrist")

def crop(img, size, grey=False, ao=None):
    W, H = img.size; a = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    c = a[int(v0 * H):int(v1 * H), int(u0 * W):int(u1 * W)].copy()
    if grey:
        lum = c[..., 0] * 0.3 + c[..., 1] * 0.55 + c[..., 2] * 0.15
        if ao is not None:
            AW, AH = ao.size; b = np.array(ao.pixels[:], dtype=np.float32).reshape(AH, AW, 4)[int(v0 * AH):int(v1 * AH), int(u0 * AW):int(u1 * AW), 0]
            yy = (np.arange(c.shape[0]) * b.shape[0] / c.shape[0]).astype(int); xx = (np.arange(c.shape[1]) * b.shape[1] / c.shape[1]).astype(int)
            lum = lum * (0.5 + 0.5 * b[yy][:, xx])
        lum = np.clip(lum / max(1e-4, np.percentile(lum, 92)), 0, 1)
        c[..., 0] = c[..., 1] = c[..., 2] = lum; c[..., 3] = 1
    out = bpy.data.images.new(img.name.split(".")[0] + "_sleeve", c.shape[1], c.shape[0], alpha=False); out.pixels = c.ravel(); out.scale(size[0], size[1])
    out.filepath_raw = f"{ROOT}/source/people/{out.name}.png"; out.file_format = "PNG"; out.save(); return out
jmat = jk.data.materials[0]; imgs = {}
for n in jmat.node_tree.nodes:
    if n.type == "TEX_IMAGE" and n.image: imgs[n.name] = n.image; print("jacket image", n.name, n.image.name, tuple(n.image.size))
pick = lambda *keys: next((im for k, im in imgs.items() for key in keys if key in (k + " " + im.name).lower()), None)
dif, nor, aoi = pick("diffuse"), pick("normal", "bump"), pick("ao", "occlusion")
if aoi is None:
    p = glob.glob(os.path.join(DATA, "clothes", JACKET, "*_ao.png"))
    if p: aoi = bpy.data.images.load(p[0])
asp = ((u1 - u0), (v1 - v0)); size = (1024, max(256, int(round(1024 * asp[1] / asp[0] / 4)) * 4)) if asp[0] >= asp[1] else (max(256, int(round(1024 * asp[0] / asp[1] / 4)) * 4), 1024)
mat = bpy.data.materials.new("jacket"); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.8
if dif:
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = crop(dif, size, grey=True, ao=aoi); nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
if nor:
    nor.colorspace_settings.name = "Non-Color"; t = nt.nodes.new("ShaderNodeTexImage"); t.image = crop(nor, (size[0] * 2, size[1] * 2)); t.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
print("maps", dif and dif.name, nor and nor.name, aoi and aoi.name, "sleeve map size", size)
jm.materials.clear(); jm.materials.append(mat)
for p in jm.polygons: p.material_index = 0


# =====================================================================================================================
# ---- the hands: Blender Studio's realistic male body (Human Base Meshes 1.1.0, CC0), its hands and wrists ----
# The body has no skeleton. Its left hand's joints are found from its shape (the fingertips are the points furthest
# along the skin from a ring round the forearm; each finger is the surface beyond the web where it joins its
# neighbour; joints are set along its middle line at the proportions of a real hand's bones, the knuckle a quarter of
# the visible finger's length back into the palm from the web). Its finest sculpted level is baked to a normal map for
# its second level, which is the mesh the game draws. The hand is then set on the angler's wrist, its fingers laid out
# straight as the angler's are at rest (the game's grips are worked out from that pose), the angler's finger bones
# moved to the new hand's joints, and the angler's skin colour carried across from his own hand lying over it.
import heapq
from mathutils import Matrix, Quaternion
from mathutils.kdtree import KDTree
BUNDLE = ROOT + "/downloads/blender_human_base_meshes/human-base-meshes-bundle-v1.1.0/human_base_meshes_bundle.blend"
with bpy.data.libraries.load(BUNDLE) as (src_l, dst_l): dst_l.objects = ["GEO-body_male_realistic"]
bsb = dst_l.objects[0]; scn = bpy.context.scene; scn.collection.objects.link(bsb)
def at_level(lv):
    for m in bsb.modifiers:
        if m.type == "MULTIRES": m.levels = lv
    dgl = bpy.context.evaluated_depsgraph_get(); dgl.update()
    m2 = bpy.data.meshes.new_from_object(bsb.evaluated_get(dgl), preserve_all_data_layers=True, depsgraph=dgl); m2.transform(bsb.matrix_world); return m2
low = at_level(1); V = [v.co.copy() for v in low.vertices]; nV = len(V); print("hand source: level 1 points", nV)
nbr = [[] for _ in range(nV)]
for e in low.edges:
    a, c = e.vertices; w = (V[a] - V[c]).length; nbr[a].append((c, w)); nbr[c].append((a, w))
bcx = (min(p.x for p in V) + max(p.x for p in V)) / 2
tip0 = min([i for i, p in enumerate(V) if p.x - bcx > 0.3 and 0.6 < p.z < 0.95], key=lambda i: V[i].z)
def dijk(srcs, limit):
    d = {i: 0.0 for i in srcs}; h = [(0.0, i) for i in srcs]; heapq.heapify(h)
    while h:
        di, i = heapq.heappop(h)
        if di > d.get(i, 1e9): continue
        for j, w in nbr[i]:
            nd = di + w
            if nd < limit and nd < d.get(j, 1e9): d[j] = nd; heapq.heappush(h, (nd, j))
    return d
d0 = dijk([tip0], 0.46); ring = [i for i, d in d0.items() if 0.40 < d < 0.44]; S = {i for i, d in d0.items() if d <= 0.44}
g = {i: d for i, d in dijk(ring, 0.6).items() if i in S}
order = sorted(g, key=lambda i: -g[i]); par = {}; birth = {}; mem = {}; events = []
def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for i in order:
    par[i] = i; birth[i] = g[i]; mem[i] = [i]
    for j, _ in nbr[i]:
        if j in par:
            a, c = find(i), find(j)
            if a == c: continue
            if birth[a] < birth[c]: a, c = c, a
            if birth[c] - g[i] > 0.025 and birth[a] - g[i] > 0.025: events.append((g[i], a, c, list(mem[a]), list(mem[c])))
            par[c] = a; mem[a].extend(mem[c])
fing = {}
for lvl, a, c, ma, mc in events:
    for r0, mm in ((a, ma), (c, mc)):
        if r0 not in fing: fing[r0] = (lvl, mm)
assert len(fing) == 5, f"expected five fingers, found {len(fing)}"
def slices(mm, lo, step=0.006):
    bins = {}
    for i in mm:
        k = int((g[i] - lo) / step)
        if k >= 0: bins.setdefault(k, []).append(i)
    out = []
    for k in sorted(bins):
        if len(bins[k]) < 5: continue
        c = sum((V[i] for i in bins[k]), Vector()) / len(bins[k]); out.append((c, sum((V[i] - c).length for i in bins[k]) / len(bins[k])))
    return out
def at_frac(line, f):
    tot = sum((line[k + 1] - line[k]).length for k in range(len(line) - 1)); s = tot * f; acc = 0.0
    for k in range(len(line) - 1):
        seg = (line[k + 1] - line[k]).length
        if acc + seg >= s: return line[k].lerp(line[k + 1], (s - acc) / max(seg, 1e-9))
        acc += seg
    return line[-1].copy()
arm_sl = slices(list(g), 0.0, 0.003); lvl_min = min(l for l, _ in fing.values()); idxs = [k for k in range(len(arm_sl)) if 0.07 < k * 0.003 < lvl_min - 0.03]
rad = [arm_sl[k][1] for k in idxs]; sm = [sum(rad[max(0, q - 3):q + 4]) / len(rad[max(0, q - 3):q + 4]) for q in range(len(rad))]
wk = idxs[sm.index(min(sm))]; wristB = arm_sl[wk][0]; g_wrist = wk * 0.003; foreB = (wristB - arm_sl[max(0, wk - 30)][0]).normalized()
info = []
for r0, (lvl, mm) in fing.items():
    line = [c for c, _ in slices(mm, lvl)]; tipv = max(mm, key=lambda i: g[i]); line.append(V[tipv])
    info.append({"lvl": lvl, "line": line, "L": g[tipv] - lvl, "dir": (at_frac(line, 0.3) - line[0]).normalized(), "root": line[0], "tip": V[tipv]})
info.sort(key=lambda f: f["lvl"]); thumbI = info[0]; rest4 = info[1:]
handdirB = (sum((f["root"] for f in rest4), Vector()) / 4 - wristB).normalized()
acrB = thumbI["root"] - wristB; acrB = (acrB - handdirB * acrB.dot(handdirB)).normalized()
rest4.sort(key=lambda f: -(f["root"] - wristB).dot(acrB)); FN = ["index", "middle", "ring", "pinky"]; JB = {}
for nm, f in zip(FN, rest4): JB[nm] = [f["root"] - f["dir"] * (0.27 * f["L"]), at_frac(f["line"], 0.36), at_frac(f["line"], 0.72), f["tip"]]
JB["thumb"] = [wristB + (thumbI["root"] - wristB) * 0.3, thumbI["root"] - thumbI["dir"] * (0.05 * thumbI["L"]), at_frac(thumbI["line"], 0.52), thumbI["tip"]]
for nm in FN + ["thumb"]: print("new hand", nm, "bones (cm)", [round((JB[nm][k + 1] - JB[nm][k]).length * 100, 2) for k in range(3)])
print("new hand: wrist to middle tip", round((JB["middle"][3] - wristB).length, 4), "across the knuckles", round((JB["index"][0] - JB["pinky"][0]).length, 4))

# ---- the game mesh (level 1) and the sculpt (level 3) of the hand and the first 11 cm of forearm ----
keep = {i for i in g if g[i] > g_wrist - 0.11}
def piece(me_src, keepset, name):
    bmq = bmesh.new(); bmq.from_mesh(me_src); bmesh.ops.delete(bmq, geom=[v for v in bmq.verts if v.index not in keepset], context="VERTS")
    m3 = bpy.data.meshes.new(name); bmq.to_mesh(m3); bmq.free(); ob = bpy.data.objects.new(name, m3); scn.collection.objects.link(ob)
    for pl in m3.polygons: pl.use_smooth = True
    return ob
lo_ob = piece(low, keep, "bs_hand_low")
high = at_level(3); kd = KDTree(len(keep)); kl = sorted(keep)
for q, i in enumerate(kl): kd.insert(V[i], q)
kd.balance(); lim = 0.012
hk = {v.index for v in high.vertices if kd.find(v.co)[2] < lim}
hi_ob = piece(high, hk, "bs_hand_high"); print("game mesh points", len(lo_ob.data.vertices), "sculpt points", len(hi_ob.data.vertices))
bpy.data.objects.remove(bsb, do_unlink=True)
# its own sheet: the hand's pieces of the body's UV map laid out to fill a square
def islands(bmq, Lq):
    seen = set(); out = []
    for f0 in bmq.faces:
        if f0.index in seen: continue
        stack = [f0]; isl = []; seen.add(f0.index)
        while stack:
            f = stack.pop(); isl.append(f)
            for lp in f.loops:
                a, b2 = lp[Lq].uv, lp.link_loop_next[Lq].uv
                for ol in lp.edge.link_loops:
                    gq = ol.face
                    if gq.index in seen: continue
                    c, d = ol[Lq].uv, ol.link_loop_next[Lq].uv
                    if ((a - d).length < 1e-5 and (b2 - c).length < 1e-5) or ((a - c).length < 1e-5 and (b2 - d).length < 1e-5): seen.add(gq.index); stack.append(gq)
        out.append(isl)
    return out
lm = lo_ob.data; bmq = bmesh.new(); bmq.from_mesh(lm); bmq.faces.ensure_lookup_table(); bmq.faces.index_update()
L0 = bmq.loops.layers.uv.active; L1 = bmq.loops.layers.uv.new("atlas"); isl = islands(bmq, L0); boxes = []
for fs in isl:
    us = [lp[L0].uv.x for f in fs for lp in f.loops]; vs = [lp[L0].uv.y for f in fs for lp in f.loops]; boxes.append((min(us), min(vs), max(us) - min(us), max(vs) - min(vs)))
ordr = sorted(range(len(isl)), key=lambda i: -boxes[i][3]); MARG = 0.008
def pack(scl):
    x = y = MARG; row = 0.0; pos = {}
    for i in ordr:
        w, h = boxes[i][2] * scl, boxes[i][3] * scl
        if w > 1 - 2 * MARG: return None
        if x + w + MARG > 1: x = MARG; y += row + MARG; row = 0.0
        if y + h + MARG > 1: return None
        pos[i] = (x, y); x += w + MARG; row = max(row, h)
    return pos
plo, phi = 0.05, 60.0
for _ in range(44):
    mid = (plo + phi) / 2
    if pack(mid): plo = mid
    else: phi = mid
pos = pack(plo); print("hand pieces on the body's sheet", len(isl), [tuple(round(x, 3) for x in bx) for bx in boxes][:6], "enlarged", round(plo, 2))
for i, fs in enumerate(isl):
    for f in fs:
        for lp in f.loops: lp[L1].uv = (pos[i][0] + (lp[L0].uv.x - boxes[i][0]) * plo, pos[i][1] + (lp[L0].uv.y - boxes[i][1]) * plo)
SRC_UV = L0.name; bmq.to_mesh(lm); bmq.free(); lm.uv_layers.remove(lm.uv_layers[SRC_UV]); lm.uv_layers["atlas"].active = True; lm.uv_layers["atlas"].active_render = True
# bake: the sculpt's detail as a normal map, and how shut-in each point is (for the creases' shade)
SKIN = int(globals().get("SKIN_PX", 2048))
scn.render.engine = "CYCLES"; scn.cycles.device = "CPU"; scn.cycles.samples = 24; scn.render.bake.margin = 12; scn.render.bake.use_clear = True
smat = bpy.data.materials.new("fp_skin"); smat.use_nodes = True; NT = smat.node_tree; N = NT.nodes; LK = NT.links; pbsdf = N["Principled BSDF"]; outn = next(x for x in N if x.type == "OUTPUT_MATERIAL")
lm.materials.clear(); lm.materials.append(smat); hmat = bpy.data.materials.new("fp_sculpt"); hi_ob.data.materials.clear(); hi_ob.data.materials.append(hmat)
def target(name, colour):
    im = bpy.data.images.new(name, SKIN, SKIN, alpha=False); im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    nq = N.new("ShaderNodeTexImage"); nq.image = im; nq.name = "bake_" + name
    for q in N: q.select = False
    nq.select = True; N.active = nq; return im, nq
def bake(kind, src_ob=None, extr=0.004, ray=0.012):
    bpy.ops.object.select_all(action="DESELECT")
    if src_ob: src_ob.select_set(True)
    lo_ob.select_set(True); bpy.context.view_layer.objects.active = lo_ob
    sel = [lo_ob] + ([src_ob] if src_ob else [])
    with bpy.context.temp_override(window=bpy.context.window_manager.windows[0], active_object=lo_ob, object=lo_ob, selected_objects=sel):
        if src_ob: bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=extr, max_ray_distance=ray)
        else: bpy.ops.object.bake(type=kind)
for o in scn.objects: o.hide_render = o not in (lo_ob, hi_ob)
nor_i, nor_n = target("fp_skin_normal", False); bake("NORMAL", hi_ob); print("baked: normal")
ao_i, ao_n = target("fp_skin_ao", False); bake("AO", hi_ob); print("baked: shade")

# ---- onto the angler's wrist ----
def frame(o, y, xtow):
    y = y.normalized(); x = (xtow - y * xtow.dot(y)).normalized(); z = x.cross(y).normalized()
    return Matrix(((x.x, y.x, z.x, o.x), (x.y, y.y, z.y, o.y), (x.z, y.z, z.z, o.z), (0, 0, 0, 1)))
MW, MM, MI, MP = B["hand_l"][0], B["middle_01_l"][0], B["index_01_l"][0], B["pinky_01_l"][0]
mh_len = (B["middle_03_l"][1] - MW).length; sclH = mh_len / (JB["middle"][3] - wristB).length
# (the angler's first finger bones start beyond his knuckles: his hand's own line is from the wrist to the middle finger's tip)
FB = frame(wristB, JB["middle"][0] - wristB, acrB); FM = frame(MW, B["middle_03_l"][1] - MW, MI - MP)
T = FM @ Matrix.Scale(sclH, 4) @ FB.inverted(); print("hand scaled by", round(sclH, 3))
for ob in (lo_ob, hi_ob): ob.data.transform(T)
JT = {k: [T @ p for p in v] for k, v in JB.items()}; wristT = T @ wristB; foreT = (T.to_3x3() @ foreB).normalized()
# a plain skeleton of its own, to lay the fingers out straight as the angler's are at rest
ad = bpy.data.armatures.new("bs_tmp"); ao = bpy.data.objects.new("bs_tmp", ad); scn.collection.objects.link(ao)
bpy.ops.object.select_all(action="DESELECT"); ao.select_set(True); bpy.context.view_layer.objects.active = ao
with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, active_object=ao, object=ao, selected_objects=[ao]):
    bpy.ops.object.mode_set(mode="EDIT")
    eb = ad.edit_bones
    fa = eb.new("fore"); fa.head = wristT - foreT * 0.2; fa.tail = wristT
    hb = eb.new("hand"); hb.head = wristT; hb.tail = JT["middle"][0]; hb.parent = fa
    for nm in FN + ["thumb"]:
        prev = hb
        for k in range(3):
            q = eb.new(f"{nm}_{k + 1}"); q.head = JT[nm][k]; q.tail = JT[nm][k + 1]; q.parent = prev; prev = q
    bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT"); lo_ob.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active = ao
with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, active_object=ao, object=ao, selected_objects=[lo_ob, ao], selected_editable_objects=[lo_ob, ao]):
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print("weights by bone heat:", len(lo_ob.vertex_groups), "groups")
# each finger bone turned to lie along the angler's own (his rest pose), from the knuckle outwards
tgt = {}
for nm in FN + ["thumb"]:
    for k in range(3):
        h2, t2 = B[f"{nm}_0{k + 1}_l"]; tgt[f"{nm}_{k + 1}"] = (t2 - h2).normalized()
# (the angler's first bone starts beyond the knuckle, so its line is taken for the whole of the new first bone)
for nm in FN + ["thumb"]:
    for k in range(3):
        pb = ao.pose.bones[f"{nm}_{k + 1}"]; bpy.context.view_layer.update()
        cur = (pb.tail - pb.head).normalized(); q = cur.rotation_difference(tgt[f"{nm}_{k + 1}"])
        m4 = pb.matrix.copy(); loc = m4.translation.copy(); m4 = q.to_matrix().to_4x4() @ m4; m4.translation = loc; pb.matrix = m4
bpy.context.view_layer.update()
JN = {nm: [ao.pose.bones[f"{nm}_1"].head.copy()] + [ao.pose.bones[f"{nm}_{k + 1}"].tail.copy() for k in range(3)] for nm in FN + ["thumb"]}
dgl = bpy.context.evaluated_depsgraph_get(); dgl.update()
flat = bpy.data.meshes.new_from_object(lo_ob.evaluated_get(dgl), preserve_all_data_layers=True, depsgraph=dgl)
for md in list(lo_ob.modifiers): lo_ob.modifiers.remove(md)
lo_ob.parent = None; old = lo_ob.data; lo_ob.data = flat; lo_ob.matrix_world = Matrix.Identity(4)
for vg in list(lo_ob.vertex_groups): lo_ob.vertex_groups.remove(vg)
bpy.data.objects.remove(ao, do_unlink=True); bpy.data.objects.remove(hi_ob, do_unlink=True)
for nm in FN + ["thumb"]: print("laid out", nm, "bones (cm)", [round((JN[nm][k + 1] - JN[nm][k]).length * 100, 2) for k in range(3)])

# ---- the angler's skin colour, from his own hand lying over the new one ----
# Each point of the new hand takes the colour of the nearest point of the angler's own hand (the two lie over one
# another at rest, finger for finger, though not exactly), and that is baked to the new hand's sheet. It carries the
# tone of his skin and where it is redder or paler, not fine detail: the fine detail is the new hand's own relief.
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
arms.name = "mh_skin"; msk = arms.data; mwm = arms.matrix_world.copy()
bmm = bmesh.new(); bmm.from_mesh(msk); bmm.transform(mwm); bmesh.ops.triangulate(bmm, faces=bmm.faces[:]); bmm.faces.ensure_lookup_table(); uvm = bmm.loops.layers.uv.active
tree = BVHTree.FromBMesh(bmm)
mimg = next(x for x in msk.materials[0].node_tree.nodes if x.type == "TEX_IMAGE" and x.image).image; MWp, MHp = mimg.size
mpx = np.array(mimg.pixels[:], dtype=np.float32).reshape(MHp, MWp, 4)
fmesh = lo_ob.data; ca = fmesh.color_attributes.new("mhcol", "FLOAT_COLOR", "POINT"); miss = 0
for v in fmesh.vertices:
    loc, nrm, fi, dist = tree.find_nearest(v.co)
    if loc is None: miss += 1; ca.data[v.index].color = (0.75, 0.55, 0.45, 1); continue
    f = bmm.faces[fi]; l0, l1, l2 = f.loops
    uvq = barycentric_transform(loc, l0.vert.co, l1.vert.co, l2.vert.co, Vector((*l0[uvm].uv, 0)), Vector((*l1[uvm].uv, 0)), Vector((*l2[uvm].uv, 0)))
    px = mpx[min(MHp - 1, max(0, int(uvq.y * MHp))), min(MWp - 1, max(0, int(uvq.x * MWp)))]
    # (the picture's numbers are as stored for the screen; a point's colour is kept as light itself)
    lin = [((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in (float(px[0]), float(px[1]), float(px[2]))]
    ca.data[v.index].color = (lin[0], lin[1], lin[2], 1.0)
bmm.free(); print("colour carried to", len(fmesh.vertices) - miss, "points")
for o in scn.objects: o.hide_render = o is not lo_ob
vcn = N.new("ShaderNodeVertexColor"); vcn.layer_name = "mhcol"; emn = N.new("ShaderNodeEmission"); LK.new(vcn.outputs["Color"], emn.inputs["Color"]); LK.new(emn.outputs["Emission"], outn.inputs["Surface"])
alb_i, alb_n = target("fp_skin_albedo", True); bake("EMIT"); print("baked: colour from the angler's hand")
for im in (nor_i, ao_i, alb_i): im.filepath_raw = f"{ROOT}/source/people/{im.name}_bs{TAG}.png"; im.file_format = "PNG"; im.save()
# the colour softened (the two hands do not lie exactly on one another: his nail's edge would sit beside the new nail),
# and the shut-in places shaded from the new hand's own sculpt
W_ = SKIN; a_al = np.array(alb_i.pixels[:], dtype=np.float32).reshape(W_, W_, 4); a_ao = np.array(ao_i.pixels[:], dtype=np.float32).reshape(W_, W_, 4)[..., 0]
def blur(a, r):
    out = a.copy()
    for ax in (0, 1):
        acc = np.zeros_like(out); 
        for d in range(-r, r + 1): acc += np.roll(out, d, axis=ax)
        out = acc / (2 * r + 1)
    return out
soft = blur(a_al[..., :3], 3); shade = np.clip((a_ao - 0.25) / 0.6, 0, 1) ** 0.8
col = soft * (0.62 + 0.38 * shade[..., None]); col[..., 0] *= 1.0 + 0.06 * (1 - shade)   # (creases a little redder as well as darker)
a_al[..., :3] = np.clip(col, 0, 1); alb_i.pixels = a_al.ravel(); alb_i.save()
rgh_i = bpy.data.images.new("fp_skin_rough", SKIN, SKIN, alpha=False); rgh_i.colorspace_settings.name = "Non-Color"
rr = np.zeros((W_, W_, 4), np.float32); rr[..., 3] = 1; rr[..., :3] = (0.74 - 0.2 * shade)[..., None]; rgh_i.pixels = rr.ravel(); rgh_i.filepath_raw = f"{ROOT}/source/people/fp_skin_rough_bs{TAG}.png"; rgh_i.file_format = "PNG"; rgh_i.save()
for nq in list(N):
    if nq not in (outn, pbsdf, alb_n, nor_n): N.remove(nq)
rgh_n = N.new("ShaderNodeTexImage"); rgh_n.image = rgh_i; nmn = N.new("ShaderNodeNormalMap"); LK.new(nor_n.outputs["Color"], nmn.inputs["Color"]); LK.new(nmn.outputs["Normal"], pbsdf.inputs["Normal"])
LK.new(alb_n.outputs["Color"], pbsdf.inputs["Base Color"]); LK.new(rgh_n.outputs["Color"], pbsdf.inputs["Roughness"]); LK.new(pbsdf.outputs["BSDF"], outn.inputs["Surface"])
bpy.data.objects.remove(arms, do_unlink=True)

# ---- the other hand (mirrored), and the angler's finger bones moved to the new hand's joints ----
lo_ob.name = "fp_arms"; arms = lo_ob; fm = arms.data
bmq = bmesh.new(); bmq.from_mesh(fm); geom = bmq.verts[:] + bmq.edges[:] + bmq.faces[:]
ret = bmesh.ops.duplicate(bmq, geom=geom); nvs = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMVert)]; nfs = [x for x in ret["geom"] if isinstance(x, bmesh.types.BMFace)]
for v in nvs: v.co.x = -v.co.x
bmesh.ops.reverse_faces(bmq, faces=nfs); bmq.to_mesh(fm); bmq.free()
bpy.ops.object.select_all(action="DESELECT"); rig.select_set(True); bpy.context.view_layer.objects.active = rig
with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, active_object=rig, object=rig, selected_objects=[rig]):
    bpy.ops.object.mode_set(mode="EDIT")
    inv = rig.matrix_world.inverted(); eb = rig.data.edit_bones
    for nm in FN + ["thumb"]:
        for k in range(3):
            for sfx, sx in (("l", 1), ("r", -1)):
                q = eb[f"{nm}_0{k + 1}_{sfx}"]; q.use_connect = False
                h3 = JN[nm][k].copy(); t3 = JN[nm][k + 1].copy(); h3.x *= sx; t3.x *= sx; q.head = inv @ h3; q.tail = inv @ t3
    bpy.ops.object.mode_set(mode="OBJECT")
B = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}
keepdef = {b.name: b.use_deform for b in rig.data.bones}
for b in rig.data.bones: b.use_deform = b.name in ARM and not b.name.startswith("upperarm")
bpy.ops.object.select_all(action="DESELECT"); arms.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
with bpy.context.temp_override(window=win, screen=win.screen, area=area, region=region, active_object=rig, object=rig, selected_objects=[arms, rig], selected_editable_objects=[arms, rig]):
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
for b in rig.data.bones: b.use_deform = keepdef[b.name]
for o in scn.objects: o.hide_render = False
print("new hands:", len(fm.vertices), "points,", len(fm.polygons), "faces; groups", len(arms.vertex_groups))

# ---- the skeleton: the angler's own rig; only the arm's bones move these ----
for ob in (slv,):
    for vg in list(ob.vertex_groups):
        if vg.name not in ARM: ob.vertex_groups.remove(vg)
    up = {s: ob.vertex_groups.get("upperarm_" + s) or ob.vertex_groups.new(name="upperarm_" + s) for s in "lr"}
    omw = ob.matrix_world
    for v in ob.data.vertices:
        tot = sum(g.weight for g in v.groups); s = "l" if (omw @ v.co).x > 0 else "r"
        if tot < 0.999: up[s].add([v.index], 1.0 - tot + (up[s].weight(v.index) if any(g.group == up[s].index for g in v.groups) else 0.0), "REPLACE")
    m0 = ob.matrix_world.copy(); ob.parent = rig; ob.matrix_world = m0
    for m in list(ob.modifiers): ob.modifiers.remove(m)
    if ob is slv: sub = ob.modifiers.new("smooth", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
    am = ob.modifiers.new("arm", "ARMATURE"); am.object = rig
for o in list(bpy.data.objects):
    if o not in (arms, slv, rig): bpy.data.objects.remove(o, do_unlink=True)
# (the hands: only the arm's own bones, every point's shares adding up to one)
for vg in list(arms.vertex_groups):
    if vg.name not in ARM: arms.vertex_groups.remove(vg)
for v in arms.data.vertices:
    tot = sum(gq.weight for gq in v.groups)
    if tot > 1e-6:
        for gq in v.groups: gq.weight = gq.weight / tot
    else: arms.vertex_groups["lowerarm_" + ("l" if v.co.x > 0 else "r")].add([v.index], 1.0, "REPLACE")
with bpy.context.temp_override(window=win, screen=win.screen):
    bpy.ops.wm.save_as_mainfile(filepath=ROOT + f"/source/people/fp_body_bs{TAG}.blend")
    bpy.ops.export_scene.gltf(filepath=ROOT + f"/exports/fp_body_bs{TAG}.glb", export_format="GLB", export_skins=True, export_apply=True, export_image_format="WEBP", export_jpeg_quality=85, export_cameras=False, export_lights=False, export_animations=False)
print("exported kB", os.path.getsize(ROOT + f"/exports/fp_body_bs{TAG}.glb") // 1000)
CHECK_NAME = "fp_body_bs" + TAG; CHECK_DIST = 0.16; CHECK_TARGET = tuple(B["hand_r"][0] * 0.4 + B["middle_01_r"][0] * 0.6)
CHECK_ANGLES = [(200, 15), (250, 25), (120, 10), (200, -40), (20, 30), (70, -20)]
exec(compile(open(ROOT + "/scripts/render_check.py").read(), "render_check", "exec"))
