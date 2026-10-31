// GET /api/conditions: Open-Meteo forecast + marine shaped into the app's rows, cached per 0.05 degree cell.
import test from "node:test";
import assert from "node:assert/strict";
import { handleConditions, cellOf, shapeForecast, shapeMarine, CONDITIONS } from "../server/conditions.js";
import { setup, stubFetch, memoryCache, T0 } from "./helpers/fishdock.js";

const H = 3600;
const t0 = T0 / 1000; // 12:00 UTC on 31 Oct 2026 (UK winter time)
function forecast(hours = 72) {
  const time = Array.from({ length: hours }, (_, i) => t0 + i * H);
  return {
    latitude: 50.6, longitude: -2.45, utc_offset_seconds: 0, timezone: "Europe/London",
    hourly: {
      time,
      temperature_2m: time.map((_, i) => 11.24 + i * 0.01),
      wind_speed_10m: time.map(() => 18.4),
      wind_gusts_10m: time.map(() => 31.2),
      wind_direction_10m: time.map(() => 225),
      pressure_msl: time.map((_, i) => (i === 1 ? null : 1012.44)),
      precipitation: time.map(() => 0.2),
      cloud_cover: time.map(() => 70),
      is_day: time.map((_, i) => (i < 5 ? 1 : 0)),
    },
  };
}
function marine(hours = 72, empty = false) {
  const time = Array.from({ length: hours }, (_, i) => t0 + i * H);
  const v = (x) => time.map(() => (empty ? null : x));
  return { hourly: { time, wave_height: v(0.82), swell_wave_height: v(0.61), swell_wave_period: v(9.04), sea_surface_temperature: v(13.14) } };
}

test("cells: points snap to the 0.05 degree grid; only the cell centre is sent upstream", () => {
  assert.deepEqual(cellOf(50.6123, -2.4567), { lat: 50.6, lon: -2.45, label: "50.60,-2.45" });
  assert.equal(cellOf(50.6249, -2.4749).label, "50.60,-2.45");
  assert.equal(cellOf(50.626, -2.476).label, "50.65,-2.50");
});

test("shaping: UK times with offset, rounded values, unknowns kept as null", () => {
  const rows = shapeForecast(forecast(3));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { t: "2026-10-31T12:00:00+00:00", tempC: 11.2, windKph: 18, gustKph: 31, windDir: 225, pressureHpa: 1012.4, precipMm: 0.2, cloudPct: 70, isDay: 1 });
  assert.equal(rows[1].pressureHpa, null);
  // Summer time: an hour ahead of UTC, written with +01:00.
  const summer = shapeForecast({ hourly: { time: [Date.UTC(2026, 6, 1, 11) / 1000], temperature_2m: [20] } });
  assert.equal(summer[0].t, "2026-07-01T12:00:00+01:00");
  assert.equal(summer[0].windKph, null);
  assert.deepEqual(shapeMarine(marine(1)).hourly[0], { t: "2026-10-31T12:00:00+00:00", waveM: 0.8, swellM: 0.6, swellPeriodS: 9, seaTempC: 13.1 });
  assert.equal(shapeMarine(marine(4, true)), null); // inland: no sea data at all
  assert.deepEqual(shapeForecast(null), []);
});

