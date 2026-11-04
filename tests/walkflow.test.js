// Walking about, the feel of it (walker.js, look.js): speed builds and settles on a spring the same at any frame rate;
// a body's turning limits (a pivot standing, wider arcs at speed); you come round before you stride out; and the
// walking camera can't be tipped up into the sky, comes back to its level on its own and eases its turns.
import test from "node:test";
import assert from "node:assert/strict";
import { walker, stepWalker, WALK, turnLimit, alignSpeed, spring } from "../src/lib/world3d/walker.js";
import { createLook, WALK_PITCH, walkPitchBack } from "../src/lib/world3d/look.js";

const flat = { walkable: () => true, heightAt: () => 0 };
const run = (s, input, secs, dt) => { const out = []; for (let t = 0; t < secs - 1e-9; t += dt) { s = stepWalker(s, input, dt, flat); out.push(s); } return { s, out }; };

// ---- the walker ----
test("the speed spring is exact: the same at 120, 60, 20 and 16 frames a second", () => {
  const at = (dt) => { let x = 0, v = 0; for (let t = 0; t < 0.5 - 1e-9; t += dt) [x, v] = spring(x, v, 1.8, WALK.go, dt); return x; };
  const ref = at(1 / 120);
  for (const dt of [1 / 60, 1 / 20, 1 / 16]) assert.ok(Math.abs(at(dt) - ref) < 1e-9, `dt ${dt}: ${at(dt)} vs ${ref}`);
  // (and it never overshoots: a step you can't see coming)
  let x = 0, v = 0, top = 0; for (let i = 0; i < 300; i++) { [x, v] = spring(x, v, 1.8, WALK.go, 1 / 60); top = Math.max(top, x); }
  assert.ok(top <= 1.8 + 1e-9);
});
test("setting off: a moment's build, no jolt; a walk and a stop end up the same at 60 and 20 frames a second", () => {
  const a = run(walker(0, 0, 0), { x: 0, y: 1, camYaw: 0 }, 1.2, 1 / 60), b = run(walker(0, 0, 0), { x: 0, y: 1, camYaw: 0 }, 1.2, 1 / 20);
  assert.ok(Math.abs(a.s.z - b.s.z) < 0.03, `${a.s.z.toFixed(3)} vs ${b.s.z.toFixed(3)}`);
  // the acceleration rises from nothing (no step in speed on the first frame) and stays below what a person manages
  assert.ok(a.out[0].speed < 0.05, `first frame ${a.out[0].speed}`);
  const maxAcc = Math.max(...a.out.slice(1).map((s, i) => (s.speed - a.out[i].speed) * 60));
  assert.ok(maxAcc < 7.5, `peak acceleration ${maxAcc.toFixed(2)} m/s²`);
  const c = run(a.s, { x: 0, y: 0, camYaw: 0 }, 1, 1 / 60), d = run(b.s, { x: 0, y: 0, camYaw: 0 }, 1, 1 / 20);
  assert.equal(c.s.speed, 0); assert.equal(d.s.speed, 0);
  assert.ok(Math.abs(c.s.z - d.s.z) < 0.04, `stopped at ${c.s.z.toFixed(3)} and ${d.s.z.toFixed(3)}`);
});
test("turning has a body's limits: never an instant flip, a pivot quicker than a sprinting arc", () => {
  assert.ok(turnLimit(0) > turnLimit(WALK.speed) && turnLimit(WALK.speed) > turnLimit(WALK.sprint));
  // turning right round (the stick pulled back): it takes a good part of a second, and the turn rate never jumps
  const { s, out } = run(walker(0, 0, 0), { x: 0, y: -1, camYaw: 0 }, 1.2, 1 / 60);
  const half = out.findIndex((q) => Math.abs(q.face) > Math.PI / 2);
  assert.ok(half > 60 * 0.25, `half way round after ${(half / 60).toFixed(2)} s`);
  assert.ok(Math.abs(Math.abs(s.face) - Math.PI) < 0.1, "and round within a second or so");
  for (const q of out) assert.ok(Math.abs(q.turnRate) <= turnLimit(0) + 1e-6);
  // you come round before you go: little ground covered while you're facing away
  const early = out[Math.round(60 * 0.25)]; assert.ok(Math.hypot(early.x, early.z) < 0.08, `${Math.hypot(early.x, early.z).toFixed(3)} m in the first quarter second`);
  assert.equal(alignSpeed(0), 1); assert.ok(alignSpeed(Math.PI) < 0.2 && alignSpeed(Math.PI / 2) < 0.35);
});

// ---- the walking camera ----
test("walking about, the view can't be tipped up into the sky, and a flick doesn't carry it up or down", () => {
  const L = createLook({ pitch: -0.2 }); L.setPitchRange(WALK_PITCH.min, WALK_PITCH.max, false);
  L.start(); for (let i = 0; i < 20; i++) L.drag(0, 60, 800); L.end();
  assert.ok(L.pitch <= WALK_PITCH.max + 1e-9, `pitch ${L.pitch}`);
  for (let i = 0; i < 60; i++) L.step(1 / 60);
  assert.ok(L.pitch <= WALK_PITCH.max + 1e-9);
  L.setPitchRange(); L.start(); L.drag(0, 600, 800); L.end(); assert.ok(L.pitch > WALK_PITCH.max, "the fishing view looks up as far as before");
});
test("the walking camera's pitch comes back to its level on its own, gently, standing or walking", () => {
  assert.equal(walkPitchBack({ dragging: true }), 0); assert.equal(walkPitchBack({ sinceTouch: 500 }), 0, "not straight after a look");
  const L = createLook({ pitch: 0.1 });
  let since = WALK_PITCH.wait, prev = L.pitch, maxRate = 0;
  for (let i = 0; i < 240; i++) { L.easePitch(WALK_PITCH.level, walkPitchBack({ sinceTouch: since, dt: 1 / 60 })); since += 1000 / 60; maxRate = Math.max(maxRate, Math.abs(L.pitch - prev) * 60); prev = L.pitch; }
  assert.ok(Math.abs(L.pitch - WALK_PITCH.level) < 0.03, `settled at ${L.pitch.toFixed(3)}`);
  assert.ok(maxRate < 0.5, `never quicker than ${maxRate.toFixed(2)} rad/s`);
});
test("the follow camera eases its turn in and out (no jolt at the start of a turn)", () => {
  const L = createLook({ yaw: 0 }); const rates = []; let prev = 0;
  for (let i = 0; i < 60; i++) { L.follow(1.2, null, 0.06, 1 / 60); rates.push((L.yaw - prev) * 60); prev = L.yaw; }
  assert.ok(rates[0] < rates[10] * 0.3, `starts gently (${rates[0].toFixed(2)} then ${rates[10].toFixed(2)} rad/s)`);
  for (let i = 0; i < 400; i++) L.follow(1.2, null, 0.06, 1 / 60);
  assert.ok(Math.abs(L.yaw - 1.2) < 0.01 && L.yaw <= 1.2 + 1e-9, "and settles without going past");
});
