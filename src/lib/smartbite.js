// ---- Smart Bite (Beta): adapted from DetectDock's Smart Listen ----
// Two experimental helpers, both on the phone only (nothing is recorded, uploaded or kept):
//   1. Rod-tip watch: the camera watches a box the angler draws round the rod tip and flags sudden movement.
//   2. Bite-alarm listen: the microphone listens for the short electronic bleeps of a bite alarm.
// Neither can reliably tell a bite from wind, waves, rain or a passing boat. They are prompts to look, not detectors.
import { haptics } from "./haptics.js";

// ---- rod-tip motion ----
export function createMotionWatch({ video, roi, onTrigger, onLevel, sensitivity = 0.5 }) {
  const W = 160, H = 120;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  let prev = null, raf = 0, last = 0, noise = 4, streak = 0, cooldownUntil = 0, stopped = false;
  const k = 4.5 - sensitivity * 3; // threshold multiple over the background flicker

  function frame(ts) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (ts - last < 66 || video.readyState < 2) return; // ~15 fps is plenty
    last = ts;
    g.drawImage(video, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H).data;
    const r = roi.current || { x: 0.35, y: 0.1, w: 0.3, h: 0.35 };
    const x0 = Math.floor(r.x * W), y0 = Math.floor(r.y * H), x1 = Math.ceil((r.x + r.w) * W), y1 = Math.ceil((r.y + r.h) * H);
    const lum = new Float32Array(W * H);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) lum[p] = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    if (prev) {
      let inside = 0, nIn = 0, outside = 0, nOut = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const p = y * W + x, d = Math.abs(lum[p] - prev[p]);
        if (x >= x0 && x < x1 && y >= y0 && y < y1) { inside += d; nIn++; } else { outside += d; nOut++; }
      }
      const mi = inside / Math.max(1, nIn), mo = outside / Math.max(1, nOut);
      const camMoved = mo > 10 && mi < mo * 1.6; // the whole picture moved: the phone, not the rod
      noise = noise * 0.97 + Math.min(mi, noise * 2) * 0.03;
      const level = mi / Math.max(1.5, noise);
      onLevel?.(Math.min(1, level / (k * 1.5)), camMoved);
      if (!camMoved && level > k) streak++; else streak = Math.max(0, streak - 1);
      if (streak >= 2 && performance.now() > cooldownUntil) {
        cooldownUntil = performance.now() + 8000; streak = 0;
        onTrigger?.({ kind: "rod-tip", strength: Math.min(1, level / (k * 2)) });
      }
    }
    prev = lum;
  }
  raf = requestAnimationFrame(frame);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}

// ---- bite-alarm bleeps ----
export function createAlarmListen({ stream, onTrigger, onLevel, learnedHz = null }) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
  src.connect(an);
  const bins = new Float32Array(an.frequencyBinCount);
  const hzPer = ac.sampleRate / an.fftSize;
  const lo = Math.floor(900 / hzPer), hi = Math.ceil(5200 / hzPer);
  let tonalSince = 0, beeps = [], timer = 0, stopped = false, cooldownUntil = 0, lastPeakHz = 0;

  function tick() {
    if (stopped) return;
    an.getFloatFrequencyData(bins);
    let peak = -Infinity, at = lo;
    for (let i = lo; i <= hi; i++) if (bins[i] > peak) { peak = bins[i]; at = i; }
    const sorted = Array.from(bins.slice(lo, hi)).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    const sharp = peak - Math.max(bins[at - 6] ?? -140, bins[at + 6] ?? -140); // a tone is a narrow peak
    const hz = at * hzPer;
    const matches = !learnedHz || Math.abs(hz - learnedHz) < 180;
    const tonal = peak - median > 28 && sharp > 14 && peak > -70 && matches;
    onLevel?.(Math.max(0, Math.min(1, (peak - median - 10) / 40)), tonal ? hz : null);
    const now = performance.now();
    if (tonal && !tonalSince) { tonalSince = now; lastPeakHz = hz; }
    if (!tonal && tonalSince) {
      const len = now - tonalSince; tonalSince = 0;
      if (len > 35 && len < 700) beeps.push(now);
    }
    beeps = beeps.filter((t) => now - t < 4000);
    if (beeps.length >= 1 && now > cooldownUntil) {
      const run = beeps.length >= 3;
      if (run || beeps.length === 1) {
        cooldownUntil = now + (run ? 6000 : 2500);
        onTrigger?.({ kind: run ? "run" : "bleep", hz: Math.round(lastPeakHz), count: beeps.length });
        if (run) beeps = [];
      }
    }
  }
  timer = setInterval(tick, 25);
  return {
    stop() { stopped = true; clearInterval(timer); try { src.disconnect(); ac.close(); } catch { /* ignore */ } },
    sampleRate: ac.sampleRate,
  };
}

/** Alert the angler: vibration where the phone supports it, plus an optional short tone. */
export function alertAngler({ sound = true } = {}) {
  haptics.feel("alert", { recorded: true }); // a real alert: felt where the phone can vibrate (haptics.js)
  if (!sound) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 1320; g.gain.value = 0.0001; o.connect(g); g.connect(ac.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
    o.stop(ac.currentTime + 0.4); setTimeout(() => ac.close(), 600);
  } catch { /* ignore */ }
}
