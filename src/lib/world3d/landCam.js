// ---- landCam: the landing and release shots, framed from what has to be seen (plain numbers, no three.js) ----
// Each moment of landing a fish (and putting one back) has things the viewer must see (the fish, the net, the angler)
// and a way to look at them from. The camera looks at the middle of them from that direction, and stands just far
// enough back that every one of them is inside the picture with a margin: so a shot can never be only the water or
// the pier wall while the fish is somewhere else. world.js eases the camera from shot to shot (no cuts in between).
// Vectors are [x, y, z] arrays; directions are in the angler's own frame: [right, up, forward] (forward: out to sea).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The shot for each stage: from: the direction from the subject out to the camera, in the angler's frame
 * ([right, up, forward]); must: what has to be in the picture; want: also in it if that doesn't take the camera too far
 * back; near / far: how close it may come and how far it may go (metres); wide: a wider lens.
 * Drop net stages (angler.js): up (fish at the surface) | rod (rod on the rail) | pick (the net off the deck) | lower |
 * lead (fish over the net) | haul | in (over the rail) | done | deck. Putting it back: carry | over | rlower | swim |
 * rhaul (the empty net hauled back up).
 */
export const SHOTS = {
  // the fish come up beside the pier, you above it at the rail: from out over the water, off to your left, a little
  // above the deck, so the wall runs away at an angle with you at the top and the fish at the bottom
  up: { from: [-0.62, 0.3, 0.72], must: ["fish", "head"], want: ["feet"], near: 3.2, far: 12 },
  rod: { from: [-0.62, 0.32, 0.72], must: ["fish", "head", "feet"], want: [], near: 3.2, far: 12 },
  // getting the net ready: higher, so the deck behind the rail shows (you, the net on the boards); the fish still below
  pick: { from: [-0.55, 0.52, 0.65], must: ["net", "head", "feet"], want: ["fish"], near: 3.2, far: 11 },
  // let down the wall: you at the top, the net coming down to the fish
  lower: { from: [-0.68, 0.24, 0.7], must: ["net", "head", "fish"], want: ["feet"], near: 3.4, far: 13, wide: true },
  // the fish led over the net: closer, lower, the net and the fish big in the picture; you at the top if it fits
  lead: { from: [-0.6, 0.2, 0.78], must: ["net", "fish"], want: ["head"], near: 2.6, far: 7.5 },
  // hauled up: rising with it, you and the net in the one picture
  haul: { from: [-0.68, 0.24, 0.7], must: ["net", "head"], want: ["feet"], near: 3.4, far: 13, wide: true },
  // over the rail and onto the deck: from out over the water, higher, looking down onto the deck
  in: { from: [-0.5, 0.55, 0.68], must: ["net", "head", "feet"], want: [], near: 3, far: 10 },
  done: { from: [-0.5, 0.6, 0.62], must: ["net", "head", "feet"], want: [], near: 3, far: 10 },
  // landed, in the net on the deck: from the deck, off to your left and in front, you and the net together
  deck: { from: [-0.72, 0.45, 0.52], must: ["net", "head", "feet"], want: [], near: 2.4, far: 8 },
  // putting it back: carried from the mat to the net on the deck
  carry: { from: [-0.72, 0.45, 0.52], must: ["fish", "net", "head"], want: ["feet"], near: 2.4, far: 8 },
  // the net (the fish in it) lifted over the rail
  over: { from: [-0.5, 0.55, 0.68], must: ["net", "head"], want: ["feet"], near: 3, far: 10 },
  rlower: { from: [-0.68, 0.26, 0.7], must: ["net", "head"], want: ["feet"], near: 3.4, far: 13, wide: true },
  // swimming free: close on the fish and the net at the foot of the wall, the fish big enough to see
  swim: { from: [-0.55, 0.42, 0.72], must: ["fish", "net"], want: [], near: 2.4, far: 6.5 },
  // the empty net hauled back up to the rail, then onto the deck
  rhaul: { from: [-0.66, 0.3, 0.7], must: ["net", "head"], want: ["feet"], near: 3.4, far: 12, wide: true },
};

/** The camera's frame looking along `fwd` (unit), the horizon level: [right, up]. */
function basis(fwd) {
  let r = cross(fwd, [0, 1, 0]); if (Math.hypot(...r) < 1e-4) r = [1, 0, 0]; r = norm(r);
  return [r, norm(cross(r, fwd))];
}

/**
 * Where to stand to see `points` (world [x, y, z]) looking along -dir (dir: unit, from the subject to the camera):
 * the middle of their box, and far enough back that each is inside tanH/tanV (the lens's half-width and half-height,
 * as tangents) times `margin` (0..1). Returns { pos, at, dist } (dist clamped to near..far).
 */
export function fitShot(points, dir, { tanH, tanV, margin = 0.78, near = 2, far = 12 } = {}) {
  const pts = points.filter(Boolean);
  if (!pts.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  const at = mul(add(lo, hi), 0.5), d = norm(dir), fwd = mul(d, -1), [r, u] = basis(fwd);
  let need = near;
  for (const p of pts) {
    const q = sub(p, at), x = Math.abs(dot(q, r)), y = Math.abs(dot(q, u)), z = dot(q, fwd);
    // at distance D the point is D + z in front of the camera: it fits when |x| <= (D + z) tanH margin
    need = Math.max(need, x / (tanH * margin) - z, y / (tanV * margin) - z, 0.6 - z);
  }
  const dist = clamp(need, near, far);
  return { pos: add(at, mul(d, dist)), at, dist };
}

/** A direction in the angler's frame ([right, up, forward]) turned into the world, for an angler facing `face`. */
export function fromAngler(v, face) {
  const fx = Math.sin(face), fz = -Math.cos(face), sx = -fz, sz = fx;
  return norm([v[0] * sx + v[2] * fx, v[1], v[0] * sz + v[2] * fz]);
}

/**
 * The shot for a stage: the things to see (named points: fish, net, head, feet), the angler's facing and the lens.
 * The `want` points are kept if they fit within the shot's far limit; otherwise only the `must` ones are framed.
 */
export function shotFor(stage, named, face, lens) {
  const S = SHOTS[stage]; if (!S) return null;
  const dir = fromAngler(S.from, face);
  const must = S.must.map((k) => named[k]).filter(Boolean);
  if (!must.length) return null;
  const all = [...must, ...S.want.map((k) => named[k]).filter(Boolean)];
  const opt = { ...lens, near: S.near, far: S.far };
  let fit = fitShot(all, dir, { ...opt, far: 1e9 });
  if (fit.dist > S.far) fit = fitShot(must, dir, opt);
  else fit = fitShot(all, dir, opt);
  return { ...fit, dir, wide: !!S.wide, stage };
}

/** Is a world point inside the picture (with a margin) for a camera at pos looking at `at`? For tests and checks. */
export function onScreen(p, pos, at, { tanH, tanV, margin = 1 }) {
  const fwd = norm(sub(at, pos)), [r, u] = basis(fwd), q = sub(p, pos), z = dot(q, fwd);
  if (z <= 0.05) return false;
  return Math.abs(dot(q, r)) / z <= tanH * margin + 1e-9 && Math.abs(dot(q, u)) / z <= tanV * margin + 1e-9;
}
