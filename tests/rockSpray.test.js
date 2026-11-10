// spray off the rock armour: how hard a crest breaks, and where along the rocks it can
import { test } from "node:test";
import assert from "node:assert/strict";
import { burstStrength, breakHeight, thinEdge, SPRAY } from "../src/lib/world3d/rockSpray.js";

test("a flat calm throws no spray, however fast the water moves", () => {
  assert.equal(burstStrength(1, 0), 0);
  assert.equal(burstStrength(1, 0.1), 0);
});
test("falling water throws none", () => {
  assert.equal(burstStrength(0, 0.8), 0);
  assert.equal(burstStrength(-0.5, 0.8), 0);
});
test("a bigger sea breaks harder, and never past 1", () => {
  const light = burstStrength(0.4, 0.3, 0.5), fresh = burstStrength(0.4, 0.8, 0.5), gale = burstStrength(3, 1.5, 1);
  assert.ok(light > 0 && fresh > light, `${light} ${fresh}`);
  assert.ok(gale <= 1);
});
test("a crest has to stand higher before it breaks in a bigger sea", () => {
  assert.ok(breakHeight(1) > breakHeight(0.2));
  assert.ok(breakHeight(0) > 0);
});
test("the rocks' edge is thinned to one point every few metres", () => {
  const pts = []; for (let i = 0; i < 200; i++) pts.push([i * 0.25, 0, 0, -1]);
  const out = thinEdge(pts, SPRAY.gap);
  assert.ok(out.length < 25 && out.length > 10, String(out.length));
  assert.deepEqual(thinEdge([], 3), []);
});
