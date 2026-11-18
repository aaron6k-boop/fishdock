# FishDock: Whitby's stonework as tileable materials, baked from modelled stone
#   ashlar   the piers' walls: courses of squared sandstone blocks, each its own size, bevelled, worn and pitted, a
#            little proud of or back from its neighbours, in recessed mortar joints (the photographs of the West and
#            East Piers' walls)
#   flags    the piers' decks: big sandstone flags of differing sizes in rough rows, worn round their edges, some a
#            little higher than others, with dark joints (the photographs along the East Pier)
# Each is modelled block by block in Blender, every block given its own patch of a photoscanned stone surface (STONE,
# Poly Haven's "Sandstone Cracks", CC0: a face with no joints of its own, so none show inside a block) and its own
# shade, then baked by Cycles onto a flat tile: colour (with the joints' shadowing), tangent-space normals and
# roughness, 2048 px, seamless (the blocks wrap round the tile's edges, and the weathering is drawn from noise that
# repeats with the tile). The scan gives the grain, pits and cracks; the colour is Whitby's buff-grey sandstone (the
# photographs), lichen and old staining in patches. The game lays these on its walls and decks at the tile's real
# size, so it costs no more to draw than a plain texture.
import bpy, bmesh, math, os, random, glob
import numpy as np
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"
STONE = globals().get("STONE", OUT + "/downloads/polyhaven/sandstone_cracks")
def find(base, kinds):
    # a Poly Haven map: base is the asset's folder (searched through) or a file prefix
    pool = glob.glob(base + "/**/*.*", recursive=True) if os.path.isdir(base) else glob.glob(base + "_*")
    for k in kinds:
        for res in ("2k", "1k"):
            for p in pool:
                if p.lower().endswith((f"_{k}_{res}.jpg", f"_{k}_{res}.png")): return p
    raise FileNotFoundError(f"{base}: no {kinds}")
RES = globals().get("RES", 2048)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 64
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU not set:", e)

def periodic_noise(nt, W, H, scale, detail, rough, seed):
    # 4D noise on a torus: repeats every W across and H up, so the tile's weathering has no seam
    tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sp.inputs[0])
    def m(op, a, b=None):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: nt.links.new(v, n.inputs[i])
        return n.outputs[0]
    ax = m("MULTIPLY", sp.outputs["X"], 2 * math.pi / W); ay = m("MULTIPLY", sp.outputs["Y"], 2 * math.pi / H)
    rx, ry = W / (2 * math.pi), H / (2 * math.pi)
    cx = m("MULTIPLY", m("COSINE", ax), rx); sx = m("MULTIPLY", m("SINE", ax), rx); cy = m("MULTIPLY", m("COSINE", ay), ry); sy = m("MULTIPLY", m("SINE", ay), ry)
    cv = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(cx, cv.inputs[0]); nt.links.new(sx, cv.inputs[1]); nt.links.new(cy, cv.inputs[2])
    off = nt.nodes.new("ShaderNodeVectorMath"); off.operation = "ADD"; off.inputs[1].default_value = (seed * 7.3, seed * 3.1, seed * 5.7); nt.links.new(cv.outputs[0], off.inputs[0])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.noise_dimensions = "4D"; nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = detail; nz.inputs["Roughness"].default_value = rough
    nt.links.new(off.outputs[0], nz.inputs["Vector"]); nt.links.new(m("ADD", sy, seed * 1.9), nz.inputs["W"])
    return nz.outputs["Fac"]
def ramp(nt, x, a, b):
    r = nt.nodes.new("ShaderNodeValToRGB"); r.color_ramp.elements[0].position = a; r.color_ramp.elements[1].position = b; nt.links.new(x, r.inputs[0]); return r.outputs["Color"]
def mix(nt, fac, a, b, amount=1.0):
    k = nt.nodes.new("ShaderNodeMath"); k.operation = "MULTIPLY"; k.inputs[1].default_value = amount
    nt.links.new(fac, k.inputs[0]) if not isinstance(fac, float) else None
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; nt.links.new(k.outputs[0], mx.inputs["Factor"])
    for sock, v in ((mx.inputs[6], a), (mx.inputs[7], b)):
        if isinstance(v, tuple): sock.default_value = (*v, 1)
        else: nt.links.new(v, sock)
    return mx.outputs[2]
