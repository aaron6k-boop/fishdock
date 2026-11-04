// ---- shoreMap: how far each bit of water is from land, for foam and shallows on the water (pure, no three.js) ----
// A square around the place, `half` metres each way from the middle, sampled `n` times a side. For each sample: the
// distance in metres to the nearest land (capped at SHORE.cap), found with a two-pass chamfer (fast enough to build on
// a phone as the view opens: about 37,000 cells). The water shader reads it as a small texture: foam washing along
// walls, piers and banks, lighter water in the shallows, the dark of a wall reflected close to it.

export const SHORE = { half: 240, n: 192, cap: 40 };
// and a fine one round the anglers (half a metre a cell): the coarse map's 2.5 m cells drew a diagonal wall as a
// staircase, so its foam lay in blocks a couple of metres off the wall or under the deck
export const SHORE_FINE = { half: 48, n: 192, cap: 8 };

/** Distances (metres, Float32Array n×n, row by row from -half to +half in z, x across) from `isLand(x, z)`. */
export function shoreDistances(isLand, { half = SHORE.half, n = SHORE.n, cap = SHORE.cap } = {}) {
  const step = (2 * half) / n, d = new Float32Array(n * n), INF = 1e9;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d[j * n + i] = isLand(-half + (i + 0.5) * step, -half + (j + 0.5) * step) ? 0 : INF;
  const a = step, b = step * Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - n] + a); if (i > 0) v = Math.min(v, d[k - n - 1] + b); if (i < n - 1) v = Math.min(v, d[k - n + 1] + b); }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = d[k];
    if (i < n - 1) v = Math.min(v, d[k + 1] + a);
    if (j < n - 1) { v = Math.min(v, d[k + n] + a); if (i < n - 1) v = Math.min(v, d[k + n + 1] + b); if (i > 0) v = Math.min(v, d[k + n - 1] + b); }
    d[k] = v;
  }
  for (let k = 0; k < d.length; k++) d[k] = Math.min(cap, d[k]);
  return d;
}

/** The same as bytes for a texture (0 = on the shore, 255 = `cap` metres or more out). */
export const shoreBytes = (dist, cap = SHORE.cap) => Uint8Array.from(dist, (v) => Math.round((v / cap) * 255));

/** Where the land is in a drawn (representative) place, for its foam: the pier's deck, a quay, the banks. */
export function drawnLand(venue, L) {
  if (venue === "pier") return (x, z) => (Math.abs(x) < L.width / 2 + 0.35 && z < L.from && z > L.to - 0.3) || (Math.abs(x - 140) < 120 && Math.abs(z - 30) < 4);
  if (venue === "estuary") return (x, z) => z > 0 || z < L.farBank;
  if (venue === "river" || venue === "lake") return (x, z) => z > 0.3 || z < L.farBank;
  return null; // the beach has its own breaking surf
}
