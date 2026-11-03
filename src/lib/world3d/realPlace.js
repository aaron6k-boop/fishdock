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
import { loadPart } from "./glbParts.js";
import { buildSkyline } from "./skyline.js";

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

// ---- the deck's concrete: a photographed surface (Poly Haven's concrete_floor_02, CC0, in public/textures/) ----
// The drawn concrete (its joints, stains and the large soft variations in the vertex colours) stays as the large scale;
// the photographed concrete is laid over it at about 2.5 m a tile for the close-up grain, wear and roughness. It is
// sampled twice, at two scales and turned, and blended by the large stains so its repeat doesn't show across a deck.
// Wet (rain) darkens it and makes it shine. Until the photographs have loaded (or if they can't) the drawn one shows.
export const PIER_TEX = "/textures/pier_concrete_";
const PHOTO_TILE = 8 / 2.5; // the deck's uv runs one unit per 8 m
function pierConcrete(mat, quality = 1) {
  const wet = { value: 0 };
  if (typeof document === "undefined") return wet;
  const tl = new THREE.TextureLoader(), get = (n, srgb) => tl.loadAsync(PIER_TEX + n + ".jpg").then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  });
  Promise.all([get("diff", true), get("nor", false), get("rough", false)]).then(([diff, nor, rough]) => {
    nor.repeat.set(PHOTO_TILE, PHOTO_TILE); rough.repeat.set(PHOTO_TILE, PHOTO_TILE);
    mat.normalMap = nor; mat.roughnessMap = rough; mat.normalScale.set(0.9, 0.9);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.pDiff = { value: diff }; sh.uniforms.uWet = wet;
      sh.fragmentShader = "uniform sampler2D pDiff;\nuniform float uWet;\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
        {
          vec2 pu = vMapUv * ${PHOTO_TILE.toFixed(3)};
          vec3 a = texture2D(pDiff, pu).rgb, b = texture2D(pDiff, mat2(0.8, -0.6, 0.6, 0.8) * pu * 0.43 + vec2(0.37, 0.61)).rgb;
          float m = ${quality < 1 ? "0.0" : "smoothstep(0.42, 0.62, texture2D(map, vMapUv * 0.31 + 0.2).g * 1.6)"}; // (one sample on Performance)
          vec3 avg = texture2D(pDiff, vec2(0.5), 12.0).rgb; // its smallest mip: the photograph's own average colour
          vec3 p = mix(a, b, m) / max(avg, vec3(0.02)); // over its average: the drawn colour stays the colour
          p = mix(vec3(dot(p, vec3(0.3, 0.59, 0.11))), p, 0.35);
          diffuseColor.rgb *= mix(vec3(1.0), p, 0.6) * (1.0 - uWet * 0.32);
        }`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.7, 1.0, roughnessFactor) * (1.0 - uWet * 0.55);`);
    };
    mat.customProgramCacheKey = () => "fdpier1" + (quality < 1 ? "p" : "");
    mat.needsUpdate = true;
  }).catch(() => {});
  return wet;
}

// ---- the pier's furniture from Blender: one instanced mesh per piece (a draw call per material for all of them) ----
function placeProps(group, stand, props, glowGlass) {
  loadPart("pierprops").then((scene) => {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const [name, list] of Object.entries(props)) {
      const src = scene.getObjectByName(name + "_mesh") || scene.getObjectByName(name); if (!src || !list.length) continue;
      src.updateWorldMatrix(true, true);
      const meshes = []; src.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) {
        const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(src.matrixWorld).invert().multiply(m.matrixWorld));
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mt) => /glass|bulb/i.test(mt.name) ? glowGlass : mt);
        const im = new THREE.InstancedMesh(geo, mats.length > 1 ? mats : mats[0], list.length);
        list.forEach(([x, y, z, ry], k) => { mx.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry), one); im.setMatrixAt(k, mx); });
        im.castShadow = true; im.receiveShadow = true; group.add(im);
      }
    }
    group.remove(stand);
  }).catch(() => {}); // (the simple shapes stay)
}