def scan_material(name, W, H, stone_rgb, seed):
    # the scan's light and shade (over its own average) as the stone's grain, times the block's own shade ("tint") and
    # Whitby's buff-grey; then dark lichen and old staining in broad patches, pale crust lichen in small spots
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(find(STONE, ["diff", "col"]), check_existing=True)
    px = np.empty(len(t.image.pixels), dtype=np.float32); t.image.pixels.foreach_get(px); px = px.reshape(-1, 4)[:, :3]
    px = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)  # (stored as sRGB; the shader sees it linear)
    mean = float((px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722).mean()) or 0.2
    bw = nt.nodes.new("ShaderNodeRGBToBW"); nt.links.new(t.outputs["Color"], bw.inputs[0])
    det = nt.nodes.new("ShaderNodeMapRange"); det.inputs["From Min"].default_value = 0; det.inputs["From Max"].default_value = mean
    det.inputs["To Min"].default_value = 0.25; det.inputs["To Max"].default_value = 1.0; det.clamp = False; nt.links.new(bw.outputs[0], det.inputs["Value"])
    a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "tint"
    c1 = nt.nodes.new("ShaderNodeVectorMath"); c1.operation = "MULTIPLY"; c1.inputs[1].default_value = stone_rgb; nt.links.new(a.outputs["Color"], c1.inputs[0])
    c2 = nt.nodes.new("ShaderNodeVectorMath"); c2.operation = "SCALE"; nt.links.new(c1.outputs[0], c2.inputs[0]); nt.links.new(det.outputs[0], c2.inputs["Scale"])
    lichen = ramp(nt, periodic_noise(nt, W, H, 1.6, 6, 0.62, seed), 0.52, 0.72)
    col = mix(nt, lichen, c2.outputs[0], (0.075, 0.075, 0.055), 0.55)
    crust = ramp(nt, periodic_noise(nt, W, H, 7.0, 3, 0.5, seed + 11), 0.7, 0.76)
    col = mix(nt, crust, col, (0.48, 0.47, 0.42), 0.55)
    nt.links.new(col, b.inputs["Base Color"])
    r = nt.nodes.new("ShaderNodeTexImage"); r.image = bpy.data.images.load(find(STONE, ["rough"]), check_existing=True); r.image.colorspace_settings.name = "Non-Color"
    nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(find(STONE, ["nor_gl", "nor"]), check_existing=True); n.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.8; nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    print("SCAN", os.path.basename(t.image.filepath), "mean", round(mean, 3), flush=True)
    return m
