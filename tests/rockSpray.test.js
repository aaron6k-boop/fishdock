// spray off the rock armour: how hard a crest breaks, and where along the rocks it can
import { test } from "node:test";
import assert from "node:assert/strict";
import { burstStrength, breakHeight, thinEdge, splashPlan, SPRAY } from "../src/lib/world3d/rockSpray.js";

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
test("a bigger splash throws more, faster, and a small one still throws something", () => {
  const rig = splashPlan(0.6), fish = splashPlan(1.2), tiny = splashPlan(0.05);
  assert.ok(fish.crown > rig.crown && fish.speed > rig.speed && fish.mist >= rig.mist);
  assert.ok(tiny.crown > 0 && tiny.jet > 0 && tiny.mist > 0);
  assert.ok(splashPlan(0.6, 2.2).crown > rig.crown * 2);
});
test("no splash can use up the whole pool of points", () => {
  const big = splashPlan(5, 10);
  assert.ok(big.crown + big.jet + big.mist * 2 + big.foam < SPRAY.max / 3, JSON.stringify(big)); // (the mist is thrown twice: the sheet and the puff)
});
