// The grips made in Blender (src/lib/world3d/grips.js): the data is whole and sane before the game poses hands by it.
import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORED } from "../src/lib/world3d/grips.js";

const FINGERS = ["index", "middle", "ring", "pinky", "thumb"];
const unit = (q) => Math.abs(Math.hypot(...q) - 1) < 1e-3;

test("both grips are there, for the hand that uses each", () => {
  assert.equal(AUTHORED.seat.side, "r");
  assert.equal(AUTHORED.crank.side, "l");
});

test("every finger bone of the hand has a turn, and each turn is a unit quaternion", () => {
  for (const g of Object.values(AUTHORED)) {
    assert.ok(unit(g.Qh));
    for (const f of FINGERS) for (const k of [1, 2, 3]) {
      const q = g.bones[`${f}_0${k}_${g.side}`];
      assert.ok(Array.isArray(q) && q.length === 4, `${f}_0${k}_${g.side}`);
      assert.ok(unit(q), `${f}_0${k}_${g.side} is a unit quaternion`);
    }
    assert.equal(Object.keys(g.bones).length, 15);
  }
});

test("the wrist is a hand's reach from what is held, not on it and not far off", () => {
  for (const g of Object.values(AUTHORED)) {
    const d = Math.hypot(...g.Ph);
    assert.ok(d > 0.05 && d < 0.16, `wrist ${d.toFixed(3)} m from the grip`);
  }
});

test("on the rod the wrist is above and to the right, the hand over the handle from your side", () => {
  // (the grip's frame: y up, z to the tip, so x is to your left)
  const [x, y] = AUTHORED.seat.Ph;
  assert.ok(x < 0 && y > 0);
});

test("the fingers are closed: the first two joints of each finger holding the rod are well bent", () => {
  const bend = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;
  for (const f of ["index", "middle", "ring", "pinky"]) {
    const b = bend(AUTHORED.seat.bones[`${f}_01_r`]) + bend(AUTHORED.seat.bones[`${f}_02_r`]);
    assert.ok(b > 100, `${f} bends ${b.toFixed(0)} degrees over its first two joints`);
  }
});
