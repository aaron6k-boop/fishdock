// ---- sceneAudio: quiet sound for the Live Fishing View, made on the phone (no sound files to download) ----
// Off until someone taps "Sound" (browsers only allow audio after a tap). Underneath: the water (a wash of waves
// at the sea, a softer lap on a river or lake), the wind in gusts, rain when it's raining, and now and then a gull
// by the sea in daylight. On top: the bite (a tip bell on a sea rod, an electronic bite alarm on a river or lake
// rod), the reel's ratchet while a fish is played, the cast and the splashes. Everything follows the scene's own
// conditions, so what you hear matches what you see. One level control and mute.

let ac = null, master = null, reelTimer = null, gullTimer = null;
const layers = {}; // wash, wind, rain: { src, gain, ... }
let env = { kind: "sea", wind: 0.3, rain: 0, night: 0, venue: "pier" };
let level = 0.7, on = false;

function ensure() {
  if (ac) return ac;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  return ac;
}
// brown-ish noise (soft, like water) or white noise (hiss, like rain)
function noiseBuffer(sec = 2, white = false) {
  const b = ac.createBuffer(1, Math.round(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const r = Math.random() * 2 - 1;
    if (white) d[i] = r * 0.5; else { last = (last + 0.02 * r) / 1.02; d[i] = last * 3.5; }
  }
  return b;
}
// a looping noise bed through a filter, with a slow swell on its level
function bed(name, { white = false, type = "lowpass", freq = 600, q = 0.7, lfoHz = 0.1 }) {
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(4, white); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const gain = ac.createGain(); gain.gain.value = 0;
  const swell = ac.createGain(); swell.gain.value = 1;
  const lfo = ac.createOscillator(); lfo.frequency.value = lfoHz;
  const depth = ac.createGain(); depth.gain.value = 0;
  lfo.connect(depth); depth.connect(swell.gain);
  src.connect(f); f.connect(swell); swell.connect(gain); gain.connect(master);
  src.start(); lfo.start();
  layers[name] = { src, f, gain, depth, lfo };
  return layers[name];
}
const to = (param, v, tc = 0.8) => { try { param.setTargetAtTime(v, ac.currentTime, tc); } catch { /* ignore */ } };

// what each layer should be doing for the current conditions
function apply() {
  if (!ac) return;
  const sea = env.kind === "sea", w = Math.max(0, Math.min(1, env.wind)), r = Math.max(0, Math.min(1, env.rain));
  const wash = layers.wash || bed("wash", { freq: 650, lfoHz: 0.1 });
  to(wash.f.frequency, sea ? 520 + w * 500 : 380 + w * 120);
  to(wash.lfo.frequency, sea ? 0.08 + w * 0.06 : 0.05);
  to(wash.depth.gain, sea ? 0.5 + w * 0.4 : 0.2);
  to(wash.gain.gain, on ? (sea ? 0.06 + w * 0.07 : 0.02 + w * 0.015) : 0);
  const wind = layers.wind || bed("wind", { type: "bandpass", freq: 500, q: 0.6, lfoHz: 0.07 });
  to(wind.f.frequency, 380 + w * 700);
  to(wind.depth.gain, 0.6);
  to(wind.gain.gain, on ? Math.max(0, w - 0.15) * 0.09 : 0, 1.5);
  const rain = layers.rain || bed("rain", { white: true, type: "highpass", freq: 2500, q: 0.5, lfoHz: 0.3 });
  to(rain.f.frequency, 3200 - r * 1500);
  to(rain.depth.gain, 0.15);
  to(rain.gain.gain, on ? r * r * 0.12 + (r > 0 ? 0.01 : 0) : 0, 1.2);
  // gulls: by the sea in daylight, not in heavy rain, every 8 to 30 seconds
  clearTimeout(gullTimer); gullTimer = null;
  if (on && sea && env.night < 0.5 && r < 0.6) {
    const next = () => { gullTimer = setTimeout(() => { if (ac.state === "running") gull(); next(); }, 8000 + Math.random() * 22000); };
    next();
  }
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
  clearTimeout(gullTimer); gullTimer = null;
  apply();
}
/** The overall level, 0..1. */
export function setVolume(v) {
  level = Math.max(0, Math.min(1, Number(v) || 0));
  if (ac && on) to(master.gain, level, 0.1);
}

function tone(f, g, d, type = "sine", at = 0) {
  const t = ac.currentTime + at, o = ac.createOscillator(), v = ac.createGain();
  o.frequency.value = f; o.type = type;
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v); v.connect(master); o.start(t); o.stop(t + d + 0.02);
}
function bell() { for (const [f, g, d] of [[2093, 0.16, 1.4], [3140, 0.07, 0.9], [4186, 0.04, 0.6]]) tone(f, g, d); }
// an electronic bite alarm: a run of short beeps, quicker for a strong take
function alarm(n = 4) { for (let i = 0; i < n; i++) tone(1850, 0.09, 0.09, "square", i * 0.16); }
function burst(dur, freq, gain, q = 0.8, white = false) {
  const t = ac.currentTime, src = ac.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1, white);
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
  const v = ac.createGain(); v.gain.setValueAtTime(gain, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(v); v.connect(master); src.start(t); src.stop(t + dur + 0.05);
}
function click() { burst(0.025, 3200, 0.12, 4); }
// a herring gull's call: a few falling, slightly harsh cries
function gull() {
  const n = 2 + Math.floor(Math.random() * 3), base = 1150 + Math.random() * 300, g = 0.012 + Math.random() * 0.012;
  for (let i = 0; i < n; i++) {
    const t = ac.currentTime + i * (0.28 + Math.random() * 0.1), o = ac.createOscillator(), o2 = ac.createOscillator(), v = ac.createGain();
    o.type = "sawtooth"; o2.type = "sine";
    o.frequency.setValueAtTime(base * 1.25, t); o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.22);
    o2.frequency.value = 38; const fm = ac.createGain(); fm.gain.value = 60; o2.connect(fm); fm.connect(o.frequency);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = base * 1.6; bp.Q.value = 2.5;
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(bp); bp.connect(v); v.connect(master);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  }
}

/** Plays a named effect if sound is on: bell (the bite: a bell at sea, an alarm on fresh water), plop, splash,
 *  bigsplash, whoosh, reelOn, reelOff. */
export function play(name) {
  if (!ac || !on || ac.state !== "running") return;
  if (name === "bell") { if (env.venue === "river" || env.venue === "lake") alarm(3 + Math.floor(Math.random() * 3)); else bell(); }
  else if (name === "plop") burst(0.25, 900, 0.5, 1.2);
  else if (name === "splash") { burst(0.5, 1200, 0.45, 0.6); burst(0.3, 3500, 0.12, 0.8, true); }
  else if (name === "bigsplash") { burst(0.9, 900, 0.8, 0.5); setTimeout(() => { burst(0.6, 1800, 0.35, 0.7); burst(0.5, 4000, 0.12, 0.8, true); }, 120); }
  else if (name === "whoosh") burst(0.35, 2400, 0.18, 0.4);
  else if (name === "reelOn") { clearInterval(reelTimer); reelTimer = setInterval(click, 70); setTimeout(() => { clearInterval(reelTimer); reelTimer = null; }, 20000); }
  else if (name === "reelOff") { clearInterval(reelTimer); reelTimer = null; }
}
