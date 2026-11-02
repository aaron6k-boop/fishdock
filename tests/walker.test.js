// Walking round a place (src/lib/world3d/walker.js): the stick moves you relative to the camera, you turn to face
// where you walk, sprint is quicker, the water, railings and buildings stop you (and you slide along them), a jump
// gets you up a wall a step won't, and you land again.
import test from "node:test";
import assert from "node:assert/strict";
import { walker, stepWalker, WALK } from "../src/lib/world3d/walker.js";

// a deck from x -5 to 5, z -20 to 20, 2 m high; water beyond; a 1 m high box at z -10 (x -1..1)
const ground = {
  walkable: (x, z) => Math.abs(x) <= 5 && Math.abs(z) <= 20,
  heightAt: (x, z) => (Math.abs(x) <= 1 && z > -11 && z < -9 ? 3 : 2),
};
const run = (s, input, secs, g = ground) => { for (let t = 0; t < secs; t += 1 / 60) s = stepWalker(s, input, 1 / 60, g); return s; };

test("the stick moves you the way the camera looks, at walking or sprinting speed, and you turn to face it", () => {
  let s = walker(0, 10, 0, 2);
  s = run(s, { x: 0, y: 1, camYaw: 0 }, 1);
  assert.ok(Math.abs(s.z - (10 - WALK.speed)) < 0.45, `walked north about ${WALK.speed} m (z ${s.z})`);
  assert.ok(Math.abs(s.x) < 1e-6);
  let t = walker(0, 10, 0, 2); t = run(t, { x: 0, y: 1, camYaw: 0, sprint: true }, 1);
  assert.ok(10 - t.z > 10 - s.z + 2, "sprinting is quicker");
  // the camera turned to face east: pushing forwards walks east, and you turn to face east
  let e = walker(0, 0, 0, 2); e = run(e, { x: 0, y: 1, camYaw: Math.PI / 2 }, 0.5);
  assert.ok(e.x > 1.5 && Math.abs(e.z) < 0.05, `walked east (${e.x}, ${e.z})`);
  assert.ok(Math.abs(e.face - Math.PI / 2) < 0.05, "facing east");
  // pushing right with the camera looking north walks east
  let r = walker(0, 0, 0, 2); r = run(r, { x: 1, y: 0, camYaw: 0 }, 0.5); assert.ok(r.x > 1.5);
  // a light push walks slowly
  let slow = walker(0, 10, 0, 2); slow = run(slow, { x: 0, y: 0.3, camYaw: 0 }, 1); assert.ok(10 - slow.z < 0.4 * WALK.speed);
});

test("water and edges stop you; pushing at an angle slides you along the railing", () => {
  let s = walker(4, 0, 0, 2); s = run(s, { x: 1, y: 0, camYaw: 0 }, 2);
  assert.ok(s.x <= 5 && s.x > 4.9, `stopped at the edge (x ${s.x})`);
  let d = walker(4.9, 0, 0, 2); d = run(d, { x: 0.7, y: 0.7, camYaw: 0 }, 1);
  assert.ok(d.x <= 5 && d.z < -2, `slid north along the edge (${d.x}, ${d.z})`);
});

test("a 1 m wall stops a walk, a jump gets you onto it, and you land", () => {
  let s = walker(0, -6, 0, 2); s = run(s, { x: 0, y: 1, camYaw: 0 }, 1.5);
  assert.ok(s.z > -9, `stopped by the wall (z ${s.z})`);
  let j = walker(0, -8.6, 0, 2); j = stepWalker(j, { x: 0, y: 0, camYaw: 0, jump: true }, 1 / 60, ground); assert.ok(j.air && j.vy > 0, "jumped");
  j = run(j, { x: 0, y: 1, camYaw: 0 }, 0.15); j = run(j, { x: 0, y: 0, camYaw: 0 }, 1.5);
  assert.ok(j.z < -9 && Math.abs(j.y - 3) < 1e-6 && !j.air, `on top of the wall (z ${j.z}, y ${j.y})`);
  let f = walker(0, 10, 0, 2); f = stepWalker(f, { jump: true }, 1 / 60, ground); f = run(f, {}, 2); assert.equal(f.y, 2); assert.equal(f.air, false);
});

test("a ramp lets you walk up onto a higher deck (a pier from the promenade) without jumping", () => {
  const g = { walkable: () => true, heightAt: (x, z) => (z < 0 ? 4.2 : 2.2), ramp: (x0, z0, x1, z1) => Math.abs(z1) < 1.5 };
  let s = walker(0, 2, 0, 2.2); s = run(s, { x: 0, y: 1, camYaw: 0 }, 2, g);
  assert.ok(s.z < -3, `walked onto the pier (z ${s.z})`); assert.ok(Math.abs(s.y - 4.2) < 0.05, `up on its deck (y ${s.y})`);
});

test("a curved railing guides you round it rather than trapping you", () => {
  // a round pier head, 10 m across: walking "east" from the west side, pressed against the rail, carries you round
  const g = { walkable: (x, z) => Math.hypot(x, z) <= 5, heightAt: () => 2 };
  let s = walker(0, 4.9, 0, 2);
  s = run(s, { x: 1, y: 0, camYaw: 0 }, 3, g);
  assert.ok(s.x > 3, `went round the curve (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  assert.ok(Math.hypot(s.x, s.z) <= 5 + 1e-9, "never through the rail");
});

test("starting and stopping are smooth: a moment to get going, a short glide to a stop; a touch of the stick does nothing", () => {
  let s = walker(0, 10, 0, 2);
  s = stepWalker(s, { x: 0, y: 1, camYaw: 0 }, 1 / 60, ground);
  assert.ok(s.speed < WALK.speed * 0.4, `not full speed at once (${s.speed.toFixed(2)})`);
  s = run(s, { x: 0, y: 1, camYaw: 0 }, 1);
  assert.ok(s.speed > WALK.speed * 0.95, "up to speed within a second");
  const z0 = s.z; s = run(s, { x: 0, y: 0, camYaw: 0 }, 0.5);
  assert.ok(z0 - s.z > 0.05 && z0 - s.z < 0.5, `glides a little after letting go (${(z0 - s.z).toFixed(2)} m)`);
  assert.equal(s.speed, 0, "and stops");
  let d = walker(0, 10, 0, 2); d = run(d, { x: 0.08, y: 0.05, camYaw: 0 }, 1); assert.ok(Math.hypot(d.x, d.z - 10) < 1e-9, "inside the dead zone");
});
