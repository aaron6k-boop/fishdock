// ---- landmarksCromer: Cromer's own buildings round its pier (see localDetail.js) ----
// The Pavilion Theatre at the end of the pier, the lifeboat station behind it, the domed kiosks at the pier's gates,
// the glazed shelters on its deck, the Hotel de Paris on the cliff above it and the parish church's tower. Each stands
// on its own outline from OpenStreetMap; the rest comes from photographs on Wikimedia Commons (2008 to 2025) and the
// descriptions cited by each. Sizes are estimates. Pieces are merged by material: one draw call per material each.
import * as THREE from "three";
import { kit, walls, prepRing, edgeInfo, bbox, mansard, hipRoof, signTex, materials, finish } from "./landmarksTown.js";
import { weather } from "./textures3d.js";

// the extra finishes Cromer's buildings need, over the common set (landmarksTown.js materials)
function cromerMaterials(base, top) {
  const M = materials(base, top);
  M.white = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.6 });
  weather(M.white, { scale: 0.9, mottle: 0.1, grime: [base, base + 0.8, 0.25], streaks: [top, 2.5, 0.12] });
  M.timber = new THREE.MeshStandardMaterial({ color: 0xa88b6c, roughness: 0.85, side: THREE.DoubleSide }); // (the lifeboat station's cladding: vertical boards gone brown-grey)
  weather(M.timber, { wood: "y", scale: 1, mottle: 0.22, bump: 0.35, rough: [0.85, 1.1] });
  M.zinc = new THREE.MeshStandardMaterial({ color: 0x8e9599, roughness: 0.62, metalness: 0.2, side: THREE.DoubleSide }); // (standing-seam metal roofs, weathered matt)
  weather(M.zinc, { scale: 0.8, mottle: 0.12, streaks: [top + 3, 2, 0.1] });
  M.blue = new THREE.MeshStandardMaterial({ color: 0x1f4f86, roughness: 0.5, metalness: 0.2 }); // (RNLI blue: the station's railings and frames)
  M.buff = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }); // (the gates' ribbed domes, painted stone colour)
  weather(M.buff, { scale: 0.5, mottle: 0.25, streaks: [top + 3, 2, 0.2] });
  M.flint = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.82 }); // (knapped flint walls with stone dressings)
  weather(M.flint, { scale: 0.35, mottle: 0.75, bump: 0.6, grime: [base, base + 2, 0.25], streaks: [top, 6, 0.2], rough: [0.75, 1.1] });
  M.dressing = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.85 });
  weather(M.dressing, { scale: 0.6, mottle: 0.3, streaks: [top, 6, 0.25] });
  return M;
}
const edgeMid = (e, out = 0) => [(e.a[0] + e.b[0]) / 2 + e.n[0] * out, (e.a[1] + e.b[1]) / 2 + e.n[1] * out];
const centre = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
// a dome over (x, y, z): radius r, height h, ribbed (n panels drawn as a lathe), on a drum
function dome(K, mat, x, y, z, r, h, n = 12) {
  const prof = [[r, 0], [r * 0.97, h * 0.25], [r * 0.85, h * 0.55], [r * 0.6, h * 0.82], [r * 0.25, h * 0.97], [0.02, h]].map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(prof, n); g.translate(x, y, z); K.add(mat, g);
}

