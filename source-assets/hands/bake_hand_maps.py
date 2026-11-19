# FishDock: the skin of your hands in first person, painted from the rig itself (no outside textures)
# Drawn into the hands' own uv tile of public/models/fp_rig.glb (both hands share its layout, one tile each), from where
# each texel lies on the hand at rest: which finger it's on and how far along it, whether it faces the back of the hand
# or the palm. Three maps, 2048 x 2048 (a fifth of a millimetre a texel): a colour multiplier (neutral 0.85, so skin can
# be darker or lighter than the player's chosen colour), a normal map and a roughness map. fpRig.js lays them over the
# skin as they are.
# The second painter (19 November 2026). The first drew each crease as one dark line and each nail as a pink square,
# and the game then doubled their strength: black scratches across the knuckles and palm in the footage from Aaron's
# PC. Here a joint's skin is a field of fine wrinkles a millimetre apart that darken a little in their grooves; nails
# have a nail's outline (a curved cuticle, a rounded tip, a pale free edge, a faint lunula, a fold of skin round them)
# and stand proud; the palm, the pads and the knuckles are pinker than the back of the hand; veins and tendons are
# soft swells, not lines; and all of it carries skin's own net of tiny creases.
#   python3 bake_hand_maps.py <fp_rig.glb> <out dir>
import sys, math
import numpy as np
from PIL import Image
from glbmesh import load

