// The match in a public place (src/lib/pierMatch.js): the first 20 minutes of every hour, by total length.
import test from "node:test";
import assert from "node:assert/strict";
import { matchAt, matchBoard, countdown, MATCH } from "../src/lib/pierMatch.js";

const H = Date.UTC(2026, 10, 15, 22); // 22:00 UTC, 22:00 in the UK in November

test("a match in the first 20 minutes of each hour; the next one coming up after", () => {
  assert.deepEqual([matchAt(H).on, matchAt(H + 19 * 60e3).on, matchAt(H + 20 * 60e3).on], [true, true, false]);
  const later = matchAt(H + 50 * 60e3);
  assert.equal(later.startsAt, H + MATCH.everyMs); assert.equal(later.soon, true, "ten minutes off: coming up");
  assert.equal(matchAt(H + 25 * 60e3).soon, false);
  assert.equal(matchAt(H + 25 * 60e3).last.startsAt, H, "the one just fished");
  assert.equal(matchAt(H + 5 * 60e3).last.startsAt, H - MATCH.everyMs);
});

test("the board: total length of every fish landed in the match, the longer best fish breaking a tie", () => {
  const r = matchAt(H + 60e3), ev = (who, min, cm, type = "catch") => ({ type, who, t: H + min * 60e3, data: { lengthCm: cm } });
  const b = matchBoard([ev("a", 2, 30), ev("a", 5, 25), ev("b", 3, 55), ev("c", 4, 40), ev("c", 6, 15), ev("b", 21, 80), ev("a", -1, 90), ev("c", 7, 50, "lost"), ev("d", 8, NaN)], r);
  assert.deepEqual(b.map((s) => [s.who, s.totalCm, s.n]), [["b", 55, 1], ["c", 55, 2], ["a", 55, 2]]);
  assert.deepEqual(b.map((s) => s.bestCm), [55, 40, 30], "equal totals: the longer best fish first");
  assert.deepEqual(matchBoard([], r), []);
});

test("countdowns read as minutes and seconds", () => {
  assert.equal(countdown(14 * 60e3 + 32e3), "14:32"); assert.equal(countdown(-5), "0:00"); assert.equal(countdown(999), "0:01");
});
