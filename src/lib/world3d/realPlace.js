// ---- realPlace: the meshes for a real place built from OpenStreetMap (see osmPlace.js) ----
// The ground from the grid, but with its edge snapped exactly onto the water's edge wherever there's a wall, so a deck
// meets its wall cleanly (sampled every few metres, the edge used to slope down below the water inside the wall and the
// sea showed through the walkway). Harbour walls only along real land-to-water edges (osmPlace.shoreEdges), drawn as
// steel sheet piling under a concrete cap; galvanised railings along them near the anglers; jetties on piles; the
// buildings from the architecture library (buildings3d.js). Materials are drawn on the phone (textures3d.js).
import * as THREE from "three";
import { setTownStyle } from "./architecture.js";
import { unrle, GROUND, PLACE3D, inside } from "./osmPlace.js";
import { concrete, sheetPiling, detail, noise2, photoTex, weather, weatherTex, decalTex, grateTex, asphalt, bricks, woodTex, turf, DECAL } from "./textures3d.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildBuildings } from "./buildings3d.js";
import { loadPart, weatherPierProps } from "./glbParts.js";
import { buildSkyline } from "./skyline.js";
import { localFor } from "./localDetail.js";
import { LANDMARK_BUILDERS } from "./landmarks3d.js";
import { WET_PREP, WET_DARKEN, wetRough } from "./wetLook.js";
import { contactShadows } from "./contactShadow.js";
import { buildTrees } from "./trees3d.js";

const H_OF = [GROUND.water, GROUND.land, GROUND.beach, GROUND.grass];
// colours multiplied over the materials: concrete stays near white (its texture has the colour); sand, grass and the
// beach's wet slope under the water carry their own colour over a neutral detail map
const COL_OF = [[0.42, 0.44, 0.4], [1, 1, 1], [0.62, 0.54, 0.4], [0.26, 0.38, 0.17]];
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
// Over that, from the shared weathering noise at scales that never line up with the tiles: broad patches of lighter
// and darker concrete, smoother worn concrete (Poly Haven's concrete_floor_worn_001) where feet go, a few old stains,
// and along the walls a ragged band of damp (darker, a little greener, less rough) with dried salt just inside it.
// Wet (rain) darkens it and makes it shine. Until the photographs have loaded (or if they can't) the drawn one shows.
export const PIER_TEX = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/textures/pier_concrete_"; // (__fdAssetBase: only a self-contained preview page sets it, its files beside it; the app leaves it unset)
const PHOTO_TILE = 8 / 2.5; // the deck's uv runs one unit per 8 m
function pierConcrete(mat, quality = 1, axis = 0) {
  const wet = { value: 0 };
  if (typeof document === "undefined") return wet;
  const tl = new THREE.TextureLoader(), get = (n, srgb) => tl.loadAsync(PIER_TEX + n + ".jpg").then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  });
  const worn = photoTex("deck_worn_diff"), noise = weatherTex();
  Promise.all([get("diff", true), get("nor", false), get("rough", false)]).then(([diff, nor, rough]) => {
    nor.repeat.set(PHOTO_TILE, PHOTO_TILE); rough.repeat.set(PHOTO_TILE, PHOTO_TILE);
    mat.normalMap = nor; mat.roughnessMap = rough; mat.normalScale.set(0.9, 0.9);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.pDiff = { value: diff }; sh.uniforms.uWet = wet; sh.uniforms.pWorn = { value: worn }; sh.uniforms.pNoise = { value: noise };
      sh.uniforms.uAxis = { value: new THREE.Vector2(Math.cos(axis), Math.sin(axis)) };
      sh.vertexShader = "attribute float aDamp;\nvarying float vDamp;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDamp = aDamp;");
      sh.fragmentShader = "uniform sampler2D pDiff;\nuniform sampler2D pWorn;\nuniform sampler2D pNoise;\nuniform float uWet;\nuniform vec2 uAxis;\nvarying float vDamp;\nfloat fdDamp = 0.0, fdWorn = 0.0, fdJoint = 0.0;\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
        ${WET_PREP}
        {
          vec2 pu = vMapUv * ${PHOTO_TILE.toFixed(3)};
          vec3 a = texture2D(pDiff, pu).rgb, b = ${quality < 2 ? "a" : "texture2D(pDiff, mat2(0.8, -0.6, 0.6, 0.8) * pu * 0.43 + vec2(0.37, 0.61)).rgb"};
          float m = ${quality < 2 ? "0.0" : "smoothstep(0.42, 0.62, texture2D(map, vMapUv * 0.31 + 0.2).g * 1.6)"}; // (the second, turned sample that breaks up the tiling only on High: the deck fills the view while you land a fish, and on a phone those samples halved the frame rate)
          vec3 avg = texture2D(pDiff, vec2(0.5), 12.0).rgb; // its smallest mip: the photograph's own average colour
          vec3 p = mix(a, b, m) / max(avg, vec3(0.02)); // over its average: the drawn colour stays the colour
          p = mix(vec3(dot(p, vec3(0.3, 0.59, 0.11))), p, 0.35);
          // (the photograph's pale flecks, at full strength, read as a speckled, blotchy floor: kept for its patches, softer)
          p = mix(vec3(1.0), p, 0.7);
          diffuseColor.rgb *= mix(vec3(1.0), p, 0.5);
          // ---- the deck as cast: bays about 4.5 m long, square across the pier, with sawn joints between them ----
          // (each joint a dark, sharp line a centimetre or so wide, grime settled a hand's width either side; each bay a
          // shade different from the next, as concrete poured on different days is)
          {
            vec2 wq = vMapUv * 8.0; float al = dot(wq, uAxis), ac = dot(wq, vec2(-uAxis.y, uAxis.x));
            float bay = al / 4.5, f = fract(bay), dj = min(f, 1.0 - f) * 4.5; // metres to the nearest joint
            float px = max(fwidth(al), 1e-4);
            float line = 1.0 - smoothstep(0.006, 0.006 + px * 1.5, dj);
            float wob = (texture2D(pNoise, vec2(ac * 0.21, floor(bay) * 0.37)).r - 0.5) * 0.04; // (a little ragged, chipped)
            float grime = 1.0 - smoothstep(0.0, 0.12 + wob, dj);
            float fade = 1.0 - smoothstep(18.0, 60.0, px * 900.0); // (thin lines far off would shimmer: they fade into the grime)
            fdJoint = line * fade;
            diffuseColor.rgb *= 1.0 - line * 0.55 * fade - grime * 0.12;
            float shade = fract(sin(floor(bay) * 12.9898 + floor(ac / 9.0) * 4.1) * 43758.5453);
            diffuseColor.rgb *= 0.95 + shade * 0.08;
          }
          // broad patches (about 70 m and 15 m across, turned so they never line up with the 8 m tile)
          vec4 nA = texture2D(pNoise, mat2(0.6, 0.8, -0.8, 0.6) * vMapUv * 0.11), nB = texture2D(pNoise, vMapUv * 0.53 + 0.3);
          diffuseColor.rgb *= (0.8 + nA.g * 0.3) * vec3(0.97, 0.955, 0.93); // (darker and a touch browner, with more of the weathered variation a real pier deck has: it read as a clean pale floor)
          // worn, smoother concrete where people walk (its own photograph, over its average)
          fdWorn = smoothstep(0.52, 0.74, nB.g * 0.7 + nA.g * 0.5);
          ${quality < 2 ? "" : `vec3 w = texture2D(pWorn, vMapUv * 2.1).rgb / max(texture2D(pWorn, vec2(0.5), 10.0).rgb, vec3(0.02));
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(dot(w, vec3(0.3, 0.59, 0.11))), w, 0.3), fdWorn * 0.55);`}
          // old stains: a few darker blotches a metre or so across
          float stn = smoothstep(0.74, 0.8, texture2D(pNoise, vMapUv * 1.7 + 0.71).g) * smoothstep(0.4, 0.6, nA.r);
          diffuseColor.rgb *= 1.0 - stn * 0.3;
          // damp along the walls, ragged; dried salt just inside it
          fdDamp = smoothstep(0.35, 0.95, vDamp + (nB.r - 0.5) * 0.6);
          float salt = smoothstep(0.08, 0.35, vDamp) * (1.0 - fdDamp) * smoothstep(0.45, 0.7, texture2D(pNoise, vMapUv * 3.1).r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.86, 0.83), salt * 0.25);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.74, 0.77, 0.72), fdDamp);
          diffuseColor.rgb *= ${WET_DARKEN};
        }`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = ${wetRough("mix(0.7, 1.0, roughnessFactor) * (1.0 - fdWorn * 0.18) * (1.0 - fdDamp * 0.35)")}; // (wetLook.js)`);
    };
    mat.customProgramCacheKey = () => "fdpier5" + (quality < 1 ? "p" : quality < 2 ? "b" : "");
    mat.needsUpdate = true;
  }).catch(() => {});
  return wet;
}

// ---- the pier's furniture from Blender: one instanced mesh per piece (a draw call per material for all of them) ----
function placeProps(group, stand, props, glowGlass, wet) {
  loadPart("pierprops").then((scene) => {
    weatherPierProps(scene, wet);
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
      // ---- contact shadows: the dark on the deck right under each one, the size of its footprint ----
      const bb = new THREE.Box3(); for (const m of meshes) { const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(src.matrixWorld).invert().multiply(m.matrixWorld)); g.computeBoundingBox(); bb.union(g.boundingBox); g.dispose(); }
      if (!bb.isEmpty()) {
        const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, w = (bb.max.x - bb.min.x) * 1.3 + 0.25, d = (bb.max.z - bb.min.z) * 1.3 + 0.25;
        group.add(contactShadows(list.map(([x, y, z, ry]) => [x + cx * Math.cos(ry) + cz * Math.sin(ry), y, z - cx * Math.sin(ry) + cz * Math.cos(ry), ry, w, d]), name === "bench" ? 0.65 : 0.55));
      }
    }
    group.remove(stand);
  }).catch(() => {}); // (the simple shapes stay)
}

