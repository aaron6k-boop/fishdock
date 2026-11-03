// Hold-to-cast (src/lib/world3d/castAim.js): power, rod, wind and aim decide where it lands, never beyond the water.
import test from "node:test";
import assert from "node:assert/strict";
import { planCast, ROD_REACH, AIM_MAX } from "../src/lib/world3d/castAim.js";
import { strikeTiming } from "../src/lib/reelModel.js";

const spot = { at: [0, 4, 0], face: 0, cast: 30, edge: 1 };

test("more power casts further; a beachcaster further than a float rod on a river", () => {
  const soft = planCast({ venue: "pier", spot, power: 0.2 }), hard = planCast({ venue: "pier", spot, power: 1 });
  assert.ok(hard.dist > soft.dist * 1.8, `${soft.dist} → ${hard.dist}`);
  const beach = planCast({ venue: "beach", spot: { ...spot, cast: 70 }, power: 1 }), river = planCast({ venue: "river", spot: { ...spot, cast: 15 }, power: 1 });
  assert.ok(beach.dist > river.dist * 3);
  assert.ok(hard.dist <= Math.min(ROD_REACH.pier, spot.cast * 1.6) + 1e-9);
});

test("wind behind carries it further, wind in your face cuts it short; aim follows the view within limits", () => {
  // facing 0 casts towards -z
  const behind = planCast({ venue: "pier", spot, power: 0.6, wind: { strength: 1, dir: [0, -1] } });
  const face = planCast({ venue: "pier", spot, power: 0.6, wind: { strength: 1, dir: [0, 1] } });
  assert.ok(behind.dist > face.dist);
  const wide = planCast({ venue: "pier", spot, power: 0.6, lookYaw: 1.2 });
  assert.equal(wide.aim, Math.round(AIM_MAX * 1000) / 1000);
  assert.ok(wide.point[0] > 0, "aiming right lands to the right");
});

test("a cast that would land on a pier or the bank stops short in the water", () => {
  const water = (x, z) => z > -12; // land from 12 m out
  const p = planCast({ venue: "pier", spot, power: 1, water });
  assert.ok(p.dist <= 10, `${p.dist}`);
});

test("strike timing: too soon, in time, too late", () => {
  assert.equal(strikeTiming(100), "early");
  assert.equal(strikeTiming(1200, 4000), "good");
  assert.equal(strikeTiming(3000, 4000), "late");
});
