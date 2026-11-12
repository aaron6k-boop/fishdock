// ---- reelModel: fighting a fish by tapping the reel (virtual fishing; pure, tested) ----
// Every tap turns the reel's handle half a turn and winds in some line, there and then: tap and line comes in, stop and
// it stops. How much each tap wins depends on how hard the fish is pulling (and nothing while the drag is slipping);
// three to five taps a second works well, and frantic tapping adds less and less. The fish pulls back in its own way
// (fightProfile: heavy and steady for cod and rays, quick runs for mackerel and bass), tiring as the fight goes on.
// When the line's tension passes the drag, the drag slips: the reel gives line instead of gaining it, however fast you
// tap, and a strong run can take line back even while you wind. Stop winding and a fish slowly swims off; leave the
// line slack a long time and the hook can come free. In Advanced mode you set the drag yourself, and set it too tight
// and the line can break. Standard mode sets the drag for you, so the line never breaks: forgiving, but not automatic.
// Nothing here is real fishing: it's the virtual game, and its catches are always marked simulated.
import { fightProfile, fightSeconds } from "./sceneActors.js";
import { DUR } from "./liveEvents.js";

export const REEL = { window: 0.8, sweet: 4, turnsPerTap: 0.5, assistedRate: 3.6, nearAt: 0.93, slackFree: 6, breakAfter: 0.9, dashAt: 0.78 };
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
// ---- how each kind of fish fights (the game's model, from how these fish are known to behave on rod and line) ----
//   strike: [strength, seconds] of what it does the moment it's hooked; runs: [shortest, longest] seconds of a run, and
//   gap: [shortest, longest] seconds between them; turn: how often it changes direction (a second); shake: head-shakes
//   [beats a second, strength]; dive: how much of its effort goes down rather than away; tire: how quickly it tires (1
//   usual); size: a typical fish's length (cm), against which a bigger or smaller one pulls harder or less
const STYLE = {
  // knocks, then dogged and heavy: short runs straight down, slow head-shakes; tires and comes up like a sack
  cod: { strike: [0.7, 1.2], runs: [0.8, 1.8], gap: [5, 9], turn: 0.12, shake: [2.2, 0.55], dive: 0.85, tire: 1.25, size: 55 },
  // a hard, fast first run off the drag, more runs with sharp turns, head-shakes near the top; real stamina
  bass: { strike: [1.25, 3.2], runs: [1.6, 3.4], gap: [3.5, 7], turn: 0.55, shake: [3.4, 0.45], dive: 0.25, tire: 0.75, size: 50 },
  // frantic darting, constant changes of direction, a buzzing tremble on the line; small, so in quickly
  mackerel: { strike: [1.05, 0.9], runs: [0.4, 1.0], gap: [1.2, 2.6], turn: 1.6, shake: [7.5, 0.6], dive: 0.35, tire: 1.1, size: 32 },
  pollack: { strike: [1.3, 2.2], runs: [1.2, 2.6], gap: [4, 8], turn: 0.25, shake: [2.4, 0.4], dive: 0.95, tire: 1.0, size: 50 },
  coalfish: { strike: [1.25, 2.0], runs: [1.2, 2.4], gap: [4, 8], turn: 0.3, shake: [2.6, 0.4], dive: 0.85, tire: 0.95, size: 50 },
  whiting: { strike: [0.5, 0.6], runs: [0.3, 0.8], gap: [1.5, 3], turn: 1.0, shake: [6, 0.5], dive: 0.5, tire: 1.3, size: 30 },
  garfish: { strike: [1.0, 1.2], runs: [0.6, 1.4], gap: [1.5, 3], turn: 1.3, shake: [5, 0.5], dive: 0.1, tire: 1.0, size: 60 },
  "thick-lipped-mullet": { strike: [1.2, 2.6], runs: [1.2, 2.8], gap: [3, 6], turn: 0.6, shake: [3, 0.4], dive: 0.3, tire: 0.8, size: 45 },
  "thornback-ray": { strike: [0.6, 1.5], runs: [2, 4], gap: [6, 11], turn: 0.08, shake: [0.8, 0.2], dive: 1.0, tire: 0.9, size: 60 },
  conger: { strike: [1.1, 2.0], runs: [1.5, 3.5], gap: [3, 6], turn: 0.3, shake: [1.6, 0.7], dive: 1.0, tire: 0.7, size: 120 },
  tope: { strike: [1.5, 5.0], runs: [2.5, 6], gap: [6, 12], turn: 0.25, shake: [1.2, 0.3], dive: 0.5, tire: 0.6, size: 120 },
};
/** A species' fighting style: its own above, otherwise worked out from its fightProfile (pace, darting, strength). */
export function fightStyleOf(species) {
  if (STYLE[species]) return STYLE[species];
  const p = fightProfile(species), e = p.erratic ?? 0.4;
  return { strike: [0.6 + 0.5 * p.pull, 0.8 + p.long], runs: [0.5 + 0.6 * p.long, 1.2 + 1.6 * p.long], gap: [6 / p.tempo, 10 / p.tempo], turn: 0.1 + 1.2 * e, shake: [1.5 + 3 * e, 0.3 + 0.3 * e], dive: p.ray || p.eel ? 1 : p.flat ? 0.6 : p.splashy > 0.6 ? 0.2 : 0.6, tire: 1, size: 45 };
}
/** How much harder (or easier) this fish is than a typical one of its kind: about with its weight's square root. */
export const sizeFactor = (species, lengthCm) => Math.max(0.35, Math.min(2.6, ((lengthCm || 40) / fightStyleOf(species).size) ** 1.5));

