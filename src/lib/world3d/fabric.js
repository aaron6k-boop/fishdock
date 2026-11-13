// ---- fabric: a coat's cloth, for a material on a model with no cloth texture of its own ----
// An outdoor jacket's ripstop nylon: a fine plain weave with a heavier thread every 5 mm in both directions, a little
// unevenness in the dye, and soft creases a few centimetres across. Drawn into one small tile (made here, no image to
// load) and laid over the model by its own surface, from three sides blended by which way the surface faces, so it
// needs no UV map and never stretches. It follows the cloth as the arm bends (the model's own rest shape is used).
// The tile's red is the weave's height, green the creases', blue the dye's variation; the shading takes its relief from
// how those heights change across the screen, as three.js bump maps do.
import * as THREE from "three";

const N = 256; // (one tile: 8 by 8 cells of the ripstop grid, 32 pixels each)
let tile = null;
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function smooth(x, y, p, s) { // (value noise, tiling with period p cells)
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (i, j) => hash(((xi + i) % p + p) % p, ((yi + j) % p + p) % p, s);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
}

/** The cloth tile (made once). */
export function fabricTile() {
  if (tile) return tile;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // plain weave: over one, under one, each thread two pixels wide, a touch uneven
    const over = ((x >> 1) + (y >> 1)) & 1, along = over ? Math.sin(((y & 1) + 0.5) * Math.PI) : Math.sin(((x & 1) + 0.5) * Math.PI);
    let w = 0.45 + 0.3 * over * along + 0.25 * (1 - over) * along + (hash(x, y, 3) - 0.5) * 0.12;
    // the ripstop threads: a doubled, raised thread every 32 pixels each way
    const gx = x % 32, gy = y % 32, grid = gx < 3 || gy < 3; if (grid) w = Math.min(1, w + 0.35);
    // creases: soft ridges a few centimetres apart running round a sleeve (the sleeve lies along x in the model's rest
    // shape, so they change quickly along x and slowly across it), and the dye's unevenness
    const c = smooth(x / 32, y / 64, 8, 7) * 0.65 + smooth(x / 16, y / 32, 16, 9) * 0.35;
    const dye = smooth(x / 40, y / 40, 7, 11) * 0.7 + hash(x >> 2, y >> 2, 13) * 0.3;
    const i = (y * N + x) * 4; d[i] = Math.round(w * 255); d[i + 1] = Math.round(c * 255); d[i + 2] = Math.round(dye * 255); d[i + 3] = grid ? 255 : 0;
  }
  tile = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.magFilter = THREE.LinearFilter; tile.minFilter = THREE.LinearMipmapLinearFilter; tile.generateMipmaps = true; tile.anisotropy = 4; tile.needsUpdate = true;
  return tile;
}

/**
 * Makes a material look like that cloth. o.tile: metres a tile (default 5 cm: the grid 6 mm); o.weave and o.creases: how
 * strong each relief is; o.dye: how much the colour varies. Keeps any onBeforeCompile the material already has.
 */
export function clothe(mat, o = {}) {
  const U = { tFab: { value: fabricTile() }, fabScale: { value: 1 / (o.tile ?? 0.05) }, fabWeave: { value: o.weave ?? 1 }, fabCrease: { value: o.creases ?? 1 }, fabDye: { value: o.dye ?? 0.5 } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vFabP;\nvarying vec3 vFabN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFabP = position; vFabN = normal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vFabP; varying vec3 vFabN;
uniform sampler2D tFab; uniform float fabScale, fabWeave, fabCrease, fabDye;
vec3 fabTri(float s) {
  vec3 w = pow(abs(normalize(vFabN)), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(tFab, vFabP.yz * s).rgb * w.x + texture2D(tFab, vFabP.xz * s).rgb * w.y + texture2D(tFab, vFabP.xy * s).rgb * w.z;
}
float fabGrid(float s) {
  vec3 w = pow(abs(normalize(vFabN)), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(tFab, vFabP.yz * s).a * w.x + texture2D(tFab, vFabP.xz * s).a * w.y + texture2D(tFab, vFabP.xy * s).a * w.z;
}
vec3 fabBump(vec3 p, vec3 n, vec2 dH, float face) {
  // (the surface's own steps across a pixel, not normalised: so a height in metres gives the same slope near and far)
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
}`)
      .replace("#include <map_fragment>", "#include <map_fragment>\nvec3 fabF = fabTri(fabScale), fabC = fabTri(fabScale * 0.11);\ndiffuseColor.rgb *= 1.0 - fabDye * 0.5 + fabDye * (fabF.b * 0.6 + fabC.b * 0.4) - 0.06 * (1.0 - fabF.r) + 0.22 * fabGrid(fabScale);")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n{ float h = fabF.r * fabWeave * 0.00015 + fabC.g * fabCrease * 0.007; /* (metres: the weave a tenth of a millimetre, the creases a few) */ normal = fabBump(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection); }");
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ""}|fabric`;
  return mat;
}
