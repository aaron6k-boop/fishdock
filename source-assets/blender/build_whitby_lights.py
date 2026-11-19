# FishDock: Whitby's two pier lighthouses, exported as whitby_lights.glb
#   lh_west  the West Pier lighthouse (1831): a fluted Grecian Doric column of sandstone on a square plinth with its
#            doorway, an Attic base, a capital (annulets, echinus, square abacus), a drum and gallery with cast-iron
#            railings, and a six-sided lantern (the harbour lights listing: "a 70-foot sandstone tower in Grecian-Doric
#            style ... topped with a hexagonal lantern"; tower 22 m) under a lead dome with its vane
#   lh_east  the East Pier lighthouse (1855): a shorter, plain tapering round tower on a square plinth, a corbelled
#            cornice, gallery and an eight-sided lantern under a lead cone (tower 13 m)
# Proportions measured from photographs on Wikimedia Commons (docs/REFERENCE-PHOTOS.md: the column from the pier, from
# below and from the harbour); sizes in metres, estimates. Stone is Whitby's ashlar baked by build_whitby_stone.py (from
# a photoscan, CC0) when it's there (ASHLAR), else the photoscanned sandstone in STONE; its UVs are laid at a real
# scale (one tile every TILE metres, the ashlar tile's own size) so the courses run level and every stone is the same
# size as on the piers; the turned parts are unwrapped round their own axis, a whole number of tiles round, so no
# seam shows. The game lays its own copy of the same ashlar on them (the .glb carries no pictures). Ambient occlusion is baked into each vertex's colour (Cycles, on the PC's GPU), so the
# flutes, mouldings and the gallery's underside are shaded without any work at run time.
# Each tower is three meshes, LOD0 (close), LOD1 (about a quarter of the triangles) and LOD2 (a few hundred), named
# <tower>_LOD<n>; three.js picks one by distance. In three.js's frame (y up), standing on the origin, the door to +z.
import bpy, bmesh, math, os, random
from mathutils import Vector
OUT = "C:/Users/aaron/Documents/FishDock-assets"
STONE = globals().get("STONE", OUT + "/downloads/polyhaven-stone/large_sandstone_blocks_01")  # (+ _diff_1k.jpg, _nor_1k.jpg, _rough_1k.jpg)
TILE = globals().get("TILE", 2.4)  # metres a picture of the stone covers (the ashlar tile)
ASHLAR = globals().get("ASHLAR", OUT + "/exports/whitby_stone/whitby_ashlar")  # (+ _diff.jpg, _nor.jpg, _rough.jpg)
P = lambda x, y, z: Vector((x, -z, y))
random.seed(1831)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves): [coll.remove(x) for x in list(coll) if x.users == 0]
col = bpy.context.scene.collection

# ---- materials ----
def img(path, non_color=False):
    i = bpy.data.images.load(path, check_existing=True)
    if non_color: i.colorspace_settings.name = "Non-Color"
    return i
