// ---- walker: walking round a place, as in Roblox (pure; tests) ----
// A thumbstick (or WASD) moves you relative to where the camera looks; you turn to face the way you walk; you can
// sprint and jump. You can't walk into the water, through a railing or into a building: `walkable(x, z)` says where
// you may stand and `heightAt(x, z)` how high the ground is there. Blocked straight ahead, you slide along the obstacle
// (so a railing guides you along the edge instead of stopping you dead). Steps up onto a pier or quay are taken
// smoothly; anything higher than a step needs a jump.

// (accel and stop: how quickly you get up to speed and come to a halt, per second. A step and a half to set off and
// about one to stop, so starts and stops read as a person and not a cursor; turn eases you round to the way you go)
export const WALK = { speed: 1.8, sprint: 4.2, turn: 9, jump: 5.2, gravity: 16, step: 0.45, accel: 7.5, stop: 10, air: 4.9, dead: 0.12 };

/** A fresh walker standing at (x, z), facing `face` (radians, 0 = -z). */
export function walker(x, z, face, y = 0) { return { x, z, y, vy: 0, vx: 0, vz: 0, face, speed: 0, air: false, phase: 0 }; }

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of `dt` seconds. input: { x, y } from the stick (-1..1 each, y up = forwards), camYaw (where the camera
 * looks), sprint, jump (pressed this frame). ground: { walkable(x, z), heightAt(x, z) }. Returns the new state.
 */
export function stepWalker(s, input, dt, ground, opt = {}) {
  const W = { ...WALK, ...opt };
  const n = { ...s };
  // a little dead zone in the middle of the stick, then a gentle curve: small pushes walk slowly, a full push walks
  const L = Math.hypot(input.x || 0, input.y || 0), raw = Math.min(1, L), mag = raw < W.dead ? 0 : ((raw - W.dead) / (1 - W.dead)) ** 1.35;
  const ix = L > 1e-3 ? (input.x || 0) / L : 0, iy = L > 1e-3 ? (input.y || 0) / L : 0;
  // forwards is where the camera looks (yaw 0 = -z); right is 90° clockwise of it
  const fx = Math.sin(input.camYaw || 0), fz = -Math.cos(input.camYaw || 0), rx = -fz, rz = fx;
  const dx = (fx * iy + rx * ix) * mag, dz = (fz * iy + rz * ix) * mag;
  const v = (input.sprint ? W.sprint : W.speed) * mag;
  // turn to face the way you're going
  // (a little slower for a big turn, so turning back the way you came is a turn, not a flip)
  if (mag > 0.05) { const want = Math.atan2(dx, -dz), off = wrap(want - s.face); n.face = wrap(s.face + off * Math.min(1, dt * W.turn * (Math.abs(off) > 2 ? 0.7 : 1))); }
  const floor = (x, z) => ground.heightAt(x, z);
  // somewhere you can stand, and no higher above your feet than a step (jump to get up higher)
  const can = (x, z) => ground.walkable(x, z) && (floor(x, z) - n.y <= W.step || !!ground.ramp?.(n.x, n.z, x, z));
  let moved = 0;
  // speed up and slow down smoothly (quicker to stop than to start), in the air too but less
  const tvx = mag > 0 ? (dx / (mag || 1)) * v : 0, tvz = mag > 0 ? (dz / (mag || 1)) * v : 0;
  const k = Math.min(1, dt * (s.air ? W.air : mag > 0 ? W.accel : W.stop));
  n.vx = (s.vx || 0) + (tvx - (s.vx || 0)) * k; n.vz = (s.vz || 0) + (tvz - (s.vz || 0)) * k;
  if (Math.hypot(n.vx, n.vz) < 0.02) { n.vx = 0; n.vz = 0; }
  if (n.vx || n.vz) {
    const sx = n.vx * dt, sz = n.vz * dt;
    // straight on, or slide along whatever's in the way: turned a little either way first (round a curved railing),
    // then along the map's own axes
    const turned = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2].map((r) => { const c = Math.cos(r), sn = Math.sin(r); return [(sx * c - sz * sn) * c, (sx * sn + sz * c) * c]; });
    for (const [mx, mz] of [[sx, sz], ...turned, [sx, 0], [0, sz]]) {
      if (Math.abs(mx) + Math.abs(mz) < 1e-6) continue;
      if (can(n.x + mx, n.z + mz)) { n.x += mx; n.z += mz; moved = Math.hypot(mx, mz); break; }
    }
    // blocked: carry only the speed actually made (no building up against a wall)
    if (moved < Math.hypot(sx, sz) * 0.5 && dt > 0) { const f = moved / Math.max(1e-6, Math.hypot(sx, sz)); n.vx *= f; n.vz *= f; }
  }
  n.speed = dt > 0 ? moved / dt : 0;
  n.phase = (s.phase + moved * 2.2) % (Math.PI * 2); // the stride: about one step every 1.4 m
  // up and down: jumping, falling, and stepping onto higher ground smoothly
  const g = floor(n.x, n.z);
  if (input.jump && !s.air) { n.vy = W.jump; n.air = true; }
  if (n.air || n.y > g + 0.02) {
    n.vy -= W.gravity * dt; n.y += n.vy * dt;
    if (n.y <= g) { n.y = g; n.vy = 0; n.air = false; }
    else n.air = true;
  } else if (n.y < g) { n.y = Math.min(g, n.y + Math.max(1.5, (g - n.y) * 6) * dt); } // up a step, or a ramp onto a pier
  else n.y = g;
  return n;
}

