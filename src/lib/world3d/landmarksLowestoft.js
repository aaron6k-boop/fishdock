// ---- landmarksLowestoft: Lowestoft's harbour mouth and South Pier (see localDetail.js) ----
// The light towers on the heads of the South and North Piers, the South Pier Family Entertainment Centre at the pier's
// root, the Royal Norfolk and Suffolk Yacht Club and the East Point Pavilion. The buildings stand on their outlines from
// OpenStreetMap; the light towers, which have none, where the photographs put them on the pier heads. The rest comes from
// photographs on Wikimedia Commons (geograph.org.uk and others, 2005 to 2026) and the descriptions cited by each. Sizes
// are estimates. Pieces are merged by material: one draw call per material each.
import * as THREE from "three";
import { kit, walls, prepRing, edgeInfo, bbox, hipRoof, signTex, materials, finish } from "./landmarksTown.js";
import { weather } from "./textures3d.js";

function lowMaterials(base, top) {
  const M = materials(base, top);
  M.white = new THREE.MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.6, side: THREE.DoubleSide });
  weather(M.white, { scale: 0.9, mottle: 0.1, grime: [base, base + 0.8, 0.22], streaks: [top, 3, 0.12] });
  M.red = new THREE.MeshStandardMaterial({ color: 0xb02a26, roughness: 0.55, side: THREE.DoubleSide });
  M.tile = new THREE.MeshStandardMaterial({ color: 0xa4553a, roughness: 0.78, side: THREE.DoubleSide }); // (clay tile roofs)
  weather(M.tile, { scale: 0.6, mottle: 0.3, rough: [0.85, 1.15] });
  M.darkRoof = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.7, side: THREE.DoubleSide });
  M.frame = new THREE.MeshStandardMaterial({ color: 0xe9ebe8, roughness: 0.45, metalness: 0.2 });
  M.pane = new THREE.MeshStandardMaterial({ color: 0xc9d8de, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
  M.lamp = new THREE.MeshStandardMaterial({ color: 0x8a1a14, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 });
  M.lampG = new THREE.MeshStandardMaterial({ color: 0x1a6a2a, emissive: 0x2aff5a, emissiveIntensity: 0, roughness: 0.3 });
  return M;
}
const signs = {};
const signMat = (M, key, text, bg, fg) => { signs[key] ||= signTex(text, bg, fg); if (signs[key]) M[key] = new THREE.MeshStandardMaterial({ color: 0xffffff, map: signs[key], roughness: 0.55 }); return !!signs[key]; };
const hexPts = (cx, cz, r, rot = 0) => Array.from({ length: 6 }, (_, i) => { const a = rot + (i / 6) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });

// ---- a harbour light on a pier head: a white six-sided tower about 9 m high over a six-sided shelter (a pergola)
// at its foot, its lantern at the top ("white hexagonal towers with a covered hexagonal pergola at the base": the
// Lowestoft Harbour Lighthouses listing, lighthouseaccommodation.co.uk; tower 9 m, light 12 m above the sea). The
// North Pier's shows green, occulting every 5 s (Oc G 5s, the same listing); the South Pier's is listed red (Oc R 5s)
// but discontinued, so it is drawn and not lit ----
function harbourLight(group, ring, base, opts = {}) {
  const pts = prepRing(ring, 0.05), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const K = kit(), M = lowMaterials(base, base + 9);
  // the shelter: six posts, a low wall between all but one, a dark six-sided roof with an overhang
  const R = 2.0, H = 2.3;
  const ring6 = hexPts(cx, cz, R);
  for (let i = 0; i < 6; i++) {
    const [x, z] = ring6[i], [x2, z2] = ring6[(i + 1) % 6], L = Math.hypot(x2 - x, z2 - z), t = [(x2 - x) / L, (z2 - z) / L];
    const post = new THREE.BoxGeometry(0.16, H, 0.16); post.translate(x, base + H / 2, z); K.add("white", post);
    if (i !== 0) K.box("white", L, 0.85, 0.12, (x + x2) / 2, base + 0.42, (z + z2) / 2, t);
  }
  const roof = new THREE.ConeGeometry(R + 0.55, 0.9, 6, 1, false, Math.PI / 6); roof.translate(cx, base + H + 0.45, cz); K.add("darkRoof", roof);
  // the tower rising through it
  const tw = new THREE.CylinderGeometry(0.75, 0.9, 9 - H, 6); tw.translate(cx, base + H + (9 - H) / 2, cz); K.add("white", tw);
  const gal = new THREE.CylinderGeometry(1.05, 1.05, 0.12, 6); gal.translate(cx, base + 9, cz); K.add("white", gal);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, x = cx + Math.cos(a) * 1.0, z = cz + Math.sin(a) * 1.0; const p = new THREE.BoxGeometry(0.04, 0.8, 0.04); p.translate(x, base + 9.45, z); K.add("dark", p); }
  const cap = new THREE.ConeGeometry(0.6, 0.6, 12); cap.translate(cx, base + 10.8, cz); K.add("darkRoof", cap);
  const ball = new THREE.SphereGeometry(0.1, 8, 6); ball.translate(cx, base + 11.2, cz); K.add("dark", ball);
  M.dark = new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.5 });
  const res = finish(group, K, M, { ring: hexPts(cx, cz, R + 0.4), base, top: base + 11 });
  // the lantern: lit only where the light is in use
  const lm = opts.lit === "green" ? M.lampG : M.lamp;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12), lm); lantern.position.set(cx, base + 9.5, cz); group.add(lantern); res.meshes.push(lantern);
  if (opts.lit) res.flash = (t, night) => { lm.emissiveIntensity = night * ((t % 5) < 4 ? 3 : 0.1); }; // (occulting: lit, and dark for a moment every 5 s)
  return res;
}