// ---- the Pavilion Theatre (1901, roofed 1905): an iron frame three bays by three, rendered walls, a low roof of
// curved lines with its corners cut back on the diagonal and a large clerestory in the middle, covered in a lead-like
// sheet (The Theatres Trust's database). White and cream walls, the theatre's name in white on red over the landward end
// (photographs, 2010 to 2019) ----
let PAV_SIGN = null;
function cromerPavilion(group, ring, base) {
  // (drawn on its outline's box with the corners cut on the diagonal, as described: the map's outline, round at its
  // landward end, gave a roof that folded through itself)
  const bb = bbox(prepRing(ring, 0.7)), K = kit(), y1 = base + 4.6, M = cromerMaterials(base, y1 + 3);
  const t = bb.ax[1] >= 0 ? bb.ax : [-bb.ax[0], -bb.ax[1]], n = [-t[1], t[0]], L = bb.L, W = bb.W, cut = Math.min(4, W * 0.18);
  const at = (u, v) => [bb.c[0] + t[0] * u + n[0] * v, bb.c[1] + t[1] * u + n[1] * v];
  let pts = [at(-L / 2 + cut, -W / 2), at(L / 2 - cut, -W / 2), at(L / 2, -W / 2 + cut), at(L / 2, W / 2 - cut), at(L / 2 - cut, W / 2), at(-L / 2 + cut, W / 2), at(-L / 2, W / 2 - cut), at(-L / 2, -W / 2 + cut)];
  { let A = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; A += x1 * z2 - x2 * z1; } if (A < 0) pts = pts.reverse(); }
  walls(K, pts, base, y1, { mat: "white", storeys: 1, bay: 2.6, win: [1.1, 1.5], skip: 1.0, trim: "trim" });
  // the roof: low slopes from the eaves to a flat crown, and the clerestory standing in the middle of it
  mansard(K, pts, y1 + 0.16, 1.7, Math.min(4.5, W * 0.22), { mat: "lead", top: "lead" });
  const cL = L * 0.46, cW = W * 0.36, cy = y1 + 1.86;
  K.box("white", cL, 1.4, cW, bb.c[0], cy + 0.7, bb.c[1], t);
  for (const s of [-1, 1]) { const q = at(0, s * (cW / 2 + 0.03)); K.box("glass", cL - 0.8, 0.75, 0.06, q[0], cy + 0.72, q[1], t); }
  hipRoof(K, "lead", bb.c, t, cL, cW, cy + 1.4, 1.0, 0.3);
  // the foyer across its landward end (the end towards the shore, +z), glazed, and the theatre's name over it
  const fW = W * 0.62, fD = 3.2, fy = base + 3.4, fc = at(L / 2 + fD / 2 - 0.2, 0);
  K.box("white", fD, fy - base, fW, fc[0], base + (fy - base) / 2, fc[1], t);
  K.box("trim", fD + 0.3, 0.25, fW + 0.3, fc[0], fy + 0.12, fc[1], t);
  { const q = at(L / 2 + fD - 0.17, 0); K.box("glass", 0.06, 2.2, fW - 1.4, q[0], base + 1.3, q[1], t); }
  PAV_SIGN ||= signTex("PAVILION THEATRE", "#b8282d", "#ffffff");
  if (PAV_SIGN) { M.pavSign = new THREE.MeshStandardMaterial({ color: 0xffffff, map: PAV_SIGN, roughness: 0.55 }); const q = at(L / 2 + 0.12, 0); K.box("pavSign", 0.1, 1.15, Math.min(W - 2, 10), q[0], y1 + 0.75, q[1], t); }
  return finish(group, K, M, { ring: pts, base, top: y1 + 4.3 });
}

