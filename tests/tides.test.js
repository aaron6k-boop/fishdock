// GET /api/tides: { source: null } without a key; the Admiralty UK Tidal API's stations and events when there is one.
//
// The samples below follow the shape the UK Tidal API returns (stations: a GeoJSON FeatureCollection with
// properties Id / Name and [lon, lat] coordinates; events: an array of { EventType, DateTime (GMT, no offset),
// IsApproximateTime, Height, IsApproximateHeight, Filtered, Date }). They were written from the documented shape,
// not captured live: UKHO couldn't be reached from where this was built (see docs/BACKEND.md).
import test from "node:test";
import assert from "node:assert/strict";
import { handleTides, parseStations, parseEvents, nearestStation } from "../server/tides.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

const STATIONS = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [1.316667, 51.116667] }, properties: { Id: "0089", Name: "DOVER", Country: "England", ContinuousHeightsAvailable: true } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-2.433333, 50.566667] }, properties: { Id: "0036", Name: "PORTLAND", Country: "England", ContinuousHeightsAvailable: true } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-4.185, 50.368333] }, properties: { Id: "0014", Name: "PLYMOUTH (DEVONPORT)", Country: "England", ContinuousHeightsAvailable: true } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-4.185] }, properties: { Id: "BROKEN", Name: "no latitude" } },
  ],
};
const EVENTS = [
  { EventType: "LowWater", DateTime: "2026-10-31T16:51:00", IsApproximateTime: false, Height: 0.7234, IsApproximateHeight: false, Filtered: false, Date: "2026-10-31T00:00:00" },
  { EventType: "HighWater", DateTime: "2026-10-31T10:39:00", IsApproximateTime: false, Height: 6.39, IsApproximateHeight: false, Filtered: false, Date: "2026-10-31T00:00:00" },
  { EventType: "HighWater", DateTime: "2026-10-31T23:02:00", IsApproximateTime: true, Height: 6.21, IsApproximateHeight: false, Filtered: false, Date: "2026-10-31T00:00:00" },
  { EventType: "Unknown", DateTime: "2026-11-01T05:00:00", Height: 1 },
  { EventType: "LowWater", DateTime: "not a date", Height: 1 },
];

test("no ADMIRALTY_API_KEY: { source: null } with a note, and nothing is fetched", async (t) => {
  const net = stubFetch(t, []);
  for (const db of [true, false]) {
    const s = setup({ db });
    const r = await s.call(handleTides, "/api/tides")("GET", "?lat=51.12&lon=1.31");
    assert.equal(r.status, 200);
    assert.equal(r.body.source, null);
    assert.match(r.body.note, /estimate/);
  }
  assert.equal(net.calls.length, 0);
});

test("parsing: stations from GeoJSON ([lon, lat]); events in time order, UK times, approximate flagged", () => {
  const st = parseStations(STATIONS);
  assert.equal(st.length, 3);
  assert.deepEqual(st[0], { id: "0089", name: "DOVER", lat: 51.116667, lon: 1.316667 });
  const near = nearestStation(st, 51.12, 1.31);
  assert.equal(near.id, "0089");
  assert.ok(near.distanceKm < 1);
  assert.equal(nearestStation(st, 53.4, -3.0), null); // nothing within 40 km
  const ev = parseEvents(EVENTS);
  assert.deepEqual(ev.map((e) => e.type), ["HighWater", "LowWater", "HighWater"]);
  assert.deepEqual(ev[0], { type: "HighWater", t: "2026-10-31T10:39:00+00:00", heightM: 6.39 });
  assert.equal(ev[1].heightM, 0.72);
  assert.equal(ev[2].approximate, true);
  // GMT times in summer are answered in BST.
  assert.equal(parseEvents([{ EventType: "HighWater", DateTime: "2026-07-01T10:00:00", Height: 5 }])[0].t, "2026-07-01T11:00:00+01:00");
});

