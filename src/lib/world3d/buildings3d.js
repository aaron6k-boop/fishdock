// ---- buildings3d: the mapped buildings drawn in a believable seaside style (see architecture.js) ----
// Walls are built bay by bay (about 3.2 m) and storey by storey (3 m), each bay showing a sash window, a front door,
// a shop front or plain wall from a facade atlas, so a house has its door at ground level and windows above rather
// than one picture stretched round a box. Pitched roofs with eaves and chimneys, a lighthouse and a coastwatch
// lookout. All buildings share a handful of meshes (one per material), so a town of 500 stays quick on a phone.
import * as THREE from "three";
import { styleFor, pitchedRoof, obb, footprintArea } from "./architecture.js";
import { facade, roof, bricks, FACADE_TILE, photoTex } from "./textures3d.js";

const area2 = (ring) => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; a += x1 * z2 - x2 * z1; } return a / 2; };

function bucket() { return { p: [], uv: [], c: [], i: [] }; }
function quad(B, a, b, c, d, uv, col) { const o = B.p.length / 3; B.p.push(...a, ...b, ...c, ...d); B.uv.push(...uv); for (let k = 0; k < 4; k++) B.c.push(...col); B.i.push(o, o + 1, o + 2, o, o + 2, o + 3); }
function tri(B, a, b, c, uv, col) { const o = B.p.length / 3; B.p.push(...a, ...b, ...c); B.uv.push(...uv); for (let k = 0; k < 3; k++) B.c.push(...col); B.i.push(o, o + 1, o + 2); }
function meshOf(B, mat) {
  if (!B.i.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(B.uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(B.c, 3));
  g.setIndex(B.i); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}

/**
 * Adds the buildings to `group`. groundAt(x, z) gives the ground's height; avoid(x, z) is true where nothing may stand
 * (a fishing spot and the deck round it). Returns { materials (glowing windows after dark), colliders: [{ ring, base, top }] }.
 */
export function buildBuildings(group, buildings, { groundAt = () => 0, avoid = () => false, near = () => false } = {}) {
  const tex = { brick: facade("brick", 7), render: facade("render", 3), cladding: facade("cladding", 5), stone: facade("stone", 9) };
  const roofs = { slate: roof("slate", 11), clay: roof("clay", 12), felt: roof("felt", 13) };
  const brk = bricks(17);
  const M = {};
  for (const [k, t] of Object.entries(tex)) { t.map.wrapS = t.map.wrapT = THREE.ClampToEdgeWrapping; t.emissiveMap.wrapS = t.emissiveMap.wrapT = THREE.ClampToEdgeWrapping; M[k] = new THREE.MeshStandardMaterial({ map: t.map, vertexColors: true, roughness: 0.88, emissive: 0xffc070, emissiveMap: t.emissiveMap, emissiveIntensity: 0 }); }
  // ---- the walls' own surface, photographed (Poly Haven CC0: public/textures), laid over the drawn facades at its
  // real size in the world (about 1.1 m a tile), the windows left clear ----
  // The drawn facades are small (128 px a bay): from the pier the town read as flat, smooth toy houses. Over them now:
  // real brick (its mortar, its uneven bricks) on the brick houses, real render's unevenness on the painted ones; only
  // its variation is taken, over its own average, so each house keeps its colour.
  const wallPhoto = { brick: photoTex("brick_red_diff"), render: photoTex("plaster_diff"), stone: photoTex("plaster_diff") };
  for (const [k, ph] of Object.entries(wallPhoto)) {
    if (!ph || !M[k]) continue;
    const m = M[k], strong = k === "brick" ? 1.0 : 0.55;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWallPh = { value: ph };
      sh.vertexShader = "varying vec3 vWallW;\nvarying vec3 vWallN;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvWallW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWallN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = "uniform sampler2D uWallPh;\nvarying vec3 vWallW;\nvarying vec3 vWallN;\n" + sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        {
          vec3 an = abs(vWallN);
          if (an.y < 0.6) { // (walls, not roofs or sills facing up)
            vec2 q = vec2(an.x > an.z ? vWallW.z : vWallW.x, vWallW.y) / 1.1;
            vec3 ph = texture2D(uWallPh, q).rgb, avg = texture2D(uWallPh, vec2(0.5), 12.0).rgb;
            vec3 v = ph / max(avg, vec3(0.03));
            ${k === "brick" ? "" : "v = vec3(dot(v, vec3(0.3, 0.59, 0.11)));"}
            #ifdef USE_EMISSIVEMAP
              float win = texture2D(emissiveMap, vEmissiveMapUv).r; // (the windows' glow map: glass there, not wall)
            #else
              float win = 0.0;
            #endif
            float fade = 1.0 - smoothstep(60.0, 260.0, length(vWallW - cameraPosition)); // (far off, its fine grain would shimmer)
            diffuseColor.rgb *= mix(vec3(1.0), clamp(v, 0.0, 1.8), ${strong.toFixed(2)} * (1.0 - smoothstep(0.05, 0.3, win)) * fade);
          }
        }`);
    };
    m.customProgramCacheKey = () => "fdwall1" + k;
  }
  for (const [k, t] of Object.entries(roofs)) M["roof_" + k] = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: k === "slate" ? 0.6 : 0.85 });
  M.tower = new THREE.MeshStandardMaterial({ map: brk.map, normalMap: brk.normalMap, roughness: 0.85 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.3, vertexColors: true, side: THREE.DoubleSide });
  // glazing: tinted and reflective, not see-through (an empty shell behind clear glass looked wrong)
  M.glass = new THREE.MeshStandardMaterial({ color: 0x7f97a8, roughness: 0.08, metalness: 0.35, emissive: 0xffd890, emissiveIntensity: 0, side: THREE.DoubleSide });
  const B = Object.fromEntries(Object.keys(M).map((k) => [k, bucket()]));
  const colliders = [], glow = [M.brick, M.render, M.cladding, M.stone];
  const W1 = [1, 1, 1];
  const tileUV = (t, u0 = 0, u1 = 1, v0 = 0, v1 = 1) => [(t + u0) / 4, v0, (t + u1) / 4, v0, (t + u1) / 4, v1, (t + u0) / 4, v1];
  const chimneyBox = (x, z, y0, h, s = 0.6) => {
    const pts = [[x - s / 2, z - s / 2], [x - s / 2, z + s / 2], [x + s / 2, z + s / 2], [x + s / 2, z - s / 2]];
    for (let k = 0; k < 4; k++) { const [x1, z1] = pts[k], [x2, z2] = pts[(k + 1) % 4]; quad(B.tower, [x1, y0, z1], [x2, y0, z2], [x2, y0 + h, z2], [x1, y0 + h, z1], [0, 0, s / 1.2, 0, s / 1.2, h / 0.6, 0, h / 0.6], W1); }
    quad(B.dark, [pts[0][0], y0 + h, pts[0][1]], [pts[1][0], y0 + h, pts[1][1]], [pts[2][0], y0 + h, pts[2][1]], [pts[3][0], y0 + h, pts[3][1]], [0, 0, 1, 0, 1, 1, 0, 1], [0.6, 0.6, 0.6]);
    for (const [dx, dz] of [[-0.12, 0], [0.12, 0]]) { const q = [[x + dx - 0.07, z - 0.07], [x + dx - 0.07, z + 0.07], [x + dx + 0.07, z + 0.07], [x + dx + 0.07, z - 0.07]]; for (let k = 0; k < 4; k++) { const [x1, z1] = q[k], [x2, z2] = q[(k + 1) % 4]; quad(B.roof_clay, [x1, y0 + h, z1], [x2, y0 + h, z2], [x2, y0 + h + 0.35, z2], [x1, y0 + h + 0.35, z1], [0, 0, 0.1, 0, 0.1, 0.1, 0, 0.1], [1.1, 0.8, 0.7]); } } // pots
  };

  for (const b of buildings) {
    let ring = b.ring.slice(); if (ring.length < 3) continue;
    if (area2(ring) > 0) ring.reverse(); // see architecture.js: walk the footprint so faces point outward
    const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
    if (avoid(c[0], c[1]) || ring.some(([x, z]) => avoid(x, z))) continue;
    // on a slope: the walls go down to the lowest corner (into the bank uphill), and the building is taller by the fall
    // across it, so its eaves stay level with where they'd be on the high side (a house on a hill shows more wall below)
    const gy = ring.map(([x, z]) => groundAt(x, z)), lo = Math.min(groundAt(c[0], c[1]), ...gy), fall = Math.max(...gy) - lo;
    let st = styleFor(b); const base = lo - 0.2, tint = st.tint;
    if (fall > 0.6 && st.type !== "lighthouse") st = { ...st, h: st.h + fall, storeys: st.storeys ? st.storeys + Math.round(fall / 3) : st.storeys };
    if (near(c[0], c[1])) colliders.push({ ring, base, top: base + st.h + 4 });

    if (st.type === "lighthouse") {
      // a tapered brick tower, a white gallery with railings, a glazed lantern and a dark cap
      const box = obb(ring), r = Math.max(2, Math.min(5, Math.min(box.L, box.W) / 2)), h = st.h, seg = 20;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, rt = r * 0.72;
        const P = (a, rr, y) => [box.c[0] + Math.cos(a) * rr, y, box.c[1] - Math.sin(a) * rr];
        quad(B.tower, P(a0, r, base), P(a1, r, base), P(a1, rt, base + h), P(a0, rt, base + h), [k / seg * 12, 0, (k + 1) / seg * 12, 0, (k + 1) / seg * 12, h / 1.2, k / seg * 12, h / 1.2], W1);
        // windows up the tower: dark slots on two sides
        if (k % 5 === 0) for (let y = 4; y < h - 3; y += 5) quad(B.dark, P(a0 + 0.06, r * (1 - 0.28 * (y / h)) + 0.02, base + y), P(a1 - 0.06, r * (1 - 0.28 * (y / h)) + 0.02, base + y), P(a1 - 0.06, r * (1 - 0.28 * ((y + 1.4) / h)) + 0.02, base + y + 1.4), P(a0 + 0.06, r * (1 - 0.28 * ((y + 1.4) / h)) + 0.02, base + y + 1.4), [0, 0, 1, 0, 1, 1, 0, 1], W1);
        const gr = r * 0.95, ytop = base + h;
        quad(B.trim, P(a0, gr, ytop), P(a1, gr, ytop), P(a1, gr, ytop + 0.3), P(a0, gr, ytop + 0.3), [0, 0, 1, 0, 1, 1, 0, 1], W1); // gallery edge
        quad(B.trim, P(a1, rt, ytop + 0.3), P(a0, rt, ytop + 0.3), P(a0, gr, ytop + 0.3), P(a1, gr, ytop + 0.3), [0, 0, 1, 0, 1, 1, 0, 1], W1); // gallery floor
        quad(B.dark, P(a0, gr, ytop + 1.25), P(a1, gr, ytop + 1.25), P(a1, gr, ytop + 1.32), P(a0, gr, ytop + 1.32), [0, 0, 1, 0, 1, 1, 0, 1], W1); // rail
        const lr = r * 0.5;
        quad(B.glass, P(a0, lr, ytop + 0.3), P(a1, lr, ytop + 0.3), P(a1, lr, ytop + 2.6), P(a0, lr, ytop + 2.6), [0, 0, 1, 0, 1, 1, 0, 1], W1); // lantern
        tri(B.dark, P(a0, lr * 1.1, ytop + 2.6), P(a1, lr * 1.1, ytop + 2.6), [box.c[0], ytop + 3.6, box.c[1]], [0, 0, 1, 0, 0.5, 1], W1); // cap
      }
      continue;
    }

    // ---- walls, bay by bay ----
    const top = base + st.h, storeys = Math.max(1, st.storeys || Math.round(st.h / 3)), sh = (top - base) / storeys;
    let longest = 0; for (let k = 0; k < ring.length; k++) { const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length]; longest = Math.max(longest, Math.hypot(x2 - x1, z2 - z1)); }
    const wallB = st.type === "lookout" ? B.render : B[st.walls] || B.render;
    let doorDone = false;
    for (let k = 0; k < ring.length; k++) {
      const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.15) continue;
      const nb = Math.max(1, Math.round(len / 3.2)), front = !doorDone && len === longest;
      for (let s = 0; s < storeys; s++) {
        for (let q = 0; q < nb; q++) {
          const f0 = q / nb, f1 = (q + 1) / nb, y0 = base + s * sh, y1 = y0 + sh;
          const A = [x1 + (x2 - x1) * f0, y0, z1 + (z2 - z1) * f0], Bp = [x1 + (x2 - x1) * f1, y0, z1 + (z2 - z1) * f1];
          let t = len / nb < 1.6 ? FACADE_TILE.plain : FACADE_TILE.window;
          if (st.type === "warehouse") t = s === 0 && front && q === Math.floor(nb / 2) ? FACADE_TILE.door : (q + s) % 3 === 0 && st.walls !== "cladding" ? FACADE_TILE.window : FACADE_TILE.plain;
          else if (st.type === "lookout") t = s === 1 ? FACADE_TILE.shop : front && q === Math.floor(nb / 2) ? FACADE_TILE.door : q % 2 ? FACADE_TILE.window : FACADE_TILE.plain;
          else if (s === 0 && st.shop && len > 4) t = FACADE_TILE.shop;
          else if (s === 0 && front && q === Math.floor(nb / 2) && len / nb >= 1.6) t = FACADE_TILE.door;
          else if (st.type === "small" && (q + k) % 2 === 1) t = FACADE_TILE.plain;
          if (st.type === "lookout" && s === 1) {
            // a band of lookout windows: a white sill, glass, white mullions between the panes
            quad(B.trim, A, Bp, [Bp[0], y0 + 0.5, Bp[2]], [A[0], y0 + 0.5, A[2]], [0, 0, 1, 0, 1, 1, 0, 1], W1);
            quad(B.glass, [A[0], y0 + 0.5, A[2]], [Bp[0], y0 + 0.5, Bp[2]], [Bp[0], y1 - 0.25, Bp[2]], [A[0], y1 - 0.25, A[2]], [0, 0, 1, 0, 1, 1, 0, 1], W1);
            quad(B.trim, [A[0], y1 - 0.25, A[2]], [Bp[0], y1 - 0.25, Bp[2]], [Bp[0], y1, Bp[2]], [A[0], y1, A[2]], [0, 0, 1, 0, 1, 1, 0, 1], W1);
            const ux = (Bp[0] - A[0]), uz = (Bp[2] - A[2]), ul = Math.hypot(ux, uz) || 1, nx = -uz / ul * 0.03, nz = ux / ul * 0.03, mw = 0.06 / ul; // just proud of the glass, outward
            quad(B.trim, [A[0] + nx, y0 + 0.5, A[2] + nz], [A[0] + ux * mw + nx, y0 + 0.5, A[2] + uz * mw + nz], [A[0] + ux * mw + nx, y1 - 0.25, A[2] + uz * mw + nz], [A[0] + nx, y1 - 0.25, A[2] + nz], [0, 0, 1, 0, 1, 1, 0, 1], W1);
            continue;
          }
          quad(wallB, A, Bp, [Bp[0], y1, Bp[2]], [A[0], y1, A[2]], tileUV(t), tint);
        }
      }
      if (front) doorDone = true;
      // a plinth along the foot of the wall (a darker band of render or engineering brick), just proud of it
      {
        const ux = x2 - x1, uz = z2 - z1, ul = Math.hypot(ux, uz) || 1, ox = (uz / ul) * 0.035 * -1, oz = (-ux / ul) * 0.035 * -1;
        quad(B.dark, [x1 + ox, base, z1 + oz], [x2 + ox, base, z2 + oz], [x2 + ox, base + 0.42, z2 + oz], [x1 + ox, base + 0.42, z1 + oz], [0, 0, 1, 0, 1, 1, 0, 1], [1.7, 1.7, 1.65]);
      }
      // the lookout's roof: a railing round the parapet
      if (st.type === "lookout") {
        const rh = top + 0.35, n = Math.max(1, Math.round(len / 1.2));
        quad(B.dark, [x1, rh + 0.95, z1], [x2, rh + 0.95, z2], [x2, rh + 1.0, z2], [x1, rh + 1.0, z1], [0, 0, 1, 0, 1, 1, 0, 1], W1);
        quad(B.dark, [x1, rh + 0.5, z1], [x2, rh + 0.5, z2], [x2, rh + 0.53, z2], [x1, rh + 0.53, z1], [0, 0, 1, 0, 1, 1, 0, 1], W1);
        for (let q = 0; q <= n; q++) { const f = q / n, px = x1 + (x2 - x1) * f, pz = z1 + (z2 - z1) * f, ux = (x2 - x1) / len * 0.025, uz = (z2 - z1) / len * 0.025; quad(B.dark, [px - ux, rh, pz - uz], [px + ux, rh, pz + uz], [px + ux, rh + 1.0, pz + uz], [px - ux, rh + 1.0, pz - uz], [0, 0, 1, 0, 1, 1, 0, 1], W1); }
      }
      // the gutter: a dark strip just under the eaves
      if (st.roof !== "flat") quad(B.dark, [x1, top - 0.12, z1], [x2, top - 0.12, z2], [x2, top + 0.02, z2], [x1, top + 0.02, z1], [0, 0, 1, 0, 1, 1, 0, 1], W1);
      else { // a parapet coping on a flat roof
        quad(B.trim, [x1, top, z1], [x2, top, z2], [x2, top + 0.35, z2], [x1, top + 0.35, z1], [0, 0, 1, 0, 1, 1, 0, 1], st.type === "lookout" ? W1 : [0.85, 0.85, 0.85]);
      }
    }

    // ---- the roof ----
    const roofB = B["roof_" + (st.roofMat || "slate")] || B.roof_slate, rc = st.roofMat === "clay" ? [1, 0.95, 0.92] : [1, 1, 1];
    const box = obb(ring);
    const pitched = st.roof === "hip" || st.roof === "gable";
    const R = pitched && box && box.W < 26 ? pitchedRoof(ring, top, { shape: st.roof, pitch: st.pitch ?? 0.62, eave: st.type === "small" ? 0.2 : 0.3 }) : null;
    if (R) {
      for (const f of R.faces) {
        const uvs = f.pts.flatMap(([x, y, z]) => [(x * box.ax[0] + z * box.ax[1]) / 3, ((x * box.pz[0] + z * box.pz[1]) * 0.8 + (y - top) * 1.3) / 3]);
        if (f.gable) { if (f.pts.length === 3) tri(wallB, f.pts[0], f.pts[1], f.pts[2], tileUV(FACADE_TILE.plain, 0, 1, 0, 0.9).slice(0, 6), tint); }
        else if (f.pts.length === 4) quad(roofB, f.pts[0], f.pts[1], f.pts[2], f.pts[3], uvs, rc);
        else tri(roofB, f.pts[0], f.pts[1], f.pts[2], uvs, rc);
      }
      // the underside of the eave overhang (seen from below), so the roof doesn't look paper thin
      for (let k = 0; k < ring.length; k++) { const [x1, z1] = ring[k], [x2, z2] = ring[(k + 1) % ring.length]; const g = 1 + 0.3 / Math.max(1, box.W / 2), cx = box.c[0], cz = box.c[1]; quad(B.trim, [x1, top, z1], [x2, top, z2], [cx + (x2 - cx) * g, top, cz + (z2 - cz) * g], [cx + (x1 - cx) * g, top, cz + (z1 - cz) * g], [0, 0, 1, 0, 1, 1, 0, 1], [0.7, 0.7, 0.7]); }
      if (st.chimneys) {
        const [r0, r1] = R.ridge, y0 = top + R.rise * 0.55;
        const ends = st.chimneys === 2 ? [r0, r1] : [r1];
        for (const e of ends) { const towards = [box.c[0] - e[0], box.c[1] - e[1]], l = Math.hypot(...towards) || 1; chimneyBox(e[0] + (towards[0] / l) * 0.4, e[1] + (towards[1] / l) * 0.4, y0, R.rise * 0.45 + 1.2); }
      }
    } else {
      // flat roof
      const tr = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const [a, bb, cc] of tr) { const P = (i) => [ring[i][0], top + 0.05, ring[i][1]]; tri(roofB, P(a), P(cc), P(bb), [ring[a][0] / 3, ring[a][1] / 3, ring[cc][0] / 3, ring[cc][1] / 3, ring[bb][0] / 3, ring[bb][1] / 3], [1, 1, 1]); }
      if (st.type === "lookout") { // a mast on the lookout
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 6), new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.5, roughness: 0.4 })); m.position.set(c[0], top + 2.5, c[1]); group.add(m);
      }
    }
  }
  const meshes = [];
  for (const [k, mat] of Object.entries(M)) { const m = meshOf(B[k], mat); if (m) { group.add(m); meshes.push(m); } }
  return { glow: [...glow, M.glass], colliders, meshes, count: buildings.length };
}
export { footprintArea };
