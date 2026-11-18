# FishDock: the town's house fronts, baked from modelled bays onto the facade atlases the game lays on its buildings
#   facade_<kind>_{diff,nor,rough,glass}.jpg  for kind in brick, render, stone
# The game's buildings (buildings3d.js) are walled with an atlas of five bays, each one storey of 3 m by 3 m: a window,
# a door, a shop front, plain wall and a wide window (textures3d.js FACADE_TILE, in that order). Until now those were
# drawn in code at 85 pixels a metre. Here each bay is modelled in Blender at its real size: the wall in a photoscanned
# material (Poly Haven, CC0: red brick, white plaster, sandstone) with its openings cut into it, box-sash windows set back
# in their reveals (frames, sashes, glazing bars, a stone sill and a lintel or a brick arch over), a panelled door with
# its fanlight and door case, a shop front with its fascia and stall riser. Cycles bakes them onto the atlas's plane:
# colour with the reveals' shadowing, tangent-space normals, roughness, and a mask of the glass (lit after dark).
import bpy, bmesh, math, os, random, glob
import numpy as np
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"; PH = OUT + "/downloads/polyhaven"
PX = globals().get("PX", 1024)  # pixels a bay (3 m)
# (every scan is laid a whole number of times to a bay, 1.5 m, so bays sit side by side and storeys stack with no seam)
KINDS = {
    "brick": dict(scan=PH + "/red_brick_03", tile=1.5, tint=(1, 1, 1), trim=(0.86, 0.85, 0.81), lintel="arch", door=(0.06, 0.12, 0.22)),
    # (render: near white, the house's own colour comes from the game's tint; stone: Whitby's buff sandstone, its lichen
    # softened)
    "render": dict(scan=PH + "/white_plaster_02", tile=1.5, tint=(0.8, 0.79, 0.76), norm=0.55, trim=(0.9, 0.9, 0.87), lintel="stone", door=(0.24, 0.05, 0.06)),
    "stone": dict(scan=OUT + "/downloads/polyhaven-stone/large_sandstone_blocks_01", tile=1.5, tint=(0.46, 0.41, 0.32), norm=0.7, trim=(0.88, 0.87, 0.83), lintel="stone", door=(0.07, 0.14, 0.09)),
}
def find(base, kind):
    # a Poly Haven map: base is the asset's folder (searched through) or a file prefix; kind a list of names to try
    kinds = kind if isinstance(kind, (list, tuple)) else [kind]
    pool = glob.glob(base + "/**/*.*", recursive=True) if os.path.isdir(base) else glob.glob(base + "_*")
    for k in kinds:
        for res in ("2k", "1k"):
            for p in pool:
                if p.lower().endswith((f"_{k}_{res}.jpg", f"_{k}_{res}.png")): return p
    return None
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 48
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU not set:", e)

def principled(name, rgb=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    b.inputs["Emission Color"].default_value = (1, 1, 1, 1); b.inputs["Emission Strength"].default_value = emit
    return m
def scanned(name, base, tint, norm=None):
    # the scan's colour times tint; or, with norm (a contrast, 0 to 1), only its light and dark over its own average,
    # softened by norm, times tint: so a render or stone house takes its colour from the game's tint per house, not the
    # scan's own grey-brown dirt
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    p = find(base, ["diff", "col", "color"])
    if not p: raise FileNotFoundError("no colour map for " + base)
    d = nt.nodes.new("ShaderNodeTexImage"); d.image = bpy.data.images.load(p, check_existing=True)
    mul = nt.nodes.new("ShaderNodeVectorMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = tint
    if norm is None: nt.links.new(d.outputs["Color"], mul.inputs[0])
    else:
        px = np.empty(len(d.image.pixels), dtype=np.float32); d.image.pixels.foreach_get(px); px = px.reshape(-1, 4)[:, :3]
        px = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4); mean = float((px @ np.array([0.2126, 0.7152, 0.0722])).mean()) or 0.2
        bw = nt.nodes.new("ShaderNodeRGBToBW"); nt.links.new(d.outputs["Color"], bw.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange"); mr.clamp = False; mr.inputs["From Min"].default_value = 0; mr.inputs["From Max"].default_value = mean
        mr.inputs["To Min"].default_value = 1 - norm; mr.inputs["To Max"].default_value = 1.0; nt.links.new(bw.outputs[0], mr.inputs["Value"])
        cv = nt.nodes.new("ShaderNodeCombineXYZ")
        for i in range(3): nt.links.new(mr.outputs[0], cv.inputs[i])
        nt.links.new(cv.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], b.inputs["Base Color"])
    for kind, sock in ((["rough"], "Roughness"), (["nor_gl", "nor"], None)):
        p = find(base, kind)
        if not p: continue
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(p, check_existing=True); t.image.colorspace_settings.name = "Non-Color"
        if sock: nt.links.new(t.outputs["Color"], b.inputs[sock])
        else: nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Emission Strength"].default_value = 0.0
    return m

def uv_world(bm, tile):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co; u, v = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)); l[uv].uv = (u / tile, v / tile)
def box(name, x0, x1, y0, y1, z0, z1, m, bevel=0.0, tile=1.0):
    # a box in the facade's frame: x along the wall, y up, z out of it (Blender: x, z, -y... kept simple: x, y up as z)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(x1 - x0, z1 - z0, y1 - y0), verts=bm.verts); bmesh.ops.translate(bm, vec=((x0 + x1) / 2, -(z0 + z1) / 2, (y0 + y1) / 2), verts=bm.verts)
    if bevel: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
    uv_world(bm, tile); me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m); return o

