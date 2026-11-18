// ---- landmarksWhitby: Whitby's harbour mouth and East Cliff (see localDetail.js) ----
// The two pier lighthouses, the beacons at the ends of the pier extensions, the ruins of Whitby Abbey and St Mary's
// Church. The church stands on its outline from OpenStreetMap; the lighthouses and beacons on the map's points for them
// (OSM nodes 663046012, 689391586, 689392638, 1088202528), the Abbey on its mapped outline of the ruins (way 98740802).
// The rest comes from photographs on Wikimedia Commons (listed in docs/REFERENCE-PHOTOS.md) and the descriptions cited
// by each. Sizes are estimates. Pieces are merged by material: one draw call per material each.
import * as THREE from "three";
import { kit, walls, prepRing, edgeInfo, bbox, hipRoof, finish } from "./landmarksTown.js";
import { weather, photoTex } from "./textures3d.js";
import { heroSwap } from "./heroAssets.js";

// the Blender models of the two lighthouses (source-assets/blender/build_whitby_lights.py), swapped in for the shapes
// below once loaded: the scan's sandstone warmed to the honey of Whitby's stone, and weathered (streaks and grime)
const lookLight = (base, top) => (mt) => {
  if (/sandstone/i.test(mt.name)) { mt.color.setHex(0xf3dfbd); weather(mt, { scale: 0.6, mottle: 0.25, grime: [base, base + 1.2, 0.35], streaks: [top, 6, 0.3], rough: [0.92, 1.08] }); }
  else if (/white/i.test(mt.name)) weather(mt, { scale: 0.8, mottle: 0.08, rust: [0.1, 0.4, 0.25, 0.1] });
};

function whitbyMaterials(base, top) {
  // (sandstone: the photographed ashlar of the piers, at about 2.2 m a tile; finish() lays it by world position)
  const sd = photoTex("sandstone_wall_diff", { repeat: 0.5 }), sn = sd && photoTex("sandstone_wall_nor", { srgb: false, repeat: 0.5 });
  const M = {
    stone: new THREE.MeshStandardMaterial({ color: 0xe4d6bc, map: sd || null, normalMap: sn || null, roughness: 0.93 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.45, metalness: 0.1 }),
    lead: new THREE.MeshStandardMaterial({ color: 0x5d6366, roughness: 0.62, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x25282a, roughness: 0.5, metalness: 0.3 }),
    pane: new THREE.MeshStandardMaterial({ color: 0x9fb2b8, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.7 }),
    // (windows: dark glass, lit warm after dark; finish() hands it back as what glows)
    glass: new THREE.MeshStandardMaterial({ color: 0x5a646a, roughness: 0.1, metalness: 0.7, emissive: 0xffd28a, emissiveIntensity: 0 }),
  };
  weather(M.stone, { scale: 0.6, mottle: 0.4, grime: [base, base + 1.4, 0.45], streaks: [top, 6, 0.35], rough: [0.9, 1.1] });
  weather(M.white, { scale: 0.8, mottle: 0.08, rust: [0.1, 0.4, 0.25, 0.1], grime: [base, base + 0.5, 0.15] });
  return M;
}
const centre = (ring) => { const pts = prepRing(ring, 0.05); return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]; };
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };

// a column's shaft: a cylinder from radius r0 at its foot to r1 at its head over h, with n flutes cut into it (concave
// grooves meeting at sharp edges, as a Doric column's), d deep as a fraction of the radius
function flutedShaft(r0, r1, h, n, d, perFlute = 6, rows = 8) {
  const seg = n * perFlute, pos = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const f = j / rows, y = h * f, r = r0 + (r1 - r0) * f + Math.sin(Math.PI * f) * 0.025 * r0; // (a little swell: entasis)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, k = (i % perFlute) / perFlute, rr = r * (1 - d * Math.sin(Math.PI * k));
      pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2)); g.computeVertexNormals();
  return g.toNonIndexed();
}

// a gallery round a lantern: a floor slab, white posts and two rails
function gallery(K, cx, cz, y, r, sides = 16) {
  K.add("stone", at(new THREE.CylinderGeometry(r, r - 0.15, 0.35, sides), cx, y - 0.17, cz));
  for (let i = 0; i < sides * 2; i++) { const a = (i / (sides * 2)) * Math.PI * 2; K.box("white", 0.05, 1.0, 0.05, cx + Math.cos(a) * (r - 0.12), y + 0.5, cz + Math.sin(a) * (r - 0.12)); }
  for (const yy of [0.98, 0.5]) K.add("white", at(new THREE.TorusGeometry(r - 0.12, 0.035, 5, sides * 2).rotateX(Math.PI / 2), cx, y + yy, cz));
}

