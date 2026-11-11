# FishDock grip authoring library (run inside Blender by a queue job: exec(open(grip_lib.py).read()))
# Hands are closed onto the real shapes they hold by contact: each finger joint is turned until that part of the
# finger's skin touches the object, nearest joint first, as a hand closes. Nothing is a guessed angle.
import bpy, bmesh, os, math, json, mathutils
print("GRIP LIB v5")
from mathutils import Vector, Matrix, Quaternion
ROOT = r"C:\Users\aaron\Documents\FishDock-assets"
FINGERS = ["index", "middle", "ring", "pinky"]

def wipe():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images, bpy.data.actions):
        for b in list(coll):
            if b.users == 0: coll.remove(b)

def load_arms(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == "ARMATURE")
    skin = next(o for o in new if o.type == "MESH" and "arms" in o.name)
    sleeve = next((o for o in new if o.type == "MESH" and "sleeve" in o.name), None)
    return rig, skin, sleeve

def upd(): bpy.context.view_layer.update()

class Hand:
    """One hand of the rig: its bones, its frame, and the skin points of each part."""
    def __init__(self, rig, skin, side):
        self.rig, self.skin, self.s = rig, skin, side
        self.pb = rig.pose.bones
        self.hand = self.pb["hand_" + side]
        self.bones = {f: [self.pb[f"{f}_0{k}_{side}"] for k in (1, 2, 3)] for f in FINGERS + ["thumb"]}
        upd()
        M = rig.matrix_world
        self.W = M @ self.hand.head
        K = {f: M @ self.bones[f][0].head for f in FINGERS}
        self.K = K
        self.f = ((K["middle"] + K["ring"]) * 0.5 - self.W).normalized()          # along the fingers
        rad = (K["index"] - K["pinky"]); rad -= self.f * rad.dot(self.f); self.rad = rad.normalized()  # towards the thumb side
        # the palm side: the way the fingers already curve at rest (tip segment against first segment)
        p = Vector((0, 0, 0))
        for fn in FINGERS:
            b = self.bones[fn]; d1 = (M @ b[0].tail - M @ b[0].head).normalized(); d3 = (M @ b[2].tail - M @ b[2].head).normalized()
            q = d3 - d1; q -= self.f * q.dot(self.f); q -= self.rad * q.dot(self.rad); p += q
        # out of the palm: fixed by which hand it is (thumb side across fingers, right-handed for a right hand). The
        # rest curve of the fingers is too slight on this model to tell by
        n = self.rad.cross(self.f).normalized()
        self.p = n if side == "r" else -n
        self.curve_agrees = n.dot(p) > 0 if side == "r" else n.dot(p) < 0
        # skin points by the bone that moves them most
        names = [g.name for g in skin.vertex_groups]
        self.part = {}
        for v in skin.data.vertices:
            best, bw = None, 0
            for g in v.groups:
                if g.weight > bw: bw, best = g.weight, names[g.group]
            if best and best.endswith("_" + side): self.part.setdefault(best, []).append(v.index)
        self.far_parts()
    def far_parts(self, frac=0.35):
        """For each finger bone, its skin points past `frac` of the way along it (at rest): the part that can meet
        what is held. The flesh at a finger's root overlaps a handle in the palm before the finger has moved at all."""
        M = self.rig.matrix_world; mw = self.skin.matrix_world; self.far = {}
        for bs in self.bones.values():
            for pb in bs:
                h = M @ pb.bone.head_local; tl = M @ pb.bone.tail_local; d = tl - h; L = d.length; d = d / L
                self.far[pb.name] = [i for i in self.part.get(pb.name, []) if ((mw @ self.skin.data.vertices[i].co) - h).dot(d) / L > frac]
    def points_far(self, bone_names):
        dg = bpy.context.evaluated_depsgraph_get(); ev = self.skin.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
        out = [M @ me.vertices[i].co for n in bone_names for i in self.far.get(n, [])]
        ev.to_mesh_clear(); return out
    def points(self, bone_names):
        dg = bpy.context.evaluated_depsgraph_get(); ev = self.skin.evaluated_get(dg); me = ev.to_mesh(); M = ev.matrix_world
        out = [M @ me.vertices[i].co for n in bone_names for i in self.part.get(n, [])]
        ev.to_mesh_clear(); return out
    def turn(self, pb, axis, ang):
        """Turn a pose bone about a world axis through its head."""
        M = self.rig.matrix_world; h = M @ pb.head
        R = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-h)
        pb.matrix = M.inverted() @ R @ M @ pb.matrix; upd()
    def flex_axis(self, pb):
        """The axis a finger bone flexes about: across the finger, signed so a positive turn closes towards the palm."""
        M = self.rig.matrix_world; d = (M @ pb.tail - M @ pb.head).normalized()
        a = d.cross(self.p).normalized()
        return a if (Matrix.Rotation(0.2, 3, a) @ d).dot(self.p) > d.dot(self.p) else -a
    def reset(self):
        for pb in [self.hand] + [b for bs in self.bones.values() for b in bs]:
            pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
        upd()

