// ---- wet patches on the deck where a dripping net or a fish is put down (src/lib/world3d/wetLook.js) ----
// (needs node_modules for three, like the tests/sim3d*.test.js files: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";

let W = null;
try { await import("three"); W = await import("../src/lib/world3d/wetLook.js"); } catch { /* no node_modules */ }
const skip = !W && "three isn't installed";

test("a wet patch where the net goes down: kept wet while it sits there, drying over minutes once it's gone", { skip }, () => {
  const { wetSpotAt, dryWetSpots, WET_SPOTS } = W, L = WET_SPOTS.value;
  for (const v of L) v.set(0, 0, 0, 0);
  wetSpotAt(3, -4, 0.55);
  for (let i = 0; i < 100; i++) { dryWetSpots(0.1); wetSpotAt(3.05, -4, 0.55); } // (ten seconds sitting there, dripping)
  assert.equal(L.filter((v) => v.w > 0).length, 1, "one patch, not a new one every frame");
  assert.equal(L.find((v) => v.w > 0).w, 1);
  dryWetSpots(120); const w2 = L.find((v) => v.w > 0).w; assert.ok(w2 > 0.4 && w2 < 0.6, `about half dry in two minutes (${w2.toFixed(2)})`);
  dryWetSpots(600); assert.equal(L.filter((v) => v.w > 0).length, 0, "dry in ten");
});

test("four patches at most: a fifth takes the driest one's place", { skip }, () => {
  const { wetSpotAt, dryWetSpots, WET_SPOTS } = W, L = WET_SPOTS.value;
  for (const v of L) v.set(0, 0, 0, 0);
  for (let i = 0; i < 4; i++) { wetSpotAt(i * 5, 0, 0.5); dryWetSpots(30); }
  wetSpotAt(50, 0, 0.3);
  assert.equal(L.filter((v) => v.w > 0).length, 4);
  assert.ok(!L.some((v) => v.x === 0 && v.w > 0), "the first (driest) is the one that went");
  assert.ok(L.some((v) => v.x === 50 && v.w === 1));
  for (const v of L) v.set(0, 0, 0, 0);
});

test("the deck's shader darkens and shines the patches only where they are", { skip }, () => {
  assert.match(W.WET_PREP, /#ifdef FD_WET_SPOTS[\s\S]*uWetSpots\[i\][\s\S]*fdWet = max\(fdWet, fdSp/);
});
