import { test } from "node:test";
import assert from "node:assert/strict";
import { stepHandle, handleState } from "../src/lib/reelHandle.js";

const run = (taps, seconds, fps, s = handleState()) => {
  // taps: times (s) of accepted taps; each is half a turn
  const out = []; let t = 0, turns = 0, k = 0;
  while (t < seconds) { while (k < taps.length && taps[k] <= t) { turns += 0.5; k++; } s = stepHandle(s, turns, 1 / fps); out.push(s.angle); t += 1 / fps; }
  return { s, out, turns };
};

test("the handle never turns backwards and never runs past where the taps took it", () => {
  const taps = Array.from({ length: 12 }, (_, i) => 0.1 + i * 0.12);
  const { out, turns } = run(taps, 3, 60);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] >= out[i - 1] - 1e-9, `backwards at frame ${i}`);
  assert.ok(Math.max(...out) <= turns * Math.PI * 2 + 1e-6);
});

test("one tap is half a turn, made smoothly over a moment rather than snapped", () => {
  const { out } = run([0], 1.2, 60);
  assert.ok(Math.abs(out.at(-1) - Math.PI) < 0.01);
  const steps = out.map((a, i) => (i ? a - out[i - 1] : a));
  assert.ok(Math.max(...steps) < Math.PI / 4, "no single frame does more than an eighth of a turn");
  assert.ok(out.findIndex((a) => a > Math.PI * 0.95) > 15, "takes more than a quarter of a second");
});

test("with no taps it doesn't move", () => {
  const { out } = run([], 2, 60);
  assert.ok(out.every((a) => a === 0));
});

test("the same at 30, 60 and 120 frames a second", () => {
  const taps = [0, 0.15, 0.3, 0.45];
  const a = run(taps, 1, 30).s.angle, b = run(taps, 1, 60).s.angle, c = run(taps, 1, 120).s.angle;
  assert.ok(Math.abs(a - b) < 0.12 && Math.abs(b - c) < 0.06, `${a} ${b} ${c}`);
});

test("a new fight carries on from where the handle is", () => {
  let s = run([0, 0.1, 0.2], 1, 60).s;
  const at = s.angle;
  s = stepHandle(s, 0, 1 / 60); // the next fight: no turns yet
  assert.ok(s.angle >= at - 1e-9 && s.angle - at < 0.02);
  s = stepHandle(s, 0.5, 1); assert.ok(s.angle > at);
});
