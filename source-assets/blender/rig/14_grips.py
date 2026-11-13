for _f in ("riglib", "griplib", "posing_v3", "skin_v2"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild: the other grips the game asks for, each searched on the rig's own hands by the Gate 1 method
# (a power grip round a cylinder: the handle across the palm, every finger curled round it until it touches, the thumb
# closing over from the other side). Both hands, at the sizes the game's equipment has: the drop net's rope (12 mm
# across), the drop net's ring (16 mm), the landing net's pole (28 mm), the rod's butt for the left hand in a cast
# (33.6 mm, the handle's size there) and the wrist of a fish's tail (36 mm). Also a
# relaxed open hand, and a cupped one for a fish's body. (v3: the wrist counted too when seating. v2: the thumb's base pad counted when seating, the thumb
# searched wider, each finger's joints in a closing finger's proportion.) Written to rig/grips.json for the export; the Gate 1 hold is left as it was.
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v12.blend")
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
exec(open(ROOT + "/scripts/gatelib_v1.py").read())
HS = {S: HandSkin(rig, body, S) for S in "LR"}
exec(open(ROOT + "/scripts/grasplib_v3.py").read())
hold = json.loads(rig["fd_hold_fingers"])
out = dict(hold=hold)
for label, r in (("rope", 0.006), ("hoop", 0.008), ("pole", 0.014), ("butt", 0.0168), ("tail", 0.018)):
    for S in "LR":
        out[label + "_" + S] = solve_cylinder(S, r, label=label)
RELAX = {"index": (12, 18, 12), "middle": (16, 24, 17), "ring": (20, 30, 21), "pinky": (24, 34, 24)}
CUP = {"index": (22, 20, 14), "middle": (27, 24, 17), "ring": (32, 28, 20), "pinky": (37, 32, 22)}   # (a fish's body lying in the hand: the fingers cupped under it)
for S in "LR":
    for f, v in RELAX.items(): apply(S, f, *v)
    apply(S, "thumb", 8, 10, 11, 0); bpy.context.view_layer.update(); out["relax_" + S] = dict(fingers=finger_pose(S))
    for f, v in CUP.items(): apply(S, f, *v)
    apply(S, "thumb", 10, 15, 16, -10); bpy.context.view_layer.update(); out["cradle_" + S] = dict(fingers=finger_pose(S))
set_finger_pose(hold)
json.dump(out, open(RIGDIR + "/grips.json", "w"), indent=1); print("wrote grips.json", sorted(out.keys()))
