// ---- angler: one person fishing in the 3D view: body, clothes, rod, reel, line, rig, the fish and the net ----
// Everything moves from the angler's own events (cast, bite, hooked, catch, lost, missed) and their times, so a
// remote angler animates the same on every phone, and a viewer who joins midway sees the right moment. Timings,
// bites, fights and landings are the same rules as the photo scene (sceneActors.js): biteTaps, fightProfile,
// fishLoad, landingTech and landingTimes.
import { fishLine } from "./fishLine.js";
import { overRail } from "./netPath.js";
import * as THREE from "three";
import { phaseAt, DUR, lineState } from "../liveEvents.js";
import { biteTaps, fightProfile, fightStyle, fishLoad, landingTimes, landingTech } from "../sceneActors.js";
import { fishShape, buildFishMesh, bodyWidth } from "../fish3d.js";
import { hasArt, artUrl } from "../../data/fishart.js";
import { bodyWave, turnToward, restHeight, surfaceSpine, releasePlan, releaseStep, swimAway } from "../fishMotion.js";
import { fishMaterials, donorOf, paintSkin } from "./fishLook.js";
import { castPoint, dirOf } from "./spots.js";
import { createPerson } from "./human3d.js";
import { lookFor, SKINS, COATS } from "./people.js";
import { createFpHands } from "./fpHands.js";
import { loadPart, fitNet } from "./glbParts.js";
import { fitRodReel, buildRod } from "./rodKit.js";
import { stepHandle, handleState, halfTurnsPassed } from "../reelHandle.js";
import { contactShadow } from "./contactShadow.js";
import { FILM } from "./film.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);
function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const n1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h = (k) => { const s = Math.sin(k * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }; return h(i) * (1 - u) + h(i + 1) * u; };

/** Clothes: a jacket, trousers and hat for each angler (chosen, or from their id). */
export const OUTFITS = [
  { jacket: 0x1f3a5f, trousers: 0x2b2b2e, hat: 0xd8a631, name: "Navy jacket" },
  { jacket: 0x4c5a2a, trousers: 0x3a3a30, hat: 0x2a2a2a, name: "Olive jacket" },
  { jacket: 0xb7322b, trousers: 0x23262b, hat: 0x1f3a5f, name: "Red waterproof" },
  { jacket: 0xe0b52a, trousers: 0x2a3138, hat: 0xb7322b, name: "Yellow waterproof" },
  { jacket: 0x1f6b67, trousers: 0x2e2a26, hat: 0xe8e4da, name: "Teal fleece" },
];
// ---- the rod and reel for each kind of fishing ----
// len (m), col (the whippings and spool), flex (softer bends more), the blank's radius at the butt and tip, the handle
// as [from, to, radius, part] along the rod (seat: metal; grip: EVA foam; cork), where the reel sits, the rings
// (where, and the first ring's size: bigger on a beachcaster), the reel's size, and a quiver tip on a feeder rod
const ROD = {
  beach: { name: "Beachcaster", len: 4.2, col: 0xd6a63c, flex: 0.78, r0: 0.0125, r1: 0.0026, seat: 0.68, g0: 0.018, reel: 1.3,
    handle: [[0, 0.03, 0.018, "seat"], [0.03, 0.62, 0.0165, "grip"], [0.62, 0.74, 0.014, "seat"], [0.74, 0.92, 0.0155, "grip"], [0.92, 0.95, 0.013, "seat"]], guides: [0.36, 0.5, 0.62, 0.72, 0.81, 0.88, 0.94, 0.98] },
  pier: { name: "Pier rod", len: 3.66, col: 0x2870ec, flex: 1, r0: 0.0108, r1: 0.0022, seat: 0.45, g0: 0.0135, reel: 1, whiteTip: 0.93, /* (12 ft, as Aaron's rod: its tip painted white with an orange band) */
    handle: [[0, 0.02, 0.016, "seat"], [0.02, 0.4, 0.0152, "grip"], [0.4, 0.5, 0.0128, "seat"], [0.5, 0.66, 0.0142, "grip"], [0.66, 0.69, 0.0122, "seat"]], guides: [0.25, 0.37, 0.49, 0.6, 0.7, 0.8, 0.89, 0.96] },
  estuary: { name: "Spinning rod", len: 3.0, col: 0x2870ec, flex: 1.05, r0: 0.0098, r1: 0.002, seat: 0.35, g0: 0.012, reel: 0.9,
    handle: [[0, 0.02, 0.015, "seat"], [0.02, 0.3, 0.0145, "cork"], [0.3, 0.4, 0.0125, "seat"], [0.4, 0.52, 0.0138, "cork"], [0.52, 0.55, 0.012, "seat"]], guides: [0.2, 0.33, 0.45, 0.57, 0.68, 0.78, 0.87, 0.95] },
  river: { name: "Float rod", len: 3.9, col: 0xd63434, flex: 1.35, r0: 0.0085, r1: 0.0015, seat: 0.29, g0: 0.008, reel: 0.8,
    handle: [[0, 0.02, 0.014, "seat"], [0.02, 0.25, 0.0135, "cork"], [0.25, 0.33, 0.012, "seat"], [0.33, 0.55, 0.013, "cork"], [0.55, 0.57, 0.0115, "seat"]], guides: [0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73, 0.8, 0.87, 0.93, 0.98] },
  lake: { name: "Feeder rod", len: 3.6, col: 0x2ea060, flex: 1.15, r0: 0.0095, r1: 0.0018, seat: 0.4, g0: 0.011, reel: 1, tip: { from: 0.86, col: 0xff4a2a },
    handle: [[0, 0.02, 0.015, "seat"], [0.02, 0.35, 0.0142, "grip"], [0.35, 0.45, 0.0125, "seat"], [0.45, 0.58, 0.0135, "grip"], [0.58, 0.61, 0.012, "seat"]], guides: [0.22, 0.34, 0.46, 0.57, 0.67, 0.76, 0.84, 0.9, 0.95, 0.985] },
};
export const rodFor = (venue) => ROD[venue] || ROD.pier;

// ---- the water's height, the same big waves as the shader, so floats and fish ride them ----
// ---- the sea's height: the same waves the water is drawn with (environment.js GLSL_WAVES, seaWaves), worked out here
// for whatever rides on it (the float, a fish at the surface, the drop net's hoop). It used to be a simpler set of four
// waves of its own, which didn't match the drawn sea by as much as a few tens of centimetres: a fish held "at the
// surface" was under the drawn water half the time, and the line ran down to nothing. (Float32 throughout the noise,
// as the graphics card works it, so the hashes agree)
const f32 = Math.fround, fract = (x) => f32(x - Math.floor(x));
function hash2(x, y) { let px = fract(f32(x * f32(123.34))), py = fract(f32(y * f32(456.21))); const d = f32(f32(px * f32(px + f32(45.32))) + f32(py * f32(py + f32(45.32)))); px = f32(px + d); py = f32(py + d); return fract(f32(px * py)); }
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
export function waveHeight(x, z, t, { swell = 0.3, wind = 0.3, windDir = [0.3, -1], kind = 0 } = {}) {
  const sea = kind < 0.5 ? 1 : kind < 1.5 ? 0.5 : 0;
  const wl = Math.hypot(windDir[0], windDir[1]) || 1, wd = [windDir[0] / wl, windDir[1] / wl], wx = [-wd[1], wd[0]];
  const g1 = noise2(x * 0.011 + t * 0.021, z * 0.011 - t * 0.013), g2 = noise2(x * 0.017 + 31 - t * 0.017, z * 0.017 + 31 - t * 0.024);
  const ph = (g1 - 0.5) * 5, A = (0.16 + 0.5 * swell) * sea, B = 0.045 + 0.13 * wind;
  const tr = (dx, dz, k, a, p) => { const l = Math.hypot(dx, dz) || 1; return a * Math.sin(((x * dx + z * dz) / l) * k - t * Math.sqrt(9.81 * k) + p); };
  return tr(0.2, -1, 0.085, A * (0.55 + 0.9 * g1), ph)
    + tr(-0.42, -1, 0.131, A * 0.55 * (0.5 + g2), ph * 0.7 + 1.3)
    + tr(0.65, -1, 0.207, A * 0.25 * (0.4 + 1.2 * g1), 4.1 - ph * 0.5)
    + tr(wd[0] + wx[0] * 0.28, wd[1] + wx[1] * 0.28, 0.41, B * (0.6 + 0.8 * g2), ph * 1.3)
    + tr(wd[0] - wx[0] * 0.43, wd[1] - wx[1] * 0.43, 0.63, B * 0.6 * (0.5 + g1), 2.2 - ph)
    + tr(wd[0] + wx[0] * 0.77, wd[1] + wx[1] * 0.77, 0.97, B * 0.32 * (0.4 + 1.2 * g2), ph * 1.7 + 5)
    + tr(wd[0] - wx[0] * 1.1, wd[1] - wx[1] * 1.1, 1.46, B * 0.18, 0.7 - ph * 2);
}

function label(text, colour = "#ffffff") {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d"); g.font = "700 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  const w = Math.min(250, g.measureText(text).width + 34);
  g.fillStyle = "rgba(10,20,27,.72)"; g.beginPath(); g.roundRect?.((256 - w) / 2, 8, w, 48, 24); g.fill();
  g.fillStyle = colour; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.95, 0.24, 1); s.renderOrder = 20;
  return s;
}
// a cylinder from a to b (for limbs, rod sections, ropes)
const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const tmpUp = new THREE.Vector3();
function between(mesh, a, b, r = null) {
  tmpV.subVectors(b, a); const len = tmpV.length() || 1e-4;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  tmpQ.setFromUnitVectors(UP, tmpV.multiplyScalar(1 / len)); mesh.quaternion.copy(tmpQ);
  mesh.scale.set(r ?? 1, len, r ?? 1);
}

// a diamond knotted mesh, see-through between the cords
function netTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
  g.clearRect(0, 0, 64, 64); g.strokeStyle = "#ffffff"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.moveTo(0, 0); g.lineTo(0, 0); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4); return t;
}

// ---- the species modelled in Blender (public/models/fish.glb, source-assets/blender/build_fish.py) ----
const MODELLED_FISH = new Set(["cod", "bass", "whiting", "mackerel", "plaice", "pollack"]);
const modelledCache = new Map();
/** One geometry for a modelled species: its body, fins and eyes as three groups (materials 0, 1 and 2), its uvs the
 *  picture's (turned the way a canvas texture reads them). A fresh copy each time (the fish is bent in place). */
