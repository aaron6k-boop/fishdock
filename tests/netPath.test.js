import { test } from "node:test";
import assert from "node:assert/strict";
import { overRail } from "../src/lib/world3d/netPath.js";

test("drop net over the rail: never through it, ends where it should", () => {
  const rail = { x: 0, y: 1.1, z: -0.5 }, deck = { x: -0.6, y: 0.2, z: -0.2 }, water = { x: -0.3, y: -4, z: -1.4 };
  for (const ns of [1, 1.6]) {
    for (const [a, b] of [[deck, water], [water, deck]]) {
      const s = overRail(rail, ns, a, b, 0), e = overRail(rail, ns, a, b, 1);
      assert.deepEqual([s.x, s.y, s.z], [a.x, a.y, a.z]); assert.ok(Math.abs(e.y - b.y) < 1e-9 && Math.abs(e.x - b.x) < 1e-9);
      // while it crosses the rail's line (z between the deck and the water side), the bag is clear above the top rail
      for (let i = 0; i <= 200; i++) {
        const p = overRail(rail, ns, a, b, i / 200);
        const crossing = (p.z - a.z) * (p.z - b.z) < -1e-9;
        if (crossing) assert.ok(p.y - 0.36 * ns >= rail.y + 0.1, `bag through the rail at f=${i / 200}`);
      }
      // and it moves smoothly: no jump between steps
      let prev = overRail(rail, ns, a, b, 0);
      for (let i = 1; i <= 200; i++) { const p = overRail(rail, ns, a, b, i / 200); assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.1); prev = p; }
    }
  }
});
