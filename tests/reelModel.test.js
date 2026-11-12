// Tap to reel (src/lib/reelModel.js): taps wind line in with a sensible curve, fish pull back and run, the drag slips,
// Standard mode never breaks the line, Advanced mode can, and a slack line can lose the fish.
import test from "node:test";
import assert from "node:assert/strict";
import { tapRate, effort, createFight, fightStep, timeToLand, REEL, DRAG } from "../src/lib/reelModel.js";

// tapping steadily at `rate` taps a second: the taps that fall in each step
const tapper = (rate) => { let acc = 0; return (dt) => { acc += rate * dt; const n = Math.floor(acc); acc -= n; return { taps: n, rate }; }; };

test("taps a second come from the last moment of taps; a single tap still winds a little", () => {
  assert.equal(tapRate([], 1000), 0);
  assert.equal(tapRate([900], 1000), 1.4);
  const four = [400, 550, 700, 850, 1000];
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
  let slipped = false, lostLine = false, prev = 0; const tap9 = tapper(9);
  for (let t = 0; t < 60 && !s.near; t += 0.05) {
    s = fightStep(s, 0.05, tap9(0.05));
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
    const tap9 = tapper(9);
    for (let t = 0; t < 60 && !s.out && !s.near; t += 0.05) s = fightStep(s, 0.05, { ...tap9(0.05), drag: DRAG.max });
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

test("each tap winds there and then; stop tapping and the winding stops; the handle turns half a turn a tap", () => {
  const base = createFight({ species: "whiting", lengthCm: 25, startM: 30, seed: 4 });
  const one = fightStep(base, 0.05, { taps: 1, rate: 1.4 });
  assert.ok(one.progress > base.progress, "one tap brings line in");
  assert.equal(one.turns, REEL.turnsPerTap);
  // no taps: no line comes in (it can only go out), however fast you were tapping a moment ago
  let s = one; for (let i = 0; i < 20; i++) { const n = fightStep(s, 0.05, { taps: 0, rate: 4 }); assert.ok(n.progress <= s.progress + 1e-12, "nothing comes in without a tap"); s = n; }
  assert.equal(s.turns, one.turns, "the handle doesn't turn without a tap");
  // holding the button (no repeated taps) doesn't reel: it's one tap
  // more taps, more line (within reason)
  const slow = fightStep(base, 0.5, { taps: 1, rate: 2 }), fast = fightStep(base, 0.5, { taps: 3, rate: 6 });
  assert.ok(fast.progress > slow.progress);
});

test("'running' only while the fish is really taking line: the distance grows whenever it says so", () => {
  for (const [species, cm] of [["bass", 65], ["cod", 70], ["mackerel", 35], ["thornback-ray", 60], ["conger", 120]]) {
    let s = createFight({ species, lengthCm: cm, startM: 50, seed: 9 }); const tap = tapper(4);
    for (let t = 0; t < 40 && !s.near && !s.out; t += 0.05) {
      const before = s.dist; s = fightStep(s, 0.05, tap(0.05));
      if (s.running) assert.ok(s.dist > before, `${species}: says it's running while the distance fell`);
      if (s.dist > before + 1e-9) assert.ok(s.taking, `${species}: line went out without a cause`);
    }
  }
});

// ---- each kind of fish fights its own way, and a bigger one fights harder ----
const fightOf = (species, cm, rate = 4, secs = 30, seed = 5) => {
  let s = createFight({ species, lengthCm: cm, startM: 40, seed }); const tap = tapper(rate), out = [];
  for (let t = 0; t < secs && !s.near && !s.out; t += 0.05) { s = fightStep(s, 0.05, tap(0.05)); out.push({ t, ...s }); }
  return out;
};
const mean = (a, k) => a.reduce((x, s) => x + s[k], 0) / Math.max(1, a.length);
const turnsOf = (a) => { let n = 0; for (let i = 1; i < a.length; i++) if (Math.sign(a[i].dir) !== Math.sign(a[i - 1].dir) && Math.abs(a[i].dir - a[i - 1].dir) > 0.02) n++; return n / (a[a.length - 1].t || 1); };

test("a bass's first run takes line off the drag; a cod knocks and bores down instead", () => {
  for (const seed of [1, 2, 3, 4]) {
    const bass = fightOf("bass", 55, 4, 5, seed), cod = fightOf("cod", 55, 4, 5, seed);
    assert.ok(bass.some((s) => s.slipping), `bass (seed ${seed}) runs off the drag at the start`);
    assert.ok(mean(cod.slice(0, 60), "dive") > 0.6 && mean(bass.slice(0, 60), "dive") < 0.35, "cod dives, bass runs");
  }
});

test("a mackerel darts about, changing direction far more often than a cod; a cod shakes its head slowly", () => {
  const mk = fightOf("mackerel", 32, 4, 12), cod = fightOf("cod", 55, 4, 12);
  assert.ok(turnsOf(mk) > 3 * turnsOf(cod), `mackerel ${turnsOf(mk).toFixed(2)}/s vs cod ${turnsOf(cod).toFixed(2)}/s`);
  assert.ok(mk.length < cod.length, "a mackerel is in quicker than a cod");
});

test("a bigger fish of the same kind pulls harder and takes longer", () => {
  const small = fightOf("cod", 40, 4, 120), big = fightOf("cod", 85, 4, 120);
  assert.ok(mean(big, "tension") > mean(small, "tension") + 0.05, `big ${mean(big, "tension").toFixed(2)} vs small ${mean(small, "tension").toFixed(2)}`);
  assert.ok(big.length > small.length * 1.3, `big ${big.length} steps vs small ${small.length}`);
});

test("a fish makes one last dash when it first comes close", () => {
  let s = createFight({ species: "bass", lengthCm: 60, startM: 40, seed: 5 }); const tap = tapper(4); let dashedAt = null, runAfter = false;
  for (let t = 0; t < 120 && !s.near && !s.out; t += 0.05) {
    s = fightStep(s, 0.05, tap(0.05));
    if (s.dashed && dashedAt == null) { dashedAt = s.age; assert.ok(s.progress >= REEL.dashAt); }
    if (dashedAt != null && s.age > dashedAt + 0.5 && s.age < dashedAt + 1.2 && s.fishPull > 0) runAfter = runAfter || s.runs.some(([a, b]) => s.age >= a && s.age < b);
  }
  assert.ok(dashedAt != null, "it dashed"); assert.ok(runAfter, "and that dash is a run");
  assert.ok(s.near, "and it can still be landed");
  assert.equal(s.runs.filter((r) => r[2] === 1.05).length, 1, "once only");
});
