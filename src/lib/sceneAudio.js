// ---- sceneAudio: quiet sound for the Live Fishing View, made on the phone (no sound files to download) ----
// Off until someone taps "Sound" (browsers only allow audio after a tap). Underneath: the water (a wash of waves
// at the sea, a softer lap on a river or lake), the wind in uneven gusts, rain when it's raining, and now and then a
// gull by the sea in daylight, a wave slapping the wall under a pier, or a halyard tapping a mast across the harbour.
// On top: the bite (a tip bell on a sea rod, an electronic bite alarm on a river or lake rod), the reel's clicks as
// you tap, the drag, the cast, splashes, the net and rope, the fish on the mat and your footsteps on the ground you
// walk on. Everything follows the scene's own conditions, so what you hear matches what you see, and nothing repeats
// on a fixed beat: the beds are long, seamless and drift at random, and every one-off sound varies a little.
// Water is made the way water sounds: splashes and drips are mostly small bubbles, each a short note that rises in
// pitch as it closes. The fishing sounds go through a short outdoor echo (the wall and the water, not a hall). Sound
// that's on but can't start yet (browsers wait for a first tap, and a phone call stops it) starts at the next tap.

let ac = null, master = null, reelTimer = null, wanderTimer = null, unlocking = false;
const timers = {}; // the sparse sounds' own timers: gull, slap, halyard, patter
// three groups with their own levels (environment, equipment, fishing events), and a panner so another angler's
// reel or splash comes from their side
let envG = null, gearG = null, evG = null, pan = null, nearG = null;
const groupLevel = { environment: 1, equipment: 1, events: 1 };
const layers = {}; // wash, wind, rain, whistle, rumble: { src, gain, ... }
let env = { kind: "sea", wind: 0.3, rain: 0, night: 0, venue: "pier" };
let level = 0.7, on = false;
const R = Math.random;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

// ---- what the surroundings should sound like for these conditions (pure; tested) ----
// Which beds play and how loud, and how often each sparse sound comes (seconds, a range: each wait is picked at
// random inside it, so nothing arrives on a beat).
export function ambiencePlan(c = {}) {
  const sea = (c.kind || "sea") === "sea", w = clamp01(c.wind), r = clamp01(c.rain), night = clamp01(c.night) >= 0.5;
  const wall = sea && (c.venue === "pier" || c.venue === "estuary"), harbour = c.venue === "pier" || c.venue === "estuary";
  return {
    wash: sea ? 0.06 + w * 0.07 : 0.02 + w * 0.015,
    wind: Math.max(0, w - 0.12) * 0.085,
    whistle: w > 0.55 ? (w - 0.55) * 0.03 : 0, // the wind through a railing, only when it's blowing hard
    rain: r > 0 ? r * r * 0.11 + 0.01 : 0,
    rumble: harbour ? 0.012 + w * 0.006 : 0, // a far-off town and harbour, felt more than heard
    gull: sea && !night && r < 0.6 ? [9, 34] : null,
    slap: wall ? [3.5 * (1.2 - w * 0.5), 9.5 * (1.2 - w * 0.5)] : null,
    halyard: harbour && w > 0.2 && r < 0.8 ? [14, 48] : null,
    patter: r > 0.15 ? [0.05 / r, 0.35 / r] : null, // big drops on the rail and your jacket, quicker in heavier rain
    wave: sea && c.venue === "beach" ? [6 - w * 2, 12 - w * 4] : null, // waves breaking on the beach, closer together in a blow
  };
}
/** A wait (seconds) inside a range, never quite the same twice. */
export const waitIn = ([a, b], rnd = R) => a + (b - a) * rnd();

