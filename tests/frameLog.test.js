// ---- the frame log (src/lib/frameLog.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { createFrameLog, summarise, worstFrames, reportText } from "../src/lib/frameLog.js";

test("frames are summed up by phase, in the order the phases came, with percentiles and long frames counted", () => {
  const L = createFrameLog();
  for (let i = 0; i < 100; i++) L.frame(16.7, { phase: "waiting", programs: 100, textures: 50 });
  for (let i = 0; i < 99; i++) L.frame(16.7, { phase: "hooked", programs: 100, textures: 50 });
  L.frame(120, { phase: "hooked", programs: 103, textures: 52 }); // (a hitch: three shaders and two textures arrived in it)
  const { rows, worst } = L.report();
  assert.deepEqual(rows.map((r) => r.phase), ["waiting", "hooked"]);
  assert.equal(rows[0].frames, 100); assert.equal(rows[0].fps, 60); assert.equal(rows[0].over33, 0); assert.equal(rows[0].shaders, 0);
  const h = rows[1]; assert.equal(h.worst, 120); assert.equal(h.over100, 1); assert.equal(h.over50, 1); assert.equal(h.over33, 1); assert.equal(h.shaders, 3); assert.equal(h.textures, 2);
  assert.equal(h.p50, 16.7); assert.equal(h.p99, 16.7); // (one frame in a hundred: the 99th percentile is still a good frame, the worst is not)
  assert.equal(worst[0].ms, 120); assert.equal(worst[0].phase, "hooked"); assert.equal(worst[0].shaders, 3);
  assert.ok(Math.abs(worst[0].at - (199 * 16.7 + 120) / 1000) < 0.06);
});

test("the first frame's counts are a starting point, not shaders built; nonsense frame times are left out", () => {
  const L = createFrameLog();
  L.frame(16, { phase: "idle", programs: 150, textures: 80 }); L.frame(0, { phase: "idle" }); L.frame(1e9, { phase: "idle" }); L.frame(16, { phase: "idle", programs: 150, textures: 80 });
  assert.equal(L.frames.length, 2); assert.equal(L.report().rows[0].shaders, 0);
});

test("GPU time is averaged where there is any, and the text has a row a phase and names its slowest frames", () => {
  const frames = [{ ms: 10, phase: "a", gpu: 4 }, { ms: 10, phase: "a", gpu: 6 }, { ms: 40, phase: "b", gpu: null, shaders: 1 }];
  const rows = summarise(frames); assert.equal(rows[0].gpu, 5); assert.equal(rows[1].gpu, null);
  const text = reportText("FishDock · test", { rows, worst: worstFrames(frames, 2) });
  const lines = text.split("\n"); assert.equal(lines[0], "FishDock · test"); assert.equal(lines.length, 5);
  assert.match(lines[3], /^b \| 0 \| 1 \| 25 \|/); assert.match(lines[4], /40 ms at 0\.1 s \(b, 1 shader built\)/);
});
