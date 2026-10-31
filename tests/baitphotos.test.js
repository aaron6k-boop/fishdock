// ---- bait photos: free licences, credited, real Commons paths, and species' own bait wording finds a photo ----
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BAIT_PHOTOS, baitPhotoFor } from "../src/data/baitphotos.js";
import { BAITS } from "../src/data/baits.js";

const FREE = /^(cc0( 1\.0)?|cc[- ]zero|public domain|pd(-[a-z0-9-]+)?|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?)$/i;

test("bait photos: free, credited, at the right Commons path, and only for stock baits", () => {
  for (const [id, p] of Object.entries(BAIT_PHOTOS)) {
    assert.ok(BAITS.some((b) => b.id === id), `${id} is not a stock bait`);
    assert.match(p.licence, FREE, id);
    assert.ok(p.author && !/User:|Benutzer:/.test(p.author), id);
    const h = createHash("md5").update(p.file).digest("hex");
    assert.equal(p.path, `${h[0]}/${h.slice(0, 2)}`, id);
  }
});

test("bait photos: a species' own wording finds the nearest stock bait's photo", () => {
  assert.equal(baitPhotoFor({ id: null, name: "Weedless soft plastic, 5–7in" }), BAIT_PHOTOS.lures);
  assert.equal(baitPhotoFor({ id: null, name: "Hermit crab" }), BAIT_PHOTOS["peeler-crab"]);
  assert.equal(baitPhotoFor({ id: null, name: "Dry flies, nymphs and wet flies" }), BAIT_PHOTOS.flies);
  assert.equal(baitPhotoFor({ id: "squid", name: "Whole squid" }), BAIT_PHOTOS.squid);
  assert.equal(baitPhotoFor({ id: null, name: "Beads, sequins or a small spoon above the bait" }), null, "no photo rather than a wrong one");
  assert.equal(baitPhotoFor({ id: "casters", name: "Casters" }), null);
});
