# FishDock, a kit of real coastal ground cover (run on Aaron's PC from FishDock-assets/queue, in Blender): Poly Haven's
# photoscanned rocks, plants and wood (all CC0) downloaded at 1k (glTF), and its pebble and sand scans at 2k; each model
# joined, cut down in Blender to a game's triangle count (two levels: near and far), its textures to 1024 px, and saved
# as exports/kit/<id>.glb; plus a strand of wrack (bladderwrack and kelp thrown up along the tide line), modelled here.
# Logs each file's size and SHA-256 (for source-assets/ASSET-LICENCES.json) and zips the kit to renders/naturekit.zip.
import json, os, time, urllib.request, zipfile, hashlib, math, random, traceback
import bpy, bmesh
A = "C:/Users/aaron/Documents/FishDock-assets"
UA = {"User-Agent": "FishDock-assets/1.0 (asset download; https://fishdock.aaron6k.workers.dev)"}
# (id, near triangles, far triangles)
MODELS = [("coast_rocks_02", 1600, 300), ("rock_09", 900, 200), ("sand_rocks_small_01", 1400, 300), ("rock_moss_set_01", 1800, 400),
          ("stone_01", 500, 120), ("boulder_01", 1500, 300), ("nettle_plant", 1800, 400), ("weed_plant_02", 1500, 300),
          ("shrub_02", 2500, 500), ("shrub_sorrel_01", 1500, 300), ("dandelion_01", 900, 200), ("fern_02", 1500, 300),
          ("dead_tree_trunk", 1500, 300), ("dry_branches_medium_01", 1200, 250), ("tree_stump_01", 1200, 250), ("grass_medium_01", 1500, 300)]
TEXTURES = ["clean_pebbles", "dry_river_pebbles", "damp_sand", "coast_sand_03"]
def get(url):
  for k in range(3):
    try:
      with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r: return r.read()
    except Exception as e: print("retry", k, url[:120], e, flush=True); time.sleep(5 + 5 * k)
  return b""