// a lantern: a short white base, glazing between white bars (sides sides), a lead roof (a dome, or a cone) and a ball
function lantern(K, cx, cz, y, r, h, { sides = 6, dome = true } = {}) {
  K.add("white", at(new THREE.CylinderGeometry(r, r, 0.55, sides), cx, y + 0.27, cz));
  K.add("pane", at(new THREE.CylinderGeometry(r * 0.96, r * 0.96, h, sides, 1, true), cx, y + 0.55 + h / 2, cz));
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; K.box("white", 0.07, h, 0.07, cx + Math.cos(a) * r, y + 0.55 + h / 2, cz + Math.sin(a) * r); }
  K.add("white", at(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.14, sides), cx, y + 0.55 + h + 0.07, cz));
  const top = y + 0.55 + h + 0.14;
  if (dome) K.add("lead", at(new THREE.SphereGeometry(r * 1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1), cx, top, cz));
  else K.add("lead", at(new THREE.ConeGeometry(r * 1.08, r * 1.1, 16), cx, top + r * 0.55, cz));
  const peak = top + (dome ? r * 0.85 : r * 1.1);
  K.add("lead", at(new THREE.SphereGeometry(0.16, 10, 8), cx, peak + 0.1, cz));
  return peak + 0.25;
}

// ---- the West Pier lighthouse (1831): a Grecian Doric column of sandstone, fluted, on a square plinth with its door,
// a square capital, a gallery with white railings and a white six-sided lantern under a lead dome with a vane ("a
// 70-foot sandstone tower in Grecian-Doric style ... topped with a hexagonal lantern", the Whitby Harbour Lighthouses
// listing, lighthouseaccommodation.co.uk: tower 22 m). Not lit: the light is shown only when vessels are expected ----
function westPierLight(group, ring, base) {
  const [cx, cz] = centre(ring), K = kit(), H = 22, M = whitbyMaterials(base, base + H);
  // the plinth: a square block with a plain cornice, a step under the column's foot, the door facing the pier's root
  K.box("stone", 4.6, 3.0, 4.6, cx, base + 1.5, cz); K.box("stone", 4.9, 0.35, 4.9, cx, base + 3.1, cz);
  K.box("stone", 4.0, 0.6, 4.0, cx, base + 3.55, cz);
  K.box("door", 1.0, 2.1, 0.08, cx, base + 1.05, cz + 2.31);
  // the shaft: 20 flutes, 3.1 m across at its foot narrowing to 2.6 m, 13.4 m tall; then the capital (its echinus and
  // its square abacus) and a short round drum under the gallery
  const y0 = base + 3.85, sh = 13.4;
  K.add("stone", at(new THREE.CylinderGeometry(1.7, 1.75, 0.35, 32), cx, y0 + 0.17, cz)); // (its foot)
  K.add("stone", at(flutedShaft(1.55, 1.3, sh, 20, 0.05), cx, y0 + 0.35, cz));
  const yc = y0 + 0.35 + sh;
  K.add("stone", at(new THREE.CylinderGeometry(1.75, 1.32, 0.55, 32), cx, yc + 0.27, cz)); // (the echinus)
  K.box("stone", 3.7, 0.5, 3.7, cx, yc + 0.8, cz); // (the abacus)
  K.add("stone", at(new THREE.CylinderGeometry(1.25, 1.3, 1.1, 24), cx, yc + 1.6, cz));
  const yg = yc + 2.15;
  gallery(K, cx, cz, yg, 1.75);
  const top = lantern(K, cx, cz, yg, 1.05, 1.6, { sides: 6, dome: true });
  // the vane: a rod and an arrow
  K.box("dark", 0.05, 1.2, 0.05, cx, top + 0.6, cz); K.box("dark", 1.0, 0.06, 0.04, cx, top + 0.9, cz);
  const res = finish(group, K, M, { ring: [[cx - 2.95, cz - 2.95], [cx + 2.95, cz - 2.95], [cx + 2.95, cz + 2.95], [cx - 2.95, cz + 2.95]], base, top: base + H });
  heroSwap(group, res.meshes, "whitby_lights", "lh_west", { at: [cx, cz], base, look: lookLight(base, base + H) });
  return res;
}

