// ---- fpHands: your own hands and forearms in first person ----
// In first person the camera is in your head, so your body isn't drawn (from inside it, a shoulder or a sleeve would
// fill the view). Instead, as in any first-person game, your forearms and hands are drawn on their own, held in the
// view: a sleeve coming up from the bottom of the screen, a cuff, and a hand with a palm, four fingers of three joints
// each with knuckles, and a thumb, gripping what it holds (the rod's handle at the reel, the reel's handle, a rope, a
// fish). Gloves (neoprene, with a strap and seams) if you chose them, your own hands otherwise.
//
// One thing owns them: angler.js calls pose() once a frame, after it has placed the rod from the same eye and view the
// camera draws, so the hands can't drift a frame behind the rod or the view. Each hand's place is worked out from what
// it holds and from its elbow (fixed in the view, below and to the side, out of sight), with no choices that can flip
// from one frame to the next; moving to something else (onto the reel's handle, off it) eases over a moment.
//
// Each hand is one skinned mesh (every vertex on one bone, so it bends at the joints and stays one draw call), and each
// sleeve is one more.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadPart } from "./glbParts.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// the hand's own frame (a right hand; the left is its mirror): the wrist at the origin, the fingers along +y, the palm
// facing +z, the thumb towards +x. Metres
const FINGERS = [
  // x at the knuckle, knuckle height, and the three bones' lengths, the radius at the base
  { x: 0.03, y: 0.094, len: [0.044, 0.026, 0.022], r: 0.0095 }, // index
  { x: 0.0095, y: 0.098, len: [0.048, 0.03, 0.023], r: 0.0098 }, // middle
  { x: -0.0115, y: 0.094, len: [0.045, 0.028, 0.022], r: 0.0092 }, // ring
  { x: -0.031, y: 0.085, len: [0.036, 0.021, 0.019], r: 0.0082 }, // little
];
const THUMB = { at: V(0.026, 0.03, 0.012), len: [0.028, 0.024, 0.02], r: 0.0102 };

// how far each joint curls (radians, finger bases first), and the thumb's, for each way of holding something
const GRIPS = {
  rest: { f: [[0.35, 0.45, 0.3], [0.4, 0.5, 0.32], [0.45, 0.55, 0.35], [0.5, 0.6, 0.38]], t: [0.25, 0.2, 0.15], spread: 0.06 },
  seat: { f: [[1.25, 1.3, 0.8], [1.25, 1.35, 0.85], [1.35, 1.4, 0.9], [1.4, 1.4, 0.95]], t: [0.85, 0.35, 0.25], spread: 0.0 },
  crank: { f: [[0.95, 1.15, 0.85], [1.25, 1.3, 0.9], [1.4, 1.35, 0.9], [1.5, 1.35, 0.95]], t: [0.7, 0.5, 0.45], spread: 0.0 },
  fist: { f: [[1.25, 1.35, 0.9], [1.3, 1.4, 0.9], [1.35, 1.4, 0.95], [1.4, 1.4, 0.95]], t: [0.6, 0.5, 0.35], spread: 0.0 },
  fish: { f: [[0.25, 0.3, 0.2], [0.3, 0.35, 0.22], [0.35, 0.38, 0.25], [0.4, 0.4, 0.28]], t: [0.1, 0.15, 0.1], spread: 0.05 },
};
let BETA = 1.0; export const _tune = (o) => { if (o.beta != null) BETA = o.beta; };
const gripOf = (kind) => (kind === "seat" ? GRIPS.seat : kind === "crank" ? GRIPS.crank : kind === "fish" ? GRIPS.fish : kind ? GRIPS.fist : GRIPS.rest);
// where what's held runs through the hand (hand frame): in the curl of the fingers, in front of the palm; for the reel's
// handle, between the thumb and the curled index finger
const CHANNEL = { seat: V(0.004, 0.102, 0.03), crank: V(0.03, 0.098, 0.026), fish: V(0, 0.06, -0.02), fist: V(0, 0.1, 0.03) };
const channelOf = (kind) => CHANNEL[kind] || CHANNEL.fist;

