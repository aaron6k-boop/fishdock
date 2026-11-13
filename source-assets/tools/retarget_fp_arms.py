"""Fit a downloaded pair of first-person arms (a Rigify-rigged glTF: "Fists (2025) | First Person Animations" by 1Matzh,
CC BY 4.0, https://sketchfab.com/3d-models/fists-2025-first-person-animations-c7e8f959c4094be991b02213d4e66c20) onto the
game's own arm skeleton, and write a new fp_body.glb with those arms as its skin.

  python3 -I retarget_fp_arms.py <old fp_body.glb> <folder with scene.gltf, scene.bin, textures/> <out.glb>

The game's bones, their rest places, the sleeve and every grip are untouched. Each bone of theirs is laid along the
matching bone of ours (turned, and stretched along its length to fit); each point follows its bones as it did in the
original. Only the hand and the forearm to 14 cm above the wrist are kept: the sleeve covers the rest.
"""
import sys, json, struct, io
import numpy as np
from PIL import Image

OLD, SRC, OUT = sys.argv[1:4]
CT = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read_glb(p):
    f = open(p, 'rb').read(); n = struct.unpack('<I', f[12:16])[0]; g = json.loads(f[20:20 + n]); o = 20 + n
    bl = struct.unpack('<I', f[o:o + 4])[0]; return g, f[o + 8:o + 8 + bl]
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
op = og['meshes'][0]['primitives'][0]
# (the old skin: only for where the old fingertips were. Read from the very first build of the arms if this file has had its hands replaced already)
REF = sys.argv[4] if len(sys.argv) > 4 else OLD; rg, rb = read_glb(REF); rp = rg['meshes'][0]['primitives'][0]
oP = acc(rg, rb, rp['attributes']['POSITION']).astype(np.float64); oJ = acc(rg, rb, rp['attributes']['JOINTS_0']); oW = acc(rg, rb, rp['attributes']['WEIGHTS_0']).astype(np.float64); oUV = acc(rg, rb, rp['attributes']['TEXCOORD_0'])
rnames = [rg['nodes'][j]['name'] for j in rg['skins'][0]['joints']]; RJ = {n: i for i, n in enumerate(rnames)}
def tip_of(b):
    w = (oW * (oJ == RJ[b])).sum(1); m = w > 0.6; d = np.linalg.norm(oP[m] - head[b], axis=1); return oP[m][d >= np.quantile(d, 0.97)].mean(0)

