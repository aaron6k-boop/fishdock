// Walking and running (src/lib/world3d/human3d.js gaitWeights, src/lib/world3d/walker.js WALK): a walk or a run, never
// a mixture of the two, at speeds people actually walk and run at.
import test from "node:test";
import assert from "node:assert/strict";
import { gaitWeights, GAIT } from "../src/lib/world3d/human3d.js";
import { WALK } from "../src/lib/world3d/walker.js";

// (the motion-captured clips' own speeds, m/s: slow walk, walk, brisk walk, run; men's and women's)
const SP = { m: [0.81, 1.39, 1.49, 2.42], f: [0.88, 1.28, 1.51, 2.25] };
const walks = (w) => w.walk_slow + w.walk + w.walk_fast;

test("walking at the game's walking pace is all walk, at the clip's own stride", () => {
  for (const sp of Object.values(SP)) {
    const { w, stretch } = gaitWeights(WALK.speed, sp);
    assert.equal(w.run, 0); assert.ok(Math.abs(walks(w) - 1) < 1e-9);
    assert.ok(Math.abs(stretch - 1) < 0.06, `stride ${stretch.toFixed(3)} of the clip's`);
  }
});

test("sprinting is all run, quicker mostly by a longer stride: the steps' pace no more than a tenth up on the captured run", () => {
  for (const sp of Object.values(SP)) {
    const { w, stretch } = gaitWeights(WALK.sprint, sp), pace = WALK.sprint / sp[3] / stretch;
    assert.equal(w.run, 1); assert.ok(stretch > 1.15 && stretch <= 1.35, `stride ${stretch.toFixed(3)}`); assert.ok(pace >= 1 && pace < 1.1, `pace ${pace.toFixed(3)}`);
  }
});

test("between them, a walk or a run: both only in the short band where one gives way to the other", () => {
  for (const sp of Object.values(SP)) for (let v = 0.06; v <= 4; v += 0.01) {
    const { w } = gaitWeights(v, sp);
    if (w.run > 0 && walks(w) > 0) assert.ok(v > GAIT[0] && v < GAIT[1], `walking and running both at ${v.toFixed(2)} m/s`);
    assert.ok(Math.abs(w.idle + walks(w) + w.run - 1) < 1e-9);
  }
  assert.ok(GAIT[1] - GAIT[0] <= 0.4 && GAIT[0] > 1.8, "people break into a run at about 2 m/s");
});

test("the weights change smoothly with speed (no jump between steps of 1 cm/s)", () => {
  for (const sp of Object.values(SP)) { let prev = gaitWeights(0.06, sp).w;
    for (let v = 0.07; v <= 4; v += 0.01) { const { w } = gaitWeights(v, sp); for (const k of Object.keys(w)) assert.ok(Math.abs(w[k] - prev[k]) < 0.15, `${k} jumped at ${v.toFixed(2)} m/s`); prev = w; } }
});