// ---- the East Pier lighthouse (1855): a shorter stone tower, plain and tapering, eight-sided, on a square base, a
// cornice, a gallery with white railings and a white lantern under a lead cone with a ball (photographs; tower 13 m, the
// same listing). Not lit: its light was discontinued (Wikipedia, Whitby East Pier Lighthouse) ----
function eastPierLight(group, ring, base) {
  const [cx, cz] = centre(ring), K = kit(), H = 13, M = whitbyMaterials(base, base + H);
  K.box("stone", 4.2, 2.2, 4.2, cx, base + 1.1, cz); K.box("stone", 4.5, 0.3, 4.5, cx, base + 2.35, cz);
  K.box("door", 0.95, 1.9, 0.08, cx, base + 0.95, cz + 2.11);
  const y0 = base + 2.5, sh = 7.4;
  K.add("stone", at(new THREE.CylinderGeometry(1.25, 1.6, sh, 8), cx, y0 + sh / 2, cz));
  K.add("stone", at(new THREE.CylinderGeometry(1.6, 1.3, 0.5, 8), cx, y0 + sh + 0.25, cz)); // (the cornice)
  const yg = y0 + sh + 0.6;
  gallery(K, cx, cz, yg, 1.55, 8);
  lantern(K, cx, cz, yg, 0.95, 1.4, { sides: 8, dome: false });
  const res = finish(group, K, M, { ring: [[cx - 2.3, cz - 2.3], [cx + 2.3, cz - 2.3], [cx + 2.3, cz + 2.3], [cx - 2.3, cz + 2.3]], base, top: base + H });
  heroSwap(group, res.meshes, "whitby_lights", "lh_east", { at: [cx, cz], base, look: lookLight(base, base + H) });
  return res;
}

// ---- a beacon at the end of a pier extension (1914): four steel legs braced together, about 7 m to the top, a ladder
// up one side, and on top a round housing painted green (the West Pier's) or red (the East Pier's) with its light
// above (photographs; tower 7 m, the listing above). Lit after dark, steady: the sources disagree on the light's
// character, so no pattern is drawn ----
function pierBeacon(group, ring, base, opts = {}) {
  const [cx, cz] = centre(ring), K = kit(), M = whitbyMaterials(base, base + 7);
  const red = opts.colour === "red";
  M.paint = new THREE.MeshStandardMaterial({ color: red ? 0xa8231e : 0x1f6a46, roughness: 0.5, metalness: 0.15 });
  weather(M.paint, { scale: 0.7, mottle: 0.2, rust: [0.25, 0.3, 0.2, 0.08], streaks: [base + 7, 2.5, 0.2] });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xd8dad6, roughness: 0.5, metalness: 0.3 });
  weather(M.steel, { scale: 0.8, mottle: 0.2, rust: [0.35, 0.3, 0.2, 0.08], grime: [base, base + 0.6, 0.2] });
  const lamp = new THREE.MeshStandardMaterial({ color: red ? 0x8a1a14 : 0x1a6a2a, emissive: red ? 0xff2a1a : 0x2aff5a, emissiveIntensity: 0, roughness: 0.3 });
  const legH = 4.4, w0 = 1.5, w1 = 0.75, leg = (sx, sz, f) => [cx + sx * (w0 + (w1 - w0) * f), base + legH * f, cz + sz * (w0 + (w1 - w0) * f)];
  const bar = (a, b, t) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); const g = new THREE.BoxGeometry(t, L, t); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); K.add("steel", g); };
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of C) bar(leg(sx, sz, 0), leg(sx, sz, 1), 0.2);
  for (let s = 0; s < 4; s++) {
    const [ax, az] = C[s], [bx, bz] = C[(s + 1) % 4];
    for (const [f0, f1] of [[0.05, 0.5], [0.5, 0.95]]) { bar(leg(ax, az, f0), leg(bx, bz, f1), 0.08); bar(leg(bx, bz, f0), leg(ax, az, f1), 0.08); }
    for (const f of [0.5, 0.97]) bar(leg(ax, az, f), leg(bx, bz, f), 0.1);
  }
  // the ladder up the landward side
  for (const s of [-0.22, 0.22]) bar([cx + s, base, cz + w0 + 0.25], [cx + s, base + legH + 0.4, cz + w1 + 0.25], 0.05);
  for (let k = 1; k < 15; k++) { const f = k / 15; const z = cz + w0 + 0.25 + (w1 - w0) * f; bar([cx - 0.22, base + (legH + 0.4) * f, z], [cx + 0.22, base + (legH + 0.4) * f, z], 0.035); }
  // the platform, the housing and its cap, the light on top
  const yp = base + legH;
  K.add("steel", at(new THREE.CylinderGeometry(1.15, 1.15, 0.15, 16), cx, yp + 0.07, cz));
  K.add("paint", at(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 16), cx, yp + 0.95, cz));
  K.add("paint", at(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 16), cx, yp + 1.8, cz));
  K.add("paint", at(new THREE.ConeGeometry(0.9, 0.35, 16), cx, yp + 2.03, cz));
  K.add("dark", at(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), cx, yp + 2.26, cz));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; K.box("steel", 0.04, 0.9, 0.04, cx + Math.cos(a) * 1.1, yp + 0.6, cz + Math.sin(a) * 1.1); }
  K.add("steel", at(new THREE.TorusGeometry(1.1, 0.03, 4, 24).rotateX(Math.PI / 2), cx, yp + 1.05, cz));
  const res = finish(group, K, M, { ring: [[cx - 1.7, cz - 1.7], [cx + 1.7, cz - 1.7], [cx + 1.7, cz + 1.7], [cx - 1.7, cz + 1.7]], base, top: yp + 2.6 });
  const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 12), lamp); lt.position.set(cx, yp + 2.49, cz); group.add(lt); res.meshes.push(lt);
  res.flash = (t, night) => { lamp.emissiveIntensity = night * 3; };
  return res;
}

