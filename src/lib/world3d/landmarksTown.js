// ---- landmarksTown: the named buildings round Gorleston's harbour mouth (see localDetail.js) ----
// The Pier Hotel, the Pavilion Theatre, the bandstand in Pier Gardens and the Cliff Hotel. Each stands on its own
// outline from OpenStreetMap; the rest (storeys, materials, roofs, towers) comes from photographs and, for the Pavilion,
// its listing ("red brick with terracotta decoration", copper roofs, four domed corner towers at the south end). Sizes
// are estimates. Pieces are merged by material: one draw call per material per building.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { weather, photoTex } from "./textures3d.js";

const TILE = 1.1; // metres: the photographed brick and render tile

// ---- the outline: closed ring, simplified, turned so its inside is on the left ----
function prepRing(ring, tol = 0.9) {
  let pts = ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  // drop corners that hardly change the outline (the map's small jogs), so walls and roof slopes stay clean
  let changed = true;
  while (changed && pts.length > 4) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-9, d = Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / L;
      if (d < tol) { pts.splice(i, 1); changed = true; break; }
    }
  }
  let A = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; A += x1 * z2 - x2 * z1; }
  if (A < 0) pts.reverse(); // (positive area in x, z: the inside is on the left of each edge, walking x towards z)
  return pts;
}
const edgeInfo = (pts) => pts.map((a, i) => {
  const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-9;
  return { a, b, L, t: [dx / L, dz / L], n: [dz / L, -dx / L] }; // n: outward
});
// the outline moved in by d (mitred corners, clamped at sharp ones)
function inset(pts, d) {
  const E = edgeInfo(pts);
  return pts.map((p, i) => {
    const n1 = E[(i - 1 + pts.length) % pts.length].n, n2 = E[i].n;
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz) || 1e-9; mx /= ml; mz /= ml;
    const k = Math.min(2.2, 1 / Math.max(0.3, mx * n2[0] + mz * n2[1]));
    return [p[0] - mx * d * k, p[1] - mz * d * k];
  });
}
function bbox(pts) {
  let best = 0, ax = [1, 0];
  for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x1, z2 - z1); if (L > best) { best = L; ax = [(x2 - x1) / L, (z2 - z1) / L]; } }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) { const u = (x - cx) * ax[0] + (z - cz) * ax[1], v = -(x - cx) * ax[1] + (z - cz) * ax[0]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
  return { c: [cx + ax[0] * mu - ax[1] * mv, cz + ax[1] * mu + ax[0] * mv], ax, L: u1 - u0, W: v1 - v0 };
}

// ---- pieces gathered by material ----
function kit() {
  const parts = {};
  const add = (mat, g) => (parts[mat] ||= []).push(g.index ? g.toNonIndexed() : g);
  // a box centred at (x, y, z), its width along the direction t = [tx, tz]
  const box = (mat, w, h, d, x, y, z, t = [1, 0]) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(-Math.atan2(t[1], t[0])); g.translate(x, y, z); add(mat, g); };
  const tri = (mat, list) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(list, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((list.length / 3) * 2).fill(0), 2)); g.computeVertexNormals(); add(mat, g); };
  return { parts, add, box, tri };
}

