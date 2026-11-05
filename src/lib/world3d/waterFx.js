// ---- waterFx: the timing of the rings on the water and the falloff of contact shadows (pure, no three.js) ----
// The water shader (environment.js) draws up to eight rings from [x, z, age, strength]; world.js keeps the list.
// Rings from a fish swirling or a net going in are small and short-lived: a train of wavelets that runs out about a
// metre and is gone within two or three seconds. Long-lived, wide rings from every swirl in a fight piled up round the
// net and, each mirroring a patch of bright sky, showed as big pale loops across the water.

export const RIPPLE = { max: 8, life0: 1.2, lifePer: 1.6, maxLife: 3 };

/** How long (seconds) a ring of strength `s` (0..1, a big splash about 0.8) lasts. */
export const rippleLife = (s) => Math.min(RIPPLE.maxLife, RIPPLE.life0 + RIPPLE.lifePer * Math.min(1, Math.max(0, s)));

/** Its strength now: easing out to nothing at the end of its life (never a sudden cut). */
export const rippleNow = (s, age, life) => s * Math.pow(Math.max(0, 1 - age / life), 1.5);

/** Adds a ring to `list` ([x, z, age, s, life] rows), dropping the faintest when there are already eight. */
export function addRipple(list, x, z, s = 0.6) {
  list.push([x, z, 0, s, rippleLife(s)]);
  if (list.length > RIPPLE.max) {
    let k = 0, lo = Infinity;
    list.forEach((r, i) => { const v = rippleNow(r[3], r[2], r[4]); if (v < lo) { lo = v; k = i; } });
    list.splice(k, 1);
  }
  return list;
}

/** Ages the rings by `dt` seconds, drops the finished ones, and gives the shader's rows [x, z, age, strength now]. */
export function stepRipples(list, dt, out = []) {
  for (const r of list) r[2] += dt;
  for (let i = list.length - 1; i >= 0; i--) if (list[i][2] > list[i][4]) list.splice(i, 1);
  for (let i = 0; i < list.length; i++) { const r = list[i], row = out[i] || (out[i] = [0, 0, 0, 0]); row[0] = r[0]; row[1] = r[1]; row[2] = r[2]; row[3] = rippleNow(r[3], r[2], r[4]); }
  out.length = list.length;
  return out;
}

/** A contact shadow's darkness from its middle (r = 0) to its edge (r = 1): even close under, a long soft tail. */
export function contactFalloff(r) {
  if (r >= 1) return 0;
  const t = Math.max(0, r);
  return Math.pow(1 - t * t, 1.5) * (0.8 + 0.2 * (1 - t));
}
