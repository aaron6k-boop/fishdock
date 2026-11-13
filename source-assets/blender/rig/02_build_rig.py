exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/riglib.py").read())
# FishDock rig rebuild, step 2: a Rigify human rig fitted to the Blender Studio realistic male from the measured joints
# (rig/joints.json), generated, the skin bound to its deform bones, saved as rig/fp_character.blend; renders of the
# rest pose with the bones drawn, and both hands closed into a fist through the rig's own finger controls.
J = json.load(open(RIGDIR + "/joints.json"))
body, OFF = load_body(); C = ctx3d()
if "rigify" not in bpy.context.preferences.addons: bpy.ops.preferences.addon_enable(module="rigify")
# ---- the skin: one level of the sculpt's subdivision kept (hands about 4,600 points each), the rest to bake later ----
if body.data.shape_keys:
    print("shape keys", [kb.name for kb in body.data.shape_keys.key_blocks])
    for kb in list(body.data.shape_keys.key_blocks)[::-1]: body.shape_key_remove(kb)
mr = next(m for m in body.modifiers if m.type == "MULTIRES"); mr.levels = 1
with bpy.context.temp_override(**C, active_object=body, object=body, selected_objects=[body]): bpy.ops.object.modifier_apply(modifier=mr.name)
print("skin points", len(body.data.vertices))
# ---- the meta-rig ----
with bpy.context.temp_override(**C): bpy.ops.object.armature_human_metarig_add()
meta = next(o for o in bpy.data.objects if o.type == "ARMATURE"); meta.name = "metarig"
print("metarig bones", len(meta.data.bones))
# scaled to his height first (legs and spine), then every arm and hand bone placed on the measured joints
top = max((meta.matrix_world @ b.tail_local).z for b in meta.data.bones); k = 1.684 / top
meta.scale = (k, k, k)
with bpy.context.temp_override(**C, active_object=meta, object=meta, selected_objects=[meta]): bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
V = lambda a: Vector(a)
def fl(S, nm): return J["finger." + nm + "." + S]
def polyline(F):
    pts = [V(F["tip"])] + [V(l[1]) for l in F["line"]]; acc = [0.0]
    for a, b in zip(pts, pts[1:]): acc.append(acc[-1] + (b - a).length)
    return pts, acc
def at_len(pts, acc, d):
    for i in range(1, len(pts)):
        if acc[i] >= d: u = (d - acc[i - 1]) / max(1e-9, acc[i] - acc[i - 1]); return pts[i - 1].lerp(pts[i], u)
    return pts[-1] + (pts[-1] - pts[-2]).normalized() * (d - acc[-1])
def straight_dir(F, d0=0.012, d1=0.05):
    pts, acc = polyline(F); a = at_len(pts, acc, d0); b = at_len(pts, acc, d1); return (b - a).normalized()  # from the tip back towards the hand
RATIO = {"index": (0.47, (0.46, 0.28, 0.26)), "middle": (0.51, (0.47, 0.29, 0.24)), "ring": (0.48, (0.47, 0.29, 0.24)), "pinky": (0.39, (0.44, 0.30, 0.26))}
with bpy.context.temp_override(**C, active_object=meta, object=meta, selected_objects=[meta]): bpy.ops.object.mode_set(mode="EDIT")
eb = meta.data.edit_bones
# the face is not needed (first person; the third-person head is the game's own)
if "face" in eb:
    kill = [b for b in eb if b.name == "face" or any(p.name == "face" for p in b.parent_recursive)]
    for b in kill: eb.remove(b)
