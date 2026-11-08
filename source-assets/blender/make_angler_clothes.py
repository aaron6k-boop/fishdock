# FishDock: your angler's own clothes, made in Blender on a Rocketbox person (MIT licence) so the existing walks and
# poses still fit. From the person's body: a fishing jacket (to the hip, with a collar and cuffs), trousers and
# wellies, each a separate skinned mesh (the body's own bone weights, so they move with it), smoothed into cloth rather
# than following every contour of the body, given thickness at their edges, box-mapped for a tiling fabric. Saved as a
# .blend and exported as a .glb with the person, plus front and side renders to check.
import bpy, bmesh, os, math, traceback
from mathutils import Vector

OUT = "C:/Users/aaron/Documents/FishDock-assets"
WHO = globals().get("WHO", "m05")
SRC = f"{OUT}/source/people/{WHO}.glb"
TEX = f"{OUT}/downloads/polyhaven"
log = []
def L(*a):
    log.append(" ".join(map(str, a))); print(*a)

# region by bone: which bones each garment follows
ARM = ("UpperArm", "Forearm", "Clavicle")
TORSO = ("Spine", "Spine1", "Spine2", "Neck", "Pelvis")
LEG = ("Thigh", "Calf")
FOOT = ("Foot", "Toe0")
HEAD = ("Head", "Neck")

def kind_of(name):
    # by what the bone's name contains (twist and helper bones go with their limb)
    n = name.replace("Bip01_", "")
    if "Hand" in n or "Finger" in n: return "hand"
    if "Forearm" in n or "UpperArm" in n or "Elbow" in n: return "arm"
    if "Clavicle" in n or "Spine" in n or "Pelvis" in n: return "torso"
    if "Neck" in n: return "neck"
    if "Thigh" in n or "Knee" in n: return "thigh"
    if "Calf" in n: return "calf"
    if "Foot" in n or "Toe" in n: return "foot"
    if n in ("Bip01", ""): return "torso"
    return "head"

try:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.images):
        for d in list(blk): blk.remove(d)
    bpy.ops.import_scene.gltf(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    L("body", body.name, len(body.data.vertices), [m.name for m in body.data.materials])
    mw = body.matrix_world
    S = mw.to_scale().x
    # (where the vertices are as shown, posed by the skeleton: the mesh's own numbers are at another scale and place)
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); em = ev.to_mesh()
    ws = [ev.matrix_world @ v.co for v in em.vertices]
    ev.to_mesh_clear()
    zmin = min(p.z for p in ws); zmax = max(p.z for p in ws); H = zmax - zmin
    L("height (m)", round(H, 3), "object scale", round(S, 5))
    gname = {g.index: g.name for g in body.vertex_groups}
    L("bones not head-kind sample", sorted({n for n in gname.values() if kind_of(n) == "head"})[:40])
    # each vertex: its dominant kind, and how much of it belongs to the hand / head
    vk, vhand = [], []
    for v in body.data.vertices:
        acc = {}
        for g in v.groups:
            k = kind_of(gname.get(g.group, ""))
            acc[k] = acc.get(k, 0) + g.weight
        tot = sum(acc.values()) or 1
        vk.append(max(acc, key=acc.get) if acc else "head")
        vhand.append((acc.get("hand", 0) + acc.get("head", 0)) / tot)
    h = [(p.z - zmin) / H for p in ws]
    body_slots = {i for i, m in enumerate(body.data.materials) if m and "body" in m.name.lower()}
    # the mesh's own up axis and scale (its numbers are in centimetres, in another orientation): h = a * co[ax] + b,
    # so a garment's edge can be cut along a level line
    import statistics
    best = None
    for ax in range(3):
        xs = [v.co[ax] for v in body.data.vertices]
        mx, mh = statistics.fmean(xs), statistics.fmean(h)
        cov = sum((x - mx) * (y - mh) for x, y in zip(xs, h)); var = sum((x - mx) ** 2 for x in xs) or 1
        a = cov / var; b = mh - a * mx
        err = sum((a * x + b - y) ** 2 for x, y in zip(xs, h))
        if best is None or err < best[0]: best = (err, ax, a, b)
    _, UPAX, UPA, UPB = best
    L("up axis", UPAX, "fit error", round(best[0], 6))
    def cut(bm, level, keep_below):
        # the mesh cut along h = level, and the part above (or below) it removed
        co = [0.0, 0.0, 0.0]; co[UPAX] = (level - UPB) / UPA
        no = [0.0, 0.0, 0.0]; no[UPAX] = 1.0 if UPA > 0 else -1.0
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=keep_below, clear_inner=not keep_below)
    HEM, BOOT, NECK = 0.475, 0.30, 0.835

    def region(i, which):
        k, hh = vk[i], h[i]
        if k in ("hand", "head") or vhand[i] > 0.2: return False
        if which == "jacket":
            return k == "arm" or HEM - 0.03 <= hh <= NECK
        if which == "trousers":
            return k != "arm" and BOOT - 0.07 <= hh <= HEM + 0.07
        if which == "boots":
            return hh <= BOOT + 0.04
        return False

    OFF = {"jacket": 0.016, "trousers": 0.007, "boots": 0.011}   # metres out from the body
    SMOOTH = {"jacket": 14, "trousers": 8, "boots": 6}
    TILE = {"jacket": 3.2, "trousers": 4.0, "boots": 5.0}      # texture repeats a metre

    def mat(name, tex, base, rough):
        m = bpy.data.materials.new(name); m.use_nodes = True
        nt = m.node_tree; p = nt.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = (*base, 1); p.inputs["Roughness"].default_value = rough
        if tex:
            nor = f"{TEX}/{tex}/textures/{tex}_nor_gl_1k.jpg"; rg = f"{TEX}/{tex}/textures/{tex}_rough_1k.jpg"
            if os.path.exists(nor):
                ti = nt.nodes.new("ShaderNodeTexImage"); ti.image = bpy.data.images.load(nor); ti.image.colorspace_settings.name = "Non-Color"
                nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.8
                nt.links.new(ti.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
            if os.path.exists(rg):
                tr = nt.nodes.new("ShaderNodeTexImage"); tr.image = bpy.data.images.load(rg); tr.image.colorspace_settings.name = "Non-Color"
                nt.links.new(tr.outputs["Color"], p.inputs["Roughness"])
        return m

    MATS = {
        "jacket": mat("fd_jacket", "fabric_pattern_07", (0.55, 0.55, 0.55), 0.75),   # tinted in the game to your jacket
        "trousers": mat("fd_trousers", "denim_fabric", (0.5, 0.5, 0.5), 0.85),
        "boots": mat("fd_boots", None, (0.45, 0.45, 0.45), 0.4),
    }

    made = []
    for which in ("jacket", "trousers", "boots"):
        ob = body.copy(); ob.data = body.data.copy(); ob.name = f"fd_{which}"; bpy.context.collection.objects.link(ob)
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        keep = set()
        for f in bm.faces:
            if f.material_index in body_slots and sum(region(v.index, which) for v in f.verts) * 2 > len(f.verts): keep.add(f.index)  # (most of its corners: all of them left pinholes)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context="VERTS")
        # clean, level edges: the hem, the trouser bottoms and the wellies' tops cut along a line, not along the
        # body's triangles (which left a zigzag)
        if which == "jacket": cut(bm, HEM, keep_below=False)
        if which == "trousers": cut(bm, BOOT - 0.04, keep_below=False)
        if which == "boots": cut(bm, BOOT, keep_below=True)
        bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
        loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.normal_update()
        # out from the body, then smoothed (edges held) into cloth: it no longer follows every muscle
        off = OFF[which] / S
        orig = {v.index: (v.co.copy(), v.normal.copy()) for v in bm.verts}
        for v in bm.verts:
            extra = 0.0
            hh = ((mw @ v.co).z - zmin) / H
            if which == "jacket" and hh < HEM + 0.05: extra = 0.010 * (1 - (hh - HEM) / 0.05)   # the hem stands off the hips
            if which == "jacket" and hh > NECK - 0.03: extra = 0.006                               # a collar round the neck
            v.co += v.normal * (off + extra / S)
        inner = [v for v in bm.verts if not v.is_boundary]
        for _ in range(SMOOTH[which]):
            bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
            # (smoothing pulls a surface in: never closer to the body than the cloth's own distance, or the body shows
            # through in patches)
            for v in inner:
                o, n = orig[v.index]; d = (v.co - o).dot(n)
                if d < off: v.co += n * (off - d)
        # thickness at the openings: the boundary turned back in under itself, towards the body
        bm.normal_update()
        bnd = [e for e in bm.edges if e.is_boundary]
        if bnd:
            ret = bmesh.ops.extrude_edge_only(bm, edges=bnd)
            nv = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
            for v in nv:
                n = v.normal if v.normal.length > 0 else Vector((0, 0, 1))
                v.co -= n * (off * 0.85)
        bm.normal_update()
        # box-mapped UVs (metres) for the tiling fabric
        uvl = bm.loops.layers.uv.active or bm.loops.layers.uv.new()
        t = TILE[which]
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                p = mw @ lp.vert.co
                u, w = ((p.y, p.z) if ax == 0 else (p.x, p.z) if ax == 1 else (p.x, p.y))
                lp[uvl].uv = (u * t, w * t)
        for f in bm.faces: f.material_index = 0
        bm.to_mesh(ob.data); bm.free()
        ob.data.materials.clear(); ob.data.materials.append(MATS[which])
        for poly in ob.data.polygons: poly.use_smooth = True
        L(which, "faces", len(ob.data.polygons), "verts", len(ob.data.vertices))
        made.append(ob)

    os.makedirs(f"{OUT}/source/people", exist_ok=True); os.makedirs(f"{OUT}/renders", exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/source/people/angler_clothes_{WHO}.blend")

    # renders to check: front and side, plain lighting
    sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 700, 1000
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.62, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3; sun.rotation_euler = (0.9, 0.2, 0.6); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = 60
    cx = sum(p.x for p in ws) / len(ws); cy = sum(p.y for p in ws) / len(ws); cam.data.sensor_fit = 'VERTICAL'
    for i, ang in enumerate([0, 90, 200]):
        a = math.radians(ang); d = 4.2
        cam.location = (cx + math.sin(a) * d, cy - math.cos(a) * d, zmin + H * 0.55)
        cam.rotation_euler = (math.radians(90), 0, a)
        sc.render.filepath = f"{OUT}/renders/angler_clothes_{WHO}_{i}.png"
        bpy.ops.render.render(write_still=True)

    # the .glb: the person and their clothes on the same skeleton
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.type in ("MESH", "ARMATURE"): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/exports/angler_{WHO}.glb", export_format="GLB", use_selection=True, export_skins=True, export_apply=False, export_morph=False, export_animations=False, export_image_format="WEBP", export_cameras=False, export_lights=False)
    L("exported", os.path.getsize(f"{OUT}/exports/angler_{WHO}.glb") // 1000, "kB")
except Exception:
    L("ERROR", traceback.format_exc())
open(f"{OUT}/angler_clothes_{WHO}.log", "w").write("\n".join(log))
print("CLOTHES DONE")
