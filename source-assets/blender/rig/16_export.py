for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the first-person character exported for the game (v2: only the arms' own skin) (public/models/fp_rig.glb). The deform
# skeleton only (Rigify's DEF bones), the hands and forearms (the body's skin cut 10 cm up the forearm from the wrist,
# under the jacket's cuffs) and the jacket, skinned to those bones; and four clips, each sampled from the rig itself:
#   hold   the Gate 1 hold (rig/gate1_v12.blend), one frame
#   reel   the last of Gate 2's ten turns (rig/gate2_reel.blend): 24 frames, one turn of the handle
#   cast   Gate 3's cast (rig/gate3_cast.blend): 58 frames at 24 a second
#   grips  one frame for each grip's fingers and thumb (rig/grips.json), both hands; the order is in fp_rig_meta.json
# The arms in these clips are where Blender's IK put them; in the game the arms are put on the equipment by the game's
# own IK each frame, the clips giving the body's turn, the shoulders and the fingers.
CTRL_G2 = ["hand_ik.L", "shoulder.L"]
CTRL_G3 = ["hand_ik.R", "hand_ik.L", "chest", "upper_arm_ik_target.R", "upper_arm_ik_target.L"]
def capture(path, names, frames):
    bpy.ops.wm.open_mainfile(filepath=path); r = bpy.data.objects["fp_rig"]; sc = bpy.context.scene; out = []
    for f in frames:
        sc.frame_set(f); bpy.context.view_layer.update()
        out.append({n: [list(row) for row in r.pose.bones[n].matrix_basis] for n in names})
    return out
G2 = json.load(open(RIGDIR + "/gate2_rows.json")); N2 = G2["fpr"] * G2["revs"]
reel_frames = capture(RIGDIR + "/gate2_reel.blend", CTRL_G2, range(N2 - G2["fpr"] + 1, N2 + 2))
fing_L = None
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate3_cast.blend"); _r = bpy.data.objects["fp_rig"]
fing_L = [n for f in ("index", "middle", "ring", "pinky", "thumb") for n in chain(_r, f, "L")]; NF3 = bpy.context.scene.frame_end
cast_frames = capture(RIGDIR + "/gate3_cast.blend", CTRL_G3 + fing_L, range(1, NF3 + 1))
GR = json.load(open(RIGDIR + "/grips.json"))
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v12.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]; C = ctx3d(); sc = bpy.context.scene
exec(open(ROOT + "/scripts/gatelib_v1.py").read())
ad = rig.animation_data_create(); ad.action = None
for tr in list(ad.nla_tracks): ad.nla_tracks.remove(tr)
def key_all(names, frame):
    for n in names: key_pose_bone(rig.pose.bones[n], frame)
def new_clip(name):
    act = bpy.data.actions.new(name); ad.action = act; return act
def stash(act, name):
    tr = ad.nla_tracks.new(); tr.name = name; st = tr.strips.new(name, int(act.frame_range[0]), act)
    try:
        if hasattr(st, "action_slot") and not st.action_slot and len(act.slots): st.action_slot = act.slots[0]
    except Exception as e: print("slot", e)
    ad.action = None; print("clip", name, "frames", tuple(act.frame_range))
FINGERS = {S: [n for f in ("index", "middle", "ring", "pinky", "thumb") for n in chain(rig, f, S)] for S in "LR"}
for S in "LR":
    for n in FINGERS[S]: rig.pose.bones[n].rotation_mode = "XYZ"
HOLD_BASIS = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
def restore():
    for pb in rig.pose.bones: pb.matrix_basis = HOLD_BASIS[pb.name]
    bpy.context.view_layer.update()
ALLC = list(HOLD_BASIS.keys())
# ---- hold ----
act = new_clip("hold"); restore(); key_all(["hand_ik.L", "hand_ik.R", "shoulder.L", "shoulder.R", "chest"] + FINGERS["L"] + FINGERS["R"], 1); stash(act, "hold")
# ---- reel ----
act = new_clip("reel"); restore()
for i, fr in enumerate(reel_frames):
    for n, m in fr.items(): rig.pose.bones[n].matrix_basis = Matrix(m)
    bpy.context.view_layer.update(); key_all(CTRL_G2, i + 1)
stash(act, "reel")
# ---- cast ----
act = new_clip("cast"); restore()
for i, fr in enumerate(cast_frames):
    for n, m in fr.items(): rig.pose.bones[n].matrix_basis = Matrix(m)
    bpy.context.view_layer.update(); key_all(list(fr.keys()), i + 1)
stash(act, "cast")
# ---- grips: one frame each ----
ORDER = ["hold", "rope", "hoop", "pole", "butt", "tail", "cradle", "relax"]
act = new_clip("grips"); restore()
for i, g in enumerate(ORDER):
    for S in "LR":
        pose = GR["hold"] if g == "hold" else GR[g + "_" + S]["fingers"]
        for n in FINGERS[S]:
            if n in pose: rig.pose.bones[n].rotation_euler = tuple(math.radians(x) for x in pose[n])
    bpy.context.view_layer.update(); key_all(FINGERS["L"] + FINGERS["R"], i + 1)
stash(act, "grips")
restore()
# ---- the meshes: the hands and forearms, and the jacket ----
J = json.load(open(RIGDIR + "/joints.json"))
skin = body.copy(); skin.data = body.data.copy(); skin.name = "fp_skin"; link(skin)
for m in list(skin.modifiers):
    if m.type != "ARMATURE": skin.modifiers.remove(m)