// ---- a wall of the ruins: from a to b (in x, z), its foot at base, its top at each point along it (tops: [[f, h]...]
// from 0 to 1 along it, heights above base, the line between them broken up a little as a ruin's is), d thick, with
// tiers of pointed openings (tiers: [{ y, h, w, n, from, to }]: n lancets w wide and h tall, their sills y above the
// base, spread between from and to along the wall) ----
function ruinWall(K, mat, a, b, base, tops, d, tiers = [], seed = 1) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) return;
  const hAt = (f) => { for (let i = 1; i < tops.length; i++) if (f <= tops[i][0]) { const [f0, h0] = tops[i - 1], [f1, h1] = tops[i]; return h0 + ((h1 - h0) * (f - f0)) / Math.max(1e-6, f1 - f0); } return tops[tops.length - 1][1]; };
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0);
  const steps = Math.max(2, Math.round(L / 1.2));
  for (let k = steps; k >= 0; k--) {
    const f = k / steps, h = hAt(f), rag = h > 3 ? (Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453 % 1) * 0.9 : 0;
    sh.lineTo(f * L, Math.max(0.6, h - Math.abs(rag)));
  }
  for (const t of tiers) {
    const n = t.n, span = (t.to ?? 1) - (t.from ?? 0);
    for (let i = 0; i < n; i++) {
      const fc = (t.from ?? 0) + span * ((i + 0.5) / n), uc = fc * L, w = t.w, y0 = t.y, ys = t.y + t.h - w * 0.75, yt = t.y + t.h;
      if (yt > hAt(fc) - 1.3) continue; // (no opening where the wall has fallen below it)
      const hole = new THREE.Path(); hole.moveTo(uc - w / 2, y0); hole.lineTo(uc + w / 2, y0); hole.lineTo(uc + w / 2, ys);
      hole.quadraticCurveTo(uc + w / 2, ys + (yt - ys) * 0.6, uc, yt); hole.quadraticCurveTo(uc - w / 2, ys + (yt - ys) * 0.6, uc - w / 2, ys); hole.lineTo(uc - w / 2, y0);
      sh.holes.push(hole);
    }
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -d / 2); g.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])); g.translate(a[0], base, a[1]);
  K.add(mat, g);
}