def plain(name, rgb, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; return m

def block(bm, uv, tint, x0, x1, y0, y1, depth, bev, scan_tile, seed, sx=0.0, sy=0.0):
    # a stone block from x0..x1 (across), y0..y1 (up), its face at z = depth (proud of the joint plane at 0); worn by
    # a bevel and, on the face, small random dents. (sx, sy): this copy's shift round the tile; every copy of a block
    # is drawn from the same seed and laid on the same patch of the scan, so the tile wraps without a seam
    rnd = random.Random(seed); before = set(bm.faces)
    vs = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    for v in vs: v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), depth / 2 + v.co.z * depth))
    edges = list({e for v in vs for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=bev, segments=3, affect="EDGES", profile=0.6, clamp_overlap=True)
    faces = [f for f in bm.faces if f not in before]
    # the face's dents and the edges' wear: verts on the front pushed back a little at random (in a fixed order, so
    # every copy gets the same)
    verts = sorted({v for f in faces for v in f.verts}, key=lambda v: (round(v.co.x - sx, 4), round(v.co.y - sy, 4), round(v.co.z, 4)))
    for v in verts:
        if v.co.z > depth * 0.6: v.co.z -= abs(rnd.gauss(0, 0.004)) + (0.012 if rnd.random() < 0.08 else 0)
    ox, oy = rnd.random(), rnd.random()
    for f in faces:
        for l in f.loops:
            l[uv["uv"]].uv = ((l.vert.co.x - sx) / scan_tile + ox, (l.vert.co.y - sy) / scan_tile + oy)
            l[uv["tint"]] = (*tint, 1.0)

def build(kind):
    rnd = random.Random(1814 if kind == "ashlar" else 1854)
    W = H = 2.4 if kind == "ashlar" else 3.0
    bm = bmesh.new(); uv = {"uv": bm.loops.layers.uv.verify(), "tint": bm.loops.layers.color.new("tint")}
    if kind == "ashlar":
        rows, rowH = 5, W / 5
        for j in range(rows):
            x = rnd.uniform(0, 0.6)
            cuts = [x]
            while True:
                x += rnd.uniform(0.75, 1.35)
                if x >= cuts[0] + W - 0.5: break
                cuts.append(x)
            cuts.append(cuts[0] + W)
            for a, b in zip(cuts, cuts[1:]):
                d = 0.06 + rnd.uniform(-0.012, 0.012); g = 0.011; bev = 0.02 + rnd.uniform(0, 0.012); seed = rnd.randrange(1 << 30)
                tint = [0.8 + rnd.random() * 0.28] * 3; tint = (tint[0] * rnd.uniform(0.97, 1.03), tint[1], tint[2] * rnd.uniform(0.92, 1.0))
                for sx in (-W, 0, W):  # (and its copies either side, so the tile wraps)
                    for sy in (-H, 0, H):
                        block(bm, uv, tint, a + g + sx, b - g + sx, j * rowH + g + sy, (j + 1) * rowH - g + sy, d, bev, 2.0, seed, sx, sy)
    else:
        # flags in rows of differing depths, each row's flags of differing lengths
        y = 0.0; rowsY = []
        while y < H - 0.4:
            h = rnd.uniform(0.55, 0.9)
            if H - (y + h) < 0.4: h = H - y
            rowsY.append((y, y + h)); y += h
        for (y0, y1) in rowsY:
            x = rnd.uniform(0, 0.8); cuts = [x]
            while True:
                x += rnd.uniform(0.6, 1.25)
                if x >= cuts[0] + W - 0.45: break
                cuts.append(x)
            cuts.append(cuts[0] + W)
            for a, b in zip(cuts, cuts[1:]):
                d = 0.05 + rnd.uniform(-0.008, 0.008); g = 0.008; bev = 0.012 + rnd.uniform(0, 0.01); seed = rnd.randrange(1 << 30)
                tint = [0.78 + rnd.random() * 0.3] * 3; tint = (tint[0] * rnd.uniform(0.97, 1.03), tint[1], tint[2] * rnd.uniform(0.9, 1.0))
                for sx in (-W, 0, W):
                    for sy in (-H, 0, H):
                        block(bm, uv, tint, a + g + sx, b - g + sx, y0 + g + sy, y1 - g + sy, d, bev, 2.0, seed, sx, sy)
    me = bpy.data.meshes.new(kind + "_hi"); bm.to_mesh(me); bm.free()
    hi = bpy.data.objects.new(kind + "_hi", me); col.objects.link(hi); hi.data.materials.append(scan_material(kind + "_scan", W, H, (0.43, 0.37, 0.27) if kind == "ashlar" else (0.4, 0.36, 0.29), 3 if kind == "ashlar" else 5))
    for p in hi.data.polygons: p.use_smooth = False
    # the joints: mortar, set back behind the stones
    bpy.ops.mesh.primitive_plane_add(size=1.0); jp = bpy.context.active_object; jp.name = kind + "_joints"
    jp.scale = (W * 3, H * 3, 1); jp.location = (W / 2, H / 2, 0.0)
    jp.data.materials.append(plain(kind + "_mortar", (0.32, 0.29, 0.25) if kind == "ashlar" else (0.2, 0.19, 0.17), 0.95))
    # the tile the maps are baked onto
    bpy.ops.mesh.primitive_plane_add(size=1.0); lo = bpy.context.active_object; lo.name = kind + "_tile"
    lo.scale = (W, H, 1); lo.location = (W / 2, H / 2, 0.12); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = bpy.data.materials.new(kind + "_bake"); m.use_nodes = True; lo.data.materials.append(m)
    return hi, jp, lo, W

def bake(hi, jp, lo, kind):
    nt = lo.data.materials[0].node_tree; node = nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active = node
    out = {}
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.15; sc.render.bake.max_ray_distance = 0.3; sc.render.bake.margin = 0
    for t in ("DIFFUSE", "AO", "NORMAL", "ROUGHNESS"):
        sc.cycles.samples = {"DIFFUSE": 16, "AO": 96, "NORMAL": 8, "ROUGHNESS": 8, "EMIT": 4}[t]  # (only the shading needs many; the rest are flat colour, antialiased)
        im = bpy.data.images.new(f"{kind}_{t}", RES, RES, float_buffer=False)
        if t != "DIFFUSE": im.colorspace_settings.name = "Non-Color"
        node.image = im
        bpy.ops.object.select_all(action="DESELECT"); hi.select_set(True); jp.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
        if t == "DIFFUSE": sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
        bpy.ops.object.bake(type=t, normal_space="TANGENT") if t == "NORMAL" else bpy.ops.object.bake(type=t)
        buf = np.empty(RES * RES * 4, dtype=np.float32); im.pixels.foreach_get(buf); out[t] = buf.reshape(RES, RES, 4)[:, :, :3].copy()
        print("BAKED", kind, t, flush=True)
    return out

def save(arr, path, srgb=True):
    im = bpy.data.images.new(os.path.basename(path), arr.shape[1], arr.shape[0])
    if not srgb: im.colorspace_settings.name = "Non-Color"
    px = np.ones((arr.shape[0], arr.shape[1], 4), dtype=np.float32); px[:, :, :3] = np.clip(arr, 0, 1); im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path; im.file_format = "JPEG"; sc.render.image_settings.quality = 88; im.save()
os.makedirs(OUT + "/exports/whitby_stone", exist_ok=True)
for kind in ("ashlar", "flags"):
    hi, jp, lo, W = build(kind)
    maps = bake(hi, jp, lo, kind)
    ao = maps["AO"][:, :, :1] ** 0.8
    colour = maps["DIFFUSE"] * (0.35 + 0.65 * ao)
    base = OUT + f"/exports/whitby_stone/whitby_{kind}"
    save(colour, base + "_diff.jpg"); save(maps["NORMAL"], base + "_nor.jpg", False); save(maps["ROUGHNESS"], base + "_rough.jpg", False)
    print("STONE", kind, "tile", W, "m", flush=True)
    for o in (hi, jp, lo): bpy.data.objects.remove(o, do_unlink=True)
print("STONE DONE")
