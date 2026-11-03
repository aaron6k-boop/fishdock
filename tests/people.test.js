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

test("the realistic people: a person and their kit are kept when valid, dropped when not, and older looks still work", async () => {
  const { PEOPLE, COATS, LEGS, FOOTWEAR, KIT_KEYS, withPerson } = await import("../src/lib/world3d/people.js");
  const base = { skin: 1, hair: 2, hat: 0, beard: 0, build: 1 };
  assert.deepEqual(cleanLook({ ...base, person: 3, coat: 2, legs: 1, boots: 1, life: 1, gloves: 0 }), { ...base, person: 3, coat: 2, legs: 1, boots: 1, life: 1, gloves: 0 });
  assert.deepEqual(cleanLook({ ...base, person: 99, coat: -1, legs: 1.5, boots: "x", life: 1 }), { ...base, life: 1 }, "bad kit is dropped, not the whole look");
  assert.deepEqual(cleanLook(base), base, "a look from an older copy of the app");
  // everyone gets a person and kit: their own, or steady from their id
  for (let i = 0; i < 200; i++) {
    const l = lookFor(`p-${i}`);
    for (const [k, n] of Object.entries(KIT_KEYS)) assert.ok(Number.isInteger(l[k]) && l[k] >= 0 && l[k] < n, `${k} ${l[k]}`);
    assert.equal(l.file, PEOPLE[l.person].file); assert.ok(l.sex === "m" || l.sex === "f");
    assert.equal(l.life, 0); assert.equal(l.gloves, 0);
  }
  assert.deepEqual(lookFor("x", { ...base, person: 9 }).person, 9);
  assert.equal(lookFor("x", { ...base, person: 9 }).file, PEOPLE[9].file);
  assert.ok(new Set(Array.from({ length: 80 }, (_, i) => lookFor(`q${i}`).person)).size >= 6, "people vary");
  // men and women of different skin tones; every person has a file, a portrait name and a stand-in look
  assert.ok(PEOPLE.some((p) => p.sex === "f") && PEOPLE.some((p) => p.sex === "m"));
  assert.ok(new Set(PEOPLE.map((p) => p.skin)).size >= 4);
  for (const p of PEOPLE) { assert.ok(/^[a-z0-9]+$/.test(p.file)); assert.ok(p.hem > 0.4 && p.hem < 0.6); assert.ok(p.name && !p.name.includes("—")); }
  const w = withPerson({ ...base, person: 0 }, 3); assert.equal(w.person, 3); assert.equal(w.skin, PEOPLE[3].skin);
  assert.equal(COATS[0].hex, null); assert.equal(LEGS[0].hex, null); assert.equal(FOOTWEAR[0].hex, null);
});

test("every person's model, portrait and the shared movements are in public/people, with the licence credited", async () => {
  const { PEOPLE } = await import("../src/lib/world3d/people.js");
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  const dir = new URL("../public/people/", import.meta.url);
  const credits = readFileSync(new URL("CREDITS.txt", dir), "utf8");
  assert.ok(/MIT License/.test(credits) && /Copyright \(c\) 2020 Microsoft/.test(credits));
  for (const p of [...PEOPLE.map((x) => x.file), "anims"]) {
    const f = new URL(`${p}.glb`, dir); assert.ok(existsSync(f), p); const n = statSync(f).size; assert.ok(n > 100000 && n < 1600000, `${p} ${n} bytes`);
    assert.equal(readFileSync(f).subarray(0, 4).toString(), "glTF");
    if (p !== "anims") { assert.ok(existsSync(new URL(`${p}.webp`, dir)), `${p} portrait`); assert.ok(credits.includes(`${p}.glb`), `${p} credited`); }
  }
});