// ---- geometry ----
// a part of the hand: its geometry placed in the hand's rest frame, every vertex on one bone, one colour
function addPart(acc, geo, bone, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal, c = new THREE.Color(color);
  for (let i = 0; i < p.count; i++) {
    acc.pos.push(p.getX(i), p.getY(i), p.getZ(i)); acc.nor.push(n.getX(i), n.getY(i), n.getZ(i));
    acc.col.push(c.r, c.g, c.b); acc.si.push(bone, 0, 0, 0); acc.sw.push(1, 0, 0, 0);
  }
  if (g !== geo) g.dispose(); geo.dispose();
}
// a segment of a finger: a slightly flattened, tapering capsule from the joint along +y, with a knuckle
function segment(len, r0, r1) {
  const g = new THREE.CapsuleGeometry(1, 1, 5, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), u = clamp((y + 0.5) / 1, 0, 1), r = r0 + (r1 - r0) * u, cap = Math.abs(y) > 0.5 ? (Math.abs(y) - 0.5) : 0;
    const yy = y > 0.5 ? len + cap * r : y < -0.5 ? -cap * r : u * len;
    p.setXYZ(i, p.getX(i) * r, yy, p.getZ(i) * r * 0.86);
  }
  g.computeVertexNormals();
  return g;
}
// the palm and the back of the hand: a rounded slab, wider at the knuckles, flat front and back
function palmGeo() {
  const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (y + 1) / 2; // u: 0 at the wrist, 1 at the knuckles
    const w = 0.031 + 0.013 * u, t = 0.0165 - 0.003 * u;
    p.setXYZ(i, x * w + 0.0005, 0.052 + y * 0.05, clamp(z * 0.022, -t, t * 1.08) + (z > 0 ? 0.001 : 0));
  }
  g.computeVertexNormals();
  return g;
}
function buildHand(gloved, skin) {
  const acc = { pos: [], nor: [], col: [], si: [], sw: [] };
  const back = gloved ? 0x2a2e33 : skin, palm = gloved ? 0x3b3f44 : new THREE.Color(skin).multiplyScalar(1.04).getHex(), seam = gloved ? 0x575c62 : skin;
  const nail = gloved ? 0x3b3f44 : new THREE.Color(skin).lerp(new THREE.Color(0xf1d7cf), 0.55).getHex();
  // bones: 0 the hand; then three for each finger; then three for the thumb
  const bones = [new THREE.Bone()];
  const palmG = palmGeo(), pp = palmG.attributes.position, pg = palmG.index ? palmG.toNonIndexed() : palmG;
  // (the palm side a shade lighter: the grip of a glove, or the inside of a hand)
  { const q = pg.attributes.position, nn = pg.attributes.normal; for (let i = 0; i < q.count; i++) { const c = new THREE.Color(q.getZ(i) > 0.004 ? palm : back); acc.pos.push(q.getX(i), q.getY(i), q.getZ(i)); acc.nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); acc.col.push(c.r, c.g, c.b); acc.si.push(0, 0, 0, 0); acc.sw.push(1, 0, 0, 0); } }
  void pp; if (pg !== palmG) pg.dispose(); palmG.dispose();
  const joints = [];
  FINGERS.forEach((f) => {
    let parent = bones[0], at = V(f.x, f.y, 0.001), r = f.r;
    const chain = [];
    f.len.forEach((L, j) => {
      const b = new THREE.Bone(); b.position.copy(at); parent.add(b); bones.push(b); chain.push(b);
      const idx = bones.length - 1, r1 = r * (j === 2 ? 0.82 : 0.9);
      addPart(acc, segment(L, r, r1), idx, back);
      // the knuckle: a little fuller at the joint, on the back
      const k = new THREE.SphereGeometry(r * 1.06, 10, 8); k.scale(1, 0.9, 0.85); k.translate(0, 0, -r * 0.08); addPart(acc, k, idx, j === 0 ? seam : back);
      if (j === 2) { const nl = new THREE.SphereGeometry(r1 * 0.8, 8, 6); nl.scale(0.9, 1.15, 0.35); nl.translate(0, L * 0.72, -r1 * 0.7); addPart(acc, nl, idx, nail); }
      // the palm-side pad a shade lighter (a glove's grip)
      const pad = new THREE.SphereGeometry(r * 0.86, 8, 6); pad.scale(0.95, (L / r) * 0.42, 0.5); pad.translate(0, L * 0.5, r * 0.55); addPart(acc, pad, idx, palm);
      // positions are in the bone's own frame: the bone sits at `at` at rest, so the part's vertices are offset by it
      parent = b; at = V(0, L, 0); r = r1;
    });
    joints.push(chain);
  });
  // the thumb: from the side of the palm, angled out and across
  { let parent = bones[0], r = THUMB.r; const chain = [];
    THUMB.len.forEach((L, j) => {
      const b = new THREE.Bone();
      if (j === 0) { b.position.copy(THUMB.at); b.rotation.set(0.35, 0, -0.75); } else b.position.set(0, THUMB.len[j - 1], 0);
      parent.add(b); bones.push(b); chain.push(b);
      const idx = bones.length - 1, r1 = r * 0.88;
      addPart(acc, segment(L, r, r1), idx, back);
      if (j === 2) { const nl = new THREE.SphereGeometry(r1 * 0.8, 8, 6); nl.scale(0.9, 1.1, 0.35); nl.translate(0, L * 0.7, -r1 * 0.7); addPart(acc, nl, idx, nail); }
      parent = b; r = r1;
    });
    joints.push(chain); }
  // the cuff of the glove (a gauntlet with a strap), or a bare wrist going into the sleeve
  if (gloved) {
    const cuff = new THREE.CylinderGeometry(0.036, 0.04, 0.085, 20, 1, true); cuff.scale(1, 1, 0.78); cuff.translate(0, -0.028, 0); addPart(acc, cuff, 0, 0x202327);
    const strap = new THREE.CylinderGeometry(0.0415, 0.0415, 0.022, 20, 1, true); strap.scale(1, 1, 0.8); strap.translate(0, -0.03, 0); addPart(acc, strap, 0, 0xc9622b);
    const rim = new THREE.TorusGeometry(0.0395, 0.0028, 6, 24); rim.rotateX(Math.PI / 2); rim.scale(1, 1, 0.78); rim.translate(0, -0.07, 0); addPart(acc, rim, 0, seam);
    const wr = new THREE.TorusGeometry(0.035, 0.0022, 6, 24); wr.rotateX(Math.PI / 2); wr.scale(1, 1, 0.78); wr.translate(0, 0.012, 0); addPart(acc, wr, 0, seam);
  } else {
    const wrist = new THREE.CylinderGeometry(0.025, 0.028, 0.065, 18, 1, true); wrist.scale(1.1, 1, 0.75); wrist.translate(0, -0.03, 0); addPart(acc, wrist, 0, skin);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(acc.pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(acc.nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(acc.col, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(acc.si, 4)); geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(acc.sw, 4));
  return { geo, bones, joints };
}
// the parts were made in each bone's own frame; skinning wants them in the hand's frame at rest: move each vertex by its
// bone's rest transform
function bakeRest(geo, bones) {
  bones[0].updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(bones[0].matrixWorld).invert(), mats = bones.map((b) => new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld));
  const p = geo.attributes.position, n = geo.attributes.normal, si = geo.attributes.skinIndex, v = V(), nm = new THREE.Matrix3();
  for (let i = 0; i < p.count; i++) {
    const m = mats[si.getX(i)];
    v.fromBufferAttribute(p, i).applyMatrix4(m); p.setXYZ(i, v.x, v.y, v.z);
    v.fromBufferAttribute(n, i).applyMatrix3(nm.getNormalMatrix(m)).normalize(); n.setXYZ(i, v.x, v.y, v.z);
  }
}
// the left hand: the right one mirrored
function mirror(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
  // (mirroring turns every triangle inside out: swap two corners of each)
  for (const a of Object.values(geo.attributes)) { const s = a.itemSize, arr = a.array; for (let t = 0; t < a.count; t += 3) for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; } }
}

