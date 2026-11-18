// Great Yarmouth's beach (18 November 2026): a beach mark, its anglers by the water's edge facing the sea, Britannia
// Pier open on its legs, and a mark's own type deciding its venue before its name. The map data is a cut of
// OpenStreetMap's answer round the mark (tests/fixtures/osm-yarmouth.json, fetched 18 November 2026, the town's
// buildings more than 300 m from the mark left out; map data © OpenStreetMap contributors, ODbL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace } from "../src/lib/world3d/osmPlace.js";
import { spotById } from "../src/data/spots.js";
import { venueOf } from "../src/lib/scene.js";
import { beachNearest, shoreDistances } from "../src/lib/world3d/shoreMap.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-yarmouth.json", import.meta.url), "utf8"));
const spot = spotById("great-yarmouth-beach");
const place = buildPlace(osm, spot.lat, spot.lon, "beach", { id: spot.id });

test("Great Yarmouth's beach opens as a beach, though its name has a pier in it", () => {
  assert.equal(venueOf(spot), "beach");
  // (and a mark's subtype decides over its name elsewhere too)
  assert.equal(venueOf({ kind: "sea", subtype: "beach", name: "Something Pier beach" }), "beach");
  assert.equal(venueOf({ kind: "sea", subtype: "rocks", name: "Rocky beach" }), "pier");
  assert.equal(venueOf({ kind: "sea", name: "Rossall Point" }), "pier"); // (no subtype: the name, as before)
});

test("four anglers on the sand by the water's edge, facing the sea to the east, passing the layout check", () => {
  assert.equal(place.spots.length, 4);
  assert.ok(place.check.ok, place.check.why.join("; "));
  for (const s of place.spots) {
    const face = ((s.face * 180) / Math.PI + 360) % 360;
    assert.ok(face > 60 && face < 130, `faces ${face}`);
    assert.ok(s.at[0] > 0 && s.at[0] < 40, `stands ${s.at[0]} m east of the mark`);
    assert.equal(s.name.startsWith("On the beach") || s.name.startsWith("Further along"), true);
  }
});

test("Britannia Pier is open on its legs, the beach and the sea under it", () => {
  const open = place.piers.filter((p) => p.open);
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 37588977);
});

test("the surf's map: water nearest a beach is marked as such, water nearest a wall isn't", () => {
  // a straight beach along x = 0 (land to the west), with a wall from z = 20 southwards
  const land = (x) => x < 0, beach = (x, z) => z < 20;
  const opt = { half: 40, n: 40 };
  const b = beachNearest(land, beach, opt), d = shoreDistances(land, { ...opt, cap: 40 });
  const at = (x, z) => { const i = Math.floor((x + 40) / 2), j = Math.floor((z + 40) / 2); return [b[j * 40 + i], d[j * 40 + i]]; };
  assert.equal(at(5, -20)[0], 255);
  assert.equal(at(5, 35)[0], 0);
  assert.ok(Math.abs(at(5, -20)[1] - 6) < 1.5);
});