// ---- a footstep on this ground (pure; tested): the thump, the grit or crunch on top, and how bright it is ----
export const SURFACES = {
  concrete: { thump: 190, thumpG: 0.2, grit: 2600, gritG: 0.03, crunch: 0, hollow: 0 },
  wood: { thump: 150, thumpG: 0.16, grit: 1900, gritG: 0.015, crunch: 0, hollow: 0.09 },
  shingle: { thump: 230, thumpG: 0.1, grit: 3400, gritG: 0.05, crunch: 5, hollow: 0 },
  gravel: { thump: 210, thumpG: 0.1, grit: 3000, gritG: 0.04, crunch: 3, hollow: 0 },
  grass: { thump: 160, thumpG: 0.08, grit: 1400, gritG: 0.022, crunch: 0, hollow: 0 },
};
export function stepSound(surface = "concrete", hard = 0.6, wet = false, rnd = R) {
  const S = SURFACES[surface] || SURFACES.concrete, h = Math.max(0.2, Math.min(1, hard)), vary = () => 0.85 + rnd() * 0.3;
  return {
    thump: { f: S.thump * vary(), g: S.thumpG * (0.55 + 0.45 * h) * vary(), d: 0.05 + 0.03 * h },
    grit: { f: S.grit * vary(), g: S.gritG * (0.5 + 0.5 * h) * vary(), d: 0.03 + rnd() * 0.02 },
    crunch: Math.round(S.crunch * (0.6 + 0.6 * h)),
    hollow: S.hollow ? { f: 120 + rnd() * 40, g: S.hollow * h } : null,
    splash: wet ? { f: 1500 + rnd() * 900, g: 0.025 * (0.5 + h) } : null,
  };
}

function ensure() {
  if (ac) return ac;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0;
  // (a gentle compressor at the end, so everything can be louder on a phone's small speaker without a splash or the
  // bell ever clipping)
  try {
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.25;
    const lift = ac.createGain(); lift.gain.value = 2.2;
    master.connect(comp); comp.connect(lift); lift.connect(ac.destination);
  } catch { master.connect(ac.destination); }
  envG = ac.createGain(); envG.connect(master);
  pan = ac.createStereoPanner ? ac.createStereoPanner() : null; nearG = ac.createGain();
  if (pan) { nearG.connect(pan); pan.connect(master); } else nearG.connect(master);
  gearG = ac.createGain(); gearG.connect(nearG); evG = ac.createGain(); evG.connect(nearG);
  try { evG.connect(space()); } catch { /* no convolver: dry */ }
  applyGroups(); unlock();
  return ac;
}
// ---- the first tap: browsers start sound only from one, and a call or the phone sleeping can stop it again ----
function unlock() {
  if (unlocking || typeof document === "undefined") return; unlocking = true;
  const go = () => {
    if (!ac || !on || ac.state === "running") return;
    ac.resume?.().catch?.(() => {});
    try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, ac.sampleRate); s.connect(ac.destination); s.start(0); } catch { /* ignore */ } // (older iPhones)
  };
  for (const e of ["pointerdown", "touchend", "keydown"]) document.addEventListener(e, go, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") go(); });
}
// a short outdoor echo: a few early reflections off the wall and the water, then a quick, dark tail
function space() {
  const sr = ac.sampleRate, n = Math.round(sr * 1.1), b = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (R() * 2 - 1) * 0.35 * Math.exp(-t * 6) * Math.min(1, t / 0.015); }
    for (const [at, g] of [[0.019, 0.55], [0.034, 0.38], [0.052, 0.3], [0.081, 0.18]]) d[Math.round((at + (c ? 0.004 : 0)) * sr)] += g;
  }
  const cv = ac.createConvolver(); cv.buffer = b;
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200;
  const wet = ac.createGain(); wet.gain.value = 0.2;
  cv.connect(lp); lp.connect(wet); wet.connect(master);
  return cv;
}
// brown-ish noise (soft, like water) or white noise (hiss, like rain); `loop` blends its end into its start, so a
// looping bed has no click or seam where it comes round
function noiseBuffer(sec = 2, white = false, loop = false) {
  const n = Math.round(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const r = R() * 2 - 1;
    if (white) d[i] = r * 0.5; else { last = (last + 0.02 * r) / 1.02; d[i] = last * 3.5; }
  }
  if (loop) { const x = Math.min(Math.round(ac.sampleRate * 0.4), n >> 3); for (let i = 0; i < x; i++) { const k = i / x; d[n - x + i] = d[n - x + i] * (1 - k) + d[i] * k; } }
  return b;
}
// an effect's own position in the stereo picture (the surroundings come from all round, not the middle)
function placed(out, p = 0) {
  if (!ac.createStereoPanner) return out;
  const sp = ac.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, p)); sp.connect(out); return sp;
}
// a looping noise bed through a filter, its level drifting (wander below); each bed's loop is a different, odd length
function bed(name, { white = false, type = "lowpass", freq = 600, q = 0.7, sec = 9 }) {
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(sec, white, true); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const gain = ac.createGain(); gain.gain.value = 0;
  const swell = ac.createGain(); swell.gain.value = 1;
  src.connect(f); f.connect(swell); swell.connect(gain); gain.connect(envG);
  src.start(0, R() * sec);
  layers[name] = { src, f, gain, swell, base: freq };
  return layers[name];
}
const to = (param, v, tc = 0.8) => { try { param.setTargetAtTime(v, ac.currentTime, tc); } catch { /* ignore */ } };

