# FishDock: species fish bodies, modelled in Blender from FishDock's own species pictures, exported as fish.glb
# For each species (cod, bass, whiting, mackerel, plaice, pollack) the outline comes from its picture (the body's top
# and bottom edges with the fins taken off, the fins and the tail as their own pieces: fish3d.js fishShape, saved to
# shapes.json). Here the body is lofted round in section with the species' own thickness, a fuller belly and a narrower
# back, a tapered head and a pinched tail root; smoothed with a subdivision pass; the eyes are real domes standing
# proud of the head (their own glossy material); the fins and the tail are thin plates. Everything is in units of the
# fish's length, in three.js's frame (x from the snout, 0, to the tail tip, 1; y up; z out of the picture), the uvs
# the picture's own (x / w, y / h from the top left), so fish3d/angler.js lays the picture over it and bends it as before.
import bpy, bmesh, json, math, os
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"
SH = json.load(open(OUT + "/source/fish/shapes.json"))
P = lambda x, y, z: Vector((x, -z, y))
WIDTH = {"cod": 0.6, "bass": 0.42, "whiting": 0.45, "mackerel": 0.6, "plaice": 0.13, "pollack": 0.5}
# where the eye is in each picture (480 x 320, as FishDock draws it: plaice turned to face left), and its radius
EYES = {"cod": (88, 150, 9), "bass": (72, 157, 9), "whiting": (68, 158, 8), "mackerel": (73, 150, 9), "pollack": (80, 155, 9), "plaice": [(55, 135, 5), (65, 141, 5)]}
FLAT = {"plaice"}

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection
def mat(name, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough; b.inputs["Base Color"].default_value = (0.8, 0.8, 0.8, 1); return m
M_BODY, M_EYE, M_FIN = mat("fish_body", 0.45), mat("fish_eye", 0.06), mat("fish_fin", 0.5)
smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))

