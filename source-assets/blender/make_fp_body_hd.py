# FishDock: the first-person arms, second build. The skin is the MPFB angler's own hands and wrists as before; the
# sleeve is no longer the arm's surface let out with noise for folds (a ribbed tube): it is the sleeve of a modelled
# jacket, MakeHuman's "male_casualsuit05" field jacket (CC0, from the MakeHuman system assets), fitted to the angler by
# MPFB, with the folds its makers sculpted carried in its normal map. Exported as fp_body.glb on the same bones.
# The jacket's colour map is kept only as light and dark (seams, stitching, the shade in its folds, with its
# ambient-occlusion map multiplied in), so the game can colour it as your own jacket; its maps are cropped to the part
# the sleeves use.
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

# ---- the skin's own maps: the arms' share of the body's texture given a whole 2048 px sheet, and relief baked for it ----
# On the body's sheet the two hands are a small corner (a hand about 250 px long). Here each piece of the arms' skin is
# laid out again to fill a sheet of its own (a hand about four times that), the colour carried across, and a normal
# map and a roughness map baked beside it (Cycles): the creases, knuckle lines and nail edges painted in the colour
# map turned into relief, and the fine net of lines skin has on the back of a hand and across the knuckles (a
# millimetre or so across: drawn by rule, not scanned from anyone's hand).
def islands(bm, L):
    seen = set(); out = []
    for f0 in bm.faces:
        if f0.index in seen: continue
        stack = [f0]; isl = []; seen.add(f0.index)
        while stack:
            f = stack.pop(); isl.append(f)
            for lp in f.loops:
                a, b = lp[L].uv, lp.link_loop_next[L].uv
                for ol in lp.edge.link_loops:
                    g = ol.face
                    if g.index in seen: continue
                    c, d = ol[L].uv, ol.link_loop_next[L].uv
                    if ((a - d).length < 1e-5 and (b - c).length < 1e-5) or ((a - c).length < 1e-5 and (b - d).length < 1e-5): seen.add(g.index); stack.append(g)
        out.append(isl)
    return out
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.faces.index_update()
L0 = bm.loops.layers.uv.active; L1 = bm.loops.layers.uv.new("atlas")
isl = islands(bm, L0); boxes = []
for fs in isl:
    us = [lp[L0].uv.x for f in fs for lp in f.loops]; vs = [lp[L0].uv.y for f in fs for lp in f.loops]
    boxes.append((min(us), min(vs), max(us) - min(us), max(vs) - min(vs)))
order = sorted(range(len(isl)), key=lambda i: -boxes[i][3]); MARG = 0.006
def pack(sc):
    x = y = MARG; row = 0.0; pos = {}
    for i in order:
        w, h = boxes[i][2] * sc, boxes[i][3] * sc
        if w > 1 - 2 * MARG: return None
        if x + w + MARG > 1: x = MARG; y += row + MARG; row = 0.0
        if y + h + MARG > 1: return None
        pos[i] = (x, y); x += w + MARG; row = max(row, h)
    return pos
lo, hi = 0.2, 40.0
for _ in range(40):
    mid = (lo + hi) / 2
    if pack(mid): lo = mid
    else: hi = mid
pos = pack(lo); print("skin pieces", len(isl), "laid out", round(lo, 2), "times their size on the body's sheet")
for i, fs in enumerate(isl):
    for f in fs:
        for lp in f.loops: lp[L1].uv = (pos[i][0] + (lp[L0].uv.x - boxes[i][0]) * lo, pos[i][1] + (lp[L0].uv.y - boxes[i][1]) * lo)
SRC_UV = L0.name; bm.to_mesh(me); bm.free()
me.uv_layers["atlas"].active = True; me.uv_layers["atlas"].active_render = True
SKIN = int(globals().get("SKIN_PX", 2048))
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 4; sc.render.bake.margin = 12; sc.render.bake.use_clear = True
smat = me.materials[0]; nt = smat.node_tree; N = nt.nodes; LK = nt.links
src = next(n for n in N if n.type == "TEX_IMAGE" and n.image); src.interpolation = "Cubic"
uvn = N.new("ShaderNodeUVMap"); uvn.uv_map = SRC_UV; LK.new(uvn.outputs["UV"], src.inputs["Vector"])
out = next(n for n in N if n.type == "OUTPUT_MATERIAL"); pbsdf = next(n for n in N if n.type == "BSDF_PRINCIPLED")
def target(name, colour):
    im = bpy.data.images.new(name, SKIN, SKIN, alpha=False); im.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    n = N.new("ShaderNodeTexImage"); n.image = im; n.name = "bake_" + name
    for q in N: q.select = False
    n.select = True; N.active = n; return im, n
def bake(kind):
    bpy.ops.object.select_all(action="DESELECT"); arms.select_set(True); bpy.context.view_layer.objects.active = arms
    with bpy.context.temp_override(window=bpy.context.window_manager.windows[0], active_object=arms, object=arms, selected_objects=[arms]): bpy.ops.object.bake(type=kind)
