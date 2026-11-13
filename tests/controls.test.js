// The controls and their feel: one press for one thing on the fishing tray (trayGuard.js), the walking camera's
// steadiness (look.js), footsteps from the ground covered (walker.js) and the surroundings' sound plan (sceneAudio.js).
import test from "node:test";
import assert from "node:assert/strict";
import { GUARD, pressOk } from "../src/lib/trayGuard.js";
import { walkFollow, FOLLOW, followDist, easeBlend, createLook } from "../src/lib/world3d/look.js";
import { stepGait, stepLength, surfaceFor, walker, stepWalker, WALK } from "../src/lib/world3d/walker.js";
import { ambiencePlan, stepSound, waitIn, SURFACES } from "../src/lib/sceneAudio.js";

// ---- the fishing tray ----
test("Land ignores a tap meant for Reel as it appears, then takes one press", () => {
  assert.equal(pressOk("land", 1000 + 200, { shownAt: 1000 }), false, "a reel tap 200 ms after Land appeared");
  assert.equal(pressOk("land", 1000 + GUARD.appear.land + 10, { shownAt: 1000 }), true, "a deliberate tap");
  assert.equal(pressOk("land", 2000 + 300, { shownAt: 0, pressedAt: 2000 }), false, "a second landing straight after");
});
test("Strike takes one press: a double tap doesn't strike twice", () => {
  assert.equal(pressOk("strike", 5000, { shownAt: 4000 }), true);
  assert.equal(pressOk("strike", 5150, { shownAt: 4000, pressedAt: 5000 }), false);
  assert.equal(pressOk("strike", 5000 + GUARD.again.strike + 1, { shownAt: 4000, pressedAt: 5000 }), true);
});
test("Reel is never guarded: every tap counts", () => {
  for (let i = 0; i < 20; i++) assert.equal(pressOk("reel", 1000 + i * 30, { shownAt: 1000, pressedAt: 1000 + (i - 1) * 30 }), true);
});

// ---- the walking camera ----
test("the follow camera never turns faster than its limit, even far off to one side", () => {
  for (const off of [0.2, 0.8, 1.5, 2.2]) for (const dt of [1 / 120, 1 / 60, 1 / 30, 1 / 15]) {
    const k = walkFollow({ speed: 4.2, off, dt });
    assert.ok(k * off <= FOLLOW.maxRate * dt + 1e-9, `off ${off}, dt ${dt}: ${(k * off / dt).toFixed(2)} rad/s`);
  }
});
test("the follow camera eases in from a standstill rather than starting with a step", () => {
  const at = (speed) => walkFollow({ speed, off: 0.6, dt: 1 / 60 });
  assert.equal(at(FOLLOW.minSpeed - 0.01), 0);
  assert.ok(at(FOLLOW.minSpeed + 0.02) < at(0.8) * 0.1, "barely anything just above the threshold");
  assert.ok(at(0.8) < at(1.8), "more with speed");
});
test("walking back towards the camera brings it round gently, not in a swing", () => {
  const near = walkFollow({ speed: 1.8, off: 1.0, dt: 1 / 30 }), far = walkFollow({ speed: 1.8, off: 2.1, dt: 1 / 30 });
  assert.ok(far * 2.1 < near * 1.0, "less turn per frame the further round it is");
});
test("the camera comes in at once for a wall and eases back out", () => {
  assert.equal(followDist(4, 1.5, 1 / 60), 1.5, "in at once");
  const out = followDist(1.5, 4, 1 / 60); assert.ok(out > 1.5 && out < 1.65, `out slowly (${out})`);
  let d = 1.5; for (let i = 0; i < 120; i++) d = followDist(d, 4, 1 / 60); assert.ok(d > 3.7, "and all the way within a couple of seconds");
});
test("a glide between views starts and ends gently", () => {
  assert.equal(easeBlend(0), 0); assert.equal(easeBlend(1), 1); assert.equal(easeBlend(2), 1);
  assert.ok(easeBlend(0.05) < 0.01 && easeBlend(0.95) > 0.99);
});
test("a drag while walking turns by what the walking camera shows, not by its distance setting", () => {
  const a = createLook({ fov: 40 }), b = createLook({ fov: 40 }); b.setDragFov(68);
  a.start(); a.drag(100, 0, 780); b.start(); b.drag(100, 0, 780);
  assert.ok(Math.abs(b.yaw) > Math.abs(a.yaw) * 1.6);
  b.setDragFov(null); const y0 = b.yaw; b.drag(100, 0, 780); assert.ok(Math.abs(b.yaw - y0 - a.yaw) < 1e-9, "back to the zoom");
});

