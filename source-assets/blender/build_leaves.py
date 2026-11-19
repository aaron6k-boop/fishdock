# FishDock: a cluster of leaves for the trees' leaf cards (trees3d.js), modelled and rendered (exports/leaf_cluster.png;
# shipped as public/textures/leaf_cluster.webp). Twigs branch from the middle, each set with leaves along it: ovate,
# pointed, toothed, a little cupped and curled, turned every way; seen face on from the light's side. Rendered in grey
# (the light and dark only: each tree's species and its own tint colour them in the game), the leaves nearer the
# middle and further back darker, the midrib and veins darker, a turned leaf's paler underside, with the background
# clear, 1024 px square, about 0.9 m across.
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"
PX = globals().get("PX", 1024)
random.seed(4441)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection
bm = bmesh.new(); cl = bm.loops.layers.float_color.new("col")

def leaf(base, direction, normal, L, shade):
    # an ovate leaf from base along direction, facing normal: a fan of wedges round its midrib, its edge toothed
    d = direction.normalized(); n = normal.normalized(); s = n.cross(d).normalized()
    n = d.cross(s).normalized()  # (square to the midrib)
    pts = []; seg = 9
    for i in range(seg + 1):
        t = i / seg; w = L * 0.36 * math.sin(math.pi * min(1, t ** 0.8)) * (1 - 0.25 * t)
        tooth = 1 + (0.08 if i % 2 else -0.04)
        cup = n * (w * 0.25)  # (cupped: its edges raised)
        pts.append((base + d * (L * t), w * tooth, cup))
    mid = [bm.verts.new(p) for p, _, _ in pts]
    left = [bm.verts.new(p - s * w + cup) for p, w, cup in pts]; right = [bm.verts.new(p + s * w + cup) for p, w, cup in pts]
    under = random.random() < 0.15  # (turned over: its paler underside towards the eye)
    for i in range(seg):
        for side in (left, right):
            f = bm.faces.new((mid[i], side[i], side[i + 1], mid[i + 1]) if side is right else (mid[i], mid[i + 1], side[i + 1], side[i]))
            for l in f.loops:
                vein = 0.82 if l.vert in mid else 1.0  # (the midrib darker)
                edge = 0.92 + 0.08 * (1 if l.vert not in mid else 0)
                v = shade * vein * edge * (1.25 if under else 1.0) * random.uniform(0.97, 1.03)
                l[cl] = (v, v, v, 1.0)

def twig(start, direction, length, depth):
    pts = []; p = Vector(start); d = Vector(direction).normalized()
    for i in range(10):
        d = (d + Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(-0.1, 0.1)))).normalized()
        p = p + d * (length / 10); pts.append((p.copy(), d.copy()))
    # (the twig itself, a thin dark strip)
    for (p0, d0), (p1, _) in zip(pts, pts[1:]):
        s = Vector((-d0.y, d0.x, 0)).normalized() * 0.004
        f = bm.faces.new((bm.verts.new(p0 - s), bm.verts.new(p0 + s), bm.verts.new(p1 + s), bm.verts.new(p1 - s)))
        for l in f.loops: l[cl] = (0.18, 0.18, 0.18, 1.0)
    for k, (p, d) in enumerate(pts[2:]):
        for side in (-1, 1):
            if random.random() < 0.15: continue
            a = Vector((-d.y, d.x, 0)) * side; ld = (d * 0.45 + a).normalized()
            r = p.length / 0.45  # (out from the middle: lighter; the middle in the cluster's own shade)
            shade = 0.45 + 0.45 * min(1, r) + 0.1 * random.random()
            nrm = Vector((random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), 1.0))
            leaf(p, ld, nrm, random.uniform(0.05, 0.085), shade)
        if depth and k in (2, 5) and random.random() < 0.7:
            twig(p, (d + Vector((-d.y, d.x, 0)) * random.choice((-1, 1))).normalized(), length * 0.55, depth - 1)

for k in range(7):
    a = 2 * math.pi * k / 7 + random.uniform(-0.3, 0.3)
    twig(Vector((0, 0, 0)), Vector((math.cos(a), math.sin(a), 0)), random.uniform(0.3, 0.42), 1)
me = bpy.data.meshes.new("leaves"); bm.to_mesh(me); bm.free()
o = bpy.data.objects.new("leaves", me); col.objects.link(o)
m = bpy.data.materials.new("leaf_unlit"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = "col"; em = nt.nodes.new("ShaderNodeEmission"); out = nt.nodes.new("ShaderNodeOutputMaterial")
nt.links.new(a.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], out.inputs[0]); o.data.materials.append(m)
sc = bpy.context.scene
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
sc.render.film_transparent = True; sc.view_settings.view_transform = "Standard"; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.resolution_x = sc.render.resolution_y = PX
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); col.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 0.95; cam.location = (0, 0, 5); cam.rotation_euler = (0, 0, 0)
os.makedirs(OUT + "/exports", exist_ok=True)
sc.render.filepath = OUT + "/exports/leaf_cluster.png"; bpy.ops.render.render(write_still=True)
print("LEAVES DONE", os.path.getsize(OUT + "/exports/leaf_cluster.png") // 1000, "kB", flush=True)
