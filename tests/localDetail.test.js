import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCAL, localFor } from "../src/lib/world3d/localDetail.js";
import { spotById } from "../src/data/spots.js";

test("local detail: only for documented marks, and nothing for others", () => {
  for (const id of Object.keys(LOCAL)) assert.ok(spotById(id), `${id} is a documented mark`);
  assert.equal(localFor("no-such-mark"), null);
  assert.equal(localFor(undefined), null);
});

test("local detail: the note says it's from photographs, in plain UK English with no em dashes", () => {
  for (const L of Object.values(LOCAL)) {
    assert.match(L.note, /photograph/);
    assert.ok(!/—/.test(L.note));
  }
});

test("Gorleston: river-side railings, timber along the sea side, bars round the pier head", () => {
  const G = localFor("gorleston-south-pier");
  assert.equal(G.fence(-60, -4, 0.2, -0.98), "rail"); // the arm's river side, facing north
  assert.equal(G.fence(-40, 12, -0.1, 0.99), "timber"); // the arm's sea side, facing south
  assert.equal(G.fence(14, 24, 0.5, 0.86), "bars"); // round the head
  assert.equal(G.fence(4, -8, 0.3, -0.95), "rail"); // the anglers' edge by the lighthouse keeps the open railings
  assert.equal(G.landmarks[223803033], "gorlestonLighthouse");
  // the dune is across the harbour mouth only, never on the pier
  assert.equal(G.dunes(0, -100), true);
  assert.equal(G.dunes(0, 0), false);
});
