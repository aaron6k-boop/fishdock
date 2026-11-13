# FishDock rig rebuild, step 1: the joints of the Blender Studio realistic male, measured from his own mesh.
# Writes rig/joints.json (metres, the body moved to stand at the origin facing -Y) and renders the joints as markers.
import bpy, os, json, math, heapq
import numpy as np
from mathutils import Vector
ROOT = "C:/Users/aaron/Documents/FishDock-assets"; R = ROOT + "/renders/rig"; RIG = ROOT + "/rig"; os.makedirs(R, exist_ok=True); os.makedirs(RIG, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=ROOT + "/downloads/blender_human_base_meshes/human-base-meshes-bundle-v1.1.0/human_base_meshes_bundle.blend")
body = bpy.data.objects["GEO-body_male_realistic"]; me = body.data; mw = body.matrix_world
P = np.array([tuple(mw @ v.co) for v in me.vertices]); cx = (P[:, 0].min() + P[:, 0].max()) / 2; cy = (P[:, 1].min() + P[:, 1].max()) / 2
OFF = np.array([cx, cy, P[:, 2].min()]); P = P - OFF
E = [tuple(e.vertices) for e in me.edges]; NB = [[] for _ in range(len(P))]
for a, b in E: d = float(np.linalg.norm(P[a] - P[b])); NB[a].append((b, d)); NB[b].append((a, d))
def dijkstra(src, allowed):
    dist = {s: 0.0 for s in src}; h = [(0.0, s) for s in src]
    while h:
        d, u = heapq.heappop(h)
        if d > dist.get(u, 9): continue
        for v, w in NB[u]:
            if v in allowed and d + w < dist.get(v, 9): dist[v] = d + w; heapq.heappush(h, (d + w, v))
    return dist
J = {"offset": OFF.tolist()}
for s, S in ((1, "L"), (-1, "R")):
    sx = P[:, 0] * s
    # ---- the arm: everything out past the torso and below the shoulder ----
    hand_mask = (sx > 0.26) & (P[:, 2] > 0.55) & (P[:, 2] < 1.06)
    tip_i = np.where(hand_mask)[0][np.argmin(P[hand_mask, 2])]; T = P[tip_i]
    sh_band = (sx > 0.17) & (sx < 0.21) & (P[:, 2] > 1.3); acro = P[sh_band][np.argmax(P[sh_band, 2])]
    S0 = acro + np.array([-0.012 * s, 0.0, -0.05])
    ax = (T - S0) / np.linalg.norm(T - S0)
    arm = np.where((sx > 0.13) & (P[:, 2] > 0.55) & (P[:, 2] < 1.45))[0]
    t = (P[arm] - S0) @ ax; L = np.linalg.norm(T - S0)
    # the arm's centre and thickness at each step along it
    prof = []
    for k in np.linspace(0.05, 0.98, 94):
        sel = arm[np.abs(t - k * L) < 0.006]
        if len(sel) < 6: prof.append(None); continue
        q = P[sel]; q = q[np.linalg.norm((q - S0) - np.outer((q - S0) @ ax, ax), axis=1) < 0.09]
        if len(q) < 6: prof.append(None); continue
        c = q.mean(0); r = np.sqrt((np.linalg.norm((q - c) - np.outer((q - c) @ ax, ax), axis=1) ** 2).mean()); prof.append((k, c, r))
    good = [p for p in prof if p]
    wr = min([p for p in good if 0.55 < p[0] < 0.8], key=lambda p: p[2]); W = wr[1]
    sh_len = np.linalg.norm(W - S0)
    el = min(good, key=lambda p: abs(p[0] * L - 0.553 * sh_len)); Eb = el[1]
    J["shoulder." + S] = S0.tolist(); J["elbow." + S] = Eb.tolist(); J["wrist." + S] = W.tolist(); J["acromion." + S] = acro.tolist()
    print(S, "acromion", np.round(acro, 3), "shoulder", np.round(S0, 3), "elbow", np.round(Eb, 3), "wrist", np.round(W, 3), "wrist r", round(wr[2], 4), "fingertip", np.round(T, 3))
    print(S, "upper arm", round(float(np.linalg.norm(Eb - S0)), 3), "forearm", round(float(np.linalg.norm(W - Eb)), 3), "wrist to tip", round(float(np.linalg.norm(T - W)), 3))
    # ---- the hand: its points past the wrist, the fingertips as the far ends of the surface from the wrist ----
    ha = (T - W) / np.linalg.norm(T - W)
    hand = set(np.where((((P - W) @ ha) > -0.01) & (sx > 0.2) & (P[:, 2] < W[2] + 0.05) & (P[:, 2] > 0.55))[0].tolist())
    seed = min(hand, key=lambda i: (P[i] - W) @ ha)
    gd = dijkstra([seed], hand)
    tips = []
    for i in sorted(gd, key=lambda i: -gd[i]):
        if all(np.linalg.norm(P[i] - P[j]) > 0.022 for j in tips): tips.append(i)
        if len(tips) == 5: break
    # name them: the thumb is the tip nearest the wrist along the surface; the rest by order across the hand
    tips.sort(key=lambda i: gd[i]); th = tips[0]; fz = tips[1:]
    lat = np.array([0.0, 1.0, 0.0]); lat = lat - (lat @ ha) * ha; lat /= np.linalg.norm(lat)
    fz.sort(key=lambda i: (P[i] - W) @ lat * (1 if (P[th] - W) @ lat < 0 else -1))
    names = ["thumb", "index", "middle", "ring", "pinky"]
    for nm, ti in zip(names, [th] + fz):
        g2 = dijkstra([ti], hand)
        # the finger's centre line: the middle of each ring of points the same surface distance from its tip
        line = []
        for dd in np.arange(0.004, 0.13, 0.004):
            ring = [i for i, d in g2.items() if abs(d - dd) < 0.0025]
            if len(ring) < 3: continue
            q = P[ring]; c = q.mean(0); spread = float(np.sqrt(((q - c) ** 2).sum(1).mean())); line.append((round(float(dd), 3), c.tolist(), round(spread, 4)))
        J["finger." + nm + "." + S] = {"tip": P[ti].tolist(), "line": line}
        sp = [l[2] for l in line]; jump = next((l[0] for l, a, b in zip(line[1:], sp, sp[1:]) if b > a * 1.35 and l[0] > 0.02), None)
        print(S, nm, "tip", np.round(P[ti], 3), "surface length to wrist", round(gd[ti], 3), "ring spread jumps at", jump)
