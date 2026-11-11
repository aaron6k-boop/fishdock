// ---- the loading gate (src/lib/loadGate.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { createLoadGate, LOAD_PARTS } from "../src/lib/loadGate.js";

const clock = () => { let t = 0; return { now: () => t, tick: (ms) => { t += ms; } }; };
const INFO = { programs: 10, textures: 5, geometries: 7 };

test("the bar: nothing until the world is built, then the files, then the warm-up, and it never goes back", () => {
  const c = clock(), g = createLoadGate({ now: c.now });
  assert.equal(g.pct, 0); assert.equal(g.ready, false);
  g.built(); assert.equal(g.pct, LOAD_PARTS.built);
  g.files(5, 10); assert.equal(g.pct, LOAD_PARTS.built + LOAD_PARTS.files / 2);
  g.files(6, 20); // (more files asked for: the share done has fallen, the bar has not)
  assert.equal(g.pct, LOAD_PARTS.built + LOAD_PARTS.files / 2);
  g.files(20, 20); c.tick(100); assert.equal(g.pct, 85, "all in, but only just: not into the warm-up yet"); assert.equal(g.ready, false);
  let last = g.pct; for (let i = 0; i < 30; i++) { c.tick(50); g.frame(INFO); const p = g.pct; assert.ok(p >= last); last = p; }
  assert.equal(g.ready, true); assert.equal(g.pct, 100);
});

test("not shown while files are still arriving or the graphics card is still taking things in", () => {
  const c = clock(), g = createLoadGate({ now: c.now });
  g.built(); g.files(3, 3);
  for (let i = 0; i < 40; i++) { c.tick(50); g.frame({ ...INFO, programs: 10 + i }); } // (a new shader every frame)
  assert.equal(g.ready, false, "still building shaders"); assert.ok(g.pct < 100);
  for (let i = 0; i < 5; i++) { c.tick(50); g.frame({ ...INFO, programs: 60 }); }
  assert.equal(g.ready, false, "settled for only a moment");
  g.files(3, 4); for (let i = 0; i < 40; i++) { c.tick(50); g.frame({ ...INFO, programs: 60 }); }
  assert.equal(g.ready, false, "a late file is still on its way");
  g.files(4, 4); for (let i = 0; i < 40; i++) { c.tick(50); g.frame({ ...INFO, programs: 60 }); }
  assert.equal(g.ready, true);
});

test("a place with no files to fetch still shows, and a file that never arrives doesn't keep you out for good", () => {
  const c = clock(), g = createLoadGate({ now: c.now });
  g.built(); for (let i = 0; i < 40; i++) { c.tick(50); g.frame(INFO); }
  assert.equal(g.ready, true);
  const c2 = clock(), g2 = createLoadGate({ now: c2.now, maxMs: 25000 });
  g2.built(); g2.files(1, 2); for (let i = 0; i < 100; i++) { c2.tick(200); g2.frame(INFO); }
  assert.equal(g2.ready, false); assert.ok(g2.pct < 100);
  c2.tick(6000); assert.equal(g2.ready, true);
});

test("slow frames: it waits for enough of them as well as for long enough", () => {
  const c = clock(), g = createLoadGate({ now: c.now, stillFrames: 8 });
  g.built(); g.files(2, 2); c.tick(1000);
  for (let i = 0; i < 5; i++) { c.tick(700); g.frame(INFO); } // (a frame every 0.7 s)
  assert.equal(g.ready, false, "five frames isn't a settled picture");
  for (let i = 0; i < 5; i++) { c.tick(700); g.frame(INFO); }
  assert.equal(g.ready, true);
});
