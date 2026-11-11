// ---- frame pacing (src/lib/pacing.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { stepDown, recallPace, rememberPace } from "../src/lib/pacing.js";

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("stepping down: a quarter at a time, a half when nearly every frame is late, never under the floor", () => {
  assert.equal(stepDown(2.5, 1.25, 0.5), 2.25);
  assert.equal(stepDown(2.5, 1.25, 0.9), 2);
  assert.equal(stepDown(1.5, 1.25, 0.9), 1.25);
  assert.equal(stepDown(1.25, 1.25, 0.5), 1.25);
});

test("a device's settled resolution is remembered per quality setting, for a month", () => {
  const s = store(), day = 864e5;
  assert.equal(recallPace("high", s, 0), null);
  rememberPace("high", 1.5, s, 0); rememberPace("balanced", 2, s, 0);
  assert.equal(recallPace("high", s, day), 1.5); assert.equal(recallPace("balanced", s, day), 2); assert.equal(recallPace("ultra", s, day), null);
  assert.equal(recallPace("high", s, 31 * day), null, "forgotten after a month: the phone, or FishDock, may have changed");
  rememberPace("high", 2.25, s, day); assert.equal(recallPace("high", s, 2 * day), 2.25);
  assert.equal(recallPace("high", { getItem: () => "not json" }, 0), null);
  assert.doesNotThrow(() => rememberPace("high", 1.5, { getItem: () => { throw new Error("blocked"); } }));
});
