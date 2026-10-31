// GET /api/river: Environment Agency nearest level station, readings, typical range, trend / state and floods.
// The samples follow the flood-monitoring API's documented fields (items[], @id, notation, label, riverName, lat,
// long, stageScale.typicalRangeLow / High, measures[].parameter / qualifier; readings dateTime / value; floods
// severity / severityLevel / description / message). Written from the reference, not captured live.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRiver, parseStations, parseReadings, parseFloods, trendOf, stateOf, nationAt, NOT_ENGLAND_NOTE } from "../server/river.js";
import { setup, stubFetch, T0 } from "./helpers/fishdock.js";

const EA = "http://environment.data.gov.uk/flood-monitoring";
const station = (ref, lat, lon, extra = {}) => ({
  "@id": `${EA}/id/stations/${ref}`, RLOIid: "2083", catchmentName: "Wye", label: `Station ${ref}`, notation: ref, riverName: "River Wye",
  stationReference: ref, lat, long: lon, status: "http://environment.data.gov.uk/flood-monitoring/def/core/statusActive",
  measures: [{ "@id": `${EA}/id/measures/${ref}-level-stage-i-15_min-m`, parameter: "level", parameterName: "Water Level", qualifier: "Stage", unitName: "m", period: 900 }],
  ...extra,
});
const STATIONS = {
  "@context": `${EA}/meta/context.jsonld`,
  items: [
    station("055002", 52.0567, -2.7155, { stageScale: { typicalRangeLow: 0.3, typicalRangeHigh: 1.9, highestRecent: { value: 5.2 } } }),
    station("055003", 52.1, -2.6), // further away
    { "@id": `${EA}/id/stations/GW1`, label: "Borehole", lat: 52.05, long: -2.72, measures: [{ "@id": `${EA}/id/measures/GW1-level-groundwater-i-1_h-mAOD`, parameter: "level", qualifier: "Groundwater" }] },
  ],
};
function readings(levels, stepMin = 15) {
  // newest first, as `_sorted` returns them
  return { items: levels.map((v, i) => ({ "@id": `${EA}/data/readings/x`, dateTime: new Date(T0 - i * stepMin * 60e3).toISOString().replace(/\.000Z$/, "Z"), measure: `${EA}/id/measures/055002-level-stage-i-15_min-m`, value: v })) };
}
const FLOODS = {
  items: [
    { "@id": `${EA}/id/floods/1`, description: "River Lugg at Lugwardine", eaAreaName: "West Midlands", severity: "Flood alert", severityLevel: 3, message: "River levels are rising. Be prepared.", isTidal: false },
    { "@id": `${EA}/id/floods/2`, description: "River Wye at Hereford", severity: "Flood warning", severityLevel: 2, message: "Flooding is expected." },
    { "@id": `${EA}/id/floods/3`, description: "Old warning", severity: "Warning no Longer in Force", severityLevel: 4 },
  ],
};

test("nations: England only (approximate borders)", () => {
  assert.equal(nationAt(52.05, -2.72), "England"); // Hereford
  assert.equal(nationAt(51.48, -3.18), "Wales"); // Cardiff
  assert.equal(nationAt(56.4, -3.4), "Scotland"); // Perth
  assert.equal(nationAt(54.6, -5.93), "Northern Ireland"); // Belfast
});

test("outside England: { source: null, note } and the Environment Agency isn't asked", async (t) => {
  const net = stubFetch(t, []);
  const s = setup();
  for (const q of ["?lat=56.4&lon=-3.4", "?lat=51.48&lon=-3.18", "?lat=54.6&lon=-5.93"]) {
    const r = await s.call(handleRiver, "/api/river")("GET", q);
    assert.equal(r.status, 200);
    assert.equal(r.body.source, null);
    assert.equal(r.body.note, NOT_ENGLAND_NOTE);
    assert.match(r.body.note, /England only/);
  }
  assert.equal(net.calls.length, 0);
});

test("parsing: level stations only (no boreholes), readings oldest first, floods in force only", () => {
  const st = parseStations(STATIONS);
  assert.deepEqual(st.map((s) => s.ref), ["055002", "055003"]);
  assert.equal(st[0].measure, "055002-level-stage-i-15_min-m");
  assert.equal(st[0].typicalLow, 0.3);
  assert.equal(st[0].river, "River Wye");
  const r = parseReadings({ items: [{ dateTime: "2026-10-31T11:45:00Z", value: 0.8 }, { dateTime: "2026-10-31T11:30:00Z" }, { dateTime: "2026-10-31T11:15:00Z", value: [0.79, 0.79] }] });
  assert.deepEqual(r.map((x) => x.levelM), [0.79, 0.8]);
  const f = parseFloods(FLOODS);
  assert.deepEqual(f.map((x) => x.level), [2, 3]);
  assert.deepEqual(f[1], { severity: "Flood alert", level: 3, area: "River Lugg at Lugwardine", message: "River levels are rising. Be prepared." });
});

