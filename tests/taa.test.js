// Temporal antialiasing (src/lib/world3d/taa.js): the jitter's points
import { test } from "node:test";
import assert from "node:assert/strict";
import { JITTER } from "../src/lib/world3d/taa.js";

test("eight jitter points, each within half a pixel of the middle, spread round it and centred", () => {
  assert.equal(JITTER.length, 8);
  for (const [x, y] of JITTER) assert.ok(Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5);
  const mx = JITTER.reduce((s, p) => s + p[0], 0) / 8, my = JITTER.reduce((s, p) => s + p[1], 0) / 8;
  assert.ok(Math.abs(mx) < 0.1 && Math.abs(my) < 0.1, `${mx} ${my}`);
  const quads = new Set(JITTER.map(([x, y]) => (x > 0 ? 1 : 0) + (y > 0 ? 2 : 0))); assert.equal(quads.size, 4);
});