export function createFight({ species = null, lengthCm = 40, startM = 30, mode = "standard", seed = 1 } = {}) {
  const p = fightProfile(species), st = fightStyleOf(species), rnd = rngOf(seed), size = sizeFactor(species, lengthCm);
  const runs = [], between = (a) => a[0] + rnd() * (a[1] - a[0]);
  // what it does when hooked, then its runs: each a burst one way, fewer and shorter as it tires (bigger fish keep going
  // longer), each with its own direction (dir: -1 left .. 1 right, as you face it)
  runs.push([0.15, 0.15 + st.strike[1] * Math.sqrt(size), st.strike[0], rnd() < 0.5 ? -1 : 1]);
  for (let t = runs[0][1] + between(st.gap) * 0.6; t < 160; t += between(st.gap)) runs.push([t, t + between(st.runs) * (0.7 + 0.3 * Math.sqrt(size)), 0.55 + rnd() * 0.55, rnd() < 0.5 ? -1 : 1]);
  // its heading wanders on its own between runs, more often for a darting fish
  const heads = []; for (let t = 0; t < 160; t += (0.35 + rnd()) / Math.max(0.05, st.turn)) heads.push([t, rnd() * 2 - 1]);
  return {
    species, lengthCm, startM: Math.max(3, startM), mode, seed,
    pull: p.pull * size, tempo: p.tempo, long: p.long * Math.sqrt(size) / st.tire, need: fightSeconds(species, lengthCm), runs, heads, style: st, size,
    progress: 0, dist: Math.max(3, startM), tension: 0, slipping: false, near: false, out: null, drag: DRAG.standard,
    age: 0, slack: 0, over: 0, turns: 0, fishPull: 0, running: false, taking: false, dir: 0, shake: 0, dive: 0, stamina: 1, dashed: false,
  };
}

/** How hard the fish pulls right now (0..~2.5), which way (dir -1..1), how much it's shaking its head (0..1) and diving
 *  (0..1): its strength, its runs and surges, less as it tires. */
export function fishPull(s, age = s.age) {
  const st = s.style || fightStyleOf(s.species);
  const stamina = Math.exp(-age / (22 * s.long));
  const surge = Math.max(0, Math.sin(age * 0.95 * s.tempo + 1.3)) ** 6;
  const run = s.runs.find(([a, b]) => age >= a && age < b);
  const runK = run ? run[2] * Math.sin(Math.PI * (age - run[0]) / (run[1] - run[0])) : 0;
  // its heading: along the run while it runs, wandering between (smoothly, never a jump)
  const tw = s.heads || [], i = tw.findIndex(([t]) => t > age), a0 = tw[Math.max(0, i - 1)] || [0, 0], a1 = tw[i] || a0, u = a1[0] > a0[0] ? (age - a0[0]) / (a1[0] - a0[0]) : 0;
  const wander = a0[1] + (a1[1] - a0[1]) * (u * u * (3 - 2 * u));
  const dir = Math.max(-1, Math.min(1, run ? wander * 0.35 + run[3] * 0.75 * Math.min(1, runK * 1.6) : wander * 0.6));
  // head-shakes: in bursts, stronger when it's fresh and near the top
  const shake = st.shake[1] * (0.4 + 0.6 * stamina) * Math.max(0, Math.sin(age * st.shake[0] * Math.PI * 2)) ** 2 * (0.5 + 0.5 * Math.max(0, Math.sin(age * 0.7 + s.seed)));
  const pull = s.pull * (0.35 + 0.65 * stamina) * (0.42 + 0.35 * surge + 0.75 * runK + 0.25 * shake);
  return { pull, running: runK > 0.25, dir, shake, dive: st.dive * (0.4 + 0.6 * stamina), stamina };
}

