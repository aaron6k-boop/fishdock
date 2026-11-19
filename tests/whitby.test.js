// Whitby's piers (18 November 2026): the anglers on the East Pier's seaward side, facing out to sea (casting into the
// harbour entrance between the piers is banned), the timber extensions drawn open on their frames, the stone piers'
// decks at their height, the lighthouses, beacons, Abbey and church built from their own builders. The map data is a
// cut of OpenStreetMap's answer round the mark (tests/fixtures/osm-whitby.json, fetched 18 November 2026, the town's
// buildings more than 300 m from the mark left out but St Mary's; map data © OpenStreetMap contributors, ODbL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace, inside } from "../src/lib/world3d/osmPlace.js";
import { localFor } from "../src/lib/world3d/localDetail.js";
import { spotById } from "../src/data/spots.js";
import { venueOf } from "../src/lib/scene.js";
import { LANDMARK_BUILDERS } from "../src/lib/world3d/landmarks3d.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-whitby.json", import.meta.url), "utf8"));
const spot = spotById("whitby-piers");
const place = buildPlace(osm, spot.lat, spot.lon, venueOf(spot), { id: spot.id });
const L = localFor(spot.id);

test("Whitby opens on the East Pier, four anglers along its seaward side facing out to sea, not into the harbour entrance", () => {
  assert.equal(venueOf(spot), "pier");
  assert.equal(place.spots.length, 4);
  assert.ok(place.check.ok, place.check.why.join("; "));
  const east = place.piers.find((p) => p.ring && p.h === 5 && inside([45, -32], p.ring));
  assert.ok(east, "the East Pier's outline");
  for (const s of place.spots) {
    assert.ok(inside([s.at[0], s.at[2]], east.ring), `${s.name} on the East Pier`);
    assert.equal(s.at[1], 5);
    const f = ((s.face * 180) / Math.PI + 360) % 360;
    assert.ok(f > 20 && f < 90, `${s.name} faces ${f}: out to sea, north-east`);
  }
});

test("the extensions are open timber decks on their frames; the stone piers are solid, their decks 5 m up", () => {
  const open = place.piers.filter((p) => p.open);
  assert.deepEqual(open.map((p) => p.id).sort(), [162295173, 288861504]);
  for (const p of open) { assert.equal(p.kind, "breakwater"); assert.equal(p.style, "trestle"); assert.equal(p.h, 4.8); }
  assert.equal(place.piers.filter((p) => p.ring && !p.open && p.h === 5).length, 2);
  // no railing along the East Pier's seaward edge, where the anglers stand (the photographs); railings elsewhere
  for (const s of place.spots) assert.equal(L.fence(s.at[0], s.at[2]), "none", s.name);
  assert.equal(L.fence(9.7, -43.5), "rail"); // (its harbour side)
  assert.equal(L.fence(-163.1, -32.5), "rail"); // (the West Pier)
  // (an open breakwater only when it's named: elsewhere breakwaters stay solid, and an id given as one number still works)
  const cromer = localFor("cromer-pier").pier;
  assert.equal(typeof cromer.id, "number");
});

test("its lighthouses, beacons, Abbey and church each have their builder, and stand where the map puts them", () => {
  for (const ex of L.extras) assert.ok(LANDMARK_BUILDERS[ex.kind], ex.kind);
  for (const k of Object.values(L.landmarks)) assert.ok(LANDMARK_BUILDERS[k], k);
  const kinds = L.extras.map((e) => e.kind), onPier = (at, h) => place.piers.some((p) => p.ring && p.h === h && inside(at, p.ring));
  assert.deepEqual(kinds.sort(), ["eastPierLight", "footbridge", "footbridge", "lampRow", "pierBeacon", "pierBeacon", "westPierLight", "whitbyAbbey"]);
  // the footbridges from the stone piers' heads to the extensions, walked over: each end on a pier's deck
  // (the map's bridge ends on the piers' edges; the walk runs 60 cm on to each deck)
  for (const ex of L.extras.filter((e) => e.kind === "footbridge")) {
    const d = Math.hypot(ex.b[0] - ex.a[0], ex.b[1] - ex.a[1]), u = [(ex.b[0] - ex.a[0]) / d, (ex.b[1] - ex.a[1]) / d], a = [ex.a[0] - u[0] * 0.6, ex.a[1] - u[1] * 0.6], b = [ex.b[0] + u[0] * 0.6, ex.b[1] + u[1] * 0.6];
    assert.ok(ex.walk); assert.ok(onPier(a, 5), "a footbridge's end on a stone pier"); assert.ok(place.piers.some((p) => p.open && inside(b, p.ring)), "and its other end on an extension");
  }
  // the beacons on the extensions' decks, green on the west, red on the east; the lights on the stone pier heads
  for (const ex of L.extras.filter((e) => e.kind === "pierBeacon")) assert.ok(onPier(ex.at, 4.8), `${ex.colour} beacon on an extension`);
  assert.deepEqual(L.extras.filter((e) => e.kind === "pierBeacon").map((e) => e.colour).sort(), ["green", "red"]);
  for (const ex of L.extras.filter((e) => /PierLight$/.test(e.kind))) assert.ok(onPier(ex.at, 5), `${ex.kind} on a stone pier head`);
  assert.ok(place.buildings.some((b) => b.id === 158276579), "St Mary's outline in the map data");
});

// (19 November 2026) the cliffs' survey heights in centimetres every 5 m, joined smoothly: at 8 m in half-metre steps the
// slopes came out terraced, half-metre ledges showing as stripes along the contours under a low sun
test("Whitby's cliffs: the Abbey's headland at its surveyed height, and the slopes smooth, not stepped", async () => {
  const { terrainHill } = await import("../src/lib/world3d/terrain3d.js");
  const hill = terrainHill(L.terrain);
  const abbey = hill(233, 308);
  assert.ok(abbey > 48 && abbey < 60, `the Abbey's ground ${abbey.toFixed(1)} m above the harbour's land`);
  assert.equal(hill(-150, 100), 0, "the harbour's low ground stays at the land's usual level");
  // along three lines over the East Cliff, a metre at a time: the slope changes gradually from one metre to the next (on
  // the old grid it bent sharply at every survey point, 0.41 m a metre at worst along these lines; a terrace shows so)
  let worstBend = 0, steepest = 0;
  for (const [x0, z0, dx, dz] of [[150, 120, 0.5, 1], [180, 260, 1, 0.2], [100, 300, 1, 0]]) {
    let prev = null, prevSlope = null;
    for (let t = 0; t <= 160; t++) {
      const h = hill(x0 + t * dx, z0 + t * dz);
      if (prev !== null) { const s = h - prev; steepest = Math.max(steepest, Math.abs(s)); if (prevSlope !== null) worstBend = Math.max(worstBend, Math.abs(s - prevSlope)); prevSlope = s; }
      prev = h;
    }
  }
  assert.ok(steepest > 0.3, "the lines do cross the cliff's slopes");
  assert.ok(worstBend < 0.25, `the slope changes by at most ${worstBend.toFixed(2)} m a metre from one metre to the next`);
});