def mat(name, rgb, metal=0.0, rough=0.5, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    if alpha < 1: b.inputs["Alpha"].default_value = alpha; m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    return m
def stone_mat(name):
    # (for the check pictures: the game lays its own copy of the ashlar, tints it and weathers it at run time)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    src = (ASHLAR + "_diff.jpg", ASHLAR + "_nor.jpg", ASHLAR + "_rough.jpg") if os.path.exists(ASHLAR + "_diff.jpg") else (STONE + "_diff_1k.jpg", STONE + "_nor_1k.jpg", STONE + "_rough_1k.jpg")
    print("STONE MAPS", src[0], flush=True)
    d = nt.nodes.new("ShaderNodeTexImage"); d.image = img(src[0]); nt.links.new(d.outputs["Color"], b.inputs["Base Color"])
    n = nt.nodes.new("ShaderNodeTexImage"); n.image = img(src[1], True)
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(n.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    r = nt.nodes.new("ShaderNodeTexImage"); r.image = img(src[2], True); nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
    return m
M = {"stone": stone_mat("whitby_sandstone"), "white": mat("lantern_white", (0.86, 0.86, 0.83), 0.1, 0.35),
     "glass": mat("lantern_glass", (0.55, 0.62, 0.64), 0.6, 0.06), "lead": mat("lead_dome", (0.24, 0.26, 0.27), 0.35, 0.5),
     "iron": mat("cast_iron", (0.03, 0.035, 0.04), 0.4, 0.5), "door": mat("door_paint", (0.07, 0.12, 0.1), 0.0, 0.55)}

# ---- building blocks: every mesh made in bmesh with its UVs laid at the stone's real scale ----
def new_obj(name, bm, m, parent):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); o.data.materials.append(m); o.parent = parent
    return o
def uv_world(bm, tile=TILE):
    # flat faces: each face mapped in its own plane at world scale (box mapping by the face's normal)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            l[uv].uv = ((c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y))
            l[uv].uv = (l[uv].uv[0] / tile, l[uv].uv[1] / tile)
def uv_turned(bm, cx=0.0, cy=0.0, tile=TILE):
    # turned faces (about Blender's z, three's y): round the axis by arc length, up by height; the caps flat. Round
    # the axis it's a whole number of tiles (at the part's middle radius), so the stones meet where the unwrap closes
    uv = bm.loops.layers.uv.verify()
    rs = sorted(math.hypot(v.co.x - cx, v.co.y - cy) for v in bm.verts); rmid = max(rs[len(rs) // 2], 0.3)
    turns = max(1, round(2 * math.pi * rmid / tile))
    for f in bm.faces:
        if abs(f.normal.z) > 0.7:
            for l in f.loops: l[uv].uv = (l.vert.co.x / tile, l.vert.co.y / tile)
            continue
        angs = [math.atan2(l.vert.co.y - cy, l.vert.co.x - cx) for l in f.loops]
        if max(angs) - min(angs) > math.pi: angs = [a + 2 * math.pi if a < 0 else a for a in angs]
        for l, a in zip(f.loops, angs):
            l[uv].uv = (a / (2 * math.pi) * turns, l.vert.co.z / tile)
def box(name, sx, sy, sz, cx, cy, cz, m, parent, bevel=0.03):
    # sx, sz across, sy up (three's frame), centred at (cx, cy, cz)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    bmesh.ops.translate(bm, vec=P(cx, cy, cz), verts=bm.verts)
    if bevel: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    uv_world(bm); return new_obj(name, bm, m, parent)
def lathe(name, prof, m, parent, seg=48, ripple=None):
    # prof: [(radius, height)] bottom up; ripple(angle, height) -> radius factor (the flutes)
    bm = bmesh.new(); rings = []
    for r, h in prof:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg; f = ripple(a, h) if ripple else 1.0
            ring.append(bm.verts.new(P(r * f * math.cos(a), h, r * f * math.sin(a))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); uv_turned(bm)
    o = new_obj(name, bm, m, parent)
    for p in o.data.polygons: p.use_smooth = True
    return o
def ring_tube(name, r, y, t, m, parent, seg=64):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, radius=t, segments=8)
    for v in bm.verts: v.co = Vector((v.co.x + r, 0, v.co.y))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=seg, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.translate(bm, vec=P(0, y, 0), verts=bm.verts); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = new_obj(name, bm, m, parent)
    for p in o.data.polygons: p.use_smooth = True
    return o
def rod(name, a, b, t, m, parent, seg=8):
    A, B = P(*a), P(*b); d = B - A; L = d.length
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=t, radius2=t, depth=L)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=q.to_matrix(), cent=(0, 0, 0)); bmesh.ops.translate(bm, vec=(A + B) / 2, verts=bm.verts)
    o = new_obj(name, bm, m, parent)
    for p in o.data.polygons: p.use_smooth = True
    return o
def root(name):
    e = bpy.data.objects.new(name, None); col.objects.link(e); return e

# ---- the gallery railing and the lantern, shared by both towers ----
def gallery(parent, y, r, posts=28):
    for k in range(posts):
        a = 2 * math.pi * k / posts; x, z = r * math.cos(a), r * math.sin(a)
        rod(f"post{k}", (x, y, z), (x, y + 1.05, z), 0.022, M["white"], parent)
    for h, t in ((1.05, 0.03), (0.62, 0.02), (0.2, 0.02)): ring_tube(f"rail{h}", r, y + h, t, M["white"], parent)
def lantern(parent, y, r, sides, h, roof):
    # the base: painted iron panels; the glazing between astragals; a cornice; the roof; the ventilator and vane
    lathe("lan_base", [(r, y), (r, y + 0.6), (r * 1.04, y + 0.62), (r * 1.04, y + 0.68), (r * 0.98, y + 0.7)], M["white"], parent, seg=sides)
    lathe("lan_glass", [(r * 0.96, y + 0.7), (r * 0.96, y + 0.7 + h)], M["glass"], parent, seg=sides)
    for k in range(sides):
        a = 2 * math.pi * (k + 0.0) / sides; x, z = r * math.cos(a), r * math.sin(a)
        rod(f"mullion{k}", (x, y + 0.7, z), (x, y + 0.7 + h, z), 0.045, M["white"], parent, seg=6)
    for hh in (h * 0.5,):
        lathe("lan_bar", [(r * 0.98, y + 0.7 + hh - 0.03), (r * 0.98, y + 0.7 + hh + 0.03)], M["white"], parent, seg=sides)
    yt = y + 0.7 + h
    lathe("lan_cornice", [(r * 0.98, yt), (r * 1.1, yt + 0.06), (r * 1.12, yt + 0.16), (r * 1.0, yt + 0.2)], M["white"], parent, seg=sides)
    if roof == "dome":
        prof = [(r * 1.02 * math.cos(t), yt + 0.2 + r * 0.82 * math.sin(t)) for t in [i * math.pi / 2 / 10 for i in range(10)]] + [(0.12, yt + 0.2 + r * 0.82)]
        top = yt + 0.2 + r * 0.82
    else:
        prof = [(r * 1.08, yt + 0.2), (0.12, yt + 0.2 + r * 0.95)]; top = yt + 0.2 + r * 0.95
    lathe("lan_roof", prof, M["lead"], parent, seg=32 if roof == "dome" else sides)
    lathe("lan_vent", [(0.12, top), (0.16, top + 0.05), (0.2, top + 0.15), (0.16, top + 0.27), (0.05, top + 0.32)], M["lead"], parent, seg=16)
    return top + 0.32

# ---- the West Pier lighthouse ----
def west():
    R = root("lh_west")
    # the plinth: a base course, the die with its doorway, a cornice in two steps
    box("plinth_base", 5.9, 0.35, 5.9, 0, 0.175, 0, M["stone"], R)
    die = box("plinth_die", 5.5, 1.95, 5.5, 0, 0.35 + 0.975, 0, M["stone"], R, bevel=0.02)
    cut = box("door_cut", 1.05, 2.05, 0.8, 0, 0.35 + 1.02, 2.75, M["stone"], R, bevel=0)
    b = die.modifiers.new("door", "BOOLEAN"); b.operation = "DIFFERENCE"; b.object = cut; b.solver = "EXACT"
    bpy.context.view_layer.objects.active = die; bpy.ops.object.modifier_apply(modifier="door"); bpy.data.objects.remove(cut, do_unlink=True)
    for nm, w, h, x, y in (("jamb_l", 0.2, 2.25, -0.63, 0.35 + 1.12), ("jamb_r", 0.2, 2.25, 0.63, 0.35 + 1.12), ("lintel", 1.5, 0.3, 0, 0.35 + 2.18)):
        box(nm, w, h, 0.12, x, y, 2.78, M["stone"], R, bevel=0.015)
    box("door", 1.02, 2.0, 0.08, 0, 0.35 + 1.0, 2.5, M["door"], R, bevel=0.01)
    for k, yy in enumerate((0.75, 1.55)): box(f"door_panel{k}", 0.38, 0.6, 0.03, -0.22, 0.35 + yy, 2.55, M["door"], R, bevel=0.01); box(f"door_panelb{k}", 0.38, 0.6, 0.03, 0.22, 0.35 + yy, 2.55, M["door"], R, bevel=0.01)
    box("cornice_a", 5.75, 0.18, 5.75, 0, 2.39, 0, M["stone"], R, bevel=0.02); box("cornice_b", 6.0, 0.22, 6.0, 0, 2.59, 0, M["stone"], R, bevel=0.03)
    # the stepped square under the column, then the Attic base (torus, scotia, torus)
    box("step", 4.1, 0.38, 4.1, 0, 2.89, 0, M["stone"], R, bevel=0.03)
    y0 = 3.08
    lathe("base", [(1.92, y0), (1.95, y0 + 0.06), (1.98, y0 + 0.14), (1.94, y0 + 0.22), (1.82, y0 + 0.27), (1.74, y0 + 0.31), (1.72, y0 + 0.36), (1.78, y0 + 0.4), (1.79, y0 + 0.46), (1.74, y0 + 0.52), (1.68, y0 + 0.56)], M["stone"], R, seg=64)
    # the shaft: 20 flutes meeting at sharp arrises, a slight swell (entasis), weathered: the courses eroded back in
    # horizontal bands (the photographs from below)
    ys, ye, r0, r1 = y0 + 0.56, 17.15, 1.66, 1.33
    bands = [random.uniform(0, 1) for _ in range(60)]
    def flute(a, h):
        k = (a * 20 / (2 * math.pi)) % 1.0; groove = 1 - 0.052 * math.sin(math.pi * k) ** 0.55
        c = int(h / 0.48) % 60; wear = 1 - 0.012 * bands[min(c, 59)] * (0.5 + 0.5 * math.sin(h * 9.1))
        return groove * wear
    prof = []
    n = 46
    for i in range(n + 1):
        f = i / n; h = ys + (ye - ys) * f; r = r0 + (r1 - r0) * f + 0.035 * math.sin(math.pi * f); prof.append((r, h))
    sh = lathe("shaft", prof, M["stone"], R, seg=240, ripple=flute)
    bpy.ops.object.select_all(action="DESELECT"); sh.select_set(True); bpy.context.view_layer.objects.active = sh
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(32))  # (the arrises sharp, each flute smooth)
    except Exception as e: print("smooth by angle:", e)
    # the capital: three annulets, the echinus swelling out, the square abacus
    yc = ye
    for k in range(3): lathe(f"annulet{k}", [(r1 + 0.02, yc + k * 0.07), (r1 + 0.06, yc + k * 0.07 + 0.025), (r1 + 0.02, yc + k * 0.07 + 0.05)], M["stone"], R, seg=64)
    yc += 0.21
    lathe("echinus", [(r1 + 0.03, yc)] + [(r1 + 0.03 + 0.62 * math.sin(t * math.pi / 2) ** 1.6, yc + 0.6 * t) for t in [i / 10 for i in range(1, 11)]], M["stone"], R, seg=64)
    yc += 0.6
    box("abacus", 4.15, 0.45, 4.15, 0, yc + 0.225, 0, M["stone"], R, bevel=0.05); yc += 0.45
    # the drum and the gallery's floor
    lathe("drum", [(1.3, yc), (1.3, yc + 0.62), (1.42, yc + 0.68), (1.5, yc + 0.76)], M["stone"], R, seg=48); yc += 0.76
    lathe("gallery_floor", [(1.5, yc), (1.92, yc + 0.06), (1.95, yc + 0.2), (1.85, yc + 0.22)], M["stone"], R, seg=48); yc += 0.22
    gallery(R, yc, 1.8)
    top = lantern(R, yc, 1.0, 6, 1.45, "dome")
    # the vane: spindle, the compass letters' arms, the arrow
    rod("vane_spindle", (0, top, 0), (0, top + 1.35, 0), 0.025, M["iron"], R)
    rod("vane_ns", (0, top + 0.75, -0.42), (0, top + 0.75, 0.42), 0.012, M["iron"], R); rod("vane_ew", (-0.42, top + 0.75, 0), (0.42, top + 0.75, 0), 0.012, M["iron"], R)
    box("vane_arrow", 1.1, 0.05, 0.02, 0, top + 1.1, 0, M["iron"], R, bevel=0); box("vane_tail", 0.25, 0.22, 0.015, -0.5, top + 1.1, 0, M["iron"], R, bevel=0)
    return R

