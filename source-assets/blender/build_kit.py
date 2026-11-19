# FishDock: the ground-clutter kit (kit3d.js), in three steps on Aaron's PC (FishDock-assets), as run on 19 November 2026:
#  1. download (queue job h203_naturekit.py, kept as download_kit.py): Poly Haven's photoscanned rocks, plants and
#     wood (all CC0) at 1k as glTF, each file logged with its SHA-256 (source-assets/ASSET-LICENCES.json), and the wrack
#     (bladderwrack and kelp along the strand line) modelled there;
#  2. split and cut down (h207_kit2.py, the main body below): each set as its separate plants or rocks, each centred,
#     standing at its own foot, cut down to a near and a far level, saved as exports/kit2/<id>.glb with objects
#     <id>_v<k>_near and _far;
#  3. the plants' cut-outs (h208_plantalpha.py): Poly Haven's glTF colour pictures carry no alpha, so each plant's
#     separate Alpha map is downloaded and merged into its colour picture (source-assets/tools/glbalpha.py), then every
#     model's pictures re-encoded at 512 px (source-assets/tools/glbshrink.py) into public/models/kit/<id>.glb.
# Not shipped: coast_rocks_02 and sand_rocks_small_01 (scans of whole patches of shore, not single rocks), boulder_01 (a
# heap of gravel at 26,000 triangles that would not cut down) and tree_stump_01 (read as a mound).
import bpy, os, json, zipfile, traceback, math
A = "C:/Users/aaron/Documents/FishDock-assets"
OUT = A + "/exports/kit2"; os.makedirs(OUT, exist_ok=True)
MODELS = {"rock_09": (1000, 220), "rock_moss_set_01": (1200, 260), "stone_01": (500, 120), "boulder_01": (1400, 280), "nettle_plant": (1400, 320),
          "weed_plant_02": (1200, 260), "shrub_02": (1800, 420), "shrub_sorrel_01": (1200, 260), "dandelion_01": (700, 160), "fern_02": (1300, 300),
          "dead_tree_trunk": (1400, 320), "dry_branches_medium_01": (1100, 260), "tree_stump_01": (1100, 260), "grass_medium_01": (900, 220)}
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def reduce_to(o, n):
  t = tris(o)
  if t > n:
    d = o.modifiers.new("dec", "DECIMATE"); d.ratio = max(0.01, n / t)
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]): bpy.ops.object.modifier_apply(modifier=d.name)
  return tris(o)
log = {}
for pid, (near, far) in MODELS.items():
  try:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    src = f"{A}/downloads/polyhaven/{pid}/model/{pid}_1k.gltf"
    if not os.path.exists(src): print("MISSING", pid, flush=True); continue
    bpy.ops.import_scene.gltf(filepath=src)
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in objs:
      o.data = o.data.copy()  # (single user)
      with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]): bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # (one object holding a row of plants: split into its loose parts and gathered again by the gaps between them)
    if len(objs) == 1:
      o = objs[0]; d = o.dimensions
      if d.x > 3 * max(d.z, 0.05) and d.x > 0.8:
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
          bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
        parts = sorted([p for p in bpy.data.objects if p.type == "MESH"], key=lambda p: min((p.matrix_world @ v.co).x for v in p.data.vertices))
        groups, cur, edge = [], [], -1e9
        for p in parts:
          xs = [(p.matrix_world @ v.co).x for v in p.data.vertices]; lo, hi = min(xs), max(xs)
          if cur and lo > edge + 0.06: groups.append(cur); cur = []
          cur.append(p); edge = max(edge, hi) if cur[:-1] else hi
        if cur: groups.append(cur)
        objs = []
        for g in groups:
          if len(g) > 1:
            with bpy.context.temp_override(object=g[0], active_object=g[0], selected_objects=g, selected_editable_objects=g): bpy.ops.object.join()
          objs.append(g[0])
    objs = [o for o in objs if o.name in bpy.data.objects and len(o.data.polygons) > 8][:6]
    names = []
    for k, o in enumerate(objs):
      vs = [o.matrix_world @ v.co for v in o.data.vertices]
      cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2; z0 = min(v.z for v in vs)
      o.data.transform(__import__("mathutils").Matrix.Translation((-cx, -cy, -z0))); o.location = (0, 0, 0)
      f = o.copy(); f.data = o.data.copy(); bpy.context.collection.objects.link(f)
      o.name = f"{pid}_v{k}_near"; f.name = f"{pid}_v{k}_far"
      tn = reduce_to(o, near); tf = reduce_to(f, far)
      names += [o.name, f.name]
      log.setdefault(pid, []).append({"v": k, "near": tn, "far": tf, "dims": [round(x, 3) for x in o.dimensions]})
    for img in bpy.data.images:
      if img.size[0] > 1024: img.scale(1024, int(1024 * img.size[1] / max(1, img.size[0])))
    bpy.ops.object.select_all(action="DESELECT")
    for n in names: bpy.data.objects[n].select_set(True)
    bpy.ops.export_scene.gltf(filepath=f"{OUT}/{pid}.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_image_format="JPEG")
    print("KIT2", pid, json.dumps(log.get(pid)), os.path.getsize(f"{OUT}/{pid}.glb") // 1000, "kB", flush=True)
  except Exception: traceback.print_exc()
# (the wrack, unchanged, from the first kit)
try:
  import shutil; shutil.copy(A + "/exports/kit/wrack.glb", OUT + "/wrack.glb")
except Exception: traceback.print_exc()
json.dump(log, open(OUT + "/kit2.json", "w"), indent=1)
with zipfile.ZipFile(A + "/renders/naturekit2.zip", "w") as z:
  for f in sorted(os.listdir(OUT)): z.write(OUT + "/" + f, f)
print("DONE kit2", len(log), flush=True)
