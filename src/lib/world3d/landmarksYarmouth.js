// ---- landmarksYarmouth: Britannia Pier's buildings at Great Yarmouth (see localDetail.js) ----
// The Britannia Theatre near the pier's seaward end, the long amusement sheds along its deck, the entrance building on
// Marine Parade and the stalls of the fair at its end. Each stands on its own outline from OpenStreetMap; the rest comes
// from photographs on Wikimedia Commons (geograph.org.uk and others, 2005 to 2026: the pier from the beach to the north
// and the south, from the sea, from the air in January 2026, its entrance and its deck). Sizes are estimates. Pieces are
// merged by material: one draw call per material each.
import * as THREE from "three";
import { kit, walls, prepRing, edgeInfo, bbox, hipRoof, signTex, materials, finish } from "./landmarksTown.js";
import { weather } from "./textures3d.js";

// the pier's own finishes: white-painted cladding with a red band and red roofs, grey sheet over the theatre's fly tower,
// a gilded cupola on the clock tower (the photographs)
function pierMaterials(base, top) {
  const M = materials(base, top);
  M.white = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.62, side: THREE.DoubleSide });
  weather(M.white, { scale: 0.9, mottle: 0.1, grime: [base, base + 0.8, 0.22], streaks: [top, 3, 0.12] });
  M.red = new THREE.MeshStandardMaterial({ color: 0xa8222b, roughness: 0.55, side: THREE.DoubleSide });
  weather(M.red, { scale: 0.8, mottle: 0.12, streaks: [top + 2, 2, 0.1] });
  M.zinc = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  weather(M.zinc, { scale: 0.8, mottle: 0.12, streaks: [top + 3, 2, 0.1] });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xc9a23e, roughness: 0.35, metalness: 0.7 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5 });
  M.domeLead = new THREE.MeshStandardMaterial({ color: 0x9fa4a6, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide });
  return M;
}
const signs = {};
const signMat = (M, key, text, bg = "#a8222b", fg = "#ffffff") => {
  signs[key] ||= signTex(text, bg, fg);
  if (signs[key]) M[key] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: signs[key], roughness: 0.55 });
  return !!signs[key];
};
// a gabled roof over a box: ridge along t, from eaves at y up by h
function gable(K, mat, c, t, L, W, y, h, over = 0.3) {
  const n = [-t[1], t[0]], l = L / 2 + over, w = W / 2 + over;
  const P = (u, v, yy) => [c[0] + t[0] * u + n[0] * v, yy, c[1] + t[1] * u + n[1] * v];
  const A = P(-l, -w, y), B = P(l, -w, y), C = P(l, w, y), D = P(-l, w, y), R1 = P(-l, 0, y + h), R2 = P(l, 0, y + h);
  K.tri(mat, [...A, ...R2, ...B, ...A, ...R1, ...R2, ...C, ...R2, ...R1, ...C, ...R1, ...D]);
}
const gableEnds = (K, mat, c, t, L, W, y, h) => {
  const n = [-t[1], t[0]], P = (u, v, yy) => [c[0] + t[0] * u + n[0] * v, yy, c[1] + t[1] * u + n[1] * v];
  for (const s of [-1, 1]) { const u = (s * L) / 2; K.tri(mat, [...P(u, -W / 2, y), ...P(u, W / 2, y), ...P(u, 0, y + h), ...P(u, W / 2, y), ...P(u, -W / 2, y), ...P(u, 0, y + h)]); }
};

