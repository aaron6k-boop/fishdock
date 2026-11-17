// ---- chair: your folding fishing chair, and sitting in it while the rod is in its rest ----
// A levelling chair as anglers take onto piers, banks and beaches: a black powder-coated tube frame on four legs that
// slide out to level it, each on a round mud foot, a padded seat and a padded back leaning back a little, in olive
// cloth quilted in channels. Your usual size of chair: the seat about 50 cm wide and 44 cm deep, its top 42 cm up.
// It stands behind where you fish (angler.js's kit, with the seat box and the bait bucket), so sitting in it you're
// behind the rod in its tripod, watching the tip. You sit once the cast has settled and you're waiting, and get up
// when a bite comes (or you walk off, or reel in).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** the chair's place (the spot's own frame: x right, z back from where you stand, facing the water at -z) and size */
export const CHAIR = { x: 0.06, z: 0.42, seat: 0.42, w: 0.5, d: 0.44, back: 0.58, recline: 0.21 };
/** sitting in it (the figure's space, as CHAIR): the hip joints' middle just above the cushion and a little back from
 * its middle, the feet flat on the deck in front with the shins about upright, near where you stood; the pelvis tipped
 * back against the chair's back by lean (radians). At a 45 cm seat the thighs ran down 10 degrees to the knee and into
 * the cushion's front edge: a person's shin is shorter than that seat is high */
export const SEAT = { hips: [CHAIR.x, CHAIR.seat + 0.085, CHAIR.z + 0.05], feetZ: CHAIR.z - 0.4, feetX: 0.12, lean: 0.2 };
/** your eye sitting, from where it is standing (first person): 38 cm lower and back over the chair */
export const SIT_EYE = { dy: -0.38, dz: 0.54 };
/** when: settled this long after the cast first (s); sitting down takes 1.1 s, getting up 0.55 s */
export const SIT = { after: 2.5, down: 1.1, up: 0.55 };

/** Whether to be sitting in the chair: waiting for a bite with the rod in its rest, a moment after the cast has gone
 * out, at the spot (not walking about, not with a fish). ph: the angler's phase; age: seconds into it. */
export function wantsSit({ ph, age = 0, walking = false, busy = false, on = true }) {
  return !!on && !walking && !busy && ph === "waiting" && age >= SIT.after;
}
/** One step of sitting down (towards 1) or getting up (towards 0), as a 0-1 progress (eased by the caller). */
export function sitStep(u, want, dt) {
  return want ? Math.min(1, u + dt / SIT.down) : Math.max(0, u - dt / SIT.up);
}
/** Smooth 0-1 (the progress as the body moves: slow to start and to settle). */
export const sitEase = (u) => { const x = Math.min(1, Math.max(0, u)); return x * x * (3 - 2 * x); };

// ---- the cloth: olive, quilted in channels across it, the stitching sunk a little; a faint weave ----
let CLOTH = null;
function clothMaps() {
  if (CLOTH || typeof document === "undefined") return CLOTH;
  const W = 128, H = 256, ch = 32, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), img = g.createImageData(W, H), hgt = new Float32Array(W * H);
  const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (y % ch) / ch, puff = Math.sin(Math.PI * v) ** 0.6; // (each channel padded up between its stitched seams)
    const weave = ((x + y) % 2 ? 0.02 : -0.02) + (hash(x, y) - 0.5) * 0.05;
    hgt[y * W + x] = puff + weave * 0.3;
    const k = 0.78 + 0.22 * puff + weave;
    img.data.set([62 * k, 72 * k, 52 * k, 255], (y * W + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const n = document.createElement("canvas"); n.width = W; n.height = H; const gn = n.getContext("2d"), ni = gn.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x + W - 1) % W)], hy = hgt[((y + 1) % H) * W + x] - hgt[((y + H - 1) % H) * W + x];
    const nx = -hx * 2.2, ny = -hy * 2.2, l = Math.hypot(nx, ny, 1);
    ni.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * W + x) * 4);
  }
  gn.putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(c), normal = new THREE.CanvasTexture(n);
  map.colorSpace = THREE.SRGBColorSpace; for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  CLOTH = { map, normal };
  return CLOTH;
}

/** a box with every edge rounded (radius r), as a moulded or padded thing is */
function roundBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(w, h, d, 8, 4, 8), q = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < q.count; i++) {
    v.fromBufferAttribute(q, i); c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const n = v.sub(c); if (n.lengthSq() > 1e-12) n.setLength(r); q.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z);
  }
  g.computeVertexNormals(); return g;
}
/** a padded cushion: a rounded box whose face (+y, or -z for a back) is crowned, fullest in the middle, as a stuffed
 * cushion is (a flat slab with rounded edges read as a moulded board) */
function pillow(w, h, d, r, bulge, face = "y") {
  const g = roundBox(w, h, d, r), q = g.attributes.position;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i) / (w / 2), y = q.getY(i) / (h / 2), z = q.getZ(i) / (d / 2);
    if (face === "y" && y > 0) q.setY(i, q.getY(i) + bulge * y * Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z));
    if (face === "-z" && z < 0) q.setZ(i, q.getZ(i) + bulge * z * Math.max(0, 1 - x * x) * Math.max(0, 1 - y * y));
  }
  g.computeVertexNormals(); return g;
}
/** a tube between two points (radius r) */
function tube(a, b, r, mat, seg = 16) {
  const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg, 1), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

