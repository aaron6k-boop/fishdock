// ---- the game's levels, XP, medals and badges (src/lib/progress.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { medalFor, levelFor, xpToReach, replay, progress, afterCatch, BADGES, challengesFor, challengeDays, CHALLENGES, CHALLENGE_XP } from "../src/lib/progress.js";

const T0 = Date.UTC(2026, 10, 13, 18);
const fish = (id, species, lengthCm, at = T0, more = {}) => ({ id, species, name: species, lengthCm, at, place: "gorleston-south-pier", outcome: null, ...more });

test("medals by size against that kind's usual size in the game", () => {
  assert.equal(medalFor("bass", 40), null, "under the usual 48 cm: no medal");
  assert.equal(medalFor("bass", 48).id, "bronze"); assert.equal(medalFor("bass", 56).id, "silver");
  assert.equal(medalFor("bass", 63).id, "gold"); assert.equal(medalFor("bass", 72).id, "specimen");
});

test("levels: 100 XP for level 2, 300 for 3, 1,000 for 5; and how far into a level you are", () => {
  assert.deepEqual([2, 3, 5, 10].map(xpToReach), [100, 300, 1000, 4500]);
  assert.equal(levelFor(0).level, 1); assert.equal(levelFor(99).level, 1); assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(999).level, 4); assert.equal(levelFor(1000).level, 5);
  const l = levelFor(450); assert.equal(l.level, 3); assert.equal(l.into, 150); assert.equal(l.need, 150); assert.equal(l.pct, 0.5);
  for (let x = 0; x < 50000; x += 37) { const v = levelFor(x); assert.ok(v.from <= x && x < v.to, `${x}`); }
});

test("XP: bigger fish and bigger kinds earn more; a first and a personal best add a bonus", () => {
  const [a, b] = replay([fish("b", "bass", 70, T0 + 1000), fish("a", "whiting", 30, T0)]);
  assert.equal(a.e.id, "a", "oldest first");
  assert.ok(a.first && b.first, "each the first of its kind");
  assert.ok(b.xp > a.xp * 2, `a specimen bass (${b.xp}) is worth far more than a small whiting (${a.xp})`);
  const rows = replay([fish("c", "bass", 60, T0 + 3000), fish("b", "bass", 50, T0 + 2000), fish("a", "bass", 45, T0 + 1000)]);
  assert.equal(rows[0].first, true); assert.equal(rows[1].best, true, "50 cm beats 45"); assert.equal(rows[2].best, true);
  assert.equal(rows[1].xp - rows[1].base, 20, "the personal best bonus");
  const smaller = replay([fish("b", "bass", 40, T0 + 2000), fish("a", "bass", 50, T0 + 1000)]);
  assert.equal(smaller[1].best, false);
});

test("the same easy fish again and again the same day earns less each time (not below a third); a new day afresh", () => {
  const list = Array.from({ length: 12 }, (_, i) => fish(`d${i}`, "dab", 24, T0 + i * 60e3)).reverse();
  const rows = replay(list), base = rows.map((r) => r.base);
  for (let i = 1; i < base.length; i++) assert.ok(base[i] <= base[i - 1]);
  assert.ok(base.at(-1) >= Math.floor(base[0] * 0.35) && base.at(-1) < base[0] * 0.5);
  const tomorrow = replay([fish("t", "dab", 24, T0 + 86400e3), ...list]);
  assert.equal(tomorrow.at(-1).base, base[0], "a new day: full XP again");
  // a mixed bag beats one kind over and over
  const mixed = replay(["whiting", "dab", "pouting", "mackerel", "whiting", "dab", "pouting", "mackerel", "whiting", "dab", "pouting", "mackerel"].map((s, i) => fish(`m${i}`, s, 26, T0 + i * 60e3)));
  const same = replay(Array.from({ length: 12 }, (_, i) => fish(`s${i}`, "whiting", 26, T0 + i * 60e3)));
  assert.ok(mixed.reduce((a, r) => a + r.base, 0) > same.reduce((a, r) => a + r.base, 0));
});

