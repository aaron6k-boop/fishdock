# FishDock rig rebuild: shared helpers for the queued Blender jobs (exec'd at the top of each job)
import bpy, bmesh, os, json, math, heapq
import numpy as np
from mathutils import Vector, Matrix, Quaternion, Euler
ROOT = "C:/Users/aaron/Documents/FishDock-assets"; RENDERS = ROOT + "/renders/rig"; RIGDIR = ROOT + "/rig"
os.makedirs(RENDERS, exist_ok=True); os.makedirs(RIGDIR, exist_ok=True)
HBM = ROOT + "/downloads/blender_human_base_meshes/human-base-meshes-bundle-v1.1.0/human_base_meshes_bundle.blend"

def ctx3d():
    """A context with a 3D view, for operators that need one (the watcher runs from a timer, with no context)."""
    win = bpy.context.window_manager.windows[0]
    for area in win.screen.areas:
        if area.type == "VIEW_3D":
            reg = next(r for r in area.regions if r.type == "WINDOW")
            return dict(window=win, screen=win.screen, area=area, region=reg, scene=bpy.context.scene, view_layer=bpy.context.view_layer)
    return dict(window=win, screen=win.screen, scene=bpy.context.scene, view_layer=bpy.context.view_layer)

def link(o, coll=None): (coll or bpy.context.scene.collection).objects.link(o); return o

def mat(name, col, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color = (*col[:3], 1); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    if b: b.inputs["Base Color"].default_value = (*col[:3], 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m

def mark(p, r=0.003, col=(1, 0.1, 0.1), name="mark"):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.location = Vector(p); me.materials.append(mat("mk_%.2f_%.2f_%.2f" % tuple(col), col)); return link(o)

def camera(name="cam"):
    c = bpy.data.objects.get(name) or link(bpy.data.objects.new(name, bpy.data.cameras.new(name))); bpy.context.scene.camera = c; return c

def shot(name, at, frm, lens=50, res=(900, 900), up="Y"):
    sc = bpy.context.scene; c = camera(); c.location = Vector(frm); d = Vector(at) - Vector(frm)
    c.rotation_euler = d.to_track_quat("-Z", up).to_euler(); c.data.lens = lens; c.data.clip_start = 0.005; c.data.clip_end = 100
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.filepath = RENDERS + "/" + name + ".png"
    bpy.ops.render.render(write_still=True); print("rendered", name)

def workbench(xray=0.0, color="MATERIAL"):
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"; s = sc.display.shading
    s.light = "STUDIO"; s.color_type = color; s.show_cavity = True; s.show_xray = xray > 0; s.xray_alpha = xray or 1; s.show_shadows = False
    sc.render.film_transparent = False

def load_body():
    """The Blender Studio realistic male, alone, standing at the origin facing -Y (feet at z 0). Returns (body, offset)."""
    bpy.ops.wm.open_mainfile(filepath=HBM)
    body = bpy.data.objects["GEO-body_male_realistic"]; keep = {body} | {o for o in bpy.data.objects if o.parent == body and o.type == "MESH"}
    mw = body.matrix_world; P = np.array([tuple(mw @ v.co) for v in body.data.vertices])
    off = Vector(((P[:, 0].min() + P[:, 0].max()) / 2, (P[:, 1].min() + P[:, 1].max()) / 2, P[:, 2].min()))
    for o in list(bpy.data.objects):
        if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
    for o in keep:
        if o.parent is None: o.location = o.location - off
    for c in list(bpy.data.collections):
        if not any(o in keep for o in c.all_objects): bpy.data.collections.remove(c)
    for o in keep:
        if o.name not in bpy.context.scene.collection.objects:
            try: bpy.context.scene.collection.objects.link(o)
            except Exception: pass
    bpy.context.view_layer.update()
    return body, off