// ---- Cromer lifeboat station (1999): a large boathouse at the end of the pier (Wikipedia), two storeys, clad in timber
// boards with a curved metal roof, its slipway running down into the sea from its seaward doors (photographs, 2017 to
// 2025: in 2008 and 2013 it was clad in white and blue panels) ----
function cromerLifeboat(group, ring, base) {
  const pts = prepRing(ring, 0.8), bb = bbox(pts), K = kit(), y1 = base + 7.4, M = cromerMaterials(base, y1 + 2);
  walls(K, pts, base, y1, { mat: "timber", storeys: 2, bay: 3.6, win: [1.2, 1.3], skip: 1.2, trim: "blue", plinth: "plinth", cornice: false });
  // the roof: a shallow barrel along the building, its ends filled in timber, standing-seam metal with a little
  // overhang (as the photographs; a dome over it all read as a flying saucer from the sea, the PC's film, 18 November)
  const t = bb.ax, c = bb.W + 0.8, rise = Math.min(2.2, bb.W * 0.16), R = (c * c / 4 + rise * rise) / (2 * rise), th = 2 * Math.asin(c / (2 * R)), ang = -Math.atan2(t[1], t[0]);
  const roof = new THREE.CylinderGeometry(R, R, bb.L + 0.8, 28, 1, true, Math.PI / 2 - th / 2, th);
  roof.rotateZ(Math.PI / 2); roof.translate(0, y1 - R * Math.cos(th / 2), 0); roof.rotateY(ang); roof.translate(bb.c[0], 0, bb.c[1]); K.add("zinc", roof);
  for (const s2 of [-1, 1]) {
    const sh = new THREE.Shape(); for (let i = 0; i <= 16; i++) { const a = -th / 2 + (th * i) / 16; sh[i ? "lineTo" : "moveTo"](R * Math.sin(a), R * Math.cos(a) - R * Math.cos(th / 2)); }
    const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2); g.translate(s2 * (bb.L / 2), y1, 0); g.rotateY(ang); g.translate(bb.c[0], 0, bb.c[1]); K.add("timber", g);
  }
  // the deck round it at the floor's level: a walkway with RNLI-blue railings (the pier's own white railing stops at it)
  for (const e of edgeInfo(pts)) {
    if (e.L < 2) continue;
    const a = [e.a[0] + e.n[0] * 1.1, e.a[1] + e.n[1] * 1.1], b = [e.b[0] + e.n[0] * 1.1, e.b[1] + e.n[1] * 1.1], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    K.box("blue", e.L, 0.06, 0.06, mid[0], base + 1.05, mid[1], e.t); K.box("blue", e.L, 0.04, 0.04, mid[0], base + 0.55, mid[1], e.t);
    const np = Math.max(1, Math.round(e.L / 1.8)); for (let i = 0; i <= np; i++) { const f = i / np; K.box("blue", 0.06, 1.05, 0.06, a[0] + (b[0] - a[0]) * f, base + 0.52, a[1] + (b[1] - a[1]) * f); }
  }
  // its big doors: on the seaward end (the shortest edge facing north), to the slipway
  const sea = edgeInfo(pts).filter((e) => e.n[1] < -0.5).sort((a, b) => b.L - a.L)[0];
  if (sea) { const p = edgeMid(sea, 0.06); K.box("blue", Math.min(5.2, sea.L - 0.6), 5.4, 0.1, p[0], base + 2.7, p[1], sea.t); }
  // the flagpole
  const fp = [bb.c[0] + t[0] * (bb.L / 2 - 1), bb.c[1] + t[1] * (bb.L / 2 - 1)]; const pole = new THREE.CylinderGeometry(0.04, 0.06, 7, 6); pole.translate(fp[0], y1 + rise + 3.5, fp[1]); K.add("trim", pole);
  return finish(group, K, M, { ring: pts, base, top: y1 + rise });
}

