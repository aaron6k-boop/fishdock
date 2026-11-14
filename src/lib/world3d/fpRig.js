// ---- fpRig: your own arms and hands in first person, rigged and animated in Blender ----
// The character (public/models/fp_rig.glb) is the Blender Studio realistic male (CC0) with a Rigify rig, its jacket made
// from the body, exported with its deform skeleton and four clips: the hold (Gate 1), one turn of the reel (Gate 2), the
// cast (Gate 3) and the fingers of every grip (source-assets/blender/rig/, docs/CHARACTER-REBUILD.md). The numbers that
// go with it (where each hand holds the reel seat, the knob all the way round a turn, every handle-sized grip, the eye)
// are in fpRigData.js, made from the Blender output by tools/fp-rig-data.mjs.
// Each frame, in one pipeline:
//   1. the base clip: the hold, or the cast's body turn at the cast's moment, or the reel's shoulder at the handle's angle
//   2. the body under the camera: the eye at the camera, turning with the view (as a first-person game's arms do), level
//      when you look down by p0 (set for the field of view: setRigView)
//   3. a contact target for each hand from what it holds: the reel seat and the knob by the grips solved in Blender; a
//      rope, the net's ring or pole, the rod's butt, a fish's tail by the cylinder grips, turned about the handle for
//      the most comfortable wrist (the same measure as the gates)
//   4. two-bone IK from each shoulder (never stretched: out of reach, the shoulder comes forward a little and the hand
//      stops short rather than the arm getting longer), the forearm's twist shared with its lower half
//   5. the fingers set to the grip's own pose
// The same interface as the drawn hands it replaces (fpHands.js): { group, show(on), pose(o), wrists, dispose() }.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadModel } from "./glbParts.js";
import { RIG } from "./fpRigData.js";
import { clothe } from "./fabric.js";
import { twoBone, wristAngles, limitsPen, pairRotation, twistAbout } from "./fpIk.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const A3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Q4 = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** the name three gives a Blender bone (GLTFLoader drops dots and the like) */
export const boneName = (s) => s.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
const BLEND = 0.3; // seconds to go from one grip to the next
const TURN_MAX = 6, POLE_MAX = 5; // (radians a second: how quickly an elbow can swing round to a new turn, or a new way of pointing; in a cast, which is quick by nature, the turn twelve, and the pointing eight as it starts and quicker as it goes)
const KIND_CYL = { rope: "rope", hoop: "hoop", pole: "pole", butt: "butt", tailwrist: "tail", carry: "butt" };
const KIND_FLAT = { fish: "cradle", open: "relax", ready: "relax", line: "relax" };

/** the rod's frame (x left of it, y up from it, z to the tip) for a rod pointing along the unit vector t: squared to the
 * world's up; or, in your own hands (rest: the rod's direction in the hold), turned from the hold as one rigid thing the
 * shortest way, so that through a cast the reel stays on the same side of the rod as the hand holding it (under the rod
 * held forwards, on top of it back over your shoulder) rather than rolling half a turn as the rod passes upright */
export function rodFrame(t, rest = null, upRef = null) {
  const up0 = (d, u0) => { const up = (u0 ? u0.clone() : new THREE.Vector3(0, 1, 0)).addScaledVector(d, -d.dot(u0 || new THREE.Vector3(0, 1, 0))); if (up.lengthSq() < 1e-4) up.set(1, 0, 0); up.normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, d), up, d)); };
  return rest && t.dot(rest) > -0.95 ? new THREE.Quaternion().setFromUnitVectors(rest, t).multiply(up0(rest, upRef)) : up0(t);
}
/** your body's up in the view (vf, vu: the view's forward and up): the up the hold's rod is squared to, so the reel
 * hangs the same way in your hands whether you look up or down */
export const bodyUp = (vf, vu) => vf.clone().multiplyScalar(Math.sin(P0)).addScaledVector(vu, Math.cos(P0)).normalize();

// ---- framing: the arms turn with the view, so where they sit in the picture is set by the view's pitch at which the
// body is level (p0). It's chosen for the picture's height: the held reel half way from the middle to the bottom edge,
// so on a wide screen (62 degrees top to bottom) the knob hand is in frame and on an upright phone (79) it sits low ----
const FRAME_AT = 0.5;
export const framingP0 = (vfovDeg) => -((RIG.reelBelow - (FRAME_AT * vfovDeg) / 2) * Math.PI) / 180;
let P0 = framingP0(62);
/** the game's first-person field of view top to bottom (degrees), for the framing (world.js, each frame) */
export function setRigView(vfovDeg) { if (vfovDeg > 10 && vfovDeg < 120) P0 = framingP0(vfovDeg); }
export const rigP0 = () => P0;
/** a place and angle from the eye, level (RIG.holdBody, the cast's path), in the view's frame at p0 as angler.js uses
 * them: x right, y up, z along the view (metres), e the angle up from the view's line and sw round to the right
 * (radians), written the way round that turns less than a quarter turn (the keys are mixed in straight lines) */
export function toView(k, p0 = P0) {
  const c = Math.cos(p0), s = Math.sin(p0), vy = k.y * c - k.z * s, vz = k.y * s + k.z * c;
  const d = [Math.cos(k.e) * Math.sin(k.sw), Math.sin(k.e), Math.cos(k.e) * Math.cos(k.sw)], du = d[1] * c - d[2] * s, df = d[1] * s + d[2] * c;
  const e1 = Math.asin(clamp(du, -1, 1)), sw1 = Math.atan2(d[0], df);
  return Math.abs(sw1) <= Math.PI / 2 ? { x: k.x, y: vy, z: vz, e: e1, sw: sw1 } : { x: k.x, y: vy, z: vz, e: Math.PI - e1, sw: Math.atan2(-d[0], -df) };
}
/** the hold in the view's frame now */
export const holdView = () => toView(RIG.holdBody);

