# FishDock: the drop net (piers) and the landing net (banks), modelled in Blender and exported as nets.glb
# three.js frame (y up, metres): P() turns a three.js point into Blender's Z-up space. The drop net's hoop lies flat with
# its centre at the origin; its bag hangs below with two shape keys (laden: heavy with a fish; flat: set down on the
# deck). The landing net's frame centre is at the origin, its handle along -z (three.js) to the angler.
import bpy, bmesh, math, os, glob
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"; ACG = OUT + "/downloads/ambientcg"
P = lambda x, y, z: Vector((x, -z, y))
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
col = bpy.context.scene.collection
def tex_mat(name, folder, tile=(1, 1), base=(0.12, 0.16, 0.14)):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
    files = {k: (glob.glob(f"{folder}/*_{k}.*") or [None])[0] for k in ["Color", "Opacity", "Roughness"]}; files["NormalGL"] = None  # (no normal map: too fine to see, and it doubles the download)
    uv = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (tile[0], tile[1], 1); nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
    def img(path, non_color=False):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(path); nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        if t.image.size[0] > 512:
            # (a net's mesh repeats: 512 px is plenty on a phone) saved as a small copy, so the export carries that
            small = os.path.join(os.path.dirname(path), "small_" + os.path.basename(path)); t.image.scale(512, 512)
            t.image.filepath_raw = small; t.image.file_format = "JPEG"; t.image.save(filepath=small, quality=85)
        if non_color: t.image.colorspace_settings.name = "Non-Color"
        return t
    if files["Color"]:
        c = img(files["Color"]); mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = (*base, 1); nt.links.new(c.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    if files["Opacity"]: o = img(files["Opacity"], True); nt.links.new(o.outputs["Color"], b.inputs["Alpha"])
    if files["Roughness"]: r = img(files["Roughness"], True); nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    if files["NormalGL"]:
        n = img(files["NormalGL"], True); nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    m.use_backface_culling = False
    return m
def mat(name, rgb, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough; return m
galv = mat("galvanised", (0.62, 0.63, 0.62), 1.0, 0.45); carbon = mat("carbon", (0.03, 0.03, 0.035), 0.3, 0.3); eva = mat("eva_grip", (0.06, 0.06, 0.065), 0.0, 0.85)
spreader = mat("spreader", (0.08, 0.09, 0.1), 0.0, 0.5); mesh_mat = tex_mat("net_mesh", f"{ACG}/Net001A", (6, 3)); fine = tex_mat("net_fine", f"{ACG}/Net002A", (8, 4), (0.1, 0.12, 0.1))
def link(o, m=None, parent=None):
    col.objects.link(o)
    if m: o.data.materials.append(m)
    if parent: o.parent = parent
    return o
def ring(name, R, r, m, parent, at=Vector()):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_circle(bm, segments=8, radius=r)
    bm.free()
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=64, minor_segments=10, location=at)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); o.parent = parent; return o
def bag(name, R, depth, m, parent, laden=0.25):
    # a lathe: a rounded bag hanging from the ring, UVs around (u) and down (v), with shape keys
    me = bpy.data.meshes.new(name); bm = bmesh.new(); N, K = 48, 14; rows = []
    uv = bm.loops.layers.uv.new("UVMap")
    prof = lambda k: (R * math.sqrt(max(0.0, 1 - (k / K) ** 2)) * (1 - 0.12 * k / K) + 0.012, -depth * k / K)
    for k in range(K + 1):
        r, y = prof(k); rows.append([bm.verts.new(P(r * math.cos(2 * math.pi * i / N), y, r * math.sin(2 * math.pi * i / N))) for i in range(N)])
    for k in range(K):
        for i in range(N):
            f = bm.faces.new((rows[k][i], rows[k][(i + 1) % N], rows[k + 1][(i + 1) % N], rows[k + 1][i]))
            for l, (a, b) in zip(f.loops, [(i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1)]): l[uv].uv = (a / N, 1 - b / K)
    bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new(name, me), m, parent)
    for p in o.data.polygons: p.use_smooth = True
    o.shape_key_add(name="Basis")
    sk = o.shape_key_add(name="laden"); sk.interpolation = "KEY_LINEAR"
    for v, kv in zip(o.data.vertices, sk.data):
        d = -v.co.z / depth if depth else 0  # 0 at the ring, 1 at the bottom (blender z is three y)
        kv.co = v.co + Vector((0, 0, -laden * depth * math.sin(min(1, d) * math.pi / 2) ** 1.5)); kv.co.x *= 1 - 0.18 * d; kv.co.y *= 1 - 0.18 * d
    fl = o.shape_key_add(name="flat")
    for v, kv in zip(o.data.vertices, fl.data):
        d = -v.co.z / depth if depth else 0; kv.co = Vector((v.co.x * (1 + 0.22 * d), v.co.y * (1 + 0.22 * d), v.co.z * 0.12))
    return o