// walls up the outline from y0 to y1, a cornice under the eaves, and a row of windows a storey
function walls(K, pts, y0, y1, { mat = "render", storeys = 3, bay = 2.8, win = [1.1, 1.55], skip = 0.6, trim = "trim", glassMat = "glass", plinth = "plinth", cornice = true } = {}) {
  const E = edgeInfo(pts), q = [];
  for (const e of E) q.push(e.a[0], y0, e.a[1], e.b[0], y0, e.b[1], e.b[0], y1, e.b[1], e.a[0], y0, e.a[1], e.b[0], y1, e.b[1], e.a[0], y1, e.a[1]);
  K.tri(mat, q);
  const sh = (y1 - y0 - skip) / storeys;
  for (const e of E) {
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    if (plinth) K.box(plinth, e.L + 0.1, 0.6, 0.08, mid[0] + e.n[0] * 0.04, y0 + 0.3, mid[1] + e.n[1] * 0.04, e.t);
    if (cornice) K.box(trim, e.L + 0.3, 0.32, 0.3, mid[0] + e.n[0] * 0.12, y1 - 0.16, mid[1] + e.n[1] * 0.12, e.t);
    const nb = Math.floor((e.L - 0.8) / bay); if (nb < 1) continue;
    for (let s = 0; s < storeys; s++) for (let i = 0; i < nb; i++) {
      const f = (i + 0.5) / nb - 0.5, x = mid[0] + e.t[0] * f * nb * bay, z = mid[1] + e.t[1] * f * nb * bay, y = y0 + skip + sh * (s + 0.5) + 0.1;
      K.box(trim, win[0] + 0.24, win[1] + 0.24, 0.05, x + e.n[0] * 0.02, y, z + e.n[1] * 0.02, e.t);
      K.box(glassMat, win[0], win[1], 0.05, x + e.n[0] * 0.04, y, z + e.n[1] * 0.04, e.t);
      K.box(trim, win[0] + 0.3, 0.1, 0.14, x + e.n[0] * 0.07, y - win[1] / 2 - 0.12, z + e.n[1] * 0.07, e.t); // (a sill)
    }
  }
}
// a mansard roof over the outline: slopes in by d to a flat lead top at height h above y
function mansard(K, pts, y, h, d, { mat = "slate", top = "lead" } = {}) {
  const inn = inset(pts, d), q = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], a2 = inn[i], b2 = inn[(i + 1) % pts.length]; q.push(a[0], y, a[1], b[0], y, b[1], b2[0], y + h, b2[1], a[0], y, a[1], b2[0], y + h, b2[1], a2[0], y + h, a2[1]); }
  K.tri(mat, q);
  const tris = THREE.ShapeUtils.triangulateShape(inn.map(([x, z]) => new THREE.Vector2(x, z)), []), c = [];
  for (const [i, j, k] of tris) for (const p of [inn[i], inn[k], inn[j]]) c.push(p[0], y + h, p[1]);
  if (c.length) K.tri(top, c);
  return inn;
}
// a hipped roof over a rectangle (centre c, long axis t, length L, width W) from y, rising h
function hipRoof(K, mat, c, t, L, W, y, h, over = 0.35) {
  const n = [-t[1], t[0]], l = L / 2 + over, w = W / 2 + over, r = Math.max(0, l - w);
  const P = (u, v, yy) => [c[0] + t[0] * u + n[0] * v, yy, c[1] + t[1] * u + n[1] * v];
  const A = P(-l, -w, y), B = P(l, -w, y), C = P(l, w, y), D = P(-l, w, y), R1 = P(-r, 0, y + h), R2 = P(r, 0, y + h);
  K.tri(mat, [...A, ...R2, ...B, ...A, ...R1, ...R2, ...C, ...R1, ...D, ...C, ...R2, ...R1, ...B, ...R2, ...C, ...D, ...R1, ...A]);
}
function chimney(K, x, z, y, h = 2.2) { K.box("brick", 0.9, h, 1.6, x, y + h / 2, z); K.box("trim", 1.05, 0.18, 1.75, x, y + h, z); for (const o of [-0.4, 0.4]) K.box("pot", 0.24, 0.5, 0.24, x, y + h + 0.3, z + o); }

