# FishDock (17 Nov): every sea fish with a cut-out picture rebuilt in Blender with its anatomy, not only its outline.
# Run in background Blender (the FishDock-assets queue). Reads source/fish/all_shapes.json (fish3d.js fishShape of each
# cut-out, as the game reads it: 480 x 320, turned to face left where the game turns it) and the pictures in
# source/fish/pics, writes exports/fish3/<species>.glb (and fish.glb for the first six, as the game loads them) and a
# check render of each fish in renders/fish3.
#
# What is modelled, over the picture's own outline (still the species' true shape, from its picture):
# - the body lofted finely (96 rings, denser at the head, 44 round), its cross-section by kind of fish: a round
#   fish's back narrower than its belly, a bream's and a pouting's deep flat sides, a shark's rounder body and flat
#   belly, a gurnard's bony head flat-sided and wide below, a flatfish domed and thin to its fringe;
# - the head: the gill cover's edge as a groove with its flap standing proud in front (and the preopercle's fainter
#   line ahead of it), the mouth as a lipped slit to its corner (a shark's under its snout), the eye in a socket;
#   a shark's five gill slits;
# - the eyes: domes with a cornea's bulge;
# - the fins: the dorsal, anal and tail fins on the middle plane, their rays standing out as ridges that fade to the
#   edge; the pelvic fins as a pair, each turned out from the belly;
# - two shape keys the game plays (glTF morph targets): "gape" (the lower jaw drops about its hinge at the mouth's
#   corner) and "gills" (the gill covers lift out from the body at their edge);
# - a colour on each vertex the game darkens the skin by: the grooves, the mouth's slit and the eye's socket (a
#   gasping mouth and lifted gill covers open onto dark, as the skin stretches over the gap).
# Positions in fish lengths: x from the snout (0) to the tail's tip (1), y up, z out of the picture's side; uvs the
# picture's (x / 480, 1 - y / 320), as before. Nothing here is a measured fact about a species: the head's marks are
# placed from each picture by eye (ANAT below).
import bpy, bmesh, json, math, os, time
from mathutils import Vector, Matrix
A = "C:/Users/aaron/Documents/FishDock-assets"
SH = json.load(open(A + "/source/fish/all_shapes.json"))
PICS = A + "/source/fish/pics"
OUTD = A + "/exports/fish3"; REND = A + "/renders/fish3"
os.makedirs(OUTD, exist_ok=True); os.makedirs(REND, exist_ok=True)
P = lambda x, y, z: Vector((x, -z, y))  # (fish frame to Blender's: exported y-up it is the fish frame again)

