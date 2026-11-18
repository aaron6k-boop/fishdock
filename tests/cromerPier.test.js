// Cromer Pier (18 November 2026): its pier open on iron legs, its anglers either side of the main arm, its deck's
// heights. The map data is a cut of OpenStreetMap's answer round the mark (tests/fixtures/osm-cromer.json, saved
// 2 November 2026; map data © OpenStreetMap contributors, ODbL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace } from "../src/lib/world3d/osmPlace.js";
import { localFor, cromerHill } from "../src/lib/world3d/localDetail.js";
import { deckHeight, clipHalf } from "../src/lib/world3d/pierDeck.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-cromer.json", import.meta.url), "utf8"));
const place = buildPlace(osm, 52.9343, 1.3016, "pier", { id: "cromer-pier" });
const L = localFor("cromer-pier");

test("Cromer's pier is open on iron legs, the others' piers as they were", () => {
  const open = place.piers.filter((p) => p.open);
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 29146061);
  // the same data without the mark's local detail: a solid pier, as before
  const plain = buildPlace(osm, 52.9343, 1.3016, "pier", {});
  assert.equal(plain.piers.filter((p) => p.open).length, 0);
});

test("four anglers on Cromer's pier, two either side of the main arm, all passing the layout check", () => {
  assert.equal(place.spots.length, 4);
  assert.ok(place.check.ok, place.check.why.join("; "));
  const faces = place.spots.map((s) => ((s.face * 180) / Math.PI + 360) % 360);
  assert.equal(faces.filter((f) => f > 250 && f < 320).length, 2, `west: ${faces}`);
  assert.equal(faces.filter((f) => f > 70 && f < 140).length, 2, `east: ${faces}`);
  for (const s of place.spots) {
    assert.ok(!L.pier.noFish(s.at[0], s.at[2]), `${s.name} where anglers don't fish`);
    assert.ok(!L.pier.slip(s.at[0], s.at[2]), `${s.name} on the slipway`);
  }
});

test("the deck slopes down to the promenade at its root and the slipway into the sea; level between", () => {
  const p = place.piers.find((q) => q.open), land = 2.2;
  const ramps = L.pier.ramps.map((r) => ({ a: r.a, b: r.b, ya: r.ya === "land" ? land : r.ya === "under" ? -2.2 : r.ya, yb: r.yb === "deck" ? p.h : r.yb }));
  const y = deckHeight(p.h, ramps);
  assert.equal(y(-27, 80), p.h); // (the main arm, where the anglers stand)
  assert.equal(y(-46, 170), land); // (at the root, the promenade's level)
  const mid = y(-43, 157); assert.ok(mid > land && mid < p.h, `half way up the root's ramp: ${mid}`);
  assert.ok(y(14, -43) < 0, "the slipway's foot under the water");
  // never steeper than about 1 in 4 anywhere along either ramp
  for (const r of ramps) { const run = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); assert.ok(Math.abs(r.yb - r.ya) / run < 0.27, `ramp from ${r.a} to ${r.b}`); }
});

test("an outline cut by a line keeps its area on each side", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]], area = (q) => Math.abs(q.reduce((s, p, i) => { const r = q[(i + 1) % q.length]; return s + p[0] * r[1] - r[0] * p[1]; }, 0)) / 2;
  const a = clipHalf(sq, [4, 0], [1, 0]), b = clipHalf(sq, [4, 0], [-1, 0]);
  assert.equal(area(a), 60); assert.equal(area(b), 40);
});

test("the cliff behind Cromer's promenade: level at its foot, about 12 m up behind it", () => {
  assert.equal(cromerHill(-60, 150), 0);
  assert.equal(cromerHill(-60, 240), 12);
  assert.ok(cromerHill(-60, 205) > 0 && cromerHill(-60, 205) < 12);
});
