// FishDock: the grass itself, as a thick layer of blades over the lawns, verges and banks near the camera (Balanced and
// up). The photographed ground under it carries the grass further off; close to, it was flat, with a few clumps stood
// on it (grassTufts.js, still drawn as the taller clumps among this). Here the ground is covered: thousands of wide
// cards, each a strip of continuous grass modelled blade by blade in Blender (build_grass_field.py ->
// public/textures/grass_field.webp, four kinds: a lawn, rough grass, meadow grass with seed heads, and short grass
// with daisies, buttercups and clover in it), two crossed to a clump, one instanced mesh for them all.
// - Each card is only as tall as its kind's blades (a lawn's 15 cm, not the picture's 60), so the clear air above
//   them isn't drawn.
// - Its colour is the ground's where it stands (the picture giving the blades' light and dark), so the layer and the
//   photographed ground beyond it are the same lawn; the flowers and the dried blades keep their own colours.
// - Lit as the ground is (their normals point up), brighter where the sun shines through them from behind.
// - The wind runs over them in gusts, a wave bending the blades and lightening them as it passes, the tips most.
// - They thin out with distance, the last of them sinking into the ground at the edge of their reach.
// Placement: the world is cut into 4 m squares, each with its own seed, worked out once and kept (so the grass is the
// same each time you come back); as the camera moves, the squares within reach are copied into the one mesh.
import { DETAIL } from "./detail.js";
import * as THREE from "three";
import { TEX_BASE } from "./textures3d.js";

// ---- the picture: two by two cells, each 1.2 m across and 0.6 m tall, the ground along its foot ----
// (KH: each kind's tallest blades, the height of its card)
export const FIELD = { file: "grass_field.webp", cols: 2, rows: 2, w: 1.2, h: 0.6, KH: [0.15, 0.38, 0.56, 0.3], lum: 0.184 };
const SQ = 4;

/**
 * @param {THREE.Group} group
 * @param {object} o  grassAt, yAt, colourAt, avoid, roughAt as grassTufts.js; quality 0..2
 * @returns {{ mesh, update(t, cam, wind, windDir), dispose } | null}
 */