// ---- the small things along a working wall: stains, drains, rings and ladders ----
// All the stains in one mesh (one draw call, cut from one small texture): a rust ring round each railing post's foot,
// a rust run down the cap's face below each post, a few old stains on the deck round the fishing spots and damp round
// each drain. The drain grates in one mesh; the mooring rings and the ladders instanced (a draw call each).
function wallDetails(group, { posts, grates, rings, ladders, spots, props, capRuns, wet, railH }) {
  const LAND = GROUND.land, tex = decalTex(); if (!tex) return;
  const P = [], UV = [], I = [];
  // a quad at c, spanning ±a and ±b (3-vectors), from cell k of the 2 x 2 texture
  const quad = (c, a, b, k, flip = false) => {
    const o = P.length / 3, u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0; // (the canvas's top row is the texture's top half)
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(c[0] + a[0] * s + b[0] * t, c[1] + a[1] * s + b[1] * t, c[2] + a[2] * s + b[2] * t);
    UV.push(u0 + 0.01, v0 + 0.01, u0 + 0.49, v0 + 0.01, u0 + 0.49, v0 + 0.49, u0 + 0.01, v0 + 0.49);
    if (flip) I.push(o, o + 2, o + 1, o, o + 3, o + 2); else I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const y = LAND + 0.004;
  posts.forEach(([x, z, nx, nz], i) => {
    const r = 0.16 + rnd() * 0.12, t = rnd() * 6.28, ca = Math.cos(t) * r, sa = Math.sin(t) * r;
    quad([x, y, z], [ca, 0, sa], [-sa, 0, ca], DECAL.rustRing, true);
    // the run down the cap's face, in front of the post (not every post: some have been painted over)
    if (i % 3 !== 1) { const fx = x + nx * (0.22 + 0.12 + 0.004), fz = z + nz * (0.22 + 0.12 + 0.004), w = 0.05 + rnd() * 0.05, h = 0.2 + rnd() * 0.12; quad([fx, LAND + 0.01 - h, fz], [-nz * w, 0, nx * w], [0, h, 0], DECAL.rustRun, true); }
  });
  for (const sp of spots) for (let k = 0; k < 5; k++) {
    const t = rnd() * 6.28, d = 0.8 + rnd() * 2.5, x = sp.at[0] + Math.cos(t) * d, z = sp.at[2] + Math.sin(t) * d, r = 0.2 + rnd() * 0.35, a = rnd() * 6.28;
    quad([x, y, z], [Math.cos(a) * r, 0, Math.sin(a) * r], [-Math.sin(a) * r * 0.8, 0, Math.cos(a) * r * 0.8], DECAL.stain, true);
  }
  for (const [x, , z] of props.bench) quad([x, y, z], [0.9, 0, 0], [0, 0, 0.7], DECAL.damp, true);
  for (const [x, z] of grates) quad([x, y, z], [0.45, 0, 0], [0, 0, 0.45], DECAL.damp, true);
  void capRuns;
  if (I.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; m.renderOrder = 1; group.add(m);
  }
  // drain grates: flush with the deck, turned along the wall
  if (grates.length) {
    const gp = [], gu = [], gi = [];
    for (const [x, z, ry] of grates) {
      const o = gp.length / 3, ax = [Math.cos(ry) * 0.25, Math.sin(-ry) * 0.25], bz = [Math.sin(ry) * 0.17, Math.cos(ry) * 0.17];
      for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) gp.push(x + ax[0] * s + bz[0] * t, LAND + 0.006, z + ax[1] * s + bz[1] * t);
      gu.push(0, 0, 1, 0, 1, 1, 0, 1); gi.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(gu, 2)); g.setIndex(gi); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grateTex(), roughness: 0.75, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    m.receiveShadow = true; group.add(m);
  }
  const iron = weather(new THREE.MeshStandardMaterial({ color: 0x5a5c5b, roughness: 0.7, metalness: 0.4 }), { scale: 0.3, mottle: 0.35, bump: 0.8, rust: [0.7, 0.15, 0.06, 0.025], grime: [WALL_BOTTOM, 0.75, 0.55], rough: [0.8, 1.2], wet });
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const place = (geo, list) => {
    const m = new THREE.InstancedMesh(geo, iron, list.length);
    list.forEach(([x, z, ry], k) => { mx.compose(v.set(x, 0, z), q.setFromAxisAngle(up, ry), one); m.setMatrixAt(k, mx); });
    m.castShadow = true; m.computeBoundingSphere(); group.add(m);
  };
  // a mooring ring hanging from its staple on the cap's face (local +z faces the water)
  if (rings.length) place(mergeGeometries([new THREE.TorusGeometry(0.09, 0.012, 5, 14).translate(0, LAND - 0.24, 0.012), new THREE.BoxGeometry(0.07, 0.035, 0.03).translate(0, LAND - 0.14, 0.0)].map((g2) => { g2.deleteAttribute("uv"); return g2.toNonIndexed(); })), rings);
  // a steel ladder from below the water up over the cap: two stiles, rungs every 30 cm, brackets back to the wall and
  // the stiles' tops bent over onto the deck as hand holds
  if (ladders.length) {
    const parts = [], top = LAND + 0.05;
    for (const sx of [-0.2, 0.2]) {
      parts.push(new THREE.BoxGeometry(0.05, top - WALL_BOTTOM, 0.012).translate(sx, (top + WALL_BOTTOM) / 2, 0));
      parts.push(new THREE.BoxGeometry(0.05, 0.012, 0.42).translate(sx, top, -0.2));
      for (const by of [WALL_BOTTOM + 0.4, 0.9, LAND - 0.6]) parts.push(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(sx, by, -0.1));
    }
    for (let ry2 = WALL_BOTTOM + 0.2; ry2 < LAND - 0.1; ry2 += 0.3) parts.push(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6, 1, true).rotateZ(Math.PI / 2).translate(0, ry2, 0));
    place(mergeGeometries(parts.map((g2) => { g2.deleteAttribute("uv"); return g2.toNonIndexed(); })), ladders);
  }
  void railH;
}

