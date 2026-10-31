// ---- FishDock's own fish pictures: every one listed is a real species and ships in both sizes ----
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { ART_IDS, artUrl, artSrcSet, hasArt } from "../src/data/fishart.js";
import { SPECIES } from "../src/data/species.js";

test("fishart: each picture is a FishDock species, with a large and a small WebP", () => {
  for (const id of ART_IDS) {
    assert.ok(SPECIES.some((s) => s.id === id), `${id} is not a species`);
    for (const size of ["l", "s"]) {
      const file = new URL(`../public${artUrl(id, size)}`, import.meta.url);
      assert.ok(existsSync(file), `missing ${artUrl(id, size)}`);
      assert.equal(readFileSync(file).subarray(8, 12).toString(), "WEBP", `${artUrl(id, size)} is a WebP`);
    }
  }
  assert.equal(artSrcSet("perch"), "/fish/perch-s.webp 480w, /fish/perch.webp 1200w");
  assert.equal(hasArt("perch"), true);
  assert.equal(hasArt("gudgeon"), false);
});