# ---- each species: its kind, thickness (of its depth), eyes (picture x, y, radius), and the head's marks: the mouth's
# corner (picture x, y), the gill cover's edge (picture x at the middle of the head), how far the jaw drops ----
ANAT = {
  "cod":       dict(kind="round", width=0.6,  eyes=[(88, 150, 9)],  mouth=(72, 172), op=150, gape=26),
  "bass":      dict(kind="round", width=0.42, eyes=[(72, 157, 9)],  mouth=(66, 172), op=146, gape=30),
  "whiting":   dict(kind="round", width=0.45, eyes=[(68, 158, 8)],  mouth=(62, 170), op=128, gape=24),
  "mackerel":  dict(kind="round", width=0.6,  eyes=[(73, 150, 9)],  mouth=(58, 166), op=126, gape=26),
  "pollack":   dict(kind="round", width=0.5,  eyes=[(80, 155, 9)],  mouth=(68, 168), op=140, gape=26),
  "coalfish":  dict(kind="round", width=0.5,  eyes=[(69, 164, 9)],  mouth=(58, 172), op=128, gape=24),
  "pouting":   dict(kind="deep",  width=0.45, eyes=[(76, 148, 14)], mouth=(52, 174), op=128, gape=22),
  "black-bream": dict(kind="deep", width=0.34, eyes=[(79, 157, 13)], mouth=(52, 184), op=140, gape=20),
  "ballan-wrasse": dict(kind="deep", width=0.5, eyes=[(82, 140, 7)], mouth=(60, 166), op=150, gape=18),
  "thick-lipped-mullet": dict(kind="round", width=0.6, eyes=[(68, 146, 8)], mouth=(52, 160), op=122, gape=16),
  "garfish":   dict(kind="round", width=0.85, eyes=[(111, 151, 5)], mouth=(100, 158), op=140, gape=10),
  "gurnard":   dict(kind="gurnard", width=0.75, eyes=[(88, 150, 9)], mouth=(66, 168), op=150, gape=22),
  "lesser-spotted-dogfish": dict(kind="shark", width=0.8, eyes=[(72, 164, 8)], mouth=(70, 180), op=None, gills=0.17, gape=10),
  "smoothhound": dict(kind="shark", width=0.75, eyes=[(65, 167, 7)], mouth=(66, 182), op=None, gills=0.19, gape=10),
  "tope":      dict(kind="shark", width=0.75, eyes=[(67, 162, 6)], mouth=(64, 180), op=None, gills=0.2, gape=10),
  "plaice":    dict(kind="flat", width=0.13, eyes=[(55, 135, 5), (65, 141, 5)], mouth=(40, 156), op=110, gape=14),
  "dab":       dict(kind="flat", width=0.13, eyes=[(60, 129, 4), (58, 150, 5)], mouth=(40, 154), op=108, gape=14),
  "flounder":  dict(kind="flat", width=0.13, eyes=[(69, 136, 5), (74, 162, 6)], mouth=(44, 156), op=114, gape=14),
  "sole":      dict(kind="flat", width=0.12, eyes=[(43, 142, 3), (43, 157, 4)], mouth=(30, 160), op=90, gape=10),
  "thornback-ray": dict(kind="ray", width=0.1, eyes=[(70, 132, 5), (67, 158, 5)], mouth=None, op=None, gape=0),
}
FIRST_SIX = ["cod", "bass", "whiting", "mackerel", "plaice", "pollack"]

smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(max(0.0, min(1.0, (x - a) / (b - a))))
gauss = lambda d, w: math.exp(-(d / w) ** 2)

def clear():
  for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
  for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
    for x in list(coll):
      if x.users == 0: coll.remove(x)