// ---- the Britannia Theatre (1958): a long white hall under a low red roof with a white clock tower and gilded cupola
// on its ridge, and at its seaward end the tall white box of the stage's fly tower under a grey roof, its name in white
// on red along both sides ----
function britanniaTheatre(group, ring, base) {
  const pts = prepRing(ring, 0.8), bb = bbox(pts), K = kit();
  const t = bb.ax[0] >= 0 ? bb.ax : [-bb.ax[0], -bb.ax[1]], n = [-t[1], t[0]]; // (t: along the pier, towards the sea, the east)
  const at = (u, v) => [bb.c[0] + t[0] * u + n[0] * v, bb.c[1] + t[1] * u + n[1] * v];
  const L = bb.L, W = bb.W, hallL = L * 0.6, flyL = L - hallL, hall = at(-L / 2 + hallL / 2, 0), fly = at(L / 2 - flyL / 2, 0);
  const yH = base + 6.4, yF = base + 15.5, M = pierMaterials(base, yF + 2);
  // the hall: white walls, a cornice, windows along both sides; its red roof hipped at the landward end
  const hallPts = [at(-L / 2, -W / 2), at(-L / 2 + hallL, -W / 2), at(-L / 2 + hallL, W / 2), at(-L / 2, W / 2)];
  walls(K, hallPts, base, yH, { mat: "white", storeys: 2, bay: 3.2, win: [1.2, 1.3], skip: 0.8, trim: "red" });
  hipRoof(K, "red", hall, t, hallL, W, yH, 3.2, 0.4);
  // its name along both sides, under the eaves
  if (signMat(M, "brTheatre", "BRITANNIA PIER & THEATRE")) for (const s of [-1, 1]) { const q = at(-L / 2 + hallL * 0.55, s * (W / 2 + 0.12)); K.box("brTheatre", Math.min(hallL * 0.7, 26), 1.3, 0.12, q[0], yH - 0.9, q[1], t); }
  // the clock tower on the ridge, a third of the way along: white, a clock face each side, a gilded cupola and finial
  const ct = at(-L / 2 + hallL * 0.36, 0), cy = yH + 2.6;
  K.box("white", 2.8, 4.2, 2.8, ct[0], cy + 2.1, ct[1], t);
  K.box("red", 3.1, 0.3, 3.1, ct[0], cy + 4.3, ct[1], t);
  for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = [ct[0] + (t[0] * du + n[0] * dv) * 1.42, ct[1] + (t[1] * du + n[1] * dv) * 1.42];
    const face = new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20); face.rotateX(Math.PI / 2); face.rotateY(Math.atan2(t[0] * du + n[0] * dv, t[1] * du + n[1] * dv)); face.translate(q[0], cy + 2.9, q[1]); K.add("trim", face);
    const rim = new THREE.TorusGeometry(0.85, 0.07, 6, 20); rim.rotateY(Math.atan2(t[0] * du + n[0] * dv, t[1] * du + n[1] * dv)); rim.translate(q[0], cy + 2.9, q[1]); K.add("dark", rim);
  }
  const drum = new THREE.CylinderGeometry(0.95, 1.05, 1.0, 12); drum.translate(ct[0], cy + 4.95, ct[1]); K.add("white", drum);
  const cup = new THREE.SphereGeometry(1.0, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); cup.scale(1, 1.15, 1); cup.translate(ct[0], cy + 5.45, ct[1]); K.add("gold", cup);
  const fin = new THREE.CylinderGeometry(0.03, 0.08, 1.4, 6); fin.translate(ct[0], cy + 7.2, ct[1]); K.add("gold", fin);
  // the fly tower: a tall white box, its walls in vertical cladding, a shallow grey roof along the pier
  const flyPts = [at(L / 2 - flyL, -W / 2 + 0.6), at(L / 2, -W / 2 + 0.6), at(L / 2, W / 2 - 0.6), at(L / 2 - flyL, W / 2 - 0.6)];
  walls(K, flyPts, base, yF, { mat: "white", storeys: 1, bay: 6, win: [0.9, 0.9], skip: 12, trim: "trim", cornice: false });
  for (let u = -flyL / 2 + 1.2; u < flyL / 2; u += 1.2) for (const s of [-1, 1]) { const q = [fly[0] + t[0] * u + n[0] * s * (W / 2 - 0.55), fly[1] + t[1] * u + n[1] * s * (W / 2 - 0.55)]; K.box("trim", 0.08, yF - yH - 0.6, 0.08, q[0], (yH + yF) / 2, q[1], t); }
  gable(K, "zinc", fly, t, flyL, W - 1.2, yF, 2.0, 0.35);
  gableEnds(K, "white", fly, t, flyL, W - 1.2, yF, 2.0);
  if (signMat(M, "brT2", "THEATRE")) for (const s of [-1, 1]) { const q = at(L / 2 - flyL * 0.5, s * (W / 2 - 0.45)); K.box("brT2", 7.5, 1.4, 0.12, q[0], yF - 2.2, q[1], t); }
  return finish(group, K, M, { ring: pts, base, top: yF + 2 });
}

