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

test("the contact shade on the deck: deepest at a building's foot, gone within about half a metre; posts and benches lighter", async () => {
  const { contactShade } = await import("../src/lib/world3d/realPlace.js");
  const s = contactShade({ cx: 0, cz: 0, size: 20, mpp: 0.1, rings: [[[0, 0], [2, 0], [2, 2], [0, 2]]], discs: [[-5, -5, 0.13, 0.85]], rects: [[5, 5, 0, 0.85, 0.24, 0.5]] });
  const at = (x, z) => s.data[Math.floor((z - s.z0) / 0.1) * s.n + Math.floor((x - s.x0) / 0.1)] / 255;
  assert.equal(s.n, 200);
  assert.ok(at(2.05, 1) > 0.8, `at the wall's foot ${at(2.05, 1)}`);
  assert.ok(at(2.3, 1) < 0.35 && at(2.3, 1) > 0.05, `30 cm out ${at(2.3, 1)}`);
  assert.ok(at(2.8, 1) < 0.02, `80 cm out ${at(2.8, 1)}`);
  assert.ok(at(-5, -5) > 0.05 && at(-5, -5) < at(2.05, 1), "a post's base, lighter than a wall's");
  assert.ok(at(5, 5) > 0.15 && at(5.6, 5.6) < 0.05, "under a bench, and not far round it");
  assert.equal(at(-8, 8), 0, "nothing where nothing stands");
});
