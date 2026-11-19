// ---- scrubPlan.js: where the rough growth stands ----
import test from "node:test";
import assert from "node:assert/strict";
import { scrubSpots, KINDS, SIZE } from "../src/lib/world3d/scrubPlan.js";

const flat = { grassAt: () => 1, yAt: () => 5, roughAt: () => 1, avoid: () => false, x0: -200, x1: 200, step: 4, cap: 1e6, seed: 3 };

test("scrub stands only where grass is drawn, and never on a road, a pier or a building", () => {
  assert.equal(scrubSpots({ ...flat, grassAt: () => 0 }).length, 0, "bare ground");
  assert.equal(scrubSpots({ ...flat, avoid: () => true }).length, 0, "all road");
  const half = scrubSpots({ ...flat, grassAt: (x) => (x > 0 ? 1 : 0), avoid: (x, z) => z > 100 });
  assert.ok(half.length > 50);
  assert.ok(half.every((s) => s.x > 0 && s.z <= 100));
});

test("it stands on the ground, every kind a size of its own, the same each visit", () => {
  const a = scrubSpots({ ...flat, yAt: (x, z) => 3 + x * 0.1 }), b = scrubSpots({ ...flat, yAt: (x, z) => 3 + x * 0.1 });
  assert.deepEqual([...a], [...b]);
  for (const s of a) {
    assert.ok(KINDS.includes(s.kind)); assert.ok(Math.abs(s.y - (3 + s.x * 0.1)) < 1e-9);
    const S = SIZE[s.kind]; assert.ok(s.w >= S[0] && s.w <= S[1] && s.h > 0 && s.h <= S[3] + 1e-9, `${s.kind} ${s.w.toFixed(2)} x ${s.h.toFixed(2)}`);
  }
  assert.ok(KINDS.every((k) => a.some((s) => s.kind === k)), "all three kinds on a rough bank");
});

test("a bank is wilder than open grass, a slope wilder than the flat, and a dune has none", () => {
  const bank = scrubSpots(flat).length, open = scrubSpots({ ...flat, roughAt: () => 0.15 }).length, dune = scrubSpots({ ...flat, roughAt: () => 2 }).length;
  assert.ok(bank > open * 1.5, `bank ${bank}, open ${open}`); assert.ok(open > 0); assert.equal(dune, 0);
  const bushes = (l) => l.length;
  const slope = scrubSpots({ ...flat, roughAt: () => 0.15, yAt: (x) => x * 0.6 }), level = scrubSpots({ ...flat, roughAt: () => 0.15 });
  assert.ok(bushes(slope) > bushes(level) * 1.5, `slope ${bushes(slope)}, level ${bushes(level)}`);
});

test("bushes gather in thickets", () => {
  const all = scrubSpots({ ...flat, x0: -400, x1: 400 }), bushes = all.filter((s) => s.kind === "scrub" || s.kind === "gorse");
  // (20 m squares: some with many bushes, a third with none)
  const sq = new Map(); for (const s of bushes) { const k = Math.floor(s.x / 20) + "," + Math.floor(s.z / 20); sq.set(k, (sq.get(k) || 0) + 1); }
  assert.ok(sq.size < 1600 * 0.72, `${sq.size} of 1600 squares have a bush`); assert.ok(Math.max(...sq.values()) >= 2.5 * (bushes.length / 1600), "the thickest square has two and a half times its share");
});

test("only ground within reach of where people stand is tried, and over the cap what is nearest a spot is kept", () => {
  const all = scrubSpots({ ...flat, x0: -900, x1: 900, focus: [[0, 0]], reach: 300 });
  assert.ok(all.length > 100); assert.ok(all.every((s) => Math.hypot(s.x, s.z) <= 300));
  const capped = scrubSpots({ ...flat, x0: -900, x1: 900, focus: [[0, 0]], reach: 300, cap: 200 });
  assert.equal(capped.length, 200); assert.equal(capped.total, all.length);
  const worst = Math.max(...capped.map((s) => Math.hypot(s.x, s.z)));
  assert.ok(all.filter((s) => Math.hypot(s.x, s.z) < worst - 1e-9).length <= 200, "nothing nearer was left out");
  // (a plant keeps its place whichever spots the place has)
  const other = scrubSpots({ ...flat, x0: -900, x1: 900, focus: [[40, 0]], reach: 300 }), key = (s) => s.x.toFixed(3) + "," + s.z.toFixed(3), set = new Set(all.map(key));
  assert.ok(other.filter((s) => Math.hypot(s.x, s.z) < 200).every((s) => set.has(key(s))));
});