// ---- the ruins of Whitby Abbey (the church of the 13th century, its tower fallen in 1830: Wikipedia, Whitby Abbey):
// on the mapped outline of its plan, the walls that stand from photographs. The east end of the presbytery and the
// north transept stand to their full height, each with three tiers of tall pointed lancets; the presbytery's north
// side too, an arcade, a gallery and a clerestory; the west front stands with its great window; the nave's walls and
// the south transept are low. Heights estimated from photographs: about 26 m at the east end ----
function whitbyAbbey(group, ring, base) {
  const pts = ring.slice(), K = kit(), H = 26;
  const M = whitbyMaterials(base, base + H);
  // (the ruins' stone is greyer and darker than the piers', blackened in places by weather)
  M.stone.color.setHex(0xd2c8b8);
  const P = (i) => pts[i];
  // the outline's walls in order (OSM way 98740802, west front first round to the nave's south wall)
  const T = 1.6; // (thick: an abbey church's walls)
  const lanc = (y, h, w, n, from = 0.12, to = 0.88) => ({ y, h, w, n, from, to });
  // the west front: its great window high in the middle, the doorway below, the corners standing taller
  ruinWall(K, "stone", P(0), P(1), base, [[0, 15], [0.2, 17], [0.5, 13], [0.8, 16], [1, 12]], T, [lanc(1.0, 5.5, 3.2, 1, 0.4, 0.6), lanc(7.5, 6.5, 4.2, 1, 0.4, 0.6)], 1);
  // the nave's north wall: the aisle wall, ragged, a run of windows where it stands
  ruinWall(K, "stone", P(1), P(2), base, [[0, 9], [0.25, 7], [0.45, 4], [0.7, 6], [1, 10]], T, [lanc(2.4, 4.4, 1.6, 7)], 2);
  // the north transept: its west side and its north end to full height, lancets in three tiers
  ruinWall(K, "stone", P(2), P(3), base, [[0, 18], [0.5, 22], [1, 24]], T, [lanc(2.2, 6.5, 1.9, 2, 0.2, 0.8), lanc(10.5, 5.5, 1.7, 2, 0.2, 0.8), lanc(17, 4, 1.4, 2, 0.25, 0.75)], 3);
  ruinWall(K, "stone", P(3), P(4), base, [[0, 24], [0.15, 25], [0.5, 20], [0.85, 25], [1, 24]], T, [lanc(2.2, 6.8, 2.0, 3), lanc(10.5, 5.8, 1.8, 3), lanc(17.2, 3.6, 1.4, 3, 0.25, 0.75)], 4);
  // its east side, then the presbytery's north side: three storeys of arches to the east end
  ruinWall(K, "stone", P(4), P(5), base, [[0, 24], [1, 22]], T, [lanc(2.2, 6.5, 2.2, 2), lanc(10.5, 5.5, 2.0, 2)], 5);
  ruinWall(K, "stone", P(5), P(6), base, [[0, 21], [0.3, 22], [0.7, 23], [1, 25]], T, [lanc(1.2, 8.0, 3.6, 5), lanc(10.4, 4.6, 2.4, 5), lanc(16.4, 4.4, 1.6, 5)], 6);
  // the east end: full height, its corners taller (the turrets), three tiers of three lancets
  ruinWall(K, "stone", P(6), P(7), base, [[0, 27], [0.12, 26], [0.3, 22], [0.5, 23.5], [0.7, 22], [0.88, 26], [1, 27]], T + 0.4, [lanc(1.5, 8.5, 2.6, 3, 0.18, 0.82), lanc(11, 6.0, 2.3, 3, 0.18, 0.82), lanc(18.2, 3.6, 1.8, 3, 0.25, 0.75)], 7);
  // the presbytery's south side: lower, broken
  ruinWall(K, "stone", P(7), P(8), base, [[0, 20], [0.25, 12], [0.55, 6], [0.8, 3], [1, 2]], T, [lanc(1.2, 7.0, 3.2, 5)], 8);
  // the south transept and the nave's south wall: low remains
  ruinWall(K, "stone", P(8), P(9), base, [[0, 2.5], [1, 1.8]], T, [], 9);
  ruinWall(K, "stone", P(9), P(10), base, [[0, 1.8], [1, 1.2]], T, [], 10);
  ruinWall(K, "stone", P(10), P(11), base, [[0, 1.2], [1, 2.4]], T, [], 11);
  ruinWall(K, "stone", P(11), P(12 % pts.length), base, [[0, 2.4], [0.4, 1.5], [0.8, 3.5], [1, 15]], T, [], 12);
  // the turrets at the corners of the east end and of the north transept's end: eight-sided, standing above the walls,
  // each with a spire on top (the photographs: the pinnacles are what the ruins' outline is known by from the harbour)
  for (const [q, h] of [[P(6), 28], [P(7), 28], [P(3), 25.5], [P(4), 25.5]]) {
    K.add("stone", at(new THREE.CylinderGeometry(1.45, 1.75, h, 8), q[0], base + h / 2, q[1]));
    K.add("stone", at(new THREE.CylinderGeometry(1.65, 1.45, 0.5, 8), q[0], base + h + 0.25, q[1]));
    K.add("stone", at(new THREE.ConeGeometry(1.35, 4.2, 8), q[0], base + h + 2.6, q[1]));
  }
  return finish(group, K, M, { ring: pts, base, top: base + H });
}