// ---- the real (MPFB) arms: rest frames worked out once from the bones, then posed from the frames above ----
const SIDES = ["l", "r"], DIG = ["index", "middle", "ring", "pinky"];
function realArms(scene, { gloves, skinHex }) {
  const root = cloneSkinned(scene); root.updateMatrixWorld(true);
  const bone = (n) => root.getObjectByName(n);
  const wp = (o) => o.getWorldPosition(V()), wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = false;
    // (a plain opaque skin material: the export marks it see-through and physical, neither of which a hand needs)
    const src = o.material, mt = o.material = new THREE.MeshStandardMaterial({ map: src.map || null, normalMap: src.normalMap || null, roughness: 0.62, metalness: 0 });
    if (gloves) { mt.map = null; mt.color.set(0x24272b); mt.roughness = 0.5; } // (fitted neoprene)
    else { const t = new THREE.Color(skinHex), ref = new THREE.Color(0xd8a682); mt.color.setRGB(Math.min(1.4, t.r / ref.r), Math.min(1.4, t.g / ref.g), Math.min(1.4, t.b / ref.b)); } // (your skin tone over the model's)
    // light through the skin at its edges (a warm glow where the fingers turn away from you, as real skin does: a cheap
    // stand-in for subsurface scattering); neoprene gloves get a faint cool sheen there instead
    mt.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      { float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);
        reflectedLight.indirectDiffuse += ${gloves ? "vec3(0.10, 0.11, 0.13) * rim * 0.5" : "diffuseColor.rgb * vec3(0.95, 0.38, 0.26) * rim * 0.4"}; }`); };
    mt.customProgramCacheKey = () => "fdskin" + (gloves ? "g" : "");
  });
  const sides = SIDES.map((sfx, i) => {
    const s = i ? 1 : -1, hand = bone("hand_" + sfx), fore = bone("lowerarm_" + sfx);
    if (!hand || !fore) throw new Error("bones missing");
    const P = wp(hand), Yh = wp(bone("middle_01_" + sfx)).sub(P).normalize();
    const across = wp(bone("index_01_" + sfx)).sub(wp(bone("pinky_01_" + sfx))); across.addScaledVector(Yh, -across.dot(Yh)).normalize();
    const X = across.clone().multiplyScalar(s), Z = X.clone().cross(Yh).normalize(); X.copy(Yh).cross(Z).normalize();
    const frame = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(X, Yh, Z));
    const handW = wq(hand), foreW = wq(fore), foreP = wp(fore), len = P.distanceTo(foreP), dir0 = P.clone().sub(foreP).normalize();
    const up0 = Z.clone().addScaledVector(dir0, -Z.dot(dir0)).normalize(), fr0 = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(dir0.clone().cross(up0), dir0, up0));
    // each finger's bones, with the axis it curls about (towards the palm) in its own frame
    const chain = (name, axisW) => [1, 2, 3].map((k) => { const b = bone(`${name}_0${k}_${sfx}`); return { b, rest: b.quaternion.clone(), axis: axisW.clone().applyQuaternion(wq(b).invert()).normalize() }; });
    const fingers = DIG.map((d) => chain(d, X));
    const tDir = wp(bone("thumb_02_" + sfx)).sub(wp(bone("thumb_01_" + sfx))).normalize(), tAxis = tDir.clone().cross(Z).normalize().multiplyScalar(s); // (towards the palm, as the fingers: the other way stood it straight up)
    const thumb = chain("thumb", tAxis);
    return { hand, fore, frameInv: frame.clone().invert(), handW, foreW, len, fr0Inv: fr0.clone().invert(), fingers, thumb, handRest: hand.quaternion.clone() };
  });
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), gq = new THREE.Quaternion();
  return {
    root,
    /** hand i at `pos` with frame `quat` (the group's space), its fingers curled as `curl`, the elbow towards `elbow` */
    pose(i, group, pos, quat, curl, elbow) {
      const S = sides[i]; group.updateWorldMatrix(true, false); group.getWorldQuaternion(gq);
      const Pw = group.localToWorld(pos.clone()), Ew = group.localToWorld(elbow.clone()), Qw = gq.clone().multiply(quat);
      const handT = Qw.clone().multiply(S.frameInv).multiply(S.handW); // (the hand bone's world turn for that frame)
      // the forearm from the elbow's side to the wrist, rolled so the palm side stays the palm side (no twist)
      const dir = Pw.clone().sub(Ew).normalize(), Zt = V(0, 0, 1).applyQuaternion(Qw); Zt.addScaledVector(dir, -Zt.dot(dir)); if (Zt.lengthSq() < 1e-6) Zt.set(0, 1, 0); Zt.normalize();
      const foreT = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(dir.clone().cross(Zt), dir, Zt)).multiply(S.fr0Inv).multiply(S.foreW);
      const par = S.fore.parent; par.updateWorldMatrix(true, false);
      S.fore.position.copy(par.worldToLocal(Pw.clone().addScaledVector(dir, -S.len)));
      S.fore.quaternion.copy(par.getWorldQuaternion(q).invert().multiply(foreT));
      S.fore.updateMatrixWorld(true);
      S.hand.quaternion.copy(foreT.clone().invert().multiply(handT));
      const fs = curl?.f || [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], ts = curl?.t || [0, 0, 0];
      S.fingers.forEach((ch, a) => ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, fs[a][k]))));
      S.thumb.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, ts[k] * 0.8)));
      root.updateMatrixWorld(true);
    },
  };
}

/**
 * Your hands in first person. look: { gloves, skinHex, coatHex }. Add `group` to the angler's root; call
 * pose({ hands: [left, right], eye, vr, vu, vf, dt, t }) each frame (everything in the angler's space), and show(on).
 * A hand: { at, axis, palm, kind } as angler.js gives the body (what it holds, the line through it, which way the palm
 * faces), or null (that hand goes down out of sight).
 */
export function createFpHands({ gloves = false, skinHex = 0xc99a74, coatHex = 0x2b3a4f } = {}) {
  const group = new THREE.Group(); group.name = "fp-hands"; group.visible = false;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: gloves ? 0.55 : 0.6, metalness: 0 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.78 });
  const hemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(coatHex).multiplyScalar(0.6), roughness: 0.85 });
  const built = buildHand(gloves, skinHex);
  bakeRest(built.geo, built.bones);
  const geoL = built.geo.clone(); mirror(geoL);
  const hands = [0, 1].map((i) => {
    const b = buildHand(gloves, skinHex); // (a fresh skeleton for each hand: the geometry is the shared one)
    b.geo.dispose();
    // (the left hand's bones mirrored like its geometry, or its fingers would bend about the right hand's joints)
    if (!i) for (const bn of b.bones) { bn.position.x = -bn.position.x; bn.rotation.y = -bn.rotation.y; bn.rotation.z = -bn.rotation.z; }
    const mesh = new THREE.SkinnedMesh(i ? built.geo : geoL, mat); mesh.frustumCulled = false; mesh.castShadow = false;
    mesh.add(b.bones[0]); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(b.bones), new THREE.Matrix4());
    // the sleeve: from the wrist back past the elbow (out of sight), with a hem at the cuff
    const sleeve = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.047, 0.5, 20, 1, true), sleeveMat); tube.geometry.translate(0, -0.25, 0); tube.scale.set(1, 1, 0.84);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.005, 6, 24), hemMat); hem.rotation.x = Math.PI / 2; hem.scale.set(1, 1, 0.84);
    sleeve.add(tube, hem);
    group.add(mesh, sleeve);
    return { mesh, sleeve, bones: b.bones, joints: b.joints, s: i ? 1 : -1, cur: null, from: null, u: 1, kind: undefined, curl: GRIPS.rest };
  });

  // ---- the real hands: forearms and hands cut from a MakeHuman (MPFB, CC0) person in Blender (public/models/
  // fp_arms.glb): real fingers, knuckles and skin, on their own skeleton. Placed by the same frames as above (so they
  // can't drift or flip any more than the simple hands could), the forearm laid from the elbow to the wrist and turned
  // with the hand (no twisting), each finger curled about its own joint. Until they've loaded, the simple hands show
  let real = null;
  loadPart("fp_arms").then((sc) => { try { real = realArms(sc, { gloves, skinHex }); } catch (e) { real = null; if (typeof console !== "undefined") console.warn("fp arms:", e?.message || e); } if (real) { group.add(real.root); for (const h of hands) h.mesh.visible = false; } }).catch(() => {});

  const m4 = new THREE.Matrix4();
  // the hand's frame from what it holds: the thumb along the handle (towards the rod's tip, or out along the reel's
  // handle), the palm turned the way asked, the fingers square to both; one answer for each input, no flipping
  function frameFor(h, spec, elbow) {
    const ax = spec.axis ? spec.axis.clone().normalize() : V(0, 1, 0), reach = spec.at.clone().sub(elbow);
    if (spec.kind === "crank") {
      // pinching the reel's handle: the fingers carry on from the forearm (the wrist straight), the knob across them,
      // the palm towards you rather than away (settled by the input alone)
      const Y = reach.clone().addScaledVector(ax, -reach.dot(ax)).normalize();
      const Z = ax.clone().cross(Y).normalize(); if (Z.dot(spec.palm || V(0, 0, 1)) < 0) Z.negate();
      const X = Y.clone().cross(Z).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(X, Y, Z));
    }
    if (spec.kind === "seat") {
      // the rod's handle at the reel: the hand on the side of it, palm in, the thumb along the top towards the tip, the
      // fingers going down round it (either side of the reel's stem) and forwards, the handle lying diagonally across
      // the palm as it does in a real hand
      const Z = (spec.palm || V(-h.s, 0, 0)).clone(); Z.addScaledVector(ax, -Z.dot(ax)).normalize();
      const D = Z.clone().cross(ax).normalize(); if (D.y > 0) D.negate(); // (down the side of the handle)
      const Y = D.multiplyScalar(Math.cos(BETA)).addScaledVector(ax, Math.sin(BETA)).normalize();
      Z.addScaledVector(Y, -Z.dot(Y)).normalize();
      const X = Y.clone().cross(Z).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(X, Y, Z));
    }
    // a handle across the palm, diagonally (as a rod's handle lies in a hand): the palm towards `palm`, the thumb up
    // the handle (the left hand is the mirror image: its thumb is on its -x side)
    const Z = (spec.palm || V(0, 0, 1)).clone(); Z.addScaledVector(ax, -Z.dot(ax)); if (Z.lengthSq() < 1e-6) Z.set(0, 1, 0).addScaledVector(ax, -ax.y); Z.normalize();
    const thumb = ax.clone().applyAxisAngle(Z, -0.28 * h.s); thumb.addScaledVector(Z, -thumb.dot(Z)).normalize();
    const X = thumb.multiplyScalar(h.s), Y = Z.clone().cross(X).normalize();
    // the wrist towards the elbow: if that would point the fingers back at it, the handle's held the other way round
    // (the elbow is fixed in the view, so this can't change from one frame to the next while the grip is the same)
    if (Y.dot(reach) < 0) { X.negate(); Y.negate(); }
    return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(X, Y, Z));
  }

  const tmpV = V();
  return {
    group,
    show(on) { group.visible = !!on; if (!on) for (const h of hands) h.cur = null; },
    pose(o) {
      const { hands: specs = [null, null], eye, vr, vu, vf, dt = 0.016 } = o;
      if (!group.visible) return;
      for (let i = 0; i < 2; i++) {
        const h = hands[i], spec = specs[i];
        // the elbow: fixed in the view, below and out to the side, out of sight
        const elbow = eye.clone().addScaledVector(vr, h.s * (o.elbowX ?? 0.2)).addScaledVector(vu, o.elbowY ?? -0.6).addScaledVector(vf, o.elbowZ ?? 0.35);
        // (holding the rod at the reel, the forearm lies back along the rod's butt, just under it)
        if (spec?.kind === "seat" && spec.axis) elbow.copy(spec.at).addScaledVector(spec.axis.clone().normalize(), -0.3).addScaledVector(vu, -0.1).addScaledVector(vr, 0.13 * h.s);
        let want;
        if (spec) {
          const quat = frameFor(h, spec, elbow);
          const ch = channelOf(spec.kind).clone(); if (h.s < 0) ch.x = -ch.x;
          const pos = spec.at.clone().sub(ch.applyQuaternion(quat));
          want = { pos, quat, kind: spec.kind };
        } else {
          // nothing to hold: down by your side, out of the view, fingers forward, palm in
          const pos = elbow.clone().addScaledVector(vu, -0.12).addScaledVector(vf, 0.1);
          const Y = vf.clone(), Z = vr.clone().multiplyScalar(-h.s), X = Y.clone().cross(Z);
          want = { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(X, Y, Z)), kind: null };
        }
        // easing to something new (a short blend whenever what the hand holds changes); then following it exactly
        if (want.kind !== h.kind || !h.cur) { h.from = h.cur ? { pos: h.cur.pos.clone(), quat: h.cur.quat.clone(), curl: h.curlNow } : null; h.kind = want.kind; h.u = h.from ? 0 : 1; h.curlTo = gripOf(want.kind); }
        h.u = Math.min(1, h.u + dt / 0.3);
        const e = ease(h.u);
        const pos = h.from ? h.from.pos.clone().lerp(want.pos, e) : want.pos;
        const quat = h.from ? h.from.quat.clone().slerp(want.quat, e) : want.quat;
        h.cur = { pos, quat };
        h.mesh.position.copy(pos); h.mesh.quaternion.copy(quat);
        // the fingers and thumb, curled for the grip
        const from = h.from?.curl || h.curlTo, to = h.curlTo;
        const curl = { f: to.f.map((row, a) => row.map((v, b) => from.f[a][b] + (v - from.f[a][b]) * e)), t: to.t.map((v, b) => from.t[b] + (v - from.t[b]) * e), spread: from.spread + (to.spread - from.spread) * e };
        h.curlNow = curl;
        h.joints.forEach((chain, a) => chain.forEach((bn, b) => {
          if (a < 4) bn.rotation.set(curl.f[a][b], 0, (b === 0 ? (a - 1.5) * -curl.spread : 0) * h.s);
          else if (b === 0) bn.rotation.set(0.35 + curl.t[0] * 0.6, curl.t[0] * 0.5 * h.s, (-0.75 + curl.t[0] * 0.55) * h.s); else bn.rotation.set(curl.t[b], 0, 0);
        }));
        // the sleeve: from the wrist back towards the elbow
        const wrist = pos.clone().add(tmpV.set(0, -0.05, 0).applyQuaternion(quat));
        const back = elbow.clone().sub(wrist).normalize();
        h.sleeve.position.copy(wrist); h.sleeve.quaternion.setFromUnitVectors(V(0, -1, 0), back);
        if (real) real.pose(i, group, pos, quat, curl, elbow);
      }
    },
    /** where each hand is (the wrist, in the group's space), for tests */
    get wrists() { return hands.map((h) => (h.cur ? h.cur.pos.clone() : null)); },
    dispose() { built.geo.dispose(); geoL.dispose(); mat.dispose(); sleeveMat.dispose(); hemMat.dispose(); for (const h of hands) h.sleeve.traverse((o) => o.geometry?.dispose?.()); },
  };
}
