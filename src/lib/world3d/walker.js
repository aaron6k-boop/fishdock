// ---- walker: walking round a place, as in Roblox (pure; tests) ----
// A thumbstick (or WASD) moves you relative to where the camera looks; you turn to face the way you walk; you can
// sprint and jump. You can't walk into the water, through a railing or into a building: `walkable(x, z)` says where
// you may stand and `heightAt(x, z)` how high the ground is there. Blocked straight ahead, you slide along the obstacle
// (so a railing guides you along the edge instead of stopping you dead). Steps up onto a pier or quay are taken
// smoothly; anything higher than a step needs a jump.

// (go and halt: how briskly you get up to speed and come to a halt. Speed follows a critically damped spring, so it
// builds from nothing (a moment's weight shift, then the first step) and settles without a jolt: about half a second to
// walking pace, a little less to stop. turnMax: the quickest you turn, in radians a second, standing (a pivot), at a
// walk and flat out, so a turn is a turn and never an instant flip; turn eases you into the last part of it)
export const WALK = { speed: 1.8, sprint: 4.2, turn: 9, turnMax: [5.5, 4.6, 3.2], jump: 5.2, gravity: 16, step: 0.45, go: 9, halt: 13, air: 4.9, dead: 0.12 };

/** A fresh walker standing at (x, z), facing `face` (radians, 0 = -z). */
export function walker(x, z, face, y = 0) { return { x, z, y, vy: 0, vx: 0, vz: 0, ax: 0, az: 0, face, speed: 0, air: false, phase: 0, turnRate: 0, acc: 0, off: 0 }; }

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---- the body's own limits: how fast you can turn at a speed, and how much of the stick's speed you make while you're
// still turning towards where it points (you turn first and then go, rather than sliding off sideways or backwards) ----
/** The quickest turn (rad/s) at a speed (m/s). */
export function turnLimit(speed, W = WALK) {
  const [a, b, c] = W.turnMax, s = Math.max(0, speed);
  return s <= W.speed ? a + (b - a) * (s / W.speed) : b + (c - b) * Math.min(1, (s - W.speed) / Math.max(0.01, W.sprint - W.speed));
}
/** How much of the wanted speed to make when facing `off` radians away from where you're going (1 straight on). */
export function alignSpeed(off) { return Math.max(0.12, Math.min(1, (Math.cos(off) + 0.35) / 1.35)); }
/** One exact step of a critically damped spring (value x heading for `to`, its rate v), dt seconds at stiffness w. */
export function spring(x, v, to, w, dt) {
  const e = Math.exp(-w * dt), d = x - to, c = v + w * d;
  return [to + (d + c * dt) * e, (v - w * c * dt) * e];
}

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
  // turn to face the way you're going: eased in at the end, never quicker than a body turns (a pivot standing, a wider
  // arc at speed), so turning back the way you came is a turn, not a flip
  const sp0 = Math.hypot(s.vx || 0, s.vz || 0);
  let off = 0;
  if (mag > 0.05) {
    off = wrap(Math.atan2(dx, -dz) - s.face);
    const lim = turnLimit(sp0, W) * dt, step = off * (1 - Math.exp(-dt * W.turn));
    n.face = wrap(s.face + Math.max(-lim, Math.min(lim, step)));
  }
  n.off = wrap(off - wrap(n.face - s.face));
  n.turnRate = dt > 0 ? wrap(n.face - s.face) / dt : 0;
  const floor = (x, z) => ground.heightAt(x, z);
  // somewhere you can stand, and no higher above your feet than a step (jump to get up higher)
  const can = (x, z) => ground.walkable(x, z) && (floor(x, z) - n.y <= W.step || !!ground.ramp?.(n.x, n.z, x, z));
  let moved = 0;
  // speed up and slow down smoothly (a little quicker to stop than to start), in the air too but less; while you're
  // still turning towards where the stick points, only part of the speed (you come round, then stride out)
  const al = mag > 0 ? alignSpeed(n.off) : 0;
  const tvx = mag > 0 ? (dx / (mag || 1)) * v * al : 0, tvz = mag > 0 ? (dz / (mag || 1)) * v * al : 0;
  if (s.air) {
    const k = 1 - Math.exp(-dt * W.air);
    n.vx = (s.vx || 0) + (tvx - (s.vx || 0)) * k; n.vz = (s.vz || 0) + (tvz - (s.vz || 0)) * k; n.ax = 0; n.az = 0;
  } else {
    const w = Math.hypot(tvx, tvz) >= sp0 - 1e-6 && mag > 0 ? W.go : W.halt;
    [n.vx, n.ax] = spring(s.vx || 0, s.ax || 0, tvx, w, dt); [n.vz, n.az] = spring(s.vz || 0, s.az || 0, tvz, w, dt);
  }
  // (settled: a halt ends at rest rather than creeping on)
  if (!(mag > 0) && Math.hypot(n.vx, n.vz) < 0.06) { n.vx = 0; n.vz = 0; n.ax = 0; n.az = 0; }
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
    if (moved < Math.hypot(sx, sz) * 0.5 && dt > 0) { const f = moved / Math.max(1e-6, Math.hypot(sx, sz)); n.vx *= f; n.vz *= f; n.ax *= f; n.az *= f; }
  }
  n.speed = dt > 0 ? moved / dt : 0;
  n.acc = dt > 0 ? (n.speed - (s.speed || 0)) / dt : 0;
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