# ---- the East Pier lighthouse ----
def east():
    R = root("lh_east")
    box("plinth_base", 4.6, 0.3, 4.6, 0, 0.15, 0, M["stone"], R)
    die = box("plinth_die", 4.2, 1.5, 4.2, 0, 0.3 + 0.75, 0, M["stone"], R, bevel=0.02)
    cut = box("door_cut", 0.95, 1.85, 0.7, 0, 0.3 + 0.92, 2.1, M["stone"], R, bevel=0)
    b = die.modifiers.new("door", "BOOLEAN"); b.operation = "DIFFERENCE"; b.object = cut; b.solver = "EXACT"
    bpy.context.view_layer.objects.active = die; bpy.ops.object.modifier_apply(modifier="door"); bpy.data.objects.remove(cut, do_unlink=True)
    box("door", 0.92, 1.8, 0.08, 0, 0.3 + 0.9, 1.88, M["door"], R, bevel=0.01)
    box("cornice", 4.5, 0.25, 4.5, 0, 1.92, 0, M["stone"], R, bevel=0.03)
    y0 = 2.05
    lathe("base", [(1.75, y0), (1.8, y0 + 0.1), (1.76, y0 + 0.22), (1.62, y0 + 0.3)], M["stone"], R, seg=48)
    ys, ye = y0 + 0.3, 9.9
    prof = [(1.6 - 0.38 * (i / 30) + 0.02 * math.sin(math.pi * i / 30), ys + (ye - ys) * i / 30) for i in range(31)]
    bands = [random.uniform(0, 1) for _ in range(40)]
    lathe("shaft", prof, M["stone"], R, seg=64, ripple=lambda a, h: 1 - 0.01 * bands[int(h / 0.48) % 40])  # (each course of the ashlar worn back its own amount)
    # the corbelled cornice carrying the gallery
    lathe("cornice_ring", [(1.22, ye), (1.3, ye + 0.12), (1.45, ye + 0.3), (1.62, ye + 0.42), (1.68, ye + 0.55), (1.6, ye + 0.58)], M["stone"], R, seg=48)
    yc = ye + 0.58
    gallery(R, yc, 1.5, posts=22)
    top = lantern(R, yc, 0.92, 8, 1.3, "cone")
    rod("finial", (0, top, 0), (0, top + 0.6, 0), 0.03, M["lead"], R)
    return R

