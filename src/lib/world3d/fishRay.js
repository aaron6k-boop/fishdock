// ---- fishRay: a thornback ray's back, tail and thorns, on the modelled ray (fish2/thornback-ray.glb) ----
// The ray is modelled like the other fish from FishDock's own picture of it, seen from above: the disc in the
// picture's plane (x along the fish from the snout, y across the disc), its thickness along z, the back (where the eyes
// are) on +z, all in fish lengths. Lofted that way its back came out as an even lens, thickest in the middle of the
// disc and thinning evenly to the wingtips, and its tail a flat strip a few millimetres thick.
// A thornback ray (Raja clavata) has its body raised in a hump along the spine with the wings thinning away from it,
// a flat belly, a thick tail, round in section, and, as its name says, thorns: a row of hooked thorns down the middle
// of the back and the tail, a row down each side of the tail, and larger thorns with broad bases ("bucklers")
// scattered over the disc. Here those are added to the mesh when it loads: the thorns are part of the fish's own
// geometry, in a fourth group (pale, as the thorns are), so they bend with the fish as it swims and flaps.
// The sizes are proportions of the fish's length, drawn to look right on a ray of about 70 cm, not measurements.
import * as THREE from "three";

export const RAY = {
  hump: 0.012, humpW: 0.06, // (the hump over the spine: its height and half width, fish lengths)
  belly: 0.85, // (the belly flattened to this share of its thickness)
  tailFrom: 0.62, tailRound: 0.35, // (where the tail starts, past the disc and the pelvic fins, and its half thickness
  // against its half width: lofted it was a fifteenth, a strip; here about a third, as a ray's tail is)
  // (about 8 mm tall and 3 across on a 70 cm ray, the bucklers half as wide again: at 6 mm they barely showed from
  // standing height. lean: back towards the tail, radians)
  thorn: { r: 0.0042, h: 0.012, step: 0.022, from: 0.14, to: 0.86, lean: 0.6 },
  bucklers: 10,
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Each bin of x (fish lengths, NB bins over 0 to 1.05): the body's half width, its top and its half thickness. */
function profile(pos, n, NB) {
  const w = new Float32Array(NB), th = new Float32Array(NB);
  for (let i = 0; i < n; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], k = Math.max(0, Math.min(NB - 1, Math.floor((x / 1.05) * NB)));
    w[k] = Math.max(w[k], Math.abs(y)); th[k] = Math.max(th[k], Math.abs(z)); }
  return { w, th, bin: (x) => Math.max(0, Math.min(NB - 1, Math.floor((x / 1.05) * NB))) };
}

/** The top of the body (its largest z) near (x, y): from the body's own vertices within a small radius. */
function topAt(pos, n, x, y, r = 0.02) {
  let best = -1, bestD = 1e9, nearZ = 0;
  for (let i = 0; i < n; i++) { const dx = pos[i * 3] - x, dy = pos[i * 3 + 1] - y, d = dx * dx + dy * dy, z = pos[i * 3 + 2]; if (z < 0) continue;
    if (d < r * r) best = Math.max(best, z); if (d < bestD) { bestD = d; nearZ = z; } }
  return best >= 0 ? best : nearZ;
}

/** A tiny seeded random, so every thornback looks the same each time it's caught. */
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/**
 * The ray's model (a BufferGeometry with groups body 0, fin 1, eye 2, as angler.js's modelledFish makes it) given its
 * hump, flatter belly and round tail, and with thorns: true, a thornback's thorns in a new group 3. Returns a new
 * geometry; the one given is left as it was.
 */