// ---- St Mary's Church on the East Cliff (Norman, much altered: Wikipedia, St Mary's Church, Whitby): long low walls of
// brown stone with rows of tall plain windows under a battlemented parapet, the roofs low behind it, and a short square
// tower at the west end, battlemented too, with a flagpole (photographs from the churchyard, the harbour and the West
// Pier; heights estimated) ----
function stMarys(group, ring, base) {
  const pts = prepRing(ring, 0.6), K = kit(), y1 = base + 7.0, M = whitbyMaterials(base, y1 + 9);
  M.stone.color.setHex(0xcdbb9c);
  M.leadRoof = new THREE.MeshStandardMaterial({ color: 0x6e7376, roughness: 0.8, side: THREE.DoubleSide });
  M.trim = M.stone; M.plinth = M.stone;
  walls(K, pts, base, y1, { mat: "stone", storeys: 1, bay: 2.6, win: [1.1, 3.0], skip: 1.4, trim: "trim", cornice: false, plinth: false });
  // the battlements along the top of every wall: a parapet with merlons, the lead roofs low behind it
  const merlons = (a, b, y, out = 0) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [t[1], -t[0]], c = [(a[0] + b[0]) / 2 + n[0] * out, (a[1] + b[1]) / 2 + n[1] * out];
    K.box("stone", L + 0.3, 0.6, 0.45, c[0], y + 0.3, c[1], t);
    const m = Math.max(1, Math.floor(L / 1.5));
    for (let i = 0; i < m; i++) { const f = (i + 0.5) / m - 0.5; K.box("stone", 0.75, 0.55, 0.45, c[0] + t[0] * f * L, y + 0.87, c[1] + t[1] * f * L, t); }
  };
  for (const e of edgeInfo(pts)) if (e.L > 1) merlons(e.a, e.b, y1, -0.1);
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []), flat = [];
  for (const [i, j, k] of tris) for (const p of [pts[i], pts[k], pts[j]]) flat.push(p[0], y1 + 0.35, p[1]);
  K.tri("leadRoof", flat);
  // the tower at the west end: 7 m square, 15 m to the top of its battlements, a belfry opening each side
  const W = pts.reduce((m, p) => (p[0] < m[0] ? p : m), [Infinity, 0]), tx = W[0] + 3.8, tz = pts.filter((p) => p[0] < W[0] + 9).reduce((s2, p, _, a) => s2 + p[1] / a.length, 0), th = 14.2;
  K.box("stone", 7.0, th, 7.0, tx, base + th / 2, tz);
  const sq = [[tx - 3.5, tz - 3.5], [tx + 3.5, tz - 3.5], [tx + 3.5, tz + 3.5], [tx - 3.5, tz + 3.5]];
  for (let i = 0; i < 4; i++) merlons(sq[i], sq[(i + 1) % 4], base + th, 0.05);
  for (const [dx, dz, t] of [[-3.53, 0, [0, 1]], [3.53, 0, [0, 1]], [0, -3.53, [1, 0]], [0, 3.53, [1, 0]]]) K.box("glass", 1.1, 2.0, 0.06, tx + dx, base + th - 3.0, tz + dz, t);
  K.box("dark", 0.08, 6, 0.08, tx, base + th + 3.6, tz); // (the flagpole)
  return finish(group, K, M, { ring: pts, base, top: base + th + 1 });
}

