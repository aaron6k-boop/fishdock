# FishDock: the ground cover of grass, rendered from modelled blades onto wide cards (exports/grass_field.png; the game
# ships it as public/textures/grass_field.webp, grassField.js). Where build_grass.py makes single clumps, this makes
# strips of continuous grass to lay thickly over a lawn or bank, each 1.2 m wide and 0.6 m tall, four in one picture
# (two by two, 1024 by 512 pixels each):
#   0  a lawn: dense short blades, 4 to 13 cm, a few yellowed
#   1  rough grass: blades to 34 cm with thin stems among them, a tenth dried
#   2  meadow grass: to 50 cm, stems with seed heads, more of it dried
#   3  short grass with flowers in it: daisies, buttercups, clover leaves and clover heads, their heads turned up
#      towards the eye as a lawn's are seen
# Every blade a strip from the root up, narrowing to a point, curving over as it rises; its colour from a darker,
# bluer green at the root to a lighter, yellower one at the tip, with some of its own, the greens taken from Poly
# Haven's photoscanned "Leafy Grass" (CC0); shaded darker towards the root, where the blades shade each other. Rendered
# unlit (the colour itself, as the game lights it) with the background clear.
import bpy, bmesh, math, os, random
import numpy as np
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"
SCAN = globals().get("SCAN", OUT + "/downloads/polyhaven/leafy_grass/textures/leafy_grass_diff_2k.jpg")
PX = globals().get("PX", 1024)  # pixels across a cell (1.2 m)
CW, CH = 1.2, 0.6
random.seed(5303)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection

# ---- the grass's own colours, from the photograph ----
img = bpy.data.images.load(SCAN, check_existing=True); px = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(px)
px = px.reshape(-1, 4)[:, :3]; px = np.where(px <= 0.04045, px / 12.92, ((px + 0.055) / 1.055) ** 2.4)
g = px[(px[:, 1] > px[:, 0] * 1.02) & (px[:, 1] > px[:, 2] * 1.1)]
DARK, LIGHT = np.percentile(g, 15, axis=0), np.percentile(g, 85, axis=0)
STRAW, DEAD = np.array([0.42, 0.34, 0.16]), np.array([0.26, 0.2, 0.11])
print("GRASS COLOURS dark", DARK.round(3), "light", LIGHT.round(3), flush=True)

class Part:
    # one bmesh for a cell, with a float colour on every corner
    def __init__(self, name):
        self.bm = bmesh.new(); self.cl = self.bm.loops.layers.float_color.new("col"); self.name = name
    def strip(self, pts, widths, side, colours):
        # a strip along pts (Vectors), each point's width and colour; side: the unit vector across it
        L, R = [], []
        for p, w in zip(pts, widths): L.append(self.bm.verts.new(p - side * w / 2)); R.append(self.bm.verts.new(p + side * w / 2))
        for i in range(len(pts) - 1):
            f = self.bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
            for l, c in zip(f.loops, (colours[i], colours[i], colours[i + 1], colours[i + 1])): l[self.cl] = (*np.clip(c, 0, 1), 1.0)
    def disc(self, centre, normal, radius, n, colour_fn, petal=False):
        # a flat flower head or leaf: a fan of n wedges round centre, facing normal; colour_fn(t, k) per point
        nrm = Vector(normal).normalized(); a = nrm.orthogonal().normalized(); b = nrm.cross(a)
        c = self.bm.verts.new(centre); ring = []
        for k in range(n):
            ang = 2 * math.pi * k / n; r = radius * ((0.55 + 0.45 * abs(math.cos(ang * (n / 2)))) if petal else 1.0)
            ring.append(self.bm.verts.new(Vector(centre) + (a * math.cos(ang) + b * math.sin(ang)) * r))
        for k in range(n):
            f = self.bm.faces.new((c, ring[k], ring[(k + 1) % n]))
            for i, l in enumerate(f.loops): l[self.cl] = (*np.clip(colour_fn(0.0 if i == 0 else 1.0, k), 0, 1), 1.0)
    def finish(self):
        me = bpy.data.meshes.new(self.name); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(self.name, me); col.objects.link(o); o.data.materials.append(MAT); return o

