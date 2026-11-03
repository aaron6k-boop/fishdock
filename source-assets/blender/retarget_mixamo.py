# FishDock: Mixamo movements retargeted onto FishDock's people (the Microsoft Rocketbox skeleton, Bip01_*), baked and
# exported as people/anims2.glb. Y Bot (Mixamo's reference rig) is only the source skeleton; nothing of it is exported.
# How: every mapped bone takes the source bone's rotation in the world, corrected by the difference between the two
# skeletons' rest poses (so a T-posed Y Bot drives a Rocketbox rest pose correctly); the hips' travel is scaled by the
# two skeletons' hip heights. Rotations only below the hips, so the Rocketbox proportions are kept.
import bpy, os, math
from mathutils import Matrix, Vector, Quaternion
A = "C:/Users/aaron/Documents/FishDock-assets"; MX = A + "/downloads/mixamo"
CLIPS = {  # file -> clip name in FishDock
    "fishing_idle": "x_fish_idle", "fishing_cast": "x_cast", "crouching_idle": "x_crouch", "kneeling_down": "x_kneel_down",
    "kneeling_idle": "x_kneel", "kneeling_inspecting": "x_inspect", "picking_up": "x_pick_up", "pulling_rope": "x_pull_rope",
    "turn_left_90": "x_turn_l", "turn_right_90": "x_turn_r", "walk_male": "x_walk_m", "walk_female": "x_walk_f", "run_standard": "x_run", "ybot_breathing_idle": "x_idle",
}
MAP = {"Hips": "Bip01_Pelvis", "Spine": "Bip01_Spine", "Spine1": "Bip01_Spine1", "Spine2": "Bip01_Spine2", "Neck": "Bip01_Neck", "Head": "Bip01_Head"}
for s, S in (("Left", "L"), ("Right", "R")):
    MAP.update({f"{s}Shoulder": f"Bip01_{S}_Clavicle", f"{s}Arm": f"Bip01_{S}_UpperArm", f"{s}ForeArm": f"Bip01_{S}_Forearm", f"{s}Hand": f"Bip01_{S}_Hand",
                f"{s}UpLeg": f"Bip01_{S}_Thigh", f"{s}Leg": f"Bip01_{S}_Calf", f"{s}Foot": f"Bip01_{S}_Foot", f"{s}ToeBase": f"Bip01_{S}_Toe0"})
    for k, f in enumerate(("Thumb", "Index", "Middle", "Ring", "Pinky")):
        for j in range(3): MAP[f"{s}Hand{f}{j + 1}"] = f"Bip01_{S}_Finger{k}" + ("" if j == 0 else str(j))

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
sc = bpy.context.scene; sc.render.fps = 30
# the target: FishDock's own skeleton, from its movements file
# (a person's file: its skin makes the importer build the armature; the person itself isn't exported)
before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=A + "/source/people/m04.glb")
tgt = [o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"][0]; tgt.name = "rocketbox"
print("TARGET bones", len(tgt.data.bones), [b.name for b in tgt.data.bones][:6])
tgt.animation_data_create(); tgt.animation_data.action = None
for t in tgt.animation_data.nla_tracks[:]: tgt.animation_data.nla_tracks.remove(t)
old_actions = set(bpy.data.actions)
def rest_world(arm, name):
    b = arm.data.bones.get(name); return (arm.matrix_world @ b.matrix_local) if b else None
def depth(b):
    d = 0
    while b.parent: d += 1; b = b.parent
    return d
TB = sorted([b for b in tgt.data.bones], key=depth)
ROOT = "Bip01_Pelvis"  # (the hips carry the travel: Bip01 itself is a node above the armature)
t_hips = rest_world(tgt, "Bip01_Pelvis").translation
made = []
for fname, clip in CLIPS.items():
    path = f"{MX}/{fname}.fbx"
    if not os.path.exists(path): print("MISSING", fname); continue
    before = set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]; src = [o for o in new if o.type == "ARMATURE"][0]
    pre = "mixamorig:" if any(b.name.startswith("mixamorig:") for b in src.data.bones) else ("mixamorig1:" if any(b.name.startswith("mixamorig1:") for b in src.data.bones) else "")
    act = src.animation_data.action; f0, f1 = [int(round(x)) for x in act.frame_range]
    # rest offsets (world space): source rest -> target rest, per pair
    pairs = []
    for sn, tn in MAP.items():
        sb, tb = src.data.bones.get(pre + sn), tgt.data.bones.get(tn)
        if not sb or not tb: continue
        Sr = (src.matrix_world @ sb.matrix_local).to_quaternion(); Tr = (tgt.matrix_world @ tb.matrix_local).to_quaternion()
        pairs.append((pre + sn, tn, Sr.inverted() @ Tr))
    by_t = {tn: (sn, off) for sn, tn, off in pairs}
    s_hips0 = rest_world(src, pre + "Hips").translation
    k = t_hips.z / max(0.01, s_hips0.z)  # (heights above the ground: blender z up)
    a2 = bpy.data.actions.new(clip); tgt.animation_data.action = a2
    for pb in tgt.pose.bones: pb.rotation_mode = "QUATERNION"
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        for pb in tgt.pose.bones: pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        # the hips' travel, scaled to FishDock's skeleton, on the root
        sh = (src.matrix_world @ src.pose.bones[pre + "Hips"].matrix).translation
        want = t_hips + (sh - s_hips0) * k
        rp = tgt.pose.bones.get(ROOT)
        if rp:
            cur = (tgt.matrix_world @ rp.matrix)
            m = cur.copy(); m.translation = cur.translation + (want - t_hips)
            rp.matrix = tgt.matrix_world.inverted() @ m
            bpy.context.view_layer.update()
        last_d = -1
        for b in TB:
            if b.name not in by_t: continue
            d = depth(b)
            if d != last_d: bpy.context.view_layer.update(); last_d = d
            sn, off = by_t[b.name]; pb = tgt.pose.bones[b.name]
            Sw = (src.matrix_world @ src.pose.bones[sn].matrix).to_quaternion()
            cur = tgt.matrix_world @ pb.matrix
            m = Matrix.LocRotScale(cur.translation, Sw @ off, cur.to_scale())
            pb.matrix = tgt.matrix_world.inverted() @ m
        bpy.context.view_layer.update()
        for pb in tgt.pose.bones:
            if pb.name in by_t or pb.name == ROOT:
                pb.keyframe_insert("rotation_quaternion", frame=f - f0)
                if pb.name == ROOT: pb.keyframe_insert("location", frame=f - f0)
    a2.use_fake_user = True
    made.append((clip, f1 - f0 + 1))
    # the source rig and its action go
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.actions.remove(act)
    print("RETARGET", clip, f1 - f0 + 1, "frames")
# only the new clips, each as its own NLA strip, then exported
for a in list(old_actions):
    if a.name in bpy.data.actions: bpy.data.actions.remove(a)
tgt.animation_data.action = None
for clip, n in made:
    tr = tgt.animation_data.nla_tracks.new(); tr.name = clip; tr.strips.new(clip, 0, bpy.data.actions[clip])
os.makedirs(A + "/exports", exist_ok=True); os.makedirs(A + "/source/people", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=A + "/source/people/mixamo_retarget.blend")
for o in [o for o in bpy.data.objects if o.type == "MESH"]: bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT"); tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
bpy.ops.export_scene.gltf(filepath=A + "/exports/anims2.glb", export_format="GLB", use_selection=True, export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_skins=True, export_def_bones=False)
print("RETARGET DONE", len(made), "clips", os.path.getsize(A + "/exports/anims2.glb") // 1000, "kB")
