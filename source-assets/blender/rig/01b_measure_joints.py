exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/riglib.py").read())
# FishDock rig rebuild, step 1 again: the joints measured from the mesh, the fingertips found as the surface's own far
# points (local peaks of distance from the wrist), named by where they lie across the hand; markers rendered.
body, OFF = load_body(); me = body.data; mw = body.matrix_world
P = np.array([tuple(mw @ v.co) for v in me.vertices])
NB = [[] for _ in range(len(P))]
for e in me.edges:
    a, b = e.vertices; d = float(np.linalg.norm(P[a] - P[b])); NB[a].append((b, d)); NB[b].append((a, d))
def dijkstra(src, allowed):
    dist = {s: 0.0 for s in src}; h = [(0.0, s) for s in src]
    while h:
        d, u = heapq.heappop(h)
        if d > dist.get(u, 9): continue
        for v, w in NB[u]:
            if v in allowed and d + w < dist.get(v, 9): dist[v] = d + w; heapq.heappush(h, (d + w, v))
    return dist
J = {"offset": list(OFF)}
for s, S in ((1, "L"), (-1, "R")):
    sx = P[:, 0] * s
    hand_mask = (sx > 0.26) & (P[:, 2] > 0.55) & (P[:, 2] < 1.06)
    tip_i = np.where(hand_mask)[0][np.argmin(P[hand_mask, 2])]; T = P[tip_i]
    sh_band = (sx > 0.17) & (sx < 0.21) & (P[:, 2] > 1.3); acro = P[sh_band][np.argmax(P[sh_band, 2])]
    S0 = acro + np.array([-0.012 * s, 0.0, -0.05]); ax = (T - S0) / np.linalg.norm(T - S0)
    arm = np.where((sx > 0.13) & (P[:, 2] > 0.55) & (P[:, 2] < 1.45))[0]; t = (P[arm] - S0) @ ax; L = np.linalg.norm(T - S0)
    prof = []
    for k in np.linspace(0.05, 0.98, 94):
        sel = arm[np.abs(t - k * L) < 0.006]
        if len(sel) < 6: continue
        q = P[sel]; q = q[np.linalg.norm((q - S0) - np.outer((q - S0) @ ax, ax), axis=1) < 0.09]
        if len(q) < 6: continue
        c = q.mean(0); r = np.sqrt((np.linalg.norm((q - c) - np.outer((q - c) @ ax, ax), axis=1) ** 2).mean()); prof.append((k, c, r))
    wr = min([p for p in prof if 0.55 < p[0] < 0.8], key=lambda p: p[2]); W = wr[1]; shl = np.linalg.norm(W - S0)
    Eb = min(prof, key=lambda p: abs(p[0] * L - 0.553 * shl))[1]
    J["shoulder." + S] = S0.tolist(); J["elbow." + S] = Eb.tolist(); J["wrist." + S] = W.tolist(); J["acromion." + S] = acro.tolist()
    ha = (T - W) / np.linalg.norm(T - W)
    hand = set(np.where((((P - W) @ ha) > -0.01) & (sx > 0.2) & (P[:, 2] < W[2] + 0.05) & (P[:, 2] > 0.55))[0].tolist())
    seed = min(hand, key=lambda i: (P[i] - W) @ ha); gd = dijkstra([seed], hand)
    # local peaks: no point within 1.5 cm along the surface is further from the wrist
    peaks = []
    for i in hand:
        if gd.get(i, 0) < 0.08: continue
        near = dijkstra([i], hand); near = [j for j, d in near.items() if d < 0.015]
        if all(gd.get(j, 0) <= gd[i] for j in near): peaks.append(i)
    peaks.sort(key=lambda i: -gd[i]); tips = []
    for i in peaks:
        if all(np.linalg.norm(P[i] - P[j]) > 0.012 for j in tips): tips.append(i)
    print(S, "peaks", len(peaks), "tips", [(round(gd[i], 3), np.round(P[i], 3).tolist()) for i in tips[:8]])
    tips = tips[:5]
    # thumb: the tip whose surface path to the wrist is shortest; the others in order across the hand from it
    tips.sort(key=lambda i: gd[i]); th = tips[0]; fz = tips[1:]
    lat = (P[th] - W) - ((P[th] - W) @ ha) * ha; lat /= np.linalg.norm(lat)
    fz.sort(key=lambda i: -((P[i] - W) @ lat))
    for nm, ti in zip(["thumb", "index", "middle", "ring", "pinky"], [th] + fz):
        g2 = dijkstra([ti], hand); line = []
        for dd in np.arange(0.004, 0.14, 0.004):
            ring = [i for i, d in g2.items() if abs(d - dd) < 0.0025]
            if len(ring) < 3: continue
            q = P[ring]; c = q.mean(0); line.append((round(float(dd), 3), c.tolist(), round(float(np.sqrt(((q - c) ** 2).sum(1).mean())), 4)))
        J["finger." + nm + "." + S] = {"tip": P[ti].tolist(), "line": line, "surf": round(gd[ti], 4)}
        print(S, nm, "tip", np.round(P[ti], 3), "surface to wrist", round(gd[ti], 3), "spread", [l[2] for l in line][:28:2])
json.dump(J, open(RIGDIR + "/joints.json", "w"), indent=1); print("wrote joints.json")
workbench(xray=0.5)
skin = mat("skin", (0.85, 0.68, 0.58)); me.materials.clear(); me.materials.append(skin)
for k, v in J.items():
    if k.startswith(("shoulder", "elbow", "wrist")): mark(v, 0.012, (1, 0.1, 0.1))
    elif k.startswith("finger"):
        col = {"thumb": (1, 0.5, 0), "index": (0.1, 0.4, 1), "middle": (0.1, 0.9, 0.2), "ring": (0.8, 0.1, 0.9), "pinky": (1, 1, 0.1)}[k.split(".")[1]]
        for i, l in enumerate(v["line"]):
            if i % 2 == 0: mark(l[1], 0.0022, col)
        mark(v["tip"], 0.0035, col)
shot("j_front", (0, 0, 1.15), (0, -2.6, 1.15)); shot("j_side", (0.3, 0, 1.15), (2.6, 0, 1.15))
for S in "LR":
    W = Vector(J["wrist." + S]); T = Vector(J["finger.middle." + S]["tip"]); c = (W + T) / 2; s = 1 if S == "L" else -1
    shot("j_hand_out_" + S, c, c + Vector((0.36 * s, 0, 0)), 85); shot("j_hand_front_" + S, c, c + Vector((0, -0.36, 0)), 85); shot("j_hand_in_" + S, c, c + Vector((-0.3 * s, 0.0, 0.05)), 85)
