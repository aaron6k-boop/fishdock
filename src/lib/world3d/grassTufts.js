// FishDock: tufts of grass standing up out of the lawns, verges and banks near the camera (Balanced and Ultra).
// The tufts are modelled blade by blade in Blender and rendered onto one picture, four kinds side by side
// (source-assets/blender/build_grass.py -> public/textures/grass_tufts.webp; their colours from Poly Haven's
// photoscanned "Leafy Grass", CC0). Each tuft here is three of those cards crossed at 60 degrees, one instanced mesh
// for all of them (one draw call). They take the ground's own colour where they stand (the picture gives their light
// and dark, and a little of each blade's own hue), are lit as the ground is (their normals point up, so a card seen
// edge-on or from behind isn't darker than the lawn round it), and sway in the wind, the tips most.
// Placement: the world is cut into 8 m squares; each square's tufts come from its own seed, so a square looks the same
// whenever you come back to it. Only the squares within reach of the camera are filled, again as it crosses a square.
import * as THREE from "three";
import { TEX_BASE } from "./textures3d.js";

// ---- the picture: four quarters, each 0.6 m across and tall, the ground along its foot ----
const KINDS = 4, CARD = 0.6;
// (the picture's mean light (by 0.3 R + 0.55 G + 0.15 B) and its mean colour over that light, measured from
// the picture's opaque pixels: a tuft's colour is the ground's, times its own light over that mean)
const LUM_MEAN = 0.2, HUE_MEAN = [1.03, 1.17, 0.31];
const SQ = 8;

/**
 * @param {THREE.Group} group
 * @param {object} o
 * @param {(x:number,z:number)=>number} o.grassAt   how much grass grows here, 0..1 (0: none)
 * @param {(x:number,z:number)=>number} o.yAt       the ground's height as drawn
 * @param {(x:number,z:number)=>number[]|null} o.colourAt the ground's colour here (linear rgb), or null
 * @param {(x:number,z:number)=>boolean} o.avoid    true where no tuft goes (roads, buildings, piers)
 * @param {(x:number,z:number)=>number} [o.roughAt] how rough the grass is here, 0 (a mown lawn) to 1 (a bank); 2 a dune's marram
 * @param {number} o.quality  0 Performance (none), 1 Balanced, 2 Ultra
 * @returns {{ mesh, update(t, cam, wind, windDir), dispose } | null}
 */