// ---- the harbour wall's steel piling: drawn corrugations, photographed paint and rust over them ----
// The drawn piling (its pans, the wet band and the weed) stays the shape and the colour. Over it: Poly Haven's
// rusty_painted_metal (CC0), over its own average so it only adds its rust runs and pitting, strongest on the dry
// steel; below the tide line Poly Haven's concrete_moss (CC0) turned to dark green-brown weed, a band of pale
// barnacles just above the water and a ragged tide line; everything below it wet (dark, shiny).
// v (the wall's uv) runs 0 at the foot (below the water) to 1 at the cap; the water is at about 0.27.
function pilingMaterial(sp, quality) {
  const mat = new THREE.MeshStandardMaterial({ map: sp.map, normalMap: sp.normalMap, roughnessMap: sp.roughnessMap, roughness: 1, metalness: 0.15, vertexColors: true });
  const rust = photoTex("wall_rust_diff"); if (!rust) return mat;
  const rustN = photoTex("wall_rust_nor", { srgb: false }), rustR = photoTex("wall_rust_rough", { srgb: false }), moss = photoTex("wall_moss_diff"), noise = weatherTex();
  const wallH = GROUND.land - WALL_BOTTOM, vWater = (0 - WALL_BOTTOM) / wallH, vTide = (0.62 - WALL_BOTTOM) / wallH;
  const rv = (wallH / 1.2).toFixed(3), mv = (wallH / 1.5).toFixed(3); // (the photographs' tiles kept square: 1.2 m and 1.5 m)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { wRust: { value: rust }, wRustN: { value: rustN }, wRustR: { value: rustR }, wMoss: { value: moss }, wNoise: { value: noise } });
    sh.fragmentShader = "uniform sampler2D wRust;\nuniform sampler2D wRustN;\nuniform sampler2D wRustR;\nuniform sampler2D wMoss;\nuniform sampler2D wNoise;\nfloat fdBelow = 0.0;\nvec2 fdRu = vec2(0.0);\n" + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
      {
        fdRu = vec2(vMapUv.x * 2.0, vMapUv.y * ${rv}); // (u: 2.4 m a unit)
        vec3 r = texture2D(wRust, fdRu).rgb / max(texture2D(wRust, vec2(0.5), 10.0).rgb, vec3(0.02));
        r = mix(vec3(dot(r, vec3(0.3, 0.59, 0.11))), r, 0.25);
        vec4 n = texture2D(wNoise, vec2(vMapUv.x * 0.37, vMapUv.y * 0.9));
        float v = vMapUv.y, tide = ${vTide.toFixed(3)} + (n.g - 0.5) * 0.07;
        fdBelow = 1.0 - smoothstep(tide - 0.015, tide + 0.015, v);
        diffuseColor.rgb *= mix(vec3(1.0), clamp(r, 0.0, 1.6), 0.85 - fdBelow * 0.45);
        // the tide line: a thin pale salty band with a dark stain under it
        diffuseColor.rgb *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.012, abs(v - tide - 0.012))) - 0.12 * (1.0 - smoothstep(0.0, 0.03, abs(v - tide + 0.03)));
        // weed from the water up, thinning out a little above the waterline
        vec3 ms = texture2D(wMoss, vec2(vMapUv.x * 1.6, vMapUv.y * ${mv})).rgb;
        float weed = (1.0 - smoothstep(${(vWater + 0.02).toFixed(3)}, ${(vWater + 0.13).toFixed(3)}, v + (dot(ms, vec3(0.33)) - 0.33) * 0.25 + (n.r - 0.5) * 0.06));
        diffuseColor.rgb = mix(diffuseColor.rgb, ms * vec3(0.45, 0.42, 0.26), weed * 0.85);
        // barnacles: pale speckles in a band just above the water
        float bar = step(0.62, texture2D(wNoise, vMapUv * vec2(9.0, 17.0)).r) * smoothstep(${(vWater - 0.02).toFixed(3)}, ${(vWater + 0.03).toFixed(3)}, v) * (1.0 - smoothstep(${(vWater + 0.06).toFixed(3)}, ${(vWater + 0.12).toFixed(3)}, v));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.55), bar * 0.6 * (1.0 - weed * 0.6));
      }`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(mix(0.6, 1.0, texture2D(wRustR, fdRu).g), 0.62, fdBelow);`)
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n      metalnessFactor *= 1.0 - fdBelow;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      ${quality < 1 ? "" : `{ vec3 rn = texture2D(wRustN, fdRu).xyz * 2.0 - 1.0; normal = normalize(normal + tbn * vec3(rn.xy * 0.6, 0.0)); }`}`);
  };
  mat.customProgramCacheKey = () => "fdpile1" + (quality < 1 ? "p" : "");
  return mat;
}

export function buildRealPlace(group, place, M, solids = [], quality = 1) {
  const local = localFor(place.id); // what photographs show at this mark (localDetail.js), or null
  const fenceKind = (x, z, nx, nz) => (local?.fence ? local.fence(x, z, nx, nz) : "rail");
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
  // a dune (localDetail.js): a beach the photographs show grown over with marram grass rises gently from the water
  const dune = new Float32Array(n * n), duneH = new Float32Array(n * n);
  if (local?.dunes) {
    // the nearest water to each cell, by a breadth-first walk through the grid that carries it along
    const src = new Int32Array(n * n).fill(-1), queue = [];
    for (let k = 0; k < n * n; k++) if (cls[k] === 0) { src[k] = k; queue.push(k); }
    for (let qi = 0; qi < queue.length; qi++) {
      const k = queue[qi], i = k % n, j = (k - i) / n;
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const q = jj * n + ii; if (src[q] < 0) { src[q] = src[k]; queue.push(q); } }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; if ((cls[k] !== 1 && cls[k] !== 2) || src[k] < 0 || !local.dunes(xs[i], xs[j])) continue;
      const s0 = src[k], d = Math.hypot(xs[i] - xs[s0 % n], xs[j] - xs[Math.floor(s0 / n)]);
      // behind the sea wall a steep sandy face climbs to a broad, lumpy top about 8 m up, then falls away behind (the pier-head
      // photograph Aaron shared, John Ellis, April 2018, on Google Maps: a tall bank of sand and dry scrub across the harbour mouth, over the
      // boulders and the white wall; local.duneH sets the height)
      const top = local.duneH || 2.5;
      const hum = 0.8 + 0.2 * noise2(xs[i] / 17, xs[j] / 17, 1e6, 7) + 0.18 * (noise2(xs[i] / 5.5, xs[j] / 5.5, 1e6, 8) - 0.5);
      const rise = Math.min(top, Math.max(0, d - 8) * 0.55) * Math.max(0, Math.min(1, (100 - d) / 26)) * Math.max(0.2, hum);
      h[k] += rise; dune[k] = Math.min(1, rise / 1.1); duneH[k] = top > 0 ? rise / top : 0; // (duneH: how far up the dune, 0 at its foot to 1 on the crest)
    }
  }
  // ---- rock armour (localDetail.js rocks): dark granite boulders heaped in the water along the foot of a sea wall ----
  if (local?.rocks) buildRocks(group, cls, xs, n, local.rocks, quality);
  const X = new Float32Array(n * n), Z = new Float32Array(n * n), wet = new Float32Array(n * n); const faceA = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; X[k] = xs[i]; Z[k] = xs[j]; }
  // the town's rising ground (localDetail.js hill): built-up land and grass climb with it; the grassy face of the slope
  // is drawn as grass, not paving
  const hill = local?.hill || null, bank = new Uint8Array(n * n);
  if (hill) for (let k = 0; k < n * n; k++) {
    if (cls[k] !== 1 && cls[k] !== 3) continue;
    const up = hill(X[k], Z[k]); if (up <= 0) continue;
    h[k] += up;
    if (Math.abs(hill(X[k] - 2, Z[k]) - hill(X[k] + 2, Z[k])) > 0.3) bank[k] = 1;
  }
  // ---- the town's ground: the map's unmarked land away from the water, the piers and the streets is not the pier's
  // concrete (it was drawn so, slab joints and all, out to the horizon) but yards, gardens, verges and waste ground:
  // worn grass and bare earth, the streets' own tarmac and pavements laid over it. Concrete stays on the piers, within
  // 26 m of a harbour wall (the quays and aprons); the streets lay their own surface over it ----
  const town = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (cls[k] !== 1 || bank[k] || dune[k] > 0.05 || inland) continue;
    const q = [X[k], Z[k]]; if (PR.some((b) => inB(q, b))) continue;
    const w = nearestWall(X[k], Z[k]); if (w && w.d < 26) continue;
    town[k] = 1; // (the streets draw their own tarmac and pavements over it, so no margin is kept for them)
  }
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
    const c = COL_OF[bank[k] ? 3 : solid[k] && cls[k] === 0 ? 1 : cls[k]];
    // large, soft variations (no per-vertex checker), and damp concrete near the edge
    const v = 0.9 + noise2(X[k] / 23, Z[k] / 23, 1e6, 3) * 0.14 + noise2(X[k] / 7, Z[k] / 7, 1e6, 4) * 0.06 - wet[k] * 0.12;
    // (the dune: dry, sandy ochre with darker clumps of scrub and marram, the sand showing between, as in the photograph)
    // (the April 2018 photograph from the pier head that Aaron shared: the steep face is bare, bright sand, a few clumps clinging to it; the scrub
    // and marram grow thick along the top. Drawn as one olive tint all over, it read as a grassy hill, not a dune)
    const g2 = Math.min(1, dune[k] * 2.5);
    let GR = c;
    if (g2 > 0) {
      const i = k % n, j = (k - i) / n, i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      const sx = (h[j * n + i1] - h[j * n + i0]) / Math.max(0.1, xs[i1] - xs[i0]), sz = (h[j1 * n + i] - h[j0 * n + i]) / Math.max(0.1, xs[j1] - xs[j0]);
      const face = Math.max(0, Math.min(1, (Math.hypot(sx, sz) - 0.18) * 4));
      // (the bare face is the lower part of the dune, under the scrub along its crest: the slope alone read as flat,
      // so the whole dune came out grown over)
      faceA[k] = Math.max(face, 1 - Math.max(0, Math.min(1, (duneH[k] - 0.35) / 0.4)));
      // (the sand's colour only: the scrub is drawn in the shader, clump by clump from the photograph, where it used to
      // be decided a grid point at a time and read as a yellow sponge with dark patches)
      const sand = [0.48, 0.31, 0.14], dry = [0.34, 0.235, 0.11]; // (linear light: on screen a warm ochre and a duller tan)
      GR = [sand[0] + (dry[0] - sand[0]) * (1 - face), sand[1] + (dry[1] - sand[1]) * (1 - face), sand[2] + (dry[2] - sand[2]) * (1 - face)];
    }
    if (town[k]) { // (the town's unmarked ground: worn grass over earth, duller and browner than a park's lawn, bare in patches)
      const s1 = noise2(X[k] / 11, Z[k] / 11, 1e6, 13), s2 = noise2(X[k] / 3.5, Z[k] / 3.5, 1e6, 14), bare = Math.max(0, Math.min(1, (s1 - 0.58) * 3.5)), f = 0.88 + s2 * 0.24;
      const r = 0.23 + bare * 0.08, gg = 0.26 - bare * 0.03, b = 0.13 + bare * 0.02;
      pos.set([X[k], h[k], Z[k]], k * 3); col.set([r * f, gg * f, b * f], k * 3); uv.set([X[k] / 8, Z[k] / 8], k * 2); continue;
    }
    if (bank[k]) { // (the cliff's face: rough grass, darker clumps of scrub and paler worn patches, not a lawn)
      const s1 = noise2(X[k] / 9, Z[k] / 9, 1e6, 11), s2 = noise2(X[k] / 3, Z[k] / 3, 1e6, 12), sc = Math.max(0, Math.min(1, (s1 - 0.55) * 4)), pale = Math.max(0, Math.min(1, (0.35 - s1) * 4)) * 0.5;
      const r = 0.29 - sc * 0.1 + pale * 0.12, gg = 0.36 - sc * 0.1 + pale * 0.08, b = 0.19 - sc * 0.05 + pale * 0.07, f = 0.9 + s2 * 0.18;
      pos.set([X[k], h[k], Z[k]], k * 3); col.set([r * f, gg * f, b * f], k * 3); uv.set([X[k] / 8, Z[k] / 8], k * 2); continue;
    }
    pos.set([X[k], h[k], Z[k]], k * 3); col.set([(c[0] + (GR[0] - c[0]) * g2) * v, (c[1] + (GR[1] - c[1]) * g2) * v, (c[2] + (GR[2] - c[2]) * g2) * v], k * 3);
    uv.set([X[k] / 8, Z[k] / 8], k * 2); // one concrete tile = 8 m (joints every 4 m)
  }
  const idxDeck = [], idxSoft = [];
  const addTri = (a, b, c) => {
    const sa = solid[a], sb = solid[b], sc = solid[c];
    if (!sa && !sb && !sc && h[a] < -1 && h[b] < -1 && h[c] < -1) return; // open water: nothing to draw
    const soft = [a, b, c].some((q) => cls[q] === 2 || cls[q] === 3 || bank[q] || dune[q] > 0.05) || (town[a] && town[b] && town[c]) || inland; // (the town's ground only where a whole triangle is: its edge triangles stay concrete, tinted, where a white-to-green fade across them stood out as a pale saw-edge) // (the dune too: on dry land it was drawn with the pier's concrete, its joints and all, never the rough ground)
    // a triangle reaching from a wall out into the water would stand above the water in front of the wall: only beaches
    // and banks slope into the water
    if (!(sa && sb && sc) && !soft) return;
    (soft ? idxSoft : idxDeck).push(a, b, c);
  };
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; addTri(a, c, b); addTri(b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("aDamp", new THREE.BufferAttribute(wet, 1)); // (the deck's shader: damp along the walls)
  // rough ground (the cliff's face, the dune): how much of the photographed scrubby ground shows there (soft shader)
  const ruf = new Float32Array(n * n); for (let k = 0; k < n * n; k++) ruf[k] = bank[k] ? 1 : town[k] ? 0.18 : Math.min(1, dune[k] * 1.4);
  g.setAttribute("aRuf", new THREE.BufferAttribute(ruf, 1));
  // turf: the lawns and the town's ground are grass (drawn turf, textures3d.js) rather than the deck's concrete tinted green
  const grs = new Float32Array(n * n); for (let k = 0; k < n * n; k++) grs[k] = bank[k] || dune[k] > 0.05 ? 0 : cls[k] === 3 || town[k] ? 1 : 0;
  g.setAttribute("aGrass", new THREE.BufferAttribute(grs, 1));
  for (let k = 0; k < n * n; k++) if (bank[k] || dune[k] <= 0) faceA[k] = -1; // (-1: not the dune, no scrub drawn)
  g.setAttribute("aFace", new THREE.BufferAttribute(faceA, 1));
  const all = idxDeck.concat(idxSoft);
  g.setIndex(n * n > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  g.addGroup(0, idxDeck.length, 0); g.addGroup(idxDeck.length, idxSoft.length, 1);
  g.computeVertexNormals();
  const cTex = concrete({ seed: 3, joints: false }), dTex = detail(13);
  const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: cTex.map, normalMap: cTex.normalMap, roughnessMap: cTex.roughnessMap, roughness: 1, normalScale: new THREE.Vector2(0.45, 0.45) });
  // the pier's own direction (its longest run of wall near the fishing spots), for the deck's slab joints: square across
  // it, not across the map's north and south
  let axis = 0; { let best = 0; for (const e of walls) { const L = Math.hypot(e[2] - e[0], e[3] - e[1]), mx = (e[0] + e[2]) / 2, mz = (e[1] + e[3]) / 2; const near = spots.length ? Math.min(...spots.map((sp) => Math.hypot(mx - sp.at[0], mz - sp.at[2]))) : 0; const w = L / (1 + near / 60); if (w > best) { best = w; axis = Math.atan2(e[3] - e[1], e[2] - e[0]); } } }
  place.deckWet = pierConcrete(deckMat, quality, axis);
  const softMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dTex.map, normalMap: dTex.normalMap, roughness: 1 });
  // the cliff's face and the dune: a photographed patch of rough coastal ground (Poly Haven coast_sand_rocks_02, CC0:
  // scrub, bare earth and stones) at about 6 m a tile, coloured by the ground's own tint (green on the cliff, sandy
  // ochre on the dune), and its bumps in the lighting, in place of the plain speckle
  const rufMap = photoTex("ground_rough_diff"), rufNor = photoTex("ground_rough_nor", { srgb: false });
  const turfT = turf();
  if (rufMap) {
    softMat.onBeforeCompile = (sh) => {
      sh.uniforms.uRuf = { value: rufMap }; sh.uniforms.uRufN = { value: rufNor }; sh.uniforms.uTurf = { value: turfT.map }; sh.uniforms.uTurfN = { value: turfT.normalMap };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRuf; attribute float aFace; attribute float aGrass; varying float vRuf; varying float vFace; varying float vGrass; varying vec2 vRufUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvRuf = aRuf; vFace = aFace; vGrass = aGrass; vRufUv = uv * 1.33;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uRuf, uRufN, uTurf, uTurfN; varying float vRuf; varying float vFace; varying float vGrass; varying vec2 vRufUv;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          if (vGrass > 0.01) {
            // turf at two scales (2 m and about 7 m) so the blades don't repeat visibly across a lawn; the tint is the ground's
            vec2 tuv = vRufUv * 4.0;
            vec3 t1 = texture2D(uTurf, tuv).rgb, t2 = texture2D(uTurf, tuv * 0.29 + 0.41).rgb;
            vec3 grass = vColor.rgb * mix(t1, t2, 0.45) * 2.05;
            diffuseColor.rgb = mix(diffuseColor.rgb, grass, vGrass);
          }
          if (vRuf > 0.01) {
            // (two scales of the photograph mixed, so its tile doesn't repeat visibly across a 50 m slope)
            vec3 r1 = texture2D(uRuf, vRufUv).rgb, r2 = texture2D(uRuf, vRufUv * 0.37 + 0.21).rgb;
            vec3 ph = mix(r1, r2, 0.35);
            float lum = dot(ph, vec3(0.3, 0.55, 0.15));
            // keep the photograph's light and dark (stones, hollows, clumps) but take its colour from the ground's tint
            // (the photograph is decoded to linear light, where its average brightness is 0.06, not the 0.45 it looks on screen:
            // scaled by 2.2 the ground came out at an eighth of its colour, and the dune's sand read as dark olive scrub)
            // (its stones' light and dark softened: at full contrast the sand read as a heap of pebbles)
            vec3 tinted = vColor.rgb * clamp(pow(lum / 0.06, 0.55), 0.45, 1.7) + (ph - lum) * 0.12;
            if (vFace >= 0.0) {
              // the dune: marram and scrub where the photograph has growth (its green against its red and blue), clump
              // by clump at the pixel, thick along the top and thinning to a few clumps on the steep bare face, broken
              // into bigger drifts by the second, coarser sample so it isn't an even stipple
              // (the clumps are metres across, from a coarse sample of the photograph (a 40 m tile), their edges from a
              // finer one; the pebble-sized detail is kept out of this, which from 100 m away read as an even stipple)
              vec3 r3 = texture2D(uRuf, vRufUv * 0.15 + 0.57).rgb;
              float nearK = 1.0 - smoothstep(25.0, 90.0, length(vViewPosition));
              float veg3 = smoothstep(0.52, 0.78, r3.g / (r3.r + r3.b + 1e-3)), veg2 = smoothstep(0.5, 0.8, r2.g / (r2.r + r2.b + 1e-3));
              // (about two thirds of the crest grown over, in drifts metres across with pale sand between, as the
              // photograph from the pier head shows; the bare face below nearly all sand)
              float want = mix(0.7, 0.08, vFace); // how much of it is grown over
              float cover = smoothstep(1.0 - want - 0.12, 1.0 - want + 0.18, veg3 * 0.9 + veg2 * 0.25 + 0.1);
              // (the sand itself: the photograph's fine relief only close to, a smooth pale sand further off)
              tinted = mix(vColor.rgb * clamp(pow(lum / 0.06, 0.2), 0.8, 1.25), tinted, nearK);
              // the growth's own colour from the photograph: a dark brown-olive, a little greyer where it's thin
              vec3 g0 = mix(r3, r2, 0.35 + nearK * 0.3), growth = mix(g0, vec3(dot(g0, vec3(0.3, 0.55, 0.15))), 0.3) * 1.9 * vec3(1.0, 0.95, 0.62);
              growth = mix(growth, vec3(0.1, 0.088, 0.036), 0.35);
              tinted = mix(tinted, growth, cover * 0.92);
              // the sand between pales and dries on the top, and holds a darker damp band low on the face
              tinted *= mix(1.0, 1.1, (1.0 - vFace) * (1.0 - cover));
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, tinted, vRuf);
          }`)
        .replace("#include <normal_fragment_maps>", `vec3 fdFlatN = normal;
          #include <normal_fragment_maps>
          if (vGrass > 0.01) { vec3 gn = texture2D(uTurfN, vRufUv * 4.0).xyz * 2.0 - 1.0; float gk = 1.0 - smoothstep(20.0, 70.0, length(vViewPosition)); normal = normalize(mix(normal, normalize(fdFlatN + vec3(gn.x, gn.y, 0.0) * 0.7 * gk), vGrass)); } // (the deck's relief taken out under grass: it read as a weave)
          if (vRuf > 0.01) { vec3 rn = texture2D(uRufN, vRufUv).xyz * 2.0 - 1.0; float nk = vFace >= 0.0 ? 1.0 - smoothstep(25.0, 90.0, length(vViewPosition)) : 1.0; normal = normalize(mix(normal, normalize(normal + vec3(rn.x, rn.y, 0.0) * 0.9), vRuf * nk)); }`); // (the dune's fine relief fades with distance too: lit from 100 m it was the stipple)
    };
    softMat.customProgramCacheKey = () => "fdruf9";
  }
  const ground = new THREE.Mesh(g, [deckMat, softMat]);
  ground.receiveShadow = true; group.add(ground); ground.userData.kind = "the ground"; targets.push(ground);
  place.deckMat = deckMat; // world.js darkens it in the rain

  const hillAt = (x, z, c) => (hill && (c === 1 || c === 3) ? hill(x, z) : 0);
  const groundAt = (x, z) => { const c = cAt(x, z); return c === 0 ? 0 : H_OF[c] + hillAt(x, z, c); };
  // ---- streets: tarmac with a pale pavement and kerb either side (from the map's roads) ----
  {
    const T = { p: [], uv: [], i: [] }, Pv = { p: [], uv: [], i: [] };
    const ribbon = (Bk, line, w0, w1, y) => {
      // a strip from w0 to w1 metres out from the centre line, on both sides when w0 > 0 (pavements)
      for (const side of w0 > 0 ? [-1, 1] : [1]) {
        let run = 0;
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, z1] = line[k], [x2, z2] = line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          // (on the town's slope: in pieces of 5 m at most, so the street lies on the ground rather than cutting through it)
          if (hill && len > 6 && (hill(x1, z1) > 0 || hill(x2, z2) > 0)) { const m = Math.ceil(len / 5), sub = []; for (let q = 0; q <= m; q++) sub.push([x1 + ((x2 - x1) * q) / m, z1 + ((z2 - z1) * q) / m]); line = [...line.slice(0, k), ...sub, ...line.slice(k + 2)]; k--; continue; }
          if (groundAt(x1, z1) === 0 && groundAt(x2, z2) === 0) { run += len; continue; }
          const nx = -(z2 - z1) / len, nz = (x2 - x1) / len, a0 = w0 > 0 ? side * w0 : -w1, a1 = w0 > 0 ? side * w1 : w1;
          const ya = groundAt(x1, z1) + y, yb = groundAt(x2, z2) + y, o = Bk.p.length / 3;
          // ends pushed a little past each node so consecutive pieces overlap at bends instead of leaving a notch
          const ex = ((x2 - x1) / len) * Math.min(0.6, w1 * 0.15), ez = ((z2 - z1) / len) * Math.min(0.6, w1 * 0.15); // (a short overlap: at 1.5 m the pavements' ends stuck out as a saw's teeth along a bending street)
          Bk.p.push(x1 - ex + nx * a0, ya, z1 - ez + nz * a0, x2 + ex + nx * a0, yb, z2 + ez + nz * a0, x2 + ex + nx * a1, yb, z2 + ez + nz * a1, x1 - ex + nx * a1, ya, z1 - ez + nz * a1);
          Bk.uv.push(run / 6, 0, (run + len) / 6, 0, (run + len) / 6, (a1 - a0) / 6, run / 6, (a1 - a0) / 6);
          if (side > 0 || w0 === 0) Bk.i.push(o, o + 2, o + 1, o, o + 3, o + 2); else Bk.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
          run += len;
        }
      }
    };
    const Pa = { p: [], uv: [], i: [] }; // paths and pedestrian streets: paving, no kerb
    const Kb = { p: [], uv: [], i: [] }, Gl = { p: [], uv: [], i: [] }; // kerb faces; gullies
    // the kerb's face: a vertical strip from the road's level up to the pavement's, along the pavement's road edge,
    // and a gully (a drain grate against the kerb) every 25 m or so
    const kerb = (line, w) => {
      for (const side of [-1, 1]) {
        let run = 0, nextGully = 12 + ((line[0][0] * 7 + line[0][1] * 3) % 10);
        for (let k = 0; k < line.length - 1; k++) {
          const [x1, z1] = line[k], [x2, z2] = line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
          if (groundAt(x1, z1) === 0 && groundAt(x2, z2) === 0) { run += len; continue; }
          const nx = -(z2 - z1) / len, nz = (x2 - x1) / len, a = side * w, ya = groundAt(x1, z1), yb = groundAt(x2, z2), o = Kb.p.length / 3;
          Kb.p.push(x1 + nx * a, ya + 0.03, z1 + nz * a, x2 + nx * a, yb + 0.03, z2 + nz * a, x2 + nx * a, yb + 0.125, z2 + nz * a, x1 + nx * a, ya + 0.125, z1 + nz * a);
          Kb.uv.push(run, 0, run + len, 0, run + len, 0.1, run, 0.1);
          if (side > 0) Kb.i.push(o, o + 1, o + 2, o, o + 2, o + 3); else Kb.i.push(o, o + 2, o + 1, o, o + 3, o + 2);
          // gullies along this piece
          while (nextGully < run + len) { const f = (nextGully - run) / len, gx = x1 + (x2 - x1) * f, gz = z1 + (z2 - z1) * f, gy = groundAt(gx, gz) + 0.045, ax = (x2 - x1) / len, az = (z2 - z1) / len, q = Gl.p.length / 3;
            const cx = gx + nx * (a - side * 0.22), cz = gz + nz * (a - side * 0.22); // (0.5 x 0.35 m, long side along the kerb, against it)
            Gl.p.push(cx - ax * 0.25 - nx * 0.175, gy, cz - az * 0.25 - nz * 0.175, cx + ax * 0.25 - nx * 0.175, gy, cz + az * 0.25 - nz * 0.175, cx + ax * 0.25 + nx * 0.175, gy, cz + az * 0.25 + nz * 0.175, cx - ax * 0.25 + nx * 0.175, gy, cz - az * 0.25 + nz * 0.175);
            Gl.uv.push(0, 0, 1, 0, 1, 1, 0, 1); Gl.i.push(q, q + 2, q + 1, q, q + 3, q + 2); nextGully += 22 + ((gx * 13) % 9); }
          run += len;
        }
      }
    };
    for (const r of place.roads || []) { if (r.line.some(([x, z]) => nearSpot(x, z, 25))) continue; ribbon(r.kind === "tarmac" ? T : Pa, r.line, 0, r.w / 2, r.kind === "tarmac" ? 0.035 : 0.06); if (r.kind === "tarmac") { ribbon(Pv, r.line, r.w / 2, r.w / 2 + 1.8, 0.11); kerb(r.line, r.w / 2); } }
    // car parks (the map's amenity=parking): a sheet of tarmac on the ground, bays painted on it
    for (const ring of place.parking || []) {
      if (ring.length < 3 || ring.some(([x, z]) => nearSpot(x, z, 25))) continue;
      const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z))), g2 = new THREE.ShapeGeometry(sh), P3 = g2.attributes.position;
      const o = T.p.length / 3; let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x / ring.length; cz += z / ring.length; }
      for (let v = 0; v < P3.count; v++) { const x = P3.getX(v), z = P3.getY(v); T.p.push(x, (groundAt(x, z) || LAND) + 0.03, z); T.uv.push((x - cx) / 6, (z - cz) / 6); }
      const idx = g2.index.array; for (let q = 0; q < idx.length; q += 3) T.i.push(o + idx[q], o + idx[q + 2], o + idx[q + 1]);
      g2.dispose();
    }
    const mk = (Bk, mat) => { if (!Bk.i.length) return; const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(Bk.p, 3)); g2.setAttribute("uv", new THREE.Float32BufferAttribute(Bk.uv, 2)); g2.setIndex(Bk.i); g2.computeVertexNormals(); const m = new THREE.Mesh(g2, mat); m.receiveShadow = true; group.add(m); };
    // asphalt (textures3d.js), one tile 6 m, its tiling broken by a large soft mottle (weather: 9 m scale)
    const asp = asphalt({ seed: 23 }); // (the ribbons and the car park give uv in sixths of a metre already: one tile is 6 m)
    mk(T, weather(new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: asp.roughnessMap, color: 0xcfcfcb, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), { scale: 9, mottle: 0.38, rough: [0.9, 1.1], wet: place.deckWet }));
    mk(Kb, new THREE.MeshStandardMaterial({ map: cTex.map, color: 0xa8a6a0, roughness: 0.8, side: THREE.DoubleSide }));
    mk(Gl, new THREE.MeshStandardMaterial({ map: grateTex(), roughness: 0.75, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    mk(Pv, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xb8b4ac, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    mk(Pa, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xaaa69c, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
  }

  // ---- garden walls, fences and hedges (the map's barriers): the texture of a town between its streets ----
  {
    const parts = { wall: [], coping: [], fence: [], post: [], hedge: [] };
    const okHere = (mx, mz) => !(nearSpot(mx, mz, 25) || !landAt([mx, mz]) || PR.some((bx) => inB([mx, mz], bx)));
    for (const b of place.barriers || []) {
      for (let k = 0; k + 1 < b.line.length; k++) {
        const [x1, z1] = b.line[k], [x2, z2] = b.line[k + 1], len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.3) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; if (!okHere(mx, mz)) continue;
        const y1 = groundAt(x1, z1) || LAND, y2 = groundAt(x2, z2) || LAND, y0 = Math.min(y1, y2), top = Math.max(y1, y2) + b.h, ang = -Math.atan2(z2 - z1, x2 - x1);
        const box = (w, h, d, dy, bucket, uvScale) => { const g2 = new THREE.BoxGeometry(w, h, d); if (uvScale) { const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); } g2.translate(0, dy + h / 2, 0); g2.rotateY(ang); g2.translate(mx, y0 - 0.02, mz); bucket.push(g2); };
        if (b.kind === "hedge") box(len + 0.05, top - y0, 0.8, 0, parts.hedge);
        else if (b.kind === "fence") { // close-boarded panels between posts (the common garden fence)
          box(len + 0.02, top - y0, 0.035, 0.08, parts.fence, [len / 1.8, (top - y0) / 1.8]);
          for (let q = 0; q <= len; q += 1.8) { const f = q / len, px = x1 + (x2 - x1) * f, pz = z1 + (z2 - z1) * f; const g2 = new THREE.BoxGeometry(0.1, top - y0 + 0.08, 0.1); g2.translate(0, (top - y0 + 0.08) / 2, 0); g2.translate(px, y0 - 0.02, pz); parts.post.push(g2); }
        } else { // a brick wall with a coping on top
          box(len + 0.05, top - y0 - 0.06, 0.24, 0, parts.wall, [len / 2, (top - y0) / 2]);
          box(len + 0.07, 0.07, 0.3, top - y0 - 0.06, parts.coping);
        }
      }
    }
    const brick = bricks(31, [138, 96, 72]), wood = woodTex();
    const mats = {
      wall: new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughness: 1, color: 0xb8aa9c }),
      coping: new THREE.MeshStandardMaterial({ color: 0x8e8a82, roughness: 0.9 }),
      fence: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95, color: 0x9a8468 }),
      post: new THREE.MeshStandardMaterial({ color: 0x5f5244, roughness: 0.95 }),
      hedge: weather(new THREE.MeshStandardMaterial({ color: 0x2d4f22, roughness: 1 }), { scale: 0.6, mottle: 0.5 }),
    };
    for (const kind of Object.keys(parts)) {
      if (!parts[kind].length) continue;
      const g2 = mergeGeometries(parts[kind]); parts[kind].forEach((q) => q.dispose()); if (!g2) continue;
      const m = new THREE.Mesh(g2, mats[kind]); m.castShadow = true; m.receiveShadow = true; m.userData.kind = `a ${kind}`; group.add(m);
    }
  }

  // ---- flights of steps (the map's highway=steps): treads where the ground falls along the line, 17 cm a riser ----
  {
    const treads = [];
    for (const st of place.steps || []) {
      const L = st.line; if (L.length < 2) continue;
      const [xa, za] = L[0], [xb, zb] = L[L.length - 1]; if (!landAt([xa, za]) || !landAt([xb, zb]) || nearSpot(xa, za, 25) || nearSpot(xb, zb, 25)) continue;
      let ya = groundAt(xa, za) || LAND, yb = groundAt(xb, zb) || LAND;
      let from = [xa, za, ya], to = [xb, zb, yb]; if (ya > yb) { from = [xb, zb, yb]; to = [xa, za, ya]; }
      const rise = to[2] - from[2]; if (rise < 0.3) continue; // (steps on the flat: the map says so, the ground here doesn't)
      const n = Math.max(2, Math.round(rise / 0.17)), run = Math.hypot(to[0] - from[0], to[1] - from[1]), tread = Math.max(0.26, Math.min(0.45, run / n));
      const ax = (to[0] - from[0]) / run, az = (to[1] - from[1]) / run, ang = -Math.atan2(az, ax);
      for (let i = 0; i < n; i++) {
        const d = (i + 0.5) * (run / n), cx = from[0] + ax * d, cz = from[1] + az * d, yTop = from[2] + (i + 1) * (rise / n);
        const g2 = new THREE.BoxGeometry(tread, 0.17 + 0.02, st.w); g2.translate(0, -0.095, 0); g2.rotateY(ang); g2.translate(cx, yTop, cz); treads.push(g2);
      }
    }
    if (treads.length) { const g2 = mergeGeometries(treads); treads.forEach((q) => q.dispose()); const m = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, color: 0xb4b0a8, roughness: 0.9 })); m.castShadow = m.receiveShadow = true; m.userData.kind = "steps"; group.add(m); }
  }

  // ---- harbour walls: steel sheet piling under a concrete cap, along the real water's edge ----
  const sp = sheetPiling({ water: (0 - WALL_BOTTOM) / (LAND - WALL_BOTTOM) });
  const wp = [], wuv = [], wi = [], wcol = [], cp = [], cuv = [], ci = [], ccol = [], cwp = [], cwi = [], capRuns = [];
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
    // (behind the rock armour the sea wall is pale concrete, not steel piling: the white wall in the pier-head photograph)
    if (local?.rocks && local.rocks((x1 + x2) / 2, (z1 + z2) / 2)) {
      const c0 = cp.length / 3, T = 2.4, U0 = run / T - len / T, U1 = run / T, vb = (LAND - WALL_BOTTOM) / T;
      cp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.03, z2, x1, LAND + 0.03, z1);
      cuv.push(U0, 0, U1, 0, U1, vb, U0, vb); ccol.push(0.62, 0.62, 0.6, 0.62, 0.62, 0.6, 1.02, 1.02, 1, 1.02, 1.02, 1);
      ci.push(c0, c0 + 1, c0 + 2, c0, c0 + 2, c0 + 3);
      // and a low white parapet along its top
      const pc = cp.length / 3, px = nx * 0.1, pz = nz * 0.1;
      cp.push(x1 + px, LAND, z1 + pz, x2 + px, LAND, z2 + pz, x2 + px, LAND + 0.9, z2 + pz, x1 + px, LAND + 0.9, z1 + pz, x1 - px * 2, LAND + 0.9, z1 - pz * 2, x2 - px * 2, LAND + 0.9, z2 - pz * 2);
      cuv.push(U0, 0.4, U1, 0.4, U1, 0.4 + 0.9 / T, U0, 0.4 + 0.9 / T, U0, 0.8, U1, 0.8); ccol.push(1.05, 1.05, 1.03, 1.05, 1.05, 1.03, 1.12, 1.12, 1.1, 1.12, 1.12, 1.1, 1.08, 1.08, 1.06, 1.08, 1.08, 1.06);
      ci.push(pc, pc + 1, pc + 2, pc, pc + 2, pc + 3, pc + 3, pc + 2, pc + 5, pc + 3, pc + 5, pc + 4);
      continue;
    }
    // in rows up the wall, so the tide line shows: dark weed and wet piling up to about a metre above the water, then
    // the dry, paler steel
    WALL_ROWS.forEach(([y, c]) => { const v = (y - WALL_BOTTOM) / (LAND - WALL_BOTTOM); wp.push(x1, y, z1, x2, y, z2); wuv.push(u0, v, u1, v); wcol.push(...c, ...c); });
    for (let r = 0; r < WALL_ROWS.length - 1; r++) { const a = o + r * 2; wi.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    // the cap: a concrete lip standing 12 cm proud of the piling, with its top, a worn chamfer along the arris and its
    // underside. uv in metres over 2.4 (the photographed concrete's tile), so nothing stretches; the vertex colours
    // carry the wear: the arris paler where it's knocked and scrubbed, the face darker towards its stained foot
    const ox = nx * 0.12, oz = nz * 0.12, c0 = cp.length / 3, yT = LAND + 0.03, yB = LAND - 0.45, ch = 0.025, T = 2.4;
    const cx = nx * ch, cz = nz * ch;
    cp.push(x1 + ox, yB, z1 + oz, x2 + ox, yB, z2 + oz, x2 + ox, yT - ch, z2 + oz, x1 + ox, yT - ch, z1 + oz); // front
    cp.push(x1 + ox - cx, yT, z1 + oz - cz, x2 + ox - cx, yT, z2 + oz - cz, x2 - ox, yT, z2 - oz, x1 - ox, yT, z1 - oz); // top
    cp.push(x1, yB, z1, x2, yB, z2, x2 + ox, yB, z2 + oz, x1 + ox, yB, z1 + oz); // underside
    cp.push(x1 + ox, yT - ch, z1 + oz, x2 + ox, yT - ch, z2 + oz, x2 + ox - cx, yT, z2 + oz - cz, x1 + ox - cx, yT, z1 + oz - cz); // chamfer
    const U0 = u0 * 2.4 / T, U1 = u1 * 2.4 / T, fv = (yT - yB) / T, tv = 0.24 / T;
    cuv.push(U0, 0, U1, 0, U1, fv, U0, fv, U0, 0.3, U1, 0.3, U1, 0.3 + tv, U0, 0.3 + tv, U0, 0.6, U1, 0.6, U1, 0.65, U0, 0.65, U0, fv, U1, fv, U1, fv + 0.01, U0, fv + 0.01);
    const wear = (0.96 + noise2(x1 / 3, z1 / 3, 1e6, 21) * 0.1), wear2 = (0.96 + noise2(x2 / 3, z2 / 3, 1e6, 21) * 0.1);
    ccol.push(0.66, 0.66, 0.64, 0.66, 0.66, 0.64, wear2, wear2, wear2, wear, wear, wear); // front: stained foot, clean top
    ccol.push(1.08 * wear, 1.08 * wear, 1.06 * wear, 1.08 * wear2, 1.08 * wear2, 1.06 * wear2, 0.9, 0.9, 0.88, 0.9, 0.9, 0.88); // top: worn pale at the arris
    ccol.push(0.5, 0.5, 0.48, 0.5, 0.5, 0.48, 0.55, 0.55, 0.52, 0.55, 0.55, 0.52); // underside
    ccol.push(1.12, 1.12, 1.1, 1.12, 1.12, 1.1, 1.15, 1.15, 1.12, 1.15, 1.15, 1.12); // the knocked arris
    for (let q = 0; q < 4; q++) ci.push(c0 + q * 4, c0 + q * 4 + 1, c0 + q * 4 + 2, c0 + q * 4, c0 + q * 4 + 2, c0 + q * 4 + 3);
    capRuns.push([x1 + ox, z1 + oz, x2 + ox, z2 + oz, nx, nz, len]);
    if (nearSpot((x1 + x2) / 2, (z1 + z2) / 2)) { const c = cwp.length / 3; cwp.push(x1, WALL_BOTTOM, z1, x2, WALL_BOTTOM, z2, x2, LAND + 0.05, z2, x1, LAND + 0.05, z1); cwi.push(c, c + 1, c + 2, c, c + 2, c + 3); }
  }
  if (wp.length) {
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2)); wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3)); wg.setIndex(wi); wg.computeVertexNormals();
    const wm = new THREE.Mesh(wg, pilingMaterial(sp, quality)); wm.receiveShadow = true; group.add(wm); wm.userData.kind = "a harbour wall"; targets.push(wm);
    const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute("uv", new THREE.Float32BufferAttribute(cuv, 2)); cg.setAttribute("color", new THREE.Float32BufferAttribute(ccol, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    const capPhoto = photoTex("cap_concrete_diff");
    const capMat = capPhoto ? new THREE.MeshStandardMaterial({ map: capPhoto, normalMap: photoTex("cap_concrete_nor", { srgb: false }), roughnessMap: photoTex("cap_concrete_rough", { srgb: false }), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1, color: 0xf4efe6, vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: cTex.map, normalMap: cTex.normalMap, roughness: 0.9, color: 0xe6e2da, vertexColors: true, side: THREE.DoubleSide });
    weather(capMat, { scale: 3, mottle: 0.22, grime: [LAND - 0.45, LAND - 0.15, 0.25], rough: [0.9, 1.1], wet: place.deckWet });
    const cm = new THREE.Mesh(cg, capMat); cm.receiveShadow = true; cm.castShadow = true; group.add(cm);
  }
  if (cwp.length) solids.push(collider(cwp, cwi));

  // ---- railings along the walls near the anglers: posts every 2 m, a top and a middle rail, a brace every few bays ----
  // galvanised steel: dull, mottled zinc gone grey with weather, darker towards the deck where the spray and the dirt
  // reach, not polished chrome. The fittings (caps, ball joints, base plates, the sleeves where rails join, the bolts)
  // are where the zinc wears through first: rust in their crevices and a run of it down from each joint
  const railMat = weather(new THREE.MeshStandardMaterial({ color: 0xaeb2b1, metalness: 0.6, roughness: 0.62 }), { scale: 0.7, mottle: 0.35, bump: 0.6, rust: [0.32, 0.16, 0.065, 0.028], grime: [LAND, LAND + 0.5, 0.26], rough: [0.8, 1.25], wet: place.deckWet }); // (rustier: a North Sea pier's railings are brown along their joints and streaked below them)
  // (the jetties' handrails: thin tubes of dull galvanising)
  const jRailMat = new THREE.MeshStandardMaterial({ color: 0x8a8e8c, metalness: 0.3, roughness: 0.8 }); // (no weathering: on tubes this thin it shaded them past white, a row of glowing bars)
  const jointMat = weather(new THREE.MeshStandardMaterial({ color: 0xa2a6a5, metalness: 0.55, roughness: 0.66 }), { scale: 0.35, mottle: 0.4, bump: 0.8, rust: [0.85, 0.15, 0.06, 0.025], grime: [LAND, LAND + 0.4, 0.25], rough: [0.8, 1.2], wet: place.deckWet });
  const posts = [], rails = [], timberRuns = [], barRuns = [];
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.5 || Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
    const ix = -nx * RAIL.inset, iz = -nz * RAIL.inset, a = [x1 + ix, z1 + iz], b = [x2 + ix, z2 + iz];
    if (!landAt([(a[0] + b[0]) / 2 - nx * 0.6, (a[1] + b[1]) / 2 - nz * 0.6])) continue;
    const kind = fenceKind((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, nx, nz);
    if (kind !== "rail") { (kind === "timber" ? timberRuns : barRuns).push([a, b, LAND]); continue; }
    const nPost = Math.max(1, Math.round(len / RAIL.post));
    for (let q = 0; q < nPost; q++) { const f = q / nPost; posts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, nx, nz]); }
    for (const y of [RAIL.h, RAIL.h * 0.5]) rails.push({ a: [a[0], LAND + y, a[1]], b: [b[0], LAND + y, b[1]], r: y === RAIL.h ? 0.026 : 0.018 });
    for (let q = 0; q + 1 < nPost; q += 3) { const f0 = q / nPost, f1 = (q + 1) / nPost; rails.push({ a: [a[0] + (b[0] - a[0]) * f0, LAND + 0.08, a[1] + (b[1] - a[1]) * f0], b: [a[0] + (b[0] - a[0]) * f1, LAND + RAIL.h * 0.5, a[1] + (b[1] - a[1]) * f1], r: 0.014 }); }
  }
  if (posts.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 24, 1, true), railMat, posts.length), mx = new THREE.Matrix4();
    posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); pm.castShadow = true; group.add(pm);
    // each post's fittings: a domed cap, a ball joint where the middle rail runs through, and a base plate bolted
    // to the deck
    const fit = (geo, y) => { const m = new THREE.InstancedMesh(geo, railMat, posts.length); posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND + y, z); m.setMatrixAt(q, mx); }); m.castShadow = true; group.add(m); };
    // (all the fittings in one mesh: the cap, the ball joint and the base plate with its four bolts)
    const parts = [
      // (round now: they were five to eight sided, and up close every railing read as a bundle of flat strips)
      new THREE.SphereGeometry(0.04, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, RAIL.h + 0.02, 0),
      new THREE.CylinderGeometry(0.041, 0.041, 0.012, 24, 1, true).translate(0, RAIL.h + 0.016, 0), // (the cap's skirt)
      new THREE.SphereGeometry(0.038, 20, 12).translate(0, RAIL.h * 0.5, 0),
      new THREE.CylinderGeometry(0.075, 0.08, 0.018, 28, 1).translate(0, 0.009, 0),
      new THREE.CylinderGeometry(0.036, 0.036, 0.05, 24, 1, true).translate(0, 0.043, 0), // (the post's welded collar)
      new THREE.TorusGeometry(0.034, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, 0.018, 0), // (the weld bead round its foot)
      ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.011, 0.011, 0.014, 6, 1).translate(Math.cos(k * Math.PI / 2 + 0.785) * 0.055, 0.025, Math.sin(k * Math.PI / 2 + 0.785) * 0.055)), // (hex nuts)
      ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 8, 1).translate(Math.cos(k * Math.PI / 2 + 0.785) * 0.055, 0.037, Math.sin(k * Math.PI / 2 + 0.785) * 0.055)), // (the bolts' ends)
    ].map((g2) => g2.toNonIndexed());
    for (const g2 of parts) g2.deleteAttribute("uv");
    const fm = new THREE.InstancedMesh(mergeGeometries(parts), jointMat, posts.length);
    posts.forEach(([x, z], q) => { mx.makeTranslation(x, LAND, z); fm.setMatrixAt(q, mx); }); fm.castShadow = true; group.add(fm); void fit;
  }
  if (rails.length) {
    const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), railMat, rails.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    rails.forEach(({ a, b, r }, q) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(); const qt = new THREE.Quaternion().setFromUnitVectors(up, d.normalize()); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), qt, new THREE.Vector3(r, L + 0.06, r)); rm.setMatrixAt(q, mx); });
    rm.castShadow = true; group.add(rm);
    // a sleeve at each end of a rail where it meets the next (the joints, a little rustier)
    const sleeve = new THREE.CylinderGeometry(1.35, 1.35, 1, 24, 1, true), sm = new THREE.InstancedMesh(sleeve, jointMat, rails.length * 2);
    rails.forEach(({ a, b, r }, q) => {
      const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), L = d.length(), qt = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      for (const [k, f] of [[0, 0.05 / L], [1, 1 - 0.05 / L]]) { mx.compose(A.clone().addScaledVector(d, f), qt, new THREE.Vector3(r, 0.07, r)); sm.setMatrixAt(q * 2 + k, mx); }
    });
    sm.castShadow = true; group.add(sm);
  }
  // ---- the worn yellow safety line painted along the edge, a little in from the railings, and cast-iron bollards ----
  // (chipped and faded paint, worn through where feet go; the bollards squat and rusty, every dozen metres or so)
  { const runs = []; for (const e of walls) { const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.5 || Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > RAIL.within) continue;
      if (!landAt([(x1 + x2) / 2 - nx * 0.9, (z1 + z2) / 2 - nz * 0.9])) continue;
      if (fenceKind((x1 + x2) / 2 - nx * RAIL.inset, (z1 + z2) / 2 - nz * RAIL.inset, nx, nz) !== "rail") continue;
      runs.push({ x1, z1, x2, z2, nx, nz, len }); }
    if (runs.length && typeof document !== "undefined") {
      const c = document.createElement("canvas"); c.width = 512; c.height = 32; const g = c.getContext("2d");
      g.fillStyle = "rgb(214,178,52)"; g.fillRect(0, 4, 512, 24);
      g.globalCompositeOperation = "destination-out"; // (chips and wear)
      for (let i = 0; i < 260; i++) { g.globalAlpha = 0.25 + Math.random() * 0.75; g.beginPath(); g.ellipse(Math.random() * 512, 4 + Math.random() * 24, 1 + Math.random() * 7, 1 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { g.fillRect(Math.random() * 512, 0, 10 + Math.random() * 40, 32); }
      const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const lineMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, depthWrite: false });
      const pos = [], uvs = [], idx = []; const IN = RAIL.inset + 0.42, W = 0.1;
      for (const r of runs) { const dx = (r.x2 - r.x1) / r.len, dz = (r.z2 - r.z1) / r.len, b = pos.length / 3;
        for (const [f, side] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const off = IN + side * W; pos.push(r.x1 + dx * r.len * f - r.nx * off, LAND + 0.004, r.z1 + dz * r.len * f - r.nz * off); uvs.push(f * r.len / 1.6, side); }
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); lg.setIndex(idx); lg.computeVertexNormals();
      const lm = new THREE.Mesh(lg, lineMat); lm.receiveShadow = true; lm.material.side = THREE.DoubleSide; group.add(lm);
      // bollards: a squat cast-iron post with a flared head on a base plate, rust through the black paint
      const prof = [[0, 0], [0.13, 0], [0.13, 0.03], [0.1, 0.04], [0.085, 0.07], [0.08, 0.26], [0.1, 0.3], [0.11, 0.34], [0.07, 0.37], [0, 0.375]].map(([x, y]) => new THREE.Vector2(x, y));
      const bGeo = new THREE.LatheGeometry(prof, 24);
      const bMat = weather(new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.5, roughness: 0.72 }), { scale: 0.25, mottle: 0.5, bump: 0.9, rust: [0.9, 0.2, 0.08, 0.03], grime: [LAND, LAND + 0.2, 0.3], rough: [0.8, 1.2], wet: place.deckWet });
      const spots = []; for (const r of runs) { const n = Math.floor(r.len / 12); for (let q = 0; q < n; q++) { const f = (q + 0.5) / n, dx = (r.x2 - r.x1), dz = (r.z2 - r.z1); spots.push([r.x1 + dx * f - r.nx * (RAIL.inset + 0.3), r.z1 + dz * f - r.nz * (RAIL.inset + 0.3)]); } }
      if (spots.length) { const bm = new THREE.InstancedMesh(bGeo, bMat, spots.length), mx = new THREE.Matrix4(); spots.forEach(([x, z], q) => { mx.makeTranslation(x, LAND, z); bm.setMatrixAt(q, mx); }); bm.castShadow = true; bm.receiveShadow = true; group.add(bm); place.bollards = spots.map(([x, z]) => [x, z]); }
    } }
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
  let acc = 0; const columns = [], grates = [], rings = [], ladders = [];
  for (const e of walls) {
    const [x1, z1, x2, z2, nx, nz] = e, len = Math.hypot(x2 - x1, z2 - z1);
    if (Math.hypot((x1 + x2) / 2, (z1 + z2) / 2) > 200) { acc += len; continue; }
    for (let t = 0; t < len; t += 1) {
      const d = acc + t, f = t / len, ex = x1 + (x2 - x1) * f, ez = z1 + (z2 - z1) * f, ry = Math.atan2(nx, nz);
      const inAt = (m) => [ex - nx * m, ez - nz * m];
      const clearOfSpots = (q) => spots.every((sp) => Math.hypot(q[0] - sp.at[0], q[1] - sp.at[2]) > 4);
      if (Math.floor(d / 28) !== Math.floor((d - 1) / 28)) {
        const q = inAt(0.75); if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q) && local?.lamps === "column") {
          columns.push([q[0], q[1], ry, nx, nz]); perches.push([q[0], LAND + 6.6, q[1]]);
        } else if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q)) {
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
      // the small things a working wall has: a drain grate in the deck now and then, mooring rings on the cap's face,
      // and a steel ladder down the wall to the water every 70 m or so (all kept clear of the fishing spots)
      if (Math.floor((d + 3) / 23) !== Math.floor((d + 2) / 23)) { const q = inAt(1.15); if (landAt(q) && landAt(inAt(2)) && clearOfSpots(q)) grates.push([q[0], q[1], ry]); }
      if (Math.floor((d + 9) / 17) !== Math.floor((d + 8) / 17) && clearOfSpots(inAt(0.5))) rings.push([ex + nx * 0.135, ez + nz * 0.135, ry]);
      if (Math.floor((d + 31) / 71) !== Math.floor((d + 30) / 71) && clearOfSpots(inAt(0.5))) ladders.push([ex + nx * 0.19, ez + nz * 0.19, ry]);
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
  // plain lighting columns (where photographs show them): a tapered grey pole and a slim head leaning over the deck
  if (columns.length) {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), CH = 6.5;
    // the pole with a wider root section, its access door and a flange bolted to the deck (one mesh)
    const pole = mergeGeometries([
      new THREE.CylinderGeometry(0.05, 0.09, CH, 7, 1, true).translate(0, CH / 2, 0),
      new THREE.CylinderGeometry(0.105, 0.11, 1.1, 8, 1, true).translate(0, 0.55, 0),
      new THREE.CylinderGeometry(0.098, 0.105, 0.05, 8, 1).translate(0, 1.12, 0),
      new THREE.BoxGeometry(0.1, 0.42, 0.03).translate(0, 0.62, 0.1),
      new THREE.CylinderGeometry(0.17, 0.18, 0.025, 8, 1).translate(0, 0.012, 0),
    ].map((g2) => { g2.deleteAttribute("uv"); return g2.toNonIndexed(); }));
    const head = new THREE.BoxGeometry(0.62, 0.09, 0.2); // (its length turned to lean in over the deck)
    // galvanised, weathered dull grey, darker and rust-spotted towards its foot, runs down from the head
    const colMat = weather(new THREE.MeshStandardMaterial({ color: 0x969b9c, roughness: 0.6, metalness: 0.45 }), { scale: 0.9, mottle: 0.3, bump: 0.5, rust: [0.22, 0.16, 0.065, 0.028], grime: [LAND, LAND + 0.9, 0.3], streaks: [LAND + CH, 4, 0.12], rough: [0.8, 1.2], wet: place.deckWet });
    const pm = new THREE.InstancedMesh(pole, colMat, columns.length), hm = new THREE.InstancedMesh(head, glowLamp, columns.length);
    columns.forEach(([x, z, ry, nx, nz], k) => {
      mx.compose(v.set(x, LAND, z), q.setFromAxisAngle(up, ry + Math.PI), one); pm.setMatrixAt(k, mx); // (the door towards the deck)
      mx.compose(v.set(x - nx * 0.28, LAND + CH + 0.02, z - nz * 0.28), q.setFromAxisAngle(up, Math.atan2(nz, -nx)), one); hm.setMatrixAt(k, mx);
    });
    for (const m of [pm, hm]) { m.castShadow = true; m.computeBoundingSphere(); group.add(m); }
  }
  place.buildingGlow = [glowLamp, glowGlass];
  if (Object.values(props).some((l) => l.length)) placeProps(group, stand, props, glowGlass, place.deckWet);
  wallDetails(group, { posts, grates, rings, ladders, spots, props, capRuns, wet: place.deckWet, railH: RAIL.h });

  // ---- buildings ----

  // a mark's own landmark buildings, built from photographs (localDetail.js), in place of the generic style
  const marks = Object.fromEntries(Object.entries(local?.landmarks || {}).filter(([, k]) => LANDMARK_BUILDERS[k])), beacons = [];
  for (const b of (place.buildings || []).filter((b) => marks[b.id])) {
    const lm = LANDMARK_BUILDERS[marks[b.id]](group, b.ring, Math.min(...b.ring.map(([x, z]) => groundAt(x, z) || LAND)));
    for (const m of lm.meshes) { m.userData.kind = "a building"; targets.push(m); }
    place.buildingGlow = [...(place.buildingGlow || []), ...lm.glow];
    if (lm.flash) beacons.push(lm.flash);
    const c = lm.collider, cbp = [], cbi = [];
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }
  if (beacons.length) place.beacons = beacons;
  setTownStyle(local?.town || null);
  const res = buildBuildings(group, (place.buildings || []).filter((b) => !marks[b.id]), {
    groundAt: (x, z) => groundAt(x, z) || LAND,
    // nothing on a fishing spot, the deck round it or in front of it
    avoid: (x, z) => spots.some((s) => Math.hypot(x - s.at[0], z - s.at[2]) < 6),
    near: (x, z) => nearSpot(x, z, NEAR_SOLID + 30),
  });
  setTownStyle(null);
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
  // (all the jetties' decks, piles and rails as three instanced meshes: one draw call each, not one per piece)
  const jDeck = [], jPile = [], jRail = [];
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
        jDeck.push({ x: cx, y: deckY - 0.2, z: cz, ang, len: len + 0.05, w });
        if (nearSpot(cx, cz, NEAR_SOLID + len / 2)) { const c = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.4, w)); c.position.set(cx, deckY - 0.2, cz); c.rotation.y = -ang; c.updateMatrixWorld(true); solids.push(c); }
        const sx = Math.sin(ang), sz = -Math.cos(ang);
        for (let t = 0; t <= len; t += 4) for (const side of [-1, 1]) {
          const f = t / len, px = x1 + (x2 - x1) * f + sx * side * (w / 2 - 0.3), pz = z1 + (z2 - z1) * f + sz * side * (w / 2 - 0.3);
          if (landAt([px, pz])) continue;
          jPile.push([px, (deckY + WALL_BOTTOM) / 2 - 0.2, pz, deckY - WALL_BOTTOM]);
        }
        for (const side of [-1, 1]) for (const y of [RAIL.h, RAIL.h * 0.5]) jRail.push([cx + sx * side * (w / 2 - 0.12), deckY + y, cz + sz * side * (w / 2 - 0.12), ang, len]);
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
          const kind = fenceKind((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, nx, nz);
          if (kind !== "rail") { (kind === "timber" ? timberRuns : barRuns).push([a2, b2, p.h]); continue; }
          for (let q = 0; q < np; q++) rp.push([a2[0] + (b2[0] - a2[0]) * q / np, a2[1] + (b2[1] - a2[1]) * q / np]);
          for (const y of [RAIL.h, RAIL.h * 0.5]) rr.push({ a: [a2[0], p.h + y, a2[1]], b: [b2[0], p.h + y, b2[1]], r: y === RAIL.h ? 0.026 : 0.018 });
        }
        if (rp.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 8, 1, true), railMat, rp.length) /* (open-topped under the rail, as the pier's own posts: their flat sunlit caps lined up in perspective into bright bars) */, mx = new THREE.Matrix4(); rp.forEach(([x, z], q) => { mx.makeTranslation(x, p.h + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); group.add(pm); }
        if (rr.length) { const rm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), railMat, rr.length), mx = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0); rr.forEach(({ a: A0, b: B0, r }, q) => { const A = new THREE.Vector3(...A0), Bv = new THREE.Vector3(...B0), d = Bv.clone().sub(A), L2 = d.length(); mx.compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(r, L2 + 0.06, r)); rm.setMatrixAt(q, mx); }); group.add(rm); }
      }
      if (ring.some(([x, z]) => nearSpot(x, z, NEAR_SOLID + 60))) solids.push(m);
    }
  }
  buildFences(group, timberRuns, barRuns, dTex, place.deckWet);
  if (jDeck.length) {
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), X1 = new THREE.Vector3(1, 0, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), deckSlab, jDeck.length);
    jDeck.forEach((d, k) => { mx.compose(v.set(d.x, d.y, d.z), q.setFromAxisAngle(up, -d.ang), sc.set(d.len, 1, d.w)); deck.setMatrixAt(k, mx); });
    deck.castShadow = deck.receiveShadow = true; deck.computeBoundingSphere(); group.add(deck); deck.userData.kind = "a jetty"; targets.push(deck);
    if (jPile.length) {
      const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.2, 1, 7, 1, true), pileMat, jPile.length);
      jPile.forEach(([x, y, z, h], k) => { mx.compose(v.set(x, y, z), q.identity(), sc.set(1, h, 1)); pile.setMatrixAt(k, mx); });
      pile.computeBoundingSphere(); group.add(pile);
    }
    if (jRail.length) {
      const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 20, 1, true), jRailMat, jRail.length), qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      jRail.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang).multiply(qz), sc.set(1, len, 1)); rail.setMatrixAt(k, mx); });
      rail.computeBoundingSphere(); group.add(rail); void X1;
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
    // the benches, lamps, bollards and lifebuoy stations, as [x, z], so nobody arrives inside one (spawn.js)
    props: Object.values(props).flat().map(([x, , z]) => [x, z]),
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
  // ---- trees and scrub on the grass and the cliff's bank (trees3d.js): not on a road, a building or near a spot ----
  {
    const roads = place.roads || [];
    const onRoad = (x, z) => roads.some((r) => { for (let i = 0; i + 1 < r.line.length; i++) if (segDist([x, z], r.line[i], r.line[i + 1]) < r.w / 2 + 2.2) return true; return false; });
    const bankAt = (x, z) => { if (!local?.hill) return 0; const d = Math.abs(local.hill(x - 2, z) - local.hill(x + 2, z)); return d > 0.3 ? Math.min(1, d / 0.8) : 0; };
    const woods = (place.woods || []).map(bb), woodAt = (x, z) => woods.some((b) => inB([x, z], b));
    const trees = buildTrees(group, { cls, xs, n, heightAt, avoid: (x, z) => nearSpot(x, z, 20) || !walkable(x, z) || onRoad(x, z), bank: bankAt, wood: woodAt, quality, seed: 3 + (place.spots?.length || 0) });
    if (trees) { place.trees = trees.count; place.treesBuilt = trees.built; place.treesUpdate = trees.update; }
  }
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  function cAt(x, z) { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; }
  void PLACE3D;
  // open sea only (outside the land and outside any mapped river, lake or harbour water), for boats
  place.waterAt = (x, z) => { const q = [x, z]; return !LR.some((bb) => inB(q, bb)) && !PR.some((bb) => inB(q, bb)) && !WR.some((bb) => inB(q, bb)); };
  place.perches = perches;
  // beyond the mapped square: real landmarks where they are, an indicative low town over the land (skyline.js)
  place.skyline = buildSkyline(group, place, { groundY: LAND, quality, industry: local?.industry || null, hill: local?.hill || null });
  if (place.skyline?.glow?.length) place.buildingGlow = [...(place.buildingGlow || []), ...place.skyline.glow];
  return (x, z) => { const c = cAt(x, z); if (c !== 0) return H_OF[c] + (local?.hill && (c === 1 || c === 3) ? local.hill(x, z) : 0); const w = nearestWall(x, z); return w && w.d < 3 && landAt([x, z]) ? LAND : 0; };
}
// ---- the other kinds of fence a photograph shows (localDetail.js): runs of [a, b, deck height] ----
// timber: heavy square posts every 2.4 m with two rails (instanced: two draw calls). bars: a steel railing of upright
// bars between a top and bottom rail, drawn as one see-through panel per run (one draw call, cut out of a texture).
// Each water cell within 7 m of the land (inside the area local.rocks names) gets a few boulders, heaped highest against
// the wall (up to about 3 m above the water) and thinning out into the sea; each boulder a lumpy, flat-faced block, tilted
// and sized at random (1 to 2.2 m), in granite greys. Four instanced meshes (four shapes): four draw calls for all of them.
function buildRocks(group, cls, xs, n, area, quality) {
  // distance from each water cell to the nearest land, by a breadth-first walk carrying the nearest land cell along
  const src = new Int32Array(n * n).fill(-1), queue = [];
  for (let k = 0; k < n * n; k++) if (cls[k] !== 0) { src[k] = k; queue.push(k); }
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi], i = k % n, j = (k - i) / n;
    for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; const q = jj * n + ii; if (src[q] < 0) { src[q] = src[k]; queue.push(q); } }
  }
  let seed = 1234567; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const k = j * n + i; if (cls[k] !== 0 || src[k] < 0) continue;
    const x0 = xs[i], z0 = xs[j], cw = xs[i + 1] - x0, ch = xs[j + 1] - z0; if (cw > 8 || !area(x0, z0)) continue;
    const s0 = src[k], lx = xs[s0 % n], lz = xs[Math.floor(s0 / n)];
    const per = Math.ceil((cw * ch) / 1.3 * (quality < 1 ? 0.5 : 1));
    for (let q = 0; q < per; q++) {
      const x = x0 + rnd() * cw, z = z0 + rnd() * ch, d = Math.hypot(x - lx, z - lz); if (d > 7 + rnd() * 2) continue;
      const t = Math.min(1, d / 8), size = 1.0 + rnd() * 1.2;
      spots.push([x, 3.0 * (1 - t * t) - 0.7 + rnd() * 0.5 - size * 0.15, z, size]);
    }
  }
  if (!spots.length) return;
  // four boulder shapes: a ball pushed about at two scales, then split flat on a few planes, as quarried armour stone
  // is (angular blocks with broken faces, never round pebbles). Each face gets its own projection of the photographed-
  // style granite (made in source-assets/make_granite.py) at about 1.4 m a tile, so nothing stretches
  const shapes = [];
  for (let v = 0; v < 4; v++) {
    const g = new THREE.IcosahedronGeometry(0.5, 3), p = g.attributes.position, P = new THREE.Vector3();
    const cuts = Array.from({ length: 4 + v }, () => { const d = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 1.4, rnd() - 0.5).normalize(); return [d, 0.3 + rnd() * 0.14]; });
    for (let i = 0; i < p.count; i++) {
      P.fromBufferAttribute(p, i);
      const f = 1 + 0.22 * (noise2(P.x * 2.1 + v * 7, P.z * 2.1 + P.y * 1.7, 1e6, 21) - 0.5) + 0.07 * (noise2(P.x * 7 + v, P.y * 7 - P.z * 3, 1e6, 22) - 0.5);
      P.multiplyScalar(f);
      for (const [d, k] of cuts) { const t = P.dot(d); if (t > k) P.addScaledVector(d, k - t); }
      p.setXYZ(i, P.x * 1.15, P.y * 0.82, P.z);
    }
    g.deleteAttribute("uv"); g.deleteAttribute("normal");
    const flat = mergeVertices(g).toNonIndexed(); flat.computeVertexNormals();
    const fp = flat.attributes.position, fn = flat.attributes.normal, uvs = new Float32Array(fp.count * 2);
    for (let t = 0; t < fp.count; t += 3) {
      const nx = Math.abs(fn.getX(t)), ny = Math.abs(fn.getY(t)), nz = Math.abs(fn.getZ(t));
      for (let q = t; q < t + 3; q++) { const [u, w] = ny > nx && ny > nz ? [fp.getX(q), fp.getZ(q)] : nx > nz ? [fp.getZ(q), fp.getY(q)] : [fp.getX(q), fp.getY(q)]; uvs[q * 2] = u / 1.4 + v * 0.31; uvs[q * 2 + 1] = w / 1.4 + v * 0.17; }
    }
    flat.setAttribute("uv", new THREE.BufferAttribute(uvs, 2)); shapes.push(flat);
  }
  const map = photoTex("rock_granite_diff"), nor = photoTex("rock_granite_nor", { srgb: false }), rough = photoTex("rock_granite_rough", { srgb: false });
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, normalMap: nor, normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: rough, roughness: 1, metalness: 0 });
  // wet and darker below the tide line, a band of green-black weed at the water, dry and paler above (world height)
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vWY;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vWY;")
      .replace("#include <color_fragment>", "#include <color_fragment>\n float wetK = 1.0 - smoothstep(0.1, 1.1, vWY); diffuseColor.rgb *= mix(1.0, 0.45, wetK); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.04), (1.0 - smoothstep(-0.4, 0.35, vWY)) * 0.7);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.35, 1.0 - smoothstep(0.1, 1.1, vWY));");
  };
  mat.customProgramCacheKey = () => "fdrock1";
  const per = [[], [], [], []]; spots.forEach((sp) => per[Math.floor(rnd() * 4)].push(sp));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  per.forEach((list, v) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(shapes[v], mat, list.length);
    list.forEach(([x, y, z, s], i) => {
      e.set((rnd() - 0.5) * 1.2, rnd() * 6.28, (rnd() - 0.5) * 1.2); q4.setFromEuler(e); // (lying roughly flat, as placed stone settles)
      m4.compose(new THREE.Vector3(x, y, z), q4, new THREE.Vector3(s * (0.9 + rnd() * 0.4), s * (0.7 + rnd() * 0.35), s)); mesh.setMatrixAt(i, m4);
      const t = 0.82 + rnd() * 0.3; c.setRGB(t * (0.98 + rnd() * 0.06), t, t * (0.97 + rnd() * 0.06)); mesh.setColorAt(i, c);
    });
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  });
}