// ---- the South Pier Family Entertainment Centre at the pier's root: a long white single storey, its front under a red
// band with three white arched gables picked out in red, its name across the middle ----
function southPierFEC(group, ring, base) {
  const pts = prepRing(ring, 0.6), bb = bbox(pts), K = kit(), y1 = base + 4.2, M = lowMaterials(base, y1 + 3);
  walls(K, pts, base, y1, { mat: "white", storeys: 1, bay: 2.6, win: [1.6, 1.6], skip: 0.6, trim: "red", cornice: false });
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []), flat = [];
  for (const [i, j, k] of tris) for (const p of [pts[i], pts[k], pts[j]]) flat.push(p[0], y1 + 0.02, p[1]);
  K.tri("lead", flat);
  // the front: its longest side facing the plaza and the pier (east, towards the sea)
  const front = edgeInfo(pts).filter((e) => e.n[0] > 0.3).sort((a, b) => b.L - a.L)[0] || edgeInfo(pts).sort((a, b) => b.L - a.L)[0];
  if (front) {
    const at = (f, out = 0.08) => [front.a[0] + (front.b[0] - front.a[0]) * f + front.n[0] * out, front.a[1] + (front.b[1] - front.a[1]) * f + front.n[1] * out];
    const m = at(0.5); K.box("red", front.L, 1.0, 0.16, m[0], y1 + 0.5, m[1], front.t);
    for (const f of [0.18, 0.5, 0.82]) {
      const q = at(f, 0.1), w = Math.min(7, front.L * 0.2), sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, 0.6); sh.quadraticCurveTo(w / 2, 2.3, 0, 2.9); sh.quadraticCurveTo(-w / 2, 2.3, -w / 2, 0.6); sh.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false }); g.rotateY(-Math.atan2(front.t[1], front.t[0])); g.translate(q[0], y1 + 1.0, q[1]); K.add("white", g);
      const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); g2.scale(1.06, 1.06, 1); g2.rotateY(-Math.atan2(front.t[1], front.t[0])); g2.translate(q[0] - front.n[0] * 0.04, y1 + 0.97, q[1] - front.n[1] * 0.04); K.add("red", g2);
    }
    if (signMat(M, "fec", "South Pier  FAMILY ENTERTAINMENT CENTRE", "#b02a26", "#ffffff")) { const q = at(0.5, 0.18); K.box("fec", Math.min(front.L * 0.55, 18), 0.85, 0.06, q[0], y1 + 0.5, q[1], front.t); }
  }
  return finish(group, K, M, { ring: pts, base, top: y1 + 4 });
}

// ---- the Royal Norfolk and Suffolk Yacht Club (1903, George Skipper): white walls under red tile roofs, two storeys
// and a third in the roof, a white tower in the middle crowned by a small domed lantern (photographs, 2005 to 2025) ----
function yachtClub(group, ring, base) {
  const pts = prepRing(ring, 0.8), bb = bbox(pts), K = kit(), y1 = base + 7.6, M = lowMaterials(base, y1 + 8);
  walls(K, pts, base, y1, { mat: "white", storeys: 2, bay: 3.0, win: [1.3, 1.7], skip: 0.6, trim: "trim" });
  hipRoof(K, "tile", bb.c, bb.ax, bb.L, bb.W, y1, Math.min(5, bb.W * 0.32), 0.45);
  // the tower: square, white, rising through the roof, a cornice, a drum and a lead dome with a lantern and a vane
  const c = bb.c, tw = 5.2, ty = y1 + 5.8;
  K.box("white", tw, ty - base - 4, tw, c[0], base + 4 + (ty - base - 4) / 2, c[1], bb.ax);
  K.box("trim", tw + 0.5, 0.35, tw + 0.5, c[0], ty + 0.17, c[1], bb.ax);
  const drum = new THREE.CylinderGeometry(1.9, 2.0, 1.6, 16); drum.translate(c[0], ty + 1.15, c[1]); K.add("white", drum);
  const dome = new THREE.SphereGeometry(2.0, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.95, 1); dome.translate(c[0], ty + 1.95, c[1]); K.add("lead", dome);
  const lan = new THREE.CylinderGeometry(0.45, 0.5, 0.9, 8); lan.translate(c[0], ty + 4.3, c[1]); K.add("white", lan);
  const vane = new THREE.CylinderGeometry(0.03, 0.05, 1.6, 6); vane.translate(c[0], ty + 5.5, c[1]); K.add("iron", vane);
  return finish(group, K, M, { ring: pts, base, top: ty + 5 });
}

