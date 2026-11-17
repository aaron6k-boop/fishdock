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
export function bodyWave(u, t, { tempo = 1, flex = 1, beat = 1, curl = 0, kind = "", shake = 0 } = {}) {
  const K = WAVES[kind] || WAVES.carangiform;
  const wave = Math.sin(t * 9 * tempo - u * K.lam) * 0.11 * beat * flex * K.env(u);
  return wave + curl * u * u + shake * HEAD_SHAKE * Math.sin(t * 16) * (1 - u) * (1 - u);
}

/** The slope of bodyWave along the body (d/du), for turning the fish's normals with its bend without working them
 *  out again from the triangles every frame. */
export function bodyWaveSlope(u, t, { tempo = 1, flex = 1, beat = 1, curl = 0, kind = "", shake = 0 } = {}) {
  const K = WAVES[kind] || WAVES.carangiform, th = t * 9 * tempo - u * K.lam, k = 0.11 * beat * flex;
  return k * (Math.cos(th) * -K.lam * K.env(u) + Math.sin(th) * K.envD(u)) + 2 * curl * u - 2 * shake * HEAD_SHAKE * Math.sin(t * 16) * (1 - u);
}

// how each kind of fish swims: the wave's length along the body (lam: radians over a body length; the longer the
// fish's wave the fewer of them on its body at once) and how the bend grows from head to tail. Most fish (a bass, a
// cod) swing mostly the back half (carangiform); an eel or a conger the whole body in more than one wave
// (anguilliform); a dogfish, a smoothhound or a tope between the two; a mackerel or a garfish keeps its body stiff and
// drives with the tail alone (towards thunniform)
const WAVES = {
  carangiform: { lam: 5.2, env: (u) => 0.18 + 0.82 * u * u, envD: (u) => 1.64 * u },
  eel: { lam: 9.5, env: (u) => 0.35 + 0.65 * u, envD: () => 0.65 },
  shark: { lam: 7.5, env: (u) => 0.25 + 0.75 * Math.max(0, u) ** 1.5, envD: (u) => 1.125 * Math.sqrt(Math.max(0, u)) }, // (from 0: a gaping shark's jaw tip reaches a little ahead of its snout, u below 0, and a fractional power of that was not a number: its jaw's points vanished, the 17 November release check)
  tuna: { lam: 4.6, env: (u) => 0.12 + 0.88 * u ** 3, envD: (u) => 2.64 * u * u },
};
const HEAD_SHAKE = 0.06; // (a hooked fish shaking its head: the head swings most, the tail barely)

/** Which way of swimming a species has (bodyWave's kind). */
export function swimKind(species, { eel = false } = {}) {
  if (eel) return "eel";
  if (["lesser-spotted-dogfish", "smoothhound", "tope", "bull-huss", "spurdog"].includes(species)) return "shark";
  if (["mackerel", "garfish", "bonito"].includes(species)) return "tuna";
  return "carangiform";
}

// ---- out of the water ----
/**
 * A fish lying on the mat or held: now and then a burst of two to four quick flips of the tail, side to side, then
 * still for a few seconds with a twitch or two between (curl, as bodyWave's, and how hard it beats). seed (0..1) sets
 * one fish's own timing; tired (0..1) makes the bursts rarer and weaker as it's been out longer.
 */
export function flapping(t, { seed = 0, tired = 0 } = {}) {
  const per = (4.2 + 2.4 * ((seed * 9.7) % 1)) * (1 + 1.2 * tired), cyc = t / per + seed, n = Math.floor(cyc), ph = (cyc - n) * per;
  const flips = 2 + ((n * 7 + Math.floor(seed * 5)) % 3), flipS = 0.22, burst = flips * flipS, k = 1 - 0.6 * tired;
  if (ph < burst) {
    const f = ph / flipS, side = Math.floor(f) % 2 ? -1 : 1, e = Math.sin(Math.PI * (f % 1));
    return { curl: side * 0.55 * e * k * (1 - 0.15 * Math.floor(f)), beat: 0.6 * k };
  }
  const tw = Math.max(0, Math.sin((ph - burst) * 3.1 + seed * 11)) ** 16;
  return { curl: 0.08 * tw * k, beat: 0.06 };
}

