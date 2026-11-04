// The catch card over your landed fish (src/lib/catchInfo.js): small at first, but the minimum size and every rule or
// safety sentence stay in view; the rest waits under "More about this fish"
import { test } from "node:test";
import assert from "node:assert/strict";
import { catchInfo, sentences } from "../src/lib/catchInfo.js";
import { SPECIES } from "../src/data/species.js";

const byId = (id) => SPECIES.find((s) => s.id === id);

test("sentences: split on full stops, never inside a date or a latitude", () => {
  assert.deepEqual(sentences("Closed on rivers from 15 March to 15 June."), ["Closed on rivers from 15 March to 15 June."]);
  assert.deepEqual(sentences("One. Two (three). Four."), ["One.", "Two (three).", "Four."]);
  assert.deepEqual(sentences(null), []);
});

test("cod: the minimum size is shown at once, the advice is folded away", () => {
  const c = catchInfo(byId("cod"));
  assert.equal(c.must[0].kind, "size"); assert.match(c.must[0].text, /35 cm/); assert.ok(c.must[0].source);
  assert.ok(c.hasMore); assert.match(c.more.idTip, /barbel/); assert.match(c.more.note, /60 cm/);
});

test("rules and safety sentences are never folded away", () => {
  assert.ok(catchInfo(byId("bass")).must.some((m) => /cannot be sold/.test(m.text)));
  const tope = SPECIES.find((s) => /may not be landed/.test(s.conservation || ""));
  assert.ok(tope && catchInfo(tope).must.some((m) => m.kind === "rule" && /may not be landed/.test(m.text)));
  const spines = SPECIES.find((s) => /sharp spines/.test(s.conservation || ""));
  assert.ok(spines && catchInfo(spines).must.some((m) => m.kind === "safety"));
});

test("every species: nothing of the note is lost, and the wording is the data's own", () => {
  for (const sp of SPECIES) {
    const c = catchInfo(sp), shown = c.must.filter((m) => m.kind !== "size").map((m) => m.text).join(" ") + " " + (c.more.note || "");
    for (const s of sentences(sp.conservation)) assert.ok(shown.includes(s), `${sp.id}: lost "${s}"`);
    if (sp.minSize?.cm) assert.equal(c.must[0].kind, "size", sp.id);
    // a sentence saying what you must or may not do is always in view
    for (const s of sentences(sp.conservation)) if (/\bmust\b|may not|cannot/i.test(s)) assert.ok(c.must.some((m) => m.text === s), `${sp.id}: "${s}" folded away`);
  }
});

test("no species: an empty card, nothing to expand", () => {
  const c = catchInfo(null); assert.deepEqual(c.must, []); assert.equal(c.hasMore, false);
});
