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

test("shedding (Auto): each step only lowers, in order, and a device remembers how far it went", async () => {
  const { SHED, capGfx, recallShed, rememberShed, rememberPace, recallPace } = await import("../src/lib/pacing.js");
  const high = { res: 1, shadows: 2, ao: 1, bloom: 1, aa: 4, sharp: 0.5, refl: 1 };
  assert.deepEqual(capGfx(high, 0), high, "nothing shed: as asked");
  assert.equal(capGfx(high, 1).refl, 0, "first the mirrored scene"); assert.equal(capGfx(high, 1).shadows, 2);
  assert.equal(capGfx(high, 2).shadows, 1); assert.equal(capGfx(high, 3).aa, 2); assert.equal(capGfx(high, 4).shadows, 0);
  const all = capGfx(high, SHED.length); assert.deepEqual([all.refl, all.shadows, all.aa, all.bloom, all.sharp], [0, 0, 0, 0, 0]);
  assert.equal(all.res, 1, "the sharpness isn't a shed step");
  // never raises: a setting already lower stays as it was
  assert.equal(capGfx({ aa: 0, shadows: 0 }, 3).aa, 0); assert.equal(capGfx({ shadows: 0 }, 2).shadows, 0);
  // an empty request lowers what's in use
  assert.deepEqual(capGfx({}, 1, high), { refl: 0 });
  const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }, now = Date.UTC(2026, 10, 14);
  assert.equal(recallShed("balanced", store, now), 0);
  rememberPace("balanced", 1.25, store, now); rememberShed("balanced", 3, store, now);
  assert.equal(recallShed("balanced", store, now), 3); assert.equal(recallPace("balanced", store, now), 1.25, "the sharpness kept beside it");
  rememberPace("balanced", 1.5, store, now); assert.equal(recallShed("balanced", store, now), 3, "and the steps kept beside the sharpness");
  assert.equal(recallShed("balanced", store, now + 31 * 864e5), 0, "a month on, it finds out again");
});