def materials(sp, shared=False):
  # (named as the game knows them; the picture is wired in only for the check render, not exported. Several fish in one
  # file share the three, as the game finds each part by its material's name)
  if shared and "fish_body" in bpy.data.materials: return bpy.data.materials["fish_body"], bpy.data.materials["fish_fin"], bpy.data.materials["fish_eye"]
  img = None; f = f"{PICS}/{sp}-s.webp"
  if os.path.exists(f): img = bpy.data.images.load(f, check_existing=True)
  def mk(name, rough, alpha=False, clear=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    if clear:
      try: b.inputs["Coat Weight"].default_value = 1.0; b.inputs["Coat Roughness"].default_value = 0.03
      except Exception: pass
    if img:
      t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.interpolation = "Cubic"
      uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "UVMap"
      if SH[sp].get("headRight"):  # (the game turns this picture to face left: so does the check render)
        mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value[0] = -1; mp.inputs["Location"].default_value[0] = 1
        nt.links.new(uvn.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
      else: nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
      vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "fdShade"
      mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1.0
      ci = [q for q in mul.inputs if q.type == "RGBA"]; co = [q for q in mul.outputs if q.type == "RGBA"][0]
      nt.links.new(t.outputs["Color"], ci[0]); nt.links.new(vc.outputs["Color"], ci[1]); nt.links.new(co, b.inputs["Base Color"])
      if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        try: m.surface_render_method = "DITHERED"
        except Exception: pass
        try: m.blend_method = "CLIP"
        except Exception: pass
    return m
  return mk("fish_body", 0.4), mk("fish_fin", 0.5, alpha=True), mk("fish_eye", 0.05, clear=True)

def build(sp, shared=False):
  S, N = SH[sp], ANAT[sp]
  w, h, x0, xp, L, sy = S["w"], S["h"], S["x0"], S["xp"], S["L"], S["spineY"]
  T, B = S["top"], S["bot"]; kind = N["kind"]; flat = kind in ("flat", "ray"); width = N["width"]
  toU = lambda x: (x - x0) / L; toY = lambda y: -(y - sy) / L
  col = bpy.context.scene.collection
  M_BODY, M_FIN, M_EYE = materials(sp, shared)
  # the body's edge at any picture x (between columns: interpolated)
  def edge(x):
    x = max(x0, min(xp, x)); i = int(x); f = x - i; j = min(xp, i + 1)
    return T[i] + (T[j] - T[i]) * f, B[i] + (B[j] - B[i]) * f
  def ring_at(x):
    tp, bt = edge(x); return (tp + bt) / 2, max(0.6, (bt - tp) / 2)
  def taper_at(u):
    up = u / max(0.01, toU(xp))
    if flat: return 0.55 + 0.45 * smooth(0, 0.14, u)
    if kind == "shark": return (0.55 + 0.45 * smooth(0.0, 0.2, u)) * (1 - 0.55 * smooth(0.5, 1.0, up))
    return (0.38 + 0.62 * smooth(0.0, 0.26, u)) * (1 - 0.6 * smooth(0.55, 1.0, up))
  # the head's marks, in fish units: s is the height on the body's ring (-1 the belly, 1 the back)
  mx, my = N["mouth"] if N["mouth"] else (None, None)
  uM = toU(mx) if mx else None
  if mx:
    cM, aM = ring_at(mx); sM = max(-0.95, min(0.6, (cM - my) / aM))
    c0, a0 = ring_at(x0 + 1.5); sT = max(-0.9, min(0.5, (c0 - my) / a0)) if kind != "shark" else -0.8
  uOp = toU(N["op"]) if N.get("op") else None
  def op_edge(s): return uOp - 0.05 * s * s - 0.016 * s  # (the gill cover's edge: a curve open to the front)
  def mouth_s(u): return sT + (sM - sT) * min(1.0, u / max(1e-3, uM))
  eyes = [(toU(ex), (ring_at(ex)[0] - ey) / ring_at(ex)[1], er / L) for ex, ey, er in N["eyes"]]

  # ---- the body ----
  K, Mr = 96, 44
  me = bpy.data.meshes.new("fish_" + sp); bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap")
  rings, info = [], {}
  for i in range(K):
    t = i / (K - 1); tt = 0.62 * t + 0.38 * t * t  # (rings closer together at the head, where its marks are)
    x = x0 + (xp - x0) * (0.5 - 0.5 * math.cos(math.pi * tt)); x = x0 + 0.0015 * L + (x - x0) * (1 - 0.0015 * L / (xp - x0)); u = toU(x)
    # (the snout rounded off over its first few hundredths: the outline's edges, smoothed over 7% of the length, stand
    # square at the very front, and the head was a flat face there with the mouth's slit across it)
    nose = math.sqrt(max(0.0, 1 - (1 - min(1.0, u / (0.05 if kind == "shark" else 0.035))) ** 2))
    c, a = ring_at(x); a *= max(0.08, nose); b = a * width * taper_at(u); ring = []
    for j in range(Mr):
      th = j / Mr * math.pi * 2; cs, sn = math.cos(th), math.sin(th)
      yImg = c - a * cs
      if flat: zf = (1 - abs(cs) ** 3) ** 0.5
      elif kind == "deep": zf = (1 + 0.1 * max(0.0, -cs)) * (1 - 0.32 * max(0.0, cs) ** 2) * (abs(sn) ** -0.25 if abs(sn) > 0.05 else 1.0) * 0.86
      elif kind == "shark": zf = (1 + 0.18 * max(0.0, -cs)) * (1 - 0.12 * max(0.0, cs) ** 2); yImg = c - a * cs * (0.9 if cs < 0 else 1.0)
      elif kind == "gurnard":
        hd = 1 - smooth(0.22, 0.42, u); zf = (1 + (0.18 + 0.3 * hd) * max(0.0, -cs)) * (1 - (0.22 + 0.25 * hd) * max(0.0, cs) ** 1.5)
      else: zf = (1 + 0.16 * max(0.0, -cs)) * (1 - 0.24 * max(0.0, cs) ** 2) * (1 - 0.1 * max(0.0, cs) ** 6)
      zf = max(0.0, zf)
      v = bm.verts.new(P(u, toY(yImg), b * sn * zf / L)); ring.append(v)
      info[v] = dict(u=u, s=cs, side=sn, uv=(x / w, 1 - yImg / h), a=a / L)
    rings.append(ring)
  faces = []
  for i in range(K - 1):
    for j in range(Mr):
      q = (rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % Mr], rings[i][(j + 1) % Mr])
      faces.append(bm.faces.new(q))
  for ring, front in ((rings[0], True), (rings[-1], False)):
    cen = sum((v.co for v in ring), Vector()) / len(ring); cv = bm.verts.new(cen)
    if front: cv.co.x -= 0.006
    info[cv] = dict(u=0.0 if front else toU(xp), s=0.0, side=0.0, uv=(sum(info[v]["uv"][0] for v in ring) / Mr, sum(info[v]["uv"][1] for v in ring) / Mr), a=0.0)
    for j in range(Mr):
      faces.append(bm.faces.new((cv, ring[j], ring[(j + 1) % Mr]) if front else (cv, ring[(j + 1) % Mr], ring[j])))
  bm.normal_update()
  bmesh.ops.recalc_face_normals(bm, faces=faces)
  bm.normal_update()

  # ---- the head's marks: grooves pressed in along the surface's normal, a dark shade in them ----
  shade = {}; gapeD = {}; gillD = {}
  for v, I in info.items():
    u, s, side = I["u"], I["s"], I["side"]; d = 0.0; dark = 0.0; nrm = v.normal.copy()
    if not flat or kind == "flat":
      # the gill cover's edge and the preopercle's line ahead of it (on a flatfish only its upper, eyed side)
      if uOp is not None and (not flat or side > 0.2) and s < 0.8:
        fade = (1 - smooth(0.55, 0.8, s)) * (1 if flat else smooth(0.0, 0.25, abs(side)) if s > -0.6 else 1)
        de = u - op_edge(s)
        d += fade * (-0.0042 * gauss(de, 0.0055) + 0.0022 * gauss(de + 0.011, 0.007))
        dp = u - (op_edge(s) - 0.055)
        d += fade * (1 - smooth(0.3, 0.6, s)) * -0.0016 * gauss(dp, 0.005)
        dark = max(dark, fade * gauss(de, 0.0045))
        # the gill cover lifts out at its edge: most at the edge, none a cover's width ahead of it
        wg = fade * smooth(-0.1, -0.008, de) * (1 - smooth(-0.004, 0.004, de)) * (1 - smooth(0.45, 0.75, s))
        if wg > 0 and abs(side) > 0.05: gillD[v] = (0.004 * wg, 0.0, math.copysign(0.013 * wg, side))  # (fish frame: along, up, out)
      # a shark's five gill slits
      if N.get("gills") and abs(side) > 0.3 and -0.55 < s < 0.35:
        for k in range(5):
          dg = u - (N["gills"] + 0.017 * k + 0.004 * s)
          d += -0.003 * gauss(dg, 0.0028) * smooth(0.3, 0.5, abs(side)); dark = max(dark, 0.8 * gauss(dg, 0.0025))
      # the mouth's slit and its lips; the lower jaw (below the slit, ahead of its corner) is what drops
      if uM is not None and u < uM + 0.02:
        sl = mouth_s(u); ds = (s - sl) * max(0.004, I["a"]) / 0.012  # (in about a hundredth of the length)
        fade = 1 - smooth(uM - 0.004, uM + 0.012, u)
        if kind == "shark": fade *= smooth(0.0, 0.3, -s + 0.2)
        d += fade * (-0.0035 * gauss(ds, 0.45) + 0.0016 * gauss(ds - 0.9, 0.5) + 0.0016 * gauss(ds + 0.9, 0.5))
        dark = max(dark, fade * gauss(ds, 0.4))
        if s < sl and N["gape"] > 0:
          wj = (1 - smooth(uM - 0.01, uM + 0.025, u)) * smooth(0.05, 0.6, -ds + 0.4)
          if wj > 0: gapeD[v] = wj
      # each eye's socket
      for (eu, es, er) in eyes:
        if flat and side < 0.2: continue
        if not flat and abs(side) < 0.15: continue
        de = math.hypot(u - eu, (s - es) * I["a"]) / max(er, 1e-4)
        d += -0.0018 * gauss(de - 1.25, 0.35) * (1 if flat or abs(side) > 0.3 else 0.5)
        dark = max(dark, 0.6 * gauss(de - 1.1, 0.25))
    if d: v.co += nrm * d
    shade[v] = 1.0 - 0.72 * min(1.0, dark)
  # (the slit is darker, the gill groove a dark red where it opens over the gills)
  for f in faces:
    for lp in f.loops: lp[uvl].uv = info[lp.vert]["uv"]
  bm.to_mesh(me); bm.free()
  body = bpy.data.objects.new("fish_" + sp + "_body", me); col.objects.link(body); me.materials.append(M_BODY)
  for p in me.polygons: p.use_smooth = True
  # the shade colour (the game multiplies the skin by it)
  ca = me.color_attributes.new("fdShade", "BYTE_COLOR", "POINT")
  # (bmesh's vertex order is the order they were made in: info's)
  order = list(info.items())
  for k, (v, I) in enumerate(order):
    sv = shade[v]
    ca.data[k].color = (sv, sv * (0.82 if v in gillD and sv < 0.9 else 1.0), sv * (0.8 if v in gillD and sv < 0.9 else 1.0), 1.0)
  # the shape keys: the jaw's drop about its hinge, the gill covers lifting out
  basis = body.shape_key_add(name="Basis", from_mix=False)
  if gapeD:
    kg = body.shape_key_add(name="gape", from_mix=False)
    hx = uM + 0.012; hy = toY(my)  # (the hinge, just behind the mouth's corner)
    ang = math.radians(N["gape"])
    for k, (v, I) in enumerate(order):
      if v not in gapeD: continue
      co = me.vertices[k].co  # (Blender's frame: x along the fish, z up)
      dx, dz = co.x - hx, co.z - hy; a = ang * gapeD[v]
      # (turned about the hinge so the jaw's tip, ahead of it, goes down)
      kg.data[k].co = Vector((hx + dx * math.cos(a) - dz * math.sin(a), co.y, hy + dx * math.sin(a) + dz * math.cos(a)))
  if gillD:
    kl = body.shape_key_add(name="gills", from_mix=False)
    for k, (v, I) in enumerate(order):
      if v not in gillD: continue
      dx, dy, dz = gillD[v]  # (the fish's frame to Blender's: x, -z, y)
      kl.data[k].co = me.vertices[k].co + Vector((dx, -dz, dy))
  parts = [body]

  # ---- the fins: plates on the middle plane, their rays standing out; the pelvic fins a pair ----
  def plate(name, box, kindf, mirror=0):
    bx0, by0, bx1, by1 = box; nx = max(8, int((bx1 - bx0) / 3)); ny = max(6, int((by1 - by0) / 3))
    nx, ny = min(nx, 40), min(ny, 30)
    pm = bpy.data.meshes.new(name); bmp = bmesh.new(); ul = bmp.loops.layers.uv.new("UVMap"); grid = []
    for jj in range(ny + 1):
      row = []
      for ii in range(nx + 1):
        xx = bx0 - 1 + (bx1 - bx0 + 2) * ii / nx; yy = by0 - 1 + (by1 - by0 + 2) * jj / ny
        # the rays: ridges across the fin, fading out to its edge (top fins' base below them, bottom fins' above, the
        # tail's at its front)
        if kindf == "tail": tb = (xx - bx0) / max(1, bx1 - bx0); along = yy
        elif kindf == "top": tb = (by1 - yy) / max(1, by1 - by0); along = xx
        else: tb = (yy - by0) / max(1, by1 - by0); along = xx
        ridge = 0.0022 * math.sin(along / (0.011 * L) * math.pi) * (1 - 0.75 * tb)
        cup = (0.004 * ((yy - (by0 + by1) / 2) / max(1, (by1 - by0) / 2)) ** 2 * tb) if kindf == "tail" else 0
        v = bmp.verts.new(P(toU(xx), toY(yy), ridge + cup)); row.append((v, (xx / w, 1 - yy / h)))
      grid.append(row)
    for jj in range(ny):
      for ii in range(nx):
        q = (grid[jj][ii], grid[jj][ii + 1], grid[jj + 1][ii + 1], grid[jj + 1][ii])
        f = bmp.faces.new([e[0] for e in q])
        for lp, e in zip(f.loops, q): lp[ul].uv = e[1]
    bmp.to_mesh(pm); bmp.free()
    o = bpy.data.objects.new(name, pm); col.objects.link(o); pm.materials.append(M_FIN)
    for p in pm.polygons: p.use_smooth = True
    c2 = pm.color_attributes.new("fdShade", "BYTE_COLOR", "POINT")
    for k in range(len(pm.vertices)): c2.data[k].color = (1, 1, 1, 1)
    if mirror:
      # a pelvic fin: turned out from the belly about its base (the plate's top edge), and set off to the side
      cx, cyb = toU((bx0 + bx1) / 2), toY(by0); cM2, aM2 = ring_at((bx0 + bx1) / 2)
      off = aM2 * width * taper_at(cx) * 0.35 / L
      rot = Matrix.Rotation(math.radians(32) * mirror, 4, "X")  # (the fin, hanging below its base, swings out to the side `mirror` is)
      pivot = Vector((0, 0, cyb))
      for vv in pm.vertices: vv.co = rot @ (vv.co - pivot) + pivot + Vector((0, off * mirror, 0))
    return o
  def grow(box):
    bx0, by0, bx1, by1 = box; g = 0.04 * L
    return [bx0, by0, bx1, by1 + g] if (by0 + by1) / 2 < sy else [bx0, by0 - g, bx1, by1]
  for k, f in enumerate(S["fins"]):
    bx0, by0, bx1, by1 = f["box"]; cxu = toU((bx0 + bx1) / 2); narrow = (bx1 - bx0) < 0.035 * L
    pelvic = f["side"] == "bottom" and cxu < 0.42 and not flat and kind != "shark" and not narrow and f["area"] > 120
    if pelvic:
      # (not grown into the body: turned out, the grown part, the picture's body above the fin, stood out with it)
      bb = [bx0, by0 - 1, bx1, by1]
      parts.append(plate(f"fish_{sp}_pelvicL{k}", bb, "bottom", 1)); parts.append(plate(f"fish_{sp}_pelvicR{k}", bb, "bottom", -1))
    else: parts.append(plate(f"fish_{sp}_fin{k}", grow(f["box"]), f["side"]))
  if S["tail"]: parts.append(plate(f"fish_{sp}_tail", S["tail"], "tail"))

  # ---- the eyes: a dome with a cornea's bulge, set in its socket ----
  for k, (ex, ey, er) in enumerate(N["eyes"]):
    for side in ((1,) if flat else (1, -1)):
      c, a = ring_at(ex); u = toU(ex); cs = max(-1, min(1, (c - ey) / a))
      b = a * width * taper_at(u)
      if flat: zf = (1 - abs(cs) ** 3) ** 0.5
      elif kind == "deep": zf = (1 - 0.32 * max(0.0, cs) ** 2) * 0.86 * max(0.3, (1 - cs * cs) ** 0.5) ** -0.25
      else: zf = (1 - 0.24 * max(0.0, cs) ** 2)
      zs = b * math.sqrt(max(0.0, 1 - cs * cs)) * zf
      em = bpy.data.meshes.new(f"eye{k}{side}"); bme = bmesh.new(); ul = bme.loops.layers.uv.new("UVMap")
      r = er / L; bmesh.ops.create_uvsphere(bme, u_segments=24, v_segments=14, radius=r)
      for v in bme.verts:
        rr = math.hypot(v.co.x, v.co.z) / r  # (out of the flank is Blender's y)
        v.co.y *= (0.26 if flat else 0.42) + 0.22 * max(0.0, 1 - rr * 1.6)  # (a flattish eyeball with the cornea bulging at its middle)
      for f in bme.faces:
        for lp in f.loops:
          co = lp.vert.co; lp[ul].uv = ((ex + co.x * L) / w, 1 - (ey - co.z * L) / h)
      bme.to_mesh(em); bme.free()
      eo = bpy.data.objects.new(f"fish_{sp}_eye{k}{'L' if side > 0 else 'R'}", em); col.objects.link(eo); em.materials.append(M_EYE)
      c3 = em.color_attributes.new("fdShade", "BYTE_COLOR", "POINT")
      for q in range(len(em.vertices)): c3.data[q].color = (1, 1, 1, 1)
      eo.location = P(u, toY(ey), side * (zs / L - r * (0.3 if flat else 0.12)))
      for p in em.polygons: p.use_smooth = True
      parts.append(eo)
  # one object per species, origin at the snout
  bpy.ops.object.select_all(action="DESELECT")
  for o in parts: o.select_set(True)
  bpy.context.view_layer.objects.active = body
  bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
  bpy.ops.object.join()
  j = bpy.context.view_layer.objects.active; j.name = "fish_" + sp
  try: j.data.color_attributes.active_color = j.data.color_attributes["fdShade"]
  except Exception: pass
  tri = sum(len(p.vertices) - 2 for p in j.data.polygons)
  keys = [k.name for k in j.data.shape_keys.key_blocks] if j.data.shape_keys else []
  print("FISH", sp, len(j.data.vertices), "verts", tri, "tris", "keys", keys)
  return j

def export(objs, path):
  bpy.ops.object.select_all(action="DESELECT")
  for o in objs: o.select_set(True)
  kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True, export_cameras=False, export_lights=False,
            export_normals=True, export_texcoords=True, export_materials="EXPORT", export_image_format="NONE", export_morph=True, export_morph_normal=False)
  for extra in ({"export_vertex_color": "ACTIVE", "export_active_vertex_color_when_no_material": True}, {"export_colors": True}, {}):
    try: bpy.ops.export_scene.gltf(**kw, **extra); return
    except TypeError: continue