let SIGN = null;
function signTex(text, bg, fg) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128; const g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 128); g.fillStyle = fg; g.font = "bold 84px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function materials(base, top) {
  const bP = photoTex("brick_red_diff"), bN = bP && photoTex("brick_red_nor", { srgb: false }), bR = bP && photoTex("brick_red_rough", { srgb: false });
  const pP = photoTex("plaster_diff"), pN = pP && photoTex("plaster_nor", { srgb: false }), pR = pP && photoTex("plaster_rough", { srgb: false });
  SIGN ||= signTex("THE PIER HOTEL", "#23342b", "#efe6c8");
  const M = {
    render: new THREE.MeshStandardMaterial({ color: 0xf2efe6, map: pP || null, normalMap: pN || null, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: pR || null, roughness: pR ? 1 : 0.88 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xeee2c6, map: pP || null, normalMap: pN || null, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: pR || null, roughness: pR ? 1 : 0.88 }),
    brick: new THREE.MeshStandardMaterial({ color: bP ? 0xe0cfc4 : 0x9a5a46, map: bP || null, normalMap: bN || null, roughnessMap: bR || null, roughness: bR ? 1 : 0.9 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xc9805c, roughness: 0.75 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf5f3ec, roughness: 0.55 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x3b3f40, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6f7c86, roughness: 0.06, metalness: 0.9, emissive: 0xffd28a, emissiveIntensity: 0 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide }),
    lead: new THREE.MeshStandardMaterial({ color: 0x6a6f72, roughness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x6f9e88, roughness: 0.62, metalness: 0.15, side: THREE.DoubleSide }), // (verdigris: copper roofs by the sea go blue-green)
    iron: new THREE.MeshStandardMaterial({ color: 0x24392f, roughness: 0.55, metalness: 0.35 }), // (cast iron painted a deep green)
    pot: new THREE.MeshStandardMaterial({ color: 0xa65a3c, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xc4bfb3, map: photoTex("cap_concrete_diff") || null, roughness: 0.95 }),
    sign: new THREE.MeshStandardMaterial({ color: SIGN ? 0xffffff : 0x23342b, map: SIGN, roughness: 0.6 }),
  };
  weather(M.render, { scale: 0.9, mottle: 0.16, grime: [base, base + 1.2, 0.3], streaks: [top, 3, 0.18], rough: [0.9, 1.15] });
  weather(M.cream, { scale: 0.9, mottle: 0.16, grime: [base, base + 1.2, 0.3], streaks: [top, 3, 0.18], rough: [0.9, 1.15] });
  weather(M.brick, { scale: 0.8, mottle: 0.22, grime: [base, base + 0.6, 0.2] });
  weather(M.copper, { scale: 0.5, mottle: 0.4, streaks: [top + 6, 4, 0.25] });
  weather(M.slate, { scale: 0.6, mottle: 0.3, rough: [0.85, 1.2] });
  return M;
}
// merged by material, with uvs from world position on the photographed walls (so brick and render keep their size)
function finish(group, K, M, collider) {
  const meshes = [];
  for (const [k, list] of Object.entries(K.parts)) {
    const g = mergeGeometries(list.map((q) => { const c = q.clone(); for (const a of Object.keys(c.attributes)) if (a !== "position" && a !== "normal" && a !== "uv") c.deleteAttribute(a); return c; }));
    if (!g) continue;
    if (k === "render" || k === "cream" || k === "brick" || k === "stone") {
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
        if (Math.abs(ny) > 0.5) uv.setXY(i, p.getX(i) / TILE, p.getZ(i) / TILE);
        else { const hl = Math.hypot(nx, nz) || 1; uv.setXY(i, (p.getX(i) * -nz + p.getZ(i) * nx) / hl / TILE, p.getY(i) / TILE); }
      }
      uv.needsUpdate = true;
    }
    const m = new THREE.Mesh(g, M[k]); m.castShadow = true; m.receiveShadow = true; group.add(m); meshes.push(m);
  }
  return { meshes, glow: [M.glass], collider };
}