// ---- footsteps: when a foot comes down, from the ground covered (pure; tests) ----
// A person's step lengthens as they speed up (about 0.7 m strolling, 0.8 m walking, 1.3 m running), so the footfalls
// come quicker with speed: about 1.8 a second at a walk, nearer 3 at a run. `stepGait` carries the distance since
// the last footfall; it says when the next one lands and how hard (0..1: a stroll is soft, a run firm).
export function stepLength(speed) { return Math.max(0.6, Math.min(1.35, 0.55 + speed * 0.17)); }
export function stepGait(g = { d: 0 }, moved = 0, speed = 0, air = false) {
  if (air || speed < 0.25) return { d: Math.min(g.d || 0, stepLength(speed) * 0.5), fall: null };
  const len = stepLength(speed), d = (g.d || 0) + moved;
  if (d < len) return { d, fall: null };
  return { d: d - len, fall: { hard: Math.max(0.25, Math.min(1, (speed - 0.25) / 4)), run: speed > 3 } };
}
/** The sound of the ground underfoot for a venue: a pier's or quay's concrete, a beach's shingle, a river or lake
 *  bank's grass and gravel; a deck can say its own (ground.surfaceAt). Wet in the rain. */
export function surfaceFor(venue, own = null, rain = 0) {
  const kind = own || (venue === "beach" ? "shingle" : venue === "river" || venue === "lake" ? "gravel" : "concrete");
  return { kind, wet: rain > 0.15 };
}

// ---- room for everyone (Fish Together): nobody walks through anyone else or fishes on top of them ----
export const ROOM = { body: 0.7, fish: 1.8 };
/** Your position pushed out of anyone you've walked into (others: [[x, z]]). */
export function keepApart(x, z, others = [], min = ROOM.body) {
  for (const [ox, oz] of others) {
    const dx = x - ox, dz = z - oz, d = Math.hypot(dx, dz);
    if (d < min) { const k = d > 1e-6 ? min / d : 0; if (k) { x = ox + dx * k; z = oz + dz * k; } else x = ox + min; }
  }
  return { x, z };
}
/** Whether there's room to fish here: nobody else's spot or person within a rod's width or so. */
export function roomToFish(x, z, others = [], min = ROOM.fish) { return others.every(([ox, oz]) => Math.hypot(x - ox, z - oz) >= min); }