# ---- the drop net: a galvanised ring ~70 cm across, a weight ring under it, a deep bag, three bridle eyes ----
dn = link(bpy.data.objects.new("dropnet", None))
ring("dropnet_hoop", 0.35, 0.009, galv, dn)
ring("dropnet_weight", 0.11, 0.012, galv, dn, P(0, -0.46, 0))  # (lying in the bottom of the bag)
bag("dropnet_bag", 0.35, 0.52, mesh_mat, dn)
for i in range(3):
    a = i / 3 * math.pi * 2; e = link(bpy.data.objects.new(f"att_bridle_{i}", None), None, dn); e.location = P(0.35 * math.cos(a), 0.0, 0.35 * math.sin(a))
k = link(bpy.data.objects.new("att_knot", None), None, dn); k.location = P(0, 0.72, 0)
# ---- the landing net: a round frame 60 cm across on a spreader block, a 2 m carbon handle with an EVA grip, deep bag ----
ln = link(bpy.data.objects.new("landingnet", None))
fr = ring("landingnet_frame", 0.3, 0.007, carbon, ln)
bag("landingnet_bag", 0.3, 0.55, fine, ln, 0.18)
sp = link(bpy.data.objects.new("landingnet_spreader", bpy.data.meshes.new("spreader")), spreader, ln)
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(0.05, 0.07, 0.035), verts=bm.verts); bm.to_mesh(sp.data); bm.free(); sp.location = P(0, 0.0, -0.31)
bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.014, depth=2.0, location=P(0, 0, -1.33)); h = bpy.context.active_object; h.name = "landingnet_handle"; h.rotation_euler = (math.pi / 2, 0, 0); h.data.materials.append(carbon); h.parent = ln
bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.019, depth=0.35, location=P(0, 0, -2.1)); g = bpy.context.active_object; g.name = "landingnet_grip"; g.rotation_euler = (math.pi / 2, 0, 0); g.data.materials.append(eva); g.parent = ln
for n, p in {"att_hand_front": P(0, 0, -1.6), "att_hand_back": P(0, 0, -2.2)}.items(): e = link(bpy.data.objects.new(n, None), None, ln); e.location = p
ln.location = Vector((2, 0, 0))  # (side by side in the .blend; each is exported in its own frame)
for o in bpy.data.objects:
    if o.type == "MESH":
        for p in o.data.polygons: p.use_smooth = True
os.makedirs(OUT + "/source/nets", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/nets/nets.blend")
ln.location = Vector((0, 0, 0))
bpy.ops.export_scene.gltf(filepath=OUT + "/exports/nets.glb", export_format="GLB", export_apply=False, export_morph=True, export_yup=True, export_image_format="WEBP", export_jpeg_quality=80, export_cameras=False, export_lights=False)
print("NETS DONE", os.path.getsize(OUT + "/exports/nets.glb") // 1000, "kB")