// the beds drift: the waves swell and fall back, the wind gusts and drops, the rain comes in heavier and lighter.
// Each is given a new target at random every second or few (never a steady wobble you can count)
function wander() {
  clearTimeout(wanderTimer); wanderTimer = null;
  if (!on || !ac) return;
  const w = clamp01(env.wind), sea = env.kind === "sea";
  const L = layers;
  if (L.wash) { to(L.wash.swell.gain, sea ? 0.55 + R() * (0.6 + w * 0.5) : 0.75 + R() * 0.4, 0.9 + R() * 1.6); to(L.wash.f.frequency, L.wash.base * (0.8 + R() * 0.45), 1.5); }
  if (L.wind) { const gust = R() < 0.25 + w * 0.3; to(L.wind.swell.gain, gust ? 1.1 + R() * 0.9 : 0.25 + R() * 0.6, gust ? 0.5 + R() * 0.6 : 1.2 + R() * 1.5); to(L.wind.f.frequency, L.wind.base * (gust ? 1.15 + R() * 0.35 : 0.8 + R() * 0.2), 0.9); }
  if (L.whistle) { to(L.whistle.f.frequency, 820 + R() * 620, 0.7 + R()); to(L.whistle.swell.gain, R() < 0.4 ? 0.9 + R() * 0.6 : R() * 0.3, 0.8); }
  if (L.rain) to(L.rain.swell.gain, 0.75 + R() * 0.45, 2);
  wanderTimer = setTimeout(wander, 900 + R() * 2600);
}
// a sparse sound: plays now and then, each wait picked at random in its range
function every(name, range, fn) {
  clearTimeout(timers[name]); timers[name] = null;
  if (!on || !range) return;
  const next = () => { timers[name] = setTimeout(() => { if (ac.state === "running") fn(); next(); }, waitIn(range) * 1000); };
  next();
}

