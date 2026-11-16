// How wet the pier stays after rain (src/lib/bitescore.js groundWetness), for the 3D view's deck and puddles.
import test from "node:test";
import assert from "node:assert/strict";
import { groundWetness } from "../src/lib/bitescore.js";

const H = 3600e3, T0 = Date.parse("2026-11-16T12:00:00Z");
// Open-Meteo's hourly rows: each hour's rain is the hour up to its time
const rows = (mm) => ({ hourly: mm.map((p, k) => ({ t: new Date(T0 + (k - mm.length + 1) * H).toISOString(), precipMm: p })) });

test("dry when nothing has fallen, or nothing is known", () => {
  assert.equal(groundWetness(null, T0), 0);
  assert.equal(groundWetness({ hourly: [] }, T0), 0);
  assert.equal(groundWetness(rows([0, 0, 0, 0]), T0), 0);
  assert.equal(groundWetness(rows([0, 0, null, 0]), T0), 0, "an unknown hour is not rain");
});

test("wet after a shower, drying over the next hours", () => {
  const just = groundWetness(rows([0, 0, 0, 1]), T0 + 0.5 * H); // (1 mm in the hour that ended half an hour ago)
  assert.ok(just > 0.4 && just < 0.85, `a millimetre just now: ${just}`);
  const later = groundWetness(rows([0, 0, 0, 1]), T0 + 3 * H), dry = groundWetness(rows([0, 0, 0, 1]), T0 + 8 * H);
  assert.ok(later < just / 2 && later > 0, `three hours on: ${later}`);
  assert.ok(dry < 0.05, `eight hours on: ${dry}`);
  assert.ok(groundWetness(rows([0, 0, 0, 0.1]), T0 + 0.5 * H) < 0.25, "a drizzle barely darkens it");
  assert.ok(groundWetness(rows([0, 0, 2, 3]), T0 + 0.5 * H) > just, "more rain, wetter");
  assert.ok(groundWetness(rows([4, 4, 4, 4]), T0) <= 1);
});

test("hours still to come don't count", () => {
  const cond = rows([0, 0, 0, 5]);
  assert.equal(groundWetness(cond, T0 - 2 * H), 0, "the rain is forecast, not fallen");
  assert.ok(groundWetness(cond, T0 + 0.1 * H) > 0.9, "the downpour just over");
});