def bay_window(K, M, x0, w=1.05, h=1.55, sill_y=0.9, panes=(2, 2)):
    # cut: the opening, 12 cm deep into the wall; inside it the box frame, two sashes with their bars, the glass, curtains
    xc = x0 + 1.5; xa, xb, ya, yb = xc - w / 2, xc + w / 2, sill_y, sill_y + h
    cuts = [box("cut", xa, xb, ya, yb, -0.6, 0.2, M["trim"])]
    D = -0.12  # (the frame's face, set back in the reveal)
    for (a, b, c, d) in ((xa, xa + 0.07, ya, yb), (xb - 0.07, xb, ya, yb), (xa, xb, yb - 0.07, yb), (xa, xb, ya, ya + 0.06)): box("frame", a, b, c, d, D - 0.08, D, M["trim"], 0.006)
    mid = ya + h * 0.5
    box("meeting_rail", xa + 0.06, xb - 0.06, mid - 0.03, mid + 0.03, D - 0.05, D + 0.015, M["trim"], 0.004)
    for (s0, s1, dz) in ((ya + 0.06, mid - 0.03, D - 0.045), (mid + 0.03, yb - 0.07, D - 0.02)):  # (the two sashes, the top one outside the bottom)
        for k in range(1, panes[0]): xx = xa + 0.07 + (w - 0.14) * k / panes[0]; box("bar", xx - 0.013, xx + 0.013, s0, s1, dz - 0.03, dz, M["trim"])
        for k in range(1, panes[1]): yy = s0 + (s1 - s0) * k / panes[1]; box("bar", xa + 0.07, xb - 0.07, yy - 0.013, yy + 0.013, dz - 0.03, dz, M["trim"])
    box("glass", xa + 0.06, xb - 0.06, ya + 0.05, yb - 0.06, D - 0.075, D - 0.07, M["glass"])
    for s in (-1, 1): box("curtain", xc + s * (w / 2 - 0.2) - 0.13, xc + s * (w / 2 - 0.2) + 0.13, ya + 0.08, yb - 0.1, D - 0.069, D - 0.066, M["curtain"])
    box("room", xa - 0.1, xb + 0.1, ya - 0.1, yb + 0.1, -0.62, -0.6, M["room"])
    # the sill, standing out from the wall; over the head an arch of bricks set on end, or a stone lintel
    box("sill", xa - 0.12, xb + 0.12, ya - 0.11, ya + 0.0, -0.04, 0.07, M["sill"], 0.012, 0.6)
    if K["lintel"] == "arch":
        n = 9
        for k in range(n): a = xa - 0.1 + (w + 0.2) * k / n; box("arch", a + 0.004, a + (w + 0.2) / n - 0.004, yb, yb + 0.22, -0.01, 0.012, M["archbrick"], 0.004, 0.4)
    else: box("lintel", xa - 0.14, xb + 0.14, yb, yb + 0.2, -0.01, 0.025, M["sill"], 0.008, 0.6)
    return cuts
