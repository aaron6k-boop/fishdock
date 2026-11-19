# FishDock: the top of a British chimney stack, modelled (public/models/chimney_caps.glb)
# The game builds each house's chimney stack as a brick box 0.6 m square (buildings3d.js chimneyBox); this is what sits
# on top of it, at its real size: two courses of brick oversailing the stack (each 75 mm, the first standing out 40 mm,
# the second 80 mm), a course set back, the cement flaunching sloping up to the pots, and two clay chimney pots, round
# and tapering, a roll at the rim and dark inside. Two levels: "cap_near" (16 sides to a pot, bevelled) and "cap_far"
# (6 sides, no bevels) for further off. Materials: "brick" (the game lays its photographed red brick on it, so its UVs
# are by world position, 1.5 m a tile, as the stack's) and "pot" (vertex colours: terracotta, the cement, the soot
# inside; a little darker where the parts meet, as the shade there would be).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
OUT = "C:/Users/aaron/Documents/FishDock-assets"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection
TILE = 1.5
TERRA, CEMENT, SOOT = (0.42, 0.16, 0.08), (0.36, 0.35, 0.33), (0.03, 0.025, 0.02)

def mat(name, vc=False, rgb=(0.8, 0.8, 0.8), rough=0.85):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough
    if vc:
        a = m.node_tree.nodes.new("ShaderNodeVertexColor"); a.layer_name = "Col"; m.node_tree.links.new(a.outputs["Color"], b.inputs["Base Color"])
    return m
M_BRICK, M_POT = mat("brick", rgb=(0.45, 0.2, 0.15), rough=0.9), mat("pot", vc=True, rough=0.8)

def uv_world(bm):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co; u, v = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)); l[uv].uv = (u / TILE, v / TILE)

def paint(bm, rgb, shade_low=None):
    # vertex colour for every loop; shade_low: (z0, z1, k) darker towards z0 (where a part meets the one below)
    cl = bm.loops.layers.float_color.get("Col") or bm.loops.layers.float_color.new("Col")
    for f in bm.faces:
        for l in f.loops:
            k = 1.0
            if shade_low: z0, z1, kk = shade_low; t = min(1, max(0, (l.vert.co.z - z0) / max(1e-4, z1 - z0))); k = kk + (1 - kk) * t
            l[cl] = (rgb[0] * k, rgb[1] * k, rgb[2] * k, 1.0)

def to_obj(bm, name, m):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m); return o

def slab(bm, w, z0, z1, bevel=0.0):
    r = bmesh.ops.create_cube(bm, size=1.0); vs = r["verts"]
    bmesh.ops.scale(bm, vec=(w, w, z1 - z0), verts=vs); bmesh.ops.translate(bm, vec=(0, 0, (z0 + z1) / 2), verts=vs)
    if bevel:
        es = list({e for v in vs for e in v.link_edges}); bmesh.ops.bevel(bm, geom=es, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)

