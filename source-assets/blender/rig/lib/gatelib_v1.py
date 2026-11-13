# FishDock rig rebuild: measuring a hold (exec'd after riglib.py, griplib.py, posing_v3.py and skin_v2.py, with `rig` set):
# each wrist's bend (palm, thumb side), the forearm's turn and the elbow's angle; how far each arm's bones are from
# their own lengths (1.000 is unstretched); the natural limits the scores keep inside.
LOC = {S: palm_frame(rig, S) for S in "LR"}
REST = {S: ((rig.data.bones["DEF-forearm." + S].head_local - rig.data.bones["DEF-upper_arm." + S].head_local).length, (rig.data.bones["DEF-hand." + S].head_local - rig.data.bones["DEF-forearm." + S].head_local).length) for S in "LR"}
for pb in rig.pose.bones: pb.ik_stretch = 0.0
for S in "LR":
    pp = rig.pose.bones["upper_arm_parent." + S]; pp["IK_FK"] = 0.0; pp["IK_Stretch"] = 0.0; pp["pole_vector"] = True
def lengths(S):
    sh, el, wr = wpos(rig, "DEF-upper_arm." + S), wpos(rig, "DEF-forearm." + S), wpos(rig, "DEF-hand." + S); return (el - sh).length / REST[S][0], (wr - el).length / REST[S][1]
def hand_R3(S): return (rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix).to_3x3().normalized()
def wrist(S):
    """(palm bend, thumb-side bend, forearm turn from palm-in, elbow angle), degrees"""
    _, _, k_, p_, a_ = LOC[S]; R3 = hand_R3(S); kw, pw, aw = R3 @ k_, R3 @ p_, R3 @ a_
    sh, el, wr = wpos(rig, "DEF-upper_arm." + S), wpos(rig, "DEF-forearm." + S), wpos(rig, "DEF-hand." + S)
    fo = (wr - el).normalized()
    flex = math.degrees(math.atan2(-fo.dot(pw), fo.dot(aw))); rad = math.degrees(math.atan2(-fo.dot(kw), fo.dot(aw)))
    u = el - sh; u = (u - u.dot(fo) * fo).normalized(); n_arm = (el - sh).cross(wr - el).normalized()
    neu = -n_arm if S == "R" else n_arm; pp_ = (pw - pw.dot(fo) * fo).normalized()
    return flex, rad, math.degrees(math.atan2(pp_.dot(u), pp_.dot(neu))), math.degrees((sh - el).angle(wr - el))
def limits_pen(flex, rad, pron, elbow):
    return ((max(0, flex - 55) + max(0, -45 - flex)) * 0.15 + (max(0, rad - 15) + max(0, -30 - rad)) * 0.15
            + (max(0, pron - 85) + max(0, -75 - pron)) * 0.12 + (max(0, elbow - 150) + max(0, 60 - elbow)) * 0.1)
def miss(S, Mh): return (wpos(rig, "DEF-hand." + S) - Mh.translation).length
def key_pose_bone(pb, frame):
    pb.keyframe_insert("location", frame=frame)
    pb.keyframe_insert("rotation_quaternion" if pb.rotation_mode == "QUATERNION" else "rotation_euler", frame=frame)
def lift_shoulder(S, ang, M0):
    """the shoulder control turned up (positive) or down about the horizontal at right angles to it, from its matrix M0"""
    pb = rig.pose.bones["shoulder." + S]; h = M0.translation; t = (M0 @ Matrix.Translation(Vector((0, rig.data.bones["shoulder." + S].length, 0)))).translation
    v = (t - h).normalized(); k = v.cross(Vector((0, 0, 1)))
    if k.length < 1e-6: pb.matrix = M0; return
    R = Matrix.Rotation(ang, 4, k.normalized()); pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ M0; bpy.context.view_layer.update()
def stats(v): return "%.4f to %.4f" % (min(v), max(v))
