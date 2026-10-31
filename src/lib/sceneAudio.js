// ---- sceneAudio: quiet sound for the Live Fishing View, made on the phone (no sound files to download) ----
// Off until someone taps "Sound" (browsers only allow audio after a tap). A tip bell for a bite, the reel's ratchet
// while a fish is played, splashes, and a soft wash of the water underneath.

let ac = null, master = null, wash = null, washGain = null, reelTimer = null;

function ensure() {
  if (ac) return ac;
  const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
  return ac;
}
function noiseBuffer(sec = 2) {
  const b = ac.createBuffer(1, Math.round(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return b;
}

export function soundOn({ kind = "sea", wind = 0.3 } = {}) {
  if (!ensure()) return false;
  ac.resume?.();
  if (!wash) {
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(4); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = kind === "sea" ? 700 : 420;
    washGain = ac.createGain(); washGain.gain.value = 0;
    const lfo = ac.createOscillator(); lfo.frequency.value = kind === "sea" ? 0.11 : 0.05;
    const lfoGain = ac.createGain(); lfoGain.gain.value = kind === "sea" ? 0.05 + wind * 0.05 : 0.015;
    lfo.connect(lfoGain); lfoGain.connect(washGain.gain);
    src.connect(lp); lp.connect(washGain); washGain.connect(master);
    src.start(); lfo.start();
    wash = src;
  }
  washGain.gain.setTargetAtTime(kind === "sea" ? 0.07 + wind * 0.05 : 0.025, ac.currentTime, 0.8);
  return true;
}
export function soundOff() {
  if (!ac) return;
  try { washGain?.gain.setTargetAtTime(0, ac.currentTime, 0.2); } catch { /* ignore */ }
  clearInterval(reelTimer); reelTimer = null;
}

function bell() {
  const t = ac.currentTime;
  for (const [f, g, d] of [[2093, 0.16, 1.4], [3140, 0.07, 0.9], [4186, 0.04, 0.6]]) {
    const o = ac.createOscillator(), v = ac.createGain();
    o.frequency.value = f; o.type = "sine";
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v); v.connect(master); o.start(t); o.stop(t + d);
  }
}
function burst(dur, freq, gain, q = 0.8) {
  const t = ac.currentTime, src = ac.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1);
  const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
  const v = ac.createGain(); v.gain.setValueAtTime(gain, t); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(v); v.connect(master); src.start(t); src.stop(t + dur + 0.05);
}
function click() { burst(0.025, 3200, 0.12, 4); }

/** Plays a named effect if sound is on: bell, plop, splash, bigsplash, whoosh, reelOn, reelOff. */
export function play(name) {
  if (!ac || ac.state !== "running") return;
  if (name === "bell") bell();
  else if (name === "plop") burst(0.25, 900, 0.5, 1.2);
  else if (name === "splash") burst(0.5, 1200, 0.45, 0.6);
  else if (name === "bigsplash") { burst(0.9, 900, 0.8, 0.5); setTimeout(() => burst(0.6, 1800, 0.35, 0.7), 120); }
  else if (name === "whoosh") burst(0.35, 2400, 0.18, 0.4);
  else if (name === "reelOn") { clearInterval(reelTimer); reelTimer = setInterval(click, 70); setTimeout(() => { clearInterval(reelTimer); reelTimer = null; }, 20000); }
  else if (name === "reelOff") { clearInterval(reelTimer); reelTimer = null; }
}
