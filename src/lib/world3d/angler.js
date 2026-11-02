// ---- angler: one person fishing in the 3D view: body, clothes, rod, reel, line, rig, the fish and the net ----
// Everything moves from the angler's own events (cast, bite, hooked, catch, lost, missed) and their times, so a
// remote angler animates the same on every phone, and a viewer who joins midway sees the right moment. Timings,
// bites, fights and landings are the same rules as the photo scene (sceneActors.js): biteTaps, fightProfile,
// fishLoad, landingTech and landingTimes.
import * as THREE from "three";
import { phaseAt, DUR } from "../liveEvents.js";
import { biteTaps, fightProfile, fightStyle, fishLoad, landingTimes, landingTech } from "../sceneActors.js";
import { fishShape, buildFishMesh, bodyWidth } from "../fish3d.js";
import { hasArt, artUrl } from "../../data/fishart.js";
import { castPoint, dirOf } from "./spots.js";

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
const ROD = { beach: { len: 4.2, col: 0xd6a63c, flex: 0.78 }, pier: { len: 3.6, col: 0x2870ec, flex: 1 }, estuary: { len: 3.3, col: 0x2870ec, flex: 1.05 }, river: { len: 3.9, col: 0xd63434, flex: 1.35 }, lake: { len: 3.6, col: 0x2ea060, flex: 1.15 } };

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