function modelledFish(scene, species) {
  if (!modelledCache.has(species)) {
    const node = scene.getObjectByName("fish_" + species); if (!node) return null;
    const parts = { fish_body: null, fish_fin: null, fish_eye: null };
    node.updateWorldMatrix(true, true);
    node.traverse((o) => { if (o.isMesh && o.material?.name in parts) parts[o.material.name] = o.geometry.clone().applyMatrix4(o.matrixWorld); });
    const list = [parts.fish_body, parts.fish_fin, parts.fish_eye].filter(Boolean); if (!list.length || !parts.fish_body) return null;
    const pos = [], uv = [], idx = [], groups = []; let base = 0;
    list.forEach((g, gi) => {
      const p = g.attributes.position.array, t = g.attributes.uv.array, ix = g.index ? g.index.array : [...Array(p.length / 3).keys()];
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < t.length; i += 2) { uv.push(t[i], 1 - t[i + 1]); }
      groups.push([idx.length, ix.length, [parts.fish_body, parts.fish_fin, parts.fish_eye].indexOf(g)]);
      for (const k of ix) idx.push(k + base); base += p.length / 3;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    for (const [st, n, m] of groups) geo.addGroup(st, n, m);
    geo.computeVertexNormals(); modelledCache.set(species, geo);
  }
  return modelledCache.get(species).clone();
}

/** A generic fish (for species without a FishDock picture): a smooth lofted body and a forked tail. */
function genericFishGeometry() {
  const pos = [], idx = [], uv = [], K = 22, M = 12;
  for (let i = 0; i < K; i++) {
    const u = i / (K - 1), r = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.11 * (u < 0.85 ? 1 : 0.3) + 0.004;
    for (let j = 0; j < M; j++) { const a = (j / M) * Math.PI * 2; pos.push(u, Math.cos(a) * r, Math.sin(a) * r * 0.55); uv.push(u, j / M); }
  }
  for (let i = 0; i < K - 1; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + ((j + 1) % M); idx.push(a, a + M, b, b, a + M, b + M); }
  const base = pos.length / 3; pos.push(0.86, 0, 0, 1.0, 0.13, 0, 1.0, -0.13, 0, 0.95, 0, 0); uv.push(0.97, 0.25, 0.99, 0.02, 0.99, 0.48, 0.98, 0.25); idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createAngler(world, { id, name = "", spot, venue = "pier", outfit = 0, look = null, local = false, real = false, rail = false, onSound, onFeel } = {}) {
  const root = new THREE.Group(); world.add(root);
  const O = OUTFITS[((outfit % OUTFITS.length) + OUTFITS.length) % OUTFITS.length];
  // the person (human3d.js: a realistic person, with the simple figure3d.js figure standing in while it loads): their
  // own look if they chose one, otherwise a steady one from their id
  const fig = createPerson({ id, look: lookFor(id, look), outfit: local ? { ...O, sameTop: true } : O, venue }); root.add(fig.group);
  // the soft dark round your feet where you stand (contactShadow.js; hidden in a jump, and in first person with your body)
  const feetShadow = contactShadow(1.0, 0.85, 0.75); root.add(feetShadow);
  // your forearms and hands in first person (only ever your own angler's are needed: made the first time they're shown)
  let fpv = null;
  const part = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const tagY = fig.look.height + 0.3;
  let tag = label(name || "Angler", local ? "#7ee8de" : "#ffffff"); tag.position.set(0, tagY, 0); root.add(tag);
  // talking in voice chat: sound waves above the name, pulsing
  const talkTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); g.strokeStyle = "#7ee8de"; g.lineWidth = 5; g.lineCap = "round"; for (const r of [10, 19, 28]) { g.beginPath(); g.arc(32, 40, r, -Math.PI * 0.8, -Math.PI * 0.2); g.stroke(); } g.fillStyle = "#7ee8de"; g.beginPath(); g.arc(32, 40, 4, 0, Math.PI * 2); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const talk = new THREE.Sprite(new THREE.SpriteMaterial({ map: talkTex, depthTest: false, transparent: true })); talk.scale.set(0.32, 0.32, 1); talk.position.set(0, tagY + 0.31, 0); talk.visible = false; talk.renderOrder = 10; root.add(talk);
  let speaking = false;
  // an emote (Fish Together): a wave, a cheer or a clap for a couple of seconds
  const EMOTE_S = { wave: 2.2, cheer: 1.8, clap: 2.0 };
  let emoting = null;

  // ---- the rod: sections along a bending curve, a reel, a rest or tripod ----
  const R = ROD[venue] || ROD.pier;
  // a real rod: a slim graphite blank tapering to a fine tip, an EVA rear grip, a metal reel seat and a fore grip, rings
  // on short legs under the blank (smaller towards the tip) each bound with a coloured whipping, and a spinning reel
  // hanging under the seat: its body, rotor, spool of line, bail arm and a crank that turns as you reel
  const mBlank = new THREE.MeshStandardMaterial({ color: 0x1e2833, roughness: 0.26, metalness: 0.4 });
  const mWhip = new THREE.MeshStandardMaterial({ color: R.col, roughness: 0.35, metalness: 0.25 });
  const mGrip = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95 });
  const mSeat = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.28, metalness: 0.85 });
  const mRing = new THREE.MeshStandardMaterial({ color: 0xc4cacf, roughness: 0.18, metalness: 0.9 });
  const mReel = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.35, metalness: 0.6 });
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  const NSEG = 24;
  const mCork = new THREE.MeshStandardMaterial({ color: 0xc49a62, roughness: 0.9 });
  // a feeder rod's quiver tip: the last part of the blank painted bright, so bites show
  const mTip = R.tip ? new THREE.MeshStandardMaterial({ color: R.tip.col, roughness: 0.4, emissive: R.tip.col, emissiveIntensity: 0.15 }) : null;
  const rodSegs = Array.from({ length: NSEG }, (_, i) => { const m = new THREE.Mesh(unitCyl, mTip && (i + 0.5) / NSEG >= R.tip.from ? mTip : mBlank); m.castShadow = true; root.add(m); return { m, r: lerp(R.r0, R.r1, (i / (NSEG - 1)) ** 0.8) }; });
  const PART = { seat: mSeat, grip: mGrip, cork: mCork };
  const handleParts = R.handle.map(([a, b, r, part]) => { const m = new THREE.Mesh(unitCyl, PART[part]); m.castShadow = true; root.add(m); return { m, a, b, r }; });
  const GUIDES = R.guides;
  const guides = GUIDES.map((s, i) => {
    const r = R.g0 * (Math.min(R.g0, 0.003) / R.g0) ** (i / (GUIDES.length - 1)) ** 0.8, /* (as rodKit.js: shrinking fastest near the butt) */ g = new THREE.Group(); root.add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.0013, r * 0.15), 6, 18), mRing); ring.position.y = -(r * 1.35 + 0.006); g.add(ring);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, r * 0.4 + 0.008, 4), mRing); leg.position.y = -(r * 0.2 + 0.004); g.add(leg);
    const wrap = new THREE.Mesh(unitCyl, mWhip); wrap.rotation.x = Math.PI / 2; wrap.scale.set(0.0001, 0.026, 0.0001); g.add(wrap);
    return { g, s, r, ring, wrap };
  });
  const reel = new THREE.Group(); root.add(reel);
  {
    // built with z along the rod towards the tip, y up towards the blank, hanging below it
    const at = (geo, mat, x, y, z, rx = 0, rz = 0, parent = reel) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; };
    at(new THREE.BoxGeometry(0.009, 0.006, 0.05), mSeat, 0, -0.016, 0); // the foot in the seat
    at(new THREE.BoxGeometry(0.008, 0.045, 0.014), mReel, 0, -0.04, -0.004); // the stem
    at(new THREE.CylinderGeometry(0.03, 0.03, 0.042, 18), mReel, 0, -0.072, -0.012, 0, Math.PI / 2); // the gearbox
    at(new THREE.SphereGeometry(0.03, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mReel, 0, -0.072, -0.012, -Math.PI / 2); // its rounded back
    reel.userData.rotor = new THREE.Group(); reel.userData.rotor.position.set(0, -0.072, 0.018); reel.add(reel.userData.rotor);
    at(new THREE.CylinderGeometry(0.031, 0.026, 0.022, 18), mReel, 0, 0, 0, Math.PI / 2, 0, reel.userData.rotor); // rotor cup
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0022, 6, 20, Math.PI), mSeat); bail.position.set(0, 0, 0.03); reel.userData.rotor.add(bail);
    at(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 20), mWhip, 0, -0.072, 0.048, Math.PI / 2); // the spool
    at(new THREE.CylinderGeometry(0.0245, 0.0245, 0.026, 20), new THREE.MeshStandardMaterial({ color: 0xe9ece6, roughness: 0.6 }), 0, -0.072, 0.049, Math.PI / 2); // line on it
    // the handle on the reel's left (wound by the left hand while the right holds the rod: on the right, the arms crossed)
    const crank = new THREE.Group(); crank.position.set(0.024, -0.072, -0.012); reel.add(crank); reel.userData.crank = crank;
    at(new THREE.BoxGeometry(0.004, 0.05, 0.007), mSeat, 0.004, -0.024, 0, 0, 0, crank);
    at(new THREE.CylinderGeometry(0.0075, 0.0075, 0.022, 10), mGrip, 0.016, -0.048, 0, 0, Math.PI / 2, crank); // the knob
  }
  const handle = reel.userData.crank;
  reel.scale.setScalar(R.reel);
  // the rod and reel modelled in Blender (public/models/rodkit.glb, rodKit.js), in place of the simple ones once they've
  // loaded: the same curve bends it, the same handle angle turns the reel (the simple parts are then hidden, not drawn)
  let rodKit = null;
  loadPart("rodkit").then((sc) => {
    if (!fitRodReel(reel, sc)) return;
    rodKit = buildRod(sc, R); if (!rodKit) return;
    root.add(rodKit.group);
    for (const sg of rodSegs) sg.m.visible = false; for (const hp of handleParts) hp.m.visible = false; for (const gd of guides) gd.g.visible = false;
  }).catch(() => {});
  // the bend along the rod: curvature goes with the bending moment (most at the butt, none at the tip) over the blank's
  // stiffness (its radius to the fourth: the slim tip gives most), and none along the handle, the stiff butt section.
  // BEND[i]: how much of the total turn the rod has made by point i (0 at the butt, 1 at the tip)
  const BEND = (() => {
    const s0 = Math.min(0.5, (R.handle[R.handle.length - 1][1] + 0.02) / R.len), k = [], out = [0];
    for (let i = 0; i < NSEG; i++) { const s = (i + 0.5) / NSEG, r = (R.r0 + (R.r1 - R.r0) * Math.pow(s, 0.8)) / R.r0; k.push(s < s0 ? 0 : (1.05 - s) / Math.pow(r, 4)); }
    const tot = k.reduce((a, b) => a + b, 0); let c = 0; for (const x of k) { c += x / tot; out.push(c); } return out;
  })();
  // the line: one thread from the spool, over the line roller, through every ring and out to the rig or the fish
  // (fishLine.js), in the world's space
  const fLine = fishLine(GUIDES.length); world.add(fLine.mesh);
  const flM = new THREE.Vector3(), flT = new THREE.Vector3(), flE = new THREE.Vector3(), dropAt = new THREE.Vector3(); let spoolInfo = null, spinWas = null, dropHad = false;
  const flWind = [0, 0], flCur = [0, 0], flO = {};
  // the rest: a tripod on the beach, a rest on the bank, the railing on a pier or quay
  const rest = new THREE.Group(); root.add(rest);
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.7, roughness: 0.35 });
  let restTop = null, restButt = null;
  if (venue === "beach") {
    restTop = new THREE.Vector3(0.55, 1.55, -0.9); restButt = new THREE.Vector3(0.55, 0.12, -0.15);
    for (const [dx, dz] of [[-0.35, 0.3], [0.35, 0.3], [0, -0.5]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), mMetal); between(l, restTop.clone().add(new THREE.Vector3(0, 0.02, 0)), new THREE.Vector3(0.55 + dx, 0, -0.9 + dz)); rest.add(l); }
  } else if (venue === "river" || venue === "lake") {
    restTop = new THREE.Vector3(0.45, 0.42, -0.85); restButt = new THREE.Vector3(0.45, 0.22, 0.25);
    for (const p of [restTop, restButt]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), mMetal); between(l, new THREE.Vector3(p.x, 0, p.z), p); rest.add(l); }
  } else {
    restTop = new THREE.Vector3(0.4, 1.12, -0.3); restButt = new THREE.Vector3(0.35, 0.05, 0.4); // leaning on the railing (moved to it once the spot is known)
  }
  // ---- the seat box's padded seat (charcoal cloth with a stitched border) and its badge ----
  function canvasPad() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.fillStyle = "#2c2f33"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${0.035 + Math.random() * 0.04})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
    g.strokeStyle = "rgba(160,165,170,.55)"; g.setLineDash([5, 4]); g.lineWidth = 2; g.strokeRect(22, 22, 212, 212);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.setLineDash([]); g.lineWidth = 3; g.strokeRect(14, 14, 228, 228);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function badgeTex() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
    g.fillStyle = "#d9dcde"; g.beginPath(); g.roundRect(2, 2, 252, 60, 12); g.fill();
    g.fillStyle = "#1d2a33"; g.font = "bold 34px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("SEAFORM 30", 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  // ---- the unhooking mat's top: quilted cloth (colour and a normal map from the same quilting) and a ruler ----
  function quiltTex() {
    const W = 512, H = 268, S = 46, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const img = g.createImageData(W, H), hgt = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = (x + y) / S, b = (x - y + 1e4) / S, d1 = Math.min(a % 1, 1 - (a % 1)), d2 = Math.min(b % 1, 1 - (b % 1));
      const h = Math.sqrt(Math.min(1, Math.min(d1, d2) * 3.2)); hgt[y * W + x] = h;
      const k = (0.62 + 0.38 * h) * (0.96 + Math.random() * 0.06), i = (y * W + x) * 4;
      img.data[i] = 47 * k; img.data[i + 1] = 92 * k; img.data[i + 2] = 61 * k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // the ruler along the near edge: a pale strip with centimetre ticks and the tens numbered
    g.fillStyle = "#d8dccf"; g.fillRect(0, H - 30, W, 30);
    g.fillStyle = "#1e2a22"; g.font = "bold 11px Arial, sans-serif"; g.textAlign = "center";
    for (let cm = 0; cm <= 84; cm++) { const x = 6 + cm * (W - 12) / 84, t = cm % 10 === 0 ? 14 : cm % 5 === 0 ? 10 : 6; g.fillRect(x - 0.6, H - 30, 1.2, t); if (cm % 10 === 0 && cm > 0) g.fillText(String(cm), x, H - 6); }
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const n = document.createElement("canvas"); n.width = W; n.height = H; const gn = n.getContext("2d"), ni = gn.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hx = hgt[y * W + Math.min(W - 1, x + 1)] - hgt[y * W + Math.max(0, x - 1)], hy = hgt[Math.min(H - 1, y + 1) * W + x] - hgt[Math.max(0, y - 1) * W + x];
      const v = new THREE.Vector3(-hx * 2.2, hy * 2.2, 1).normalize(), i = (y * W + x) * 4, rule = y > H - 31 ? 0 : 1;
      ni.data[i] = (rule ? v.x * 0.5 + 0.5 : 0.5) * 255; ni.data[i + 1] = (rule ? v.y * 0.5 + 0.5 : 0.5) * 255; ni.data[i + 2] = (rule ? v.z * 0.5 + 0.5 : 1) * 255; ni.data[i + 3] = 255;
    }
    gn.putImageData(ni, 0, 0);
    const normal = new THREE.CanvasTexture(n); normal.colorSpace = THREE.NoColorSpace;
    return { map, normal };
  }
  // a slab with rounded edges whose top face carries the whole texture (uv from x and z)
  function roundSlab(w, h, d, r) {
    const g = new THREE.BoxGeometry(w, h, d, 12, 2, 8), q = g.attributes.position, uv = g.attributes.uv, v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < q.count; i++) { v.fromBufferAttribute(q, i); c.set(Math.max(-w / 2 + r, Math.min(w / 2 - r, v.x)), Math.max(-h / 2 + r * 0.5, Math.min(h / 2 - r * 0.5, v.y)), Math.max(-d / 2 + r, Math.min(d / 2 - r, v.z)));
      const n = v.clone().sub(c); if (n.lengthSq() > 1e-12) n.setLength(r); else n.set(0, 0, 0); const p = n.lengthSq() ? c.clone().add(n) : v; q.setXYZ(i, p.x, Math.min(h / 2, p.y), p.z); uv.setXY(i, p.x / w + 0.5, 0.5 - p.z / d); }
    g.computeVertexNormals(); return g;
  }
  // tackle box and bucket beside them
  // (they stay at the spot when you walk off)
  const kit = new THREE.Group(); world.add(kit);
  // a seat box (the tackle box sea anglers sit on): moulded base, a lighter lid with rounded edges, a carry handle on
  // metal posts, two catches; and a bait bucket: tapered plastic with a rolled rim, a wire handle and a snap-on lid
  {
    const mBox = new THREE.MeshStandardMaterial({ color: 0x24402e, roughness: 0.55 }), mLid = new THREE.MeshStandardMaterial({ color: 0x31573f, roughness: 0.5 });
    const mBlack = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.6 }), mSteel = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.85 });
    // (moulded plastic: every edge rounded, the base a touch narrower at the foot, a raised rim where the lid meets it;
    // a sharp-edged box read as a green block)
    const rbox = (w, h, d, r, taper = 0) => { const g = new THREE.BoxGeometry(w, h, d, 10, 6, 8), q = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < q.count; i++) { v.fromBufferAttribute(q, i); const k = 1 - taper * (0.5 - v.y / h); const hw = w / 2 * k - r, hd = d / 2 * k - r, hh = h / 2 - r;
        c.set(Math.max(-hw, Math.min(hw, v.x * k)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z * k))); const n = v.set(v.x * k, v.y, v.z * k).sub(c); if (n.lengthSq() > 1e-10) n.setLength(r); q.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z); }
      g.computeVertexNormals(); return g; };
    const box = new THREE.Group(); box.position.set(-0.55, 0, 0.25); kit.add(box);
    const base = new THREE.Mesh(rbox(0.46, 0.27, 0.31, 0.025, 0.05), mBox); base.position.y = 0.135; box.add(base);
    const rimB = new THREE.Mesh(rbox(0.47, 0.022, 0.32, 0.01), mBox); rimB.position.y = 0.268; box.add(rimB);
    // (a sea angler's seat box as they're sold: the lid with a padded seat on it, a drawer in the front, moulded handles
    // at the ends, metal catches, a shoulder strap, the maker's badge; the moulding a little scuffed)
    const lidTop = new THREE.Mesh(rbox(0.455, 0.035, 0.305, 0.016), mLid); lidTop.position.y = 0.29; box.add(lidTop);
    const padTex = canvasPad(), mPad = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.92, color: 0xffffff });
    const pad = new THREE.Mesh(rbox(0.42, 0.045, 0.27, 0.02), mPad); pad.position.y = 0.327; box.add(pad);
    // the drawer: a slightly proud panel across the front with a recessed pull
    const drawer = new THREE.Mesh(rbox(0.38, 0.1, 0.014, 0.006), mLid); drawer.position.set(0, 0.105, -0.152); box.add(drawer);
    const pull = new THREE.Mesh(rbox(0.12, 0.018, 0.012, 0.005), mBlack); pull.position.set(0, 0.105, -0.161); box.add(pull);
    // the maker's badge above it (a made-up name: no real brand)
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.028), new THREE.MeshStandardMaterial({ map: badgeTex(), roughness: 0.4, metalness: 0.3, transparent: true })); badge.position.set(0, 0.205, -0.1585); badge.rotation.y = Math.PI; box.add(badge);
    for (const sx of [-1, 1]) {
      const clip = new THREE.Mesh(rbox(0.032, 0.05, 0.012, 0.004), mSteel); clip.position.set(sx * 0.17, 0.262, -0.159); box.add(clip); // the catches
      const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 14, Math.PI), mBlack); hnd.rotation.set(0, Math.PI / 2, 0); hnd.position.set(sx * 0.236, 0.2, 0); hnd.scale.set(1, 0.6, 1); box.add(hnd); // moulded end handles
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.025, 0.32), mBlack); strap.position.y = 0.06; box.add(strap);
    const mBucket = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.45 }), mBlue = new THREE.MeshStandardMaterial({ color: 0x2e5a8c, roughness: 0.5 });
    const bk = new THREE.Group(); bk.position.set(-0.32, 0, 0.64); kit.add(bk);
    // (a little scuffed and grubby, as bait buckets get: darker towards the foot)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.28, 32, 6, true), new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true })); body.position.y = 0.14; bk.add(body);
    { const q = body.geometry.attributes.position, col = new Float32Array(q.count * 3); for (let i = 0; i < q.count; i++) { const y = q.getY(i) / 0.28 + 0.5, k = 0.72 + 0.28 * Math.min(1, y * 1.6) - 0.04 * Math.sin(q.getX(i) * 90 + q.getZ(i) * 60) ** 2; col[i * 3] = col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.97; } body.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3)); }
    for (const yy of [0.07, 0.2]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.111 + yy * 0.068, 0.0035, 5, 32), mBucket); band.rotation.x = Math.PI / 2; band.position.y = yy; bk.add(band); } // (the moulded hoops round it)
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), mBucket); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.004; bk.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.008, 6, 28), mBucket); rim.rotation.x = Math.PI / 2; rim.position.y = 0.28; bk.add(rim);
    const lidB = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.136, 0.018, 24), mBlue); lidB.position.y = 0.29; bk.add(lidB);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.003, 4, 20, Math.PI), mSteel); wire.position.y = 0.27; wire.rotation.y = 0.5; bk.add(wire);
    for (const o of [box, bk]) o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    // ---- contact shadows: the dark just under the box and the bucket (contactShadow.js) ----
    box.add(contactShadow(0.82, 0.64, 0.8)); bk.add(contactShadow(0.5, 0.5, 0.75));
  }
  // a landing net (rivers, lakes, estuaries) or a drop net with ropes (piers)
  // the net: knotted mesh you can see through (a drawn diamond pattern), hanging as a soft bag under a metal hoop
  const mNet = new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 1, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, map: netTexture(), depthWrite: false });
  const net = new THREE.Group(); net.name = "fdDropNet"; world.add(net); net.visible = false;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.015, 6, 24), mMetal); hoop.rotation.x = Math.PI / 2; net.add(hoop);
  const bagGeo = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return new THREE.Vector2(0.35 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.15 * u) + 0.02, -0.5 * u); }), 18);
  let bag = new THREE.Mesh(bagGeo, mNet); net.add(bag);
  // the nets modelled in Blender (public/models/nets.glb): a drop net at a pier, a landing net elsewhere
  loadPart("nets").then((sc) => { const b = fitNet(net, sc, venue === "pier" ? "drop" : "landing"); if (b) bag = b; }).catch(() => {});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), mMetal); world.add(pole); pole.visible = false;
  // an unhooking mat (a padded, wipe-clean mat: where a fish you'll put back is laid to be looked at and unhooked)
  const mat = new THREE.Group(); world.add(mat); mat.visible = false;
  const MAT_AT = new THREE.Vector3(0.05, 0, -0.62); // (where it's laid: in front of you)
  // (and always on the deck: its far edge a hand's width inside the rail. At a spot close to the wall, 62 cm out put it
  // half over the wall's edge and the sea)
  const matAtL = () => MAT_AT.clone().setZ(Math.max(MAT_AT.z, -Math.max(0.3, edge - 0.22) + 0.34));
  // (a real unhooking mat: a padded, quilted top in wipe-clean green, a printed ruler along the near edge to measure the
  // fish against, and soft rolled bolsters down the long sides so a flapping fish can't slip off. A flat green board
  // with a dark frame read as a tray)
  { const Q = quiltTex();
    const top = new THREE.Mesh(roundSlab(0.84, 0.032, 0.44, 0.014), new THREE.MeshStandardMaterial({ map: Q.map, normalMap: Q.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.62 })); top.position.y = 0.024;
    const edgeM = new THREE.MeshStandardMaterial({ color: 0x24402c, roughness: 0.66 });
    for (const sz of [-1, 1]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.8, 6, 14), edgeM); b.rotation.z = Math.PI / 2; b.scale.set(1, 1, 0.9); b.position.set(0, 0.03, sz * 0.236); mat.add(b); } // the bolsters
    mat.add(top); mat.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
    mat.add(contactShadow(1.1, 0.72, 0.4)); }
  // the drop net's rope: thin braided polypropylene (a muted blue), and its three bridles to the hoop
  // the drop net's rope: 10 mm black three-strand polypropylene, the twist drawn on (a canvas of diagonal strands and the
  // grooves between them, as a colour and a bump), its pitch kept true to the rope's length each frame. It was a thin
  // flat-coloured five-sided rod that read as a thread
  const ropeTex = (() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas"); c.width = 32; c.height = 64; const g = c.getContext("2d"), img = g.createImageData(32, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const t = ((x / 32) * 3 + y / 64 * 3) % 1, k = Math.sin(t * Math.PI), v = 0.45 + 0.55 * Math.pow(k, 0.6); img.data.set([34 * v + 9, 35 * v + 9, 38 * v + 10, 255], (y * 32 + x) * 4); } /* (black rope) */
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ropes = [0, 1, 2, 3, 4, 5].map(() => {
    const map = ropeTex ? ropeTex.clone() : null; if (map) map.needsUpdate = true;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0x1c1d20, map, bumpMap: map, bumpScale: 0.6, roughness: 0.8 }));
    r.onBeforeRender = () => { if (map) map.repeat.set(1, Math.max(1, r.scale.y / 0.035)); }; // (a strand round every 3.5 cm, whatever the length)
    world.add(r); r.visible = false; return r;
  });

  // ---- line, rig, fish: in the world ----
  const floatRig = venue === "river" || venue === "lake";
  const rig = new THREE.Group(); world.add(rig);
  if (floatRig) { part(new THREE.CylinderGeometry(0.012, 0.02, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0x401000 }), 0, 0.06, 0, rig); part(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd83a }), 0, 0, 0, rig); }
  else part(new THREE.SphereGeometry(0.03, 8, 6), mMetal, 0, 0, 0, rig);
  // the fish's skin (fishLook.js): a wet body with its scales' relief, thin fins light comes through, glassy eyes
  let mats = fishMaterials(null);
  let fishGeo = genericFishGeometry(), fishBase = fishGeo.attributes.position.array.slice();
  const fish = new THREE.Mesh(fishGeo, mats.body); fish.visible = false; fish.castShadow = true; world.add(fish);
  let fishFor = "", fishLen = 0.45, prof = fightProfile(null), load = 1, LT = landingTimes(null, 45, null, venue), tech = "lift";
  // the mesh's own size (in fish lengths): the spine to the back and to the belly, and half its thickness, so it can be
  // laid on a mat, held in the hands or sat at the surface without going into anything
  let fishBox = { up: 0.12, down: 0.12, thick: 0.05 };
  function useGeometry(geo, materials) {
    fish.geometry = fishGeo = geo; fishBase = geo.attributes.position.array.slice();
    let up = 0, down = 0, thick = 0;
    for (let i = 0; i < fishBase.length; i += 3) { const u = fishBase[i], y = fishBase[i + 1], z = fishBase[i + 2]; if (u < 0.02 || u > 0.8) continue; up = Math.max(up, y); down = Math.max(down, -y); thick = Math.max(thick, Math.abs(z)); }
    fishBox = { up: up || 0.12, down: down || 0.12, thick: thick || 0.05 };
    fish.material = materials;
  }
  function setMats(next) { for (const m of Object.values(mats)) { if (m.normalMap) m.normalMap.dispose(); m.dispose(); } mats = next; }
  const halfDepth = () => fishBox.down * fishLen, halfThick = () => fishBox.thick * fishLen;
  const TIRED_ROLL = 1.15; // (how far over a beaten fish lies at the surface: most of the way onto its side)

  function setFish(species, lengthCm, weightKg) {
    const key = `${species}|${lengthCm}|${weightKg}`;
    if (key === fishFor) return; fishFor = key;
    prof = fightProfile(species); fishLen = clamp((lengthCm || 40) / 100, 0.12, 2);
    load = fishLoad(species, lengthCm, weightKg); LT = landingTimes(species, lengthCm, weightKg, venue); tech = landingTech(species, lengthCm, weightKg, venue);
    setMats(fishMaterials(species, { len: fishLen })); useGeometry(genericFishGeometry(), mats.body);
    // its own picture where FishDock has one; otherwise the picture of a fish of a similar build (fishLook.js DONORS),
    // painted in this species' own colouring
    const own = !!species && hasArt(species), donor = own ? null : donorOf(species), pic = own ? species : donor?.[0];
    if (!pic) return;
    const img = new Image();
    img.onload = () => {
      if (fishFor !== key) return;
      try {
        const c = document.createElement("canvas"); c.width = 480; c.height = 320;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (fightProfile(pic).headRight) { g.translate(480, 0); g.scale(-1, 1); }
        g.drawImage(img, 0, 0, 480, 320);
        const im = g.getImageData(0, 0, 480, 320), px = im.data, a = new Uint8Array(480 * 320);
        for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
        const shape = fishShape(a, 480, 320);
        if (!shape.ok) return;
        if (!own) { paintSkin(im, shape, species); g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(im, 0, 0); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const m = buildFishMesh(shape, { width: bodyWidth(pic), flat: prof.flat });
        const geo = new THREE.BufferGeometry();
        const pos = m.pos.slice(); if (donor && donor[1] !== 1) for (let i = 1; i < pos.length; i += 3) pos[i] *= donor[1];
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const uv = new Float32Array(m.uv.length); for (let i = 0; i < uv.length; i += 2) { uv[i] = m.uv[i]; uv[i + 1] = 1 - m.uv[i + 1]; }
        geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        geo.setIndex(new THREE.BufferAttribute(new Uint16Array([...m.idx, ...m.finIdx]), 1)); geo.addGroup(0, m.idx.length, 0); geo.addGroup(m.idx.length, m.finIdx.length, 1);
        geo.computeVertexNormals();
        setMats(fishMaterials(species, { map: tex, len: fishLen }));
        useGeometry(geo, [mats.body, mats.fin, mats.eye]);
        // the species modelled in Blender (fish.glb: a rounder body, a fuller belly, eyes standing proud), where there
        // is one: the same picture over it, the same bending
        if (MODELLED_FISH.has(pic)) loadPart("fish").then((sc) => {
          if (fishFor !== key) return;
          const geoBlend = modelledFish(sc, pic); if (!geoBlend) return;
          if (donor && donor[1] !== 1) { const p = geoBlend.attributes.position.array; for (let i = 1; i < p.length; i += 3) p[i] *= donor[1]; geoBlend.computeVertexNormals(); }
          useGeometry(geoBlend, [mats.body, mats.fin, mats.eye]);
        }).catch(() => {});
      } catch { /* keep the generic fish */ }
    };
    img.src = artUrl(pic, "s");
  }
  // bend the fish along its body and place it: mouth at `at`, body along `dir` (a unit vector from head to tail). Its
  // back is kept as near upright as the direction allows, and where the fish points straight up or down (hanging on
  // the line) its flank turns to face the angler: the "up" it keeps changes smoothly, so the fish never spins as it
  // swings through the vertical. roll turns it about its spine (a quarter turn: on its side); `ease` (0..1) eases its
  // turn from the last frame's, for a fish swimming (its heading changes at a fish's pace, not in a jump)
  const fBase = new THREE.Vector3(), fishQ = new THREE.Quaternion(), mtx = new THREE.Matrix4(), fUp = new THREE.Vector3(), fZ = new THREE.Vector3(), fRef = new THREE.Vector3();
  let fishShown = false;
  function poseFish(at, dir, t, { beat = 1, curl = 0, roll = 0, ease: easeK = 0 } = {}) {
    const p = fishGeo.attributes.position, a = p.array, wave = { tempo: prof.tempo, flex: prof.flex, beat, curl };
    for (let i = 0; i < a.length; i += 3) {
      const u = fishBase[i], y = fishBase[i + 1], z = fishBase[i + 2];
      a[i] = u * fishLen; a[i + 1] = y * fishLen; a[i + 2] = (z + bodyWave(u, t, wave)) * fishLen;
    }
    p.needsUpdate = true; fishGeo.computeVertexNormals();
    const x = fBase.copy(dir).normalize();
    const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]), w = clamp((Math.abs(x.y) - 0.6) / 0.37, 0, 1);
    fRef.set(0, 1, 0).multiplyScalar(1 - w).addScaledVector(side, w);
    fUp.copy(fRef).addScaledVector(x, -fRef.dot(x)); if (fUp.lengthSq() < 1e-6) fUp.set(0, 0, 1).addScaledVector(x, -x.z); fUp.normalize();
    fZ.crossVectors(x, fUp).normalize();
    mtx.makeBasis(x, fUp, fZ); fishQ.setFromRotationMatrix(mtx);
    if (roll) fishQ.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
    if (easeK > 0 && fishShown) fish.quaternion.slerp(fishQ, easeK); else fish.quaternion.copy(fishQ);
    fish.position.copy(at); fish.visible = true;
  }

  // ---- placing the angler ----
  let events = [];
  // the fight as you reel it (tap reeling, reelModel.js), for your own angler: how far in the fish is, the line's
  // tension, the drag slipping, the handle's turns. Others' fights follow their events' times
  let fightIn = null, fightPr = null, lastTurns = 0, lastDragSound = 0, viewIn = null, figYaw = 0;
  let face = 0, at = new THREE.Vector3(), castAt = new THREE.Vector3(), nearAt = new THREE.Vector3(), edge = 1;
  // `edge`: how far in front of the angler the pier, quay or bank ends (the water starts). The fish comes up a little
  // beyond it, never under the deck, so it can be seen being landed
  const REACH = { beach: 1, pier: 2.4, estuary: 2.0, river: 1.4, lake: 1.4 };
  const EDGE = { beach: 6, pier: 0.9, estuary: 1.2, river: 2.2, lake: 2.0 };
  let curSpot = spot;
  // a cast with its own distance and aim (hold-to-cast in the 3D view): the rig lands there instead of the spot's usual
  // place. The newest cast in the angler's events decides
  function castFromEvents() {
    const ev = [...(events || [])].reverse().find((e) => e.type === "cast");
    const d = ev?.data;
    if (!d || !Number.isFinite(d.dist)) return;
    const a = face + (Number.isFinite(d.aim) ? d.aim : 0);
    castAt.set(at.x + Math.sin(a) * d.dist, 0, at.z - Math.cos(a) * d.dist);
  }
  function place(s) {
    curSpot = s; face = s.face; at.set(...s.at); root.position.copy(at); root.rotation.y = -face; kit.position.copy(at); kit.rotation.y = -face;
    const c = castPoint(s); castAt.set(c[0], 0, c[2]); castFromEvents();
    const [dx, dz] = dirOf(face);
    edge = Number.isFinite(s.edge) ? s.edge : EDGE[venue] ?? 1;
    // a real pier's railing stands 22 cm in from its edge: the rod leans on its top rail
    if (rail) restTop.set(0.4, 1.12, -Math.max(0.3, edge - 0.22));
    const out = edge + (REACH[venue] ?? 2);
    nearAt.set(at.x + dx * out, 0, at.z + dz * out);
  }
  place(spot);

  // springy rod: bend and tip
  const spr = { k: 0, kv: 0, tip: 0, tipv: 0 };
  const spring = (key, vkey, target, w, z, dt) => { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { const a = w * w * (target - spr[key]) - 2 * z * w * spr[vkey]; spr[vkey] += a * h; spr[key] += spr[vkey] * h; } };

  let fishHead = NaN, fishPrev = null, keptFrom = null, lastKept = null; // (the fish's heading as it swims, where it was a frame ago, where it lay when you chose to put it back)
  let lastKey = "", P = {}, seed = rng(1), splashCb = null, rippleCb = null, prevAge = 0, fightPos = null, landStart = null, hintFish = null;
  // the fish you've landed, until you decide: lying in the net (deck), held up for a look (inspect), going back in
  // (release), or kept (gone: the catch card shows it)
  let kept = null, matOut = false;
  let ropeHeld = false, handsNow = [new THREE.Vector3(), new THREE.Vector3()]; // where the hands are (local), for the drop net's rope
  let walking = null; // walking about (walker.js): where, which way, how fast, the stride
  let tagOff = false;
  let landStage = null, landWater = null; // the drop net's stage while landing (for the hands): up | rod | pick | lower | lead | haul | in
  let dropRig = null, ropePull = null, releaseInfo = null, releaseRope = null, matOn = false, releasePole = false, prevKt = -1; // the drop net's rope: over the rail where, hanging or not; which hand is pulling and how far through the pull
  const rodS = { butt: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), key: "", until: 0, ok: false }; // the rod eased from one way of holding it to the next
  const figOff = new THREE.Vector3(); // (the body shuffled in towards a fish it's kneeling by: see the person's pose)
  const carry = { base: null, yaw: 0, d: new THREE.Vector3(), sway: 0, trail: 0, tilt: 0, up: 0 }; // carrying it as you walk: its sway with your steps
  const wrapR = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let fp = false, leanNow = 0, eyeH = 1.6, tNow = 0, fpPullNow = 0, stoopNow = 0, stepNow = 0;
  // ---- your body's weight in first person (metres from where the eye would be: x right, y up, z back) ----
  // the eye rides on it, and the rod and your hands hang off the eye: rocking back for a cast and throwing the weight
  // forwards through it, leaning back against a fish and being pulled towards it on a surge. A spring, a touch under
  // damped, so the weight carries a little past and settles, never snapping to a pose
  const body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }; let bodyTo = { x: 0, y: 0, z: 0 }; // first person: the rod held where you can see it; leaning over the rail to land a fish
  const toWorld = (v) => v.clone().applyMatrix4(root.matrixWorld);
  const toLocal = (v) => root.worldToLocal(v.clone());
  const pts = Array.from({ length: NSEG + 1 }, () => new THREE.Vector3());

  function frame(t, now, dt, env) {
    root.updateMatrixWorld(true); tNow = t;
    reel.userData.slipping = false;
    const info = phaseAt(events, now);
    const age = Math.max(0, (now - info.since) / 1000);
    const key = `${info.phase}|${info.since}`;
    if (key !== lastKey) {
      lastKey = key; prevAge = age > 1.2 ? age : -1; seed = rng(hashSeed(`${id}|${info.since}|${info.phase}`));
      P = { strong: seed() < 0.35 + 0.3 * prof.pull, s1: seed() * 10, s2: seed() * 10, taps: null, side: seed() < 0.5 ? -1 : 1 };
      if (info.phase === "landing" || info.phase === "hooked") { const d = info.ev?.type === "catch" ? info.ev.data || {} : hintFish || {}; setFish(d.species || null, d.lengthCm || null, d.weightKg || null); }
      else if (info.phase === "bite" && hintFish) setFish(hintFish.species, hintFish.lengthCm, null);
      if (info.phase === "landing") landStart = fightPos ? fightPos.clone() : nearAt.clone().lerp(castAt, 0.25);
    }
    const crossed = (m) => prevAge < m && age >= m;
    // what you feel (haptics.js), at the same moments the scene draws; a real trip only feels what was logged
    const fishInfo = () => { const d = info.ev?.type === "catch" ? info.ev.data || {} : hintFish || {}; return { species: prof.species || d.species || null, lengthCm: d.lengthCm || null, pull: prof.pull }; };
    const feel = (n, extra = {}, recorded = false) => onFeel?.(n, { ...fishInfo(), ...extra, real, recorded, key: recorded ? `${id}|${info.since}|${n}` : undefined });
    const sea = { swell: env.swell, wind: env.wind, windDir: env.windDir, kind: env.kind };
    const wh = (x, z) => waveHeight(x, z, t, sea);
    // the drop net's places at this pier spot (ns: how much bigger than a 70 cm net it is): where it lies on the deck,
    // the column it hangs in (clear of the pier's edge) and the water there, where its rope goes over the top rail, and
    // the knot's height for so much rope out
    const dropGeo = (ns) => {
      const railZ = -Math.max(0.3, edge - 0.22), railY = 1.12, col = toWorld(new THREE.Vector3(-0.32, 0, -(edge + 0.36 * ns + 0.1))) /* (the hoop is 36 cm across its radius: hanging 25 cm out from the wall, its near side went 11 cm and more into the concrete as it came up and down, the 8 November afternoon recording) */, waterY = wh(col.x, col.z);
      // (top: the knot's highest, just under the top rail, in the world's heights like the water's: the rail is 1.12 m
      // above the deck, and a real pier's deck stands metres above the sea. It was the rail's height above the deck,
      // so on a raised deck the rope was far too short: the net hardly rose as it was hauled, then leapt to the rail)
      const bridle = 0.72 * ns, top = toWorld(new THREE.Vector3(0, railY - 0.05, railZ)).y, sink = 0.02 * ns; // (the hoop right at the surface, breaking it: you see the net and the fish go over it)
      return { railZ, railY, col, waterY, bridle, top, sink, L: Math.max(0.5, top - waterY - bridle + sink), deck: toWorld(new THREE.Vector3(-(0.55 + 0.35 * ns), 0.012 + (net.userData.restDrop ?? 0.18) * ns, /* (set down on the deck itself: its height was for the plain stand-in bag, so the modelled net floated 17 cm up) */ Math.max(-Math.min(0.3, Math.max(0.05, railZ * -1 - 0.4 * ns)), railZ + 0.36 * ns + 0.14))), /* (and its hoop clear of the railing: set down right by it, the hoop stood through a post) */ /* (on the deck by your left foot, in front of the tackle box and clear of the mat: within reach as you kneel to lift the fish out. It was 1.65 m off to the side, out of reach, so the fish flew from the net to your hands) */ railPt: toWorld(new THREE.Vector3(-0.32, railY + 0.02, railZ)), coil: toWorld(new THREE.Vector3(-0.42, 0.02, 0.18)), hangAt: (out) => { const k = col.clone(); k.y = top - out; return k; } };
    };

    // ---- what the rod is doing ----
    // poses are in the angler's own space: x right, y up, -z forward
    let held = true, pitch = 0.75, yawOff = 0.12, bendT = 0.03, tipT = 0, rigAt = null, slack = 0.4, showLine = true, showFish = false;
    let fishPose = null; // (the fish swimming: where its mouth is, which way its body lies, how hard it beats its tail)
    let jumpWatch = false, jumpAt = null, netRest = 0; // netRest: 0 hanging, 1 set down on the deck (the bag flattens)
    let netOn = false, netAt = null, ropesOn = false, poleFrom = null, inNet = false, actNow = null; // (actNow: a retargeted move played on cue: human3d ACTS)
    let fpE = 0.4, fpYaw = -0.03, fpView = null, fpPull = 0, fpArm = null; // first person: the rod's angle up from level, and a little towards the middle
    landStage = null; landWater = null; dropRig = null; ropePull = null; releaseInfo = null; releaseRope = null; matOn = false; releasePole = false;
    const ph = info.phase;
    jumpWatch = false; jumpAt = null;
    fpArm = null; bodyTo = { x: 0, y: 0, z: 0 };
    if (ph === "idle" || ph === "ended" || ph === "paused") { held = false; showLine = false; }
    else if (ph === "cast") {
      // back over the shoulder, a fast forward sweep, the rig flies out, the rod settles and goes on its rest
      const back = ease(seg(age, 0, 0.6)), fwd = ease(seg(age, 0.6, 0.85));
      pitch = lerp(0.6, -0.55, back); pitch = lerp(pitch, 0.55, fwd); yawOff = 0.25 - fwd * 0.15;
      // (first person: the rod goes back over your right shoulder, past upright, its tip behind you, then is driven
      // forwards over the top and down to point at the water: was tipped up to upright in front of you and back down)
      fpE = lerp(lerp(0.4, 2.05, back), 0.36, fwd); fpYaw = lerp(lerp(-0.03, 0.42, back), -0.03, fwd);
      // (in first person the hands travel with the cast, not just the rod pivoting about a reel fixed in the view: up and
      // back beside your right shoulder for the wind-up, then driven forwards and down through the release, the arms
      // following through and settling back)
      { const settle = ease(seg(age, 0.85, 1.6)), drive = Math.sin(clamp((age - 0.6) / 0.45, 0, 1) * Math.PI);
        // (the hands go up and back beside your right shoulder for the wind-up, the elbow bending, then the arms extend
        // forwards and down through the release and settle)
        fpArm = { up: 0.15 * back * (1 - fwd) - 0.05 * drive * (1 - settle), right: 0.1 * back * (1 - fwd), fwd: -0.12 * back * (1 - fwd) + 0.12 * drive * (1 - settle) }; // (not so near: closer, the inside of the sleeve filled the edge of the view)
        // (and your weight: back onto the rear foot and turned a little to the right for the wind-up, thrown forwards and
        // down through the release, then back up to stand)
        bodyTo = { x: 0.05 * back * (1 - fwd) - 0.02 * drive, y: -0.012 * back * (1 - fwd) - 0.04 * drive * (1 - settle), z: 0.08 * back * (1 - fwd) - 0.12 * drive * (1 - settle) }; }
      bendT = age < 0.6 ? 0.05 : age < 0.9 ? 0.35 : 0.04;
      if (age < 0.85) { /* (the lead hangs on its drop under the tip and swings with the wind-up: fishLine.js) */ }
      else if (age < 2.15) { const f = (age - 0.85) / 1.3, tip = tipWorld(); rigAt = tip.clone().lerp(castAt, f); rigAt.y = lerp(tip.y, 0, f) + Math.sin(f * Math.PI) * (castAt.distanceTo(at) * 0.35); slack = 0.05; }
      else { rigAt = castAt.clone(); slack = clamp((age - 2.15) / 0.8, 0.05, 0.6); }
      if (crossed(0.75)) { onSound?.("whoosh", at); feel("release"); }
      // the body's cast (Mixamo's Fishing Cast, retargeted): leaning back into the wind-up, the weight thrown forward
      // through the release, the follow-through; the arms stay on the rod (hand IK)
      { const ct = age < 0.75 ? 0.6 + (age / 0.75) * 1.3 : 1.9 + Math.min(1, (age - 0.75) / 0.9) * 0.7; actNow = { key: "cast", t: ct, w: 0.85 * (1 - seg(age, 1.5, 2.3)) }; }
      if (crossed(2.15)) { splashCb?.(castAt, 0.6); rippleCb?.(castAt, 0.7); onSound?.("plop", castAt); feel("splashdown"); }
      if (age > 2.4) held = age < 2.9;
    } else if (ph === "waiting" || ph === "bite" || ph === "missed") {
      held = false; rigAt = castAt.clone(); slack = 0.35;
      if (ph === "missed" && crossed(0.02)) feel("missed", {}, true);
      if (ph === "bite") {
        if (!P.taps) P.taps = biteTaps(prof.species, P.strong, seed);
        for (const [p0, a, b, dk] of P.taps) if (age > p0) { const e = Math.exp(-(age - p0) * dk); tipT += a * e * prof.pull * 1.4; bendT += b * e * prof.pull; if (crossed(p0 + 0.001)) { if (a > 0.05) rippleCb?.(castAt, 0.3); if (p0 > 0.05) feel("tap", { a, b }); } }
        if (crossed(0.02)) { onSound?.("bell", at); rippleCb?.(castAt, 0.45); feel("bite", { strong: P.strong }, true); }
        slack = 0.15;
      }
    } else if (ph === "hooked") {
      // the fish fights its own way (fightProfile): divers bore down and hold, fish of the upper water run fast and
      // erratically, bass and garfish leap clear, flatfish swing in slow wide arcs, rays sit deep and heavy, eels make
      // the tip pump. The rod follows it, bent by how hard it's pulling
      const fl = fightIn && performance.now() - fightIn.at < 1500 ? fightIn : null;
      // the fish comes in as the line does: eased, since a friend's fight arrives a few times a second
      if (fl) fightPr = fightPr == null ? fl.progress : fightPr + (fl.progress - fightPr) * Math.min(1, dt * (local ? 12 : 4)); else fightPr = null;
      const st = fightStyle(prof), pr = fl ? clamp(fightPr, 0, 1) : 1 - Math.exp(-age / (16 * prof.long));
      // (where the fight model is running, the fish goes the way it says: its runs and turns, its diving, its head-shakes;
      // a friend's fight or a replay without them falls back on the species' own pattern)
      const flDir = fl && Number.isFinite(fl.dir) ? fl.dir : null;
      if (flDir != null) P.dirNow = (P.dirNow ?? flDir) + (flDir - (P.dirNow ?? flDir)) * Math.min(1, dt * 3);
      const run = flDir != null ? P.dirNow : n1(age * 0.22 * prof.tempo * st.runSpeed + P.s1), surge = Math.max(0, Math.sin(age * 0.95 * prof.tempo + n1(age * 0.3 + P.s2) * 2.2)) ** 6;
      const shake = fl && Number.isFinite(fl.shake) ? fl.shake : 0, diveK = fl && Number.isFinite(fl.dive) ? 0.6 + 0.8 * fl.dive : 1;
      const f = castAt.clone().lerp(nearAt, pr * 0.85);
      const [dx, dz] = dirOf(face), side = [-dz, dx];
      const lateral = run * 8 * st.runWidth * (1 - pr * 0.6);
      f.x += side[0] * lateral; f.z += side[1] * lateral;
      f.y = -st.depth * diveK * (0.5 + 0.5 * Math.max(0, n1(age * 0.17 + P.s2))) * (1 - pr * 0.7);
      // the approach: tiring, it comes up as it nears you (most fish show at the top before they're netted; a diver
      // stays down longer), and once up it wallows, rolling a flank to the light now and then
      const upK = ease(clamp((pr - 0.6) / 0.3, 0, 1)) * (st.depth > 1.5 ? 0.85 : 1), surfNow = wh(f.x, f.z);
      f.y = lerp(f.y, surfaceSpine(surfNow, halfDepth()) - 0.04, upK);
      // a leap: clear of the water in an arc, splashing out and back in (bass, garfish, sometimes mullet)
      if (!P.jumps) { P.jumps = []; if (st.leaps) for (let tj = 2.5 + seed() * 3; tj < 40; tj += 4 + seed() * 6) P.jumps.push(tj); }
      let jumping = false;
      // the camera can turn to a leap a moment before it happens and hold it until the splash settles (world.js)
      for (const tj of P.jumps) if (age > tj - 0.9 && age < tj + 1.6) { jumpWatch = true; jumpAt = f.clone(); jumpAt.y = wh(f.x, f.z) + 0.4; }
      for (const tj of P.jumps) {
        const u = (age - tj) / 0.75;
        if (u >= 0 && u <= 1) { jumping = true; f.y = wh(f.x, f.z) + Math.sin(u * Math.PI) * (0.5 + 0.4 * prof.splashy) * clamp(fishLen * 2, 0.6, 1.4); }
        if (crossed(tj) || crossed(tj + 0.75)) { const sp = f.clone(); sp.y = wh(sp.x, sp.z); splashCb?.(sp, 0.55 + prof.splashy * 0.35); rippleCb?.(sp, 0.7); onSound?.("splash", sp); }
      }
      if (jumping) { showFish = true; }
      for (const tj of P.jumps) if (crossed(tj)) feel("run");
      // each surge of the fight, as it builds (never a continuous buzz: haptics.js spaces them and caps a minute's worth)
      const surgeNow = surge;
      if (surgeNow > 0.6 && (P.lastSurge ?? 0) <= 0.6) { feel("pull", { tension: load * (0.72 + 0.4 * surgeNow) * st.heavy, surge: surgeNow }); if (local) onSound?.("strain", at, { tension: P.tension ?? load }); }
      P.lastSurge = surgeNow;
      fightPos = f; rigAt = f; slack = 0;
      // near the top it can be seen swimming: its head into the pull or away on a run, turning at a fish's pace (its
      // heading eases round, it never flips), its tail beating harder in a surge
      if (!jumping && surfNow - f.y < 0.9) {
        showFish = true;
        const vel = fishPrev ? f.clone().sub(fishPrev).divideScalar(Math.max(1e-3, dt)) : new THREE.Vector3();
        const toTip = tipWorld().sub(f); toTip.y = 0; toTip.normalize();
        const want = new THREE.Vector3(vel.x, 0, vel.z).addScaledVector(toTip, 0.8);
        const before = fishHead; fishHead = turnToward(fishHead, Math.atan2(want.z, want.x), 2.4 * prof.tempo, dt);
        const turnRate = Number.isFinite(before) ? Math.atan2(Math.sin(fishHead - before), Math.cos(fishHead - before)) / Math.max(1e-3, dt) : 0;
        const dir = new THREE.Vector3(-Math.cos(fishHead), clamp(vel.y * 0.3, -0.4, 0.4), -Math.sin(fishHead)).normalize();
        const wallow = upK > 0.8 && !prof.flat ? Math.max(0, Math.sin(age * 1.3 + P.s1)) ** 6 * 0.9 * P.side : 0;
        if (wallow && Math.abs(wallow) > 0.6 && Math.floor(age / 0.5) !== Math.floor((age - dt) / 0.5)) { const w2 = f.clone(); w2.y = surfNow; rippleCb?.(w2, 0.35); }
        fishPose = { mouth: f.clone(), dir, beat: 1.1 + 0.9 * surge, curl: clamp(-turnRate * 0.12, -0.35, 0.35), roll: (prof.flat ? -Math.PI / 2 : 0) + wallow, ease: 1 - Math.exp(-dt * 10) };
      }
      fishPrev = f.clone();
      // where the line cuts the surface over the fish: a small wake of rings as it moves, stronger as it surges or
      // comes up near the top
      if (!jumping && Math.floor(age / 0.7 + P.s1) !== Math.floor((age - dt) / 0.7 + P.s1)) { const w = f.clone(); w.y = wh(w.x, w.z); rippleCb?.(w, (0.16 + 0.22 * surge) * (f.y > -1.5 ? 1.6 : 1)); }
      const tension = fl ? (0.35 + 1.05 * fl.tension) * Math.max(0.8, load) : load * (0.72 + 0.4 * surge) * st.heavy;
      bendT = 0.2 + 0.5 * tension; // (a loaded rod: its top half pulled well round towards the fish, more the harder it pulls) tipT = 0.05 * surge + (st.pump ? 0.05 * Math.max(0, Math.sin(age * 5.5)) : 0);
      // (a taut line hums: the tip trembles a little, more as the fish pulls harder; and on a surge your arms give a
      // touch towards it, then take it back)
      tipT += clamp(tension, 0, 1.4) * 0.006 * (n1(t * 11 + P.s1) + 0.6 * n1(t * 23 + P.s2));
      tipT += shake * 0.045 * Math.sin(t * 19 + P.s1); // (its head-shakes knock the tip)
      // the arms take the load: on a surge they're drawn out towards the fish (more for a heavier fish pulling harder);
      // between surges you lean back against it and lift, pumping it in, then drop the rod forwards and wind
      const tk = clamp(tension, 0, 1.4), pump = Math.max(0, Math.sin(age * 0.85 * prof.tempo + P.s1)) ** 2 * clamp((tk - 0.35) / 0.6, 0, 1) * (1 - surge);
      fpPull = 0.055 * surge * tk; P.tk = tk; P.pump = pump; P.surge = surge; // (and for the body, seen from outside)
      fpArm = { up: 0.05 * pump - 0.03 * surge * tk + 0.006 * shake * Math.sin(t * 19 + P.s1), right: 0.03 * run * st.runWidth * tk, fwd: -0.05 * pump }; // (and through the rod into your hands; a run drags them its way)
      bodyTo = { x: clamp(run * 0.05 * st.runWidth, -0.05, 0.05), y: -0.012 * tk - 0.025 * surge * tk, z: 0.03 * tk + 0.03 * pump - 0.08 * surge * tk };
      pitch = 0.95 + 0.15 * surge; yawOff = clamp(run * 0.35 * st.runWidth, -0.5, 0.5);
      fpE = 0.95 - 0.22 * surge * tk + 0.28 * pump; fpYaw = -0.08 + clamp(run * 0.15 * st.runWidth, -0.22, 0.22); // (the rod held up at about 40 degrees and a little across you, as you'd fight a fish: the line pulls its top half round in an arc towards the fish, a surge drags the tip down and you pump it back up. Held low and straight out at the fish it had nothing to bend against and read as straight)
      // the strike: a sharp lift of the rod as the hook goes in, then down into the fight
      const strikeK = age < 0.55 ? Math.sin(Math.min(1, age / 0.16) * Math.PI / 2) * (1 - seg(age, 0.16, 0.55)) : 0;
      pitch += 0.38 * strikeK; fpE += 0.32 * strikeK; bendT += 0.25 * strikeK;
      bodyTo.z += 0.07 * strikeK; bodyTo.y -= 0.015 * strikeK; // (your weight thrown back into the strike)
      P.tension = tension;
      if (crossed(0.02)) { if (!local) onSound?.("reelOn", at); else onSound?.("swish", at); feel("hooked", {}, true); } // (the strike: the rod swept up)
      if (fl) {
        // the handle turns as you tap; each half turn clicks; the drag giving line ratchets and the tip shivers
        // (your own reel's clicks only: a friend's fight is seen, not heard)
        // (the clicks themselves come from the handle going round: crank() below)
        lastTurns = fl.turns;
        if (fl.slipping && t - lastDragSound > 0.3) { lastDragSound = t; if (local) onSound?.("drag", at); spr.tipv += 0.6; }
        reel.userData.slipping = !!fl.slipping;
      }
      if (!st.leaps && prof.splashy > 0.3 && surfNow - f.y < 0.45 && Math.floor(age * 0.5 + P.s1) !== Math.floor((age - dt) * 0.5 + P.s1) && seed() < prof.splashy * 0.5 && age > 2) { const sp = f.clone(); sp.y = wh(sp.x, sp.z); splashCb?.(sp, 0.35 + prof.splashy * 0.4); rippleCb?.(sp, 0.5); onSound?.("splash", sp); }
      // the handle: each accepted tap is half a turn more for it to make, and it goes round to it smoothly (a critically
      // damped follow: it speeds up, carries on round and slows to a stop, never overshooting or springing back), so
      // steady tapping turns it steadily and stopping lets it run down. It only ever turns for taps
      // (no fresh word of the fight: the handle runs down where it is rather than whirring round on its own)
      crank(fl ? fl.turns : lastTurns, dt, local);
    } else if (ph === "landing") {
      // up from wherever the fight had got to, through the surface, then landed this place's way
      const { T1, T2, T3, T4, swingIn, card } = LT;
      const start = landStart || nearAt;
      // (for a drop net the fish is brought up beside the pier, a metre or so along from where the net will hang and a
      // little out from the wall, so the net, the fish and you at the rail are all in the one picture: it was brought to
      // the surface two and a half metres straight out, where the net shot couldn't see it)
      const surf = tech === "dropnet" ? (() => { const g0 = dropGeo(Math.max(1, (fishLen * 0.62) / 0.35)), [fx, fz] = dirOf(face); return g0.col.clone().add(new THREE.Vector3(fz * 1.1 + fx * 0.95, 0, -fx * 1.1 + fz * 0.95)); })() /* (on the far side of the net from you: the net shot looks along the wall from that side) */ : nearAt.clone();
      surf.y = wh(surf.x, surf.z);
      const tip = tipWorld();
      bendT = 0.25 * load; pitch = 1.05; slack = 0; fpE = 0.6; fpYaw = 0;
      if (age < T1) { const f = ease(age / T1); rigAt = start.clone().lerp(surf, f); rigAt.y = lerp(start.y, surf.y - 0.15, f); }
      else if (crossed(T1)) { splashCb?.(surf, 0.9 + prof.splashy * 0.5); rippleCb?.(surf, 0.8); onSound?.("bigsplash", surf); }
      // the fish is there all along: a shape coming up through the water, then breaking the surface (never popping in)
      showFish = true;
      const hand = toWorld(new THREE.Vector3(0.05, 1.25, -0.42));
      if (tech === "lift") {
        // swung up on the line: head first, hanging under the tip, swinging, then in over the rail
        if (age >= T1 && age < T2) { const f = ease(seg(age, T1, T2)); rigAt = surf.clone().lerp(tip.clone().add(new THREE.Vector3(0, -1.2, 0)), f); pitch = 1.1 + 0.15 * f; }
        else if (age >= T2 && age < swingIn) { const sw = Math.sin((age - T2) * 3) * Math.exp(-(age - T2) * 0.8) * 0.5; rigAt = tip.clone().add(new THREE.Vector3(sw * 0.6, -1.1, sw * 0.3)); pitch = 1.25; bendT = 0.3 * load; }
        else if (age >= swingIn) { const f = ease(seg(age, swingIn, card)); rigAt = tip.clone().add(new THREE.Vector3(0, -1.1, 0)).lerp(hand, f); pitch = lerp(1.25, 0.6, f); yawOff = lerp(yawOff, 0.9, f); }
      } else if (tech === "dropnet") {
        // the drop net, as it's done from a high pier. One thing decides where the net is: how much rope is out. The
        // rope runs from your hands over the top rail and down to the knot where the net's three bridles meet, and the
        // net hangs straight below it (swinging a little), so it can never be somewhere its rope doesn't reach. The fish
        // is brought up beside the pier and held at the surface on a tight line; the rod is laid on the rail; the net is
        // picked up off the deck, lifted over the rail and let down, the rope running through your hands, until it sinks
        // under the water at the foot of the pier; the fish is led over it; it's hauled up hand over hand (a pull at a
        // time, heavy with the fish, water pouring out of the mesh) and lifted back over the rail onto the deck
        ropesOn = true; netOn = true;
        const ns = Math.max(1, (fishLen * 0.62) / 0.35), G = dropGeo(ns);
        const B1 = T1 + 0.7; // the rod is on the rail by now
        if (age >= T1 + 0.1) held = false;
        landStage = age < T1 ? "up" : age < B1 ? "rod" : age < T2 ? "pick" : age < T3 ? "lower" : age < T4 ? "lead" : age < swingIn ? "haul" : age < LT.end ? "in" : "done";
        const { deck, col, waterY, railPt, bridle, sink, L, hangAt } = G;
        let ropeOut = 0, hanging = false, sway = 0; ropePull = null;
        if (age < B1 + 0.2) { netAt = deck.clone(); netRest = 1; }
        else if (age < T2) {
          // stooping to the net on the deck, lifting it, over the rail (an arc up and over the top rail) and out
          const f = ease(seg(age, B1 + 0.2, T2)), end = hangAt(0).sub(new THREE.Vector3(0, bridle, 0));
          netAt = new THREE.Vector3().copy(overRail(railPt, ns, deck, end, f, { x: dirOf(face)[0], z: dirOf(face)[1] }));
          netRest = 1 - ease(seg(age, B1 + 0.2, B1 + 0.6));
        } else if (age < swingIn) {
          hanging = true; netRest = 0;
          if (age < T3) {
            // let down: the rope runs through your hands, checked now and then
            const f = seg(age, T2, T3), g = ease(f); ropeOut = L * clamp(g + Math.sin(f * Math.PI * 9) * 0.01 * (1 - f), 0, 1);
            sway = Math.sin((age - T2) * 2.2) * 0.06 * (1 - f);
          } else if (age < T4) {
            ropeOut = L; sway = Math.sin((age - T3) * 1.7) * 0.03;
            // the water stirring round the hoop as the fish comes over it
            if (Math.floor(age / 0.45) !== Math.floor((age - dt) / 0.45)) { const w = col.clone(); w.y = waterY; rippleCb?.(w, 0.35); }
          }
          else {
            // hauled up hand over hand: a pull at a time (each hand in turn), slower with the weight at first
            const N = Math.max(4, Math.round(L / 0.6)), f = seg(age, T4, swingIn), q = f * N, k = Math.min(N - 1, Math.floor(q)), u = q - k;
            const pulled = (k + ease(clamp((u - 0.15) / 0.75, 0, 1))) / N; ropeOut = L * (1 - pulled);
            if (k !== P.lastPull) { P.lastPull = k; onSound?.("rope", hangAt(ropeOut)); } // (each pull: the rope through the hands)
            actNow = { key: "pull_rope", t: 3 + ((age - T4) * 1.1) % 5, w: 0.5 * (1 - f) }; // (the body working with each pull)
            ropePull = { hand: k % 2, u }; sway = Math.sin((age - T4) * 2.6) * 0.1 * (1 - f) * (0.6 + 0.4 * Math.sin(u * Math.PI));
            if (ropeOut < L - sink - 0.1 && f < 0.92 && Math.floor(age / 0.12) !== Math.floor((age - dt) / 0.12)) splashCb?.(hangAt(ropeOut).add(new THREE.Vector3(0, -bridle - 0.3 * ns, 0)), 0.06 + 0.1 * (1 - f)); // (water pouring out of the mesh)
            if (crossed(T4 + 0.25)) onSound?.("drip", hangAt(ropeOut));
          }
          const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]);
          netAt = hangAt(ropeOut).sub(new THREE.Vector3(0, bridle, 0)).addScaledVector(side, sway * Math.min(1, ropeOut / 1.5));
          // let right down, the hoop rides the waves (just breaking the surface) rather than vanishing under each crest
          // (and as it's hauled out it leaves the waves over its first half metre)
          // (a few centimetres proud of the true wave height: the drawn water's surface is coarser than the waves and
          // otherwise covers the hoop between its points)
          // never under a passing wave either (as it's let down, as it's hauled up): the hoop stays just above the surface,
          // the bag below it in the water
          netAt.y = Math.max(netAt.y, wh(netAt.x, netAt.z) + 0.05);
        } else {
          // at the rail: both hands on the hoop, up over the top rail in an arc and set down on the deck
          const f = ease(seg(age, swingIn, LT.end - 0.1)), start = hangAt(0).sub(new THREE.Vector3(0, bridle, 0));
          netAt = new THREE.Vector3().copy(overRail(railPt, ns, start, deck, f, { x: dirOf(face)[0], z: dirOf(face)[1] }));
          netRest = ease(seg(age, swingIn + 0.5, LT.end - 0.1));
        }
        dropRig = { railPt, hanging, coil: G.coil, waterY, col: col.clone() };
        // the fish: at the surface beside the pier on a tight line, then led over the net, then in it
        const fishWait = surf.clone(), under = col.clone(); under.y = waterY - sink * 0.6;
        // (on top, its back breaking the water: it used to hang straight down from its mouth under the surface, unseen)
        // (beaten, it lies over on its side on top: TIRED_ROLL, so its flank shows)
        const spineY = surfaceSpine(surf.y, restHeight(halfDepth(), halfThick(), TIRED_ROLL));
        if (age >= T1 && age < T3) { rigAt = fishWait.clone(); rigAt.y = spineY; }
        else if (age >= T3 && age < T4) {
          // led over the net and into it: towards where the net actually is now (it sways on its rope), arriving at the very
          // place it sits in the mesh once the net comes up, so there's no jump when it's caught. It stays at the surface
          // until it's over the hoop, then drops into the bag
          const f = ease(seg(age, T3, T4)), inBag = netAt ? netAt.clone().add(new THREE.Vector3(0, -0.12 * ns, 0)) : under;
          rigAt = fishWait.clone().lerp(inBag, f); rigAt.y = f < 0.7 ? Math.max(spineY, lerp(spineY, inBag.y, f / 0.7 * 0.3)) : lerp(Math.max(spineY, lerp(spineY, inBag.y, 0.3)), inBag.y, (f - 0.7) / 0.3);
        }
        else if (age >= T4) { rigAt = netAt.clone().add(new THREE.Vector3(0, -0.12 * ns, 0)); inNet = true; pitch = 0.7; bendT = 0.06; }
        if (age >= T1 && age < T4) { bendT = 0.18 * load; }
        // the net going into the water, and coming out with the fish
        const wet = hanging && netAt.y - 0.25 * ns < waterY;
        if (wet && !P.netWet) { const w = col.clone(); w.y = waterY; splashCb?.(w, 0.35); rippleCb?.(w, 0.6); onSound?.("net", w); }
        if (!wet && P.netWet && age > T4) { const w = col.clone(); w.y = waterY; splashCb?.(w, 0.55); rippleCb?.(w, 0.7); }
        P.netWet = wet;
      } else if (tech === "net") {
        // the landing net reached out, the fish drawn over it, lifted in
        netOn = true; poleFrom = toWorld(new THREE.Vector3(-0.25, 1.05, -0.35));
        landStage = age < T3 ? "lead" : null; landWater = surf.y; // (for the camera: down by the water while the net goes under the fish)
        const out = surf.clone(); out.y = surf.y - 0.05;
        // the fish held on top a little to one side of the net, then drawn over it (to the side along the bank: it was
        // the world's x whichever way you faced; and between coming up and the net going in it had no place at all,
        // so it vanished and the line hung loose)
        const sideV = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]), spineY = surfaceSpine(surf.y, restHeight(halfDepth(), halfThick(), TIRED_ROLL));
        if (age >= T1 && age < T2) { rigAt = surf.clone().addScaledVector(sideV, 1.2); rigAt.y = spineY; }
        if (age < T3) { const f = ease(seg(age, T1 - 0.8, T2)); netAt = poleFrom.clone().lerp(out, f); netAt.y = lerp(poleFrom.y - 0.4, out.y, f); if (age >= T2) { const g = ease(seg(age, T2, T3)); rigAt = surf.clone().addScaledVector(sideV, 1.2 * (1 - g)); rigAt.y = lerp(spineY, out.y - 0.02, g); } }
        else { const f = ease(seg(age, T3, T4)); netAt = out.clone().lerp(toWorld(new THREE.Vector3(-0.35, 0.5, -0.2)), f); rigAt = netAt.clone(); inNet = true; pitch = 0.6; bendT = 0.05; }
      } else {
        // the beach: a wave carries it in and it's drawn up the sand to the angler's feet
        const sand = toWorld(new THREE.Vector3(0, -0.85, -1.4)); sand.y = Math.max(sand.y, 0.25);
        if (age >= T1 && age < T3) { const f = ease(seg(age, T1, T3)); rigAt = surf.clone().lerp(sand, f); rigAt.y = lerp(surf.y, sand.y, f) + Math.sin(f * Math.PI) * 0.1; pitch = 0.85; bendT = 0.15 * load; }
        else if (age >= T3) { const f = ease(seg(age, T4, card)); rigAt = sand.clone().lerp(hand, f); pitch = 0.6; bendT = 0.03; }
      }
      // (swung or drawn up to your hand; a fish in a net stays in it: it used to jump from the net to your hand)
      if (age >= card - 0.3 && (tech === "lift" || tech === "beach")) { rigAt = hand; showLine = true; }
      if (crossed(card)) feel("landed", {}, true);
      // (winding the fish up to the surface at the start, slowing to a stop; then the handle's left alone)
      if (age < T1) { const a0 = reel.userData.spin || 0; reel.userData.spin = a0 + dt * 7 * (1 - age / T1); handleClicks(a0, reel.userData.spin, local); }
      if (crossed(T4)) onSound?.("reelOff", at);
    } else if (ph === "lost") {
      rigAt = (fightPos || castAt).clone().lerp(at, ease(age / 2)); rigAt.y = Math.min(0, rigAt.y); slack = 0.6; bendT = 0.02;
      if (crossed(0.02)) { spr.kv -= 1.6 * load; onSound?.("reelOff", at); feel("lost", {}, true); }
    }

    if (ph === "cast" || ph === "bite" || ph === "hooked") { kept = null; matOut = false; } // a new cast: that fish is done with (and the mat's packed away)
    let keptPose = null, relStep = null;
    if (kept && kept.t0 == null) kept.t0 = t;
    // (a fish kept without its fight seen here, as after rejoining: its own look from the catch, not the plain stand-in)
    if (kept && kept.state !== "gone" && !fishFor) { const c = events.slice().reverse().find((e) => e.type === "catch"); if (c?.data) setFish(c.data.species || null, c.data.lengthCm || null, c.data.weightKg || null); }
    if (kept && kept.state !== "gone" && !(ph === "landing" && age < LT.card)) {
      const ns = Math.max(1, (fishLen * 0.62) / 0.35), kt = t - kept.t0, crossed2 = (k, m) => prevKt < m && k >= m;
      const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]), away = new THREE.Vector3(dirOf(face)[0], 0, dirOf(face)[1]);
      showFish = true; showLine = false;
      const G = venue === "pier" ? dropGeo(ns) : null;
      // heights it can rest at without going into anything: the deck (or the bank) under you, the mat's top
      const floorY = toWorld(new THREE.Vector3(0, 0, 0)).y, matAt = toWorld(matAtL().setY(0.004)), matTop = matAt.y + 0.042;
      const onMat = matAt.clone().setY(matTop + halfThick() + 0.012 + 0.012 * fishLen);
      const netDeck = G ? G.deck : toWorld(new THREE.Vector3(-0.62, 0.06, -0.2));
      const inNetAt = (n) => n.clone().setY(floorY + halfThick() + 0.035); // (lying in the net set down on the deck)
      // held up in front of you, at chest height as you kneel: upright, its belly on your palms, turned so its flank
      // faces the camera (world.js looks from behind you on your left), its head towards the water; far enough in
      // from the rail that its head stays clear of it
      // (well out in front at arm's length, its tail off to your right: held close, a big fish's tail went into your
      // shoulder)
      const holdDir = side.clone().multiplyScalar(0.85).addScaledVector(away, -0.53).normalize();
      const railIn = -Math.max(0.3, edge - 0.22) + 0.06, holdZ = Math.max(railIn + fishLen * 0.3, -(0.4 + 0.3 * fishLen));
      // (through your own eyes you stand and bring it up to look at it: about 45 cm in front of your face and a little
      // below, elbows bent, so the hands and the fish fill the view and the forearms run short out of the bottom of it.
      // Held at kneeling chest height, nearly a metre below a standing eye, the arms reached straight down the view like
      // two long tubes)
      const fpH = fp ? fpEye() : null;
      const hold = fp ? toWorld(new THREE.Vector3(fpH.x - 0.08 - 0.12 * fishLen, fpH.y - 0.26, Math.max(railIn + fishLen * 0.3, fpH.z - 0.5)))
        : toWorld(new THREE.Vector3(-0.12 - 0.1 * fishLen, 0.74, holdZ));
      const poseD = (c, dir, roll, kk) => ({ mouth: c.clone().addScaledVector(dir, -fishLen * 0.5), dir: dir.clone().normalize(), roll, beat: kk.beat ?? 0.1, curl: kk.curl ?? 0, centre: c, lift: !!kk.lift });
      const pose = (c, roll, kk) => poseD(c, side.clone().negate(), roll, kk);
      const LIE = -Math.PI / 2; // (on its side: rolled this way its tail lifts, rather than digging into the mat, as it flaps)
      if (kept.state === "deck") {
        if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); rigAt = netAt.clone(); inNet = true; netRest = 1; }
        else if (tech === "net") { netOn = true; netAt = netDeck.clone().add(new THREE.Vector3(0, 0.12, 0)); rigAt = netAt.clone(); inNet = true; netRest = 1; poleFrom = toWorld(new THREE.Vector3(-1.45, 0.05, 0.55)); } // (resting in the landing net on the bank, its handle down)
        else keptPose = pose(netDeck.clone().setY(floorY + halfThick() + 0.012), LIE, { beat: 0.08, curl: Math.max(0, Math.sin(kt * 1.7)) ** 8 * 0.5 });
      } else if (kept.state === "inspect") {
        // a look at it: lifted out of the net in both hands, held up in front of you for a moment (upright, supported
        // under the head and by the tail), then laid on its side on the unhooking mat (low, wet and soft: the way to
        // handle a fish you'll put back), a hand resting on it. Still apart from its gills and now and then a flap of
        // its tail; nothing turns it
        matOn = true; if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); netRest = 1; }
        // (a landing net is laid down on the bank beside you, its handle on the ground, out of the way of the mat)
        else if (tech === "net") { netOn = true; netRest = 1; netAt = netDeck.clone().add(new THREE.Vector3(0, 0.08, 0)); poleFrom = toWorld(new THREE.Vector3(-1.45, 0.05, 0.55)); }
        const from = G || tech === "net" ? inNetAt(netDeck) : netDeck.clone().setY(floorY + halfThick() + 0.012);
        const T_LIFT = 1.1, T_HOLD = 3.6, T_DOWN = 4.7;
        const crossDir = side.clone().multiplyScalar(-0.82).addScaledVector(away, -0.57).normalize(); // (on the mat: across it at a slant, so the camera on your left sees its length)
        if (kt < T_LIFT) { const f = ease(kt / T_LIFT), c = from.clone().lerp(hold, f); c.y += Math.sin(f * Math.PI) * 0.12; keptPose = poseD(c, crossDir.clone().lerp(holdDir, f), lerp(LIE, 0, f), { beat: 0.35, curl: Math.sin(kt * 6) * 0.1, lift: true }); }
        else if (kt < T_HOLD) { const c = hold.clone(); c.y += Math.sin(kt * 1.6) * 0.008; keptPose = poseD(c, holdDir, 0, { beat: 0.12, curl: Math.max(0, Math.sin(kt * 2.1)) ** 12 * 0.3, lift: true }); }
        else { const f = ease(seg(kt, T_HOLD, T_DOWN)), c = hold.clone().lerp(onMat, f); keptPose = poseD(c, holdDir.clone().lerp(crossDir, f), lerp(0, LIE, f), { beat: 0.08, curl: f < 1 ? 0 : Math.max(0, Math.sin(kt * 1.1)) ** 10 * 0.25, lift: f < 1 }); }
        if (crossed2(kt, T_DOWN - 0.05)) onSound?.("mat", keptPose.centre); // laid down on the mat
        if (kt > T_DOWN + 1 && Math.sin(prevKt * 1.1) < 0.97 && Math.sin(kt * 1.1) >= 0.97) onSound?.("flap", keptPose.centre); // (each flap of its tail)
      } else if (kept.state === "release") {
        // back to the water (fishMotion.js releasePlan). Off a high pier it isn't dropped: it's put in the drop net, the
        // net lifted over the rail and let down the wall on its rope to the water, and it swims out of it. From a bank
        // it goes in the landing net, held out at the edge; on a beach, into the shallows (that walk is shortened).
        // Then it swims off along the top, its back showing, and down out of sight
        const plan = releasePlan(venue), step = releaseStep(kt, plan); relStep = step;
        matOn = true;
        if (!keptFrom) keptFrom = { c: (lastKept?.c || onMat).clone(), roll: lastKept?.roll ?? LIE };
        const rel = { stage: "deck", water: null }, netIn = G ? inNetAt(netDeck) : inNetAt(netDeck.clone().add(new THREE.Vector3(0, 0.08, 0)));
        // (just out from the bank's edge, or a little way into the shallows: it was 15% of the way from you to the water,
        // which on a bank is under the grass, so the fish went back into the ground)
        const edgeAt = at.clone().addScaledVector(away, edge + (venue === "beach" ? 0.6 : 0.35)); edgeAt.y = wh(edgeAt.x, edgeAt.z);
        if (step === "carry") {
          if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); netRest = 1; }
          else if (plan.net) { netOn = true; netRest = 1; netAt = netDeck.clone().add(new THREE.Vector3(0, 0.08, 0)); poleFrom = toWorld(new THREE.Vector3(-1.45, 0.05, 0.55)); }
          const f = ease(kt / plan.carry), to = plan.net ? netIn : hold, c = keptFrom.c.clone().lerp(to, f); c.y += Math.sin(f * Math.PI) * 0.25;
          keptPose = pose(c, lerp(keptFrom.roll, plan.net ? LIE : 0, f), { beat: 0.3, curl: Math.sin(kt * 5) * 0.12, lift: true });
        } else if (step === "over" && G) {
          // both hands on the hoop: up over the top rail in an arc and out over the water
          netOn = true; ropesOn = true; inNet = true;
          const f = ease(seg(kt, plan.carry, plan.over)), end = G.hangAt(0).sub(new THREE.Vector3(0, G.bridle, 0));
          netAt = new THREE.Vector3().copy(overRail(G.railPt, Math.max(1, (fishLen * 0.62) / 0.35), G.deck, end, f, { x: dirOf(face)[0], z: dirOf(face)[1] }));
          netRest = 1 - ease(seg(kt, plan.carry, plan.carry + 0.4)); rel.stage = "in";
        } else if (step === "over" || step === "lower") {
          const f = seg(kt, plan.over, plan.lower);
          if (G) {
            // let down the wall, the rope running through your hands, checked now and then
            netOn = true; ropesOn = true; inNet = true; netRest = 0;
            const full = G.L - G.sink * 0.85, out2 = full * clamp(ease(f) + Math.sin(f * Math.PI * 7) * 0.008 * (1 - f), 0, 1);
            netAt = G.hangAt(out2).sub(new THREE.Vector3(0, G.bridle, 0)).addScaledVector(side, Math.sin(kt * 2.2) * 0.05 * (1 - f));
            netAt.y = Math.max(netAt.y, wh(netAt.x, netAt.z) + 0.05);
            dropRig = { railPt: G.railPt, hanging: true, coil: G.coil, waterY: G.waterY, col: G.col.clone() }; releaseRope = G;
            rel.stage = "lower"; rel.water = G.waterY;
            if (crossed2(kt, plan.lower - 0.15)) { const w2 = G.col.clone(); w2.y = G.waterY; splashCb?.(w2, 0.3); rippleCb?.(w2, 0.6); onSound?.("net", w2); }
          } else if (plan.net) {
            // the landing net reached out on its handle, the fish in it, until its rim is at the surface
            netOn = true; inNet = true; netRest = 1 - ease(f); poleFrom = toWorld(new THREE.Vector3(-0.25, 1.05, -0.35)); releasePole = true;
            const rim = edgeAt.clone().add(new THREE.Vector3(0, 0.04, 0)), c0 = netDeck.clone().add(new THREE.Vector3(0, 0.08, 0));
            netAt = c0.lerp(rim, ease(f)); netAt.y += Math.sin(ease(f) * Math.PI) * 0.35; rel.stage = "lower"; rel.water = edgeAt.y;
          } else {
            // the beach: carried down to the water's edge (shortened) and set in the shallows
            const c = edgeAt.clone(); c.y = surfaceSpine(edgeAt.y, halfDepth()) + 0.02;
            keptPose = pose(c, 0, { beat: 0.6, curl: Math.sin(kt * 4) * 0.1 }); keptPose.dir = away.clone().negate(); keptPose.mouth = c.clone().addScaledVector(away, fishLen * 0.5); rel.stage = "other"; rel.water = edgeAt.y;
          }
        } else if (step === "swim") {
          // out over the rim and away: a pause, a kick of the tail, then off along the top and down
          let start;
          if (G) {
            netOn = true; ropesOn = true; netRest = 0;
            netAt = G.hangAt(G.L - G.sink * 0.85).sub(new THREE.Vector3(0, G.bridle, 0)); netAt.y = Math.max(netAt.y, wh(netAt.x, netAt.z) + 0.05);
            dropRig = { railPt: G.railPt, hanging: true, coil: G.coil, waterY: G.waterY, col: G.col.clone() }; releaseRope = G;
            start = netAt.clone(); rel.stage = "swim"; rel.water = G.waterY;
          } else {
            start = edgeAt.clone();
            if (plan.net) { netOn = true; netRest = 0; netAt = edgeAt.clone().add(new THREE.Vector3(0, 0.04, 0)); poleFrom = toWorld(new THREE.Vector3(-0.25, 1.05, -0.35)); releasePole = true; }
            rel.stage = "swim"; rel.water = edgeAt.y;
          }
          const u = seg(kt, plan.lower, plan.swim), sw = swimAway(u, fishLen), base = Math.atan2(away.z, away.x) + sw.bear * P.side;
          const mid = base - sw.bear * P.side * 0.5, c = start.clone().add(new THREE.Vector3(Math.cos(mid), 0, Math.sin(mid)).multiplyScalar(sw.dist));
          // (up out of the bag, where it lay in the net, to the top as it swims out over the hoop: it used to start
          // already at the hoop, a jump from the bag)
          c.y = lerp(start.y - (G ? 0.22 * ns : 0.05), surfaceSpine(wh(c.x, c.z), halfDepth()) - sw.depth, ease(Math.min(1, u / 0.12)));
          const head = new THREE.Vector3(Math.cos(base), 0, Math.sin(base)), dir = head.clone().negate(); if (sw.depth > 0) dir.y = 0.3; dir.normalize();
          keptPose = { mouth: c.clone().addScaledVector(head, fishLen * 0.5), dir, roll: prof.flat ? LIE : 0, beat: sw.beat, curl: -0.12 * P.side * Math.min(1, u * 3), centre: c, ease: 1 };
          if (crossed2(kt, plan.lower + 0.2)) { const sp = start.clone(); sp.y = wh(sp.x, sp.z); splashCb?.(sp, 0.35 + 0.2 * prof.splashy); rippleCb?.(sp, 0.6); onSound?.("splash", sp); }
          if (sw.depth === 0 && Math.floor(kt / 0.35) !== Math.floor(prevKt / 0.35)) { const w2 = c.clone(); w2.y = wh(c.x, c.z); rippleCb?.(w2, 0.22); } // (its wake while it's on top)
          rel.fish = c.clone();
          // (and where it'll be in a moment, so the camera frames the way it's going rather than trailing behind it)
          { const u2 = Math.min(1, u + 0.15), s2 = swimAway(u2, fishLen), b2 = Math.atan2(away.z, away.x) + s2.bear * P.side * 0.5; rel.ahead = start.clone().add(new THREE.Vector3(Math.cos(b2), 0, Math.sin(b2)).multiplyScalar(s2.dist)); rel.ahead.y = c.y; rel.ahead.addScaledVector(new THREE.Vector3(Math.cos(base), 0, Math.sin(base)), fishLen * 0.5); }
          // (once it's gone down out of sight the shot goes back up to you and the net: it stared at empty water)
          if (sw.depth > 0.35) rel.stage = "swum";
        } else if (step === "haul" && G) {
          // the empty net hauled back up the wall, hand over hand (lighter now), then lifted over the rail and laid back
          // where it waits on the deck: never vanishing at the foot of the wall and appearing on the deck
          netOn = true; ropesOn = true; inNet = false; rel.water = G.waterY;
          const over = plan.haul - 1.1, full = G.L - G.sink * 0.85, idle = G.deck;
          if (kt < over) {
            const N = Math.max(3, Math.round(full / 0.75)), f = seg(kt, plan.swim, over), q = f * N, k = Math.min(N - 1, Math.floor(q)), u = q - k;
            const out2 = full * (1 - (k + ease(clamp((u - 0.15) / 0.75, 0, 1))) / N);
            netRest = 0; netAt = G.hangAt(out2).sub(new THREE.Vector3(0, G.bridle, 0)).addScaledVector(side, Math.sin(kt * 2.6) * 0.06 * (1 - f)); netAt.y = Math.max(netAt.y, wh(netAt.x, netAt.z) + 0.05);
            if (k !== P.lastRelPull) { P.lastRelPull = k; onSound?.("rope", G.hangAt(out2)); }
            if (out2 < full - 0.1 && f < 0.9 && Math.floor(kt / 0.15) !== Math.floor(prevKt / 0.15)) splashCb?.(netAt.clone().add(new THREE.Vector3(0, -0.3 * ns, 0)), 0.05 + 0.06 * (1 - f)); // (water running out of the mesh)
            if (crossed2(kt, plan.swim + 0.05)) { const w2 = G.col.clone(); w2.y = G.waterY; splashCb?.(w2, 0.3); rippleCb?.(w2, 0.5); }
            dropRig = { railPt: G.railPt, hanging: true, coil: G.coil, waterY: G.waterY, col: G.col.clone() }; releaseRope = G; ropePull = { hand: k % 2, u };
            actNow = { key: "pull_rope", t: 3 + ((kt - plan.swim) * 1.1) % 5, w: 0.4 * (1 - f) };
            rel.stage = "haul";
          } else {
            const f = ease(seg(kt, over, plan.haul - 0.05)), st0 = G.hangAt(0).sub(new THREE.Vector3(0, G.bridle, 0)), ctrl = G.railPt.clone().add(new THREE.Vector3(0, 0.5, 0));
            netAt = st0.clone().multiplyScalar((1 - f) ** 2).addScaledVector(ctrl, 2 * f * (1 - f)).addScaledVector(idle, f * f); netRest = ease(seg(kt, over + 0.4, plan.haul - 0.05));
            rel.stage = "haul"; rel.over = true;
          }
          keptPose = null; showFish = false;
        } else { kept = { state: "gone", t0: t }; keptPose = null; showFish = false; netOn = false; dropRig = null; releaseRope = null; keptFrom = null; }
        rel.net = netAt ? netAt.clone() : null; if (!rel.fish && keptPose) rel.fish = keptPose.centre.clone();
        releaseInfo = rel;
      }
      prevKt = kt;
    } else { prevKt = -1; keptFrom = null; }
    if (keptPose) lastKept = { c: keptPose.centre.clone(), roll: keptPose.roll };
    // at a pier the drop net lies ready on the deck beside the tackle box (so it's there before it's needed, never conjured)
    let netIdle = false;
    if (!netOn && venue === "pier" && !walking) { netOn = true; netIdle = true; netAt = dropGeo(Math.max(1, (fishLen * 0.62) / 0.35)).deck; netRest = 1; inNet = false; } // (where it's set down after a landing and laid back after a release: it never moves by itself)
    // ---- springs, then the rod's shape ----
    // (the tip never quite still: a slow nod and the wind working it, in gusts, more in a stronger wind)
    if (held || ph === "waiting" || ph === "bite") tipT += (0.004 + 0.012 * clamp(env.wind || 0, 0, 1.5)) * (n1(t * 1.3 + id.length) + 0.5 * n1(t * 3.7 + 1.7)) * (0.6 + 0.4 * Math.max(0, n1(t * 0.23)));
    spring("k", "kv", bendT * R.flex, 8, 0.35, dt); spring("tip", "tipv", tipT, 18, 0.25, dt);
    const sway = n1(t * 0.4 + id.length) * 0.02 * (1 + env.wind), breath = Math.sin(t * 1.6 + id.length) * 0.008;
    let butt, dir;
    if (held) {
      dir = new THREE.Vector3(Math.sin(yawOff) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yawOff) * Math.cos(pitch)).normalize();
      // the reel always ends up in the same comfortable place for the hand: a long beachcaster's butt reaches back
      // under the arm, a short spinning rod's doesn't
      butt = new THREE.Vector3(0.18, 0.95, -0.12).addScaledVector(dir, 0.45 - R.seat);
      if (ph === "waiting" || ph === "bite") { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); }
    } else { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); }
    if (!held || (ph !== "cast" && ph !== "hooked" && ph !== "landing" && ph !== "lost")) { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); held = false; }
    // walking about: the rod carried in the right hand at the reel, low by your side, its tip leading forwards and up
    // (clear of your legs, the rail and anyone behind you); the line wound in. It moves with you: rising and falling and
    // swaying with your shoulders at each step, the tip trailing a little as you turn and dipping as you stop, and held
    // more upright when something's close ahead (a wall, the lighthouse) so it never pokes through it
    if (walking) {
      const ch = fig.chest;
      if (ch) {
        if (!carry.base) carry.base = ch.p.clone(), carry.yaw = ch.yaw;
        const kb = 1 - Math.exp(-dt * 1.8); carry.base.lerp(ch.p, kb); carry.yaw += wrapR(ch.yaw - carry.yaw) * kb;
        carry.d.copy(ch.p).sub(carry.base).clampLength(0, 0.06); carry.sway = clamp(wrapR(ch.yaw - carry.yaw), -0.2, 0.2);
      } else { const bob = Math.sin((walking.phase || 0) * 2) * 0.025 * Math.min(1, (walking.speed || 0) / 2); carry.d.set(0, bob * 0.5, 0); carry.sway = 0; }
      const kt = 1 - Math.exp(-dt * 5);
      carry.trail += (clamp((walking.turnRate || 0) * 0.05, -0.1, 0.1) - carry.trail) * kt;
      carry.tilt += (clamp((walking.acc || 0) * 0.012, -0.06, 0.05) - carry.tilt) * kt;
      // (upright as far as needed to clear what's ahead: the tip's reach forward no more than the space there is)
      const reachOk = walking.ahead == null ? 9 : Math.max(0.4, walking.ahead - 0.25);
      const along = R.len * (1 - 0.7 * R.seat / R.len), fwd0 = 0.81 * along, up = fwd0 > reachOk ? Math.acos(clamp(reachOk / along, 0.2, 0.81)) - Math.acos(0.81) : 0;
      carry.up += (up - carry.up) * (1 - Math.exp(-dt * (up > carry.up ? 9 : 3)));
      const el = Math.asin(0.58 / Math.hypot(0.07, 0.58, 0.81)) + carry.tilt + carry.up + carry.d.y * 0.6, az = -0.086 + carry.trail + carry.sway * 0.35;
      dir = new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      butt = new THREE.Vector3(0.25, 0.86, -0.05).addScaledVector(carry.d, 0.8).addScaledVector(dir, -R.seat * 0.7); held = true; showLine = false; showFish = false;
    } else carry.base = null;
    // first person: whenever the line is out the rod is in your hands, low and to the right with the reel in view and
    // the tip pointing out towards the line (a portrait phone sees only about 35° side to side, so it can't be off to
    // one side on a rest)
    // (landing it with the drop net yourself, the rod goes onto the rail once the fish is up at the wall, and your
    // hands go to the net and its rope: the rod laid down where you can see it, not held by nobody in front of you)
    const fpRodDown = (!!kept && kept.state !== "gone") || (ph === "landing" && (tech === "dropnet" || tech === "net") && (age >= LT.swingIn || (tech === "dropnet" && landStage && landStage !== "up"))); // (drawn up a beach or swung in, the rod stays in your hands until the fish is down: a hand reaching for the line filled the view) // (and while your fish is on the deck: the rod stays down, not held up in front of your face as you look down at it)
    if (fp && !fpRodDown) {
      held = true;
      // held in front of you wherever you look (as in a first-person game): the reel and your right hand stay in the
      // lower right of the view, the rod rising from there at its angle for the moment (higher at a cast, lower to
      // land), so turning to watch the fish never loses the reel your hand is winding
      const vy = viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0, vp = viewIn ? clamp(viewIn.pitch, -0.9, 0.7) : -0.12;
      const vf = new THREE.Vector3(Math.sin(vy) * Math.cos(vp), Math.sin(vp), -Math.cos(vy) * Math.cos(vp)), vr = new THREE.Vector3(Math.cos(vy), 0, Math.sin(vy)), vu = new THREE.Vector3().crossVectors(vr, vf);
      // the reel stays put in the view (lower right, from the eye where it is now: leaning over the rail moves it); the
      // rod swings about it, up for a cast, after a running fish, down to land it
      // (from the lower right, leaning in a little towards the middle, so it doesn't run straight up the view)
      // (as you'd hold it yourself: the reel low in the middle of the view, the rod rising away up and to the left,
      // both hands on it, the water and the line beyond)
      const e = fpE - 0.2, sw = fpYaw - 0.3;
      dir = vf.clone().multiplyScalar(Math.cos(e) * Math.cos(sw)).addScaledVector(vu, Math.sin(e)).addScaledVector(vr, Math.cos(e) * Math.sin(sw)).normalize();
      fpView = { vr, vu, vf };
      fpPullNow += (fpPull - fpPullNow) * Math.min(1, dt * 6);
      const reelAt = fpEye().addScaledVector(vr, FPR.x + (fpArm?.right || 0)).addScaledVector(vu, FPR.y - fpPullNow * 0.4 + (fpArm?.up || 0)).addScaledVector(vf, FPR.z + fpPullNow + (fpArm?.fwd || 0)); // (above and left of the Reel button, a little to the right so you see the reel and the hand winding it from the left side; your right forearm goes off the right edge)
      butt = reelAt.addScaledVector(dir, -R.seat);
    }
    // from one way of holding the rod to the next (onto the rail, into your hands, walking off with it) the rod moves
    // there over a moment rather than jumping
    { const key = `${held}|${fp}|${!!walking}`; if (key !== rodS.key) { if (rodS.key) rodS.until = t + 0.75; rodS.key = key; }
      if (rodS.ok && t < rodS.until) { const k2 = 1 - Math.exp(-dt * 6); rodS.butt.lerp(butt, k2); rodS.dir.lerp(dir, k2).normalize(); butt = rodS.butt.clone(); dir = rodS.dir.clone(); }
      else { rodS.butt.copy(butt); rodS.dir.copy(dir); rodS.ok = true; } }
    dir.x += sway; dir.y += breath; dir.normalize();
    // the bend is towards the line
    const target = rigAt ? toLocal(rigAt) : butt.clone().add(dir.clone().multiplyScalar(R.len * 2)).add(new THREE.Vector3(0, -2, 0));
    const toT = target.clone().sub(butt).normalize();
    const bendDir = toT.clone().sub(dir.clone().multiplyScalar(toT.dot(dir))); if (bendDir.lengthSq() < 1e-6) bendDir.set(0, -1, 0); bendDir.normalize();
    const k = clamp(spr.k, -0.1, 0.75);
    // the rod's shape: its direction turned towards the line a little more at each step, by its share of the whole bend
    // (BEND), so the butt stays straight, the middle curves and the tip curves most. The total turn grows with the pull,
    // but never takes the tip past the line's own direction (under a heavy fish the tip points down the line). The tip's
    // spring adds a quick flick of the last part (a sudden pull, the drag slipping) that dies away
    const toLine = Math.acos(clamp(toT.dot(dir), -1, 1));
    const turn = Math.sign(k) * Math.min(Math.abs(k) * 3.0, Math.max(0.15, toLine * 0.98));
    pts[0].copy(butt);
    for (let i = 0; i < NSEG; i++) {
      const s = (i + 0.5) / NSEG, th = turn * (BEND[i] + BEND[i + 1]) / 2 + spr.tip * 2.2 * Math.pow(s, 5);
      pts[i + 1].copy(pts[i]).addScaledVector(dir, Math.cos(th) * R.len / NSEG).addScaledVector(bendDir, Math.sin(th) * R.len / NSEG);
    }
    for (let i = 0; i < NSEG; i++) between(rodSegs[i].m, pts[i], pts[i + 1], rodSegs[i].r);
    // the handle, the reel and the rings, each square to the blank with the rings and reel underneath it
    const along = (m) => { const s2 = Math.min(1, m / R.len) * NSEG, i = Math.min(NSEG - 1, Math.floor(s2)), f = s2 - i; return { p: pts[i].clone().lerp(pts[i + 1], f), t: pts[i + 1].clone().sub(pts[i]).normalize() }; };
    const frame = (t) => { const up = tmpUp.set(0, 1, 0).addScaledVector(t, -t.y); if (up.lengthSq() < 1e-4) up.set(1, 0, 0); up.normalize(); const x = new THREE.Vector3().crossVectors(up, t); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, t)); };
    for (const hp of handleParts) { const a = along(hp.a).p, b = along(hp.b).p; between(hp.m, a, b, hp.r); }
    const seat = along(R.seat); reel.position.copy(seat.p); reel.quaternion.copy(frame(seat.t));
    // the reel: the handle at its angle; the rotor geared up from it (about five turns to one, as a sea spinning reel);
    // the spool moving in and out once a turn to lay the line; the drag letting the spool turn back while a fish takes
    // line; the bail open for the cast until the rig's down, then flipped over
    { const u = reel.userData; if (local && typeof window !== "undefined" && FILM && window.__fdSpinRate) u.spin = (u.spin || 0) + window.__fdSpinRate * dt; // (film only: the handle turned steadily, to check the hand on it)
      const sp = u.spin || 0;
      handle.rotation.x = -sp; u.rotor.rotation.z = sp * 5.2;
      if (u.spool) { u.spool.position.z = u.spoolZ + 0.0055 * (1 - Math.cos(sp)) - 0.004; u.slip = (u.slip || 0) + (u.slipping ? dt * 9 : 0); u.spool.rotation.z = -u.slip; }
      if (u.bail) { const open = ph === "cast" && age < 2.25 ? 1 : 0; u.bailK = (u.bailK ?? 0) + (open - (u.bailK ?? 0)) * Math.min(1, dt * (open ? 14 : 22)); u.bail.rotation.x = -1.95 * u.bailK; } }
    if (rodKit) rodKit.update(pts, frame); // (the modelled rod: bent along the same curve, the rings hung from it)
    else guides.forEach((gd) => {
      const a = along(gd.s * R.len); gd.g.position.copy(a.p); gd.g.quaternion.copy(frame(a.t));
      const br = rodSegs[Math.min(NSEG - 1, Math.floor(gd.s * NSEG))].r; gd.wrap.scale.set(br * 1.3, 0.024, br * 1.3);
    });
    rest.visible = !walking && (!held || venue === "beach");

    // ---- the person: hands on the rod, the reel's handle, the drop net's rope or the fish; braced against a fight,
    // leaning over the rail to land it, watching the rod tip or the float while they wait ----
    const hands = [null, null];
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const rodGrip = (m, palm, kind) => { const a = along(m); return { at: a.p, axis: a.t, palm, kind }; };
    let lean = 0, brace = 0, crouch = 0, twist = 0, idleMode = "hang", lookAtW = null, fpRope = false;
    const tension = ph === "hooked" ? clamp(P.tension || 0.6, 0, 1.6) : 0;
    // the reel's handle, for the left hand to wind (it's on the left of a spinning reel)
    reel.updateMatrixWorld(true);
    const kn = reel.userData.knob || V3(0.016, -0.048, 0);
    const knob = toLocal(handle.localToWorld(kn.clone())), knobAx = toLocal(handle.localToWorld(kn.clone().add(V3(-0.026, 0, 0)))).sub(knob);
    if (walking) hands[1] = rodGrip(R.seat * 0.7, V3(-1, 0, 0.2), "carry");
    else if (held) {
      // (sock: the grip's frame on the reel itself: its foot on the rod, z to the tip, the reel below. The hands are set
      // from it, so they go wherever the reel goes and can't drift off it)
      hands[1] = { ...rodGrip(R.seat - 0.03, V3(-1, 0.15, 0), "seat"), stem: along(R.seat).p, sock: { pos: reel.position.clone(), quat: reel.quaternion.clone() } }; // on the side of the rod at the reel seat, palm in, thumb along the top, the reel's stem between the fingers below
      // the other hand: on the butt to cast, on the reel's handle to wind (while a fish is on and landing it); free
      // while you wait
      // (in first person, holding the rod while you wait, the left hand rests lightly on the knob, ready: it hung in the
      // corner of the view with a finger up before)
      hands[0] = ph === "cast" && age < 2.4 && !fp ? rodGrip(0.05, V3(1, 0.2, 0), "butt") : ph === "cast" && fp && age < 1.25 ? null /* (first person: the left hand off down out of sight for the cast, back on the reel as the line goes out: on the butt it showed as a stray thumb at the bottom, on the reel the whole arm swept across the view) */ : ph === "hooked" || ph === "landing" || ph === "lost" || fp ? { at: knob, axis: knobAx, palm: dir.clone().negate().add(V3(0, -0.5, 0)), kind: "crank", hub: toLocal(handle.localToWorld(V3(kn.x, 0, 0))), spin: reel.userData.spin || 0, sock: { pos: knob.clone(), quat: reel.quaternion.clone() } } : null;
    }
    if (ph === "bite" && !held) {
      // a hand out over the rod, ready to strike: to the nearest part of it within reach, bending down to it if it's low
      const want = V3(0.24, 1.0, -0.38); let best = null;
      for (let m = 0.1; m <= R.len * 0.6; m += 0.05) { const a = along(m), d = a.p.distanceTo(want); if (!best || d < best.d) best = { d, p: a.p }; }
      hands[1] = { at: best.p.clone().add(V3(0, 0.07, 0)), kind: "ready", palm: V3(-0.4, -1, 0) };
      crouch = clamp((0.95 - best.p.y) * 0.7, 0.08, 0.45); lean = 0.15 + crouch * 0.4; lookAtW = tipWorld();
    }
    else if (ph === "waiting" || ph === "missed") {
      // watching the tip (or the float) most of the time; standing about, hands in pockets or arms folded
      const watch = n1(t * 0.07 + id.length * 3.1) > -0.35;
      if (watch) lookAtW = floatRig ? castAt.clone() : tipWorld();
      const m = Math.floor(t / 23 + (hashSeed(id) % 7)) % 3; idleMode = ["pockets", "fold", "hang"][m];
    } else if (ph === "idle" || ph === "ended" || ph === "paused") idleMode = (hashSeed(id) % 2) ? "pockets" : "hang";
    if (ph === "cast") { lookAtW = age > 0.7 ? (rigAt || castAt).clone() : null; lean = age > 0.6 && age < 1.1 ? 0.22 : age < 0.6 ? -0.08 : 0; twist = age < 0.6 ? 0.3 * ease(age / 0.6) : 0.3 * (1 - ease(seg(age, 0.6, 0.9))); }
    // (seen from outside, the whole body takes the fish: leaning back on the rod and sitting into the knees as the line
    // tightens, further back as you pump, pulled forwards a little on a surge; it was standing almost upright)
    if (ph === "hooked") { const tk = P.tk ?? clamp(tension, 0, 1.4), pump = P.pump ?? 0, surge = P.surge ?? 0; brace = clamp(0.4 + 0.5 * tk, 0, 1); lean = -0.05 - 0.14 * tk - 0.1 * pump + 0.12 * surge * tk; crouch = 0.08 + 0.14 * tk + 0.04 * pump; twist = yawOff * 0.6; lookAtW = rigAt ? rigAt.clone() : null; }
    if (ph === "landing") {
      lookAtW = (fish.visible ? fish.position : rigAt)?.clone() || null; brace = age < LT.T1 ? 0.5 : 0.2; lean = 0.08;
      if (tech === "net" && netOn && poleFrom && netAt) { hands[0] = { at: toLocal(poleFrom), axis: toLocal(netAt).sub(toLocal(poleFrom)), palm: V3(0, 1, 0), kind: "pole" }; lean = 0.2; }
      if (tech === "dropnet" && landStage) {
        const railZ = -Math.max(0.3, edge - 0.22), net0 = netAt ? toLocal(netAt) : null, sideL = V3(1, 0, 0);
        if (landStage === "up") { lookAtW = rigAt ? rigAt.clone() : lookAtW; lean = 0.1; }
        else if (landStage === "rod") {
          // laying the rod on the rail: the right hand goes with it, the left lets go of the reel
          hands[1] = { ...rodGrip(R.seat - 0.03, V3(-1, 0.15, 0), "seat"), stem: along(R.seat).p }; hands[0] = null; lean = 0.12; brace = 0;
        } else if (landStage === "pick" && net0) {
          // stooping to the net on the deck, both hands on the hoop, and lifting it over the rail
          const rr = 0.3 * Math.max(1, (fishLen * 0.62) / 0.35);
          hands[0] = { at: net0.clone().addScaledVector(sideL, -rr * 0.8).add(V3(0, 0.03, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          hands[1] = { at: net0.clone().addScaledVector(sideL, rr * 0.8).add(V3(0, 0.03, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          crouch = clamp(0.9 - net0.y * 0.7, 0, 0.75); lean = 0.25 * crouch; brace = 0;
        } else if (landStage === "lower" || landStage === "lead" || landStage === "haul") {
          // both hands on the rope just behind the top rail, leaning over a little to watch the net. Letting it down,
          // the rope runs through loose hands; hauling, one hand pulls down and back while the other reaches up for the
          // next grip, then they change over (in time with the rope coming up: angler.js's ropePull)
          // (in first person you lean out over the top rail and hold the rope there, one hand above the other on it, the
          // rope running straight down from your hands to the net: looking down you see your hands, the rope, the wall and
          // the net and the fish in the water below. From behind: at your chest just back from the rail)
          const base = fp ? (() => { const E = fpEye(), nt = netAt ? toLocal(netAt).add(V3(0, 0.72 * net.scale.x, 0)) : null;
            // (once the net is past the rail, on your line of sight down to it, as when letting a fish go: out at eye height
            // the upper arms came in from the top corner of the screen while you looked down)
            if (nt && (nt.y < -0.3 || nt.z < railZ)) return E.clone().addScaledVector(nt.clone().sub(E).normalize(), 0.72).add(V3(-0.24, 0.04, 0.06));
            return V3(E.x - 0.34, E.y - 0.34, E.z - 0.32); })() : V3(-0.3, 1.12, railZ + 0.2); // (first person: at arm's length out and down from your eye as you lean over the rail, a little to your left, so you look down past your hands to the net and the fish rather than straight through them)
          // (in first person the two hands sit one behind the other along the rope as it runs down to the net, about a hand's
          // width apart, so both show past each other from above, as they would looking down at your own hands)
          const rd = fp && netAt ? toLocal(netAt).add(V3(0, 0.72 * net.scale.x, 0)).sub(base).normalize() : V3(0, -1, 0);
          const hold = (hi) => (fp ? base.clone().addScaledVector(rd, hi ? 0 : 0.17) : base.clone().add(V3(hi ? 0 : 0.04, hi ? 0.2 : -0.26, hi ? -0.24 : 0.12)) /* (from behind: reaching out over the rail for the next grip, then pulling it right down to the hip, so the hand over hand reads from a distance) */);
          let a0 = fp ? hold(true) : base.clone().add(V3(-0.05, 0.06, -0.04)), a1 = fp ? hold(false) : base.clone().add(V3(0.07, -0.12, 0.1));
          if (landStage === "haul" && ropePull) {
            // hand over hand: one pulls down (the rope sliding up through the other), then they change over
            const u = ease(clamp((ropePull.u - 0.15) / 0.75, 0, 1)), puller = hold(true).lerp(hold(false), u), reacher = hold(false).lerp(hold(true), ease(ropePull.u));
            if (fp) { if (ropePull.hand) { a1 = puller; a0 = reacher; } else { a0 = puller; a1 = reacher; } }
            else if (ropePull.hand) { a1 = puller; a0 = reacher.add(V3(-0.06, 0, 0)); } else { a0 = puller.add(V3(-0.06, 0, 0)); a1 = reacher; }
          }
          hands[0] = { at: a0, axis: V3(0, 1, 0), palm: V3(0.3, 0, 1), kind: "rope", rail: { y: 1.12, z: railZ } }; // (rail: where the top rail is, so the forearm comes over it: fpHands.js)
          hands[1] = { at: a1, axis: V3(0, 1, 0), palm: V3(-0.3, 0, 1), kind: "rope", rail: { y: 1.12, z: railZ } };
          // (in first person each hand closes round the rope as round the reel's knob: the rope across the fingers, the
          // thumb side up, the hand turned about the rope to line up with the forearm)
          if (fp) { const rq = new THREE.Quaternion().setFromRotationMatrix((() => { const X = rd.clone(), Y = V3(0, 0, 1).addScaledVector(rd, -rd.z).normalize(); return new THREE.Matrix4().makeBasis(X, Y, X.clone().cross(Y)); })());
            for (const hh of hands) hh.sock = { pos: hh.at.clone(), quat: rq.clone() }; }
          fpRope = fp; lean = fp ? 0.3 : 0.22; crouch = 0.06; brace = landStage === "haul" ? 0.25 : 0; lookAtW = netAt ? netAt.clone() : lookAtW;
        } else if (landStage === "done") { lookAtW = netAt ? netAt.clone() : lookAtW; lean = 0.05; brace = 0;
        } else if (landStage === "in" && net0) {
          // reaching out over the rail for the hoop and bringing it round onto the deck
          hands[0] = { at: net0.clone().add(V3(-0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          hands[1] = { at: net0.clone().add(V3(0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          crouch = clamp(0.8 - net0.y * 0.6, 0, 0.6); lean = 0.18; brace = 0; lookAtW = netAt ? netAt.clone() : lookAtW;
        }
      }
      if (rigAt && age >= LT.card - 0.3 && tech !== "dropnet" && tech !== "net" && !fp) hands[0] = { at: toLocal(rigAt).add(V3(0, 0.05, 0)), axis: V3(0, 1, 0), palm: V3(1, 0, 0), kind: "line" };
    }
    if (ph === "lost") { lean = 0.05; lookAtW = rigAt ? rigAt.clone() : null; }
    let kneel = 0;
    if (keptPose?.centre && (kept?.state === "inspect" || (kept?.state === "release" && keptPose.lift))) {
      // both hands under it while it's carried (one behind the head, one by the tail), then one hand resting on its side
      // while it lies on the mat; crouched down over it, looking at it
      const d = toLocal(keptPose.mouth.clone().add(keptPose.dir)).sub(toLocal(keptPose.mouth)), upL = V3(0, 1, 0);
      // (the palms just under it, behind the head and at the wrist of the tail, as far down as its belly reaches the way
      // it's turned: they used to sit a few centimetres under the spine, inside a fish of any size)
      const below = restHeight(halfDepth(), halfThick(), keptPose.roll || 0) + 0.022;
      const under = (k) => toLocal(keptPose.mouth.clone().addScaledVector(keptPose.dir, fishLen * k)).add(V3(0, -below, 0));
      if (keptPose.lift) {
        // (one hand under it behind the head, cupped round the belly; the other closed round the wrist of its tail, as
        // anyone holds a fish to look at it: two flat palms under it read as a tray)
        const wrist = toLocal(keptPose.mouth.clone().addScaledVector(keptPose.dir, fishLen * 0.86));
        hands[0] = { at: under(0.3), axis: d, palm: upL, kind: "fish" }; hands[1] = { at: wrist, axis: d, palm: upL, kind: "tailwrist", R: Math.max(0.008, halfDepth() * 0.32) }; }
      else { hands[1] = { at: toLocal(keptPose.centre).add(V3(0.02, halfThick() + 0.02, 0.03)), axis: d, palm: V3(0, -1, 0), kind: "fish" }; hands[0] = null; }
      lookAtW = keptPose.centre.clone(); kneel = 1; crouch = 0.6; lean = keptPose.lift ? 0.06 : 0.42; brace = 0; // (upright while holding it out, so your head stays clear of it)
      // the shoulders turned towards it (it's off to one side lifting it from the net, in front on the mat), and bent
      // over it a little more the lower it is, so the arms reach it rather than stretching out straight
      { const c = toLocal(keptPose.centre); twist = clamp(Math.atan2(c.x, -c.z) * 0.45, -0.55, 0.55); lean += clamp((0.7 - c.y) * 0.25, 0, 0.15); }
    }
    if (kept?.state === "release" && relStep === "over" && venue === "pier" && netAt) {
      // putting it back: the drop net, the fish in it, lifted over the top rail in both hands
      const net0 = toLocal(netAt);
      { const rail = { y: 1.12, z: -Math.max(0.3, edge - 0.22) }; // (so the arms come over the top rail lifting it across, not through it)
        hands[0] = { at: net0.clone().add(V3(-0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop", rail };
        hands[1] = { at: net0.clone().add(V3(0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop", rail }; }
      crouch = clamp(0.8 - net0.y * 0.6, 0, 0.6); lean = 0.18; brace = 0; lookAtW = netAt.clone();
    }
    if (kept?.state === "release" && releasePole && poleFrom && netAt) { hands[0] = { at: toLocal(poleFrom), axis: toLocal(netAt).sub(toLocal(poleFrom)), palm: V3(0, 1, 0), kind: "pole" }; lean = 0.2; lookAtW = netAt.clone(); }
    if (kept?.state === "release" && releaseRope && !keptPose?.lift) {
      // letting it go from the drop net: both hands on the rope at the rail, watching it swim out; then hauling the empty
      // net back up, a hand over the other (as landing it). In first person as when landing it: leaning out past the
      // wall's top, both hands on the rope one above the other off to your left, watching the fish go below
      const E = fp ? fpEye() : null;
      // (first person: the hands on the rope just below your eye, on your line of sight down to the net and a little to
      // the left, so looking down at the fish you see your hands and the rope running from them to it. Out at your left
      // at eye height, looking straight down put them above the top of the picture: the 8 November recording showed both
      // forearms hanging in from the top edge, upside down, holding nothing you could see)
      const netTop = fp && netAt ? toLocal(netAt).add(V3(0, 0.72 * net.scale.x, 0)) : null;
      const sight = netTop ? netTop.clone().sub(E).normalize() : V3(0, -0.8, -0.6).normalize();
      const base = fp ? (netTop && (netTop.y < -0.3 || netTop.z < -Math.max(0.3, edge - 0.22)) ? E.clone().addScaledVector(sight, 0.72).add(V3(-0.24, 0.04, 0.06)) : V3(E.x - 0.5, E.y - 0.3, E.z - 0.36)) /* (along the sight only once the net is down past the wall: while it was still on the deck the hands followed it down to the concrete) */ : V3(-0.3, 1.12, -Math.max(0.3, edge - 0.22) + 0.2); // (first person: out to your left, so looking straight down past them at the fish your arms are at the side of the view, not up the middle of it)
      // (in first person the two hands sit one behind the other along the rope as it runs down to the net, about a hand's
          // width apart, so both show past each other from above, as they would looking down at your own hands)
          const rd = fp && netAt ? toLocal(netAt).add(V3(0, 0.72 * net.scale.x, 0)).sub(base).normalize() : V3(0, -1, 0);
          const hold = (hi) => (fp ? base.clone().addScaledVector(rd, hi ? 0 : 0.17) : base.clone().add(V3(hi ? 0 : 0.04, hi ? 0.2 : -0.26, hi ? -0.24 : 0.12)) /* (from behind: reaching out over the rail for the next grip, then pulling it right down to the hip, so the hand over hand reads from a distance) */);
      let a0 = fp ? hold(true) : base.clone().add(V3(-0.05, 0.06, -0.04)), a1 = fp ? hold(false) : base.clone().add(V3(0.07, -0.12, 0.1));
      if (relStep === "haul" && ropePull) {
        const u = ease(clamp((ropePull.u - 0.15) / 0.75, 0, 1)), puller = hold(true).lerp(hold(false), u), reacher = hold(false).lerp(hold(true), ease(ropePull.u));
        if (fp) { if (ropePull.hand) { a1 = puller; a0 = reacher; } else { a0 = puller; a1 = reacher; } }
        else if (ropePull.hand) { a1 = puller; a0 = reacher.add(V3(-0.06, 0, 0)); } else { a0 = puller.add(V3(-0.06, 0, 0)); a1 = reacher; }
      }
      { const rz = -Math.max(0.3, edge - 0.22);
        hands[0] = { at: a0, axis: V3(0, 1, 0), palm: V3(0.3, 0, 1), kind: "rope", rail: { y: 1.12, z: rz } };
        hands[1] = { at: a1, axis: V3(0, 1, 0), palm: V3(-0.3, 0, 1), kind: "rope", rail: { y: 1.12, z: rz } }; }
      if (fp) { const rq = new THREE.Quaternion().setFromRotationMatrix((() => { const X = rd.clone(), Y = V3(0, 0, 1).addScaledVector(rd, -rd.z).normalize(); return new THREE.Matrix4().makeBasis(X, Y, X.clone().cross(Y)); })()); for (const hh of hands) hh.sock = { pos: hh.at.clone(), quat: rq.clone() }; fpRope = true; }
      lean = 0.22; crouch = 0.06; brace = relStep === "haul" ? 0.2 : 0; lookAtW = releaseInfo?.fish || (netAt ? netAt.clone() : lookAtW);
    }
    if (kept?.state === "release" && relStep === "haul" && releaseInfo?.over && netAt) {
      // the empty net over the rail in both hands and laid back on the deck
      const net0 = toLocal(netAt);
      { const rail = { y: 1.12, z: -Math.max(0.3, edge - 0.22) }; // (so the arms come over the top rail lifting it across, not through it)
        hands[0] = { at: net0.clone().add(V3(-0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop", rail };
        hands[1] = { at: net0.clone().add(V3(0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop", rail }; }
      crouch = clamp(0.8 - net0.y * 0.6, 0, 0.6); lean = 0.18; brace = 0; lookAtW = netAt.clone();
    }
    if (kept?.state === "deck" && !walking) lookAtW = fish.visible ? fish.position.clone() : lookAtW;
    handsNow = hands.map((h, i) => (h ? h.at.clone() : V3(i ? 0.28 : -0.28, 0.85, -0.05))); ropeHeld = hands.some((h) => h?.kind === "rope");
    if (emoting && emoting.t0 == null) emoting.t0 = t;
    const emote = emoting && t - emoting.t0 < EMOTE_S[emoting.kind] ? { kind: emoting.kind, u: t - emoting.t0, hand: hands[1] ? 0 : 1 } : null;
    if (!emote) emoting = null;
    // leaning out over the rail in first person: the body goes with the eye, so the hands still reach the rod
    // (in first person the whole body goes with the eye instead, below, so your shoulders stay where they are in the view)
    const fpCrouch = crouch; // (first person: the stoop goes into your eye, below; the body isn't drawn)
    if (fp) { brace = 0; crouch = 0; lean = 0.04; }
    // first person: your body turns to face where you look (only your forearms show), so your arms never reach back
    // across the view; the hands' places are worked out in the angler's space, so turn them into the body's
    const wantYaw = fp && viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0;
    figYaw = fp ? figYaw + Math.atan2(Math.sin(wantYaw - figYaw), Math.cos(wantYaw - figYaw)) * Math.min(1, dt * 10) : 0;
    fig.group.rotation.y = -figYaw;
    // kneeling by the fish the body shuffles in towards it (on its knees, a step's worth at most), so the hands reach it
    // where it lies or sits in the net: kneeling where you stood, a fish on the mat in front was beyond arm's length and
    // the hand hung in the air over it
    { const want = new THREE.Vector3();
      if (kneel && keptPose?.centre && !walking && !fp) { const c = toLocal(keptPose.centre); c.y = 0; const d = c.length(); if (d > 1e-3) want.copy(c).multiplyScalar(clamp(d - 0.42, 0, 0.3) / d); }
      figOff.lerp(want, 1 - Math.exp(-dt * 2.5)); if (figOff.lengthSq() < 1e-8) figOff.set(0, 0, 0); fig.group.position.copy(figOff); }
    const toFig = (v) => (v && figYaw ? v.clone().applyAxisAngle(UP, figYaw) : v);
    const toFigP = (v) => (v ? toFig(v.clone().sub(figOff)) : v);
    // first person: a hand on the drop net's hoop closes round the hoop's rim itself (the same hook grip as on the rope and
    // the knob, the rim across the fingers), not a pointing hand floating near it
    if (fp && netAt && net.visible) for (const hh of hands) if (hh && hh.kind === "hoop") {
      const c = toLocal(netAt), rr = 0.35 * net.scale.x, rad = hh.at.clone().sub(c); rad.y = 0; if (rad.lengthSq() < 1e-6) rad.set(1, 0, 0); rad.normalize();
      const at = c.clone().addScaledVector(rad, rr), tan = new THREE.Vector3(0, 1, 0).cross(rad).normalize(), z = tan.clone().cross(V3(0, 1, 0));
      // (when the hoop is further than your arm reaches, as it swings up off the deck and out over the rail, the hand
      // holds the rope that far along, towards the hoop, and the rope carries the net: holding the rim itself drew arms
      // up to two metres long, a sleeve across half the screen, as on the 8 November recording)
      const E = fpEye(), sh = V3(E.x + (hh === hands[1] ? 0.2 : -0.2), E.y - 0.16, E.z + 0.24), toH = at.clone().sub(sh), reach = 0.62; // (the shoulder where fpHands.js draws it)
      if (toH.length() > reach) at.copy(sh).addScaledVector(toH.normalize(), reach);
      hh.at = at; hh.kind = "rope"; hh.sock = { pos: at.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, V3(0, 1, 0), z)) };
    }
    // first person: your hands (fpHands.js) take hold of the same things, placed from the same eye and view as the rod
    if (fp && fpv) {
      const vw = fpView || (() => { const vy = viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0, vp = viewIn ? clamp(viewIn.pitch, -0.9, 0.7) : -0.12; const vf = new THREE.Vector3(Math.sin(vy) * Math.cos(vp), Math.sin(vp), -Math.cos(vy) * Math.cos(vp)), vr = new THREE.Vector3(Math.cos(vy), 0, Math.sin(vy)); return { vf, vr, vu: new THREE.Vector3().crossVectors(vr, vf) }; })();
      fpv.pose({ hands: walking ? [null, null] : hands, eye: fpEye(), vr: vw.vr, vu: vw.vu, vf: vw.vf, dt });
    }
    for (let i = 0; i < 2; i++) if (hands[i]) hands[i] = { ...hands[i], at: toFigP(hands[i].at), axis: toFig(hands[i].axis), palm: toFig(hands[i].palm) };
    fig.pose({ t, dt, act: actNow, emote, kneel, walk: walking ? { speed: walking.speed || 0, air: !!walking.air, sprint: (walking.speed || 0) > 5, off: walking.off || 0, floor: walking.floor || null } : null, lean, brace, crouch, twist, hands, idle: idleMode, look: lookAtW ? toFigP(toLocal(lookAtW)) : null, speaking, hood: fig.look?.hat === 4, weather: { rain: env.rain || 0, wind: env.wind || 0, windDir: toFig(new THREE.Vector3(env.windDir?.[0] || 1, 0, env.windDir?.[1] || 0).applyAxisAngle(UP, -root.rotation.y)).toArray().filter((_, i) => i !== 1) } });
    tag.position.y = fig.top + 0.3; talk.position.y = tag.position.y + 0.31;
    if (!fp && !walking && (ph === "waiting" || ph === "idle" || ph === "ended" || ph === "paused")) { const ey = fig.eyeAt?.y; if (ey > 1.2 && ey < 2) eyeH += (ey - eyeH) * (1 - Math.exp(-dt * 0.5)); }

    // ---- fish, net, line, rig ----
    fish.visible = false;
    // a net big enough for the fish (a drop net is about 70 cm across; a big fish gets a bigger one, and still curls)
    const netScale = Math.max(1, (fishLen * 0.62) / 0.35);
    net.scale.setScalar(netScale);
    // the bag hangs heavy with a fish in it, and slumps flat once it's set down
    if (bag.morphTargetDictionary) {
      // (the Blender net: its own shapes for heavy with a fish, and slumped flat)
      const d = bag.morphTargetDictionary, mi = bag.morphTargetInfluences;
      if (d.laden != null) mi[d.laden] = (inNet ? 0.55 + 0.45 * Math.min(1, load) : 0) * (1 - netRest);
      if (d.flat != null) mi[d.flat] = netRest;
      const wt = net.userData.weight; if (wt) wt.obj.position.y = wt.y0 + wt.lift * netRest; // (the weight ring rests on the slumped bag, not through the deck)
    } else bag.scale.y = lerp(inNet ? 1 + 0.25 * Math.min(1, load) : 1, 0.35, netRest);
    tag.visible = !fp && !tagOff && !(kept && (kept.state === "inspect" || kept.state === "release")); // (no name label in your catch photo)
    talk.visible = speaking && !fp; if (speaking) { const k = 0.3 + Math.abs(Math.sin(t * 6)) * 0.08; talk.scale.set(k, k, 1); }
    const eK = 1 - Math.exp(-dt * 10); // (how far a swimming fish's turn eases this frame)
    if (keptPose) poseFish(keptPose.mouth, keptPose.dir, t, { beat: keptPose.beat, curl: keptPose.curl, roll: keptPose.roll, ease: keptPose.ease ? eK : 0 });
    else if (showFish && inNet && netAt) {
      // in the net: lying across the bag, curled to fit, sagging into the mesh while it hangs; set down on the deck or
      // the bank, on its side on the mesh, never through the boards (it stood upright, half under the deck)
      const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]);
      const bend = clamp((fishLen - 0.6 * netScale * 0.7) / fishLen, 0, 0.6);
      const hangC = netAt.clone().add(new THREE.Vector3(0, -0.22 * netScale, 0)), lieC = netAt.clone().setY(toWorld(new THREE.Vector3(0, 0, 0)).y + halfThick() + 0.035);
      const c = hangC.lerp(lieC, netRest), mouth = c.clone().addScaledVector(side, fishLen * 0.5 * (1 - bend * 0.5));
      poseFish(mouth, side.clone().negate().add(new THREE.Vector3(0, -0.08 * (1 - netRest), 0)).normalize(), t, { beat: lerp(0.5, 0.1, netRest), curl: (0.35 + bend) * (1 - 0.75 * netRest) + Math.sin(t * 2.6) * 0.12 * (1 - 0.7 * netRest), roll: lerp(-1.0, -Math.PI / 2, netRest) });
    } else if (showFish && fishPose) poseFish(fishPose.mouth, fishPose.dir, t, fishPose);
    else if (showFish && rigAt && ph === "hooked") {
      // leaping: nose up going out, nose down coming back in, body bent
      const goingUp = P.jumps?.some((tj) => age >= tj && age < tj + 0.375);
      const away = new THREE.Vector3(dirOf(face)[0], 0, dirOf(face)[1]);
      poseFish(rigAt, away.multiplyScalar(0.4).add(new THREE.Vector3(0, goingUp ? -1 : 1, 0)).normalize(), t, { beat: 1.4, curl: Math.sin(t * 7) * 0.35 });
    } else if (showFish && rigAt) {
      // landing it: coming up head first towards you, nose up; on top, its back out of the water, heading where it's
      // led (its heading eases round from the fight's: it never snaps); swung up out of the water it turns from
      // swimming to hanging from its mouth under the rod tip; on the sand, on its side
      const fwd = new THREE.Vector3(dirOf(face)[0], 0, dirOf(face)[1]), down = new THREE.Vector3(0, -1, 0), flatR = prof.flat ? -Math.PI / 2 : 0;
      const toTip = toWorld(pts[NSEG]).sub(rigAt); toTip.y = 0; if (toTip.lengthSq() < 1e-4) toTip.copy(fwd).negate(); toTip.normalize();
      const vel = fishPrev ? rigAt.clone().sub(fishPrev).divideScalar(Math.max(1e-3, dt)) : new THREE.Vector3(); vel.y = 0;
      const want = vel.length() > 0.25 ? vel.clone().normalize() : toTip;
      fishHead = turnToward(fishHead, Math.atan2(want.z, want.x), 3, dt);
      const head = new THREE.Vector3(Math.cos(fishHead), 0, Math.sin(fishHead));
      let dir = down.clone(), beat = 0.6, curl = Math.sin(t * 2.3) * 0.22, roll = 0, easeK = eK;
      const swim = (nose, b) => { dir = head.clone().negate(); dir.y = nose; dir.normalize(); roll = flatR; beat = b; curl = 0; };
      const { T1, T2, T3, T4 } = LT;
      if (ph === "landing") {
        if (age < T1) swim(0.45, 1.3);
        else if ((tech === "dropnet" && age < T4) || (tech === "net" && age < T3)) {
          // beaten: it rolls over on its side on top (a flank to the sky), now and then righting itself a little
          swim(0.04, 0.45); if (!prof.flat) roll += P.side * (TIRED_ROLL * ease(seg(age, T1, T1 + 1)) - Math.max(0, Math.sin(age * 1.2 + P.s1)) ** 6 * 0.5);
        }
        else if (tech === "beach" && age < T3) { swim(0.02, 1.1 - 0.7 * seg(age, T1, T3)); roll = lerp(flatR, -Math.PI / 2, ease(seg(age, lerp(T1, T3, 0.45), lerp(T1, T3, 0.8)))); }
        else if (tech === "lift" && age < T1 + 0.8) { const sw = head.clone().negate(); sw.y = 0.05; dir = sw.normalize().lerp(down, ease(seg(age, T1, T1 + 0.8))).normalize(); beat = 1.2; easeK = 0; }
        else if (tech === "beach" && age < T4) { dir = head.clone().negate(); dir.y = 0.02; dir.normalize(); roll = -Math.PI / 2; beat = 0.3; curl = Math.max(0, Math.sin(t * 3)) ** 4 * 0.3; }
        else easeK = 0;
        if (age >= LT.card - 0.3 && (tech === "lift" || tech === "beach")) { dir = new THREE.Vector3(1, -0.25, 0).applyQuaternion(root.quaternion); easeK = 0; }
      }
      poseFish(rigAt, dir, t, { beat, curl, roll, ease: easeK });
    }
    if (ph === "landing") fishPrev = rigAt ? rigAt.clone() : null;
    fishShown = fish.visible;
    // the rings, the tip ring and the reel, in the world's space, for the line to run through (fishLine.js): read here,
    // once you've been put where you stand this frame (read earlier, the line trailed the rod by your last move)
    root.updateMatrixWorld(true); reel.updateMatrixWorld(true);
    const RM = root.matrixWorld, rsc = flM.setFromMatrixScale(RM).x;
    if (rodKit) {
      for (let i = 0; i < GUIDES.length; i++) { const r = fLine.rings[i]; r.c.copy(rodKit.ringCentres[i]).applyMatrix4(RM); r.ax.copy(rodKit.ringAxes[i]).transformDirection(RM); r.r = rodKit.ringRadii[i] * rsc; }
      fLine.tip.c.copy(rodKit.tipRing).applyMatrix4(RM); fLine.tip.ax.copy(rodKit.tipAxis).transformDirection(RM); fLine.tip.r = rodKit.tipSize.r * rsc;
      const u = reel.userData; u.spool.updateMatrixWorld(true);
      fLine.reel.roller.copy(u.roller); u.bail.localToWorld(fLine.reel.roller);
      // the line's layer on the spool (measured once from the model): the line goes down from the roller onto it, at
      // whatever point of its stroke the spool is
      if (!spoolInfo) { const bm = u.spool.getObjectByName("braid_blue"); if (bm) { bm.geometry.computeBoundingBox(); const bb = bm.geometry.boundingBox; spoolInfo = { r: Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2, cx: (bb.max.x + bb.min.x) / 2, cy: (bb.max.y + bb.min.y) / 2, z0: bb.min.z, z1: bb.max.z, front: null }; } }
      if (spoolInfo) {
        const si = spoolInfo, rl = u.spool.worldToLocal(flT.copy(fLine.reel.roller)), ang = Math.atan2(rl.y - si.cy, rl.x - si.cx);
        fLine.reel.spool.set(si.cx + Math.cos(ang) * si.r, si.cy + Math.sin(ang) * si.r, clamp(rl.z, si.z0 + 0.001, si.z1 - 0.001)); u.spool.localToWorld(fLine.reel.spool);
        // (the spool's front: the end towards the butt ring)
        if (si.front == null) { const zA = u.spool.localToWorld(flT.set(si.cx, si.cy, si.z1)).distanceTo(fLine.rings[0].c), zB = u.spool.localToWorld(flT.set(si.cx, si.cy, si.z0)).distanceTo(fLine.rings[0].c); si.front = zA < zB ? si.z1 : si.z0; }
        fLine.reel.lip.set(si.cx, si.cy, si.front); u.spool.localToWorld(fLine.reel.lip);
        fLine.reel.lipR = si.r * flT.setFromMatrixScale(u.spool.matrixWorld).x;
      } else { fLine.reel.spool.copy(fLine.reel.roller); fLine.reel.lip.copy(fLine.reel.roller); }
      fLine.reel.bail = u.bailK ?? 0;
    } else {
      // (the simple rod, until the modelled one has loaded)
      const lr = seat.p.clone().add(new THREE.Vector3(0, -0.072, 0.06).multiplyScalar(R.reel).applyQuaternion(reel.quaternion)).applyMatrix4(RM);
      fLine.reel.roller.copy(lr); fLine.reel.spool.copy(lr); fLine.reel.lip.copy(lr); fLine.reel.bail = 0;
      guides.forEach((gd, i) => {
        const a = along(gd.s * R.len);
        const r = fLine.rings[i]; r.c.copy(a.p).add(new THREE.Vector3(0, -(gd.r * 1.35 + 0.006), 0).applyQuaternion(gd.g.quaternion)).applyMatrix4(RM); r.ax.copy(a.t).transformDirection(RM); r.r = gd.r * rsc;
      });
      fLine.tip.c.copy(pts[NSEG]).applyMatrix4(RM); fLine.tip.ax.copy(pts[NSEG]).sub(pts[NSEG - 1]).transformDirection(RM); fLine.tip.r = 0.002;
    }
    // the line: to the fish's own mouth wherever it's been posed (in the net, at the surface), so the two never part;
    // to the rig in the cast and while you wait. How much is out, and how slack, follows what you're doing (fishLine.js)
    {
      const freeEnd = showLine && !rigAt && ph === "cast" && age < 0.85;
      const end = flE;
      if (rigAt) end.copy(rigAt); else end.copy(fLine.tip.c).y -= 1.2;
      if (fish.visible && (ph === "hooked" || ph === "landing")) end.copy(fish.position);
      if (rigAt && (ph === "waiting" || ph === "bite" || ph === "missed" || (ph === "cast" && age > 2.15))) end.y = wh(end.x, end.z) - (floatRig ? 0.02 : 0);
      // the reel's handle: line wound in, for the glints running through the rings (a spool of 54 mm, about 5.2 turns of
      // the bail arm to one of the handle: 0.9 m a turn)
      const spNow = reel.userData.spin || 0, dSp = spinWas == null ? 0 : spNow - spinWas; spinWas = spNow;
      const wound = Math.max(0, dSp) / (Math.PI * 2) * 0.9, windRate = wound / Math.max(1e-3, dt);
      const tk = clamp(P.tension ?? load, 0, 1.4);
      let excess = 0.0015, payout = false, retrieve = 2.5, give = 60, rodSag = 0;
      if (ph === "cast") { if (age < 2.25) { payout = true; excess = age < 2.15 ? 0.015 : 0.02; } else { retrieve = 3.5; } } // (the bail's open until 2.25 s: then the slack's wound in)
      else if (ph === "waiting" || ph === "missed") { excess = ph === "missed" ? 0.004 : 0.0015; rodSag = 0.6; }
      else if (ph === "bite") { excess = 0.0005; retrieve = 4; }
      else if (ph === "hooked") { const sl = 1 - clamp(tk / 0.9, 0, 1); excess = 0.0025 * sl * sl; retrieve = 0.5 + windRate * 1.1; } // (a fish running at you outpaces the reel: the line bellies until you wind down to it)
      else if (ph === "landing") { excess = 0.0008; retrieve = 8; }
      else if (ph === "lost") { excess = 0.004; retrieve = 6; } // (the hook out: the line wound back in, slack)
      // the drop of a cast: the lead swinging under the tip in the wind-up; released, it flies from where it was
      if (freeEnd) dropHad = true;
      else if (dropHad && ph === "cast" && age < 1.05 && rigAt) { const k = ease(seg(age, 0.85, 1.05)); rigAt.lerpVectors(dropAt, rigAt, k); end.copy(rigAt); }
      else dropHad = false;
      flWind[0] = (env.windDir?.[0] || 0) * (env.wind || 0) * 2.4; flWind[1] = (env.windDir?.[1] || 0) * (env.wind || 0) * 2.4;
      flCur[0] = (env.windDir?.[0] || 0) * 0.08; flCur[1] = (env.windDir?.[1] || 0) * 0.08;
      const o = flO; o.dt = dt; o.t = t; o.show = showLine; o.end = freeEnd ? null : end; o.freeEnd = freeEnd; o.drop = 1.25; o.excess = excess; o.payout = payout; o.retrieve = retrieve; o.give = give; o.wound = wound;
      o.tension = ph === "hooked" ? tk : ph === "landing" ? 0.6 : 0; o.wind = flWind; o.current = flCur; o.waterY = freeEnd ? null : wh(end.x, end.z); o.rodSag = rodSag;
      fLine.update(o); // (one options object, reused: nothing made afresh each frame)
      if (freeEnd) dropAt.copy(fLine.endPos);
      if (showLine) {
        rig.position.copy(freeEnd ? fLine.endPos : end);
        if (floatRig && (ph === "waiting" || ph === "bite" || ph === "missed")) { rig.position.y = wh(end.x, end.z) + (ph === "bite" ? -Math.max(0, Math.sin(age * 6)) * 0.08 : 0); }
        rig.visible = !(ph === "hooked" || ph === "landing");
      } else rig.visible = false;
      if (local && typeof window !== "undefined" && FILM) window.__fdLineProbe = { pts: fLine.points(), contacts: fLine.contacts(), rings: fLine.rings.map((r) => [...r.c.toArray(), r.r, ...r.ax.toArray()]), tip: [...fLine.tip.c.toArray(), fLine.tip.r], spool: fLine.reel.spool.toArray(), roller: fLine.reel.roller.toArray(), lip: fLine.reel.lip.toArray(), bail: fLine.reel.bail, seg: fLine.segment(), L: fLine.length, end: end.toArray(), freeEnd, ph, age };
    }
    // (once it's been laid out the mat stays on the deck until the next cast: it used to vanish the moment the fish was
    // gone)
    if (matOn) matOut = true;
    mat.visible = matOn || (matOut && !walking);
    if (mat.visible) { mat.position.copy(toWorld(matAtL())); mat.rotation.y = root.rotation.y; }
    net.visible = netOn && !!netAt; pole.visible = net.visible && (tech === "net" || releasePole); ropes.forEach((r) => (r.visible = net.visible && !netIdle && (tech === "dropnet" || ropesOn)));
    if (net.visible) {
      net.position.copy(netAt);
      if ((tech === "net" || releasePole) && poleFrom) between(pole, poleFrom, netAt, 1);
      if (tech === "dropnet" && !netIdle) {
        // three bridles from the hoop to the knot; from the knot the rope goes up over the top rail to your hands and
        // on to its coil on the deck (while the net hangs), or lies from the knot to the coil (the net on the deck or in
        // your hands): never a net without its rope
        const knot = netAt.clone().add(new THREE.Vector3(0, 0.72 * net.scale.x * (1 - netRest * 0.8), 0));
        ropes.forEach((r, i) => { if (i > 2) return; const a = (i / 3) * Math.PI * 2; between(r, knot, netAt.clone().add(new THREE.Vector3(Math.cos(a) * 0.35 * net.scale.x, 0, Math.sin(a) * 0.35 * net.scale.x)), 1); });
        const coil = dropRig?.coil || toWorld(new THREE.Vector3(-0.42, 0.02, 0.18));
        if (dropRig?.hanging) {
          fig.group.updateMatrixWorld(true);
          const hw = [0, 1].map((i) => { if (fp) return toWorld(handsNow[i]); const h = fig.hand(i); return h ? fig.group.localToWorld(h) : toWorld(handsNow[i]); }); // (in first person, through the hands you see on it)
          const hm = hw[0].clone().lerp(hw[1], 0.5);
          if (fpRope) { const lo = hw[0].y < hw[1].y ? hw[0] : hw[1], hi = lo === hw[0] ? hw[1] : hw[0]; between(ropes[3], hi, lo, 1); between(ropes[4], lo, knot, 1); between(ropes[5], hi, coil, 1); } // (first person, leaning out over the rail: through both hands and straight down to the net)
          else { between(ropes[3], hm, dropRig.railPt, 1); between(ropes[4], dropRig.railPt, knot, 1); between(ropes[5], hm, coil, 1); }
        } else { between(ropes[3], knot, coil, 1); ropes[4].visible = false; ropes[5].visible = false; }
      }
    }
    prevAge = age;
    // test diagnostics only (FILM, never in the app): where the reel, its handle and your hands are this frame
    if (local && typeof window !== "undefined" && FILM) { fig.group.updateMatrixWorld(true); window.__fdProbe = { seat: toWorld(seat.p).toArray(), reelQ: reel.getWorldQuaternion(new THREE.Quaternion()).toArray(), knob: toWorld(knob).toArray(), hands: fp && fpv ? fpv.wrists.map((w) => (w ? toWorld(w).toArray() : null)) : [0, 1].map((i) => { const h = fig.hand(i); return h ? fig.group.localToWorld(h).toArray() : null; }), spin: reel.userData.spin || 0, fp, fish: fish.visible ? fish.position.toArray().map((v) => +v.toFixed(2)) : null, water: fish.visible ? +wh(fish.position.x, fish.position.z).toFixed(2) : null, fishEnds: fish.visible ? [fish.position.toArray(), fish.position.clone().addScaledVector(fBase, fishLen).toArray()] : null, net: net.visible && !netIdle ? net.position.toArray() : null, head: fig.eyeAt ? fig.group.localToWorld(fig.eyeAt.clone()).toArray() : null, feet: root.position.toArray(), stage: releaseInfo ? 'r-' + releaseInfo.stage : landStage || ph, kept: kept?.state || null, rod: pts.map((p) => toWorld(p).toArray()), lean: +leanNow.toFixed(2), stoop: +stoopNow.toFixed(2), edge: +edge.toFixed(2) }; }
    const eyeNow = fpEye(); // (the eye the rod and your body were placed from this frame: the camera uses the same one)
    // (letting the drop net down and hauling it up, you lean right out over the rail, your head past the wall's top: from
    // behind the rail the edge hides the foot of the wall, where the net and the fish are)
    const overWall = fpRope;
    const netNear = fp && ph === "landing" && (landStage === "pick" || landStage === "in" || landStage === "rod");
    // (putting it back, the same: the net lifted out over the rail, and the empty one hauled back over it, with you
    // stepped back from the rail so the hoop passes at arm's length rather than across your face)
    const netOverRail = fp && kept?.state === "release" && venue === "pier" && (relStep === "over" || (relStep === "haul" && !!releaseInfo?.over));
    const leanTo = netOverRail ? -0.32 : overWall ? clamp(edge + 0.15, 0, 1.2) : fp && ph === "landing" && (landStage === "in" || (landStage === "haul" && netAt && toLocal(netAt).y > 0.35) || ((landStage === "pick" || landStage === "lower") && netAt && toLocal(netAt).y > 0.45)) ? -0.32 /* (swinging the net in over the rail you step back from it: leaning in, the hoop came over at eye height a hand's length from your face and the camera ended up inside the net) */ : netNear ? 0.15 : fp && (ph === "landing" ? age < LT.card + 0.5 : ph === "hooked" && age > 3) ? clamp(edge - 0.35, 0, 0.7) : 0;
    leanNow += (leanTo - leanNow) * (1 - Math.exp(-dt * (leanTo < 0 ? 5 : 2.5)));
    { const k = 55, c = 2 * Math.sqrt(k) * 0.75, h = Math.min(dt, 0.05), to = fp ? bodyTo : { x: 0, y: 0, z: 0 };
      for (const a of ["x", "y", "z"]) { const v = "v" + a; body[v] += (k * (to[a] - body[a]) - c * body[v]) * h; body[a] += body[v] * h; } }
    // (first person, picking the fish or the net up off the deck to look at it or put it back: you stoop to the deck and
    // step towards it, as when landing. Standing still, the hands' targets were a metre and more from the shoulders and
    // the arms were drawn that long, sleeves straight across the view: the 8 November recording at 48 s)
    const lowH = fp && (kept?.state === "release" || kept?.state === "inspect") && handsNow ? Math.min(handsNow[0].y, handsNow[1].y) : 9;
    // (not with the rope in your hands: those are placed from your eye, so stooping lowered them and they the eye, down to the deck)
    const deckReach = lowH < 0.85 && !ropeHeld, reachX = deckReach ? (handsNow[0].x + handsNow[1].x) / 2 : 0;
    { const st = deckReach ? clamp((0.85 - lowH) * 1.1, 0, 1) : fp && ph === "landing" && (landStage === "pick" || landStage === "in") ? fpCrouch : 0; stoopNow += (st - stoopNow) * (1 - Math.exp(-dt * 3));
      // (and a step to the side, to the net on the deck by your left foot: you go to it, rather than an arm reaching a
      // metre across to it; back again for the rope)
      const sx = deckReach ? clamp(reachX * 0.6, -0.6, 0.6) : fp && ph === "landing" && (landStage === "pick" || landStage === "in" || landStage === "rod") && netAt ? clamp(toLocal(netAt).x * 0.4, -0.5, 0) : 0; stepNow += (sx - stepNow) * (1 - Math.exp(-dt * 2.2)); }
    return { phase: ph, tech, age, info, land: ph === "landing" && age < LT.end + 0.4 ? { net: netOn && !netIdle && netAt ? netAt.clone() : null, fish: rigAt ? rigAt.clone() : null, stage: landStage, end: LT.end, edge, water: dropRig?.waterY ?? landWater } : null, tip: toWorld(pts[NSEG]), rig: rigAt ? rigAt.clone() : null, fishAt: fish.visible ? fish.position.clone() : null, eye: toWorld(fp ? eyeNow : new THREE.Vector3(0, 1.62 - leanNow * 0.25, -0.05 - leanNow)), at: walking ? root.position.clone() : at.clone(), face: walking ? walking.face : face, walking: !!walking, cast: castAt.clone(), near: nearAt.clone(), edge, landed: ph === "landing" && age >= LT.card, jump: jumpWatch ? jumpAt : null, kept: kept?.state || null, release: releaseInfo ? { ...releaseInfo, edge } : null, keptAt: kept && fish.visible ? (keptPose?.centre || fish.position.clone().addScaledVector(fBase, fishLen * 0.5)) : null };
  }
  // first person: the eye is in your own head (just in front of it), so leaning out over the rail takes your eye, your
  // shoulders and your arms together, and your hands still reach the rod
  // (one place, worked out the same way every frame and before anything is posed: the camera and the rod in your hands
  // both hang off it, so they can never be a frame apart. Your eye height is taken from your body while you stand in
  // third person; leaning out over the rail takes the eye forward and a little down; a slow breath)
  // where the reel sits in your view (right, up, forward of the eye, metres): low and a little right of the middle, far
  // enough out that both hands and the reel's handle going round are in the picture above the controls (it was lower
  // and nearer: the reel hand was half under the Reel button)
  const FPR = (typeof window !== "undefined" && FILM && window.__fdFpr) || { x: 0.07, y: -0.1, z: 0.54 };
  function fpEye() { return new THREE.Vector3(stepNow + body.x, eyeH - leanNow * 0.25 - stoopNow * 0.55 + Math.sin(tNow * 1.4) * 0.006 + body.y, -0.08 - leanNow * 0.85 - stoopNow * 0.12 + body.z); } // (stooping: down to the net on the deck, rather than an arm stretched a metre to it)
  // the reel's handle for your taps (reelHandle.js)
  // ---- the reel's handle ----
  // for your taps (reelHandle.js). Something else may have turned it since (winding a fish up to land it): the follow
  // takes up from where the handle really is, and never winds back to make up for it. Each half turn the handle
  // actually makes clicks (the gears' pawl), so the clicks keep time with the handle you see, not with your taps
  function crank(turns, dt, audible = false) {
    const u = reel.userData, sp = u.spin || 0;
    if (u.hs && Math.abs(u.hs.angle - sp) > 1e-6) { const tgt = (u.hs.last ?? 0) * Math.PI * 2 + (u.hs.base ?? 0); u.hs = { ...u.hs, angle: sp, v: 0, base: (u.hs.base ?? 0) + Math.max(0, sp - tgt) }; }
    u.hs = stepHandle(u.hs || handleState(sp), turns, dt); u.spin = u.hs.angle;
    handleClicks(sp, u.spin, audible);
  }
  function handleClicks(a0, a1, audible) {
    if (!audible || halfTurnsPassed(a0, a1) < 1) return;
    // (one click however far it went in a frame, quieter as it spins faster: a whirr, not a machine gun)
    onSound?.("reelTap", at, { speed: clamp(Math.abs(reel.userData.hs?.v || 0) / 25, 0, 1) });
    if (typeof window !== "undefined" && FILM && window.__fdSoundLog) window.__fdSoundLog.push({ s: "click", a: +a1.toFixed(3), t: +tNow.toFixed(3) });
  }
  function tipWorld() { root.updateMatrixWorld(true); return toWorld(pts[NSEG]); }

  return {
    id, root,
    get local() { return local; },
    /** your line: "out" in the water, "hooked" with a fish on, or "in" (wound in, landed or lost) */
    get line() { return lineState(events); },
    setEvents(list) { const before = events; events = list || []; if (events.length !== before.length) castFromEvents(); },
    setFight(f) { fightIn = f ? { ...f, at: performance.now() } : null; },
    /** where the camera looks (world yaw, pitch): your rod in first person follows the view */
    setView(yaw, pitch) { viewIn = { yaw, pitch }; },
    setHint(h) { hintFish = h || null; },
    setName(n) { const old = tag; const s = label(n || "Angler", local ? "#7ee8de" : "#ffffff"); s.position.copy(old.position); s.visible = old.visible; root.remove(old); old.material.map.dispose(); old.material.dispose(); root.add(s); tag = s; },
    place,
    /** Walking about (walker.js state, world coordinates), or null to stand at the spot again. */
    setWalk(w) {
      if (w) { walking = w; root.position.set(w.x, w.y, w.z); root.rotation.y = -w.face; feetShadow.visible = !fp && !w.air; }
      else if (walking) { walking = null; place(curSpot); feetShadow.visible = !fp; }
    },
    setSpeaking(on) { speaking = !!on; },
    /** Wave, cheer or clap (Fish Together). Only free hands join in: not while fighting a fish. */
    emote(kind) { if (EMOTE_S[kind]) emoting = { kind, t0: null }; },
    get walking() { return !!walking; },
    /** The landed fish, until you decide: "deck" (in the net or on the deck), "inspect" (held up), "release", "gone". */
    keepFish(state) { kept = state ? { state, t0: null } : null; }, // (its clock starts at the next frame)
    get kept() { return kept?.state || null; },
    get fishMesh() { return fish; },
    get spot() { return curSpot; },
    // first person: your own head, body and arms would fill the view, so only your hands show, on the rod
    setFirstPerson(on) {
      if (fp === !!on) return; fp = !!on; fig.setFirstPerson(fp); tag.visible = !on && !tagOff; feetShadow.visible = !fp && !walking?.air;
      if (fp && !fpv) { const L = fig.look || {}; fpv = createFpHands({ gloves: !!L.gloves, skinHex: SKINS[L.skin]?.hex ?? 0xc99a74, coatHex: COATS[L.coat]?.hex ?? O?.jacket ?? 0x2f3a48 }); fpv.group.name = "fdNoReflect"; root.add(fpv.group); }
      fpv?.show(fp);
    },
    /** the name label over their head (hidden for your own angler in the landing shot) */
    showTag(on) { tagOff = !on; },
    onSplash(f) { splashCb = f; }, onRipple(f) { rippleCb = f; },
    frame,
    real,
    dispose() { world.remove(root, kit, line, rig, fish, net, pole, mat, ...ropes); mat.traverse((o) => o.geometry?.dispose?.()); fig.dispose(); fpv?.dispose(); kit.traverse((o) => o.geometry?.dispose?.()); root.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
