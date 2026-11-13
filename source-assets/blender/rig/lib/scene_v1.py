# FishDock rig rebuild: the look for rendering whatever hold is open (exec'd after riglib.py and griplib.py): the jacket
# from fp_character.blend put on the rig, skin and cloth shaded under a sun and a fill, the eye found. Renders nothing.
rig = bpy.data.objects["fp_rig"]; body = bpy.data.objects["GEO-body_male_realistic"]
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
try: sc.eevee.taa_render_samples = 16
except Exception: pass
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.50, 0.56, 0.64, 1); bg.inputs[1].default_value = 0.8
sun = link(bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))); sun.data.energy = 3.0; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(42), math.radians(12), math.radians(-35))
fill = link(bpy.data.objects.new("fill", bpy.data.lights.new("fill", "AREA"))); fill.data.energy = 120; fill.data.size = 2.0; fill.location = (1.2, -1.6, 1.6); fill.rotation_euler = (math.radians(65), 0, math.radians(35))
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; EYE_W = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
for o in eyes: o.hide_render = True
def video(name, res, frames, cam_setup):
    """renders frames (start, end) to RENDERS/name.mp4 (or a folder of PNGs if this Blender can't write video)"""
    cam = camera(); cam_setup(cam); sc.render.resolution_x, sc.render.resolution_y = res; sc.frame_start, sc.frame_end = frames
    s = sc.render.image_settings; ok = True
    try: s.media_type = "VIDEO"
    except Exception: pass
    try: s.file_format = "FFMPEG"
    except Exception as e: ok = False; print("no video output here:", e)
    if ok:
        try:
            sc.render.ffmpeg.format = "MPEG4"; sc.render.ffmpeg.codec = "H264"; sc.render.ffmpeg.constant_rate_factor = "HIGH"; sc.render.ffmpeg.ffmpeg_preset = "GOOD"
        except Exception as e: print("ffmpeg settings:", e)
        sc.render.filepath = RENDERS + "/" + name + "_"
    else:
        try: s.media_type = "IMAGE"
        except Exception: pass
        s.file_format = "PNG"; os.makedirs(RENDERS + "/" + name, exist_ok=True); sc.render.filepath = RENDERS + "/" + name + "/f_"
    bpy.ops.render.render(animation=True); print("rendered video", name, frames)
    try: s.media_type = "IMAGE"
    except Exception: pass
    s.file_format = "PNG"
def fp_cam(pitch_deg, yaw_deg=0.0, vfov=78.7):
    def setup(cam):
        cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(vfov); cam.data.clip_start = 0.07; cam.location = EYE_W + Vector((0, -0.01, 0))
        pr, yw = math.radians(pitch_deg), math.radians(yaw_deg); d = Vector((math.sin(yw) * math.cos(pr), -math.cos(yw) * math.cos(pr), math.sin(pr)))
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return setup
def look_cam(at, frm, lens=50):
    def setup(cam):
        cam.data.sensor_fit = "AUTO"; cam.data.clip_start = 0.005; cam.data.lens = lens; cam.location = Vector(frm); cam.rotation_euler = (Vector(at) - Vector(frm)).to_track_quat("-Z", "Y").to_euler()
    return setup
