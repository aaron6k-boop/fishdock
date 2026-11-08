// ---- merge_clothes: the Blender-made clothes put onto the original Rocketbox person ----
// Blender's own re-export of a person changes the skeleton's rest pose (its bones get Blender's axes), and the shared
// walks and poses (anims.glb) no longer fit: the person vanished and the wellies stretched to the sky. So only the
// clothes are taken from Blender's file (make_angler_clothes.py) and added to the original person's file, on its own
// skeleton: their vertices moved into the original body's space (fitted from where the same named joints sit in each
// file), their bones matched by name, their weights kept.
//   node source-assets/merge_clothes.mjs <original person.glb> <blender export.glb> <out.glb>
import { readFileSync, writeFileSync } from "node:fs";

// ---- reading and writing .glb ----
function readGLB(path) {
  const b = readFileSync(path);
  if (b.toString("utf8", 0, 4) !== "glTF") throw new Error(path + ": not a glb");
  let o = 12, json = null, bin = null;
  while (o < b.length) {
    const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), chunk = b.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8")); else if (type === 0x004e4942) bin = Buffer.from(chunk);
    o += 8 + len;
  }
  return { json, bin };
}
function writeGLB(path, json, bin) {
  const pad = (buf, c) => { const n = (4 - (buf.length % 4)) % 4; return n ? Buffer.concat([buf, Buffer.alloc(n, c)]) : buf; };
  json.buffers = [{ byteLength: bin.length }];
  const j = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20), bb = pad(bin, 0);
  const head = Buffer.alloc(12); head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + bb.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  writeFileSync(path, Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(bb.length, 0x004e4942), bb]));
}
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAcc(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], [T, sz] = COMP[a.componentType], n = NC[a.type];
  const stride = bv.byteStride || sz * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset);
  const get = { 5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true) }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    let v = get(base + k * stride + c * sz);
    if (a.normalized) v = a.componentType === 5121 ? v / 255 : a.componentType === 5123 ? v / 65535 : v;
    out[k * n + c] = v;
  }
  void T; return { data: out, n, count: a.count };
}

// ---- small matrix helpers (column-major 4x4, as glTF) ----
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function inv(m) { // general 4x4 inverse
  const a = m, o = new Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06, d = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}
const xf = (m, p, w = 1) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w, m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w, m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w];

// where each named joint sits in the skinned mesh's own space: the inverse of its inverse bind matrix, applied to 0
function jointsInMeshSpace(g, skinIx) {
  const s = g.json.skins[skinIx], ibm = readAcc(g, s.inverseBindMatrices), out = {};
  s.joints.forEach((ni, k) => { const m = Array.from(ibm.data.slice(k * 16, k * 16 + 16)); out[g.json.nodes[ni].name] = xf(inv(m), [0, 0, 0]); });
  return out;
}
// the similarity transform (scale, rotation, shift) that best takes points A onto points B (Umeyama)
function fit(A, B) {
  const n = A.length, ca = [0, 0, 0], cb = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { ca[c] += A[i][c] / n; cb[c] += B[i][c] / n; }
  const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let va = 0;
  for (let i = 0; i < n; i++) { const a = A[i].map((v, c) => v - ca[c]), b = B[i].map((v, c) => v - cb[c]); va += a[0] ** 2 + a[1] ** 2 + a[2] ** 2; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[r][c] += b[r] * a[c]; }
  // rotation by trying the 24 axis-aligned rotations and keeping the best (the files differ only by axes and units)
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  let best = null;
  for (const p of perms) for (let sg = 0; sg < 8; sg++) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let r = 0; r < 3; r++) R[r][p[r]] = (sg >> r) & 1 ? -1 : 1;
    let tr = 0; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) tr += R[r][c] * H[r][c];
    const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
    if (det < 0) continue;
    if (!best || tr > best.tr) best = { tr, R };
  }
  const s = best.tr / va, R = best.R, t = cb.map((v, r) => v - s * (R[r][0] * ca[0] + R[r][1] * ca[1] + R[r][2] * ca[2]));
  let err = 0; for (let i = 0; i < n; i++) { const p = A[i], q = [0, 1, 2].map((r) => s * (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) + t[r]); err = Math.max(err, Math.hypot(q[0] - B[i][0], q[1] - B[i][1], q[2] - B[i][2])); }
  return { s, R, t, err, apply: (p) => [0, 1, 2].map((r) => s * (R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2]) + t[r]), rot: (v) => [0, 1, 2].map((r) => R[r][0] * v[0] + R[r][1] * v[1] + R[r][2] * v[2]) };
}