/** where the reel is held and the rod's angle at a moment of the cast (seconds), in the view's frame as angler.js
 * places it: a smooth curve through Gate 3's moments, still at the hold, at the top of the wind-up and through the
 * follow-through. k0: the hold it starts from and goes back to (the game's own, holdView() unless a film sets another) */
export function castAt(t, k0 = holdView()) {
  const path = RIG.cast.path, n = path.length, T = path.map((k) => k.t), P = path.map((k, i) => (i === 0 || i === n - 1 ? k0 : toView(k))), still = new Set(RIG.cast.still);
  t = clamp(t, 0, T[n - 1]); let i = 0; while (i < n - 2 && t > T[i + 1]) i++;
  const tan = (k, c) => (still.has(k) ? 0 : (P[k + 1][c] - P[k - 1][c]) / (T[k + 1] - T[k - 1]));
  const h = T[i + 1] - T[i], u = (t - T[i]) / h, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  const out = {}; for (const c of ["x", "y", "z", "e", "sw"]) out[c] = h00 * P[i][c] + h10 * h * tan(i, c) + h01 * P[i + 1][c] + h11 * h * tan(i + 1, c);
  return out;
}

let DIM = 1; const liveMats = new Set();
/** the arms in the dark: the colours scaled down at night unless a torch is on (world.js) */
export function setHandsDim(k) { DIM = clamp(k, 0.2, 1); for (const m of liveMats) m.color.copy(m.userData.base).multiplyScalar(DIM); }

/** a clip's tracks bound to the cloned skeleton's bones, to be sampled at any moment (Blender's frame n is at n / fps
 * seconds: the first frame of each clip, frame 1, at 1 / fps) */
function sampler(clip, bones) {
  const ch = [];
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf("."), b = bones.get(tr.name.slice(0, dot)), prop = tr.name.slice(dot + 1);
    if (!b || !(prop === "quaternion" || prop === "position" || prop === "scale")) continue;
    ch.push({ b, prop, it: tr.createInterpolant() });
  }
  return {
    duration: clip.duration,
    apply(t, only) { for (const c of ch) { if (only && !only(c.b.name)) continue; const v = c.it.evaluate(clamp(t, 0, clip.duration)); c.b[c.prop].fromArray(v); } },
    value(t, name, prop = "quaternion") { const c = ch.find((x) => x.b.name === name && x.prop === prop); return c ? Array.from(c.it.evaluate(t)) : null; },
  };
}

// ---- skin: light going into it, and a little life in its colour ----
// Skin isn't a painted surface: light goes in and comes out a few millimetres on, reddened by the blood under it, so
// the edge of a shadow across a hand is soft and warm, not a hard grey line. And no hand is one even colour: it's a
// touch redder and paler in patches. Without either, the hands read as a pale plastic model in Aaron's 14 November
// recording, at dusk most of all. The scatter goes into the diffuse light only (a glow, not a shine); the patches are
// worked out from where each point is on the hand itself, so they move with the fingers and never swim.
const SKIN_BLEED = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );";
const SKIN_NOISE = `varying vec3 vSkinP;
float fpSkinHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float fpSkinNoise( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( fpSkinHash( i ), fpSkinHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( fpSkinHash( i + vec3( 0, 1, 0 ) ), fpSkinHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( fpSkinHash( i + vec3( 0, 0, 1 ) ), fpSkinHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( fpSkinHash( i + vec3( 0, 1, 1 ) ), fpSkinHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;
export function skinShade(sh) {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSkinP;").replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvSkinP = transformed;");
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(SKIN_BLEED)) return; // (a three.js whose lighting is written differently: plain skin, as before)
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", `#include <common>\n${SKIN_NOISE}`)
    // (the light that wraps round past the shadow's edge, a third of the way into the dark side, warm)
    .replace("#include <lights_physical_pars_fragment>", chunk.replace(SKIN_BLEED, `${SKIN_BLEED}\n\t{ float fpW = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 ); reflectedLight.directDiffuse += max( fpW - dotNL, 0.0 ) * directLight.color * vec3( 0.9, 0.26, 0.15 ) * BRDF_Lambert( material.diffuseColor ); }`))
    // (patches 3 to 10 cm across, a few per cent redder or paler; the knuckles' and palms' sheen varies with them)
    .replace("#include <color_fragment>", "#include <color_fragment>\n{ float fpN = fpSkinNoise( vSkinP * 11.0 ) * 0.6 + fpSkinNoise( vSkinP * 34.0 ) * 0.4; diffuseColor.rgb *= mix( vec3( 1.04, 0.96, 0.95 ), vec3( 0.97, 1.02, 1.03 ), fpN ); }")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + ( fpSkinNoise( vSkinP * 34.0 + 7.0 ) - 0.5 ) * 0.14, 0.3, 1.0 );");
}