MAT = bpy.data.materials.new("grass_unlit"); MAT.use_nodes = True; nt = MAT.node_tree; nt.nodes.clear()
a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "col"; em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(a.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], out.inputs[0]); MAT.use_backface_culling = False

def blade(P, x0, z0, x, h, w, kind="green", seg=6, lean=None, bend=None):
    # one blade at x (metres along the cell), z0 its cell's foot; y (depth) at random
    d = Vector((random.uniform(-1, 1), random.uniform(-0.5, 0.5), 0)).normalized()
    lean = h * random.uniform(0.03, 0.25) if lean is None else lean; bend = h * random.uniform(0.0, 0.22) if bend is None else bend
    room = min(x - x0 - 0.02, x0 + CW - 0.02 - x) / max(abs(d.x), 1e-3)
    if lean + bend > room: s = max(room, 0) / (lean + bend); lean, bend = lean * s, bend * s
    base = Vector((x, random.uniform(-0.15, 0.15), z0))
    pts, widths, cols = [], [], []
    own = random.uniform(0.85, 1.15)
    for i in range(seg + 1):
        t = i / seg; out_ = lean * t + bend * t * t
        pts.append(base + Vector((d.x * out_, d.y * out_, h * t)))
        widths.append(w * (1 - t) ** 0.85 * (0.65 + 0.35 * math.sin(math.pi * min(1, t * 1.6 + 0.2))))
        c = (DARK * (1 - t) + LIGHT * t) * own
        if kind == "straw": c = c * 0.3 + STRAW * 0.7 * (0.75 + 0.25 * t)
        elif kind == "dead": c = c * 0.25 + DEAD * 0.75 * (0.8 + 0.2 * t)
        elif kind == "yellow": c = c * 0.6 + STRAW * 0.4 * (0.8 + 0.2 * t)
        c = c * (0.42 + 0.58 * min(1, t * 2.2))  # (shade low down, among the other blades)
        cols.append(c)
    P.strip(pts, widths, Vector((-d.y, d.x, 0)).normalized() if abs(d.y) > 1e-3 else Vector((0, 1, 0)), cols)
    return pts[-1]

def pick(dry):
    r = random.random(); return "straw" if r < dry * 0.7 else "dead" if r < dry else "yellow" if r < dry + 0.06 else "green"