function buildFences(group, timber, bars, dTex, wet) {
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  if (timber.length) {
    const P = [], R = [], H = 1.15;
    for (const [a, b, y] of timber) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 2.4)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let k = 0; k < n; k++) { const f = k / n; P.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, ang]); }
      for (const h of [0.55, 1.0]) R.push([(a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2, ang, len + 0.1]);
    }
    // weathered softwood: silvered grain with open cracks along it (drawn, textures3d.woodTex), sampled along each
    // piece's own length so a long rail keeps its grain the right size; greener and darker at the foot of the posts
    const timberMat = (grain) => weather(new THREE.MeshStandardMaterial({ color: 0xb3a999, roughness: 0.92 }), { wood: grain, scale: 1, mottle: 0.2, bump: 0.35, grime: [GROUND.land, GROUND.land + 0.35, 0.3], rough: [0.9, 1.1], wet });
    const wood = timberMat("y"), woodX = timberMat("x");
    // (bevelled: sawn timber's edges are rounded off by years of weather and hands, never knife sharp)
    const pm = new THREE.InstancedMesh(roundedBox(0.17, H, 0.17, 0.018), wood, P.length);
    P.forEach(([x, y, z, ang], k) => { mx.compose(v.set(x, y + H / 2, z), q.setFromAxisAngle(up, -ang), sc.set(1, 1, 1)); pm.setMatrixAt(k, mx); });
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.07), woodX, R.length);
    R.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang), sc.set(len, 1, 1)); rm.setMatrixAt(k, mx); });
    for (const m of [pm, rm]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  }
  if (bars.length) {
    // a steel railing of real bars (it was a flat picture of one, which went to a grey smear edge on and showed its
    // trick close to): square posts every 2 m, a top rail, a bottom rail and round bars 12.5 cm apart between them,
    // each piece instanced (four draw calls for every such railing in the place)
    const mat = weather(new THREE.MeshStandardMaterial({ color: 0x9aa0a3, metalness: 0.5, roughness: 0.6 }), { scale: 0.6, mottle: 0.3, bump: 0.5, rust: [0.15, 0.16, 0.065, 0.028], grime: [GROUND.land, GROUND.land + 0.4, 0.2], rough: [0.85, 1.2], wet });
    const H = 1.12, B = [], Pp = [], Rr = [];
    for (const [a, b, y] of bars) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nb = Math.max(1, Math.round(len / 0.125)), np = Math.max(1, Math.round(len / 2));
      for (let k = 0; k < nb; k++) { const f = (k + 0.5) / nb; B.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f]); }
      for (let k = 0; k <= np; k++) { const f = k / np; Pp.push([a[0] + (b[0] - a[0]) * f, y, a[1] + (b[1] - a[1]) * f, ang]); }
      for (const h of [0.1, H - 0.025]) Rr.push([(a[0] + b[0]) / 2, y + h, (a[1] + b[1]) / 2, ang, len]);
    }
    const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, H - 0.12, 10, 1, true).translate(0, 0.1 + (H - 0.12) / 2, 0), mat, B.length);
    B.forEach(([x, y, z], k) => { mx.makeTranslation(x, y, z); bm.setMatrixAt(k, mx); });
    const pm = new THREE.InstancedMesh(roundedBox(0.05, H + 0.02, 0.05, 0.006), mat, Pp.length);
    Pp.forEach(([x, y, z, ang], k) => { mx.compose(v.set(x, y + (H + 0.02) / 2, z), q.setFromAxisAngle(up, -ang), sc.set(1, 1, 1)); pm.setMatrixAt(k, mx); });
    const rm = new THREE.InstancedMesh(roundedBox(1, 0.04, 0.05, 0.006, "x"), mat, Rr.length);
    Rr.forEach(([x, y, z, ang, len], k) => { mx.compose(v.set(x, y, z), q.setFromAxisAngle(up, -ang), sc.set(len, 1, 1)); rm.setMatrixAt(k, mx); });
    for (const m of [bm, pm, rm]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); group.add(m); }
  }
}
// a box with its edges rounded (r), centred; "x": long along x and stretched by its instance's scale, so the rounding
// is kept at the ends' size (the corners are built for a unit length and only the middle stretches)
function roundedBox(w, h, d, r, long = "y") {
  const sh = new THREE.Shape(), hw = (long === "x" ? h : w) / 2 - r, hd = d / 2 - r;
  sh.moveTo(-hw, -hd - r); sh.lineTo(hw, -hd - r); sh.absarc(hw, -hd, r, -Math.PI / 2, 0); sh.lineTo(hw + r, hd); sh.absarc(hw, hd, r, 0, Math.PI / 2);
  sh.lineTo(-hw, hd + r); sh.absarc(-hw, hd, r, Math.PI / 2, Math.PI); sh.lineTo(-hw - r, -hd); sh.absarc(-hw, -hd, r, Math.PI, Math.PI * 1.5);
  const L = long === "x" ? w : h;
  // (no bevel on the ends: a bevel of zero size there left corners with no surface, whose normals came out as NaN)
  const g = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -L / 2); // (along z, centred)
  if (long === "x") g.rotateY(Math.PI / 2).rotateX(Math.PI / 2); else g.rotateX(Math.PI / 2);
  // (smooth round the rounded edges: one normal per corner place; the texture coordinates are kept, as a box's)
  g.deleteAttribute("normal"); const uv = g.attributes.uv; g.deleteAttribute("uv");
  const m = mergeVertices(g, 1e-5); m.computeVertexNormals(); g.dispose();
  m.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2)); void uv;
  return m;
}
function segDist(q, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); }
// a mesh only for the camera's ray (never drawn)
function collider(p, i) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