// ---- walking ----
test("you set off and stop over a moment, not in a frame", () => {
  const g = { walkable: () => true, heightAt: () => 0 };
  let s = walker(0, 0, 0, 0); s = stepWalker(s, { x: 0, y: 1, camYaw: 0 }, 1 / 60, g);
  assert.ok(s.speed < WALK.speed * 0.2, `first frame ${s.speed}`);
  for (let i = 0; i < 60; i++) s = stepWalker(s, { x: 0, y: 1, camYaw: 0 }, 1 / 60, g);
  assert.ok(s.speed > WALK.speed * 0.95, "up to speed within a second");
  const one = stepWalker(s, { x: 0, y: 0, camYaw: 0 }, 1 / 60, g); assert.ok(one.speed > WALK.speed * 0.7, "still moving the frame after letting go");
});
test("footsteps come quicker as you speed up and land harder at a run", () => {
  const count = (speed, secs) => { let g = { d: 0 }, n = 0, hard = 0; for (let t = 0; t < secs; t += 1 / 60) { g = stepGait(g, speed / 60, speed); if (g.fall) { n++; hard = g.fall.hard; } } return { n, hard }; };
  const walk = count(1.8, 10), run = count(4.2, 10), stroll = count(0.7, 10);
  assert.ok(walk.n / 10 > 1.6 && walk.n / 10 < 2.4, `about two a second walking (${walk.n / 10})`);
  assert.ok(run.n > walk.n * 1.2 && run.hard > walk.hard, "quicker and firmer running");
  assert.ok(stroll.n < walk.n && stroll.hard < walk.hard, "slower and softer strolling");
  assert.equal(stepGait({ d: 0.5 }, 0.5, 1.8, true).fall, null, "none in the air");
  assert.ok(stepLength(4.2) > stepLength(1.8));
});
test("the ground underfoot follows the venue, a deck's own surface and the rain", () => {
  assert.equal(surfaceFor("pier").kind, "concrete"); assert.equal(surfaceFor("beach").kind, "shingle"); assert.equal(surfaceFor("river").kind, "gravel");
  assert.equal(surfaceFor("pier", "wood").kind, "wood"); assert.equal(surfaceFor("pier", null, 0.6).wet, true); assert.equal(surfaceFor("pier", null, 0).wet, false);
  const fixed = () => 0.5;
  assert.ok(stepSound("shingle", 0.6, false, fixed).crunch > 0 && stepSound("concrete", 0.6, false, fixed).crunch === 0, "shingle crunches");
  assert.ok(stepSound("wood", 0.6, false, fixed).hollow, "boards sound hollow");
  assert.ok(stepSound("concrete", 1, false, fixed).thump.g > stepSound("concrete", 0.3, false, fixed).thump.g, "harder steps are louder");
  for (const k of Object.keys(SURFACES)) assert.ok(stepSound(k, 1, true, fixed).thump.g < 0.3, `${k}: a footstep stays quiet`);
});

// ---- the surroundings' sound ----
test("gulls by the sea in daylight only, slaps under a pier or quay only, halyards in a harbour wind", () => {
  assert.ok(ambiencePlan({ kind: "sea", venue: "pier", night: 0 }).gull);
  assert.equal(ambiencePlan({ kind: "sea", venue: "pier", night: 1 }).gull, null);
  assert.equal(ambiencePlan({ kind: "river", venue: "river" }).gull, null);
  assert.ok(ambiencePlan({ kind: "sea", venue: "pier" }).slap); assert.equal(ambiencePlan({ kind: "sea", venue: "beach" }).slap, null);
  assert.ok(ambiencePlan({ kind: "sea", venue: "estuary", wind: 0.5 }).halyard); assert.equal(ambiencePlan({ kind: "sea", venue: "pier", wind: 0.1 }).halyard, null);
  assert.equal(ambiencePlan({ rain: 0 }).patter, null); assert.ok(ambiencePlan({ rain: 0.8 }).patter[0] < ambiencePlan({ rain: 0.3 }).patter[0], "heavier rain, quicker drops");
  assert.ok(ambiencePlan({ kind: "sea", venue: "beach" }).wave, "waves breaking on a beach"); assert.equal(ambiencePlan({ kind: "sea", venue: "pier" }).wave, null);
  assert.equal(ambiencePlan({ kind: "lake", venue: "lake" }).wave, null);
  assert.ok(ambiencePlan({ kind: "sea", venue: "beach", wind: 1 }).wave[1] < ambiencePlan({ kind: "sea", venue: "beach", wind: 0 }).wave[1], "closer together in a blow");
});
test("the beds stay quiet and the sparse sounds never come on a beat", () => {
  const p = ambiencePlan({ kind: "sea", venue: "pier", wind: 1, rain: 1 });
  for (const k of ["wash", "wind", "whistle", "rain", "rumble"]) assert.ok(p[k] <= 0.15, `${k} ${p[k]}`);
  let r = 7; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const gull = ambiencePlan({ kind: "sea", venue: "pier", wind: 0.4 }).gull, gaps = Array.from({ length: 12 }, () => waitIn(gull, rnd));
  assert.ok(gaps.every((g) => g >= gull[0] && g <= gull[1]));
  assert.ok(new Set(gaps.map((g) => g.toFixed(1))).size > 8, "varied waits");
});

test("a foghorn now and then in a sea fret, never on a clear day or inland", () => {
  assert.ok(ambiencePlan({ kind: "sea", venue: "pier", fog: 0.8 }).horn);
  assert.equal(ambiencePlan({ kind: "sea", venue: "pier", fog: 0.2 }).horn, null);
  assert.equal(ambiencePlan({ kind: "lake", venue: "lake", fog: 1 }).horn, null);
});