rec = []; log = open(A + "/downloads/download-log.txt", "a", encoding="utf-8")
def keep(pid, fn, url, b):
  rec.append({"src": "polyhaven", "id": pid, "file": fn.replace(A + "/", ""), "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest(), "url": url})
  log.write(time.strftime("%Y-%m-%d %H:%M") + f" {pid} {url} (CC0, Poly Haven)\n")
# ---- the pebble and sand scans ----
for pid in TEXTURES:
  try:
    d = f"{A}/downloads/polyhaven/{pid}/textures"; os.makedirs(d, exist_ok=True)
    info = json.loads(get(f"https://api.polyhaven.com/files/{pid}") or b"{}")
    for key, short in (("Diffuse", "diff"), ("nor_gl", "nor_gl"), ("Rough", "rough"), ("Displacement", "disp")):
      m = (info.get(key) or {}).get("2k", {}).get("jpg")
      if not m: continue
      fn = f"{d}/{pid}_{short}_2k.jpg"; b = open(fn, "rb").read() if os.path.exists(fn) else get(m["url"])
      if b: open(fn, "wb").write(b); keep(pid, fn, m["url"], b)
    print("GOT texture", pid, flush=True)
  except Exception: traceback.print_exc()
# ---- the models: download, then in Blender join, reduce, export ----
os.makedirs(A + "/exports/kit", exist_ok=True)
def clear():
  for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
  for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
def reduce_to(obj, tris):
  n = sum(len(p.vertices) - 2 for p in obj.data.polygons)
  if n > tris:
    d = obj.modifiers.new("dec", "DECIMATE"); d.ratio = max(0.01, tris / n)
    bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier=d.name)
  return sum(len(p.vertices) - 2 for p in obj.data.polygons)
for pid, near, far in MODELS:
  try:
    d = f"{A}/downloads/polyhaven/{pid}/model"; os.makedirs(d, exist_ok=True)
    info = json.loads(get(f"https://api.polyhaven.com/files/{pid}") or b"{}")
    g = ((info.get("gltf") or {}).get("1k") or {}).get("gltf")
    if not g: print("NO GLTF", pid, flush=True); continue
    main = f"{d}/{pid}_1k.gltf"; b = open(main, "rb").read() if os.path.exists(main) else get(g["url"]); open(main, "wb").write(b); keep(pid, main, g["url"], b)
    for rel, inc in (g.get("include") or {}).items():
      fn = f"{d}/{rel}"; os.makedirs(os.path.dirname(fn), exist_ok=True)
      bb = open(fn, "rb").read() if os.path.exists(fn) else get(inc["url"])
      if bb: open(fn, "wb").write(bb); keep(pid, fn, inc["url"], bb)
    clear(); bpy.ops.import_scene.gltf(filepath=main)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes: print("NO MESH", pid, flush=True); continue
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for img in bpy.data.images:
      if img.size[0] > 1024: img.scale(1024, int(1024 * img.size[1] / img.size[0]))
    # (two levels: the near one, and a copy cut down further for the far)
    farobj = obj.copy(); farobj.data = obj.data.copy(); bpy.context.collection.objects.link(farobj)
    obj.name = pid + "_near"; farobj.name = pid + "_far"
    tn = reduce_to(obj, near); tf = reduce_to(farobj, far)
    dims = [round(v, 3) for v in obj.dimensions]
    out = f"{A}/exports/kit/{pid}.glb"
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); farobj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")
    print("KIT", pid, "near", tn, "far", tf, "dims", dims, os.path.getsize(out) // 1000, "kB", flush=True)
  except Exception: traceback.print_exc()
# ---- wrack: bladderwrack and kelp thrown up along the tide line, a heap of olive-brown fronds, modelled ----
try:
  clear(); random.seed(77)
  bm = bmesh.new(); cl = bm.loops.layers.float_color.new("col")
  for k in range(70):
    # a frond: a strip lying on the sand, wandering, narrow, a little raised where it crosses another
    x, y, a = random.uniform(-0.6, 0.6), random.uniform(-0.25, 0.25), random.uniform(0, math.tau); w = random.uniform(0.012, 0.03); L = random.uniform(0.15, 0.45)
    c = [random.uniform(0.09, 0.16), random.uniform(0.08, 0.12), random.uniform(0.03, 0.05)] if random.random() < 0.8 else [0.05, 0.05, 0.03]
    pts = []; seg = 8
    for i in range(seg + 1):
      a += random.uniform(-0.5, 0.5); x += math.cos(a) * L / seg; y += math.sin(a) * L / seg; pts.append((x, y, 0.004 + 0.012 * random.random()))
    prev = None
    for i, p in enumerate(pts):
      nx, ny = -math.sin(a), math.cos(a); ww = w * (1 - 0.5 * i / seg)
      l = bm.verts.new((p[0] + nx * ww, p[1] + ny * ww, p[2])); r = bm.verts.new((p[0] - nx * ww, p[1] - ny * ww, p[2]))
      if prev:
        f = bm.faces.new((prev[0], prev[1], r, l))
        for lp in f.loops: lp[cl] = (*[v * random.uniform(0.85, 1.15) for v in c], 1)
      prev = (l, r)
  me = bpy.data.meshes.new("wrack"); bm.to_mesh(me); bm.free()
  o = bpy.data.objects.new("wrack_near", me); bpy.context.collection.objects.link(o)
  m = bpy.data.materials.new("wrack"); m.use_nodes = True; bsdf = m.node_tree.nodes["Principled BSDF"]; vc = m.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "col"
  m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.35; o.data.materials.append(m)
  bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
  bpy.ops.export_scene.gltf(filepath=f"{A}/exports/kit/wrack.glb", export_format="GLB", use_selection=True, export_yup=True)
  print("KIT wrack", len(o.data.polygons), "faces", flush=True)
except Exception: traceback.print_exc()
log.close()
json.dump(rec, open(A + "/exports/kit/files.json", "w"), indent=1)
with zipfile.ZipFile(A + "/renders/naturekit.zip", "w") as z:
  for f in sorted(os.listdir(A + "/exports/kit")): z.write(A + "/exports/kit/" + f, f)
print("DONE naturekit", len(rec), "files", flush=True)