/** The chair, built in its own frame: the seat's middle over the origin, facing -z. Shared materials are made once. */
let MATS = null;
export function buildChair() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (!MATS) {
    const cl = clothMaps();
    MATS = {
      frame: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.45, roughness: 0.5 }), // (powder-coated)
      inner: new THREE.MeshStandardMaterial({ color: 0x8e9398, metalness: 0.8, roughness: 0.32 }), // (the bare inner legs)
      rubber: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.85 }),
      cloth: new THREE.MeshStandardMaterial({ color: cl ? 0xffffff : 0x3e4834, map: cl?.map || null, normalMap: cl?.normal || null, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92 }),
      edge: new THREE.MeshStandardMaterial({ color: 0x2b3125, roughness: 0.8 }), // (the piping round the cushions)
    };
  }
  const M = MATS, g = new THREE.Group(); g.name = "chair";
  const { w, d, seat, back, recline } = CHAIR, fy = seat - 0.06; // (the frame under the cushion)
  // the seat: a padded cushion on a rectangle of tube
  // (16 November: thicker and crowned, a stuffed cushion; its top still at the seat's height)
  const cush = new THREE.Mesh(pillow(w, 0.075, d, 0.03, 0.012), M.cloth); cush.position.set(0, seat - 0.0495, 0); g.add(cush);
  { const uv = cush.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 1.6); }
  const pipe = new THREE.Mesh(roundBox(w + 0.008, 0.014, d + 0.008, 0.007), M.edge); pipe.position.set(0, seat - 0.05, 0); g.add(pipe);
  const hx = w / 2 - 0.01, hz = d / 2 - 0.01;
  for (const sx of [-1, 1]) g.add(tube(V(sx * hx, fy, -hz), V(sx * hx, fy, hz), 0.011, M.frame));
  for (const sz of [-1, 1]) g.add(tube(V(-hx, fy, sz * hz), V(hx, fy, sz * hz), 0.011, M.frame));
  // four legs, each splayed a little: the black outer tube, a clamp, the bare inner leg slid out to level it, a ball
  // joint and a round mud foot
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = V(sx * hx, fy, sz * hz), foot = V(sx * (hx + 0.045), 0.03, sz * (hz + 0.035)), mid = top.clone().lerp(foot, 0.52);
    g.add(tube(top, mid, 0.0125, M.frame));
    const clamp = new THREE.Mesh(roundBox(0.034, 0.03, 0.034, 0.006), M.rubber); clamp.position.copy(mid); g.add(clamp);
    g.add(tube(mid, foot, 0.0095, M.inner));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.rubber); ball.position.copy(foot); g.add(ball);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.014, 20), M.rubber); pad.position.set(foot.x, 0.009, foot.z); g.add(pad);
  }
  // the back: two uprights from the seat's back corners, leaning back, a bar across the top, the padded back on them
  const up = V(0, Math.cos(recline), Math.sin(recline)), base = (sx) => V(sx * hx, fy, hz);
  for (const sx of [-1, 1]) {
    g.add(tube(base(sx), base(sx).addScaledVector(up, back + 0.04), 0.011, M.frame));
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), M.rubber); knuckle.rotation.z = Math.PI / 2; knuckle.position.copy(base(sx)).addScaledVector(up, 0.03); g.add(knuckle); // (the hinge it folds on)
  }
  g.add(tube(base(-1).addScaledVector(up, back + 0.04), base(1).addScaledVector(up, back + 0.04), 0.011, M.frame));
  const bc = new THREE.Mesh(pillow(w - 0.02, back - 0.04, 0.07, 0.028, 0.014, "-z"), M.cloth);
  bc.position.copy(V(0, fy, hz - 0.012)).addScaledVector(up, 0.04 + (back - 0.04) / 2); bc.rotation.x = recline; g.add(bc);
  { const uv = bc.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2.2); }
  // padded arms either side, on two short posts from the seat's frame, as a levelling chair's are
  for (const sx of [-1, 1]) {
    const ax = sx * (hx + 0.035), ay = seat + 0.16;
    for (const z of [-hz + 0.06, hz - 0.1]) { g.add(tube(V(sx * hx, fy, z), V(ax, ay - 0.012, z), 0.0095, M.frame)); }
    const arm = new THREE.Mesh(pillow(0.06, 0.035, d * 0.78, 0.016, 0.006), M.edge); arm.position.set(ax, ay, -0.02); g.add(arm);
  }
  // (drawn as one mesh per finish, five in all: built from 32 parts, it cost 32 draws a chair, 40 more a frame with
  // its shadows)
  g.updateMatrixWorld(true);
  const by = new Map(); for (const m of g.children) if (m.isMesh) { const geo = m.geometry.clone().applyMatrix4(m.matrix); (by.get(m.material) || by.set(m.material, []).get(m.material)).push(geo); m.geometry.dispose(); }
  const out = new THREE.Group(); out.name = "chair";
  for (const [mat, list] of by) { const mesh = new THREE.Mesh(mergeGeometries(list, false), mat); mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh); for (const x of list) x.dispose(); }
  return out;
}