// ---- the pier's gates: two white kiosks either side of the way onto the pier, each crowned at its rounded end with a
// ribbed dome painted stone colour, a small lantern on top (photographs, 2015 to 2019) ----
function cromerGates(group, ring, base) {
  const pts = prepRing(ring, 0.35), bb = bbox(pts), K = kit(), y1 = base + 3.2, M = cromerMaterials(base, y1 + 2);
  walls(K, pts, base, y1, { mat: "white", storeys: 1, bay: 2.2, win: [1.4, 1.6], skip: 0.6, trim: "trim" });
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []), flat = [];
  for (const [i, j, k] of tris) for (const p of [pts[i], pts[k], pts[j]]) flat.push(p[0], y1 + 0.02, p[1]);
  K.tri("lead", flat);
  // the domes: over the two rounded ends furthest apart across the way
  const n = [-bb.ax[1], bb.ax[0]], vs = pts.map((p) => (p[0] - bb.c[0]) * n[0] + (p[1] - bb.c[1]) * n[1]);
  const iL = vs.indexOf(Math.min(...vs)), iR = vs.indexOf(Math.max(...vs));
  for (const i of [iL, iR]) {
    const p = pts[i], c = [p[0] + (bb.c[0] - p[0]) * (2.2 / Math.max(2.2, Math.hypot(bb.c[0] - p[0], bb.c[1] - p[1]))), p[1] + (bb.c[1] - p[1]) * (2.2 / Math.max(2.2, Math.hypot(bb.c[0] - p[0], bb.c[1] - p[1])))];
    const drum = new THREE.CylinderGeometry(1.55, 1.55, 0.9, 16); drum.translate(c[0], y1 + 0.5, c[1]); K.add("white", drum);
    const cor = new THREE.CylinderGeometry(1.75, 1.75, 0.2, 16); cor.translate(c[0], y1 + 1.0, c[1]); K.add("trim", cor);
    dome(K, "buff", c[0], y1 + 1.1, c[1], 1.6, 1.75, 12);
    const lan = new THREE.CylinderGeometry(0.28, 0.32, 0.5, 8); lan.translate(c[0], y1 + 3.1, c[1]); K.add("white", lan);
    dome(K, "buff", c[0], y1 + 3.35, c[1], 0.36, 0.4, 8);
    const fin = new THREE.CylinderGeometry(0.02, 0.04, 0.5, 6); fin.translate(c[0], y1 + 3.95, c[1]); K.add("iron", fin);
  }
  return finish(group, K, M, { ring: pts, base, top: y1 + 4.5 });
}

