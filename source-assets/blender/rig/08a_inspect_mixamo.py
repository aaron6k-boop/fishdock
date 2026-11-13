exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/riglib.py").read())
# FishDock rig rebuild: what the Mixamo fishing clips hold: their frames, the hands' paths, and the pose drawn as bones
C = ctx3d()
bpy.ops.wm.read_homefile(use_empty=True); C = ctx3d()
out = {}
for clip in ("fishing_idle", "fishing_cast", "pulling_rope"):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    m = link(bpy.data.objects.new("dummy", None)); bpy.context.view_layer.objects.active = m; m.select_set(True)
    try:
        with bpy.context.temp_override(**C): bpy.ops.import_scene.fbx(filepath=ROOT + "/downloads/mixamo/" + clip + ".fbx", automatic_bone_orientation=False, ignore_leaf_bones=True)
    except Exception as e: print(clip, "import failed", str(e)[-300:]); continue
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if not arm: print(clip, "no armature"); continue
    act = arm.animation_data.action; f0, f1 = [int(x) for x in act.frame_range]
    names = [b.name for b in arm.data.bones]; pre = names[0].split(":")[0] + ":" if ":" in names[0] else ""
    print("==", clip, "frames", f0, f1, "bones", len(names), "meshes", [o.name for o in bpy.data.objects if o.type == "MESH"])
    if clip == "fishing_idle": print("bones:", names)
    sc = bpy.context.scene; path = {}
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 12)):
        sc.frame_set(f); bpy.context.view_layer.update()
        row = {}
        for b in ("LeftHand", "RightHand", "LeftShoulder", "RightShoulder", "Hips", "LeftForeArm", "RightForeArm", "Head"):
            pb = arm.pose.bones.get(pre + b)
            if pb: row[b] = [round(v, 3) for v in (arm.matrix_world @ pb.head)]
        idx = arm.pose.bones.get(pre + "RightHandIndex1"); row["R_index1_rot"] = [round(math.degrees(v), 0) for v in idx.matrix_basis.to_euler()] if idx else None
        path[f] = row
    for f, r in path.items(): print(clip, f, r)
    # draw the pose as bones at three moments, from the front and the side
    workbench()
    for f in (f0, (f0 + f1) // 2, f1):
        sc.frame_set(f); bpy.context.view_layer.update()
        sticks = []
        for pb in arm.pose.bones:
            h = arm.matrix_world @ pb.head; t = arm.matrix_world @ pb.tail; L = (t - h).length
            if L < 1e-4: continue
            me = bpy.data.meshes.new("st"); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=min(0.02, L * 0.15) * (100 if L < 0.1 else 1) if False else min(0.025, max(0.004, L * 0.12)), radius2=0.002, depth=L); bm.to_mesh(me); bm.free()
            o = bpy.data.objects.new("st", me); o.matrix_world = Matrix.Translation((h + t) / 2) @ (t - h).to_track_quat("Z", "Y").to_matrix().to_4x4()
            col = (1, 0.3, 0.2) if "Left" in pb.name else (0.2, 0.5, 1) if "Right" in pb.name else (0.8, 0.8, 0.8)
            me.materials.append(mat("c%.1f" % col[0], col)); link(o); sticks.append(o)
        hips = arm.matrix_world @ arm.pose.bones[pre + "Hips"].head
        sz = (arm.matrix_world.to_scale().x)
        shot(f"mx_{clip}_{f}_front", hips + Vector((0, 0, 0.3 * sz / 0.01 if sz < 0.1 else 0.3)), hips + Vector((0, -4, 0.6)), 50)
        shot(f"mx_{clip}_{f}_side", hips + Vector((0, 0, 0.3)), hips + Vector((-4, 0, 0.6)), 50)
        for o in sticks: bpy.data.objects.remove(o, do_unlink=True)