def build(sp, S):
    w, h, x0, xp, L, sy = S["w"], S["h"], S["x0"], S["xp"], S["L"], S["spineY"]
    T, B = S["top"], S["bot"]; flat = sp in FLAT; width = WIDTH[sp]
    toU = lambda x: (x - x0) / L; toY = lambda y: -(y - sy) / L
    me = bpy.data.meshes.new("fish_" + sp); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
    K, Mr = 30, 18
    rings, vuv = [], {}
    for i in range(K):
        t = i / (K - 1); x = x0 + (xp - x0) * (0.5 - 0.5 * math.cos(math.pi * t)); xi = int(max(x0, min(xp, round(x))))
        u = toU(x); tp, bt = T[xi], B[xi]; c, a = (tp + bt) / 2, max(0.6, (bt - tp) / 2)
        up = u / max(0.01, toU(xp))
        if flat: taper = 0.55 + 0.45 * smooth(0, 0.14, u)
        else: taper = (0.42 + 0.58 * smooth(0.0, 0.24, u)) * (1 - 0.6 * smooth(0.55, 1.0, up))
        b = a * width * taper
        ring = []
        for j in range(Mr):
            th = j / Mr * math.pi * 2; cs, sn = math.cos(th), math.sin(th)
            yImg = c - a * cs
            # a fuller belly and a narrower back (round fish); flatfish domed in the middle, thin to the edges
            if flat: zf = (1 - abs(cs) ** 3) ** 0.5
            else: zf = (1 + 0.16 * max(0.0, -cs)) * (1 - 0.22 * max(0.0, cs) ** 2)
            v = bm.verts.new(P(u, toY(yImg), b * sn * zf / L)); ring.append(v); vuv[v] = (x / w, 1 - yImg / h)
        rings.append(ring)
    faces = []
    for i in range(K - 1):
        for j in range(Mr):
            a1, b1, c1, d1 = rings[i][j], rings[i][(j + 1) % Mr], rings[i + 1][(j + 1) % Mr], rings[i + 1][j]
            faces.append(bm.faces.new((a1, d1, c1, b1)))
    # the snout and the tail root closed
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        cen = sum((v.co for v in ring), Vector()) / len(ring); cv = bm.verts.new(cen)
        cx = sum(vuv[v][0] for v in ring) / len(ring); cy = sum(vuv[v][1] for v in ring) / len(ring); vuv[cv] = (cx, cy)
        if rev: cv.co.x -= 0.004  # (a rounded tip, not a flat cut)
        for j in range(Mr):
            f = bm.faces.new((cv, ring[(j + 1) % Mr], ring[j]) if rev else (cv, ring[j], ring[(j + 1) % Mr])); faces.append(f)
    for f in faces:
        f.material_index = 0
        for lp in f.loops: lp[uvl].uv = vuv[lp.vert]
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bm.to_mesh(me); bm.free()
    body = bpy.data.objects.new("fish_" + sp + "_body", me); col.objects.link(body); me.materials.append(M_BODY)
    for p in me.polygons: p.use_smooth = True
    sub = body.modifiers.new("smooth", "SUBSURF"); sub.levels = 1; sub.render_levels = 1; sub.uv_smooth = "PRESERVE_BOUNDARIES"
    parts = [body]

    # the fins and the tail: thin plates on the fish's middle plane (their shape is the picture's alpha)
    def plate(name, box, nx=8, ny=6):
        bx0, by0, bx1, by1 = box
        pm = bpy.data.meshes.new(name); bmp = bmesh.new(); ul = bmp.loops.layers.uv.new("UVMap"); grid = []
        for jj in range(ny + 1):
            row = []
            for ii in range(nx + 1):
                xx = bx0 - 1 + (bx1 - bx0 + 2) * ii / nx; yy = by0 - 1 + (by1 - by0 + 2) * jj / ny
                v = bmp.verts.new(P(toU(xx), toY(yy), 0)); row.append((v, (xx / w, 1 - yy / h)))
            grid.append(row)
        for jj in range(ny):
            for ii in range(nx):
                q = (grid[jj][ii], grid[jj][ii + 1], grid[jj + 1][ii + 1], grid[jj + 1][ii])
                f = bmp.faces.new([e[0] for e in q])
                for lp, e in zip(f.loops, q): lp[ul].uv = e[1]
        bmp.to_mesh(pm); bmp.free()
        o = bpy.data.objects.new(name, pm); col.objects.link(o); pm.materials.append(M_FIN); return o
    for k, f in enumerate(S["fins"]): parts.append(plate(f"fish_{sp}_fin{k}", f["box"]))
    if S["tail"]: parts.append(plate(f"fish_{sp}_tail", S["tail"], 10, 10))

    # the eyes: domes standing proud of the head on each side (for a flatfish, both on its upper side)
    eyes = EYES[sp] if isinstance(EYES[sp], list) else [EYES[sp]]
    for k, (ex, ey, er) in enumerate(eyes):
        for side in ((1,) if flat else (1, -1)):
            xi = int(max(x0, min(xp, round(ex)))); tp, bt = T[xi], B[xi]; c, a = (tp + bt) / 2, max(0.6, (bt - tp) / 2)
            u = toU(ex)
            taper = (0.55 + 0.45 * smooth(0, 0.14, u)) if flat else (0.42 + 0.58 * smooth(0.0, 0.24, u))
            cs = max(-1, min(1, (c - ey) / a)); zs = a * width * taper * math.sqrt(max(0.0, 1 - cs * cs)) * ((1 - abs(cs) ** 3) ** 0.5 if flat else (1 - 0.22 * max(0.0, cs) ** 2))
            em = bpy.data.meshes.new(f"eye{k}{side}"); bme = bmesh.new(); ul = bme.loops.layers.uv.new("UVMap")
            r = er / L; bmesh.ops.create_uvsphere(bme, u_segments=16, v_segments=10, radius=r)
            for v in bme.verts:
                v.co.y *= 0.45  # a dome, not a ball (blender y is three's -z: the axis out of the flank)
            for f in bme.faces:
                for lp in f.loops:
                    co = lp.vert.co; lp[ul].uv = ((ex + co.x * L) / w, 1 - (ey - co.z * L) / h)
            bme.to_mesh(em); bme.free()
            eo = bpy.data.objects.new(f"fish_{sp}_eye{k}{'L' if side > 0 else 'R'}", em); col.objects.link(eo); em.materials.append(M_EYE)
            eo.location = P(u, toY(ey), side * (zs / L + r * 0.05))
            for p in em.polygons: p.use_smooth = True
            parts.append(eo)
    # one object per species (a material each for body, fins and eyes), its origin at the snout
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True); bpy.context.view_layer.objects.active = o
        for mo in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mo.name)
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = body; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = "fish_" + sp
    tri = sum(len(p.vertices) - 2 for p in j.data.polygons)
    print("FISH", sp, len(j.data.vertices), "verts", tri, "tris")
    return j

made = [build(sp, SH[sp]) for sp in ["cod", "bass", "whiting", "mackerel", "plaice", "pollack"]]
for k, o in enumerate(made): o.location.z = k * 0.3  # (laid out for a look in Blender; exported at the origin)
os.makedirs(OUT + "/source/fish", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/fish/fish.blend")
for o in made: o.location = Vector((0, 0, 0))
bpy.ops.export_scene.gltf(filepath=OUT + "/exports/fish.glb", export_format="GLB", export_apply=True, export_yup=True, export_cameras=False, export_lights=False, export_normals=True, export_texcoords=True, export_materials="EXPORT", export_image_format="NONE")
for k, o in enumerate(made): o.location.z = k * 0.3
print("FISH DONE", os.path.getsize(OUT + "/exports/fish.glb") // 1000, "kB")