def close_onto(H, finger, dist, limits=(95, 110, 75), step=2.0, gap=0.0006, start=(0, 0, 0)):
    """Close one finger onto a shape. dist(point) is the signed distance from the shape's surface (negative inside).
    Each joint in turn, nearest the palm first, is turned until its own segment or any beyond it touches."""
    bs = H.bones[finger]; names = [b.name for b in bs]; got = []
    # one hinge axis for the whole finger, taken while it is still straight: a finger's three joints fold about
    # parallel axes, and found afresh on a bent finger (its direction near the palm's own) the axis flips
    axis = H.flex_axis(bs[0])
    for k, pb in enumerate(bs):
        ang = 0.0
        if start[k]: H.turn(pb, axis, math.radians(start[k])); ang = start[k]
        while ang < limits[k]:
            H.turn(pb, axis, math.radians(step)); ang += step
            d = min((dist(P) for P in H.points_far(names[k:])), default=1)
            if d < gap:
                H.turn(pb, axis, math.radians(-step)); ang -= step; break
        got.append(round(ang, 1))
    return got

def cyl_dist(a0, a1, r, capped=False):
    ax = (a1 - a0); L = ax.length; ax = ax / L
    def d(P):
        t = (P - a0).dot(ax); rad = ((P - a0) - ax * t).length
        if not capped or 0 <= t <= L: return rad - r
        e = -t if t < 0 else t - L
        return math.hypot(max(rad - r, 0), e) if rad > r else e
    return d

def mat(name, col, rough=0.5, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m

def cyl_obj(name, a0, a1, r, m, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=(a1 - a0).length, location=(a0 + a1) * 0.5)
    o = bpy.context.object; o.name = name; o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((a1 - a0).normalized()); o.data.materials.append(m)
    bpy.ops.object.shade_smooth(); return o

def studio(scene):
    scene.render.engine = "BLENDER_EEVEE"
    try: scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception: pass
    scene.render.resolution_x = 900; scene.render.resolution_y = 900; scene.render.film_transparent = False
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.35; scene.world = w
    try: scene.view_settings.view_transform = "Standard"
    except Exception: pass
    for i, (loc, e) in enumerate([((2, -2, 3), 55), ((-2, -1, 1), 22), ((0, 3, 2), 18)]):
        l = bpy.data.lights.new(f"L{i}", "AREA"); l.energy = e; l.size = 2; o = bpy.data.objects.new(f"L{i}", l); scene.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.cameras.new("cam"); cam.lens = 60; cam.clip_start = 0.01; co = bpy.data.objects.new("cam", cam); scene.collection.objects.link(co); scene.camera = co
    return co

def shoot(cam, target, direction, dist, path, up=Vector((0, 0, 1))):
    for o in bpy.data.objects:
        if o.type == "LIGHT": o.location = target + (o.location - target).normalized() * 1.2; o.rotation_euler = (target - o.location).to_track_quat("-Z", "Y").to_euler()
    cam.location = target + direction.normalized() * dist
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True)
