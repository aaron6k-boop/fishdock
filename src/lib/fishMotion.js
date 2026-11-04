// ---- fishMotion: how a fish moves in the 3D view, as plain numbers (no three.js, so it can be tested) ----
// The body's swimming wave, a heading that turns at a fish's pace (never a spin), how a fish lies on a mat or sits
// at the surface without sinking into what's under it, and the steps of putting a fish back. angler.js uses these
// to pose the fish mesh; nothing here is shown to anglers as a fact.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- the swimming wave ----
/**
 * How far the spine is bent to the side at u (0 at the snout, 1 at the tail tip), in body lengths. A travelling wave
 * running from head to tail (as a fish swims: the head barely moves, the tail sweeps most), its size growing along
 * the body, plus a steady curl (a fish turning, or curled in a net). tempo: beats per second over about 1.4; flex: how
 * much the species bends (an eel a lot, a flatfish little); beat: how hard it's swimming (0 still, 1 cruising, more
 * when it's fighting).
 */
export function bodyWave(u, t, { tempo = 1, flex = 1, beat = 1, curl = 0 } = {}) {
  const env = 0.18 + 0.82 * u * u; // (a little at the head, which counters the tail; most at the tail)
  const wave = Math.sin(t * 9 * tempo - u * 5.2) * 0.11 * beat * flex * env;
  return wave + curl * u * u;
}

// ---- turning ----
/** A heading (radians) turned towards `want` at most `rate` radians a second: a fish turns, it never flips round. */
export function turnToward(cur, want, rate, dt) {
  if (!Number.isFinite(cur)) return want;
  const d = wrap(want - cur), step = rate * Math.max(0, dt);
  return wrap(cur + clamp(d, -step, step));
}

// ---- resting on things ----
/**
 * How high a fish's spine sits above a surface it lies on so nothing of it goes under: on its side (rolled a quarter
 * turn) its half thickness, upright its belly's depth, between them the larger of the two in proportion. halfDepth and
 * halfThick are in metres (from the mesh), roll in radians.
 */
export function restHeight(halfDepth, halfThick, roll = 0) {
  const s = Math.abs(Math.sin(roll)), c = Math.abs(Math.cos(roll));
  return halfDepth * c + halfThick * s;
}

/** Where a tired fish's spine sits when it's drawn over the surface on a tight line: just under it, its back breaking
 *  the water (never hanging straight down under the surface, never floating clear of it). */
export function surfaceSpine(waterY, halfDepth) {
  return waterY - halfDepth * 0.45;
}

// ---- putting it back ----
/**
 * The steps of putting a fish back (seconds from when you chose to): carried from the mat to the net (or the water's
 * edge); off a pier, the drop net lifted over the rail and let down the wall on its rope; from a bank, the landing
 * net held out at the edge; then it swims out of the net, along the surface and down out of sight.
 */
export function releasePlan(venue) {
  if (venue === "pier") return { carry: 1.0, over: 2.0, lower: 4.6, swim: 8.0, net: true };
  if (venue === "beach") return { carry: 1.0, over: 1.0, lower: 1.6, swim: 5.0, net: false };
  return { carry: 1.0, over: 1.0, lower: 2.2, swim: 5.6, net: true };
}
/** Which step of the plan kt is in: carry | over | lower | swim | gone. */
export function releaseStep(kt, plan) {
  return kt < plan.carry ? "carry" : kt < plan.over ? "over" : kt < plan.lower ? "lower" : kt < plan.swim ? "swim" : "gone";
}

/**
 * The fish swimming off (u from 0 to 1 over the swim): how far it has gone (metres, scaled to the fish's size: a big
 * fish covers more ground), how deep (metres under the surface: along the top first, its back showing, then down),
 * which way it bears off (radians to the side of straight out, a gentle curve) and how hard it beats its tail (a few
 * strong strokes to get going, then cruising).
 */
export function swimAway(u, fishLen = 0.5) {
  const k = clamp(u, 0, 1), size = Math.max(1, fishLen * 2);
  const go = ease(clamp(k / 0.15, 0, 1)) * 0.15 + Math.max(0, k - 0.15) * 1.1; // (a pause, a kick, then away)
  const dist = go * 2.6 * size;
  const depth = k < 0.4 ? 0 : Math.pow((k - 0.4) / 0.6, 1.4) * 1.3;
  const bear = 0.45 * ease(clamp((k - 0.1) / 0.6, 0, 1));
  const beat = k < 0.08 ? 0.5 : k < 0.3 ? 1.8 : 1.15;
  return { dist, depth, bear, beat };
}