def pot(bm, cx, cy, z0, h, r0, r1, seg, roll=True, hollow=True):
    # a round pot from z0 up h, radius r0 at its foot to r1 at its rim; a roll round the rim; the inside open and dark
    rings = [(0.0, r0), (0.12, r0 * 0.97), (0.9, r1), (1.0, r1 * (1.12 if roll else 1.0)), (1.04, r1 * 1.1 if roll else r1)]
    if not roll: rings = [(0.0, r0), (1.0, r1)]
    loops = []
    for t, r in rings:
        loops.append([bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z0 + h * t)) for a in [2 * math.pi * k / seg for k in range(seg)]])
    for a, b in zip(loops, loops[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    top = loops[-1]; zt = top[0].co.z
    if hollow:
        inner = [bm.verts.new((cx + r1 * 0.82 * math.cos(2 * math.pi * k / seg), cy + r1 * 0.82 * math.sin(2 * math.pi * k / seg), zt - 0.005)) for k in range(seg)]
        for k in range(seg): bm.faces.new((top[k], top[(k + 1) % seg], inner[(k + 1) % seg], inner[k]))
        deep = [bm.verts.new((v.co.x, v.co.y, zt - 0.25)) for v in inner]
        for k in range(seg): bm.faces.new((inner[k], inner[(k + 1) % seg], deep[(k + 1) % seg], deep[k]))
        bm.faces.new(deep)  # (its floor, facing up)
        return
    bm.faces.new(top)

def build(level):
    near = level == "near"; seg = 16 if near else 6
    # ---- the brick: the courses oversailing the stack, one set back ----
    bm = bmesh.new()
    slab(bm, 0.68, 0.0, 0.075, 0.006 if near else 0); slab(bm, 0.76, 0.075, 0.15, 0.006 if near else 0); slab(bm, 0.66, 0.15, 0.225, 0.006 if near else 0)
    uv_world(bm); brick = to_obj(bm, f"cap_{level}_brick", M_BRICK)
    # ---- the flaunching and the pots (vertex coloured) ----
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.33 * math.sqrt(2), radius2=0.2 * math.sqrt(2), depth=0.07)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, "Z"), verts=r["verts"]); bmesh.ops.translate(bm, vec=(0, 0, 0.225 + 0.035), verts=r["verts"])
    paint(bm, CEMENT, (0.225, 0.3, 0.7))
    cement = bm
    pots = bmesh.new()
    for cx, h, r0, r1 in ((-0.15, 0.48, 0.115, 0.095), (0.15, 0.6, 0.12, 0.1)):
        pot(pots, cx, 0.0, 0.26, h, r0, r1, seg, roll=near, hollow=near)
    pots.normal_update()
    # (colours: terracotta, darker at the foot where the flaunching meets it; the inside sooty)
    cl = pots.loops.layers.float_color.new("Col")
    for f in pots.faces:
        for l in f.loops:
            k = 0.65 + 0.35 * min(1, (l.vert.co.z - 0.26) / 0.12)
            l[cl] = (TERRA[0] * k, TERRA[1] * k, TERRA[2] * k, 1.0)
    if near:
        # (the inside of each pot: the faces facing in towards its axis, below the rim)
        for f in pots.faces:
            cxy = f.calc_center_median()
            ax = -0.15 if cxy.x < 0 else 0.15
            radial = Vector((cxy.x - ax, cxy.y)); n2 = Vector((f.normal.x, f.normal.y))
            if (radial.length > 1e-4 and n2.length > 1e-4 and radial.dot(n2) < 0) or (f.normal.z > 0.9 and radial.length < 0.09):
                for l in f.loops: l[cl] = (*SOOT, 1.0)
    me1 = bpy.data.meshes.new("c"); cement.to_mesh(me1); cement.free()
    me2 = bpy.data.meshes.new("p"); pots.to_mesh(me2); pots.free()
    o1 = bpy.data.objects.new(f"cap_{level}_pot", me1); col.objects.link(o1)
    o2 = bpy.data.objects.new("tmp", me2); col.objects.link(o2)
    bpy.ops.object.select_all(action="DESELECT"); o1.select_set(True); o2.select_set(True); bpy.context.view_layer.objects.active = o1; bpy.ops.object.join()
    o1.data.materials.clear(); o1.data.materials.append(M_POT)
    for p in o1.data.polygons: p.use_smooth = near
    if near:
        try: o1.data.set_sharp_from_angle(angle=math.radians(40))
        except Exception: pass
    return brick, o1

objs = []
for lv in ("near", "far"):
    b, p = build(lv); objs += [b, p]
for o in objs:
    print("PART", o.name, len(o.data.polygons), "faces", flush=True)
os.makedirs(OUT + "/exports", exist_ok=True)
path = OUT + "/exports/chimney_caps.glb"
bpy.ops.object.select_all(action="DESELECT")
for o in objs: o.select_set(True)
kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
for extra in ({"export_vertex_color": "ACTIVE"}, {"export_colors": True}, {}):
    try: bpy.ops.export_scene.gltf(**kw, **extra); break
    except TypeError: continue
print("CHIMNEYS DONE", os.path.getsize(path) // 1000, "kB", flush=True)
