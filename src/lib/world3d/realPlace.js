// ---- realPlace: the meshes for a real place built from OpenStreetMap (see osmPlace.js) ----
// The ground from the grid, but with its edge snapped exactly onto the water's edge wherever there's a wall, so a deck
// meets its wall cleanly (sampled every few metres, the edge used to slope down below the water inside the wall and the
// sea showed through the walkway). Harbour walls only along real land-to-water edges (osmPlace.shoreEdges), drawn as
// steel sheet piling under a concrete cap; galvanised railings along them near the anglers; jetties on piles; the
// buildings from the architecture library (buildings3d.js). Materials are drawn on the phone (textures3d.js).
import * as THREE from "three";
import { unrle, GROUND, PLACE3D, inside } from "./osmPlace.js";
import { concrete, sheetPiling, detail, noise2 } from "./textures3d.js";
import { buildBuildings } from "./buildings3d.js";

const H_OF = [GROUND.water, GROUND.land, GROUND.beach, GROUND.grass];
// colours multiplied over the materials: concrete stays near white (its texture has the colour); sand, grass and the
// beach's wet slope under the water carry their own colour over a neutral detail map
const COL_OF = [[0.42, 0.44, 0.4], [1, 1, 1], [0.62, 0.54, 0.4], [0.3, 0.42, 0.2]];
const WALL_BOTTOM = GROUND.water - 0.8;
// what's within this distance of a fishing spot is also a solid for the camera (the rest is never close enough)
const NEAR_SOLID = 45;
const RAIL = { within: 260, inset: 0.22, h: 1.1, post: 2.0 };

// nearest wall segment to a point, through a grid of 8 m cells
function segIndex(segs, cell = 8) {
  const m = new Map(), key = (i, j) => i * 100003 + j;
  segs.forEach((s, n) => {
    const i0 = Math.floor(Math.min(s[0], s[2]) / cell) - 1, i1 = Math.floor(Math.max(s[0], s[2]) / cell) + 1, j0 = Math.floor(Math.min(s[1], s[3]) / cell) - 1, j1 = Math.floor(Math.max(s[1], s[3]) / cell) + 1;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!m.has(k)) m.set(k, []); m.get(k).push(n); }
  });
  return (x, z) => {
    const list = m.get(key(Math.floor(x / cell), Math.floor(z / cell))); if (!list) return null;
    let best = null;
    for (const n of list) {
      const [x1, z1, x2, z2] = segs[n], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2));
      const px = x1 + dx * t, pz = z1 + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, p: [px, pz], s: segs[n] };
    }
    return best;
  };
}

