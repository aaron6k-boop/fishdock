"""Fit the Godot XR Tools hands (CC0, github.com/GodotVR/godot-xr-tools, addons/godot-xr-tools/hands) onto the
first-person arms' own skeleton, and write a new fp_body.glb with those hands as its skin.

  python3 -I retarget_fp_hands.py <old fp_body.glb> <godot hands dir> <out.glb>

The bones, their rest places and the sleeve are untouched, so every grip made for the old hand still drives the new one.
Each Godot finger bone is laid along the matching bone of ours (turned, and stretched along its length to fit), and each
point of the Godot mesh follows its bones as it did in Godot. The wrist end is drawn out up the forearm, into the cuff.
"""
import sys, json, struct, base64, io
import numpy as np
from PIL import Image, ImageFilter

OLD, GDIR, OUT = sys.argv[1:4]
CT = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_glb(p):
    f = open(p, 'rb').read(); n = struct.unpack('<I', f[12:16])[0]; g = json.loads(f[20:20 + n]); o = 20 + n
    bl = struct.unpack('<I', f[o:o + 4])[0]; return g, f[o + 8:o + 8 + bl]
def read_gltf(p):
    g = json.load(open(p)); u = g['buffers'][0]['uri']; return g, base64.b64decode(u.split(',', 1)[1])
def acc(g, b, i):
    a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]; off = v.get('byteOffset', 0) + a.get('byteOffset', 0); n = NC[a['type']]
    dt = np.dtype('<' + CT[a['componentType']]); st = v.get('byteStride') or dt.itemsize * n
    raw = np.frombuffer(b, dtype=np.uint8, count=st * (a['count'] - 1) + dt.itemsize * n, offset=off)
    out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(st, 1)).copy().view(dt).reshape(a['count'], n)
    if a.get('normalized'): out = out.astype(np.float64) / np.iinfo(dt).max
    return out

