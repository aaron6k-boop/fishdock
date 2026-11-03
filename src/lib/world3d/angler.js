// ---- angler: one person fishing in the 3D view: body, clothes, rod, reel, line, rig, the fish and the net ----
// Everything moves from the angler's own events (cast, bite, hooked, catch, lost, missed) and their times, so a
// remote angler animates the same on every phone, and a viewer who joins midway sees the right moment. Timings,
// bites, fights and landings are the same rules as the photo scene (sceneActors.js): biteTaps, fightProfile,
// fishLoad, landingTech and landingTimes.
import * as THREE from "three";
import { phaseAt, DUR, lineState } from "../liveEvents.js";
import { biteTaps, fightProfile, fightStyle, fishLoad, landingTimes, landingTech } from "../sceneActors.js";
import { fishShape, buildFishMesh, bodyWidth } from "../fish3d.js";
import { hasArt, artUrl } from "../../data/fishart.js";
import { castPoint, dirOf } from "./spots.js";
import { createPerson } from "./human3d.js";
import { lookFor, SKINS, COATS } from "./people.js";
import { createFpHands } from "./fpHands.js";
import { loadPart, fitReel, fitNet } from "./glbParts.js";
import { stepHandle, handleState } from "../reelHandle.js";

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
  beach: { name: "Beachcaster", len: 4.2, col: 0xd6a63c, flex: 0.78, r0: 0.0125, r1: 0.0026, seat: 0.68, g0: 0.028, reel: 1.3,
    handle: [[0, 0.03, 0.018, "seat"], [0.03, 0.62, 0.0165, "grip"], [0.62, 0.74, 0.014, "seat"], [0.74, 0.92, 0.0155, "grip"], [0.92, 0.95, 0.013, "seat"]], guides: [0.36, 0.5, 0.62, 0.72, 0.81, 0.88, 0.94, 0.98] },
  pier: { name: "Pier rod", len: 3.6, col: 0x2870ec, flex: 1, r0: 0.0108, r1: 0.0022, seat: 0.45, g0: 0.021, reel: 1,
    handle: [[0, 0.02, 0.016, "seat"], [0.02, 0.4, 0.0152, "grip"], [0.4, 0.5, 0.0128, "seat"], [0.5, 0.66, 0.0142, "grip"], [0.66, 0.69, 0.0122, "seat"]], guides: [0.25, 0.37, 0.49, 0.6, 0.7, 0.8, 0.89, 0.96] },
  estuary: { name: "Spinning rod", len: 3.0, col: 0x2870ec, flex: 1.05, r0: 0.0098, r1: 0.002, seat: 0.35, g0: 0.02, reel: 0.9,
    handle: [[0, 0.02, 0.015, "seat"], [0.02, 0.3, 0.0145, "cork"], [0.3, 0.4, 0.0125, "seat"], [0.4, 0.52, 0.0138, "cork"], [0.52, 0.55, 0.012, "seat"]], guides: [0.2, 0.33, 0.45, 0.57, 0.68, 0.78, 0.87, 0.95] },
  river: { name: "Float rod", len: 3.9, col: 0xd63434, flex: 1.35, r0: 0.0085, r1: 0.0015, seat: 0.29, g0: 0.012, reel: 0.8,
    handle: [[0, 0.02, 0.014, "seat"], [0.02, 0.25, 0.0135, "cork"], [0.25, 0.33, 0.012, "seat"], [0.33, 0.55, 0.013, "cork"], [0.55, 0.57, 0.0115, "seat"]], guides: [0.17, 0.24, 0.31, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73, 0.8, 0.87, 0.93, 0.98] },
  lake: { name: "Feeder rod", len: 3.6, col: 0x2ea060, flex: 1.15, r0: 0.0095, r1: 0.0018, seat: 0.4, g0: 0.018, reel: 1, tip: { from: 0.86, col: 0xff4a2a },
    handle: [[0, 0.02, 0.015, "seat"], [0.02, 0.35, 0.0142, "grip"], [0.35, 0.45, 0.0125, "seat"], [0.45, 0.58, 0.0135, "grip"], [0.58, 0.61, 0.012, "seat"]], guides: [0.22, 0.34, 0.46, 0.57, 0.67, 0.76, 0.84, 0.9, 0.95, 0.985] },
};
export const rodFor = (venue) => ROD[venue] || ROD.pier;