json.dump(J, open(RIG + "/joints.json", "w"), indent=1)
print("wrote joints.json")
# ---- markers, and renders ----
sc = bpy.context.scene
for o in list(sc.objects):
    if o != body: o.hide_render = True
body.location = Vector(body.location) - Vector(OFF.tolist())
def mark(p, r, col):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=12, ring_count=8); o = bpy.context.object
    m = bpy.data.materials.new("m"); m.diffuse_color = col; o.data.materials.append(m); o.hide_render = False
for k, v in J.items():
    if k.startswith(("shoulder", "elbow", "wrist")): mark(v, 0.012, (1, 0.1, 0.1, 1))
    elif k.startswith("finger"):
        for i, l in enumerate(v["line"]):
            if i % 2 == 0: mark(l[1], 0.0022, (0.1, 0.4, 1, 1))
        mark(v["tip"], 0.003, (0.1, 1, 0.2, 1))
sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"; sc.display.shading.show_xray = True; sc.display.shading.xray_alpha = 0.55
sc.render.resolution_x = 900; sc.render.resolution_y = 900
cam = bpy.data.objects.new("lookcam", bpy.data.cameras.new("lookcam")); sc.collection.objects.link(cam); sc.camera = cam
def shot(name, at, frm, lens=50):
    cam.location = frm; d = Vector(at) - Vector(frm); cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler(); cam.data.lens = lens; cam.data.clip_start = 0.01
    sc.render.filepath = R + "/" + name + ".png"; bpy.ops.render.render(write_still=True)
body.data.materials.clear(); bm = bpy.data.materials.new("skin"); bm.diffuse_color = (0.85, 0.68, 0.58, 1); body.data.materials.append(bm)
shot("j_front", (0, 0, 1.15), (0, -2.6, 1.15), 50); shot("j_side", (0.3, 0, 1.15), (2.6, 0, 1.15), 50)
for S in "LR":
    W = Vector(J["wrist." + S]); T = Vector(J["finger.middle." + S]["tip"]); c = (W + T) / 2; s = 1 if S == "L" else -1
    shot("j_hand_out_" + S, c, c + Vector((0.38 * s, 0, 0)), 85); shot("j_hand_front_" + S, c, c + Vector((0, -0.38, 0)), 85)
print("rendered")