export function buildRealPlace(group, place, M, solids = []) {
  const spots = place.spots || [], nearSpot = (x, z, r = NEAR_SOLID) => spots.some((sp) => Math.hypot(x - sp.at[0], z - sp.at[2]) < r);
  const xs = place.grid.xs, n = xs.length, cls = unrle(place.grid.cls, n * n);
  const inland = place.venue === "river" || place.venue === "lake";
  const LAND = GROUND.land;
  const targets = []; // what the rendered-geometry check casts its rays at (world.js)
  const walls = (place.edges || []).filter((e) => e[6] === "wall");
  const nearestWall = segIndex(walls);
  // the exact land, for the vertices along a wall (the grid's own answer is only right to a cell)
  const landRings = place.land || [], waterRings = place.water || [], pierRings = (place.piers || []).filter((p) => p.ring).map((p) => p.ring);
  const bb = (r) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { r, x0, x1, z0, z1 }; };
  const LR = landRings.map(bb), WR = waterRings.map(bb), PR = pierRings.map(bb), inB = (q, b) => q[0] >= b.x0 && q[0] <= b.x1 && q[1] >= b.z0 && q[1] <= b.z1 && inside(q, b.r);
  const landAt = (q) => (LR.some((b) => inB(q, b)) || PR.some((b) => inB(q, b))) && !WR.some((b) => inB(q, b));

  // ---- the ground ----
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const solid = new Uint8Array(n * n); // 1: land or a vertex moved onto a wall's line
  const h = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) { h[k] = H_OF[cls[k]]; solid[k] = cls[k] !== 0 ? 1 : 0; }
  // beaches slope gently into the water (walls stay upright)
  for (let it = 0; it < 4; it++) {
    const nh = h.slice();
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i, c = cls[k];
      if (c !== 2 && c !== 0) continue;
      const nb = [k - 1, k + 1, k - n, k + n];
      if (c === 0 && !nb.some((q) => cls[q] === 2)) continue;
      nh[k] = (h[k] * 2 + nb.reduce((s, q) => s + h[q], 0)) / 6;
    }
    h.set(nh);
  }
  const X = new Float32Array(n * n), Z = new Float32Array(n * n), wet = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; X[k] = xs[i]; Z[k] = xs[j]; }
  // along every wall: a vertex on the water side within a cell of it moves onto the wall's line, at the deck's height;
  // a land vertex the grid called water is put back. The ground then ends exactly at the wall's top.
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, cell = Math.max(xs[i + 1] - xs[i], xs[j + 1] - xs[j]);
    if (cell > 7) continue;
    let mixed = false;
    for (const q of [k - 1, k + 1, k - n, k + n, k - n - 1, k - n + 1, k + n - 1, k + n + 1]) if ((cls[q] === 0) !== (cls[k] === 0)) { mixed = true; break; }
    if (!mixed) continue;
    const w = nearestWall(X[k], Z[k]); if (!w || w.d > cell * 1.5) continue;
    if (cls[k] === 2 || cls[k] === 3) continue;
    if (landAt([X[k], Z[k]])) { h[k] = LAND; solid[k] = 1; wet[k] = 1 - w.d / (cell * 1.5); continue; }
    X[k] = w.p[0] - w.s[4] * 0.02; Z[k] = w.p[1] - w.s[5] * 0.02; h[k] = LAND; solid[k] = 1; wet[k] = 1;
  }
  for (let k = 0; k < n * n; k++) {
    const c = COL_OF[solid[k] && cls[k] === 0 ? 1 : cls[k]];
    // large, soft variations (no per-vertex checker), and damp concrete near the edge
    const v = 0.9 + noise2(X[k] / 23, Z[k] / 23, 1e6, 3) * 0.14 + noise2(X[k] / 7, Z[k] / 7, 1e6, 4) * 0.06 - wet[k] * 0.12;
    pos.set([X[k], h[k], Z[k]], k * 3); col.set([c[0] * v, c[1] * v, c[2] * v], k * 3);
    uv.set([X[k] / 8, Z[k] / 8], k * 2); // one concrete tile = 8 m (joints every 4 m)
  }
  const idxDeck = [], idxSoft = [];
  const addTri = (a, b, c) => {
    const sa = solid[a], sb = solid[b], sc = solid[c];
    if (!sa && !sb && !sc && h[a] < -1 && h[b] < -1 && h[c] < -1) return; // open water: nothing to draw
    const soft = [a, b, c].some((q) => cls[q] === 2 || cls[q] === 3) || inland;
    // a triangle reaching from a wall out into the water would stand above the water in front of the wall: only beaches
    // and banks slope into the water
    if (!(sa && sb && sc) && !soft) return;
    (soft ? idxSoft : idxDeck).push(a, b, c);
  };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; addTri(a, c, b); addTri(b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const all = idxDeck.concat(idxSoft);
  g.setIndex(n * n > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.addGroup(0, idxDeck.length, 0); g.addGroup(idxDeck.length, idxSoft.length, 1);
  g.computeVertexNormals();
  const cTex = concrete({ seed: 3 }), dTex = detail(13);
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: cTex.map, normalMap: cTex.normalMap, roughnessMap: cTex.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.45, 0.45) });
  const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dTex.map, normalMap: dTex.normalMap, roughness: 1 });
  const ground = new THREE.Mesh(g, [deckMat, softMat]);
  ground.receiveShadow = true; group.add(ground); targets.push(ground);
  place.deckMat = deckMat; // world.js darkens it in the rain

  const groundAt = (x, z) => { const c = cAt(x, z); return c === 0 ? 0 : H_OF[c]; };
  // ---- streets: tarmac with a pale pavement and kerb either side (from the map's roads) ----
  {
    const T = { p: [], uv: [], i: [] }, Pv = { p: [], uv: [], i: [] };
    const ribbon = (Bk, line, w0, w1, y) => {
      // a strip from w0 to w1 metres out from the centre line, on both sides when w0 > 0 (pavements)
      for (const side of w0 > 0 ? [-1, 1] : [1]) {
        let run = 0;
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, z1] = line[k], [x2, z2] = line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          if (groundAt(x1, z1) === 0 && groundAt(x2, z2) === 0) { run += len; continue; }
          const nx = -(z2 - z1) / len, nz = (x2 - x1) / len, a0 = w0 > 0 ? side * w0 : -w1, a1 = w0 > 0 ? side * w1 : w1;
          const ya = groundAt(x1, z1) + y, yb = groundAt(x2, z2) + y, o = Bk.p.length / 3;
          // ends pushed a little past each node so consecutive pieces overlap at bends instead of leaving a notch
          const ex = ((x2 - x1) / len) * Math.min(1.5, w1 * 0.5), ez = ((z2 - z1) / len) * Math.min(1.5, w1 * 0.5);
          Bk.p.push(x1 - ex + nx * a0, ya, z1 - ez + nz * a0, x2 + ex + nx * a0, yb, z2 + ez + nz * a0, x2 + ex + nx * a1, yb, z2 + ez + nz * a1, x1 - ex + nx * a1, ya, z1 - ez + nz * a1);
          Bk.uv.push(run / 6, 0, (run + len) / 6, 0, (run + len) / 6, (a1 - a0) / 6, run / 6, (a1 - a0) / 6);
          if (side > 0 || w0 === 0) Bk.i.push(o, o + 2, o + 1, o, o + 3, o + 2); else Bk.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
          run += len;
        }
      }
    };
    for (const r of place.roads || []) { if (r.line.some(([x, z]) => nearSpot(x, z, 25))) continue; ribbon(T, r.line, 0, r.w / 2, 0.035); if (r.kind === "tarmac") ribbon(Pv, r.line, r.w / 2, r.w / 2 + 1.8, 0.11); }
    const mk = (Bk, mat) => { if (!Bk.i.length) return; const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(Bk.p, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(Bk.uv, 2)); g2.setIndex(Bk.i); g2.computeVertexNormals(); const m = new THREE.Mesh(g2, mat); m.receiveShadow = true; group.add(m); };
    mk(T, new THREE.MeshStandardMaterial({ map: dTex.map, normalMap: dTex.normalMap, color: 0x46484b, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
    mk(Pv, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xd8d4cc, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
  }

  // ---- harbour walls: steel sheet piling under a concrete cap, along the real water's edge ----
  const sp = sheetPiling({ water: (0 - WALL_BOTTOM) / (LAND - WALL_BOTTOM) });
  const wp = [], wuv = [], wi = [], cp = [], cuv = [], ci = [], cwp = [], cwi = [];
  let run = 0;
  for (const e of walls) {
    let [x1, z1, x2, z2, nx, nz] = e;
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
    // face the water: (b - a) turned left is the face's normal; swap the ends if that points at the land
    if ((-(z2 - z1)) * nx + (x2 - x1) * nz < 0) { [x1, z1, x2, z2] = [x2, z2, x1, z1]; }
    const o = wp.length / 3, u0 = run / 2.4, u1 = (run + len) / 2.4; run += len;
    wp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND, z2, x1, LAND, z1);
    wuv.push(u0, 0, u1, 0, u1, 1, u0, 1); wi.push(o, o + 1, o + 2, o, o + 2, o + 3);
    // the cap: a concrete lip standing 12 cm proud of the piling, with its top and its underside
    const ox = nx * 0.12, oz = nz * 0.12, c0 = cp.length / 3, yT = LAND + 0.03, yB = LAND - 0.45;
    cp.push(x1 + ox, yB, z1 + oz, x2 + ox, yB, z2 + oz, x2 + ox, yT, z2 + oz, x1 + ox, yT, z1 + oz); // front
    cp.push(x1 + ox, yT, z1 + oz, x2 + ox, yT, z2 + oz, x2 - ox, yT, z2 - oz, x1 - ox, yT, z1 - oz); // top
    cp.push(x1, yB, z1, x2, yB, z2, x2 + ox, yB, z2 + oz, x1 + ox, yB, z1 + oz); // underside
    for (let q = 0; q < 3; q++) { cuv.push(u0 * 0.3, 0, u1 * 0.3, 0, u1 * 0.3, 0.06, u0 * 0.3, 0.06); ci.push(c0 + q * 4, c0 + q * 4 + 1, c0 + q * 4 + 2, c0 + q * 4, c0 + q * 4 + 2, c0 + q * 4 + 3); }
    if (nearSpot((x1 + x2) / 2, (z1 + z2) / 2)) { const c = cwp.length / 3; cwp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.05, z2, x1, LAND + 0.05, z1); cwi.push(c, c + 1, c + 2, c, c + 2, c + 3); }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughnessMap: sp.roughnessMap, roughness: 1, metalness: 0.15 })); wm.receiveShadow = true; group.add(wm); targets.push(wm);
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute("uv", new THREE.Float32BufferAttribute(cuv, 2)); cg.setIndex(ci); cg.computeVertexNormals();
    const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.9, color: 0xe6e2da, side: THREE.DoubleSide })); cm.receiveShadow = true; cm.castShadow = true; group.add(cm);
  }
  if (cwp.length) solids.push(collider(cwp, cwi));

  // ---- railings along the walls near the anglers: posts every 2 m, a top and a middle rail, a brace every few bays ----
  const railMat = new THREE.MeshStandardMaterial({ color: 0xa9adaf, metalness: 0.55, roughness: 0.42 });
  const posts = [], rails = [];
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.5 || Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
    const ix = -nx * RAIL.inset, iz = -nz * RAIL.inset, a = [x1 + ix, z1 + iz], b = [x2 + ix, z2 + iz];
    if (!landAt([(a[0] + b[0]) / 2 - nx * 0.6, (a[1] + b[1]) / 2 - nz * 0.6])) continue;
    const nPost = Math.max(1, Math.round(len / RAIL.post));
    for (let q = 0; q < nPost; q++) { const f = q / nPost; posts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
    for (const y of [RAIL.h, RAIL.h * 0.5]) rails.push({ a: [a[0], LAND + y, a[1]], b: [b[0], LAND + y, b[1]], r: y === RAIL.h ? 0.026 : 0.018 });
    for (let q = 0; q + 1 < nPost; q += 3) { const f0 = q / nPost, f1 = (q + 1) / nPost; rails.push({ a: [a[0] + (b[0] - a[0]) * f0, LAND + 0.08, a[1] + (b[1] - a[1]) * f0], b: [a[0] + (b[0] - a[0]) * f1, LAND + RAIL.h * 0.5, a[1] + (b[1] - a[1]) * f1], r: 0.014 }); }
  }
  if (posts.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 8), railMat, posts.length), mx = new THREE.Matrix4();
    posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); pm.castShadow = true; group.add(pm);
  }
  if (rails.length) {
    const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), railMat, rails.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    rails.forEach(({ a, b, r }, q) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(); const qt = new THREE.Quaternion().setFromUnitVectors(up, d.normalize()); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), qt, new THREE.Vector3(r, L + 0.06, r)); rm.setMatrixAt(q, mx); });
    rm.castShadow = true; group.add(rm);
  }
  place.railings = posts.length;

  // ---- on the pier: lamp posts, lifebuoys and benches along the edge (never on a fishing spot) ----
  const glowLamp = new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  const mPost = new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5, metalness: 0.5 });
  const mBuoy = new THREE.MeshStandardMaterial({ color: 0xf06a1a, roughness: 0.6 }), mBox = new THREE.MeshStandardMaterial({ color: 0xb8312b, roughness: 0.55 });
  const mWood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  const addAt = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; group.add(m); return m; };
  let acc = 0;
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > 200) { acc += len; continue; }
    for (let t = 0; t < len; t += 1) {
      const d = acc + t, f = t / len, ex = x1 + (x2 - x1) * f, ez = z1 + (z2 - z1) * f, ry = Math.atan2(nx, nz);
      const inAt = (m) => [ex - nx * m, ez - nz * m];
      const clearOfSpots = (q) => spots.every((sp) => Math.hypot(q[0] - sp.at[0], q[1] - sp.at[2]) > 4);
      if (Math.floor(d / 28) !== Math.floor((d - 1) / 28)) {
        const q = inAt(0.75); if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q)) {
          addAt(new THREE.CylinderGeometry(0.06, 0.09, 5, 8), mPost, q[0], LAND + 2.5, q[1]);
          const arm = addAt(new THREE.BoxGeometry(0.06, 0.06, 0.8), mPost, q[0] - nx * 0.35, LAND + 4.95, q[1] - nz * 0.35, ry);
          addAt(new THREE.BoxGeometry(0.34, 0.22, 0.5), glowLamp, q[0] - nx * 0.7, LAND + 4.85, q[1] - nz * 0.7, ry); void arm;
        }
      }
      if (Math.floor((d + 14) / 55) !== Math.floor((d + 13) / 55)) {
        const q = inAt(0.6); if (landAt(q) && clearOfSpots(q)) {
          addAt(new THREE.BoxGeometry(0.62, 0.95, 0.22), mBox, q[0], LAND + 0.9, q[1], ry);
          const buoy = addAt(new THREE.TorusGeometry(0.27, 0.07, 8, 18), mBuoy, q[0] + nx * 0.13, LAND + 0.95, q[1] + nz * 0.13, ry); void buoy;
          addAt(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mPost, q[0], LAND + 0.25, q[1]);
        }
      }
      if (Math.floor((d + 20) / 40) !== Math.floor((d + 19) / 40)) {
        const q = inAt(2.6); if (landAt(q) && landAt(inAt(3.4)) && clearOfSpots(q)) {
          const ax = -nz, az = nx; // along the edge
          for (const [h, back, th] of [[0.45, 0, 0.42], [0.8, -0.2, 0.08]]) addAt(new THREE.BoxGeometry(1.8, th === 0.42 ? 0.06 : 0.36, th === 0.42 ? 0.42 : 0.05), mWood, q[0] - nx * back, LAND + h, q[1] - nz * back, ry);
          for (const s2 of [-0.8, 0.8]) addAt(new THREE.BoxGeometry(0.06, 0.45, 0.42), mPost, q[0] + ax * s2, LAND + 0.22, q[1] + az * s2, ry);
        }
      }
    }
    acc += len;
  }
  place.buildingGlow = [glowLamp];

  // ---- buildings ----

  const res = buildBuildings(group, place.buildings || [], {
    groundAt: (x, z) => groundAt(x, z) || LAND,
    // nothing on a fishing spot, the deck round it or in front of it
    avoid: (x, z) => spots.some((s) => Math.hypot(x - s.at[0], z - s.at[2]) < 6),
    near: (x, z) => nearSpot(x, z, NEAR_SOLID + 30),
  });
  place.buildingGlow = [...(place.buildingGlow || []), ...res.glow]; targets.push(...res.meshes);
  for (const c of res.colliders) {
    const cbp = [], cbi = [];
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }

  // ---- piers drawn as a line (jetties on piles), outlines (breakwaters), groynes ----
  const pileMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.95 });
  const deckSlab = new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.95, color: 0xdedad2 });
  for (const p of place.piers) {
    if (p.line) {
      const deckY = p.kind === "groyne" ? 1.2 : Math.min(p.h, LAND + 0.6), w = p.kind === "groyne" ? 0.5 : Math.min(p.width, 6);
      for (let k = 0; k < p.line.length - 1; k++) {
        const [x1, z1] = p.line[k], [x2, z2] = p.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
        const ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        if (p.kind === "groyne") { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, w), M.wood); m.position.set(cx, 0.4, cz); m.rotation.y = -ang; group.add(m); continue; }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.4, w), deckSlab); deck.position.set(cx, deckY - 0.2, cz); deck.rotation.y = -ang; deck.castShadow = deck.receiveShadow = true; group.add(deck); targets.push(deck);
        if (nearSpot(cx, cz, NEAR_SOLID + len / 2)) solids.push(deck);
        const sx = Math.sin(ang), sz = -Math.cos(ang);
        for (let t = 0; t <= len; t += 4) for (const side of [-1, 1]) {
          const f = t / len, px = x1 + (x2 - x1) * f + sx * side * (w / 2 - 0.3), pz = z1 + (z2 - z1) * f + sz * side * (w / 2 - 0.3);
          if (landAt([px, pz])) continue;
          const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, deckY - WALL_BOTTOM, 8), pileMat); pile.position.set(px, (deckY + WALL_BOTTOM) / 2 - 0.2, pz); group.add(pile);
        }
        for (const side of [-1, 1]) for (const y of [RAIL.h, RAIL.h * 0.5]) {
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), railMat); r.position.set(cx + sx * side * (w / 2 - 0.12), deckY + y, cz + sz * side * (w / 2 - 0.12)); r.rotation.z = Math.PI / 2; r.rotation.y = -ang; group.add(r);
        }
      }
    } else if (p.ring && p.ring.length >= 3) {
      const ring = p.ring.slice(); if (THREE.ShapeUtils.isClockWise(ring.map(([x, z]) => new THREE.Vector2(x, z)))) ring.reverse();
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: p.h - WALL_BOTTOM, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, WALL_BOTTOM, 0);
      const m = new THREE.Mesh(geo, [deckSlab, new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughness: 0.9 })]); m.castShadow = m.receiveShadow = true; group.add(m); targets.push(m);
      if (ring.some(([x, z]) => nearSpot(x, z, NEAR_SOLID + 60))) solids.push(m);
    }
  }
  place.targets = targets;
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  function cAt(x, z) { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; }
  void PLACE3D;
  return (x, z) => { const c = cAt(x, z); if (c !== 0) return H_OF[c]; const w = nearestWall(x, z); return w && w.d < 3 && landAt([x, z]) ? LAND : 0; };
}
// a mesh only for the camera's ray (never drawn)
function collider(p, i) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
