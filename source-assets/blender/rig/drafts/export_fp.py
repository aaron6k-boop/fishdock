# FishDock rig rebuild: exporting the first-person character for the game: the deform skeleton only, the hands and
# forearms (cut 4 cm under the cuffs), the jacket, and the grips' attachment points as extras on the rig
def export_fp(rig, body, jacket, out_path, extras=None, actions=None):
    C = ctx3d(); J = json.load(open(RIGDIR + "/joints.json"))
    for o in bpy.context.view_layer.objects: o.select_set(False)
    skin = body.copy(); skin.data = body.data.copy(); skin.name = "fp_skin"; link(skin)
    bm = bmesh.new(); bm.from_mesh(skin.data); mw = skin.matrix_world
    keep = set()
    for S in "LR":
        W = Vector(J["wrist." + S]); E = Vector(J["elbow." + S]); ax = (E - W).normalized()
        for v in bm.verts:
            p = mw @ v.co; t = (p - W).dot(ax)
            if t < 0.10 and (p - W).length < 0.30: keep.add(v.index)
    bm.verts.ensure_lookup_table(); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS"); bm.to_mesh(skin.data); bm.free()
    for vg in list(skin.vertex_groups):
        if not vg.name.startswith("DEF-"): skin.vertex_groups.remove(vg)
    objs = [rig, skin] + ([jacket] if jacket else [])
    for o in objs: o.hide_viewport = False; o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    if extras: rig["fd_extras"] = json.dumps(extras)
    with bpy.context.temp_override(**C):
        bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True, export_def_bones=True, export_skins=True,
                                  export_animations=bool(actions), export_force_sampling=True, export_extras=True, export_yup=True, export_apply=False)
    print("exported", out_path, "skin points", len(skin.data.vertices))
    bpy.data.objects.remove(skin, do_unlink=True)
