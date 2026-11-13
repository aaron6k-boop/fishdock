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
const LOCO = ["walk_slow", "walk", "walk_fast", "run"];
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
    try { const g2 = await loadGLB("anims2"); for (const c of g2.animations) { const key = c.name.slice(2); if (c.name.startsWith("x_") && (POSES.includes(key) || ACTS.includes(key))) out.m[key] = out.f[key] = c; } } catch { /* the procedural poses */ }
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

  // ---- materials: the clothes recolourable, the hair soft-edged ----
  // (your own angler, coat "as they come": the model's top is coloured as your outfit's jacket, the same jacket as the
  // sleeves you see in first person, and bare hands are bare, as there, not the model's own gardening gloves. Left as the model came, the 8 November recording showed navy sleeves in first
  // person and a white cardigan in third)
  const U = { uTop: { value: tint(COATS[L.coat]?.hex ?? (outfit?.sameTop ? outfit.jacket : null)) }, uLegs: { value: tint(LEGS[L.legs]?.hex) }, uFeet: { value: tint(FOOTWEAR[L.boots]?.hex) }, uHands: { value: tint(L.gloves ? 0x1c1e21 : outfit?.sameTop ? (SKINS[L.skin]?.hex ?? 0xc99a74) : null) }, uMean: { value: new THREE.Vector4(0.2, 0.2, 0.2, 0.2) }, uWet: { value: 0 }, uWind: { value: V() }, uTime: { value: 0 } };
  // ---- the modelled clothes (people with clothes: their own jacket, trousers and wellies, made in Blender) ----
  // coloured as the kit, and the body's own clothes underneath the same colours, so anywhere the body shows through a
  // seam it's the same cloth
  const worn = skinned.some((m) => /^fd_(jacket|trousers|boots)/.test(m.material?.name || ""));
  const wornHex = worn ? { jacket: COATS[L.coat]?.hex ?? outfit?.jacket ?? 0x1d3150, trousers: LEGS[L.legs]?.hex ?? 0x3b3e42, boots: FOOTWEAR[L.boots]?.hex ?? 0x2f4a2c } : null;
  if (worn) { U.uTop.value = tint(wornHex.jacket); U.uLegs.value = tint(wornHex.trousers); U.uFeet.value = tint(wornHex.boots); }
  const mats = [];
  let unit = 1, clothMesh = null; const clothInv = new THREE.Matrix4(); // metres per unit of the meshes' own geometry
  for (const m of skinned) {
    m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    const mat = m.material;
    { const w = /^fd_(jacket|trousers|boots)/.exec(mat.name || "");
      if (w) { const c = mat.clone(); c.map = null; c.color = new THREE.Color(wornHex[w[1]]); if (w[1] === "boots") { c.roughness = 0.38; c.metalness = 0; } else if (weave()) { c.normalMap = weave(); c.normalScale = new THREE.Vector2(0.5, 0.5); } m.castShadow = true; m.frustumCulled = false; m.material = c; mats.push(c); continue; } }
    if (/opacity/.test(mat.name)) { const h = mat.clone(); h.transparent = true; h.alphaTest = 0.04; h.depthWrite = false; m.material = h; mats.push(h); m.renderOrder = 1; continue; }
    if (/body/.test(mat.name)) {
      const info = prepGeometry(m.geometry, m.skeleton.bones);
      if (!m.geometry.attributes.fdRegion) { const { reg, flut } = info.make(L.hem || 0.5); m.geometry.setAttribute("fdRegion", new THREE.BufferAttribute(reg, 4)); m.geometry.setAttribute("fdFlutter", new THREE.BufferAttribute(flut, 1)); m.geometry.userData.means = regionMeans(mat.map, m.geometry.attributes.uv, reg); }
      U.uMean.value.fromArray(m.geometry.userData.means || [0.2, 0.2, 0.2, 0.2]);
      unit = 1.8 / Math.max(1e-6, info.H);
      const c = clothMaterial(mat, U); m.material = c; mats.push(c); clothMesh = m; continue;
    }
    const c = mat.clone(); m.material = c; mats.push(c);
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
  const knitMat = new THREE.MeshStandardMaterial({ color: hatCol, map: knit(), roughness: 1 }); extraMats.push(knitMat);
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
  if (L.boots > 0) {
    const wm = new THREE.MeshStandardMaterial({ color: FOOTWEAR[L.boots].hex, roughness: 0.4 }); extraMats.push(wm);
    const sole = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 }); extraMats.push(sole);
    for (const s of ["L", "R"]) {
      const kn = restAt(s + "_Calf"), an = restAt(s + "_Foot"), toe = restAt(s + "_Toe0");
      const dir = an.clone().sub(kn), len = dir.length(); dir.normalize();
      const top = kn.clone().addScaledVector(dir, len * 0.2), r = bounds.calf[s] + 0.014, shaftLen = an.y < top.y ? (top.y - 0.06) / Math.max(0.5, -dir.y) : len * 0.7;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 0.84, shaftLen, 18, 1, true), wm);
      shaft.position.copy(top).addScaledVector(dir, shaftLen / 2); shaft.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().negate());
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.04, 0.006, 6, 20), wm); rim.position.copy(top); rim.quaternion.copy(shaft.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      const sg = new THREE.Group(); sg.add(shaft, rim); attach(s + "_Calf", sg);
      // the foot: from behind the heel to past the toes, on the ground
      const heelZ = an.z + 0.075, tipZ = toe.z - 0.06, cx = (an.x + toe.x) / 2 + (s === "L" ? 0 : 0);
      const L0 = heelZ - tipZ, Wf = 0.115, Hf = Math.max(0.1, an.y + 0.025);
      const foot = new THREE.Mesh(roundedBox(), wm); foot.scale.set(Wf / 2, Hf / 2, L0 / 2); foot.position.set(cx, Hf / 2, (heelZ + tipZ) / 2);
      const so = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sole); so.scale.set(Wf * 0.96, 0.014, L0 * 0.97); so.position.set(cx, 0.007, (heelZ + tipZ) / 2);
      const fg = new THREE.Group(); fg.add(foot, so); attach(s + "_Foot", fg);
    }
  }

  // ---- posing ----
  const st = { u: 0, v: 0, turn: 0, lastYaw: null, look: 0, lookUntil: 0, nextLook: 6 + rnd() * 10, blink: 0, nextBlink: 1 + rnd() * 3, jaw: 0, yaw: 0, pitch: 0, drop: 0, lean: 0, brace: 0, twist: 0, hand: [{ w: 0, kind: null, from: V(), out: V(), u: 1, last: null }, { w: 0, kind: null, from: V(), out: V(), u: 1, last: null }], t: 0, foot: {} };
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
    const sp = LOCO.map(speedOf), w = { idle: 0, walk_slow: 0, walk: 0, walk_fast: 0, run: 0 };
    if (vs < 0.05) w.idle = 1;
    else if (vs < sp[0]) { const f = vs / sp[0]; w.idle = 1 - f; w.walk_slow = f; }
    else { let i = 0; while (i < 3 && vs > sp[i + 1]) i++; if (i >= 3) w.run = 1; else { const f = clamp((vs - sp[i]) / Math.max(0.01, sp[i + 1] - sp[i]), 0, 1); w[LOCO[i]] = 1 - f; w[LOCO[i + 1]] = f; } }
    let stride = 0, ws = 0; for (const key of LOCO) { stride += w[key] * (clips[key]?.userData.travel || 1) * k; ws += w[key]; }
    // (faster than the run was filmed at, a sprint: longer strides as well as quicker ones, the planted foot held by the
    // leg IK below, rather than legs spinning)
    if (ws > 0) stride *= clamp(Math.sqrt(Math.max(1, vs / sp[3])), 1, 1.35);
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
        if (mode && mode !== fs.mode) fs.lock.set(at.x + fs.corr.x, 0, at.z + fs.corr.z);
        fs.mode = mode;
        if (mode) { fs.corr.set(fs.lock.x - at.x, 0, fs.lock.z - at.z); if (fs.corr.length() > 0.42) { fs.mode = null; fs.corr.setLength(0.42); } }
        else fs.corr.multiplyScalar(Math.exp(-dt * 12));
        const tgt = ank.clone().addScaledVector(fs.corr, lw);
        if (floor) { const fy = floor(tgt.x, tgt.z); if (Number.isFinite(fy)) tgt.y += clamp(fy - gy, -0.25, 0.25); }
        const fq = new THREE.Quaternion().setFromAxisAngle(up, fs.dyaw * lw).multiply(P.q);
        aims.push([sd, tgt, fq]);
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
      }
    } else if (st.foot.L || st.foot.R) { st.foot = {}; st.ikDrop = 0; }

    // ---- the head: towards what they're watching, within the neck's reach ----
    {
      const head = B("Head"), neck = B("Neck");
      const fwdNow = figDirW(V(0, 0, -1)); // the body's forward
      let wantYaw = 0, wantPitch = -0.06;
      if (o.look) {
        const d = o.look.clone().sub(wFig(wp(head))); const hy = Math.atan2(d.x, -d.z), hp = Math.atan2(d.y, Math.hypot(d.x, d.z));
        wantYaw = clamp(hy - st.twist, -1.1, 1.1); wantPitch = clamp(hp, (o.kneel || 0) > 0.5 ? -1.1 : -0.8, 0.45); // (kneeling over a fish on the mat the head bows right down to it)
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
      if (!spec && o.idle === "fold" && standing) { const chest = wFig(wp(B("Spine2"))); spec = { at: chest.clone().add(V(-sg * 0.08, 0.03 + (i ? 0.02 : 0), -0.2)), kind: "fold", pole: V(sg * 0.8, -0.45, -0.3), palm: V(0, 0, 1) }; }
      // ease on and off: a free hand goes back to the motion capture
      if (spec) { hs.last = spec; hs.w = Math.min(1, hs.w + dt / 0.3); } else hs.w = Math.max(0, hs.w - dt / 0.35);
      const use = spec || hs.last;
      if (!use || hs.w <= 0) { hs.kind = null; continue; }
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
  return {
    root, pose,
    get top() { return wFigSafe(B("Head")).y + (top0 - headY0) * k; },
    get headAt() { return wFigSafe(B("Head")); },
    get eyeAt() { const a = B("LEye"), b = B("REye"); if (!a || !b) return wFigSafe(B("Head")).add(V(0, 0.1, -0.08)); return wFigSafe(a).add(wFigSafe(b)).multiplyScalar(0.5).add(V(0, 0, -0.02)); },
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
      m.getVertexPosition(i, v); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld).applyMatrix4(inv).multiplyScalar(k);
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
