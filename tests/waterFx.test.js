// The rings on the water and the contact shadows' falloff (src/lib/world3d/waterFx.js), and the fine shore map
// round the anglers (src/lib/world3d/shoreMap.js). The shaders that draw them need WebGL and are checked in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import { RIPPLE, rippleLife, rippleNow, addRipple, stepRipples, contactFalloff } from "../src/lib/world3d/waterFx.js";
import { shoreDistances, SHORE_FINE } from "../src/lib/world3d/shoreMap.js";

test("rings: short-lived, longer for a bigger splash, never past the cap", () => {
  assert.ok(rippleLife(0.2) < rippleLife(0.8));
  assert.ok(rippleLife(0.35) <= 2, `a net's swirl is gone within two seconds: ${rippleLife(0.35)}`);
  assert.ok(rippleLife(5) <= RIPPLE.maxLife);
  assert.equal(rippleNow(0.6, 0, 2), 0.6);
  assert.equal(rippleNow(0.6, 2, 2), 0);
  // eases out: never a sudden cut
  assert.ok(rippleNow(0.6, 1.9, 2) < 0.02);
});

test("rings: at most eight, the faintest dropped (not the splash just made)", () => {
  const L = [];
  addRipple(L, 0, 0, 0.8);
  for (let i = 0; i < 12; i++) { stepRipples(L, 0.05); addRipple(L, i, 0, 0.2); }
  assert.equal(L.length, RIPPLE.max);
  assert.ok(L.some((r) => r[3] === 0.8), "the big splash stays");
});

test("rings: the same at any frame rate (aged by time, not frames)", () => {
  // a ring every half second, 2.75 s in all, stepped at 25 ms and at 250 ms a frame
  const run = (ms) => { const L = []; let out = []; for (let t = 0; t < 2750; t += ms) { if (t % 500 === 0) addRipple(L, t, 0, 0.5); out = stepRipples(L, ms / 1000); } return out; };
  const a = run(25), b = run(250);
  assert.equal(a.length, b.length);
  a.forEach((r, i) => assert.ok(Math.abs(r[3] - b[i][3]) < 0.02, `${r} vs ${b[i]}`));
});

test("contact shadows: dark in the middle, fading smoothly to nothing at the edge", () => {
  assert.ok(contactFalloff(0) > 0.9);
  assert.equal(contactFalloff(1), 0);
  assert.equal(contactFalloff(1.5), 0);
  let prev = 2; for (let r = 0; r <= 1; r += 0.05) { const v = contactFalloff(r); assert.ok(v <= prev + 1e-9); prev = v; }
  assert.ok(contactFalloff(0.95) < 0.05, "no visible ring at the edge");
});

test("the fine shore map: half a metre a cell, so a diagonal wall's foam follows the wall", () => {
  const { half, n, cap } = SHORE_FINE; const step = (2 * half) / n;
  assert.ok(step <= 0.5);
  // a wall at 45 degrees: land where x + z < 0
  const d = shoreDistances((x, z) => x + z < 0, SHORE_FINE);
  // (at cell centres: the distance to the nearest land cell's centre is within a cell of the true distance)
  const cell = (x, z) => [Math.floor((x + half) / step), Math.floor((z + half) / step)];
  for (const [x, z] of [[2, 0], [0, 2], [5, -3], [-4, 6]]) {
    const [i, j] = cell(x, z), cx = -half + (i + 0.5) * step, cz = -half + (j + 0.5) * step, truth = (cx + cz) / Math.SQRT2;
    assert.ok(Math.abs(d[j * n + i] - truth) <= step, `(${x}, ${z}): ${d[j * n + i]} vs ${truth}`);
  }
  const [fi, fj] = cell(20, 20); assert.equal(d[fj * n + fi], cap);
});