PLACED = {}; HINGE = {}
for S, s in (("L", 1), ("R", -1)):
    Sh, El, Wr = V(J["shoulder." + S]), V(J["elbow." + S]), V(J["wrist." + S]); Tm = V(fl(S, "middle")["tip"])
    Hl = (Tm - Wr).length; ha = (Tm - Wr).normalized()
    th = V(fl(S, "thumb")["tip"]); lat = (th - Wr) - (th - Wr).dot(ha) * ha; lat.normalize()  # towards the thumb
    dorsal = ha.cross(lat).normalized()
    if dorsal.dot(Vector((s, 0, 0))) < 0: dorsal = -dorsal  # the back of the hand faces out, away from the thigh
    # the arm: a little bend at the elbow kept (the meta-rig needs one to know which way it bends)
    up = eb["upper_arm." + S]; fo = eb["forearm." + S]; hd = eb["hand." + S]; shb = eb["shoulder." + S]
    up.head = Sh; up.tail = El; fo.head = El; fo.tail = Wr
    bend = (El - Sh).normalized().cross((Wr - El).normalized())
    for b in (up, fo): b.align_roll(bend.cross(b.vector).normalized()) if bend.length > 1e-4 else None
    shb.head = Vector((0.022 * s, -0.035, 1.425)); shb.tail = Sh; shb.align_roll(Vector((0, 0, 1)))
    # the fingers: each finger's knuckles along its own centre line, by the finger's share of the hand's length
    mcp = {}
    for nm, (fr, (rp, rm, rd)) in RATIO.items():
        F = fl(S, nm); tip = V(F["tip"]); pts, acc = polyline(F); Lf = fr * Hl
        dirn = straight_dir(F)
        dip = at_len(pts, acc, rd * Lf); pip = at_len(pts, acc, (rd + rm) * Lf)
        m = pip + dirn * (rp * Lf)   # beyond the web the centre line drifts into the palm: carried on straight from the finger
        mcp[nm] = m
        names = [f"f_{nm}.01.{S}", f"f_{nm}.02.{S}", f"f_{nm}.03.{S}"]
        N = (pip - m).cross(tip - pip)  # the finger's own hinge: the normal of the plane its resting curl lies in
        for bn, (a, b) in zip(names, [(m, pip), (pip, dip), (dip, tip)]):
            e = eb[bn]; e.head = a; e.tail = b
            HINGE[bn] = N.copy()
        PLACED[nm + S] = [list(m), list(pip), list(dip), list(tip)]
    # the palm's plane from its four knuckles and the wrist: its back faces out from the thigh
    latp = (mcp["index"] - mcp["pinky"]).normalized(); dorsal = latp.cross(ha).normalized()
    if dorsal.dot(Vector((s, 0, 0))) < 0: dorsal = -dorsal
    for bn, N in list(HINGE.items()):
        if not bn.endswith(S): continue
        e = eb[bn]; Y = e.vector.normalized()
        if N.length < 1e-6 or abs(N.normalized().dot(Y)) > 0.9: N = Y.cross(-dorsal)  # (a straight finger: bends towards the palm)
        if Y.cross(-dorsal).dot(N) < 0: N = -N  # (and never backwards)
        Z = N.normalized().cross(Y).normalized(); e.align_roll(Z)  # x is the hinge; a positive turn closes the finger
    # the palm: from the wrist out to each knuckle
    for i, nm in enumerate(["index", "middle", "ring", "pinky"]):
        e = eb[f"palm.0{i + 1}.{S}"]; e.head = Wr + ha * 0.012 + lat * (0.011 - 0.008 * i); e.tail = mcp[nm]
        e.align_roll(-dorsal - (-dorsal).dot(e.vector.normalized()) * e.vector.normalized())
    hd.head = Wr; hd.tail = Wr + (mcp["middle"] - Wr) * 0.5; hd.align_roll(-dorsal - (-dorsal).dot(hd.vector.normalized()) * hd.vector.normalized())
    # the thumb: tip, then the two joints back along its centre line, its base at the wrist on the thumb's side
    F = fl(S, "thumb"); pts, acc = polyline(F); tip = V(F["tip"])
    ip = at_len(pts, acc, 0.12 * Hl); tm = at_len(pts, acc, 0.275 * Hl)
    cmc_goal = Wr + lat * 0.014 + ha * 0.012 - dorsal * 0.004; cmc = tm + (cmc_goal - tm).normalized() * 0.23 * Hl
    Nt = (tm - cmc).cross(tip - tm)
    if Nt.length < 1e-6: Nt = (tm - cmc).cross(-dorsal)
    for bn, (a, b) in zip([f"thumb.01.{S}", f"thumb.02.{S}", f"thumb.03.{S}"], [(cmc, tm), (tm, ip), (ip, tip)]):
        e = eb[bn]; e.head = a; e.tail = b; Y = e.vector.normalized(); e.align_roll(Nt.normalized().cross(Y).normalized())
    PLACED["thumb" + S] = [list(cmc), list(tm), list(ip), list(tip)]
with bpy.context.temp_override(**C, active_object=meta, object=meta, selected_objects=[meta]): bpy.ops.object.mode_set(mode="OBJECT")
json.dump({k: v for k, v in PLACED.items()}, open(RIGDIR + "/placed.json", "w"), indent=1)
# ---- generate ----
for o in bpy.context.view_layer.objects: o.select_set(False)
meta.select_set(True); bpy.context.view_layer.objects.active = meta
with bpy.context.temp_override(**C): bpy.ops.pose.rigify_generate()
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o != meta); rig.name = "fp_rig"
defs = [b.name for b in rig.data.bones if b.use_deform]; print("generated", len(rig.data.bones), "bones,", len(defs), "deform")
# ---- skin bound to the deform bones ----
for o in bpy.context.view_layer.objects: o.select_set(False)
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
with bpy.context.temp_override(**C, active_object=rig, object=rig, selected_objects=[body, rig], selected_editable_objects=[body, rig]): bpy.ops.object.parent_set(type="ARMATURE_AUTO")
empty = [vg.name for vg in body.vertex_groups if vg.name.startswith("DEF-")]
print("vertex groups", len(body.vertex_groups))
for o in [o for o in bpy.data.objects if o.parent == body and o.type == "MESH"]:  # the eyes ride on the head
    mwo = o.matrix_world.copy(); o.parent = rig; o.parent_type = "BONE"; o.parent_bone = "DEF-spine.006"; o.matrix_world = mwo
