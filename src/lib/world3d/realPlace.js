// ---- realPlace: the meshes for a real place built from OpenStreetMap (see osmPlace.js) ----
// The ground from the grid, but with its edge snapped exactly onto the water's edge wherever there's a wall, so a deck
// meets its wall cleanly (sampled every few metres, the edge used to slope down below the water inside the wall and the
// sea showed through the walkway). Harbour walls only along real land-to-water edges (osmPlace.shoreEdges), drawn as
// steel sheet piling under a concrete cap; galvanised railings along them near the anglers; jetties on piles; the
// buildings from the architecture library (buildings3d.js). Materials are drawn on the phone (textures3d.js).
import * as THREE from "three";
import { unrle, GROUND, PLACE3D, inside } from "./osmPlace.js";
import { concrete, sheetPiling, detail, noise2, photoTex, weather, weatherTex, decalTex, grateTex, DECAL } from "./textures3d.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildBuildings } from "./buildings3d.js";
import { loadPart, weatherPierProps } from "./glbParts.js";
import { buildSkyline } from "./skyline.js";
import { localFor } from "./localDetail.js";
import { LANDMARK_BUILDERS } from "./landmarks3d.js";
import { WET_PREP, WET_DARKEN, wetRough } from "./wetLook.js";
import { contactShadows } from "./contactShadow.js";

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
// Over that, from the shared weathering noise at scales that never line up with the tiles: broad patches of lighter
// and darker concrete, smoother worn concrete (Poly Haven's concrete_floor_worn_001) where feet go, a few old stains,
// and along the walls a ragged band of damp (darker, a little greener, less rough) with dried salt just inside it.
// Wet (rain) darkens it and makes it shine. Until the photographs have loaded (or if they can't) the drawn one shows.
export const PIER_TEX = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/textures/pier_concrete_"; // (__fdAssetBase: only a self-contained preview page sets it, its files beside it; the app leaves it unset)
const PHOTO_TILE = 8 / 2.5; // the deck's uv runs one unit per 8 m
function pierConcrete(mat, quality = 1) {
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
      sh.vertexShader = "attribute float aDamp;\nvarying float vDamp;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDamp = aDamp;");
      sh.fragmentShader = "uniform sampler2D pDiff;\nuniform sampler2D pWorn;\nuniform sampler2D pNoise;\nuniform float uWet;\nvarying float vDamp;\nfloat fdDamp = 0.0, fdWorn = 0.0;\n" + sh.fragmentShader
        .replace("#include <map_fragment>", `#include <map_fragment>
        ${WET_PREP}
        {
          vec2 pu = vMapUv * ${PHOTO_TILE.toFixed(3)};
          vec3 a = texture2D(pDiff, pu).rgb, b = texture2D(pDiff, mat2(0.8, -0.6, 0.6, 0.8) * pu * 0.43 + vec2(0.37, 0.61)).rgb;
          float m = ${quality < 1 ? "0.0" : "smoothstep(0.42, 0.62, texture2D(map, vMapUv * 0.31 + 0.2).g * 1.6)"}; // (one sample on Performance)
          vec3 avg = texture2D(pDiff, vec2(0.5), 12.0).rgb; // its smallest mip: the photograph's own average colour
          vec3 p = mix(a, b, m) / max(avg, vec3(0.02)); // over its average: the drawn colour stays the colour
          p = mix(vec3(dot(p, vec3(0.3, 0.59, 0.11))), p, 0.35);
          diffuseColor.rgb *= mix(vec3(1.0), p, 0.6);
          // broad patches (about 70 m and 15 m across, turned so they never line up with the 8 m tile)
          vec4 nA = texture2D(pNoise, mat2(0.6, 0.8, -0.8, 0.6) * vMapUv * 0.11), nB = texture2D(pNoise, vMapUv * 0.53 + 0.3);
          diffuseColor.rgb *= 0.93 + nA.g * 0.14;
          // worn, smoother concrete where people walk (its own photograph, over its average)
          fdWorn = smoothstep(0.52, 0.74, nB.g * 0.7 + nA.g * 0.5);
          ${quality < 1 ? "" : `vec3 w = texture2D(pWorn, vMapUv * 2.1).rgb / max(texture2D(pWorn, vec2(0.5), 10.0).rgb, vec3(0.02));
          diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(dot(w, vec3(0.3, 0.59, 0.11))), w, 0.3), fdWorn * 0.55);`}
          // old stains: a few darker blotches a metre or so across
          float stn = smoothstep(0.74, 0.8, texture2D(pNoise, vMapUv * 1.7 + 0.71).g) * smoothstep(0.4, 0.6, nA.r);
          diffuseColor.rgb *= 1.0 - stn * 0.16;
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
    mat.customProgramCacheKey = () => "fdpier2" + (quality < 1 ? "p" : "");
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
  const dune = new Float32Array(n * n);
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
      // up from a few metres in from the edge, a rounded bank about 4 m high, down again behind it
      const rise = Math.min(4.2, Math.max(0, d - 7) * 0.24) * Math.max(0, Math.min(1, (62 - d) / 16)) * (0.7 + 0.6 * noise2(xs[i] / 17, xs[j] / 17, 1e6, 7));
      h[k] += rise; dune[k] = Math.min(1, rise / 1.1);
    }
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
    const g2 = dune[k] * (0.75 + 0.25 * noise2(X[k] / 5, Z[k] / 5, 1e6, 9)), GR = [0.46, 0.5, 0.3]; // (marram: a dry green)
    pos.set([X[k], h[k], Z[k]], k * 3); col.set([(c[0] + (GR[0] - c[0]) * g2) * v, (c[1] + (GR[1] - c[1]) * g2) * v, (c[2] + (GR[2] - c[2]) * g2) * v], k * 3);
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
  g.setAttribute("aDamp", new THREE.BufferAttribute(wet, 1)); // (the deck's shader: damp along the walls)
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
  const railMat = weather(new THREE.MeshStandardMaterial({ color: 0xaeb2b1, metalness: 0.6, roughness: 0.62 }), { scale: 0.7, mottle: 0.35, bump: 0.6, rust: [0.18, 0.16, 0.065, 0.028], grime: [LAND, LAND + 0.5, 0.22], rough: [0.8, 1.25], wet: place.deckWet });
  const jointMat = weather(new THREE.MeshStandardMaterial({ color: 0xa2a6a5, metalness: 0.55, roughness: 0.66 }), { scale: 0.35, mottle: 0.4, bump: 0.8, rust: [0.6, 0.15, 0.06, 0.025], grime: [LAND, LAND + 0.4, 0.25], rough: [0.8, 1.2], wet: place.deckWet });
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
    const lm = LANDMARK_BUILDERS[marks[b.id]](group, b.ring, groundAt(b.ring[0][0], b.ring[0][1]) || LAND);
    for (const m of lm.meshes) { m.userData.kind = "a building"; targets.push(m); }
    place.buildingGlow = [...(place.buildingGlow || []), ...lm.glow];
    if (lm.flash) beacons.push(lm.flash);
    const c = lm.collider, cbp = [], cbi = [];
    for (let k = 0; k < c.ring.length; k++) { const [x1, z1] = c.ring[k], [x2, z2] = c.ring[(k + 1) % c.ring.length], o = cbp.length / 3; cbp.push(x1, c.base, z1, x2, c.base, z2, x2, c.top, z2, x1, c.top, z1); cbi.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    solids.push(collider(cbp, cbi));
  }
  if (beacons.length) place.beacons = beacons;
  const res = buildBuildings(group, (place.buildings || []).filter((b) => !marks[b.id]), {
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
        if (rp.length) { const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.032, RAIL.h + 0.04, 8), railMat, rp.length), mx = new THREE.Matrix4(); rp.forEach(([x, z], q) => { mx.makeTranslation(x, p.h + RAIL.h / 2, z); pm.setMatrixAt(q, mx); }); group.add(pm); }
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
      const rail = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 20, 1, true), railMat, jRail.length), qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
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
  // the camera keeps above the ground: the height of land, beach or grass under a point (water is 0)
  function cAt(x, z) { let i = 0, j = 0; while (i < n - 1 && xs[i + 1] <= x) i++; while (j < n - 1 && xs[j + 1] <= z) j++; return cls[j * n + i]; }
  void PLACE3D;
  // open sea only (outside the land and outside any mapped river, lake or harbour water), for boats
  place.waterAt = (x, z) => { const q = [x, z]; return !LR.some((bb) => inB(q, bb)) && !PR.some((bb) => inB(q, bb)) && !WR.some((bb) => inB(q, bb)); };
  place.perches = perches;
  // beyond the mapped square: real landmarks where they are, an indicative low town over the land (skyline.js)
  place.skyline = buildSkyline(group, place, { groundY: LAND, quality, industry: local?.industry || null });
  if (place.skyline?.glow?.length) place.buildingGlow = [...(place.buildingGlow || []), ...place.skyline.glow];
  return (x, z) => { const c = cAt(x, z); if (c !== 0) return H_OF[c]; const w = nearestWall(x, z); return w && w.d < 3 && landAt([x, z]) ? LAND : 0; };
}
// ---- the other kinds of fence a photograph shows (localDetail.js): runs of [a, b, deck height] ----
// timber: heavy square posts every 2.4 m with two rails (instanced: two draw calls). bars: a steel railing of upright
// bars between a top and bottom rail, drawn as one see-through panel per run (one draw call, cut out of a texture).
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