export function shapeRay(geo, { thorns = true } = {}) {
  const g = geo.clone(), P = g.attributes.position, pos = P.array, n = P.count;
  const body = g.groups.find((q) => q.materialIndex === 0); if (!body) return g;
  // (the body's own vertices: those its triangles use)
  const idx = g.index.array, isBody = new Uint8Array(n);
  for (let i = body.start; i < body.start + body.count; i++) isBody[idx[i]] = 1;
  const NB = 42, bodyOnly = pos.filter((_, i) => isBody[(i / 3) | 0]), pr = profile(bodyOnly, bodyOnly.length / 3, NB);
  // ---- the hump, the belly, the tail ----
  // (the tail: each bin's thickness brought up to a share of its width, eased in where the disc ends)
  for (let i = 0; i < n; i++) {
    if (!isBody[i]) continue;
    const x = pos[i * 3], y = pos[i * 3 + 1]; let z = pos[i * 3 + 2];
    // (from the back of the disc the trunk down the middle, then the whole tail: the body runs into the tail as one,
    // rather than thinning where the disc's back edge narrows and swelling again where the tail starts)
    // (never thicker than a line falling steadily from the disc's own thickness to the tail's tip)
    const k = pr.bin(x), want = Math.min(RAY.tailRound * Math.min(pr.w[k], 0.06), 0.027 - 0.017 * smooth(0.42, 0.8, x)), has = pr.th[k];
    const across = Math.exp(-((y / 0.05) ** 2)) + (1 - Math.exp(-((y / 0.05) ** 2))) * smooth(RAY.tailFrom - 0.04, RAY.tailFrom + 0.04, x);
    if (has > 1e-5 && want > has) z *= 1 + (Math.min(8, want / has) - 1) * smooth(0.46, 0.56, x) * across;
    // (the hump on top of that, and the belly flattened)
    if (z > 0) z += RAY.hump * Math.exp(-((y / RAY.humpW) ** 2)) * smooth(0.06, 0.16, x) * (1 - smooth(0.52, 0.7, x));
    else z *= 1 - (1 - RAY.belly) * (1 - smooth(0.45, 0.6, x));
    pos[i * 3 + 2] = z;
  }
  // (the eyes ride up with the hump where they sit)
  const eye = g.groups.find((q) => q.materialIndex === 2);
  if (eye) { const seen = new Set(); for (let i = eye.start; i < eye.start + eye.count; i++) { const v = idx[i]; if (seen.has(v)) continue; seen.add(v); const x = pos[v * 3], y = pos[v * 3 + 1]; if (pos[v * 3 + 2] > 0) pos[v * 3 + 2] += RAY.hump * Math.exp(-((y / RAY.humpW) ** 2)) * smooth(0.06, 0.16, x) * (1 - smooth(0.52, 0.7, x)); } }
  if (!thorns) { P.needsUpdate = true; g.computeVertexNormals(); return g; }
  // ---- the thorns ----
  const T = RAY.thorn, cone = [], bodyPos = []; for (let i = 0; i < n; i++) if (isBody[i]) bodyPos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const bp = new Float32Array(bodyPos), bn = bp.length / 3, at = (x, y) => topAt(bp, bn, x, y);
  const add = (x, y, r, h) => cone.push({ x, y, z: at(x, y) - r * 0.35, r, h });
  // (down the middle of the back and the tail: a little smaller on the tail)
  for (let x = T.from; x <= T.to; x += T.step) { const s = 1 - 0.4 * smooth(0.5, T.to, x); add(x, 0, T.r * s, T.h * s); }
  // (a row down each side of the tail, a third of the way out: half way, they stood just past the edge of the tail
  // as its picture draws it, which is a little narrower than the mesh)
  for (let x = RAY.tailFrom + 0.03; x <= T.to - 0.04; x += T.step * 1.4) { const w = pr.w[pr.bin(x)] * 0.32; for (const sy of [-1, 1]) add(x, sy * w, T.r * 0.7, T.h * 0.65); }
  // (bucklers: larger, broad based, scattered over the disc either side of the spine, the same every time)
  const r = rnd(7919);
  for (let q = 0; q < RAY.bucklers; q++) { const x = 0.17 + 0.28 * r(), half = pr.w[pr.bin(x)], y = (0.2 + 0.45 * r()) * half * (r() < 0.5 ? -1 : 1); add(x, y, T.r * 1.5, T.h * 1.15); }
  // each a cone of six sides leaning back towards the tail, its base sunk a little into the skin
  const seg = 6, lean = new THREE.Vector3(Math.sin(T.lean), 0, Math.cos(T.lean)), ux = new THREE.Vector3(0, 1, 0), uy = new THREE.Vector3().crossVectors(lean, ux).normalize();
  const nAdd = cone.length * (seg + 1), np = new Float32Array(pos.length + nAdd * 3), nuv = new Float32Array((n + nAdd) * 2);
  np.set(pos); nuv.set(g.attributes.uv.array);
  const tri = [], base0 = n; let v = n;
  for (const c of cone) {
    const tip = v + seg;
    for (let s = 0; s < seg; s++) { const a = (s / seg) * Math.PI * 2, o = ux.clone().multiplyScalar(Math.cos(a) * c.r).addScaledVector(uy, Math.sin(a) * c.r * 1.3); np.set([c.x + o.x, c.y + o.y, c.z + o.z], (v + s) * 3); }
    np.set([c.x + lean.x * c.h, c.y, c.z + lean.z * c.h], tip * 3);
    for (let s = 0; s < seg; s++) tri.push(v + s, v + ((s + 1) % seg), tip);
    v += seg + 1;
  }
  for (let i = base0; i < v; i++) nuv.set([0.5, 0.5], i * 2);
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(np, 3)); out.setAttribute("uv", new THREE.BufferAttribute(nuv, 2));
  const all = [...idx, ...tri]; out.setIndex(v > 65535 ? new THREE.Uint32BufferAttribute(all, 1) : new THREE.Uint16BufferAttribute(all, 1));
  for (const q of g.groups) out.addGroup(q.start, q.count, q.materialIndex);
  out.addGroup(idx.length, tri.length, 3);
  out.computeVertexNormals(); out.userData.thorns = cone.length;
  return out;
}

let thornMat = null;
/** The thorns' material: pale, a little glossy, as a ray's thorns are (made once). */
export const rayThornMaterial = () => (thornMat ||= new THREE.MeshStandardMaterial({ color: 0xd9cfb4, roughness: 0.45, metalness: 0 }));
