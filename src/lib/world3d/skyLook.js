// ---- skyLook: the light for each condition (day, overcast, dusk, rain, night) as plain numbers ----
// environment.js (the sun, the sky's light, the haze) and world.js (exposure, the sky's reflections) both read it, so the
// sky, the water and everything lit agree. Pure (no three.js), so the tests can check it. Colours are linear RGB.
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const sum3 = (...parts) => [0, 1, 2].map((i) => parts.reduce((s, [c, k]) => s + c[i] * k, 0));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---- the haze: the horizon's colour as the sky shader draws it (skyBase in environment.js), all round ----
/** st: { day, dusk, night, cloud, rain, moonLight } (0..1). The colour the distance fades into. */
export function horizonColour({ day = 1, dusk = 0, night = 0, cloud = 0.3, rain = 0 }) {
  // (dusk's horizon is gold towards the sun and lilac-grey away from it: about a third of the way round, on average)
  const duskHor = mix3([0.5, 0.5, 0.62], [0.96, 0.7, 0.48], 0.375);
  const clear = sum3([[0.68, 0.78, 0.87], day], [duskHor, dusk], [[0.05, 0.06, 0.088], night]);
  const g = (day + dusk * 0.5 + night * 0.06) * (1 - rain * 0.38);
  const grey = mix3([0.7 * g, 0.73 * g, 0.76 * g], [0.7 * g * 0.92, 0.73 * g * 0.96, 0.76 * g * 1.04], rain); // (environment.js skyBase: a bright silvery overcast at the horizon)
  return mix3(clear, grey, smooth(0.5, 1, cloud) * 0.9);
}

// ---- the light: sun (or moon), the sky's light, shadows, haze, exposure ----
/** st as horizonColour. Returns everything the lights and the renderer need for these conditions. */
export function lightingFor(st) {
  const { day = 1, dusk = 0, night = 0, cloud = 0.3, rain = 0, moonLight = 0 } = st;
  const over = smooth(0.5, 1, cloud); // how overcast
  // direct light: thick cloud all but hides the sun (rain more so), so there's no hard sun glare on wet ground in rain
  const sunVis = (1 - 0.88 * over) * (1 - 0.5 * rain);
  // warm and low at dusk, but a gold, not an orange: the deck still looks like concrete
  let sunColour = sum3([[1, 0.95, 0.88], day], [[1, 0.8, 0.62], dusk], [[0.62, 0.7, 0.88], night]);
  sunColour = mix3(sunColour, [0.95, 0.95, 0.96], over * 0.6);
  const sunIntensity = (2.5 * day + 1.45 * dusk + 0.3 * night * moonLight) * sunVis;
  // the sky's own light: more of it under a bright overcast (the cloud spreads the sun), a blue moonlit fill at night
  // (never so little that the shadows go black)
  const skyColour = sum3([mix3([0.66, 0.76, 0.92], [0.82, 0.84, 0.86], over), day], [[0.66, 0.62, 0.74], dusk], [[0.42, 0.5, 0.72], night]);
  const groundColour = sum3([[0.32, 0.3, 0.27], day], [[0.3, 0.26, 0.24], dusk], [[0.13, 0.13, 0.15], night]);
  const skyIntensity = (day * (0.72 + 0.7 * over) + dusk * (0.78 + 0.3 * over) + night * (0.34 + 0.22 * moonLight)) * (1 - 0.12 * rain);
  // shadows: crisp in sun, faint under a grey sky, soft by moonlight
  const shadow = mix(mix(0.85, 0.32, over), 0.55, night);
  // haze (exponential, the same for the land and the water): further in rain, a little at dusk and at night. Even on a
  // clear day sea air softens the far shore (about a tenth hazed at 500 m, two fifths at a kilometre), so the distant
  // piers and dunes sit back instead of looking as sharp as the deck
  const fogDensity = (0.00068 + 0.0003 * over + 0.00015 * dusk + 0.00025 * night) + rain * 0.0024;
  // the eye adapts: dusk and night are lifted, a grey day a touch, so nothing is crushed to black
  const exposure = 1 + 0.22 * dusk + 0.5 * night + 0.2 * over * (1 - night) + 0.06 * rain; // (a grey day lifted more: the eye adapts to it, and at a touch it all read dim and murky on a phone)
  // how strongly the sky shows in reflections (wet ground in rain shows more of it)
  const envIntensity = 0.6 + 0.15 * rain - 0.1 * night;
  const lampOn = clamp01(night + dusk * 0.35);
  return { sunColour, sunIntensity, sunVis, skyColour, groundColour, skyIntensity, shadow, fogDensity, fogColour: horizonColour(st), exposure, envIntensity, lampOn };
}

// ---- lamps: which of a place's lamp posts light the deck round the anglers ----
/** perches: [[x, y, z]] lamp tops; centre: [x, z]; n: how many. Nearest first, none further than maxDist, and one
 * lamp once (a lamp on the corner of two walls is listed twice). */
export function lampPools(perches = [], centre = [0, 0], n = 2, maxDist = 70) {
  const out = [];
  for (const q of perches.map((p) => ({ p, d: Math.hypot(p[0] - centre[0], p[2] - centre[1]) })).filter((q) => q.d <= maxDist).sort((a, b) => a.d - b.d)) {
    if (out.length >= n) break;
    if (!out.some((o) => Math.hypot(o[0] - q.p[0], o[2] - q.p[2]) < 4)) out.push(q.p);
  }
  return out;
}
/** A lamp's light for its height above the ground (m): a taller lamp needs more to light the same pool. */
export const poolLight = (height) => ({ intensity: 30 * Math.max(1, (height / 4.8) ** 2), distance: Math.max(18, height * 3) });

// ---- quality: what each graphics setting draws for the water, sky and light ----
/** q: world.js's QUALITY3D q (0.5 Performance, 1 Balanced, 2 High quality). */
export function lookQuality(q = 1) {
  const level = q > 1 ? 2 : q >= 1 ? 1 : 0;
  return {
    level,
    waterGrid: [120, 200, 280][level], // the water's mesh (denser near the camera)
    waterDetail: level, // 0: one layer of fine ripples and of raindrop rings; 1: two, plus wind streaks; 2: three
    skyDetail: level > 0 ? 1 : 0, // cloud shading (lit sides and shaded undersides)
    lampLights: [0, 2, 3][level], // lights at the lamp posts nearest the anglers after dark (besides the one over them)
    shadowMap: [0, 2048, 4096][level], // (4096 on High: a person's shadow sharp at their feet, not stepped)
  };
}