// what each layer should be doing for the current conditions
function apply() {
  if (!ac) return;
  const sea = env.kind === "sea", w = clamp01(env.wind), r = clamp01(env.rain), plan = ambiencePlan(env);
  const wash = layers.wash || bed("wash", { freq: 650, sec: 11.3 });
  wash.base = sea ? 520 + w * 500 : 380 + w * 120;
  to(wash.gain.gain, on ? plan.wash : 0);
  const wind = layers.wind || bed("wind", { type: "bandpass", freq: 500, q: 0.6, sec: 8.7 });
  wind.base = 380 + w * 700;
  to(wind.gain.gain, on ? plan.wind : 0, 1.5);
  const whistle = layers.whistle || bed("whistle", { white: true, type: "bandpass", freq: 1000, q: 9, sec: 6.1 });
  to(whistle.gain.gain, on ? plan.whistle : 0, 2);
  const rain = layers.rain || bed("rain", { white: true, type: "highpass", freq: 2500, q: 0.5, sec: 7.9 });
  to(rain.f.frequency, 3200 - r * 1500);
  to(rain.gain.gain, on ? plan.rain : 0, 1.2);
  const rumble = layers.rumble || bed("rumble", { freq: 140, q: 0.5, sec: 13.7 });
  to(rumble.gain.gain, on ? plan.rumble : 0, 3);
  wander();
  every("slap", plan.slap, () => slap(w));
  every("gull", plan.gull, gull);
  every("halyard", plan.halyard, halyard);
  every("patter", plan.patter, () => drop(r));
  every("wave", plan.wave, () => wave(w));
}

/** Starts the sound (call from a tap). Conditions: kind sea | river | still, wind and rain 0..1, night 0..1. */
export function soundOn(conditions = {}) {
  if (!ensure()) return false;
  ac.resume?.();
  on = true;
  env = { ...env, ...conditions };
  to(master.gain, level, 0.3);
  apply();
  return true;
}
/** Follows a change in the scene's conditions while the sound is on. */
export function soundEnv(conditions = {}) {
  env = { ...env, ...conditions };
  if (on) apply();
}
export function soundOff() {
  on = false;
  if (!ac) return;
  to(master.gain, 0, 0.2);
  clearInterval(reelTimer); reelTimer = null;
  for (const k of Object.keys(timers)) { clearTimeout(timers[k]); timers[k] = null; }
  apply();
}
function applyGroups() { if (!ac) return; envG.gain.value = groupLevel.environment; gearG.gain.value = groupLevel.equipment; evG.gain.value = groupLevel.events; }
/** Levels for the three groups, each 0..1: { environment, equipment, events }. */
export function setVolumes(v = {}) { for (const k of Object.keys(groupLevel)) if (v[k] != null) groupLevel[k] = Math.max(0, Math.min(1, Number(v[k]) || 0)); applyGroups(); }
/** Where the next effect comes from: pan -1 (left) .. 1 (right), and how near (0..1). Resets to centre after. */
let panReset = null;
export function soundPan(p = 0, near = 1) {
  if (!ac) return;
  try { if (pan) pan.pan.setValueAtTime(Math.max(-1, Math.min(1, p)), ac.currentTime); nearG.gain.setValueAtTime(near, ac.currentTime); } catch { /* ignore */ }
  clearTimeout(panReset); panReset = setTimeout(() => { try { if (pan) pan.pan.setValueAtTime(0, ac.currentTime); nearG.gain.setValueAtTime(1, ac.currentTime); } catch { /* ignore */ } }, 1500);
}
/** The overall level, 0..1. */
export function setVolume(v) {
  level = Math.max(0, Math.min(1, Number(v) || 0));
  if (ac && on) to(master.gain, level, 0.1);
}

