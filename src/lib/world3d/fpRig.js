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
import { TEX_BASE } from "./textures3d.js";
import { RIG } from "./fpRigData.js";
import { clothe } from "./fabric.js";
import { twoBone, wristAngles, limitsPen, pairRotation, twistAbout } from "./fpIk.js";
import { FILM } from "./film.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const A3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Q4 = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** the name three gives a Blender bone (GLTFLoader drops dots and the like) */
export const boneName = (s) => s.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
const BLEND = 0.3; // seconds to go from one grip to the next
const CYL_HOLD = 0.4, SWAP_BLEND = 0.15; // (a way of holding a rope, a hoop or a fish kept at least this long; changing to another, this long)
const REACH_IN = 0.45; // (seconds for an arm that was put away to come up into the view to what it now holds)
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
// ---- fingers on a handle: kept outside it ----
// The handle's outline (rodKit.js handleProfile: [along, radius, soft] from the reel), looked at 1.2 mm either side of
// each point so a 1 mm trim ring can't slip between two points of a finger. CLEAR: the skin kept that far off metal
// (foam lets a finger press in by its soft).
const CLEAR = 0.0006;
function outlineAt(prof, z) {
  if (!prof?.length || z < prof[0][0] || z > prof[prof.length - 1][0]) return null;
  let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < z) i++;
  const [z0, r0, s0] = prof[i], [z1, r1, s1] = prof[i + 1], f = z1 > z0 ? clamp((z - z0) / (z1 - z0), 0, 1) : 0;
  return { r: r0 + (r1 - r0) * f, soft: Math.min(s0, s1) };
}
/** the handle's radius at z (metres along the rod from the reel) and how far a finger may press in there; null off it */
export function profileAt(prof, z) {
  let best = null;
  for (const dz of [-0.0012, 0, 0.0012]) { const q = outlineAt(prof, z + dz); if (q && (!best || q.r - q.soft > best.r - best.soft)) best = q; }
  return best;
}
const _w = new THREE.Vector3(), _v = new THREE.Vector3(), _l = new THREE.Vector3(), _J = new THREE.Vector3(), _hx = new THREE.Vector3(), _arm = new THREE.Vector3(), _qx = new THREE.Quaternion(), _m = new THREE.Matrix4(), _M = new THREE.Matrix4();
/** a skin point where the graphics card draws it (world): its bind place carried by each of its bones by its weight */
function skinAt(pt, M, out) {
  out.set(0, 0, 0);
  for (let k = 0; k < 4; k++) { const w = pt.w[k]; if (w < 1e-4) continue; _m.multiplyMatrices(pt.bones[k].matrixWorld, pt.inv[k]); out.addScaledVector(_v.copy(pt.p).applyMatrix4(_m), w); }
  return out.applyMatrix4(M);
}
/** Each finger of a hand on the reel seat opened at its joints just enough that none of its skin is inside the handle
 * (fingers: fpRig's fingerSkin for that hand; spec: what it holds, its sock and outline, profAxis "x" for the reel's knob,
 * whose axis is the reel's x), then its outer joints curled back in by as much as stays outside, so a
 * finger lifted at the knuckle still wraps the handle. The finger's deepest point at a time, lifted by the joint nearest
 * the fingertip that can, each joint turning about its own bending axis only, so a finger lifts off the lock nut the way
 * a finger does, never sideways. Returns how far the skin was inside at worst before (metres). */
