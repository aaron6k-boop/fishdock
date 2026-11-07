// ---- the rising ground behind Gorleston's sea front (localDetail.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { LOCAL, gorlestonHill } from "../src/lib/world3d/localDetail.js";

test("the pier, quay, Pier Gardens and beach stay at the quay's level", () => {
  for (const [x, z] of [[0, 0], [-300, 120], [-386, 98], [-388, 175], [-410, -340], [-150, -150]]) assert.equal(gorlestonHill(x, z), 0, `${x},${z}`);
});
test("the cliff top behind the beach is about 15 m up, and the slope climbs steadily", () => {
  const top = gorlestonHill(-560, 300); assert.ok(top > 13 && top <= 15, String(top));
  let prev = 0; for (let x = -455; x >= -560; x -= 5) { const h = gorlestonHill(x, 300); assert.ok(h >= prev - 1e-9); prev = h; }
  assert.ok(gorlestonHill(-489, 151) > 10, "the Cliff Hotel stands on the cliff top");
});
test("the hill is wired into Gorleston's local detail, and every named building has a builder name", () => {
  assert.equal(LOCAL["gorleston-south-pier"].hill, gorlestonHill);
  assert.deepEqual(Object.values(LOCAL["gorleston-south-pier"].landmarks).sort(), ["bandstand", "cliffHotel", "gorlestonLighthouse", "pavilion", "pierHotel"]);
});