// ---- the merge ----
const [srcPath, blendPath, outPath] = process.argv.slice(2);
const A = readGLB(srcPath), Bf = readGLB(blendPath);
const aSkin = 0, bSkin = 0;
const ja = jointsInMeshSpace(A, aSkin), jb = jointsInMeshSpace(Bf, bSkin);
const names = Object.keys(ja).filter((n) => jb[n] && /Pelvis|Spine|Thigh|Calf|Foot|UpperArm|Forearm|Hand|Head|Neck|Clavicle/.test(n));
const T = fit(names.map((n) => jb[n]), names.map((n) => ja[n]));
console.log("fitted from", names.length, "joints: scale", T.s.toFixed(4), "worst joint", T.err.toFixed(4), "(source units)");
const aJointIx = Object.fromEntries(A.json.skins[aSkin].joints.map((ni, k) => [A.json.nodes[ni].name, k]));
const bJoints = Bf.json.skins[bSkin].joints.map((ni) => Bf.json.nodes[ni].name);

const chunks = [A.bin]; let binLen = A.bin.length;
const addView = (typed, target) => {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), padN = (4 - (binLen % 4)) % 4;
  if (padN) { chunks.push(Buffer.alloc(padN)); binLen += padN; }
  A.json.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: buf.length, ...(target ? { target } : {}) }); chunks.push(buf); binLen += buf.length;
  return A.json.bufferViews.length - 1;
};
const addAcc = (typed, componentType, type, count, target, extra = {}) => { A.json.accessors.push({ bufferView: addView(typed, target), componentType, type, count, ...extra }); return A.json.accessors.length - 1; };

const sceneNodes = A.json.scenes[A.json.scene || 0].nodes;
const bodyNode = A.json.nodes.findIndex((n) => n.mesh != null && n.skin === aSkin);
for (const [mi, mesh] of Bf.json.meshes.entries()) {
  for (const prim of mesh.primitives) {
    const mname = Bf.json.materials[prim.material]?.name || "";
    if (!/^fd_/.test(mname)) continue;
    const P = readAcc(Bf, prim.attributes.POSITION), N = readAcc(Bf, prim.attributes.NORMAL), UV = prim.attributes.TEXCOORD_0 != null ? readAcc(Bf, prim.attributes.TEXCOORD_0) : null;
    const J = readAcc(Bf, prim.attributes.JOINTS_0), W = readAcc(Bf, prim.attributes.WEIGHTS_0), I = readAcc(Bf, prim.indices);
    const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), jo = new Uint16Array(n * 4), we = new Float32Array(n * 4);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < n; k++) {
      const p = T.apply([P.data[k * 3], P.data[k * 3 + 1], P.data[k * 3 + 2]]), q = T.rot([N.data[k * 3], N.data[k * 3 + 1], N.data[k * 3 + 2]]);
      for (let c = 0; c < 3; c++) { pos[k * 3 + c] = p[c]; nor[k * 3 + c] = q[c]; mn[c] = Math.min(mn[c], p[c]); mx[c] = Math.max(mx[c], p[c]); }
      let ws = 0;
      for (let c = 0; c < 4; c++) { const ji = aJointIx[bJoints[J.data[k * 4 + c]]]; const w = ji == null ? 0 : W.data[k * 4 + c]; jo[k * 4 + c] = ji ?? 0; we[k * 4 + c] = w; ws += w; }
      for (let c = 0; c < 4; c++) we[k * 4 + c] = ws > 0 ? we[k * 4 + c] / ws : c === 0 ? 1 : 0;
    }
    const idx = new Uint32Array(I.data);
    const mat = { name: mname, pbrMetallicRoughness: { baseColorFactor: [0.55, 0.55, 0.55, 1], metallicFactor: 0, roughnessFactor: mname === "fd_boots" ? 0.4 : 0.8 } };
    A.json.materials.push(mat);
    const prim2 = { attributes: {
      POSITION: addAcc(pos, 5126, "VEC3", n, 34962, { min: mn, max: mx }), NORMAL: addAcc(nor, 5126, "VEC3", n, 34962),
      ...(UV ? { TEXCOORD_0: addAcc(new Float32Array(UV.data), 5126, "VEC2", n, 34962) } : {}),
      JOINTS_0: addAcc(jo, 5123, "VEC4", n, 34962), WEIGHTS_0: addAcc(we, 5126, "VEC4", n, 34962),
    }, indices: addAcc(idx, 5125, "SCALAR", idx.length, 34963), material: A.json.materials.length - 1 };
    A.json.meshes.push({ name: mname, primitives: [prim2] });
    const node = { name: mname, mesh: A.json.meshes.length - 1, skin: aSkin };
    // (placed exactly as the body is: under the same parent with the same transform)
    const parent = A.json.nodes.findIndex((nd) => (nd.children || []).includes(bodyNode));
    for (const k of ["translation", "rotation", "scale", "matrix"]) if (A.json.nodes[bodyNode][k]) node[k] = A.json.nodes[bodyNode][k];
    A.json.nodes.push(node);
    if (parent >= 0) A.json.nodes[parent].children.push(A.json.nodes.length - 1); else sceneNodes.push(A.json.nodes.length - 1);
    console.log(mname, n, "vertices", idx.length / 3, "triangles");
    void mi;
  }
}
writeGLB(outPath, A.json, Buffer.concat(chunks));
console.log("wrote", outPath);
