# FishDock (17 Nov): the rock armour's stones from photographed boulders. Run in background Blender (the FishDock-assets
# queue): fetches four scanned boulders from Poly Haven (CC0: boulder_01, namaqualand_boulder_03, _04 and _05, their
# 1k glTF), turns each down to about 2,000 triangles for near and 300 for far, sizes it to the armour's stones (a
# metre or so across, lying flat), lays their four photographs into one 1024 atlas (512 a stone) (colour turned towards a grey
# granite's, as quarried armour stone at Gorleston would be, rather than the scans' own red-brown) and writes
# exports/armour.glb: meshes armour_0..3 and armour_far_0..3, one material "armour" with the atlas. A check render of
# the four in renders/armour.
import bpy, bmesh, json, os, urllib.request, math, numpy as np
from mathutils import Vector
A = "C:/Users/aaron/Documents/FishDock-assets"
D = A + "/downloads/polyhaven/armour"; os.makedirs(D, exist_ok=True); os.makedirs(A + "/exports", exist_ok=True); os.makedirs(A + "/renders/armour", exist_ok=True)
IDS = ["boulder_01", "namaqualand_boulder_03", "namaqualand_boulder_04", "namaqualand_boulder_05"]
H = {"User-Agent": "FishDock-assets"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=120).read()
log = open(A + "/download-log.txt", "a", encoding="utf-8")
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

def fetch(pid):
  d = f"{D}/{pid}"; os.makedirs(d, exist_ok=True)
  info = json.loads(get(f"https://api.polyhaven.com/files/{pid}"))
  g = info["gltf"]["1k"]["gltf"]; main = d + "/" + os.path.basename(g["url"])
  if not os.path.exists(main): open(main, "wb").write(get(g["url"])); log.write(f"{pid} {g['url']} (CC0, Poly Haven)\n")
  for path, inc in (g.get("include") or {}).items():
    p = d + "/" + path; os.makedirs(os.path.dirname(p), exist_ok=True)
    if not os.path.exists(p): open(p, "wb").write(get(inc["url"]))
  # the textures' files (for the atlas), by their kind
  tex = {}
  for path in (g.get("include") or {}):
    n = path.lower()
    if "diff" in n: tex["diff"] = d + "/" + path
    elif "nor_gl" in n: tex["nor"] = d + "/" + path
    elif "rough" in n or "arm" in n: tex.setdefault("rough", d + "/" + path)
  return main, tex

def load_img(p, size=512):
  im = bpy.data.images.load(p); im.scale(size, size)
  a = np.array(im.pixels[:], dtype=np.float32).reshape(size, size, 4); bpy.data.images.remove(im); return a

stones, texs = [], []
for k, pid in enumerate(IDS):
  main, tex = fetch(pid); texs.append(tex)
  before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=main)
  new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
  bpy.ops.object.select_all(action="DESELECT")
  for o in new: o.select_set(True)
  bpy.context.view_layer.objects.active = new[0]
  if len(new) > 1: bpy.ops.object.join()
  o = bpy.context.view_layer.objects.active; o.name = f"armour_{k}"
  bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  for x in [x for x in bpy.data.objects if x.type != "MESH" and x not in before]: bpy.data.objects.remove(x, do_unlink=True)
  # sized as the armour's stones: about 1.1 m across at its widest, no more than 0.9 m high (Blender's z up), centred
  me = o.data; vs = np.array([v.co[:] for v in me.vertices]); lo, hi = vs.min(0), vs.max(0); c = (lo + hi) / 2; ext = hi - lo
  s = 1.1 / max(ext[0], ext[1]); sz = min(s, 0.9 / max(ext[2], 1e-6))
  for v in me.vertices: v.co = Vector(((v.co.x - c[0]) * s, (v.co.y - c[1]) * s, (v.co.z - c[2]) * sz))
  # its uvs into its quarter of the atlas
  qx, qy = k % 2, k // 2
  for uvl in me.uv_layers:
    for d in uvl.data: d.uv = ((min(1, max(0, d.uv.x)) + qx) / 2, (min(1, max(0, d.uv.y)) + qy) / 2)
  # (its vertices welded where the import split them at the photograph's seams: left apart, the first boulder's
  # turning-down stopped at 26,000 triangles, its pieces' edges held fast)
  bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(me); bm.free()
  tris = sum(len(p.vertices) - 2 for p in me.polygons)
  far = o.copy(); far.data = me.copy(); far.name = f"armour_far_{k}"; bpy.context.scene.collection.objects.link(far)
  for ob, want in ((o, 2000), (far, 300)):
    m = ob.modifiers.new("dec", "DECIMATE"); m.ratio = min(1.0, want / max(1, tris))
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="dec")
    for p in ob.data.polygons: p.use_smooth = True
  stones += [o, far]
  print("STONE", pid, "from", tris, "to", sum(len(p.vertices) - 2 for p in o.data.polygons), "and", sum(len(p.vertices) - 2 for p in far.data.polygons), "tris; size", [round(v, 2) for v in (ext * np.array([s, s, sz]))], flush=True)