function tone(f, g, d, type = "sine", at = 0, out = evG) {
  const t = ac.currentTime + at, o = ac.createOscillator(), v = ac.createGain();
  o.frequency.value = f; o.type = type;
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(out || master); o.start(t); o.stop(t + d + 0.02);
}
// a low knock that drops in pitch: a boot on a wooden deck, a wave in the hollow under a pier
function knock(f, g, d, out = evG, at = 0) {
  const t = ac.currentTime + at, o = ac.createOscillator(), v = ac.createGain();
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(out); o.start(t); o.stop(t + d + 0.02);
}
// a rod-tip bell: a little brass bell nodding two to four times as the tip pulls down, its partials not quite in tune
// with each other (as a bell's aren't) and a twin a few hertz off giving it a shimmer
function bell() {
  const n = 2 + Math.floor(R() * 3), f0 = 2300 + R() * 450;
  let at = 0;
  for (let i = 0; i < n; i++) {
    const g = 0.12 * (1 - i * 0.17) * (0.8 + R() * 0.4);
    for (const [r, gg, d] of [[1, 1, 1.2], [2.42, 0.42, 0.75], [4.53, 0.2, 0.42], [7.1, 0.08, 0.22]]) tone(f0 * r * (1 + (R() - 0.5) * 0.004), g * gg, d, "sine", at);
    tone(f0 * 1.0035, g * 0.45, 1.2, "sine", at);
    at += 0.1 + R() * 0.12;
  }
}
// a bubble: a short note whose pitch rises as the bubble closes up; small ones higher and quicker. Splashes, drips and
// a lead going in are mostly these, which is what makes water sound like water rather than hiss
function bubble(f, g, at = 0, d = 0.03 + 60 / f * 0.04, out = evG) {
  const t = ac.currentTime + at, o = ac.createOscillator(), v = ac.createGain();
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.4 + R() * 0.7), t + d);
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.002); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(out); o.start(t); o.stop(t + d + 0.02);
}
// a spray of bubbles over a moment: n of them, from big (low) to small (high), most of them early
function bubbles(n, lo, hi, g, span, at = 0, out = evG) {
  for (let i = 0; i < n; i++) { const k = R(), f = lo * Math.pow(hi / lo, k); bubble(f, g * (1.15 - k * 0.6) * (0.5 + R() * 0.7), at + span * R() * R(), undefined, out); }
}
// an electronic bite alarm: a run of short beeps, quicker for a strong take
function alarm(n = 4) { const gap = 0.13 + R() * 0.06; for (let i = 0; i < n; i++) tone(1850, 0.09, 0.09, "square", i * gap); }
function burst(dur, freq, gain, q = 0.8, white = false, out = evG, at = 0) {
  const t = ac.currentTime + at, src = ac.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1, white);
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
  const v = ac.createGain(); v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(gain, t + Math.min(0.006, dur * 0.2)); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(v); v.connect(out || master); src.start(t); src.stop(t + dur + 0.05);
}
// one click of the reel's gears, never quite the same
function click(at = 0, g = 0.1) { burst(0.022 + R() * 0.008, 2800 + R() * 900, g * (0.8 + R() * 0.4), 4, false, gearG, at); }
// a wave against the wall: a soft low slap with a knock in the hollow under the pier, then the water sucking back,
// from somewhere along the wall rather than the middle (quiet: it sits under the wash)
function slap(w = 0.3) {
  const g = (0.05 + w * 0.08) * (0.6 + R() * 0.6), out = placed(envG, R() * 1.4 - 0.7), two = R() < 0.3;
  burst(0.16 + R() * 0.08, 280 + R() * 160, g, 0.8, false, out);
  if (R() < 0.6) knock(70 + R() * 40, g * 0.5, 0.25, out);
  if (two) burst(0.12, 360 + R() * 140, g * 0.6, 0.9, false, out, 0.18 + R() * 0.12);
  burst(0.6 + R() * 0.5, 850 + R() * 400, g * 0.32, 0.6, false, out, 0.15 + R() * 0.1);
}
// the cast: the rod swept through the air (a rush that rises and falls as the tip goes past), then the line pouring off
// the spool, a fine fluttering hiss that slows as the lead flies out
function cast() {
  const t = ac.currentTime, k = 0.85 + R() * 0.3;
  const s1 = ac.createBufferSource(); s1.buffer = noiseBuffer(0.7, true);
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(450, t); bp.frequency.exponentialRampToValueAtTime(2400 * k, t + 0.15); bp.frequency.exponentialRampToValueAtTime(700, t + 0.45);
  const v1 = ac.createGain(); v1.gain.setValueAtTime(0, t); v1.gain.linearRampToValueAtTime(0.2 * k, t + 0.14); v1.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
  s1.connect(bp); bp.connect(v1); v1.connect(gearG); s1.start(t); s1.stop(t + 0.55);
  const s2 = ac.createBufferSource(); s2.buffer = noiseBuffer(1.8, true);
  const hp = ac.createBiquadFilter(); hp.type = "bandpass"; hp.frequency.value = 5200; hp.Q.value = 0.8;
  const env2 = ac.createGain(); env2.gain.setValueAtTime(0, t + 0.08); env2.gain.linearRampToValueAtTime(0.05, t + 0.16); env2.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  const flutter = ac.createGain(); flutter.gain.value = 0.55;
  const lfo = ac.createOscillator(), depth = ac.createGain(); depth.gain.value = 0.45;
  lfo.frequency.setValueAtTime(42, t + 0.1); lfo.frequency.exponentialRampToValueAtTime(8, t + 1.5);
  lfo.connect(depth); depth.connect(flutter.gain);
  s2.connect(hp); hp.connect(env2); env2.connect(flutter); flutter.connect(gearG);
  s2.start(t + 0.08); s2.stop(t + 1.7); lfo.start(t + 0.08); lfo.stop(t + 1.7);
}
// a herring gull's call: a few falling, slightly harsh cries, from somewhere off to a side, near or far
function gull() {
  const far = R(), n = 1 + Math.floor(R() * 4), base = 1100 + R() * 350, g = (0.016 - far * 0.011) * (0.7 + R() * 0.6);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200 - far * 3200; lp.connect(placed(envG, R() * 1.6 - 0.8));
  for (let i = 0; i < n; i++) {
    const t = ac.currentTime + i * (0.26 + R() * 0.14), o = ac.createOscillator(), o2 = ac.createOscillator(), v = ac.createGain();
    const len = 0.18 + R() * 0.12, fall = 0.62 + R() * 0.15;
    o.type = "sawtooth"; o2.type = "sine";
    o.frequency.setValueAtTime(base * (1.2 + R() * 0.1), t); o.frequency.exponentialRampToValueAtTime(base * fall, t + len);
    o2.frequency.value = 32 + R() * 12; const fm = ac.createGain(); fm.gain.value = 45 + R() * 30; o2.connect(fm); fm.connect(o.frequency);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = base * 1.6; bp.Q.value = 2.5;
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.04);
    o.connect(bp); bp.connect(v); v.connect(lp);
    o.start(t); o2.start(t); o.stop(t + len + 0.08); o2.stop(t + len + 0.08);
  }
}
// across the harbour, a loose halyard tapping a mast in the wind: a few faint, uneven metallic tinks
function halyard() {
  const out = placed(envG, R() * 1.6 - 0.8), n = 2 + Math.floor(R() * 4), f = 900 + R() * 700, g = 0.006 + R() * 0.006;
  let at = 0;
  for (let i = 0; i < n; i++) { tone(f, g, 0.35, "sine", at, out); tone(f * 2.76, g * 0.4, 0.18, "sine", at, out); at += 0.35 + R() * 0.9; }
}
// a wave breaking on the beach: the water building, the crash, then the backwash hissing down the sand, from
// somewhere along the shore in front (quiet: it rides on the wash)
function wave(w = 0.3) {
  const out = placed(envG, R() * 1.0 - 0.5), t = ac.currentTime, g = (0.07 + w * 0.08) * (0.65 + R() * 0.6), up = 0.8 + R() * 0.7;
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(4.5);
  const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(1600 + w * 1600, t + up); lp.frequency.exponentialRampToValueAtTime(420, t + up + 2.6);
  const v = ac.createGain(); v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g * 0.45, t + up * 0.85); v.gain.linearRampToValueAtTime(g, t + up + 0.12); v.gain.exponentialRampToValueAtTime(0.0001, t + up + 3);
  src.connect(lp); lp.connect(v); v.connect(out); src.start(t); src.stop(t + up + 3.1);
  burst(2.2 + R(), 3800 + R() * 1200, g * 0.22, 0.45, true, out, up + 0.6); // the backwash: foam fizzing away
  bubbles(10, 900, 4200, g * 0.35, 1.6, up + 0.2, out);
}
// a big raindrop on the rail, your hood or the deck: a tiny tick somewhere round you
function drop(r = 0.5) { burst(0.012 + R() * 0.01, 3000 + R() * 3500, (0.008 + r * 0.012) * (0.5 + R()), 3, true, placed(envG, R() * 2 - 1)); }
// a footstep (stepSound above): the thump, the grit, a crunch of stones on shingle, a hollow knock on boards
function step(d = {}) {
  const s = stepSound(d.surface, d.land ? 1 : d.hard ?? 0.6, !!d.wet), k = d.land ? 1.3 : 1;
  burst(s.thump.d, s.thump.f, s.thump.g * k, 1.1);
  burst(s.grit.d, s.grit.f, s.grit.g * k, 1.6, true);
  for (let i = 0; i < s.crunch; i++) burst(0.012 + R() * 0.02, 2400 + R() * 3200, s.grit.g * 0.7, 2.2, true, evG, 0.008 + R() * 0.07);
  if (s.hollow) knock(s.hollow.f, s.hollow.g * k, 0.14);
  if (s.splash) burst(0.08, s.splash.f, s.splash.g, 1.2, true, evG, 0.01);
}