export function buildRealPlace(group, place, M, solids = [], quality = 1) {
  const spots = place.spots || [], nearSpot = (x, z, r = NEAR_SOLID) => spots.some((sp) => Math.hypot(x - sp.at[0], z - sp.at[2]) < r);
  const xs = place.grid.xs, n = xs.length, cls = unrle(place.grid.cls, n * n);
  const inland = place.venue === "river" || place.venue === "lake";
  const LAND = GROUND.land;
  const targets = []; // what the rendered-geometry check casts its rays at (world.js)
  const walls = (place.edges || []).filter((e) => e[6] === "wall");
  const perches = []; // lamp tops (wildlife.js)
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
  place.deckWet = pierConcrete(deckMat, quality);
  const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dTex.map, normalMap: dTex.normalMap, roughness: 1 });
  const ground = new THREE.Mesh(g, [deckMat, softMat]);
  ground.receiveShadow = true; group.add(ground); ground.userData.kind = "the ground"; targets.push(ground);
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
  const wp = [], wuv = [], wi = [], wcol = [], cp = [], cuv = [], ci = [], cwp = [], cwi = [];
  // the wall's rows: [height, tint]. Weed and wet steel from below the water up to the tide line, dry above
  const WEED = [0.42, 0.44, 0.3], WET = [0.6, 0.6, 0.52], DRY = [1, 1, 1];
  const WALL_ROWS = [[WALL_BOTTOM, WEED], [-0.05, WEED], [0.55, WET], [Math.min(LAND - 0.3, 1.15), [0.86, 0.86, 0.82]], [LAND, DRY]].filter(([y], i, a) => i === 0 || y > a[i - 1][0] + 0.05);
  let run = 0;
  for (const e of walls) {
    let [x1, z1, x2, z2, nx, nz] = e;
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
    // face the water: (b - a) turned left is the face's normal; swap the ends if that points at the land
    if ((-(z2 - z1)) * nx + (x2 - x1) * nz < 0) { [x1, z1, x2, z2] = [x2, z2, x1, z1]; }
    const o = wp.length / 3, u0 = run / 2.4, u1 = (run + len) / 2.4; run += len;
    // in rows up the wall, so the tide line shows: dark weed and wet piling up to about a metre above the water, then
    // the dry, paler steel
    WALL_ROWS.forEach(([y, c]) => { const v = (y - WALL_BOTTOM) / (LAND - WALL_BOTTOM); wp.push(x1, y, z1, x2, y, z2); wuv.push(u0, v, u1, v); wcol.push(...c, ...c); });
    for (let r = 0; r < WALL_ROWS.length - 1; r++) { const a = o + r * 2; wi.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    // the cap: a concrete lip standing 12 cm proud of the piling, with its top and its underside
    const ox = nx * 0.12, oz = nz * 0.12, c0 = cp.length / 3, yT = LAND + 0.03, yB = LAND - 0.45;
    cp.push(x1 + ox, yB, z1 + oz, x2 + ox, yB, z2 + oz, x2 + ox, yT, z2 + oz, x1 + ox, yT, z1 + oz); // front
    cp.push(x1 + ox, yT, z1 + oz, x2 + ox, yT, z2 + oz, x2 - ox, yT, z2 - oz, x1 - ox, yT, z1 - oz); // top
    cp.push(x1, yB, z1, x2, yB, z2, x2 + ox, yB, z2 + oz, x1 + ox, yB, z1 + oz); // underside
    for (let q = 0; q < 3; q++) { cuv.push(u0 * 0.3, 0, u1 * 0.3, 0, u1 * 0.3, 0.06, u0 * 0.3, 0.06); ci.push(c0 + q * 4, c0 + q * 4 + 1, c0 + q * 4 + 2, c0 + q * 4, c0 + q * 4 + 2, c0 + q * 4 + 3); }
    if (nearSpot((x1 + x2) / 2, (z1 + z2) / 2)) { const c = cwp.length / 3; cwp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.05, z2, x1, LAND + 0.05, z1); cwi.push(c, c + 1, c + 2, c, c + 2, c + 3); }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3)); wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughnessMap: sp.roughnessMap, roughness: 1, metalness: 0.15, vertexColors: true })); wm.receiveShadow = true; group.add(wm); wm.userData.kind = "a harbour wall"; targets.push(wm);
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute("uv", new THREE.Float32BufferAttribute(cuv, 2)); cg.setIndex(ci); cg.computeVertexNormals();
    const cm = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.9, color: 0xe6e2da, side: THREE.DoubleSide })); cm.receiveShadow = true; cm.castShadow = true; group.add(cm);
  }
  if (cwp.length) solids.push(collider(cwp, cwi));

  // ---- railings along the walls near the anglers: posts every 2 m, a top and a middle rail, a brace every few bays ----
  // galvanised steel: dull, mottled zinc (the detail map's blotches), not polished chrome
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb9bdbd, map: dTex.map, metalness: 0.7, roughness: 0.55 });
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
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 10, 1, true), railMat, posts.length), mx = new THREE.Matrix4();
    posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); pm.castShadow = true; group.add(pm);
    // each post's fittings: a domed cap, a ball joint where the middle rail runs through, and a base plate bolted
    // to the deck
    const fit = (geo, y) => { const m = new THREE.InstancedMesh(geo, railMat, posts.length); posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + y, z); m.setMatrixAt(q, mx); }); m.castShadow = true; group.add(m); };
    fit(new THREE.SphereGeometry(0.04, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.55), RAIL.h + 0.02);
    fit(new THREE.SphereGeometry(0.038, 8, 5), RAIL.h * 0.5);
    fit(new THREE.CylinderGeometry(0.075, 0.08, 0.018, 10, 1), 0.009);
  }
  if (rails.length) {
    const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), railMat, rails.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    rails.forEach(({ a, b, r }, q) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(); const qt = new THREE.Quaternion().setFromUnitVectors(up, d.normalize()); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), qt, new THREE.Vector3(r, L + 0.06, r)); rm.setMatrixAt(q, mx); });
    rm.castShadow = true; group.add(rm);
  }
  place.railings = posts.length;

  // ---- on the pier: lamp posts, lifebuoys and benches along the edge (never on a fishing spot) ----
  const glowLamp = new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  const mPost = new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.5, metalness: 0.5 });
  const mBuoy = new THREE.MeshStandardMaterial({ color: 0xf06a1a, roughness: 0.6 }), mBox = new THREE.MeshStandardMaterial({ color: 0xb8312b, roughness: 0.55 });
  const mWood = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });
  // the simple shapes stand in until the Blender furniture (pierprops.glb) has loaded, then go
  const stand = new THREE.Group(); group.add(stand);
  const addAt = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; stand.add(m); return m; };
  const props = { lamp: [], station: [], bollard: [], bench: [] }; // where each goes: [x, y, z, turn]
  // the lamps' lanterns: lit after dark with the rest (environment.js drives buildingGlow)
  const glowGlass = new THREE.MeshStandardMaterial({ color: 0xe8e2d2, emissive: new THREE.Color().setRGB(2.4, 1.75, 0.95), emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.85 });
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
          props.lamp.push([q[0], LAND, q[1], ry]);
          perches.push([q[0], LAND + 3.9, q[1]]); // somewhere for a gull to sit (the lamp's top)
        }
      }
      if (Math.floor((d + 14) / 55) !== Math.floor((d + 13) / 55)) {
        const q = inAt(0.6); if (landAt(q) && clearOfSpots(q)) {
          addAt(new THREE.BoxGeometry(0.62, 0.95, 0.22), mBox, q[0], LAND + 0.9, q[1], ry);
          const buoy = addAt(new THREE.TorusGeometry(0.27, 0.07, 8, 18), mBuoy, q[0] + nx * 0.13, LAND + 0.95, q[1] + nz * 0.13, ry); void buoy;
          addAt(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mPost, q[0], LAND + 0.25, q[1]);
          props.station.push([q[0], LAND, q[1], Math.atan2(-nx, -nz)]); // facing the deck
        }
      }
      // mooring bollards just inside the railing, every 30 m or so
      if (Math.floor((d + 7) / 30) !== Math.floor((d + 6) / 30)) {
        const q = inAt(0.55); if (landAt(q) && clearOfSpots(q)) props.bollard.push([q[0], LAND, q[1], ry]);
      }
      if (Math.floor((d + 20) / 40) !== Math.floor((d + 19) / 40)) {
        const q = inAt(2.6); if (landAt(q) && landAt(inAt(3.4)) && clearOfSpots(q)) {
          const ax = -nz, az = nx; // along the edge
          for (const [h, back, th] of [[0.45, 0, 0.42], [0.8, -0.2, 0.08]]) addAt(new THREE.BoxGeometry(1.8, th === 0.42 ? 0.06 : 0.36, th === 0.42 ? 0.42 : 0.05), mWood, q[0] - nx * back, LAND + h, q[1] - nz * back, ry);
          for (const s2 of [-0.8, 0.8]) addAt(new THREE.BoxGeometry(0.06, 0.45, 0.42), mPost, q[0] + ax * s2, LAND + 0.22, q[1] + az * s2, ry);
          props.bench.push([q[0], LAND, q[1], ry]); // facing the water
        }
      }
    }
    acc += len;
  }
  place.buildingGlow = [glowLamp, glowGlass];
  if (Object.values(props).some((l) => l.length)) placeProps(group, stand, props, glowGlass);

  // ---- buildings ----

  const res = buildBuildings(group, place.buildings || [], {
    groundAt: (x, z) => groundAt(x, z) || LAND,
    // nothing on a fishing spot, the deck round it or in front of it
    avoid: (x, z) => spots.some((s) => Math.hypot(x - s.at[0], z - s.at[2]) < 6),
    near: (x, z) => nearSpot(x, z, NEAR_SOLID + 30),
  });
  place.buildingGlow = [...(place.buildingGlow || []), ...res.glow]; for (const m of res.meshes) m.userData.kind = "a building"; targets.push(...res.meshes);
  for (const c of res.colliders) {
    const cbp = [], cbi = [];
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }

  const jetties = [], fishEdges = []; // for walking about and fishing from anywhere (below)
  // ---- piers drawn as a line (jetties on piles), outlines (breakwaters), groynes ----
  const pileMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.95 });
  const deckSlab = new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.95, color: 0xdedad2 });
  for (const p of place.piers) {
    if (p.line) {
      // the deck at the height and width the anglers' spots use (osmPlace: p.h, and half the width less 60 cm from the middle)
      // (only a jetty someone stands on needs that: the others stay lower and narrower, so they don't block the view)
      const standOn = spots.some((sp) => p.line.some((q, k) => k < p.line.length - 1 && segDist([sp.at[0], sp.at[2]], q, p.line[k + 1]) < p.width / 2 + 0.5));
      const deckY = p.kind === "groyne" ? 1.2 : standOn ? p.h : Math.min(p.h, LAND + 0.6), w = p.kind === "groyne" ? 0.5 : standOn ? p.width : Math.min(p.width, 6);
      for (let k = 0; k < p.line.length - 1; k++) {
        const [x1, z1] = p.line[k], [x2, z2] = p.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.2) continue;
        const ang = Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
        if (p.kind === "groyne") { const m = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, w), M.wood); m.position.set(cx, 0.4, cz); m.rotation.y = -ang; group.add(m); continue; }
        jetties.push({ a: [x1, z1], b: [x2, z2], w, y: deckY });
        for (const side of [-1, 1]) { const ox = Math.sin(ang) * side * (w / 2), oz = -Math.cos(ang) * side * (w / 2); fishEdges.push([x1 + ox, z1 + oz, x2 + ox, z2 + oz, Math.sin(ang) * side, -Math.cos(ang) * side, "jetty", deckY]); }
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.4, w), deckSlab); deck.position.set(cx, deckY - 0.2, cz); deck.rotation.y = -ang; deck.castShadow = deck.receiveShadow = true; group.add(deck); deck.userData.kind = "a jetty"; targets.push(deck);
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
      const m = new THREE.Mesh(geo, [deckSlab, new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughness: 0.9 })]); m.castShadow = m.receiveShadow = true; group.add(m); m.userData.kind = `a ${p.kind}`; targets.push(m);
      // railings round its edge where it meets the water, near the anglers
      if (p.kind === "pier" || p.kind === "quay") {
        const rp = [], rr = [];
        for (let k = 0; k < p.ring.length; k++) {
          const [x1, z1] = p.ring[k], [x2, z2] = p.ring[(k + 1) % p.ring.length], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.5) continue;
          if (Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
          let nx = -(z2 - z1) / len, nz = (x2 - x1) / len; const mid = [(x1 + x2) / 2, (z1 + z2) / 2];
          if (inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], p.ring)) { nx = -nx; nz = -nz; } // outward
          if (landAt([mid[0] + nx * 1.5, mid[1] + nz * 1.5]) && !inside([mid[0] + nx * 1.5, mid[1] + nz * 1.5], p.ring)) continue; // land, not water, outside
          fishEdges.push([x1, z1, x2, z2, nx, nz, "pier", p.h]);
          const a2 = [x1 - nx * RAIL.inset, z1 - nz * RAIL.inset], b2 = [x2 - nx * RAIL.inset, z2 - nz * RAIL.inset], np = Math.max(1, Math.round(len / RAIL.post));
          for (let q = 0; q < np; q++) rp.push([a2[0] + (b2[0] - a2[0]) * q / np, a2[1] + (b2[1] - a2[1]) * q / np]);
          for (const y of [RAIL.h, RAIL.h * 0.5]) rr.push({ a: [a2[0], p.h + y, a2[1]], b: [b2[0], p.h + y, b2[1]], r: y === RAIL.h ? 0.026 : 0.018 });
        }
        if (rp.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 8), railMat, rp.length), mx = new THREE.Matrix4(); rp.forEach(([x, z], q) => { mx.makeTranslation(x, p.h + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); group.add(pm); }
        if (rr.length) { const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), railMat, rr.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0); rr.forEach(({ a: A0, b: B0, r }, q) => { const A = new THREE.Vector3(...A0), Bv = new THREE.Vector3(...B0), d = Bv.clone().sub(A), L2 = d.length(); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(r, L2 + 0.06, r)); rm.setMatrixAt(q, mx); }); group.add(rm); }
      }
      if (ring.some(([x, z]) => nearSpot(x, z, NEAR_SOLID + 60))) solids.push(m);
    }
  }
  place.targets = targets;

  // ---- walking about (walker.js) and fishing from where you stand ----
  // You walk on the land, the piers and the jetties people stand on: never into the water, through a railing (kept
  // 45 cm in from a wall's edge) or into a building. Moving between decks of different heights (the promenade and a
  // pier) is taken as a ramp. "Fish here" faces you out over the nearest real water's edge.
  const KEEP = 0.45;
  const drawnB = (place.buildings || []).filter((b) => !spots.some((sp) => b.ring.some(([x, z]) => Math.hypot(x - sp.at[0], z - sp.at[2]) < 6))).map((b) => bb(b.ring));
  const PRh = (place.piers || []).filter((p) => p.ring).map((p) => ({ ...bb(p.ring), h: p.h }));
  const jettyAt = (x, z) => jetties.find((j) => segDist([x, z], j.a, j.b) < j.w / 2 - KEEP);
  const allEdges = [...walls.map((e) => [...e.slice(0, 6), "wall", LAND]), ...fishEdges], nearestEdge = segIndex(allEdges);
  const heightAt = (x, z) => { const j = jettyAt(x, z); if (j) return j.y; const pr = PRh.find((b) => inB([x, z], b)); if (pr) return pr.h; const g = groundAt(x, z); return g || (landAt([x, z]) ? LAND : 0); };
  const walkable = (x, z) => {
    if (jettyAt(x, z)) return true;
    const onPier = PRh.some((b) => inB([x, z], b));
    if (!onPier && !landAt([x, z])) return false;
    const e = nearestEdge(x, z); if (e && e.d < KEEP) return false; // the railing
    return !drawnB.some((b) => inB([x, z], b));
  };
  place.ground = {
    heightAt, walkable,
    ramp: (x0, z0, x1, z1) => walkable(x1, z1) && Math.abs(heightAt(x1, z1) - heightAt(x0, z0)) < 2.6,
    /** Fishing from here: the water's edge within reach, which way it faces and how far in front it is. */
    fishHere(x, z) {
      const e = nearestEdge(x, z); if (!e || e.d > 1.6) return null;
      const [, , , , nx, nz] = e.s, y = heightAt(x, z);
      if (heightAt(x + nx * 10, z + nz * 10) !== 0 && !jettyAt(x + nx * 10, z + nz * 10)) return null; // not water out there
      if (walkable(x + nx * 12, z + nz * 12) || walkable(x + nx * 20, z + nz * 20)) return null;
      return { at: [x, y, z], face: Math.atan2(nx, -nz), edge: Math.max(0.3, e.d), cast: 26 };
    },
  };
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  function cAt(x, z) { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; }
  void PLACE3D;
  // open sea only (outside the land and outside any mapped river, lake or harbour water), for boats
  place.waterAt = (x, z) => { const q = [x, z]; return !LR.some((bb) => inB(q, bb)) && !PR.some((bb) => inB(q, bb)) && !WR.some((bb) => inB(q, bb)); };
  place.perches = perches;
  // beyond the mapped square: real landmarks where they are, an indicative low town over the land (skyline.js)
  place.skyline = buildSkyline(group, place, { groundY: LAND, quality });
  return (x, z) => { const c = cAt(x, z); if (c !== 0) return H_OF[c]; const w = nearestWall(x, z); return w && w.d < 3 && landAt([x, z]) ? LAND : 0; };
}
function segDist(q, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); }
// a mesh only for the camera's ray (never drawn)
function collider(p, i) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