# ---- the atlas: four photographs at 512 in one 1024, the colour turned towards grey granite ----
def atlas(kind, fn=None, fill=(0.5, 0.5, 1, 1)):
  A2 = np.zeros((1024, 1024, 4), np.float32); A2[:] = fill
  for k, t in enumerate(texs):
    if kind not in t: continue
    a = load_img(t[kind]); a = fn(a) if fn else a
    qx, qy = k % 2, k // 2; A2[qy * 512:(qy + 1) * 512, qx * 512:(qx + 1) * 512] = a
  return A2
def granite(a):
  rgb = a[..., :3]; l = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
  g = l * np.array([0.97, 0.99, 1.03]); out = rgb * 0.3 + g * 0.7
  out *= 0.42 / max(1e-3, float(out.mean()))  # (a granite's middling grey, each stone about as light as the next)
  a = a.copy(); a[..., :3] = np.clip(out, 0, 1); return a
def save(arr, name, colour):
  # (the colour space first: changed after the pixels are in, Blender makes the image again, black)
  im = bpy.data.images.new(name, 1024, 1024, alpha=False, is_data=not colour)
  if not colour: im.colorspace_settings.name = "Non-Color"
  im.pixels[:] = arr.ravel()
  im.filepath_raw = f"{D}/{name}.jpg"; im.file_format = "JPEG"; im.save()
  print("ATLAS", name, [round(float(v), 3) for v in arr[..., :3].mean((0, 1))], flush=True)
  return im
im_d = save(atlas("diff", granite, (0.4, 0.4, 0.4, 1)), "armour_diff", True)
im_n = save(atlas("nor"), "armour_nor", False)
im_r = save(atlas("rough", None, (0.8, 0.8, 0.8, 1)), "armour_rough", False)

# ---- one material for all eight ----
mat = bpy.data.materials.new("armour"); mat.use_nodes = True; nt = mat.node_tree; b = nt.nodes["Principled BSDF"]
td = nt.nodes.new("ShaderNodeTexImage"); td.image = im_d; nt.links.new(td.outputs["Color"], b.inputs["Base Color"])
tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = im_n; nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tn.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
tr = nt.nodes.new("ShaderNodeTexImage"); tr.image = im_r; sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(tr.outputs["Color"], sep.inputs["Color"]); nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
for o in stones:
  o.data.materials.clear(); o.data.materials.append(mat)

# ---- a look at them, and the file ----
for k, o in enumerate([s for s in stones if "far" not in s.name]): o.location = (k * 1.4 - 2.1, 0, 0)
for k, o in enumerate([s for s in stones if "far" in s.name]): o.location = (k * 1.4 - 2.1, 2.0, 0)
scn = bpy.context.scene; scn.render.resolution_x, scn.render.resolution_y = 1600, 800
eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]; scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
w = scn.world or bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.55, 0.6, 1)
ld = bpy.data.lights.new("sun", "SUN"); ld.energy = 3; lo = bpy.data.objects.new("sun", ld); lo.rotation_euler = (0.9, 0.2, 0.6); scn.collection.objects.link(lo)
cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); scn.collection.objects.link(cam); scn.camera = cam
cam.location = (0, -4.8, 2.6); cam.rotation_euler = (Vector((0, 0.9, 0)) - cam.location).to_track_quat("-Z", "Z").to_euler()
scn.render.filepath = A + "/renders/armour/stones.jpg"; scn.render.image_settings.file_format = "JPEG"; bpy.ops.render.render(write_still=True)
for o in stones: o.location = (0, 0, 0)
bpy.ops.object.select_all(action="DESELECT")
for o in stones: o.select_set(True)
kw = dict(filepath=A + "/exports/armour.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_cameras=False, export_lights=False, export_normals=True, export_texcoords=True, export_materials="EXPORT", export_image_format="JPEG")
try: bpy.ops.export_scene.gltf(**kw, export_jpeg_quality=88)
except TypeError: bpy.ops.export_scene.gltf(**kw)
print("ARMOUR DONE", os.path.getsize(A + "/exports/armour.glb") // 1000, "kB", flush=True)
log.close()