// ---- the Pier Hotel: Edwardian, three storeys, white render, a slate mansard with dormers, its name along the front ----
function pierHotel(group, ring, base) {
  const pts = prepRing(ring), K = kit(), y1 = base + 9.6, M = materials(base, y1);
  walls(K, pts, base, y1, { mat: "render", storeys: 3 });
  const inn = mansard(K, pts, y1 + 0.16, 2.6, 2.0);
  // dormers in the mansard, a chimney stack at each end
  for (const e of edgeInfo(pts)) {
    const nb = Math.floor((e.L - 3) / 4.2); if (nb < 1) continue;
    for (let i = 0; i < nb; i++) {
      const f = (i + 0.5) / nb - 0.5, x = (e.a[0] + e.b[0]) / 2 + e.t[0] * f * nb * 4.2 - e.n[0] * 0.9, z = (e.a[1] + e.b[1]) / 2 + e.t[1] * f * nb * 4.2 - e.n[1] * 0.9;
      K.box("trim", 1.5, 1.5, 1.0, x, y1 + 1.2, z, e.t); K.box("glass", 0.9, 0.9, 0.04, x + e.n[0] * 0.52, y1 + 1.15, z + e.n[1] * 0.52, e.t);
      K.box("slate", 1.7, 0.2, 1.2, x, y1 + 2.0, z, e.t);
    }
  }
  const bb = bbox(inn);
  for (const s of [-0.35, 0.35]) chimney(K, bb.c[0] + bb.ax[0] * bb.L * s, bb.c[1] + bb.ax[1] * bb.L * s, y1 + 2.6, 1.8);
  // its name on a dark green fascia above the ground floor, along the longest side facing the harbour mouth or the sea
  const E = edgeInfo(pts).filter((e) => e.n[0] > 0.3 || e.n[1] < -0.3).sort((a, b) => b.L - a.L);
  for (const e of E.slice(0, 2)) {
    const x = (e.a[0] + e.b[0]) / 2 + e.n[0] * 0.12, z = (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.12, w = Math.min(e.L - 1, 9);
    K.box("sign", w, 0.75, 0.06, x, base + 3.6, z, e.t);
  }
  // the beachside patio: a low white rail round a paved terrace on the sea side
  const sea = edgeInfo(pts).sort((a, b) => b.n[0] - a.n[0])[0];
  if (sea) {
    const o = 4.5, a = [sea.a[0] + sea.n[0] * o, sea.a[1] + sea.n[1] * o], b = [sea.b[0] + sea.n[0] * o, sea.b[1] + sea.n[1] * o];
    K.box("stone", sea.L, 0.12, o, (sea.a[0] + sea.b[0]) / 2 + sea.n[0] * o / 2, base + 0.06, (sea.a[1] + sea.b[1]) / 2 + sea.n[1] * o / 2, sea.t);
    K.box("trim", sea.L, 0.06, 0.06, (a[0] + b[0]) / 2, base + 1.0, (a[1] + b[1]) / 2, sea.t);
    for (let i = 0; i <= Math.round(sea.L / 1.5); i++) { const f = i / Math.round(sea.L / 1.5); K.box("trim", 0.06, 1.0, 0.06, a[0] + (b[0] - a[0]) * f, base + 0.5, a[1] + (b[1] - a[1]) * f); }
  }
  return finish(group, K, M, { ring: pts, base, top: y1 + 3 });
}

// ---- the Cliff Hotel: a big white hotel on the cliff top, three storeys and a slate mansard, its wings round a yard ----
function cliffHotel(group, ring, base) {
  const pts = prepRing(ring, 1.2), K = kit(), y1 = base + 10.2, M = materials(base, y1);
  walls(K, pts, base, y1, { mat: "cream", storeys: 3 });
  const inn = mansard(K, pts, y1 + 0.16, 2.4, 1.8);
  for (let i = 0; i < inn.length; i += 3) chimney(K, inn[i][0], inn[i][1], y1 + 2.5, 1.6);
  return finish(group, K, M, { ring: pts, base, top: y1 + 3 });
}

// ---- the Pavilion Theatre (1901): red brick and terracotta, copper roofs; the hall runs north to south, and a higher
// block across its south end has four corner towers, each with a balustrade and a copper dome ----
function pavilion(group, ring, base) {
  const pts = prepRing(ring, 0.8), bb = bbox(pts), K = kit(), M = materials(base, base + 8);
  // the long axis pointing south (+z)
  const t = bb.ax[1] >= 0 ? bb.ax : [-bb.ax[0], -bb.ax[1]], n = [-t[1], t[0]], L = bb.L, W = bb.W, c = bb.c;
  const at = (u, v) => [c[0] + t[0] * u + n[0] * v, c[1] + t[1] * u + n[1] * v];
  const hallL = L * 0.74, hallW = W * 0.82, hallC = at(-L / 2 + hallL / 2, 0), eave = 7.2;
  K.box("brick", hallL, eave, hallW, hallC[0], base + eave / 2, hallC[1], t);
  for (const s of [-1, 1]) {
    K.box("terracotta", hallL + 0.1, 0.35, 0.12, hallC[0] + n[0] * s * hallW / 2, base + eave - 0.4, hallC[1] + n[1] * s * hallW / 2, t);
    K.box("terracotta", hallL + 0.1, 0.25, 0.1, hallC[0] + n[0] * s * hallW / 2, base + 3.2, hallC[1] + n[1] * s * hallW / 2, t);
    // tall segmental-headed windows along the hall's sides
    const nb = Math.floor(hallL / 4.2);
    for (let i = 0; i < nb; i++) { const u = -L / 2 + (i + 0.5) * (hallL / nb), p = at(u, s * (hallW / 2 + 0.04)); K.box("terracotta", 1.7, 3.0, 0.06, p[0], base + 4.6, p[1], t); K.box("glass", 1.3, 2.6, 0.08, p[0], base + 4.6, p[1], t); }
  }
  // the hall's copper roof: a steep gable, hipped at the north end
  hipRoof(K, "copper", hallC, t, hallL, hallW, base + eave, 4.2, 0.4);
  // the south block: wider, higher, with a balustraded terrace (the narthex) in front
  const sL = L - hallL, sC = at(L / 2 - sL / 2, 0), sH = 9.6;
  K.box("brick", sL, sH, W, sC[0], base + sH / 2, sC[1], t);
  K.box("terracotta", sL + 0.2, 0.45, W + 0.2, sC[0], base + sH - 0.25, sC[1], t);
  hipRoof(K, "copper", sC, n, W, sL, base + sH, 2.4, 0.3);
  for (let i = 0; i < 4; i++) { const p = at(L / 2 + 0.04, (i - 1.5) * (W / 5)); K.box("terracotta", 1.5, 2.2, 0.06, p[0], base + 6.0, p[1], n); K.box("glass", 1.1, 1.8, 0.08, p[0], base + 6.0, p[1], n); }
  const doorP = at(L / 2 + 0.05, 0); K.box("glass", 2.4, 2.6, 0.08, doorP[0], base + 1.5, doorP[1], n);
  // the four towers: square, rising above the block, a balustrade, then a copper dome with an iron finial
  for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const p = at(L / 2 - sL / 2 + u * (sL / 2 - 1.3), v * (W / 2 - 1.3)), tH = sH + 3.4;
    K.box("brick", 2.8, tH, 2.8, p[0], base + tH / 2, p[1], t);
    K.box("terracotta", 3.1, 0.3, 3.1, p[0], base + tH - 1.6, p[1], t);
    for (const s of [-1, 1]) for (const ax of [t, n]) { const q = [p[0] + ax[0] * s * 1.42, p[1] + ax[1] * s * 1.42]; K.box("terracotta", 1.1, 1.4, 0.06, q[0], base + tH - 3, q[1], ax[0] === t[0] ? n : t); K.box("glass", 0.8, 1.1, 0.08, q[0], base + tH - 3, q[1], ax[0] === t[0] ? n : t); }
    K.box("terracotta", 3.3, 0.22, 3.3, p[0], base + tH + 0.1, p[1], t);
    for (let b = 0; b < 4; b++) { const ax = b < 2 ? t : n, s = b % 2 ? 1 : -1; K.box("trim", 3.1, 0.75, 0.16, p[0] + (ax === t ? n : t)[0] * s * 1.55, base + tH + 0.55, p[1] + (ax === t ? n : t)[1] * s * 1.55, ax); }
    const dome = new THREE.SphereGeometry(1.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 1.35, 1); dome.translate(p[0], base + tH + 0.25, p[1]); K.add("copper", dome);
    const fin = new THREE.CylinderGeometry(0.03, 0.06, 1.3, 6); fin.translate(p[0], base + tH + 0.25 + 1.69 + 0.6, p[1]); K.add("iron", fin);
  }
  // the low aisle along the west side
  const wSide = n[0] < 0 ? 1 : -1, aC = at(-L / 2 + hallL / 2, wSide * (hallW / 2 + (W - hallW) / 4));
  K.box("brick", hallL, 3.6, (W - hallW) / 2 + 0.2, aC[0], base + 1.8, aC[1], t);
  K.box("copper", hallL, 0.15, (W - hallW) / 2 + 0.6, aC[0], base + 3.7, aC[1], t);
  return finish(group, K, M, { ring: pts, base, top: base + 13 });
}