meta.hide_viewport = True; meta.hide_render = True
for S in "LR":
    pp = rig.pose.bones.get("upper_arm_parent." + S)
    if pp: pp["IK_Stretch"] = 0.0; pp["pole_vector"] = True
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend")
print("saved fp_character.blend")
# ---- renders: rest pose with sticks along the deform bones, then a fist ----
workbench(xray=0.0)
skin = mat("skin", (0.85, 0.68, 0.58)); body.data.materials.clear(); body.data.materials.append(skin)
sticks = []
def draw_bones():
    for o in sticks: bpy.data.objects.remove(o, do_unlink=True)
    sticks.clear(); bpy.context.view_layer.update()
    for b in rig.pose.bones:
        if not b.bone.use_deform: continue
        h = rig.matrix_world @ b.head; t = rig.matrix_world @ b.tail; L = (t - h).length
        if L < 1e-4: continue
        me = bpy.data.meshes.new("st"); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=min(0.004, L * 0.15), radius2=0.0006, depth=L); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new("st", me); o.matrix_world = Matrix.Translation((h + t) / 2) @ (t - h).to_track_quat("Z", "Y").to_matrix().to_4x4()
        nm = b.name; col = (1, 0.5, 0) if "thumb" in nm else (0.1, 0.4, 1) if "index" in nm else (0.1, 0.8, 0.2) if "middle" in nm else (0.8, 0.1, 0.9) if "ring" in nm else (1, 0.9, 0.1) if "pinky" in nm else (1, 0.15, 0.15)
        me.materials.append(mat("bc%.1f%.1f%.1f" % col, col)); link(o); sticks.append(o)
bpy.context.scene.display.shading.show_xray = True; bpy.context.scene.display.shading.xray_alpha = 0.45
draw_bones()
shot("rig_rest_front", (0, 0, 1.1), (0, -2.8, 1.1)); 
for S, s in (("L", 1), ("R", -1)):
    W = Vector(J["wrist." + S]); T = Vector(J["finger.middle." + S]["tip"]); c = (W + T) / 2
    shot("rig_rest_hand_out_" + S, c, c + Vector((0.34 * s, 0, 0)), 85); shot("rig_rest_hand_in_" + S, c, c + Vector((-0.28 * s, -0.08, 0.04)), 85)
# a fist, through the rig's finger controls (FK), checked with the bones and without
for pb in rig.pose.bones:
    nm = pb.name
    if nm.startswith(("f_index.0", "f_middle.0", "f_ring.0", "f_pinky.0")) and "master" not in nm and nm[-1] in "LR" and "." in nm:
        n = int(nm.split(".")[1][:2]); pb.rotation_mode = "XYZ"; pb.rotation_euler = (math.radians([0, 75, 95, 65][n]), 0, 0)
    if nm.startswith("thumb.0") and "master" not in nm and nm[-1] in "LR":
        n = int(nm.split(".")[1][:2]); pb.rotation_mode = "XYZ"; pb.rotation_euler = (math.radians([0, 15, 40, 45][n]), 0, 0)
bpy.context.view_layer.update(); draw_bones()
for S, s in (("L", 1), ("R", -1)):
    W = Vector(J["wrist." + S]); T = Vector(J["finger.middle." + S]["tip"]); c = W + (T - W) * 0.4
    shot("rig_fist_out_" + S, c, c + Vector((0.3 * s, 0, 0)), 85); shot("rig_fist_front_" + S, c, c + Vector((0.05 * s, -0.3, 0)), 85)
bpy.context.scene.display.shading.show_xray = False
for o in sticks: o.hide_render = True
for S, s in (("L", 1), ("R", -1)):
    W = Vector(J["wrist." + S]); T = Vector(J["finger.middle." + S]["tip"]); c = W + (T - W) * 0.4
    shot("rig_fist_skin_out_" + S, c, c + Vector((0.3 * s, 0, 0)), 85); shot("rig_fist_skin_front_" + S, c, c + Vector((0.05 * s, -0.3, 0)), 85); shot("rig_fist_skin_in_" + S, c, c + Vector((-0.25 * s, -0.1, -0.05)), 85)
print("done")