/**
 * One step of `dt` seconds. input: { taps (taps since the last step: each one winds), rate (taps a second lately: how
 * hard you're winding, for the tension), assisted (winding steadily by itself), drag (advanced mode) }. Returns the
 * new state. Tension 1 is where the line would part; the drag slips before that (always, in Standard mode).
 * `running` is true only while the fish is actually taking line (the distance growing), never just because it's
 * pulling; `taking` is that line going out, whatever the cause (a run, the drag slipping, no one winding).
 */
export function fightStep(s0, dt, input = {}) {
  const s = { ...s0 };
  if (s.out || s.progress >= 1) return s;
  s.age += dt;
  const rate = input.assisted ? REEL.assistedRate : input.rate || 0, e = effort(rate);
  const taps = input.assisted ? REEL.assistedRate * dt : Math.max(0, input.taps || 0);
  const { pull, running, dir, shake, dive, stamina } = fishPull(s);
  s.fishPull = pull; s.dir = dir; s.shake = shake; s.dive = dive; s.stamina = stamina;
  const pullN = Math.min(1.2, pull / 1.4);
  // the drag: set by you in Advanced mode, otherwise set to give before the line could part
  s.drag = s.mode === "advanced" ? Math.max(DRAG.min, Math.min(DRAG.max, input.drag ?? s.drag)) : DRAG.standard;
  // tension: the fish's pull, plus your winding against it (more so against a run)
  let tension = 0.2 * e + 0.62 * pullN + (running ? 0.22 * e : 0);
  s.slipping = tension > s.drag;
  if (s.slipping) tension = s.drag + (tension - s.drag) * (s.mode === "advanced" ? 0.35 : 0.12); // the drag gives
  s.tension = tension;
  // line won: each tap's half turn of the handle, less against a strong pull and less again when tapping frantically,
  // nothing while the drag slips (the spool turns, the line doesn't come in); scaled so a fish tapped in at about four
  // a second takes about its fight's length
  const span = 1 / (s.need * 0.95), perTap = span / REEL.sweet;
  const frantic = rate > REEL.sweet ? (effort(rate) / effort(REEL.sweet)) * (REEL.sweet / rate) : 1;
  let dp = taps * perTap * (1 - 0.5 * pullN) * frantic * (s.slipping ? 0.1 : 1);
  if (s.slipping) dp -= (tension - s.drag + 0.08 + 0.25 * (running ? 1 : 0)) * span * 2.4 * dt; // the fish takes line
  if (rate < 0.3 && !input.assisted) dp -= span * 0.22 * pullN * dt; // not winding: it slowly swims off
  const was = s.progress; s.progress = Math.max(0, Math.min(1, s.progress + dp));
  // one last dash when it first comes close and sees the wall or the net: a short, hard run the other way from where it
  // was heading (most fish are lost here, and it is the moment anglers remember). Once only; smaller for a tired fish
  if (!s.dashed && s.progress >= REEL.dashAt && was < REEL.dashAt) {
    s.dashed = true; const len = (0.9 + 0.7 * Math.sqrt(s.size || 1)) * Math.min(1.3, (s.style?.runs?.[1] ?? 1.5) / 1.5);
    s.runs = [[s.age + 0.25, s.age + 0.25 + len, 1.05, s.dir > 0 ? -1 : 1], ...s.runs.filter(([a, b]) => b < s.age || a > s.age + 0.25 + len)];
  }
  s.dist = s.startM * (1 - s.progress);
  s.turns += taps * REEL.turnsPerTap; // the handle turns with each tap, exactly
  s.taking = s.progress < was - 1e-9; s.running = running && s.taking; // (line actually going out: at the very start, with none won yet, there's none to take)
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
  let s = createFight(opts), acc = 0;
  for (let t = 0; t < maxS; t += 0.05) {
    acc += rate * 0.05; const taps = Math.floor(acc); acc -= taps; // taps at a steady rate
    s = fightStep(s, 0.05, { taps, rate, assisted, drag }); if (s.near) return t; if (s.out) return Infinity;
  }
  return Infinity;
}

/** Strike timing: "early" in the first moment of a bite, "late" near its end, otherwise "good". */
export function strikeTiming(msSinceBite, biteMs = DUR.bite) { return msSinceBite < 250 ? "early" : msSinceBite > biteMs - 1500 ? "late" : "good"; }
