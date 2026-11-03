# FishDock: render whatever is in the scene for a visual check (Eevee, a soft studio light), from a few sides
import bpy, math, os, sys
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets/renders"; os.makedirs(OUT, exist_ok=True)
NAME = globals().get("CHECK_NAME", "check"); DIST = globals().get("CHECK_DIST", 0.25); TARGET = Vector(globals().get("CHECK_TARGET", (0, 0, -0.06)))
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 900, 700; sc.render.film_transparent = False
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.47, 0.52, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
for o in [o for o in bpy.data.objects if o.name.startswith("_chk")]: bpy.data.objects.remove(o, do_unlink=True)
L = bpy.data.lights.new("_chk_key", "AREA"); L.energy = 60 * (DIST / 0.25) ** 2; L.size = DIST * 2; lo = bpy.data.objects.new("_chk_key", L); sc.collection.objects.link(lo); lo.location = TARGET + Vector((DIST, -DIST, DIST * 1.4)); lo.rotation_euler = (math.radians(50), 0, math.radians(45))
cam = bpy.data.cameras.new("_chk_cam"); cam.lens = 50; co = bpy.data.objects.new("_chk_cam", cam); sc.collection.objects.link(co); sc.camera = co
for i, (az, el) in enumerate(globals().get("CHECK_ANGLES", [(35, 20), (145, 15), (-60, 35), (90, 0)])):
    a, e = math.radians(az), math.radians(el)
    co.location = TARGET + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * DIST * 3
    co.rotation_euler = (TARGET - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = f"{OUT}/{NAME}_{i}.png"; bpy.ops.render.render(write_still=True)
print("RENDER DONE", NAME)