// ---- the jacket's lining left out ----
// The jacket is a thickened cloth: an outer layer and, a centimetre or two inside it, a lining facing inwards. Seen from
// outside the lining is hidden, but where the cut near your eye opens a sleeve you look straight down the tube at it: the
// dark ring or flap round your forearm hauling the drop net or lowering a fish back (14 November, Aaron's screenshots;
// leaving out the inside faces of the outer layer didn't touch it, as the lining faces you). So the lining's triangles
// are dropped when the rig is built: a vertex is the lining's if, of it and its partner in the other layer, it's the one nearer
// the bone it hangs from (in the pose the model was made in), the odd misjudged one put right by its neighbours,
// and a triangle goes if two of its corners are the lining's. Through the opening you then see your
// forearm, or nothing, as with an arm cut by the edge of the picture. If the count dropped isn't about half (a model
// made differently), the jacket is left whole.
export function dropLining(mesh) {
  const g = mesh.geometry, pos = g?.attributes?.position, nor = g?.attributes?.normal, si = g?.attributes?.skinIndex, sw = g?.attributes?.skinWeight, idx = g?.index, sk = mesh.skeleton;
  if (!pos || !nor || !si || !sw || !idx || !sk) return 0;
  const bones = sk.bones, heads = bones.map((b, i) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()));
  const tails = bones.map((b, i) => { const c = b.children.find((x) => x.isBone && bones.includes(x)); if (c) return heads[bones.indexOf(c)]; const pi = bones.indexOf(b.parent); return pi >= 0 ? heads[i].clone().add(heads[i].clone().sub(heads[pi]).multiplyScalar(0.5)) : heads[i]; });
  const bm = mesh.bindMatrix, nm = new THREE.Matrix3().getNormalMatrix(bm), N = pos.count;
  const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), bone = new Int32Array(N), v = new THREE.Vector3(), seg = new THREE.Line3(), c = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    let j = 0, w = -1; for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); if (wk > w) { w = wk; j = si.getComponent(i, k); } }
    bone[i] = j; v.fromBufferAttribute(pos, i).applyMatrix4(bm); v.toArray(P, i * 3); v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); v.toArray(Nn, i * 3);
  }
  const axisDist = (i, j) => { v.fromArray(P, i * 3); seg.set(heads[j], tails[j]).closestPointToPoint(v, true, c); return v.distanceTo(c); };
  // (each vertex's partner in the other layer: the nearest facing the other way, within 2.5 cm; of the two, the one
  // nearer the bone is the lining. With no partner, its normal decides: the lining's points in towards the bone)
  const S = 0.025, grid = new Map(), key = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  for (let i = 0; i < N; i++) { const k = key(Math.floor(P[i * 3] / S), Math.floor(P[i * 3 + 1] / S), Math.floor(P[i * 3 + 2] / S)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
  const inner = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const gx = Math.floor(P[i * 3] / S), gy = Math.floor(P[i * 3 + 1] / S), gz = Math.floor(P[i * 3 + 2] / S);
    let best = -1, bd = S * S;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const k of grid.get(key(gx + dx, gy + dy, gz + dz)) || []) {
      if (Nn[i * 3] * Nn[k * 3] + Nn[i * 3 + 1] * Nn[k * 3 + 1] + Nn[i * 3 + 2] * Nn[k * 3 + 2] > -0.6) continue;
      const d = (P[i * 3] - P[k * 3]) ** 2 + (P[i * 3 + 1] - P[k * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[k * 3 + 2]) ** 2; if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) inner[i] = axisDist(i, bone[i]) < axisDist(best, bone[i]) ? 1 : 0;
    else { v.fromArray(P, i * 3); seg.set(heads[bone[i]], tails[bone[i]]).closestPointToPoint(v, true, c); inner[i] = (Nn[i * 3] * (v.x - c.x) + Nn[i * 3 + 1] * (v.y - c.y) + Nn[i * 3 + 2] * (v.z - c.z)) < 0 ? 1 : 0; }
  }
  const src = idx.array, keep = [];
  // (a few vertices are misjudged, at folds and joints: each takes the side most of its neighbours are on, three times
  // over, so no stray triangle of the lining stays and no hole opens in the outer layer to see the sky through)
  const nb = Array.from({ length: N }, () => []);
  for (let t = 0; t < src.length; t += 3) for (let a = 0; a < 3; a++) { const i = src[t + a]; nb[i].push(src[t + (a + 1) % 3], src[t + (a + 2) % 3]); }
  for (let it = 0; it < 3; it++) { const was = inner.slice(); for (let i = 0; i < N; i++) { const l = nb[i]; if (!l.length) continue; let sum = was[i]; for (const k of l) sum += was[k]; inner[i] = sum * 2 > l.length + 1 ? 1 : 0; } }
  for (let t = 0; t < src.length; t += 3) if (inner[src[t]] + inner[src[t + 1]] + inner[src[t + 2]] < 2) keep.push(src[t], src[t + 1], src[t + 2]);
  const dropped = 1 - keep.length / src.length;
  if (dropped < 0.25 || dropped > 0.65) return 0; // (not a lined cloth as expected: left whole)
  mesh.geometry = g.clone(); mesh.geometry.setIndex(keep);
  return dropped;
}

