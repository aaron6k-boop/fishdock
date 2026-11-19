// ---- scrubPlan: where the rough growth stands (scrub.js draws it). No imports, so its test runs with no install ----
export const KINDS = ["scrub", "gorse", "bracken"];
// (metres: width and height of each kind's card, least and most)
export const SIZE = { scrub: [2.2, 5.0, 1.2, 2.6], gorse: [1.6, 3.4, 1.0, 2.0], bracken: [1.0, 1.9, 0.6, 1.2] };

// ---- a slow noise, the same every visit ----
const hash = (x, z, s) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const noise = (x, z, s) => { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };

/**
 * Where the scrub stands. Pure: no three, no document.
 * @param o.grassAt (x, z) -> 0..1 how much grass the ground draws there
 * @param o.yAt (x, z) -> the ground's height
 * @param o.roughAt (x, z) -> 0.15 open or mown grass, 0.6 a town's verge, 1 a bank, 2 a dune
 * @param o.avoid (x, z) -> true on a road, a pier, a building, a car park, a spot
 * @param o.x0, o.x1 the square of ground to cover (the same in z)
 * @param o.cap the most to place; o.step the grid they are tried on, metres
 * @param o.focus [[x, z]] where people stand (the fishing spots): only ground within o.reach metres of one is tried
 *   (a 3 m bush a kilometre off is a pixel, and the ground's grid runs out for kilometres), and over the cap what is
 *   nearest a spot is kept
 * @returns [{ x, y, z, kind, w, h, rot, tint }]
 */
export function scrubSpots({ grassAt, yAt, roughAt = () => 1, avoid = () => false, x0 = -400, x1 = 400, step = 4, cap = 5000, seed = 1, focus = [], reach = 600 } = {}) {
  const out = [], far = (x, z) => { let d = focus.length ? Infinity : 0; for (const f of focus) d = Math.min(d, Math.hypot(x - f[0], z - f[1])); return d; };
  // (the square tried: round the spots, by the reach, on the same grid whatever the spots, so a plant keeps its place)
  let a0 = x0, a1 = x1, b0 = x0, b1 = x1;
  if (focus.length) { const fx = focus.map((f) => f[0]), fz = focus.map((f) => f[1]), snap = (v) => Math.floor(v / step) * step;
    a0 = Math.max(x0, snap(Math.min(...fx) - reach)); a1 = Math.min(x1, snap(Math.max(...fx) + reach)); b0 = Math.max(x0, snap(Math.min(...fz) - reach)); b1 = Math.min(x1, snap(Math.max(...fz) + reach)); }
  for (let z = b0; z < b1; z += step) for (let x = a0; x < a1; x += step) {
    const i = Math.round(x / step), j = Math.round(z / step);
    const r0 = hash(i, j, seed), px = x + (hash(i, j, seed + 1) - 0.5) * step, pz = z + (hash(i, j, seed + 2) - 0.5) * step;
    const rough = roughAt(px, pz); if (rough > 1.5) continue;
    const thick = noise(px / 38, pz / 38, seed + 7), patch = noise(px / 11, pz / 11, seed + 9), tk = Math.max(0, Math.min(1, (thick - 0.5) / 0.16));
    // (how wild the ground is: a bank is, a verge half so, open grass a little; a slope more than the flat)
    const wild0 = rough >= 1 ? 0.8 : rough >= 0.5 ? 0.45 : 0.22, wildMost = Math.min(1, wild0 + 0.4);
    // (most squares grow nothing whatever their slope: those are passed over before the ground is asked anything more)
    if (r0 >= tk * wildMost * 0.7 + (0.14 + 0.4 * patch) * wildMost * 0.7) continue;
    const d = far(px, pz); if (d > reach) continue;
    const g = grassAt(px, pz); if (g < 0.45) continue;
    const y = yAt(px, pz), sl = Math.min(1, Math.hypot(yAt(px + 2, pz) - y, yAt(px, pz + 2) - y) / 2 / 0.55); // (0 flat .. 1 at about 30 degrees and steeper)
    const wild = Math.min(1, wild0 + sl * 0.4);
    const bushy = tk * wild; // (thickets, where the slow noise is high)
    let kind = null;
    if (r0 < bushy * 0.7) kind = hash(i, j, seed + 3) < 0.34 + 0.3 * sl ? "gorse" : "scrub";
    else if (r0 < bushy * 0.7 + (0.14 + 0.4 * patch) * wild * (sl > 0.25 ? 0.7 : 0.3) && patch > 0.45) kind = "bracken";
    if (!kind || avoid(px, pz)) continue;
    const S = SIZE[kind], k = hash(i, j, seed + 4), w = S[0] + (S[1] - S[0]) * k, h = (S[2] + (S[3] - S[2]) * (0.3 * k + 0.7 * hash(i, j, seed + 5))) * (0.75 + 0.25 * g);
    out.push({ x: px, y, z: pz, kind, w, h, rot: hash(i, j, seed + 6) * Math.PI, tint: 0.82 + 0.3 * hash(i, j, seed + 8), d });
  }
  out.total = out.length;
  if (out.length <= cap) return out;
  // (over the cap: what is nearest where people stand is kept)
  const keep = out.slice().sort((a, b2) => a.d - b2.d).slice(0, cap);
  keep.total = out.length;
  return keep;
}
