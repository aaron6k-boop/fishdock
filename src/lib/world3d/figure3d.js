// ---- figure3d: a person, for the 3D view: a smooth skinned body, a face, hands that hold things, clothes ----
// One continuous body (jacket, trousers and wellies) on a small skeleton, so knees and elbows bend smoothly instead of
// being separate tubes, with a proper head (a face with eyes that blink, brows, nose, ears and a mouth that moves when
// they talk in voice chat), hair, a beanie, cap or bucket hat (or the hood up in the rain), and hands that grip what
// they hold: the rod, the reel's handle, the drop net's rope, the fish.
//
// It's posed every frame from a few plain inputs (pose()): where each hand should be and what it's holding, how far
// they lean, crouch or brace, whether they're walking and how fast, and what they're looking at. Arms and legs reach
// with two-bone IK; walking is a procedural stride with feet that lift and plant; standing about they shift their
// weight, glance round, blink, and put their hands in their pockets or fold their arms while the rod's on its rest.
// The skeleton's bones are set directly in the figure's own space (each bone from one joint towards the next), so no
// animation files are needed and the whole figure costs one draw call for the body plus a few small parts.
import * as THREE from "three";
import { lookFor } from "./people.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smooth01 = (v, a, b) => ease((v - a) / (b - a));
const rngOf = (seed) => { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- a frame from a direction and a hint: Y along the bone, Z towards the hint (the front of a limb, a palm) ----
const tX = V(), tY = V(), tZ = V(), tM = new THREE.Matrix4();
function basisQ(dir, hint, out = new THREE.Quaternion()) {
  tY.copy(dir).normalize();
  tX.crossVectors(tY, hint);
  if (tX.lengthSq() < 1e-8) { tX.crossVectors(tY, Math.abs(tY.y) < 0.9 ? V(0, 1, 0) : V(0, 0, -1)); }
  tX.normalize(); tZ.crossVectors(tX, tY);
  tM.makeBasis(tX, tY, tZ); return out.setFromRotationMatrix(tM);
}

// two-bone IK: from A towards T with lengths L1, L2, bending towards `pole`. Returns the joint and the (reachable) end.
function twoBone(A, T, L1, L2, pole) {
  const d = T.clone().sub(A); let dist = d.length() || 1e-4; d.multiplyScalar(1 / dist);
  dist = clamp(dist, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
  const C = A.clone().addScaledVector(d, dist);
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(d, d.z); p.normalize();
  return { B: A.clone().addScaledVector(d, a).addScaledVector(p, h), C };
}

// a superellipse ring point: rounder (p = 2) to squarer (p = 3+)
const se = (c, p) => Math.sign(c) * Math.abs(c) ** (2 / p);

const IRIS = [0x3b2a1e, 0x4d6c8c, 0x56693c, 0x2a1d16, 0x6b4a2a];
const BOOTS = { beach: 0x2f4a2c, river: 0x2f4a2c, lake: 0x3a4630, pier: 0x1f2326, estuary: 0x2a3a2a };

/**
 * A person. look: from people.js lookFor (skin, hair, hat, beard, build, height), outfit: { jacket, trousers, hat }
 * colours. Returns { group, pose(o), setFirstPerson(on), top, dispose() }.
 */
export function createFigure({ id = "", look = null, outfit, venue = "pier" } = {}) {
  const L = look || lookFor(id);
  const rnd = rngOf(L.seed || 7);
  const H = L.height / 1.76, Wd = [0.92, 1, 1.12][L.build] ?? 1, HS = 0.62 + 0.38 * H, belly = [-0.008, 0, 0.022][L.build] ?? 0;
  const S = (x, y, z) => V(x * Wd, y * H, z * Wd);
  const group = new THREE.Group(); group.name = "figure";
  const rigG = new THREE.Group(); group.add(rigG);

  // ---- colours ----
  const C = (hex) => new THREE.Color(hex);
  const jacket = C(outfit?.jacket ?? 0x1f3a5f), trim = jacket.clone().multiplyScalar(0.55), zip = C(0x2a2d30);
  const trousers = C(outfit?.trousers ?? 0x2b2b2e), boot = C(BOOTS[venue] ?? 0x23302a), sole = C(0x15181a);
  const skin = C(L.skinHex), hair = C(L.hairHex), hatCol = C(outfit?.hat ?? 0xd8a631);

  // ---- the skeleton (rest pose, facing -z, feet on y = 0) ----
  const J = {
    hips: S(0, 0.94, 0), spine: S(0, 1.06, 0), chest: S(0, 1.24, 0), neck: S(0, 1.455, 0.005), head: S(0, 1.545, 0.005), top: S(0, 1.77, 0),
  };
  for (const [s, k] of [[-1, "L"], [1, "R"]]) {
    J["sh" + k] = S(0.182 * s, 1.405, 0.01); J["el" + k] = S(0.222 * s, 1.12, 0.035); J["wr" + k] = S(0.24 * s, 0.865, 0.005); J["fi" + k] = S(0.245 * s, 0.69, -0.005);
    J["hp" + k] = S(0.092 * s, 0.925, 0); J["kn" + k] = S(0.097 * s, 0.5, -0.02); J["an" + k] = S(0.1 * s, 0.085, 0.035); J["to" + k] = S(0.105 * s, 0.03, -0.15);
    J["an" + k].y = 0.085; J["to" + k].y = 0.03; // ankles and toes don't scale with height
  }
  const FWD = V(0, 0, -1), UPV = V(0, 1, 0);
  // [name, from, to, hint]
  const BONES = [
    ["pelvis", "hips", "spine", FWD], ["spine", "spine", "chest", FWD], ["chest", "chest", "neck", FWD], ["neck", "neck", "head", FWD], ["head", "head", "top", FWD],
    ["upL", "shL", "elL", FWD], ["loL", "elL", "wrL", FWD], ["haL", "wrL", "fiL", V(1, 0, 0)],
    ["upR", "shR", "elR", FWD], ["loR", "elR", "wrR", FWD], ["haR", "wrR", "fiR", V(-1, 0, 0)],
    ["thL", "hpL", "knL", FWD], ["shnL", "knL", "anL", FWD], ["ftL", "anL", "toL", UPV],
    ["thR", "hpR", "knR", FWD], ["shnR", "knR", "anR", FWD], ["ftR", "anR", "toR", UPV],
  ];
  const B = {}, bones = [], restQ = [], restP = [], inverses = [];
  BONES.forEach(([name, a, b, hint], i) => {
    const bone = new THREE.Bone(); bone.name = name; rigG.add(bone);
    const q = basisQ(J[b].clone().sub(J[a]), hint); bone.position.copy(J[a]); bone.quaternion.copy(q);
    bone.updateMatrix(); inverses.push(bone.matrix.clone().invert());
    restQ.push(q.clone()); restP.push(J[a].clone());
    B[name] = i; bones.push(bone);
  });
  const len = (a, b) => J[a].distanceTo(J[b]);
  const LEN = { up: len("shR", "elR"), lo: len("elR", "wrR"), th: len("hpR", "knR"), shn: len("knR", "anR"), ft: len("anR", "toR"), pelvis: len("hips", "spine"), spine: len("spine", "chest"), chest: len("chest", "neck"), neck: len("neck", "head") };
  // a point given in the rest pose, where it is now (carried by bone i)
  const dq = new THREE.Quaternion();
  const carried = (i, restPoint, out = V()) => { dq.copy(restQ[i]).invert().premultiply(bones[i].quaternion); return out.copy(restPoint).sub(restP[i]).applyQuaternion(dq).add(bones[i].position); };

  // ---- the body: lofted rings, each vertex weighted to one or two bones ----
  const G = { pos: [], col: [], si: [], sw: [], idx: [] };
  const vert = (p, c, w) => {
    G.pos.push(p.x, p.y, p.z); G.col.push(c.r, c.g, c.b);
    const ws = w.filter((x) => x[1] > 1e-4).slice(0, 4), tot = ws.reduce((s, x) => s + x[1], 0) || 1;
    for (let k = 0; k < 4; k++) { G.si.push(ws[k]?.[0] ?? 0); G.sw.push((ws[k]?.[1] ?? 0) / tot); }
    return G.pos.length / 3 - 1;
  };
  // rings: { c, ax, bx, w, d, p, wts, col(theta, ringIndex, sx, sy) }
  function loft(rings, M0, { capStart = false, capEnd = false, extra = [] } = {}) {
    const first = G.pos.length / 3;
    const TH = [...Array.from({ length: M0 }, (_, j) => (j / M0) * Math.PI * 2), ...extra].sort((a, b) => a - b), M = TH.length;
    const adv = rings[1].c.clone().sub(rings[0].c), flip = rings[0].ax.clone().cross(rings[0].bx).dot(adv) > 0;
    rings.forEach((r, i) => {
      for (let j = 0; j < M; j++) {
        const th = TH[j], sx = se(Math.cos(th), r.p || 2), sy = se(Math.sin(th), r.p || 2);
        const p = r.c.clone().addScaledVector(r.ax, r.w * sx).addScaledVector(r.bx, r.d * sy);
        vert(p, r.col(th, i, sx, sy), r.wts);
      }
    });
    const tri = (a, b, c) => (flip ? G.idx.push(a, b, c) : G.idx.push(a, c, b));
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < M; j++) {
      const a = first + i * M + j, b = first + i * M + ((j + 1) % M), c = a + M, d = b + M;
      tri(a, b, c); tri(b, d, c);
    }
    const cap = (ri, end) => {
      const r = rings[ri], centre = vert(r.c, r.col(0, ri, 0, 0), r.wts), o = first + ri * M;
      for (let j = 0; j < M; j++) { const a = o + j, b = o + ((j + 1) % M); if (end) tri(a, b, centre); else tri(b, a, centre); }
    };
    if (capStart) cap(0, false);
    if (capEnd) cap(rings.length - 1, true);
  }
  const AX = V(1, 0, 0), BZ = V(0, 0, 1), BY = V(0, 1, 0);
  const W1 = (b) => [[B[b], 1]];
  const blend = (a, b, t) => [[B[a], 1 - t], [B[b], t]];

  // the jacket: a rounded body from the hem to a stand-up collar; two-tone shoulders, a zip, pockets, a darker hem
  const yoke = jacket.clone().lerp(trim, 0.45);
  const TORSO = [[0.79, 0.19, 0.143], [0.82, 0.185, 0.137], [0.9, 0.175, 0.13], [0.98, 0.166 + belly * 0.6, 0.124 + belly], [1.06, 0.168, 0.126 + belly * 0.8], [1.14, 0.176, 0.13], [1.22, 0.186, 0.134], [1.3, 0.193, 0.132], [1.36, 0.197, 0.126], [1.4, 0.198, 0.116], [1.428, 0.176, 0.102], [1.448, 0.13, 0.088], [1.468, 0.082, 0.075], [1.525, 0.073, 0.069]];
  const torsoW = (y) => (y <= 0.98 ? W1("pelvis") : y < 1.1 ? blend("pelvis", "spine", (y - 0.98) / 0.12) : y < 1.18 ? W1("spine") : y < 1.3 ? blend("spine", "chest", (y - 1.18) / 0.12) : y < 1.45 ? W1("chest") : blend("chest", "neck", 0.45));
  loft(TORSO.map(([y, w, d], i) => ({
    c: S(0, y, 0.004), ax: AX, bx: BZ, w: w * Wd, d: d * Wd, p: y > 1.44 ? 2 : 2.7, wts: torsoW(y),
    col: (th, ri, sx, sy) => {
      const front = Math.abs(th - Math.PI * 1.5) < 0.005;
      if (y > 1.44) return trim;
      if (front && y > 0.8) return zip;
      if (ri <= 1) return trim;
      const c = y > 1.3 ? yoke : jacket;
      return c.clone().multiplyScalar(sy > 0.5 && y < 1.2 ? 0.93 : 1); // a little shade at the back
    },
  })), 32, { capStart: true, extra: [Math.PI * 1.5 - 0.022, Math.PI * 1.5 + 0.022] });

  // the trousers into wellies, and the boot's foot
  const LEG = [[1.0, 0.072, 0.088], [0.92, 0.082, 0.094], [0.84, 0.084, 0.09], [0.74, 0.078, 0.083], [0.64, 0.07, 0.074], [0.555, 0.063, 0.067], [0.5, 0.059, 0.063], [0.44, 0.061, 0.067], [0.37, 0.061, 0.066], [0.356, 0.071, 0.075], [0.336, 0.072, 0.076], [0.32, 0.066, 0.071], [0.22, 0.06, 0.066], [0.14, 0.057, 0.066], [0.085, 0.056, 0.07]];
  for (const k of ["L", "R"]) {
    const hp = J["hp" + k], kn = J["kn" + k], an = J["an" + k];
    const at = (yu) => { const y = yu * H; if (y >= kn.y) return hp.clone().lerp(kn, (hp.y - y) / (hp.y - kn.y)); return kn.clone().lerp(an, Math.min(1, (kn.y - y) / (kn.y - an.y))); };
    loft(LEG.map(([yu, w, d], i) => {
      const y = yu * H, isBoot = yu < 0.36;
      const wts = y >= 0.98 * H ? [[B.pelvis, 0.7], [B["th" + k], 0.3]] : y >= hp.y ? [[B.pelvis, 0.45], [B["th" + k], 0.55]] : y > kn.y + 0.06 ? W1("th" + k) : y > kn.y - 0.04 ? blend("th" + k, "shn" + k, (kn.y + 0.06 - y) / 0.1) : W1("shn" + k);
      return { c: at(yu), ax: AX, bx: BZ, w: w * Wd, d: d * Wd, p: 2.1, wts, col: (th, ri, sx, sy) => (isBoot ? (ri === 9 ? boot.clone().multiplyScalar(0.8) : boot) : trousers.clone().multiplyScalar(yu > 0.46 && yu < 0.56 && sy < -0.5 ? 0.86 : 1)) };
    }), 16);
    const FOOT = [[0.088, 0.044, 0.05], [0.07, 0.05, 0.062], [0.03, 0.053, 0.064], [-0.02, 0.054, 0.054], [-0.07, 0.052, 0.044], [-0.11, 0.048, 0.036], [-0.14, 0.04, 0.029], [-0.163, 0.026, 0.021]];
    const x = an.x;
    loft(FOOT.map(([z, w, h]) => ({ c: V(x, h + 0.002, z), ax: AX, bx: BY, w: w * Wd, d: h, p: 3.2, wts: W1("ft" + k), col: (th, ri, sx, sy) => (sy < -0.82 ? sole : boot) })), 14, { capStart: true, capEnd: true });
  }

  // sleeves: from a rounded shoulder to a cuff
  for (const k of ["L", "R"]) {
    const sh = J["sh" + k], el = J["el" + k], wr = J["wr" + k];
    const qU = restQ[B["up" + k]], qL = restQ[B["lo" + k]];
    const fU = { y: el.clone().sub(sh).normalize(), x: V(1, 0, 0).applyQuaternion(qU), z: V(0, 0, 1).applyQuaternion(qU) };
    const fL = { y: wr.clone().sub(el).normalize(), x: V(1, 0, 0).applyQuaternion(qL), z: V(0, 0, 1).applyQuaternion(qL) };
    const L1 = LEN.up, L2 = LEN.lo;
    const ARM = [[-0.045, 0.02], [-0.034, 0.04], [-0.014, 0.054], [0.012, 0.06], [0.07, 0.058], [0.16, 0.054], [L1 - 0.02, 0.05], [L1 + 0.03, 0.05], [L1 + 0.12, 0.048], [L1 + 0.2, 0.045], [L1 + L2 - 0.025, 0.042], [L1 + L2 - 0.012, 0.048], [L1 + L2 + 0.004, 0.047], [L1 + L2 + 0.012, 0.041]];
    loft(ARM.map(([s, r], i) => {
      const upper = s < L1, f = upper ? fU : fL;
      const c = upper ? sh.clone().addScaledVector(f.y, s) : el.clone().addScaledVector(f.y, s - L1);
      const wts = s < -0.02 ? [[B.chest, 0.5], [B["up" + k], 0.5]] : s < 0.04 ? [[B.chest, 0.35 * (1 - (s + 0.02) / 0.06)], [B["up" + k], 1]] : s < L1 - 0.035 ? W1("up" + k) : s < L1 + 0.035 ? blend("up" + k, "lo" + k, (s - (L1 - 0.035)) / 0.07) : W1("lo" + k);
      return { c, ax: f.x, bx: f.z, w: r * Wd, d: r * 0.92 * Wd, p: 2, wts, col: () => (i >= 11 ? trim : s < 0.12 ? yoke : jacket) };
    }), 14, { capStart: true });
  }
  // the neck
  loft([[1.42, 0.056, "chest", "neck", 0.5], [1.47, 0.055, "neck", "neck", 0], [1.53, 0.053, "neck", "head", 0.2], [1.6, 0.052, "neck", "head", 0.8]].map(([y, r, a, b, t]) => ({ c: S(0, y, 0.012), ax: AX, bx: BZ, w: r * HS, d: r * 1.06 * HS, p: 2, wts: blend(a, b, t), col: () => skin.clone().multiplyScalar(0.94) })), 12);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(G.pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(G.col, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(G.si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(G.sw, 4));
  geo.setIndex(G.idx); geo.computeVertexNormals();
  const mBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0, side: THREE.DoubleSide });
  const body = new THREE.SkinnedMesh(geo, mBody); body.castShadow = true; body.frustumCulled = false; group.add(body);
  const skeleton = new THREE.Skeleton(bones, inverses);
  body.bind(skeleton, new THREE.Matrix4());

  // ---- rigid parts, carried by a bone ----
  const mats = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const mSkin = M({ color: skin, roughness: 0.72, envMapIntensity: 0.6 }), mHead = M({ vertexColors: true, roughness: 0.7, envMapIntensity: 0.6 });
  const mHair = M({ color: hair, roughness: 0.92 }), mBrow = M({ color: hair.clone().multiplyScalar(0.8), roughness: 0.9 });
  const mHat = M({ color: hatCol, roughness: 0.95 }), mHood = M({ color: jacket, roughness: 0.84, side: THREE.DoubleSide });
  const mWhite = M({ color: 0xf1ede6, roughness: 0.3 }), mIris = M({ color: L.skin >= 3 ? IRIS[rnd() < 0.85 ? 0 : 3] : IRIS[Math.floor(rnd() * IRIS.length)], roughness: 0.2 });
  const mPupil = M({ color: 0x0c0a09, roughness: 0.15 });
  const mLip = M({ color: skin.clone().lerp(C(0x9a4a44), 0.32), roughness: 0.5 }), mMouth = M({ color: 0x2a1210, roughness: 0.9 });
  const inv = (i) => inverses[i];
  // attach geometry given in rest-pose figure space to bone i
  const attachRest = (i, g, mat, shadow = true) => { g.applyMatrix4(inv(i)); const m = new THREE.Mesh(g, mat); m.castShadow = shadow; bones[i].add(m); return m; };
  const attachLocal = (i, g, mat, shadow = true) => { const m = new THREE.Mesh(g, mat); m.castShadow = shadow; bones[i].add(m); return m; };

  // ---- the head ----
  const hc = V(0, 1.655 * H, 0.0);
  const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return V(v.x, v.y * c - v.z * s, v.y * s + v.z * c); };
  function headPoint(ux, uy, uz, k = 1) {
    let x = ux, y = uy, z = uz;
    if (y < 0) { const t = -y; x *= 1 - 0.17 * t ** 1.8; if (z > 0) z *= 1 - 0.45 * t; }
    if (z > 0 && y > -0.2) z *= 1.06;
    if (z < -0.55) z = -0.55 + (z + 0.55) * 0.72;
    if (y < -0.6 && z < 0) z -= 0.07 * ((-y - 0.6) / 0.4);
    return V(hc.x + x * 0.081 * k * HS, hc.y + y * 0.112 * k * HS, hc.z + z * 0.098 * k * HS);
  }
  // a sphere (or part of one) bent to the head's shape, k times bigger, tilted back by `tilt`
  function headShell(g, k, tilt = 0, extra = null) {
    const p = g.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) {
      const u = rotX(V(p.getX(i), p.getY(i), p.getZ(i)).normalize(), tilt); uv.push(u);
      const q = headPoint(u.x, u.y, u.z, extra ? extra(u, k) : k); p.setXYZ(i, q.x, q.y, q.z);
    }
    g.computeVertexNormals(); return uv;
  }
  {
    const g = new THREE.SphereGeometry(1, 30, 22), uvs = headShell(g, 1), col = [];
    for (const u of uvs) {
      let c = skin.clone();
      if (Math.abs(u.x) > 0.38 && u.y > -0.45 && u.y < 0.02 && u.z < -0.3) c.lerp(C(0xd06a5c), 0.1); // cheeks
      if (u.y < -0.72) c.multiplyScalar(0.9); // under the jaw
      if (L.beard === 1 && u.y < -0.14 && u.z < 0.4 && !(u.y > -0.32 && Math.abs(u.x) > 0.4)) c.lerp(hair, u.y < -0.3 ? 0.42 : 0.3); // stubble
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    attachRest(B.head, g, mHead);
  }
  const HP = (x, y, z) => V(hc.x + x * HS, hc.y + y * HS, hc.z + z * HS);
  const sph = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r * HS, ws, hs), unit = (ws = 12, hs = 8) => new THREE.SphereGeometry(1, ws, hs);
  // a part that turns about its own centre (an eyelid, the mouth): placed at `at` with the figure's own axes
  const pivoted = (g, at, mat) => { const m = new THREE.Mesh(g, mat); m.position.copy(at.clone().applyMatrix4(inv(B.head))); m.quaternion.copy(restQ[B.head]).invert(); m.userData.base = m.quaternion.clone(); bones[B.head].add(m); return m; };
  const place = (g, at, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(at.x, at.y, at.z); return g; };
  const lids = [];
  for (const s of [-1, 1]) {
    const e = HP(0.03 * s, 0.017, -0.071);
    attachRest(B.head, place(sph(0.0135, 12, 10), e), mWhite, false);
    attachRest(B.head, place(sph(0.0078, 10, 8), e.clone().add(V(0, 0, -0.0098 * HS))), mIris, false);
    attachRest(B.head, place(sph(0.0036, 8, 6), e.clone().add(V(0, 0, -0.0158 * HS))), mPupil, false);
    // the upper lid: a skin-coloured half shell over the eye that swings down to blink
    lids.push(pivoted(new THREE.SphereGeometry(0.0149 * HS, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), e, mSkin));
    attachRest(B.head, place(new THREE.BoxGeometry(0.032 * HS, 0.0085 * HS, 0.011 * HS), HP(0.031 * s, 0.043, -0.079), 1, 1, 1, 0, 0, -0.1 * s), mBrow, false);
    attachRest(B.head, place(unit(10, 8), HP(0.079 * s, -0.002, 0.008), 0.011 * HS, 0.026 * HS, 0.019 * HS), mSkin);
  }
  attachRest(B.head, place(new THREE.ConeGeometry(0.0125 * HS, 0.042 * HS, 4, 1), HP(0, -0.004, -0.088), 1, 1, 0.75, -0.42, Math.PI / 4), mSkin, false);
  attachRest(B.head, place(sph(0.0085, 10, 8), HP(0, -0.024, -0.098)), mSkin, false);
  for (const s of [-1, 1]) attachRest(B.head, place(sph(0.0068, 8, 6), HP(0.0105 * s, -0.026, -0.091)), mSkin, false);
  const beardOn = L.beard === 2;
  const lipZ = beardOn ? -0.086 : -0.08;
  attachRest(B.head, place(new THREE.TorusGeometry(0.018 * HS, 0.0033 * HS, 5, 12, Math.PI * 0.62), HP(0, -0.031, lipZ), 1, 1, 0.7, 0, 0, -Math.PI / 2 - Math.PI * 0.31), mLip, false);
  const mouthG = unit(10, 6); mouthG.scale(0.0125 * HS, 1, 0.006 * HS);
  const mouth = pivoted(mouthG, HP(0, -0.047, lipZ + 0.004), mMouth); mouth.scale.set(1, 0.001, 1);
  // hair, and a beard
  {
    const g = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, 1.55); headShell(g, 1.045, 0.55);
    // under a bucket hat's flat crown the hair is pressed down too (so none shows through it)
    if (L.hat === 2) { const p = g.attributes.position, cap = hc.y + 0.1 * HS; for (let i = 0; i < p.count; i++) if (p.getY(i) > cap) p.setY(i, cap); g.computeVertexNormals(); }
    attachRest(B.head, g, mHair);
  }
  if (beardOn) {
    const g = new THREE.SphereGeometry(1, 28, 18), p = g.attributes.position, keep = [], idx = g.index.array;
    const ok = (i) => { const u = V(p.getX(i), p.getY(i), p.getZ(i)); return u.y < -0.12 && u.z < 0.42 && !(Math.abs(u.x) < 0.34 && u.y > -0.56 && u.y < -0.3 && u.z < 0); };
    for (let i = 0; i < idx.length; i += 3) if (ok(idx[i]) && ok(idx[i + 1]) && ok(idx[i + 2])) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    g.setIndex(keep); headShell(g, 1.05, 0, (u, k) => k + (u.y < -0.6 ? 0.06 * (-u.y - 0.6) / 0.4 : 0));
    attachRest(B.head, g, mHair);
  }
  // hats (and the hood, up in the rain)
  const hats = [];
  if (L.hat === 0) {
    const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, 1.2); headShell(g, 1.12, 0.14); hats.push(attachRest(B.head, g, mHat));
    const b = new THREE.SphereGeometry(1, 28, 2, 0, Math.PI * 2, 1.04, 0.24); headShell(b, 1.17, 0.14); hats.push(attachRest(B.head, b, mHat));
    if (L.seed % 2) hats.push(attachRest(B.head, place(sph(0.028, 10, 8), headPoint(0, 1, 0, 1.13).add(V(0, 0.018 * HS, 0.01 * HS))), mHat));
  } else if (L.hat === 1) {
    const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, 1.25); headShell(g, 1.08, 0.12); hats.push(attachRest(B.head, g, mHat));
    const e = rotX(V(0, Math.cos(1.25), -Math.sin(1.25)), 0.12), ep = headPoint(e.x, e.y, e.z, 1.08);
    const peak = new THREE.CylinderGeometry(0.083 * HS, 0.083 * HS, 0.007 * HS, 20, 1, false, Math.PI / 2, Math.PI);
    hats.push(attachRest(B.head, place(peak, ep.add(V(0, -0.002 * HS, 0.012 * HS)), 1, 1, 0.82, -0.2), mHat));
  } else if (L.hat === 2) {
    const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, 1.3); headShell(g, 1.13, 0.06);
    { const p = g.attributes.position, cap = hc.y + 0.106 * HS; for (let i = 0; i < p.count; i++) if (p.getY(i) > cap) p.setY(i, cap + (p.getY(i) - cap) * 0.25); g.computeVertexNormals(); } // a flatter crown
    hats.push(attachRest(B.head, g, mHat));
    const brim = new THREE.CylinderGeometry(0.098 * HS, 0.142 * HS, 0.032 * HS, 28, 1, true);
    hats.push(attachRest(B.head, place(brim, HP(0, 0.058, 0.006), 1, 1, 1.12), M({ color: hatCol, roughness: 0.95, side: THREE.DoubleSide })));
  }
  const hoodUp = (() => { const g = new THREE.SphereGeometry(1, 26, 14, Math.PI * 1.5 + 1.0, Math.PI * 2 - 2.0, 0, 2.3); headShell(g, 1.24, -0.05); g.translate(0, 0, 0.008); const m = attachRest(B.head, g, mHood); m.visible = false; return m; })();
  // the hood down: rolled up behind the collar, drooping at the back
  const hoodDown = (() => { const g = new THREE.TorusGeometry(0.086 * Wd, 0.028, 6, 14, Math.PI); g.rotateX(Math.PI / 2 + 0.35); g.scale(1, 1, 1.2); g.translate(0, 1.435 * H, 0.012); return attachRest(B.chest, g, M({ color: yoke, roughness: 0.85 })); })();

  // the head's fixed parts drawn together, one mesh per material (fewer draw calls on a phone); the parts that move or
  // come and go (eyelids, mouth, hats, the hood) stay separate
  {
    const hb = bones[B.head], fixed = new Set([...lids, mouth, ...hats, hoodUp]), byMat = new Map();
    for (const m of [...hb.children]) { if (fixed.has(m) || m.material === mHead) continue; if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const g = mergeGeos(list.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); }));
      const shadow = list.some((m) => m.castShadow);
      for (const m of list) { hb.remove(m); m.geometry.dispose(); }
      attachLocal(B.head, g, mat, shadow);
    }
  }

  // ---- hands: a palm, fingers and a thumb, open or gripping (in the hand bone's own space: fingers along +y, palm
  // facing +z, the right thumb on +x; the left hand is the mirror image) ----
  const GRIP = V(0, 0.078, 0.03).multiplyScalar(HS); // where a gripped handle runs through the hand (along x)
  function handGeo(gripping, mirror) {
    const parts = [];
    parts.push(place(sph(1, 12, 10), V(0, 0.05 * HS, 0), 0.04 * HS, 0.05 * HS, 0.018 * HS));
    const xs = [-0.022, -0.0075, 0.0075, 0.022];
    if (gripping) {
      xs.forEach((x, i) => { const g = new THREE.TorusGeometry(0.021 * HS, 0.0098 * HS, 6, 10, Math.PI * 1.3); g.rotateZ(-Math.PI * 0.35); g.rotateY(Math.PI / 2); g.translate(x * HS, GRIP.y - (i === 3 ? 0.006 : 0) * HS, GRIP.z); parts.push(g); });
      parts.push(place(new THREE.CapsuleGeometry(0.0105 * HS, 0.03 * HS, 3, 8), V(0.022 * HS, 0.062 * HS, 0.042 * HS), 1, 1, 1, 0.9, 0, -1.2));
    } else {
      xs.forEach((x, i) => parts.push(place(new THREE.CapsuleGeometry(0.0098 * HS, (i === 3 ? 0.038 : 0.05) * HS, 3, 8), V(x * HS, (0.115 - (i === 3 ? 0.008 : 0)) * HS, 0.008 * HS), 1, 1, 1, 0.3)));
      parts.push(place(new THREE.CapsuleGeometry(0.0105 * HS, 0.032 * HS, 3, 8), V(0.036 * HS, 0.05 * HS, 0.014 * HS), 1, 1, 1, 0.35, 0, -0.65));
    }
    const merged = mergeGeos(parts);
    if (mirror) { merged.scale(-1, 1, 1); const ix = merged.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } merged.computeVertexNormals(); }
    return merged;
  }
  const hands = ["L", "R"].map((k) => {
    const i = B["ha" + k];
    return { open: attachLocal(i, handGeo(false, k === "L"), mSkin), grip: attachLocal(i, handGeo(true, k === "L"), mSkin), i, side: k === "L" ? -1 : 1 };
  });
  hands.forEach((h) => { h.grip.visible = false; });

  // ---- posing ----
  const st = {
    phase: 0, lean: 0, crouch: 0, brace: 0, twist: 0, yaw: 0, pitch: 0, nextBlink: 1 + rnd() * 3, blink: 0, glance: { at: 2 + rnd() * 6, yaw: 0, pitch: 0, until: 0 }, mouth: 0,
    hand: [{ kind: "", from: V(), u: 1, out: V() }, { kind: "", from: V(), u: 1, out: V() }],
  };
  const P = {}; // the joints now
  const setBone = (name, from, to, hint) => { const b = bones[B[name]]; b.position.copy(from); basisQ(to.clone().sub(from), hint, b.quaternion); };
  const tilt = (lean, yaw, side = 0) => V(0, 1, 0).applyAxisAngle(V(1, 0, 0), -lean).applyAxisAngle(V(0, 0, 1), -side).applyAxisAngle(UPV, -yaw);
  const fwdOf = (lean, yaw) => V(0, 0, -1).applyAxisAngle(V(1, 0, 0), -lean).applyAxisAngle(UPV, -yaw);

  /**
   * o: { t, dt, walk: { speed, air, sprint } | null, lean (radians, + forwards), crouch (0..1), brace (0..1: feet apart,
   * one forward, leaning back against a fish), twist (radians, chest turned right +), hands: [left, right] each
   * { at: point, kind: string, axis?: what's held runs this way, palm?: the way the palm faces, pole?: where the elbow
   * points, hide?: hand out of sight (in a pocket) } or null (free: by their sides, swinging when walking), idle:
   * "hang" | "pockets" | "fold", look: a point to look at or null, speaking, hood, emote: { kind: "wave" | "cheer" |
   * "clap", u: seconds since it started, hand: which hand waves } or null }. Points are in the figure's space.
   */
  function pose(o) {
    const dt = Math.min(0.1, o.dt || 0.016), t = o.t || 0, k6 = 1 - Math.exp(-dt * 6);
    const wk = o.walk ? clamp(o.walk.speed / 4, 0, 1.4) : 0, air = !!o.walk?.air;
    if (o.walk && o.walk.speed > 0.05) st.phase = (st.phase + (o.walk.speed * dt * Math.PI * 2) / (1.1 + 0.42 * o.walk.speed)) % (Math.PI * 2);
    const ph = st.phase;
    st.lean += ((o.lean || 0) + wk * 0.1 + (o.walk?.sprint ? 0.08 * wk : 0) - st.lean) * k6;
    st.crouch += ((air ? 0.15 : o.crouch || 0) - st.crouch) * k6;
    st.brace += ((o.brace || 0) - st.brace) * k6;
    st.twist += ((o.twist || 0) - st.twist) * k6;

    // pelvis: bob and sway with the stride; shift the weight from foot to foot standing about
    const idle = !o.walk || wk < 0.05;
    const shift = idle ? Math.sin(t * 0.33 + L.seed % 7) * 0.012 : 0;
    const hipY = J.hips.y - 0.022 - st.crouch * 0.13 - st.brace * 0.05 - wk * 0.025 + wk * 0.028 * Math.cos(2 * ph) + Math.sin(t * 1.5) * 0.003;
    const pelvisYaw = 0.13 * Math.sin(ph) * Math.min(1, wk) + st.twist * 0.25;
    const hipP = V(shift + 0.012 * Math.sin(ph) * Math.min(1, wk), hipY, st.brace * 0.05);
    // the spine: leaning (back against a fish when braced), turning against the hips as they walk
    const lean = st.lean - st.brace * 0.12, chestYaw = st.twist - pelvisYaw * 1.4;
    const breath = Math.sin(t * 1.6 + (L.seed % 5)) * 0.012;
    P.hips = hipP; P.spine = hipP.clone().addScaledVector(tilt(lean * 0.25, pelvisYaw, -shift * 2), LEN.pelvis);
    P.chest = P.spine.clone().addScaledVector(tilt(lean * 0.65, (pelvisYaw + chestYaw) / 2), LEN.spine);
    P.neck = P.chest.clone().addScaledVector(tilt(lean + breath, chestYaw), LEN.chest);
    setBone("pelvis", P.hips, P.spine, fwdOf(lean * 0.25, pelvisYaw));
    setBone("spine", P.spine, P.chest, fwdOf(lean * 0.65, (pelvisYaw + chestYaw) / 2));
    setBone("chest", P.chest, P.neck, fwdOf(lean + breath, chestYaw));

    // the head: towards what they're watching (within reach of the neck), otherwise ahead with the odd glance round
    const chestF = fwdOf(0, chestYaw);
    let wantYaw = 0, wantPitch = -0.08 - lean * 0.6;
    if (o.look) {
      const d = o.look.clone().sub(P.neck); const hy = Math.atan2(d.x, -d.z), hp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      wantYaw = clamp(Math.atan2(Math.sin(hy - chestYaw), Math.cos(hy - chestYaw)), -1.15, 1.15); wantPitch = clamp(hp, -0.8, 0.5);
    } else if (idle) {
      if (t > st.glance.at) { st.glance = { at: t + 4 + rnd() * 7, yaw: (rnd() - 0.5) * 1.6, pitch: (rnd() - 0.6) * 0.3, until: t + 1.2 + rnd() * 1.5 }; }
      if (t < st.glance.until) { wantYaw = st.glance.yaw; wantPitch = st.glance.pitch; }
    }
    const kh = 1 - Math.exp(-dt * 5);
    st.yaw += (wantYaw - st.yaw) * kh; st.pitch += (wantPitch - st.pitch) * kh;
    const lookDir = V(Math.sin(chestYaw + st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(chestYaw + st.yaw) * Math.cos(st.pitch));
    const headUp = UPV.clone().addScaledVector(lookDir, -0.7 * Math.sin(st.pitch) * 1.0).normalize();
    const neckUp = tilt(lean, chestYaw).add(headUp).normalize();
    P.head = P.neck.clone().addScaledVector(neckUp, LEN.neck);
    setBone("neck", P.neck, P.head, chestF.clone().add(lookDir).normalize());
    setBone("head", P.head, P.head.clone().add(headUp), lookDir);

    // legs: planted apart standing (braced: wider, the left foot forward); a stride walking; tucked in a jump
    const footF = fwdOf(0, pelvisYaw * 0.5);
    for (const [k, s, ofs] of [["L", -1, 0], ["R", 1, Math.PI]]) {
      const hip = carried(B.pelvis, J["hp" + k]);
      const a = ph + ofs, A = clamp(0.1 + 0.075 * (o.walk?.speed || 0), 0, 0.5) * Math.min(1, wk), lift = (0.05 + 0.03 * (o.walk?.speed || 0)) * Math.min(1, wk);
      let foot = V(J["an" + k].x * (1 + st.brace * 0.6) + (idle ? shift * 0.3 : 0), J["an" + k].y, J["an" + k].z + (s < 0 ? -0.12 : 0.08) * st.brace);
      let pitchF = 0;
      if (!idle && !air) { foot.z += -A * Math.sin(a); foot.y += lift * Math.max(0, Math.cos(a)) ** 1.4; pitchF = 0.35 * Math.sin(a) * Math.min(1, wk); }
      if (air) { foot = V(J["an" + k].x, hipY - 0.6, -0.08 + (s < 0 ? -0.1 : 0.05)); pitchF = -0.3; }
      const knee = twoBone(hip, foot, LEN.th, LEN.shn, footF.clone().add(V(s * 0.12, 0, 0)));
      setBone("th" + k, hip, knee.B, footF); setBone("shn" + k, knee.B, knee.C, footF);
      const fd = footF.clone().applyAxisAngle(V(1, 0, 0).applyAxisAngle(UPV, -pelvisYaw * 0.5), pitchF).multiplyScalar(LEN.ft);
      fd.y += J["to" + k].y - J["an" + k].y;
      setBone("ft" + k, knee.C, knee.C.clone().add(fd), UPV);
    }

    // arms: each hand where it's asked to be (or a natural place), the elbow out and down
    const specs = o.hands || [null, null];
    for (let i = 0; i < 2; i++) {
      const k = i ? "R" : "L", s = i ? 1 : -1, sh = carried(B.chest, J["sh" + k]);
      let spec = specs[i];
      // an emote (Fish Together): a wave, a cheer or a clap, with whichever hands are free
      const em = o.emote;
      if (!spec && em && (em.kind !== "wave" || em.hand === i)) {
        const u = em.u;
        if (em.kind === "wave") spec = { at: sh.clone().add(V(s * (0.2 + 0.08 * Math.sin(u * 10)), 0.38, -0.08)), kind: "wave", palm: V(0, 0, -1), pole: V(s, -0.25, 0.35) };
        else if (em.kind === "cheer") spec = { at: sh.clone().add(V(s * 0.15, 0.5 + 0.05 * Math.sin(u * 8 + i), -0.04)), kind: "cheer", palm: V(0, 0, -1), pole: V(s, 0, 0.3) };
        else if (em.kind === "clap") spec = { at: carried(B.chest, S(s * (0.022 + 0.075 * Math.max(0, Math.sin(u * 11))), 1.25, -0.3)), kind: "clap", palm: V(-s, 0, 0), pole: V(s, -0.6, 0.15) };
      }
      if (!spec) {
        const ay = ph + (i ? 0 : Math.PI);
        if (air) spec = { at: sh.clone().add(V(s * 0.24, -0.28, -0.12)), kind: "air" };
        else if (!idle) spec = { at: sh.clone().add(V(s * (0.05 + 0.03 * wk), -0.52 + 0.1 * wk, -0.26 * Math.sin(ay) * Math.min(1.2, wk) - 0.04 * wk)), kind: "swing", palm: V(-s, 0, 0) };
        else if (o.idle === "pockets") spec = { at: carried(B.pelvis, S(0.135 * s, 0.93, -0.11)), kind: "pockets", hide: true, pole: V(s, -0.3, 0.6) };
        else if (o.idle === "fold") spec = { at: carried(B.chest, S(0.09 * -s, 1.205 + (i ? 0.02 : 0), -0.2)), kind: "fold", pole: V(s * 0.8, -0.45, -0.3), palm: V(0, 0, 1) };
        else spec = { at: sh.clone().add(V(s * 0.035, -0.535, -0.035)), kind: "hang", palm: V(-s, 0, 0.25) };
      }
      // a short blend whenever the hand moves to something else (onto the rod, off it, to the rope)
      const hs = st.hand[i];
      const target = spec.at.clone();
      if (spec.kind !== hs.kind) { hs.from.copy(hs.kind ? hs.out : target); hs.kind = spec.kind; hs.u = 0; }
      hs.u = Math.min(1, hs.u + dt / 0.32);
      const at = hs.from.clone().lerp(target, ease(hs.u));
      // the hand's own frame: fingers round the handle (axis), palm facing `palm`
      let Yh, Zh, wrist;
      if (spec.axis) {
        const ax = spec.axis.clone().normalize();
        const reach = at.clone().sub(sh);
        const palm = (spec.palm || reach.clone().cross(ax).multiplyScalar(-s)).clone();
        Zh = palm.addScaledVector(ax, -palm.dot(ax)); if (Zh.lengthSq() < 1e-6) Zh = V(0, -1, 0).addScaledVector(ax, ax.y); Zh.normalize();
        let X = ax.clone().multiplyScalar(s); Yh = Zh.clone().cross(X).normalize();
        if (Yh.dot(reach) < -0.2 * reach.length()) { X.negate(); Yh.negate(); }
        wrist = at.clone().addScaledVector(Yh, -GRIP.y).addScaledVector(Zh, -GRIP.z);
      } else wrist = at;
      const pole = spec.pole ? spec.pole.clone() : V(s * 0.55, -0.45, 0.55);
      const arm = twoBone(sh, wrist, LEN.up, LEN.lo, pole);
      const inner = sh.clone().lerp(arm.C, 0.5).sub(arm.B); if (inner.lengthSq() < 1e-6) inner.set(0, 0, -1);
      setBone("up" + k, sh, arm.B, inner); setBone("lo" + k, arm.B, arm.C, inner);
      if (!spec.axis) { Yh = arm.C.clone().sub(arm.B).normalize(); Zh = spec.palm ? spec.palm.clone() : V(-s, 0, 0); }
      setBone("ha" + k, arm.C, arm.C.clone().add(Yh), Zh);
      hands[i].grip.visible = !!spec.axis && !spec.hide && !fp; hands[i].open.visible = !spec.axis && !spec.hide && !fp;
      P["hand" + k] = arm.C;
    }

    // the face: blinking, a mouth that moves while they talk
    if (t > st.nextBlink) { st.blink = 0.16; st.nextBlink = t + 2.2 + rnd() * 4.5; }
    st.blink = Math.max(0, st.blink - dt);
    const shut = st.blink > 0 ? Math.sin((st.blink / 0.16) * Math.PI) : 0;
    for (const lid of lids) { lid.quaternion.copy(lid.userData.base).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), lerp(0.42, -1.45, shut))); }
    const talk = o.speaking ? clamp(0.5 + 0.5 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1), 0, 1) : 0;
    st.mouth += (talk - st.mouth) * (1 - Math.exp(-dt * 20));
    mouth.scale.y = 0.001 + st.mouth * 0.009 * HS;
    // the hood up in the rain (no hat under it)
    hoodUp.visible = !!o.hood && !fp; hoodDown.visible = !o.hood && !fp;
    for (const h of hats) h.visible = !o.hood && !fp;
  }
  let fp = false;
  const headParts = () => bones[B.head].children;
  pose({ t: 0, dt: 0.016 });

  return {
    group, pose, look: L,
    /** the top of the head now (figure space), for name labels */
    get top() { return (P.head?.y ?? J.head.y) + 0.24 * HS; },
    get headAt() { return P.head ? P.head.clone() : J.head.clone(); },
    hand(i) { return P[i ? "handR" : "handL"]?.clone() || null; },
    // first person: your own body would fill the view, so none of it is drawn
    setFirstPerson(on) { fp = !!on; body.visible = !on; for (const m of headParts()) m.visible = !on && (m !== hoodUp); hoodDown.visible = !on; for (const h of hands) { h.open.visible = h.grip.visible = false; } },
    dispose() { geo.dispose(); mBody.dispose(); group.traverse((o) => o.geometry?.dispose?.()); for (const m of mats) m.dispose(); skeleton.dispose(); },
  };
}

// several geometries into one (position, normal, index)
function mergeGeos(list) {
  const pos = [], idx = []; let base = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0.toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    if (g.index) for (const v of g.index.array) idx.push(v + base); else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count; g0.dispose();
  }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals();
  return out;
}
