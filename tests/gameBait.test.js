// ---- the bait on your hook in the game, and the season (src/lib/gameBait.js with fishDraw.js) ----
import test from "node:test";
import assert from "node:assert/strict";
import { gameBaits, gameBait, baitTakes, seasonOf, biteWeight, takesHere, GAME_BAIT, SEASON, DEFAULT_BAIT } from "../src/lib/gameBait.js";
import { drawFish } from "../src/lib/fishDraw.js";
import { BAITS } from "../src/data/baits.js";
import { SPECIES } from "../src/data/species.js";

const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

test("the baits for each water: FishDock's sourced natural baits, no lures or flies yet", () => {
  const sea = gameBaits(false).map((b) => b.id), fresh = gameBaits(true).map((b) => b.id);
  for (const id of ["ragworm", "lugworm", "peeler-crab", "squid", "mackerel-strip", "prawn", "bread", "deadbait"]) assert.ok(sea.includes(id), id);
  for (const id of ["maggots", "worms", "sweetcorn", "boilies", "bread", "prawn"]) assert.ok(fresh.includes(id), id);
  assert.ok(!sea.includes("maggots") && !fresh.includes("ragworm"), "each water's own");
  assert.ok(![...sea, ...fresh].some((id) => id === "lures" || id === "flies"));
  for (const b of [...gameBaits(false), ...gameBaits(true)]) assert.ok(b.sources?.length, `${b.id} has sources`);
  assert.ok(gameBait(DEFAULT_BAIT.sea, false) && gameBait(DEFAULT_BAIT.fresh, true));
  assert.equal(gameBait("ragworm", true), null);
});

test("which fish take a bait: the bait's own sourced list and every species whose sourced baits name it", () => {
  const rag = baitTakes("ragworm");
  for (const id of BAITS.find((b) => b.id === "ragworm").species) assert.ok(rag.has(id), id);
  assert.ok(rag.has("smoothhound"), "smoothhound names ragworm in species.js");
  assert.ok(!rag.has("cod") && !rag.has("conger"));
  for (const id of baitTakes("deadbait")) assert.ok(SPECIES.some((s) => s.id === id), id);
});

test("the season from species.js: peak, in, out", () => {
  const mack = SPECIES.find((s) => s.id === "mackerel"), cod = SPECIES.find((s) => s.id === "cod");
  assert.equal(seasonOf(mack, 11), "out"); assert.equal(seasonOf(mack, mack.peak[0]), "peak");
  assert.ok(["in", "peak"].includes(seasonOf(cod, 12)));
  assert.equal(seasonOf({ id: "x" }, 5), null);
  assert.equal(biteWeight("bass", { bait: "ragworm" }), GAME_BAIT.takes);
  assert.equal(biteWeight("cod", { bait: "ragworm" }), GAME_BAIT.other);
  assert.equal(biteWeight("mackerel", { month: 11 }), SEASON.out);
  assert.equal(biteWeight("bass"), 1);
});

test("in the game: the fish that take your bait bite far more often, and out-of-season fish rarely", () => {
  const list = ["cod", "whiting", "bass", "flounder", "conger", "thornback-ray", "mackerel", "pouting"].map((id) => ({ id }));
  const share = (bait, month, ids, seed = 3) => {
    const rnd = seeded(seed), n = 6000; let hit = 0;
    for (let i = 0; i < n; i++) { const f = drawFish(list, [], rnd, (id) => biteWeight(id, { bait, month })); if (ids.includes(f.species)) hit++; }
    return hit / n;
  };
  // (lugworm: cod, whiting, bass, flounder take it; four of the eight at 4, four at a quarter)
  const lug = share("lugworm", null, ["cod", "whiting", "bass", "flounder"]);
  assert.ok(Math.abs(lug - 16 / 17) < 0.02, `lugworm takers ${lug}`);
  // (squid swings it to the conger and the ray, which never take lugworm)
  assert.ok(share("squid", null, ["conger", "thornback-ray"]) > 3 * share("lugworm", null, ["conger", "thornback-ray"]));
  // (mackerel in November, out of season, a fifth as often as in its peak)
  const mk = SPECIES.find((s) => s.id === "mackerel");
  assert.ok(share(null, 11, ["mackerel"]) < 0.3 * share(null, mk.peak[0], ["mackerel"]));
});

test("the picker's list: the fish here that take it, in season first", () => {
  const list = SPECIES.filter((s) => s.type !== "fresh");
  const t = takesHere("lugworm", list, 11, ["cod"]);
  assert.ok(t.length >= 5 && t.every((f) => baitTakes("lugworm").has(f.id)));
  const firstOut = t.findIndex((f) => f.season === "out");
  if (firstOut >= 0) assert.ok(t.slice(firstOut).every((f) => f.season === "out"), "out of season last");
  assert.ok(t.find((f) => f.id === "cod").here);
});