/** A generic fish (for species without a FishDock picture): a smooth lofted body and a forked tail. */
function genericFishGeometry() {
  const pos = [], idx = [], K = 22, M = 12;
  for (let i = 0; i < K; i++) {
    const u = i / (K - 1), r = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.11 * (u < 0.85 ? 1 : 0.3) + 0.004;
    for (let j = 0; j < M; j++) { const a = (j / M) * Math.PI * 2; pos.push(u, Math.cos(a) * r, Math.sin(a) * r * 0.55); }
  }
  for (let i = 0; i < K - 1; i++) for (let j = 0; j < M; j++) { const a = i * M + j, b = i * M + ((j + 1) % M); idx.push(a, a + M, b, b, a + M, b + M); }
  const base = pos.length / 3; pos.push(0.86, 0, 0, 1.0, 0.13, 0, 1.0, -0.13, 0, 0.95, 0, 0); idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createAngler(world, { id, name = "", spot, venue = "pier", outfit = 0, local = false, real = false, onSound, onFeel } = {}) {
  const root = new THREE.Group(); world.add(root);
  const body = new THREE.Group(); root.add(body);
  const O = OUTFITS[((outfit % OUTFITS.length) + OUTFITS.length) % OUTFITS.length];
  const mJacket = new THREE.MeshStandardMaterial({ color: O.jacket, roughness: 0.8 });
  const mTrousers = new THREE.MeshStandardMaterial({ color: O.trousers, roughness: 0.9 });
  const mSkin = new THREE.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.7 });
  const mHat = new THREE.MeshStandardMaterial({ color: O.hat, roughness: 0.9 });
  const mBoot = new THREE.MeshStandardMaterial({ color: 0x1d2a22, roughness: 0.6 });
  const part = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const legL = part(new THREE.CapsuleGeometry(0.085, 0.7, 4, 8), mTrousers, -0.11, 0.47, 0);
  const legR = part(new THREE.CapsuleGeometry(0.085, 0.7, 4, 8), mTrousers, 0.11, 0.47, 0);
  part(new THREE.BoxGeometry(0.14, 0.12, 0.28), mBoot, -0.11, 0.06, -0.05); part(new THREE.BoxGeometry(0.14, 0.12, 0.28), mBoot, 0.11, 0.06, -0.05);
  const torso = part(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), mJacket, 0, 1.12, 0); torso.scale.z = 0.72;
  const head = part(new THREE.SphereGeometry(0.115, 14, 10), mSkin, 0, 1.6, -0.01);
  const hat = part(new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mHat, 0, 1.63, -0.01);
  const limb = (r, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 8), mat); m.castShadow = true; body.add(m); return m; };
  const arms = [0, 1].map(() => ({ up: limb(0.06, mJacket), lo: limb(0.05, mJacket), hand: part(new THREE.SphereGeometry(0.05, 8, 6), mSkin, 0, 0, 0) }));
  const tag = label(name || "Angler", local ? "#7ee8de" : "#ffffff"); tag.position.set(0, 2.05, 0); root.add(tag);
  const lift = { legL, legR, torso, head, hat };

  // ---- the rod: sections along a bending curve, a reel, a rest or tripod ----
  const R = ROD[venue] || ROD.pier;
  const mBlank = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.3 });
  const mWhip = new THREE.MeshStandardMaterial({ color: R.col, roughness: 0.4, metalness: 0.2 });
  const NSEG = 12;
  const rodSegs = Array.from({ length: NSEG }, (_, i) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), i % 3 === 2 ? mWhip : mBlank); m.castShadow = true; root.add(m); return { m, r: lerp(0.018, 0.004, i / (NSEG - 1)) }; });
  const reel = new THREE.Group(); root.add(reel);
  // the reel: a light graphite body and a coloured spool, so it reads against a dark deck or water
  part(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.7, roughness: 0.28 }), 0, 0, 0, reel).rotation.z = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.03, 0.03, 0.065, 14), mWhip, 0, 0, 0, reel).rotation.z = Math.PI / 2;
  const handle = part(new THREE.BoxGeometry(0.01, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8 }), 0.04, 0, 0, reel);
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
    restTop = new THREE.Vector3(0.4, 1.08, -0.3); restButt = new THREE.Vector3(0.35, 0.05, 0.55); // leaning on the railing
  }
  // tackle box and bucket beside them
  part(new THREE.BoxGeometry(0.45, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.6 }), -0.55, 0.14, 0.25, root);
  part(new THREE.CylinderGeometry(0.14, 0.12, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 }), -0.35, 0.15, 0.62, root);
  // a landing net (rivers, lakes, estuaries) or a drop net with ropes (piers)
  // the net: knotted mesh you can see through (a drawn diamond pattern), hanging as a soft bag under a metal hoop
  const mNet = new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 1, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, map: netTexture(), depthWrite: false });
  const net = new THREE.Group(); world.add(net); net.visible = false;
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.015, 6, 24), mMetal); hoop.rotation.x = Math.PI / 2; net.add(hoop);
  const bagGeo = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return new THREE.Vector2(0.35 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.15 * u) + 0.02, -0.5 * u); }), 18);
  const bag = new THREE.Mesh(bagGeo, mNet); net.add(bag);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), mMetal); world.add(pole); pole.visible = false;
  const ropes = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4), new THREE.MeshStandardMaterial({ color: 0xe8c22a })); world.add(r); r.visible = false; return r; });

  // ---- line, rig, fish: in the world ----
  const LN = 28, linePos = new Float32Array(LN * 3);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.8 })); line.frustumCulled = false; world.add(line);
  const floatRig = venue === "river" || venue === "lake";
  const rig = new THREE.Group(); world.add(rig);
  if (floatRig) { part(new THREE.CylinderGeometry(0.012, 0.02, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0x401000 }), 0, 0.06, 0, rig); part(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd83a }), 0, 0, 0, rig); }
  else part(new THREE.SphereGeometry(0.03, 8, 6), mMetal, 0, 0, 0, rig);
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c4, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide, alphaTest: 0.5 });
  let fishGeo = genericFishGeometry(), fishBase = fishGeo.attributes.position.array.slice();
  const fish = new THREE.Mesh(fishGeo, fishMat); fish.visible = false; fish.castShadow = true; world.add(fish);
  let fishFor = "", fishLen = 0.45, prof = fightProfile(null), load = 1, LT = landingTimes(null, 45, null, venue), tech = "lift";

  function setFish(species, lengthCm, weightKg) {
    const key = `${species}|${lengthCm}|${weightKg}`;
    if (key === fishFor) return; fishFor = key;
    prof = fightProfile(species); fishLen = clamp((lengthCm || 40) / 100, 0.12, 2);
    load = fishLoad(species, lengthCm, weightKg); LT = landingTimes(species, lengthCm, weightKg, venue); tech = landingTech(species, lengthCm, weightKg, venue);
    fish.geometry = fishGeo = genericFishGeometry(); fishBase = fishGeo.attributes.position.array.slice(); fishMat.map = null; fishMat.color.set(0xb8c0c4); fishMat.needsUpdate = true;
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
          fishMat.map = tex; fishMat.color.set(0xffffff); fishMat.needsUpdate = true;
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
  let face = 0, at = new THREE.Vector3(), castAt = new THREE.Vector3(), nearAt = new THREE.Vector3(), edge = 1;
  // `edge`: how far in front of the angler the pier, quay or bank ends (the water starts). The fish comes up a little
  // beyond it, never under the deck, so it can be seen being landed
  const REACH = { beach: 1, pier: 2.4, estuary: 2.0, river: 1.4, lake: 1.4 };
  const EDGE = { beach: 6, pier: 0.9, estuary: 1.2, river: 2.2, lake: 2.0 };
  function place(s) {
    face = s.face; at.set(...s.at); root.position.copy(at); root.rotation.y = -face;
    const c = castPoint(s); castAt.set(c[0], 0, c[2]);
    const [dx, dz] = dirOf(face);
    edge = Number.isFinite(s.edge) ? s.edge : EDGE[venue] ?? 1;
    const out = edge + (REACH[venue] ?? 2);
    nearAt.set(at.x + dx * out, 0, at.z + dz * out);
  }
  place(spot);

  // springy rod: bend and tip
  const spr = { k: 0, kv: 0, tip: 0, tipv: 0 };
  const spring = (key, vkey, target, w, z, dt) => { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { const a = w * w * (target - spr[key]) - 2 * z * w * spr[vkey]; spr[vkey] += a * h; spr[key] += spr[vkey] * h; } };

  let events = [], lastKey = "", P = {}, seed = rng(1), splashCb = null, rippleCb = null, prevAge = 0, fightPos = null, landStart = null, hintFish = null;
  let fp = false, leanNow = 0; // first person: the rod held where you can see it; leaning over the rail to land a fish
  const toWorld = (v) => v.clone().applyMatrix4(root.matrixWorld);
  const toLocal = (v) => root.worldToLocal(v.clone());
  const pts = Array.from({ length: NSEG + 1 }, () => new THREE.Vector3());

  function frame(t, now, dt, env) {
    root.updateMatrixWorld(true);
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

    // ---- what the rod is doing ----
    // poses are in the angler's own space: x right, y up, -z forward
    let held = true, pitch = 0.75, yawOff = 0.12, bendT = 0.03, tipT = 0, rigAt = null, slack = 0.4, showLine = true, showFish = false;
    let netOn = false, netAt = null, ropesOn = false, poleFrom = null;
    let fpE = 0.4, fpYaw = -0.03; // first person: the rod's angle up from level, and a little towards the middle
    const ph = info.phase;
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
      const st = fightStyle(prof), pr = 1 - Math.exp(-age / (16 * prof.long));
      const run = n1(age * 0.22 * prof.tempo * st.runSpeed + P.s1), surge = Math.max(0, Math.sin(age * 0.95 * prof.tempo + n1(age * 0.3 + P.s2) * 2.2)) ** 6;
      const f = castAt.clone().lerp(nearAt, pr * 0.85);
      const [dx, dz] = dirOf(face), side = [-dz, dx];
      const lateral = run * 8 * st.runWidth * (1 - pr * 0.6);
      f.x += side[0] * lateral; f.z += side[1] * lateral;
      f.y = -st.depth * (0.5 + 0.5 * Math.max(0, n1(age * 0.17 + P.s2))) * (1 - pr * 0.7);
      // a leap: clear of the water in an arc, splashing out and back in (bass, garfish, sometimes mullet)
      if (!P.jumps) { P.jumps = []; if (st.leaps) for (let tj = 2.5 + seed() * 3; tj < 40; tj += 4 + seed() * 6) P.jumps.push(tj); }
      let jumping = false;
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
      const tension = load * (0.72 + 0.4 * surge) * st.heavy;
      bendT = 0.16 + 0.26 * tension; tipT = 0.05 * surge + (st.pump ? 0.05 * Math.max(0, Math.sin(age * 5.5)) : 0);
      pitch = 0.95 + 0.15 * surge; yawOff = clamp(run * 0.35 * st.runWidth, -0.5, 0.5);
      fpE = 0.5 + 0.1 * surge; fpYaw = clamp(run * 0.22 * st.runWidth, -0.3, 0.3);
      P.tension = tension;
      if (crossed(0.02)) { onSound?.("reelOn", at); feel("hooked", {}, true); }
      if (!st.leaps && prof.splashy > 0.3 && Math.floor(age * 0.5 + P.s1) !== Math.floor((age - dt) * 0.5 + P.s1) && seed() < prof.splashy * 0.5 && age > 2) { const sp = f.clone(); sp.y = wh(sp.x, sp.z); splashCb?.(sp, 0.35 + prof.splashy * 0.4); rippleCb?.(sp, 0.5); onSound?.("splash", sp); }
      reel.userData.spin = (reel.userData.spin || 0) + dt * 12;
    } else if (ph === "landing") {
      // up from wherever the fight had got to, through the surface, then landed this place's way
      const { T1, T2, T3, T4, swingIn, card } = LT;
      const start = landStart || nearAt;
      const surf = nearAt.clone(); surf.y = wh(surf.x, surf.z);
      const tip = tipWorld();
      bendT = 0.25 * load; pitch = 1.05; slack = 0; fpE = 0.6; fpYaw = 0;
      if (age < T1) { const f = ease(age / T1); rigAt = start.clone().lerp(surf, f); rigAt.y = lerp(start.y, surf.y - 0.15, f); }
      else if (crossed(T1)) { splashCb?.(surf, 0.9 + prof.splashy * 0.5); rippleCb?.(surf, 0.8); onSound?.("bigsplash", surf); }
      showFish = age >= T1 - 0.4;
      const hand = toWorld(new THREE.Vector3(0.05, 1.25, -0.42));
      if (tech === "lift") {
        // swung up on the line: head first, hanging under the tip, swinging, then in over the rail
        if (age >= T1 && age < T2) { const f = ease(seg(age, T1, T2)); rigAt = surf.clone().lerp(tip.clone().add(new THREE.Vector3(0, -1.2, 0)), f); pitch = 1.1 + 0.15 * f; }
        else if (age >= T2 && age < swingIn) { const sw = Math.sin((age - T2) * 3) * Math.exp(-(age - T2) * 0.8) * 0.5; rigAt = tip.clone().add(new THREE.Vector3(sw * 0.6, -1.1, sw * 0.3)); pitch = 1.25; bendT = 0.3 * load; }
        else if (age >= swingIn) { const f = ease(seg(age, swingIn, card)); rigAt = tip.clone().add(new THREE.Vector3(0, -1.1, 0)).lerp(hand, f); pitch = lerp(1.25, 0.6, f); yawOff = lerp(yawOff, 0.9, f); }
      } else if (tech === "dropnet") {
        // the ring lowered on its ropes, the fish guided over it, hauled up and lifted over the rail
        ropesOn = true; netOn = true;
        const rail = toWorld(new THREE.Vector3(-0.2, 1.0, -0.45)), water = surf.clone();
        if (age < T2) { const f = ease(seg(age, T1 - 0.6, T2)); netAt = rail.clone().lerp(water, f); netAt.y = lerp(rail.y, water.y + 0.05, f); rigAt = age >= T1 ? surf.clone().add(new THREE.Vector3(1.0, -0.05, 0)) : rigAt; }
        else if (age < T3) { const f = ease(seg(age, T2, T3)); netAt = water.clone(); netAt.y = water.y + 0.05; rigAt = surf.clone().add(new THREE.Vector3(1.0 * (1 - f), -0.05 - 0.1 * f, 0)); }
        else if (age < swingIn) { const f = ease(seg(age, T3, T4)); netAt = water.clone().lerp(rail, f); netAt.y = lerp(water.y + 0.05, rail.y + 0.2, f); rigAt = netAt.clone().add(new THREE.Vector3(0, -0.15, 0)); pitch = 0.7; bendT = 0.08; }
        else { const f = ease(seg(age, swingIn, card)); netAt = rail.clone().add(new THREE.Vector3(0, 0.2, 0)).lerp(toWorld(new THREE.Vector3(-0.3, 0.1, 0.1)), f); rigAt = f > 0.7 ? hand.clone().lerp(hand, 1) : netAt.clone().add(new THREE.Vector3(0, -0.15, 0)); pitch = 0.6; bendT = 0.05; }
        if (crossed(T3)) onSound?.("splash", water);
      } else if (tech === "net") {
        // the landing net reached out, the fish drawn over it, lifted in
        netOn = true; poleFrom = toWorld(new THREE.Vector3(-0.25, 1.05, -0.35));
        const out = surf.clone(); out.y = surf.y - 0.05;
        if (age < T3) { const f = ease(seg(age, T1 - 0.8, T2)); netAt = poleFrom.clone().lerp(out, f); netAt.y = lerp(poleFrom.y - 0.4, out.y, f); if (age >= T2) { const g = ease(seg(age, T2, T3)); rigAt = surf.clone().add(new THREE.Vector3(1.2 * (1 - g), -0.1 * g, 0)); } }
        else { const f = ease(seg(age, T3, T4)); netAt = out.clone().lerp(toWorld(new THREE.Vector3(-0.35, 0.5, -0.2)), f); rigAt = netAt.clone().add(new THREE.Vector3(0, -0.12, 0)); pitch = 0.6; bendT = 0.05; if (age >= swingIn) rigAt = hand; }
      } else {
        // the beach: a wave carries it in and it's drawn up the sand to the angler's feet
        const sand = toWorld(new THREE.Vector3(0, -0.85, -1.4)); sand.y = Math.max(sand.y, 0.25);
        if (age >= T1 && age < T3) { const f = ease(seg(age, T1, T3)); rigAt = surf.clone().lerp(sand, f); rigAt.y = lerp(surf.y, sand.y, f) + Math.sin(f * Math.PI) * 0.1; pitch = 0.85; bendT = 0.15 * load; }
        else if (age >= T3) { const f = ease(seg(age, T4, card)); rigAt = sand.clone().lerp(hand, f); pitch = 0.6; bendT = 0.03; }
      }
      if (age >= card - 0.3) { rigAt = hand; showLine = true; }
      if (crossed(card)) feel("landed", {}, true);
      reel.userData.spin = (reel.userData.spin || 0) + dt * (age < T3 ? 10 : 2);
      if (crossed(T4)) onSound?.("reelOff", at);
    } else if (ph === "lost") {
      rigAt = (fightPos || castAt).clone().lerp(at, ease(age / 2)); rigAt.y = Math.min(0, rigAt.y); slack = 0.6; bendT = 0.02;
      if (crossed(0.02)) { spr.kv -= 1.6 * load; onSound?.("reelOff", at); feel("lost", {}, true); }
    }

    // ---- springs, then the rod's shape ----
    spring("k", "kv", bendT * R.flex, 8, 0.35, dt); spring("tip", "tipv", tipT, 18, 0.25, dt);
    const sway = n1(t * 0.4 + id.length) * 0.02 * (1 + env.wind), breath = Math.sin(t * 1.6 + id.length) * 0.008;
    let butt, dir;
    if (held) {
      butt = new THREE.Vector3(0.18, 0.95, -0.12);
      dir = new THREE.Vector3(Math.sin(yawOff) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yawOff) * Math.cos(pitch)).normalize();
      if (ph === "waiting" || ph === "bite") { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); }
    } else { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); }
    if (!held || (ph !== "cast" && ph !== "hooked" && ph !== "landing" && ph !== "lost")) { butt = restButt.clone(); dir = restTop.clone().sub(restButt).normalize(); held = false; }
    // first person: whenever the line is out the rod is in your hands, low and to the right with the reel in view and
    // the tip pointing out towards the line (a portrait phone sees only about 35° side to side, so it can't be off to
    // one side on a rest)
    if (fp && !(ph === "landing" && age >= LT.swingIn)) {
      held = true; butt = new THREE.Vector3(0.13, 1.02, -0.4);
      dir = new THREE.Vector3(Math.sin(fpYaw) * Math.cos(fpE), Math.sin(fpE), -Math.cos(fpYaw) * Math.cos(fpE));
    }
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
    reel.position.copy(pts[0]).addScaledVector(dir, 0.35).add(new THREE.Vector3(0, -0.06, 0)); reel.lookAt(toWorld(pts[3]));
    handle.rotation.x = reel.userData.spin || 0;
    rest.visible = !held || venue === "beach";

    // ---- the body: stand, breathe, hands on the rod when it's held ----
    const bob = Math.sin(t * 1.4 + id.length) * 0.01;
    torso.position.y = 1.12 + bob; head.position.y = 1.6 + bob; hat.position.y = 1.63 + bob;
    const lean = held && (ph === "hooked" || ph === "landing") ? 0.12 : 0;
    body.rotation.x = -lean;
    const shoulders = [new THREE.Vector3(-0.24, 1.38 + bob, 0), new THREE.Vector3(0.24, 1.38 + bob, 0)];
    const hands = held ? [pts[0].clone().addScaledVector(dir, 0.55), pts[0].clone().addScaledVector(dir, 0.12)] : [new THREE.Vector3(-0.28, 0.85, -0.05), new THREE.Vector3(0.28, 0.85, -0.05)];
    if (tech === "net" && netOn && ph === "landing") hands[0] = toLocal(netAt ? poleFrom : hands[0]);
    for (let i = 0; i < 2; i++) {
      const s = shoulders[i], h = hands[i], d = s.distanceTo(h), L1 = 0.3, L2 = 0.29;
      const mid = s.clone().lerp(h, 0.5), bend = Math.sqrt(Math.max(0, L1 * L1 - (Math.min(d, L1 + L2) / 2) ** 2));
      const out = new THREE.Vector3(i ? 0.6 : -0.6, -0.8, 0.3).normalize();
      const elbow = mid.addScaledVector(out, bend);
      between(arms[i].up, s, elbow, 1); between(arms[i].lo, elbow, h, 1); arms[i].hand.position.copy(h);
    }

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
    if (showFish && rigAt && ph === "hooked") {
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
    net.visible = netOn && !!netAt; pole.visible = net.visible && tech === "net"; ropes.forEach((r) => (r.visible = net.visible && tech === "dropnet"));
    if (net.visible) {
      net.position.copy(netAt);
      if (tech === "net" && poleFrom) between(pole, poleFrom, netAt, 1);
      if (tech === "dropnet") { const top = toWorld(new THREE.Vector3(-0.2, 1.05, -0.45)); ropes.forEach((r, i) => { const a = (i / 3) * Math.PI * 2; between(r, top, netAt.clone().add(new THREE.Vector3(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35)), 1); }); }
    }
    prevAge = age;
    const leanTo = fp && (ph === "landing" ? age < LT.card + 0.5 : ph === "hooked" && age > 3) ? clamp(edge - 0.35, 0, 0.7) : 0;
    leanNow += (leanTo - leanNow) * (1 - Math.exp(-dt * 2.5));
    return { phase: ph, age, info, tip: toWorld(pts[NSEG]), rig: rigAt ? rigAt.clone() : null, fishAt: fish.visible ? fish.position.clone() : null, eye: toWorld(new THREE.Vector3(0, 1.62 - leanNow * 0.25, -0.05 - leanNow)), at: at.clone(), face, cast: castAt.clone(), near: nearAt.clone(), edge, landed: ph === "landing" && age >= LT.card };
  }
  function tipWorld() { root.updateMatrixWorld(true); return toWorld(pts[NSEG]); }

  return {
    id, root,
    get local() { return local; },
    setEvents(list) { events = list || []; },
    setHint(h) { hintFish = h || null; },
    setName(n) { const old = tag; const s = label(n || "Angler", local ? "#7ee8de" : "#ffffff"); s.position.copy(old.position); root.remove(old); old.material.map.dispose(); old.material.dispose(); root.add(s); },
    place,
    // first person: your own head, body and arms would fill the view, so only your hands show, on the rod
    setFirstPerson(on) { fp = !!on; head.visible = hat.visible = !on; tag.visible = !on; torso.visible = !on; lift.legL.visible = lift.legR.visible = !on; for (const a of arms) { a.up.visible = a.lo.visible = a.hand.visible = !on; } },
    onSplash(f) { splashCb = f; }, onRipple(f) { rippleCb = f; },
    frame,
    real,
    dispose() { world.remove(root, line, rig, fish, net, pole, ...ropes); root.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
