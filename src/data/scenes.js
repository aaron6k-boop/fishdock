// ---- scenes: which documented marks have had their 3D place checked, and what the check found ----
// Each mark's 3D place is built on the phone from OpenStreetMap (GET /api/place, src/lib/world3d/osmPlace.js) and
// only used when it passes the layout check (checkLayout: four fishing positions near the mark, on dry ground, open
// water ahead, nothing built in the way) and the scene check in the browser (sceneCheck.js). These records are that
// check run ahead of time on the saved OpenStreetMap answer for each mark (the layout check in Node, then the whole 3D
// view in Chromium at a phone's size: the scene check and the arrival check, spawn.js), so the map can say what to
// expect before anyone arrives. The place is still checked again on the phone every time (map data changes): a mark recorded as
// passing that fails on the day gets the representative scene, labelled as such.
//
// result: "passed" | "failed". approx: the position the 3D view used is the mark's listed approximate one (none checked
// on the server, server/place3d.js EXTRA_MARKS), so the anglers may stand on the nearest bank up to 400 m away.
// points: the four checked positions in the order the 3D view uses (nearest the mark first), with the way each faces in compass degrees (0 north, 90 east). Positions themselves are not stored: they come from
// the map data on the day. Map data © OpenStreetMap contributors (ODbL).

const OSM = "https://www.openstreetmap.org/";
const SAVED = "2026-11-02"; // when the OpenStreetMap answers were saved (the /api/place response date)
const C = "2026-11-04";     // when the checks below were run on them
const P = (name, face) => ({ name, face });
const pier = (a, b, c, d) => [P("On the pier", a), P("Along the pier", b), P("Further along the pier", c), P("Along the other way", d)];
const bank = (a, b, c, d) => [P("Along the bank, left", a), P("Along the bank, right", b), P("Further along, left", c), P("Further along, right", d)];
const passed = (venue, points, extra = {}) => ({ result: "passed", venue, points, approx: false, ...extra, data: SAVED, checked: C, sources: [OSM], verification: "verified" });
const failed = (venue, why) => ({ result: "failed", venue, why, points: [], approx: false, data: SAVED, checked: C, sources: [OSM], verification: "verified" });

export const SCENE_CHECKS = {
  "gorleston-south-pier": passed("pier", pier(23, 47, 74, 108)),
  "cromer-pier": passed("pier", pier(285, 285, 285, 287)),
  "deal-pier": passed("pier", pier(359, 359, 359, 359)),
  "southend-pier": passed("pier", pier(258, 258, 258, 257)),
  "whitby-piers": passed("pier", pier(232, 232, 232, 232)),
  "brixham-breakwater": passed("pier", pier(44, 46, 39, 52)),
  // (listed positions approximate: the layout passed, but the 3D view treats the mark as approximate, so not "exact")
  "st-ives-the-island": passed("pier", pier(45, 19, 67, 38), { approx: true }),
  "mumbles-head": passed("pier", pier(333, 333, 333, 268)),
  "river-wye-ross": passed("river", bank(328, 328, 328, 319), { approx: true }),
  // listed position approximate: the layout passes on the nearest bank, about 300 m from the listed point
  "rutland-water": passed("lake", bank(196, 150, 196, 150), { approx: true }),
  // no four fishing positions with open water ahead could be found in the map data round the listed point
  "chesil-beach-ferry-bridge": failed("beach", "no fishing positions found near the mark"),
  "loch-ryan-leffnol": failed("beach", "no fishing positions found near the mark"),
  "lough-erne-enniskillen": failed("lake", "no fishing positions found near the mark"),
  // the layout passed, but the scene check in the browser didn't: the 3D view shows the drawn place
  "holyhead-breakwater": failed("pier", "a fishing position isn't on the breakwater's deck as drawn"),
  "royalty-fishery-avon": failed("river", "the view of the water is blocked by the bank from most positions"),
};

export const sceneCheckFor = (id) => SCENE_CHECKS[id] || null;
