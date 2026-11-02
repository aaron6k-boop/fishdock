// Tap to reel (src/lib/reelModel.js): taps wind line in with a sensible curve, fish pull back and run, the drag slips,
// Standard mode never breaks the line, Advanced mode can, and a slack line can lose the fish.
import test from "node:test";
import assert from "node:assert/strict";
import { tapRate, effort, createFight, fightStep, timeToLand, REEL, DRAG } from "../src/lib/reelModel.js";

test("taps a second come from the last moment of taps; a single tap still winds a little", () => {
  assert.equal(tapRate([], 1000), 0);
  assert.equal(tapRate([900], 1000), 1.4);
  const four = [0, 250, 500, 750, 1000];
  assert.ok(Math.abs(tapRate(four, 1100) - 5 / REEL.window) < 1e-9);
  assert.equal(tapRate([0], 5000), 0, "old taps don't count");
});

test("3 to 5 taps a second works; frantic tapping adds less and less; slow tapping is slow", () => {
  assert.ok(effort(4) > 2.5 * effort(1) * 0.9);
  assert.ok(effort(10) - effort(5) < effort(5) - effort(2), "diminishing returns");
  const cod = { species: "cod", lengthCm: 55, startM: 40, seed: 3 };
  const t1 = timeToLand(cod, 1), t4 = timeToLand(cod, 4), t10 = timeToLand(cod, 10);
  assert.ok(t4 > 8 && t4 < 25, `cod at 4 taps/s: ${t4}s`);
  assert.ok(t10 > t4 * 0.75, `tapping 10 a second (${t10}s) isn't much quicker than 4 (${t4}s)`);
  assert.ok(t1 > t4 * 2, "one tap a second takes far longer");
  const whiting = timeToLand({ species: "whiting", lengthCm: 28, startM: 40, seed: 3 }, 4);
  assert.ok(whiting < t4, "a small whiting comes in quicker than a big cod");
});

test("a run takes line back even while you're tapping; the drag slips before the line could break", () => {
  let s = createFight({ species: "bass", lengthCm: 65, startM: 50, seed: 7 });
  let slipped = false, lostLine = false, prev = 0;
  for (let t = 0; t < 60 && !s.near; t += 0.05) {
    s = fightStep(s, 0.05, { rate: 9 });
    if (s.slipping) slipped = true;
    if (s.progress < prev - 1e-6) lostLine = true;
    prev = s.progress;
    assert.ok(s.tension <= DRAG.standard + 0.2, "Standard drag holds tension down");
    assert.equal(s.out, null, "Standard mode never breaks the line");
  }
  assert.ok(slipped && lostLine, "runs slip the drag and take line");
});

test("Advanced mode: a drag screwed down tight with hard winding can break the line", () => {
  let broke = false;
  for (let seed = 1; seed < 8 && !broke; seed++) {
    let s = createFight({ species: "conger", lengthCm: 130, startM: 40, mode: "advanced", seed });
    for (let t = 0; t < 60 && !s.out && !s.near; t += 0.05) s = fightStep(s, 0.05, { rate: 9, drag: DRAG.max });
    broke = s.out === "broke";
  }
  assert.ok(broke);
  assert.notEqual(timeToLand({ species: "conger", lengthCm: 130, startM: 40, mode: "advanced", seed: 2 }, 4, { drag: 0.7 }), Infinity, "a sensible drag lands it");
});

test("leave it slack for a long time and the hook can come out; assisted reeling lands it at a steady rate", () => {
  let s = createFight({ species: "whiting", lengthCm: 25, startM: 30, seed: 2 });
  for (let t = 0; t < 30 && !s.out; t += 0.1) s = fightStep(s, 0.1, { rate: 0 });
  assert.equal(s.out, "free");
  const a = timeToLand({ species: "cod", lengthCm: 55, startM: 40, seed: 3 }, 0, { assisted: true });
  assert.ok(Number.isFinite(a) && a < 30);
  // the same fight with the same seed plays the same way
  assert.equal(timeToLand({ species: "cod", lengthCm: 55, startM: 40, seed: 5 }, 4), timeToLand({ species: "cod", lengthCm: 55, startM: 40, seed: 5 }, 4));
});