// ---- the bandstand in Pier Gardens: Victorian in style, octagonal, on a stepped base; iron columns, a frieze and a
// curved roof with a finial ----
function bandstand(group, ring, base) {
  const pts = prepRing(ring, 0.2), K = kit(), M = materials(base, base + 4);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const R = Math.max(2.5, Math.min(6, pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length));
  const step = new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.35, 8); step.rotateY(Math.PI / 8); step.translate(cx, base + 0.17, cz); K.add("stone", step);
  const deck = new THREE.CylinderGeometry(R, R, 0.8, 8); deck.rotateY(Math.PI / 8); deck.translate(cx, base + 0.75, cz); K.add("brick", deck);
  const y0 = base + 1.15, colH = 2.9;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x = cx + Math.cos(a) * (R - 0.25), z = cz + Math.sin(a) * (R - 0.25);
    const col = new THREE.CylinderGeometry(0.07, 0.09, colH, 8); col.translate(x, y0 + colH / 2, z); K.add("iron", col);
    const a2 = ((i + 1) / 8) * Math.PI * 2, x2 = cx + Math.cos(a2) * (R - 0.25), z2 = cz + Math.sin(a2) * (R - 0.25), mx = (x + x2) / 2, mz = (z + z2) / 2, t = [x2 - x, z2 - z], L = Math.hypot(t[0], t[1]);
    K.box("iron", L, 0.06, 0.05, mx, y0 + 0.9, mz, [t[0] / L, t[1] / L]); // (the railing round the stage)
    K.box("iron", L, 0.05, 0.05, mx, y0 + 0.15, mz, [t[0] / L, t[1] / L]);
    K.box("trim", L + 0.1, 0.4, 0.08, mx, y0 + colH - 0.2, mz, [t[0] / L, t[1] / L]); // (the frieze under the eaves)
  }
  const eaves = new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.12, 8); eaves.rotateY(Math.PI / 8); eaves.translate(cx, y0 + colH + 0.06, cz); K.add("trim", eaves);
  // the roof: an ogee in eight panels (concave, then a little dome), a finial on top
  const prof = [[R + 0.35, 0], [R * 0.75, 0.55], [R * 0.45, 1.25], [R * 0.3, 1.75], [R * 0.24, 2.1], [0.12, 2.5], [0, 2.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const roof = new THREE.LatheGeometry(prof, 8); roof.rotateY(Math.PI / 8); roof.translate(cx, y0 + colH + 0.12, cz); K.add("copper", roof);
  const fin = new THREE.CylinderGeometry(0.03, 0.08, 1.0, 6); fin.translate(cx, y0 + colH + 0.12 + 2.6 + 0.5, cz); K.add("iron", fin);
  return finish(group, K, M, { ring: pts, base, top: y0 + colH + 3 });
}

export const TOWN_BUILDERS = { pierHotel, cliffHotel, pavilion, bandstand };
