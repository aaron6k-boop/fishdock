# FishDock people v2, stage 1, job B: the main male angler finished. From job A's .blend and the textures made from
# its garments (textures.py, copied into FishDock-assets/people2/tex):
#  - the clothes' materials: coated nylon, rubber and hair, each with its colour (the cloth's detail in grey, coloured
#    in the game as your kit), normal and roughness maps; the studs, toggles and buckles in their own plain material
#  - the body under the clothes taken away where it can never show (it poked through at the elbows and knees as they
#    bent), keeping a margin under every opening
#  - three levels of detail for everything (the near one about 60,000 triangles, then about 25,000 and 8,000), named
#    <part>, <part>_lod1, <part>_lod2, all on the one skeleton
#  - exported twice: angler2.glb (maps at 1024) and angler2_hd.glb (2048), and rendered from the front, side, back and
#    close, in daylight, to check
import bpy, bmesh, os, math, json, traceback
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

OUT = "C:/Users/aaron/Documents/FishDock-assets"; DST = f"{OUT}/people2"; TEX = f"{DST}/tex"
TAG = globals().get("TAG", "p2a"); NAME = globals().get("NAME", "angler2")
log = []
def L(*a):
  log.append(" ".join(map(str, a))); print(*a, flush=True)
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
try:
  bpy.ops.wm.open_mainfile(filepath=f"{DST}/{TAG}.blend")
  clothes = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("fd2_")]
  people = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("fd2_")]
  body = max(people, key=lambda o: len(o.data.vertices))
  arm = next((m.object for m in body.modifiers if m.type == "ARMATURE" and m.object), None) or next(o for o in bpy.data.objects if o.type == "ARMATURE")
  for o in people:
    if o is not body: bpy.data.objects.remove(o, do_unlink=True)
  people = [body]
  FR = json.load(open(f"{DST}/{TAG}_frame.json"))
  L("clothes", [(o.name, tris(o)) for o in clothes]); L("people", [(o.name, tris(o), [m.name for m in o.data.materials]) for o in people])
  mw = body.matrix_world; S = mw.to_scale().x
  # ---- materials ----
  def img(n, colour):
    p = f"{TEX}/{TAG}_{n}.png"
    if not os.path.exists(p): L("missing", p); return None
    im = bpy.data.images.load(p, check_existing=True); im.colorspace_settings.name = "sRGB" if colour else "Non-Color"; return im
  def material(name, key, rough=None, alpha=False, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Metallic"].default_value = metal
    c = img(key + "_c", True)
    if c:
      t = nt.nodes.new("ShaderNodeTexImage"); t.image = c; nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
      if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        try: m.blend_method = "CLIP"
        except Exception: pass
    n = img(key + "_n", False)
    if n:
      t = nt.nodes.new("ShaderNodeTexImage"); t.image = n; nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    r = img(key + "_r", False) if rough is None else None
    if r:
      t = nt.nodes.new("ShaderNodeTexImage"); t.image = r; nt.links.new(t.outputs["Color"], b.inputs["Roughness"])
    elif rough is not None: b.inputs["Roughness"].default_value = rough
    return m
  M = {"jacket": material("fd2_jacket", "jacket"), "trousers": material("fd2_trousers", "trousers"), "boots": material("fd2_boots", "boots"), "beard": material("fd2_beard", "beard", rough=0.62, alpha=True),
       "beard_b": material("fd2_beard_b", "beard", rough=0.62, alpha=True), "beard_c": material("fd2_beard_c", "beard", rough=0.62, alpha=True)}
  # the head: its own colour with the stubble's shadow drawn in under and round the beard, a roughness map (oilier
  # over the nose and forehead, drier on the cheeks, wet eyes) and finer skin detail in its normal map, where made
  for o in people:
    for m in o.data.materials:
      if m and "head" in m.name.lower() and m.use_nodes:
        nt = m.node_tree; b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        hc, hr, hn = img("head_c", True), img("head_r", False), img("head_n", False)
        if b and hc:
          t = nt.nodes.new("ShaderNodeTexImage"); t.image = hc; nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if b and hr:
          t = nt.nodes.new("ShaderNodeTexImage"); t.image = hr; nt.links.new(t.outputs["Color"], b.inputs["Roughness"])
        if b and hn:
          t = nt.nodes.new("ShaderNodeTexImage"); t.image = hn; nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        L("head material", m.name, "colour" if hc else "-", "roughness" if hr else "-", "normal" if hn else "-")
  trim = bpy.data.materials.new("fd2_trim"); trim.use_nodes = True; tb = trim.node_tree.nodes["Principled BSDF"]; tb.inputs["Base Color"].default_value = (0.03, 0.03, 0.032, 1); tb.inputs["Roughness"].default_value = 0.35; tb.inputs["Metallic"].default_value = 0.3
  for o in clothes:
    key = "jacket" if "jacket" in o.name else "trousers" if "trousers" in o.name else "boots" if "boots" in o.name else ("beard_b" if o.name.startswith("fd2_beard_b") else "beard_c" if o.name.startswith("fd2_beard_c") else "beard")
    o.data.materials.clear(); o.data.materials.append(trim if any(k in o.name for k in ("studs", "toggles", "buckles")) else M[key])
  # ---- each garment's pieces joined into one mesh (one draw each): the jacket and its collar, hood, flap, pockets,
  # cuffs and hem band; the trousers and their pockets; the boots and their bands; the studs, toggles and buckles ----
  def join(objs, name):
    objs = [o for o in objs if o]
    if not objs: return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    objs[0].name = name; return objs[0]
  trims = [o for o in clothes if any(k in o.name for k in ("studs", "toggles", "buckles"))]
  fam = {k: [o for o in clothes if k in o.name and o not in trims] for k in ("jacket", "trousers", "boots", "beard")}
  for k in fam: fam[k].sort(key=lambda o: o.name != f"fd2_{k}")   # (the garment itself first: it keeps its name and modifiers)
  clothes = [join(fam["jacket"], "fd2_jacket"), join(fam["trousers"], "fd2_trousers"), join(fam["boots"], "fd2_boots"), join(fam["beard"], "fd2_beard"), join(trims, "fd2_trim")]
  clothes = [o for o in clothes if o]
  L("joined", [(o.name, tris(o)) for o in clothes])
  # ---- the body under the clothes: faces wholly covered (every corner at least 1.5 cm inside a garment, and away
  # from its openings) are removed ----
  # (everything compared where it stands, posed by the skeleton, as the body is below)
  cover = [o for o in clothes if o.name in ("fd2_jacket", "fd2_trousers", "fd2_boots")]
  dg = bpy.context.evaluated_depsgraph_get(); pts = []; opn = []
  for o in cover:
    eo = o.evaluated_get(dg); me = eo.to_mesh(); W = [tuple(eo.matrix_world @ v.co) for v in me.vertices]; eo.to_mesh_clear()
    pts += W
    # the garments' openings (the boundary loops): no body face near one is removed
    bm = bmesh.new(); bm.from_mesh(o.data)
    for e in bm.edges:
      if e.is_boundary: opn.append(W[e.verts[0].index])
    bm.free()
  kd = KDTree(len(pts))
  for i, p in enumerate(pts): kd.insert(Vector(p), i)
  kd.balance()
  kdo = KDTree(len(opn))
  for i, p in enumerate(opn): kdo.insert(Vector(p), i)
  kdo.balance()
  dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); em = ev.to_mesh(); BP = [ev.matrix_world @ v.co for v in em.vertices]; ev.to_mesh_clear()
  hidden = []
  for i, p in enumerate(BP):
    _, _, d = kd.find(p); _, _, do = kdo.find(p)
    hidden.append(d < 0.045 and do > 0.06)
  bm = bmesh.new(); bm.from_mesh(body.data)
  slots = [m.name for m in body.data.materials]
  gone = [f for f in bm.faces if "body" in slots[f.material_index].lower() and all(hidden[v.index] for v in f.verts)]
  bmesh.ops.delete(bm, geom=gone, context="FACES"); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
  bm.to_mesh(body.data); bm.free(); L("body faces removed under the clothes", len(gone), "now", tris(body))
  # ---- levels of detail ----
  lod0 = [o for o in bpy.data.objects if o.type == "MESH"]
  tot0 = sum(tris(o) for o in lod0); L("lod0 before", tot0)
  def decimate(o, ratio, name):
    c = o.copy(); c.data = o.data.copy(); c.name = name; bpy.context.collection.objects.link(c)
    if ratio < 0.999:
      m = c.modifiers.new("dec", "DECIMATE"); m.ratio = ratio; m.use_collapse_triangulate = True
      bpy.context.view_layer.objects.active = c
      # (the armature modifier first in the stack must stay first: the decimation is applied under it)
      bpy.ops.object.modifier_move_to_index(modifier="dec", index=0); bpy.ops.object.modifier_apply(modifier="dec")
    return c
  # the near one to about 60,000: the garments thinned first, the head and hands least
  want0 = 60000
  if tot0 > want0:
    k = want0 / tot0
    for o in list(lod0):
      if o.name.startswith("fd2_") and tris(o) > 3000:
        r = min(1.0, k * 0.85); c = decimate(o, r, o.name + "_tmp"); bpy.data.objects.remove(o, do_unlink=True); c.name = c.name.replace("_tmp", "")
  lod0 = [o for o in bpy.data.objects if o.type == "MESH" and "_lod" not in o.name]
  tot0 = sum(tris(o) for o in lod0)
  # (and the body, smoothed to about 46,000 before, thinned if the total is still well over: the head keeps its shape)
  if tot0 > want0 * 1.05:
    bod = [o for o in lod0 if not o.name.startswith("fd2_")]; bt0 = sum(tris(o) for o in bod)
    r = max(0.55, (want0 - (tot0 - bt0)) / max(1, bt0))
    for o in bod:
      c = decimate(o, r, o.name + "_tmp"); nm = o.name; bpy.data.objects.remove(o, do_unlink=True); c.name = nm
  lod0 = [o for o in bpy.data.objects if o.type == "MESH" and "_lod" not in o.name]
  tot0 = sum(tris(o) for o in lod0); L("lod0", tot0)
  for lev, target in ((1, 25000), (2, 8000)):
    r = target / max(1, tot0)
    for o in lod0:
      small = any(k in o.name for k in ("studs", "toggles", "buckles"))
      if lev == 2 and small: continue   # (too small to see that far off)
      decimate(o, min(1.0, r * (0.7 if o.name.startswith("fd2_") else 1.15)), f"{o.name}_lod{lev}")
    L(f"lod{lev}", sum(tris(o) for o in bpy.data.objects if o.type == "MESH" and o.name.endswith(f"_lod{lev}")))
  bpy.ops.wm.save_as_mainfile(filepath=f"{DST}/{TAG}_b.blend")
  # ---- export: the light one (maps at 1024) and the fine one (2048) ----
  def export(path, half):
    if half:
      for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(im.size[0] // 2, im.size[1] // 2)
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
      if o.type in ("MESH", "ARMATURE"): o.select_set(True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_skins=True, export_apply=False, export_morph=False, export_animations=False, export_image_format="WEBP", export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(**kw, export_image_quality=86)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    L("exported", path, os.path.getsize(path) // 1000, "kB")
  os.makedirs(f"{OUT}/exports", exist_ok=True)
  export(f"{OUT}/exports/{NAME}_hd.glb", False)
  # (the light one, for phones and the Low and Medium settings, starts at the middling level: its near set is the
  # 25,000-triangle one and its far set the 8,000; the 60,000 is for High and Ultra only)
  hidden0 = []
  for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    if "_lod" not in o.name: o.name = o.name + "_full"; hidden0.append(o)
  for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name.endswith("_lod1")]: o.name = o.name[:-5]
  for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name.endswith("_lod2")]: o.name = o.name[:-5] + "_lod1"
  for o in hidden0: o.select_set(False)
  def export_light(path):
    for im in bpy.data.images:
      if im.size[0] > 1024: im.scale(im.size[0] // 2, im.size[1] // 2)
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
      if (o.type == "MESH" and o not in hidden0) or o.type == "ARMATURE": o.select_set(True)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_skins=True, export_apply=False, export_morph=False, export_animations=False, export_image_format="WEBP", export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(**kw, export_image_quality=86)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    L("exported", path, os.path.getsize(path) // 1000, "kB")
  export_light(f"{OUT}/exports/{NAME}.glb")
  # (names back for the renders)
  for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name.endswith("_lod1")]: o.name = o.name[:-5] + "_lod2"
  for o in [o for o in bpy.data.objects if o.type == "MESH" and o not in hidden0 and "_lod" not in o.name]: o.name = o.name + "_lod1"
  for o in hidden0: o.name = o.name[:-5]
  # ---- renders (lod0 only; the materials changed for them after both exports) ----
  for o in bpy.data.objects:
    if o.type == "MESH": o.hide_render = "_lod" in o.name
  sc = bpy.context.scene; eng = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]; sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
  sc.render.resolution_x, sc.render.resolution_y = 900, 1200
  w2 = sc.world or bpy.data.worlds.new("w"); sc.world = w2; w2.use_nodes = True; w2.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1); w2.node_tree.nodes["Background"].inputs[1].default_value = 0.9
  for o in [o for o in bpy.data.objects if o.type == "LIGHT"]: bpy.data.objects.remove(o)
  sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.2; sun.rotation_euler = (0.85, 0.15, 0.7); sc.collection.objects.link(sun)
  # (the clothes in the default kit's colours for the check: black jacket, charcoal trousers, green wellies)
  for key, c in (("jacket", (0.035, 0.037, 0.04)), ("trousers", (0.05, 0.05, 0.05)), ("boots", (0.06, 0.11, 0.05)), ("beard", (0.11, 0.05, 0.027)), ("beard_b", (0.11, 0.05, 0.027)), ("beard_c", (0.11, 0.05, 0.027))):
    nt = M[key].node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"); t = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and n.image.name.endswith("_c.png")), None)
    if t:
      mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
      nt.links.new(t.outputs["Color"], mx.inputs["A"]); mx.inputs["B"].default_value = (*c, 1); nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
  cam = sc.camera or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
  if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
  sc.camera = cam; cam.data.lens = 70
  # (where he stands and which way he faces, as job A found them)
  zmin, H, cx, cy = FR["zmin"], FR["H"], FR["cx"], FR["cy"]; hd = Vector(FR["head"]); fwd = Vector(FR["fwd"]); side = Vector(FR["side"])
  shots = [("front", fwd, 4.8, 0.52), ("side", side, 4.8, 0.52), ("back", -fwd, 4.8, 0.52), ("q", (fwd + side * 0.7).normalized(), 4.8, 0.52)]
  for nm, dvec, d, hz in shots:
    cam.location = Vector((cx, cy, zmin + H * 0.55)) + dvec * d; cam.rotation_euler = (Vector((cx, cy, zmin + H * hz)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{OUT}/renders/people2/{TAG}_b_{nm}.png"; bpy.ops.render.render(write_still=True)
  for nm, tgt, dvec, d in (("face", hd + Vector((0, 0, -0.02)), (fwd + side * 0.35).normalized(), 0.75), ("chest", Vector((cx, cy, zmin + H * 0.7)), fwd, 1.3), ("boots", Vector((cx, cy, zmin + 0.25)), (fwd + side * 0.5).normalized(), 1.4)):
    cam.data.lens = 85; cam.location = tgt + dvec * d; cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{OUT}/renders/people2/{TAG}_b_{nm}.png"; bpy.ops.render.render(write_still=True)
  L("DONE")
except Exception:
  import traceback as tb2; L("ERROR", tb2.format_exc())
open(f"{DST}/{TAG}_b.log", "w").write("\n".join(log))
print("PEOPLE2 B DONE")
