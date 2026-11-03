// Proximity chat (src/lib/voice.js): voices are as loud as the angler is near, and come from their side.
import test from "node:test";
import assert from "node:assert/strict";
import { proximityOf, PROXIMITY } from "../src/lib/voice.js";

test("near anglers are heard fully, far ones fade to silence, smoothly", () => {
  const me = { x: 0, z: 0 };
  assert.equal(proximityOf(me, { x: 3, z: 0 }).near, 1, "side by side at the rail");
  assert.equal(proximityOf(me, { x: PROXIMITY.silent + 5, z: 0 }).near, 0, "right along the pier");
  const mid = proximityOf(me, { x: 17, z: 0 }).near; assert.ok(mid > 0.2 && mid < 0.8, `halfway: ${mid}`);
  let last = 1; for (let d = 0; d <= 35; d += 1) { const n = proximityOf(me, { x: d, z: 0 }).near; assert.ok(n <= last + 1e-9, "never louder further away"); last = n; }
  assert.deepEqual(proximityOf(null, { x: 1, z: 1 }), { near: 1, pan: 0 }, "no position: full volume");
});

test("someone to your right is in your right ear, behind or ahead is in the middle; it turns with you", () => {
  const me = { x: 0, z: 0 };
  assert.ok(proximityOf(me, { x: 5, z: 0 }, 0).pan > 0.5, "looking north, someone to the east is on the right");
  assert.ok(proximityOf(me, { x: -5, z: 0 }, 0).pan < -0.5);
  assert.ok(Math.abs(proximityOf(me, { x: 0, z: -8 }, 0).pan) < 0.01, "straight ahead");
  assert.ok(proximityOf(me, { x: 5, z: 0 }, Math.PI).pan < -0.5, "turn round and they're on your left");
});