emit = N.new("ShaderNodeEmission")
# colour
LK.new(src.outputs["Color"], emit.inputs["Color"]); LK.new(emit.outputs["Emission"], out.inputs["Surface"])
alb, alb_n = target("fp_skin_albedo", True); bake("EMIT")
# relief: the painted creases as depth, and the fine net of skin lines
tc = N.new("ShaderNodeTexCoord"); lum = N.new("ShaderNodeRGBToBW"); LK.new(src.outputs["Color"], lum.inputs["Color"])
def vor(scale, rot):
    mp = N.new("ShaderNodeMapping"); mp.inputs["Rotation"].default_value = rot; mp.inputs["Scale"].default_value = (scale, scale * 0.62, scale)
    LK.new(tc.outputs["Object"], mp.inputs["Vector"])
    v = N.new("ShaderNodeTexVoronoi"); v.feature = "DISTANCE_TO_EDGE"; v.inputs["Scale"].default_value = 1.0; LK.new(mp.outputs["Vector"], v.inputs["Vector"])
    r = N.new("ShaderNodeMapRange"); r.inputs["From Min"].default_value = 0.0; r.inputs["From Max"].default_value = 0.06; LK.new(v.outputs["Distance"], r.inputs["Value"]); return r
n1, n2 = vor(520.0, (0.3, 0.5, 0.2)), vor(310.0, (1.1, 0.2, 0.9))   # (lines about 2 and 3 mm apart, drawn out one way as skin's are)
net = N.new("ShaderNodeMath"); net.operation = "MINIMUM"; LK.new(n1.outputs["Result"], net.inputs[0]); LK.new(n2.outputs["Result"], net.inputs[1])
b1 = N.new("ShaderNodeBump"); b1.inputs["Strength"].default_value = 1.0; b1.inputs["Distance"].default_value = 0.0009; LK.new(lum.outputs["Val"], b1.inputs["Height"])
b2 = N.new("ShaderNodeBump"); b2.inputs["Strength"].default_value = 1.0; b2.inputs["Distance"].default_value = 0.00007; LK.new(net.outputs["Value"], b2.inputs["Height"]); LK.new(b1.outputs["Normal"], b2.inputs["Normal"])
LK.new(b2.outputs["Normal"], pbsdf.inputs["Normal"]); LK.new(pbsdf.outputs["BSDF"], out.inputs["Surface"])
nor_i, nor_n = target("fp_skin_normal", False); bake("NORMAL")
# roughness: drier in the lines and the creases, a soft sheen on the skin between
rr = N.new("ShaderNodeMapRange"); rr.inputs["From Min"].default_value = 0.0; rr.inputs["From Max"].default_value = 1.0; rr.inputs["To Min"].default_value = 0.8; rr.inputs["To Max"].default_value = 0.56
LK.new(net.outputs["Value"], rr.inputs["Value"]); LK.new(rr.outputs["Result"], emit.inputs["Color"]); LK.new(emit.outputs["Emission"], out.inputs["Surface"])
rgh, rgh_n = target("fp_skin_rough", False); bake("EMIT")
for im in (alb, nor_i, rgh): im.filepath_raw = f"{ROOT}/source/people/{im.name}{TAG}.png"; im.file_format = "PNG"; im.save()
# the finished skin: its own three maps on its own sheet
for n in list(N):
    if n not in (out, pbsdf, alb_n, nor_n, rgh_n): N.remove(n)
nm = N.new("ShaderNodeNormalMap"); LK.new(nor_n.outputs["Color"], nm.inputs["Color"]); LK.new(nm.outputs["Normal"], pbsdf.inputs["Normal"])
LK.new(alb_n.outputs["Color"], pbsdf.inputs["Base Color"]); LK.new(rgh_n.outputs["Color"], pbsdf.inputs["Roughness"]); LK.new(pbsdf.outputs["BSDF"], out.inputs["Surface"])
pbsdf.inputs["Metallic"].default_value = 0.0
try: pbsdf.inputs["Coat Weight"].default_value = 0.0
except Exception: pass
smat.blend_method = "OPAQUE" if hasattr(smat, "blend_method") else smat.blend_method
me.uv_layers.remove(me.uv_layers[SRC_UV]); print("skin maps baked", SKIN, "uv layers", [l.name for l in me.uv_layers])

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

# ---- the skeleton: the angler's own rig; only the arm's bones move these ----
for ob in (arms, slv):
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
for m in arms.data.materials:
    if not m or not m.node_tree: continue
    for n in m.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 2048: n.image.scale(2048, 2048)
with bpy.context.temp_override(window=win, screen=win.screen):
    bpy.ops.wm.save_as_mainfile(filepath=ROOT + f"/source/people/fp_body_hd{TAG}.blend")
    bpy.ops.export_scene.gltf(filepath=ROOT + f"/exports/fp_body_hd{TAG}.glb", export_format="GLB", export_skins=True, export_apply=True, export_image_format="WEBP", export_jpeg_quality=85, export_cameras=False, export_lights=False, export_animations=False)
print("exported kB", os.path.getsize(ROOT + f"/exports/fp_body_hd{TAG}.glb") // 1000)
CHECK_NAME = "fp_body_hd" + TAG; CHECK_DIST = 0.32; CHECK_TARGET = tuple((B["lowerarm_r"][0] + B["hand_r"][0]) / 2)
CHECK_ANGLES = [(200, 15), (250, 25), (120, 10), (200, -40)]
exec(compile(open(ROOT + "/scripts/render_check.py").read(), "render_check", "exec"))