towers = [west(), east()]

# ---- one mesh per material per tower, then the LODs, then ambient occlusion into the vertices ----
def join_by_material(r):
    kids = [o for o in r.children if o.type == "MESH"]
    groups = {}
    for o in kids: groups.setdefault(o.data.materials[0].name, []).append(o)
    out = []
    for mname, objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active; j.name = f"{r.name}_{mname}"; out.append(j)
    # one mesh for the tower (several materials): fewer draw calls
    bpy.ops.object.select_all(action="DESELECT")
    for o in out: o.select_set(True)
    bpy.context.view_layer.objects.active = out[0]; bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = r.name + "_LOD0"
    mw = j.matrix_world.copy(); j.parent = None; j.matrix_world = mw
    return j
lod0 = [join_by_material(r) for r in towers]
lod0[1].location.x = 40.0  # (apart while their shading is baked: neither shades the other)
# ambient occlusion baked into a colour attribute (Cycles on the GPU), before the LODs are made from it
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 96
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU not set:", e)
sc.world = sc.world or bpy.data.worlds.new("w"); sc.world.light_settings.distance = 0.6  # (contact shade: a door in its reveal stays readable)
for j in lod0:
    j.data.color_attributes.new("AO", "BYTE_COLOR", "CORNER"); j.data.color_attributes.active_color_name = "AO"
    bpy.ops.object.select_all(action="DESELECT"); j.select_set(True); bpy.context.view_layer.objects.active = j
    sc.cycles.bake_type = "AO"; sc.render.bake.target = "VERTEX_COLORS"; sc.world = sc.world or bpy.data.worlds.new("w")
    bpy.ops.object.bake(type="AO")
    ca = j.data.color_attributes["AO"]; keep = {i for i, m in enumerate(j.data.materials) if m and m.name in ("lantern_glass",)}
    for p in j.data.polygons:
        if p.material_index in keep:
            for li in p.loop_indices: ca.data[li].color = (1, 1, 1, 1)
    vals = [ca.data[i].color[0] for i in range(0, len(ca.data), 7)]; print("AO", j.name, "mean", round(sum(vals) / len(vals), 3), "min", round(min(vals), 3), flush=True)
