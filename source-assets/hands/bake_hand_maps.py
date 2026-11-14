# FishDock: skin detail for your hands in first person, baked from the rig itself (no outside textures)
# The hands were one flat colour: no knuckle creases, no nails. This draws them into the hands' own uv tile of
# public/models/fp_rig.glb (both hands share its layout, one tile each), from where each texel lies on the hand at
# rest: which finger it's on and how far along it, and whether it faces the back of the hand or the palm. Three maps,
# 1024 x 1024: a colour multiplier (neutral 0.85, so creases can darken and nails lighten), a normal map (the creases'
# grooves and the nails' edges) and a roughness map (nails glossier than skin). fpRig.js lays them over the skin, the
# skin's own colour still the player's choice.
#   python3 bake_hand_maps.py <fp_rig.glb> <out dir>
import sys, math
import numpy as np
from PIL import Image
from glbmesh import load

S = 1024
NEUTRAL = 0.85

def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def main(glb, out):
    d = load(glb, "female")
    names, inv = d["names"], np.linalg.inv(d["ibm"])
    P, N, UV, J, W, F = d["POSITION"], d["NORMAL"], d["TEXCOORD_0"], d["JOINTS_0"].astype(int), d["WEIGHTS_0"], d["idx"]
    side = "R"
    hand_bones = [i for i, n in enumerate(names) if n.endswith("." + side) and any(k in n for k in ("hand", "f_", "thumb", "palm"))]
    hw = np.zeros(len(P))
    for k in range(4): hw += np.where(np.isin(J[:, k], hand_bones), W[:, k], 0)
    tile = np.floor(UV)
    # the right hand's faces (its tile: u 2..3, v 0..1); the left hand's tile has the same layout
    fsel = [f for f in F if all(hw[v] > 0.5 and tile[v, 0] == 2 and tile[v, 1] == 0 for v in f)]
    print("faces", len(fsel))

    # ---- each texel: where it is on the hand at rest (position, normal), by rasterising the faces in uv space ----
    Pt = np.zeros((S, S, 3)); Nt = np.zeros((S, S, 3)); M = np.zeros((S, S), bool)
    uvp = (UV - tile) * S - 0.5  # (texel centres at integer coordinates; glTF's v runs down the image)
    for f in fsel:
        a, b, c = uvp[f[0]], uvp[f[1]], uvp[f[2]]
        x0, x1 = int(max(0, math.floor(min(a[0], b[0], c[0])))), int(min(S - 1, math.ceil(max(a[0], b[0], c[0]))))
        y0, y1 = int(max(0, math.floor(min(a[1], b[1], c[1])))), int(min(S - 1, math.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12: continue
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        l2 = 1 - l0 - l1
        inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
        if not inside.any(): continue
        L = np.stack([l0, l1, l2], -1)[inside]
        p = L @ P[f]; n = L @ N[f]
        Pt[ys[inside], xs[inside]] = p; Nt[ys[inside], xs[inside]] = n; M[ys[inside], xs[inside]] = True
    Nt /= np.linalg.norm(Nt, axis=-1, keepdims=True) + 1e-9
    print("texels on the hand", M.sum())
    # metres per texel (for the normal map's slopes): the hand's area against its area in the tile
    area3 = sum(np.linalg.norm(np.cross(P[f[1]] - P[f[0]], P[f[2]] - P[f[0]])) / 2 for f in fsel)
    cr2 = lambda u, v: u[0] * v[1] - u[1] * v[0]
    areaT = sum(abs(cr2(uvp[f[1]] - uvp[f[0]], uvp[f[2]] - uvp[f[0]])) / 2 for f in fsel)
    mpt = math.sqrt(area3 / areaT); print("mm per texel", round(mpt * 1000, 3))

    # ---- the fingers: joints at rest, from each bone's head; the back of the hand is each bone's -Z ----
    def bone(n): return inv[names.index(n)]
    chains = []
    for fn in ("index", "middle", "ring", "pinky", "thumb"):
        pre = f"DEF-f_{fn}" if fn != "thumb" else "DEF-thumb"
        B = [bone(f"{pre}.0{k}.{side}") for k in (1, 2, 3)]
        heads = [b[:3, 3] for b in B]
        l3 = np.linalg.norm(heads[2] - heads[1]) * (0.95 if fn != "thumb" else 1.0)
        tip = heads[2] + B[2][:3, 1] * l3
        pts = np.array(heads + [tip]); dors = [-b[:3, 2] for b in B]; lat = [b[:3, 0] for b in B]
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        # finger thickness: verts mostly on the middle bone, their distance from its axis
        bi = names.index(f"{pre}.02.{side}"); dom = J[np.arange(len(P)), W.argmax(1)] == bi
        rel = P[dom] - pts[1]; ax = B[1][:3, 1]; r = float(np.median(np.linalg.norm(rel - np.outer(rel @ ax, ax), axis=1)))
        chains.append(dict(name=fn, pts=pts, seg=seg, cum=np.concatenate([[0], np.cumsum(seg)]), dors=dors, lat=lat, r=r))
        print(fn, "segments mm", (seg * 1000).round(1), "radius mm", round(r * 1000, 1))

    idx = np.where(M); p = Pt[idx]; n = Nt[idx]; K = len(p)
    best = np.full(K, 1e9); s_ = np.zeros(K); ci = np.full(K, -1); dorsv = np.zeros(K); latv = np.zeros(K); segi = np.zeros(K, int)
    for c_i, ch in enumerate(chains):
        for k in range(3):
            a, b = ch["pts"][k], ch["pts"][k + 1]; ab = b - a; L2 = ab @ ab
            t = np.clip(((p - a) @ ab) / L2, -0.25 if k == 0 else 0, 1.0 if k < 2 else 1.15)
            q = a + np.outer(t, ab); dist = np.linalg.norm(p - q, axis=1)
            take = dist < best
            best[take] = dist[take]; s_[take] = ch["cum"][k] + t[take] * ch["seg"][k]; ci[take] = c_i; segi[take] = k
            dorsv[take] = n[take] @ ch["dors"][k]
            latv[take] = ((p[take] - q[take]) @ ch["lat"][k]) / ch["r"]
    on = best < np.array([ch["r"] for ch in chains])[ci] * 1.9  # (on a finger, not the palm)

    H = np.zeros(K); A = np.ones((K, 3)); R = np.full(K, 0.56)
    mm = 0.001
    def line(s, at, w): return np.exp(-0.5 * ((s - at) / w) ** 2)
    for c_i, ch in enumerate(chains):
        sel = on & (ci == c_i); s = s_[sel]; dv = dorsv[sel]; lv = latv[sel]
        back, palm = smooth(0.05, 0.45, dv), smooth(0.0, 0.4, -dv)
        thumb = ch["name"] == "thumb"
        j1, j2, tip = ch["cum"][1], ch["cum"][2], ch["cum"][3]
        h = np.zeros(len(s)); a = np.ones((len(s), 3)); rough = np.full(len(s), 0.56)
        curve = 0.9 * mm * lv ** 2  # (creases curve round the finger, towards the tip at its sides)
        # the back of each joint: a cluster of fine wrinkles, the skin there a little darker and redder
        for jat, n_l, spread, depth in ((j1, 4, 1.25, 0.22), (j2, 3, 0.95, 0.16)):
            if thumb and jat == j1: n_l, spread = 4, 1.4
            zone = back * line(s, jat, 4.5 * mm * spread)
            a *= 1 - zone[:, None] * np.array([0.05, 0.085, 0.09])
            for k in range(n_l):
                off = (k - (n_l - 1) / 2) * spread * mm * 1.6
                ln = back * line(s - curve, jat + off, 0.32 * mm) * (1 - 0.18 * abs(k - (n_l - 1) / 2))
                h -= depth * mm * ln; a *= 1 - 0.13 * ln[:, None]
        # the knuckle at the base of each finger: a little redder, raised
        if not thumb:
            kz = back * line(s, 0.0, 6 * mm); a *= 1 - kz[:, None] * np.array([0.02, 0.07, 0.075]); h += 0.25 * mm * kz
        # the palm side: one firm crease at each joint, and the one where the finger meets the palm
        for jat, depth in ((j1 + 1.0 * mm, 0.4), (j2 + 0.6 * mm, 0.3), (-2.5 * mm if not thumb else j1 + 1 * mm, 0.35)):
            ln = palm * line(s + 0.5 * curve, jat, 0.45 * mm)
            h -= depth * mm * ln; a *= 1 - 0.2 * ln[:, None]
        # the fingertip's pad: a little redder
        pad = palm * smooth(j2 + 0.4 * (tip - j2), tip, s); a *= 1 - pad[:, None] * np.array([0.0, 0.06, 0.07])
        # the nail: on the back of the last bone, from a little past the joint to just beyond the tip
        q = (s - j2) / (tip - j2)
        across = 1 - smooth(0.5, 0.66, np.abs(lv))
        along = smooth(0.30, 0.36, q + 0.06 * lv ** 2) * (1 - smooth(1.02, 1.07, q))
        nail = smooth(0.25, 0.55, dv) * across * along
        a = a * (1 - nail[:, None]) + nail[:, None] * np.array([1.07, 0.98, 0.98])
        lun = nail * (1 - smooth(0.38, 0.45, q)) * (1 - smooth(0.2, 0.35, np.abs(lv))); a += lun[:, None] * np.array([0.05, 0.06, 0.06])
        free = nail * smooth(0.93, 0.99, q); a = a * (1 - free[:, None]) + free[:, None] * np.array([1.14, 1.12, 1.06])
        rim = smooth(0.25, 0.55, dv) * np.clip(along * (1 - across) * 4 * across + (smooth(0.27, 0.31, q) - smooth(0.31, 0.36, q)) * across, 0, 1)
        a *= 1 - 0.18 * rim[:, None]; h += 0.12 * mm * nail - 0.18 * mm * rim
        rough = rough * (1 - nail) + 0.26 * nail
        H[sel] += h; A[sel] *= a; R[sel] = np.minimum(R[sel], rough)
    # the palm's own creases and the veins on the back of the hand, in the hand's own frame: a from the wrist (0) to the
    # line of the knuckles (1), b across from the index finger's side (0) to the little finger's (1)
    wrist = bone(f"DEF-hand.{side}")[:3, 3]
    mi, mp = chains[0]["pts"][0], chains[3]["pts"][0]; mcp = (mi + mp) / 2
    ua, lenA = (mcp - wrist) / np.linalg.norm(mcp - wrist), np.linalg.norm(mcp - wrist)
    wb = mp - mi; lenB = np.linalg.norm(wb); wb = wb / lenB
    pa = ((p - wrist) @ ua) / lenA; pb = ((p - mi) @ wb) / lenB
    handN = np.cross(ua, wb); handN /= np.linalg.norm(handN)
    if handN @ chains[1]["dors"][0] < 0: handN = -handN  # (pointing out of the back of the hand)
    facing = n @ handN
    palmS, backS = (~on) * smooth(0.15, 0.5, -facing), (~on) * smooth(0.15, 0.5, facing)
    def pdist(poly):  # (distance in metres from each texel to a line drawn in the hand's frame)
        P2 = np.array(poly, float); best_d = np.full(K, 1e9)
        for i in range(len(P2) - 1):
            a0, a1 = P2[i], P2[i + 1]; d = a1 - a0; dm = np.array([d[0] * lenA, d[1] * lenB])
            rel = np.stack([(pa - a0[0]) * lenA, (pb - a0[1]) * lenB], 1); t = np.clip((rel @ dm) / (dm @ dm), 0, 1)
            best_d = np.minimum(best_d, np.linalg.norm(rel - np.outer(t, dm), axis=1))
        return best_d
    for poly, depth, wdt in (
        ([(0.80, 1.02), (0.79, 0.75), (0.83, 0.5), (0.9, 0.3), (0.95, 0.22)], 0.38, 0.55),  # (across under the fingers, from the little finger's side)
        ([(0.74, -0.02), (0.69, 0.25), (0.63, 0.55), (0.6, 0.78)], 0.38, 0.55),  # (across the middle, from the index finger's side)
        ([(0.73, 0.02), (0.55, 0.06), (0.35, 0.12), (0.18, 0.2), (0.04, 0.28)], 0.42, 0.6),  # (round the ball of the thumb)
        ([(0.0, 0.1), (0.0, 0.5), (0.02, 0.9)], 0.3, 0.5), ([(-0.06, 0.15), (-0.05, 0.85)], 0.25, 0.45),  # (the wrist)
    ):
        ln = palmS * np.exp(-0.5 * (pdist(poly) / (wdt * mm)) ** 2)
        H -= depth * mm * ln; A *= 1 - 0.16 * ln[:, None]
    # a few faint veins fanning out over the back of the hand from the wrist, a little bluer, standing a touch proud
    for poly in ([(0.02, 0.35), (0.2, 0.33), (0.35, 0.3), (0.52, 0.27), (0.7, 0.22)], [(0.02, 0.5), (0.2, 0.49), (0.4, 0.5), (0.56, 0.53), (0.72, 0.58)], [(0.05, 0.62), (0.25, 0.68), (0.45, 0.75), (0.6, 0.81), (0.75, 0.88)]):
        ln = backS * np.exp(-0.5 * (pdist([(a0, b0 + 0.025 * math.sin(a0 * 17 + b0 * 5)) for a0, b0 in poly]) / (1.3 * mm)) ** 2) * (0.5 + 0.5 * smooth(0.0, 0.3, pa)) * (1 - smooth(0.6, 0.8, pa))
        H += 0.14 * mm * ln; A *= 1 - ln[:, None] * np.array([0.035, 0.022, 0.0])
    # a very fine skin grain everywhere, so the light never reads as plastic
    rng = np.random.default_rng(7); grain = rng.normal(0, 1, K)
    H += 0.015 * mm * grain

    # ---- into the maps ----
    alb = np.full((S, S, 3), NEUTRAL); alb[idx] = np.clip(NEUTRAL * A, 0, 1)
    hgt = np.zeros((S, S)); hgt[idx] = H
    rgh = np.full((S, S), 0.56); rgh[idx] = R
    # (spread a few texels past each island's edge, so filtering never brings in the neutral background)
    for arr in (alb, hgt, rgh):
        m = M.copy()
        for _ in range(4):
            src = arr.copy(); grow = np.zeros_like(m)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(np.roll(m, dy, 0), dx, 1); val = np.roll(np.roll(src, dy, 0), dx, 1)
                put = sh & ~m & ~grow; arr[put] = val[put]; grow |= put
            m |= grow
    gy, gx = np.gradient(hgt, mpt)  # (slopes: rows run down v, columns along u)
    nrm = np.stack([-gx, -gy, np.ones_like(hgt)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    Image.fromarray((alb * 255 + 0.5).astype(np.uint8), "RGB").save(f"{out}/hand_colour.webp", quality=92, method=6)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB").save(f"{out}/hand_normal.webp", quality=95, method=6)
    rg = np.zeros((S, S, 3)); rg[..., 1] = rgh; rg[..., 0] = rgh; rg[..., 2] = rgh
    Image.fromarray((rg * 255 + 0.5).astype(np.uint8), "RGB").save(f"{out}/hand_rough.webp", quality=92, method=6)
    print("written", out)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
