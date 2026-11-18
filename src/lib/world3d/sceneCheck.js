// ---- sceneCheck: is the real place, as actually built, fit to stand in? (three.js; runs once as the view opens) ----
// The layout check (osmPlace.checkLayout) works on the map's coordinates. This one casts rays at the meshes that were
// really drawn, from where each angler's eyes are: standing on the deck (not floating, not sunk into it), nothing
// round or above them (not inside a building or under something), a clear view down to the water, and water (not
// ground) in front. A real place that fails isn't shown as one: the representative place is used instead.
import * as THREE from "three";

export const SCENE_CHECK = { eye: 1.62, deckTol: 0.3, clear: 0.45, above: 4, view: [8, 14, 20, 26], spread: [-0.26, 0, 0.26] };

// ---- the rays, against the triangles near the anglers only, kept in a grid ----
// (three.js tests a ray against every triangle of every mesh whose bounds it crosses: the ground's grid and the town's
// merged walls are each one big mesh round everything, so the 200-odd rays here took 1.7 s on Aaron's PC as a place
// opened, 18 November. The same test, on the triangles within reach of the spots: front faces only where the material
// is one-sided, as three.js does)
const CELL = 3;
function nearTriangles(targets, spots, reach = 32) {
  const tris = [], objs = [], cells = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
  const near = (x0, z0, x1, z1) => spots.some(({ at: [x, , z] }) => x1 > x - reach && x0 < x + reach && z1 > z - reach && z0 < z + reach);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), M = new THREE.Matrix4(), IM = new THREE.Matrix4();
  for (const o of targets) {
    const g = o.geometry, pos = g?.attributes?.position; if (!pos) continue;
    o.updateWorldMatrix(true, false);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material, two = !mat || mat.side !== THREE.FrontSide, idx = g.index, nTri = idx ? idx.count / 3 : pos.count / 3;
    const inst = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < inst; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, IM); M.multiplyMatrices(o.matrixWorld, IM); } else M.copy(o.matrixWorld);
      for (let t = 0; t < nTri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(M); b.fromBufferAttribute(pos, i1).applyMatrix4(M); c.fromBufferAttribute(pos, i2).applyMatrix4(M);
        const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x), z0 = Math.min(a.z, b.z, c.z), z1 = Math.max(a.z, b.z, c.z);
        if (!near(x0, z0, x1, z1)) continue;
        const n = tris.length / 9; tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); objs.push(o, two);
        for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const kk = key(i, j); let l = cells.get(kk); if (!l) cells.set(kk, (l = [])); l.push(n); }
      }
    }
  }
  return { tris, objs, cells, key };
}
function gridHit(G, o, d, far) {
  const { tris, objs, cells, key } = G, ex = o.x + d.x * far, ez = o.z + d.z * far, seen = new Set();
  let best = null;
  const i0 = Math.floor(Math.min(o.x, ex) / CELL), i1 = Math.floor(Math.max(o.x, ex) / CELL), j0 = Math.floor(Math.min(o.z, ez) / CELL), j1 = Math.floor(Math.max(o.z, ez) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const l = cells.get(key(i, j)); if (!l) continue;
    for (const n of l) {
      if (seen.has(n)) continue; seen.add(n);
      const p = n * 9, e1x = tris[p + 3] - tris[p], e1y = tris[p + 4] - tris[p + 1], e1z = tris[p + 5] - tris[p + 2], e2x = tris[p + 6] - tris[p], e2y = tris[p + 7] - tris[p + 1], e2z = tris[p + 8] - tris[p + 2];
      const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-10) continue;
      if (det < 0 && !objs[n * 2 + 1]) continue; // (a back face of a one-sided surface: not hit, as three.js)
      const inv = 1 / det, tx = o.x - tris[p], ty = o.y - tris[p + 1], tz = o.z - tris[p + 2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d.x * qx + d.y * qy + d.z * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t < 0 || t > far) continue;
      if (!best || t < best.distance) best = { distance: t, object: objs[n * 2] };
    }
  }
  return best;
}

export function checkScene(place, targets) {
  const G = nearTriangles(targets, place.spots || []);
  const why = [], hit = (o, d, far) => gridHit(G, o, d, far);
  for (const sp of place.spots || []) {
    const [x, y, z] = sp.at, eye = new THREE.Vector3(x, y + SCENE_CHECK.eye, z), f = new THREE.Vector3(Math.sin(sp.face), 0, -Math.cos(sp.face));
    const down = hit(eye, new THREE.Vector3(0, -1, 0), 10);
    if (!down || Math.abs(eye.y - down.distance - y) > SCENE_CHECK.deckTol) why.push(`${sp.name}: not standing on the deck`);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); for (const hgt of [0.4, 1.0, SCENE_CHECK.eye]) { const h = hit(new THREE.Vector3(x, y + hgt, z), d, SCENE_CHECK.clear); if (h) { why.push(`${sp.name}: something within ${SCENE_CHECK.clear} m`); k = 99; break; } } }
    if (hit(eye, new THREE.Vector3(0, 1, 0), SCENE_CHECK.above)) why.push(`${sp.name}: something overhead`);
    let blocked = 0, n = 0; const by = new Set();
    // across a river: past the bank (from a 2.2 m bank the water right below it is out of sight), short of the far bank
    const dists = place.venue === "river" ? [8, 11, 14] : place.venue === "lake" ? [8, 14, 20] : SCENE_CHECK.view;
    for (const m of dists) for (const s of SCENE_CHECK.spread) {
      const dir = f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s), target = new THREE.Vector3(x + dir.x * m, 0.05, z + dir.z * m), v = target.clone().sub(eye), L = v.length();
      n++; const h = hit(eye, v.normalize(), L - 0.4); if (h) { blocked++; by.add(h.object.userData.kind || "something"); }
    }
    if (blocked > n * 0.25) why.push(`${sp.name}: the view of the water is blocked by ${[...by].join(" and ")} (${blocked} of ${n})`);
    // water a few metres out (a bank slopes into it, so a river or lake is looked at a little further out)
    const out = place.venue === "river" || place.venue === "lake" ? 9 : 6, ahead = new THREE.Vector3(x + f.x * out, y + 3, z + f.z * out), d2 = hit(ahead, new THREE.Vector3(0, -1, 0), 8);
    if (d2 && ahead.y - d2.distance > 0.3) why.push(`${sp.name}: ground, not water, in front`);
  }
  return { ok: !why.length, why };
}
