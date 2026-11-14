// ---- which fish bites in the game, and its size (src/lib/fishDraw.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { drawFish } from "../src/lib/fishDraw.js";
import { medalFor } from "../src/lib/progress.js";

const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const LIST = ["cod", "whiting", "dab", "bass", "mackerel", "pouting"].map((id) => ({ id }));

test("the place's own documented fish come up far more often", () => {
  const rnd = seeded(7), n = 6000, count = {};
  for (let i = 0; i < n; i++) { const f = drawFish(LIST, [{ id: "cod" }, { id: "whiting" }], rnd); count[f.species] = (count[f.species] || 0) + 1; }
  // two listed at 4, four others at 1: a listed kind a third of the time, another a twelfth
  assert.ok(Math.abs(count.cod / n - 1 / 3) < 0.03, `cod ${count.cod / n}`);
  assert.ok(Math.abs(count.dab / n - 1 / 12) < 0.02, `dab ${count.dab / n}`);
  assert.equal(drawFish([], []), null);
});

test("sizes: most near the usual, a few big, the odd specimen; never silly", () => {
  const rnd = seeded(11), medals = { none: 0, bronze: 0, silver: 0, gold: 0, specimen: 0 }, n = 8000;
  for (let i = 0; i < n; i++) {
    const f = drawFish([{ id: "bass" }], [], rnd);
    assert.ok(f.lengthCm >= 10 && f.lengthCm <= Math.round(48 * 2.2));
    medals[medalFor("bass", f.lengthCm)?.id || "none"]++;
  }
  const pc = (k) => medals[k] / n;
  assert.ok(pc("none") > 0.4 && pc("none") < 0.55, `below the usual ${pc("none")}`);
  assert.ok(pc("gold") > 0.02 && pc("gold") < 0.1, `gold ${pc("gold")}`);
  assert.ok(pc("specimen") > 0.008 && pc("specimen") < 0.05, `specimen ${pc("specimen")}`);
});