test("trend and state: rising / falling / steady over ~3 hours, low / normal / high against the typical range", () => {
  const rows = (vals) => vals.map((v, i) => ({ t: T0 - (vals.length - 1 - i) * 15 * 60e3, levelM: v }));
  const flat = Array(16).fill(1.0);
  assert.equal(trendOf(rows([...flat, 1.2])), "rising");
  assert.equal(trendOf(rows([...flat, 0.8])), "falling");
  assert.equal(trendOf(rows([...flat, 1.02])), "steady"); // under 3 cm
  assert.equal(trendOf(rows([...flat, 1.07]), { typicalLow: 0, typicalHigh: 2 }), "steady"); // under 5% of a 2 m range
  assert.equal(trendOf(rows([1])), null);
  assert.equal(stateOf(0.2, 0.3, 1.9), "low");
  assert.equal(stateOf(0.82, 0.3, 1.9), "normal");
  assert.equal(stateOf(2.4, 0.3, 1.9), "high");
  assert.equal(stateOf(0.82, null, 1.9), null); // never guessed
});

test("England: nearest station within 15 km, 48 readings, typical range, trend, state and floods; cached 15 minutes", async (t) => {
  const s = setup();
  const levels = Array.from({ length: 60 }, (_, i) => Math.round((0.82 - i * 0.01) * 1000) / 1000); // newest 0.82, rising
  const net = stubFetch(t, [
    [/\/id\/stations\?parameter=level&lat=52\.05&long=-2\.72&dist=16/, () => STATIONS],
    [/\/id\/measures\/055002-level-stage-i-15_min-m\/readings\?_sorted&_limit=48/, () => readings(levels.slice(0, 48))],
    [/\/id\/floods\?lat=52\.05&long=-2\.72&dist=20/, () => FLOODS],
  ]);
  const r = await s.call(handleRiver, "/api/river")("GET", "?lat=52.0512&lon=-2.7188");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "environment-agency");
  assert.equal(r.body.station.id, "055002");
  assert.equal(r.body.station.river, "River Wye");
  assert.equal(r.body.station.typicalLow, 0.3);
  assert.equal(r.body.station.typicalHigh, 1.9);
  assert.ok(r.body.station.distanceKm < 1);
  assert.equal(r.body.readings.length, 48);
  assert.deepEqual(r.body.readings.at(-1), { t: "2026-10-31T12:00:00+00:00", levelM: 0.82 });
  assert.equal(r.body.trend, "rising");
  assert.equal(r.body.state, "normal");
  assert.equal(r.body.floods.length, 2);
  assert.match(r.body.attribution, /Environment Agency/);
  // Only a ~1 km cell centre went upstream.
  assert.doesNotMatch(net.calls.map((c) => c.url).join(" "), /52\.0512|2\.7188/);
  s.tick(10 * 60e3);
  await s.call(handleRiver, "/api/river")("GET", "?lat=52.0512&lon=-2.7188");
  assert.equal(net.calls.length, 3);
  s.tick(6 * 60e3);
  await s.call(handleRiver, "/api/river")("GET", "?lat=52.0512&lon=-2.7188");
  assert.equal(net.count(/readings/), 2);
  assert.equal(net.count(/\/id\/stations\?/), 1); // the nearest station is kept a day
});

test("typical range fetched from the station record when the list doesn't carry it; no station nearby; EA down", async (t) => {
  const s = setup({ db: false, cache: null });
  let up = true;
  const net = stubFetch(t, [
    [/\/id\/stations\?.*lat=53&long=-1\.5&/, () => ({ items: [station("X1", 53.0, -1.5)] })],
    [/\/id\/stations\/X1$/, () => ({ items: station("X1", 53.0, -1.5, { stageScale: { "@id": "x", typicalRangeLow: "0.5", typicalRangeHigh: "1.5" } }) })],
    [/\/id\/measures\/X1-level-stage-i-15_min-m\/readings/, () => (up ? readings([1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8]) : new Response("<html>error</html>", { status: 503 }))],
    [/\/id\/floods/, () => ({ items: [] })],
    [/\/id\/stations\?.*lat=54\.4/, () => ({ items: [] })],
  ]);
  const r = await s.call(handleRiver, "/api/river")("GET", "?lat=53.0&lon=-1.5");
  assert.equal(r.status, 200);
  assert.equal(r.body.station.typicalHigh, 1.5);
  assert.equal(r.body.state, "high");
  assert.equal(r.body.trend, "steady");
  assert.deepEqual(r.body.floods, []);
  const none = await s.call(handleRiver, "/api/river")("GET", "?lat=54.4&lon=-2.0");
  assert.equal(none.body.source, null);
  assert.match(none.body.note, /15 km/);
  up = false;
  const down = await s.call(handleRiver, "/api/river")("GET", "?lat=53.0&lon=-1.5");
  assert.equal(down.status, 502);
  assert.doesNotMatch(down.text, /html|503/);
  assert.ok(net.calls.length >= 5);
});