test("conditions answer the API contract and are cached for 30 minutes per cell (D1 and Cache API)", async (t) => {
  const cache = memoryCache();
  const s = setup({ cache });
  const net = stubFetch(t, [
    [/\/\/api\.open-meteo\.com\/v1\/forecast/, () => forecast()],
    [/marine-api\.open-meteo\.com\/v1\/marine/, () => marine()],
  ]);
  const r = await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6123&lon=-2.4567");
  assert.equal(r.status, 200);
  assert.equal(r.body.source, "open-meteo");
  assert.equal(r.body.cell, "50.60,-2.45");
  assert.equal(r.body.hourly.length, 72);
  assert.equal(r.body.marine.hourly.length, 72);
  assert.equal(r.body.attribution, "Weather data by Open-Meteo.com (CC BY 4.0)");
  assert.match(r.body.fetchedAt, /^2026-10-31T12:00:00\+00:00$/);
  assert.equal(r.body.cached, false);
  // Only the cell centre left the server, never the angler's own point.
  const sent = net.calls.map((c) => c.url).join(" ");
  assert.match(sent, /latitude=50\.6&longitude=-2\.45/);
  assert.doesNotMatch(sent, /50\.6123|2\.4567/);
  assert.match(sent, /timezone=Europe%2FLondon/);

  // Another point in the same cell, 10 minutes later: no new upstream call.
  s.tick(10 * 60e3);
  const again = await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.62&lon=-2.47");
  assert.equal(again.status, 200);
  assert.equal(again.body.cached, true);
  assert.equal(net.count(/open-meteo/), 2);
  // D1 alone (a different Cache API location) also answers.
  cache.store.clear();
  const fromDb = await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6&lon=-2.45");
  assert.equal(fromDb.body.cached, true);
  assert.equal(net.count(/open-meteo/), 2);
  // After 30 minutes it's fetched again.
  cache.store.clear();
  s.tick(CONDITIONS.ttlMs);
  const fresh = await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6&lon=-2.45");
  assert.equal(fresh.body.cached, false);
  assert.equal(net.count(/open-meteo/), 4);
  // Health was recorded for both sources.
  const health = (await s.db.prepare(`SELECT upstream, last_ok FROM source_health ORDER BY upstream`).all()).results;
  assert.deepEqual(health.map((h) => h.upstream), ["open-meteo", "open-meteo-marine"]);
  assert.ok(health.every((h) => h.last_ok > 0));
});

test("conditions: marine outage still answers the weather; forecast outage is a plain 502 with no upstream details", async (t) => {
  const s = setup();
  let forecastUp = true;
  stubFetch(t, [
    [/\/\/api\.open-meteo\.com/, () => (forecastUp ? forecast() : new Response('{"reason":"secret upstream detail key=abc"}', { status: 500 }))],
    [/marine-api/, () => new Response("upstream exploded", { status: 503 })],
  ]);
  const ok = await s.call(handleConditions, "/api/conditions")("GET", "?lat=52.05&lon=-2.72");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.marine, null);
  forecastUp = false;
  const down = await s.call(handleConditions, "/api/conditions")("GET", "?lat=54.5&lon=-3.2");
  assert.equal(down.status, 502);
  assert.equal(down.body.error, "source_unavailable");
  assert.doesNotMatch(down.text, /secret|key=|exploded|500/);
  const h = await s.db.prepare(`SELECT last_fail, last_error FROM source_health WHERE upstream = 'open-meteo'`).first();
  assert.equal(h.last_error, "http_500");
  const m = await s.db.prepare(`SELECT last_error FROM source_health WHERE upstream = 'open-meteo-marine'`).first();
  assert.equal(m.last_error, "http_503");
});

test("conditions: an older copy is answered (stale) when Open-Meteo is down", async (t) => {
  const s = setup();
  let up = true;
  stubFetch(t, [[/open-meteo/, (u) => (up ? (/marine/.test(u) ? marine() : forecast()) : new Response("", { status: 502 }))]]);
  assert.equal((await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6&lon=-2.45")).status, 200);
  up = false;
  s.tick(2 * 3600e3);
  const r = await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6&lon=-2.45");
  assert.equal(r.status, 200);
  assert.equal(r.body.stale, true);
  assert.equal(r.body.hourly.length, 72);
});

test("conditions work without the database (no caching) and validate input and headers", async (t) => {
  const s = setup({ db: false, cache: null });
  const net = stubFetch(t, [[/open-meteo/, (u) => (/marine/.test(u) ? new Response('{"error":true,"reason":"No data"}', { status: 400 }) : forecast())]]);
  const c = s.call(handleConditions, "/api/conditions");
  const r = await c("GET", "?lat=52.05&lon=-2.72");
  assert.equal(r.status, 200);
  assert.equal(r.body.marine, null);
  await c("GET", "?lat=52.05&lon=-2.72");
  assert.equal(net.count(/\/\/api\.open-meteo/), 2); // nothing kept without a database
  assert.equal((await c("GET", "?lat=abc&lon=1")).status, 400);
  assert.equal((await c("GET", "?lat=52")).status, 400);
  assert.equal((await c("GET", "?lat=40.4&lon=-3.7")).body.error, "out_of_area");
  assert.equal((await c("GET", "?lat=52&lon=-2", { fishdock: false })).status, 403);
  assert.equal((await c("POST", "?lat=52&lon=-2", { body: {} })).status, 405);
});
