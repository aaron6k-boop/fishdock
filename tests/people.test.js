// How anglers look in the 3D view (src/lib/world3d/people.js): a chosen look is kept only if it's valid; everyone
// else gets a steady look from their id.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanLook, lookFor, LOOK_KEYS, SKINS, HAIRS } from "../src/lib/world3d/people.js";

test("a chosen look: whole numbers in range or nothing", () => {
  assert.deepEqual(cleanLook({ skin: 1, hair: 2, hat: 3, beard: 0, build: 1, x: 9 }), { skin: 1, hair: 2, hat: 3, beard: 0, build: 1 });
  assert.equal(cleanLook({ skin: 6, hair: 0, hat: 0, beard: 0, build: 0 }), null);
  assert.equal(cleanLook({ skin: 1.5, hair: 0, hat: 0, beard: 0, build: 0 }), null);
  assert.equal(cleanLook({ skin: 1 }), null);
  assert.equal(cleanLook("hat"), null);
  assert.equal(cleanLook(null), null);
});

test("the look drawn: the chosen one, or a steady one from the id, with a believable height", () => {
  const a = lookFor("abc123"), b = lookFor("abc123"), c = lookFor("zzz999");
  assert.deepEqual(a, b, "the same person looks the same every time");
  assert.equal(a.chosen, false);
  const mine = lookFor("abc123", { skin: 5, hair: 1, hat: 3, beard: 2, build: 0 });
  assert.equal(mine.chosen, true); assert.equal(mine.skin, 5); assert.equal(mine.skinHex, SKINS[5].hex); assert.equal(mine.hairHex, HAIRS[1].hex);
  for (let i = 0; i < 300; i++) {
    const l = lookFor(`person-${i}`);
    for (const [k, n] of Object.entries(LOOK_KEYS)) assert.ok(Number.isInteger(l[k]) && l[k] >= 0 && l[k] < n, `${k} ${l[k]}`);
    assert.ok(l.height >= 1.68 && l.height <= 1.86);
  }
  const hats = new Set(Array.from({ length: 60 }, (_, i) => lookFor(`p${i}`).hat));
  assert.ok(hats.size >= 3, "people vary");
  assert.notDeepEqual([a.skin, a.hair, a.hat, a.build, a.height], [c.skin, c.hair, c.hat, c.build, c.height]);
});
