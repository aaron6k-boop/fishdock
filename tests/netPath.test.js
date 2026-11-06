import { test } from "node:test";
import assert from "node:assert/strict";
import { overRail } from "../src/lib/world3d/netPath.js";

test("drop net over the rail: never through it, ends where it should", () => {
  const rail = { x: 0, y: 1.1, z: -0.5 }, deck = { x: -0.6, y: 0.2, z: -0.2 }, water = { x: -0.3, y: -4, z: -1.4 };
  for (const ns of [1, 1.6]) {
    for (const [a, b] of [[deck, water], [water, deck]]) {
      const n = { x: 0, z: -1 }, s = overRail(rail, ns, a, b, 0, n), e = overRail(rail, ns, a, b, 1, n);
      assert.deepEqual([s.x, s.y, s.z], [a.x, a.y, a.z]); assert.ok(Math.abs(e.y - b.y) < 1e-9 && Math.abs(e.x - b.x) < 1e-9);
      // while it's over the rail (within 10 cm of its line), the hoop is clear above the top rail
      for (let i = 0; i <= 200; i++) {
        const p = overRail(rail, ns, a, b, i / 200, n);
        const crossing = Math.abs(p.z - rail.z) < 0.1;
        if (crossing) assert.ok(p.y >= rail.y + 0.2, `hoop through the rail at f=${i / 200}`);
        assert.ok(p.y <= Math.max(a.y, b.y, rail.y + 0.4), "held no higher than it needs");
      }
      // and it moves smoothly: no jump between steps
      let prev = overRail(rail, ns, a, b, 0, n);
      for (let i = 1; i <= 200; i++) { const p = overRail(rail, ns, a, b, i / 200, n); assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) < 0.1); prev = p; }
    }
  }
});