def lod(src, ratio, name):
    o = src.copy(); o.data = src.data.copy(); col.objects.link(o); o.name = name
    d = o.modifiers.new("dec", "DECIMATE"); d.ratio = ratio; d.use_collapse_triangulate = True
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="dec")
    return o
lods = []
for j, r in zip(lod0, towers):
    lods += [lod(j, 0.22, r.name + "_LOD1"), lod(j, 0.05, r.name + "_LOD2")]
tri = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
for o in lod0 + lods: print("MESH", o.name, tri(o), "triangles")
for o in lod0 + lods: o.location = Vector((0, 0, 0))
os.makedirs(OUT + "/source/whitby", exist_ok=True); os.makedirs(OUT + "/exports", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT + "/source/whitby/whitby_lights.blend")
for o in bpy.data.objects: o.select_set(o.type == "MESH")
opts = dict(filepath=OUT + "/exports/whitby_lights.glb", export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
            export_image_format="NONE", export_cameras=False, export_lights=False)
try: bpy.ops.export_scene.gltf(**opts, export_vertex_color="ACTIVE")
except TypeError as e: print("export: older options", e); bpy.ops.export_scene.gltf(**opts, export_colors=True)
print("LIGHTS DONE", os.path.getsize(OUT + "/exports/whitby_lights.glb") // 1000, "kB")
# ---- pictures of each, lit by a sun, for checking (Eevee) ----
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 4.5; so = bpy.data.objects.new("sun", sun); col.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(35))
sc.world.use_nodes = True; bg = sc.world.node_tree.nodes.get("Background"); bg.inputs[0].default_value = (0.55, 0.65, 0.8, 1); bg.inputs[1].default_value = 0.9
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); col.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = 1000, 1400
for o in lods: o.hide_render = True
for j, x0 in zip(lod0, (0, 30)):
    j.location.x = x0
for name, (x0, h, d) in {"west": (0, 24, 34), "east": (30, 14, 22)}.items():
    cam.location = Vector((x0 + d * 0.55, -d, h * 0.42)); cam.data.lens = 50
    cam.rotation_euler = (Vector((x0, 0, h * 0.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = OUT + f"/renders/whitby_light_{name}.png"; bpy.ops.render.render(write_still=True)
print("RENDERS DONE")