export function createFpRig({ gloves = false, skinHex = 0xc99a74, coatHex = 0x2b3a4f, model = null } = {}) {
  const group = new THREE.Group(); group.name = "fp-rig"; group.visible = false;
  const root = new THREE.Group(); root.name = "fp-rig-root"; group.add(root);
  const skinMat = new THREE.MeshStandardMaterial({ color: gloves ? 0x2b2e34 : skinHex, roughness: gloves ? 0.72 : 0.55, metalness: 0 });
  // (the coat: an outdoor jacket's ripstop nylon, its weave and creases and the soft sheen cloth has at a glancing
  // angle, fabric.js. Until 13 November it was one flat colour: "just some blue", Aaron said)
  // (a soft sheen, kept to the coat's own colour: at 0.55 and a third of the way to white, the forearms seen along
  // their length, holding a fish out or letting it go, caught the dusk sky's pink and went magenta in Aaron's 14
  // November recording)
  const coatMat = new THREE.MeshPhysicalMaterial({ color: coatHex, roughness: 0.8, metalness: 0, sheen: 0.22, sheenRoughness: 0.8, sheenColor: new THREE.Color(coatHex).lerp(new THREE.Color(0xffffff), 0.12) });
  // (cloth right at your eye isn't drawn: the collar and the shoulders sit around the camera)
  // (and further off when you look down past your arms at a net or the deck below the rail: from above, the sleeves
  // between your shoulders and elbows are right under your eye, and filled half the picture in the 13 November
  // recording, hauling the drop net and putting the cod back. Your forearms and hands still show)
  const nearCut = { value: 0.16 };
  // (and near your eye the inside of a sleeve is never drawn: where the cut opens a sleeve, its lining showed as a
  // ring or a dark flap round your forearm, hauling or lowering the drop net looking down over the rail (Aaron's
  // screenshots of 14 November, putting a thornback ray back). Without it you see your forearm inside, or the cut
  // sleeve simply ends, as an arm cut by the edge of the picture does. Further off, a cuff's inside still shows)
  coatMat.onBeforeCompile = (sh) => { sh.uniforms.fpNearCut = nearCut; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float fpNearCut;").replace("#include <opaque_fragment>", "if (length(vViewPosition) < fpNearCut || (!gl_FrontFacing && length(vViewPosition) < fpNearCut + 0.18)) discard;\n#include <opaque_fragment>"); };
  clothe(coatMat);
  // (and a hand or forearm right against the lens isn't drawn either: seen from inside, it showed as a flat pale shape)
  skinMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", "if (length(vViewPosition) < .07) discard;\n#include <opaque_fragment>");
    if (!gloves) skinShade(sh);
  };
  skinMat.customProgramCacheKey = () => (gloves ? "fp-gloves" : "fp-skin");
  for (const m of [skinMat, coatMat]) { m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(DIM); liveMats.add(m); }
  let R = null, failed = false;
  const hands = [0, 1].map((i) => ({ side: i ? "R" : "L", kind: undefined, cur: null, from: null, u: 1, want: null, fing: null, fingFrom: null, cyl: null, wrist: null }));

  // (model: the loaded fp_rig.glb handed in, as the tests do; otherwise it's fetched)
  if (model) { R = build(model); root.add(R.scene); }
  else loadModel("fp_rig").then((g) => { R = build(g); root.add(R.scene); }).catch((e) => { failed = true; if (typeof console !== "undefined") console.warn("fp rig:", e?.message || e); });

  function build(g) {
    const scene = cloneSkinned(g.scene); const bones = new Map();
    scene.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (o.isMesh) { const jacket = /jacket/i.test(o.name) || /jacket/i.test(o.material?.name || ""); o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.material = jacket ? coatMat : skinMat; if (jacket && o.isSkinnedMesh) dropLining(o); }
    });
    const B = (n) => bones.get(boneName(n));
    const clips = {}; for (const c of g.animations) clips[c.name] = sampler(c, bones);
    const rest = new Map(); for (const [n, b] of bones) rest.set(n, { q: b.quaternion.clone(), p: b.position.clone() });
    // the grips' finger poses, read from the grips clip, one frame each
    const fingerBones = { L: [], R: [] };
    for (const [n] of bones) { const m = /^DEF-(f_\w+|thumb|palm)\d*(L|R)$/.exec(n); if (m) fingerBones[m[2]].push(n); }
    const grips = {};
    RIG.grips.forEach((name, k) => { grips[name] = { L: new Map(), R: new Map() }; for (const S of "LR") for (const n of fingerBones[S]) { const v = clips.grips?.value((k + 1) / RIG.fps, n); if (v) grips[name][S].set(n, new THREE.Quaternion().fromArray(v)); } });
    // the hold, as Blender left it: each arm's bones' lengths, which way its elbow bends and the forearm's twist at rest
    clips.hold.apply(1 / RIG.fps); scene.updateMatrixWorld(true);
    const wp = (b) => b.getWorldPosition(V()), wq = (b) => b.getWorldQuaternion(new THREE.Quaternion());
    const arm = {};
    for (const S of "LR") {
      const sh = B(`DEF-shoulder.${S}`), U = B(`DEF-upper_arm.${S}`), U1 = B(`DEF-upper_arm.${S}.001`), F = B(`DEF-forearm.${S}`), F1 = B(`DEF-forearm.${S}.001`), H = B(`DEF-hand.${S}`);
      const S0 = wp(U), E0 = wp(F), W0 = wp(H), n0 = E0.clone().sub(S0).cross(W0.clone().sub(E0)).normalize();
      const ax = W0.clone().sub(S0).normalize(), mid = S0.clone().addScaledVector(ax, E0.clone().sub(S0).dot(ax));
      const qU = wq(U).invert(), qF = wq(F).invert();
      arm[S] = { sh, U, U1, F, F1, H, L1: E0.distanceTo(S0), L2: W0.distanceTo(E0),
        aU: E0.clone().sub(S0).normalize().applyQuaternion(qU), nU: n0.clone().applyQuaternion(qU),
        aF: W0.clone().sub(E0).normalize().applyQuaternion(qF), nF: n0.clone().applyQuaternion(qF),
        pole: E0.clone().sub(mid).normalize(), // (in the model's own frame: down and out from the shoulder-to-hand line)
        f1q: F1.quaternion.clone(), f1ax: H.position.clone().normalize(), tw0: twistAbout(H.quaternion, H.position.clone().normalize()),
        shq: sh.quaternion.clone() };
    }
    // (the eye: where it is at the hold, carried in the head bone's own frame so it moves with the head)
    const head = B(RIG.eye.bone), eyeLocal = A3(RIG.eye.hold).applyMatrix4(head.matrixWorld.clone().invert());
    return { scene, bones, B, clips, rest, grips, arm, head, eyeLocal, fingerBones };
  }

  // ---- the hand's place on what it holds ----
  const loc = { L: null, R: null };
  for (const S of "LR") loc[S] = { k: A3(RIG.loc[S].k), palm: A3(RIG.loc[S].palm), along: A3(RIG.loc[S].along) };
  /** the hand bone's place and turn (world) holding the knob at the handle's angle: the grip from Gate 2's turn */
  function knobTarget(spec, Mg, qg) {
    const kq = spec.sock.quat.clone().premultiply(qg), kp = spec.sock.pos.clone().applyMatrix4(Mg);
    let th = 0;
    if (spec.hub) { const rel = spec.sock.pos.clone().sub(spec.hub).applyQuaternion(spec.sock.quat.clone().invert()); th = (Math.atan2(-rel.z, -rel.y) * 180 / Math.PI + 360) % 360; }
    const T = RIG.knob, n = T.length; let i = 0; while (i < n - 1 && T[i + 1].th <= th) i++;
    const a = T[i], b = T[(i + 1) % n], span = ((b.th - a.th) + 360) % 360 || 360, f = clamp((((th - a.th) + 360) % 360) / span, 0, 1);
    const p = A3(a.p).lerp(A3(b.p), f), q = Q4(a.q).slerp(Q4(b.q), f), e = A3(a.e).lerp(A3(b.e), f);
    return { pos: p.applyQuaternion(kq).add(kp), quat: kq.clone().multiply(q), elbow: e.applyQuaternion(kq).add(kp), grip: "hold", th };
  }
  function seatTarget(spec, Mg, qg) {
    const sq = spec.sock.quat.clone().premultiply(qg), sp = spec.sock.pos.clone().applyMatrix4(Mg);
    return { pos: A3(RIG.seat.p).applyQuaternion(sq).add(sp), quat: sq.clone().multiply(Q4(RIG.seat.q)), grip: "hold" };
  }
  /** a handle-shaped thing held round (or a flat hand laid on something): every way round the handle tried, the
   * one with the most comfortable wrist taken, staying with the last one unless another is clearly better */
  function wrapTarget(h, A, spec, Mg, qg, bodyQ) {
    const S = h.side, cylName = KIND_CYL[spec.kind], flat = !cylName;
    const g = flat ? null : RIG.cyl[cylName][S];
    const at = spec.at.clone().applyMatrix4(Mg), axis = (spec.axis ? spec.axis.clone() : V(0, 1, 0)).applyQuaternion(qg).normalize();
    const palm0 = (spec.palm ? spec.palm.clone() : V(0, -1, 0)).applyQuaternion(qg); palm0.addScaledVector(axis, -palm0.dot(axis));
    if (palm0.lengthSq() < 1e-6) palm0.set(0, -1, 0).addScaledVector(axis, -axis.y); palm0.normalize();
    const dH = flat ? loc[S].along.clone() : A3(g.d), pH = flat ? loc[S].palm.clone() : A3(g.pn), cH = flat ? A3(RIG.flat[S].c) : A3(g.c);
    // (each way of holding it judged with the elbow where it is now, turned as the arm last chose)
    const shW = A.U.getWorldPosition(V()), pole = A.pole.clone().applyQuaternion(bodyQ); if (h.turn) pole.applyAxisAngle(at.clone().sub(shW).normalize(), h.turn);
    let best = null;
    // (a rod's butt may be held anywhere along its first 25 cm: the hand goes as far up it as it needs to be reached)
    const slides = spec.kind === "butt" ? [0, 0.06, 0.12, 0.18, 0.25] : [0];
    for (const sl of slides) {
      const atS = at.clone().addScaledVector(axis, sl);
      for (const sg of [1, -1]) for (let k = -6; k <= 6; k++) {
        const phi = k * Math.PI / 6;
        const pw = flat ? palm0.clone() : palm0.clone().applyAxisAngle(axis, phi), aw = flat ? axis.clone().multiplyScalar(sg).applyAxisAngle(palm0, phi) : axis.clone().multiplyScalar(sg);
        const q = pairRotation(dH, pH, aw, pw), pos = atS.clone().sub(cH.clone().applyQuaternion(q));
        const ik = twoBone(shW, pos, A.L1, A.L2, pole);
        const w = wristAngles(shW, ik.elbow, ik.wrist, q, loc[S], S);
        const key = `${sg}|${k}|${sl}`;
        const c = limitsPen(w) * 4 + (Math.abs(w.flex) + Math.abs(w.rad)) * 0.02 + ik.short * 400 + Math.abs(phi) * 0.1 + sl * 2 + (h.cyl && h.cyl !== key ? 0.6 : 0);
        if (!best || c < best.c) best = { c, pos, quat: q, key, short: ik.short };
        if (flat && k === 0) break; // (a flat hand isn't turned about its own palm: only which way the fingers point)
      }
    }
    h.cyl = best.key;
    return { pos: best.pos, quat: best.quat, grip: flat ? KIND_FLAT[spec.kind] : cylName };
  }

  // ---- one arm onto its target ----
  const tmpQ = new THREE.Quaternion();
  function setWorldQuat(b, q) { b.parent.getWorldQuaternion(tmpQ); b.quaternion.copy(tmpQ.invert().multiply(q)); b.updateMatrixWorld(true); }
  const TURNS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180].map((d) => (d * Math.PI) / 180); // (all the way round: winding up a cast, the elbow comes up and forwards)
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  /** the elbow's turn about the shoulder-to-hand line with the most comfortable wrist for this hand (radians), as
   * Gate 3 chooses it: near the turn it had, and near none */
  const MgInv = new THREE.Matrix4();
  function bestTurn(A, S, h, shW, target, pole, rail) {
    const ax = target.pos.clone().sub(shW).normalize(); let best = null;
    for (const a of TURNS) {
      const ik = twoBone(shW, target.pos, A.L1, A.L2, pole.clone().applyAxisAngle(ax, a)), w = wristAngles(shW, ik.elbow, ik.wrist, target.quat, loc[S], S);
      let c = limitsPen(w) * 4 + (Math.abs(w.flex) + Math.abs(w.rad)) * 0.02 + Math.abs(a) * 0.25 + angDiff(a, h.turnTo ?? 0) * 0.6;
      // (a hand out past the rail, on the drop net's rope: the forearm comes over the top rail, never through it)
      // (and the upper arm and the elbow kept off the rail too: they went 7 cm into it in the railing test)
      if (rail) { const sh = shW.clone().applyMatrix4(MgInv), e = ik.elbow.clone().applyMatrix4(MgInv), wr = ik.wrist.clone().applyMatrix4(MgInv);
        for (const [a0, b0, r] of [[wr, e, 0.045], [e, sh, 0.055]]) {
          if (a0.z < rail.z + 0.04 && b0.z > rail.z) { const t = (rail.z - a0.z) / (b0.z - a0.z), y = a0.y + (b0.y - a0.y) * t; if (y < rail.y + 0.08) c += (rail.y + 0.08 - y) * 60; }
          const dy = b0.y - a0.y, dz = b0.z - a0.z, l2 = dy * dy + dz * dz, u = l2 ? clamp(((rail.y - a0.y) * dy + (rail.z - a0.z) * dz) / l2, 0, 1) : 0, d = Math.hypot(a0.y + dy * u - rail.y, a0.z + dz * u - rail.z);
          if (d < r + 0.04) c += (r + 0.04 - d) * 80; } }
      if (!best || c < best.c) best = { c, a };
    }
    return best.a;
  }
  function solveArm(A, S, target, bodyQ, h, search, dt, rail = null, castT = null) {
    const casting = castT != null;
    let shW = A.U.getWorldPosition(V());
    let pole0 = target.elbow ? target.elbow.clone().sub(shW) : A.pole.clone().applyQuaternion(bodyQ); // (winding, the elbow where Gate 2 had it at the knob's angle)
    // (where the elbow points, in your body's own frame, turns at most five radians a second: a new grip, or a jump in
    // the made pose's elbow, swings the elbow round rather than jumping it (at the end of a hand's blend to the reel it
    // went straight to where Blender had it, and at the start of a landing 8 cm in a frame). Winding, the elbow's own
    // small circle is well inside that, and followed exactly)
    { const inv = bodyQ.clone().invert(), d = pole0.clone().normalize().applyQuaternion(inv);
      if (h.poleL && dt > 0) { const ang = h.poleL.angleTo(d), max = (casting ? 8 + Math.max(0, castT - 0.3) * 60 : POLE_MAX) * dt; if (ang > max) d.copy(h.poleL).applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(h.poleL, d), max / ang)).normalize(); }
      h.poleL = d.clone(); pole0 = d.applyQuaternion(bodyQ).multiplyScalar(pole0.length()); }
    // (where the grip was made in Blender with its arm, the hold and the knob, the elbow is where Blender's IK put
    // it; anywhere else, through a cast or on a rope, it goes where the wrist is most comfortable, moving there
    // smoothly rather than jumping between the turns tried)
    h.turnTo = search ? bestTurn(A, S, h, shW, target, pole0, rail) : 0;
    // (eased, and never quicker than six radians a second: a big change of turn swung the elbow 8 cm a frame)
    { const cur = h.turn ?? h.turnTo, d = Math.atan2(Math.sin(h.turnTo - cur), Math.cos(h.turnTo - cur)), step = d * Math.min(1, dt * 8); h.turn = cur + Math.sign(step) * Math.min(Math.abs(step), (casting ? 12 : TURN_MAX) * dt); }
    let pole = Math.abs(h.turn) > 1e-4 ? pole0.clone().applyAxisAngle(target.pos.clone().sub(shW).normalize(), h.turn) : pole0;
    // (and the elbow itself never swings round the shoulder-to-hand line quicker than a real one: where the way it
    // points passes close to that line, the side it bends to could flip in a frame, and the forearm leapt 16 cm in a
    // cast. Measured in your body's frame, so turning your head isn't a swing)
    { const ax = target.pos.clone().sub(shW).normalize(), pp = pole.clone().addScaledVector(ax, -pole.dot(ax));
      if (pp.lengthSq() > 1e-10) {
        pp.normalize(); const inv = bodyQ.clone().invert(), cap = (casting ? 14 : 8) * dt;
        if (h.swivL && dt > 0) {
          const prev = h.swivL.clone().applyQuaternion(bodyQ); prev.addScaledVector(ax, -prev.dot(ax));
          if (prev.lengthSq() > 1e-10) { prev.normalize(); const ang = Math.atan2(prev.clone().cross(pp).dot(ax), prev.dot(pp)); if (Math.abs(ang) > cap) { pp.copy(prev.applyAxisAngle(ax, Math.sign(ang) * cap)); pole = pp.clone().multiplyScalar(pole.length()); } }
        }
        h.swivL = pp.clone().applyQuaternion(inv);
      } }
    let ik = twoBone(shW, target.pos, A.L1, A.L2, pole);
    if (ik.short > 0.002) {
      // (out of reach: the collar bone lets the shoulder come towards it, up to 15 degrees, as a real one does)
      const sp = A.sh.getWorldPosition(V()), dir0 = shW.clone().sub(sp).normalize(), want = target.pos.clone().sub(sp).normalize();
      const ang = Math.min(dir0.angleTo(want), 0.26) * clamp(ik.short / 0.06, 0, 1);
      const ax = dir0.clone().cross(want); if (ax.lengthSq() > 1e-8) { const q = new THREE.Quaternion().setFromAxisAngle(ax.normalize(), ang).multiply(A.sh.getWorldQuaternion(new THREE.Quaternion())); setWorldQuat(A.sh, q); }
      shW = A.U.getWorldPosition(V()); ik = twoBone(shW, target.pos, A.L1, A.L2, pole);
    }
    const n = ik.elbow.clone().sub(shW).cross(ik.wrist.clone().sub(ik.elbow)); if (n.lengthSq() < 1e-10) n.copy(pole).cross(ik.wrist.clone().sub(shW)); n.normalize();
    setWorldQuat(A.U, pairRotation(A.aU, A.nU, ik.elbow.clone().sub(shW), n));
    setWorldQuat(A.F, pairRotation(A.aF, A.nF, ik.wrist.clone().sub(ik.elbow), n));
    A.F1.quaternion.copy(A.f1q); A.F1.updateMatrixWorld(true);
    setWorldQuat(A.H, target.quat);
    // (the forearm's turn shared: half of the hand's twist from the hold goes into the forearm's lower half, so the
    // wrist doesn't wring like a sweet wrapper)
    const tw = twistAbout(A.H.quaternion, A.f1ax) - A.tw0, half = Math.atan2(Math.sin(tw), Math.cos(tw)) * 0.5;
    A.F1.quaternion.copy(A.f1q).multiply(new THREE.Quaternion().setFromAxisAngle(A.f1ax, half)); A.F1.updateMatrixWorld(true);
    setWorldQuat(A.H, target.quat);
    return ik;
  }

  const Mg = new THREE.Matrix4(), qg = new THREE.Quaternion(), M4 = new THREE.Matrix4();
  // (leaning towards what's out of reach: the body turned about the eye, as you lean over the rail to a rope or the net,
  // built up over a few frames while a hand can't reach and let go again once both can, never snapped)
  const lean = V(), leanAdd = V();
  return {
    group,
    get ready() { return !!R; },
    get failed() { return failed; },
    show(on) { group.visible = !!on; if (!on) for (const h of hands) { h.cur = null; h.kind = undefined; h.poleL = null; h.swivL = null; h.wantAt = null; } },
    pose(o) {
      const { hands: specs = [null, null], eye, dt = 0.016 } = o;
      if (!group.visible || !R) return;
      { const down = o.vf ? clamp((-o.vf.y - 0.55) / 0.3, 0, 1) : 0; nearCut.value += (0.16 + 0.17 * down - nearCut.value) * Math.min(1, dt * 6); }
      const empty = !specs[0] && !specs[1];
      // (nothing in either hand: the arms put away, as in any first-person game; and until the rod and reel are there to
      // take hold of, nothing to hold)
      const wait = empty || specs.some((sp) => sp && (sp.kind === "seat" || sp.kind === "crank") && !sp.sock);
      R.scene.visible = !wait; if (wait) return;
      group.updateWorldMatrix(true, false); Mg.copy(group.matrixWorld); MgInv.copy(Mg).invert(); qg.setFromRotationMatrix(Mg);
      // ---- 1. the base clip ----
      R.clips.hold.apply(1 / RIG.fps);
      if (o.castT != null && R.clips.cast && o.castT + 1 / RIG.fps < R.clips.cast.duration) R.clips.cast.apply(o.castT + 1 / RIG.fps, (n) => n.startsWith("DEF-spine"));
      // ---- 2. the body under the camera ----
      const c0 = Math.cos(P0), s0 = Math.sin(P0);
      const bf = o.vf.clone().multiplyScalar(c0).addScaledVector(o.vu, -s0).normalize(), bu = o.vf.clone().multiplyScalar(s0).addScaledVector(o.vu, c0).normalize(), br = bf.clone().cross(bu).normalize();
      const bodyQ = new THREE.Quaternion().setFromRotationMatrix(M4.makeBasis(br.clone().negate(), bu, bf)).premultiply(qg);
      if (lean.lengthSq() > 1e-10) bodyQ.premultiply(new THREE.Quaternion().setFromAxisAngle(lean.clone().normalize(), lean.length()));
      const eyeW = eye.clone().applyMatrix4(Mg), camW = eyeW.clone();
      const rootW = new THREE.Matrix4().compose(V(), bodyQ, V(1, 1, 1));
      root.matrix.copy(new THREE.Matrix4().copy(Mg).invert().multiply(rootW)); root.matrix.decompose(root.position, root.quaternion, root.scale);
      root.updateMatrixWorld(true);
      const e0 = R.eyeLocal.clone().applyMatrix4(R.head.matrixWorld);
      rootW.setPosition(eyeW.sub(e0)); root.matrix.copy(new THREE.Matrix4().copy(Mg).invert().multiply(rootW)); root.matrix.decompose(root.position, root.quaternion, root.scale);
      root.updateMatrixWorld(true);
      // ---- 3 to 5. each hand onto what it holds ----
      leanAdd.set(0, 0, 0); let roomy = true;
      for (let i = 0; i < 2; i++) {
        const h = hands[i], S = h.side, A = R.arm[S], spec = specs[i];
        let want;
        if (!spec) {
          // (nothing to hold: the arm hangs at your side, out of the view)
          for (const b of [A.U, A.U1, A.F, A.F1, A.H]) { const r = R.rest.get(b.name); b.quaternion.copy(r.q); }
          A.U.updateMatrixWorld(true);
          want = { pos: A.H.getWorldPosition(V()), quat: A.H.getWorldQuaternion(new THREE.Quaternion()), grip: "relax", kind: null };
        } else if (spec.kind === "seat" && spec.sock) want = { ...seatTarget(spec, Mg, qg), kind: "seat" };
        else if (spec.kind === "crank" && spec.sock) {
          want = { ...knobTarget(spec, Mg, qg), kind: "crank" };
          // (the shoulder rises and falls a little with the knob, as Gate 2's turns have it)
          if (R.clips.reel && RIG.reelTh?.length) { const th = want.th, T = RIG.reelTh; let k = 0, bestD = 1e9; for (let j = 0; j < T.length - 1; j++) { const d = Math.abs(((th - T[j]) + 540) % 360 - 180); if (d < bestD) { bestD = d; k = j; } } const v = R.clips.reel.value((k + 1) / RIG.fps, A.sh.name); if (v) { A.sh.quaternion.fromArray(v); A.sh.updateMatrixWorld(true); } }
        } else want = { ...wrapTarget(h, A, spec, Mg, qg, bodyQ), kind: spec.kind };
        // easing to something new (a short blend whenever what the hand holds changes, or what it holds jumps: the fish
        // on the line becoming the fish in your hand took the left hand 40 cm in a frame); then following it exactly
        // (measured from your body, so turning your head, which carries the hold with it, is never a jump)
        const wl = root.worldToLocal(want.pos.clone()), jumped = h.wantAt && wl.distanceTo(h.wantAt) > Math.max(0.1, 6 * dt); h.wantAt = wl;
        if (want.kind !== h.kind || !h.cur || jumped) {
          h.from = h.cur ? { pos: h.cur.pos.clone(), quat: h.cur.quat.clone() } : null; h.kind = want.kind; h.u = h.from ? 0 : 1;
          h.fingFrom = h.fing ? new Map([...h.fing].map(([n, q]) => [n, q.clone()])) : null;
        }
        h.u = Math.min(1, h.u + dt / BLEND); const e = ease(h.u);
        const tgt = h.from ? { pos: h.from.pos.clone().lerp(want.pos, e), quat: h.from.quat.clone().slerp(want.quat, e), elbow: want.elbow || null } : want;
        h.cur = { pos: tgt.pos.clone(), quat: tgt.quat.clone() };
        { const shW = A.U.getWorldPosition(V()); h.short = solveArm(A, S, tgt, bodyQ, h, o.castT != null || !(want.kind === "seat" || want.kind === "crank"), dt, spec?.rail || null, o.castT ?? null).short;
          if (spec && h.short > 0.002) { const arm = shW.clone().sub(camW), ax = arm.clone().cross(tgt.pos.clone().sub(shW)); if (ax.lengthSq() > 1e-10) leanAdd.addScaledVector(ax.normalize(), h.short / Math.max(0.1, arm.length())); }
          if (spec && tgt.pos.distanceTo(shW) > 0.95 * (A.L1 + A.L2)) roomy = false; }
        // the fingers, curled for the grip
        const G = R.grips[want.grip]?.[S] || R.grips.relax?.[S]; h.fing ||= new Map();
        if (G) for (const [n, q] of G) { const b = R.bones.get(n); if (!b) continue; const f = h.fingFrom?.get(n); const qq = f && e < 1 ? f.clone().slerp(q, e) : q; b.quaternion.copy(qq); h.fing.set(n, qq.clone()); }
        A.H.updateMatrixWorld(true);
        h.wrist = group.worldToLocal(A.H.getWorldPosition(V()));
      }
      if (leanAdd.lengthSq() > 0) { lean.addScaledVector(leanAdd, Math.min(1, dt * 6)); if (lean.length() > 0.45) lean.setLength(0.45); }
      else if (roomy) lean.multiplyScalar(1 - Math.min(1, dt * 1.5));
    },
    /** the loaded rig's insides (bones, clips, arms), for tests and the rig preview page */
    get internals() { return R; },
    /** each hand's target (world), what it holds and the elbow's turn, for the rig test page */
    get debug() { return hands.map((h) => ({ kind: h.kind, target: h.cur ? { pos: h.cur.pos.clone(), quat: h.cur.quat.clone() } : null, short: h.short ?? 0, turn: h.turn ?? 0 })); },
    /** how far short of its target each hand stopped (metres; 0 when it's there), for tests */
    get shortfall() { return hands.map((h) => h.short ?? 0); },
    /** where each hand is (the wrist, in the group's space), for tests */
    get wrists() { return hands.map((h) => (h.wrist && R ? h.wrist.clone() : null)); },
    dispose() { skinMat.dispose(); coatMat.dispose(); liveMats.delete(skinMat); liveMats.delete(coatMat); },
  };
}