export function buildGrassTufts(group, { grassAt, yAt, colourAt, avoid, roughAt = () => 0.5, quality = 1, seed = 1, sparse = false } = {}) {
  if (quality < 1 || typeof document === "undefined") return null;
  // (sparse: with the thick layer of grass under them (grassField.js), only the odd taller clump among it)
  const reach = quality >= 2 ? 34 : 22, perSq = Math.round((quality >= 2 ? 30 : 20) * (sparse ? 0.35 : 1)), cap = quality >= 2 ? 9000 : 3200;
  // ---- one tuft: three cards crossed at 60 degrees, each 0.6 m wide and tall, its foot at the ground ----
  const P = [], N = [], UV = [], I = [];
  for (let c = 0; c < 3; c++) {
    const a = (c * Math.PI) / 3, dx = Math.cos(a) * CARD * 0.5, dz = Math.sin(a) * CARD * 0.5, o = P.length / 3;
    P.push(-dx, -0.02, -dz, dx, -0.02, dz, dx, CARD - 0.02, dz, -dx, CARD - 0.02, -dz);
    for (let k = 0; k < 4; k++) N.push(0, 1, 0);
    UV.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); geo.setIndex(I);
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1), aPhase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  geo.setAttribute("aKind", aKind); geo.setAttribute("aPhase", aPhase);

  // (none drawn until the picture has arrived: before it, the cards would be drawn as black squares)
  let ready = false;
  const tex = new THREE.TextureLoader().load(TEX_BASE + "grass_tufts.webp", () => { ready = true; cx = 1e9; });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  let cx = 1e9, cz = 1e9;
  const U = { uTime: { value: 0 }, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.3, -1) } };
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uWindDir = U.uWindDir;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime, uWind; uniform vec2 uWindDir; attribute float aKind; attribute float aPhase;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv.x = (vMapUv.x * 0.996 + 0.002 + aKind) * 0.25;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        // (towards the edge of the patch they sink into the ground, so its edge isn't a line across the lawn)
        float fdD = distance((modelMatrix * instanceMatrix[3]).xyz, cameraPosition);
        transformed *= smoothstep(${reach.toFixed(1)}, ${(reach * 0.62).toFixed(1)}, fdD);
        // (the wind: the tips swing most, the root not at all; a slow sway with the gusts and a quicker small shiver)
        float up = clamp(position.y / ${CARD.toFixed(2)}, 0.0, 1.0); up *= up;
        float sway = (0.55 + 0.45 * sin(uTime * 0.8 + aPhase)) * sin(uTime * 1.9 + aPhase * 1.3) * uWind;
        vec2 wd = normalize(uWindDir + vec2(1e-4));
        vec3 wl = (vec4(wd.x, 0.0, wd.y, 0.0) * instanceMatrix).xyz; // (into the tuft's own axes)
        transformed += wl * up * (sway * 0.07 + uWind * 0.04) + vec3(0.0, 0.0, sin(uTime * 4.3 + aPhase * 2.7 + position.x * 9.0) * uWind * 0.012 * up);`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `
      vec4 fdTx = texture2D(map, vMapUv);
      float fdTl = dot(fdTx.rgb, vec3(0.3, 0.55, 0.15));
      // (the ground's colour (the instance's) times the blade's own light over the picture's mean, with a little of the
      // blade's own hue: the dry, straw-coloured ones stay so)
      // (a little darker than the ground's own: lit square on from above, the cards read paler than the lawn round them)
      // (the hue only in red and green, and held within a quarter: the picture has little blue, so its blue over the
      // mean swung the dry, straw-coloured tufts to pink)
      vec2 fdHue = clamp(fdTx.rg / max(vec2(fdTl), vec2(1e-3)) / vec2(${HUE_MEAN.slice(0, 2).map((v) => v.toFixed(3)).join(", ")}), 0.8, 1.25);
      diffuseColor.rgb *= 0.8 * (fdTl / ${LUM_MEAN.toFixed(3)}) * mix(vec3(1.0), vec3(fdHue, 1.0), 0.3);
      // (a blade is a few pixels wide: in the picture's smaller copies, further off, it fades to a thin haze and the alpha
      // test would cut it away, so its alpha is raised with the copy's level)
      vec2 fdDx = dFdx(vMapUv * vec2(2048.0, 512.0)), fdDy = dFdy(vMapUv * vec2(2048.0, 512.0));
      diffuseColor.a *= fdTx.a * (1.0 + max(0.0, 0.5 * log2(max(dot(fdDx, fdDx), dot(fdDy, fdDy)))) * 0.3);`)
      // (lit as the ground is, from either side: the cards' normals point up, and aren't turned over on their backs)
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;");
  };
  mat.customProgramCacheKey = () => "fdtuft1";
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = "fdGrassTufts"; mesh.castShadow = false; mesh.receiveShadow = true; mesh.noReflect = true; mesh.frustumCulled = false;
  mesh.count = 0; mesh.userData.kind = "grass";
  mesh.userData.grassAt = grassAt; mesh.userData.yAt = yAt; mesh.userData.avoid = avoid; mesh.userData.roughAt = roughAt; // (for the tests and pictures: where there's grass)
  const col = new THREE.Color(1, 1, 1);
  for (let k = 0; k < cap; k++) mesh.setColorAt(k, col);
  group.add(mesh);

  // ---- a square's tufts: from its own seed, kept once worked out ----
  const memo = new Map();
  const hash = (a, b) => { let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(seed, 83492791)) >>> 0; return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; };
  function square(ix, iz) {
    const key = ix * 65536 + iz;
    if (memo.has(key)) return memo.get(key);
    const r = hash(ix, iz), out = [];
    for (let k = 0; k < perSq; k++) {
      const x = (ix + r()) * SQ, z = (iz + r()) * SQ, g = grassAt(x, z), roll = r(), kindR = r(), s = r(), rot = r(), ph = r();
      if (g <= 0.05 || roll > g) continue;
      if (avoid(x, z)) continue;
      const c = colourAt(x, z); if (!c) continue;
      // (on a mown lawn mostly the short lawn tuft; on rough ground and banks the taller meadow and coarse coastal
      // ones; a dry, straw-coloured one now and then)
      // (rough over 1: a dune's marram, the coarse coastal tuft mostly, some dried to straw)
      const rough = roughAt(x, z), pLawn = 0.8 - 0.6 * Math.min(1, rough), pCoast = pLawn + 0.06 + 0.3 * Math.min(1, rough);
      const kind = rough > 1.2 ? (kindR < 0.62 ? 1 : kindR < 0.82 ? 3 : 0) : kindR < pLawn ? 2 : kindR < pCoast ? 1 : kindR < 0.95 ? 0 : 3;
      out.push({ x, y: yAt(x, z), z, kind, s: 0.75 + s * 0.6, rot: rot * Math.PI * 2, ph: ph * 6.28, c });
    }
    if (memo.size > 4000) memo.clear();
    memo.set(key, out);
    return out;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  function fill(px, pz) {
    const r2 = reach * reach, n = Math.ceil(reach / SQ); let k = 0;
    const sx = Math.floor(px / SQ), sz = Math.floor(pz / SQ);
    // (nearest squares first, so when the cap is reached it's the far ones that go without)
    const order = [];
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) { const ddx = (sx + i + 0.5) * SQ - px, ddz = (sz + j + 0.5) * SQ - pz, d = ddx * ddx + ddz * ddz; if (d < (reach + SQ) * (reach + SQ)) order.push([d, sx + i, sz + j]); }
    order.sort((a, b) => a[0] - b[0]);
    for (const [, ix, iz] of order) {
      for (const t of square(ix, iz)) {
        if (k >= cap) break;
        const ddx = t.x - px, ddz = t.z - pz; if (ddx * ddx + ddz * ddz > r2) continue;
        e.set(0, t.rot, 0); q.setFromEuler(e); m4.compose(p.set(t.x, t.y, t.z), q, sc.set(t.s, t.s * (0.85 + 0.3 * ((t.ph * 7.3) % 1)), t.s)); mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k, col.setRGB(t.c[0], t.c[1], t.c[2])); aKind.array[k] = t.kind; aPhase.array[k] = t.ph; k++;
      }
    }
    mesh.count = k; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; aKind.needsUpdate = true; aPhase.needsUpdate = true;
  }
  function update(t, cam, wind = 0.3, windDir = null) {
    U.uTime.value = t; U.uWind.value = Math.max(0.1, Math.min(1.2, wind)); if (windDir) U.uWindDir.value.set(windDir[0] ?? windDir.x, windDir[1] ?? windDir.y);
    if (!cam) return;
    const x = cam.position.x, z = cam.position.z;
    // (filled again once the camera has gone a quarter of a square: the far edge of the patch is then never more than
    // 2 m short; up high, over the town, the patch would be too small to see, so nothing is drawn)
    mesh.visible = cam.position.y - yAt(x, z) < reach * 0.9;
    if (!mesh.visible) return;
    if (!ready || (Math.abs(x - cx) < SQ / 4 && Math.abs(z - cz) < SQ / 4)) return;
    cx = x; cz = z; fill(x, z);
  }
  return { mesh, update, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); group.remove(mesh); } };
}
