// Lowestoft's South Pier (18 November 2026): anglers on both sides of its outer half, its concrete parapets in place of
// railings, its light towers, the scene check looking over a parapet. The map data is a cut of OpenStreetMap's answer
// round the mark (tests/fixtures/osm-lowestoft.json, fetched 18 November 2026, the town's buildings more than 300 m from
// the mark left out; map data © OpenStreetMap contributors, ODbL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace } from "../src/lib/world3d/osmPlace.js";
import { localFor } from "../src/lib/world3d/localDetail.js";
import { spotById } from "../src/data/spots.js";
import { venueOf } from "../src/lib/scene.js";
import { LANDMARK_BUILDERS } from "../src/lib/world3d/landmarks3d.js";
import { LANDMARKS } from "../src/lib/world3d/skyline.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-lowestoft.json", import.meta.url), "utf8"));
const spot = spotById("lowestoft-south-pier");
const place = buildPlace(osm, spot.lat, spot.lon, venueOf(spot), { id: spot.id });
const L = localFor(spot.id);

test("Lowestoft's South Pier opens as a pier, two anglers on its harbour side and two on its sea side", () => {
  assert.equal(venueOf(spot), "pier");
  assert.equal(place.spots.length, 4);
  assert.ok(place.check.ok, place.check.why.join("; "));
  const faces = place.spots.map((s) => ((s.face * 180) / Math.PI + 360) % 360);
  assert.equal(faces.filter((f) => f < 40 || f > 320).length, 2, `north: ${faces}`);
  assert.equal(faces.filter((f) => f > 140 && f < 220).length, 2, `south: ${faces}`);
});

test("its sides are concrete with a solid parapet, not railings; its lights stand on the pier heads", () => {
  const c = L.concrete(0, 0);
  assert.ok(c.h >= 1 && c.h <= 1.3 && c.t > 0.3);
  assert.equal(L.fence(0, 0, 0, -1), "none");
  for (const k of Object.values(L.landmarks)) assert.ok(LANDMARK_BUILDERS[k], k);
  assert.equal(L.extras.length, 2);
  for (const ex of L.extras) assert.ok(LANDMARK_BUILDERS[ex.kind], ex.kind);
  // (only the North Pier's light is lit: the South Pier's is listed as discontinued)
  assert.deepEqual(L.extras.map((e) => e.lit || null), [null, "green"]);
});

test("Gulliver, Ness Point's turbine, is on the skyline at its published height", () => {
  const g = LANDMARKS.find((l) => l.id === "gulliver");
  assert.ok(g && g.n === 1);
  assert.equal(g.hub + g.rotor / 2, 126);
});
