# FishDock rig rebuild: Gate renders of whatever hold is open (exec'd after riglib.py and griplib.py, with PREFIX set).
# The jacket from fp_character.blend put on the rig, skin and cloth shaded under a sun and a fill; first person at the
# game's eye (straight ahead looking a little down, and looking down at the reel), front, side, over the shoulder, and
# each hand close from five sides.
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]; rod = bpy.data.objects["ROD"]; RW = rod.matrix_world.copy()
old = bpy.data.objects.get("jacket")
if old: bpy.data.objects.remove(old, do_unlink=True)
with bpy.data.libraries.load(RIGDIR + "/fp_character.blend") as (src, dst): dst.objects = ["jacket"]
jk = dst.objects[0]; link(jk); jk.parent = rig
for m in jk.modifiers:
    if m.type == "ARMATURE": m.object = rig
jk.hide_viewport = False; jk.hide_render = False; jk.data.materials.clear(); jk.data.materials.append(mat("jacket_e", (0.06, 0.09, 0.17), 0.88))
body.hide_viewport = False; body.hide_render = False; body.data.materials.clear(); body.data.materials.append(mat("skin_e", (0.80, 0.58, 0.47), 0.48))
for o in list(bpy.data.objects):
    if o.type == "LIGHT": bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE"
try: sc.eevee.taa_render_samples = 48
except Exception: pass
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.50, 0.56, 0.64, 1); bg.inputs[1].default_value = 0.8
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.0; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(42), math.radians(12), math.radians(-35))
fill = link(bpy.data.objects.new("fill", bpy.data.lights.new("fill", "AREA"))); fill.data.energy = 120; fill.data.size = 2.0; fill.location = (1.2, -1.6, 1.6); fill.rotation_euler = (math.radians(65), 0, math.radians(35))
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; eye = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
cam = camera()
def fp(name, pitch_deg, yaw_deg=0.0, fov=62):
    cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(fov); cam.data.clip_start = 0.07; cam.location = eye + Vector((0, -0.01, 0))
    pr, yw = math.radians(pitch_deg), math.radians(yaw_deg); d = Vector((math.sin(yw) * math.cos(pr), -math.cos(yw) * math.cos(pr), math.sin(pr)))
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler(); sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
    sc.render.filepath = RENDERS + "/" + name + ".png"; bpy.ops.render.render(write_still=True); print("rendered", name)
fp(PREFIX + "_firstperson", -15); fp(PREFIX + "_fp_down", -35)
cam.data.sensor_fit = "AUTO"; cam.data.clip_start = 0.005
seat = RW @ Vector((0, -SEAT, -0.03))
shot(PREFIX + "_front", (0, -0.25, 1.2), (0.55, -2.3, 1.5), 50, (1400, 1400)); shot(PREFIX + "_side", (0, -0.3, 1.15), (-2.3, -0.5, 1.4), 50, (1400, 1400)); shot(PREFIX + "_over_shoulder", seat, (-0.62, 0.72, 1.85), 35, (1400, 1400))
for S in "RL":
    Mh_ = rig.matrix_world @ rig.pose.bones["DEF-hand." + S].matrix; hy = Mh_.to_3x3().col[1].normalized()
    c = Mh_.translation + hy * 0.06
    toward_eye = (eye - c).normalized()
    views = {"eye": toward_eye, "front": Vector((0.25, -1, 0.15)), "outside": Vector((-1 if S == "R" else 1, -0.15, 0.25)), "inside": Vector((1 if S == "R" else -1, -0.5, 0.1)), "below": Vector((0.1 * (-1 if S == "R" else 1), -0.45, -1))}
    for nm_, dv in views.items(): shot(f"{PREFIX}_{S}_{nm_}", c, c + dv.normalized() * 0.36, 50, (1200, 1200))
print("renders done")
