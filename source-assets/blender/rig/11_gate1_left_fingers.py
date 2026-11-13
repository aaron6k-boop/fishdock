for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 1 fix: the left hand's ring and little fingers. They had copied the middle finger's bend
# and looked loose beyond the end of the knob. Now each is curled as far as a relaxed hand curls them (knuckle up to
# 65 degrees, middle joint up to 95), stopping where it would meet the knob, the crank's arm, the reel or the handle.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v11.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
HS = HandSkin(rig, body, "L")
rod = bpy.data.objects["ROD"]; RW = rod.matrix_world.copy()
crank = next(o for o in bpy.data.objects if o.name.startswith("crank") and o.type == "EMPTY")
knobE = next(o for o in bpy.data.objects if o.name.startswith("att_knob") and o.parent == crank)
CW = crank.matrix_world.copy(); kc = knobE.matrix_world.translation.copy(); kx = (CW.to_3x3() @ Vector((1, 0, 0))).normalized()
H_ = lambda y0, y1: (tuple(RW @ Vector((0, y0, 0))), tuple(RW @ Vector((0, y1, 0))), handle_radius((y0 + y1) / 2))
COL = [(tuple(kc - kx * 0.013), tuple(kc + kx * 0.013), 0.010), (tuple(CW.translation), tuple(kc - kx * 0.013), 0.0045),
       (tuple(RW @ Vector((0, -SEAT - 0.015, -0.076))), tuple(RW @ Vector((0, -SEAT + 0.04, -0.076))), 0.028),
       (tuple(RW @ Vector((0, -SEAT + 0.002, -0.014))), tuple(RW @ Vector((0, -SEAT + 0.010, -0.056))), 0.0055)] + [H_(-0.025, -0.25), H_(-0.25, -0.40), H_(-0.40, -0.43), H_(-0.43, -0.50), H_(-0.50, -0.64)]
def own(f): return [HS.sel("DEF-f_%s.0%d" % (f, j + 1)) for j in range(3)]
def clears(f):
    P = HS.deform(); return [float(seg_clear(P[m], COL).min()) for m in own(f)]
print("before", {f: ([round(math.degrees(rig.pose.bones[n].rotation_euler.x), 1) for n in chain(rig, f, "L")], [round(x, 4) for x in clears(f)]) for f in ("ring", "pinky")})
for f in ("ring", "pinky"):
    pbs = [rig.pose.bones[n] for n in chain(rig, f, "L")]; best = None
    for a in range(20, 66, 5):
        for b in range(50, 96, 5):
            c = b * 0.7; pbs[0].rotation_euler.x, pbs[1].rotation_euler.x, pbs[2].rotation_euler.x = math.radians(a), math.radians(b), math.radians(c)
            bpy.context.view_layer.update(); cl = clears(f)
            if min(cl) < -0.0008: continue
            sc = a + b   # (as curled as the relaxed range and the equipment allow)
            if best is None or sc > best[0]: best = (sc, a, b, c, [round(x, 4) for x in cl])
    if best:
        pbs[0].rotation_euler.x, pbs[1].rotation_euler.x, pbs[2].rotation_euler.x = math.radians(best[1]), math.radians(best[2]), math.radians(best[3])
    bpy.context.view_layer.update(); print("left", f, "(knuckle, middle, last, gaps)", best[1:] if best else None)
print("left index/middle/thumb gaps to the knob", {f: round(float(seg_clear(HS.deform()[HS.sel("DEF-f_" + f if f != "thumb" else "DEF-thumb")], COL[:1]).min()), 4) for f in ("index", "middle", "thumb")})
pose = json.loads(rig.get("fd_hold_fingers", "{}"))
for f in ("ring", "pinky"):
    for n in chain(rig, f, "L"): pose[n] = [round(math.degrees(a), 2) for a in rig.pose.bones[n].rotation_euler]
rig["fd_hold_fingers"] = json.dumps(pose)
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/gate1_v12.blend"); print("saved gate1_v12.blend")
