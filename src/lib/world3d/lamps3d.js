// ---- lamps3d: a pier's lighting columns, and the warm pool each lamp throws on the deck after dark ----
// The column is a modern LED street light as piers and promenades have now: a galvanised tapered pole on a bolted
// flange with its access door, rising into a short swan-neck bracket that carries a slim lantern over the deck, its
// housing grey and its flat lens underneath (the only part that lights). Built in the pole's own frame (y up, the
// bracket reaching towards +z), so one instance matrix places the pole, the bracket, the housing and the lens.
// The pools: a soft round patch of lamplight on the deck under each lamp, added to what's there (one draw for them
// all). Their glow is driven with the lamps' (environment.js: nothing by day, full at night), so the pier reads lit
// along its length at night, not only round the anglers where the real lights are.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** the column's sizes (metres): the pole's height to the bracket, the bracket's reach and rise, the lantern */
export const COLUMN = { h: 6.5, reach: 0.42, rise: 0.3, lantern: [0.24, 0.07, 0.6], tilt: 0.09 };

/** a box with its edges rounded (r) and narrowing towards -z by taper (the lantern's end at the bracket is slimmer) */
function roundBox(w, h, d, r, taper = 0) {
  const g = new THREE.BoxGeometry(w, h, d, 6, 3, 8), q = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < q.count; i++) {
    v.fromBufferAttribute(q, i); const k = 1 - taper * (0.5 - v.z / d);
    const hw = (w / 2) * k - r, hh = (h / 2) * (0.75 + 0.25 * k) - r, hd = d / 2 - r;
    c.set(Math.max(-hw, Math.min(hw, v.x * k)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const n = v.set(v.x * k, v.y, v.z).sub(c); if (n.lengthSq() > 1e-12) n.setLength(r); q.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z);
  }
  g.computeVertexNormals(); return g;
}

/** Where the lantern's lens is in the pole's frame, and which way it faces (down, tipped up a little at its far end). */
export function lanternAt(C = COLUMN) {
  const y = C.h + C.rise, z0 = C.reach - 0.06, len = C.lantern[2];
  return { y, z: z0 + (len / 2) * Math.cos(C.tilt), top: y + C.lantern[1] / 2 + (len / 2) * Math.sin(C.tilt) + 0.02 };
}

/**
 * The column's two geometries in the pole's frame: { pole } (the pole, its root section and door, the flange, the
 * swan-neck bracket and the lantern's housing: one mesh in the pole's finish) and { lens } (the lantern's lens, lit
 * after dark). Neither has texture coordinates, as the weathered metal is worked out in the world.
 */
export function columnGeometry(C = COLUMN) {
  const H = C.h, parts = [
    new THREE.CylinderGeometry(0.05, 0.09, H, 8, 1, true).translate(0, H / 2, 0),
    new THREE.CylinderGeometry(0.105, 0.11, 1.1, 10, 1, true).translate(0, 0.55, 0), // (the wider root section)
    new THREE.CylinderGeometry(0.098, 0.105, 0.05, 10, 1).translate(0, 1.12, 0),
    new THREE.BoxGeometry(0.1, 0.42, 0.03).translate(0, 0.62, 0.1), // (its access door, towards the deck)
    new THREE.CylinderGeometry(0.17, 0.18, 0.025, 10, 1).translate(0, 0.012, 0), // (the flange bolted to the deck)
    new THREE.SphereGeometry(0.05, 8, 6).translate(0, H, 0), // (the joint at the top of the pole)
  ];
  // the swan-neck: up out of the pole's top and over in a quarter turn, then straight out to the lantern
  const pts = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector3(0, H + C.rise * Math.sin(a), C.rise * (1 - Math.cos(a)))); }
  pts.push(new THREE.Vector3(0, H + C.rise, C.reach));
  parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.035, 8, false));
  // the lantern: a slim rounded housing, slimmer at the bracket, tipped up a little towards its far end
  const [lw, lh, ll] = C.lantern, L = lanternAt(C);
  const housing = roundBox(lw, lh, ll, 0.026, 0.3).rotateX(-C.tilt).translate(0, L.y, L.z);
  parts.push(housing);
  const pole = mergeGeometries(parts.map((g) => { g.deleteAttribute("uv"); return g.index ? g.toNonIndexed() : g; }));
  // the lens: flat under the housing, inset from its edges
  const lens = new THREE.PlaneGeometry(lw * 0.72, ll * 0.78).rotateX(Math.PI / 2).rotateX(-C.tilt).translate(0, L.y - lh / 2 - 0.004, L.z);
  lens.deleteAttribute("uv");
  return { pole, lens: lens.toNonIndexed() };
}

// ---- the pools of lamplight on the deck ----
let POOL_TEX = null;
function poolTex() {
  if (POOL_TEX || typeof document === "undefined") return POOL_TEX;
  const N = 64, c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot((x + 0.5) / N * 2 - 1, (y + 0.5) / N * 2 - 1), a = Math.round(poolFalloff(r) * 255);
    img.data.set([a, a, a, 255], (y * N + x) * 4);
  }
  g.putImageData(img, 0, 0); POOL_TEX = new THREE.CanvasTexture(c); POOL_TEX.colorSpace = THREE.NoColorSpace; return POOL_TEX;
}
/** how bright the pool is at r (0 under the lamp, 1 its edge): a soft bright middle falling away, nothing at the edge */
export function poolFalloff(r) { if (r >= 1) return 0; const u = 1 - r * r; return u * u * (0.35 + 0.65 * Math.exp(-r * r * 4)); }

/**
 * The pools for a list of lamps: [x, y, z, radius] (y: the deck under the lamp). Returns { mesh, material }: the
 * material is black and lit only by its emissive (warm lamplight), added to the deck, so it shows nothing until its
 * emissiveIntensity is turned up after dark (environment.js does that for every lamp material it's given).
 */
export function lampPools(list, warm = [0.42, 0.31, 0.18]) {
  const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color().setRGB(...warm), emissiveIntensity: 0, emissiveMap: poolTex(), roughness: 1, metalness: 0,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  material.name = "fdLampPool";
  if (!list.length) return { mesh: null, material };
  const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(quad, material, list.length), mx = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  list.forEach(([x, y, z, r], k) => { mx.compose(p.set(x, y + 0.012, z), q, s.set(r, 1, r)); mesh.setMatrixAt(k, mx); });
  mesh.renderOrder = 2; mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {}; mesh.name = "fdLampPools"; mesh.computeBoundingSphere();
  return { mesh, material };
}