// ---- a footbridge from a stone pier's head to its extension (OSM ways 288861501, the West Pier's, timber, and
// 840870516, the East Pier Bridge of 2020, steel): a deck between two side beams, white railings either side ----
function footbridge(group, ring, base, opts = {}) {
  const K = kit(), M = whitbyMaterials(base, base + 1.2), a = opts.a, b = opts.b, w = opts.w || 2.4, steel = opts.deck === "steel";
  const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L0, (b[1] - a[1]) / L0], n = [-t[1], t[0]];
  const A = [a[0] - t[0] * 0.6, a[1] - t[1] * 0.6], L = L0 + 1.2, c = [A[0] + t[0] * L / 2, A[1] + t[1] * L / 2];
  M.deck = new THREE.MeshStandardMaterial({ color: steel ? 0x8c8f8c : 0x8a7a66, roughness: steel ? 0.7 : 0.9, metalness: steel ? 0.3 : 0 });
  weather(M.deck, { scale: 1, mottle: 0.25, rough: [0.85, 1.1] });
  M.beam = steel ? M.white : new THREE.MeshStandardMaterial({ color: 0x5f584e, roughness: 0.92 });
  K.box("deck", L, 0.18, w, c[0], base - 0.09, c[1], t);
  for (const s of [-1, 1]) {
    const q = [c[0] + n[0] * s * (w / 2 - 0.1), c[1] + n[1] * s * (w / 2 - 0.1)];
    K.box("beam", L, steel ? 0.75 : 0.5, 0.2, q[0], base - (steel ? 0.55 : 0.43), q[1], t); // (the side beams under the deck)
    for (const y of [1.05, 0.55]) K.box("white", L, 0.06, 0.06, q[0], base + y, q[1], t); // (the rails)
    const np = Math.max(2, Math.round(L / 1.6));
    for (let k = 0; k <= np; k++) { const f = k / np - 0.5; K.box("white", 0.06, 1.05, 0.06, q[0] + t[0] * f * L, base + 0.52, q[1] + t[1] * f * L); }
  }
  const P = (u, v) => [c[0] + t[0] * u + n[0] * v, c[1] + t[1] * u + n[1] * v];
  return finish(group, K, M, { ring: [P(-L / 2, -w / 2), P(L / 2, -w / 2), P(L / 2, w / 2), P(-L / 2, w / 2)], base: base - 0.6, top: base + 1.1 });
}

// ---- the West Pier's lamps: black cast-iron columns, each with a ladder bar under a square lantern, in a line down the
// pier near its harbour side (photographs from the pier and the harbour). opts.line: the side they follow, opts.inset:
// metres in from it, opts.every: metres apart, opts.from: metres along before the first ----
function lampRow(group, ring, base, opts = {}) {
  const K = kit(), M = whitbyMaterials(base, base + 4);
  M.iron = new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.45, metalness: 0.5 });
  M.lantern = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, emissive: new THREE.Color().setRGB(2.2, 1.6, 0.9), emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.9 });
  const line = opts.line || [], inset = opts.inset ?? 3, every = opts.every ?? 24, pts = [];
  let left = opts.from ?? 10;
  for (let i = 0; i + 1 < line.length; i++) {
    const [x1, z1] = line[i], [x2, z2] = line[i + 1], L = Math.hypot(x2 - x1, z2 - z1), t = [(x2 - x1) / L, (z2 - z1) / L], n = [-t[1] * (opts.side ?? 1), t[0] * (opts.side ?? 1)];
    for (; left <= L; left += every) pts.push([x1 + t[0] * left + n[0] * inset, z1 + t[1] * left + n[1] * inset]);
    left -= L;
  }
  for (const [x, z] of pts) {
    K.add("iron", at(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 10), x, base + 0.45, z)); // (the base)
    K.add("iron", at(new THREE.CylinderGeometry(0.07, 0.11, 2.9, 10), x, base + 2.35, z)); // (the column)
    K.box("iron", 0.8, 0.05, 0.05, x, base + 3.35, z); // (the ladder bar)
    K.add("iron", at(new THREE.CylinderGeometry(0.12, 0.08, 0.15, 4, 1, false, Math.PI / 4), x, base + 3.88, z)); // (the lantern's foot)
    K.add("lantern", at(new THREE.CylinderGeometry(0.24, 0.16, 0.5, 4, 1, false, Math.PI / 4), x, base + 4.2, z));
    K.add("iron", at(new THREE.ConeGeometry(0.3, 0.28, 4, 1, false, Math.PI / 4), x, base + 4.59, z)); // (its cap)
    K.add("iron", at(new THREE.SphereGeometry(0.05, 6, 4), x, base + 4.78, z));
  }
  const res = finish(group, K, M, { ring: ring, base, top: base + 4.8 });
  res.glow = [M.lantern];
  return res;
}

export const WHITBY_BUILDERS = { westPierLight, eastPierLight, pierBeacon, whitbyAbbey, stMarys, footbridge, lampRow };