// ---- breathing ----
/**
 * How far the mouth is open and the gill covers lifted (each 0 to 1, as the modelled fish's shape keys, build_fish3.py)
 * at time t. In the water ("water") slow and slight, the gill covers opening as the mouth closes, as a fish pumps water
 * over its gills; hooked ("hooked") the mouth held half open by the hook and working faster; out of the water ("air")
 * gasping: every two to three seconds the mouth opens wide and shuts, the covers flaring as it shuts, every third gasp
 * a weaker one. seed (0..1) sets one fish's own rhythm. A flatfish's mouth opens less.
 */
export function breathing(t, { mode = "water", flat = false, seed = 0 } = {}) {
  const frac = (x) => x - Math.floor(x);
  if (mode === "air") {
    const per = 2.3 + 0.6 * frac(seed * 7.13), cyc = t / per + seed, ph = frac(cyc);
    const open = ph < 0.18 ? ease(ph / 0.18) : ph < 0.42 ? 1 - ease((ph - 0.18) / 0.24) : 0;
    const flare = ph > 0.3 && ph < 0.75 ? Math.sin((Math.PI * (ph - 0.3)) / 0.45) : 0;
    const weak = Math.floor(cyc) % 3 === 2 ? 0.45 : 1;
    return { gape: 0.06 + (flat ? 0.6 : 0.85) * open * weak, gills: 0.9 * flare * weak };
  }
  if (mode === "hooked") { const w = (t * 2 * Math.PI) / 0.85 + seed * 6; return { gape: 0.38 + 0.12 * Math.sin(w), gills: 0.35 + 0.25 * Math.sin(w - 1.6) }; }
  const w = (t * 2 * Math.PI) / 1.5 + seed * 6;
  return { gape: 0.1 + 0.08 * Math.sin(w), gills: 0.12 + 0.12 * Math.sin(w - 1.8) };
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

/** Where a tired fish's spine sits when it's drawn over the surface on a tight line: just under it, its back (or, lying
 *  over, its flank) well out of the water (never hanging straight down under the surface, never floating clear of it).
 *  (Its spine was nearly half its depth under: lying on its side, two or three centimetres showed, which a passing wave
 *  or a dark sea hid, and the line ran down to nothing while the net came down to it) */
export function surfaceSpine(waterY, halfDepth) {
  return waterY - halfDepth * 0.2;
}

// ---- putting it back ----
/**
 * The steps of putting a fish back (seconds from when you chose to): carried from the mat to the net (or the water's
 * edge); off a pier, the drop net lifted over the rail and let down the wall on its rope; from a bank, the landing
 * net held out at the edge; then it swims out of the net, along the surface and down out of sight.
 */
export function releasePlan(venue, light = false) {
  // (off a pier the empty net is then hauled back up the wall and lifted over the rail onto the deck: haul. It used to
  // vanish at the foot of the wall and reappear on the deck)
  // (a light fish, one that was swung up rather than netted, goes back the way pier anglers put a small fish back:
  // carried to the rail, held out over the water and let go. drop: it falls to the water, then swims off)
  if (venue === "pier" && light) return { carry: 1.0, over: 2.2, lower: 3.1, swim: 7.0, net: false, drop: true };
  if (venue === "pier") return { carry: 1.0, over: 2.0, lower: 4.6, swim: 9.0, haul: 12.6, net: true };
  if (venue === "beach") return { carry: 1.0, over: 1.0, lower: 1.6, swim: 5.0, net: false };
  return { carry: 1.0, over: 1.0, lower: 2.2, swim: 5.6, net: true };
}
/** Which step of the plan kt is in: carry | over | lower | swim | haul (a pier's empty net coming back up) | gone. */
export function releaseStep(kt, plan) {
  return kt < plan.carry ? "carry" : kt < plan.over ? "over" : kt < plan.lower ? "lower" : kt < plan.swim ? "swim" : plan.haul && kt < plan.haul ? "haul" : "gone";
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