S = 2048
NEUTRAL = 0.85
RELIEF = 2.0  # (the relief drawn this much deeper than life: true to life it is lost at the size a phone shows your hands)

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

    # (which way is the back of each finger: from the hand itself, not the bones' own roll. The rig's finger bones are
    # rolled to make their hinges true, up to a quarter turn from the finger's back: taken from them, each nail was
    # painted round the side of its finger and cut off at an angle. The four fingers lie in the plane of the hand at
    # rest, so its back is theirs; the thumb, turned out of that plane, keeps its bone's)
    wrist0 = inv[names.index(f"DEF-hand.{side}")][:3, 3]; mi0, mp0 = chains[0]["pts"][0], chains[3]["pts"][0]
    ua0 = (mi0 + mp0) / 2 - wrist0; hN = np.cross(ua0, mp0 - mi0); hN /= np.linalg.norm(hN)
    if hN @ sum(chains[1]["dors"]) < 0: hN = -hN
    for ch in chains[:4]:
        for k in range(3):
            ax = ch["pts"][k + 1] - ch["pts"][k]; ax /= np.linalg.norm(ax)
            d = hN - (hN @ ax) * ax; d /= np.linalg.norm(d); l = np.cross(ax, d); l /= np.linalg.norm(l)
            if l @ ch["lat"][k] < 0: l = -l
            ch["dors"][k] = d; ch["lat"][k] = l
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

    H = np.zeros(K); A = np.ones((K, 3)); R = np.full(K, 0.58)
    mm = 0.001
    rng = np.random.default_rng(1911)
    def waves(q, lam, n, along=None, spread=1.0):
        # band-limited noise from where a texel is on the hand (so it never breaks at a seam of the map): n plane waves
        # of wavelength about lam, their directions random, or within spread of along; unit variance
        out = np.zeros(len(q))
        for _ in range(n):
            d = rng.standard_normal(3)
            if along is not None: d = along + spread * d / np.linalg.norm(d)
            d /= np.linalg.norm(d); out += np.cos(q @ d * (2 * np.pi / (lam * rng.uniform(0.75, 1.3))) + rng.uniform(0, 2 * np.pi))
        return out / math.sqrt(n / 2)
    def line(s, at, w): return np.exp(-0.5 * ((s - at) / w) ** 2)
    RED = np.array([0.0, 1.0, 1.1]); PINK = np.array([-0.35, 0.75, 1.0])  # (what a darker, redder patch takes out of green and blue; pink lightens red too)
    backAll = np.zeros(K); palmAll = np.zeros(K); nailAll = np.zeros(K)
    for c_i, ch in enumerate(chains):
        sel = on & (ci == c_i); s = s_[sel]; dv = dorsv[sel]; lv = latv[sel]; q3 = p[sel]
        back, palm = smooth(0.05, 0.45, dv), smooth(0.0, 0.4, -dv)
        thumb = ch["name"] == "thumb"
        j1, j2, tip = ch["cum"][1], ch["cum"][2], ch["cum"][3]
        axis = (ch["pts"][3] - ch["pts"][0]) / np.linalg.norm(ch["pts"][3] - ch["pts"][0])
        h = np.zeros(len(s)); a = np.ones((len(s), 3)); rough = np.full(len(s), 0.58)
        curve = 0.9 * mm * lv ** 2  # (creases curve round the finger, towards the tip at its sides)
        warp = waves(q3, 6 * mm, 6) * 0.22 * mm
        # the back of each joint: an oval of fine wrinkles about a millimetre apart, the skin there a little redder
        for jat, sig, lam, depth in ((j1, 3.6 * (1.15 if thumb else 1), 1.2, 0.2), (j2, 2.5, 1.0, 0.14)):
            zone = back * line(s, jat, sig * mm) * (1 - smooth(0.8, 1.15, np.abs(lv)))
            groove = (0.5 - 0.5 * np.cos((s - jat - curve + warp) * (2 * np.pi / (lam * mm)))) ** 3  # (narrow grooves, broad folds between)
            h -= depth * mm * zone * groove; a *= 1 - (zone * groove)[:, None] * (0.09 + 0.1 * RED) - zone[:, None] * 0.06 * RED
            h += 0.22 * mm * zone  # (the joint stands a little proud)
        # the knuckle at the base of each finger: redder, raised, loosely wrinkled
        if not thumb:
            kz = back * line(s, 0.0, 6.5 * mm) * (1 - smooth(0.9, 1.5, np.abs(lv)))
            kw = (0.5 - 0.5 * np.cos((s + warp * 2) * (2 * np.pi / (1.7 * mm)))) ** 2
            a *= 1 - kz[:, None] * 0.085 * RED - (kz * kw)[:, None] * 0.05; h += 0.3 * mm * kz - 0.09 * mm * kz * kw
        # the palm side: two close creases at each joint, soft and a little red-brown, not drawn lines
        for jat, depth in ((j1 + 1.0 * mm, 0.2), (j1 - 0.6 * mm, 0.1), (j2 + 0.6 * mm, 0.16), (-2.5 * mm if not thumb else j1 + 1 * mm, 0.18), (-0.6 * mm if not thumb else j1 + 2.4 * mm, 0.08)):
            ln = palm * line(s + 0.5 * curve + 0.5 * warp, jat, 0.5 * mm)
            h -= depth * mm * ln; a *= 1 - ln[:, None] * depth * (0.18 + 0.2 * RED)
        # the palm side of a finger is lighter and pinker than its back, the pad of the fingertip pinker still
        a *= 1 + palm[:, None] * np.array([0.04, 0.0, -0.01])
        pad = palm * smooth(j2 + 0.3 * (tip - j2), tip, s); a *= 1 - pad[:, None] * 0.07 * RED
        tipz = back * smooth(j2 + 0.55 * (tip - j2), tip, s); a *= 1 - tipz[:, None] * 0.03 * RED  # (and the fingertip a touch redder on its back too)
        # ---- the nail: on the back of the last bone ----
        q = (s - j2) / (tip - j2)
        wq = 0.56 + 0.1 * smooth(0.35, 0.7, q); u = lv / wq  # (the nail's half width, of the finger's: narrower at the cuticle)
        def plate(grow):
            qb = 0.36 - grow + 0.1 * u ** 2; qt = 1.035 + grow - 0.11 * u ** 2  # (the cuticle's curve and the rounded tip)
            return smooth(0.05, 0.3, dv) * smooth(0, 0.1, 1 + grow * 2.5 - np.abs(u)) * smooth(qb - 0.02, qb + 0.02, q) * (1 - smooth(qt - 0.02, qt + 0.015, q))
        nail = plate(0.0); fold = plate(0.07) * (1 - nail)
        bed = np.array([1.1, 0.935, 0.925])  # (the nail bed through the nail: lighter and pinker than the skin beside it)
        free = nail * smooth(0.9 - 0.09 * u ** 2, 0.95 - 0.09 * u ** 2, q)  # (the free edge, pale)
        lun = nail * (1 - smooth(0.44, 0.54, q + 0.16 * u ** 2)) * 0.55
        col = bed[None, :] * (1 - free[:, None]) + free[:, None] * np.array([1.17, 1.15, 1.09]); col = col * (1 - lun[:, None]) + lun[:, None] * np.array([1.12, 1.06, 1.04])
        a = a * (1 - nail[:, None]) + nail[:, None] * col
        a *= 1 - fold[:, None] * (0.09 + 0.1 * RED)  # (the fold of skin round the nail, redder)
        h = h * (1 - nail) + nail * (0.3 * mm - 0.06 * mm * u ** 2 + 0.004 * mm * np.cos(lv * 46)) - 0.2 * mm * fold  # (the plate proud of its groove, faintly ridged along)
        rough = rough * (1 - nail) + 0.14 * nail
        H[sel] += h; A[sel] *= a; R[sel] = np.minimum(R[sel], rough)
        backAll[sel] = back * (1 - nail); palmAll[sel] = palm; nailAll[sel] = nail
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
    backAll += backS; palmAll += palmS
    def pdist(poly):  # (distance in metres from each texel to a line drawn in the hand's frame)
        P2 = np.array(poly, float); best_d = np.full(K, 1e9)
        for i in range(len(P2) - 1):
            a0, a1 = P2[i], P2[i + 1]; d = a1 - a0; dm = np.array([d[0] * lenA, d[1] * lenB])
            rel = np.stack([(pa - a0[0]) * lenA, (pb - a0[1]) * lenB], 1); t = np.clip((rel @ dm) / (dm @ dm), 0, 1)
            best_d = np.minimum(best_d, np.linalg.norm(rel - np.outer(t, dm), axis=1))
        return best_d
    wob = waves(p, 7 * mm, 6) * 0.5 * mm
    for poly, depth, wdt in (
        ([(0.80, 1.02), (0.79, 0.75), (0.83, 0.5), (0.9, 0.3), (0.95, 0.22)], 0.24, 0.7),  # (across under the fingers, from the little finger's side)
        ([(0.74, -0.02), (0.69, 0.25), (0.63, 0.55), (0.6, 0.78)], 0.24, 0.7),  # (across the middle, from the index finger's side)
        # (round the ball of the thumb, stopping short of the wrist: carried on to it, its end was cut off at the edge of
        # the wrist's own small patch of the map and showed as a dark blot. No wrist creases, for the same reason)
        ([(0.73, 0.02), (0.55, 0.06), (0.35, 0.12), (0.18, 0.2)], 0.26, 0.75),
    ):
        ln = palmS * np.exp(-0.5 * ((pdist(poly) + wob) / (wdt * mm)) ** 2)
        H -= depth * mm * ln; A *= 1 - ln[:, None] * (0.05 + 0.06 * RED)
    # the palm: lighter and pinker than the back of the hand, mottled red and pale as blood shows through it
    pm = waves(p, 9 * mm, 10)
    A *= 1 + palmAll[:, None] * (np.array([0.05, 0.0, -0.012]) + pm[:, None] * np.array([0.012, -0.022, -0.024]))
    A *= 1 - backS[:, None] * np.array([0.02, 0.035, 0.05])  # (the back of the hand sees the sun: a little browner than the palm)
    # the back of the hand: tendons from each knuckle to the wrist and veins between them, soft swells in the light
    for bk in (0.03, 0.36, 0.68, 0.99):
        ln = backS * np.exp(-0.5 * (pdist([(0.95, bk), (0.5, 0.5 + (bk - 0.5) * 0.62), (0.08, 0.5 + (bk - 0.5) * 0.3)]) / (2.4 * mm)) ** 2) * smooth(0.05, 0.3, pa) * (1 - smooth(0.82, 1.0, pa))
        H += 0.3 * mm * ln
    for poly in ([(0.02, 0.35), (0.2, 0.33), (0.35, 0.3), (0.52, 0.27), (0.7, 0.22)], [(0.02, 0.5), (0.2, 0.49), (0.4, 0.5), (0.56, 0.53), (0.72, 0.58)], [(0.05, 0.62), (0.25, 0.68), (0.45, 0.75), (0.6, 0.81), (0.75, 0.88)], [(0.4, 0.5), (0.5, 0.42), (0.6, 0.4), (0.74, 0.42)]):
        ln = backS * np.exp(-0.5 * (pdist([(a0, b0 + 0.03 * math.sin(a0 * 17 + b0 * 5)) for a0, b0 in poly]) / (1.5 * mm)) ** 2) * (0.5 + 0.5 * smooth(0.0, 0.3, pa)) * (1 - smooth(0.6, 0.8, pa))
        H += 0.2 * mm * ln; A *= 1 - ln[:, None] * np.array([0.045, 0.02, -0.008])
    # ---- skin everywhere: uneven colour, and its net of tiny creases (deeper and more open on the back of the hand) ----
    skin = 1 - nailAll
    blot = waves(p, 28 * mm, 10); mott = waves(p, 3.5 * mm, 22)
    A *= 1 + skin[:, None] * (blot[:, None] * np.array([0.014, -0.02, -0.028]) + mott[:, None] * np.array([0.012, -0.015, -0.018]))
    for lam, amp, n_w in ((1.0, 0.045, 28), (0.55, 0.02, 34)):
        w = waves(p, lam * mm, n_w); net = np.exp(-(w / 0.3) ** 2)  # (creases where the noise crosses zero)
        H -= amp * mm * net * skin * (0.45 + 0.75 * backAll); A *= 1 - (net * skin * (0.2 + 0.8 * backAll))[:, None] * (0.02 + 0.02 * RED)
    R += skin * (0.03 * backAll - 0.04 * palmAll + 0.03 * waves(p, 6 * mm, 12))
    # (a few freckles on the back of the hand)
    for _ in range(9):
        c = p[rng.integers(0, K)]; f = np.exp(-0.5 * (np.linalg.norm(p - c, axis=1) / (rng.uniform(0.5, 1.0) * mm)) ** 2) * backAll
        A *= 1 - f[:, None] * np.array([0.06, 0.09, 0.11])
    R = np.clip(R, 0.15, 0.8)

    # ---- into the maps ----
    alb = np.full((S, S, 3), NEUTRAL); alb[idx] = np.clip(NEUTRAL * A, 0, 1)
    hgt = np.zeros((S, S)); hgt[idx] = H
    rgh = np.full((S, S), 0.58); rgh[idx] = R
    # (spread a few texels past each island's edge, so filtering never brings in the neutral background)
    for arr in (alb, hgt, rgh):
        m = M.copy()
        for _ in range(8):
            src = arr.copy(); grow = np.zeros_like(m)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(np.roll(m, dy, 0), dx, 1); val = np.roll(np.roll(src, dy, 0), dx, 1)
                put = sh & ~m & ~grow; arr[put] = val[put]; grow |= put
            m |= grow
    hgt = (hgt + np.roll(hgt, 1, 0) + np.roll(hgt, -1, 0) + np.roll(hgt, 1, 1) + np.roll(hgt, -1, 1)) / 5  # (no stair steps from the island's raster)
    gy, gx = np.gradient(hgt * RELIEF, mpt)  # (slopes: rows run down v, columns along u)
    nrm = np.stack([-gx, -gy, np.ones_like(hgt)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    Image.fromarray((alb * 255 + 0.5).astype(np.uint8), "RGB").save(f"{out}/hand_colour.webp", quality=90, method=6)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB").save(f"{out}/hand_normal.webp", quality=88, method=6)
    rg = np.zeros((S, S, 3)); rg[..., 1] = rgh; rg[..., 0] = rgh; rg[..., 2] = rgh
    Image.fromarray((rg * 255 + 0.5).astype(np.uint8), "RGB").resize((1024, 1024), Image.LANCZOS).save(f"{out}/hand_rough.webp", quality=88, method=6)
    print("written", out)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
