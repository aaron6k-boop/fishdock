// ---- reelModel: fighting a fish by tapping the reel (virtual fishing; pure, tested) ----
// Every tap turns the reel's handle and wins some line. How fast you tap sets how fast you wind, with a sensible curve:
// three to five taps a second works well, and frantic tapping adds less and less. The fish pulls back in its own way
// (fightProfile: heavy and steady for cod and rays, quick runs for mackerel and bass), tiring as the fight goes on.
// When the line's tension passes the drag, the drag slips: the reel gives line instead of gaining it, however fast you
// tap, and a strong run can take line back even while you wind. Stop winding and a fish slowly swims off; leave the
// line slack a long time and the hook can come free. In Advanced mode you set the drag yourself, and set it too tight
// and the line can break. Standard mode sets the drag for you, so the line never breaks: forgiving, but not automatic.
// Nothing here is real fishing: it's the virtual game, and its catches are always marked simulated.
import { fightProfile, fightSeconds } from "./sceneActors.js";
import { DUR } from "./liveEvents.js";

export const REEL = { window: 1.2, sweet: 4, turnsPerTap: 0.5, assistedRate: 3.6, nearAt: 0.93, slackFree: 6, breakAfter: 0.9 };
export const DRAG = { min: 0.45, max: 1.05, standard: 0.78, step: 0.08 };

/** Taps a second, from the times (ms) of recent taps. */
export function tapRate(times, now) {
  const w = REEL.window * 1000, recent = times.filter((t) => now - t <= w);
  if (!recent.length) return 0;
  // a single tap counts as a short burst (so one tap still winds a little), then it's taps over the window
  return Math.max(recent.length / REEL.window, recent.length === 1 ? 1.4 : 0);
}
/** How hard you're winding, 0..1, from taps a second: nearly in proportion up to about 4, then less and less. */
export const effort = (rate) => (rate <= 0 ? 0 : 1 - Math.exp(-rate / 3.4));

const rngOf = (seed) => { let a = seed | 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/**
 * A new fight: { species, lengthCm, startM (metres of line out, from the cast), mode: "standard" | "advanced", seed }.
 * The state is plain data: { progress 0..1, dist (m), tension 0..~1.3, slipping, near, out: null | "broke" | "free",
 * drag, age, runs: [[start, end, strength]], ... }.
 */
export function createFight({ species = null, lengthCm = 40, startM = 30, mode = "standard", seed = 1 } = {}) {
  const p = fightProfile(species), rnd = rngOf(seed);
  const runs = [];
  // the fish's runs: sudden bursts, more and harder for the quick fighters, fewer as it tires
  for (let t = 1.5 + rnd() * 3; t < 120; t += (5 + rnd() * 8) / Math.max(0.5, p.tempo)) runs.push([t, t + 0.8 + rnd() * 1.6 * p.long, 0.5 + rnd() * 0.6]);
  return {
    species, lengthCm, startM: Math.max(3, startM), mode, seed,
    pull: p.pull, tempo: p.tempo, long: p.long, need: fightSeconds(species, lengthCm), runs,
    progress: 0, dist: Math.max(3, startM), tension: 0, slipping: false, near: false, out: null, drag: DRAG.standard,
    age: 0, slack: 0, over: 0, turns: 0, fishPull: 0, running: false,
  };
}

/** How hard the fish pulls right now (0..~1.6): its strength, its runs and surges, less as it tires. */
export function fishPull(s, age = s.age) {
  const stamina = Math.exp(-age / (22 * s.long));
  const surge = Math.max(0, Math.sin(age * 0.95 * s.tempo + 1.3)) ** 6;
  const run = s.runs.find(([a, b]) => age >= a && age < b);
  const runK = run ? run[2] * Math.sin(Math.PI * (age - run[0]) / (run[1] - run[0])) : 0;
  return { pull: s.pull * (0.35 + 0.65 * stamina) * (0.42 + 0.35 * surge + 0.75 * runK), running: runK > 0.25 };
}

/**
 * One step of `dt` seconds. input: { rate (taps a second), assisted, drag (advanced mode) }. Returns the new state.
 * Tension 1 is where the line would part; the drag slips before that (always, in Standard mode).
 */
export function fightStep(s0, dt, input = {}) {
  const s = { ...s0 };
  if (s.out || s.progress >= 1) return s;
  s.age += dt;
  const rate = input.assisted ? REEL.assistedRate : input.rate || 0, e = effort(rate), e4 = effort(REEL.sweet);
  const { pull, running } = fishPull(s);
  s.fishPull = pull; s.running = running;
  const pullN = Math.min(1.2, pull / 1.4);
  // the drag: set by you in Advanced mode, otherwise set to give before the line could part
  s.drag = s.mode === "advanced" ? Math.max(DRAG.min, Math.min(DRAG.max, input.drag ?? s.drag)) : DRAG.standard;
  // tension: the fish's pull, plus your winding against it (more so against a run)
  let tension = 0.2 * e + 0.62 * pullN + (running ? 0.22 * e : 0);
  s.slipping = tension > s.drag;
  if (s.slipping) tension = s.drag + (tension - s.drag) * (s.mode === "advanced" ? 0.35 : 0.12); // the drag gives
  s.tension = tension;
  // line won: tapping (with its curve), less against a strong pull; scaled so a fish takes about its fight's length
  const span = 1 / (s.need * 0.95);
  let dp = (e / e4) * span * (1 - 0.5 * pullN) * dt;
  if (s.slipping) dp -= (tension - s.drag + 0.08 + 0.25 * (running ? 1 : 0)) * span * 2.4 * dt + dp * 0.75; // the fish takes line
  if (rate < 0.3) dp -= span * 0.22 * pullN * dt; // not winding: it slowly swims off
  s.progress = Math.max(0, Math.min(1, s.progress + dp));
  s.dist = s.startM * (1 - s.progress);
  s.turns += (rate * REEL.turnsPerTap) * dt;
  s.near = s.progress >= REEL.nearAt;
  // slack: a long time with hardly any pressure and the hook can come out
  s.slack = tension < 0.12 && !s.near ? s.slack + dt : Math.max(0, s.slack - dt * 2);
  if (s.slack > REEL.slackFree) s.out = "free";
  // too tight for too long (only possible with your own drag set high)
  s.over = s.mode === "advanced" && tension > 0.98 ? s.over + dt : 0;
  if (s.over > REEL.breakAfter) s.out = "broke";
  return s;
}

/** Seconds to land a fish tapping steadily at `rate` (for tests and tuning); Infinity if it never lands. */
export function timeToLand(opts, rate, { assisted = false, maxS = 240, drag } = {}) {
  let s = createFight(opts);
  for (let t = 0; t < maxS; t += 0.05) { s = fightStep(s, 0.05, { rate, assisted, drag }); if (s.near) return t; if (s.out) return Infinity; }
  return Infinity;
}

/** Strike timing: "early" in the first moment of a bite, "late" near its end, otherwise "good". */
export function strikeTiming(msSinceBite, biteMs = DUR.bite) { return msSinceBite < 250 ? "early" : msSinceBite > biteMs - 1500 ? "late" : "good"; }