def bay_door(K, M, x0):
    xc = x0 + 1.5; w, h = 0.95, 2.1; xa, xb = xc - w / 2, xc + w / 2
    cuts = [box("cut", xa, xb, 0.0, h + 0.36, -0.6, 0.2, M["trim"])]
    box("door", xa + 0.02, xb - 0.02, 0.05, h, -0.2, -0.16, M["door"], 0.004)
    for (y0, y1) in ((0.2, 0.95), (1.1, 1.95)):
        for (a, b) in ((xa + 0.12, xc - 0.05), (xc + 0.05, xb - 0.12)): box("panel", a, b, y0, y1, -0.165, -0.15, M["door"], 0.01)
    box("knob", xb - 0.16, xb - 0.11, 1.0, 1.05, -0.15, -0.11, M["brass"]); box("letterplate", xc - 0.14, xc + 0.14, 1.0, 1.04, -0.15, -0.14, M["brass"])
    box("fan_glass", xa + 0.03, xb - 0.03, h + 0.06, h + 0.3, -0.2, -0.195, M["glass"]); box("transom", xa, xb, h, h + 0.06, -0.2, -0.14, M["trim"])
    # the door case: pilasters and a cornice standing out from the wall, a stone step
    for a in (xa - 0.16, xb): box("pilaster", a, a + 0.16, 0.05, h + 0.36, -0.02, 0.07, M["trim"], 0.008)
    box("cornice", xa - 0.24, xb + 0.24, h + 0.36, h + 0.5, -0.02, 0.13, M["trim"], 0.01)
    box("step", xa - 0.15, xb + 0.15, 0.0, 0.08, -0.2, 0.3, M["sill"], 0.01, 0.6)
    box("room", xa - 0.1, xb + 0.1, 0, h + 0.4, -0.62, -0.6, M["room"])
    return cuts
def bay_shop(K, M, x0):
    cuts = [box("cut", x0 + 0.25, x0 + 2.75, 0.45, 2.45, -0.6, 0.2, M["trim"])]
    box("fascia", x0 + 0.05, x0 + 2.95, 2.45, 2.95, -0.02, 0.12, M["fascia"], 0.01)
    box("fascia_cornice", x0, x0 + 3.0, 2.92, 3.0, -0.02, 0.16, M["trim"], 0.008)
    box("riser", x0 + 0.25, x0 + 2.75, 0.0, 0.45, -0.02, 0.06, M["fascia"], 0.008)
    for xx in (x0 + 0.25, x0 + 1.5 - 0.03, x0 + 2.75 - 0.06): box("mullion", xx, xx + 0.06, 0.45, 2.45, -0.12, -0.04, M["fascia"], 0.004)
    box("transom", x0 + 0.25, x0 + 2.75, 2.05, 2.1, -0.12, -0.04, M["fascia"])
    box("glass", x0 + 0.3, x0 + 2.7, 0.47, 2.43, -0.1, -0.095, M["glass"])
    box("room", x0 + 0.2, x0 + 2.8, 0.4, 2.5, -0.62, -0.6, M["shoproom"])
    return cuts
def bay_wide(K, M, x0):
    return bay_window(K, M, x0, w=1.7, h=1.55, panes=(3, 2))