export function clearFingers(fingers, spec, Mg, qg) {
  if (!fingers?.skin) return 0;
  const sq = spec.sock.quat.clone().premultiply(qg), sp = spec.sock.pos.clone().applyMatrix4(Mg), sqi = sq.clone().invert(), alongX = spec.profAxis === "x";
  _M.multiplyMatrices(fingers.skin.matrixWorld, fingers.skin.bindMatrixInverse);
  /** the chain's deepest point inside the handle: how far, where (world), which way is out, on which bone */
  const deepest = (segs) => {
    let need = 0, at = null, ur = null, si = 0;
    segs.forEach((sg, j) => { for (const pt of sg.pts) {
      skinAt(pt, _M, _w); _l.copy(_w).sub(sp).applyQuaternion(sqi);
      if (alongX) _l.set(_l.y, _l.z, _l.x); // (a knob: its axis the reel's x, the crank's axle)
      const pr = profileAt(spec.prof, _l.z); if (!pr) continue;
      const r = Math.hypot(_l.x, _l.y), d = pr.r - pr.soft + CLEAR - r;
      if (d > need && r > 1e-6) { need = d; at = _w.clone(); ur = (alongX ? new THREE.Vector3(0, _l.x / r, _l.y / r) : new THREE.Vector3(_l.x / r, _l.y / r, 0)).applyQuaternion(sq); si = j; }
    } });
    return { need, at, ur, si };
  };
  const turn = (sg, a) => { sg.b.quaternion.multiply(_qx.setFromAxisAngle(sg.ax, a)); sg.b.updateMatrixWorld(true); };
  let most = 0;
  for (const segs of fingers) {
    const turned = segs.map(() => 0);
    for (let it = 0; it < 10; it++) {
      const { need, at, ur, si } = deepest(segs);
      if (!it) most = Math.max(most, need - CLEAR);
      if (need < 1e-4) break;
      // (the joint nearest the fingertip that can lift it: its own, or one nearer the knuckle only where that moves it
      // out more than twice as directly)
      let best = -1, bestOut = 0;
      for (let j = si; j >= 0; j--) { const { b, ax } = segs[j]; b.getWorldPosition(_J); _hx.copy(ax).transformDirection(b.matrixWorld); _arm.copy(at).sub(_J); const o = _J.crossVectors(_hx, _arm).dot(ur); if (Math.abs(o) > Math.abs(bestOut) * 2) { best = j; bestOut = o; } }
      if (best < 0 || Math.abs(bestOut) < 0.002) break;
      const a = clamp((need * 1.15) / bestOut, -0.3, 0.3); turn(segs[best], a); turned[best] += a;
    }
    // (the knuckle turned to lift it: the joints past it turned back the other way, up to seven tenths as much, as far as
    // stays outside, so the finger still wraps the handle. Turned at the knuckle alone, the index finger swung its tip
    // round onto your thumb)
    if (Math.abs(turned[0]) > 0.03) for (let j = 1; j < segs.length; j++) {
      if (turned[j]) continue;
      let c = -Math.sign(turned[0]) * Math.min(0.3, Math.abs(turned[0]) * 0.7);
      for (let k = 0; k < 4 && Math.abs(c) > 0.01; k++) { turn(segs[j], c); if (deepest(segs).need < 1e-4) break; turn(segs[j], -c); c /= 2; }
    }
  }
  return Math.max(0, most);
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
// (the rod at rest across the view, not up the middle of it: Blender's hold has the rod at 45 degrees from your body,
// which with the reel framed low in the picture stood it 69 to 74 degrees up from your line of sight, a pole down the
// centre of the screen with its tip out of the top (Aaron's phone screenshots, 19 November). Held as you would while
// you wait: about 34 degrees up and 17 across to the left, the tip in the picture over the water; the reel and your
// hands where they were. The winding hand keeps its angle on the knob (pose: holdTurn), so the arms sit as they did)
const SEAT_GIVE = 0.5;
const REST_E = 0.6, REST_SW = -0.3, REST_UP = 0.035, REST_OUT = 0.04; // (and the reel 3.5 cm higher and 4 cm further out, where the lowered reel's knob and the hand on it are back in the picture)
// (the follow-through from the resting hold: the rod 11 degrees higher, a little less across, the reel 6 cm nearer (the
// body has gone back with the cast: at the hold's own distance both elbows locked straight); the hands give to the rod
// again from 0.95 s, over 0.3 s; the left hand leaves the butt for the reel's handle at leftToReel)
export const CAST_FOLLOW = { e: 0.2, sw: 0.06, z: -0.06, from: 0.95, over: 0.3, leftToReel: 1.0 };
/** the hold as Blender made it (the grips' own), in the view's frame */
export const holdMade = () => toView(RIG.holdBody);
export const holdView = () => { const k = toView(RIG.holdBody); return { x: k.x, y: k.y + REST_UP, z: k.z + REST_OUT, e: REST_E, sw: REST_SW }; };

/** where the reel is held and the rod's angle at a moment of the cast (seconds), in the view's frame as angler.js
 * places it: a smooth curve through Gate 3's moments, still at the hold, at the top of the wind-up and through the
 * follow-through. k0: the hold it starts from and goes back to (the game's own, holdView() unless a film sets another) */
export function castAt(t, k0 = holdView()) {
  // (the follow-through, the two keys before the last, while the lead flies and until it is down: the resting hold with
  // the rod a little higher, pointing after the line. As Blender made it, 69 degrees up and dead
  // ahead, the rod stood upright in the middle of the screen for a second and more after every cast: the footage on
  // Aaron's PC, 19 November)
  const follow = { x: k0.x, y: k0.y, z: k0.z + CAST_FOLLOW.z, e: k0.e + CAST_FOLLOW.e, sw: k0.sw + CAST_FOLLOW.sw };
  const path = RIG.cast.path, n = path.length, T = path.map((k) => k.t), P = path.map((k, i) => (i === 0 || i === n - 1 ? k0 : i >= n - 3 ? follow : toView(k))), still = new Set(RIG.cast.still);
  t = clamp(t, 0, T[n - 1]); let i = 0; while (i < n - 2 && t > T[i + 1]) i++;
  const tan = (k, c) => (still.has(k) ? 0 : (P[k + 1][c] - P[k - 1][c]) / (T[k + 1] - T[k - 1]));
  const h = T[i + 1] - T[i], u = (t - T[i]) / h, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  const out = {}; for (const c of ["x", "y", "z", "e", "sw"]) out[c] = h00 * P[i][c] + h10 * h * tan(i, c) + h01 * P[i + 1][c] + h11 * h * tan(i + 1, c);
  return out;
}

let DIM = 1, WET = 0; const liveMats = new Set();
const tint = (m) => m.color.copy(m.userData.base).multiplyScalar(DIM * (1 - (m.userData.wetDark || 0) * WET));
/** the arms in the dark: the colours scaled down at night unless a torch is on (world.js) */
export function setHandsDim(k) { DIM = clamp(k, 0.2, 1); for (const m of liveMats) tint(m); }
// (with the temporal antialiasing on, the coat's cut near your eye looking down may dissolve over a wider band: the
// dither is smoothed into a fade there, where without it a wide band showed as a screen of dots (15 November). Looking
// down at the drop net the cut's hard edge left the sleeve a torn blue ribbon, in the 17 November film on Aaron's PC)
// (since 18 November the cut is crisp whatever the antialiasing, and only right by your eye: see pose below. Kept, so
// Settings → Graphics can still say whether the temporal antialiasing is on)
let SOFT = false;
/** the temporal antialiasing on or off (world.js, with Settings → Graphics) */
export function setSoftCut(on) { SOFT = !!on; }
export const softCut = () => SOFT;
// ---- your arms in the rain ----
// Wet skin and a wet nylon coat are glossier and a little darker: water fills the skin's fine grain and soaks the
// coat's weave. They wet through in about a minute of rain and dry over a few once it stops, rather than with the
// weather's every change. No shader is rebuilt: only the roughness and colour the materials already have.
/** rain: the weather's rain (0 to 1); dt: seconds since the last call (world.js, every frame) */
export function setHandsWet(rain, dt = 0.016) {
  const want = clamp((rain || 0) * 1.4, 0, 1), k = Math.min(1, dt / (want > WET ? 40 : 180));
  WET += (want - WET) * k; if (WET < 1e-4) WET = 0;
  for (const m of liveMats) { m.roughness = m.userData.dryRough * (1 - (m.userData.wetGloss || 0) * WET); tint(m); }
}
/** how wet your arms are (0 dry to 1 wet through), for tests and the diagnostics */
export const handsWet = () => WET;

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
varying vec3 vHair;
float fpSkinHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float fpSkinNoise( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( fpSkinHash( i ), fpSkinHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( fpSkinHash( i + vec3( 0, 1, 0 ) ), fpSkinHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( fpSkinHash( i + vec3( 0, 0, 1 ) ), fpSkinHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( fpSkinHash( i + vec3( 0, 1, 1 ) ), fpSkinHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;
// ---- a soft key light on your own arms ----
// A close shot is lit: your arms are the nearest thing in the picture, and under a flat light (a grey day, dusk, the
// "Dusk" the game shows after dark) the sky lit them from all round alike and they had no form, a smooth tan shape
// (Aaron, 16 November: "like PS2 graphics"). Some of the sky's own light (never more: at night there is little, so
// little is added) is brought round from above and to the left of your view, wrapped softly over the skin or the
// cloth, with a faint sheen, and the even all-round part of it a little less; the total stays about the same.
/** GLSL put after the lights: k how much of the sky's light comes from the side, s and p the sheen, fill what's left all round. */
export const fpKeyLight = (k, s, p, fill) => `
{ vec3 fpL = normalize( vec3( -0.45, 0.75, 0.5 ) ), fpH = normalize( fpL + geometryViewDir );
  float fpWrap = saturate( ( dot( geometryNormal, fpL ) + 0.35 ) / 1.35 );
  reflectedLight.directDiffuse += BRDF_Lambert( material.diffuseColor ) * irradiance * fpWrap * ${k.toFixed(2)};
  reflectedLight.directSpecular += irradiance * pow( saturate( dot( geometryNormal, fpH ) ), ${p.toFixed(1)} ) * ${s.toFixed(3)};
  reflectedLight.indirectDiffuse *= ${fill.toFixed(2)}; }`;
// (x: how much hair grows there, 0 to 1; y: along the arm, metres; z: round it, metres)
const FP_HAIR = `{ vec2 hc = vec2( vHair.y * 95.0, vHair.z * 520.0 ), ci = floor( hc ), cf = fract( hc );
  float aa = clamp( fwidth( hc.y ), 0.0, 4.0 ), pick = fpSkinHash( vec3( ci, 3.1 ) ), slant = ( fpSkinHash( vec3( ci, 7.3 ) ) - 0.5 ) * 0.9;
  float x = cf.y - 0.5 - ( cf.x - 0.5 ) * slant, w = 0.14 + 0.35 * aa, len = 0.45 + 0.5 * fpSkinHash( vec3( ci, 5.7 ) );
  float strand = ( 1.0 - smoothstep( w * 0.3, w, abs( x ) ) ) * step( 0.3, pick ) * smoothstep( 0.0, 0.12, cf.x ) * ( 1.0 - smoothstep( len - 0.2, len, cf.x ) );
  float k = mix( strand * min( 1.0, 0.24 / w ), 0.12, smoothstep( 0.45, 1.2, aa ) );
  diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.8, 0.74, 0.7 ), k * vHair.x ); }`; // (fair and fine: at 0.6 the hairs read as dark dashes drawn on the arm)
export function skinShade(sh) {
  // (the point as the model was made, before the bones move it: taken after skinning, as it was until 15 November, the
  // patches stayed where they were while the arm moved through them, sliding over the skin as you cast or wound)
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSkinP;\nattribute vec3 fpHair;\nvarying vec3 vHair;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHair = fpHair;").replace("#include <skinning_vertex>", "vSkinP = transformed;\n#include <skinning_vertex>");
  const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (!chunk.includes(SKIN_BLEED)) return; // (a three.js whose lighting is written differently: plain skin, as before)
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", `#include <common>\n${SKIN_NOISE}`)
    // (the light that wraps round past the shadow's edge, a third of the way into the dark side, warm)
    .replace("#include <lights_physical_pars_fragment>", chunk.replace(SKIN_BLEED, `${SKIN_BLEED}\n\t{ float fpW = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 ); reflectedLight.directDiffuse += max( fpW - dotNL, 0.0 ) * directLight.color * vec3( 0.9, 0.26, 0.15 ) * BRDF_Lambert( material.diffuseColor ); }`))
    // (patches 3 to 10 cm across, a few per cent redder or paler; the knuckles' and palms' sheen varies with them)
    // (the baked creases, knuckles, nails and veins at twice their strength: drawn true to life they were too faint to
    // see at the size a phone shows your hands, which read as smooth and even as a mannequin's, 16 November)
    .replace("#include <map_fragment>", "#ifdef USE_MAP\n{ vec4 fpMap = texture2D( map, vMapUv ); diffuseColor.rgb *= max( vec3( 0.0 ), 0.85 + ( fpMap.rgb - 0.85 ) * 2.0 ); }\n#endif")
    // (and the hair on your forearms and the backs of your hands: short fine strands lying along the arm, each a couple
    // of millimetres apart and a centimetre or so long, more on the outside of the arm than the inside, drawn darker
    // than the skin. Where a strand would be finer than a pixel they even out into the slight darkening hair gives
    // skin seen from further off, so they never shimmer. The coordinates come with the rig: hairCoords)
    .replace("#include <color_fragment>", "#include <color_fragment>\n" + FP_HAIR)
    .replace("#include <color_fragment>", "#include <color_fragment>\n{ float fpN = fpSkinNoise( vSkinP * 11.0 ) * 0.6 + fpSkinNoise( vSkinP * 34.0 ) * 0.4; diffuseColor.rgb *= mix( vec3( 1.07, 0.94, 0.92 ), vec3( 0.95, 1.02, 1.04 ), fpN ); }")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + ( fpSkinNoise( vSkinP * 34.0 + 7.0 ) - 0.5 ) * 0.14, roughnessFactor < 0.32 ? 0.15 : 0.3, 1.0 );")
    // (and towards its outline skin is lighter, not darker: the fine hairs catch the light and light scattered inside
    // comes back out near the edge. Without it a finger's outline went dark like a painted model's, the plastic look
    // Aaron called "PS2 graphics", 16 November)
    .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + fpKeyLight(1.1, 0.07, 28, 0.75) + "\n{ float fpRim = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.5 ); reflectedLight.indirectDiffuse *= 1.0 + 0.8 * fpRim; reflectedLight.directDiffuse *= 1.0 + 0.3 * fpRim; }");
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
  // (a triangle goes only if all three corners are the lining's: at a cuff or the hem the cloth's edge is a band of
  // squares joining the outer layer to the lining, each split into one triangle with two outer corners and one with two
  // lining corners. Dropping the second kind, as until 15 November, left every edge a sawtooth, the cuff round your right
  // wrist a ragged ring through the cast; kept, the edge is whole and shows the cloth's thickness, as a real hem does)
  for (let t = 0; t < src.length; t += 3) if (inner[src[t]] + inner[src[t + 1]] + inner[src[t + 2]] < 3) keep.push(src[t], src[t + 1], src[t + 2]);
  const dropped = 1 - keep.length / src.length;
  if (dropped < 0.25 || dropped > 0.65) return 0; // (not a lined cloth as expected: left whole)
  mesh.geometry = g.clone(); mesh.geometry.userData.fpOwn = true; mesh.geometry.setIndex(keep);
  return dropped;
}

// ---- which of the jacket is its body (chest, back, shoulders, hips) rather than its sleeves ----
// A vertex's share hanging from the spine, chest, hips and shoulder bones, as an attribute (fpTorso) for the coat's
// shader, which leaves the body out when you look down. On this rig's own copy of the jacket, never the shared model's.
// (and the trousers below the knee: the jacket's mesh carries them, and with the thighs hidden the shins, a metre and
// more below your eye and past the cut, were left as scraps of navy along the bottom of the picture looking down over
// the rail at the drop net. 15 November)
const TORSO_BONE = /^DEF-(spine|breast|pelvis|shoulder|thigh|shin|foot|toe)/;
// (and the upper arms, shoulder to elbow: looking steeply down they lie right under your eye, and cut by the edge of
// what's drawn there they showed as dark shards along the bottom of the picture, hauling the drop net in Aaron's
// review footage of 18 November. Looking down, only your forearms and hands are drawn, coming in from the bottom;
// the sleeve fades out over the elbow, finely dithered (smoothed by the temporal antialiasing on High and Ultra): cut
// at one weight, its edge followed the mesh's weights and showed as a ragged flap)
const UPPER_BONE = /^DEF-upper_arm/;
export function markTorso(mesh) {
  const g = mesh.geometry, si = g?.attributes?.skinIndex, sw = g?.attributes?.skinWeight, sk = mesh.skeleton;
  if (!si || !sw || !sk) return 0;
  const torso = sk.bones.map((b) => TORSO_BONE.test(b.name)), upper = sk.bones.map((b) => UPPER_BONE.test(b.name)), a = new Float32Array(si.count), u = new Float32Array(si.count); let n = 0;
  for (let i = 0; i < si.count; i++) { let w = 0, wu = 0; for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), x = sw.getComponent(i, k); if (torso[b]) w += x; if (upper[b]) wu += x; } a[i] = w; u[i] = wu; if (w > 0.5) n++; }
  if (!mesh.userData.ownGeometry && !g.userData.fpOwn) { mesh.geometry = g.clone(); mesh.geometry.userData.fpOwn = true; }
  mesh.geometry.setAttribute("fpTorso", new THREE.BufferAttribute(a, 1)); mesh.geometry.setAttribute("fpUpper", new THREE.BufferAttribute(u, 1));
  return n / si.count;
}

// ---- the hands' uvs onto their one tile ----
// The skin's uvs are the base mesh's tiles: each hand fills one (u 2 to 3; v -2 to -1 and 0 to 1), laid out alike, the
// arms the next ones along. The hands' maps cover one tile, so each hand's uvs are brought onto it, and everything
// else onto a texel in its corner where the maps are plain. Once per geometry (the clones share it).
export const HAND_NEUTRAL = 0.85;
export function handUV(geo) {
  const uv = geo?.attributes?.uv; if (!uv || geo.userData.fpHandUV) return; geo.userData.fpHandUV = true;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); if (Math.floor(u) === 2) uv.setXY(i, u - 2, v - Math.floor(v)); else uv.setXY(i, 0.998, 0.998); }
  uv.needsUpdate = true;
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
  // (two-sided: a sleeve opened by the cut by your eye shows its dark inside, not a hollow shell you see through)
  const coatMat = new THREE.MeshPhysicalMaterial({ color: coatHex, roughness: 0.8, metalness: 0, sheen: 0.22, sheenRoughness: 0.8, sheenColor: new THREE.Color(coatHex).lerp(new THREE.Color(0xffffff), 0.12), side: THREE.DoubleSide });
  // (cloth right at your eye isn't drawn: the collar and the shoulders sit around the camera)
  // (and further off when you look down past your arms at a net or the deck below the rail: from above, the sleeves
  // between your shoulders and elbows are right under your eye, and filled half the picture in the 13 November
  // recording, hauling the drop net and putting the cod back. Your forearms and hands still show)
  const nearCut = { value: 0.16 }, cutSoft = { value: 0.012 };
  // (and through a cast's wind-up, further still and dissolving rather than cut: the left arm holding the butt comes up
  // in front of you, and its sleeve, 17 to 23 cm from your eye, filled the lower left of the picture in the 17 November
  // film on Aaron's PC. Within about 24 cm of your eye it fades out over 6 cm, finely dithered (smoothed into a fade by
  // the temporal antialiasing on High and Ultra); your forearms and hands, further off, still show)
  // (and near your eye the inside of a sleeve is never drawn: where the cut opens a sleeve, its lining showed as a
  // ring or a dark flap round your forearm, hauling or lowering the drop net looking down over the rail (Aaron's
  // screenshots of 14 November, putting a thornback ray back). Without it you see your forearm inside, or the cut
  // sleeve simply ends, as an arm cut by the edge of the picture does. Further off, a cuff's inside still shows)
  // (and looking down, the jacket's body isn't drawn at all: its chest and front, right under your eye, were cut by
  // that sphere into ragged dark flaps across the bottom of the picture, looking down at the mat or over the rail. Which
  // parts are its body is marked on each vertex when the rig is built (markTorso); your sleeves still show)
  // (lining: how far past the cut a sleeve's inside is left out. With the upper arms drawn whole (18 November), 18 cm
  // left the elbow's sleeve a hollow shell when an arm crossed in front of you putting a fish back: a black fin with a
  // torn edge. Now only just past the cut, where a cut sleeve's opening shows)
  const lookDown = { value: 0 }, upperOn = { value: 0 }, lining = { value: 0.03 };
  coatMat.onBeforeCompile = (sh) => {
    sh.uniforms.fpNearCut = nearCut; sh.uniforms.fpDown = lookDown; sh.uniforms.fpCutSoft = cutSoft; sh.uniforms.fpUpperOn = upperOn; sh.uniforms.fpLining = lining;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float fpTorso;\nattribute float fpUpper;\nvarying float vTorso;\nvarying float vUpper;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTorso = fpTorso; vUpper = fpUpper;");
    // (the cut's edge softened by a fine ordered dither over 1.2 cm. It was 5 cm, against a sawtooth seen through the
    // cast that turned out to be the cuff's own edge (dropLining, fixed 15 November); looking down at the drop net the
    // upper sleeve lies almost wholly inside a 5 cm band, and showed as a screen of dots)
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float fpNearCut;\nuniform float fpDown;\nuniform float fpCutSoft;\nuniform float fpUpperOn;\nuniform float fpLining;\nvarying float vTorso;\nvarying float vUpper;\nfloat fpB2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }\nfloat fpB4(vec2 a) { return fpB2(0.5 * a) * 0.25 + fpB2(a); }").replace("#include <opaque_fragment>", "if (length(vViewPosition) < fpNearCut + (fpB4(gl_FragCoord.xy) - 0.5) * fpCutSoft || (!gl_FrontFacing && length(vViewPosition) < fpNearCut + fpLining) || (vTorso > 0.5 && fpDown > 0.3) || (fpUpperOn > 0.5 && fpDown > 0.6 && vUpper > 0.12 + 0.6 * fpB4(gl_FragCoord.xy))) discard;\n#include <opaque_fragment>");
  };
  clothe(coatMat);
  { const prev = coatMat.onBeforeCompile; coatMat.onBeforeCompile = (sh, r) => { prev.call(coatMat, sh, r); sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n" + fpKeyLight(0.9, 0.025, 10, 0.75)); }; }
  // (and a hand or forearm right against the lens isn't drawn either: seen from inside, it showed as a flat pale shape)
  skinMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", "if (length(vViewPosition) < .07) discard;\n#include <opaque_fragment>");
    if (!gloves) skinShade(sh);
  };
  skinMat.customProgramCacheKey = () => (gloves ? "fp-gloves" : "fp-skin");
  // (the hands' own detail: knuckle creases, nails, the palm's creases and fingertip pads, baked from the rig by
  // source-assets/hands/bake_hand_maps.py into the hands' uv tile. The colour map is a multiplier about 0.85, so the
  // skin keeps the player's own colour; nothing waits on it: the plain skin until it's in)
  if (!gloves && typeof document !== "undefined") {
    const tl = new THREE.TextureLoader(), got = {};
    const done = () => { if (!got.map || !got.normalMap || !got.roughnessMap) return; Object.assign(skinMat, got); skinMat.userData.dryRough = 0.86; skinMat.roughness = 0.86 * (1 - skinMat.userData.wetGloss * WET); skinMat.normalScale.set(2.2, 2.2); skinMat.userData.base.multiplyScalar(1 / HAND_NEUTRAL); skinMat.color.multiplyScalar(1 / HAND_NEUTRAL); skinMat.needsUpdate = true; };
    for (const [k, f] of [["map", "hand_colour"], ["normalMap", "hand_normal"], ["roughnessMap", "hand_rough"]]) tl.load(TEX_BASE + f + ".webp", (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; got[k] = t; done(); }, undefined, () => {});
  }
  // (wet: the skin's roughness down by 40% and its colour 4% darker; the coat's roughness down by half and 12% darker,
  // as soaked nylon goes. Gloves are rubber-coated: their shine changes less)
  skinMat.userData.wetGloss = gloves ? 0.25 : 0.4; skinMat.userData.wetDark = gloves ? 0.03 : 0.04; coatMat.userData.wetGloss = 0.5; coatMat.userData.wetDark = 0.12;
  for (const m of [skinMat, coatMat]) { m.userData.base = m.color.clone(); m.userData.dryRough = m.roughness; m.roughness *= 1 - m.userData.wetGloss * WET; tint(m); liveMats.add(m); }
  let R = null, failed = false;
  const hands = [0, 1].map((i) => ({ side: i ? "R" : "L", kind: undefined, cur: null, from: null, u: 1, want: null, fing: null, fingFrom: null, cyl: null, wrist: null }));

  // (model: the loaded fp_rig.glb handed in, as the tests do; otherwise it's fetched)
  if (model) { R = build(model); root.add(R.scene); }
  else loadModel("fp_rig").then((g) => { R = build(g); root.add(R.scene); }).catch((e) => { failed = true; if (typeof console !== "undefined") console.warn("fp rig:", e?.message || e); });

  function build(g) {
    const scene = cloneSkinned(g.scene); const bones = new Map();
    scene.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (o.isMesh) { const jacket = /jacket/i.test(o.name) || /jacket/i.test(o.material?.name || ""); o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.material = jacket ? coatMat : skinMat; if (jacket && o.isSkinnedMesh) { dropLining(o); markTorso(o); } else handUV(o.geometry); }
    });
    const B = (n) => bones.get(boneName(n));
    const clips = {}; for (const c of g.animations) clips[c.name] = sampler(c, bones);
    const rest = new Map(); for (const [n, b] of bones) rest.set(n, { q: b.quaternion.clone(), p: b.position.clone() });
    // the grips' finger poses, read from the grips clip, one frame each
    const fingerBones = { L: [], R: [] };
    for (const [n] of bones) { const m = /^DEF-(f_\w+|thumb|palm)\d*(L|R)$/.exec(n); if (m) fingerBones[m[2]].push(n); }
    const grips = {};
    RIG.grips.forEach((name, k) => { grips[name] = { L: new Map(), R: new Map() }; for (const S of "LR") for (const n of fingerBones[S]) { const v = clips.grips?.value((k + 1) / RIG.fps, n); if (v) grips[name][S].set(n, new THREE.Quaternion().fromArray(v)); } });
    // (the right middle finger on the reel seat opened 0.15 radians at its two outer joints: as Blender left it, the pad
    // of its tip was a millimetre into the side of the reel's foot, under the seat, and the tip seemed to come out
    // through the reel. Aaron's screenshot, 16 November. Measured in the game: no point of it inside the reel after.
    // And turned in 0.37 radians at its knuckle, towards the index finger: wrapped under the foot, its tip still showed
    // past the rod on the reel's side, a fingertip on its own by the reel's stem that read as poking through it (his
    // second screenshot, 17 November; a quarter radian still left a sliver showing). Turned in, it lies behind the rod
    // from your eye, and nothing of it is inside the reel or the handle)
    for (const n of ["DEF-f_middle02R", "DEF-f_middle03R"]) grips.hold?.R.get(n)?.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.15));
    grips.hold?.R.get("DEF-f_middle01R")?.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.37));
    // (and the thumb moved at its root, out from where the index finger wraps the handle and bent back down onto the
    // handle beside it: as Blender left it, it lay across that place, and the index finger went 8 mm into it, its tip
    // coming out through the ball of the thumb. Aaron, 17 November: "the finger's still going through the thumb".
    // Measured on the skin as drawn, each point of the index, middle and ring fingers against the thumb's surface: none
    // inside it now; and the thumb still rests on the handle, its pad within 2 mm of it, not held off it)
    grips.hold?.R.get("DEF-thumb01R")?.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.32)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, -0.16)));
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
    hairCoords(scene, B);
    return { scene, bones, B, clips, rest, grips, arm, head, eyeLocal, fingerBones, fingers: fingerSkin(scene, grips) };
  }

  // ---- where hair grows on your arms, and its lie ----
  // For each point of the skin: how much hair (the forearm, more on its outside, thinning towards the elbow under the
  // sleeve; the back of the hand, a little, as far as the knuckles; none on the palm or the fingers), how far along the
  // arm it is and how far round it, both in metres, from the rig as it was made. The skin's shader draws the strands.
  function hairCoords(scene, B) {
    let skin = null; scene.traverse((o) => { if (o.isSkinnedMesh && o.material === skinMat && !skin) skin = o; });
    if (!skin || skin.geometry.attributes.fpHair) return;
    const g = skin.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sk = skin.skeleton;
    const out = new Float32Array(pos.count * 3), at = (b) => new THREE.Matrix4().copy(sk.boneInverses[sk.bones.indexOf(b)]).invert();
    const sides = {};
    for (const S of "LR") {
      const F = B(`DEF-forearm.${S}`), F1 = B(`DEF-forearm.${S}.001`), H = B(`DEF-hand.${S}`); if (!F || !F1 || !H) return;
      const mF = at(F), mH = at(H), elbow = V().setFromMatrixPosition(mF), wrist = V().setFromMatrixPosition(mH), ax = wrist.clone().sub(elbow).normalize();
      // (the back of the hand and the outside of the forearm: the hand bone's -z, as the hand maps are baked)
      const back = V(0, 0, -1).transformDirection(mH); back.addScaledVector(ax, -back.dot(ax)).normalize();
      const side = new THREE.Vector3().crossVectors(ax, back).normalize();
      sides[S] = { idx: new Set([F, F1, H].map((b) => sk.bones.indexOf(b))), hand: sk.bones.indexOf(H), elbow, wrist, ax, back, side, len: wrist.distanceTo(elbow) };
    }
    const p = V(), n = V(), r = V();
    for (let i = 0; i < pos.count; i++) {
      let S = null, wArm = 0, wHand = 0;
      for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), w = sw.getComponent(i, k); for (const s of "LR") if (sides[s].idx.has(b)) { S = s; wArm += w; if (b === sides[s].hand) wHand += w; } }
      if (!S || wArm < 0.05) continue;
      const D = sides[S]; p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
      r.copy(p).sub(D.wrist); const along = r.dot(D.ax), out1 = r.dot(D.back), out2 = r.dot(D.side);
      const facing = n.dot(D.back); // (1 on the outside of the arm and the back of the hand, -1 on the inside and the palm)
      let dens = wArm * (0.35 + 0.65 * Math.max(0, Math.min(1, (facing + 0.4) / 1.2)));
      dens *= Math.min(1, Math.max(0, (along + D.len) / (0.5 * D.len))); // (thinning towards the elbow)
      if (along > 0) dens *= (1 - Math.min(1, along / 0.075)) * Math.max(0, Math.min(1, (facing - 0.2) / 0.5)) * 0.7; // (the back of the hand: as far as the knuckles, sparser)
      dens *= 1 - 0.85 * (wHand > 0.5 && facing < 0 ? 1 : 0);
      out[i * 3] = Math.max(0, Math.min(1, dens)); out[i * 3 + 1] = along; out[i * 3 + 2] = Math.atan2(out2, out1) * 0.032;
    }
    g.setAttribute("fpHair", new THREE.BufferAttribute(out, 3));
  }

  // ---- the fingers' own skin, for keeping them out of what they hold ----
  // Each finger and thumb as a chain of its three bones (each with the axis it bends about: from the relaxed hand to the
  // hold, as the grips clip has them), and up to 48 points of the skin each bone moves most, with their bind places and
  // skin weights, so the skin there can be placed exactly as the graphics card will draw it.
  function fingerSkin(scene, grips) {
    let skin = null; scene.traverse((o) => { if (o.isSkinnedMesh && o.material === skinMat && !skin) skin = o; });
    const out = { L: [], R: [], skin }; if (!skin) return out;
    const g = skin.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sk = skin.skeleton;
    const per = new Map();
    for (let i = 0; i < pos.count; i++) {
      let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
      const b = sk.bones[bi]; if (!b || !/^DEF-(f_\w+|thumb)\d+(L|R)$/.test(b.name)) continue;
      (per.get(b) || per.set(b, []).get(b)).push(i);
    }
    const chains = new Map();
    for (const [b, list] of per) {
      const m = /^DEF-(f_\w+?|thumb)(\d+)(L|R)$/.exec(b.name); if (!m) continue;
      const step = Math.max(1, Math.ceil(list.length / 48)), pts = [];
      for (let j = 0; j < list.length; j += step) { const i = list[j]; pts.push({ p: V().fromBufferAttribute(pos, i).applyMatrix4(skin.bindMatrix), bones: [0, 1, 2, 3].map((k) => sk.bones[si.getComponent(i, k)]), inv: [0, 1, 2, 3].map((k) => sk.boneInverses[si.getComponent(i, k)]), w: [0, 1, 2, 3].map((k) => sw.getComponent(i, k)) }); }
      // (the bending axis: the turn from the relaxed hand to the hold, in the bone's own frame; x if they're alike)
      let ax = V(1, 0, 0); const h = grips.hold?.[m[3]]?.get(b.name), r = grips.relax?.[m[3]]?.get(b.name);
      if (h && r) { const d = r.clone().invert().multiply(h), sn = Math.sqrt(Math.max(0, 1 - d.w * d.w)); if (sn > 0.04) ax = V(d.x, d.y, d.z).multiplyScalar(Math.sign(d.w) / sn).normalize(); }
      const key = m[3] + m[1]; (chains.get(key) || chains.set(key, { side: m[3], segs: [] }).get(key)).segs.push({ b, k: +m[2], pts, ax });
    }
    for (const c of chains.values()) out[c.side].push(c.segs.sort((x, y) => x.k - y.k));
    out.L.skin = out.R.skin = skin;
    return out;
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
    const shW = A.U.getWorldPosition(V()), pole = A.pole.clone().applyQuaternion(bodyQ), pole1 = pole.clone(); if (h.turn) pole.applyAxisAngle(at.clone().sub(shW).normalize(), h.turn);
    let best = null, cur = null;
    // (a rope: a hand round it can turn about it any way, so the way round it and the elbow are chosen together, the
    // elbow turned from where an arm reaching out and down has it only as far as a comfortable wrist and the rail need.
    // Each fitted to the other in turn, frame by frame, hauling the drop net the elbows swung right round the
    // shoulder-to-hand line, the left one 120 to 340 degrees from where it hangs, a full turn every few pulls: winged up,
    // the sleeves seen end on round the wrists as dark flaps (the PC's haul filmed with its arms measured, 18 November))
    if (spec.kind === "rope") {
      const ax = at.clone().sub(shW).normalize();
      for (const a of TURNS) { if (Math.abs(a) > 2.1) continue; const pa = pole1.clone().applyAxisAngle(ax, a); // (never further round than 120 degrees: past that the elbow is up beside your ear)
        for (const sg of [1, -1]) for (let k = -6; k < 6; k++) {
          const q = pairRotation(dH, pH, axis.clone().multiplyScalar(sg), palm0.clone().applyAxisAngle(axis, (k * Math.PI) / 6)), pos = at.clone().sub(cH.clone().applyQuaternion(q));
          const ik = twoBone(shW, pos, A.L1, A.L2, pa), w = wristAngles(shW, ik.elbow, ik.wrist, q, loc[S], S), key = `${sg}|${k}|${a.toFixed(2)}`;
          const c = limitsPen(w) * 4 + (Math.abs(w.flex) + Math.abs(w.rad)) * 0.02 + ik.short * 400 + Math.abs(a) * 0.5 + railCost(shW, ik, spec.rail || null) + (h.cyl && h.cyl !== key ? 0.6 : 0);
          if (!best || c < best.c) best = { c, pos, quat: q, key, short: ik.short, a };
          if (key === h.cyl) cur = { c, pos, quat: q, key, short: ik.short, a };
        } }
      const same = h.kind === spec.kind;
      if (same && cur && best.key !== h.cyl && h.cylHold > 0) best = cur;
      if (same && h.cyl && best.key !== h.cyl) { h.cylHold = CYL_HOLD; h.cylSwap = true; }
      h.cyl = best.key; h.ropeTurn = best.a;
      return { pos: best.pos, quat: best.quat, grip: cylName, free: true };
    }
    h.ropeTurn = null;
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
        if (key === h.cyl) cur = { c, pos, quat: q, key, short: ik.short };
        if (flat && k === 0) break; // (a flat hand isn't turned about its own palm: only which way the fingers point)
      }
    }
    // (and once a way of holding it is chosen, it's kept a moment, then changed to by a short blend: judged afresh every
    // frame, two ways of holding the drop net's rope each looked best with the elbow where the other had just put it,
    // and the left hand flicked 4 cm between them every frame for seconds, lowering the net and hauling it up. Not in a
    // cast, where the grip has to keep up with the swing)
    const same = h.kind === spec.kind; // (a new thing to hold is judged fresh)
    if (same && cur && best.key !== h.cyl && h.cylHold > 0 && !h.casting) best = cur;
    if (same && h.cyl && best.key !== h.cyl) { h.cylHold = CYL_HOLD; h.cylSwap = true; }
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
  // (a hand out past the rail, on the drop net's rope: the forearm comes over the top rail, never through it)
  // (and the upper arm and the elbow kept off the rail too: they went 7 cm into it in the railing test)
  function railCost(shW, ik, rail) {
    if (!rail) return 0; let c = 0; const sh = shW.clone().applyMatrix4(MgInv), e = ik.elbow.clone().applyMatrix4(MgInv), wr = ik.wrist.clone().applyMatrix4(MgInv);
    for (const [a0, b0, r] of [[wr, e, 0.045], [e, sh, 0.055]]) {
      if (a0.z < rail.z + 0.04 && b0.z > rail.z) { const t = (rail.z - a0.z) / (b0.z - a0.z), y = a0.y + (b0.y - a0.y) * t; if (y < rail.y + 0.08) c += (rail.y + 0.08 - y) * 60; }
      const dy = b0.y - a0.y, dz = b0.z - a0.z, l2 = dy * dy + dz * dz, u = l2 ? clamp(((rail.y - a0.y) * dy + (rail.z - a0.z) * dz) / l2, 0, 1) : 0, d = Math.hypot(a0.y + dy * u - rail.y, a0.z + dz * u - rail.z);
      if (d < r + 0.04) c += (r + 0.04 - d) * 80; }
    return c;
  }
  function bestTurn(A, S, h, shW, target, pole, rail) {
    const ax = target.pos.clone().sub(shW).normalize(); let best = null;
    if (target.free && h.ropeTurn != null) return h.ropeTurn; // (on a rope: chosen with the grip, wrapTarget)
    for (const a of TURNS) {
      const ik = twoBone(shW, target.pos, A.L1, A.L2, pole.clone().applyAxisAngle(ax, a)), w = wristAngles(shW, ik.elbow, ik.wrist, target.quat, loc[S], S);
      const c = limitsPen(w) * 4 + (Math.abs(w.flex) + Math.abs(w.rad)) * 0.02 + Math.abs(a) * 0.25 + angDiff(a, h.turnTo ?? 0) * 0.6 + railCost(shW, ik, rail);
      if (!best || c < best.c) best = { c, a };
    }
    return best.a;
  }
  // (how far an arm goes into the top rail, in metres: the deeper of its upper arm and forearm, in the body's own frame,
  // the rail along x at (rail.y, rail.z); below 0, clear by that much)
  const RAIL_TURN = 14;
  function railPen(shW, ik, rail) {
    const sh = shW.clone().applyMatrix4(MgInv), e = ik.elbow.clone().applyMatrix4(MgInv), w = ik.wrist.clone().applyMatrix4(MgInv);
    const d = (a, b) => { const dy = b.y - a.y, dz = b.z - a.z, l2 = dy * dy + dz * dz, t = l2 ? clamp(((rail.y - a.y) * dy + (rail.z - a.z) * dz) / l2, 0, 1) : 0; return Math.hypot(a.y + dy * t - rail.y, a.z + dz * t - rail.z); };
    return Math.max(0.05 + 0.026 + 0.005 - d(sh, e), 0.04 + 0.026 + 0.005 - d(e, w));
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
      if (h.poleL && dt > 0) { const ang = h.poleL.angleTo(d), max = (casting ? 8 + Math.max(0, castT - 0.3) * 60 : POLE_MAX) * dt; if (ang > max) { const q = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(h.poleL, d), max / ang); d.copy(h.poleL).applyQuaternion(q).normalize(); } } // (the turn worked out before d is overwritten: worked out after, from d already set back to where it was, it was no turn at all, and an elbow whose pointing jumped further than a frame's worth stayed where it was for good)
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
    // (and never into the rail: where the turn chosen, still easing round, puts the elbow or the forearm into the top rail,
    // the elbow is turned about the shoulder-to-hand line by the least that clears it. Leaning out quickly to lower the
    // drop net, the elbow sagged onto the rail while its turn caught up: the upper arm 7 cm into it in
    // tools/rail-test.mjs, 15 November. Measured as that test measures: an upper arm 5 cm thick, a forearm 4, the rail 2.6.
    // The least turn found exactly (stepping out, then halving), the same way round as last time where that clears, and
    // followed at no more than fourteen radians a second (the elbow at most about 3.5 cm a frame): turned at once in whole
    // steps, either way round, the forearm snapped 21 cm in a frame lowering the net (tools/arm-steady.mjs); at six it
    // lagged the lean out and the arm went 7.6 cm into the rail again)
    if (rail) {
      const ax = target.pos.clone().sub(shW).normalize(), at = (a) => twoBone(shW, target.pos, A.L1, A.L2, pole.clone().applyAxisAngle(ax, a));
      let want = 0;
      if (railPen(shW, ik, rail) > 0) {
        for (const sg of h.railSide ? [h.railSide, -h.railSide] : [1, -1]) {
          let lo = 0, hi = null;
          for (let k = 1; k <= 24; k++) { const a = sg * k * (Math.PI / 48); if (railPen(shW, at(a), rail) <= 0) { hi = a; break; } lo = a; }
          if (hi == null) continue;
          for (let it = 0; it < 6; it++) { const mid = (lo + hi) / 2; if (railPen(shW, at(mid), rail) <= 0) hi = mid; else lo = mid; }
          want = hi; h.railSide = sg; break;
        }
      }
      const cur = h.railA || 0, step = RAIL_TURN * (dt > 0 ? dt : 1 / 60), next = cur + clamp(want - cur, -step, step); h.railA = Math.abs(next) < 1e-5 ? 0 : next;
      if (h.railA) { pole = pole.clone().applyAxisAngle(ax, h.railA); ik = twoBone(shW, target.pos, A.L1, A.L2, pole); }
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
    show(on) { group.visible = !!on; if (!on) for (const h of hands) { h.cur = null; h.kind = undefined; h.poleL = null; h.swivL = null; h.wantAt = null; h.railA = 0; h.railSide = 0; } },
    pose(o) {
      const { hands: specs = [null, null], eye, dt = 0.016 } = o;
      if (!group.visible || !R) return;
      { const down = o.vf ? clamp((-o.vf.y - 0.55) / 0.3, 0, 1) : 0, ct = o.castT, wind = ct == null ? 0 : clamp((ct - 0.12) / 0.15, 0, 1) * (1 - clamp((ct - 0.8) / 0.15, 0, 1));
        const fc = FILM && typeof window !== "undefined" ? window.__fdFpCut || null : null; // (film only: other ways of cutting your sleeves near the eye, to compare)
        // (looking down, your upper arms are drawn whole and your sleeves cut only right by your eye, crisply: faded out
        // over the elbow and dissolving into dots near the eye, the sleeves looked as if they were melting away, hauling
        // the drop net; kept whole they come in from the bottom corners of the picture as your own arms do. Chosen from
        // four ways of drawing it, filmed on Aaron's PC on 18 November)
        nearCut.value += (Math.max(0.16 + (fc?.nearDown ?? 0.04) * down, 0.16 + 0.08 * wind) - nearCut.value) * Math.min(1, dt * 6); cutSoft.value += (0.006 + Math.max(0.06 * wind, (fc?.soft ?? false) ? 0.07 * down : 0) - cutSoft.value) * Math.min(1, dt * 6); lookDown.value = down; upperOn.value = fc?.upper === true ? 1 : 0; }
      const empty = !specs[0] && !specs[1];
      // (nothing in either hand: the arms put away, as in any first-person game; and until the rod and reel are there to
      // take hold of, nothing to hold)
      const wait = empty || specs.some((sp) => sp && (sp.kind === "seat" || sp.kind === "crank") && !sp.sock);
      R.scene.visible = !wait; if (wait) { for (const h of hands) h.away = true; return; }
      group.updateWorldMatrix(true, false); Mg.copy(group.matrixWorld); MgInv.copy(Mg).invert(); qg.setFromRotationMatrix(Mg);
      // (the rod turned from the hold the grips were made at: the hands give to it, below. Not through the middle of a
      // cast, whose own moments were made and checked in Blender with the grips as they are: eased out over its first
      // quarter of a second and back in over its last three tenths)
      const castEnd = RIG.cast.path[RIG.cast.path.length - 1].t;
      const giveK = o.castT == null ? 1 : clamp(Math.max(1 - o.castT / 0.25, (o.castT - CAST_FOLLOW.from) / CAST_FOLLOW.over), 0, 1);
      const turned = giveK > 0 && !!o.holdTurn && 2 * Math.acos(Math.min(1, Math.abs(o.holdTurn.w))) > 0.08;
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
        h.cylHold = Math.max(0, (h.cylHold || 0) - dt); h.casting = o.castT != null;
        // (both arms put away, and now one has something to hold again: it comes up into the view from your side, where
        // a put-away arm hangs, rather than appearing wherever it was last. Taking the drop net's hoop as it came back
        // over the rail, your arm appeared a metre from where it had been, mid-picture, between one frame and the next)
        if (h.away && spec && h.cur) {
          for (const b of [A.U, A.U1, A.F, A.F1, A.H]) b.quaternion.copy(R.rest.get(b.name).q);
          A.U.updateMatrixWorld(true);
          h.cur = { pos: A.H.getWorldPosition(V()), quat: A.H.getWorldQuaternion(new THREE.Quaternion()) }; h.kind = null; h.reachIn = true;
        }
        h.away = false;
        let want;
        if (!spec) {
          // (nothing to hold: the arm hangs at your side, out of the view)
          for (const b of [A.U, A.U1, A.F, A.F1, A.H]) { const r = R.rest.get(b.name); b.quaternion.copy(r.q); }
          A.U.updateMatrixWorld(true);
          want = { pos: A.H.getWorldPosition(V()), quat: A.H.getWorldQuaternion(new THREE.Quaternion()), grip: "relax", kind: null };
        } else if (spec.kind === "seat" && spec.sock) {
          want = { ...seatTarget(spec, Mg, qg), kind: "seat" };
          // (the rod lowered from the hold the grip was made at: the hand doesn't tip all the way with it, the rod lying
          // more across the palm, as you'd hold a rod pointed out over the water. Carried round rigidly, the wrist was
          // cocked 47 degrees to the little finger's side, well past what a wrist does. Half the rod's turn about the
          // palm's own normal is undone, 26 degrees at most, about the point of the rod under the palm; the fingers are
          // then kept outside the handle as ever (clearFingers))
          if (turned) {
            const n = loc[S].palm.clone().applyQuaternion(want.quat).normalize(), hq = qg.clone().multiply(o.holdTurn).multiply(qg.clone().invert());
            const d = hq.x * n.x + hq.y * n.y + hq.z * n.z, tw = new THREE.Quaternion(n.x * d, n.y * d, n.z * d, hq.w);
            if (tw.lengthSq() > 1e-8) {
              tw.normalize(); if (tw.w < 0) tw.set(-tw.x, -tw.y, -tw.z, -tw.w);
              const ang = 2 * Math.acos(Math.min(1, tw.w)), back = (giveK * Math.min(0.45, ang * SEAT_GIVE)) / Math.max(ang, 1e-6);
              const un = new THREE.Quaternion().slerp(tw.invert(), back);
              const sp = spec.sock.pos.clone().applyMatrix4(Mg), ax = (spec.axis ? spec.axis.clone() : V(0, 1, 0)).applyQuaternion(qg).normalize();
              const piv = sp.clone().addScaledVector(ax, want.pos.clone().sub(sp).dot(ax) * 0.5); // (on the rod, half way from the reel's stem between your fingers to abreast of the wrist)
              want.pos.sub(piv).applyQuaternion(un).add(piv); want.quat.premultiply(un);
            }
          }
        }
        else if (spec.kind === "crank" && spec.sock) {
          want = { ...knobTarget(spec, Mg, qg), kind: "crank" };
          // (the knob turns freely in your fingers: with the rod held lower or higher than in the hold the grip was made
          // at, the hand keeps its own angle round the knob's axle instead of tipping with the rod. Carried round with it,
          // a rod lowered to rest across the view tipped the hand forwards and lifted the elbow, sleeve and all, up into
          // the middle of the picture. holdTurn: the rod's turn from the hold, world; only its part about the axle undone)
          if (turned) {
            const ax = V(1, 0, 0).applyQuaternion(spec.sock.quat.clone().premultiply(qg)).normalize(), kp = spec.sock.pos.clone().applyMatrix4(Mg);
            const hq = qg.clone().multiply(o.holdTurn).multiply(qg.clone().invert()); // (the turn in the world's frame, as the grip is)
            const d = hq.x * ax.x + hq.y * ax.y + hq.z * ax.z, tw = new THREE.Quaternion(ax.x * d, ax.y * d, ax.z * d, hq.w);
            if (tw.lengthSq() > 1e-8) {
              // (six tenths of it: all of it hung the hand under the knob with the wrist out of the bottom of the picture)
              tw.normalize().invert(); tw.copy(new THREE.Quaternion().slerp(tw, 0.6 * giveK));
              want.pos.sub(kp).applyQuaternion(tw).add(kp); want.quat.premultiply(tw); if (want.elbow) want.elbow.sub(kp).applyQuaternion(tw).add(kp);
            }
          }
          // (the shoulder rises and falls a little with the knob, as Gate 2's turns have it)
          if (R.clips.reel && RIG.reelTh?.length) { const th = want.th, T = RIG.reelTh; let k = 0, bestD = 1e9; for (let j = 0; j < T.length - 1; j++) { const d = Math.abs(((th - T[j]) + 540) % 360 - 180); if (d < bestD) { bestD = d; k = j; } } const v = R.clips.reel.value((k + 1) / RIG.fps, A.sh.name); if (v) { A.sh.quaternion.fromArray(v); A.sh.updateMatrixWorld(true); } }
        } else want = { ...wrapTarget(h, A, spec, Mg, qg, bodyQ), kind: spec.kind };
        // easing to something new (a short blend whenever what the hand holds changes, or what it holds jumps: the fish
        // on the line becoming the fish in your hand took the left hand 40 cm in a frame); then following it exactly
        // (measured from your body, so turning your head, which carries the hold with it, is never a jump)
        const wl = root.worldToLocal(want.pos.clone()), jumped = h.wantAt && wl.distanceTo(h.wantAt) > Math.max(0.1, 6 * dt); h.wantAt = wl;
        // (a new way of holding the same thing: a short blend to it; mid-blend, the blend under way is begun again from
        // where the hand is with the time it had left: restarted short, an arm coming up into view to the rope covered
        // 60 cm in 0.15 s, and left alone, the hand jumped the 5 cm between the two grips near the end of its blend)
        const swap = h.cylSwap && want.kind === h.kind && !jumped, left = h.u < 1 ? (1 - h.u) * (h.blendT || BLEND) : 0; h.cylSwap = false;
        if (want.kind !== h.kind || !h.cur || jumped || swap) {
          h.from = h.cur ? { pos: h.cur.pos.clone(), quat: h.cur.quat.clone() } : null; h.kind = want.kind; h.u = h.from ? 0 : 1;
          h.blendT = h.reachIn ? REACH_IN : swap ? Math.max(SWAP_BLEND, left) : !spec ? REACH_IN : BLEND; h.reachIn = false; // (an arm let go to hang at your side drops in the same time it takes to come up: in 0.3 s it went at 11 cm a frame)
          h.fingFrom = h.fing ? new Map([...h.fing].map(([n, q]) => [n, q.clone()])) : null;
        }
        h.u = Math.min(1, h.u + dt / (h.blendT || BLEND)); const e = ease(h.u);
        const tgt = h.from ? { pos: h.from.pos.clone().lerp(want.pos, e), quat: h.from.quat.clone().slerp(want.quat, e), elbow: want.elbow || null, free: want.free } : want;
        h.cur = { pos: tgt.pos.clone(), quat: tgt.quat.clone() };
        { const shW = A.U.getWorldPosition(V()); h.short = solveArm(A, S, tgt, bodyQ, h, o.castT != null || !(want.kind === "seat" || want.kind === "crank"), dt, spec?.rail || null, o.castT ?? null).short;
          if (spec && h.short > 0.002) { const arm = shW.clone().sub(camW), ax = arm.clone().cross(tgt.pos.clone().sub(shW)); if (ax.lengthSq() > 1e-10) leanAdd.addScaledVector(ax.normalize(), h.short / Math.max(0.1, arm.length())); }
          if (spec && tgt.pos.distanceTo(shW) > 0.95 * (A.L1 + A.L2)) roomy = false; }
        // the fingers, curled for the grip
        const G = R.grips[want.grip]?.[S] || R.grips.relax?.[S]; h.fing ||= new Map();
        if (G) for (const [n, q] of G) { const b = R.bones.get(n); if (!b) continue; const f = h.fingFrom?.get(n); const qq = f && e < 1 ? f.clone().slerp(q, e) : q; b.quaternion.copy(qq); h.fing.set(n, qq.clone()); }
        // (film only: a finger's joints turned further, about each bone's own x, y, z, for trying a grip by eye)
        const tweak = FILM && typeof window !== "undefined" ? window.__fdFingerTweak : null;
        if (tweak) for (const [n, a] of Object.entries(tweak)) { const b = R.bones.get(n); if (b && n.endsWith(S)) b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(a[0], a[1], a[2]))); }
        A.H.updateMatrixWorld(true);
        // (and kept out of what they're round: the reel seat's lock nut, its trims and the grips; the reel's knob. Worked
        // out again only when the hand moves on it: held still, as it is on the seat while you wait, last frame's answer
        // is the same; winding, each few degrees of the knob's turn is worked out once and kept)
        if ((spec?.kind === "seat" || spec?.kind === "crank") && spec.prof && spec.sock) {
          const sqi = spec.sock.quat.clone().premultiply(qg).invert(), rp = A.H.getWorldPosition(V()).sub(spec.sock.pos.clone().applyMatrix4(Mg)).applyQuaternion(sqi), rq = sqi.multiply(A.H.getWorldQuaternion(new THREE.Quaternion()));
          const crank = spec.kind === "crank", key = crank ? `k${Math.round((want.th || 0) / 4)}` : "seat";
          if (h.clears?.prof !== spec.prof) { h.clears = new Map(); h.clears.prof = spec.prof; }
          const c = h.clears.get(key);
          if (c && !tweak && h.u >= 1 && c.p.distanceTo(rp) < (crank ? 0.0015 : 2e-4) && c.q.angleTo(rq) < (crank ? 0.04 : 0.005)) { for (const [b, q] of c.qs) b.quaternion.copy(q); A.H.updateMatrixWorld(true); h.lift = c.lift; }
          else { h.lift = clearFingers(R.fingers[S], spec, Mg, qg); if (h.u >= 1) h.clears.set(key, { p: rp, q: rq, lift: h.lift, qs: R.fingers[S].flatMap((segs) => segs.map(({ b }) => [b, b.quaternion.clone()])) }); }
        } else h.lift = 0;
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