test("the logbook: totals, species book with bests and medals, badges with when they were earned", () => {
  const list = [
    fish("e", "cod", 90, T0 + 5000, { place: "cromer-pier", night: true }),
    fish("d", "bass", 64, T0 + 4000, { outcome: "released" }),
    fish("c", "bass", 50, T0 + 3000),
    fish("b", "whiting", 30, T0 + 2000, { place: "deal-pier", rough: true }),
    fish("a", "dab", 20, T0 + 1000),
  ];
  const p = progress(list);
  assert.equal(p.stats.count, 5); assert.equal(p.stats.kinds, 4); assert.equal(p.stats.places, 3); assert.equal(p.stats.released, 1);
  const bass = p.species.find((k) => k.species === "bass");
  assert.equal(bass.n, 2); assert.equal(bass.best.lengthCm, 64); assert.equal(bass.medal.id, "gold");
  const got = Object.fromEntries(p.badges.map((b) => [b.id, b]));
  assert.ok(got.first.got && got.first.at === T0 + 1000); assert.ok(got.places3.got); assert.ok(got.night.got); assert.ok(got.rough.got);
  assert.ok(got.gold.got); assert.ok(got.specimen.got, "a 90 cm cod is a specimen (usual 55)"); assert.equal(got.kinds5.got, false);
  assert.equal(p.badges.length, BADGES.length);
  assert.equal(p.xp, p.rows.reduce((a, r) => a + r.xp, 0) + p.challengeXp, "the catches' XP and the challenges'");
  assert.deepEqual(progress([]).level, 1);
});

test("after a catch: what it earned, a level gained, and new badges", () => {
  const before = [fish("a", "dab", 20, T0)];
  const r = afterCatch(before, fish("b", "cod", 90, T0 + 1000));
  assert.ok(r.first && r.medal.id === "specimen" && r.xp > 100);
  assert.equal(r.levelUp, true); assert.ok(r.badges.some((b) => b.id === "specimen"));
  const again = afterCatch([fish("b", "cod", 90, T0 + 1000), ...before], fish("c", "cod", 50, T0 + 2000));
  assert.equal(again.first, false); assert.equal(again.best, false); assert.equal(again.badges.length, 0);
});

test("three challenges a day: the same all day, different days differ, worth XP once done, for good", () => {
  const day = Date.UTC(2026, 10, 14, 10), later = day + 5 * 3600e3, next = day + 86400e3;
  const ids = (t) => challengesFor(t).map((c) => c.id);
  assert.equal(ids(day).length, 3); assert.equal(new Set(ids(day)).size, 3);
  assert.deepEqual(ids(day), ids(later), "the same all day");
  const many = new Set(Array.from({ length: 30 }, (_, i) => ids(day + i * 86400e3).join()));
  assert.ok(many.size > 20, "they change from day to day");
  for (let i = 0; i < 60; i++) for (const id of ids(day + i * 86400e3)) assert.ok(CHALLENGES.some((c) => c.id === id));
  // a day where every challenge can be done: 5 fish, 3 kinds, medals, put back, two places, a new kind, a best
  const t = (m) => day + m * 60e3, list = [
    fish("f5", "cod", 90, t(50), { outcome: "released", place: "cromer-pier" }), fish("f4", "cod", 60, t(40), { outcome: "released" }),
    fish("f3", "bass", 56, t(30), { outcome: "released" }), fish("f2", "dab", 24, t(20)), fish("f1", "whiting", 30, t(10)),
  ];
  const p = progress(list, later);
  assert.equal(p.today.length, 3); assert.ok(p.today.every((c) => c.done), JSON.stringify(p.today));
  assert.equal(p.challengeXp, 3 * CHALLENGE_XP);
  // nothing caught today: today's three, none done yet, no bonus
  const quiet = progress([], next); assert.equal(quiet.today.length, 3); assert.ok(quiet.today.every((c) => !c.done)); assert.equal(quiet.challengeXp, 0);
  // the day's record keeps them: tomorrow, yesterday's still count
  assert.equal(progress(list, next).challengeXp, 3 * CHALLENGE_XP);
  assert.equal(challengeDays(replay(list)).length, 1);
});

test("after a catch: a challenge it completes is named once", () => {
  const day = Date.UTC(2026, 10, 14, 10);
  const want = challengesFor(day).map((c) => c.id);
  // land fish one by one until each of today's challenges that a plain run of catches can finish is done, once each
  let list = [], seen = [];
  const kinds = ["whiting", "dab", "bass", "cod", "pouting", "mackerel"];
  for (let i = 0; i < 6; i++) {
    const e = fish(`c${i}`, kinds[i], i === 2 ? 60 : 26, day + i * 60e3, { place: i === 3 ? "cromer-pier" : "gorleston-south-pier", outcome: "released" });
    const r = afterCatch(list, e); seen.push(...r.challenges.map((c) => c.id)); list = [e, ...list];
  }
  assert.equal(new Set(seen).size, seen.length, "each named once");
  for (const id of seen) assert.ok(want.includes(id));
});