def build(kind):
    K = KINDS[kind]
    M = {"wall": scanned(kind + "_wall", K["scan"], K["tint"], K.get("norm")), "trim": principled(kind + "_trim", K["trim"], 0.4), "sill": scanned(kind + "_sill", OUT + "/downloads/polyhaven-stone/large_sandstone_blocks_01", (0.95, 0.94, 0.9)),
         "glass": principled("glass", (0.035, 0.045, 0.055), 0.04, 0.0, 1.0), "curtain": principled("curtain", (0.62, 0.58, 0.5), 0.9), "room": principled("room", (0.025, 0.025, 0.028), 0.9),
         "shoproom": principled("shoproom", (0.09, 0.085, 0.08), 0.8), "door": principled(kind + "_door", K["door"], 0.35), "brass": principled("brass", (0.75, 0.55, 0.2), 0.3, 1.0),
         "fascia": principled(kind + "_fascia", (0.1, 0.16, 0.24), 0.4), "archbrick": scanned("archbrick", PH + "/red_brick_03", (0.8, 0.72, 0.68))}
    # the wall: five bays, 15 m by 3 m, 30 cm thick, its face at z = 0
    wall = box("wall", 0, 15, 0, 3, -0.3, 0.0, M["wall"], 0.0, K["tile"])
    cuts = []
    cuts += bay_window(K, M, 0.0); cuts += bay_door(K, M, 3.0); cuts += bay_shop(K, M, 6.0); cuts += bay_wide(K, M, 12.0)
    # (bay 4, 9 to 12 m, plain wall: a cast-iron downpipe down one side)
    box("downpipe", 11.82, 11.9, 0, 3, 0.02, 0.1, principled("iron", (0.03, 0.035, 0.04), 0.5, 0.3), 0.01)
    for c in cuts:
        b = wall.modifiers.new("cut", "BOOLEAN"); b.operation = "DIFFERENCE"; b.object = c; b.solver = "EXACT"
        bpy.context.view_layer.objects.active = wall; bpy.ops.object.modifier_apply(modifier=b.name); bpy.data.objects.remove(c, do_unlink=True)
    bm = bmesh.new(); bm.from_mesh(wall.data); bm.normal_update(); uv_world(bm, K["tile"]); bm.to_mesh(wall.data); bm.free()
    wall.data.materials.clear(); wall.data.materials.append(M["wall"])
    for poly in wall.data.polygons: poly.material_index = 0
    # the plane the atlas is baked onto, in front of everything, its UVs the atlas
    bpy.ops.mesh.primitive_plane_add(size=1.0); lo = bpy.context.active_object; lo.name = "atlas"
    lo.rotation_euler = (math.pi / 2, 0, 0); lo.scale = (15, 3, 1); lo.location = (7.5, -0.4, 1.5)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mb = bpy.data.materials.new("bake"); mb.use_nodes = True; lo.data.materials.append(mb)
    return lo

def bake(lo, kind):
    W, H = PX * 5, PX
    nt = lo.data.materials[0].node_tree; node = nt.nodes.new("ShaderNodeTexImage"); nt.nodes.active = node
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.0; sc.render.bake.max_ray_distance = 1.2; sc.render.bake.margin = 0
    out = {}
    hi = [o for o in bpy.data.objects if o.type == "MESH" and o is not lo]
    for t in ("DIFFUSE", "AO", "NORMAL", "ROUGHNESS", "EMIT"):
        sc.cycles.samples = {"DIFFUSE": 16, "AO": 96, "NORMAL": 8, "ROUGHNESS": 8, "EMIT": 4}[t]  # (only the shading needs many; the rest are flat colour, antialiased)
        im = bpy.data.images.new(f"{kind}_{t}", W, H)
        if t != "DIFFUSE": im.colorspace_settings.name = "Non-Color"
        node.image = im
        bpy.ops.object.select_all(action="DESELECT")
        for o in hi: o.select_set(True)
        lo.select_set(True); bpy.context.view_layer.objects.active = lo
        if t == "DIFFUSE": sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
        if t == "NORMAL": bpy.ops.object.bake(type=t, normal_space="TANGENT")
        else: bpy.ops.object.bake(type=t)
        buf = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(buf); out[t] = buf.reshape(H, W, 4)[:, :, :3].copy()
        print("BAKED", kind, t, flush=True)
    return out
def save(arr, path, srgb=True):
    im = bpy.data.images.new(os.path.basename(path), arr.shape[1], arr.shape[0])
    if not srgb: im.colorspace_settings.name = "Non-Color"
    px = np.ones((arr.shape[0], arr.shape[1], 4), dtype=np.float32); px[:, :, :3] = np.clip(arr, 0, 1); im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path; im.file_format = "JPEG"; im.save()
os.makedirs(OUT + "/exports/facades", exist_ok=True)
for kind in KINDS:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    lo = build(kind); maps = bake(lo, kind)
    ao = maps["AO"][:, :, :1] ** 0.85
    base = OUT + f"/exports/facades/facade_{kind}"
    save(maps["DIFFUSE"] * (0.3 + 0.7 * ao), base + "_diff.jpg"); save(maps["NORMAL"], base + "_nor.jpg", False)
    save(maps["ROUGHNESS"], base + "_rough.jpg", False); save(np.repeat(np.clip(maps["EMIT"].max(axis=2, keepdims=True) * 4, 0, 1), 3, axis=2), base + "_glass.jpg", False)
    print("FACADE", kind, flush=True)
print("FACADES DONE")
