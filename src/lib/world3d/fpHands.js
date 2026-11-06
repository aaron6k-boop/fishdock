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
import { subdivide } from "./subdivide.js";

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
  // (over the knob, the fingers wrapped down round it and the thumb on top: was a tight fist with the knob lying
  // against the backs of the fingers and the thumb stuck out, the curled look in Aaron's recording)
  // (the ring and little fingers tucked in under the hand, out of the way of the reel: they were left spread over it)
  crank: { f: [[1.0, 1.1, 0.7], [1.1, 1.2, 0.8], [1.5, 1.6, 1.0], [1.6, 1.6, 1.05]], t: [0.6, 0.5, 0.35], spread: 0.0 },
  fist: { f: [[1.25, 1.35, 0.9], [1.3, 1.4, 0.9], [1.35, 1.4, 0.95], [1.4, 1.4, 0.95]], t: [0.6, 0.5, 0.35], spread: 0.0 },
  fish: { f: [[0.25, 0.3, 0.2], [0.3, 0.35, 0.22], [0.35, 0.38, 0.25], [0.4, 0.4, 0.28]], t: [0.1, 0.15, 0.1], spread: 0.05 },
};
let BETA = 1.0; export const _tune = (o) => { if (o.beta != null) BETA = o.beta; };
const gripOf = (kind) => (kind === "seat" ? GRIPS.seat : kind === "crank" ? GRIPS.crank : kind === "fish" ? GRIPS.fish : kind ? GRIPS.fist : GRIPS.rest);
// where what's held runs through the hand (hand frame): in the curl of the fingers, in front of the palm; for the reel's
// handle, between the thumb and the curled index finger
const CHANNEL = { seat: V(0.004, 0.102, 0.03), crank: V(0.012, 0.12, 0.025), fish: V(0, 0.06, -0.02), fist: V(0, 0.1, 0.03) };
const channelOf = (kind) => CHANNEL[kind] || CHANNEL.fist;
// ---- winding the reel ----
// roll: the hand turned about the knob (radians) from square to the forearm; follow: how much of the knob's circle the
// elbow and forearm follow (a real arm winds from the elbow, the wrist taking the rest); ease: how far the fingers
// loosen a little once the handle's been still a moment
const CRANK = { roll: -1.1, follow: 0.55, ease: 0.16 };
const TUNE_ELBOW = (typeof window !== "undefined" && window.__fdElbow) || {};
if (typeof window !== "undefined" && window.__fdFilm) window.__fdHands = { GRIPS, CHANNEL, CRANK };

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
// ---- fine detail drawn once: skin (pores and the fine creases across it) and the jacket's woven fabric ----
let DETAIL = null;
function detailMaps() {
  if (DETAIL || typeof document === "undefined") return DETAIL;
  const hsh = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const make = (n, h, k, rough) => {
    const c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d"), img = g.createImageData(n, n), H = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) H[y * n + x] = h(x, y);
    const at = (x, y) => H[((y + n) % n) * n + ((x + n) % n)];
    const r = document.createElement("canvas"); r.width = r.height = n; const gr = r.getContext("2d"), ir = gr.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      img.data.set([(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], i);
      const v = rough(x, y, at(x, y)) * 255; ir.data.set([v, v, v, 255], i);
    }
    g.putImageData(img, 0, 0); gr.putImageData(ir, 0, 0);
    const T = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    return { normal: T(c), rough: T(r) };
  };
  // skin: small pores, a soft grain and fine creases running across (oilier, shinier between them)
  const skin = make(256, (x, y) => 0.5 + (hsh(x >> 1, y >> 1) > 0.93 ? -0.35 : 0) + 0.06 * hsh(x, y) + 0.12 * Math.sin((y + Math.sin(x * 0.07) * 6) * 0.42) * (hsh(x >> 4, y >> 3) > 0.5 ? 1 : 0.3), 2.2, (x, y, h) => 0.62 + 0.06 * (h - 0.5) + 0.06 * hsh(x >> 4, y >> 4));
  // softshell fabric: a fine twill
  const cloth = make(64, (x, y) => 0.5 + 0.35 * Math.sin(((x + y) % 8) / 8 * Math.PI * 2) * ((x >> 2) % 2 ? 1 : 0.6), 1.6, (x, y, h) => 0.72 + 0.12 * h);
  DETAIL = { skin, cloth };
  return DETAIL;
}

