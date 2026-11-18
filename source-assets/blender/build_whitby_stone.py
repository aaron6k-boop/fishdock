# FishDock: Whitby's stonework as tileable materials, baked from modelled stone
#   ashlar   the piers' walls: courses of squared sandstone blocks, each its own size, bevelled, worn and pitted, a
#            little proud of or back from its neighbours, in recessed mortar joints (the photographs of the West and
#            East Piers' walls)
#   flags    the piers' decks: big sandstone flags of differing sizes in rough rows, worn round their edges, some a
#            little higher than others, with dark joints (the photographs along the East Pier)
# Each is modelled block by block in Blender, every block given its own patch of the photoscanned sandstone in STONE
# (CC0) and its own shade, then baked by Cycles onto a flat tile: colour (with the joints' shadowing), tangent-space
# normals and roughness, 2048 px, seamless (the blocks wrap round the tile's edges). The game lays these on its walls
# and decks at the tile's real size, so it costs no more to draw than a plain texture.
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"
STONE = globals().get("STONE", OUT + "/downloads/polyhaven-stone/large_sandstone_blocks_01")
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

def scan_material(name, scale):
    # the scan, shaded per block by its colour attribute "tint", its UVs offset per block (set on the mesh)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(STONE + "_diff_1k.jpg", check_existing=True)
    a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "tint"
    mul = nt.nodes.new("ShaderNodeVectorMath"); mul.operation = "MULTIPLY"
    nt.links.new(t.outputs["Color"], mul.inputs[0]); nt.links.new(a.outputs["Color"], mul.inputs[1]); nt.links.new(mul.outputs[0], b.inputs["Base Color"])
    r = nt.nodes.new("ShaderNodeTexImage"); r.image = bpy.data.images.load(STONE + "_rough_1k.jpg", check_existing=True); r.image.colorspace_settings.name = "Non-Color"
    nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = bpy.data.images.load(STONE + "_nor_1k.jpg", check_existing=True); n.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m
def plain(name, rgb, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; return m

def block(bm, uv, tint, x0, x1, y0, y1, depth, bev, scan_tile, rnd):
    # a stone block from x0..x1 (across), y0..y1 (up), its face at z = depth (proud of the joint plane at 0); worn by
    # a bevel and, on the face, small random dents
    vs = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    for v in vs: v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), depth / 2 + v.co.z * depth))
    faces = list({f for v in vs for f in v.link_faces})
    edges = list({e for v in vs for e in v.link_edges})
    res = bmesh.ops.bevel(bm, geom=edges + vs, offset=bev, segments=3, affect="EDGES", profile=0.6, clamp_overlap=True)
    faces = list({f for v in vs for f in v.link_faces} | set(res.get("faces", [])))
    # the face's dents and the edges' wear: verts on the front pushed back a little at random
    for v in {v for f in faces for v in f.verts}:
        if v.co.z > depth * 0.6: v.co.z -= abs(rnd.gauss(0, 0.004)) + (0.012 if rnd.random() < 0.08 else 0)
    ox, oy, sh = rnd.random(), rnd.random(), tint
    for f in faces:
        for l in f.loops:
            l[uv["uv"]].uv = (l.vert.co.x / scan_tile + ox, l.vert.co.y / scan_tile + oy)
            l[uv["tint"]] = (*sh, 1.0)

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
                d = 0.06 + rnd.uniform(-0.012, 0.012); g = 0.011
                tint = [0.8 + rnd.random() * 0.28] * 3; tint = (tint[0] * rnd.uniform(0.97, 1.03), tint[1], tint[2] * rnd.uniform(0.92, 1.0))
                for sx in (-W, 0, W):  # (and its copies either side, so the tile wraps)
                    for sy in (-H, 0, H):
                        block(bm, uv, tint, a + g + sx, b - g + sx, j * rowH + g + sy, (j + 1) * rowH - g + sy, d, 0.02 + rnd.uniform(0, 0.012), 1.4, rnd)
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
                d = 0.05 + rnd.uniform(-0.008, 0.008); g = 0.008
                tint = [0.78 + rnd.random() * 0.3] * 3; tint = (tint[0] * rnd.uniform(0.97, 1.03), tint[1], tint[2] * rnd.uniform(0.9, 1.0))
                for sx in (-W, 0, W):
                    for sy in (-H, 0, H):
                        block(bm, uv, tint, a + g + sx, b - g + sx, y0 + g + sy, y1 - g + sy, d, 0.012 + rnd.uniform(0, 0.01), 1.6, rnd)
    me = bpy.data.meshes.new(kind + "_hi"); bm.to_mesh(me); bm.free()
    hi = bpy.data.objects.new(kind + "_hi", me); col.objects.link(hi); hi.data.materials.append(scan_material(kind + "_scan", 1.4))
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