og, ob = read_glb(OLD)
names = [og['nodes'][j]['name'] for j in og['skins'][0]['joints']]; J = {n: i for i, n in enumerate(names)}
ibm = acc(og, ob, og['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
head = {n: np.linalg.inv(ibm[i])[:3, 3] for n, i in J.items()}
op = og['meshes'][0]['primitives'][0]; oP = acc(og, ob, op['attributes']['POSITION']).astype(np.float64)
oJ = acc(og, ob, op['attributes']['JOINTS_0']); oW = acc(og, ob, op['attributes']['WEIGHTS_0']).astype(np.float64); oUV = acc(og, ob, op['attributes']['TEXCOORD_0'])
def tip_of(b):  # the old fingertip: the far end of the old skin that bone 03 carries
    w = (oW * (oJ == J[b])).sum(1); m = w > 0.6; d = np.linalg.norm(oP[m] - head[b], axis=1); return oP[m][d >= np.quantile(d, 0.97)].mean(0)

def umeyama(X, Y):
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my; U, S, Vt = np.linalg.svd(Yc.T @ Xc / len(X)); D = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0: D[2, 2] = -1
    R = U @ D @ Vt; s = np.trace(np.diag(S) @ D) / ((Xc ** 2).sum() / len(X)); return s, R, my - s * R @ mx
def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)

PATCH = np.array([0.03, 0.97], dtype=np.float32); heel = []; WRIST_W, WRIST_T = 0.8, 0.68
FING = [('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Little', 'pinky')]
def hand(side):
    S, s = side.upper(), side
    g, b = read_gltf(f'{GDIR}/model/Hand_Nails_{S}.gltf'); p = g['meshes'][0]['primitives'][0]
    P = acc(g, b, p['attributes']['POSITION']).astype(np.float64); N = acc(g, b, p['attributes']['NORMAL']).astype(np.float64); UV = acc(g, b, p['attributes']['TEXCOORD_0']).astype(np.float32)
    Jn = acc(g, b, p['attributes']['JOINTS_0']); Wt = acc(g, b, p['attributes']['WEIGHTS_0']).astype(np.float64); I = acc(g, b, p['indices']).reshape(-1).astype(np.uint32)
    gn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]; gi = acc(g, b, g['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    # the mesh node may carry its own transform; fold bind-space to one space through the joints' rest
    o = {n: np.linalg.inv(gi[k])[:3, 3] for k, n in enumerate(gn)}
    X = np.array([o[f'Wrist_{S}']] + [o[f'{a}_Proximal_{S}'] for a, _ in FING] + [o[f'Thumb_Metacarpal_{S}'], o[f'Thumb_Proximal_{S}']])
    Y = np.array([head[f'hand_{s}']] + [head[f'{c}_01_{s}'] for _, c in FING] + [head[f'thumb_01_{s}'], head[f'thumb_02_{s}']])
    sc, RA, tA = umeyama(X, Y); AL = sc * RA
    # (then the palm stretched in its own plane, so the four knuckles land on ours: the two hands are not the same shape)
    h0 = Y[0]; e1 = Y[2] - h0; e1 /= np.linalg.norm(e1); nn = np.cross(Y[1] - h0, Y[4] - h0); nn /= np.linalg.norm(nn); e2 = np.cross(nn, e1); Q = np.stack([e1, e2, nn], 1)
    xs = ((X[:5] @ AL.T + tA) - h0) @ Q; ys = (Y[:5] - h0) @ Q; M = np.c_[xs[:, :2], np.ones(5)]; sol = np.linalg.lstsq(M, ys[:, :2], rcond=None)[0]
    B = np.eye(3); B[:2, :2] = sol[:2].T; t2 = np.array([sol[2, 0], sol[2, 1], 0.0]); L2 = Q @ B @ Q.T; tA = L2 @ (tA - h0) + h0 + Q @ t2; AL = L2 @ AL
    res = np.linalg.norm((X @ AL.T + tA) - Y, axis=1)
    print(side, 'scale', round(sc, 3), 'landmark misfit mm', np.round(res * 1000, 1))
    # per Godot joint: (linear part, offset) taking Godot bind space to ours, and the bone of ours it becomes
    T = {}; own = {}
    for n in gn: T[n] = (AL, tA); own[n] = f'hand_{s}'
    def chain(gj, ours, tip):
        for k in range(3):
            a, c = o[gj[k]], o[gj[k + 1]]; hb = head[ours[k]]; tb = head[ours[k + 1]] if k < 2 else tip
            dg = AL @ (c - a); lg = np.linalg.norm(dg); dgn = dg / lg; db = tb - hb; lb = np.linalg.norm(db)
            L = rot_to(dgn, db) @ (np.eye(3) + (lb / lg - 1) * np.outer(dgn, dgn)) @ AL; T[gj[k]] = (L, hb - L @ a); own[gj[k]] = ours[k]
        T[gj[3]] = T[gj[2]]; own[gj[3]] = ours[2]
    for a, c in FING: chain([f'{a}_Proximal_{S}', f'{a}_Intermediate_{S}', f'{a}_Distal_{S}', f'{a}_Tip_{S}'], [f'{c}_0{k}_{s}' for k in (1, 2, 3)], tip_of(f'{c}_03_{s}'))
    chain([f'Thumb_Metacarpal_{S}', f'Thumb_Proximal_{S}', f'Thumb_Distal_{S}', f'Thumb_Tip_{S}'], [f'thumb_0{k}_{s}' for k in (1, 2, 3)], tip_of(f'thumb_03_{s}'))
    P2 = np.zeros_like(P); N2 = np.zeros_like(N); W2 = np.zeros((len(P), len(names)))
    for k in range(4):
        for j in np.unique(Jn[:, k]):
            m = (Jn[:, k] == j) & (Wt[:, k] > 0); L, t = T[gn[j]]; w = Wt[m, k][:, None]
            P2[m] += w * (P[m] @ L.T + t); N2[m] += w * (N[m] @ np.linalg.inv(L)); W2[m, J[own[gn[j]]]] += Wt[m, k]
    N2 /= np.linalg.norm(N2, axis=1, keepdims=True) + 1e-12
    # (the heel of Godot's hand is a good deal broader and deeper than the arm it has to meet: drawn in towards the wrist,
    # fully at the wrist and not at all by 5 cm into the palm)
    x_ = (P2 - h0) @ e1; k_ = np.clip(1 - x_ / 0.05, 0, 1); k_ = k_ * k_ * (3 - 2 * k_); ya = (P2 - h0) @ e2; yn = (P2 - h0) @ nn
    P2 = P2 - np.outer(ya * k_ * (1 - WRIST_W), e2) - np.outer(yn * k_ * (1 - WRIST_T), nn)
    # the wrist: Godot's hand ends in a flat cap just above the wrist. The cap is taken off and the open edge carried up
    # the forearm in rings that narrow to the old forearm's own width, handed over to the forearm's twist bone on the way,
    # so the arm runs up into the cuff
    hh = head[f'hand_{s}']; u = head[f'lowerarm_{s}'] - hh; u /= np.linalg.norm(u); d = (P2 - hh) @ u
    tri = I.reshape(-1, 3); fn = np.cross(P2[tri[:, 1]] - P2[tri[:, 0]], P2[tri[:, 2]] - P2[tri[:, 0]]); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    # (Godot's hand is closed above the wrist by a nearly flat cap of a few large triangles, found in its own space)
    ugo = o[f'Wrist_{S}'] - o[f'Middle_Proximal_{S}']; ugo /= np.linalg.norm(ugo); dgo = P @ ugo; gfn = np.cross(P[tri[:, 1]] - P[tri[:, 0]], P[tri[:, 2]] - P[tri[:, 0]]); gfn /= np.linalg.norm(gfn, axis=1, keepdims=True) + 1e-12
    cap = (gfn @ ugo > 0.9) & (dgo[tri].mean(1) > dgo.max() - 0.015); key = {i: tuple(np.round(P2[i] * 1e5).astype(int)) for i in np.unique(tri)}; gone = set()
    for a_, b_, c_ in tri[cap]:
        for x, y in ((a_, b_), (b_, c_), (c_, a_)): gone.add(frozenset((key[x], key[y])))
    tri = tri[~cap]; bd = []
    for a_, b_, c_ in tri:  # (the open edge: the kept triangles' sides that a cap triangle shared)
        for x, y in ((a_, b_), (b_, c_), (c_, a_)):
            if frozenset((key[x], key[y])) in gone: bd.append((x, y))
    print(side, 'cap triangles removed', int(cap.sum()), 'open edge', len(bd), 'edges')
    lp = np.unique([i for e in bd for i in e]); c0 = P2[lp].mean(0); r0 = np.linalg.norm((P2[lp] - c0) - np.outer((P2[lp] - c0) @ u, u), axis=1).mean()
    def old_r(dd):
        od = (oP - hh) @ u; m = (np.abs(od - dd) < 0.006) & (np.linalg.norm(oP - hh, axis=1) < 0.2)
        if m.sum() < 8: return None
        q = oP[m]; cc = q.mean(0); return cc, np.linalg.norm((q - cc) - np.outer((q - cc) @ u, u), axis=1).mean()
    # (the old forearm's own outline 5 cm above the wrist: its middle, and how far it reaches in each direction. The
    # rings reach that outline by 4 cm up, so the heel of the hand narrows to a wrist as a real one does)
    od = (oP - hh) @ u; sl = oP[(np.abs(od - 0.05) < 0.008) & (np.linalg.norm(oP - hh, axis=1) < 0.2)]; lat = lambda v: v - u * (v @ u)
    ce = lat(sl.mean(0) - hh); slr = (sl - hh) - np.outer((sl - hh) @ u, u) - ce; cl = lat(c0 - hh); reach = lambda rn: max(float((slr @ rn).max()) * 0.9, 0.015)
    END = 0.1; rings = [0.1, 0.2, 0.3, 0.42, 0.6, 0.8, 1.0]; newP, newN, newUV, newW, idxmap = [], [], [], [], []; nb = len(P2)
    # (the forearm takes its colour from one plain patch of the picture, PATCH, painted below with the heel of the hand's
    # own colour: the open edge's own places in the picture run along the edge of the drawn skin and smeared)
    mp = {}
    for i in lp: mp[int(i)] = nb + len(newP); newP.append(P2[i]); newN.append(N2[i]); newUV.append(PATCH); newW.append(W2[i])
    idxmap.append(mp); heel.append(UV[(d > -0.03) & (d < 0.0)])
    for tk in rings:
        mp = {}
        for i in lp:  # (each point of the open edge goes up the arm from where it is, so the slanted edge can't fold over)
            rad = lat(P2[i] - c0); r_ = np.linalg.norm(rad); rn = rad / (r_ + 1e-9); dk = d[i] + (END - d[i]) * tk; x_ = min(1.0, tk / 0.42); sm = x_ * x_ * (3 - 2 * x_)
            q = hh + u * dk + cl + (ce - cl) * sm + rn * (r_ + (reach(rn) - r_) * sm)
            w = W2[i].copy(); tt = np.clip((dk - 0.015) / 0.04, 0, 1); hi, ti = J[f'hand_{s}'], J[f'lowerarm_twist_{s}']; tot = w.sum(); w[:] = 0; w[hi] = tot * (1 - tt); w[ti] = tot * tt
            mp[int(i)] = nb + len(newP); newP.append(q); newN.append(rn); newUV.append(PATCH); newW.append(w)
        idxmap.append(mp)
    quads = []
    for k_ in range(len(rings)):
        A_, B_ = idxmap[k_], idxmap[k_ + 1]
        for x, y in bd: quads += [(A_[int(y)], A_[int(x)], B_[int(x)]), (A_[int(y)], B_[int(x)], B_[int(y)])]
    P2 = np.vstack([P2, newP]); N2 = np.vstack([N2, newN]); UV = np.vstack([UV, np.array(newUV, dtype=np.float32)]); W2 = np.vstack([W2, newW]); I = np.concatenate([tri.reshape(-1), np.array(quads, dtype=np.uint32).reshape(-1)])
    print(side, 'points', len(P2), 'tris', len(I) // 3)
    return P2, N2, UV, W2, I

parts = [hand('l'), hand('r')]; base = 0; Ps, Ns, UVs, Ws, Is = [], [], [], [], []
for P2, N2, UV, W2, I in parts: Ps.append(P2); Ns.append(N2); UVs.append(UV); Ws.append(W2); Is.append(I + base); base += len(P2)
P = np.concatenate(Ps).astype('<f4'); N = np.concatenate(Ns).astype('<f4'); UV = np.concatenate(UVs).astype('<f4'); W = np.concatenate(Ws); I = np.concatenate(Is)
top = np.argsort(-W, axis=1)[:, :4]; Wv = np.take_along_axis(W, top, 1); Wv /= Wv.sum(1, keepdims=True); Jv = np.where(Wv > 0, top, 0).astype('u1'); Wv = Wv.astype('<f4')

# ---- textures: Godot's skin brought to the old skin's overall colour, its wrinkles and relief turned down ----
def old_img(k): v = og['bufferViews'][og['images'][k]['bufferView']]; return Image.open(io.BytesIO(ob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
def at_uv(im, uv): a = np.asarray(im, dtype=np.float64); h, w = a.shape[:2]; x = np.clip((uv[:, 0] % 1) * w, 0, w - 1).astype(int); y = np.clip((uv[:, 1] % 1) * h, 0, h - 1).astype(int); return a[y, x]
hm = (oW * np.isin(oJ, [J[n] for n in names if n.startswith(('hand_', 'index', 'middle', 'ring', 'pinky', 'thumb'))])).sum(1) > 0.5
col = Image.open(f'{GDIR}/textures/caucasian_realistic_baseColor.png').convert('RGB').resize((1024, 1024), Image.LANCZOS)
gain = at_uv(old_img(1), oUV[hm]).mean(0) / at_uv(col, UV).mean(0); print('colour gain', np.round(gain, 3))
a = np.asarray(col, dtype=np.float64); bl = np.asarray(col.filter(ImageFilter.GaussianBlur(7)), dtype=np.float64); a = (bl + 0.55 * (a - bl)) * gain
lum = a @ np.array([0.3, 0.59, 0.11]); a = a + 0.3 * (lum[..., None] - a)  # (a little less red)
hc = at_uv(Image.fromarray(np.clip(a, 0, 255).astype('u1')), np.concatenate(heel)).mean(0); a[int(0.94 * 1024):, :int(0.06 * 1024)] = hc; print('forearm colour', np.round(hc))
col = Image.fromarray(np.clip(a, 0, 255).astype('u1'))
nm = np.asarray(Image.open(f'{GDIR}/textures/hands_normal.png').convert('RGB').resize((1024, 1024), Image.LANCZOS), dtype=np.float64) / 255 * 2 - 1
nm[..., :2] *= 0.3; nm /= np.linalg.norm(nm, axis=2, keepdims=True); nm[int(0.94 * 1024):, :int(0.06 * 1024)] = [0, 0, 1]; nm = Image.fromarray(((nm + 1) / 2 * 255).round().astype('u1'))
orm = np.asarray(Image.open(f'{GDIR}/textures/hands_occlusionRoughnessMetallic.png').convert('RGB').resize((512, 512), Image.LANCZOS)).copy(); orm[..., 2] = 0
orm = Image.fromarray(orm)
def webp(im, q): b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6); return b.getvalue()
imgs = {0: webp(nm, 88), 1: webp(col, 86), 2: webp(orm, 82)}

# ---- the new file: same nodes, skeleton and sleeve; the skin mesh and its three pictures replaced ----
new = {op['attributes']['POSITION']: P.tobytes(), op['attributes']['NORMAL']: N.tobytes(), op['attributes']['TEXCOORD_0']: UV.tobytes(), op['attributes']['JOINTS_0']: Jv.tobytes(), op['attributes']['WEIGHTS_0']: Wv.tobytes()}
idx = I.astype('<u2') if len(P) < 65536 else I.astype('<u4')
for k in ('COLOR_0', 'COLOR_1'):
    if k in op['attributes']: dead = op['attributes'].pop(k); a = og['accessors'][dead]; new[dead] = bytes(np.dtype(CT[a['componentType']]).itemsize * NC[a['type']]); a['count'] = 1
blob = bytearray(); views = []
def put(data, target=None):
    while len(blob) % 4: blob.append(0)
    v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: v['target'] = target
    blob.extend(data); views.append(v); return len(views) - 1
imgv = {im['bufferView']: k for k, im in enumerate(og['images'])}; accv = {}
for ai, a in enumerate(og['accessors']): accv.setdefault(a['bufferView'], []).append(ai)
remap = {}
for vi, v in enumerate(og['bufferViews']):
    old = ob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    if vi in imgv: remap[vi] = put(imgs[imgv[vi]])
    else:
        ais = accv.get(vi, []); rep = [x for x in ais if x in new]
        if op['indices'] in ais: remap[vi] = put(idx.tobytes(), 34963); a = og['accessors'][op['indices']]; a['count'] = len(idx); a['componentType'] = 5123 if idx.dtype.itemsize == 2 else 5125
        elif rep: remap[vi] = put(new[rep[0]], 34962)
        else: remap[vi] = put(old, v.get('target'))
for ai, a in enumerate(og['accessors']):
    a['bufferView'] = remap[a['bufferView']]; a.pop('byteOffset', None)
    if ai in new and ai in op['attributes'].values(): a['count'] = len(P)
a = og['accessors'][op['attributes']['POSITION']]; a['min'] = P.min(0).tolist(); a['max'] = P.max(0).tolist()
for im in og['images']: im['bufferView'] = remap[im['bufferView']]
og['images'][0]['name'] = 'fp_skin_normal_gxr'; og['images'][1]['name'] = 'fp_skin_albedo_gxr'; og['images'][2]['name'] = 'fp_skin_rough_gxr'
og['meshes'][0]['name'] = 'gxr_hands'; og['bufferViews'] = views
while len(blob) % 4: blob.append(0)
og['buffers'] = [{'byteLength': len(blob)}]; og['asset']['extras'] = {'hands': 'Godot XR Tools hand models, CC0, DigitalN8m4r3 (Miodrag Sejic); fitted to this skeleton by source-assets/tools/retarget_fp_hands.py'}
js = json.dumps(og, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob))); f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js); f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)
print('wrote', OUT, 'points', len(P), 'tris', len(idx) // 3, 'bytes', 28 + len(js) + len(blob))
