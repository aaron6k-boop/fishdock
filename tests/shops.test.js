// ---- shop links: every rig and stock bait has search words, and the links are plain shop searches ----
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOPS, RIG_SEARCH, BAIT_SEARCH, rigQuery, baitQuery } from "../src/data/shops.js";
import { GEAR, gearFor } from "../src/data/gear.js";
import { RIGS } from "../src/data/rigs.js";
import { BAITS } from "../src/data/baits.js";
import { SPECIES } from "../src/data/species.js";

test("shops: each link is the shop's own search over https, with only the search words", () => {
  for (const s of SHOPS) {
    const u = new URL(s.url("pulley rig"));
    assert.equal(u.protocol, "https:");
    assert.ok(/pulley\+rig|pulley%20rig/.test(u.search), u.href);
    assert.doesNotMatch(u.href, /tag=|affiliate|ref=/i, "no affiliate tags");
  }
  assert.equal(SHOPS[0].url("frozen squid bait"), "https://www.amazon.co.uk/s?k=frozen+squid+bait");
  assert.equal(SHOPS[1].url("2/0 hooks"), "https://www.gooutdoors.co.uk/search?q=2%2F0+hooks");
});

test("shops: every rig and stock bait has search words", () => {
  for (const r of RIGS) assert.ok(RIG_SEARCH[r.id], `no search words for rig ${r.id}`);
  for (const b of BAITS) assert.ok(BAIT_SEARCH[b.id], `no search words for bait ${b.id}`);
  assert.equal(rigQuery({ id: "made-up", name: "Odd rig (two hooks)" }), "Odd rig");
  assert.equal(baitQuery({ id: null, name: "Weedless soft plastic, 5–7in" }, { type: "sea" }), "Weedless soft plastic sea fishing");
  assert.equal(baitQuery({ id: "squid", name: "Whole squid" }), "frozen squid bait");
});

test("gear: kit lists suit the fish and its water", () => {
  const pike = gearFor(SPECIES.find((s) => s.id === "pike"), "deadbait").map((g) => g.id);
  assert.ok(pike.includes("long-forceps") && pike.includes("wire-trace") && pike.includes("unhooking-mat"));
  assert.ok(!pike.includes("tripod"), "no beach kit for pike");
  const cod = gearFor(SPECIES.find((s) => s.id === "cod"), "beachcasting").map((g) => g.id);
  assert.ok(cod.includes("tripod") && !cod.includes("unhooking-mat"));
  for (const g of GEAR) {
    assert.ok(g.q && g.why && g.name, g.id);
    assert.doesNotMatch(`${g.name} ${g.why}`, /£|\d+\s?(lb|kg|g|mm|cm|in)\b/i, "no prices or sizes in kit ideas");
    for (const id of g.species || []) assert.ok(SPECIES.some((s) => s.id === id), `${g.id}: unknown species ${id}`);
  }
});