/** Plays a named effect if sound is on: bell (the bite: a bell at sea, an alarm on fresh water), plop, splash,
 *  bigsplash, whoosh, net (a net going into the water), drip (water pouring out of a lifted net), reelOn, reelOff,
 *  reelTap (half a turn of the handle; data: speed 0..1), strain (the line under a pull; data: tension), drag (the drag slipping), swish, rope, mat, flap, step and stepRun (data: surface,
 *  hard 0..1, wet, land). */
export function play(name, data = null) {
  if (!ac || !on || ac.state !== "running") return;
  const v = () => 0.85 + R() * 0.3;
  if (name === "bell") { if (env.venue === "river" || env.venue === "lake") alarm(3 + Math.floor(R() * 3)); else bell(); }
  // the lead going in: a deep "bloop" (one big bubble) over a soft thud, then a few small ones
  else if (name === "plop") { bubble(330 + R() * 120, 0.32 * v(), 0, 0.11); burst(0.16 + R() * 0.06, 700 + R() * 250, 0.22 * v(), 1.2); knock(160 + R() * 60, 0.06, 0.12); bubbles(5, 900, 2600, 0.06, 0.35, 0.05); }
  // a fish breaking the surface: the slap of water, spray, and a spray of bubbles
  else if (name === "splash") { burst(0.3 + R() * 0.12, 1000 + R() * 300, 0.3 * v(), 0.7); burst(0.22, 3600 + R() * 600, 0.07 * v(), 0.8, true); bubbles(12 + Math.floor(R() * 8), 500, 3200, 0.08, 0.45, 0.02); }
  else if (name === "bigsplash") { burst(0.8, 800 + R() * 150, 0.6 * v(), 0.5); burst(0.5, 1800, 0.22 * v(), 0.7, false, evG, 0.1); burst(0.45, 4200, 0.08, 0.8, true, evG, 0.1); bubbles(26, 380, 3000, 0.1, 0.9, 0.05); bubbles(10, 1500, 4500, 0.04, 1.2, 0.5); }
  else if (name === "whoosh") cast();
  // water pouring out of the net as it comes up: a run of drips into the sea below, each a little plink, thinning out
  else if (name === "drip") { for (let i = 0; i < 22; i++) { const at = (i * 80 + R() * 70) / 1000 + (i > 12 ? (i - 12) * 0.06 : 0); bubble(1100 + R() * 2400, 0.06 * (1 - i / 26) * (0.6 + R() * 0.6), at); if (R() < 0.35) burst(0.03, 3000 + R() * 2000, 0.012, 2, true, evG, at); } }
  else if (name === "net") { burst(0.35, 650 + R() * 150, 0.24 * v(), 0.6); burst(0.25, 1500, 0.1, 0.8, true, evG, 0.12); burst(0.12, 900, 0.05, 1.5, true, gearG, 0.05); bubbles(14, 600, 3400, 0.07, 0.6, 0.06); }
  else if (name === "reelOn") { clearInterval(reelTimer); reelTimer = setInterval(() => click(0, 0.08), 62 + R() * 20); setTimeout(() => { clearInterval(reelTimer); reelTimer = null; }, 2500); } // (a friend's reel: the first run, not a loop for the whole fight)
  else if (name === "swish") burst(0.2 + R() * 0.05, 1600 + R() * 300, 0.15 * v(), 0.5, false, gearG); // the rod swept up on the strike
  else if (name === "step" || name === "stepRun") step({ hard: name === "stepRun" ? 0.9 : 0.6, ...(data || {}) });
  else if (name === "rope") { const d = 0.26 + R() * 0.14; burst(d, 1300 + R() * 500, 0.05, 0.9, true, gearG); burst(0.06, 600, 0.05, 1.2, false, evG, d * 0.9); } // the rope drawn through the hands, then gripped
  else if (name === "mat") { burst(0.12, 240 + R() * 50, 0.26 * v(), 0.9); burst(0.08, 1800, 0.05, 1, true); } // the fish laid on the wet mat
  else if (name === "flap") { const n = 1 + Math.floor(R() * 3); for (let i = 0; i < n; i++) { const at = i * (0.08 + R() * 0.07), g = 0.11 * (1 - i * 0.25) * v(); burst(0.06, 850 + R() * 400, g, 1.3, false, evG, at); burst(0.03, 2600, g * 0.25, 1.5, true, evG, at); } } // a flick or two of its tail on the wet mat
  else if (name === "reelOff") { clearInterval(reelTimer); reelTimer = null; }
  else if (name === "reelTap") {
    // half a turn of the handle as it actually goes round: the pawl's click over a soft whirr of the gears; turning
    // faster, the clicks run together into the whirr (quieter, one of them) rather than rattling, and each is a little
    // different
    const sp = Math.max(0, Math.min(1, data?.speed || 0));
    click(0, 0.1 * (1 - 0.4 * sp)); if (R() < 0.75 - 0.5 * sp) click(0.035 + R() * 0.015, 0.06);
    burst(0.08 + 0.07 * sp, 470 + R() * 140 + 220 * sp, 0.02 + 0.016 * sp, 1.4, false, gearG);
    tone(150 + 170 * sp + R() * 15, 0.01 + 0.008 * sp, 0.1 + 0.05 * sp, "triangle", 0, gearG); // the gears' own hum
  }
  else if (name === "strain") {
    // the line under a fish's pull: a low hum through the taut line, as loud as it's pulling (once a surge, never a loop)
    const k = Math.max(0, Math.min(1.4, data?.tension || 0.5));
    burst(0.35 + 0.25 * k, 190 + R() * 60 + 90 * k, 0.03 + 0.05 * k, 6, false, gearG); burst(0.2, 2400 + R() * 600, 0.008 * k, 3, true, gearG, 0.05);
  }
  else if (name === "drag") { const n = 5 + Math.floor(R() * 4); for (let i = 0; i < n; i++) burst(0.016, 4000 + R() * 800, 0.085 * v(), 5, false, gearG, (i * (24 + R() * 8)) / 1000); burst(0.22, 6500, 0.012, 2, true, gearG); } // the drag giving line: a fast ratchet, and the line hissing off the spool
}