// ---- the sheds along the deck (Britannia Amusements and the others): long, low and white, a red band along their
// tops carrying the signs, a low red roof ----
function britanniaShed(group, ring, base) {
  const pts = prepRing(ring, 0.6), bb = bbox(pts), K = kit(), y1 = base + 4.0, M = pierMaterials(base, y1 + 1.5);
  walls(K, pts, base, y1, { mat: "white", storeys: 1, bay: 3.0, win: [1.4, 1.4], skip: 0.9, trim: "trim", cornice: false });
  for (const e of edgeInfo(pts)) { if (e.L < 1.5) continue; const m = [(e.a[0] + e.b[0]) / 2 + e.n[0] * 0.06, (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.06]; K.box("red", e.L + 0.1, 0.7, 0.1, m[0], y1 - 0.35, m[1], e.t); }
  if (signMat(M, "brAm", "AMUSEMENTS")) for (const e of edgeInfo(pts)) { if (e.L < 12) continue; const m = [(e.a[0] + e.b[0]) / 2 + e.n[0] * 0.14, (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.14]; K.box("brAm", 6.5, 0.62, 0.06, m[0], y1 - 0.35, m[1], e.t); }
  hipRoof(K, "red", bb.c, bb.ax, bb.L, bb.W, y1, Math.min(1.6, bb.W * 0.18), 0.3);
  return finish(group, K, M, { ring: pts, base, top: y1 + 1.6 });
}

// ---- the entrance on Marine Parade: a white block under two grey domes on drums at its front corners, "BRITANNIA
// PIER" across its parapet over the way in ----
function britanniaEntrance(group, ring, base) {
  const pts = prepRing(ring, 0.6), bb = bbox(pts), K = kit(), y1 = base + 7.5, M = pierMaterials(base, y1 + 4);
  walls(K, pts, base, y1, { mat: "white", storeys: 2, bay: 3.4, win: [1.6, 1.5], skip: 0.6, trim: "trim" });
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []), flat = [];
  for (const [i, j, k] of tris) for (const p of [pts[i], pts[k], pts[j]]) flat.push(p[0], y1 + 0.02, p[1]);
  K.tri("lead", flat);
  // the front: the side facing the parade, to the west (inland)
  const front = edgeInfo(pts).filter((e) => e.n[0] < -0.5).sort((a, b) => b.L - a.L)[0];
  if (front) {
    for (const p of [front.a, front.b]) {
      const c = [p[0] - front.n[0] * 2.4 + (bb.c[0] - p[0]) * 0.08, p[1] - front.n[1] * 2.4 + (bb.c[1] - p[1]) * 0.08];
      const drumG = new THREE.CylinderGeometry(2.1, 2.1, 1.6, 16); drumG.translate(c[0], y1 + 0.8, c[1]); K.add("white", drumG);
      const d = new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); d.scale(1, 0.9, 1); d.translate(c[0], y1 + 1.6, c[1]); K.add("domeLead", d);
      const fin = new THREE.CylinderGeometry(0.03, 0.06, 1.0, 6); fin.translate(c[0], y1 + 3.9, c[1]); K.add("dark", fin);
    }
    if (signMat(M, "brPier", "BRITANNIA PIER", "#f2f1ec", "#2f3a46")) { const m = [(front.a[0] + front.b[0]) / 2 + front.n[0] * 0.12, (front.a[1] + front.b[1]) / 2 + front.n[1] * 0.12]; K.box("brPier", Math.min(front.L - 8, 16), 1.5, 0.08, m[0], y1 - 1.0, m[1], front.t); }
  }
  return finish(group, K, M, { ring: pts, base, top: y1 + 4 });
}

// ---- the fair's stalls at the pier's end: small white kiosks under red roofs ----
function fairStall(group, ring, base) {
  const pts = prepRing(ring, 0.3), bb = bbox(pts), K = kit(), y1 = base + 3.0, M = pierMaterials(base, y1 + 1);
  walls(K, pts, base, y1, { mat: "white", storeys: 1, bay: 2.4, win: [1.6, 1.3], skip: 0.9, trim: "red", cornice: false });
  hipRoof(K, "red", bb.c, bb.ax, bb.L, bb.W, y1, Math.min(1.4, bb.W * 0.3), 0.35);
  return finish(group, K, M, { ring: pts, base, top: y1 + 1.4 });
}

export const YARMOUTH_BUILDERS = { britanniaTheatre, britanniaShed, britanniaEntrance, fairStall };