// ---- the East Point Pavilion (1993): a glasshouse under three pointed glazed gables, the middle one tallest, white
// frames, its name over the middle (photographs, 2010 to 2024) ----
function eastPointPavilion(group, ring, base) {
  const pts = prepRing(ring, 0.6), bb = bbox(pts), K = kit(), y1 = base + 3.6, M = lowMaterials(base, y1 + 9);
  // the low walls: glazed between white frames
  for (const e of edgeInfo(pts)) {
    if (e.L < 0.6) continue;
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    K.box("pane", e.L, y1 - base - 0.5, 0.04, mid[0], base + 0.5 + (y1 - base - 0.5) / 2, mid[1], e.t);
    K.box("white", e.L, 0.5, 0.25, mid[0], base + 0.25, mid[1], e.t);
    K.box("frame", e.L, 0.14, 0.12, mid[0], y1, mid[1], e.t);
    for (let u = 0; u <= e.L; u += 1.5) { const f = u / e.L, x = e.a[0] + (e.b[0] - e.a[0]) * f, z = e.a[1] + (e.b[1] - e.a[1]) * f; const g = new THREE.BoxGeometry(0.08, y1 - base, 0.08); g.translate(x, base + (y1 - base) / 2, z); K.add("frame", g); }
  }
  // three glazed pitched roofs across it, along its short way, the middle one higher; each a pointed gable end of glass
  const t = bb.ax, n = [-t[1], t[0]], spans = [[-bb.L / 3, 4.2], [0, 6.0], [bb.L / 3, 4.2]];
  for (const [u, h] of spans) {
    const c = [bb.c[0] + t[0] * u, bb.c[1] + t[1] * u], w = bb.L / 3, P = (a, b, y) => [c[0] + t[0] * a + n[0] * b, y, c[1] + t[1] * a + n[1] * b];
    // (the ridge runs across the building, along n)
    const A = P(-w / 2, -bb.W / 2, y1), B = P(w / 2, -bb.W / 2, y1), C = P(w / 2, bb.W / 2, y1), D = P(-w / 2, bb.W / 2, y1), R1 = P(0, -bb.W / 2, y1 + h), R2 = P(0, bb.W / 2, y1 + h);
    K.tri("pane", [...A, ...R1, ...R2, ...A, ...R2, ...D, ...B, ...C, ...R2, ...B, ...R2, ...R1]);
    K.tri("pane", [...A, ...B, ...R1, ...D, ...R2, ...C]);
    for (const [p, q] of [[A, R1], [R1, B], [D, R2], [R2, C], [R1, R2]]) { const g = new THREE.CylinderGeometry(0.06, 0.06, 1, 6), a = new THREE.Vector3(...p), b = new THREE.Vector3(...q), d = b.clone().sub(a); g.translate(0, 0.5, 0); g.scale(1, d.length(), 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); K.add("frame", g); }
    const fin = new THREE.SphereGeometry(0.22, 8, 6); for (const r of [R1, R2]) { const g = fin.clone(); g.translate(r[0], r[1] + 0.2, r[2]); K.add("frame", g); }
  }
  if (signMat(M, "epp", "THE EAST POINT PAVILION", "#1f3a6b", "#ffffff")) for (const s of [-1, 1]) { const q = [bb.c[0] + n[0] * s * (bb.W / 2 + 0.06), bb.c[1] + n[1] * s * (bb.W / 2 + 0.06)]; K.box("epp", Math.min(9, bb.L * 0.3), 0.7, 0.05, q[0], y1 + 1.6, q[1], t); }
  return finish(group, K, M, { ring: pts, base, top: y1 + 6 });
}

export const LOWESTOFT_BUILDERS = { harbourLight, southPierFEC, yachtClub, eastPointPavilion };
