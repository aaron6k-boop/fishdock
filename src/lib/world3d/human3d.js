// ---- human3d: a realistic person for the 3D view (a rigged, licensed glTF model), posed like figure3d's figure ----
// The people are Microsoft Rocketbox avatars (MIT licence; public/people/CREDITS.txt): real proportions, faces, hands
// with fingers and proper clothes, on one shared skeleton, with motion-captured walks (slow, normal, brisk, a jog),
// standing about and looking round. They're loaded on demand (about a megabyte each) and shared by everyone who
// chose the same person; until one has loaded, or if it can't, the simple drawn figure (figure3d.js) stands in.
//
// It takes the same inputs as figure3d's pose(), so angler.js doesn't care which it's driving:
//  - walking: the walk clips are blended by speed and their phase is driven by the distance actually walked; a foot
//    that has come down is held there by leg IK until it lifts (no sliding), on the ground's own height; turning on
//    the spot is a pivot on the turning steps; the body leans into setting off, stopping and turning, with a moment's
//    weight shift first and a settle at the end, the chest and head leading a turn; a slow breath standing
//  - standing: the idle (breathing, shifting weight), now and then a look round; crouching and bracing lower the hips
//    and bend the knees with the feet kept where they stand (leg IK), the left foot forward against a fish
//  - the chest leans and turns (spine), the head turns to watch the rod tip, the float, the fish (neck and head)
//  - each hand goes where angler.js asks (two-bone arm IK, eased on and off), turned to grip what it holds with the
//    fingers curled round it; a free hand keeps the motion capture (the arm swinging as they walk)
//  - blinking, and the jaw moving while they talk in voice chat
// The clothes: the jacket, trousers and boots can be recoloured (keeping the fabric's folds, stitching and zips from
// its texture), with gloves, wellies, a hat or the jacket's hood (up or down) and a life jacket added on; in the rain the cloth
// darkens and goes glossy, and in a wind the jacket's hem stirs.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createFigure, twoBone } from "./figure3d.js";
import { lookFor, COATS, LEGS, FOOTWEAR, SKINS } from "./people.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// (the feet when you stop: a foot more than SETTLE_AT from where it would stand is stepped back under you in SETTLE_T;
// and two feet are never nearer than FEET_GAP, ankle to ankle, along the deck)
const SETTLE_AT = 0.11, SETTLE_T = 0.42, FEET_GAP = 0.15, STEP_AT = 0.3;
// (a free hand's clearance from its thigh's line and from the spine's, along the deck: a thigh is about 8 cm round the
// bone, the hand 4 to 5 cm thick; the belly and hips about 15 from the spine)
const CLEAR_THIGH = 0.12, CLEAR_BODY = 0.19;
const rngOf = (seed) => { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- loading: each file once, shared ----
export const PEOPLE_BASE = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/people/";
let loader = null;
const files = new Map();
function loadGLB(name) {
  if (!files.has(name)) { loader ||= new GLTFLoader(); const p = loader.loadAsync(PEOPLE_BASE + name + ".glb"); p.catch(() => files.delete(name)); files.set(name, p); }
  return files.get(name);
}
// ---- the detail of the people's clothes and faces ----
// Each person comes in two files: name.glb (their textures at 1024 px, about a megabyte, for a phone) and
// name_hd.glb (the Rocketbox library's own 2048 px colour and finer normal maps, two to three megabytes), which the
// High quality and Ultra settings load (world.js setPeopleDetail), falling back to the lighter file if it can't
export let PEOPLE_HD = false;
export function setPeopleDetail(on) { PEOPLE_HD = !!on; }
const personGLB = (name) => (PEOPLE_HD ? loadGLB(name + "_hd").catch(() => loadGLB(name)) : loadGLB(name));
// the walks' own speeds where a clip carries no travel of its own (measured from the feet), m/s at the model's size
const LOCO = ["walk_slow", "walk", "walk_fast", "run", "sprint"];
// (where a walk becomes a run, m/s at the model's size: the brisk walk up to the first, the run from the second; and
// where the jog (Rocketbox's own run, captured at 2.4 m/s) gives way to the full run (SPRINT), both running gaits with
// their footfalls lined up by calibrate())
export const GAIT = [1.95, 2.25], RUN_UP = [2.7, 3.0];
// (the full run: Mixamo's "Standard Run", retargeted onto the same skeleton in Blender with the other Mixamo movements
// (anims2.glb x_run, source-assets/blender/retarget_mixamo.py) and in place. Its speed, from its own planted foot
// moving back under the hips, about 3.3 m/s at 2.7 steps a second, against the same measure on the Rocketbox walk and
// jog (within 2 and 7 per cent of their stated 1.39 and 2.42 m/s): 15 November)
export const SPRINT_SPEED = 3.35;
/**
 * The movements' weights at a speed vs (m/s), from the clips' own speeds sp (walk_slow, walk, walk_fast, run) at the
 * person's size k: { w: { idle, walk_slow, walk, walk_fast, run }, stretch } (stretch: how much longer than the clips'
 * the stride is).
 * A walk or a run, not a mixture: people walk up to about 2 m/s and then break into a run, they don't do a bit of
 * each. Between the brisk walk and the run the brisk walk lengthens its stride, and from GAIT[0] to GAIT[1] it gives way
 * to the run over a few steps. Before 15 November the walks and the run were blended by speed all the way from the brisk
 * walk (1.5 m/s) to the run (2.4), so walking at the game's 1.8 m/s was a third of a jog.
 * Away from the speed a clip was filmed at, a walk's stride and its steps' pace each take the square root of the
 * difference, as people's do: faster, longer strides as well as quicker ones; slower, shorter ones. A run speeds up
 * mostly by lengthening the stride (four fifths of the difference) and only a little by quicker steps: the run was
 * captured at 2.4 m/s with short steps, and taken to 3.2 m/s half and half it made 3.2 steps a second, faster than a
 * runner's 2.7 to 3 (the planted foot is held by the leg IK, so a stretched stride doesn't slide).
 */
export function gaitWeights(vs, sp, k = 1) {
  const w = { idle: 0, walk_slow: 0, walk: 0, walk_fast: 0, run: 0, sprint: 0 };
  if (vs < 0.05) w.idle = 1;
  else if (vs < sp[0]) { const f = vs / sp[0]; w.idle = 1 - f; w.walk_slow = f; }
  else if (vs <= sp[2]) { let i = 0; while (i < 2 && vs > sp[i + 1]) i++; const f = clamp((vs - sp[i]) / Math.max(0.01, sp[i + 1] - sp[i]), 0, 1); w[LOCO[i]] = 1 - f; w[LOCO[i + 1]] = f; }
  else { const g = ease((vs - GAIT[0] * k) / ((GAIT[1] - GAIT[0]) * k)); w.walk_fast = 1 - g; w.run = g;
    // (and the jog into the full run, where there is one)
    if (sp[4] > 0 && g >= 1) { const h = ease((vs - RUN_UP[0] * k) / ((RUN_UP[1] - RUN_UP[0]) * k)); w.run = 1 - h; w.sprint = h; } }
  let ws = 0, vClip = 0; LOCO.forEach((key, i) => { if (!(sp[i] > 0)) return; ws += w[key]; vClip += w[key] * sp[i]; });
  const share = 0.5 + 0.3 * (ws > 0 ? (w.run + w.sprint) / ws : 0);
  return { w, stretch: ws > 0 && vClip > 0 && vs >= sp[0] ? clamp((vs / (vClip / ws)) ** share, 0.85, 1.35) : 1 };
}
// the retargeted poses blended in while standing (fish_idle: holding a rod; kneel and inspect: down by the fish or the
// net; crouch: a lower stance)
const POSES = ["fish_idle", "kneel", "inspect", "crouch"];
// and the moves played on cue (pose({ act: { key, t, w } }): the clip at time t, blended in at weight w)
const ACTS = ["cast", "pull_rope", "turn_l", "turn_r", "pick_up"];
const SPEED0 = { m: { walk_slow: 0.81, walk: 1.39, walk_fast: 1.49, run: 2.42 }, f: { walk_slow: 0.88, walk: 1.28, walk_fast: 1.51, run: 2.25 } };
let clipsP = null;
function clipSet() {
  clipsP ||= loadGLB("anims").then(async (g) => {
    const out = { m: {}, f: {} };
    for (const c of g.animations) { const sex = c.name.startsWith("f_") ? "f" : "m"; const key = c.name.slice(2); out[sex][key] = prepClip(c, SPEED0[sex][key]); }
    // Mixamo movements retargeted onto the same skeleton in Blender (anims2.glb, source-assets/blender/
    // retarget_mixamo.py): a fishing stance, kneeling, crouching, kneeling to look closely at something. Both sexes.
    // Without it (offline, an old cache) the procedural poses stand in, as before
    try { const g2 = await loadGLB("anims2"); for (const c of g2.animations) { const key = c.name.slice(2); if (c.name.startsWith("x_") && (POSES.includes(key) || ACTS.includes(key))) out.m[key] = out.f[key] = c; if (c.name === "x_run") out.m.sprint = out.f.sprint = prepClip(c, SPRINT_SPEED); } } catch { /* the procedural poses */ }
    return out;
  });
  clipsP.catch(() => { clipsP = null; });
  return clipsP;
}
// the hips' forward travel taken out of a walk (so it walks on the spot and the angler's own movement carries it), and
// how far one loop travels, for matching the stride to the ground covered
function prepClip(c, speed0) {
  const clip = c.clone();
  const tr = clip.tracks.find((t) => t.name === "Bip01.position");
  let travel = 0;
  if (tr && tr.times.length > 1) {
    const v = tr.values, n = tr.times.length, dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2], T = tr.times[n - 1] - tr.times[0] || 1;
    travel = Math.hypot(dx, dz) * 0.01;
    if (travel > 0.05) for (let i = 0; i < n; i++) { const f = (tr.times[i] - tr.times[0]) / T; v[i * 3] -= dx * f; v[i * 3 + 2] -= dz * f; }
    else travel = 0;
  }
  if (!travel && speed0) travel = speed0 * clip.duration;
  clip.userData = { travel };
  return clip;
}

