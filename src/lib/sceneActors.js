// ---- sceneActors: the rod, line, float, fish, splashes and rain of the Live Fishing View (2D canvas over the water) ----
// Everything is drawn from the angler's point of view: the rod comes in from the bottom right, its tip over the
// water, the line running to where it enters. The pose is a pure function of the phase and its age (liveEvents.js),
// so live viewing, reconnecting and replay scrubbing all land on the same picture; splashes are spawned as the age
// crosses their moment. The fish is FishDock's own species picture, bent along its body as it wriggles and scaled
// to the logged length. It's a reconstruction of a logged catch, and the app says so.

import { fishShape, buildFishMesh, bodyWidth, createFishRenderer, CURLED } from "./fish3d.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const ease = (f) => (f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f));
// smooth pseudo-random wobble
const wob = (t, s = 0) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 2.7 + s * 1.7) * 0.3 + Math.sin(t * 4.9 + s * 3.1) * 0.2;

const GUIDES = [0.42, 0.54, 0.64, 0.72, 0.79, 0.85, 0.9, 0.94, 0.975];

/** FishDock's rods: the colour of the whippings, trim and line, how far the blank bends under the same load, and how
 *  thick it is. A look and a feel for the animation, not a product description. */
export const ROD_STYLES = {
  light: { id: "light", name: "Light Pier", accent: [214, 52, 52], flex: 1.25, thick: 0.86 },
  allround: { id: "allround", name: "All-Rounder", accent: [40, 112, 236], flex: 1, thick: 1 },
  heavy: { id: "heavy", name: "Heavy Surf", accent: [214, 166, 60], flex: 0.78, thick: 1.15 },
};

// repeatable randomness per event (a replay looks the same; the next cast or splash doesn't)
function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// smooth 1D noise in -1..1 (for runs, dives and thrashing that never repeat)
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const h = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; }; return h(i) * (1 - u) + h(i + 1) * u; }

/** How each kind of fish fights: pull (rod load), tempo (tail beat and runs), erratic (darting), splashy (at the
 *  surface), flex (body bend), long (fight length), and body plan. A description of typical behaviour for the
 *  animation only; it isn't data shown to anglers. */
const FIGHT = {
  cod: { pull: 1.25, tempo: 0.75, erratic: 0.25, splashy: 0.2, flex: 0.85, long: 1.3 },
  bass: { pull: 1.1, tempo: 1.35, erratic: 0.55, splashy: 0.85, flex: 1.1, long: 1.1 },
  whiting: { pull: 0.55, tempo: 1.8, erratic: 0.85, splashy: 0.3, flex: 1.15, long: 0.6 },
  pouting: { pull: 0.55, tempo: 1.7, erratic: 0.8, splashy: 0.25, flex: 1.1, long: 0.6 },
  mackerel: { pull: 0.7, tempo: 2.1, erratic: 0.95, splashy: 0.55, flex: 1.2, long: 0.7 },
  garfish: { pull: 0.65, tempo: 2.0, erratic: 0.9, splashy: 0.9, flex: 1.3, long: 0.7 },
  pollack: { pull: 1.25, tempo: 1.1, erratic: 0.35, splashy: 0.25, flex: 1.0, long: 1.1 },
  coalfish: { pull: 1.2, tempo: 1.15, erratic: 0.4, splashy: 0.25, flex: 1.0, long: 1.1 },
  "ballan-wrasse": { pull: 1.15, tempo: 0.95, erratic: 0.3, splashy: 0.15, flex: 0.8, long: 0.9 },
  "black-bream": { pull: 0.9, tempo: 1.4, erratic: 0.6, splashy: 0.3, flex: 0.9, long: 0.8 },
  "thick-lipped-mullet": { pull: 1.1, tempo: 1.3, erratic: 0.6, splashy: 0.7, flex: 1.0, long: 1.1 },
  gurnard: { pull: 0.7, tempo: 1.2, erratic: 0.5, splashy: 0.2, flex: 0.8, long: 0.7 },
  plaice: { flat: true, headRight: true, pull: 0.8, tempo: 0.8, erratic: 0.3, splashy: 0.15, flex: 0.35, long: 0.8 },
  flounder: { flat: true, pull: 0.75, tempo: 0.85, erratic: 0.3, splashy: 0.15, flex: 0.35, long: 0.8 },
  dab: { flat: true, headRight: true, pull: 0.55, tempo: 1.0, erratic: 0.4, splashy: 0.1, flex: 0.3, long: 0.6 },
  sole: { flat: true, headRight: true, pull: 0.65, tempo: 0.9, erratic: 0.35, splashy: 0.1, flex: 0.4, long: 0.7 },
  "thornback-ray": { flat: true, ray: true, pull: 1.35, tempo: 0.5, erratic: 0.15, splashy: 0.1, flex: 0.2, long: 1.3 },
  conger: { eel: true, pull: 1.5, tempo: 0.85, erratic: 0.35, splashy: 0.35, flex: 2.0, long: 1.5 },
  eel: { eel: true, pull: 0.9, tempo: 1.1, erratic: 0.5, splashy: 0.3, flex: 2.2, long: 0.9 },
  "lesser-spotted-dogfish": { pull: 0.9, tempo: 0.8, erratic: 0.3, splashy: 0.15, flex: 1.5, long: 0.8 },
  smoothhound: { pull: 1.35, tempo: 1.0, erratic: 0.35, splashy: 0.2, flex: 1.4, long: 1.4 },
  tope: { pull: 1.6, tempo: 1.05, erratic: 0.3, splashy: 0.2, flex: 1.4, long: 1.7 },
  perch: { pull: 0.7, tempo: 1.5, erratic: 0.6, splashy: 0.4, flex: 1.0, long: 0.7 },
};
const FIGHT_BASE = { pull: 1, tempo: 1, erratic: 0.4, splashy: 0.3, flex: 1, long: 1, flat: false, ray: false, eel: false, headRight: false };
export const fightProfile = (species) => ({ ...FIGHT_BASE, ...(FIGHT[species] || {}) });
/** Seconds a fight with this fish typically lasts in the demo (longer for bigger, stronger fish). */
/** How hard this fish loads the rod (about 0.45 for a small whiting to 1.7 for a big tope or conger). Weight is the
 *  logged one, or estimated from length with a typical round-fish length-weight curve (for the animation only). */
export function fishLoad(species, lengthCm, weightKg) {
  const p = fightProfile(species), cm = clamp(lengthCm || 45, 8, 200);
  const kg = weightKg || 0.0000105 * cm ** 3.02;
  return clamp((0.5 + Math.sqrt(kg) * 0.45) * p.pull, 0.45, 1.7);
}
/** The landing's beats in seconds: up from below (T1), through the surface (T2), lifted clear (T3), the camera's close
 *  look (T4), swung in onto the pier (swingIn to end), then the catch card. Heavier fish take a little longer. */
export function landingTimes(species, lengthCm, weightKg) {
  const ts = clamp(0.85 + 0.15 * fishLoad(species, lengthCm, weightKg), 0.9, 1.12);
  const end = 7 * ts + 3;
  return { ts, T1: 1.6 * ts, T2: 2.9 * ts, T3: 4.7 * ts, T4: 7 * ts, swingIn: end - 1.1, end, card: end - 0.2 };
}
export function fightSeconds(species, lengthCm) {
  const p = fightProfile(species);
  return clamp(4 + 6 * p.long * p.pull * Math.sqrt((lengthCm || 40) / 45), 4, 18);
}

