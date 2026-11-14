// When to strike (src/lib/reelModel.js bitePlan, strikeTiming): each kind of fish bites its own way (sceneActors.js
// biteTaps), and the moment to strike is the pull, not the first knock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bitePlan, strikeTiming } from "../src/lib/reelModel.js";
import { biteTaps } from "../src/lib/sceneActors.js";
import { DUR } from "../src/lib/liveEvents.js";
import { biteOf } from "../src/lib/fishFlow.js";

const fixed = (v) => () => v; // (no jitter: the taps at their middle times)

test("cod knock, then the rod pulls round: striking at the first knock is early, on the pull is good, long after is late", () => {
  const plan = bitePlan(biteTaps("cod", true, fixed(0.5)));
  assert.ok(plan && !plan.rattle);
  assert.ok(plan.pull > 1000 && plan.pull < 1600, `the pull at ${plan.pull} ms`);
  assert.equal(strikeTiming(100, DUR.bite, plan), "early", "the first knock");
  assert.equal(strikeTiming(600, DUR.bite, plan), "early", "the second knock");
  assert.equal(strikeTiming(plan.pull + 200, DUR.bite, plan), "good", "on the pull");
  assert.equal(strikeTiming(DUR.bite - 300, DUR.bite, plan), "late");
});

test("whiting rattle: strike from the second tap; the window always ends before the bite does", () => {
  const plan = bitePlan(biteTaps("whiting", false, fixed(0.5)));
  assert.ok(plan.rattle, "a rattle");
  assert.equal(strikeTiming(50, DUR.bite, plan), "early");
  assert.equal(strikeTiming(plan.pull + 50, DUR.bite, plan), "good");
  for (const sp of ["cod", "bass", "whiting", "thornback-ray", "plaice", "mackerel", null]) for (const strong of [false, true]) {
    const pl = bitePlan(biteTaps(sp, strong, fixed(0.5)));
    assert.ok(pl.to <= DUR.bite - 600 && pl.from < pl.to, `${sp}: a window of ${pl.from}..${pl.to} ms`);
  }
});

test("no plan: the old rule; and the bite on now is read from the newest event", () => {
  assert.equal(strikeTiming(100), "early");
  assert.equal(strikeTiming(1200, 4000), "good");
  assert.equal(bitePlan(null), null);
  assert.equal(biteOf([{ type: "cast", t: 1 }]), null);
  const b = biteOf([{ type: "cast", t: 1 }, { type: "bite", t: 5000, data: { taps: biteTaps("cod", false, fixed(0.5)) } }]);
  assert.equal(b.t, 5000); assert.ok(b.plan.pull > 0);
});

test("a slack-liner: the rod springs straight and the line falls slack; the moment is when it tightens", () => {
  let found = null;
  for (let k = 0; k < 40 && !found; k++) { let i = 0; const seq = [0.1, 0.5, 0.5, 0.5, 0.5, 0.5]; const rnd = () => seq[i++ % seq.length]; const t = biteTaps("cod", false, rnd); if (t.some((x) => x[2] < 0)) found = t; }
  assert.ok(found, "cod can bite as a slack-liner");
  const plan = bitePlan(found);
  assert.ok(plan.slack && !plan.rattle);
  assert.ok(plan.pull > 1500, `it tightens at ${plan.pull} ms, after the slack`);
  assert.equal(strikeTiming(900, DUR.bite, plan), "early", "while the line's slack");
  // (and a quarter of the time or so: never for a rattling whiting)
  let n = 0; for (let k = 0; k < 400; k++) if (biteTaps("cod", false, Math.random).some((x) => x[2] < 0)) n++;
  assert.ok(n > 60 && n < 140, `${n} of 400`);
  for (let k = 0; k < 50; k++) assert.ok(!biteTaps("whiting", false, Math.random).some((x) => x[2] < 0));
});