// ---- the clothes: recolouring by body region, wet in the rain, the hem in the wind ----
// region per vertex, from the bone that moves it most: top (jacket), legs (trousers), feet (boots), hands (gloves)
const REGION = (name, y, hemY) => {
  if (/Hand|Finger/.test(name)) return 3;
  if (/Foot|Toe/.test(name)) return 2;
  if (/Calf/.test(name)) return 1;
  if (/Thigh|Pelvis|Bip01_Spine$/.test(name)) return y > hemY ? 0 : 1;
  if (/Clavicle|UpperArm|Forearm|Spine1|Spine2|Neck/.test(name)) return 0;
  return -1;
};
const prepped = new WeakMap();
function prepGeometry(geo, bones) {
  if (prepped.has(geo)) return prepped.get(geo);
  // (the meshes are z-up, in their own units: height is along z)
  geo.computeBoundingBox();
  const bb = geo.boundingBox, H = bb.max.z - bb.min.z;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, pos = geo.attributes.position, n = pos.count;
  const info = { minZ: bb.min.z, H, hemOf: (hem) => bb.min.z + hem * H };
  prepped.set(geo, info);
  info.make = (hem) => {
    const hemY = info.hemOf(hem), reg = new Float32Array(n * 4), flut = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      const y = pos.getZ(i), r = REGION(bones[best]?.name || "", y, hemY);
      if (r >= 0) reg[i * 4 + r] = 1;
      // the jacket's lower edge stirs (most at the hem, none 25 cm up)
      if (r === 0) flut[i] = clamp(1 - (y - hemY) / (0.14 * H), 0, 1);
    }
    return { reg, flut };
  };
  return info;
}
// ---- body types: slim, medium or broad, one morph on every part of a person, the body and the clothes alike ----
// Each point moves out from (or in towards) the bones that carry it: the torso from the spine's line (wider at the
// sides, fuller in front at the belly, a little at the back), the arms, legs and neck from their bones' lines, and the
// whole arm and leg a little out with the wider chest and hips; the head, hands and feet keep their size. A garment's
// points carry the same bones as the body under them (they were made from it), so the cloth moves with the body and
// the two never cross. Worked out once per mesh from its own bind pose, so it fits every person, old or new.
export const BUILD_AT = [-0.75, 0, 1]; // (BUILDS: Slim, Medium, Broad)
const BULK = { UpperArm: 0.12, Forearm: 0.08, Thigh: 0.1, Calf: 0.06, Neck: 0.1 };
const LIMB_END = { UpperArm: "Forearm", Forearm: "Hand", Thigh: "Calf", Calf: "Foot", Neck: "Head" };
const morphed = new WeakMap();
export function buildMorph(geo, bones, boneInverses, bindMatrixInverse) {
  if (morphed.has(geo)) return morphed.get(geo);
  const at = {}, mt = new THREE.Matrix4();
  bones.forEach((b, i) => { if (b && boneInverses[i]) at[b.name.replace(/^Bip01_/, "")] = new THREE.Vector3().setFromMatrixPosition(mt.copy(boneInverses[i]).invert().premultiply(bindMatrixInverse)); });
  const need = ["Pelvis", "Neck", "Head", "L_UpperArm", "R_UpperArm", "L_Thigh", "R_Thigh", "L_Foot", "R_Foot", "L_Toe0"];
  if (need.some((n) => !at[n])) { morphed.set(geo, null); return null; }
  const feet = at.L_Foot.clone().add(at.R_Foot).multiplyScalar(0.5);
  const up = at.Head.clone().sub(feet).normalize();
  const lat = at.L_UpperArm.clone().sub(at.R_UpperArm); lat.addScaledVector(up, -lat.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, lat); if (at.L_Toe0.clone().sub(at.L_Foot).dot(fwd) < 0) fwd.negate();
  const pel = at.Pelvis, spine = at.Neck.clone().sub(pel), sp2 = spine.lengthSq();
  const half = (n) => Math.abs(at["L_" + n].clone().sub(at["R_" + n]).dot(lat)) / 2;
  const armOut = half("UpperArm") * 0.06, legOut = half("Thigh") * 0.05;
  const K = bones.map((b) => {
    const nm = (b?.name || "").replace(/^Bip01_/, "");
    if (/^(Pelvis|Spine\d?)$/.test(nm)) return { torso: 0.07 };
    if (/Clavicle$/.test(nm)) return { torso: 0.05 };
    const sd = /^([LR])_/.exec(nm), sg = sd ? (sd[1] === "L" ? 1 : -1) : 0;
    const shift = sd && /UpperArm|Forearm|Hand|Finger/.test(nm) ? lat.clone().multiplyScalar(sg * armOut) : sd && /Thigh|Calf|Foot|Toe/.test(nm) ? lat.clone().multiplyScalar(sg * legOut) : null;
    const mm = /^(?:[LR]_)?(UpperArm|Forearm|Thigh|Calf|Neck)$/.exec(nm);
    const a = mm ? at[nm] : null, e = mm ? at[(mm[1] === "Neck" ? "" : nm.slice(0, 2)) + LIMB_END[mm[1]]] : null;
    return a && e ? { a, ax: e.clone().sub(a), k: BULK[mm[1]], shift } : shift ? { shift } : null;
  });
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (!pos || !si || !sw) { morphed.set(geo, null); return null; }
  const n = pos.count, out = new Float32Array(n * 3), p = V(), d = V(), r = V(), q = V();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); d.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(i, j); if (w < 1e-3) continue;
      const k = K[si.getComponent(i, j)]; if (!k) continue;
      if (k.shift) d.addScaledVector(k.shift, w);
      if (k.ax) {
        const t = clamp(r.copy(p).sub(k.a).dot(k.ax) / k.ax.lengthSq(), 0, 1);
        r.copy(p).sub(q.copy(k.a).addScaledVector(k.ax, t)); d.addScaledVector(r, k.k * w);
      } else if (k.torso) {
        const t = clamp(r.copy(p).sub(pel).dot(spine) / sp2, -0.3, 1.2);
        r.copy(p).sub(q.copy(pel).addScaledVector(spine, t));
        const x = r.dot(lat), f = r.dot(fwd), hb = t - 0.28, belly = Math.exp(-(hb * hb) / 0.0968);
        d.addScaledVector(lat, x * k.torso * w).addScaledVector(fwd, f * (f > 0 ? 0.05 + 0.16 * belly : 0.06) * w);
      }
    }
    out[i * 3] = d.x; out[i * 3 + 1] = d.y; out[i * 3 + 2] = d.z;
  }
  const attr = new THREE.BufferAttribute(out, 3); morphed.set(geo, attr); return attr;
}
// the average brightness of each region's fabric (linear), so a new colour keeps the fabric's own light and shade
function regionMeans(map, uv, reg) {
  const out = [0.2, 0.2, 0.2, 0.2];
  try {
    const img = map?.image; if (!img || !uv) return out;
    const S = 128, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
    const px = g.getImageData(0, 0, S, S).data, lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const sum = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
    for (let i = 0; i < uv.count; i += 2) {
      const r = reg[i * 4] ? 0 : reg[i * 4 + 1] ? 1 : reg[i * 4 + 2] ? 2 : reg[i * 4 + 3] ? 3 : -1; if (r < 0) continue;
      const x = clamp(Math.floor((uv.getX(i) % 1 + 1) % 1 * S), 0, S - 1), y = clamp(Math.floor((uv.getY(i) % 1 + 1) % 1 * S), 0, S - 1), o = (y * S + x) * 4;
      sum[r] += 0.2126 * lin(px[o]) + 0.7152 * lin(px[o + 1]) + 0.0722 * lin(px[o + 2]); cnt[r]++;
    }
    for (let r = 0; r < 4; r++) if (cnt[r]) out[r] = Math.max(0.02, sum[r] / cnt[r]);
  } catch { /* a texture we can't read: the default brightness */ }
  return out;
}
// ---- a fine woven-fabric normal map (drawn once): the jacket and trousers read as cloth up close, not painted plastic ----
let weaveTex = null;
function weave() {
  if (weaveTex || typeof document === "undefined") return weaveTex;
  const n = 64, c = document.createElement("canvas"); c.width = c.height = n; const g = c.getContext("2d"), img = g.createImageData(n, n);
  const h = (x, y) => 0.5 + 0.32 * Math.sin(((x + (y >> 2) * 2) % 8) / 8 * Math.PI * 2) * (((x >> 2) + (y >> 2)) % 2 ? 1 : -1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (h((x + 1) % n, y) - h((x + n - 1) % n, y)) * 1.4, dy = (h(x, (y + 1) % n) - h(x, (y + n - 1) % n)) * 1.4, l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  weaveTex = new THREE.CanvasTexture(c); weaveTex.wrapS = weaveTex.wrapT = THREE.RepeatWrapping; weaveTex.repeat.set(48, 48); weaveTex.anisotropy = 4;
  return weaveTex;
}
function clothMaterial(src, U) {
  const m = src.clone();
  // the cloth's weave over the model's own colour; each garment its own finish: a softshell jacket, cotton trousers,
  // rubber wellies with a soft sheen (roughness by region, below)
  if (!m.normalMap && weave()) { m.normalMap = weave(); m.normalScale = new THREE.Vector2(0.35, 0.35); }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 fdRegion; attribute float fdFlutter; varying vec4 vReg; uniform vec3 uWind; uniform float uTime;")
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvReg = fdRegion;\ntransformed += uWind * fdFlutter * (0.6 + 0.4 * sin(uTime * 6.3 + position.x * 0.09 + position.y * 0.07)) * (0.7 + 0.3 * sin(uTime * 2.1 + position.z * 0.05));");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vReg; uniform vec4 uTop; uniform vec4 uLegs; uniform vec4 uFeet; uniform vec4 uHands; uniform vec4 uMean; uniform float uWet;")
      .replace("#include <map_fragment>", `#include <map_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 c = diffuseColor.rgb; float wsum = 0.0; vec3 acc = vec3(0.0);
        float a0 = vReg.x * uTop.a, a1 = vReg.y * uLegs.a, a2 = vReg.z * uFeet.a, a3 = vReg.w * uHands.a;
        acc += a0 * uTop.rgb * clamp(lum / uMean.x, 0.22, 2.6); acc += a1 * uLegs.rgb * clamp(lum / uMean.y, 0.22, 2.6);
        acc += a2 * uFeet.rgb * clamp(lum / uMean.z, 0.22, 2.6); acc += a3 * uHands.rgb * clamp(lum / uMean.w, 0.35, 1.8);
        wsum = a0 + a1 + a2 + a3;
        diffuseColor.rgb = c * (1.0 - clamp(wsum, 0.0, 1.0)) + acc;
        diffuseColor.rgb *= 1.0 - uWet * 0.25 * clamp(vReg.x + vReg.y + vReg.z, 0.0, 1.0);
      }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n{ float wr = vReg.x + vReg.y + vReg.z + vReg.w; if (wr > 0.01) roughnessFactor = (vReg.x * 0.74 + vReg.y * 0.86 + vReg.z * 0.42 + vReg.w * 0.55) / wr; }\nroughnessFactor = mix(roughnessFactor, 0.32, uWet * clamp(vReg.x + vReg.y + vReg.z, 0.0, 1.0));")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n#ifdef USE_NORMALMAP\n{ }\n#endif");
  };
  m.customProgramCacheKey = () => "fdcloth2";
  return m;
}
const tint = (hex, on = 1) => (hex == null ? new THREE.Vector4(0, 0, 0, 0) : (() => { const c = new THREE.Color(hex); return new THREE.Vector4(c.r, c.g, c.b, on); })());

// ---- small knitted / waxed textures for the add-ons ----
let knitTex = null;
// (the beanie's knit, from Poly Haven's knitted_fleece (CC0): its colour in grey, coloured as the hat, and its normal
// map, at its real size: the 26 cm tile about twice round a head)
let knitMaps = null;
function knitPBR() {
  if (knitMaps || typeof document === "undefined") return knitMaps;
  const ld = new THREE.TextureLoader(), set = (t, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 0.62); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  knitMaps = { map: set(ld.load(PEOPLE_BASE + "knit_c.jpg"), true), normalMap: set(ld.load(PEOPLE_BASE + "knit_n.jpg"), false) };
  return knitMaps;
}
function knit() {
  if (knitTex) return knitTex;
  const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d");
  g.fillStyle = "#bdbdbd"; g.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 4) { g.fillStyle = "#e6e6e6"; g.fillRect(x, 0, 2, 64); g.fillStyle = "#9a9a9a"; g.fillRect(x + 3, 0, 1, 64); }
  for (let y = 0; y < 64; y += 3) { g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(0, y, 64, 1); }
  knitTex = new THREE.CanvasTexture(c); knitTex.wrapS = knitTex.wrapT = THREE.RepeatWrapping; knitTex.colorSpace = THREE.SRGBColorSpace; knitTex.repeat.set(6, 2);
  return knitTex;
}

/**
 * A person: the realistic model once it has loaded, the simple drawn figure until then (or if it can't).
 * Same interface as figure3d's createFigure: { group, pose(o), look, top, headAt, eyeAt, hand(i), setFirstPerson(on),
 * ready, dispose() }, plus o.weather = { rain 0..1, wind m/s, windDir [x, z] (figure space) } in pose().
 */
export function createPerson({ id = "", look = null, outfit, venue = "pier", realistic = true } = {}) {
  const L = look || lookFor(id);
  const group = new THREE.Group(); group.name = "person";
  // the simple figure: stands in while the model loads, and gives you your forearms and hands in first person (a whole
  // body's arm, sleeve and shoulder that close to the eye fills the screen); dressed in your jacket colour and gloves
  const standOutfit = { ...(outfit || {}), jacket: COATS[L.coat]?.hex ?? outfit?.jacket };
  const stand = createFigure({ id, look: L.gloves ? { ...L, skinHex: 0x23262a } : L, outfit: standOutfit, venue }); group.add(stand.group);
  let H = null, fp = false, gone = false;
  // (in first person none of the body is drawn: your arms and hands are drawn on their own, fpRig.js)
  const show = () => { if (H) H.root.visible = !fp; stand.group.visible = !H && !fp; };
  if (realistic && typeof document !== "undefined") {
    Promise.all([personGLB(L.file || "gardener"), clipSet()]).then(([g, clips]) => {
      if (gone) return;
      H = makeHuman(L, g, clips[L.sex === "f" ? "f" : "m"], outfit, venue);
      group.add(H.root); H.setFirstPerson(fp); show();
    }).catch((e) => { if (typeof console !== "undefined") console.warn("person model:", e?.message || e); });
  }
  const who = () => H || stand;
  return {
    group, look: L,
    // (the model is posed every frame even while hidden, so it's ready the moment it shows)
    pose(o) { if (H) H.pose(o); else stand.pose(o); },
    get ready() { return !!H; },
    get top() { return (H || stand).top; },
    get headAt() { return who().headAt; },
    get eyeAt() { return who().eyeAt; },
    get gaze() { return H ? H.gaze : null; },
    hand(i) { return who().hand(i); },
    get chest() { return H ? H.chest : null; },
    setFirstPerson(on) { fp = !!on; H?.setFirstPerson(fp); show(); },
    dispose() { gone = true; stand.dispose(); H?.dispose(); },
  };
}

function makeHuman(L, gltf, clips, outfit, venue) {
  const rnd = rngOf((L.seed || 7) ^ 0x5bd1e995);
  const model = cloneSkinned(gltf.scene);
  const inner = new THREE.Group(); inner.rotation.y = Math.PI; inner.add(model); // the models face +z; the figure faces -z
  const root = new THREE.Group(); root.name = "human"; root.add(inner);
  const k = 0.97 + ((L.seed >>> 4) & 255) / 255 * 0.06; root.scale.setScalar(k); // a little taller or shorter, per person
  const bone = {}; let skinned = [];
  model.traverse((o) => { if (o.isBone || o.name?.startsWith("Bip01")) bone[o.name] = o; if (o.isSkinnedMesh) skinned.push(o); });
  // fewer draw calls: the model comes as several pieces sharing one set of vertices; joined into one mesh per material
  // (body, head, hair), the joined geometry made once per model and shared by everyone who chose that person
  skinned = mergeByMaterial(skinned, gltf);
  const B = (n) => bone["Bip01_" + n];
  // ---- levels of detail (the new people: every part also as <part>_lod1 and <part>_lod2, about 25,000 and 8,000
  // triangles against 60,000): the set drawn picked by how far the camera is, a frame behind (found when one of them
  // is drawn for the view itself, not for a shadow or the water's mirror), with a margin so it doesn't flicker ----
  const lodOf = (o) => { for (let p = o; p && p !== model; p = p.parent) { const mm = /_lod([12])(?:_\d+)?$/.exec(p.name || ""); if (mm) return +mm[1]; } return 0; };
  const lodSets = [[], [], []]; for (const m of skinned) lodSets[lodOf(m)].push(m);
  let lodNow = -1; const camAt = V(), meAt = V();
  const setLod = (n) => { if (n === lodNow) return; lodNow = n; lodSets.forEach((set, i) => set.forEach((m) => { m.visible = i === n && !m.userData.off; })); };
  if (lodSets[1].length) {
    setLod(0);
    const pick = (_r, _s, cam) => {
      if (!cam || cam.isOrthographicCamera || cam.userData?.fdMirror) return;
      const d = camAt.setFromMatrixPosition(cam.matrixWorld).distanceTo(root.getWorldPosition(meAt));
      let want = d < (lodNow === 1 ? 11 : 13) ? 0 : d < (lodNow === 2 ? 32 : 36) ? 1 : 2;
      while (want > 0 && !lodSets[want].length) want--; // (the light file has two levels)
      setLod(want);
    };
    for (const set of lodSets) for (const m of set) m.onBeforeRender = pick;
  }

  // ---- materials: the clothes recolourable, the hair soft-edged ----
  // (your own angler, coat "as they come": the model's top is coloured as your outfit's jacket, the same jacket as the
  // sleeves you see in first person, and bare hands are bare, as there, not the model's own gardening gloves. Left as the model came, the 8 November recording showed navy sleeves in first
  // person and a white cardigan in third)
  const U = { uTop: { value: tint(COATS[L.coat]?.hex ?? (outfit?.sameTop ? outfit.jacket : null)) }, uLegs: { value: tint(LEGS[L.legs]?.hex) }, uFeet: { value: tint(FOOTWEAR[L.boots]?.hex) }, uHands: { value: tint(L.gloves ? 0x1c1e21 : outfit?.sameTop && !L.v2 ? (SKINS[L.skin]?.hex ?? 0xc99a74) : null) }, uMean: { value: new THREE.Vector4(0.2, 0.2, 0.2, 0.2) }, uWet: { value: 0 }, uWind: { value: V() }, uTime: { value: 0 } };
  // (the new people's bare hands keep their own skin, as their faces do: coloured flat as the skin tone they came out
  // orange beside a face drawn from its photographed texture, in the 18 November film)
  // ---- the modelled clothes (people with clothes: their own jacket, trousers and wellies, made in Blender) ----
  // coloured as the kit, and the body's own clothes underneath the same colours, so anywhere the body shows through a
  // seam it's the same cloth
  const worn = skinned.some((m) => /^fd2?_(jacket|trousers|boots)/.test(m.material?.name || ""));
  // ("as they come" for the new people (people.js own): their own colours, the main angler's black jacket and green wellies)
  const own = L.own || null;
  const wornHex = worn ? { jacket: COATS[L.coat]?.hex ?? own?.coat ?? outfit?.jacket ?? 0x1d3150, trousers: LEGS[L.legs]?.hex ?? own?.legs ?? 0x3b3e42, boots: FOOTWEAR[L.boots]?.hex ?? own?.boots ?? 0x2f4a2c } : null;
  if (worn) { U.uTop.value = tint(wornHex.jacket); U.uLegs.value = tint(wornHex.trousers); U.uFeet.value = tint(wornHex.boots); }
  const mats = [];
  let unit = 1, clothMesh = null; const clothInv = new THREE.Matrix4(); // metres per unit of the meshes' own geometry
  for (const m of skinned) {
    m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    const mat = m.material;
    // the new people's clothes (source-assets/blender/people2): their own colour, normal and roughness maps, the
    // colour map the cloth's detail in grey, coloured as the kit; the beard's strands cut out by their alpha; the studs,
    // toggles and buckles as they come
    { const w2 = /^fd2_(jacket|trousers|boots|beard|trim)/.exec(mat.name || "");
      if (w2) {
        let c = mat.clone();
        if (w2[1] === "beard") {
          // (the beard's three layers of hair, in the colour chosen for the hair: close to the skin and dense, then
          // two further out over less of the face; the strands' soft edges kept with alpha to coverage. Stubble is the
          // inner layer alone, thinned; none hides them all)
          const layer = /_c$|_c_/.test(mat.name) ? 2 : /_b$|_b_/.test(mat.name) ? 1 : 0;
          c.transparent = false; c.alphaTest = L.beard === 1 ? 0.62 : [0.3, 0.4, 0.46][layer]; c.alphaToCoverage = true; c.depthWrite = true; c.side = THREE.DoubleSide; c.roughness = 0.62; c.metalness = 0;
          if (L.hairHex != null) c.color = new THREE.Color(L.hairHex).multiplyScalar([1.35, 1.5, 1.65][layer]);
          if (L.beard === 0 || (L.beard === 1 && layer > 0)) m.userData.off = true;
        }
        else if (w2[1] !== "trim") {
          c.color = new THREE.Color(wornHex[w2[1]]); c.metalness = 0; c.roughness = 1; if (c.normalMap) c.normalScale = new THREE.Vector2(1, 1);
          // (the jacket and trousers as cloth: a soft sheen at grazing angles, as coated polyester has, so the folds and
          // creases read on a black jacket instead of it going flat; the rubber boots keep their own satin finish)
          if (w2[1] !== "boots") {
            const pm = new THREE.MeshPhysicalMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(pm, c); pm.defines = { STANDARD: "", PHYSICAL: "" };
            pm.sheen = w2[1] === "jacket" ? 0.7 : 0.5; pm.sheenRoughness = 0.5; pm.sheenColor = c.color.clone().lerp(new THREE.Color(0.75, 0.77, 0.8), 0.3);
            c = pm;
          }
        }
        m.material = c; mats.push(c); continue;
      }
    }
    { const w = /^fd_(jacket|trousers|boots)/.exec(mat.name || "");
      if (w) { const c = mat.clone(); c.map = null; c.color = new THREE.Color(wornHex[w[1]]); if (w[1] === "boots") { c.roughness = 0.38; c.metalness = 0; } else if (weave()) { c.normalMap = weave(); c.normalScale = new THREE.Vector2(0.5, 0.5); } m.castShadow = true; m.frustumCulled = false; m.material = c; mats.push(c); continue; } }
    // (hair and eyelashes: for the new people cut out with alpha to coverage, so the strands' edges stay soft and they
    // sort themselves, a ponytail no longer drawn through the head behind it)
    if (/opacity/.test(mat.name) && L.v2) { const h = mat.clone(); h.transparent = false; h.alphaTest = 0.3; h.alphaToCoverage = true; h.depthWrite = true; h.side = THREE.DoubleSide; m.material = h; mats.push(h); continue; }
    if (/opacity/.test(mat.name)) { const h = mat.clone(); h.transparent = true; h.alphaTest = 0.04; h.depthWrite = false; m.material = h; mats.push(h); m.renderOrder = 1; continue; }
    // the new people's skin: a faint, warm sheen at grazing angles (the light skin scatters back), over its own
    // roughness map (oilier forehead and nose, wet eyes)
    if (L.v2 && /head/.test(mat.name)) {
      const hm = new THREE.MeshPhysicalMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(hm, mat); hm.defines = { STANDARD: "", PHYSICAL: "" };
      hm.sheen = 0.35; hm.sheenRoughness = 0.55; hm.sheenColor = new THREE.Color(0.95, 0.62, 0.52); hm.specularIntensity = 0.55;
      if (hm.roughnessMap) hm.roughness = 1;
      m.material = hm; mats.push(hm); continue;
    }
    if (/body/.test(mat.name)) {
      const info = prepGeometry(m.geometry, m.skeleton.bones);
      if (!m.geometry.attributes.fdRegion) { const { reg, flut } = info.make(L.hem || 0.5); m.geometry.setAttribute("fdRegion", new THREE.BufferAttribute(reg, 4)); m.geometry.setAttribute("fdFlutter", new THREE.BufferAttribute(flut, 1)); m.geometry.userData.means = regionMeans(mat.map, m.geometry.attributes.uv, reg); }
      U.uMean.value.fromArray(m.geometry.userData.means || [0.2, 0.2, 0.2, 0.2]);
      unit = 1.8 / Math.max(1e-6, info.H);
      const c = clothMaterial(mat, U); m.material = c; mats.push(c); clothMesh = m; continue;
    }
    const c = mat.clone(); m.material = c; mats.push(c);
  }

  for (const m of skinned) if (m.userData.off) m.visible = false;
  // ---- the body type (people.js BUILDS): the same morph on the body and everything worn, every level of detail ----
  // (every mesh gets the morph, a medium build at nought, as the geometry is shared by everyone who chose this person)
  const build = BUILD_AT[L.build] ?? 0;
  for (const m of skinned) {
    const g = m.geometry, D = g.morphAttributes.position?.[0] || buildMorph(g, m.skeleton.bones, m.skeleton.boneInverses, m.bindMatrixInverse);
    if (!D) continue;
    if (!g.morphAttributes.position) { g.morphAttributes.position = [D]; g.morphTargetsRelative = true; }
    m.updateMorphTargets(); m.morphTargetInfluences[0] = build;
  }

  // ---- motion: the clips on one mixer ----
  const mixer = new THREE.AnimationMixer(model);
  const act = {};
  for (const key of ["idle", "look", ...LOCO, ...POSES, ...ACTS]) { const c = clips[key]; if (!c) continue; const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(key === "idle" ? 1 : 0); act[key] = a; }
  const speedOf = (key) => (clips[key]?.userData.travel || 1) / (clips[key]?.duration || 1) * k;
  // each walk's phase lined up (left heel down at 0), found once per set of clips
  const offs = clips.__offs || (clips.__offs = calibrate(mixer, act, B, clips));

  // ---- the rest pose and sizes, for the add-ons and the head ----
  const tmp = { v: V(), w: V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
  const toFig = (w, out = V()) => root.parent ? root.parent.worldToLocal(out.copy(w)) : out.copy(w); // world → the figure's space (group)
  const groupOf = () => root.parent;
  mixer.update(0); root.updateMatrixWorld(true);
  const restAt = (n) => { const w = B(n).getWorldPosition(V()); return root.worldToLocal(w).multiplyScalar(1).applyMatrix4(new THREE.Matrix4().makeScale(k, k, k)); };
  // (positions in the root's parent space at the rest pose: root has only a scale)
  const bounds = measure(skinned, root, k);
  const top0 = bounds.top, headY0 = restAt("Head").y;
  const armLen = { L: B("L_Forearm").position.length() * 0.01 * k, R: B("R_Forearm").position.length() * 0.01 * k };
  const handLen = B("R_Finger2").position.length() * 0.01 * k;
  const GRIP = V(0, handLen * 0.88, 0.028 * k); // where a held handle runs through the hand: along the fingers, towards the palm

  // ---- add-ons, made at the rest pose in the figure's space and then carried by a bone ----
  const extra = [], extraMats = [];
  const attach = (boneName, obj) => {
    root.updateMatrixWorld(true);
    const b = B(boneName); obj.updateMatrix();
    const objW = new THREE.Matrix4().multiplyMatrices(root.matrixWorld, new THREE.Matrix4().makeScale(1 / k, 1 / k, 1 / k)).multiply(obj.matrix);
    obj.matrix.copy(new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(objW)); obj.matrixAutoUpdate = false;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; extra.push(o); } });
    b.add(obj); return obj;
  };
  const hatCol = new THREE.Color(outfit?.hat ?? 0x8a2f2a), coatHex = COATS[L.coat]?.hex ?? outfit?.jacket ?? 0x1f3a5f;
  const kp = L.v2 ? knitPBR() : null;
  const knitMat = kp ? new THREE.MeshStandardMaterial({ color: hatCol, map: kp.map, normalMap: kp.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.95 }) : new THREE.MeshStandardMaterial({ color: hatCol, map: knit(), roughness: 1 }); extraMats.push(knitMat);
  const capMat = new THREE.MeshStandardMaterial({ color: hatCol.clone().multiplyScalar(0.8), roughness: 0.85 }); extraMats.push(capMat);
  const hoodMat = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.8 }); extraMats.push(hoodMat);
  const hd = bounds.head; // { cx, cz, rx, rz (the head with its hair, above the eyes), eye (eye height), top }
  const hats = new THREE.Group(); hats.name = "hat";
  const brow = hd.eye + 0.045; // where a hat's front edge sits, just above the eyebrows
  if (L.hat === 0) {
    // a beanie: snug over the head and hair, pulled down at the back and over the ears, with a turned-up cuff
    // (pulled well down: the cuff's lower edge at the brow in front and over the tops of the ears behind, the crown close
    // over the head, not perched on top of it)
    const cy = brow - 0.04, ry = hd.top + 0.026 - cy;
    const dome = new THREE.Group(); dome.position.set(hd.cx, cy, hd.cz + 0.006); dome.rotation.x = 0.14; hats.add(dome);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), knitMat); m.scale.set(hd.rx + 0.008, ry, hd.rz + 0.01); dome.add(m);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1, 1, 26, 1, true), knitMat); cuff.scale.set(hd.rx + 0.01, 0.05, hd.rz + 0.012); cuff.position.y = 0.022; dome.add(cuff);
  } else if (L.hat === 1) {
    // a cap: a crown over the head and a peak over the eyes
    const cy = brow, ry = Math.max(0.05, hd.top + 0.012 - cy);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat); crown.scale.set(hd.rx + 0.01, ry, hd.rz + 0.01); crown.position.set(hd.cx, cy, hd.cz); crown.rotation.x = 0.1; hats.add(crown);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.007, 22, 1, false, Math.PI * 0.58, Math.PI * 0.84), capMat); peak.scale.set((hd.rx + 0.01) * 0.95, 1, (hd.rz + 0.01) * 1.6); peak.position.set(hd.cx, cy + 0.004, hd.cz); peak.rotation.x = 0.16; hats.add(peak);
  } else if (L.hat === 2) {
    // a waxed bucket hat: a crown with a flat top, a brim sloping down all round
    const cy = brow - 0.01, ry = clamp(hd.top + 0.02 - cy, 0.06, 0.1);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1, 1, 26, 1, false), capMat); crown.scale.set(hd.rx + 0.016, ry, hd.rz + 0.016); crown.position.set(hd.cx, cy + ry / 2, hd.cz); hats.add(crown);
    const topc = new THREE.Mesh(new THREE.CircleGeometry(1, 26), capMat); topc.rotation.x = -Math.PI / 2; topc.scale.set((hd.rx + 0.016) * 0.88, (hd.rz + 0.016) * 0.88, 1); topc.position.set(hd.cx, cy + ry, hd.cz); hats.add(topc);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, 0.045, 30, 1, true), new THREE.MeshStandardMaterial({ color: capMat.color, roughness: 0.85, side: THREE.DoubleSide })); extraMats.push(brim.material);
    brim.scale.set(hd.rx + 0.016, 1, hd.rz + 0.016); brim.position.set(hd.cx, cy - 0.016, hd.cz); hats.add(brim);
  }
  if (hats.children.length) attach("Head", hats);
  // glasses: a thin frame (dark tortoiseshell) with clear lenses, or black sunglasses with dark lenses; the lenses in
  // front of the eyes, the arms along the sides of the head to behind the ears
  if (L.glasses) {
    const f = hd.face || { front: hd.cz - hd.rz, side: hd.rx }, sun = L.glasses === 2;
    const eyes = ["LEye", "REye"].map((n) => (B(n) ? restAt(n).x : null));
    const ex = eyes.every((x) => x != null) && Math.abs(eyes[0] - eyes[1]) > 0.04 ? eyes : [hd.cx - 0.032, hd.cx + 0.032];
    const y = hd.eye + 0.003, z = f.front - 0.009, w = sun ? 0.029 : 0.025, h = sun ? 0.021 : 0.017, tr = sun ? 0.0021 : 0.0015;
    const rimMat = new THREE.MeshStandardMaterial({ color: sun ? 0x121315 : 0x3a2a20, roughness: 0.32, metalness: sun ? 0.1 : 0.05 });
    const lensMat = new THREE.MeshStandardMaterial({ color: sun ? 0x0d1114 : 0xdfe8ee, transparent: true, opacity: sun ? 0.86 : 0.1, roughness: 0.04, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide });
    extraMats.push(rimMat, lensMat);
    const gl = new THREE.Group(); gl.name = "glasses";
    const outline = (cx, sg) => { const pts = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a); pts.push(new THREE.Vector2(cx + Math.sign(c) * Math.abs(c) ** 0.55 * w * (c * sg > 0 ? 1.04 : 0.96), y + Math.sign(s2) * Math.abs(s2) ** 0.7 * h * (s2 < 0 ? 0.9 : 1))); } return pts; };
    for (const cx of ex) {
      const sg = Math.sign(cx - hd.cx) || 1, o2 = outline(cx, sg);
      // (the frame wraps back a little towards the temples)
      const z3 = (p) => z + Math.max(0, (p.x - cx) * sg) / w * 0.004;
      gl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(o2.map((p) => V(p.x, p.y, z3(p))), true), 56, tr, 5, true), rimMat));
      const lens = new THREE.ShapeGeometry(new THREE.Shape(o2), 1), lp = lens.attributes.position;
      for (let i = 0; i < lp.count; i++) lp.setZ(i, z3({ x: lp.getX(i) }) + 0.0005);
      lens.computeVertexNormals(); const lm = new THREE.Mesh(lens, lensMat); lm.renderOrder = 2; lm.castShadow = false; gl.add(lm);
      // the arm: from the frame's outer edge back along the side of the head, over the ear and a little down behind it
      const ox = cx + sg * w * 1.02, sx = hd.cx + sg * (f.side + 0.004);
      gl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(ox, y + h * 0.45, z + 0.004), V(sx, y + h * 0.4, z + 0.03), V(sx + sg * 0.002, y + 0.004, hd.cz + 0.01), V(sx - sg * 0.004, y - 0.022, hd.cz + 0.03)]), 24, tr * 0.9, 5, false), rimMat));
    }
    // the bridge over the nose
    const ins = ex.map((cx) => cx - (Math.sign(cx - hd.cx) || 1) * w * 0.96);
    gl.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(ins[0], y + h * 0.35, z), V(hd.cx, y + h * 0.55, z - 0.002), V(ins[1], y + h * 0.35, z)]), 10, tr, 5, false), rimMat));
    attach("Head", gl);
  }
  // a head torch: an elastic band round the head (over the hat or hood if one's worn), the lamp at the front of it
  if (L.torch) {
    const over = L.hat === 0 ? 0.013 : L.hat === 1 ? 0.012 : L.hat === 2 ? 0.018 : L.hat === 4 ? 0.036 : 0.005;
    const by = brow + 0.026, rx = hd.rx + over, rz = hd.rz + over, pts = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push(V(hd.cx + Math.sin(a) * rx, by + 0.02 * (1 + Math.cos(a)) * 0.5, hd.cz - Math.cos(a) * rz)); } // (a = 0 at the front; the band rides higher at the back)
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.9 }), lampMat = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.45, metalness: 0.2 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, emissive: 0xfff1d0, emissiveIntensity: 0.35, roughness: 0.1 });
    extraMats.push(bandMat, lampMat, lensMat);
    const ht = new THREE.Group(); ht.name = "headTorch";
    ht.add(new THREE.Mesh(strap(new THREE.CatmullRomCurve3(pts, true), (q) => V(q.x - hd.cx, 0, q.z - hd.cz), 0.024, 0.003), bandMat));
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.034, 0.026), lampMat); lamp.position.set(hd.cx, by, hd.cz - rz - 0.012); lamp.rotation.x = -0.12; ht.add(lamp);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.004, 18), lensMat); lens.rotation.x = Math.PI / 2 - 0.12; lens.position.set(hd.cx, by - 0.001, hd.cz - rz - 0.026); ht.add(lens);
    attach("Head", ht);
  }
  // the hood (chosen as "Hood up"): cut to the head like a real jacket's hood rather than a shell over it: close round
  // the back and top of the head with a centre seam, wider below where it meets the collar, open at the face with the
  // edge rolled; lined a shade darker inside
  const hood = new THREE.Group(); hood.name = "hood";
  if (L.hat === 4) {
    const c = V(hd.cx, hd.eye + 0.012, hd.cz + 0.008), rx = hd.rx + 0.03, rz = hd.rz + 0.036, top = hd.top + 0.016 - c.y, low = c.y - (bounds.chest.sh - 0.03);
    // around: a from the left of the face (0) round the back (0.5) to the right (1); up: e from the collar (0) to the crown (1)
    const NA = 34, NE = 18, pos = [], idx = [], edge = [];
    const open = (e) => 0.2 - 0.07 * Math.max(0, e - 0.55) / 0.45 + 0.05 * Math.max(0, 0.35 - e) / 0.35; // (the face's opening: narrower over the brow, wider at the chin)
    const at = (u, e) => {
      const o = open(e), ang = Math.PI * (o + (1 - 2 * o) * u) * 2 - Math.PI; // (ang 0 is straight back)
      const el = e < 0.38 ? -(0.38 - e) / 0.38 * 1.2 : ((e - 0.38) / 0.62) * Math.PI / 2;
      const ce = Math.cos(el), flare = e < 0.38 ? 1 + 0.75 * ((0.38 - e) / 0.38) ** 1.3 : 1; // (spreading onto the shoulders)
      const ridge = 1 + 0.025 * Math.exp(-((ang / 0.3) ** 2)) * Math.sin(Math.max(0, el)); // (a slight ridge down the centre seam)
      // (soft folds where the fabric gathers at the neck and down the sides, so it reads as cloth, not a shell)
      const fold = 1 + (0.035 * Math.max(0, 0.5 - e) + 0.008) * Math.sin(ang * 7 + e * 3) + 0.01 * Math.sin(ang * 13 + e * 9) * (1 - e);
      const x = Math.sin(ang) * rx * ce * flare * 0.97 * fold, z = Math.cos(ang) * rz * ce * flare * ridge * fold;
      const y = el >= 0 ? Math.sin(el) * top : Math.sin(el) / Math.sin(1.2) * low;
      return V(c.x + x, c.y + y, c.z + z + (e < 0.38 ? 0.02 * (0.38 - e) / 0.38 : 0));
    };
    for (let j = 0; j <= NE; j++) for (let i = 0; i <= NA; i++) pos.push(at(i / NA, j / NE));
    for (let j = 0; j < NE; j++) for (let i = 0; i < NA; i++) { const a0 = j * (NA + 1) + i, a1 = a0 + 1, b0 = a0 + NA + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); }
    const g = new THREE.BufferGeometry().setFromPoints(pos); g.setIndex(idx); g.computeVertexNormals();
    const outer = new THREE.Mesh(g, hoodMat); hood.add(outer);
    const lining = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(coatHex).multiplyScalar(0.45), roughness: 0.9, side: THREE.BackSide })); extraMats.push(lining.material); hood.add(lining);
    // the rolled edge round the face, and the peak
    for (let j = 0; j <= NE; j++) edge.push(at(0, j / NE)); for (let j = NE; j >= 0; j--) edge.push(at(1, j / NE));
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge.filter((_, k) => k % 2 === 0)), 60, 0.0085, 6, false), hoodMat); hood.add(rim);
  }
  hood.visible = L.hat === 4; if (L.hat === 4) attach("Head", hood);
  // ("Hood down": the jacket as it's made, nothing added; a folded hood drawn on top of the models' own collars and
  // hoods looked like a cushion)
  // a life jacket (the inflatable kind sea anglers wear): two padded straps down the chest from a collar behind the
  // neck, lying on the jacket, with the reflective patches; a black waist belt and buckle
  if (L.life) {
    const c = bounds.chest, red = new THREE.MeshStandardMaterial({ color: [4, 5, 6].includes(L.coat) ? 0x1d2636 : 0xc8302b, roughness: 0.6 }), /* (navy over a red, yellow or orange jacket, so it shows) */ belt = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 });
    const refl = new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.3, metalness: 0.2, emissive: 0x2a2a2a });
    extraMats.push(red, belt, refl);
    const on = (x, y, front) => { const z = bounds.surface(x, y, front); return V(x, y, z + (front ? -0.016 : 0.016)); };
    const side = (s) => [on(s * c.w * 0.3, c.y - 0.2, true), on(s * c.w * 0.38, c.y - 0.08, true), on(s * c.w * 0.44, c.sh - 0.035, true), V(s * c.w * 0.47, c.sh + 0.035, (c.front + c.back) * 0.5 + 0.01), on(s * c.w * 0.32, c.sh - 0.01, false)];
    const pts = [...side(-1), on(0, c.sh + 0.01, false).add(V(0, 0.03, 0)), ...side(1).reverse()];
    const lj = new THREE.Group(); lj.add(new THREE.Mesh(strap(new THREE.CatmullRomCurve3(pts), (q) => V(q.x, 0, q.z - (c.front + c.back) / 2), 0.07, 0.028), red));
    for (const s of [-1, 1]) { const q = on(s * c.w * 0.34, c.y - 0.13, true); const tab = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.024, 0.006), refl); tab.position.copy(q).add(V(0, 0, -0.03)); lj.add(tab); }
    attach("Spine2", lj);
    const w = bounds.waist, ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.011, 6, 36), belt); ring.rotation.x = Math.PI / 2; ring.scale.set(w.rx + 0.01, w.rz + 0.01, 1); ring.position.set(0, w.y, w.cz);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.012), new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.4, metalness: 0.5 })); extraMats.push(buckle.material); buckle.position.set(0, w.y, w.cz - w.rz - 0.014);
    const wg = new THREE.Group(); wg.add(ring, buckle); attach("Spine", wg);
  }
  // wellies: a shaft round each calf up to just below the knee, a moulded boot over the foot
  if (L.boots > 0 && !worn) { // (people with modelled boots have them coloured instead)
    const wm = new THREE.MeshStandardMaterial({ color: FOOTWEAR[L.boots].hex, roughness: 0.42, side: THREE.DoubleSide }); extraMats.push(wm); // (both sides: looking down into the top, the boot's inside, not through it)
    const sole = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 }); extraMats.push(sole);
    for (const s of ["L", "R"]) {
      const kn = restAt(s + "_Calf"), an = restAt(s + "_Foot"), toe = restAt(s + "_Toe0");
      const dir = an.clone().sub(kn), len = dir.length(); dir.normalize();
      const top = kn.clone().addScaledVector(dir, len * 0.2), r = bounds.calf[s] + 0.014, shaftLen = an.y < top.y ? (top.y - 0.06) / Math.max(0.5, -dir.y) : len * 0.7;
      const shaft = new THREE.Mesh(wellyShaft(r, shaftLen), wm);
      shaft.position.copy(top).addScaledVector(dir, shaftLen / 2); shaft.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().negate());
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.06, 0.0075, 8, 28), wm); rim.position.copy(top); rim.quaternion.copy(shaft.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      const sg = new THREE.Group(); sg.add(shaft, rim); attach(s + "_Calf", sg);
      // the foot: from behind the heel to past the toes, on the ground
      const heelZ = an.z + 0.078, tipZ = toe.z - 0.072, cx = (an.x + toe.x) / 2 + (s === "L" ? 0 : 0); // (long enough to cover the shoe underneath: its toe showed through)
      const L0 = heelZ - tipZ, Wf = 0.12, Hf = Math.max(0.1, an.y + 0.025);
      // (shaped as a welly is: a rounded heel, the widest across the ball of the foot, a toe box lower than the instep and
      // rounded off at the tip, on a flat sole. It was a rounded box, a toy's boot, on a square black sole whose corners
      // stood out under it like a plate)
      const foot = new THREE.Mesh(wellyFoot(cx, heelZ, tipZ, Wf, Hf), wm);
      const so = new THREE.Mesh(wellyFoot(cx, heelZ + 0.004, tipZ - 0.004, Wf * 1.04, 0.016, true), sole);
      const fg = new THREE.Group(); fg.add(foot, so); attach(s + "_Foot", fg);
    }
  }

  // ---- posing ----
  const st = { clear: [], u: 0, v: 0, turn: 0, lastYaw: null, look: 0, lookUntil: 0, nextLook: 6 + rnd() * 10, blink: 0, nextBlink: 1 + rnd() * 3, jaw: 0, yaw: 0, pitch: 0, drop: 0, lean: 0, brace: 0, twist: 0, hand: [{ w: 0, kind: null, from: V(), out: V(), u: 1, last: null }, { w: 0, kind: null, from: V(), out: V(), u: 1, last: null }], t: 0, foot: {} };
  const save = {}; const ARM = ["UpperArm", "Forearm", "Hand"];
  const FINGERS = { L: [], R: [] };
  for (const s of ["L", "R"]) for (const f of [1, 2, 3, 4]) for (const j of ["", "1", "2"]) { const b = B(`${s}_Finger${f}${j}`); if (b) FINGERS[s].push([b, j === "" ? 0.75 : j === "1" ? 1.15 : 0.8]); }
  const THUMB = { L: [B("L_Finger0"), B("L_Finger01"), B("L_Finger02")].filter(Boolean), R: [B("R_Finger0"), B("R_Finger01"), B("R_Finger02")].filter(Boolean) };
  const wq = (b, out = new THREE.Quaternion()) => b.getWorldQuaternion(out);
  const wp = (b, out = V()) => b.getWorldPosition(out);
  const setWQ = (b, q) => { b.parent.getWorldQuaternion(tmp.q2); b.quaternion.copy(tmp.q2.invert().multiply(q)); b.updateMatrixWorld(true); };
  const turnW = (b, axisW, ang) => { if (!ang) return; const q = new THREE.Quaternion().setFromAxisAngle(axisW, ang); setWQ(b, q.multiply(wq(b))); };
  const aim = (b, child, targetW) => { const p = wp(b), cur = wp(child).sub(p).normalize(), want = targetW.clone().sub(p).normalize(); const q = new THREE.Quaternion().setFromUnitVectors(cur, want); setWQ(b, q.multiply(wq(b))); };
  const figW = (v) => groupOf().localToWorld(v.clone());       // a point in the figure's space → world
  const figDirW = (v) => v.clone().transformDirection(groupOf().matrixWorld); // a direction too (made unit length)
  const gq = new THREE.Quaternion(), figVecW = (v) => v.clone().applyQuaternion(groupOf().getWorldQuaternion(gq)); // an offset, kept its length
  const wFig = (w) => groupOf().worldToLocal(w.clone());
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const LM = { p: V(), a: V(), b: V(), q: new THREE.Quaternion() };

  function pose(o) {
    const dt = Math.min(0.1, o.dt || 0.016), t = o.t || 0; st.t = t;
    const g = groupOf(); if (!g) return;
    g.updateWorldMatrix(true, false);
    const k6 = 1 - Math.exp(-dt * 6);

    // ---- locomotion: walks blended by speed, their phase from the ground actually covered ----
    // (how far the figure really moved and turned this frame is what the feet have to match: for you, and for a friend
    // whose walk arrives over the network)
    const gp = g.getWorldPosition(LM.p);
    let moved = 0;
    if (st.gp) { moved = Math.hypot(gp.x - st.gp.x, gp.z - st.gp.z); if (moved > 1.5) { moved = 0; st.foot = {}; } } else st.gp = V();
    st.gp.copy(gp);
    const walking = !!o.walk && !o.walk.air;
    const v = walking ? Math.max(0, o.walk.speed ?? moved / dt) : 0;
    const v0 = st.v; st.v += (v - st.v) * (1 - Math.exp(-dt * 12));
    st.acc = (st.acc || 0) + ((st.v - v0) / dt - (st.acc || 0)) * (1 - Math.exp(-dt * 6));
    // turning: the rate (+ to the right), from how the figure turned
    const yawNow = Math.atan2(-g.matrixWorld.elements[8], g.matrixWorld.elements[10]);
    let dyaw = st.lastYaw == null ? 0 : wrapA(yawNow - st.lastYaw);
    if (Math.abs(dyaw) > 1.2) dyaw = 0; // (put somewhere else, not a turn)
    st.lastYaw = yawNow;
    st.yr = (st.yr || 0) + (dyaw / dt - (st.yr || 0)) * (1 - Math.exp(-dt * 10)); st.turn = Math.abs(st.yr);
    // a turn on the spot is a pivot: the turning steps (x_turn_l, x_turn_r: about a quarter turn each) played through
    // as far as the turn has got, their own swing of the hips taken out (the walker sets which way you face)
    const canPivot = !!(act.turn_l && act.turn_r);
    const pivotOn = canPivot && walking && st.v < 0.7 && st.turn > 0.7;
    if (pivotOn && (!st.piv || st.piv.end || Math.sign(st.yr) !== st.piv.dir)) st.piv = { dir: Math.sign(st.yr) || 1, done: 0, total: Math.max(Math.PI / 2, Math.abs(o.walk.off || 0) + Math.abs(dyaw)) };
    if (st.piv) {
      if (Math.sign(dyaw) === st.piv.dir) st.piv.done = Math.min(st.piv.total, st.piv.done + Math.abs(dyaw));
      if (!pivotOn && (st.v > 0.9 || st.turn < 0.3 || !walking)) st.piv.end = true;
    }
    const pwWant = st.piv && !st.piv.end ? 1 : 0;
    st.pw = (st.pw || 0) + (pwWant - (st.pw || 0)) * (1 - Math.exp(-dt * (pwWant ? 14 : 7)));
    if (st.piv?.end && st.pw < 0.02) { st.piv = null; st.pw = 0; }
    // (without the turning steps, as before: small steps of the slow walk)
    const turning = !canPivot && o.walk && st.v < 0.4 ? clamp((st.turn - 0.8) / 2, 0, 1) : 0;
    const vs = Math.max(st.v, turning * 0.55 * speedOf("walk_slow"));
    const sp = LOCO.map((key) => (key === "sprint" && !clips.sprint ? 0 : speedOf(key))), { w, stretch } = gaitWeights(vs, sp, k);
    let stride = 0, ws = 0; for (const key of LOCO) { stride += w[key] * (clips[key]?.userData.travel || 1) * k; ws += w[key]; }
    if (ws > 0) stride *= stretch;
    const adv = moved + turning * 0.55 * speedOf("walk_slow") * dt;
    if (ws > 0 && walking) st.u = (st.u + adv / (stride / ws)) % 1;
    for (const key of LOCO) { const a = act[key]; if (!a) continue; a.setEffectiveWeight(w[key]); a.time = (((st.u + (offs[key] || 0)) % 1) + 1) % 1 * a.getClip().duration; }
    // standing: the idle, and now and then a look round (when nothing in particular holds their eye)
    if (act.idle) act.idle.time = (act.idle.time + dt) % act.idle.getClip().duration;
    if (act.look) {
      const free = w.idle > 0.9 && !o.look && !(o.hands && (o.hands[0] || o.hands[1]));
      if (free && t > st.nextLook && st.lookUntil < t) { st.lookUntil = t + act.look.getClip().duration; act.look.time = 0; st.nextLook = st.lookUntil + 10 + rnd() * 14; }
      const want = free && t < st.lookUntil ? 1 : 0; st.look += (want - st.look) * (1 - Math.exp(-dt * 2.5));
      act.look.time = Math.min(act.look.getClip().duration - 0.01, act.look.time + dt);
      act.look.setEffectiveWeight(st.look * w.idle); act.idle?.setEffectiveWeight(w.idle * (1 - st.look));
    } else act.idle?.setEffectiveWeight(w.idle);
    // the retargeted poses, eased in and out, sharing the standing weight: kneeling (looking closely at it with a hand
    // on the fish), crouching, and the fishing stance while a rod is in hand
    const hasPoses = !!act.kneel;
    if (hasPoses) {
      const kp = 1 - Math.exp(-dt * 3.5), hk = o.hands && (o.hands[0]?.kind || o.hands[1]?.kind);
      st.kn = (st.kn || 0) + ((o.walk ? 0 : clamp((o.kneel || 0) * 1.2, 0, 1)) - (st.kn || 0)) * kp;
      st.cr = (st.cr || 0) + ((o.walk ? 0 : clamp(((o.crouch || 0) - 0.3) * 2, 0, 1) * (1 - (o.kneel || 0))) - (st.cr || 0)) * kp;
      st.rod = (st.rod || 0) + ((hk && /seat|crank|rod|rail/.test(hk) ? 1 : 0) - (st.rod || 0)) * kp;
      st.ins = (st.ins || 0) + ((hk === "fish" ? 1 : 0) - (st.ins || 0)) * kp;
      const base = w.idle, kn = ease(st.kn), cr = ease(st.cr) * (1 - kn), rest = 1 - kn - cr;
      act.idle?.setEffectiveWeight((act.idle.getEffectiveWeight()) * rest * (1 - st.rod * 0.85)); act.look?.setEffectiveWeight(act.look.getEffectiveWeight() * rest * (1 - st.rod));
      act.fish_idle?.setEffectiveWeight(base * rest * st.rod * 0.85);
      act.kneel?.setEffectiveWeight(base * kn * (1 - st.ins * 0.7)); act.inspect?.setEffectiveWeight(base * kn * st.ins * 0.7);
      act.crouch?.setEffectiveWeight(base * cr);
      for (const key of POSES) { const a = act[key]; if (a) a.time = (a.time + dt) % a.getClip().duration; }
      // a move on cue, eased in and out by its weight: the others give way to it
      for (const key of ACTS) { const a = act[key]; if (!a) continue; const on = o.act?.key === key; const wt = on ? clamp(o.act.w ?? 1, 0, 1) : 0; a.setEffectiveWeight(wt); if (on) a.time = clamp(o.act.t || 0, 0, a.getClip().duration - 0.001); }
      const aw = o.act && act[o.act.key] ? clamp(o.act.w ?? 1, 0, 1) : 0;
      if (aw > 0) for (const [key, a] of Object.entries(act)) if (!ACTS.includes(key)) a.setEffectiveWeight(a.getEffectiveWeight() * (1 - aw));
      // a pivot: the turning steps, as far through as the turn has got, the rest giving way to them
      if (st.pw > 0.001 && st.piv && !(o.act && ACTS.includes(o.act.key))) {
        const a = act[st.piv.dir > 0 ? "turn_r" : "turn_l"], u = clamp(st.piv.done / st.piv.total, 0, 1);
        for (const x of Object.values(act)) if (x !== a) x.setEffectiveWeight(x.getEffectiveWeight() * (1 - st.pw));
        a.setEffectiveWeight(st.pw); a.time = u * (a.getClip().duration - 0.001);
      }
    }
    mixer.update(0);
    inner.position.set(0, 0, 0);

    // ---- balance: leaning into setting off, stopping and turning (about the feet, as a body does), a moment's weight
    // shift before the first step and a settle at the end; the turning steps' own swing of the hips taken out ----
    let yc = 0;
    inner.rotation.set(0, Math.PI, 0);
    if (st.pw > 0.002) { root.updateMatrixWorld(true); yc = -wrapA(latAt() - latRef) * clamp(st.pw * 4, 0, 1); }
    // (where the moves put the feet before the body leans: the lean is over the feet, which stay flat on the ground)
    const pre = {};
    if (walking && !fp) { inner.rotation.set(0, Math.PI + yc, 0); root.updateMatrixWorld(true); for (const sd of ["L", "R"]) pre[sd] = { a: wp(B(sd + "_Foot")), t: wp(B(sd + "_Toe0")), q: wq(B(sd + "_Foot")) }; }
    const fwdT = walking ? clamp(-st.acc * 0.028, -0.07, 0.05) : 0;
    const rollT = walking ? clamp(0.55 * Math.atan((st.v * st.yr) / 9.8), -0.16, 0.16) : 0;
    const kb = 1 - Math.exp(-dt * 7);
    st.lf = (st.lf || 0) + (fwdT - (st.lf || 0)) * kb; st.lr = (st.lr || 0) + (rollT - (st.lr || 0)) * kb;
    inner.rotation.set(st.lf, Math.PI + yc, st.lr);
    if (walking && v0 < 0.03 && st.v >= 0.03 && t - (st.stopT ?? -9) > 0.25) st.antT = t;
    if (v0 >= 0.25 && st.v < 0.25) st.stopT = t;
    const ba = st.antT != null ? (t - st.antT) / 0.45 : 9, bs = st.stopT != null ? (t - st.stopT) / 0.5 : 9;
    st.dip = (ba < 1 ? Math.sin(ba * Math.PI) * 0.014 : 0) + (bs < 1 ? Math.sin(bs * Math.PI) * 0.01 : 0);
    root.updateMatrixWorld(true);

    // ---- the body: lower the hips (crouch, brace), lean, turn the chest; the feet stay put ----
    const standing = w.idle > 0.5;
    // (kneel: right down by something on the ground, a deep crouch with the knees forward and the heels planted)
    st.drop += (((o.walk?.air ? 0.1 : o.crouch || 0) * 0.13 * (hasPoses ? 1 - (st.cr || 0) : 1) + (o.brace || 0) * 0.05 + (o.walk ? 0 : o.kneel || 0) * 0.34 * (hasPoses ? 1 - ease(st.kn || 0) : 1)) - st.drop) * k6; // (the kneel and crouch clips lower the hips themselves)
    st.lean += ((o.lean || 0) - (o.brace || 0) * 0.1 - st.lean) * k6;
    st.brace += ((standing ? o.brace || 0 : 0) - st.brace) * k6;
    st.twist += ((o.twist || 0) - st.twist) * k6;
    const feet = {};
    if (standing) for (const s of ["L", "R"]) feet[s] = { p: wp(B(s + "_Foot")), q: wq(B(s + "_Foot")) };
    if (st.drop > 0.002 || st.brace > 0.01 || st.dip > 0.0005) { inner.position.y = -(st.drop + st.dip) / k; root.updateMatrixWorld(true); }
    const right = figDirW(V(1, 0, 0)), up = figDirW(V(0, 1, 0));
    turnW(B("Spine1"), right, -st.lean * 0.45); turnW(B("Spine2"), right, -st.lean * 0.4); turnW(B("Neck"), right, -st.lean * 0.15);
    turnW(B("Spine1"), up, -st.twist * 0.45); turnW(B("Spine2"), up, -st.twist * 0.35);
    // turning, the chest and head lead into it a little (never past the shoulders); standing, a slow breath
    const lead = clamp(-st.yr * 0.07, -0.2, 0.2) * clamp(st.v / 0.8 + st.pw, 0, 1);
    st.lead = (st.lead || 0) + (lead - (st.lead || 0)) * (1 - Math.exp(-dt * 6));
    if (Math.abs(st.lead) > 1e-3) { turnW(B("Spine1"), up, st.lead * 0.35); turnW(B("Spine2"), up, st.lead * 0.25); if (!o.look) turnW(B("Head"), up, st.lead * 0.5); }
    const br = Math.sin((t * Math.PI * 2) / 4.3) * 0.011 * w.idle * (1 - (st.kn || 0));
    if (Math.abs(br) > 1e-4) { turnW(B("Spine1"), right, br * 0.5); turnW(B("Spine2"), right, br * 0.6); turnW(B("Neck"), right, -br * 0.9); }
    if (standing && (st.drop > 0.002 || st.brace > 0.01)) {
      for (const [s, sx, fz] of [["L", -1, -0.13], ["R", 1, 0.07]]) {
        const target = feet[s].p.clone().add(figVecW(V(sx * 0.05 * st.brace, 0, fz * st.brace)));
        const hip = wp(B(s + "_Thigh")), knee0 = wp(B(s + "_Calf")), L1 = hip.distanceTo(knee0), L2 = knee0.distanceTo(wp(B(s + "_Foot")));
        const r = twoBone(hip, target, L1, L2, figDirW(V(sx * 0.15, 0, -1)));
        aim(B(s + "_Thigh"), B(s + "_Calf"), r.B); aim(B(s + "_Calf"), B(s + "_Foot"), r.C); setWQ(B(s + "_Foot"), feet[s].q);
      }
    }

    // ---- sitting in the chair (o.sit: { w 0 to 1 as far down as they've got, hips: [x, y, z] the hip joints' middle on the
    // seat, feetZ, feetX: where the feet go in front; the figure's space, chair.js) ----
    // The hips taken down and back onto the seat, the pelvis tipped back against the chair's back, each leg reaching from
    // the hip to its foot flat on the deck in front, the knee bending up and forwards; as far as w, so sitting down and
    // getting up go through every place between
    st.sitW = o.sit && !walking ? clamp(o.sit.w || 0, 0, 1) : 0;
    if (st.sitW > 0.001) {
      const sw = st.sitW, S = o.sit;
      const stand = {}; for (const s of ["L", "R"]) stand[s] = { p: wFig(wp(B(s + "_Foot"))), q: wq(B(s + "_Foot")) };
      const hipNow = wFig(wp(B("L_Thigh")).add(wp(B("R_Thigh"))).multiplyScalar(0.5)), d = V(...S.hips).sub(hipNow).multiplyScalar(sw);
      inner.position.x += d.x / k; inner.position.y += d.y / k; inner.position.z += d.z / k; root.updateMatrixWorld(true);
      const right = figDirW(V(1, 0, 0));
      // (leaning back in it, the head kept level; and forwards over the feet on the way down and up, as anyone sits down
      // and gets up: the weight over the feet until the seat takes it)
      const tip = (S.lean ?? 0.2) * sw - 0.42 * Math.sin(Math.PI * sw);
      turnW(B("Pelvis"), right, tip); turnW(B("Neck"), right, -0.3 * tip);
      for (const [s, sx] of [["L", -1], ["R", 1]]) {
        const sit = V(S.hips[0] + sx * (S.feetX ?? 0.12), stand[s].p.y, S.feetZ), tgt = stand[s].p.clone().lerp(sit, sw);
        const hip = wp(B(s + "_Thigh")), knee0 = wp(B(s + "_Calf")), L1 = hip.distanceTo(knee0), L2 = knee0.distanceTo(wp(B(s + "_Foot")));
        const r = twoBone(hip, figW(tgt), L1, L2, figDirW(V(sx * 0.12, 0.55, -1)));
        aim(B(s + "_Thigh"), B(s + "_Calf"), r.B); aim(B(s + "_Calf"), B(s + "_Foot"), r.C); setWQ(B(s + "_Foot"), stand[s].q);
      }
    }

    // ---- the feet on the deck: a foot that's come down stays where it landed until it lifts (no sliding however the
    // walk is blended, turned or sped up), set on the ground's own height there; the hips drop if a leg can't reach ----
    // (on the whole time you're walking about: coming to a stop, the feet stay where they came down rather than
    // sliding back into the standing pose)
    const footOn = walking && !fp;
    if (footOn) {
      const floor = o.walk?.floor, gy = gp.y;
      // (the planted heights for the blend of moves playing: the heel's and the toe's)
      const wts = { ...w }; if (st.piv) { for (const kk of Object.keys(wts)) wts[kk] *= 1 - st.pw; wts[st.piv.dir > 0 ? "turn_r" : "turn_l"] = st.pw; }
      let refA = 0, refT = 0, rw = 0;
      for (const [key, ww] of Object.entries(wts)) if (ww > 0 && footRef[key]) { refA += ww * footRef[key].a; refT += ww * footRef[key].t; rw += ww; }
      if (rw > 0) { refA /= rw; refT /= rw; } else { refA = footRef.idle?.a ?? 0.09; refT = footRef.idle?.t ?? 0.02; }
      const lw = 1, aims = [], piv = st.pw > 0.4;
      for (const sd of ["L", "R"]) {
        // the planted point: the heel from when it strikes, then the ball of the foot as the heel lifts, until the toe
        // leaves the ground, and the way the foot points while it's down (a pivot turns on the planted foot, not by
        // skidding it round); the corrections that hold it fade out over the swing
        const fs = st.foot[sd] || (st.foot[sd] = { mode: null, lock: V(), corr: V(), yaw: 0, dyaw: 0 });
        const P = pre[sd], ank = P.a, toe0 = P.t;
        const yaw0 = Math.atan2(toe0.x - ank.x, toe0.z - ank.z);
        const hA = wFig(ank).y - refA, hT = wFig(toe0).y - refT;
        // (a pivot turns on the ball of the foot: the toe held, the foot free to turn about it)
        const mode = piv ? (hT < 0.02 ? "toe" : hA < 0.022 ? "heel" : null) : hA < 0.022 ? "heel" : hT < 0.018 ? "toe" : null;
        if (mode && !fs.mode) fs.yaw = yaw0 + fs.dyaw;
        if (piv) fs.yaw = yaw0 + fs.dyaw * Math.exp(-dt * 10);
        fs.dyaw = mode ? clamp(wrapA(fs.yaw - yaw0), -0.9, 0.9) : fs.dyaw * Math.exp(-dt * 10);
        const cy = Math.cos(fs.dyaw * lw), sy = Math.sin(fs.dyaw * lw), rx = toe0.x - ank.x, rz = toe0.z - ank.z;
        const toe = V(ank.x + rx * cy + rz * sy, toe0.y, ank.z - rx * sy + rz * cy), at = mode === "toe" ? toe : ank;
        if (fs.step) {
          // (a settling step: the foot lifted and put back under you, then held there)
          fs.step.u = Math.min(1, fs.step.u + dt / (fs.step.T || SETTLE_T)); const e = ease(fs.step.u);
          fs.corr.copy(fs.step.from).multiplyScalar(1 - e); fs.lift = Math.sin(Math.PI * fs.step.u) * 0.07;
          if (fs.step.u >= 1) { fs.step = null; fs.lift = 0; fs.mode = mode; fs.lock.set(at.x, 0, at.z); fs.corr.set(0, 0, 0); }
        } else {
          if (mode && mode !== fs.mode) fs.lock.set(at.x + fs.corr.x, 0, at.z + fs.corr.z);
          fs.mode = mode;
          // (held too far from where the walk would have it, turning tight or round: a quick step back to it, lifted,
          // while the other foot holds; let go to slide back, it skated up to 14 cm a frame along the deck)
          const other = st.foot[sd === "L" ? "R" : "L"];
          if (mode) { fs.corr.set(fs.lock.x - at.x, 0, fs.lock.z - at.z); if (fs.corr.length() > STEP_AT && !other?.step) fs.step = { u: 0, T: 0.3, from: fs.corr.clone() }; else if (fs.corr.length() > 0.42) { fs.mode = null; fs.corr.setLength(0.42); } }
          else fs.corr.multiplyScalar(Math.exp(-dt * 12));
        }
        const tgt = ank.clone().addScaledVector(fs.corr, lw); if (fs.lift) tgt.y += fs.lift;
        if (floor) { const fy = floor(tgt.x, tgt.z); if (Number.isFinite(fy)) tgt.y += clamp(fy - gy, -0.25, 0.25); }
        const fq = new THREE.Quaternion().setFromAxisAngle(up, fs.dyaw * lw).multiply(P.q);
        aims.push([sd, tgt, fq]);
      }
      // (standing still with a foot left out of place by the last steps, wide or behind: a step to bring it back under
      // you, one foot at a time, the further out first. Held where they came down, after a curve the feet stayed 80 cm
      // apart for as long as you stood there)
      st.still = st.v < 0.06 && !piv ? (st.still || 0) + dt : 0;
      if (st.still > 0.25 && !st.foot.L?.step && !st.foot.R?.step) {
        const far = ["L", "R"].map((sd) => [sd, st.foot[sd]?.corr.length() || 0]).sort((a, b) => b[1] - a[1])[0];
        if (far[1] > SETTLE_AT) st.foot[far[0]].step = { u: 0, from: st.foot[far[0]].corr.clone() };
      }
      // (and the feet never through each other: turning round at a walk, the swinging foot was carried through the
      // planted one. The one in the air, or the one stepping, is kept a foot's width from the other)
      {
        const [a, bb] = aims, dx = a[1].x - bb[1].x, dz = a[1].z - bb[1].z, d = Math.hypot(dx, dz);
        if (d < FEET_GAP) {
          const fa = st.foot.L, fb = st.foot.R, moveA = (!fa?.mode || fa?.step) && !(!fb?.mode || fb?.step) ? 1 : (!fb?.mode || fb?.step) && !(!fa?.mode || fa?.step) ? 0 : 0.5;
          const rgt = figDirW(V(1, 0, 0)); let nx = d > 1e-4 ? dx / d : -rgt.x, nz = d > 1e-4 ? dz / d : -rgt.z; // (L minus R: away from each other)
          const push = FEET_GAP - d; a[1].x += nx * push * moveA; a[1].z += nz * push * moveA; bb[1].x -= nx * push * (1 - moveA); bb[1].z -= nz * push * (1 - moveA);
        }
      }
      // (a leg stretched past its length: the hips come down to it)
      let need = 0;
      for (const [sd, tgt] of aims) { const hip = wp(B(sd + "_Thigh")), len = legLen(sd); need = Math.max(need, hip.distanceTo(tgt) - len * 0.995); }
      st.ikDrop = (st.ikDrop || 0) + (clamp(need, 0, 0.06) - (st.ikDrop || 0)) * (1 - Math.exp(-dt * 20));
      if (st.ikDrop > 1e-4) { inner.position.y -= st.ikDrop / k; root.updateMatrixWorld(true); }
      const fwdW = figDirW(V(0, 0, -1));
      for (const [sd, tgt, fq] of aims) {
        const hip = wp(B(sd + "_Thigh")), knee = wp(B(sd + "_Calf")), ank = wp(B(sd + "_Foot"));
        const pole = knee.clone().sub(hip.clone().add(ank).multiplyScalar(0.5)); if (pole.lengthSq() < 1e-6) pole.copy(fwdW); pole.normalize().addScaledVector(fwdW, 0.3);
        const L1 = hip.distanceTo(knee), L2 = knee.distanceTo(ank);
        const r = twoBone(hip, tgt, L1, L2, pole);
        aim(B(sd + "_Thigh"), B(sd + "_Calf"), r.B); aim(B(sd + "_Calf"), B(sd + "_Foot"), r.C); setWQ(B(sd + "_Foot"), fq);
        // (and the toe never into the deck: as the heel came down or the foot turned on it, the boot's toe dipped up to
        // 2 cm through the boards. The foot is tipped up about the ankle just enough to keep it on them)
        const toeB = B(sd + "_Toe0");
        if (toeB) {
          const tw = wp(toeB), aw = wp(B(sd + "_Foot")), fy = floor ? floor(tw.x, tw.z) : NaN;
          const lo = (Number.isFinite(fy) ? clamp(fy - gy, -0.25, 0.25) : 0) + Math.max(refT, footRef.idle?.t ?? refT) - 0.002, tF = wFig(tw); // (no lower than standing: the turning steps were measured with the toe lower)
          if (tF.y < lo) {
            const arm = tw.clone().sub(aw), L = arm.length(), side = arm.clone().cross(V(0, 1, 0));
            if (L > 1e-3 && side.lengthSq() > 1e-8) turnW(B(sd + "_Foot"), side.normalize(), Math.asin(clamp((lo - tF.y) / L, 0, 0.6))); // (about toe-cross-up: positive turns the toe up)
          }
        }
      }
    } else if (st.foot.L || st.foot.R) { st.foot = {}; st.ikDrop = 0; }

    // ---- the head: towards what they're watching, within the neck's reach ----
    {
      const head = B("Head"), neck = B("Neck");
      const fwdNow = figDirW(V(0, 0, -1)); // the body's forward
      let wantYaw = 0, wantPitch = -0.06;
      if (o.look) {
        const d = o.look.clone().sub(wFig(wp(head))); const hy = Math.atan2(d.x, -d.z), hp = Math.atan2(d.y, Math.hypot(d.x, d.z));
        wantYaw = clamp(hy - st.twist, -1.1, 1.1); wantPitch = clamp(hp, (o.kneel || 0) > 0.5 ? -1.1 : -0.8, 0.3); // (up no more than 17 degrees: the eyes go the rest of the way) // (kneeling over a fish on the mat the head bows right down to it)
      }
      const kh = 1 - Math.exp(-dt * 5); st.yaw += (wantYaw - st.yaw) * kh; st.pitch += (wantPitch - st.pitch) * kh;
      const on = o.look ? 1 : 0; st.lookOn = (st.lookOn || 0) + (on - (st.lookOn || 0)) * kh;
      if (st.lookOn > 0.01) {
        // where the face points now (from the clip), and where it should
        const faceW = headFwd.clone().applyQuaternion(wq(head)).normalize();
        const want = V(Math.sin(st.yaw + st.twist) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw + st.twist) * Math.cos(st.pitch)).transformDirection(g.matrixWorld);
        const full = new THREE.Quaternion().setFromUnitVectors(faceW, want), id = new THREE.Quaternion();
        const qn = id.clone().slerp(full, 0.4 * st.lookOn), qh = id.clone().slerp(full, 0.6 * st.lookOn);
        setWQ(neck, qn.multiply(wq(neck))); setWQ(head, qh.multiply(wq(head)));
      }
      // the eyes go the rest of the way to what they're watching (a little: the head did most of the turn), so a
      // look at the fish in your hands reads as looking at it, not past it
      for (const n of ["LEye", "REye"]) {
        const e = B(n); if (!e || !eyeRest[n]) continue;
        e.quaternion.copy(eyeRest[n]);
        if (o.look && st.lookOn > 0.01) {
          e.updateMatrixWorld(true);
          const fw = eyeFwd[n].clone().applyQuaternion(wq(e)).normalize(), want = figW(o.look).sub(wp(e)).normalize();
          const ang = Math.acos(clamp(fw.dot(want), -1, 1)), q = new THREE.Quaternion().setFromUnitVectors(fw, want);
          setWQ(e, new THREE.Quaternion().slerp(q, Math.min(1, 0.3 / Math.max(1e-3, ang)) * st.lookOn).multiply(wq(e)));
        }
      }
      void fwdNow;
    }

    // ---- the arms: each hand where it's asked to be, holding what it holds ----
    // (a free hand, swinging with the motion capture, is kept clear of its own thigh and the body: turning, sprinting
    // and turning round to walk back, the left hand went through the thigh and the belly. Measured from the bones'
    // lines, eased so it never pops: the arm bends out round them)
    const keepClear = (s, i, sg, dt) => {
      const hand = wp(B(s + "_Hand")), th = wp(B(s + "_Thigh")), ca = wp(B(s + "_Calf")), pel = wp(B("Pelvis")), sp2 = wp(B("Spine2"));
      const near = (a, b) => { const ab = b.clone().sub(a), t = clamp(hand.clone().sub(a).dot(ab) / Math.max(1e-8, ab.lengthSq()), 0, 1); return a.clone().addScaledVector(ab, t); };
      const push = V();
      for (const [a, b, r] of [[th, ca, CLEAR_THIGH], [pel, sp2, CLEAR_BODY]]) {
        const d = hand.clone().sub(near(a, b)); d.y = 0; const L = d.length();
        if (L < r) { if (L < 1e-4) d.copy(figDirW(V(sg, 0, 0))); else d.multiplyScalar(1 / L); push.addScaledVector(d, r - L); }
      }
      const pv = st.clear[i] || (st.clear[i] = V()); if (push.lengthSq() >= pv.lengthSq()) pv.copy(push); else pv.lerp(push, 1 - Math.exp(-dt * 10)); // (at once going in, which is smooth as the hand comes on smoothly; eased coming away)
      if (pv.lengthSq() < 1e-6) return;
      const S0 = wp(B(s + "_UpperArm")), E0 = wp(B(s + "_Forearm")), hq = wq(B(s + "_Hand"));
      const pole = E0.clone().sub(S0.clone().add(hand).multiplyScalar(0.5));
      const r2 = twoBone(S0, hand.clone().add(pv), S0.distanceTo(E0), E0.distanceTo(hand), pole.lengthSq() > 1e-8 ? pole.normalize() : figDirW(V(sg * 0.5, -0.4, 0.5)));
      aim(B(s + "_UpperArm"), B(s + "_Forearm"), r2.B); aim(B(s + "_Forearm"), B(s + "_Hand"), r2.C); setWQ(B(s + "_Hand"), hq);
    };
    const specs = o.hands || [null, null];
    for (let i = 0; i < 2; i++) {
      const s = i ? "R" : "L", sg = i ? 1 : -1, hs = st.hand[i];
      let spec = specs[i];
      const shF = wFig(wp(B(s + "_UpperArm")));
      const em = o.emote;
      if (!spec && em && (em.kind !== "wave" || em.hand === i)) {
        const u = em.u, chest = wFig(wp(B("Spine2")));
        if (em.kind === "wave") spec = { at: shF.clone().add(V(sg * (0.2 + 0.08 * Math.sin(u * 10)), 0.36, -0.08)), kind: "wave", palm: V(0, 0, -1), pole: V(sg, -0.25, 0.35) };
        else if (em.kind === "cheer") spec = { at: shF.clone().add(V(sg * 0.14, 0.48 + 0.05 * Math.sin(u * 8 + i), -0.04)), kind: "cheer", palm: V(0, 0, -1), pole: V(sg, 0, 0.3) };
        else if (em.kind === "clap") spec = { at: chest.clone().add(V(sg * (0.02 + 0.07 * Math.max(0, Math.sin(u * 11))), 0.06, -0.3)), kind: "clap", palm: V(-sg, 0, 0), pole: V(sg, -0.6, 0.15) };
      }
      // (sitting, hands resting on the thighs: the wrist a little past the middle of the thigh, palm down, fingers towards
      // the knee)
      if (!spec && o.idle === "lap" && st.sitW > 0.4) { const hp = wFig(wp(B(s + "_Thigh"))), kn = wFig(wp(B(s + "_Calf"))); spec = { at: hp.clone().lerp(kn, 0.5).add(V(sg * 0.015, 0.075, 0)), kind: "lap", palm: V(0, -1, 0), pole: V(sg * 0.8, -0.4, 0.35) }; }
      if (!spec && o.idle === "fold" && standing) { const chest = wFig(wp(B("Spine2"))); spec = { at: chest.clone().add(V(-sg * 0.08, 0.03 + (i ? 0.02 : 0), -0.2)), kind: "fold", pole: V(sg * 0.8, -0.45, -0.3), palm: V(0, 0, 1) }; }
      // ease on and off: a free hand goes back to the motion capture
      if (spec) { hs.last = spec; hs.w = Math.min(1, hs.w + dt / 0.3); } else hs.w = Math.max(0, hs.w - dt / 0.35);
      const use = spec || hs.last;
      if (!use || hs.w <= 0) { hs.kind = null; keepClear(s, i, sg, dt); continue; }
      for (const n of ARM) save[s + n] = B(s + "_" + n).quaternion.clone();
      const target = use.at.clone();
      if (use.kind !== hs.kind) { hs.from.copy(hs.kind ? hs.out : target); hs.kind = use.kind; hs.u = 0; }
      hs.u = Math.min(1, hs.u + dt / 0.32);
      const at = hs.from.clone().lerp(target, ease(hs.u)); hs.out.copy(at);
      // the hand's frame (figure space): fingers round the handle (axis), palm facing `palm`
      let Yh = null, Zh = null, wrist = at;
      if (use.axis) {
        const ax = use.axis.clone().normalize(), reach = at.clone().sub(shF);
        const palm = (use.palm || reach.clone().cross(ax).multiplyScalar(-sg)).clone();
        Zh = palm.addScaledVector(ax, -palm.dot(ax)); if (Zh.lengthSq() < 1e-6) Zh = V(0, -1, 0).addScaledVector(ax, ax.y); Zh.normalize();
        let X = ax.clone().multiplyScalar(sg); Yh = Zh.clone().cross(X).normalize();
        // which way round the hand goes on the handle is settled once, when it takes hold (and changed only if it's
        // plainly wrong), never flipped back and forth from frame to frame as the hand moves (a crank turning)
        const d = Yh.dot(reach) / Math.max(1e-6, reach.length());
        if (hs.flip == null || hs.flipKind !== use.kind) { hs.flip = d < -0.2; hs.flipKind = use.kind; }
        else if (hs.flip ? d > 0.6 : d < -0.6) hs.flip = !hs.flip;
        if (hs.flip) { X.negate(); Yh.negate(); }
        wrist = at.clone().addScaledVector(Yh, -GRIP.y).addScaledVector(Zh, -GRIP.z);
      }
      const S0 = wp(B(s + "_UpperArm")), E0 = wp(B(s + "_Forearm")), W0 = wp(B(s + "_Hand"));
      const r = twoBone(S0, figW(wrist), S0.distanceTo(E0), E0.distanceTo(W0), figDirW(use.pole ? use.pole : V(sg * 0.55, -0.45, 0.55)));
      aim(B(s + "_UpperArm"), B(s + "_Forearm"), r.B); aim(B(s + "_Forearm"), B(s + "_Hand"), r.C);
      if (!Yh) { Yh = wFig(r.C).sub(wFig(r.B)).normalize(); Zh = (use.palm ? use.palm.clone() : V(-sg, 0, 0)); Zh.addScaledVector(Yh, -Zh.dot(Yh)); if (Zh.lengthSq() < 1e-6) Zh.set(0, 0, -1); Zh.normalize(); }
      const X = figDirW(Yh), Y = figDirW(Zh), Z = new THREE.Vector3().crossVectors(X, Y);
      setWQ(B(s + "_Hand"), new THREE.Quaternion().setFromRotationMatrix(tmp.m.makeBasis(X, Y, Z)));
      // blend with the motion capture while easing on or off
      const ew = ease(hs.w);
      if (ew < 0.999) for (const n of ARM) { const b = B(s + "_" + n), ik = b.quaternion.clone(); b.quaternion.copy(save[s + n]).slerp(ik, ew); }
      // fingers: curled round a handle, a little open otherwise
      // (under a fish: the fingers spread and cupped round its belly, the thumb along its side; laid on its flank: the
      // fingers resting on it, curving over a little: it was a fist round a handle, the fish hanging off the knuckles)
      const fishHold = use.kind === "fish", cradle = fishHold && use.palm && use.palm.y > 0.5;
      const grip = fishHold ? (cradle ? 0.42 : 0.22) : use.kind === "open" ? 0.12 : use.axis ? (use.kind === "crank" ? 0.75 : 1) : use.kind === "wave" || use.kind === "cheer" || use.kind === "clap" ? -0.1 : 0.15;
      for (const [b, f] of FINGERS[s]) b.quaternion.multiply(tmp.q.setFromAxisAngle(V(0, 0, 1), grip * f * ew));
      for (const b of THUMB[s]) b.quaternion.multiply(tmp.q.setFromAxisAngle(V(0, 0, 1), (fishHold ? 0.12 : use.axis ? 0.35 : 0) * ew));
      B(s + "_UpperArm").updateMatrixWorld(true);
    }

    // ---- the face: blinking, and the jaw while they talk ----
    if (t > st.nextBlink) { st.blink = 0.15; st.nextBlink = t + 2.2 + rnd() * 4.5; }
    st.blink = Math.max(0, st.blink - dt);
    const shut = st.blink > 0 ? Math.sin((st.blink / 0.15) * Math.PI) : 0;
    for (const n of ["LEyeBlinkTop", "REyeBlinkTop"]) { const b = B(n); if (b) { b.quaternion.copy(lidRest[n]).multiply(tmp.q.setFromAxisAngle(LID_AXIS, LID_SHUT * shut)); } }
    const talk = o.speaking ? clamp(0.5 + 0.5 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1), 0, 1) : 0;
    st.jaw += (talk - st.jaw) * (1 - Math.exp(-dt * 20));
    if (B("MJaw")) B("MJaw").quaternion.copy(jawRest).multiply(tmp.q.setFromAxisAngle(V(0, 0, 1), -0.16 * st.jaw));

    // ---- the weather on their clothes; the hood ----
    const W = o.weather || {};
    U.uWet.value += ((W.rain || 0) * 0.9 - U.uWet.value) * (1 - Math.exp(-dt * 0.4));
    U.uTime.value = t;
    const wind = W.wind || 0, wd = W.windDir || [1, 0];
    const amp = (Math.min(1, wind / 12) * 0.018 + st.v * 0.004) / unit; // in the meshes' own units
    // (the wind blows in the figure's space; turned into the meshes' own frame)
    if (amp > 1e-6 && clothMesh) { const d = figDirW(V(wd[0], 0, wd[1])); clothInv.copy(clothMesh.matrixWorld).invert(); U.uWind.value.copy(d.transformDirection(clothInv)).multiplyScalar(amp); } else U.uWind.value.set(0, 0, 0);
    hats.visible = !fp;
  }

  // rest values for the face
  const lidRest = {}; for (const n of ["LEyeBlinkTop", "REyeBlinkTop"]) if (B(n)) lidRest[n] = B(n).quaternion.clone();
  const jawRest = B("MJaw") ? B("MJaw").quaternion.clone() : new THREE.Quaternion();
  const LID_AXIS = V(0, 0, 1), LID_SHUT = -0.55;
  // the face's forward in the head bone's own frame (the models face +z at rest, so forward is the inner's -z… at rest
  // the figure faces -z, which is +z in the model)
  mixer.update(0); root.updateMatrixWorld(true);
  const headFwd = V(0, 0, 1).transformDirection(inner.matrixWorld).applyQuaternion(wq(B("Head")).invert()).normalize();
  const eyeRest = {}, eyeFwd = {}; for (const n of ["LEye", "REye"]) { const e = B(n); if (e) { eyeRest[n] = e.quaternion.clone(); eyeFwd[n] = V(0, 0, 1).transformDirection(inner.matrixWorld).applyQuaternion(wq(e).invert()).normalize(); } }
  // ---- the planted ankle's height in each walk (the figure's space, measured on this person), the legs' length and
  // the hips' heading at rest (for taking the turning steps' own swing out) ----
  const latAt = () => { const l = inner.worldToLocal(wp(B("L_Thigh"))), r = inner.worldToLocal(wp(B("R_Thigh"))); return Math.atan2(-(l.z - r.z), l.x - r.x); };
  const latRef = latAt();
  const legL = {}; for (const sd of ["L", "R"]) legL[sd] = wp(B(sd + "_Thigh")).distanceTo(wp(B(sd + "_Calf"))) + wp(B(sd + "_Calf")).distanceTo(wp(B(sd + "_Foot")));
  const legLen = (sd) => legL[sd];
  const footRef = {};
  {
    const save = Object.entries(act).map(([kk, a]) => [kk, a.getEffectiveWeight(), a.time]);
    for (const key of ["idle", ...LOCO, "turn_l", "turn_r"]) {
      const a = act[key]; if (!a) continue;
      for (const [k2, a2] of Object.entries(act)) a2.setEffectiveWeight(k2 === key ? 1 : 0);
      let lo = Infinity, lt = Infinity; const N = key === "idle" ? 1 : 24;
      for (let i = 0; i < N; i++) { a.time = (i / N) * a.getClip().duration; mixer.update(0); root.updateMatrixWorld(true); for (const sd of ["L", "R"]) { lo = Math.min(lo, wp(B(sd + "_Foot")).y); lt = Math.min(lt, wp(B(sd + "_Toe0")).y); } }
      footRef[key] = { a: lo, t: lt };
    }
    for (const [kk, wt, tm] of save) { act[kk].setEffectiveWeight(wt); act[kk].time = tm; }
    mixer.update(0); root.updateMatrixWorld(true);
  }

  let fp = false;
  // (far off, at the lightest level of detail, the pose is worked out every other frame, the time carried over: a
  // person 40 m away moves as smoothly to the eye, for half the work)
  let skip = 0, owed = 0;
  const poseAtDistance = (o) => {
    if (lodNow === 2 && lodSets[2].length) { skip ^= 1; if (skip) { owed += o.dt || 0; return; } if (owed) { o = { ...o, dt: (o.dt || 0) + owed }; owed = 0; } }
    else owed = 0;
    pose(o);
  };
  return {
    root, pose: poseAtDistance,
    get top() { return wFigSafe(B("Head")).y + (top0 - headY0) * k; },
    get headAt() { return wFigSafe(B("Head")); },
    get eyeAt() { const a = B("LEye"), b = B("REye"); if (!a || !b) return wFigSafe(B("Head")).add(V(0, 0.1, -0.08)); return wFigSafe(a).add(wFigSafe(b)).multiplyScalar(0.5).add(V(0, 0, -0.02)); },
    /** where the face points (the figure's space): the eyes' middle, and a unit vector out of the face, square to the
     * line between the eyes and to the neck's line up into the head. A head torch shines this way. Which of the two
     * ways out of the face is forward is left to the caller, who knows which way the figure faces */
    get gaze() { const l = B("LEye"), r = B("REye"), h = B("Head"), n = B("Neck"); if (!l || !r || !h || !n) return null;
      const L = wFigSafe(l), R = wFigSafe(r), up = wFigSafe(h).sub(wFigSafe(n)), f = up.clone().cross(R.clone().sub(L));
      return f.lengthSq() > 1e-10 ? { p: L.add(R).multiplyScalar(0.5), f: f.normalize(), up: up.normalize() } : null; },
    hand(i) { return wFigSafe(B(i ? "R_Hand" : "L_Hand")); },
    /** the shoulders' middle (the figure's space) and which way they face: a carried rod moves with them */
    get chest() { const l = wFigSafe(B("L_UpperArm")), r = wFigSafe(B("R_UpperArm")); return { p: l.clone().add(r).multiplyScalar(0.5), yaw: Math.atan2(-(l.z - r.z), l.x - r.x) }; },
    setFirstPerson(on) { fp = !!on; },
    dispose() { root.parent?.remove(root); mixer.stopAllAction(); mixer.uncacheRoot(model); for (const m of mats) m.dispose(); for (const m of extraMats) m.dispose(); for (const o of extra) o.geometry?.dispose?.(); },
  };
  function wFigSafe(b) { const g = groupOf(); const p = wp(b); return g ? g.worldToLocal(p) : p; }
}

// the walks' phases: the time (as a fraction) at which the left foot is furthest forward, so the blend lines them up
function calibrate(mixer, act, B, clips) {
  const out = {};
  const foot = B("L_Foot"), pel = B("Pelvis"); if (!foot || !pel) return out;
  const save = Object.fromEntries(Object.entries(act).map(([k, a]) => [k, a.getEffectiveWeight()]));
  for (const key of LOCO) {
    const a = act[key]; if (!a) continue;
    for (const [k2, a2] of Object.entries(act)) a2.setEffectiveWeight(k2 === key ? 1 : 0);
    let best = -Infinity, bt = 0; const N = 32, d = a.getClip().duration;
    for (let i = 0; i < N; i++) {
      a.time = (i / N) * d; mixer.update(0); foot.updateWorldMatrix(true, false); pel.updateWorldMatrix(true, false);
      const z = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld).z - new THREE.Vector3().setFromMatrixPosition(pel.matrixWorld).z; // the model faces +z
      if (z > best) { best = z; bt = i / N; }
    }
    out[key] = bt;
  }
  for (const [k, a] of Object.entries(act)) a.setEffectiveWeight(save[k]);
  void clips;
  return out;
}

// sizes at the rest pose (the idle's first frame), in the figure's space at scale 1: the head (for hats), the chest
// and waist (the life jacket), the calves and feet (wellies)
function measure(skinned, root, k) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), v = V();
  const pts = { head: [], chest: [], waist: [], calfL: [], calfR: [], footL: [], footR: [] };
  let top = 0;
  const sk = skinned[0]?.skeleton; if (!sk) return null;
  const idx = (n) => sk.bones.findIndex((b) => b.name === "Bip01_" + n);
  const bi = { eye: idx("LEye"), head: idx("Head"), neck: idx("Neck"), sp2: idx("Spine2"), sp1: idx("Spine1"), sp: idx("Spine"), pel: idx("Pelvis"), cL: idx("L_Calf"), cR: idx("R_Calf"), fL: idx("L_Foot"), fR: idx("R_Foot"), tL: idx("L_Toe0"), tR: idx("R_Toe0") };
  const at = (b) => new THREE.Vector3().setFromMatrixPosition(sk.bones[b].matrixWorld).applyMatrix4(inv).multiplyScalar(1 / 1).applyMatrix4(new THREE.Matrix4().makeScale(k, k, k));
  for (const m of skinned) {
    const geo = m.geometry, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = geo.attributes.position.count;
    const hair = /opacity/.test(m.material.name);
    for (let i = 0; i < n; i += 1) {
      let best = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; best = si.getComponent(i, c); } }
      // (a skinned mesh's getVertexPosition already moves the point by its bones: moved a second time, as it was, the
      // new people's heads measured metres wide and their hats floated far off in the air, 18 November film)
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(inv).multiplyScalar(k);
      v.x = v.x; // (root has only the scale k; the inner's half turn is already in matrixWorld)
      if (v.y > top) top = v.y;
      if (best === bi.head || (hair && best === bi.neck)) pts.head.push(v.clone());
      else if ((best === bi.sp2 || best === bi.sp1) && !hair) pts.chest.push(v.clone());
      else if (best === bi.sp || best === bi.pel) pts.waist.push(v.clone());
      else if (best === bi.cL) pts.calfL.push(v.clone()); else if (best === bi.cR) pts.calfR.push(v.clone());
      else if (best === bi.fL || best === bi.tL) pts.footL.push(v.clone()); else if (best === bi.fR || best === bi.tR) pts.footR.push(v.clone());
    }
  }
  const box = (a) => { const b = new THREE.Box3(); for (const p of a) b.expandByPoint(p); return b; };
  // the head: its middle and size above the eyes (hair included)
  const eye = bi.eye >= 0 ? at(bi.eye).y : 0;
  const hb = box(pts.head), eyesY = eye || hb.min.y + (hb.max.y - hb.min.y) * 0.55;
  const hb2 = box(pts.head.filter((p) => p.y > eyesY));
  const head = { cx: (hb2.min.x + hb2.max.x) / 2, cz: (hb2.min.z + hb2.max.z) / 2, rx: (hb2.max.x - hb2.min.x) / 2, rz: (hb2.max.z - hb2.min.z) / 2, eye: eyesY, top: hb.max.y };
  // the face at the eyes (for glasses): how far forward it comes there (the brow and the bridge of the nose) and how wide
  // the head is
  { let front = Infinity, side = 0;
    for (const p of pts.head) if (Math.abs(p.y - eyesY) < 0.015) { if (Math.abs(p.x - head.cx) < 0.045) front = Math.min(front, p.z); side = Math.max(side, Math.abs(p.x - head.cx)); }
    head.face = { front: Number.isFinite(front) ? front : head.cz - head.rz, side: side || head.rx }; }
  // the chest: shoulder height, width and front/back at the chest
  const neck = at(bi.neck), sh = neck.y - 0.02;
  const cs = pts.chest.filter((p) => p.y > sh - 0.3 && p.y < sh - 0.05), cb = box(cs.length ? cs : pts.chest);
  const chest = { sh, y: sh - 0.12, w: Math.min(0.24, (cb.max.x - cb.min.x) / 2), front: cb.min.z, back: cb.max.z };
  const wy = at(bi.sp).y + 0.02, wsl = pts.waist.concat(pts.chest).filter((p) => Math.abs(p.y - wy) < 0.03), wb = box(wsl.length ? wsl : pts.waist);
  const waist = { y: wy, rx: (wb.max.x - wb.min.x) / 2, rz: (wb.max.z - wb.min.z) / 2, cz: (wb.min.z + wb.max.z) / 2 };
  const calf = {}, feet = {};
  for (const s of ["L", "R"]) {
    const c = pts["calf" + s]; let r = 0.05; if (c.length) { const cxz = box(c); const cx = (cxz.min.x + cxz.max.x) / 2, cz = (cxz.min.z + cxz.max.z) / 2; r = 0; for (const p of c) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz) * 0.92); }
    calf[s] = Math.min(0.08, r);
    const fb = box(pts["foot" + s]);
    feet[s] = { cx: (fb.min.x + fb.max.x) / 2, cz: (fb.min.z + fb.max.z) / 2, rx: (fb.max.x - fb.min.x) / 2, rz: (fb.max.z - fb.min.z) / 2, top: fb.max.y };
  }
  // the torso's surface at (x, y), front or back (for things lying on the jacket)
  const torso = pts.chest.concat(pts.waist);
  const surface = (x, y, front) => {
    let best = null;
    for (let r = 0.03; r <= 0.12 && best == null; r += 0.03) for (const p of torso) if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r) { if (best == null || (front ? p.z < best : p.z > best)) best = p.z; }
    return best ?? (front ? chest.front : chest.back);
  };
  return { top, head, chest, waist, calf, feet, surface };
}

// a flat strap along a curve: a rounded oblong section, width w and thickness d, lying flat against `outward(p)`
function strap(curve, outward, w, d) {
  const N = 64, M = 10, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u), T = curve.getTangentAt(u).normalize();
    const n = outward(p).addScaledVector(T, -outward(p).dot(T)); if (n.lengthSq() < 1e-8) n.set(0, 0, -1); n.normalize();
    const b = new THREE.Vector3().crossVectors(T, n).normalize();
    for (let j = 0; j < M; j++) { const a = (j / M) * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a); const q = p.clone().addScaledVector(b, cx * w / 2).addScaledVector(n, Math.sign(cy) * Math.abs(cy) ** 0.6 * d / 2); pos.push(q.x, q.y, q.z); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b2 = i * M + ((j + 1) % M); idx.push(a, a + M, b2, b2, a + M, b2 + M); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a box with well-rounded edges (a superellipsoid), 2 units across
// ---- a welly's foot: lofted along the foot from heel to toe, in the figure's own space (x across, y up, -z forwards) ----
// (sole: the thin dark sole under it, the same outline a touch larger, flat on the ground)
// a welly's leg (17 November): shaped down the calf as a moulded boot is, a little flared at its top, full over the calf
// and narrowing to the ankle, with a raised band near its top and its inside showing (it was a straight cone, wider at
// the top than the calf, an open bucket on each leg). Its own y from +len/2 (the top) to -len/2
function wellyShaft(r, len) {
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = 1 - i / 24; // (from the foot up: the lathe's faces then face out)
    const k = 1.06 - 0.06 * sm(0, 0.1, t) + 0.025 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.08) / 0.45))) - 0.19 * sm(0.42, 0.97, t) + 0.012 * Math.exp(-(((t - 0.12) / 0.012) ** 2));
    pts.push(new THREE.Vector2(r * k, len / 2 - t * len));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  // (a calf is deeper front to back than across: the boot follows it a little)
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * 1.06);
  g.computeVertexNormals(); return g;
}
function wellyFoot(cx, heelZ, tipZ, W, H, sole = false) {
  const K = 18, M = 16, pos = [], idx = [], len = heelZ - tipZ;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= K; i++) {
    const t = i / K, z = heelZ - len * t;
    // across: a rounded heel, the widest at the ball of the foot (two thirds along), then the toe rounding off
    let w = W * (0.8 + 0.2 * sm(0, 0.62, t) - 0.12 * sm(0.7, 0.95, t));
    // up: the instep up to the ankle at the back, the toe box lower at the front
    let h = sole ? H : H * (1 - 0.32 * sm(0.3, 0.8, t));
    // the ends rounded: the heel's back and the toe's tip close up in a curve
    const endT = t > 0.86 ? Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2)) : t < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - t) / 0.06) ** 2)) * 0.35 + 0.65 : 1;
    w *= endT; h *= sole ? 1 : 0.55 + 0.45 * endT;
    for (let j = 0; j <= M; j++) {
      // round the top, flat underneath (a half superellipse, and its base)
      const a = (j / M) * Math.PI, c = Math.cos(a), sn = Math.sin(a);
      const x = cx + (w / 2) * Math.sign(c) * Math.abs(c) ** 0.7, y = sole ? (j === 0 || j === M ? 0 : h) : h * Math.abs(sn) ** 0.85;
      pos.push(x, y, z);
    }
  }
  const R = M + 1;
  for (let i = 0; i < K; i++) for (let j = 0; j < M; j++) { const a = i * R + j, b = a + 1, c = a + R, d = c + 1; idx.push(a, c, b, b, c, d); }
  // the bottom, and the two ends closed
  const base = pos.length / 3; for (let i = 0; i <= K; i++) { pos.push(...pos.slice((i * R) * 3, (i * R) * 3 + 3)); pos.push(...pos.slice((i * R + M) * 3, (i * R + M) * 3 + 3)); }
  for (let i = 0; i < K; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  for (const i of [0, K]) { const cIdx = pos.length / 3, row = i * R; let mx = 0, my = 0, mz = 0; for (let j = 0; j <= M; j++) { mx += pos[(row + j) * 3]; my += pos[(row + j) * 3 + 1]; mz += pos[(row + j) * 3 + 2]; } pos.push(mx / R, my / R, mz / R); for (let j = 0; j < M; j++) { if (i === 0) idx.push(cIdx, row + j, row + j + 1); else idx.push(cIdx, row + j + 1, row + j); } }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function roundedBox(p = 3.2) {
  const g = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i), r = (Math.abs(x) ** p + Math.abs(y) ** p + Math.abs(z) ** p) ** (1 / p) || 1; a.setXYZ(i, x / r, y / r, z / r); }
  g.computeVertexNormals(); return g;
}

function mergeByMaterial(list, gltf) {
  if (list.length <= 3) return list;
  const cache = gltf.userData.fdMerged || (gltf.userData.fdMerged = new Map());
  const byMat = new Map();
  for (const m of list) { const k = m.material.name || m.material.uuid; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(m); }
  const out = [];
  for (const [k, ms] of byMat) {
    const first = ms[0], attrs = first.geometry.attributes;
    // only pieces that really share the vertices can be joined
    // (the converted files repeat the whole set of vertices for every piece: the same vertices if the counts and a
    // sample of positions match)
    const P0 = attrs.position, same = (g) => { const P = g.attributes.position; if (P.count !== P0.count) return false; for (let i = 0; i < P.count; i += Math.max(1, Math.floor(P.count / 50))) if (P.getX(i) !== P0.getX(i) || P.getY(i) !== P0.getY(i) || P.getZ(i) !== P0.getZ(i)) return false; return true; };
    if (!ms.every((m) => m.skeleton.bones[0] === first.skeleton.bones[0] && same(m.geometry))) { out.push(...ms); continue; }
    let geo = cache.get(k);
    if (!geo) {
      geo = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(attrs)) geo.setAttribute(n, a);
      const idx = []; for (const m of ms) { const ix = m.geometry.index; if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i)); }
      geo.setIndex(idx); cache.set(k, geo);
    }
    const mesh = new THREE.SkinnedMesh(geo, first.material); mesh.name = first.name;
    mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
    first.parent.add(mesh); mesh.bind(first.skeleton, first.bindMatrix);
    for (const m of ms) m.parent?.remove(m);
    out.push(mesh);
  }
  return out;
}

/** Load a person's model ahead of time (the picker, a party member who just joined). */
export function preloadPerson(file) { if (typeof document === "undefined") return Promise.resolve(); return Promise.all([personGLB(file), clipSet()]).catch(() => {}); }
