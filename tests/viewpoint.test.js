// Choosing a nearby photo for the Live Fishing View: where it was taken from (src/lib/viewpoint.js) and whether the
// picture suits a rod held at the water's edge (judgeView and levelling in src/lib/scene.js).
import test from "node:test";
import assert from "node:assert/strict";
import { viewpointFromWords, suitsVenue, VIEWPOINTS } from "../src/lib/viewpoint.js";
import { judgeView, levelling, venueOf } from "../src/lib/scene.js";

test("a photo's words say where it was taken from", () => {
  assert.deepEqual(viewpointFromWords("Whitby from Cliff near East Pier, Yorkshire"), { kind: "pier", elevated: true, level: false });
  assert.equal(viewpointFromWords("Whitby harbour from the 199 steps").elevated, true);
  assert.equal(viewpointFromWords("Aerial view of Brixham").elevated, true);
  assert.equal(viewpointFromWords("View over Whitby harbour").elevated, true);
  assert.deepEqual(viewpointFromWords("Gorleston-on-Sea, North Pier from South Pier"), { kind: "pier", elevated: false, level: false });
  assert.equal(viewpointFromWords("Fishing off the pier at Gorleston").level, true);
  // said to be from the pier: not counted as high up even if the words also mention a view over the harbour
  assert.equal(viewpointFromWords("View over the harbour from the pier").elevated, false);
  assert.equal(viewpointFromWords("Cromer seen from the ferry").kind, "boat");
  assert.equal(viewpointFromWords("Beach in Whitby harbour").kind, "harbour");
  assert.equal(viewpointFromWords("Chesil Beach at dusk").kind, "beach");
  assert.equal(viewpointFromWords("River Wye at Ross").kind, "riverbank");
  assert.equal(viewpointFromWords("Rutland Water reservoir").kind, "lake");
  assert.equal(viewpointFromWords("Sunset").kind, null);
  for (const k of ["pier", "beach", "harbour", "riverbank", "lake", "boat"]) assert.ok(VIEWPOINTS[k]);
});

test("viewpoints that suit each kind of place", () => {
  assert.equal(suitsVenue("harbour", "pier"), true);
  assert.equal(suitsVenue("beach", "pier"), false);
  assert.equal(suitsVenue("riverbank", "river"), true);
  assert.equal(suitsVenue("lake", "lake"), true);
  assert.equal(suitsVenue(null, "lake"), null);
  assert.equal(venueOf({ kind: "sea", name: "Chesil Beach (Ferry Bridge)" }), "beach");
  assert.equal(venueOf({ kind: "sea", name: "Whitby Piers" }), "pier");
});

// measurements of real photos near Whitby and Gorleston (viewFeatures on Wikimedia Commons thumbnails)
const OPEN_PIER = { hz: 0.5, tilt: 0, water: 0.91, mid: 0.96, foot: 0.96, sand: 0, lum: 150 }; // Gorleston, North Pier from South Pier
const HARBOUR_MOUTH = { hz: 0.533, tilt: 3.1, water: 0.68, mid: 0.71, foot: 0.71, sand: 0, lum: 140 }; // Whitby, entrance to the harbour
const TOWN_FROM_ABOVE = { hz: 0.273, tilt: 1.6, water: 0.57, mid: 0.78, foot: 0.13, sand: 0, lum: 120 }; // Whitby, the town over the harbour
const LOOKING_DOWN = { hz: 0.15, tilt: 0.8, water: 0.78, mid: 0.93, foot: 0.21, sand: 0, lum: 130 }; // Whitby piers from the cliff
const FIELD = { hz: 0.367, tilt: 5.5, water: 0.71, mid: 0.63, foot: 0.92, sand: 0, lum: 170 }; // an icy cricket pitch, Ross-on-Wye

test("a level view of open water suits the rod; a town seen from above, a view looking down and a tilted field don't", () => {
  const open = judgeView(OPEN_PIER, { kind: "pier", venue: "pier" });
  assert.equal(open.ok, true); assert.ok(open.fit > 0.9, `${open.fit}`); assert.deepEqual(open.problems, []);
  const mouth = judgeView(HARBOUR_MOUTH, { kind: "harbour", venue: "pier" });
  assert.equal(mouth.ok, true, JSON.stringify(mouth));
  const town = judgeView(TOWN_FROM_ABOVE, { kind: "harbour", venue: "pier" });
  assert.equal(town.ok, false); assert.ok(town.problems.includes("Foreground blocked"));
  assert.ok(mouth.fit > town.fit + 0.2, `${mouth.fit} vs ${town.fit}`);
  const down = judgeView(LOOKING_DOWN, { kind: "pier", venue: "pier" });
  assert.equal(down.ok, false); assert.ok(down.problems.includes("Looks down from high up"));
  assert.equal(judgeView(FIELD, { venue: "river" }).ok, false);
  // words saying it was taken from high up rule a photo out, however watery it looks
  const said = judgeView(OPEN_PIER, { elevated: true, venue: "pier" });
  assert.equal(said.ok, false); assert.ok(said.problems.includes("Taken from high up"));
  // a beach angler stands on the sand, so a sandy foreground isn't a blocked one there
  const beach = { hz: 0.45, tilt: 0, water: 0.6, mid: 0.85, foot: 0.1, sand: 0.8, lum: 160 };
  assert.ok(judgeView(beach, { venue: "beach" }).fit > judgeView(beach, { venue: "pier" }).fit);
  assert.equal(judgeView({ ...OPEN_PIER, lum: 20 }, {}).problems.includes("Too dark"), true);
});

test("a slightly tilted horizon is levelled, with enough zoom to keep the corners filled; a badly tilted one is left", () => {
  assert.deepEqual(levelling(0.8), { rot: 0, zoom: 1 }, "within what the small copy can measure");
  const l = levelling(3);
  assert.equal(l.rot, -3); assert.ok(l.zoom > 1.05 && l.zoom < 1.12, `${l.zoom}`);
  assert.equal(levelling(-2).rot, 2);
  assert.deepEqual(levelling(7), { rot: 0, zoom: 1 });
});
