// ---- one of each thing along a wall, not two at a corner (src/lib/world3d/realPlace.js) ----
// (needs node_modules for three, like tests/sim3dDetail.test.js: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";

let rp = null; try { rp = await import("../src/lib/world3d/realPlace.js"); } catch { /* no node_modules */ }
const skip = !rp && "three isn't installed";

test("a second lamp post, ring or bollard within a few metres of the first is the same one twice", { skip }, () => {
  const columns = [[10, 0, 0, 0, -1]]; // [x, z, turn, nx, nz]
  assert.equal(rp.farFromAll(columns, 10.27, 0.06), false, "27 cm away: the double at the pier head's bend");
  assert.equal(rp.farFromAll(columns, 10.0, 0.11), false, "11 cm away");
  assert.equal(rp.farFromAll(columns, 38, 0), true, "the next post along, 28 m on");
  const bollards = [[5, 2.2, 5, 0]]; // [x, y, z, turn]
  assert.equal(rp.farFromAll(bollards, 5.9, 5, 2), false, "90 cm away");
  assert.equal(rp.farFromAll(bollards, 5, 9, 2), true);
  assert.equal(rp.farFromAll([], 0, 0), true, "the first of anything");
  assert.ok(rp.PLACED_APART >= 2 && rp.PLACED_APART <= 10, "well under the 17 m between the closest things of a kind");
});