function realArms(scene, { gloves, skinHex }) {
  const root = cloneSkinned(scene); root.updateMatrixWorld(true);
  const bone = (n) => root.getObjectByName(n);
  const wp = (o) => o.getWorldPosition(V()), wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const m = new THREE.Matrix4();
  // the forearms are only drawn from the wrist to a little way inside the sleeve: beyond that the sleeve (a separate,
  // looser tube) covers them, and the skin used to show through it wherever the arm was thicker than the sleeve
  const CUT = { uFdW: { value: [V(), V()] }, uFdDir: { value: [V(0, 1, 0), V(0, 1, 0)] }, uFdCut: { value: 0.075 } };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = false;
    // (one step of subdivision: the model's fingers had a few flat sides each, which read as blocks this close)
    try { o.geometry = subdivide(o.geometry, { keep: 0.55 }); } catch (e) { console.warn("fp arms: not subdivided", e?.message || e); }
    // (a plain opaque skin material: the export marks it see-through and physical, neither of which a hand needs)
    const src = o.material, D = detailMaps();
    // skin: the model's colour with fine pores and creases over it (a normal and a roughness map, tiled), a little oilier
    // than before (real skin has a soft sheen, not a matte plastic look)
    const mt = o.material = new THREE.MeshStandardMaterial({ map: src.map || null, roughness: 1, metalness: 0, normalMap: D && !gloves ? D.skin.normal : null, roughnessMap: D && !gloves ? D.skin.rough : null, normalScale: new THREE.Vector2(0.14, 0.14) });
    if (D && !gloves) { D.skin.normal.repeat.set(22, 22); D.skin.rough.repeat.set(6, 6); }
    if (gloves) { mt.map = null; mt.color.set(0x24272b); mt.roughness = 0.5; } // (fitted neoprene)
    else { const t = new THREE.Color(skinHex), ref = new THREE.Color(0xd8a682); mt.color.setRGB(Math.min(1.4, t.r / ref.r), Math.min(1.4, t.g / ref.g), Math.min(1.4, t.b / ref.b)); const lum = mt.color.r * 0.3 + mt.color.g * 0.59 + mt.color.b * 0.11; mt.color.lerp(new THREE.Color(lum, lum, lum), 0.14); } // (a touch less saturated: the model's tone read orange under the warm light) // (your skin tone over the model's)
    // light through the skin at its edges (a warm glow where the fingers turn away from you, as real skin does: a cheap
    // stand-in for subsurface scattering); neoprene gloves get a faint cool sheen there instead
    mt.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, CUT);
      sh.vertexShader = "varying vec3 vFdW;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvFdW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = "varying vec3 vFdW; uniform vec3 uFdW[2]; uniform vec3 uFdDir[2]; uniform float uFdCut;\n" + sh.fragmentShader
        .replace("void main() {", `void main() {
          { vec3 a = vFdW - uFdW[0], b = vFdW - uFdW[1]; float ta = dot(a, uFdDir[0]), tb = dot(b, uFdDir[1]);
            float t = dot(a, a) < dot(b, b) ? ta : tb; if (t < -uFdCut) discard; }`)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      { float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);
        reflectedLight.indirectDiffuse += ${gloves ? "vec3(0.10, 0.11, 0.13) * rim * 0.5" : "diffuseColor.rgb * vec3(0.9, 0.42, 0.32) * rim * 0.15"};
        ${gloves ? "" : "reflectedLight.directDiffuse *= vec3(1.0, 0.96, 0.93);"} }`);
    };
    mt.customProgramCacheKey = () => "fdskin3" + (gloves ? "g" : "");
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
    // each segment's length at rest (the last one, which has no bone beyond it, about four fifths of the one before)
    for (const ch of [...fingers, thumb]) { for (let k = 0; k < 2; k++) ch[k].len = wp(ch[k].b).distanceTo(wp(ch[k + 1].b)); ch[2].len = ch[1].len * 0.82; }
    // ---- the hand as it really is, measured off the model at rest, in the hand bone's own frame: where the fingers
    // point (wrist to middle knuckle), which way the index side is, which way the palm faces (the way the fingers bend,
    // not a guess from the frame: on the mirrored left hand the frame's z was the back of the hand), and the points the
    // grips are set by (the middle of the palm's surface; between the middle and ring fingers' first bones)
    const hInv = handW.clone().invert(), toH = (v) => v.clone().applyQuaternion(hInv);
    const fing = fingers[1][0], t0 = wp(fingers[1][1].b);
    fing.b.quaternion.copy(fing.rest).multiply(new THREE.Quaternion().setFromAxisAngle(fing.axis, 0.5)); fing.b.updateMatrixWorld(true);
    const palmW = wp(fingers[1][1].b).sub(t0); fing.b.quaternion.copy(fing.rest); fing.b.updateMatrixWorld(true);
    palmW.addScaledVector(Yh, -palmW.dot(Yh)).normalize();
    const idxW = wp(bone("index_01_" + sfx)).sub(wp(bone("pinky_01_" + sfx))); idxW.addScaledVector(Yh, -idxW.dot(Yh)).normalize();
    const mid1 = wp(bone("middle_01_" + sfx)), mid2 = wp(bone("middle_02_" + sfx)), rin1 = wp(bone("ring_01_" + sfx)), rin2 = wp(bone("ring_02_" + sfx));
    const ix1 = wp(bone("index_01_" + sfx)), ix2 = wp(bone("index_02_" + sfx));
    // (where a handle lies in a gripping hand: across the palm just behind the knuckles, in its far crease, not in the
    // middle of it, so the fingers close round it from their roots)
    const knAvg = ["index", "middle", "ring", "pinky"].reduce((a2, d) => a2.add(wp(bone(`${d}_01_${sfx}`))), V()).multiplyScalar(0.25);
    const palmPt = P.clone().lerp(knAvg, 0.82).addScaledVector(palmW, 0.012);
    const gapPt = mid1.clone().lerp(mid2, 0.5).lerp(rin1.clone().lerp(rin2, 0.5), 0.5);
    const hookPt = ix1.clone().lerp(ix2, 0.5).lerp(mid1.clone().lerp(mid2, 0.5), 0.5);
    const M = { y: toH(Yh), n: toH(palmW), x: toH(idxW), palm: toH(palmPt.sub(P)), gap: toH(gapPt.sub(P)), hook: toH(hookPt.sub(P)) };
    return { i, M, hand, fore, frameInv: frame.clone().invert(), handW, foreW, len, fr0Inv: fr0.clone().invert(), fingers, thumb, handRest: hand.quaternion.clone(), mid: bone("middle_01_" + sfx), ring: bone("ring_01_" + sfx) };
  });
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), gq = new THREE.Quaternion();
  // (how near a finger's segment, joint to tip, comes to the line through the handle)
  const flat = (p, A, D) => { const d = p.clone().sub(A); return d.addScaledVector(D, -d.dot(D)); };
  // (a short thing, the reel's knob: the nearest the finger's segment comes to the knob's own length, not to the line
  // through it, which ran on through the reel and stopped the fingers wherever they crossed it)
  const segSeg = (p0, p1, A, D, L) => {
    const q0 = A.clone().addScaledVector(D, -L / 2), d1 = p1.clone().sub(p0), d2 = D.clone().multiplyScalar(L), r = p0.clone().sub(q0);
    const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
    let s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0, t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    return p0.clone().addScaledVector(d1, s).distanceTo(q0.clone().addScaledVector(d2, t));
  };
  const segD = (p0, p1, A, D) => { const a = flat(p0, A, D), b = flat(p1, A, D), ab = b.clone().sub(a), t = clamp(-a.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return a.addScaledVector(ab, t).length(); };
  // ---- closing a hand round what it holds ----
  // Each joint, from the knuckle out, bends until the end of its segment meets the surface of the handle (a cylinder
  // round the line through it), then the next joint takes over: the fingers wrap round the handle whatever its size or
  // however the hand sits on it, rather than curling by a set amount and closing on air (or through the rod).
  const MAXB = [1.75, 1.95, 1.4], STEP = 0.06;
  function wrap(ch, A, D, R, fr, from, both = false, table = null, len = 0) {
    const out = [0, 0, 0]; out.hits = 0;
    for (let k = 0; k < 3; k++) {
      const j = ch[k], tipOf = () => (k < 2 ? wp(ch[k + 1].b) : wp(j.b).add(V(0, 1, 0).applyQuaternion(wq(j.b)).multiplyScalar(j.len)));
      for (let kk = k + 1; kk < 3; kk++) ch[kk].b.quaternion.copy(ch[kk].rest);
      const r = R + fr * (1 - 0.15 * k);
      let got = null;
      // (the thumb can meet the handle bending either way: it sits across from the fingers, and its joint's natural
      // bend isn't always towards what it holds; the nearer contact is taken, or none)
      for (const sg of both ? [1, -1] : [1]) {
        let prev = null;
        for (let a = 0; a <= MAXB[k] + 1e-6; a += STEP) {
          j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, a * sg)); j.b.updateMatrixWorld(true);
          // (the first bone: the nearest any of it comes; the ones beyond start against it already, so their ends: each
          // bends until its end comes down onto the surface, wrapping on round it)
          const tp = tipOf(), dd = (k === 0 ? (len ? segSeg(wp(j.b), tp, A, D, len) : segD(wp(j.b), tp, A, D)) : (len ? segSeg(tp, tp.clone().add(V(0, 1e-5, 0)), A, D, len) : segD(tp, tp.clone().add(V(0, 1e-5, 0)), A, D))) - r;
          // (already against it straight, at the knuckle: no bend found; the grip's own curl is used there instead)
          if (dd <= 0) { const c = prev ? (prev.a + STEP * (prev.d / Math.max(1e-6, prev.d - dd))) * sg : NaN; if (got == null || Number.isNaN(got) || Math.abs(c) < Math.abs(got)) got = c; break; }
          prev = { a, d: dd };
        }
      }
      const met = got != null && !Number.isNaN(got);
      if (got == null) got = both ? 0.25 : MAXB[k] * 0.6;
      // (a finger already against the handle at the knuckle stays straight there and bends at the next joint)
      if (met) out.hits = (out.hits || 0) + (k === 0 ? 1 : 0.5); // (the root meeting it counts most)
      out[k] = Number.isNaN(got) ? (table?.[k] ?? 0) : both ? got : Math.max(from?.[k] ?? 0, got);
      j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, out[k])); j.b.updateMatrixWorld(true);
    }
    return out;
  }
  // which way this hand's palm faces, as it now lies (world): the way the index finger's tip goes as it bends. (The
  // frame's own z is the palm for the right hand; for the left, mirrored, it came out the back of the hand, so its
  // knob was set behind the fingers and they curled away from it, lying flat over the reel)
  function palmDir(S) {
    const j = S.fingers[1][0], tip = () => wp(S.fingers[1][1].b), base = wp(j.b);
    j.b.quaternion.copy(j.rest); j.b.updateMatrixWorld(true); const t0 = tip();
    j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, 0.5)); j.b.updateMatrixWorld(true); const t1 = tip();
    j.b.quaternion.copy(j.rest); j.b.updateMatrixWorld(true);
    const along = t0.clone().sub(base).normalize(), d = t1.sub(t0); d.addScaledVector(along, -d.dot(along));
    return d.lengthSq() > 1e-10 ? d.normalize() : V(0, 0, 1);
  }
  function place(S, Pw, Ew, Qw) {
    const handT = Qw.clone().multiply(S.frameInv).multiply(S.handW); // (the hand bone's world turn for that frame)
    // the forearm from the elbow's side to the wrist, rolled so the palm side stays the palm side (no twist)
    const dir = Pw.clone().sub(Ew).normalize(), Zt = V(0, 0, 1).applyQuaternion(Qw); Zt.addScaledVector(dir, -Zt.dot(dir)); if (Zt.lengthSq() < 1e-6) Zt.set(0, 1, 0); Zt.normalize();
    const foreT = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(dir.clone().cross(Zt), dir, Zt)).multiply(S.fr0Inv).multiply(S.foreW);
    const par = S.fore.parent; par.updateWorldMatrix(true, false);
    S.fore.position.copy(par.worldToLocal(Pw.clone().addScaledVector(dir, -S.len)));
    CUT.uFdW.value[S.i].copy(Pw); CUT.uFdDir.value[S.i].copy(dir);
    S.fore.quaternion.copy(par.getWorldQuaternion(q).invert().multiply(foreT));
    S.fore.updateMatrixWorld(true);
    S.hand.quaternion.copy(foreT.clone().invert().multiply(handT));
    S.hand.updateMatrixWorld(true);
  }
  // (the forearm laid from the elbow to the wrist, for a hand whose own world turn is given)
  function place2(S, Pw, Ew, handT) {
    const dir = Pw.clone().sub(Ew).normalize(), Zt = S.M.n.clone().applyQuaternion(handT); Zt.addScaledVector(dir, -Zt.dot(dir)); if (Zt.lengthSq() < 1e-6) Zt.set(0, 1, 0); Zt.normalize();
    // (the palm side of the forearm turned the way the palm faces: the model's forearm frame is mapped the same way at rest)
    const rest = S.M.n.clone().applyQuaternion(S.handW); const dir0 = V(0, 1, 0).applyQuaternion(S.fr0Inv.clone().invert()); void rest; void dir0;
    const foreT = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(dir.clone().cross(Zt), dir, Zt)).multiply(S.fr0Inv).multiply(S.foreW);
    const par = S.fore.parent; par.updateWorldMatrix(true, false);
    S.fore.position.copy(par.worldToLocal(Pw.clone().addScaledVector(dir, -S.len)));
    CUT.uFdW.value[S.i].copy(Pw); CUT.uFdDir.value[S.i].copy(dir);
    S.fore.quaternion.copy(par.getWorldQuaternion(q).invert().multiply(foreT));
    S.fore.updateMatrixWorld(true);
    S.hand.quaternion.copy(foreT.clone().invert().multiply(handT));
    S.hand.updateMatrixWorld(true);
  }
  // ---- the grips, set on the equipment itself ----
  // A grip is the hand's place and turn in the frame of what it holds (the reel: z along the rod to the tip, y up, the
  // reel hanging below; x across), and how far each finger bends. Each is worked out once, from real anglers' grips:
  //   rod: the hand on the side of the handle at the reel, palm against it (a little under), the handle lying across the
  //     palm on a slight diagonal; the fingers wrap down and under it, the reel's stem between the middle and ring
  //     fingers (two in front, two behind), the thumb over the top along the handle
  //   knob: an overhand grip on the reel's knob: the palm over it, the index and middle fingers curled down round its
  //     front and under, the thumb closing on it from behind, the ring and little fingers tucked; the knob's axis across
  //     the fingers, the index side towards the reel
  // Each frame the hand is set from the grip and where the equipment is now: it can't drift, and the fingers stay as they
  // are through every turn of the handle (the knob turns in them; the wrist rolls a little with the handle's angle).
  const basis = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const GRIP = { rodR: 0.0145, knobR: 0.01, knobLen: 0.026 }; // (the knob as modelled: 2 cm across, 2.6 cm long, rodkit.glb crank_knob)
  // palmTilt: the palm's facing, up (+) or down (-) from level; diag: how far forward the fingers lean (the handle's
  // diagonal across the palm); wristLim: how far the forearm may turn from straight behind the hand
  const TUNE = (typeof window !== "undefined" && window.__fdGripTune) || { wristLim: 0.6, wristW: 1.6 };
  const solved = new Map();
  // The grip is found, not guessed: the hand is tried in a range of placements on the handle (or the knob), each
  // closed on it, and the one kept where every finger meets it from its root and the forearm (coming from the elbow's
  // side, behind and below) needs the least bend at the wrist. Worked out once per grip, with the hand at the origin.
  function trySet(S, Qh, Ph, kind) {
    const M = S.M, yl = M.y.clone().normalize();
    place2(S, Ph, Ph.clone().addScaledVector(yl.clone().applyQuaternion(Qh), -S.len), Qh);
    const A = V(0, 0, 0), D = kind === "seat" ? V(0, 0, 1) : V(1, 0, 0), R = kind === "seat" ? GRIP.rodR : GRIP.knobR, L = kind === "seat" ? 0 : GRIP.knobLen;
    const cap = kind === "cap";
    const TUCK = [[1.5, 1.6, 1.0], [1.6, 1.6, 1.05]], f = [], hit = [];
    S.fingers.forEach((ch, a) => {
      ch.forEach((j) => j.b.quaternion.copy(j.rest));
      if (kind !== "seat" && !cap && a >= 2) { f[a] = TUCK[a - 2]; hit[a] = 9; return; }
      const r = wrap(ch, A, D, R, 0.0085, null, false, kind === "seat" ? [1.25, 1.3, 0.8] : [1.0, 1.1, 0.7], L);
      f[a] = r; hit[a] = r.hits;
      // (how far each segment's end is from the surface of what it holds, as set: a finger round it is on it all along)
      ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, r[k])));
      ch[0].b.updateMatrixWorld(true);
      let gap = 0;
      for (let k = 0; k < 3; k++) { const e = k < 2 ? wp(ch[k + 1].b) : wp(ch[2].b).add(V(0, 1, 0).applyQuaternion(wq(ch[2].b)).multiplyScalar(ch[2].len)); const d = (L ? segSeg(e, e.clone().add(V(0, 1e-5, 0)), A, D, L) : segD(e, e.clone().add(V(0, 1e-5, 0)), A, D)) - R - 0.0085; gap += Math.abs(d) * (k === 0 ? 0.5 : 1); }
      f.gap = (f.gap || 0) + gap;
      // (on the rod the fingers go round underneath it, where the reel's stem is, not over the top: how far each tip is
      // above the handle's middle)
      // (their second and third joints below it: the tips may come up the far side, as they do in a full grip)
      if (kind === "seat") { f.over = (f.over || 0) + (Math.max(0, wp(ch[1].b).y + 0.004) + Math.max(0, wp(ch[2].b).y + 0.004)) * (a === 0 ? 0.4 : 1); }
    });
    root.updateMatrixWorld(true);
    const t = wrap(S.thumb, A, D, R, 0.0095, null, kind !== "seat", [0.5, 0.4, 0.3], L);
    S.fingers.forEach((ch) => ch.forEach((j) => j.b.quaternion.copy(j.rest))); S.thumb.forEach((j) => j.b.quaternion.copy(j.rest));
    // (and the thumb along the top: its tip above the handle)
    let thumbLow = 0;
    if (kind === "seat") { S.thumb.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, t[k]))); S.thumb[0].b.updateMatrixWorld(true); const tt = wp(S.thumb[2].b).add(V(0, 1, 0).applyQuaternion(wq(S.thumb[2].b)).multiplyScalar(S.thumb[2].len)); thumbLow = Math.max(0, 0.006 - tt.y); S.thumb.forEach((j) => j.b.quaternion.copy(j.rest)); }
    return { f, t, hit, thit: t.hits, gap: f.gap || 0, over: f.over || 0, thumbLow };
  }
  function solveGrip(S, kind, side, Fin) {
    // (Fin: the way to the elbow in the reel's frame, as the arm actually is; the grip is worked out again only if that
    // changes a lot, which it doesn't while you fish: the elbow's fixed in the view)
    // (on the knob the grip is found once and kept: the knob goes round, so the way to the elbow from it changes all
    // the time, and solving again each time it crossed a step put the hand in a different grip every quarter turn)
    const Fq = Fin && kind !== "crank" && kind !== "ropeg" ? [Math.round(Fin.x * 4), Math.round(Fin.y * 4), Math.round(Fin.z * 4)].join(",") : "";
    const key = kind + side + Fq; if (solved.has(key)) return solved.get(key);
    const T = V(0, 0, 1), U = V(0, 1, 0), X = V(1, 0, 0), M = S.M;
    // (the knob, or for "ropeg" the drop net's rope or the hoop's rim: thinner and longer, so the fingers close further)
    const KR = kind === "ropeg" ? 0.0055 : GRIP.knobR, KLn = kind === "ropeg" ? 0.12 : GRIP.knobLen;
    const yl = M.y.clone().normalize(), nl = M.n.clone().addScaledVector(yl, -M.n.dot(yl)).normalize(), xl = yl.clone().cross(nl);
    const Rl = basis(xl, yl, nl).invert();
    // where the forearm comes from (the reel's frame): behind, below, out on the elbow's side
    const F = Fin ? Fin.clone().normalize() : X.clone().multiplyScalar(0.3 * (kind === "seat" ? side : 1)).addScaledVector(U, -0.35).addScaledVector(T, -0.88).normalize();
    let best = null;
    let KD = 0.012, CTH = 0, CPS = 0, SY = 0, SE = 0.002;
    const consider = (Nt, Yt, extra) => {
      Yt = Yt.clone().addScaledVector(Nt, -Yt.dot(Nt)).normalize(); const Xt = Yt.clone().cross(Nt);
      const Qh = basis(Xt, Yt, Nt).multiply(Rl);
      let Ph;
      if (kind === "seat") {
        // the handle across the palm behind the knuckles; the reel's stem (z 0) between the middle and ring fingers
        const palm = M.palm.clone().addScaledVector(yl, SY).applyQuaternion(Qh); Ph = Nt.clone().multiplyScalar(-(GRIP.rodR + SE)).sub(palm);
        const gap = Ph.clone().add(M.gap.clone().applyQuaternion(Qh)); Ph.addScaledVector(T, -gap.z);
      } else {
        // the knob in the hook of the index and middle fingers, the fingers over its middle
        const hook = M.hook.clone().applyQuaternion(Qh); Ph = Nt.clone().multiplyScalar(-(KR + KD)).sub(hook); Ph.x = -hook.x;
      }
      const r = trySet(S, Qh, Ph, kind);
      const wristBend = yl.clone().applyQuaternion(Qh).negate().angleTo(F);
      const miss = r.hit.reduce((a, h) => a + (h >= 1.5 ? 0 : h >= 1 ? 0.3 : 1), 0) + (r.thit > 0 ? 0 : 0.5);
      // (on the rod the thumb's side of the hand is towards the tip, so the thumb lies along the top of the handle; on the
      // knob, towards the reel)
      const ix = M.x.clone().applyQuaternion(Qh), wrongWay = kind === "seat" ? Math.max(0, 0.35 - ix.z) * 3 : Math.max(0, ix.x + 0.5) * 3;
      // (a finger that meets it straight from its root lies across it rather than round it: each should bend at its root)
      const flatF = r.f.reduce((a, x, k) => a + (kind !== "seat" && k >= 2 ? 0 : Math.max(0, 0.75 - x[0])), 0) * 1.5;
      // (how a real angler holds a spinning rod: the hand along the right side of the handle, palm towards it, the
      // fingers running down that side and curling under it round the reel's stem, the thumb along the top. Not the
      // hand on top with the fingers hooked over and down the far side, which is what reads as a claw)
      const side = kind === "seat" ? Math.max(0, (TUNE.palmX ?? 0.7) - Nt.x * (TUNE.palmSign ?? 1)) * (TUNE.sideW ?? 4) + Math.max(0, Yt.y + (TUNE.fingDown ?? 0.45)) * (TUNE.downW ?? 2) : 0;
      const score = side + (kind === "seat" && wristBend > (TUNE.wristMax ?? 1.0) ? 10 + wristBend : 0) + miss * 0.3 + wristBend * (TUNE.wristW ?? 1.6) + wrongWay + flatF + r.gap * 25 + r.over * 60 + r.thumbLow * 40 + (extra || 0);
      if (typeof window !== "undefined" && window.__fdFilm && kind === "seat") (window.__fdCand ||= []).push({ th: +CTH.toFixed(2), ps: +CPS.toFixed(2), sy: SY, se: SE, score: +score.toFixed(2), wrist: +wristBend.toFixed(2), over: +r.over.toFixed(3), tl: +r.thumbLow.toFixed(3), gap: +r.gap.toFixed(3), miss: +miss.toFixed(2), ww: +wrongWay.toFixed(2), flat: +flatF.toFixed(2) });
      if (!best || score < best.score) best = { score, Qh, Ph, f: r.f.map((x) => [x[0], x[1], x[2]]), t: [r.t[0], r.t[1], r.t[2]], gap: r.gap, hit: r.hit, thit: r.thit, wristBend, ny: Nt.x, al: Yt.y };
    };
    if (kind === "seat") {
      // every way round the handle the palm could face it, and every lean of the hand along it
      for (const sy of [-0.02, 0, 0.02]) for (const se of [0.002, 0.012]) for (let th = 0; th < Math.PI * 2 - 1e-3; th += Math.PI / 9) for (let ps = -Math.PI; ps < Math.PI - 1e-3; ps += Math.PI / 12) {
        CTH = th; CPS = ps; SY = sy; SE = se;
        const Nt = X.clone().multiplyScalar(Math.cos(th)).addScaledVector(U, Math.sin(th)), W = T.clone().cross(Nt).normalize();
        consider(Nt, T.clone().multiplyScalar(Math.cos(ps)).addScaledVector(W, Math.sin(ps)));
      }
    } else {
      // the knob: the index and middle fingers curled into a hook just the knob's size (their joints and tips on a circle
      // round it: the curl found so that circle's radius is the knob's plus a finger's), the knob's axis through the
      // circle's middle, across the fingers; then the hand turned round the knob for the straightest wrist, the index side
      // towards the reel. (Closing the fingers on the knob joint by joint left it at the fingertips)
      const hInv = wq(S.hand).invert(), hP = wp(S.hand);
      const tpl = [0.85, 1.15, 0.75]; let bestC = null;
      for (let c = 0.5; c <= 1.7; c += 0.05) {
        const pts = [];
        for (const a of [0, 1]) {
          const ch = S.fingers[a]; ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, tpl[k] * c))); ch[0].b.updateMatrixWorld(true);
          const e = [wp(ch[1].b), wp(ch[2].b), wp(ch[2].b).add(V(0, 1, 0).applyQuaternion(wq(ch[2].b)).multiplyScalar(ch[2].len))];
          for (const q2 of e) pts.push(q2.sub(hP).applyQuaternion(hInv));
        }
        // a circle through them, in the plane square to the knuckle row (xl)
        const u = yl, w = nl, P2 = pts.map((p2) => [p2.dot(u), p2.dot(w)]);
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = P2.length;
        for (const [x, y] of P2) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
        // (Kasa: x^2 + y^2 + Dx + Ey + F = 0, least squares)
        const Mx = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], bv = [-sxz, -syz, -sz];
        const det = (m3) => m3[0][0] * (m3[1][1] * m3[2][2] - m3[1][2] * m3[2][1]) - m3[0][1] * (m3[1][0] * m3[2][2] - m3[1][2] * m3[2][0]) + m3[0][2] * (m3[1][0] * m3[2][1] - m3[1][1] * m3[2][0]);
        const d0 = det(Mx); if (Math.abs(d0) < 1e-14) continue;
        const col = (k) => Mx.map((row, ri) => row.map((v, ci) => (ci === k ? bv[ri] : v)));
        const Dc = det(col(0)) / d0, Ec = det(col(1)) / d0, Fc = det(col(2)) / d0;
        const cx = -Dc / 2, cy = -Ec / 2, rad = Math.sqrt(Math.max(0, cx * cx + cy * cy - Fc));
        const err = Math.abs(rad - (KR + 0.0085));
        if (!bestC || err < bestC.err) { const along = pts.reduce((a2, p2) => a2 + p2.dot(xl), 0) / pts.length; bestC = { err, c, Cl: u.clone().multiplyScalar(cx).addScaledVector(w, cy).addScaledVector(xl, along), rad }; }
      }
      S.fingers.forEach((ch) => ch.forEach((j) => j.b.quaternion.copy(j.rest)));
      const fk = tpl.map((v, k) => v * bestC.c * (TUNE.crankCurl ?? 1) * (k === 0 ? (TUNE.crankRoot ?? 1) : 1));
      // the knuckle row along the knob (index side to the reel, -x), turned round it
      const xTo = (M.x.dot(xl) > 0 ? -1 : 1);
      for (let al = 0; al < Math.PI * 2 - 1e-3; al += Math.PI / 18) {
        const Xt = X.clone().multiplyScalar(xTo), Yt = T.clone().applyAxisAngle(X, al), Nt = Xt.clone().cross(Yt);
        const Qh = basis(Xt, Yt, Nt).multiply(Rl), Ph = bestC.Cl.clone().applyQuaternion(Qh).negate();
        const wristBend = yl.clone().applyQuaternion(Qh).negate().angleTo(F);
        place2(S, Ph, Ph.clone().addScaledVector(yl.clone().applyQuaternion(Qh), -S.len), Qh);
        S.fingers.forEach((ch, a) => ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, a < 2 ? fk[k] : [[1.5, 1.6, 1.0], [1.6, 1.6, 1.05]][a - 2][k]))));
        root.updateMatrixWorld(true);
        const t = wrap(S.thumb, V(0, 0, 0), X, KR, 0.0095, null, true, [0.5, 0.4, 0.3], KLn);
        if (!(t.hits > 0)) {
          // (no contact found by bending it the usual way: the thumb set by trying, its pad on the far side of the knob from
          // the fingers, opposing them; whichever way its joints turn on this model)
          let tb = null;
          for (let a0 = -1.0; a0 <= 1.01; a0 += 0.25) for (let a1 = -0.8; a1 <= 1.01; a1 += 0.3) {
            const ang = [a0, a1, a1 * 0.7]; S.thumb.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, ang[k]))); S.thumb[0].b.updateMatrixWorld(true);
            const tip = wp(S.thumb[2].b).add(V(0, 1, 0).applyQuaternion(wq(S.thumb[2].b)).multiplyScalar(S.thumb[2].len)), mid = wp(S.thumb[2].b);
            const e = Math.abs(segSeg(tip, tip.clone().add(V(0, 1e-5, 0)), V(0, 0, 0), X, KLn) - KR - 0.007) + Math.max(0, KR + 0.006 - segSeg(mid, tip, V(0, 0, 0), X, KLn)) * 4 + Math.abs(a0) * 0.004;
            if (!tb || e < tb.e) tb = { e, ang };
          }
          t[0] = tb.ang[0]; t[1] = tb.ang[1]; t[2] = tb.ang[2]; t.hits = tb.e < 0.006 ? 1 : 0;
        }
        S.thumb.forEach((j) => j.b.quaternion.copy(j.rest));
        // (a real reeling hand comes over the knob from behind and above, the fingers reaching forwards and down round
        // it: from the eye you see the back of the hand and the knuckles, not an open palm reaching up from underneath)
        const palmUp = Math.max(0, Yt.y + (TUNE.palmTol ?? 0.1)) * (TUNE.palmDown ?? 3);
        const score = wristBend + (t.hits > 0 ? 0 : 0.3) + palmUp;
        const tt = [t[0], t[1], t[2]]; // (no contact found: the thumb folded in against the knob's back, not sticking out)
        if (!best || score < best.score) best = { score, Qh, Ph, f: [fk, fk, [1.5, 1.6, 1.0], [1.6, 1.6, 1.05]], t: tt, gap: bestC.err, hit: [9, 9, 9, 9], thit: t.hits, wristBend, ny: Nt.y, al };
      }
      S.fingers.forEach((ch) => ch.forEach((j) => j.b.quaternion.copy(j.rest)));
      if (TUNE.crankCap && kind === "crank") {
        // (the grip most anglers use on a round knob: the palm towards the reel, the knob standing out into the hollow
        // of the hand, the fingers closed round it and the thumb on the other side: the handle arm is seen going into
        // the hand, rather than the knob hidden in a fist off to one side)
        best = null;
        const capOff = TUNE.capOff ?? 0.004;
        for (let al = 0; al < Math.PI * 2 - 1e-3; al += Math.PI / 18) for (const tl of [-0.35, -0.15, 0, 0.15, 0.35]) {
          const Nt = X.clone().negate().applyAxisAngle(T, tl).normalize();
          let Yt = T.clone().applyAxisAngle(X, al); Yt.addScaledVector(Nt, -Yt.dot(Nt)).normalize(); const Xt = Yt.clone().cross(Nt);
          const Qh = basis(Xt, Yt, Nt).multiply(Rl);
          // the hollow of the hand (between the palm and the fingers' roots) just past the knob's end
          const cup = M.palm.clone().lerp(M.hook, TUNE.capCup ?? 0.55).applyQuaternion(Qh);
          const Ph = X.clone().multiplyScalar(KLn / 2 + capOff).sub(cup);
          const r = trySet(S, Qh, Ph, "cap");
          const wristBend = yl.clone().applyQuaternion(Qh).negate().angleTo(F);
          const miss = r.hit.reduce((a2, h) => a2 + (h >= 1 ? 0 : 1), 0) + (r.thit > 0 ? 0 : 0.6);
          const score = wristBend * (TUNE.wristW ?? 1.6) + miss * 0.5 + r.gap * 12 + Math.max(0, Yt.y + 0.2) * (TUNE.capDown ?? 1);
          if (!best || score < best.score) best = { score, Qh, Ph, f: r.f.map((x) => [x[0], x[1], x[2]]), t: [r.t[0], r.t[1], r.t[2]], gap: r.gap, hit: r.hit, thit: r.thit, wristBend, ny: Nt.x, al };
        }
      }
    }
    const out = { Ph: best.Ph, Qh: best.Qh, f: best.f, t: best.t };
    if (typeof window !== "undefined" && window.__fdFilm) (window.__fdGrips ||= {})[S.i + key] = { idx: M.x.clone().applyQuaternion(best.Qh).toArray().map((v) => +v.toFixed(2)), hit: best.hit, thit: best.thit, wrist: +best.wristBend.toFixed(2), gap: +best.gap.toFixed(3), score: +best.score.toFixed(2), f: best.f.map((r) => r.map((v) => +v.toFixed(2))), t: best.t.map((v) => +v.toFixed(2)), ny: best.ny, al: best.al };
    solved.set(key, out); return out;
  }
  const blend = [null, null];
  return {
    root,
    /** hand i held by a grip on the equipment: sock: { pos, quat } (the grip's frame, the group's space), kind "seat" |
     *  "crank", roll (radians, the wrist's roll about the knob), elbow (the group's space: where the arm comes from),
     *  dt. Returns { wrist, elbow } (the group's space). */
    poseSocket(i, group, { pos, quat, kind, roll = 0, elbow, dt = 0.016, free = null }) {
      const S = sides[i]; group.updateWorldMatrix(true, false); group.getWorldQuaternion(gq);
      const sideSign = kind === "seat" ? (elbow.clone().sub(pos).applyQuaternion(quat.clone().invert()).x >= 0 ? 1 : -1) : 1;
      // (solved once, with the hand alone at the origin; the arms put back where they were)
      const Fin = elbow.clone().sub(pos).applyQuaternion(quat.clone().invert()).normalize();
      const G = solveGrip(S, kind, sideSign, Fin);
      if (kind === "crank" || kind === "ropeg" || free) {
        // the knob turns freely in the fingers, so the hand is free to turn round it: each frame it's turned about the
        // knob's axis so the back of the hand lines up with the forearm (where the elbow is now). That is what keeps the
        // wrist straight all the way round, rather than the one grip carried round the circle at a fixed angle
        // (a rope through the fist turns the same way, about its own length)
        const ax = free === "z" ? "z" : "x";
        const bk = S.M.y.clone().normalize().applyQuaternion(G.Qh).negate(); bk[ax] = 0; const fe = Fin.clone(); fe[ax] = 0;
        if (bk.lengthSq() > 1e-6 && fe.lengthSq() > 1e-6) { bk.normalize(); fe.normalize(); const want = Math.atan2(bk.clone().cross(fe)[ax], bk.dot(fe)) * (TUNE.crankFollow ?? 0.85);
          const R0 = S.crankRoll ?? want; let d = want - R0; d = Math.atan2(Math.sin(d), Math.cos(d)); S.crankRoll = R0 + d * Math.min(1, dt * 14); roll = S.crankRoll + roll * (TUNE.crankRollExtra ?? 0); }
      }
      const sq = gq.clone().multiply(quat); if (roll) sq.multiply(new THREE.Quaternion().setFromAxisAngle(free === "z" ? V(0, 0, 1) : V(1, 0, 0), roll));
      const sp = group.localToWorld(pos.clone());
      let Pw = sp.clone().add(G.Ph.clone().applyQuaternion(sq)), Qw = sq.clone().multiply(G.Qh);
      let f = G.f, t = G.t;
      // easing in from wherever the hand was (a change of grip), never a jump
      const B = blend[i];
      if (B && B.kind !== kind) { B.from = { P: B.P.clone(), Q: B.Q.clone(), f: B.f, t: B.t }; B.u = 0; B.kind = kind; }
      if (B?.from) {
        B.u = Math.min(1, B.u + dt / 0.3); const e = ease(B.u);
        Pw = B.from.P.clone().lerp(Pw, e); Qw = B.from.Q.clone().slerp(Qw, e);
        f = f.map((r, a) => r.map((v, k) => B.from.f[a][k] + (v - B.from.f[a][k]) * e)); t = t.map((v, k) => B.from.t[k] + (v - B.from.t[k]) * e);
        if (B.u >= 1) B.from = null;
      }
      // the forearm: straight back from the wrist, turned towards where the arm comes from by no more than a wrist can bend
      const back = S.M.y.clone().applyQuaternion(Qw).negate(), toEl = group.localToWorld(elbow.clone()).sub(Pw).normalize();
      const ang = back.angleTo(toEl), lim = TUNE.wristLim;
      const dir = ang > lim ? back.clone().lerp(toEl, lim / ang).normalize() : toEl;
      const Ew = Pw.clone().addScaledVector(dir, S.len);
      place2(S, Pw, Ew, Qw);
      S.fingers.forEach((ch, a) => ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, f[a][k]))));
      S.thumb.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, t[k])));
      root.updateMatrixWorld(true);
      if (typeof window !== "undefined" && window.__fdShowSock) {
        // (film only: what the grip was worked out round, drawn where it is, to check it against the real knob and handle)
        S.dbg ||= (() => { const g = kind === "seat" ? new THREE.CylinderGeometry(GRIP.rodR, GRIP.rodR, 0.3, 16).rotateX(Math.PI / 2) : new THREE.CylinderGeometry(GRIP.knobR, GRIP.knobR, GRIP.knobLen, 16).rotateZ(Math.PI / 2); const mm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2020, wireframe: true })); group.parent?.parent?.add?.(mm); return mm; })();
        S.dbg.position.copy(sp); S.dbg.quaternion.copy(sq); S.dbg.updateMatrixWorld(true);
      }
      if (typeof window !== "undefined" && window.__fdFilm) {
        const ix = S.fingers[0], md = S.fingers[1], hk = wp(ix[0].b).lerp(wp(ix[1].b), 0.5).lerp(wp(md[0].b).lerp(wp(md[1].b), 0.5), 0.5);
        (window.__fdSock ||= {})[i] = { kind, sock: sp.toArray().map((v) => +v.toFixed(3)), hook: hk.toArray().map((v) => +v.toFixed(3)), d: +hk.distanceTo(sp).toFixed(3), tips: [0, 1].map((a) => { const c = S.fingers[a][2]; return +wp(c.b).add(V(0, 1, 0).applyQuaternion(wq(c.b)).multiplyScalar(c.len)).distanceTo(sp).toFixed(3); }) };
      }
      blend[i] = { ...(B || {}), kind, P: Pw.clone(), Q: Qw.clone(), f, t, from: B?.from || null, u: B?.u ?? 1 };
      return { wrist: group.worldToLocal(Pw.clone()), elbow: group.worldToLocal(Ew.clone()) };
    },
    /** (after any other pose: what the hand's doing now, for the next grip to ease from) */
    note(i, kind) {
      const S = sides[i]; const f = S.fingers.map((ch) => ch.map((j) => 2 * Math.acos(clamp(Math.abs(j.rest.clone().invert().multiply(j.b.quaternion).w), 0, 1))));
      const t = S.thumb.map((j) => 2 * Math.acos(clamp(Math.abs(j.rest.clone().invert().multiply(j.b.quaternion).w), 0, 1)));
      blend[i] = { kind, P: wp(S.hand), Q: wq(S.hand), f, t, from: null, u: 1 };
    },
    /** where the sleeve covers the forearm from: the wrist and the way along the forearm to the hand (world) */
    cuff(i, wristW, dirW) { CUT.uFdW.value[i].copy(wristW); CUT.uFdDir.value[i].copy(dirW); },
    /** hand i at `pos` with frame `quat` (the group's space), its fingers curled as `curl`, the elbow towards `elbow`;
     *  hold: { at, axis, R, kind, stem, w } (the group's space): what it closes round, w how far it has taken hold */
    pose(i, group, pos, quat, curl, elbow, hold) {
      const S = sides[i]; group.updateWorldMatrix(true, false); group.getWorldQuaternion(gq);
      const Pw = group.localToWorld(pos.clone()), Ew = group.localToWorld(elbow.clone()), Qw = gq.clone().multiply(quat);
      const fs = curl?.f || [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], ts = curl?.t || [0, 0, 0];
      const rest = () => { S.fingers.forEach((ch) => ch.forEach((j) => j.b.quaternion.copy(j.rest))); S.thumb.forEach((j) => j.b.quaternion.copy(j.rest)); };
      let A = null, D = null;
      if (hold?.axis && hold.R) {
        A = group.localToWorld(hold.at.clone()); D = hold.axis.clone().applyQuaternion(gq).normalize();
        if (hold.kind === "seat") {
          // the palm flat against the side of the handle (its surface a handle's radius from the line through it), and
          // the gap between the middle and ring fingers where the reel's stem comes down
          rest(); place(S, Pw, Ew, Qw);
          const Zw = palmDir(S);
          const palmPt = wp(S.hand).lerp(wp(S.mid), 0.62).addScaledVector(Zw, -0.006);
          const C = A.clone().addScaledVector(D, palmPt.clone().sub(A).dot(D)), Zp = Zw.clone().addScaledVector(D, -Zw.dot(D)).normalize();
          const shift = C.addScaledVector(Zp, -(hold.R + 0.004)).sub(palmPt);
          if (hold.stem) { const S0 = group.localToWorld(hold.stem.clone()), gap = wp(S.mid).lerp(wp(S.ring), 0.5).add(shift); shift.addScaledVector(D, S0.sub(gap).dot(D)); }
          Pw.addScaledVector(shift, hold.w ?? 1);
        } else if (hold.kind === "crank") {
          // the knob in the hook of the index and middle fingers, in front of their first joints, for the thumb to
          // close on from the other side
          rest(); place(S, Pw, Ew, Qw);
          const Zw = palmDir(S);
          const ix = S.fingers[0], md = S.fingers[1], g = wp(ix[0].b).lerp(wp(md[0].b), 0.5).lerp(wp(ix[1].b).lerp(wp(md[1].b), 0.5), 0.85).addScaledVector(Zw, hold.R + 0.03); // (out under the first joints, deep in the hook of the fingers: nearer the knuckles, the fingers met it almost straight and lay flat over the reel)
          Pw.addScaledVector(A.clone().sub(g), hold.w ?? 1);
        }
      }
      rest(); place(S, Pw, Ew, Qw);
      const w = A ? clamp(hold.w ?? 1, 0, 1) : 0, wrapF = hold?.kind === "crank" ? [1, 1, 0, 0] : [1, 1, 1, 1];
      S.fingers.forEach((ch, a) => {
        const got = w > 0 && wrapF[a] ? wrap(ch, A, D, hold.R, 0.0085, null, false, fs[a], hold.kind === "crank" ? GRIP.knobLen : 0) : null;
        ch.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, got ? fs[a][k] + (got[k] - fs[a][k]) * w : fs[a][k])));
      });
      root.updateMatrixWorld(true);
      // the thumb: along the top of the handle (or round the knob), resting on it
      const tg = w > 0 ? wrap(S.thumb, A, D, hold.R, 0.0095, null, hold.kind === "crank", null, hold.kind === "crank" ? GRIP.knobLen : 0) : null;
      S.thumb.forEach((j, k) => j.b.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.axis, tg ? ts[k] * 0.8 + (tg[k] - ts[k] * 0.8) * w : ts[k] * 0.8)));
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
// ---- the sleeve and its cuff (y down the arm from the cuff's edge at 0, the sleeve's axis) ----
function sleeveGeo(seed) {
  const pts = []; for (let k = 0; k <= 24; k++) { const y = -0.04 - (k / 24) * 0.5; pts.push(new THREE.Vector2(0.05 + 0.017 * Math.pow(k / 24, 0.7), y)); }
  const g = new THREE.LatheGeometry(pts, 40), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    // folds: rings gathered above the cuff, fading up the arm, broken up round it; flatter front to back, as an arm is
    const u = clamp((-y - 0.04) / 0.22, 0, 1), fold = (1 - u) * (0.0032 * Math.sin(y * 150 + Math.sin(a * 3 + seed) * 1.6) + 0.0018 * Math.sin(a * 5 + y * 60 + seed * 2));
    const rr = r + fold + 0.0012 * Math.sin(a * 7 + y * 23 + seed);
    p.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr * 0.92);
  }
  g.computeVertexNormals(); return g;
}
function cuffGeo() {
  // the rib: a band of fine ridges round the wrist, its edge rolled
  const pts = [new THREE.Vector2(0.038, 0.002), new THREE.Vector2(0.0435, 0.004), new THREE.Vector2(0.046, 0.0)];
  for (let k = 1; k <= 12; k++) pts.push(new THREE.Vector2(0.046 + 0.0006 * Math.sin(k * 2.2), -k * 0.0042));
  pts.push(new THREE.Vector2(0.051, -0.052));
  const g = new THREE.LatheGeometry(pts, 48), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z) + 0.0007 * Math.cos(a * 36); p.setXYZ(i, Math.cos(a) * r, p.getY(i), Math.sin(a) * r * 0.92); }
  g.computeVertexNormals(); return g;
}

export function createFpHands({ gloves = false, skinHex = 0xc99a74, coatHex = 0x2b3a4f } = {}) {
  const group = new THREE.Group(); group.name = "fp-hands"; group.visible = false;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: gloves ? 0.55 : 0.6, metalness: 0 });
  // the jacket's sleeve: a woven softshell (seen from inside too, so its open end never shows a hole) and a ribbed cuff
  const D0 = detailMaps();
  const sleeveMat = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.8, side: THREE.DoubleSide, normalMap: D0?.cloth.normal || null, roughnessMap: D0?.cloth.rough || null, normalScale: new THREE.Vector2(0.6, 0.6) });
  if (D0) { D0.cloth.normal.repeat.set(10, 18); D0.cloth.rough.repeat.set(10, 18); }
  const hemMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(coatHex).multiplyScalar(0.62), roughness: 0.9, side: THREE.DoubleSide, normalMap: D0?.cloth.normal || null, normalScale: new THREE.Vector2(0.8, 0.8) });
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
    // (one piece of cloth: the cuff's rolled edge, the elastic rib, then the sleeve, a little looser up the arm, with the
    // soft folds a sleeve gathers into above the cuff)
    const tube = new THREE.Mesh(sleeveGeo(i), sleeveMat);
    const cuff = new THREE.Mesh(cuffGeo(), hemMat);
    sleeve.add(tube, cuff);
    group.add(mesh, sleeve);
    return { mesh, sleeve, bones: b.bones, joints: b.joints, s: i ? 1 : -1, cur: null, from: null, u: 1, kind: undefined, curl: GRIPS.rest };
  });

  // ---- the real hands: forearms and hands cut from a MakeHuman (MPFB, CC0) person in Blender (public/models/
  // fp_arms.glb): real fingers, knuckles and skin, on their own skeleton. Placed by the same frames as above (so they
  // can't drift or flip any more than the simple hands could), the forearm laid from the elbow to the wrist and turned
  // with the hand (no twisting), each finger curled about its own joint. Until they've loaded, the simple hands show
  let real = null;
  // the modelled arms (fp_arms.glb): the simple drawn hands stay hidden while they load (they looked like stiff blocks
  // for the first moments), and only show if the model can't load or takes too long
  for (const h of hands) h.mesh.visible = false;
  const fallback = () => { if (!real) for (const h of hands) h.mesh.visible = true; };
  const slow = setTimeout(fallback, 8000);
  loadPart("fp_arms").then((sc) => { try { real = realArms(sc, { gloves, skinHex }); } catch (e) { real = null; if (typeof console !== "undefined") console.warn("fp arms:", e?.message || e); } clearTimeout(slow); if (real) { group.add(real.root); for (const h of hands) h.mesh.visible = false; } else fallback(); }).catch(() => { clearTimeout(slow); fallback(); });

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
      if (CRANK.roll) { Y.applyAxisAngle(ax, CRANK.roll * h.s); Z.applyAxisAngle(ax, CRANK.roll * h.s); }
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
        // (winding: the elbow and forearm go a little way round with the knob, the wrist turning for the rest, rather
        // than the hand going round on the end of a still arm)
        if (spec?.kind === "crank" && spec.hub) elbow.addScaledVector(tmpV.copy(spec.at).sub(spec.hub), CRANK.follow);
        // (the arm comes in to the reel seat from behind and out to the side at about 45 degrees, as it does holding a spinning
        // rod: the handle lies diagonally across the palm, the butt along the forearm further back)
        // (on the drop net's rope the forearms reach forwards to it, nearly level, elbows back by your sides: not up
        // from below, which bent the wrists right back to close the fist round a rope running the same way as the arm)
        if (spec?.kind === "rope") elbow.copy(spec.at).add(V(h.s > 0 ? 0.12 : -0.04, -0.06, 0.3)); // (above the rail, so the forearm comes over it, not through it)
        if (spec?.kind === "seat" && spec.axis) elbow.copy(spec.at).addScaledVector(spec.axis.clone().normalize(), -0.24).addScaledVector(vu, -0.14).addScaledVector(vr, (TUNE_ELBOW.seatOut ?? 0.24) * h.s);
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
        // (winding, the grip's firm; the handle still a moment, the fingers ease a little on the knob, and firm again as
        // it turns: never a jump, as it follows the handle's own speed)
        if (want.kind === "crank" && spec?.spin != null) {
          const turning = h.spinWas != null && Math.abs(spec.spin - h.spinWas) > dt * 0.8 ? 1 : 0;
          h.firm = (h.firm ?? 1) + (turning - (h.firm ?? 1)) * Math.min(1, dt * (turning ? 12 : 2.5));
          const k = 1 - CRANK.ease * (1 - h.firm);
          curl.f = curl.f.map((row) => row.map((v) => v * k)); curl.t = curl.t.map((v) => v * (0.5 + 0.5 * k));
        }
        h.spinWas = spec?.spin ?? null;
        h.curlNow = curl;
        h.joints.forEach((chain, a) => chain.forEach((bn, b) => {
          if (a < 4) bn.rotation.set(curl.f[a][b], 0, (b === 0 ? (a - 1.5) * -curl.spread : 0) * h.s);
          else if (b === 0) bn.rotation.set(0.35 + curl.t[0] * 0.6, curl.t[0] * 0.5 * h.s, (-0.75 + curl.t[0] * 0.55) * h.s); else bn.rotation.set(curl.t[b], 0, 0);
        }));
        // the sleeve: from the wrist back towards the elbow
        // (along the forearm, from a little way up it: the hand's own axis can be bent at the wrist, which stood the
        // sleeve off to one side of the arm)
        let wr = pos, el = elbow;
        if (real && spec?.sock && (spec.kind === "seat" || spec.kind === "crank" || spec.kind === "rope")) {
          // held by a grip on the equipment itself (realArms.poseSocket): on the knob, the wrist rolls a little as the handle
          // goes round (the knob turns in the fingers; the hand doesn't go round with it), and the forearm follows
          const roll = spec.kind === "crank" ? 0.32 * Math.sin((spec.spin || 0) + 0.6) : 0;
          const r = real.poseSocket(i, group, { pos: spec.sock.pos, quat: spec.sock.quat, kind: spec.kind === "rope" ? "ropeg" : spec.kind, roll: spec.kind === "rope" ? 0 : roll, elbow, dt }); // (a rope is held as the knob is: across the fingers, closed further round it)
          wr = r.wrist; el = r.elbow; h.cur = { pos: wr.clone(), quat };
        } else if (real) {
          real.pose(i, group, pos, quat, curl, elbow, spec && spec.kind === "butt" && spec.axis ? { at: spec.at, axis: spec.axis, kind: spec.kind, R: 0.0145, w: e } : null);
          real.note(i, spec?.kind ?? null);
        }
        const back = el.clone().sub(wr).normalize(), wrist = wr.clone().addScaledVector(back, 0.035);
        h.sleeve.position.copy(wrist); h.sleeve.quaternion.setFromUnitVectors(V(0, -1, 0), back);
      }
    },
    /** where each hand is (the wrist, in the group's space), for tests */
    get wrists() { return hands.map((h) => (h.cur ? h.cur.pos.clone() : null)); },
    dispose() { built.geo.dispose(); geoL.dispose(); mat.dispose(); sleeveMat.dispose(); hemMat.dispose(); for (const h of hands) h.sleeve.traverse((o) => o.geometry?.dispose?.()); },
  };
}