bm = bmesh.new(); bm.from_mesh(skin.data); mw = skin.matrix_world; keep = set()
# (only the arms' own skin: a point kept only if most of its weight is on the forearm, hand, palm, fingers or thumb.
# Kept by distance from the wrist alone, in the rest pose the hips and thighs beside the hands came too, and hung as
# blocks of skin under the jacket)
ARMB = {vg.index for vg in skin.vertex_groups if any(k in vg.name for k in ("forearm", "hand", "palm", "f_", "thumb"))}
def arm_share(v):
    tot = sum(g.weight for g in skin.data.vertices[v].groups); return 0 if tot <= 0 else sum(g.weight for g in skin.data.vertices[v].groups if g.group in ARMB) / tot
for S in "LR":
    W = Vector(J["wrist." + S]); E = Vector(J["elbow." + S]); ax = (E - W).normalized()
    for v in bm.verts:
        p = mw @ v.co; t = (p - W).dot(ax)
        if t < 0.10 and (p - W).length < 0.30 and arm_share(v.index) >= 0.5: keep.add(v.index)
bm.verts.ensure_lookup_table(); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS"); bm.to_mesh(skin.data); bm.free()
for vg in list(skin.vertex_groups):
    if not vg.name.startswith("DEF-"): skin.vertex_groups.remove(vg)
skin.data.materials.clear(); skin.data.materials.append(mat("fd_skin", (0.80, 0.58, 0.47), 0.5))
with bpy.data.libraries.load(RIGDIR + "/fp_character.blend") as (src, dst): dst.objects = ["jacket"]
jk = dst.objects[0]; link(jk); jk.parent = rig
for m in jk.modifiers:
    if m.type == "ARMATURE": m.object = rig
jk.data = jk.data.copy(); print("jacket points", len(jk.data.vertices), "modifiers", [(m.name, m.type) for m in jk.modifiers])
if len(jk.data.vertices) > 14000:
    dm = jk.modifiers.new("dec", "DECIMATE"); dm.ratio = 12000 / len(jk.data.vertices)
    while jk.modifiers[0] != dm:
        with bpy.context.temp_override(**C, object=jk, active_object=jk): bpy.ops.object.modifier_move_up(modifier=dm.name)
    with bpy.context.temp_override(**C, object=jk, active_object=jk): bpy.ops.object.modifier_apply(modifier=dm.name)
    print("jacket decimated to", len(jk.data.vertices))
for vg in list(jk.vertex_groups):
    if not vg.name.startswith("DEF-"): jk.vertex_groups.remove(vg)
jk.data.materials.clear(); jk.data.materials.append(mat("fd_jacket", (0.06, 0.09, 0.17), 0.88)); jk.name = "fp_jacket"
print("skin points", len(skin.data.vertices), "jacket points", len(jk.data.vertices))
# ---- what the game needs alongside: the eye, the bones' rest places, the grips' frames in the clip ----
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; EYE = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
HEAD = "DEF-spine.006" if "DEF-spine.006" in rig.data.bones else "DEF-head"
sc.render.fps = 24; sc.render.fps_base = 1.0
meta = dict(eye=list(EYE), head=HEAD, head_rest=[list(r) for r in (rig.matrix_world @ rig.data.bones[HEAD].matrix_local)], grips_order=ORDER, fps=sc.render.fps,
            rest={n: [list(rig.matrix_world @ rig.data.bones[n].head_local), list(rig.matrix_world @ rig.data.bones[n].tail_local)] for n in rig.data.bones.keys() if n.startswith("DEF-") and any(k in n for k in ("shoulder", "upper_arm", "forearm", "hand", "spine"))},
            hold_world={n: [list(r) for r in (rig.matrix_world @ rig.pose.bones[n].matrix)] for n in rig.pose.bones.keys() if n.startswith("DEF-") and any(k in n for k in ("shoulder", "upper_arm", "forearm", "hand."))},
            rod_grip=[list(r) for r in Matrix(rig["fd_rod_grip"])], knob_grip=[list(r) for r in Matrix(rig["fd_knob_grip"])], crank_deg=float(rig.get("fd_crank_deg", 30)), seat=SEAT,
            rod_world=[list(r) for r in bpy.data.objects["ROD"].matrix_world])
json.dump(meta, open(RIGDIR + "/fp_rig_meta.json", "w"), indent=1)
rig["fd_source"] = "FishDock rig rebuild: Rigify on the Blender Studio Human Base Meshes realistic male (CC0); casting body motion from Mixamo"
for o in bpy.context.view_layer.objects: o.select_set(False)
for o in (rig, skin, jk): o.hide_viewport = False; o.hide_set(False); o.select_set(True)
bpy.context.view_layer.objects.active = rig
sc.frame_set(1); sc.render.fps = 24; sc.render.fps_base = 1.0   # (the clips are timed at 24 frames a second, as the gates made them)
OUT = ROOT + "/export/fp_rig.glb"; os.makedirs(ROOT + "/export", exist_ok=True)
kw = dict(filepath=OUT, export_format="GLB", use_selection=True, export_def_bones=True, export_skins=True, export_animations=True, export_animation_mode="NLA_TRACKS",
          export_force_sampling=True, export_extras=True, export_yup=True, export_apply=False, export_morph=False, export_materials="EXPORT", export_image_format="NONE", export_cameras=False, export_lights=False)
with bpy.context.temp_override(**C):
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print("exporter options:", e); kw.pop("export_image_format", None); bpy.ops.export_scene.gltf(**kw)
print("exported", OUT, os.path.getsize(OUT), "bytes")
