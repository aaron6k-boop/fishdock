# FishDock rig rebuild: first-person views of whatever hold is open, as the game frames them (exec'd after riglib.py,
# griplib.py and render_g1_v1.py's scene setup, with PREFIX set). The game's first-person field of view is 62 degrees
# top to bottom on a wide screen and 62 x 1.27 = 78.7 on an upright phone; its view starts 0.12 rad (7 degrees) below
# level. Looking down further, up, left and right, as the brief asks.
eyes = [o for o in bpy.data.objects if ".eye." in o.name]; eye = sum((o.matrix_world.translation for o in eyes), Vector()) / max(1, len(eyes))
cam = camera(); sc = bpy.context.scene
def fpv(name, pitch_deg, yaw_deg, vfov, res):
    cam.data.sensor_fit = "VERTICAL"; cam.data.angle = math.radians(vfov); cam.data.clip_start = 0.07; cam.location = eye + Vector((0, -0.01, 0))
    pr, yw = math.radians(pitch_deg), math.radians(yaw_deg); d = Vector((math.sin(yw) * math.cos(pr), -math.cos(yw) * math.cos(pr), math.sin(pr)))
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler(); sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = RENDERS + "/" + name + ".png"; bpy.ops.render.render(write_still=True); print("rendered", name)
for nm_, p_, y_ in (("level", -7, 0), ("down", -25, 0), ("up", 12, 0), ("left", -7, 25), ("right", -7, -25)):
    fpv(f"{PREFIX}_phone_{nm_}", p_, y_, 78.7, (720, 1280))
fpv(f"{PREFIX}_wide_level", -7, 0, 62, (1280, 720)); fpv(f"{PREFIX}_wide_down", -20, 0, 62, (1280, 720))
cam.data.sensor_fit = "AUTO"; cam.data.clip_start = 0.005
print("first-person views done")
