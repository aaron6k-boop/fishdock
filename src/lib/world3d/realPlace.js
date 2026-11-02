// ---- realPlace: the meshes for a real place built from OpenStreetMap (see osmPlace.js) ----
// The ground from the grid (land, beaches and grass above the water, the water's edge sloping where it's a beach
// and steep where it's a wall), every building with its own height, and the piers, breakwaters and groynes.
import * as THREE from "three";
import { unrle, GROUND, PLACE3D } from "./osmPlace.js";

function tex(draw, size = 128) {
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// paving and tarmac with joints and wear; a wall of windows with a plain border (roofs use the border)
const pavingTex = () => tex((g, n) => {
  g.fillStyle = "#c9c6be"; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 1400; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 40},${v > 0.5 ? 255 : 40},${v > 0.5 ? 255 : 40},${Math.random() * 0.12})`; g.fillRect(Math.random() * n, Math.random() * n, 2, 2); }
  g.strokeStyle = "rgba(60,58,52,.35)"; g.lineWidth = 1.5; for (let k = 0; k <= n; k += n / 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, n); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(n, k); g.stroke(); }
});
const windowTex = () => tex((g, n) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, n, n);
  g.fillStyle = "#3b4654"; g.fillRect(n * 0.3, n * 0.25, n * 0.4, n * 0.45);
  g.fillStyle = "#6d7f92"; g.fillRect(n * 0.32, n * 0.27, n * 0.17, n * 0.41);
  g.fillStyle = "#e8e4dc"; g.fillRect(n * 0.28, n * 0.7, n * 0.44, n * 0.04);
}, 64);

const H_OF = [GROUND.water, GROUND.land, GROUND.beach, GROUND.grass];
const COL_OF = [[0.25, 0.3, 0.28], [0.52, 0.52, 0.46], [0.84, 0.76, 0.56], [0.36, 0.5, 0.26]];

// what's within this distance of a fishing spot is also a solid for the camera (the rest is never close enough)
const NEAR_SOLID = 45;

export function buildRealPlace(group, place, M, solids = []) {
  const spots = place.spots || [], nearSpot = (x, z, r = NEAR_SOLID) => spots.some((sp) => Math.hypot(x - sp.at[0], z - sp.at[2]) < r);
  const xs = place.grid.xs, n = xs.length, cls = unrle(place.grid.cls, n * n);
  // ---- the ground ----
  const h = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) h[k] = H_OF[cls[k]];
  // beaches slope gently into the water; walls stay steep
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
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, c = COL_OF[cls[k]], v = 0.92 + ((i * 7919 + j * 104729) % 97) / 97 * 0.16;
    pos.set([xs[i], h[k], xs[j]], k * 3); col.set([c[0] * v, c[1] * v, c[2] * v], k * 3);
  }
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) uv.set([xs[i] / 2.5, xs[j] / 2.5], (j * n + i) * 2); // 2.5 m paving slabs
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (cls[a] === 0 && cls[b] === 0 && cls[c] === 0 && cls[d] === 0 && h[a] < -1 && h[b] < -1 && h[c] < -1 && h[d] < -1) continue; // open water: nothing to draw
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(n * n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: pavingTex() }));
  ground.receiveShadow = true; group.add(ground);

  // ---- harbour walls: upright faces along the real water's edge (not on beaches) ----
  const H = PLACE3D.box, cAt = (x, z) => { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; };
  const wp = [], wi = [], wuv = [], cwp = [], cwi = [];
  for (const ring of [...(place.land || []), ...(place.water || [])]) {
    for (let k = 0; k < ring.length; k++) {
      const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length];
      if (Math.max(Math.abs(x1), Math.abs(z1), Math.abs(x2), Math.abs(z2)) > H) continue;
      const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, nx = -(z2 - z1) / len * 3, nz = (x2 - x1) / len * 3;
      if (cAt(mx + nx, mz + nz) === 2 || cAt(mx - nx, mz - nz) === 2) continue; // a beach: no wall
      const o = wp.length / 3;
      wp.push(x1, GROUND.water - 0.6, z1, x2, GROUND.water - 0.6, z2, x2, GROUND.land + 0.05, z2, x1, GROUND.land + 0.05, z1);
      if (nearSpot(mx, mz)) { const c = cwp.length / 3; cwp.push(x1, GROUND.water - 0.6, z1, x2, GROUND.water - 0.6, z2, x2, GROUND.land + 0.05, z2, x1, GROUND.land + 0.05, z1); cwi.push(c, c + 1, c + 2, c, c + 2, c + 3); }
      wuv.push(0, 0, len / 4, 0, len / 4, 1, 0, 1);
      wi.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: M.stone.map, color: 0x8a867c, roughness: 0.95, side: THREE.DoubleSide })); wm.receiveShadow = true; group.add(wm);
  }
  if (cwp.length) solids.push(collider(cwp, cwi));

  // ---- buildings: walls and flat roofs, all in one mesh ----
  const bp = [], bc = [], bi = [], bu = [], cbp = [], cbi = [];
  const palette = [[0.86, 0.82, 0.74], [0.78, 0.7, 0.6], [0.9, 0.88, 0.84], [0.7, 0.6, 0.52], [0.82, 0.76, 0.66], [0.64, 0.6, 0.58]];
  place.buildings.forEach((b, n2) => {
    const ring = b.ring.slice(); if (ring.length < 3) return;
    if (THREE.ShapeUtils.isClockWise(ring.map(([x, z]) => new THREE.Vector2(x, z)))) ring.reverse();
    const base = GROUND.land - 0.3, top = GROUND.land + b.h, c = palette[n2 % palette.length], roof = [0.42, 0.3, 0.26];
    for (let k = 0; k < ring.length; k++) {
      const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length], o = bp.length / 3, shade = 0.8 + 0.2 * Math.abs(Math.sin(Math.atan2(z2 - z1, x2 - x1)));
      bp.push(x1, base, z1, x2, base, z2, x2, top, z2, x1, top, z1);
      const wl = Math.hypot(x2 - x1, z2 - z1) / 3.2, hl = (top - base) / 3;
      bu.push(0, 0, wl, 0, wl, hl, 0, hl);
      for (let q = 0; q < 4; q++) bc.push(c[0] * shade, c[1] * shade, c[2] * shade);
      bi.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    const tri = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []), o = bp.length / 3;
    for (const [x, z] of ring) { bp.push(x, top, z); bc.push(...(b.h > 9 ? c.map((v) => v * 0.7) : roof)); bu.push(0.03, 0.03); }
    for (const [a, b2, c2] of tri) bi.push(o + a, o + c2, o + b2);
    if (nearSpot(ring[0][0], ring[0][1], NEAR_SOLID + 30)) {
      for (let k = 0; k < ring.length; k++) { const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length], c = cbp.length / 3; cbp.push(x1, base, z1, x2, base, z2, x2, top, z2, x1, top, z1); cbi.push(c, c + 2, c + 1, c, c + 3, c + 2); }
    }
  });
  if (cbp.length) solids.push(collider(cbp, cbi));
  if (bp.length) {
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute("color", new THREE.Float32BufferAttribute(bc, 3)); bg.setAttribute("uv", new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi); bg.computeVertexNormals();
    const wt = windowTex(); place.windowTex = wt;
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, map: wt, emissive: 0xffc070, emissiveIntensity: 0, emissiveMap: wt }));
    place.buildingMat = bm.material; bm.castShadow = true; bm.receiveShadow = true; group.add(bm);
  }

  // ---- piers, breakwaters, quays and groynes ----
  const pierMat = { pier: M.stone, quay: M.stone, breakwater: M.cliff, groyne: M.wood };
  for (const p of place.piers) {
    const mat = pierMat[p.kind] || M.stone;
    if (p.line) {
      for (let k = 0; k < p.line.length - 1; k++) {
        const [x1, z1] = p.line[k], [x2, z2] = p.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
        const ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len + p.width * 0.5, p.h - GROUND.water + 0.5, p.width), mat);
        deck.position.set(cx, (p.h + GROUND.water - 0.5) / 2, cz); deck.rotation.y = -ang; deck.castShadow = deck.receiveShadow = true; group.add(deck);
        if (nearSpot(cx, cz, NEAR_SOLID + len / 2)) solids.push(deck);
        if (p.kind === "pier") for (const side of [-1, 1]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), M.rail); r.position.set(cx + Math.sin(ang) * side * (p.width / 2 - 0.15), p.h + 1.05, cz - Math.cos(ang) * side * (p.width / 2 - 0.15)); r.rotation.y = -ang; group.add(r);
          for (let t = 0; t < len; t += 2.5) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.05, 0.07), M.rail); const f = t / len; post.position.set(x1 + (x2 - x1) * f + Math.sin(ang) * side * (p.width / 2 - 0.15), p.h + 0.52, z1 + (z2 - z1) * f - Math.cos(ang) * side * (p.width / 2 - 0.15)); group.add(post); }
        }
      }
    } else if (p.ring && p.ring.length >= 3) {
      const ring = p.ring.slice(); if (THREE.ShapeUtils.isClockWise(ring.map(([x, z]) => new THREE.Vector2(x, z)))) ring.reverse();
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: p.h - GROUND.water, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, GROUND.water, 0);
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; group.add(m);
      if (ring.some(([x, z]) => nearSpot(x, z, NEAR_SOLID + 60))) solids.push(m);
    }
  }
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  return (x, z) => { const c = cAt(x, z); return c === 0 ? 0 : H_OF[c]; };
}
// a mesh only for the camera's ray (never drawn)
function collider(p, i) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
