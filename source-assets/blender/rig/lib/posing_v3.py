# FishDock rig rebuild: putting the rig's hands on the equipment (exec'd after riglib.py and griplib.py)
# The hand goes where a grip puts it (the arm's IK reaches it, the elbow towards its target); then each finger closes,
# joint by joint from the knuckle, until that bone meets the equipment; the thumb likewise.
FR = {"index": 0.0085, "middle": 0.0088, "ring": 0.0082, "pinky": 0.0074, "thumb": 0.0100}
def load_rig():
    bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
    rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
    for S in "LR":
        pp = rig.pose.bones.get("upper_arm_parent." + S)
        if pp: pp["IK_FK"] = 0.0; pp["IK_Stretch"] = 0.0; pp["pole_vector"] = True
    return rig, body
def rest_hand(rig, S):
    """The hand's rest frame and its knuckles in that frame."""
    b = rig.data.bones["DEF-hand." + S]; M = rig.matrix_world @ b.matrix_local; Mi = M.inverted()
    loc = lambda n: Mi @ (rig.matrix_world @ rig.data.bones[n].head_local)
    mcp = {f: loc(f"DEF-f_{f}.01.{S}") for f in ("index", "middle", "ring", "pinky")}
    return M, mcp
def palm_frame(rig, S):
    """the palm's own frame in the hand bone's rest frame, from the hand itself (not the bone's roll): k along the
    knuckles towards the first finger, palm the way the palm faces (where the fingers close to), along towards the
    fingers"""
    M, mcp = rest_hand(rig, S); Mi = M.inverted().to_3x3()
    k = (mcp["index"] - mcp["pinky"]).normalized()
    pz = Vector()
    for f in ("index", "middle", "ring", "pinky"): pz += Mi @ (rig.matrix_world.to_3x3() @ rig.data.bones[f"DEF-f_{f}.01.{S}"].matrix_local.to_3x3().col[2])
    palm = (pz - pz.dot(k) * k).normalized(); along = palm.cross(k).normalized()
    if along.dot(mcp["middle"]) < 0: along = -along
    return M, mcp, k, palm, along
def frame(a1, a2):
    a1 = a1.normalized(); a2 = (a2 - a2.dot(a1) * a1).normalized(); return Matrix((a1, a2, a1.cross(a2))).transposed()
def set_hand(rig, S, Mworld):
    """put the hand bone (DEF-hand) at Mworld: the IK control set with its own rest offset from the hand bone"""
    off = rig.data.bones["DEF-hand." + S].matrix_local.inverted() @ rig.data.bones["hand_ik." + S].matrix_local
    pb = rig.pose.bones["hand_ik." + S]; pb.matrix = rig.matrix_world.inverted() @ Mworld @ off; bpy.context.view_layer.update()
def set_pole(rig, S, Pworld):
    pb = rig.pose.bones["upper_arm_ik_target." + S]; m = pb.matrix.copy(); m.translation = rig.matrix_world.inverted() @ Vector(Pworld); pb.matrix = m; bpy.context.view_layer.update()
def wpos(rig, n, tail=False):
    b = rig.pose.bones[n]; return rig.matrix_world @ (b.tail if tail else b.head)
def chain(rig, f, S):
    return [f"{f}.0{i}.{S}" if f == "thumb" else f"f_{f}.0{i}.{S}" for i in (1, 2, 3)]
def segs(rig, f, S, k0=0):
    out = []
    for i in range(k0, 3):
        n = ("DEF-thumb.0%d.%s" if f == "thumb" else "DEF-f_" + f + ".0%d.%s") % (i + 1, S); out.append((wpos(rig, n), wpos(rig, n, True)))
    return out
def clearance(rig, f, S, colliders, k0, only=None):
    """the least gap (m) between finger f's bones (from k0, or only bone `only`) and any collider (segments with radii)"""
    best = 9.0; ss = segs(rig, f, S, 0)
    for i, (p, q) in enumerate(ss):
        if (only is not None and i != only) or i < k0: continue
        for (a, b, r) in colliders: best = min(best, seg_dist(p, q, a, b) - r - FR[f] * (0.85 if i == 2 else 1.0))
    return best
def close_finger(rig, f, S, colliders, maxdeg=(95, 105, 85), step=2.0, keep=0.0015):
    """close finger f joint by joint until each bone touches (or its joint reaches its limit)"""
    names = chain(rig, f, S); angs = [0.0, 0.0, 0.0]
    for nm in names: pb = rig.pose.bones[nm]; pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    for j in range(3):
        pb = rig.pose.bones[names[j]]; a = 0.0
        while a < maxdeg[j]:
            pb.rotation_euler.x = math.radians(a + step); bpy.context.view_layer.update()
            if clearance(rig, f, S, colliders, j, only=j) < keep or clearance(rig, f, S, colliders, j) < -0.003:
                pb.rotation_euler.x = math.radians(a); bpy.context.view_layer.update(); break
            a += step
        angs[j] = a
    return angs
def cyl(a, b, r): return (Vector(a), Vector(b), r)