g = json.load(open(SRC + '/scene.gltf')); b = open(SRC + '/' + g['buffers'][0]['uri'], 'rb').read()
mesh = next(m for m in g['meshes'] if 'Arms' in m.get('name', '')); p = mesh['primitives'][0]
P = acc(g, b, p['attributes']['POSITION']).astype(np.float64); N = acc(g, b, p['attributes']['NORMAL']).astype(np.float64); UV0 = acc(g, b, p['attributes']['TEXCOORD_0']).astype(np.float32)
Jn = acc(g, b, p['attributes']['JOINTS_0']); Wt = acc(g, b, p['attributes']['WEIGHTS_0']).astype(np.float64); I0 = acc(g, b, p['indices']).reshape(-1).astype(np.uint32)
sk = g['skins'][0]; gn = [g['nodes'][j].get('name', '') for j in sk['joints']]; gi = acc(g, b, sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
import re
base = lambda n: re.sub(r'_\d+$', '', n)  # (the export numbers every node: "DEF-hand.L_0458")
o = {}
for k, n in enumerate(gn): o.setdefault(base(n), np.linalg.inv(gi[k])[:3, 3])
print('source points', len(P), 'tris', len(I0) // 3, 'joints', len(gn))

def their_tip(nm):
    ks = [k for k, n in enumerate(gn) if base(n) == nm]; w = (Wt * np.isin(Jn, ks)).sum(1); m = w > 0.6; d = np.linalg.norm(P[m] - o[nm], axis=1); return P[m][d >= np.quantile(d, 0.97)].mean(0)
def umeyama(X, Y):
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my; U, S, Vt = np.linalg.svd(Yc.T @ Xc / len(X)); D = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0: D[2, 2] = -1
    R = U @ D @ Vt; s = np.trace(np.diag(S) @ D) / ((Xc ** 2).sum() / len(X)); return s, R, my - s * R @ mx
def rot_to(a, c):
    a = a / np.linalg.norm(a); c = c / np.linalg.norm(c); v = np.cross(a, c); d = a @ c
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + d)

FING = [('f_index', 'index'), ('f_middle', 'middle'), ('f_ring', 'ring'), ('f_pinky', 'pinky')]
def fit(S, s):
    X = np.array([o[f'DEF-hand.{S}']] + [o[f'DEF-{a}.01.{S}'] for a, _ in FING] + [o[f'DEF-thumb.01.{S}'], o[f'DEF-thumb.02.{S}']])
    Y = np.array([head[f'hand_{s}']] + [head[f'{c}_01_{s}'] for _, c in FING] + [head[f'thumb_01_{s}'], head[f'thumb_02_{s}']])
    sc, RA, tA = umeyama(X, Y); return sc, RA, tA, np.linalg.norm((X @ (sc * RA).T + tA) - Y, axis=1), X, Y
# (which of their hands is our left: the one that fits it without turning inside out)
pair = {'l': 'L', 'r': 'R'} if fit('L', 'l')[3].mean() <= fit('R', 'l')[3].mean() else {'l': 'R', 'r': 'L'}; print('sides', pair)

T = {}; own = {}; STR = []
for s, S in pair.items():
    sc, RA, tA, res, X, Y = fit(S, s); AL = sc * RA
    # the palm stretched in its own plane so the four knuckles land on ours
    h0 = Y[0]; e1 = Y[2] - h0; e1 /= np.linalg.norm(e1); nn = np.cross(Y[1] - h0, Y[4] - h0); nn /= np.linalg.norm(nn); e2 = np.cross(nn, e1); Q = np.stack([e1, e2, nn], 1)
    xs = ((X[:5] @ AL.T + tA) - h0) @ Q; ys = (Y[:5] - h0) @ Q; M = np.c_[xs[:, :2], np.ones(5)]; sol = np.linalg.lstsq(M, ys[:, :2], rcond=None)[0]
    B = np.eye(3); B[:2, :2] = sol[:2].T; L2 = Q @ B @ Q.T; tA = L2 @ (tA - h0) + h0 + Q @ np.array([sol[2, 0], sol[2, 1], 0.0]); AL = L2 @ AL
    print(s, 'scale', round(sc, 3), 'landmark misfit mm', np.round(np.linalg.norm((X @ AL.T + tA) - Y, axis=1) * 1000, 1))
    def seg(a, c, hb, tb):  # their segment a->c laid on ours hb->tb: turned, stretched along its length
        dg = AL @ (c - a); lg = np.linalg.norm(dg); dgn = dg / lg; db = tb - hb; lb = np.linalg.norm(db)
        STR.append(round(lb / lg, 2)); L = rot_to(dgn, db) @ (np.eye(3) + (lb / lg - 1) * np.outer(dgn, dgn)) @ AL; return L, hb - L @ a
    def put(theirs, ours, Lt):
        for n in theirs:
            if n in o: T[n] = Lt; own[n] = ours
    put([f'DEF-hand.{S}'] + [f'DEF-palm.0{k}.{S}' for k in (1, 2, 3, 4)], f'hand_{s}', (AL, tA))
    for a, c in FING + [('thumb', 'thumb')]:
        tj = [f'DEF-{a}.0{k}.{S}' for k in (1, 2, 3)]; tip = tip_of(f'{c}_03_{s}'); ends = [o[tj[1]], o[tj[2]], their_tip(tj[2])]  # (the export's own "_end" joints are not at the fingertips)
        for k in range(3):
            put([tj[k]], f'{c}_0{k + 1}_{s}', seg(o[tj[k]], ends[k], head[f'{c}_0{k + 1}_{s}'], head[f'{c}_0{k + 2}_{s}'] if k < 2 else tip))
    fore = seg(o[f'DEF-forearm.{S}'], o[f'DEF-hand.{S}'], head[f'lowerarm_{s}'], head[f'hand_{s}'])
    put([f'DEF-forearm.{S}'], f'lowerarm_{s}', fore); put([f'DEF-forearm.{S}.001'], f'lowerarm_twist_{s}', fore)
    upper = seg(o[f'DEF-upper_arm.{S}'], o[f'DEF-forearm.{S}'], head[f'upperarm_{s}'], head[f'lowerarm_{s}'])
    put([f'DEF-upper_arm.{S}', f'DEF-upper_arm.{S}.001', f'DEF-shoulder.{S}'], f'upperarm_{s}', upper)

print('stretches', STR)
keep = np.array([base(n) in T for n in gn]); P2 = np.zeros_like(P); N2 = np.zeros_like(N); W2 = np.zeros((len(P), len(names))); lost = np.zeros(len(P))
for k in range(4):
    for j in np.unique(Jn[:, k]):
        m = (Jn[:, k] == j) & (Wt[:, k] > 0)
        if not keep[j]: lost[m] += Wt[m, k]; continue
        L, t = T[base(gn[j])]; w = Wt[m, k][:, None]; P2[m] += w * (P[m] @ L.T + t); N2[m] += w * (N[m] @ np.linalg.inv(L)); W2[m, J[own[base(gn[j])]]] += Wt[m, k]
tot = W2.sum(1); ok = tot > 0.5; P2[ok] /= tot[ok][:, None]; W2[ok] /= tot[ok][:, None]; N2 /= np.linalg.norm(N2, axis=1, keepdims=True) + 1e-12
# only the hand and the forearm to 14 cm above the wrist: the sleeve covers the rest (and the game cuts the skin 5 cm up)
side = np.where(W2[:, [J[n] for n in names if n.endswith('_l')]].sum(1) >= 0.5, 'l', 'r'); far = np.zeros(len(P), bool)
for s in 'lr':
    hh = head[f'hand_{s}']; u = head[f'lowerarm_{s}'] - hh; u /= np.linalg.norm(u); far |= (side == s) & (((P2 - hh) @ u) > 0.14)
tri = I0.reshape(-1, 3); tri = tri[(ok[tri]).all(1) & ~(far[tri]).all(1)]; used = np.unique(tri); remap = -np.ones(len(P), int); remap[used] = np.arange(len(used))
P = P2[used].astype('<f4'); N = N2[used].astype('<f4'); UV = UV0[used].astype('<f4'); W = W2[used]; I = remap[tri].reshape(-1)
top = np.argsort(-W, axis=1)[:, :4]; Wv = np.take_along_axis(W, top, 1); Wv /= Wv.sum(1, keepdims=True); Jv = np.where(Wv > 0, top, 0).astype('u1'); Wv = Wv.astype('<f4')
print('kept points', len(P), 'tris', len(I) // 3)

# ---- pictures: their colour brought to the old skin's overall colour (the game tints from that), relief, roughness ----
def old_img(k): v = rg['bufferViews'][rg['images'][k]['bufferView']]; return Image.open(io.BytesIO(rb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
def at_uv(im, uv): a = np.asarray(im, dtype=np.float64); h, w = a.shape[:2]; x = np.clip((uv[:, 0] % 1) * w, 0, w - 1).astype(int); y = np.clip((uv[:, 1] % 1) * h, 0, h - 1).astype(int); return a[y, x]
hm = (oW * np.isin(oJ, [RJ[n] for n in rnames if n.startswith(('hand_', 'index', 'middle', 'ring', 'pinky', 'thumb'))])).sum(1) > 0.5
col = Image.open(SRC + '/textures/Arms_diffuse.png').convert('RGB'); SZ = min(2048, col.size[0]); col = col.resize((SZ, SZ), Image.LANCZOS)
gain = at_uv(old_img(1), oUV[hm]).mean(0) / at_uv(col, UV).mean(0); gain = 1 + (gain - 1) * 0.6; print('texture', SZ, 'colour gain', np.round(gain, 3))
col = Image.fromarray(np.clip(np.asarray(col, dtype=np.float64) * gain, 0, 255).astype('u1'))
nm = Image.open(SRC + '/textures/Arms_normal.png').convert('RGB').resize((SZ, SZ), Image.LANCZOS)
sg = Image.open(SRC + '/textures/Arms_specularGlossiness.png'); gl = np.asarray(sg.convert('RGBA').resize((SZ // 2, SZ // 2), Image.LANCZOS), dtype=np.float64)[..., 3] / 255
rough = np.clip(1 - gl, 0.35, 1.0) if gl.std() > 0.01 else np.full(gl.shape, 0.62); print('roughness mean', round(float(rough.mean()), 2))
orm = np.zeros(rough.shape + (3,), 'u1'); orm[..., 0] = 255; orm[..., 1] = (rough * 255).astype('u1'); orm = Image.fromarray(orm)
def webp(im, q): bb = io.BytesIO(); im.save(bb, 'WEBP', quality=q, method=6); return bb.getvalue()
imgs = {0: webp(nm, 90), 1: webp(col, 90), 2: webp(orm, 84)}

# ---- the new file: same nodes, skeleton and sleeve; the skin mesh and its three pictures replaced ----
new = {op['attributes']['POSITION']: P.tobytes(), op['attributes']['NORMAL']: N.tobytes(), op['attributes']['TEXCOORD_0']: UV.tobytes(), op['attributes']['JOINTS_0']: Jv.tobytes(), op['attributes']['WEIGHTS_0']: Wv.tobytes()}
idx = I.astype('<u2') if len(P) < 65536 else I.astype('<u4')
for k in ('COLOR_0', 'COLOR_1'):
    if k in op['attributes']: dead = op['attributes'].pop(k); a = og['accessors'][dead]; new[dead] = bytes(np.dtype(CT[a['componentType']]).itemsize * NC[a['type']]); a['count'] = 1
blob = bytearray(); views = []
def putv(data, target=None):
    while len(blob) % 4: blob.append(0)
    v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: v['target'] = target
    blob.extend(data); views.append(v); return len(views) - 1
imgv = {im['bufferView']: k for k, im in enumerate(og['images'])}; accv = {}
for ai, a in enumerate(og['accessors']): accv.setdefault(a['bufferView'], []).append(ai)
rm = {}
for vi, v in enumerate(og['bufferViews']):
    old = ob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    if vi in imgv: rm[vi] = putv(imgs[imgv[vi]])
    else:
        ais = accv.get(vi, []); rep = [x for x in ais if x in new]
        if op['indices'] in ais: rm[vi] = putv(idx.tobytes(), 34963); a = og['accessors'][op['indices']]; a['count'] = len(idx); a['componentType'] = 5123 if idx.dtype.itemsize == 2 else 5125
        elif rep: rm[vi] = putv(new[rep[0]], 34962)
        else: rm[vi] = putv(old, v.get('target'))
for ai, a in enumerate(og['accessors']):
    a['bufferView'] = rm[a['bufferView']]; a.pop('byteOffset', None)
    if ai in new and ai in op['attributes'].values(): a['count'] = len(P)
a = og['accessors'][op['attributes']['POSITION']]; a['min'] = P.min(0).tolist(); a['max'] = P.max(0).tolist()
for im in og['images']: im['bufferView'] = rm[im['bufferView']]
og['images'][0]['name'] = 'fp_skin_normal_1matzh'; og['images'][1]['name'] = 'fp_skin_albedo_1matzh'; og['images'][2]['name'] = 'fp_skin_rough_1matzh'
og['meshes'][0]['name'] = 'fp_arms_1matzh'; og['bufferViews'] = views
while len(blob) % 4: blob.append(0)
og['buffers'] = [{'byteLength': len(blob)}]
og['asset']['extras'] = {'hands': 'Based on "Fists (2025) | First Person Animations" (https://sketchfab.com/3d-models/fists-2025-first-person-animations-c7e8f959c4094be991b02213d4e66c20) by 1Matzh (https://sketchfab.com/1Matzh), licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/); fitted to this skeleton by source-assets/tools/retarget_fp_arms.py'}
js = json.dumps(og, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob))); f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js); f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)
print('wrote', OUT, 'bytes', 28 + len(js) + len(blob))