export function buildGrassField(group, { grassAt, yAt, colourAt, avoid, roughAt = () => 0.5, quality = 1, seed = 1, atlas = FIELD } = {}) {
  if (quality < 1 || typeof document === "undefined") return null;
  // (a phone, on Balanced, a smaller patch and thinner: the cards are cut out of their picture, and on a phone's
  // graphics each layer of them over a pixel costs; a computer with a graphics card, on High and Ultra, the full)
  // (Ultra: 30 m and thick; High: 20 m; Balanced, or a phone: 12 m and thinner)
  const hi = quality >= 2, ultra = hi && DETAIL.ultra, reach = ultra ? 30 : hi ? 20 : 12, dens = ultra ? 15 : hi ? 10 : 5, cap = ultra ? 36000 : hi ? 16000 : 6000;
  // ---- one clump: two cards crossed, each the cell's width, 1 tall (the kind's height is set in the shader) ----
  // (three cards at 60 degrees: with two, seen from above, each clump showed as a cross)
  const P = [], N = [], UV = [], I = [], CN = [];
  for (let c = 0; c < 3; c++) {
    const a = c * Math.PI / 3 + 0.3, dx = Math.cos(a) * atlas.w * 0.5, dz = Math.sin(a) * atlas.w * 0.5, o = P.length / 3;
    P.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    for (let k = 0; k < 4; k++) { N.push(0, 1, 0); CN.push(-Math.sin(a), 0, Math.cos(a)); }
    UV.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); geo.setAttribute("aCN", new THREE.Float32BufferAttribute(CN, 3)); geo.setIndex(I);
  const aAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), aTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), aSlope = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  aAttr.setUsage(THREE.DynamicDrawUsage); aTint.setUsage(THREE.DynamicDrawUsage); aSlope.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aAttr", aAttr); geo.setAttribute("aTint", aTint); geo.setAttribute("aSlope", aSlope); // (aAttr: kind, phase, rank; aSlope: the ground's rise a metre east and south)

  let ready = false, cx = 1e9, cz = 1e9;
  const tex = new THREE.TextureLoader().load(TEX_BASE + atlas.file, () => { ready = true; cx = 1e9; });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const U = { uTime: { value: 0 }, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.3, -1) } };
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xffffff });
  const kh = atlas.KH.map((v) => v.toFixed(3));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uWindDir = U.uWindDir;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
        uniform float uTime, uWind; uniform vec2 uWindDir; attribute vec3 aAttr; attribute vec3 aTint; attribute vec2 aSlope; attribute vec3 aCN; varying vec3 vTint; varying float vUp, vGust, vFace;
        float fdKH(float k) { return k < 0.5 ? ${kh[0]} : k < 1.5 ? ${kh[1]} : k < 2.5 ? ${kh[2]} : ${kh[3]}; }`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
        { float k = aAttr.x, cu = mod(k, ${atlas.cols.toFixed(1)}), cv = floor(k / ${atlas.cols.toFixed(1)});
          // (the kind's cell, and only as much of it as its blades fill)
          vMapUv = vec2((cu + 0.003 + vMapUv.x * 0.994) / ${atlas.cols.toFixed(1)}, (cv + vMapUv.y * fdKH(k) / ${atlas.h.toFixed(3)}) / ${atlas.rows.toFixed(1)}); }`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.y *= fdKH(aAttr.x);
        // (on a slope the card's foot follows the ground, not a level line half in the air and half buried)
        { vec3 fdO = (instanceMatrix * vec4(transformed.x, 0.0, transformed.z, 0.0)).xyz; transformed.y += dot(fdO.xz, aSlope) / max(length(instanceMatrix[1].xyz), 1e-3); }
        vUp = position.y; vTint = aTint;
        vec3 fdW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        // (how squarely the card faces the eye: seen edge on or from above it fades, the ground's own grass showing)
        { vec3 cn = normalize((modelMatrix * instanceMatrix * vec4(aCN, 0.0)).xyz); vec3 vd = normalize(cameraPosition - fdW - vec3(0.0, 0.2, 0.0)); vFace = abs(dot(cn, vd)); }
        // (thinning out with distance: each clump, by its rank, sinks into the ground somewhere short of the reach)
        float fdR = ${reach.toFixed(1)} * (1.0 - 0.6 * aAttr.z), fdD = distance(fdW, cameraPosition);
        transformed *= smoothstep(fdR, fdR * 0.8, fdD);
        // (the wind: gusts running over the grass as a wave along the wind, the blades bending most at their tips,
        // and a small shiver of their own)
        vec2 wd = normalize(uWindDir + vec2(1e-4));
        float gust = 0.5 + 0.5 * sin(dot(fdW.xz, wd) * 0.32 - uTime * 2.1 + sin(dot(fdW.xz, vec2(-wd.y, wd.x)) * 0.11) * 1.7);
        gust *= gust; vGust = gust * uWind;
        float bend = uWind * (0.18 + 0.82 * gust) * (0.75 + 0.25 * sin(uTime * 3.1 + aAttr.y)) * position.y * position.y * fdKH(aAttr.x) * 0.45;
        vec3 wl = (vec4(wd.x, 0.0, wd.y, 0.0) * instanceMatrix).xyz;
        transformed += wl * bend + vec3(0.0, -bend * 0.25, 0.0);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vTint; varying float vUp, vGust, vFace;")
      .replace("#include <map_fragment>", `
        vec4 fdTx = texture2D(map, vMapUv);
        float fdL = dot(fdTx.rgb, vec3(0.3, 0.55, 0.15));
        // (green blades take the ground's colour where they stand, their own light and dark kept; the flowers and the
        // dried blades, not green, keep their own)
        float fdG = clamp((fdTx.g - max(fdTx.r * 0.92, fdTx.b * 1.1)) * 9.0, 0.0, 1.0);
        // (the seed heads and dry blades taken halfway to their own grey: at full colour a slope of Yorkshire fog read as
        // a field of lavender on Aaron's PC)
        vec3 fdOwn = mix(vec3(fdL), fdTx.rgb, 0.5) * 0.8;
        diffuseColor.rgb = mix(fdOwn, vTint * (fdL / ${atlas.lum.toFixed(3)}) * 0.8, fdG) * (1.0 + 0.14 * vGust * vUp);
        // (darker towards the root, where the blades shade each other and the soil shows between them: lit evenly to
        // the ground the cards read as pale cut-out combs from a few metres off)
        diffuseColor.rgb *= mix(0.42, 1.04, smoothstep(0.0, 0.6, vUp));
        // (a blade is a few pixels wide: in the picture's smaller copies its alpha is raised, so it doesn't fade away)
        vec2 fdDx = dFdx(vMapUv * vec2(2048.0, 1024.0)), fdDy = dFdy(vMapUv * vec2(2048.0, 1024.0));
        diffuseColor.a *= fdTx.a * (1.0 + max(0.0, 0.5 * log2(max(dot(fdDx, fdDx), dot(fdDy, fdDy)))) * 0.3) * smoothstep(0.12, 0.42, vFace);`)
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;")
      // (the sun through the blades from behind: lit grass brighter, its tips most, when you look towards the sun)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          { float fdB = pow(max(0.0, dot(-normalize(vViewPosition), directionalLights[0].direction)), 3.0); reflectedLight.directDiffuse *= 1.0 + fdB * 0.9 * vUp; }
        #endif`);
  };
  mat.customProgramCacheKey = () => "fdfield3";
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = "fdGrassField"; mesh.castShadow = false; mesh.receiveShadow = true; mesh.noReflect = true; mesh.frustumCulled = false; mesh.count = 0;
  mesh.userData.kind = "grass"; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  // ---- where nothing grows: looked up once a metre square ----
  const blocked = new Map();
  const isBlocked = (x, z) => { const k = Math.floor(x) * 100003 + Math.floor(z); let v = blocked.get(k); if (v === undefined) { v = avoid(Math.floor(x) + 0.5, Math.floor(z) + 0.5); blocked.set(k, v); } return v; };
  // ---- a square's clumps, worked out once from its own seed: matrices, tints and attributes ready to copy ----
  const memo = new Map();
  const rng = (a, b) => { let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(seed + 11, 83492791)) >>> 0; return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  function square(ix, iz) {
    const key = ix * 65536 + iz; let s = memo.get(key);
    if (s) return s;
    const r = rng(ix, iz), n0 = dens * SQ * SQ, M = new Float32Array(n0 * 16), T = new Float32Array(n0 * 3), A = new Float32Array(n0 * 3), G = new Float32Array(n0 * 2);
    let n = 0;
    for (let k = 0; k < n0; k++) {
      const x = (ix + r()) * SQ, z = (iz + r()) * SQ, roll = r(), kr = r(), sw = r(), shh = r(), rot = r(), ph = r(), rank = r();
      const g = grassAt(x, z); if (g <= 0.04 || roll > g) continue;
      if (isBlocked(x, z)) continue;
      // (thinner next to where nothing grows, so a path's or a wall's edge isn't a straight cut through the grass)
      { const nb = (isBlocked(x - 1, z) ? 1 : 0) + (isBlocked(x + 1, z) ? 1 : 0) + (isBlocked(x, z - 1) ? 1 : 0) + (isBlocked(x, z + 1) ? 1 : 0); if (nb && roll > 1 - nb * 0.22) continue; }
      const c = colourAt(x, z); if (!c) continue;
      const rough = roughAt(x, z);
      // (which kind: a mown lawn mostly lawn, some flowers; rough ground rough grass with lawn and flowers; banks rough
      // and meadow grass; a dune's marram, rough and meadow grass in its straw and grey-green)
      const kind = rough > 1.2 ? (kr < 0.6 ? 1 : 2) : rough >= 0.9 ? (kr < 0.45 ? 1 : kr < 0.85 ? 2 : kr < 0.95 ? 3 : 0) : rough >= 0.4 ? (kr < 0.5 ? 1 : kr < 0.8 ? 0 : kr < 0.93 ? 3 : 2) : (kr < 0.9 ? 0 : 3);
      const w = 0.38 + sw * 0.32, h = (0.75 + shh * 0.5) * (rough >= 0.9 ? 1.1 : 1), y = yAt(x, z);
      e.set(0, rot * Math.PI * 2, 0); q.setFromEuler(e); m4.compose(pv.set(x, y - 0.035, z), q, sv.set(w, h, w)); m4.toArray(M, n * 16);
      G[n * 2] = yAt(x + 0.5, z) - yAt(x - 0.5, z); G[n * 2 + 1] = yAt(x, z + 0.5) - yAt(x, z - 0.5);
      T[n * 3] = c[0]; T[n * 3 + 1] = c[1]; T[n * 3 + 2] = c[2];
      A[n * 3] = kind; A[n * 3 + 1] = ph * 6.283; A[n * 3 + 2] = rank;
      n++;
    }
    s = { n, M: M.subarray(0, n * 16), T: T.subarray(0, n * 3), A: A.subarray(0, n * 3), G: G.subarray(0, n * 2) };
    if (memo.size > 3000) memo.clear();
    memo.set(key, s);
    return s;
  }
  function fill(px, pz) {
    const nS = Math.ceil(reach / SQ) + 1, sx = Math.floor(px / SQ), sz = Math.floor(pz / SQ), lim = (reach + SQ * 0.75) ** 2, order = [];
    for (let j = -nS; j <= nS; j++) for (let i = -nS; i <= nS; i++) { const dx = (sx + i + 0.5) * SQ - px, dz = (sz + j + 0.5) * SQ - pz, d = dx * dx + dz * dz; if (d < lim) order.push([d, sx + i, sz + j]); }
    order.sort((a, b) => a[0] - b[0]);
    const MI = mesh.instanceMatrix.array; let k = 0;
    for (const [, ix, iz] of order) {
      const s = square(ix, iz); if (!s.n) continue;
      const n = Math.min(s.n, cap - k); if (n <= 0) break;
      MI.set(n === s.n ? s.M : s.M.subarray(0, n * 16), k * 16); aTint.array.set(n === s.n ? s.T : s.T.subarray(0, n * 3), k * 3); aAttr.array.set(n === s.n ? s.A : s.A.subarray(0, n * 3), k * 3); aSlope.array.set(n === s.n ? s.G : s.G.subarray(0, n * 2), k * 2);
      k += n;
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true; aTint.needsUpdate = true; aAttr.needsUpdate = true; aSlope.needsUpdate = true;
  }
  function update(t, cam, wind = 0.3, windDir = null) {
    U.uTime.value = t; U.uWind.value = Math.max(0.12, Math.min(1.3, wind)); if (windDir) U.uWindDir.value.set(windDir[0] ?? windDir.x, windDir[1] ?? windDir.y);
    if (!cam) return;
    const x = cam.position.x, z = cam.position.z;
    mesh.visible = cam.position.y - yAt(x, z) < reach * 0.8;
    if (!mesh.visible || !ready) return;
    if (Math.abs(x - cx) < 2 && Math.abs(z - cz) < 2) return; // (copied again every 2 m)
    cx = x; cz = z; fill(x, z);
  }
  return { mesh, update, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); group.remove(mesh); } };
}