test("with a key: nearest station within 40 km and 7 days of events; key only in the header, never answered", async (t) => {
  const s = setup({ env: { ADMIRALTY_API_KEY: "secret-ukho-key" } });
  const net = stubFetch(t, [
    [/\/uktidalapi\/api\/V1\/Stations$/, () => STATIONS],
    [/\/uktidalapi\/api\/V1\/Stations\/0089\/TidalEvents\?duration=7$/, () => EVENTS],
  ]);
  const r = await s.call(handleTides, "/api/tides")("GET", "?lat=51.13&lon=1.33");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "admiralty");
  assert.equal(r.body.station.id, "0089");
  assert.equal(r.body.station.name, "DOVER");
  assert.ok(r.body.station.distanceKm < 3);
  assert.equal(r.body.events.length, 3);
  assert.match(r.body.attribution, /ADMIRALTY/);
  assert.match(r.body.attribution, /Crown Copyright/);
  assert.doesNotMatch(r.text, /secret-ukho-key/);
  for (const c of net.calls) {
    assert.equal(c.headers.get("ocp-apim-subscription-key"), "secret-ukho-key");
    assert.doesNotMatch(c.url, /secret-ukho-key/);
  }
  // Discovery tier (the default): UKHO's terms don't allow caching, so the next lookup asks again.
  await s.call(handleTides, "/api/tides")("GET", "?lat=51.13&lon=1.33");
  assert.equal(net.calls.length, 4);
  const h = await s.db.prepare(`SELECT ok_count FROM source_health WHERE upstream = 'admiralty'`).first();
  assert.equal(h.ok_count, 4);
});

test("Foundation tier: station list kept a week, events 6 hours; far from a station is { source: null }", async (t) => {
  const s = setup({ env: { ADMIRALTY_API_KEY: "k", ADMIRALTY_TIER: "foundation" } });
  const net = stubFetch(t, [
    [/\/uktidalapi-foundation\/api\/V2\/Stations$/, () => STATIONS],
    [/\/uktidalapi-foundation\/api\/V2\/Stations\/0036\/TidalEvents/, () => EVENTS],
  ]);
  const c = s.call(handleTides, "/api/tides");
  assert.equal((await c("GET", "?lat=50.6&lon=-2.45")).body.station.id, "0036");
  s.tick(3600e3);
  assert.equal((await c("GET", "?lat=50.61&lon=-2.44")).body.source, "admiralty");
  assert.equal(net.calls.length, 2);
  s.tick(6 * 3600e3);
  await c("GET", "?lat=50.6&lon=-2.45");
  assert.equal(net.count(/TidalEvents/), 2);
  assert.equal(net.count(/Stations$/), 1);
  const far = await c("GET", "?lat=53.4&lon=-3.0");
  assert.equal(far.body.source, null);
  assert.match(far.body.note, /40 km/);
});

test("Admiralty down or refusing the key: { source: null } (the app shows its estimate), never upstream words", async (t) => {
  const s = setup({ env: { ADMIRALTY_API_KEY: "bad" } });
  stubFetch(t, [[/admiraltyapi/, () => new Response('{"statusCode":401,"message":"Access denied due to invalid subscription key bad"}', { status: 401 })]]);
  const r = await s.call(handleTides, "/api/tides")("GET", "?lat=51.13&lon=1.33");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, null);
  assert.equal(r.body.unavailable, true);
  assert.doesNotMatch(r.text, /subscription key|401|bad/);
  const h = await s.db.prepare(`SELECT last_error FROM source_health WHERE upstream = 'admiralty'`).first();
  assert.equal(h.last_error, "http_401");
});

test("an Admiralty call that hangs is given up after the timeout", async (t) => {
  const s = setup({ env: { ADMIRALTY_API_KEY: "k" } });
  let signal = null;
  stubFetch(t, [[/admiraltyapi/, (u, init) => { signal = init.signal; throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); }]]);
  const r = await s.call(handleTides, "/api/tides")("GET", "?lat=51.13&lon=1.33");
  assert.equal(r.body.source, null);
  assert.ok(signal, "every upstream call carries an abort signal");
  const h = await s.db.prepare(`SELECT last_error FROM source_health WHERE upstream = 'admiralty'`).first();
  assert.equal(h.last_error, "timeout");
});
