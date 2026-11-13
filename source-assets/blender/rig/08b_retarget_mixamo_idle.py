for _f in ("riglib", "griplib", "posing_v3"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the Mixamo fishing idle (motion capture) on the rig again, after its finger hinges were fixed. Each arm, hand, finger and thumb bone
# takes the captured bone's turn in the world, corrected by the difference between the two skeletons' rest poses; the
# chest likewise. Rendered on the character to check the hold before the equipment is fitted to it.
rig, body = load_rig(); C = ctx3d()
for S in "LR": rig.pose.bones["upper_arm_parent." + S]["IK_FK"] = 1.0   # (FK: the captured arm drives the bones)
jk = bpy.data.objects.get("jacket")
for o in bpy.context.view_layer.objects: o.select_set(False)
m = link(bpy.data.objects.new("dummy", None)); bpy.context.view_layer.objects.active = m
before = set(bpy.data.objects)
with bpy.context.temp_override(**C): bpy.ops.import_scene.fbx(filepath=ROOT + "/downloads/mixamo/fishing_idle.fbx", automatic_bone_orientation=False, ignore_leaf_bones=True)
src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"); src.name = "mx_idle"
sc = bpy.context.scene; FRAME = 40; sc.frame_set(FRAME); bpy.context.view_layer.update()
P = "mixamorig:"
MAP = []
for s, S in (("Left", "L"), ("Right", "R")):
    MAP += [(f"{s}Shoulder", f"shoulder.{S}", f"DEF-shoulder.{S}"), (f"{s}Arm", f"upper_arm_fk.{S}", f"DEF-upper_arm.{S}"), (f"{s}ForeArm", f"forearm_fk.{S}", f"DEF-forearm.{S}"), (f"{s}Hand", f"hand_fk.{S}", f"DEF-hand.{S}")]
    for mx, rf in (("Thumb", "thumb"), ("Index", "f_index"), ("Middle", "f_middle"), ("Ring", "f_ring"), ("Pinky", "f_pinky")):
        for j in (1, 2, 3): MAP.append((f"{s}Hand{mx}{j}", f"{rf}.0{j}.{S}", f"DEF-{rf}.0{j}.{S}"))
def q_src_rest(n): return (src.matrix_world @ src.data.bones[P + n].matrix_local).to_quaternion()
def q_src_now(n): return (src.matrix_world @ src.pose.bones[P + n].matrix).to_quaternion()
def q_tgt_rest(n): return (rig.matrix_world @ rig.data.bones[n].matrix_local).to_quaternion()
def d_src_rest(n): b = src.data.bones[P + n]; return ((src.matrix_world @ b.tail_local) - (src.matrix_world @ b.head_local)).normalized()
def d_tgt_rest(n): b = rig.data.bones[n]; return ((rig.matrix_world @ b.tail_local) - (rig.matrix_world @ b.head_local)).normalized()
def align(mx, de):
    """turns our bone's rest direction onto the captured skeleton's rest direction (our A-pose into its T-pose)"""
    return d_tgt_rest(de).rotation_difference(d_src_rest(mx))
# the chest first (the captured upper spine's turn about the chest's pivot)
ch = rig.pose.bones["chest"]; dq = (q_src_now("Hips").inverted() @ q_src_now("Spine2")) @ (q_src_rest("Hips").inverted() @ q_src_rest("Spine2")).inverted()   # (the upper spine's own bend against the hips, not the whole body's facing)
piv = rig.matrix_world @ ch.head; T = Matrix.Translation(piv)
ch.matrix = rig.matrix_world.inverted() @ (T @ dq.to_matrix().to_4x4() @ T.inverted()) @ rig.matrix_world @ ch.matrix; bpy.context.view_layer.update()
miss = []
for mx, ctrl, de in MAP:
    if P + mx not in src.pose.bones or ctrl not in rig.pose.bones: miss.append((mx, ctrl)); continue
    want = q_src_now(mx) @ q_src_rest(mx).inverted() @ align(mx, de) @ q_tgt_rest(de)
    pb = rig.pose.bones[ctrl]; cur = pb.matrix.copy()
    # (the control's own rest may differ from its deform bone's: carry that offset)
    off = (rig.data.bones[de].matrix_local.to_quaternion().inverted() @ rig.data.bones[ctrl].matrix_local.to_quaternion())
    qa = (rig.matrix_world.to_quaternion().inverted() @ want @ off)
    pb.matrix = Matrix.Translation(cur.translation) @ qa.to_matrix().to_4x4(); bpy.context.view_layer.update()
print("not mapped", miss)
fmt = lambda v: [round(x, 3) for x in v]
for S, s in (("R", "Right"), ("L", "Left")):
    print(S, "hand at", fmt(wpos(rig, "DEF-hand." + S)), "captured hand at", fmt(src.matrix_world @ src.pose.bones[P + s + "Hand"].head), "shoulder", fmt(wpos(rig, "DEF-upper_arm." + S)))
src.hide_render = True; src.hide_viewport = True
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/mocap_idle.blend")
sc.render.engine = "BLENDER_EEVEE"
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.42, 0.47, 0.55, 1)
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
body.data.materials.clear(); body.data.materials.append(mat("skin_e", (0.80, 0.58, 0.47), 0.48))
if jk: jk.hide_render = False
shot("mc3_front", (0, -0.1, 1.15), (0.3, -2.3, 1.4), 50); shot("mc3_side", (0, -0.15, 1.15), (-2.3, -0.3, 1.3), 50)
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; eye = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
cam = camera(); cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(62); cam.data.clip_start = 0.07; cam.location = eye
hc = (wpos(rig, "DEF-hand.R") + wpos(rig, "DEF-hand.L")) / 2; cam.rotation_euler = (hc + Vector((0, -0.25, 0.1)) - eye).to_track_quat("-Z", "Y").to_euler()
sc.render.resolution_x, sc.render.resolution_y = 720, 1280; sc.render.filepath = RENDERS + "/mc3_fp.png"; bpy.ops.render.render(write_still=True); print("rendered mc3_fp")
cam.data.sensor_fit = "AUTO"; cam.data.clip_start = 0.005
for S in "RL":
    c = wpos(rig, "DEF-hand." + S); shot("mc3_hand_" + S, c, c + Vector((0.2 if S == "L" else -0.2, -0.3, 0.12)), 50)