def cell(k):
    cx, cz = (k % 2) * CW, (k // 2) * CH; P = Part(f"cell{k}"); X = lambda: random.uniform(cx + 0.03, cx + CW - 0.03)
    if k == 0:
        for _ in range(1500): blade(P, cx, cz, X(), random.uniform(0.04, 0.13), random.uniform(0.003, 0.005), pick(0.04))
    elif k == 1:
        for _ in range(950): blade(P, cx, cz, X(), random.uniform(0.1, 0.34), random.uniform(0.004, 0.007), pick(0.1))
        for _ in range(110): blade(P, cx, cz, X(), random.uniform(0.25, 0.4), 0.0022, pick(0.25), seg=5)  # (thin stems)
    elif k == 2:
        for _ in range(650): blade(P, cx, cz, X(), random.uniform(0.15, 0.5), random.uniform(0.004, 0.008), pick(0.18))
        for _ in range(70):
            tip = blade(P, cx, cz, X(), random.uniform(0.35, 0.55), 0.0025, pick(0.4), seg=6, bend=0.02)
            # a seed head: an oval of small husks round the stem's top, straw and a little purple
            for j in range(9):
                t = j / 8; p = tip + Vector((random.uniform(-0.006, 0.006), random.uniform(-0.006, 0.006), -0.05 * t))
                hue = np.array([0.36, 0.28, 0.2]) * random.uniform(0.8, 1.15) + (np.array([0.08, 0.0, 0.06]) if random.random() < 0.4 else 0)
                P.disc(p, (random.uniform(-1, 1), -1.0, random.uniform(-0.3, 0.3)), random.uniform(0.004, 0.007), 5, lambda tt, kk, c=hue: c * (0.8 + 0.2 * tt))
    else:
        for _ in range(550): blade(P, cx, cz, X(), random.uniform(0.05, 0.16), random.uniform(0.003, 0.005), pick(0.05))
        view = Vector((0.0, -1.0, 1.1))  # (heads turned up towards an eye above and in front)
        for _ in range(16):  # daisies
            x = X(); h = random.uniform(0.05, 0.12); tip = blade(P, cx, cz, x, h, 0.0022, "green", seg=4, lean=0.005, bend=0.005)
            nrm = (view + Vector((random.uniform(-0.3, 0.3), 0, random.uniform(-0.2, 0.2)))).normalized()
            P.disc(tip + nrm * 0.001, nrm, random.uniform(0.008, 0.012), 16, lambda tt, kk: np.array([0.86, 0.85, 0.82]) * (0.75 + 0.25 * tt) + (np.array([0.0, -0.1, -0.06]) * tt if kk % 3 == 0 else 0), petal=True)
            P.disc(tip + nrm * 0.002, nrm, 0.0032, 8, lambda tt, kk: np.array([0.85, 0.6, 0.04]))
        for _ in range(11):  # buttercups, on taller branched stalks
            x = X(); h = random.uniform(0.14, 0.28); tip = blade(P, cx, cz, x, h, 0.0024, "green", seg=5, lean=0.01, bend=0.01)
            nrm = (view + Vector((random.uniform(-0.4, 0.4), 0, random.uniform(-0.3, 0.3)))).normalized()
            P.disc(tip, nrm, random.uniform(0.008, 0.011), 10, lambda tt, kk: np.array([0.95, 0.72, 0.02]) * (0.7 + 0.3 * tt), petal=True)
        for _ in range(14):  # clover leaves, low down
            x = X(); z = cz + random.uniform(0.01, 0.05)
            for j in range(3):
                ang = 2 * math.pi * j / 3 + random.uniform(0, 1); off = Vector((math.cos(ang) * 0.007, 0, math.sin(ang) * 0.004))
                P.disc(Vector((x, -0.16, z)) + off, (0, -1, 0.9), 0.0065, 10, lambda tt, kk: (DARK * 0.9 + np.array([0.02, 0.05, 0.0])) * (0.8 + 0.4 * tt) + (np.array([0.12, 0.14, 0.1]) if 0.4 < tt < 0.7 else 0))
        for _ in range(6):  # clover heads
            x = X(); h = random.uniform(0.05, 0.1); tip = blade(P, cx, cz, x, h, 0.002, "green", seg=4, lean=0.004, bend=0.004)
            P.disc(tip, (0, -1, 0.6), 0.008, 12, lambda tt, kk: np.array([0.86, 0.78, 0.82]) * (0.65 + 0.35 * tt), petal=True)
    return P.finish()

for k in range(4): cell(k)
# ---- render: orthographic from the side, the background clear ----
sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
sc.render.film_transparent = True; sc.view_settings.view_transform = "Standard"; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.resolution_x, sc.render.resolution_y = PX * 2, PX
try: sc.render.filter_size = 1.2
except Exception: pass
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); col.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = CW * 2; cam.location = (CW, -5, CH); cam.rotation_euler = (math.pi / 2, 0, 0)
os.makedirs(OUT + "/exports", exist_ok=True)
sc.render.filepath = OUT + "/exports/grass_field.png"; bpy.ops.render.render(write_still=True)
print("FIELD DONE", os.path.getsize(OUT + "/exports/grass_field.png") // 1000, "kB", flush=True)