// ---- a shelter on the deck: six-sided, glazed on white posts, under a roof of curved lines with a finial ----
function pierShelter(group, ring, base) {
  const pts = prepRing(ring, 0.1), [cx, cz] = centre(pts), K = kit(), M = cromerMaterials(base, base + 3);
  const R = Math.max(1.3, Math.min(2.2, pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length * 0.85)), H = 2.4;
  const plinth = new THREE.CylinderGeometry(R + 0.05, R + 0.1, 0.5, 6); plinth.translate(cx, base + 0.25, cz); K.add("white", plinth);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const post = new THREE.BoxGeometry(0.1, H, 0.1); post.translate(x, base + H / 2, z); K.add("white", post);
    const a2 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6, x2 = cx + Math.cos(a2) * R, z2 = cz + Math.sin(a2) * R, L = Math.hypot(x2 - x, z2 - z), t = [(x2 - x) / L, (z2 - z) / L];
    if (i !== 2) K.box("glass", L - 0.1, H - 0.7, 0.04, (x + x2) / 2, base + 0.5 + (H - 0.7) / 2, (z + z2) / 2, t); // (open on the side facing along the pier)
    K.box("white", L, 0.18, 0.12, (x + x2) / 2, base + H - 0.09, (z + z2) / 2, t);
  }
  const prof = [[R + 0.3, 0], [R * 0.82, 0.35], [R * 0.5, 0.8], [R * 0.32, 1.15], [R * 0.25, 1.35], [0.1, 1.55], [0, 1.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const roof = new THREE.LatheGeometry(prof, 6); roof.rotateY(Math.PI / 6); roof.translate(cx, base + H, cz); K.add("lead", roof);
  const fin = new THREE.CylinderGeometry(0.02, 0.05, 0.5, 6); fin.translate(cx, base + H + 1.85, cz); K.add("white", fin);
  return finish(group, K, M, { ring: pts, base, top: base + H + 1.6 });
}

// ---- the Hotel de Paris (1894 to 1895), on the cliff above the pier: red brick, four storeys and attics, white-gabled
// dormers, and corner towers with green copper domes, the biggest over the front facing the pier (photographs from the
// pier, 2008 to 2022) ----
function hotelDeParis(group, ring, base) {
  const pts = prepRing(ring, 1.4), K = kit(), y1 = base + 15.5, M = cromerMaterials(base, y1 + 6);
  walls(K, pts, base, y1, { mat: "brick", storeys: 5, bay: 3.0, win: [1.15, 1.6], skip: 0.6 });
  const inn = mansard(K, pts, y1 + 0.16, 3.4, 2.4, { mat: "slate", top: "lead" });
  // white gables in the roof along the sides that face the sea (north and east)
  const E = edgeInfo(pts);
  for (const e of E.filter((q) => q.n[1] < -0.2 || q.n[0] > 0.5)) {
    const nb = Math.floor((e.L - 3) / 6.5); if (nb < 1) continue;
    for (let i = 0; i < nb; i++) {
      const f = (i + 0.5) / nb - 0.5, p = [(e.a[0] + e.b[0]) / 2 + e.t[0] * f * nb * 6.5 - e.n[0] * 0.6, (e.a[1] + e.b[1]) / 2 + e.t[1] * f * nb * 6.5 - e.n[1] * 0.6];
      K.box("white", 3.0, 3.2, 1.2, p[0], y1 + 1.6, p[1], e.t);
      K.tri("white", ((u, v) => { const L = [p[0] - e.t[0] * 1.5 + e.n[0] * 0.6, y1 + 3.2, p[1] - e.t[1] * 1.5 + e.n[1] * 0.6], R2 = [p[0] + e.t[0] * 1.5 + e.n[0] * 0.6, y1 + 3.2, p[1] + e.t[1] * 1.5 + e.n[1] * 0.6], T = [p[0] + e.n[0] * 0.6, y1 + 4.6, p[1] + e.n[1] * 0.6]; void u; void v; return [...L, ...T, ...R2, ...L, ...R2, ...T]; })());
      K.box("glass", 1.2, 1.5, 0.05, p[0] + e.n[0] * 0.62, y1 + 1.8, p[1] + e.n[1] * 0.62, e.t);
    }
  }
  // the towers: round, at the corners nearest the sea, rising two storeys above the eaves to copper domes; the
  // biggest on the corner nearest the pier
  const sea = pts.map((p, i) => ({ p, i, s: -p[1] * 0.8 + p[0] * 0.6 })).sort((a, b) => b.s - a.s).slice(0, 3);
  sea.forEach(({ p }, k) => {
    const [cx, cz] = centre(pts), d = Math.hypot(cx - p[0], cz - p[1]) || 1, r = k === 0 ? 2.6 : 2.0, c = [p[0] + (cx - p[0]) / d * r * 0.6, p[1] + (cz - p[1]) / d * r * 0.6];
    const H = y1 + (k === 0 ? 5.5 : 3.6) - base;
    const tw = new THREE.CylinderGeometry(r, r, H, 16, 1, true); tw.translate(c[0], base + H / 2, c[1]); K.add("brick", tw);
    for (let s = 1; s < 6; s++) { const band = new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.18, 16); band.translate(c[0], base + s * 3.0 + 0.6, c[1]); K.add("terracotta", band); }
    const cor = new THREE.CylinderGeometry(r + 0.25, r + 0.25, 0.35, 16); cor.translate(c[0], base + H, c[1]); K.add("white", cor);
    dome(K, "copper", c[0], base + H + 0.17, c[1], r + 0.1, r * 1.35, 16);
    const lan = new THREE.CylinderGeometry(0.4, 0.45, 0.9, 8); lan.translate(c[0], base + H + r * 1.35 + 0.4, c[1]); K.add("white", lan);
    dome(K, "copper", c[0], base + H + r * 1.35 + 0.85, c[1], 0.5, 0.6, 8);
    for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2, wx = c[0] + Math.cos(ang) * (r + 0.02), wz = c[1] + Math.sin(ang) * (r + 0.02), tt = [-Math.sin(ang), Math.cos(ang)]; for (let s = 0; s < 5; s++) K.box("glass", 0.9, 1.4, 0.05, wx, base + 1.6 + s * 3.0, wz, tt); }
  });
  void inn;
  return finish(group, K, M, { ring: pts, base, top: y1 + 9 });
}

