// ---- walker: walking round a place, as in Roblox (pure; tests) ----
// A thumbstick (or WASD) moves you relative to where the camera looks; you turn to face the way you walk; you can
// sprint and jump. You can't walk into the water, through a railing or into a building: `walkable(x, z)` says where
// you may stand and `heightAt(x, z)` how high the ground is there. Blocked straight ahead, you slide along the obstacle
// (so a railing guides you along the edge instead of stopping you dead). Steps up onto a pier or quay are taken
// smoothly; anything higher than a step needs a jump.

export const WALK = { speed: 4.2, sprint: 7, turn: 10, jump: 5.2, gravity: 16, step: 0.45 };

/** A fresh walker standing at (x, z), facing `face` (radians, 0 = -z). */
export function walker(x, z, face, y = 0) { return { x, z, y, vy: 0, face, speed: 0, air: false, phase: 0 }; }

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * One step of `dt` seconds. input: { x, y } from the stick (-1..1 each, y up = forwards), camYaw (where the camera
 * looks), sprint, jump (pressed this frame). ground: { walkable(x, z), heightAt(x, z) }. Returns the new state.
 */
export function stepWalker(s, input, dt, ground, opt = {}) {
  const W = { ...WALK, ...opt };
  const n = { ...s };
  const L = Math.hypot(input.x || 0, input.y || 0), mag = Math.min(1, L);
  const ix = L > 1e-3 ? (input.x || 0) / L : 0, iy = L > 1e-3 ? (input.y || 0) / L : 0;
  // forwards is where the camera looks (yaw 0 = -z); right is 90° clockwise of it
  const fx = Math.sin(input.camYaw || 0), fz = -Math.cos(input.camYaw || 0), rx = -fz, rz = fx;
  const dx = (fx * iy + rx * ix) * mag, dz = (fz * iy + rz * ix) * mag;
  const v = (input.sprint ? W.sprint : W.speed) * mag;
  // turn to face the way you're going
  if (mag > 0.05) { const want = Math.atan2(dx, -dz); n.face = wrap(s.face + wrap(want - s.face) * Math.min(1, dt * W.turn)); }
  const floor = (x, z) => ground.heightAt(x, z);
  // somewhere you can stand, and no higher above your feet than a step (jump to get up higher)
  const can = (x, z) => ground.walkable(x, z) && (floor(x, z) - n.y <= W.step || !!ground.ramp?.(n.x, n.z, x, z));
  let moved = 0;
  if (v > 0) {
    const sx = dx / (mag || 1) * v * dt, sz = dz / (mag || 1) * v * dt;
    // straight on, or slide along whatever's in the way: turned a little either way first (round a curved railing),
    // then along the map's own axes
    const turned = [0.4, -0.4, 0.8, -0.8, 1.2, -1.2].map((r) => { const c = Math.cos(r), sn = Math.sin(r); return [(sx * c - sz * sn) * c, (sx * sn + sz * c) * c]; });
    for (const [mx, mz] of [[sx, sz], ...turned, [sx, 0], [0, sz]]) {
      if (Math.abs(mx) + Math.abs(mz) < 1e-6) continue;
      if (can(n.x + mx, n.z + mz)) { n.x += mx; n.z += mz; moved = Math.hypot(mx, mz); break; }
    }
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
