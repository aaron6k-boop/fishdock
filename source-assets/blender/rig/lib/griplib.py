# FishDock rig rebuild: the equipment (the game's own rod handle and reel, rodkit.blend) put together at full size, its
# attachment points, and the tools the grip jobs use to put the rig's hands on it. exec'd after riglib.py.
ROD_LEN = 3.66; SEAT = 0.45  # the pier rod: 12 ft, the reel seat 45 cm up from the butt (angler.js "pier")
def handle_radius(y):  # the handle's radius at y (rod frame: butt at 0, along -y)
    a = -y
    if a < 0.026: return 0.0184
    if a < 0.4: return 0.0168
    if a < 0.502: return 0.0134 if not (0.4 < a < 0.428) else 0.0158
    if a < 0.66: return 0.0146
    return 0.0108 + (0.0022 - 0.0108) * min(1, (a - 0.66) / (ROD_LEN - 0.66))
def build_equipment():
    """ROD (empty, rod frame: butt at the origin, the rod along -y, the reel hanging along -z) with the handle, the reel
    on its seat and a tapered blank; returns dict of the parts and attachment points."""
    with bpy.data.libraries.load(ROOT + "/source/rod/rodkit.blend") as (src, dst):
        dst.objects = list(src.objects)
    keep = {}
    for o in dst.objects:
        if o is None: continue
        top = o
        while top.parent: top = top.parent
        if top.name.split(".")[0] in ("rodhandle", "reel"): keep[o.name] = o
    rod = link(bpy.data.objects.new("ROD", None)); rod.empty_display_size = 0.05
    for o in keep.values(): link(o)
    H = next(o for o in keep.values() if o.name.startswith("rodhandle")); Rl = next(o for o in keep.values() if o.name.startswith("reel") and o.type == "EMPTY" and o.parent is None)
    H.parent = rod; Rl.parent = rod; Rl.location = (0, -SEAT, 0)
    # the blank: from the fore grip to the tip, tapering
    me = bpy.data.meshes.new("blank"); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.0108, radius2=0.0022, depth=ROD_LEN - 0.66); bm.to_mesh(me); bm.free()
    bl = link(bpy.data.objects.new("blank", me)); bl.parent = rod; bl.rotation_euler = (math.radians(90), 0, 0); bl.location = (0, -(0.66 + (ROD_LEN - 0.66) / 2), 0)
    bl.data.materials.append(mat("rod_blue", (0.157, 0.43, 0.925), 0.35))
    for o in keep.values():
        if o.type == "MESH" and not o.data.materials: o.data.materials.append(mat("rod_black", (0.05, 0.05, 0.055), 0.5))
    crank = next(o for o in keep.values() if o.name.startswith("crank") and o.type == "EMPTY")
    knob = next(o for o in keep.values() if o.name.startswith("att_knob"))
    return dict(rod=rod, handle=H, reel=Rl, crank=crank, knob=knob, parts=keep)
def seg_dist(p, q, a, b):
    """closest distance between segments pq and ab"""
    u = q - p; v = b - a; w = p - a; A = u.dot(u); B = u.dot(v); Cc = v.dot(v); D = u.dot(w); Ee = v.dot(w); den = A * Cc - B * B
    s = 0.0 if den < 1e-12 else max(0, min(1, (B * Ee - Cc * D) / den)); t = (B * s + Ee) / Cc if Cc > 1e-12 else 0.0
    if t < 0: t = 0; s = max(0, min(1, -D / A)) if A > 1e-12 else 0
    elif t > 1: t = 1; s = max(0, min(1, (B - D) / A)) if A > 1e-12 else 0
    return ((p + u * s) - (a + v * t)).length