// ---- the water's height, the same big waves as the shader, so floats and fish ride them ----
export function waveHeight(x, z, t, { swell = 0.3, wind = 0.3, windDir = [0.3, -1], kind = 0 } = {}) {
  const sea = kind < 0.5 ? 1 : kind < 1.5 ? 0.5 : 0;
  const wl = Math.hypot(windDir[0], windDir[1]) || 1, wd = [windDir[0] / wl, windDir[1] / wl], wx = [-wd[1], wd[0]];
  const w = (dx, dz, f, a, s) => { const l = Math.hypot(dx, dz); return a * Math.sin(((x * dx + z * dz) / l) * f + t * s); };
  return w(0.2, -1, 0.09, (0.18 + 0.55 * swell) * sea, 0.9) + w(-0.35, -1, 0.14, (0.1 + 0.3 * swell) * sea, 1.15)
    + w(wd[0] + wx[0] * 0.3, wd[1] + wx[1] * 0.3, 0.45, 0.05 + 0.14 * wind, 1.9) + w(wd[0] - wx[0] * 0.4, wd[1] - wx[1] * 0.4, 0.7, 0.03 + 0.08 * wind, 2.4);
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

// ---- the skin of a fish without a FishDock picture (the freshwater species): drawn from its known colouring, darker
// on the back and pale on the belly (as every fish is), with its markings: a pike's pale spots, a trout's dark spots,
// a perch-like zander's bars, the red fins of a roach or rudd. The canvas runs head (left) to tail, round the body from
// the back (top), down one side to the belly (middle) and up the other side ----
const FISH_SKINS = {
  carp: { back: [74, 62, 30], side: [168, 132, 60], belly: [226, 204, 150], scales: 0.5 }, "crucian-carp": { back: [70, 62, 28], side: [170, 140, 62], belly: [222, 200, 140], scales: 0.45 },
  roach: { back: [62, 78, 84], side: [196, 202, 204], belly: [236, 236, 232], fin: [196, 70, 50], scales: 0.3 }, rudd: { back: [86, 82, 52], side: [204, 180, 110], belly: [236, 226, 196], fin: [214, 64, 40], scales: 0.3 },
  bream: { back: [62, 58, 46], side: [150, 136, 104], belly: [210, 200, 180], scales: 0.35 }, tench: { back: [44, 58, 30], side: [96, 112, 52], belly: [170, 164, 90], scales: 0.1 },
  pike: { back: [44, 62, 36], side: [96, 116, 60], belly: [222, 218, 190], spots: [214, 206, 150], spotN: 70 }, zander: { back: [60, 70, 66], side: [150, 156, 150], belly: [230, 230, 222], bars: 8 },
  barbel: { back: [86, 74, 50], side: [160, 140, 96], belly: [220, 206, 170], scales: 0.2 }, chub: { back: [56, 62, 60], side: [176, 172, 158], belly: [228, 224, 214], scales: 0.45 },
  dace: { back: [70, 80, 86], side: [200, 204, 206], belly: [238, 238, 236], scales: 0.25 }, ide: { back: [60, 66, 70], side: [184, 180, 170], belly: [232, 230, 222], fin: [200, 96, 60], scales: 0.3 },
  gudgeon: { back: [92, 86, 64], side: [168, 160, 130], belly: [222, 216, 196], blotch: 7 }, grayling: { back: [70, 74, 82], side: [160, 162, 170], belly: [222, 222, 226], spotN: 18, spots: [40, 40, 44] },
  "brown-trout": { back: [70, 64, 36], side: [176, 150, 90], belly: [232, 220, 180], spots: [60, 40, 26], spotN: 60, red: true }, "rainbow-trout": { back: [56, 76, 64], side: [190, 190, 180], belly: [236, 234, 226], spots: [40, 40, 36], spotN: 90, band: [200, 110, 120] },
  salmon: { back: [52, 66, 80], side: [202, 206, 210], belly: [240, 240, 238], spots: [36, 40, 46], spotN: 22 }, "sea-trout": { back: [58, 70, 82], side: [200, 204, 206], belly: [240, 240, 236], spots: [40, 44, 50], spotN: 30 },
  "wels-catfish": { back: [46, 48, 40], side: [92, 92, 74], belly: [196, 190, 170], blotch: 14 },
};
function fishSkin(species) {
  const S = FISH_SKINS[species]; if (!S || typeof document === "undefined") return null;
  const W = 256, H = 128, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const img = g.createImageData(W, H), mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  let seed = 7; for (const ch of species) seed = (seed * 31 + ch.charCodeAt(0)) % 9973; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / H, u = x / W, up = Math.cos(v * Math.PI * 2); // 1 on the back, -1 at the belly
    let col = up > 0 ? mix(S.side, S.back, Math.pow(up, 0.8)) : mix(S.side, S.belly, Math.pow(-up, 0.7));
    if (S.scales) { const sx = (u * 60 + (Math.floor(v * 40) % 2) * 0.5) % 1, sy = (v * 40) % 1; const e = Math.min(1, Math.hypot(sx - 0.5, sy - 0.5) * 2); col = col.map((c0) => c0 * (1 - S.scales * 0.18 * e * e)); }
    if (S.bars) { const b = Math.max(0, Math.sin(u * Math.PI * S.bars)) ** 4 * Math.max(0, up + 0.2); col = mix(col, S.back, b * 0.6); }
    if (S.band) { const bd = Math.exp(-((Math.abs(up) - 0.1) ** 2) / 0.02); col = mix(col, S.band, bd * 0.5); }
    if (S.fin && u > 0.82) col = mix(col, S.fin, 0.55);
    const k = (y * W + x) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const dots = (n, rgb, r0, r1, onBelly = false) => { g.fillStyle = `rgb(${rgb.join(",")})`; for (let i = 0; i < n; i++) { const x = 25 + rnd() * (W - 60), y = rnd() * H, up = Math.cos((y / H) * Math.PI * 2); if (!onBelly && up < -0.3) continue; g.beginPath(); g.ellipse(x, y, r0 + rnd() * (r1 - r0), (r0 + rnd() * (r1 - r0)) * 0.8, 0, 0, Math.PI * 2); g.fill(); } };
  if (S.spots) dots(S.spotN, S.spots, 1.4, species === "pike" ? 3.2 : 2.4);
  if (S.red) dots(18, [176, 40, 30], 1.2, 2);
  if (S.blotch) dots(S.blotch * 4, S.back, 3, 7);
  // the eye, near the head on each side (a quarter and three quarters of the way round)
  for (const y of [H * 0.25, H * 0.75]) { g.fillStyle = "#e9e2c8"; g.beginPath(); g.arc(W * 0.06, y, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = "#101010"; g.beginPath(); g.arc(W * 0.06, y, 2.4, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createAngler(world, { id, name = "", spot, venue = "pier", outfit = 0, look = null, local = false, real = false, rail = false, onSound, onFeel } = {}) {
  const root = new THREE.Group(); world.add(root);
  const O = OUTFITS[((outfit % OUTFITS.length) + OUTFITS.length) % OUTFITS.length];
  // the person (human3d.js: a realistic person, with the simple figure3d.js figure standing in while it loads): their
  // own look if they chose one, otherwise a steady one from their id
  const fig = createPerson({ id, look: lookFor(id, look), outfit: O, venue }); root.add(fig.group);
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
  const NSEG = 16;
  const mCork = new THREE.MeshStandardMaterial({ color: 0xc49a62, roughness: 0.9 });
  // a feeder rod's quiver tip: the last part of the blank painted bright, so bites show
  const mTip = R.tip ? new THREE.MeshStandardMaterial({ color: R.tip.col, roughness: 0.4, emissive: R.tip.col, emissiveIntensity: 0.15 }) : null;
  const rodSegs = Array.from({ length: NSEG }, (_, i) => { const m = new THREE.Mesh(unitCyl, mTip && (i + 0.5) / NSEG >= R.tip.from ? mTip : mBlank); m.castShadow = true; root.add(m); return { m, r: lerp(R.r0, R.r1, (i / (NSEG - 1)) ** 0.8) }; });
  const PART = { seat: mSeat, grip: mGrip, cork: mCork };
  const handleParts = R.handle.map(([a, b, r, part]) => { const m = new THREE.Mesh(unitCyl, PART[part]); m.castShadow = true; root.add(m); return { m, a, b, r }; });
  const GUIDES = R.guides;
  const guides = GUIDES.map((s, i) => {
    const r = lerp(R.g0, Math.min(R.g0, 0.0045), i / (GUIDES.length - 1)), g = new THREE.Group(); root.add(g);
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
  // the reel modelled in Blender (public/models/reel.glb), in place of the simple one once it has loaded
  loadPart("reel").then((sc) => fitReel(reel, sc)).catch(() => {});
  // the line from the spool up through the rings to the tip
  const guideLinePos = new Float32Array((GUIDES.length + 2) * 3), guideLineGeo = new THREE.BufferGeometry(); guideLineGeo.setAttribute("position", new THREE.BufferAttribute(guideLinePos, 3));
  const guideLine = new THREE.Line(guideLineGeo, new THREE.LineBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.7 })); guideLine.frustumCulled = false; root.add(guideLine);
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
  // tackle box and bucket beside them
  // (they stay at the spot when you walk off)
  const kit = new THREE.Group(); world.add(kit);
  // a seat box (the tackle box sea anglers sit on): moulded base, a lighter lid with rounded edges, a carry handle on
  // metal posts, two catches; and a bait bucket: tapered plastic with a rolled rim, a wire handle and a snap-on lid
  {
    const mBox = new THREE.MeshStandardMaterial({ color: 0x24402e, roughness: 0.55 }), mLid = new THREE.MeshStandardMaterial({ color: 0x31573f, roughness: 0.5 });
    const mBlack = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: 0.6 }), mSteel = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.3, metalness: 0.85 });
    const box = new THREE.Group(); box.position.set(-0.55, 0, 0.25); kit.add(box);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.27, 0.31, 2, 2, 2), mBox); base.position.y = 0.135; box.add(base);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1), mLid); lid.scale.set(0.235, 0.05, 0.16); lid.position.y = 0.295; box.add(lid);
    const lidTop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.28), mLid); lidTop.position.y = 0.295; box.add(lidTop);
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), mSteel); post.position.set(sx * 0.13, 0.35, 0); box.add(post);
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.012), mSteel); clip.position.set(sx * 0.14, 0.255, -0.158); box.add(clip); }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.28, 10), mBlack); grip.rotation.z = Math.PI / 2; grip.position.set(0, 0.385, 0); box.add(grip);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.025, 0.32), mBlack); strap.position.y = 0.06; box.add(strap);
    const mBucket = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.45 }), mBlue = new THREE.MeshStandardMaterial({ color: 0x2e5a8c, roughness: 0.5 });
    const bk = new THREE.Group(); bk.position.set(-0.32, 0, 0.64); kit.add(bk);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.28, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.45, side: THREE.DoubleSide })); body.position.y = 0.14; bk.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), mBucket); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.004; bk.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.008, 6, 28), mBucket); rim.rotation.x = Math.PI / 2; rim.position.y = 0.28; bk.add(rim);
    const lidB = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.136, 0.018, 24), mBlue); lidB.position.y = 0.29; bk.add(lidB);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.003, 4, 20, Math.PI), mSteel); wire.position.y = 0.27; wire.rotation.y = 0.5; bk.add(wire);
    for (const o of [box, bk]) o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }
  // a landing net (rivers, lakes, estuaries) or a drop net with ropes (piers)
  // the net: knotted mesh you can see through (a drawn diamond pattern), hanging as a soft bag under a metal hoop
  const mNet = new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 1, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, map: netTexture(), depthWrite: false });
  const net = new THREE.Group(); world.add(net); net.visible = false;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.015, 6, 24), mMetal); hoop.rotation.x = Math.PI / 2; net.add(hoop);
  const bagGeo = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return new THREE.Vector2(0.35 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.15 * u) + 0.02, -0.5 * u); }), 18);
  let bag = new THREE.Mesh(bagGeo, mNet); net.add(bag);
  // the nets modelled in Blender (public/models/nets.glb): a drop net at a pier, a landing net elsewhere
  loadPart("nets").then((sc) => { const b = fitNet(net, sc, venue === "pier" ? "drop" : "landing"); if (b) bag = b; }).catch(() => {});
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), mMetal); world.add(pole); pole.visible = false;
  // an unhooking mat (a padded, wipe-clean mat: where a fish you'll put back is laid to be looked at and unhooked)
  const mat = new THREE.Group(); world.add(mat); mat.visible = false;
  const MAT_AT = new THREE.Vector3(0.05, 0, -0.62); // (where it's laid: in front of you)
  { const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.46), new THREE.MeshStandardMaterial({ color: 0x2f5a3c, roughness: 0.75 })); top.position.y = 0.022;
    const edgeM = new THREE.MeshStandardMaterial({ color: 0x1f2c24, roughness: 0.8 });
    for (const [w, d, x, z] of [[0.9, 0.05, 0, 0.235], [0.9, 0.05, 0, -0.235], [0.05, 0.5, 0.43, 0], [0.05, 0.5, -0.43, 0]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), edgeM); e.position.set(x, 0.025, z); mat.add(e); }
    mat.add(top); mat.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } }); }
  // the drop net's rope: thin braided polypropylene (a muted blue), and its three bridles to the hoop
  const mRope = new THREE.MeshStandardMaterial({ color: 0x3f5874, roughness: 0.9 });
  const ropes = [0, 1, 2, 3, 4, 5].map(() => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), mRope); world.add(r); r.visible = false; return r; });

  // ---- line, rig, fish: in the world ----
  const LN = 28, linePos = new Float32Array(LN * 3);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.8 })); line.frustumCulled = false; world.add(line);
  const floatRig = venue === "river" || venue === "lake";
  const rig = new THREE.Group(); world.add(rig);
  if (floatRig) { part(new THREE.CylinderGeometry(0.012, 0.02, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0x401000 }), 0, 0.06, 0, rig); part(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd83a }), 0, 0, 0, rig); }
  else part(new THREE.SphereGeometry(0.03, 8, 6), mMetal, 0, 0, 0, rig);
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c4, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide, alphaTest: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ roughness: 0.06, metalness: 0.0 }); // (a wet, glassy eye)
  let fishGeo = genericFishGeometry(), fishBase = fishGeo.attributes.position.array.slice();
  const fish = new THREE.Mesh(fishGeo, fishMat); fish.visible = false; fish.castShadow = true; world.add(fish);
  let fishFor = "", fishLen = 0.45, prof = fightProfile(null), load = 1, LT = landingTimes(null, 45, null, venue), tech = "lift";

  function setFish(species, lengthCm, weightKg) {
    const key = `${species}|${lengthCm}|${weightKg}`;
    if (key === fishFor) return; fishFor = key;
    prof = fightProfile(species); fishLen = clamp((lengthCm || 40) / 100, 0.12, 2);
    load = fishLoad(species, lengthCm, weightKg); LT = landingTimes(species, lengthCm, weightKg, venue); tech = landingTech(species, lengthCm, weightKg, venue);
    fish.material = fishMat; fish.geometry = fishGeo = genericFishGeometry(); fishBase = fishGeo.attributes.position.array.slice(); { const sk = hasArt(species) ? null : fishSkin(species); fishMat.map = sk; fishMat.color.set(sk ? 0xffffff : 0xb8c0c4); } fishMat.needsUpdate = true;
    if (species && hasArt(species)) {
      const img = new Image();
      img.onload = () => {
        if (fishFor !== key) return;
        try {
          const c = document.createElement("canvas"); c.width = 480; c.height = 320;
          const g = c.getContext("2d", { willReadFrequently: true });
          if (prof.headRight) { g.translate(480, 0); g.scale(-1, 1); }
          g.drawImage(img, 0, 0, 480, 320);
          const px = g.getImageData(0, 0, 480, 320).data, a = new Uint8Array(480 * 320);
          for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
          const shape = fishShape(a, 480, 320);
          if (!shape.ok) return;
          const m = buildFishMesh(shape, { width: bodyWidth(species), flat: prof.flat });
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(m.pos.slice(), 3));
          const uv = new Float32Array(m.uv.length); for (let i = 0; i < uv.length; i += 2) { uv[i] = m.uv[i]; uv[i + 1] = 1 - m.uv[i + 1]; }
          geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          geo.setIndex(new THREE.BufferAttribute(new Uint16Array([...m.idx, ...m.finIdx]), 1)); geo.computeVertexNormals();
          const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
          fish.geometry = fishGeo = geo; fishBase = geo.attributes.position.array.slice();
          fishMat.map = tex; fishMat.color.set(0xffffff); fishMat.needsUpdate = true; fish.material = fishMat;
          // the species modelled in Blender (fish.glb: a rounder body, a fuller belly, eyes standing proud), where there
          // is one: the same picture over it, the same bending
          if (MODELLED_FISH.has(species)) loadPart("fish").then((sc) => {
            if (fishFor !== key) return;
            const geoBlend = modelledFish(sc, species); if (!geoBlend) return;
            fish.geometry = fishGeo = geoBlend; fishBase = geoBlend.attributes.position.array.slice();
            eyeMat.map = tex; eyeMat.needsUpdate = true; fish.material = [fishMat, fishMat, eyeMat];
          }).catch(() => {});
        } catch { /* keep the generic fish */ }
      };
      img.src = artUrl(species, "s");
    }
  }
  // bend the fish along its body and place it: mouth at `at`, body along `dir` (a unit vector from head to tail)
  const fBase = new THREE.Vector3(), fishQ = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  function poseFish(at, dir, t, { beat = 1, curl = 0, roll = 0 } = {}) {
    const p = fishGeo.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) {
      const u = fishBase[i], y = fishBase[i + 1], z = fishBase[i + 2];
      const lat = (Math.sin(t * 9 * prof.tempo - u * 5) * 0.12 * beat * prof.flex + curl) * u * u;
      a[i] = u * fishLen; a[i + 1] = y * fishLen; a[i + 2] = z * fishLen + lat * fishLen;
    }
    p.needsUpdate = true; fishGeo.computeVertexNormals();
    // local x runs head to tail: point it along dir, keep "up" up, roll about the spine
    const x = fBase.copy(dir).normalize(); const up = Math.abs(x.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const zz = new THREE.Vector3().crossVectors(x, up).normalize(); const yy = new THREE.Vector3().crossVectors(zz, x);
    mtx.makeBasis(x, yy, zz); fishQ.setFromRotationMatrix(mtx);
    fish.quaternion.copy(fishQ); if (roll) fish.rotateX(roll);
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

  let lastKey = "", P = {}, seed = rng(1), splashCb = null, rippleCb = null, prevAge = 0, fightPos = null, landStart = null, hintFish = null;
  // the fish you've landed, until you decide: lying in the net (deck), held up for a look (inspect), going back in
  // (release), or kept (gone: the catch card shows it)
  let kept = null;
  let handsNow = [new THREE.Vector3(), new THREE.Vector3()]; // where the hands are (local), for the drop net's rope
  let walking = null; // walking about (walker.js): where, which way, how fast, the stride
  let tagOff = false;
  let landStage = null; // the drop net's stage while landing (for the hands): up | rod | pick | lower | lead | haul | in
  let dropRig = null, ropePull = null, releaseInfo = null, releaseRope = null, matOn = false, releasePole = false, prevKt = -1; // the drop net's rope: over the rail where, hanging or not; which hand is pulling and how far through the pull
  const rodS = { butt: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), key: "", until: 0, ok: false }; // the rod eased from one way of holding it to the next
  let fp = false, leanNow = 0, eyeH = 1.6, tNow = 0; // first person: the rod held where you can see it; leaning over the rail to land a fish
  const toWorld = (v) => v.clone().applyMatrix4(root.matrixWorld);
  const toLocal = (v) => root.worldToLocal(v.clone());
  const pts = Array.from({ length: NSEG + 1 }, () => new THREE.Vector3());

  function frame(t, now, dt, env) {
    root.updateMatrixWorld(true); tNow = t;
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
      const railZ = -Math.max(0.3, edge - 0.22), railY = 1.12, col = toWorld(new THREE.Vector3(-0.32, 0, -(edge + 0.25))), waterY = wh(col.x, col.z);
      const bridle = 0.72 * ns, top = railY - 0.05, sink = 0.02 * ns; // (the hoop right at the surface, breaking it: you see the net and the fish go over it)
      return { railZ, railY, col, waterY, bridle, top, sink, L: Math.max(0.5, top - waterY - bridle + sink), deck: toWorld(new THREE.Vector3(-(0.8 + 0.4 * ns), 0.05 + 0.18 * ns, -0.08)), railPt: toWorld(new THREE.Vector3(-0.32, railY + 0.02, railZ)), coil: toWorld(new THREE.Vector3(-0.42, 0.02, 0.18)), hangAt: (out) => { const k = col.clone(); k.y = top - out; return k; } };
    };

    // ---- what the rod is doing ----
    // poses are in the angler's own space: x right, y up, -z forward
    let held = true, pitch = 0.75, yawOff = 0.12, bendT = 0.03, tipT = 0, rigAt = null, slack = 0.4, showLine = true, showFish = false;
    let jumpWatch = false, jumpAt = null, netRest = 0; // netRest: 0 hanging, 1 set down on the deck (the bag flattens)
    let netOn = false, netAt = null, ropesOn = false, poleFrom = null, inNet = false;
    let fpE = 0.4, fpYaw = -0.03, fpView = null; // first person: the rod's angle up from level, and a little towards the middle
    landStage = null; dropRig = null; ropePull = null; releaseInfo = null; releaseRope = null; matOn = false; releasePole = false;
    const ph = info.phase;
    jumpWatch = false; jumpAt = null;
    if (ph === "idle" || ph === "ended" || ph === "paused") { held = false; showLine = false; }
    else if (ph === "cast") {
      // back over the shoulder, a fast forward sweep, the rig flies out, the rod settles and goes on its rest
      const back = ease(seg(age, 0, 0.6)), fwd = ease(seg(age, 0.6, 0.85));
      pitch = lerp(0.6, -0.55, back); pitch = lerp(pitch, 0.55, fwd); yawOff = 0.25 - fwd * 0.15;
      fpE = lerp(lerp(0.4, 1.45, back), 0.36, fwd); fpYaw = lerp(0.08, -0.03, fwd);
      bendT = age < 0.6 ? 0.05 : age < 0.9 ? 0.35 : 0.04;
      if (age < 0.85) showLine = false;
      else if (age < 2.15) { const f = (age - 0.85) / 1.3, tip = tipWorld(); rigAt = tip.clone().lerp(castAt, f); rigAt.y = lerp(tip.y, 0, f) + Math.sin(f * Math.PI) * (castAt.distanceTo(at) * 0.35); slack = 0.05; }
      else { rigAt = castAt.clone(); slack = clamp((age - 2.15) / 0.8, 0.05, 0.6); }
      if (crossed(0.75)) { onSound?.("whoosh", at); feel("release"); }
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
      const run = n1(age * 0.22 * prof.tempo * st.runSpeed + P.s1), surge = Math.max(0, Math.sin(age * 0.95 * prof.tempo + n1(age * 0.3 + P.s2) * 2.2)) ** 6;
      const f = castAt.clone().lerp(nearAt, pr * 0.85);
      const [dx, dz] = dirOf(face), side = [-dz, dx];
      const lateral = run * 8 * st.runWidth * (1 - pr * 0.6);
      f.x += side[0] * lateral; f.z += side[1] * lateral;
      f.y = -st.depth * (0.5 + 0.5 * Math.max(0, n1(age * 0.17 + P.s2))) * (1 - pr * 0.7);
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
      if (surgeNow > 0.6 && (P.lastSurge ?? 0) <= 0.6) feel("pull", { tension: load * (0.72 + 0.4 * surgeNow) * st.heavy, surge: surgeNow });
      P.lastSurge = surgeNow;
      fightPos = f; rigAt = f; slack = 0;
      // where the line cuts the surface over the fish: a small wake of rings as it moves, stronger as it surges or
      // comes up near the top
      if (!jumping && Math.floor(age / 0.7 + P.s1) !== Math.floor((age - dt) / 0.7 + P.s1)) { const w = f.clone(); w.y = wh(w.x, w.z); rippleCb?.(w, (0.16 + 0.22 * surge) * (f.y > -1.5 ? 1.6 : 1)); }
      const tension = fl ? (0.35 + 1.05 * fl.tension) * Math.max(0.8, load) : load * (0.72 + 0.4 * surge) * st.heavy;
      bendT = 0.16 + 0.26 * tension; tipT = 0.05 * surge + (st.pump ? 0.05 * Math.max(0, Math.sin(age * 5.5)) : 0);
      pitch = 0.95 + 0.15 * surge; yawOff = clamp(run * 0.35 * st.runWidth, -0.5, 0.5);
      fpE = 0.5 + 0.1 * surge; fpYaw = clamp(run * 0.22 * st.runWidth, -0.3, 0.3);
      // the strike: a sharp lift of the rod as the hook goes in, then down into the fight
      const strikeK = age < 0.55 ? Math.sin(Math.min(1, age / 0.16) * Math.PI / 2) * (1 - seg(age, 0.16, 0.55)) : 0;
      pitch += 0.38 * strikeK; fpE += 0.32 * strikeK; bendT += 0.25 * strikeK;
      P.tension = tension;
      if (crossed(0.02)) { if (!local) onSound?.("reelOn", at); else onSound?.("swish", at); feel("hooked", {}, true); } // (the strike: the rod swept up)
      if (fl) {
        // the handle turns as you tap; each half turn clicks; the drag giving line ratchets and the tip shivers
        // (your own reel's clicks only: a friend's fight is seen, not heard)
        if (local && Math.floor(fl.turns * 2) > Math.floor(lastTurns * 2)) onSound?.("reelTap", at);
        lastTurns = fl.turns;
        if (fl.slipping && t - lastDragSound > 0.3) { lastDragSound = t; if (local) onSound?.("drag", at); spr.tipv += 0.6; }
      }
      if (!st.leaps && prof.splashy > 0.3 && Math.floor(age * 0.5 + P.s1) !== Math.floor((age - dt) * 0.5 + P.s1) && seed() < prof.splashy * 0.5 && age > 2) { const sp = f.clone(); sp.y = wh(sp.x, sp.z); splashCb?.(sp, 0.35 + prof.splashy * 0.4); rippleCb?.(sp, 0.5); onSound?.("splash", sp); }
      // the handle: each accepted tap is half a turn more for it to make, and it goes round to it smoothly (a critically
      // damped follow: it speeds up, carries on round and slows to a stop, never overshooting or springing back), so
      // steady tapping turns it steadily and stopping lets it run down. It only ever turns for taps
      if (fl) crank(fl.turns, dt);
      else reel.userData.spin = (reel.userData.spin || 0) + dt * 12; // (someone else's fight: their taps aren't shared)
    } else if (ph === "landing") {
      // up from wherever the fight had got to, through the surface, then landed this place's way
      const { T1, T2, T3, T4, swingIn, card } = LT;
      const start = landStart || nearAt;
      const surf = nearAt.clone(); surf.y = wh(surf.x, surf.z);
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
          const f = ease(seg(age, B1 + 0.2, T2)), end = hangAt(0).sub(new THREE.Vector3(0, bridle, 0)), ctrl = railPt.clone().add(new THREE.Vector3(0, 0.45, 0));
          netAt = deck.clone().multiplyScalar((1 - f) ** 2).addScaledVector(ctrl, 2 * f * (1 - f)).addScaledVector(end, f * f);
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
          const f = ease(seg(age, swingIn, LT.end - 0.1)), start = hangAt(0).sub(new THREE.Vector3(0, bridle, 0)), ctrl = railPt.clone().add(new THREE.Vector3(0, 0.5, 0));
          netAt = start.clone().multiplyScalar((1 - f) ** 2).addScaledVector(ctrl, 2 * f * (1 - f)).addScaledVector(deck, f * f);
          netRest = ease(seg(age, swingIn + 0.5, LT.end - 0.1));
        }
        dropRig = { railPt, hanging, coil: G.coil, waterY, col: col.clone() };
        // the fish: at the surface beside the pier on a tight line, then led over the net, then in it
        const fishWait = surf.clone(), under = col.clone(); under.y = waterY - sink * 0.6;
        if (age >= T1 && age < T3) { rigAt = fishWait.clone(); rigAt.y = surf.y - 0.06; }
        else if (age >= T3 && age < T4) { const f = ease(seg(age, T3, T4)); rigAt = fishWait.clone().lerp(under, f); rigAt.y = lerp(surf.y - 0.06, (netAt ? netAt.y - 0.04 : under.y + 0.1), f); }
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
        const out = surf.clone(); out.y = surf.y - 0.05;
        if (age < T3) { const f = ease(seg(age, T1 - 0.8, T2)); netAt = poleFrom.clone().lerp(out, f); netAt.y = lerp(poleFrom.y - 0.4, out.y, f); if (age >= T2) { const g = ease(seg(age, T2, T3)); rigAt = surf.clone().add(new THREE.Vector3(1.2 * (1 - g), -0.1 * g, 0)); } }
        else { const f = ease(seg(age, T3, T4)); netAt = out.clone().lerp(toWorld(new THREE.Vector3(-0.35, 0.5, -0.2)), f); rigAt = netAt.clone(); inNet = true; pitch = 0.6; bendT = 0.05; }
      } else {
        // the beach: a wave carries it in and it's drawn up the sand to the angler's feet
        const sand = toWorld(new THREE.Vector3(0, -0.85, -1.4)); sand.y = Math.max(sand.y, 0.25);
        if (age >= T1 && age < T3) { const f = ease(seg(age, T1, T3)); rigAt = surf.clone().lerp(sand, f); rigAt.y = lerp(surf.y, sand.y, f) + Math.sin(f * Math.PI) * 0.1; pitch = 0.85; bendT = 0.15 * load; }
        else if (age >= T3) { const f = ease(seg(age, T4, card)); rigAt = sand.clone().lerp(hand, f); pitch = 0.6; bendT = 0.03; }
      }
      if (age >= card - 0.3) { rigAt = hand; showLine = true; }
      if (crossed(card)) feel("landed", {}, true);
      // (winding the fish up to the surface at the start, slowing to a stop; then the handle's left alone)
      if (age < T1) reel.userData.spin = (reel.userData.spin || 0) + dt * 7 * (1 - age / T1);
      if (crossed(T4)) onSound?.("reelOff", at);
    } else if (ph === "lost") {
      rigAt = (fightPos || castAt).clone().lerp(at, ease(age / 2)); rigAt.y = Math.min(0, rigAt.y); slack = 0.6; bendT = 0.02;
      if (crossed(0.02)) { spr.kv -= 1.6 * load; onSound?.("reelOff", at); feel("lost", {}, true); }
    }

    if (ph === "cast" || ph === "bite" || ph === "hooked") kept = null; // a new cast: that fish is done with
    let keptPose = null;
    if (kept && kept.t0 == null) kept.t0 = t;
    if (kept && kept.state !== "gone" && !(ph === "landing" && age < LT.card)) {
      const ns = Math.max(1, (fishLen * 0.62) / 0.35), kt = t - kept.t0, crossed2 = (k, m) => prevKt < m && k >= m;
      const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]);
      showFish = true; showLine = false;
      const G = venue === "pier" ? dropGeo(ns) : null;
      const matAt = toWorld(MAT_AT.clone().setY(0.004)), onMat = matAt.clone().add(new THREE.Vector3(0, 0.04 + 0.02 * ns, 0));
      const netDeck = G ? G.deck : toWorld(new THREE.Vector3(-0.62, 0.06, -0.2));
      const lying = (c, kk) => ({ mouth: c.clone().addScaledVector(side, fishLen * 0.5), dir: side.clone().negate(), roll: Math.PI / 2, beat: kk.beat, curl: kk.curl, centre: c });
      if (kept.state === "deck") {
        if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); rigAt = netAt.clone(); inNet = true; netRest = 1; }
        else if (tech === "net") { netOn = true; netAt = netDeck.clone().add(new THREE.Vector3(0, 0.12, 0)); rigAt = netAt.clone(); inNet = true; netRest = 1; poleFrom = toWorld(new THREE.Vector3(-1.45, 0.05, 0.55)); } // (resting in the landing net on the bank, its handle down)
        else keptPose = lying(netDeck.clone(), { beat: 0.12, curl: Math.max(0, Math.sin(kt * 1.7)) ** 8 * 0.5 });
      } else if (kept.state === "inspect") {
        // a look at it: lifted out of the net in both hands and laid on an unhooking mat in front of you (low, wet and
        // soft: the way to handle a fish you'll put back), you crouching over it with a hand resting on it. Still apart
        // from its gills and now and then a flick of the tail; nothing turns it
        matOn = true; if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); netRest = 1; }
        // (a landing net is laid down on the bank beside you, its handle on the ground, out of the way of the mat)
        else if (tech === "net") { netOn = true; netRest = 1; netAt = netDeck.clone().add(new THREE.Vector3(0, 0.08, 0)); poleFrom = toWorld(new THREE.Vector3(-1.45, 0.05, 0.55)); }
        const lift = ease(Math.min(1, kt / 1.1)), c = netDeck.clone().add(new THREE.Vector3(0, 0.05, 0)).lerp(onMat, lift); c.y += Math.sin(lift * Math.PI) * 0.32;
        keptPose = lying(c, { beat: 0.12, curl: Math.max(0, Math.sin(kt * 1.1)) ** 10 * 0.25 });
        keptPose.lift = kt < 1.15;
        if (crossed2(kt, 1.05)) onSound?.("mat", c); // laid down on the mat
        if (kt > 2 && Math.sin(prevKt * 1.1) < 0.97 && Math.sin(kt * 1.1) >= 0.97) onSound?.("flap", c); // (each flick of its tail)
      } else if (kept.state === "release") {
        // back to the water. Off a high pier it isn't dropped: it goes back in the drop net, let down to the water, and
        // swims out of it; from a bank, in the landing net at the edge; on a beach, into the shallows. Shortened: after
        // it's in the net (or picked up) the view cuts to it in the water (the page says so)
        const toNet = ease(Math.min(1, kt / 0.9)), CUT = 1.0, rel = { stage: kt < CUT ? "deck" : "lead" };
        if (kt < CUT) {
          if (G) { netOn = true; ropesOn = true; netAt = G.deck.clone(); netRest = 1; }
          const c = onMat.clone().lerp(netDeck.clone().add(new THREE.Vector3(0, 0.05, 0)), toNet); c.y += Math.sin(toNet * Math.PI) * 0.3;
          keptPose = lying(c, { beat: 0.3, curl: Math.sin(kt * 5) * 0.12 }); keptPose.lift = true;
        } else {
          const u = clamp((kt - CUT - 0.6) / 2.6, 0, 1), away = new THREE.Vector3(dirOf(face)[0], 0, dirOf(face)[1]);
          let start;
          if (G) {
            // the net hanging in the water at the foot of the pier, its rope up over the rail to your hands
            netOn = true; ropesOn = true; netRest = 0; netAt = G.hangAt(G.L - G.sink * 0.85).sub(new THREE.Vector3(0, G.bridle, 0)); // (its ring just at the surface, so you see it swim out) dropRig = { railPt: G.railPt, hanging: true, coil: G.coil }; releaseRope = G;
            start = netAt.clone().add(new THREE.Vector3(0, -0.08 * ns, 0)); if (u <= 0) inNet = true;
          } else {
            start = nearAt.clone().lerp(at, venue === "beach" ? 0.7 : 0.85); start.y = wh(start.x, start.z) - 0.08; rel.stage = "other";
            // from a bank: in the landing net, held out on its handle with the net's rim at the surface
            if (venue !== "beach") { netOn = true; netRest = 0; netAt = start.clone().add(new THREE.Vector3(0, 0.06, 0)); poleFrom = toWorld(new THREE.Vector3(-0.25, 1.05, -0.35)); releasePole = true; if (u <= 0) inNet = true; }
          }
          // it swims out: forwards, away from the pier, and down out of sight
          const c = start.clone().addScaledVector(away, u * u * 2.2 * Math.max(1, fishLen * 2)); c.y = start.y - u * u * 0.9;
          const dir = away.clone(); dir.y = -0.25 * u; dir.normalize();
          if (!(G && u <= 0)) keptPose = { mouth: c.clone().addScaledVector(dir, fishLen * 0.5), dir, roll: 0, beat: 1.2, curl: Math.sin(kt * 8) * 0.3 * (0.4 + u), centre: c };
          if (crossed2(kt, CUT + 0.65)) { const sp = start.clone(); sp.y = wh(sp.x, sp.z); rippleCb?.(sp, 0.5); onSound?.("splash", sp); }
          rel.net = netAt ? netAt.clone() : null; rel.fish = c.clone();
          if (u >= 1) { kept = { state: "gone", t0: t }; keptPose = null; showFish = false; netOn = false; dropRig = null; releaseRope = null; }
        }
        releaseInfo = rel;
      }
      prevKt = kt;
    } else prevKt = -1;
    // at a pier the drop net lies ready on the deck beside the tackle box (so it's there before it's needed, never conjured)
    let netIdle = false;
    if (!netOn && venue === "pier" && !walking) { netOn = true; netIdle = true; netAt = toWorld(new THREE.Vector3(-1.2, 0.35, -0.08)); netRest = 1; inNet = false; }
    // ---- springs, then the rod's shape ----
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
    // (clear of your legs, the rail and anyone behind you), bobbing a little with your stride; the line wound in
    if (walking) {
      const bob = Math.sin((walking.phase || 0) * 2) * 0.025 * Math.min(1, (walking.speed || 0) / 2);
      dir = new THREE.Vector3(0.07, 0.58 + bob, -0.81).normalize();
      butt = new THREE.Vector3(0.25, 0.86 + bob * 0.5, -0.05).addScaledVector(dir, -R.seat * 0.7); held = true; showLine = false; showFish = false;
    }
    // first person: whenever the line is out the rod is in your hands, low and to the right with the reel in view and
    // the tip pointing out towards the line (a portrait phone sees only about 35° side to side, so it can't be off to
    // one side on a rest)
    if (fp && !(ph === "landing" && age >= LT.swingIn)) {
      held = true;
      // held in front of you wherever you look (as in a first-person game): the reel and your right hand stay in the
      // lower right of the view, the rod rising from there at its angle for the moment (higher at a cast, lower to
      // land), so turning to watch the fish never loses the reel your hand is winding
      const vy = viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0, vp = viewIn ? clamp(viewIn.pitch, -0.9, 0.7) : -0.12;
      const vf = new THREE.Vector3(Math.sin(vy) * Math.cos(vp), Math.sin(vp), -Math.cos(vy) * Math.cos(vp)), vr = new THREE.Vector3(Math.cos(vy), 0, Math.sin(vy)), vu = new THREE.Vector3().crossVectors(vr, vf);
      // the reel stays put in the view (lower right, from the eye where it is now: leaning over the rail moves it); the
      // rod swings about it, up for a cast, after a running fish, down to land it
      // (from the lower right, leaning in a little towards the middle, so it doesn't run straight up the view)
      const e = fpE - 0.12, sw = fpYaw - 0.06;
      dir = vf.clone().multiplyScalar(Math.cos(e) * Math.cos(sw)).addScaledVector(vu, Math.sin(e)).addScaledVector(vr, Math.cos(e) * Math.sin(sw)).normalize();
      fpView = { vr, vu, vf };
      const reelAt = fpEye().addScaledVector(vr, 0.08).addScaledVector(vu, -0.16).addScaledVector(vf, 0.5); // (above and left of the Reel button, a little to the right so you see the reel and the hand winding it from the left side; your right forearm goes off the right edge)
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
    for (let i = 0; i <= NSEG; i++) {
      const s = i / NSEG;
      pts[i].copy(butt).addScaledVector(dir, R.len * s * (1 - 0.3 * k * s * s)).addScaledVector(bendDir, R.len * (k * s * s * 0.55 + spr.tip * s ** 6));
    }
    for (let i = 0; i < NSEG; i++) between(rodSegs[i].m, pts[i], pts[i + 1], rodSegs[i].r);
    // the handle, the reel and the rings, each square to the blank with the rings and reel underneath it
    const along = (m) => { const s2 = Math.min(1, m / R.len) * NSEG, i = Math.min(NSEG - 1, Math.floor(s2)), f = s2 - i; return { p: pts[i].clone().lerp(pts[i + 1], f), t: pts[i + 1].clone().sub(pts[i]).normalize() }; };
    const frame = (t) => { const up = tmpUp.set(0, 1, 0).addScaledVector(t, -t.y); if (up.lengthSq() < 1e-4) up.set(1, 0, 0); up.normalize(); const x = new THREE.Vector3().crossVectors(up, t); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, t)); };
    for (const hp of handleParts) { const a = along(hp.a).p, b = along(hp.b).p; between(hp.m, a, b, hp.r); }
    const seat = along(R.seat); reel.position.copy(seat.p); reel.quaternion.copy(frame(seat.t));
    handle.rotation.x = -(reel.userData.spin || 0); reel.userData.rotor.rotation.z = (reel.userData.spin || 0) * 1.6;
    guideLinePos.set(seat.p.clone().add(new THREE.Vector3(0, -0.072, 0.06).multiplyScalar(R.reel).applyQuaternion(reel.quaternion)).toArray(), 0);
    guides.forEach((gd, i) => {
      const a = along(gd.s * R.len); gd.g.position.copy(a.p); gd.g.quaternion.copy(frame(a.t));
      const br = rodSegs[Math.min(NSEG - 1, Math.floor(gd.s * NSEG))].r; gd.wrap.scale.set(br * 1.3, 0.024, br * 1.3);
      guideLinePos.set(a.p.clone().add(new THREE.Vector3(0, -(gd.r * 1.35 + 0.006), 0).applyQuaternion(gd.g.quaternion)).toArray(), (i + 1) * 3);
    });
    guideLinePos.set(pts[NSEG].toArray(), (GUIDES.length + 1) * 3); guideLineGeo.attributes.position.needsUpdate = true;
    guideLine.visible = showLine !== false;
    rest.visible = !walking && (!held || venue === "beach");

    // ---- the person: hands on the rod, the reel's handle, the drop net's rope or the fish; braced against a fight,
    // leaning over the rail to land it, watching the rod tip or the float while they wait ----
    const hands = [null, null];
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const rodGrip = (m, palm, kind) => { const a = along(m); return { at: a.p, axis: a.t, palm, kind }; };
    let lean = 0, brace = 0, crouch = 0, twist = 0, idleMode = "hang", lookAtW = null;
    const tension = ph === "hooked" ? clamp(P.tension || 0.6, 0, 1.6) : 0;
    // the reel's handle, for the left hand to wind (it's on the left of a spinning reel)
    reel.updateMatrixWorld(true);
    const knob = toLocal(handle.localToWorld(V3(0.016, -0.048, 0))), knobAx = toLocal(handle.localToWorld(V3(-0.01, -0.048, 0))).sub(knob);
    if (walking) hands[1] = rodGrip(R.seat * 0.7, V3(-1, 0, 0.2), "carry");
    else if (held) {
      hands[1] = rodGrip(R.seat - 0.03, V3(-1, 0.15, 0), "seat"); // on the side of the rod at the reel seat, palm in, thumb along the top, the reel's stem between the fingers below
      // the other hand: on the butt to cast, on the reel's handle to wind (while a fish is on and landing it); free
      // while you wait
      hands[0] = ph === "cast" && age < 2.4 ? rodGrip(0.05, V3(1, 0.2, 0), "butt") : ph === "hooked" || ph === "landing" || ph === "lost" ? { at: knob, axis: knobAx, palm: dir.clone().negate().add(V3(0, -0.5, 0)), kind: "crank" } : null;
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
    if (ph === "hooked") { brace = clamp(0.35 + 0.45 * tension, 0, 1); lean = -0.04 - 0.08 * tension; crouch = 0.08 + 0.08 * tension; twist = yawOff * 0.6; lookAtW = rigAt ? rigAt.clone() : null; }
    if (ph === "landing") {
      lookAtW = (fish.visible ? fish.position : rigAt)?.clone() || null; brace = age < LT.T1 ? 0.5 : 0.2; lean = 0.08;
      if (tech === "net" && netOn && poleFrom && netAt) { hands[0] = { at: toLocal(poleFrom), axis: toLocal(netAt).sub(toLocal(poleFrom)), palm: V3(0, 1, 0), kind: "pole" }; lean = 0.2; }
      if (tech === "dropnet" && landStage) {
        const railZ = -Math.max(0.3, edge - 0.22), net0 = netAt ? toLocal(netAt) : null, sideL = V3(1, 0, 0);
        if (landStage === "up") { lookAtW = rigAt ? rigAt.clone() : lookAtW; lean = 0.1; }
        else if (landStage === "rod") {
          // laying the rod on the rail: the right hand goes with it, the left lets go of the reel
          hands[1] = rodGrip(R.seat - 0.03, V3(-1, 0.15, 0), "seat"); hands[0] = null; lean = 0.12; brace = 0;
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
          const base = V3(-0.3, 1.12, railZ + 0.2);
          const hold = (hi) => base.clone().add(V3(0, hi ? 0.1 : -0.22, hi ? -0.06 : 0.16));
          let a0 = base.clone().add(V3(-0.05, 0.06, -0.04)), a1 = base.clone().add(V3(0.07, -0.12, 0.1));
          if (landStage === "haul" && ropePull) {
            const u = ease(clamp((ropePull.u - 0.15) / 0.75, 0, 1)), puller = hold(true).lerp(hold(false), u), reacher = hold(false).lerp(hold(true), ease(ropePull.u));
            if (ropePull.hand) { a1 = puller; a0 = reacher.add(V3(-0.06, 0, 0)); } else { a0 = puller.add(V3(-0.06, 0, 0)); a1 = reacher; }
          }
          hands[0] = { at: a0, axis: V3(0, 1, 0), palm: V3(0.3, 0, 1), kind: "rope" };
          hands[1] = { at: a1, axis: V3(0, 1, 0), palm: V3(-0.3, 0, 1), kind: "rope" };
          lean = 0.22; crouch = 0.06; brace = landStage === "haul" ? 0.25 : 0; lookAtW = netAt ? netAt.clone() : lookAtW;
        } else if (landStage === "done") { lookAtW = netAt ? netAt.clone() : lookAtW; lean = 0.05; brace = 0;
        } else if (landStage === "in" && net0) {
          // reaching out over the rail for the hoop and bringing it round onto the deck
          hands[0] = { at: net0.clone().add(V3(-0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          hands[1] = { at: net0.clone().add(V3(0.2, 0.08, 0)), axis: V3(0, 0, 1), palm: V3(0, -1, 0), kind: "hoop" };
          crouch = clamp(0.8 - net0.y * 0.6, 0, 0.6); lean = 0.18; brace = 0; lookAtW = netAt ? netAt.clone() : lookAtW;
        }
      }
      if (rigAt && age >= LT.card - 0.3 && tech !== "dropnet" && tech !== "net") hands[0] = { at: toLocal(rigAt).add(V3(0, 0.05, 0)), axis: V3(0, 1, 0), palm: V3(1, 0, 0), kind: "line" };
    }
    if (ph === "lost") { lean = 0.05; lookAtW = rigAt ? rigAt.clone() : null; }
    let kneel = 0;
    if (keptPose?.centre && (kept?.state === "inspect" || (kept?.state === "release" && keptPose.lift))) {
      // both hands under it while it's carried (one behind the head, one by the tail), then one hand resting on its side
      // while it lies on the mat; crouched down over it, looking at it
      const d = toLocal(keptPose.mouth.clone().add(keptPose.dir)).sub(toLocal(keptPose.mouth)), upL = V3(0, 1, 0);
      const under = (k) => toLocal(keptPose.mouth.clone().addScaledVector(keptPose.dir, fishLen * k)).add(V3(0, -0.035 * Math.max(1, fishLen * 2), 0));
      if (keptPose.lift) { hands[0] = { at: under(0.25), axis: d, palm: upL, kind: "fish" }; hands[1] = { at: under(0.72), axis: d, palm: upL, kind: "fish" }; }
      else { hands[1] = { at: toLocal(keptPose.centre).add(V3(0.02, 0.045 * Math.max(1, fishLen * 2), 0.03)), axis: d, palm: V3(0, -1, 0), kind: "fish" }; hands[0] = null; }
      lookAtW = keptPose.centre.clone(); kneel = 1; crouch = 0.6; lean = 0.42; brace = 0;
    }
    if (kept?.state === "release" && releasePole && poleFrom && netAt) { hands[0] = { at: toLocal(poleFrom), axis: toLocal(netAt).sub(toLocal(poleFrom)), palm: V3(0, 1, 0), kind: "pole" }; lean = 0.2; lookAtW = netAt.clone(); }
    if (kept?.state === "release" && releaseRope && !keptPose?.lift) {
      // letting it go from the drop net: both hands on the rope at the rail, watching it swim out
      const base = V3(-0.3, 1.12, -Math.max(0.3, edge - 0.22) + 0.2);
      hands[0] = { at: base.clone().add(V3(-0.05, 0.06, -0.04)), axis: V3(0, 1, 0), palm: V3(0.3, 0, 1), kind: "rope" };
      hands[1] = { at: base.clone().add(V3(0.07, -0.12, 0.1)), axis: V3(0, 1, 0), palm: V3(-0.3, 0, 1), kind: "rope" };
      lean = 0.22; crouch = 0.06; brace = 0; lookAtW = releaseInfo?.fish || lookAtW;
    }
    if (kept?.state === "deck" && !walking) lookAtW = fish.visible ? fish.position.clone() : lookAtW;
    handsNow = hands.map((h, i) => (h ? h.at.clone() : V3(i ? 0.28 : -0.28, 0.85, -0.05)));
    if (emoting && emoting.t0 == null) emoting.t0 = t;
    const emote = emoting && t - emoting.t0 < EMOTE_S[emoting.kind] ? { kind: emoting.kind, u: t - emoting.t0, hand: hands[1] ? 0 : 1 } : null;
    if (!emote) emoting = null;
    // leaning out over the rail in first person: the body goes with the eye, so the hands still reach the rod
    // (in first person the whole body goes with the eye instead, below, so your shoulders stay where they are in the view)
    if (fp) { brace = 0; crouch = 0; lean = 0.04; }
    // first person: your body turns to face where you look (only your forearms show), so your arms never reach back
    // across the view; the hands' places are worked out in the angler's space, so turn them into the body's
    const wantYaw = fp && viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0;
    figYaw = fp ? figYaw + Math.atan2(Math.sin(wantYaw - figYaw), Math.cos(wantYaw - figYaw)) * Math.min(1, dt * 10) : 0;
    fig.group.rotation.y = -figYaw;
    const toFig = (v) => (v && figYaw ? v.clone().applyAxisAngle(UP, figYaw) : v);
    // first person: your hands (fpHands.js) take hold of the same things, placed from the same eye and view as the rod
    if (fp && fpv) {
      const vw = fpView || (() => { const vy = viewIn ? Math.atan2(Math.sin(viewIn.yaw - face), Math.cos(viewIn.yaw - face)) : 0, vp = viewIn ? clamp(viewIn.pitch, -0.9, 0.7) : -0.12; const vf = new THREE.Vector3(Math.sin(vy) * Math.cos(vp), Math.sin(vp), -Math.cos(vy) * Math.cos(vp)), vr = new THREE.Vector3(Math.cos(vy), 0, Math.sin(vy)); return { vf, vr, vu: new THREE.Vector3().crossVectors(vr, vf) }; })();
      fpv.pose({ hands: walking ? [null, null] : hands, eye: fpEye(), vr: vw.vr, vu: vw.vu, vf: vw.vf, dt });
    }
    for (let i = 0; i < 2; i++) if (hands[i]) hands[i] = { ...hands[i], at: toFig(hands[i].at), axis: toFig(hands[i].axis), palm: toFig(hands[i].palm) };
    fig.pose({ t, dt, emote, kneel, walk: walking ? { speed: walking.speed || 0, air: !!walking.air, sprint: (walking.speed || 0) > 5 } : null, lean, brace, crouch, twist, hands, idle: idleMode, look: lookAtW ? toFig(toLocal(lookAtW)) : null, speaking, hood: fig.look?.hat === 4, weather: { rain: env.rain || 0, wind: env.wind || 0, windDir: toFig(new THREE.Vector3(env.windDir?.[0] || 1, 0, env.windDir?.[1] || 0).applyAxisAngle(UP, -root.rotation.y)).toArray().filter((_, i) => i !== 1) } });
    tag.position.y = fig.top + 0.3; talk.position.y = tag.position.y + 0.31;
    if (!fp && !walking && (ph === "waiting" || ph === "idle" || ph === "ended" || ph === "paused")) { const ey = fig.eyeAt?.y; if (ey > 1.2 && ey < 2) eyeH += (ey - eyeH) * (1 - Math.exp(-dt * 0.5)); }

    // ---- line, rig, fish, net ----
    line.visible = showLine;
    if (showLine) {
      const tip = toWorld(pts[NSEG]);
      let end = rigAt ? rigAt.clone() : tip.clone().add(new THREE.Vector3(0, -0.6, 0));
      if (rigAt && (ph === "waiting" || ph === "bite" || ph === "missed" || (ph === "cast" && age > 2.15))) { end.y = wh(end.x, end.z) - (floatRig ? 0.02 : 0); }
      const dist = tip.distanceTo(end), sag = slack * dist * 0.12, windX = env.windDir[0] * env.wind * 0.6, windZ = env.windDir[1] * env.wind * 0.6;
      // under a fish's pull the line is straight and thrums; slack it bellies in the wind
      const thrum = ph === "hooked" ? 0.012 * (P.tension || 1) * Math.sin(t * 47) : 0;
      for (let i = 0; i < LN; i++) {
        const s = i / (LN - 1), sn = Math.sin(Math.PI * s);
        linePos[i * 3] = lerp(tip.x, end.x, s) + windX * sn * slack + thrum * sn; linePos[i * 3 + 1] = lerp(tip.y, end.y, s) - sag * sn + thrum * sn * Math.sin(s * 9); linePos[i * 3 + 2] = lerp(tip.z, end.z, s) + windZ * sn * slack;
      }
      lineGeo.attributes.position.needsUpdate = true;
      rig.position.copy(end);
      if (floatRig && (ph === "waiting" || ph === "bite" || ph === "missed")) { rig.position.y = wh(end.x, end.z) + (ph === "bite" ? -Math.max(0, Math.sin(age * 6)) * 0.08 : 0); }
      rig.visible = !(ph === "hooked" || ph === "landing");
    } else rig.visible = false;
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
    } else bag.scale.y = lerp(inNet ? 1 + 0.25 * Math.min(1, load) : 1, 0.35, netRest);
    tag.visible = !fp && !tagOff && !(kept && (kept.state === "inspect" || kept.state === "release")); // (no name label in your catch photo)
    talk.visible = speaking && !fp; if (speaking) { const k = 0.3 + Math.abs(Math.sin(t * 6)) * 0.08; talk.scale.set(k, k, 1); }
    if (keptPose) poseFish(keptPose.mouth, keptPose.dir, t, { beat: keptPose.beat, curl: keptPose.curl, roll: keptPose.roll });
    else if (showFish && rigAt && inNet && netAt) {
      // in the net: lying across the bag, curled to fit, its middle at the middle of the net, sagging into the mesh
      const side = new THREE.Vector3(-dirOf(face)[1], 0, dirOf(face)[0]);
      const bend = clamp((fishLen - 0.6 * netScale * 0.7) / fishLen, 0, 0.6);
      const mouth = netAt.clone().addScaledVector(side, fishLen * 0.5 * (1 - bend * 0.5)).add(new THREE.Vector3(0, -0.22 * netScale, 0));
      poseFish(mouth, side.clone().negate().add(new THREE.Vector3(0, -0.08, 0)).normalize(), t, { beat: 0.5, curl: 0.35 + bend + Math.sin(t * 2.6) * 0.12 });
    } else if (showFish && rigAt && ph === "hooked") {
      // leaping: nose up going out, nose down coming back in, body bent
      const goingUp = P.jumps?.some((tj) => age >= tj && age < tj + 0.375);
      const away = new THREE.Vector3(dirOf(face)[0], 0, dirOf(face)[1]);
      poseFish(rigAt, away.multiplyScalar(0.4).add(new THREE.Vector3(0, goingUp ? -1 : 1, 0)).normalize(), t, { beat: 1.4, curl: Math.sin(t * 7) * 0.35 });
    } else if (showFish && rigAt) {
      const hangDir = new THREE.Vector3(0, -1, 0);
      if (ph === "landing" && (age < LT.T1 + 0.3 || (tech === "beach" && age < LT.T3))) hangDir.set(dirOf(face)[0], -0.2, dirOf(face)[1]).negate().normalize();
      if (tech === "beach" && age >= LT.T1 && age < LT.T4) hangDir.set(-dirOf(face)[0], 0.05, -dirOf(face)[1]).negate();
      if (age >= LT.card - 0.3) hangDir.set(1, -0.25, 0).applyQuaternion(root.quaternion);
      poseFish(rigAt, hangDir, t, { beat: age < LT.T4 ? 1 : 0.3, curl: Math.sin(t * 2.3) * 0.2 * (age > LT.T2 && age < LT.swingIn ? 1 : 0) });
    }
    mat.visible = matOn || (kept?.state === "release" && !!keptPose?.lift);
    if (mat.visible) { mat.position.copy(toWorld(MAT_AT)); mat.rotation.y = root.rotation.y; }
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
          const hw = [0, 1].map((i) => { const h = fig.hand(i); return h ? fig.group.localToWorld(h) : toWorld(handsNow[i]); });
          const hm = hw[0].clone().lerp(hw[1], 0.5);
          between(ropes[3], hm, dropRig.railPt, 1); between(ropes[4], dropRig.railPt, knot, 1); between(ropes[5], hm, coil, 1);
        } else { between(ropes[3], knot, coil, 1); ropes[4].visible = false; ropes[5].visible = false; }
      }
    }
    prevAge = age;
    // test diagnostics only (window.__fdFilm, never in the app): where the reel, its handle and your hands are this frame
    if (local && typeof window !== "undefined" && window.__fdFilm) { fig.group.updateMatrixWorld(true); window.__fdProbe = { seat: toWorld(seat.p).toArray(), knob: toWorld(knob).toArray(), hands: fp && fpv ? fpv.wrists.map((w) => (w ? toWorld(w).toArray() : null)) : [0, 1].map((i) => { const h = fig.hand(i); return h ? fig.group.localToWorld(h).toArray() : null; }), spin: reel.userData.spin || 0, fp }; }
    const eyeNow = fpEye(); // (the eye the rod and your body were placed from this frame: the camera uses the same one)
    const leanTo = fp && (ph === "landing" ? age < LT.card + 0.5 : ph === "hooked" && age > 3) ? clamp(edge - 0.35, 0, 0.7) : 0;
    leanNow += (leanTo - leanNow) * (1 - Math.exp(-dt * 2.5));
    return { phase: ph, age, info, land: ph === "landing" && age < LT.end + 0.4 ? { net: netOn && !netIdle && netAt ? netAt.clone() : null, fish: rigAt ? rigAt.clone() : null, stage: landStage, end: LT.end, edge, water: dropRig?.waterY ?? null } : null, tip: toWorld(pts[NSEG]), rig: rigAt ? rigAt.clone() : null, fishAt: fish.visible ? fish.position.clone() : null, eye: toWorld(fp ? eyeNow : new THREE.Vector3(0, 1.62 - leanNow * 0.25, -0.05 - leanNow)), at: walking ? root.position.clone() : at.clone(), face: walking ? walking.face : face, walking: !!walking, cast: castAt.clone(), near: nearAt.clone(), edge, landed: ph === "landing" && age >= LT.card, jump: jumpWatch ? jumpAt : null, kept: kept?.state || null, release: releaseInfo ? { ...releaseInfo, edge } : null, keptAt: kept && fish.visible ? (keptPose?.centre || fish.position.clone().addScaledVector(fBase, fishLen * 0.5)) : null };
  }
  // first person: the eye is in your own head (just in front of it), so leaning out over the rail takes your eye, your
  // shoulders and your arms together, and your hands still reach the rod
  // (one place, worked out the same way every frame and before anything is posed: the camera and the rod in your hands
  // both hang off it, so they can never be a frame apart. Your eye height is taken from your body while you stand in
  // third person; leaning out over the rail takes the eye forward and a little down; a slow breath)
  function fpEye() { return new THREE.Vector3(0, eyeH - leanNow * 0.25 + Math.sin(tNow * 1.4) * 0.006, -0.08 - leanNow * 0.85); }
  // the reel's handle for your taps (reelHandle.js)
  function crank(turns, dt) { const u = reel.userData; u.hs = stepHandle(u.hs || handleState(u.spin || 0), turns, dt); u.spin = u.hs.angle; }
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
      if (w) { walking = w; root.position.set(w.x, w.y, w.z); root.rotation.y = -w.face; }
      else if (walking) { walking = null; place(curSpot); }
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
      if (fp === !!on) return; fp = !!on; fig.setFirstPerson(fp); tag.visible = !on && !tagOff;
      if (fp && !fpv) { const L = fig.look || {}; fpv = createFpHands({ gloves: !!L.gloves, skinHex: SKINS[L.skin]?.hex ?? 0xc99a74, coatHex: COATS[L.coat]?.hex ?? O?.jacket ?? 0x2f3a48 }); root.add(fpv.group); }
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
