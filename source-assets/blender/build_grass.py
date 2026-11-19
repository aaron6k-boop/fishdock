# FishDock: tufts of grass, rendered from modelled blades onto cards (exports/grass_tufts.png; the game ships it as
# public/textures/grass_tufts.webp, the blades' colour bled out into the clear background so its smaller copies keep
# green edges, not dark ones: grassTufts.js)
# Four tufts side by side in one picture, each 512 px square for 0.6 m: a few hundred blades each, curved, tapering,
# leaning out from the root, of differing heights (a meadow grass clump; a coarser coastal one with seed heads; a short
# lawn tuft; a dried, straw-coloured one), seen from the side. Every blade's colour runs from a darker, bluer green at
# the root to a lighter, yellower one at the tip, with a little of each blade's own; the grass's colours are taken from
# Poly Haven's photoscanned "Leafy Grass" (CC0). Each quarter is 0.6 m across and 0.6 m tall, the ground along its foot
# (at 1 m the tufts filled only its lower half and middle quarter). Rendered unlit (the colour itself, as the game lights it) with the
# background left clear, so the game draws them on crossed cards near the camera, swaying in the wind.
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"
SCAN = globals().get("SCAN", OUT + "/downloads/polyhaven/leafy_grass/textures/leafy_grass_diff_2k.jpg")
PX = globals().get("PX", 512)
random.seed(4027)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection

# ---- the grass's own colours, from the photograph: its greens, light and dark ----
img = bpy.data.images.load(SCAN, check_existing=True); px = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(px)
px = px.reshape(-1, 4)[:, :3]; px = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)  # (stored as sRGB)
g = px[(px[:, 1] > px[:, 0] * 1.02) & (px[:, 1] > px[:, 2] * 1.1)]  # (the green pixels)
dark, light = np.percentile(g, 15, axis=0), np.percentile(g, 85, axis=0)
print("GRASS COLOURS dark", dark.round(3), "light", light.round(3), flush=True)

def blade_mesh(bm, base, h, w, lean_dir, lean, bend, seg=6):
    # a strip from the root up, narrowing to a point, curving over as it rises; vertex colour by height
    pts = []
    for i in range(seg + 1):
        t = i / seg; y = h * t; out = lean * t + bend * t * t
        pts.append(Vector((base.x + lean_dir.x * out, base.y + lean_dir.y * out, y)))
    side = Vector((-lean_dir.y, lean_dir.x, 0)).normalized()
    left, right = [], []
    for i, p in enumerate(pts):
        t = i / seg; ww = w * (1 - t) ** 0.8 * (0.6 + 0.4 * math.sin(math.pi * min(1, t * 1.6 + 0.2)))
        left.append(bm.verts.new(p - side * ww / 2)); right.append(bm.verts.new(p + side * ww / 2))
    for i in range(seg): bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    return left + right

def tuft(kind, x0):
    bm = bmesh.new(); colr = bm.loops.layers.float_color.new("col")  # (float: a byte colour layer is read as sRGB, and darkened the linear colours given it)
    n, hmin, hmax, w, spread = {"meadow": (380, 0.18, 0.5, 0.009, 0.14), "coastal": (260, 0.25, 0.52, 0.006, 0.1),
                                "lawn": (460, 0.07, 0.17, 0.008, 0.2), "dry": (300, 0.15, 0.42, 0.006, 0.12)}[kind]
    for k in range(n):
        r = spread * math.sqrt(random.random()); a = random.random() * math.tau
        base = Vector((x0 + r * math.cos(a), r * math.sin(a) * 0.4, 0))
        d = Vector((math.cos(a) + random.uniform(-0.5, 0.5), math.sin(a) * 0.4, 0)).normalized()
        h = random.uniform(hmin, hmax) * (1 - 0.4 * r / spread)
        lean, bend = h * random.uniform(0.05, 0.3), h * random.uniform(0.0, 0.2)
        room = (0.28 - abs(base.x - x0)) / max(abs(d.x), 1e-3)  # (kept inside its quarter, so no blade is cut off at the edge)
        if lean + bend > room: s = max(room, 0) / (lean + bend); lean, bend = lean * s, bend * s
        verts = blade_mesh(bm, base, h, w * random.uniform(0.7, 1.3), d, lean, bend)
        own = random.uniform(0.85, 1.15); dry = random.random() < (0.85 if kind == "dry" else 0.12 if kind != "lawn" else 0.05)
        for f in {f for v in verts for f in v.link_faces}:
            for l in f.loops:
                t = l.vert.co.z / max(h, 1e-3)
                c = (dark * (1 - t) + light * t) * own
                if dry: c = c * 0.35 + np.array([0.42, 0.34, 0.16]) * 0.65 * (0.7 + 0.3 * t)
                c = c * (0.55 + 0.45 * min(1, t * 2.5))  # (shade at the root, among the other blades)
                l[colr] = (*np.clip(c, 0, 1), 1.0)
    me = bpy.data.meshes.new(kind); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(kind, me); col.objects.link(o)
    m = bpy.data.materials.new("grass_" + kind); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "col"; em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(attr.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], out.inputs[0]); m.use_backface_culling = False
    o.data.materials.append(m)
    return o

kinds = ["meadow", "coastal", "lawn", "dry"]
for i, k in enumerate(kinds): tuft(k, i * 0.6)
# ---- render: orthographic, from the side, the clear background kept ----
sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
sc.render.film_transparent = True; sc.view_settings.view_transform = "Standard"; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.resolution_x, sc.render.resolution_y = PX * 4, PX
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); col.objects.link(cam); sc.camera = cam
# (the frame is 2.4 m by 0.6 m, from the ground up: each tuft in its own quarter)
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.4; cam.location = (0.9, -5, 0.3); cam.rotation_euler = (math.pi / 2, 0, 0)
os.makedirs(OUT + "/exports", exist_ok=True)
sc.render.filepath = OUT + "/exports/grass_tufts.png"; bpy.ops.render.render(write_still=True)
print("GRASS DONE", os.path.getsize(OUT + "/exports/grass_tufts.png") // 1000, "kB", flush=True)
