// GET /api/water: what kind of water is at a tapped point (OpenStreetMap via Overpass), and the pure classifier.
// The element shapes follow Overpass JSON output (areas from is_in come back as type "area" with tags; ways with
// `out tags` carry only type, id and tags). Written from the Overpass documentation, not captured live.
import test from "node:test";
import assert from "node:assert/strict";
import { handleWater, classifyWater, overpassQuery, OVERPASS_URL } from "../server/water.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

const area = (tags) => ({ type: "area", id: 3600000000 + Math.floor(Math.random() * 1e6), tags });
const way = (tags) => ({ type: "way", id: Math.floor(Math.random() * 1e9), tags });
const coastline = way({ natural: "coastline" });

test("water: inside a lake, reservoir, canal or fishery", () => {
  assert.deepEqual(classifyWater([area({ natural: "water", water: "lake", name: "Llyn Brenig" })]), { kind: "lake", subtype: "lake", name: "Llyn Brenig", sure: "high" });
  assert.deepEqual(classifyWater([area({ natural: "water", water: "reservoir", name: "Grafham Water" })]), { kind: "lake", subtype: "reservoir", name: "Grafham Water", sure: "high" });
  assert.deepEqual(classifyWater([area({ landuse: "reservoir" })]), { kind: "lake", subtype: "reservoir", name: null, sure: "high" });
  assert.deepEqual(classifyWater([area({ natural: "water", water: "canal", name: "Grand Union Canal" })]), { kind: "canal", subtype: "canal", name: "Grand Union Canal", sure: "high" });
  assert.deepEqual(classifyWater([area({ leisure: "fishing", name: "Bluebell Lakes" }), area({ natural: "water", water: "lake" })]).kind, "fishery");
  assert.deepEqual(classifyWater([area({ natural: "water", water: "pond" })]).subtype, "lake");
});

test("water: a wide river is a river inland and an estuary near the coast", () => {
  const river = area({ natural: "water", water: "river", name: "River Trent" });
  assert.deepEqual(classifyWater([river]), { kind: "river", subtype: "river", name: "River Trent", sure: "high" });
  assert.deepEqual(classifyWater([area({ natural: "water", water: "river", name: "River Yare" }), coastline]), { kind: "sea", subtype: "estuary", name: "River Yare", sure: "medium" });
  // a polygon with no name takes the river line's name
  assert.equal(classifyWater([area({ natural: "water", water: "river" }), way({ waterway: "river", name: "River Severn" })]).name, "River Severn");
});

test("water: river and canal lines nearby", () => {
  assert.deepEqual(classifyWater([way({ waterway: "river", name: "River Wye" })]), { kind: "river", subtype: "river", name: "River Wye", sure: "high" });
  assert.deepEqual(classifyWater([way({ waterway: "canal", name: "Leeds and Liverpool Canal" }), way({ waterway: "river", name: "River Aire" })]).kind, "canal");
  assert.equal(classifyWater([way({ waterway: "stream", name: "Mill Brook" })]).sure, "medium");
  assert.equal(classifyWater([way({ waterway: "river", name: "River Yare", tidal: "yes" })]).subtype, "estuary");
  // a named river beats an unnamed one
  assert.equal(classifyWater([way({ waterway: "river" }), way({ waterway: "river", name: "River Ouse" })]).name, "River Ouse");
});

test("water: the coast becomes pier, rocks or beach", () => {
  assert.deepEqual(classifyWater([coastline, way({ man_made: "pier", name: "Gorleston South Pier" })]), { kind: "sea", subtype: "pier", name: "Gorleston South Pier", sure: "medium" });
  assert.equal(classifyWater([coastline, way({ man_made: "breakwater" })]).subtype, "pier");
  assert.equal(classifyWater([coastline, way({ natural: "bare_rock" })]).subtype, "rocks");
  assert.equal(classifyWater([coastline, way({ natural: "beach" }), way({ natural: "cliff" })]).subtype, "beach");
  assert.deepEqual(classifyWater([coastline]), { kind: "sea", subtype: "beach", name: null, sure: "low" });
  assert.equal(classifyWater([coastline, area({ natural: "bay", name: "Wigtown Bay" })]).name, "Wigtown Bay");
  // offshore in a named bay, no coastline within range
  assert.deepEqual(classifyWater([area({ natural: "bay", name: "Cardigan Bay" })]), { kind: "sea", subtype: "beach", name: "Cardigan Bay", sure: "low" });
});

test("water: nothing nearby, and junk input", () => {
  assert.deepEqual(classifyWater([]), { kind: null, subtype: null, name: null, sure: "low" });
  assert.deepEqual(classifyWater(undefined), { kind: null, subtype: null, name: null, sure: "low" });
  assert.deepEqual(classifyWater([way({ highway: "residential" })]).kind, null);
  // names are cleaned (no angle brackets or dashes) and capped
  assert.equal(classifyWater([way({ waterway: "river", name: "River <b>Test</b> — lower" })]).name, "River b Test /b, lower");
});

test("water: the query asks about the point to 4 decimal places", () => {
  const q = overpassQuery(52.573049, 1.739012);
  assert.match(q, /is_in\(52\.5730,1\.7390\)/);
  assert.match(q, /around:90,52\.5730,1\.7390\)\["waterway"/);
  assert.match(q, /around:2500,52\.5730,1\.7390\)\["natural"="coastline"\]/);
  assert.doesNotMatch(q, /52\.573049/);
});

test("water: GET asks Overpass once and answers the classification with attribution", async (t) => {
  const s = setup();
  const net = stubFetch(t, [
    [(url) => url === OVERPASS_URL, (url, init) => {
      assert.equal(init.method, "POST");
      assert.match(String(init.body), /^data=/);
      assert.match(decodeURIComponent(String(init.body).slice(5)), /is_in\(52\.5730,1\.7390\)/);
      return { version: 0.6, elements: [coastline, way({ man_made: "pier", name: "Gorleston South Pier" })] };
    }],
  ]);
  const r = await s.call(handleWater, "/api/water")("GET", "?lat=52.57302&lon=1.73901");
  assert.equal(r.status, 200);
  assert.deepEqual({ kind: r.body.kind, subtype: r.body.subtype, name: r.body.name }, { kind: "sea", subtype: "pier", name: "Gorleston South Pier" });
  assert.equal(r.body.source, "openstreetmap");
  assert.match(r.body.attribution, /OpenStreetMap/);
  assert.equal(net.calls.length, 1);
  // nothing about the point is kept in the database
  const rows = await s.db.prepare("SELECT k FROM cache").all().catch(() => ({ results: [] }));
  assert.ok(!(rows.results || []).some((x) => /52\.57|water/.test(JSON.stringify(x))));
});

test("water: guard, method, area and upstream failures", async (t) => {
  const s = setup();
  stubFetch(t, [[(url) => url === OVERPASS_URL, () => new Response("busy", { status: 504 })]]);
  assert.equal((await s.call(handleWater, "/api/water")("GET", "?lat=52.57&lon=1.73", { fishdock: false })).status, 403);
  assert.equal((await s.call(handleWater, "/api/water")("POST", "?lat=52.57&lon=1.73")).status, 405);
  assert.equal((await s.call(handleWater, "/api/water")("GET", "?lat=40.4&lon=-3.7")).body.error, "out_of_area");
  assert.equal((await s.call(handleWater, "/api/water")("GET", "")).status, 400);
  const r = await s.call(handleWater, "/api/water")("GET", "?lat=52.57&lon=1.73");
  assert.equal(r.status, 502);
  assert.match(r.body.message, /Choose the water type yourself/);
});
