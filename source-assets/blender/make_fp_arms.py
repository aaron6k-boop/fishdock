# FishDock: first-person forearms and hands cut from the MPFB angler (real hand geometry, skin, finger bones), with a
# small skeleton of their own (lowerarm, hand, fingers each side), exported as fp_arms.glb
import bpy, bmesh, os, traceback
OUT = "C:/Users/aaron/Documents/FishDock-assets"
log = []
def L(*a): log.append(" ".join(map(str, a))); print(*a)
try:
    if not bpy.data.filepath.replace("\\", "/").endswith("angler_man.blend"): raise RuntimeError("open source/people/angler_man.blend first (loading a file from inside a running script stops the script)")
    for o in [o for o in bpy.data.objects if o.name in ("fp_arms", "fp_rig")]: bpy.data.objects.remove(o, do_unlink=True)
    body = bpy.data.objects["angler_man"]; rig = bpy.data.objects["angler_man.rig"]
    L("body world", str(body.matrix_world), "rig world", str(rig.matrix_world), "body parent", body.parent.name if body.parent else None)
    KEEP = [f"{n}_{s}" for s in "lr" for n in ["lowerarm", "hand"] + [f"{f}_{i:02d}" for f in ["thumb", "index", "middle", "ring", "pinky"] for i in (1, 2, 3)]]
    KEEP = [k for k in KEEP if k in rig.data.bones]; L("bones kept", len(KEEP))
    # the arms' mesh: the body as it is (helpers hidden), only what the forearms and hands move
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    arms = bpy.data.objects.new("fp_arms", me); bpy.context.scene.collection.objects.link(arms); arms.matrix_world = body.matrix_world.copy()  # (the mesh is in the body's own space: keep the body's placement, or it and its bones part company)
    for vg in body.vertex_groups: arms.vertex_groups.new(name=vg.name)
    # (new_from_object drops vertex groups on evaluated meshes with modifiers: copy the weights by vertex index from the
    # body when the counts match, else from nearest)
    src = body.data; L("verts", len(me.vertices), "body", len(src.vertices))
    idx = {vg.name: vg.index for vg in body.vertex_groups}
    keepIdx = {idx[k] for k in KEEP if k in idx}; foreIdx = {idx[k] for k in KEEP if k.startswith("lowerarm") and k in idx}
    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    kill = []
    for v in bm.verts:
        d = v[dl]; w = sum(wt for g, wt in d.items() if g in keepIdx); wf = sum(wt for g, wt in d.items() if g in foreIdx)
        # all of the hand; the forearm only towards the wrist (a short cuff's worth goes under the sleeve)
        if w < 0.6 or (wf > 0.85 and v.co.z > 0): pass
        if w < 0.6: kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(me); bm.free()
    L("arm verts", len(me.vertices))
    for vg in list(arms.vertex_groups):
        if vg.name not in KEEP: arms.vertex_groups.remove(vg)
    # the skeleton: a copy of the rig with only those bones
    r2 = rig.copy(); r2.data = rig.data.copy(); r2.name = "fp_rig"; bpy.context.scene.collection.objects.link(r2)
    bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = r2; r2.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for eb in list(r2.data.edit_bones):
        if eb.name not in KEEP: r2.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    mw = arms.matrix_world.copy(); arms.parent = r2; arms.matrix_world = mw
    for m in list(arms.modifiers): arms.modifiers.remove(m)
    am = arms.modifiers.new("arm", "ARMATURE"); am.object = r2
    # everything else goes, so the export holds only the arms
    for o in list(bpy.data.objects):
        if o not in (arms, r2): bpy.data.objects.remove(o, do_unlink=True)
    # the skin texture, smaller (the hands are a corner of a whole-body texture: 2048 keeps them sharp enough)
    for mat in arms.data.materials:
        if not mat or not mat.node_tree: continue
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.size[0] > 2048:
                p = n.image.filepath_from_user(); small = OUT + "/source/people/fp_" + os.path.basename(p).rsplit(".", 1)[0] + ".jpg"
                n.image.scale(2048, 2048); n.image.filepath_raw = small; n.image.file_format = "JPEG"; n.image.save(filepath=small, quality=88)
    bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/people/fp_arms.blend")
    bpy.ops.export_scene.gltf(filepath=OUT + "/exports/fp_arms.glb", export_format="GLB", export_skins=True, export_apply=False, export_image_format="WEBP", export_jpeg_quality=82, export_cameras=False, export_lights=False, export_animations=False)
    L("exported", os.path.getsize(OUT + "/exports/fp_arms.glb") // 1000, "kB")
    L("rest", {b.name: [round(x, 4) for x in b.head_local] + [round(x, 4) for x in b.tail_local] for b in r2.data.bones})
except Exception:
    L("ERROR", traceback.format_exc())
open(OUT + "/make_fp_arms.log", "w").write("\n".join(log)); print("FP ARMS DONE")