export function createActors(canvas, { onSound } = {}) {
  // the 3D fish (FishDock's own pictures lofted into light models); null without WebGL, then the flat bent picture
  let fish3 = null, fish3Tried = false, fish3For = null;
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, k = 1, map = [1, 1, 0, 0];
  let castRef = [0.5, 0.62], horizon = 0.42, floatRig = false, night = 0, windN = 0.3, windDir = 1, rain = 0;
  let fishImg = null, fishCut = false, particles = [], ripples = [], streaks = [];
  let reelA = 0, lastPhaseKey = "", prevAge = -1, lastT = 0, quality = 1, dusk = 0;
  let birds = [], nextFlock = 6 + Math.random() * 10;
  let prof = fightProfile(null), fishCm = 45, load = 1, waterTint = [0.12, 0.22, 0.25], rings = [];
  let rodStyle = ROD_STYLES.allround;
  const fishCanvas = document.createElement("canvas");
  const fctx = fishCanvas.getContext("2d");

  const toStage = (r) => [((r[0] - map[2]) / map[0]) * W, ((r[1] - map[3]) / map[1]) * H];
  const toRef = (x, y) => [(x / W) * map[0] + map[2], (y / H) * map[1] + map[3]];
  const depthAt = (y) => clamp((toRef(0, y)[1] - horizon) / Math.max(0.05, 1 - horizon), 0, 1);

  function addRipple(x, y, s = 1) { const [rx, ry] = toRef(x, y); ripples.push({ x: rx, y: ry, born: lastT, s }); if (ripples.length > 6) ripples.shift(); }
  /** A splash: a crown of droplets thrown up and out (biased to one side when the fish moves that way), a little
   *  mist, and a ring on the water. Every splash differs a little: size, spread, lean and drops. */
  function splash(x, y, size = 1, n = 22, { rnd = Math.random, dir = 0 } = {}) {
    const d = depthAt(y), sc = (0.35 + d) * k * size;
    n = Math.max(4, Math.round(n * quality * (0.8 + rnd() * 0.4)));
    const spread = 1.4 + rnd() * 0.9, lean = dir * (0.25 + rnd() * 0.35) + (rnd() - 0.5) * 0.3;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + lean + (rnd() - 0.5) * spread;
      const v = (50 + rnd() * 190) * sc;
      particles.push({ x: x + (rnd() - 0.5) * 12 * sc, y, vx: Math.cos(a) * v * 0.75, vy: Math.sin(a) * v, life: 0, max: 0.45 + rnd() * 0.8, r: (0.7 + rnd() * 2.4) * sc, kind: "drop", floor: y + 4 * sc });
    }
    for (let i = 0; i < Math.round(4 * quality); i++) particles.push({ x: x + (rnd() - 0.5) * 26 * sc, y: y - rnd() * 8 * sc, vx: (rnd() - 0.5) * 22 * sc + dir * 8 * sc, vy: -9 * sc, life: 0, max: 0.8 + rnd() * 0.6, r: (7 + rnd() * 11) * sc, kind: "mist", floor: 1e9 });
    addRipple(x, y, Math.min(1.4, size));
  }

  // ---- layout ----
  function layout() {
    const land = W / H >= 1.05;
    const B = land ? [W * 1.02, H * 1.14] : [W * 1.06, H * 1.1];
    const T = land ? [W * 0.68, H * 0.15] : [W * 0.6, H * 0.17];
    return { B, T, L: Math.hypot(T[0] - B[0], T[1] - B[1]), th0: Math.atan2(T[1] - B[1], T[0] - B[0]) };
  }

  /** The blank as a chain of short segments: the whole rod bends progressively (more towards the tip) under load,
   *  and the soft tip has its own quicker flex. */
  function rodPoints(B, L, th, kappa, tipFlex = 0) {
    const N = 30, pts = [B.slice()], ang = [];
    let x = B[0], y = B[1];
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N;
      const a = th - kappa * s * s * 1.15 - tipFlex * Math.pow(s, 6) * 2;
      ang.push(a);
      x += (Math.cos(a) * L) / N; y += (Math.sin(a) * L) / N;
      pts.push([x, y]);
    }
    return { pts, ang };
  }
  const at = (rod, s) => { const i = clamp(s * (rod.pts.length - 1), 0, rod.pts.length - 1.001); const j = Math.floor(i), f = i - j; return [lerp(rod.pts[j][0], rod.pts[j + 1][0], f), lerp(rod.pts[j][1], rod.pts[j + 1][1], f), rod.ang[Math.min(j, rod.ang.length - 1)]]; };
  const down = (a) => { let nx = -Math.sin(a), ny = Math.cos(a); if (ny < 0) { nx = -nx; ny = -ny; } return [nx, ny]; };

  // ---- drawing ----
  // The rod: a black carbon blank with the FishDock name, whippings in the rod's colour at every guide, lined guides,
  // black shrink grips either side of a chrome-collared reel seat, and a black and silver reel with line in the
  // rod's colour on the spool (FishDock's own rod design).
  const shade = (c, f, add = 0) => `rgb(${Math.round(c[0] * f + add)},${Math.round(c[1] * f + add)},${Math.round(c[2] * f + add)})`;
  const halfW = (s) => (lerp(21 * k, 2.2 * k, Math.pow(s, 0.75)) / 2) * rodStyle.thick;
  /** A short stretch of something round on the blank (a whipping, a collar, a grip): a stroke along the rod with
   *  light across it, so it reads as a cylinder. */
  function sleeve(rod, s0, s1, width, base, { metal = false, lit = 1, gloss = 0.25 } = {}) {
    const p0 = at(rod, s0), p1 = at(rod, s1), a = p0[2];
    const nx = -Math.sin(a) * width * 0.5, ny = Math.cos(a) * width * 0.5;
    const g = ctx.createLinearGradient(p0[0] + nx, p0[1] + ny, p0[0] - nx, p0[1] - ny);
    if (metal) {
      g.addColorStop(0, shade(base, 0.35 * lit, 4)); g.addColorStop(0.35, shade(base, 0.8 * lit, 8)); g.addColorStop(0.55, shade([255, 255, 255], 0.95 * lit, 6));
      g.addColorStop(0.7, shade(base, 0.7 * lit, 6)); g.addColorStop(1, shade(base, 0.3 * lit, 4));
    } else {
      g.addColorStop(0, shade(base, 0.45 * lit, 2)); g.addColorStop(0.5, shade(base, 0.9 * lit, 3)); g.addColorStop(0.62, shade(base.map((v) => v + (255 - v) * gloss), lit, 3)); g.addColorStop(1, shade(base, 0.35 * lit, 2));
    }
    ctx.strokeStyle = g; ctx.lineWidth = width; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  }
  function drawRod(rod) {
    const n = rod.pts.length, lit = 1 - night * 0.75, acc = rodStyle.accent;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), a = rod.ang[Math.min(i, rod.ang.length - 1)], hw = halfW(s);
      left.push([rod.pts[i][0] - Math.sin(a) * hw, rod.pts[i][1] + Math.cos(a) * hw]);
      right.push([rod.pts[i][0] + Math.sin(a) * hw, rod.pts[i][1] - Math.cos(a) * hw]);
    }
    // the blank: black carbon, a soft sheen and one sharp highlight
    const mid = rod.pts[Math.floor(n * 0.45)], ma = rod.ang[Math.floor(n * 0.45)];
    const nx = -Math.sin(ma) * 6 * k * rodStyle.thick, ny = Math.cos(ma) * 6 * k * rodStyle.thick;
    const g = ctx.createLinearGradient(mid[0] + nx, mid[1] + ny, mid[0] - nx, mid[1] - ny);
    g.addColorStop(0, shade([6, 7, 9], lit, 3)); g.addColorStop(0.45, shade([26, 29, 34], lit, 4)); g.addColorStop(0.66, shade([92, 100, 112], lit, 8));
    g.addColorStop(0.72, shade([30, 33, 38], lit, 4)); g.addColorStop(1, shade([5, 6, 8], lit, 3));
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 6 * k; ctx.shadowOffsetY = 3 * k;
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    // a faint carbon weave on the thicker part of the blank
    ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.045 * lit})`; ctx.lineWidth = halfW(0.4) * 1.1; ctx.setLineDash([1.6 * k, 1.6 * k]);
    ctx.beginPath(); for (let i = Math.floor(n * 0.34); i < Math.floor(n * 0.62); i++) i === Math.floor(n * 0.34) ? ctx.moveTo(rod.pts[i][0], rod.pts[i][1]) : ctx.lineTo(rod.pts[i][0], rod.pts[i][1]);
    ctx.stroke(); ctx.restore();
    // butt grip, reel seat with chrome collars and coloured trim rings, fore grip
    const gw = 31 * k * rodStyle.thick;
    sleeve(rod, 0, 0.165, gw, [22, 23, 25], { lit, gloss: 0.12 });
    sleeve(rod, 0.165, 0.178, gw * 1.04, [200, 205, 212], { metal: true, lit });
    sleeve(rod, 0.178, 0.186, gw * 0.98, acc, { lit, gloss: 0.4 });
    sleeve(rod, 0.186, 0.25, gw * 0.84, [16, 17, 19], { lit, gloss: 0.3 });
    // threads on the seat
    ctx.save(); ctx.strokeStyle = `rgba(200,206,214,${0.22 * lit})`; ctx.lineWidth = gw * 0.8; ctx.setLineDash([0.9 * k, 2.4 * k]);
    { const p0 = at(rod, 0.192), p1 = at(rod, 0.21); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    ctx.restore();
    sleeve(rod, 0.25, 0.258, gw * 0.98, acc, { lit, gloss: 0.4 });
    sleeve(rod, 0.258, 0.272, gw * 1.04, [200, 205, 212], { metal: true, lit });
    sleeve(rod, 0.272, 0.345, gw * 0.9, [22, 23, 25], { lit, gloss: 0.12 });
    // grip texture: fine speckle of the shrink tube
    ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${0.035 * lit})`; ctx.lineWidth = gw * 0.7; ctx.setLineDash([0.7 * k, 1.9 * k]);
    for (const [s0, s1] of [[0, 0.16], [0.276, 0.34]]) { const p0 = at(rod, s0), p1 = at(rod, s1); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    ctx.restore();
    sleeve(rod, 0.345, 0.352, halfW(0.35) * 2.5, [200, 205, 212], { metal: true, lit });
    sleeve(rod, 0.352, 0.36, halfW(0.355) * 2.35, acc, { lit, gloss: 0.4 });
    // the name on the blank, along the rod, with a swoosh in the rod's colour
    {
      const [x, y, a] = at(rod, 0.39), hw = halfW(0.39);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const fs = Math.max(5, hw * 1.55);
      ctx.font = `italic 700 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(238,242,248,${0.85 * lit + 0.1})`; ctx.fillText("FishDock", 0, -hw * 0.08);
      ctx.strokeStyle = shade(acc, lit, 10); ctx.lineWidth = Math.max(0.6, fs * 0.12);
      const tw = ctx.measureText("FishDock").width;
      ctx.beginPath(); ctx.moveTo(-tw * 0.45, hw * 0.55); ctx.quadraticCurveTo(0, hw * 0.25, tw * 0.5, hw * 0.4); ctx.stroke();
      ctx.restore();
    }
    // a thin highlight along the blank
    ctx.strokeStyle = `rgba(255,255,255,${0.16 * lit})`; ctx.lineWidth = Math.max(0.6, 1.1 * k);
    ctx.beginPath();
    for (let i = Math.floor(n * 0.36); i < n - 1; i++) { const a = rod.ang[Math.min(i, rod.ang.length - 1)], hw = halfW(i / (n - 1)) * 0.45; const p = [rod.pts[i][0] + Math.sin(a) * hw, rod.pts[i][1] - Math.cos(a) * hw]; i === Math.floor(n * 0.36) ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
    return at(rod, 0.21);
  }

  function guidePoints(rod) {
    return GUIDES.map((s) => {
      const [x, y, a] = at(rod, s);
      const [dx, dy] = down(a);
      const r = Math.max(1.8 * k, 22 * k * Math.pow(1 - s, 1.3));
      const off = r * 1.45 + lerp(9 * k, 1.2 * k, s);
      return { x, y, cx: x + dx * off, cy: y + dy * off, r, a, s };
    });
  }
  function drawGuides(gs, rod) {
    const lit = 1 - night * 0.7, acc = rodStyle.accent;
    for (const g of gs) {
      // the whipping on the blank, in the rod's colour with a dark trim either side
      const hw = halfW(g.s), len = Math.max(0.006, 0.018 * (1 - g.s) + 0.004);
      sleeve(rod, g.s - len, g.s + len, hw * 2.5, [12, 13, 15], { lit, gloss: 0.3 });
      sleeve(rod, g.s - len * 0.75, g.s + len * 0.75, hw * 2.6, acc, { lit, gloss: 0.45 });
      // frame: gunmetal with a chrome edge
      ctx.lineCap = "round";
      ctx.strokeStyle = shade([28, 31, 36], lit, 5); ctx.lineWidth = Math.max(1, 1.9 * k * (0.5 + g.r / (14 * k)));
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.cx, g.cy); ctx.stroke();
      ctx.strokeStyle = `rgba(220,226,232,${0.35 * lit})`; ctx.lineWidth = Math.max(0.5, 0.6 * k);
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.cx, g.cy); ctx.stroke();
      // ring: a chrome frame round a dark lined insert
      ctx.save(); ctx.translate(g.cx, g.cy); ctx.rotate(g.a);
      const rw = Math.max(0.9, 1.6 * k * (g.r / (10 * k)) + 0.6);
      ctx.strokeStyle = shade([24, 26, 30], lit, 4); ctx.lineWidth = rw * 1.7;
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 0.35, g.r, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(${Math.round(205 * lit + 25)},${Math.round(212 * lit + 25)},${Math.round(220 * lit + 25)},0.95)`; ctx.lineWidth = rw * 0.55;
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 0.35 + rw * 0.6, g.r + rw * 0.6, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawReel(seat, a, spin) {
    const [dx, dy] = down(a);
    const k0 = k, acc = rodStyle.accent;
    k = k0 * 2.3; // the reel is close to the camera
    const c = [seat[0] + dx * 24 * k, seat[1] + dy * 24 * k];
    const lit = 1 - night * 0.7;
    ctx.save();
    ctx.lineCap = "round";
    // foot and stem
    ctx.strokeStyle = shade([22, 24, 27], lit, 5); ctx.lineWidth = 6 * k;
    ctx.beginPath(); ctx.moveTo(seat[0], seat[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    ctx.strokeStyle = `rgba(210,216,224,${0.4 * lit})`; ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.moveTo(seat[0] + dy * 2 * k, seat[1] - dx * 2 * k); ctx.lineTo(c[0] + dy * 2 * k, c[1] - dx * 2 * k); ctx.stroke();
    ctx.translate(c[0], c[1]); ctx.rotate(a);
    // body: black, with a silver side plate ring
    const bg = ctx.createLinearGradient(0, -14 * k, 0, 16 * k);
    bg.addColorStop(0, shade([64, 68, 76], lit, 8)); bg.addColorStop(0.45, shade([20, 22, 25], lit, 5)); bg.addColorStop(1, shade([8, 9, 10], lit, 4));
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(-6 * k, 4 * k, 17 * k, 13 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(200,206,214,${0.55 * lit})`; ctx.lineWidth = 1.3 * k;
    ctx.beginPath(); ctx.ellipse(-7 * k, 4 * k, 10 * k, 8.5 * k, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = shade(acc, lit * 0.9, 8); ctx.lineWidth = 0.9 * k;
    ctx.beginPath(); ctx.ellipse(-7 * k, 4 * k, 7.5 * k, 6.2 * k, 0, 0, TAU); ctx.stroke();
    // rotor and spool, with line in the rod's colour wound on it
    const rg = ctx.createLinearGradient(0, -16 * k, 0, 16 * k);
    rg.addColorStop(0, shade([90, 96, 104], lit, 8)); rg.addColorStop(0.5, shade([24, 26, 29], lit, 4)); rg.addColorStop(1, shade([10, 11, 12], lit, 3));
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(11 * k, 3 * k, 5 * k, 14 * k, 0, 0, TAU); ctx.fill();
    const sg = ctx.createLinearGradient(0, -14 * k, 0, 14 * k);
    sg.addColorStop(0, shade(acc.map((v) => v + (255 - v) * 0.5), lit, 10)); sg.addColorStop(0.5, shade(acc, lit * 0.85, 6)); sg.addColorStop(1, shade(acc, lit * 0.35, 3));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(17 * k, 3 * k, 5.2 * k, 12.5 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * lit})`; ctx.lineWidth = 0.6 * k;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(15.5 * k + i * 0.7 * k, 3 * k, 4.2 * k, 11.5 * k, 0, -1.25, 1.25); ctx.stroke(); }
    // chrome spool lip
    ctx.strokeStyle = `rgba(${Math.round(215 * lit + 25)},${Math.round(220 * lit + 25)},${Math.round(226 * lit + 25)},0.95)`; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); ctx.ellipse(21.5 * k, 3 * k, 3.6 * k, 13 * k, 0, 0, TAU); ctx.stroke();
    // bail arm
    ctx.strokeStyle = `rgba(${Math.round(195 * lit + 20)},${Math.round(200 * lit + 20)},${Math.round(206 * lit + 20)},0.9)`; ctx.lineWidth = 1.4 * k;
    ctx.beginPath(); ctx.ellipse(18 * k, 3 * k, 8 * k, 18 * k, 0, -2.2 + Math.sin(spin) * 0.15, 0.6); ctx.stroke();
    // handle: black arm with a silver edge, turning when the angler reels
    const hx = -8 * k, hy = 4 * k, R = 15 * k;
    const kx = hx + Math.cos(spin) * R, ky = hy + Math.sin(spin) * R * 0.55 - 14 * k;
    ctx.strokeStyle = shade([22, 24, 27], lit, 5); ctx.lineWidth = 3.2 * k;
    ctx.beginPath(); ctx.moveTo(hx, hy - 14 * k); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.strokeStyle = `rgba(210,216,224,${0.5 * lit})`; ctx.lineWidth = 0.8 * k;
    ctx.beginPath(); ctx.moveTo(hx, hy - 14 * k); ctx.lineTo(kx, ky); ctx.stroke();
    const kg = ctx.createRadialGradient(kx - 2 * k, ky - 2 * k, 0.5, kx, ky, 6 * k);
    kg.addColorStop(0, shade([110, 116, 124], lit, 10)); kg.addColorStop(1, shade([12, 13, 15], lit, 4));
    ctx.fillStyle = kg; ctx.beginPath(); ctx.ellipse(kx, ky, 4.6 * k, 6 * k, 0, 0, TAU); ctx.fill();
    ctx.restore();
    const out = [c[0] + Math.cos(a) * 18 * k, c[1] + Math.sin(a) * 18 * k];
    k = k0;
    return out;
  }

  function lineStroke(alpha = 0.55) {
    ctx.strokeStyle = night > 0.6 ? `rgba(200,215,230,${alpha * 0.45})` : `rgba(226,236,246,${alpha})`;
    ctx.lineWidth = Math.max(0.7, 0.9 * k);
  }
  function drawLineThroughRod(spoolExit, gs, tip) {
    lineStroke(0.5);
    ctx.beginPath(); ctx.moveTo(spoolExit[0], spoolExit[1]);
    for (const g of gs) ctx.lineTo(g.cx, g.cy - g.r * 0.4);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
  }
  function drawLineOut(tip, end, slack, t, hum = 0) {
    lineStroke(0.6);
    // slack line sags and blows with the wind; tight line hums with a tiny fast vibration
    const mx = (tip[0] + end[0]) / 2 + windDir * windN * 22 * k * slack + Math.sin(t * 1.7) * 2 * k * slack + Math.sin(t * 61) * hum * 0.8 * k;
    const my = (tip[1] + end[1]) / 2 + slack * Math.hypot(end[0] - tip[0], end[1] - tip[1]) * 0.18 + Math.sin(t * 53) * hum * 0.6 * k;
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.quadraticCurveTo(mx, my, end[0], end[1]); ctx.stroke();
  }
  function drawTipLight(tip) {
    if (night < 0.3) return;
    const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 14 * k);
    g.addColorStop(0, `rgba(170,255,190,${0.9 * night})`); g.addColorStop(0.25, `rgba(90,255,140,${0.45 * night})`); g.addColorStop(1, "rgba(60,255,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 14 * k, 0, TAU); ctx.fill();
  }
  function drawFloat(x, y, dip, t) {
    const d = depthAt(y), s = (0.4 + d * 1.2) * k;
    const bob = Math.sin(t * 2.2) * 1.2 * s - dip * 9 * s;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 2 * s, 5 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
    if (dip < 0.9) {
      const g = ctx.createLinearGradient(-2 * s, 0, 2 * s, 0); g.addColorStop(0, "#c2410c"); g.addColorStop(0.4, "#fb923c"); g.addColorStop(1, "#9a3412");
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-1.6 * s, -11 * s * (1 - dip), 3.2 * s, 11 * s * (1 - dip) + 1, 1.5 * s) : ctx.rect(-1.6 * s, -11 * s * (1 - dip), 3.2 * s, 11 * s * (1 - dip) + 1); ctx.fill();
    }
    ctx.restore();
    return [x, y + bob - 10 * s * (1 - dip)];
  }

  /** A bend for the fish's body: a curl plus a travelling wave that grows towards the tail (radians along u). */
  function bendFn(curl, amp, phase) {
    const lam = prof.eel ? 1.6 : 0.85;
    const wave = (u) => amp * Math.sin(TAU * u * lam - phase) * Math.pow(0.12 + u, 1.5);
    const f = (u) => curl * u * u + wave(u);
    // for the 3D fish: the swimming wave goes side to side (as a real fish's does), a little of it and the curl
    // bend it in the picture's plane too, so it reads from a side-on view
    f.lat = (u) => wave(u) * 1.1 + curl * 0.35 * u * u;
    f.dv = (u) => curl * 0.8 * u * u + wave(u) * 0.35;
    return f;
  }
  /** The light on the 3D fish for the hour: a soft sky, the low warm sun's edge at dusk, little at night. */
  function fishLight() {
    const day = clamp(1 - night - dusk, 0, 1);
    const amb = [0.62 * day + 0.46 * dusk + 0.2 * night, 0.62 * day + 0.42 * dusk + 0.24 * night, 0.62 * day + 0.42 * dusk + 0.32 * night];
    const dif = [0.5 * day + 0.42 * dusk + 0.08 * night, 0.5 * day + 0.32 * dusk + 0.09 * night, 0.48 * day + 0.26 * dusk + 0.12 * night];
    const rim = [0.18 * day + 0.5 * dusk + 0.05 * night, 0.2 * day + 0.32 * dusk + 0.07 * night, 0.24 * day + 0.2 * dusk + 0.12 * night];
    return { amb, dif, rim, dir: [-0.35, -0.8, 0.5], spec: 0.45 * day + 0.35 * dusk + 0.1 * night };
  }
  /** The fish drawn by the 3D renderer into the fish canvas, or null to use the flat picture. */
  function draw3d(st) {
    if (!fish3 || !fish3.ready || fish3For !== fishImg) return null;
    const out = fish3.render({ anchor: st.anchor, rot: st.rot, flip: !!st.flip, twist: st.twist || 0, yaw: st.yaw || 0, len: st.len, lat: st.bend.lat || (() => 0), dv: st.bend.dv || st.bend, t: lastT, fin: 1, wing: prof.ray ? 0.05 * Math.sin(lastT * 4.5) : 0 }, fishLight());
    if (!out) return null;
    const { x, y, w: fw, h: fh } = out;
    if (fishCanvas.width < fw || fishCanvas.height < fh) { fishCanvas.width = Math.max(fw, fishCanvas.width); fishCanvas.height = Math.max(fh, fishCanvas.height); }
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fishCanvas.width, fishCanvas.height);
    fctx.drawImage(fish3.canvas, 0, out.sy, fw, fh, 0, 0, fw, fh);
    const pts = []; let low = null;
    for (let i = 0; i < out.spine.length; i += 2) { const q = [out.spine[i], out.spine[i + 1]]; pts.push(q); if (!low || q[1] > low[1]) low = q; }
    return { x0: x, y0: y, fw, fh, pts, low, half: st.len * 0.11 * Math.max(0.3, Math.abs(Math.cos(st.twist || 0))) };
  }
  /** The fish as a bent strip of its own picture: slices laid along a curved spine, so it flexes from head to tail
   *  rather than sliding as a flat picture. Drawn into its own canvas; the part under the waterline is tinted and
   *  faded by the water. Returns where the mouth (the hook) is. */
  function renderFish(st) {
    if (!fishImg || !fishCut || st.alpha <= 0) return null;
    const d = draw3d(st) || draw2d(st);
    if (!d) return [st.anchor[0], st.anchor[1]];
    const { x0, y0, fw, fh, pts, low, half } = d, y1 = y0 + fh;
    const wY = st.waterY;
    // above the water: as it is
    if (wY == null || wY > y0) {
      ctx.save(); ctx.globalAlpha = st.alpha;
      if (wY != null && wY >= 0) { ctx.beginPath(); ctx.rect(0, 0, W, wY); ctx.clip(); }
      if (wY == null || wY >= 0) ctx.drawImage(fishCanvas, 0, 0, fw, fh, x0, y0, fw, fh);
      ctx.restore();
    }
    // below the water: tinted by it and fading with depth
    if (wY != null && (wY < 0 || wY < y1)) {
      fctx.globalCompositeOperation = "source-atop";
      fctx.fillStyle = `rgba(${Math.round(waterTint[0] * 255)},${Math.round(waterTint[1] * 255)},${Math.round(waterTint[2] * 255)},0.62)`;
      fctx.fillRect(0, 0, fw, fh);
      fctx.globalCompositeOperation = "source-over";
      ctx.save(); ctx.globalAlpha = st.alpha * st.under;
      if (wY >= 0) { ctx.beginPath(); ctx.rect(0, wY, W, H - wY); ctx.clip(); }
      ctx.drawImage(fishCanvas, 0, 0, fw, fh, x0, y0, fw, fh);
      ctx.restore();
      // where the body cuts the surface: a bright, broken waterline
      if (wY >= 0 && y0 < wY && y1 > wY) {
        let cx = null; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1][1], b = pts[i][1]; if ((a - wY) * (b - wY) <= 0) { cx = pts[i][0]; break; } }
        if (cx != null) { ctx.strokeStyle = `rgba(235,242,248,${0.45 - night * 0.25})`; ctx.lineWidth = Math.max(1, 1.6 * k); ctx.beginPath(); ctx.ellipse(cx, wY, half * 0.9, half * 0.22, 0, 0, TAU); ctx.stroke(); }
      }
    }
    // water running off: drips from the lowest point and along the body while it's wet
    const fl = st.floor ?? wY;
    if (st.drip && fl != null && fl >= 0 && low && low[1] < fl && seedR() < st.drip * 0.9) {
      const q = pts[Math.floor(seedR() * pts.length)];
      const src = seedR() < 0.55 ? low : q;
      particles.push({ x: src[0] + (seedR() - 0.5) * 4 * k, y: src[1], vx: (seedR() - 0.5) * 18 * k, vy: 10 * k, life: 0, max: 1.1, r: (0.7 + seedR() * 1.5) * k, kind: "drop", floor: fl, ring: true });
    }
    return [st.anchor[0], st.anchor[1]];
  }
  /** The flat fallback: the picture as a bent strip of slices along a curved spine. */
  function draw2d(st) {
    const img = fishImg, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const u0 = 0.02, u1 = 0.985, N = 24, AX = 0.52;
    const s = st.len / (iw * 0.9);
    const flat = prof.flat ? 1 + 0.12 * Math.sin(lastT * (prof.ray ? 4.5 : 7)) : 1; // a ray's wings, a flatfish's flutter
    // rolling about its own spine: the body narrows to its edge and shows the other flank (mirrored) as it turns
    const cr = Math.cos(st.twist || 0), sy = (st.flip ? -1 : 1) * Math.sign(cr || 1) * Math.max(0.14, Math.abs(cr));
    const pts = [];
    let x = 0, y = 0;
    for (let i = 0; i <= N; i++) {
      const u = u0 + ((u1 - u0) * i) / N, ang = st.rot + st.bend(u);
      pts.push([x, y, ang, u]);
      x += (Math.cos(ang) * (u1 - u0) * iw * s) / N; y += (Math.sin(ang) * (u1 - u0) * iw * s) / N;
    }
    const mi = ((0.06 - u0) / (u1 - u0)) * N, j = Math.floor(mi), fr = mi - j;
    const mx0 = lerp(pts[j][0], pts[j + 1][0], fr), my0 = lerp(pts[j][1], pts[j + 1][1], fr);
    const ox = st.anchor[0] - mx0, oy = st.anchor[1] - my0;
    const half = ih * s * 0.62 * flat * Math.abs(sy);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, low = null;
    for (const p of pts) { const px = p[0] + ox, py = p[1] + oy; x0 = Math.min(x0, px - half); y0 = Math.min(y0, py - half); x1 = Math.max(x1, px + half); y1 = Math.max(y1, py + half); if (!low || py > low[1]) low = [px, py]; }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const fw = Math.ceil(x1 - x0) + 2, fh = Math.ceil(y1 - y0) + 2;
    if (fw < 2 || fh < 2 || fw > 4096 || fh > 4096) return null;
    if (fishCanvas.width < fw || fishCanvas.height < fh) { fishCanvas.width = Math.max(fw, fishCanvas.width); fishCanvas.height = Math.max(fh, fishCanvas.height); }
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fw, fh);
    for (let i = 0; i < N; i++) {
      const p = pts[i], du = (u1 - u0) / N;
      fctx.save();
      fctx.translate(p[0] + ox - x0, p[1] + oy - y0); fctx.rotate(p[2]);
      fctx.scale(1, sy); // facing the other way (mirrored so its back stays up), or rolling
      fctx.drawImage(img, p[3] * iw, 0, du * iw + 1, ih, 0, -AX * ih * s * flat, du * iw * s + 0.9, ih * s * flat);
      fctx.restore();
    }
    // wet: a soft sheen across the body, darker in the dark
    fctx.globalCompositeOperation = "source-atop";
    const sh = fctx.createLinearGradient(0, 0, fw * 0.3, fh);
    sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.42, `rgba(255,255,255,${0.16 - night * 0.1})`); sh.addColorStop(0.55, "rgba(255,255,255,0)");
    fctx.fillStyle = sh; fctx.fillRect(0, 0, fw, fh);
    // the light of the hour: a painted picture would glow at dusk, a real fish goes dim with a warm edge from the sky
    const day = clamp(1 - night - dusk, 0, 1), edge = 1 - Math.abs(cr);
    fctx.fillStyle = `rgba(${Math.round(18 * day + 38 * dusk + 8 * night)},${Math.round(26 * day + 28 * dusk + 14 * night)},${Math.round(34 * day + 36 * dusk + 30 * night)},${0.1 * day + 0.42 * dusk + 0.7 * night + 0.22 * edge})`;
    fctx.fillRect(0, 0, fw, fh);
    if (dusk > 0.1) {
      const rim = fctx.createLinearGradient(0, 0, 0, fh);
      rim.addColorStop(0, `rgba(255,170,110,${0.2 * dusk})`); rim.addColorStop(0.5, "rgba(255,170,110,0)");
      fctx.fillStyle = rim; fctx.fillRect(0, 0, fw, fh);
    }
    fctx.globalCompositeOperation = "source-over";
    return { x0, y0, fw, fh, pts: pts.map((p) => [p[0] + ox, p[1] + oy]), low, half };
  }

  function stepParticles(dt) {
    const g = H * 1.6;
    particles = particles.filter((p) => (p.life += dt) < p.max);
    for (const p of particles) {
      if (p.kind === "drop") {
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        // a drop meeting the water leaves a tiny ring
        if (p.y > p.floor && p.vy > 0) { p.life = p.max; if (p.ring && rings.length < 24) rings.push({ x: p.x, y: p.floor, life: 0, max: 0.9 + Math.random() * 0.5, r: p.r }); }
      } else { p.x += p.vx * dt; p.y += p.vy * dt; p.r *= 1 + dt * 0.6; }
    }
    rings = rings.filter((q) => (q.life += dt) < q.max);
  }
  function drawRings() {
    if (!rings.length) return;
    ctx.lineWidth = Math.max(0.6, 0.8 * k);
    for (const q of rings) {
      const f = q.life / q.max, rr = q.r * (2 + f * 9);
      ctx.strokeStyle = `rgba(225,236,244,${(1 - f) * (0.4 - night * 0.2)})`;
      ctx.beginPath(); ctx.ellipse(q.x, q.y, rr, rr * 0.28, 0, 0, TAU); ctx.stroke();
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const f = 1 - p.life / p.max;
      if (p.kind === "drop") { ctx.fillStyle = `rgba(232,242,250,${0.75 * f})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
      else { const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); gr.addColorStop(0, `rgba(235,242,248,${0.22 * f})`); gr.addColorStop(1, "rgba(235,242,248,0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
    }
  }
  /** Now and then a few gulls glide across the sky, wings beating, then gliding (none at night). */
  function stepBirds(t, dt) {
    if (t > nextFlock && night < 0.5) {
      nextFlock = t + 18 + Math.random() * 30;
      const dir = Math.random() < 0.5 ? 1 : -1, n = 1 + Math.floor(Math.random() * 3);
      const [, hy] = toStage([0, horizon]);
      const y0 = hy * (0.25 + Math.random() * 0.5), size = (5 + Math.random() * 6) * k;
      for (let i = 0; i < n; i++) birds.push({ x: dir > 0 ? -40 * k - i * 30 * k : W + 40 * k + i * 30 * k, y: y0 + (Math.random() - 0.5) * 30 * k, vx: dir * (28 + Math.random() * 14) * k * (1 + windN * 0.6), s: size * (0.8 + Math.random() * 0.4), ph: Math.random() * 6, bob: Math.random() * 6 });
    }
    birds = birds.filter((b) => b.x > -80 * k && b.x < W + 80 * k);
    const shade = night > 0.3 ? 0.25 : dusk > 0.4 ? 0.15 : 0.32;
    ctx.strokeStyle = `rgba(${Math.round(30 + 20 * (1 - dusk))},${Math.round(34 + 20 * (1 - dusk))},${Math.round(40 + 20 * (1 - dusk))},${0.75 - shade})`;
    ctx.lineCap = "round";
    for (const b of birds) {
      b.x += b.vx * dt; b.y += Math.sin(t * 0.7 + b.bob) * 4 * k * dt;
      const beat = Math.sin(t * 0.25 + b.ph) > 0.2 ? Math.sin(t * 9 + b.ph) : 0.25; // flaps, then a glide
      const wy = b.s * (0.15 + 0.45 * beat), dir = Math.sign(b.vx);
      ctx.lineWidth = Math.max(1, b.s * 0.22);
      ctx.beginPath();
      ctx.moveTo(b.x - b.s * dir * 0.1 - b.s, b.y - wy);
      ctx.quadraticCurveTo(b.x - b.s * 0.45, b.y - wy * 0.2 - b.s * 0.25, b.x, b.y);
      ctx.quadraticCurveTo(b.x + b.s * 0.45, b.y - wy * 0.2 - b.s * 0.25, b.x + b.s, b.y - wy);
      ctx.stroke();
    }
  }

  function drawRain(dt) {
    const want = Math.round(clamp(rain, 0, 1) * 260 * quality);
    while (streaks.length < want) streaks.push({ x: Math.random() * W, y: Math.random() * H, v: (900 + Math.random() * 700) * (H / 600), l: 8 + Math.random() * 14 });
    streaks.length = want;
    if (!want) return;
    const slant = windDir * windN * 0.35;
    ctx.strokeStyle = `rgba(210,222,235,${0.18 + 0.1 * (1 - night)})`; ctx.lineWidth = Math.max(0.6, 0.8 * k);
    ctx.beginPath();
    for (const s of streaks) {
      s.y += s.v * dt; s.x += s.v * dt * slant;
      if (s.y > H) { s.y = -20; s.x = Math.random() * W; }
      if (s.x > W) s.x -= W; if (s.x < 0) s.x += W;
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.l * slant * k, s.y - s.l * k);
    }
    ctx.stroke();
  }

  // ---- the rod's springiness: it follows where it's pulled, with a natural overshoot ----
  const rodS = { k: 0.04, kv: 0, tip: 0, tipv: 0, th: null, thv: 0 };
  function springTo(o, key, vkey, target, w, zeta, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = w * w * (target - o[key]) - 2 * zeta * w * o[vkey]; o[vkey] += a * h; o[key] += o[vkey] * h; }
  }
  let lastTip = null, seedR = Math.random, P = {}, roll = null, nextRollT = 0, lastPhase = "", fightPos = null, fromPos = null, LT = landingTimes(null, 45);

  // ---- one frame ----
  function frame(t, info) {
    const dt = clamp(t - lastT, 0, 0.1);
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    const { phase = "idle", age = 0, ev = null } = info || {};
    const key = `${phase}|${info?.since || 0}`;
    if (key !== lastPhaseKey) {
      lastPhaseKey = key; prevAge = age > 1.2 ? age : -1;
      // each event gets its own, repeatable variation (a replay looks the same; the next cast doesn't)
      seedR = rng(hashSeed(`${info?.since || 0}|${ev?.id || ev?.seq || ""}|${phase}`));
      P = { strong: seedR() < 0.35 + 0.3 * prof.pull, s1: seedR() * 10, s2: seedR() * 10, s3: seedR() * 10, size: 0.85 + seedR() * 0.4, side: seedR() < 0.5 ? -1 : 1 };
      // when a lifted fish kicks: a few times, sooner and more often for lively fish
      P.kicks = [0, 1, 2, 3].map((i) => LT.T3 - 0.6 + i * (0.9 + seedR() * 0.8) / prof.tempo + seedR() * 0.3).slice(0, prof.erratic > 0.5 ? 4 : 3);
      roll = null; nextRollT = t + 2 + seedR() * 3;
      // the landing carries on from wherever the fight had got to (a replay starts from the cast)
      fromPos = phase === "landing" && lastPhase === "hooked" ? fightPos : null;
      lastPhase = phase;
    }
    const crossed = (m) => prevAge < m && age >= m;
    const { B, L, th0 } = layout();
    if (rodS.th == null) rodS.th = th0;
    const E0 = toStage(castRef);
    const land = W / H >= 1.05;
    const near = [W * (land ? 0.47 : 0.45), lerp(E0[1], H * 0.92, 0.48)];
    // how big a fish looks: about H/640 per cm at the surface below the pier, smaller further out (so a 55 cm cod
    // there is under a tenth of the height); about H/400 when it's lifted up towards the angler
    const pxPerCm = H / 640;
    let thT = th0, kT = 0.035, tipT = 0, slack = 1, end = E0, showLine = phase !== "ended" && phase !== "idle", lead = null, spinning = false, floatDip = 0;
    let fishSt = null, turb = [], shake = 0, push = 0, focus = null, thW = 9;
    // a hand on the rod and the wind on the tip: small, never still, never repeating
    thT += wob(t * 0.55, 2) * 0.0035 + wob(t * 0.21, 5) * 0.003;
    tipT += wob(t * 2.4, 1) * 0.012 * (0.25 + windN);

    if (phase === "waiting" && !floatRig) kT += Math.max(0, Math.sin(t * 0.78)) * 0.012 * (0.5 + windN); // the swell nodding the tip
    if (phase === "cast") {
      thW = 24;
      if (age < 0.7) { const f = ease(age / 0.7); thT = th0 + 0.75 * f; kT = -0.12 * f; showLine = false; }
      else if (age < 1.0) { const f = ease((age - 0.7) / 0.3); thT = th0 + 0.75 - 1.05 * f; kT = 0.4 * Math.sin(f * Math.PI * 0.9); showLine = false; }
      else { thT = th0 - 0.3 * Math.max(0, 1 - (age - 1.0) / 1.1); kT = 0.03; }
      if (age >= 0.95 && age < 2.15) {
        const f = (age - 0.95) / 1.2;
        const tipNow = lastTip || [W * 0.6, H * 0.2];
        const x = lerp(tipNow[0], E0[0], ease(f)), y = lerp(tipNow[1], E0[1], f) - Math.sin(f * Math.PI) * H * 0.22;
        lead = [x, y, 1 - f * 0.7];
        end = [x, y]; slack = 0.05; showLine = true;
      } else if (age >= 2.15) slack = clamp((age - 2.15) / 0.8, 0.05, 1);
      if (crossed(0.8)) onSound?.("whoosh");
      if (crossed(2.15)) { splash(E0[0], E0[1], 0.7 * P.size, 14, { rnd: seedR }); onSound?.("plop"); }
    } else if (phase === "bite") {
      // a light bite is a couple of taps at the tip; a proper take pulls the rod over
      const taps = P.strong ? [[0, 0.07, 0.1], [0.35, 0.05, 0.24], [1.0, 0.06, 0.14], [1.9, 0.04, 0.3]] : [[0, 0.05, 0], [0.55, 0.07, 0.02], [1.3, 0.04, 0]];
      for (const [p0, a, b] of taps) if (age > p0) { const e = Math.exp(-(age - p0) * 5.5); tipT += a * e * prof.pull * 1.4; kT += b * e * prof.pull; }
      slack = P.strong ? 0.3 : 0.55;
      if (floatRig) floatDip = clamp(Math.max(0, Math.sin(age * 5)) * (age < 3 ? 0.8 : 0.2), 0, 1);
      if (crossed(0.02)) { onSound?.("bell"); addRipple(E0[0], E0[1], P.strong ? 0.6 : 0.35); turb.push(); }
      if (P.strong && age < 2.4) turb.push({ x: toRef(E0[0], E0[1])[0], y: toRef(E0[0], E0[1])[1], r: 0.02, s: 0.3 * Math.exp(-age) });
      if (crossed(1.9) && P.strong) { onSound?.("bell"); addRipple(E0[0], E0[1], 0.5); }
    } else if (phase === "hooked") {
      // the fish fights its own way: runs to the side, dives, lunges, rests; bigger fish pull harder, small fish dart
      const pr = 1 - Math.exp(-age / (16 * prof.long));
      const run = noise1(age * 0.22 * prof.tempo + P.s1), dive = Math.max(0, noise1(age * 0.17 + P.s2)) ** 2;
      const surge = Math.max(0, Math.sin(age * 0.95 * prof.tempo + noise1(age * 0.3 + P.s3) * 2.2)) ** 6;
      const jit = noise1(age * 3.1 * prof.tempo + P.s1) * prof.erratic;
      const fx = lerp(E0[0], near[0], pr * 0.82) + (run * 0.09 + jit * 0.015) * W * (1 - pr * 0.5);
      const fy = lerp(E0[1], near[1], pr * 0.86) - dive * H * 0.025 * (1 - pr);
      end = [fx, fy]; fightPos = [fx, fy];
      const tension = load * (0.72 + 0.4 * surge + 0.25 * dive + 0.08 * Math.abs(jit));
      kT = 0.16 + 0.24 * tension; tipT += 0.06 * surge + jit * 0.02;
      thT = th0 - 0.04 * tension + clamp((fx - E0[0]) / W, -0.25, 0.25) * 0.22; thW = 7;
      slack = 0; spinning = surge < 0.35 && dive < 0.3;
      shake = surge * 0.7 * load;
      const [rx, ry] = toRef(fx, fy);
      turb.push({ x: rx, y: ry, r: 0.025 + 0.03 * surge, s: (0.15 + 0.6 * surge) * (0.4 + prof.splashy) });
      if (crossed(0.02)) onSound?.("reelOn");
      const persp = lerp(0.4, 1, depthAt(fy)), lenHere = fishCm * pxPerCm * persp;
      const heading = Math.sign(noise1((age + 0.05) * 0.22 * prof.tempo + P.s1) - run) || 1; // which way it's running
      // now and then the fish rolls on its side or slaps its tail at the surface (more often for lively fish)
      if (!roll && t > nextRollT && surge > 0.6 && seedR() < 0.25 + prof.splashy * 0.6) {
        roll = { t0: t, side: heading, tail: seedR() < 0.45 };
        splash(fx, fy, (0.45 + prof.splashy * 0.6) * P.size * persp, 14, { rnd: seedR, dir: heading });
        onSound?.("splash");
      }
      if (roll) {
        const ra = t - roll.t0, dur = roll.tail ? 0.6 : 0.9;
        if (ra > dur) { roll = null; nextRollT = t + 3 + (seedR() * 6) / (0.4 + prof.splashy); splash(fx, fy, 0.3 * persp, 8, { rnd: seedR }); addRipple(fx, fy, 0.5); }
        else if (fishImg && fishCut) {
          const out = Math.sin((ra / dur) * Math.PI);
          if (roll.tail) {
            // head down, the tail kicks up out of the water and slaps back
            fishSt = { anchor: [fx, fy + lenHere * 0.62], rot: -Math.PI / 2 + roll.side * (0.75 - out * 0.35), len: lenHere, bend: bendFn(0.35 * roll.side * out, 0.5 * prof.flex, ra * 16), waterY: fy, under: 0.5, alpha: 1, flip: roll.side > 0 };
          } else {
            // on its side at the surface, the flank showing for a moment
            const hz = roll.side > 0 ? Math.PI : 0;
            fishSt = { anchor: [fx + roll.side * lenHere * 0.45, fy + lenHere * 0.07 * (1 - out)], rot: hz - roll.side * 0.12 * out, len: lenHere, bend: bendFn(-0.3 * roll.side * out, 0.35 * prof.flex, ra * 13 * prof.tempo), waterY: fy, under: 0.6, alpha: 1, flip: roll.side > 0 };
          }
        }
      } else if (pr > 0.4 && fishImg && fishCut) {
        // closer in, the fish shows as a shape under the surface now and then, side-on as it runs
        const glimpse = clamp((Math.sin(age * 0.7 + P.s2) - 0.2) * 1.4, 0, 1) * clamp((pr - 0.4) * 4, 0, 1);
        if (glimpse > 0.02) {
          const hz = heading > 0 ? Math.PI : 0;
          fishSt = { anchor: [fx, fy + lenHere * 0.12], yaw: Math.sin(age * 4 * prof.tempo) * 0.25, rot: hz + dive * 0.3 * -heading + jit * 0.1, len: lenHere * 0.92, bend: bendFn(run * 0.25, 0.32 * prof.flex * (0.6 + surge), age * 9 * prof.tempo), waterY: -1, under: 0.42 * glimpse, alpha: 1, flip: heading > 0 };
        }
      }
    } else if (phase === "landing") {
      let hideLine;
      ({ thT, kT, tipT, end, spinning, fishSt, shake, push, focus, hideLine } = landing(age, t, { E0, near, pxPerCm, crossed, turb, th0 }));
      slack = 0; thW = 7;
      if (hideLine) showLine = false;
      if (crossed(0.02)) onSound?.("reelOn");
      if (crossed(LT.T3 - 0.3)) onSound?.("reelOff");
    } else if (phase === "lost" || phase === "missed") {
      // the tension goes: the spring of the rod throws the tip back
      kT = 0; tipT = 0;
      slack = clamp(age / 0.6, 0.2, 1);
      if (crossed(0.02)) { addRipple(E0[0], E0[1], 0.7); if (phase === "lost") { rodS.kv -= 1.6 * load; onSound?.("reelOff"); } }
    } else if (phase === "paused") {
      thT = th0 + 0.04; slack = 1;
    }
    prevAge = age;

    // the rod: the whole blank, the tip, and its angle, each with its own spring
    springTo(rodS, "k", "kv", kT * rodStyle.flex, 12 * Math.sqrt(1 / rodStyle.flex), 0.28, dt);
    springTo(rodS, "tip", "tipv", tipT, 26, 0.2, dt);
    springTo(rodS, "th", "thv", thT, thW, 0.55, dt);
    reelA += dt * (spinning ? 9 : 0);
    const rod = rodPoints(B, L, rodS.th, rodS.k, rodS.tip);
    const tip = rod.pts.at(-1);
    lastTip = tip;
    const gs = guidePoints(rod);

    stepBirds(t, dt);
    // things in the water first (behind the rod)
    let mouth = null;
    if (fishSt) { mouth = renderFish(fishSt); if (mouth && (phase === "landing")) end = mouth; }
    if (phase === "landing" && !fishCut && age < 4.6) end = [near[0], near[1] - clamp((age - 1.6) / 2, 0, 1) * H * 0.2];
    // a gentle ring now and then where the line goes in
    if (showLine && (phase === "waiting" || phase === "bite") && seedR() < dt * 0.35) addRipple(E0[0], E0[1], 0.22);
    let lineEnd = end;
    if (floatRig && showLine && !lead && phase !== "hooked" && phase !== "landing") lineEnd = drawFloat(E0[0], E0[1], floatDip, t);
    if (lead) { ctx.fillStyle = "rgba(30,34,38,0.9)"; ctx.beginPath(); ctx.arc(lead[0], lead[1], Math.max(1.2, 3.2 * k * lead[2]), 0, TAU); ctx.fill(); }
    stepParticles(dt);
    drawRings();
    drawParticles();

    // the rod, reel and line
    const seat = drawRod(rod);
    drawGuides(gs, rod);
    const spoolExit = drawReel(seat, rod.ang[9], reelA);
    if (phase !== "ended") drawLineThroughRod(spoolExit, gs, tip);
    if (showLine) drawLineOut(tip, lineEnd, slack, t, slack === 0 ? 0.6 + 0.4 * shake : 0);
    drawTipLight(tip);
    drawRain(dt);

    // for the water shader: rings (ref coords, age in seconds) and patches of broken water
    ripples = ripples.filter((r) => t - r.born < 5);
    const out = ripples.map((r) => ({ x: r.x, y: r.y, age: t - r.born, s: r.s }));
    if (showLine && phase === "hooked") { const [rx, ry] = toRef(end[0], end[1]); out.push({ x: rx, y: ry, age: (t * 0.9) % 1.6, s: 0.45 }); }
    if (showLine && floatRig && phase !== "hooked" && phase !== "landing") { const [rx, ry] = toRef(E0[0], E0[1]); out.push({ x: rx, y: ry, age: (t * 0.6) % 3, s: 0.18 + floatDip * 0.6 }); }
    // a little camera life: a nudge on strong pulls, a slow push towards a landed fish
    // (as fractions of the stage, so it applies at any size)
    const sh = (shake * k * 1.2) / W;
    const cam = { dx: (Math.sin(t * 31) * 0.6 + Math.sin(t * 47 + 1) * 0.4) * sh, dy: ((Math.sin(t * 37 + 2) * 0.6 + Math.sin(t * 53) * 0.4) * sh * W) / H, s: 1 + push * 0.07, ox: focus ? focus[0] / W : 0.5, oy: focus ? focus[1] / H : 0.5 };
    return { ripples: out, dists: turb.filter(Boolean).slice(0, 2), cam };
  }

  /** A pose from which way the head faces (dir: -1 left, 1 right) and how far the tail hangs below the head (a, radians:
   *  0 lying level, PI/2 hanging straight down). Keeping dir fixed while a changes turns the fish without it flipping over. */
  const pose = (dir, a) => (dir > 0 ? { rot: Math.PI - a, flip: true } : { rot: a, flip: false });

  /** The landing, as one continuous sequence: up from below, through the surface thrashing and rolling, lifted clear on
   *  the line head first with the tail leaving the water last, then hanging under the rod tip, swinging, kicking and
   *  settling while the camera eases in. Timings follow the species and its size (landingTimes). */
  function landing(age, t, { E0, near, pxPerCm, crossed, turb, th0 }) {
    const S = near, waterY = near[1], F = fromPos || E0;
    const tip = lastTip || [W * 0.6, H * 0.2];
    const lenS = fishCm * pxPerCm, lenH = (fishCm * H) / 400;
    const R = H * 0.36; // line from the rod tip to the fish's mouth once it's lifted (it hangs against the water, near)
    let thT = th0, kT, tipT = 0, end, spinning = false, fishSt = null, shake = 0, push = 0, focus = null;
    const { T1, T2, T3, T4 } = LT;
    const dir = P.side; // which way the fish faces as it comes in
    const thrash = (a) => noise1(a * 2.2 * prof.tempo + P.s1);
    const hasFish = fishImg && fishCut;
    if (age < T1) {
      // coming up from below, still fighting: a dark shape growing clearer, swimming against the line
      const f = ease(age / T1);
      const ax = lerp(F[0], S[0], f) + thrash(age) * W * 0.02 * f, ay = lerp(F[1], S[1] + H * 0.012, f);
      end = [ax, ay];
      kT = 0.2 + 0.24 * load * (0.9 + 0.3 * Math.max(0, thrash(age))); tipT = 0.03 * thrash(age * 3); spinning = true;
      shake = 0.4 * load * f;
      const ps = pose(dir, 0.35 + thrash(age * 0.8) * 0.3);
      if (hasFish) fishSt = { anchor: [ax, ay], ...ps, twist: thrash(age * 0.6) * 0.5, yaw: thrash(age * 0.9 + 3) * 0.45, len: lenS * lerp(lerp(0.4, 1, depthAt(F[1])), 1, f), bend: bendFn(thrash(age * 1.3) * 0.3, 0.34 * prof.flex, age * 12 * prof.tempo), waterY: -1, under: 0.12 + 0.5 * f, alpha: 1 };
      const [rx, ry] = toRef(ax, waterY); turb.push({ x: rx, y: ry, r: 0.03 + 0.03 * f, s: 0.25 + 0.6 * f });
      if (crossed(T1 * 0.6)) addRipple(ax, waterY, 0.6);
    } else if (age < T2) {
      // through the surface: the head comes out, the fish rolls and slaps, the body still in the water
      const f = (age - T1) / (T2 - T1);
      const mx = S[0] + thrash(age) * W * 0.012, my = waterY - ease(f) * lenS * 0.35;
      end = [mx, my];
      kT = 0.2 + 0.24 * load; tipT = 0.05 * thrash(age * 4); spinning = f < 0.6;
      shake = 0.8 * load * (1 - f);
      const roll = Math.sin(age * 6.5 * prof.tempo + P.s2) * 0.9 * (1 - f * 0.5) + thrash(age * 1.9) * 0.6;
      const ps = pose(dir, 0.3 + 0.35 * f + thrash(age * 1.7) * 0.3);
      if (hasFish) fishSt = { anchor: [mx, my], ...ps, twist: roll, yaw: thrash(age * 2.3 + 5) * 0.55, len: lenS * lerp(1, 1.1, f), bend: bendFn(thrash(age * 2.1) * 0.55, 0.5 * prof.flex * (1 - f * 0.4), age * 15 * prof.tempo), waterY, under: 0.7, alpha: 1 };
      if (crossed(T1)) { splash(S[0], waterY, 1.15 * P.size * (0.7 + prof.splashy * 0.5), 34, { rnd: seedR, dir }); onSound?.("bigsplash"); }
      if (age > T1 + 0.2 && seedR() < 0.12 * (0.5 + prof.splashy)) splash(mx + (seedR() - 0.5) * lenS * 0.8, waterY, 0.35 + seedR() * 0.3, 7, { rnd: seedR, dir: seedR() < 0.5 ? -1 : 1 });
      const [rx, ry] = toRef(mx, waterY); turb.push({ x: rx, y: ry, r: 0.06, s: 0.9 * (1 - f * 0.5) });
    } else if (age < LT.end) {
      // lifted on the line: head first, turning to hang, the tail leaving the water last; then it hangs under the tip
      // as a pendulum, kicks now and then (less as it tires) and turns slowly on the line
      const f = ease(clamp((age - T2) / (T3 - T2), 0, 1));
      const sx = S[0], sy = waterY - lenS * 0.35;
      const st = Math.max(0, age - T2);
      const phi = 0.32 * dir * Math.exp(-st * 0.42) * Math.cos(st * 2.3 + 0.4); // the swing, from the sideways pull out of the water
      const hangPt = [tip[0] + Math.sin(phi) * R, tip[1] + Math.cos(phi) * R];
      // at the end it's swung in to the angler: towards and past the camera, out of the bottom of the view
      const g = ease(clamp((age - LT.swingIn) / (LT.end - LT.swingIn), 0, 1));
      const mx = lerp(sx, hangPt[0], f) - dir * g * W * 0.1, my = lerp(sy, hangPt[1], f) + Math.sin(f * Math.PI) * H * 0.012 + g * g * H * 0.75;
      end = [mx, my];
      // kicks: a few, at set moments, each weaker than the last
      let curl = 0, amp = lerp(0.4, 0.08, clamp((age - T2) / 4.5, 0, 1)) * prof.flex;
      for (let i = 0; i < P.kicks.length; i++) {
        const fa = age - P.kicks[i];
        if (fa > 0 && fa < 0.55) { const e = Math.sin((fa / 0.55) * Math.PI) * Math.pow(0.7, i); curl += (i % 2 ? -1 : 1) * dir * e * 0.55 * prof.flex; amp += 0.3 * e * prof.flex; }
      }
      const a = lerp(0.65, Math.PI / 2, f) - phi * 0.5 * dir + curl * 0.25;
      const ps = pose(dir, a);
      // the rod: loaded hard as it lifts, then just the hanging weight, bouncing with the swing and the kicks
      const weightLoad = 0.1 + 0.19 * load;
      kT = lerp(lerp(0.2 + 0.23 * load, weightLoad, f) * (1 + 0.18 * Math.abs(curl) + 0.15 * Math.abs(phi)), 0.05, g); thT = th0 + 0.09 * f * (1 - g) - 0.22 * g + curl * 0.015;
      tipT = phi * 0.1 + curl * 0.06;
      spinning = f < 0.85;
      if (hasFish) fishSt = { anchor: [mx, my], ...ps, yaw: curl * 0.7 + Math.sin(age * 1.7 + P.s1) * 0.12 * (1 - f * 0.5), twist: lerp(0.4 * Math.sin(age * 5), 0.55 * Math.sin(st * 1.1 + P.s3) * Math.exp(-st * 0.15), f), len: lerp(lenS * 1.1, lenH, f) * (1 + g * 1.4), bend: bendFn(curl, amp, age * 11 * prof.tempo), waterY: age < T3 ? waterY : null, floor: waterY, under: 0.7, alpha: 1, drip: clamp(1 - (age - T2) / 4, 0.04, 1) * (1 - g) };
      if (crossed(T2 + (T3 - T2) * 0.45)) { splash(sx, waterY, 0.55, 12, { rnd: seedR, dir: -dir }); addRipple(sx, waterY, 0.8); } // the tail leaves the water
      if (age < T3) { const [rx, ry] = toRef(sx, waterY); turb.push({ x: rx, y: ry, r: 0.05, s: 0.6 * (1 - f) }); }
      push = ease(clamp((age - T4 + 0.6) / 1.6, 0, 1)) * (1 - g);
      focus = [mx, my + lenH * 0.45];
    }
    if (age >= LT.end) { kT = 0.05; thT = th0 - 0.22 + 0.22 * ease(clamp((age - LT.end) / 1.2, 0, 1)); end = S; }
    return { thT, kT, tipT, end: end || S, spinning, fishSt, shake, push, focus, hideLine: age >= LT.end - 0.05 };
  }

  return {
    resize(w, h, dpr = 1) {
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      W = canvas.width; H = canvas.height;
      k = Math.min(W, H * 1.5) / 760;
      streaks = [];
    },
    setLayout({ cast, horizon: hz, map: mp }) { if (cast) castRef = cast; if (hz != null) horizon = hz; if (mp) map = mp; },
    setEnv({ night: n, wind, windDir: wd, rain: r, floatRig: f, quality: q, dusk: dk, waterTint: wt, rod }) {
      if (dk != null) dusk = dk; if (wt) waterTint = wt; if (rod && ROD_STYLES[rod]) rodStyle = ROD_STYLES[rod];
      if (n != null) night = n; if (wind != null) windN = wind; if (wd != null) windDir = wd; if (r != null) rain = r; if (f != null) floatRig = f; if (q != null) quality = q;
    },
    /** The species picture (a cut-out when FishDock has one), the species and its logged (or typical) size. */
    setFish(img, cutout, { species, lengthCm, weightKg } = {}) {
      prof = fightProfile(species);
      if (img && prof.headRight) {
        // the picture faces right: mirror it once so the mouth is on the left like the others
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0); img = c;
      }
      fishImg = img; fishCut = !!cutout;
      if (img && cutout && !CURLED.has(species)) {
        if (!fish3Tried) { fish3Tried = true; try { fish3 = createFishRenderer(); } catch { fish3 = null; } }
        if (fish3) {
          try {
            const c = document.createElement("canvas"); c.width = 480; c.height = 320;
            const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, 480, 320);
            const px = g.getImageData(0, 0, 480, 320).data, a = new Uint8Array(480 * 320);
            for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
            const shape = fishShape(a, 480, 320);
            if (shape.ok) { fish3.setFish(c, shape, buildFishMesh(shape, { width: bodyWidth(species), flat: prof.flat })); fish3For = img; }
            else fish3For = null;
          } catch (e) { console.warn("FishDock fish: 3D model failed", e?.message); fish3For = null; }
        }
      } else fish3For = null;
      fishCm = clamp(lengthCm || 45, 8, 200);
      load = fishLoad(species, fishCm, weightKg);
      LT = landingTimes(species, fishCm, weightKg);
    },
    splashAt(refPt, size = 1) { const [x, y] = toStage(refPt); splash(x, y, size); },
    frame,
    stageOf: toStage,
  };
}
