// ---- the game's diary and your fishing name, kept on the phone ----
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { cleanName, playerName, setPlayerName, diary, addCatch, setOutcome, summary, clearDiary } = await import("../src/lib/diary.js");

test("a fishing name: 2 to 20 letters, numbers, spaces, hyphens or apostrophes, tidied", () => {
  assert.equal(cleanName("  Aaron   the  Angler "), "Aaron the Angler");
  assert.equal(cleanName("Seán O'Brien-Smith"), "Seán O'Brien-Smith");
  assert.equal(cleanName("<script>x</script>"), "scriptxscript");
  assert.equal(cleanName("A"), null, "too short");
  assert.equal(cleanName("x".repeat(21)), null, "too long");
  assert.equal(playerName(), null, "none until chosen");
  assert.equal(setPlayerName("  Gary  "), "Gary"); assert.equal(playerName(), "Gary");
  assert.equal(setPlayerName("!"), null); assert.equal(playerName(), "Gary", "a bad name doesn't replace a good one");
});

test("the diary: each landed fish once, newest first, kept or put back, with totals by day", () => {
  clearDiary();
  addCatch({ id: "c1", species: "bass", name: "Bass", lengthCm: 41.6, place: "gorleston-south-pier", placeName: "Gorleston South Pier", at: Date.UTC(2026, 10, 12, 18) });
  addCatch({ id: "c2", species: "cod", name: "Cod", lengthCm: 62, place: "gorleston-south-pier", at: Date.UTC(2026, 10, 13, 18) });
  addCatch({ id: "c2", species: "cod", name: "Cod", lengthCm: 99 });
  assert.equal(diary().length, 2, "the same catch again changes nothing");
  assert.equal(diary()[0].id, "c2"); assert.equal(diary()[1].lengthCm, 42);
  setOutcome("c1", "released"); setOutcome("c2", "eaten");
  assert.equal(diary()[1].outcome, "released"); assert.equal(diary()[0].outcome, null);
  const s = summary(); assert.equal(s.count, 2); assert.equal(s.kinds, 2); assert.equal(s.biggest.id, "c2"); assert.equal(s.days.length, 2);
  for (let i = 0; i < 5020; i++) mem.set("fishdock.diary", JSON.stringify([{ id: `x${i}`, species: "dab", lengthCm: 20, at: i }, ...JSON.parse(mem.get("fishdock.diary") || "[]")].slice(0, 5010)));
  addCatch({ id: "last", species: "dab", lengthCm: 20 });
  assert.equal(diary().length, 5000, "the newest 5,000 are kept"); assert.equal(diary()[0].id, "last");
  addCatch({ id: "n1", species: "cod", lengthCm: 60, night: true, rough: true }); assert.equal(diary()[0].night, true); assert.equal(diary()[0].rough, true);
});
