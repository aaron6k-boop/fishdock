for _f in ("riglib",): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 1 fix: the jacket's cuffs (second try: the sleeve's end found as the jacket's furthest point
# down the forearm, since its thickness is already baked in and leaves no open edge). The sleeve ended as a thin edge on the forearm; the last 3.5 cm
# of each sleeve is now a cuff standing 4 mm proud of the sleeve, easing into it over the next 1.5 cm (baked with the
# rig at rest, so the bones bend it as before).
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/fp_character.blend")
jk = bpy.data.objects["jacket"]; rig = bpy.data.objects["fp_rig"]; C = ctx3d()
rig.data.pose_position = "REST"; bpy.context.view_layer.update()
import bmesh
bm = bmesh.new(); bm.from_mesh(jk.data); bm.verts.ensure_lookup_table(); bm.normal_update()
mw = jk.matrix_world; vg = jk.vertex_groups.get("cuff") or jk.vertex_groups.new(name="cuff"); n_ = 0
for S in "LR":
    el = rig.data.bones["DEF-forearm." + S].head_local; wr = rig.data.bones["DEF-hand." + S].head_local; ax = (wr - el).normalized()
    pts = []
    for v in bm.verts:
        p = mw @ v.co; t = (p - el).dot(ax); rv = p - el - ax * t
        if t > 0 and rv.length < 0.09: pts.append((v, t, rv))
    if not pts: print(S, "no sleeve found"); continue
    t_open = max(t for _, t, _ in pts)
    print(S, "sleeve ends", round((wr - el).length - t_open, 3), "m above the wrist;", len(pts), "sleeve points")
    for v, t, rv in pts:
        nrm = (mw.to_3x3() @ v.normal).normalized()
        if rv.length < 1e-6 or nrm.dot(rv.normalized()) < 0.2: continue   # (the outer surface only, not the lining)
        d = t_open - t
        w = 1.0 if d <= 0.035 else max(0.0, 1 - (d - 0.035) / 0.015)
        if w > 0: vg.add([v.index], w, "REPLACE"); n_ += 1
bm.free(); print("cuff points", n_)
dp = jk.modifiers.new("cuff", "DISPLACE"); dp.direction = "NORMAL"; dp.strength = 0.004; dp.mid_level = 0.0; dp.vertex_group = "cuff"
try: jk.modifiers.move(list(jk.modifiers).index(dp), 0)
except Exception as e: print("move:", e)
for o in bpy.context.view_layer.objects: o.select_set(False)
jk.select_set(True); bpy.context.view_layer.objects.active = jk
with bpy.context.temp_override(**C, object=jk, active_object=jk, selected_objects=[jk]): bpy.ops.object.modifier_apply(modifier="cuff")
rig.data.pose_position = "POSE"; bpy.context.view_layer.update()
print("jacket modifiers", [(m.name, m.type) for m in jk.modifiers])
bpy.ops.wm.save_as_mainfile(filepath=RIGDIR + "/fp_character.blend"); print("saved fp_character.blend")