// ---- the parish church of St Peter and St Paul: flint with stone dressings and slate roofs, its west tower 48 m
// high, the tallest church tower in Norfolk, with tall bell openings on each side, pinnacles and ornate battlements
// (Norfolk Heritage Explorer, NHER 6475; Historic England 1049032) ----
function cromerChurch(group, ring, base) {
  const pts = prepRing(ring, 1.2), bb = bbox(pts), K = kit(), y1 = base + 11, M = cromerMaterials(base, y1 + 3);
  M.stone = M.flint; // (its walls are flint; the dressings are the paler stone)
  walls(K, pts, base, y1, { mat: "flint", storeys: 1, bay: 3.8, win: [1.6, 5.2], skip: 2.4, trim: "dressing", plinth: "dressing" });
  const t = bb.ax, n = [-t[1], t[0]];
  hipRoof(K, "slate", bb.c, t, bb.L * 0.9, bb.W * 0.62, y1 + 0.1, 3.4, 0.2);
  // the west tower: at the end of the church furthest west, square, in stages
  const w = t[0] < 0 ? 1 : -1, TW = 8.0, TH = 44.5;
  const c = [bb.c[0] + t[0] * w * (bb.L / 2 - TW / 2 + 1.5), bb.c[1] + t[1] * w * (bb.L / 2 - TW / 2 + 1.5)];
  K.box("flint", TW, TH, TW, c[0], base + TH / 2, c[1], t);
  for (const yy of [8, 18, 29, TH - 0.5]) K.box("dressing", TW + 0.3, 0.35, TW + 0.3, c[0], base + yy, c[1], t); // (string courses)
  for (const s of [-1, 1]) for (const ax of [t, n]) {
    const o = [ax[0] * s * (TW / 2 + 0.03), ax[1] * s * (TW / 2 + 0.03)], along = ax === t ? n : t;
    for (const [yy, hh, ww] of [[36.5, 7.5, 2.2], [24, 4.5, 1.4], [13, 4, 1.2]]) { K.box("dressing", ww + 0.5, hh + 0.5, 0.08, c[0] + o[0], base + yy, c[1] + o[1], along); K.box("glass", ww, hh, 0.1, c[0] + o[0], base + yy, c[1] + o[1], along); }
    // buttresses up the corners
    for (const s2 of [-1, 1]) { const q = [c[0] + ax[0] * s * (TW / 2 + 0.35) + along[0] * s2 * (TW / 2 - 0.4), c[1] + ax[1] * s * (TW / 2 + 0.35) + along[1] * s2 * (TW / 2 - 0.4)]; K.box("flint", 0.7, TH - 4, 0.7, q[0], base + (TH - 4) / 2, q[1], t); }
  }
  // the battlements and the four corner pinnacles
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) for (const ax of [t, n]) { const along = ax === t ? n : t, q = [c[0] + ax[0] * s * (TW / 2) + along[0] * i * 1.15, c[1] + ax[1] * s * (TW / 2) + along[1] * i * 1.15]; K.box("dressing", 0.6, 1.1, 0.5, q[0], base + TH + 0.55, q[1], along); }
  for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const q = [c[0] + t[0] * u * (TW / 2 - 0.3) + n[0] * v * (TW / 2 - 0.3), c[1] + t[1] * u * (TW / 2 - 0.3) + n[1] * v * (TW / 2 - 0.3)]; const pin = new THREE.ConeGeometry(0.45, 3.5, 4); pin.rotateY(Math.PI / 4); pin.translate(q[0], base + TH + 1.75, q[1]); K.add("dressing", pin); }
  return finish(group, K, M, { ring: pts, base, top: base + TH + 3.5 });
}

export const CROMER_BUILDERS = { cromerPavilion, cromerLifeboat, cromerGates, pierShelter, hotelDeParis, cromerChurch };