def render_check(o, sp):
  # a look at it: side on and three-quarters from the front, lit softly, on grey
  scn = bpy.context.scene
  scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
  scn.render.resolution_x, scn.render.resolution_y = 1280, 720; scn.render.film_transparent = False
  w = scn.world or bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.32, 0.34, 0.36, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
  for n, loc, en in (("key", (0.3, -0.6, 0.9), 3.0), ("fill", (0.6, 0.8, 0.3), 1.2)):
    ld = bpy.data.lights.new(n, "AREA"); ld.energy = en * 40; ld.size = 0.6; lo = bpy.data.objects.new(n, ld); lo.location = loc
    lo.rotation_euler = (Vector((0.45, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); scn.collection.objects.link(lo)
  cd = bpy.data.cameras.new("cam"); cd.lens = 50; cam = bpy.data.objects.new("cam", cd); scn.collection.objects.link(cam); scn.camera = cam
  for name, loc, tgt, lens in (("side", (0.5, -1.5, 0.02), (0.5, 0, 0), 50), ("head", (0.13, -0.42, 0.05), (0.13, 0, 0.0), 50), ("front", (-0.35, -0.5, 0.18), (0.3, 0, 0), 50), ("below", (0.35, -0.55, -0.45), (0.35, 0, 0), 50)):
    cam.location = loc; cd.lens = lens; cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Z").to_euler()
    scn.render.filepath = f"{REND}/{sp}_{name}.jpg"; scn.render.image_settings.file_format = "JPEG"
    bpy.ops.render.render(write_still=True)
  # the gape and the gills, open
  if o.data.shape_keys:
    for kb in o.data.shape_keys.key_blocks[1:]: kb.value = 1.0
    cam.location = (0.13, -0.42, 0.05); cam.rotation_euler = (Vector((0.13, 0, 0)) - Vector(cam.location)).to_track_quat("-Z", "Z").to_euler()
    scn.render.filepath = f"{REND}/{sp}_open.jpg"; bpy.ops.render.render(write_still=True)
    for kb in o.data.shape_keys.key_blocks[1:]: kb.value = 0.0
  for ob in [x for x in scn.objects if x.type in ("LIGHT", "CAMERA")]: bpy.data.objects.remove(ob, do_unlink=True)

ONLY = [s for s in os.environ.get("FD_ONLY", "").split(",") if s] or list(ANAT)
RENDER = os.environ.get("FD_RENDER", "1") == "1"
made = {}
for sp in ONLY:
  clear(); t0 = time.time()
  o = build(sp); made[sp] = True
  export([o], f"{OUTD}/{sp}.glb")
  if RENDER: render_check(o, sp)
  print("DONE", sp, round(time.time() - t0, 1), "s", os.path.getsize(f"{OUTD}/{sp}.glb") // 1000, "kB")
# the first six in one file, as the game loads them
if all(s in ONLY for s in FIRST_SIX):
  clear(); objs = [build(s, shared=True) for s in FIRST_SIX]
  export(objs, f"{OUTD}/fish.glb"); print("FISH.GLB", os.path.getsize(f"{OUTD}/fish.glb") // 1000, "kB")
print("ALL DONE")
