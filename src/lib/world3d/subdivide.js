// ---- subdivide: one step of Loop subdivision for a mesh that may be skinned ----
// Each triangle becomes four and the surface is smoothed (Loop's rules: a new point on each edge from the edge's ends and
// the two corners across it; each old point eased towards the ring round it), so a model built for a distant view (a
// MakeHuman hand's fingers, a few sides each) is round up close. Seams in the texture are kept: the shape is worked out
// on the surface as one piece (corners at the same place are one point), the texture coordinates per corner. Skin
// weights on a new point are its edge's two ends' together (the strongest four kept), so it bends as they do.
// keep: how far the old points move (1, Loop's own: smoothest; less keeps the shape fuller, as at the knuckles)
import * as THREE from "three";

export function subdivide(src, { keep = 1 } = {}) {
  const g = src.index ? src : src.toIndexed?.() || src;
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: g.attributes.position.count }, (_, i) => i);
  const P = g.attributes.position, n0 = P.count;
  // one point per place
  const key = new Map(), W = new Int32Array(n0); let nw = 0; const wpos = [];
  for (let i = 0; i < n0; i++) {
    const k = `${Math.round(P.getX(i) * 1e5)},${Math.round(P.getY(i) * 1e5)},${Math.round(P.getZ(i) * 1e5)}`;
    let w = key.get(k); if (w == null) { w = nw++; key.set(k, w); wpos.push(P.getX(i), P.getY(i), P.getZ(i)); } W[i] = w;
  }
  // the edges (by place) with the corners across them, and each place's neighbours
  const edges = new Map(), nb = Array.from({ length: nw }, () => new Set());
  const ek = (a, b) => (a < b ? a * nw + b : b * nw + a);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = W[idx[t + e]], b = W[idx[t + (e + 1) % 3]], c = W[idx[t + (e + 2) % 3]];
    const k = ek(a, b); let E = edges.get(k); if (!E) { E = { a, b, opp: [] }; edges.set(k, E); } E.opp.push(c);
    nb[a].add(b); nb[b].add(a);
  }
  const edge = new Map();
  for (const [k, E] of edges) {
    const o = [0, 0, 0];
    for (let c = 0; c < 3; c++) o[c] = E.opp.length === 2 ? 0.375 * (wpos[E.a * 3 + c] + wpos[E.b * 3 + c]) + 0.125 * (wpos[E.opp[0] * 3 + c] + wpos[E.opp[1] * 3 + c]) : 0.5 * (wpos[E.a * 3 + c] + wpos[E.b * 3 + c]);
    edge.set(k, o);
  }
  // the old points, eased towards their rings (an edge of the mesh, where it was cut off, stays put)
  const border = new Uint8Array(nw); for (const E of edges.values()) if (E.opp.length < 2) { border[E.a] = 1; border[E.b] = 1; }
  const moved = new Float32Array(nw * 3);
  for (let w = 0; w < nw; w++) {
    const ring = [...nb[w]], n = ring.length;
    for (let c = 0; c < 3; c++) moved[w * 3 + c] = wpos[w * 3 + c];
    if (border[w] || n < 3) continue;
    const beta = n > 3 ? 3 / (8 * n) : 3 / 16;
    for (let c = 0; c < 3; c++) { let s = 0; for (const r of ring) s += wpos[r * 3 + c]; const loop = (1 - n * beta) * wpos[w * 3 + c] + beta * s; moved[w * 3 + c] = wpos[w * 3 + c] + (loop - wpos[w * 3 + c]) * keep; }
  }
  // the new mesh: the old corners (moved), then one new corner per edge per side of a texture seam
  const names = Object.keys(g.attributes).filter((n) => n !== "normal");
  const out = {}; for (const n of names) out[n] = Array.from(g.attributes[n].array);
  const size = (n) => g.attributes[n].itemSize;
  for (let i = 0; i < n0; i++) { const w = W[i]; out.position[i * 3] = moved[w * 3]; out.position[i * 3 + 1] = moved[w * 3 + 1]; out.position[i * 3 + 2] = moved[w * 3 + 2]; }
  let count = n0; const mids = new Map(), Wout = Array.from(W);
  const mid = (i, j) => {
    const k = i < j ? i * n0 + j : j * n0 + i; let m = mids.get(k); if (m != null) return m;
    m = count++; mids.set(k, m);
    const pe = edge.get(ek(W[i], W[j]));
    for (const n of names) {
      const s = size(n), A = g.attributes[n];
      if (n === "position") { out.position.push(pe[0], pe[1], pe[2]); continue; }
      if (n === "skinIndex" || n === "skinWeight") continue;
      for (let c = 0; c < s; c++) out[n].push((A.array[i * s + c] + A.array[j * s + c]) / 2);
    }
    if (g.attributes.skinIndex) {
      const SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, acc = new Map();
      for (const v of [i, j]) for (let c = 0; c < 4; c++) { const w = SW[v * 4 + c]; if (w > 0) acc.set(SI[v * 4 + c], (acc.get(SI[v * 4 + c]) || 0) + w * 0.5); }
      const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0) || 1;
      for (let c = 0; c < 4; c++) { out.skinIndex.push(top[c]?.[0] ?? 0); out.skinWeight.push((top[c]?.[1] ?? 0) / sum); }
    }
    Wout.push(-1 - ek(W[i], W[j])); // (new corners: their place is their edge)
    return m;
  };
  const tri = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const geo = new THREE.BufferGeometry();
  for (const n of names) {
    const A = g.attributes[n], arr = n === "skinIndex" ? new Uint16Array(out[n]) : new Float32Array(out[n]);
    geo.setAttribute(n, new THREE.BufferAttribute(arr, A.itemSize, A.normalized));
  }
  geo.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(tri, 1) : new THREE.Uint16BufferAttribute(tri, 1));
  geo.computeVertexNormals();
  // (smooth across texture seams: corners at one place share a normal)
  const N = geo.attributes.normal, sum = new Map();
  for (let i = 0; i < count; i++) { const k = Wout[i]; const s = sum.get(k) || [0, 0, 0]; s[0] += N.getX(i); s[1] += N.getY(i); s[2] += N.getZ(i); sum.set(k, s); }
  for (let i = 0; i < count; i++) { const s = sum.get(Wout[i]), l = Math.hypot(s[0], s[1], s[2]) || 1; N.setXYZ(i, s[0] / l, s[1] / l, s[2] / l); }
  geo.groups = []; for (const gr of g.groups || []) geo.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
  return geo;
}
