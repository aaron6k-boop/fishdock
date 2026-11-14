// GET /api/conditions?lat=&lon=  Weather and sea state for the next 3 days, hourly (Open-Meteo forecast + marine).
//
// - The point is snapped to a 0.05 degree cell (about 5 km) before anything is asked upstream: Open-Meteo only
//   ever sees the cell's centre, and the answer is kept for everyone in that cell for 30 minutes (D1 `cache`
//   table and the Cache API where there is one).
// - Times are UK local time (Europe/London) as ISO strings with their offset. Wind is in km/h (Open-Meteo's default).
// - The forecast and the marine data are fetched and kept separately: an inland cell has no sea data
//   (marine: null), and a marine outage never takes the weather down with it.
// - Works without the database (nothing is then kept between requests, apart from the Cache API).
// - Open-Meteo data is CC BY 4.0: the attribution line travels with every answer.

import { json, err, guard, latLon, toResponse, round } from "./http.js";
import { ensureSchema, maybeSweep } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";
import { ukIso } from "./time.js";

export const CONDITIONS = { cellDeg: 0.05, ttlMs: 30 * 60e3, forecastDays: 3 };
export const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
// (visibility, metres, and weather_code, the WMO code: fog is 45 and 48, a thunderstorm 95 to 99. Used by the 3D game for
// sea fret and storms, from the real forecast when it's live)
const FORECAST_VARS = ["temperature_2m", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "pressure_msl", "precipitation", "cloud_cover", "is_day", "visibility", "weather_code"];
const MARINE_VARS = ["wave_height", "swell_wave_height", "swell_wave_period", "sea_surface_temperature"];

// ---- cells ----

/** The 0.05 degree cell a point falls in: { lat, lon, label } with the cell centre's coordinates. */
export function cellOf(lat, lon, deg = CONDITIONS.cellDeg) {
  const la = Number((Math.round(lat / deg) * deg).toFixed(2));
  const lo = Number((Math.round(lon / deg) * deg).toFixed(2));
  return { lat: la, lon: lo, label: `${la.toFixed(2)},${lo.toFixed(2)}` };
}

export const forecastUrl = (c) => `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}`
  + `&hourly=${FORECAST_VARS.join(",")}&timezone=Europe%2FLondon&timeformat=unixtime&forecast_days=${CONDITIONS.forecastDays}`;
export const marineUrl = (c) => `https://marine-api.open-meteo.com/v1/marine?latitude=${c.lat}&longitude=${c.lon}`
  + `&hourly=${MARINE_VARS.join(",")}&timezone=Europe%2FLondon&timeformat=unixtime&forecast_days=${CONDITIONS.forecastDays}`;

// ---- shaping ----

const at = (arr, i) => (Array.isArray(arr) && Number.isFinite(arr[i]) ? arr[i] : null);
const times = (h) => (Array.isArray(h?.time) ? h.time : []);
// With timeformat=unixtime Open-Meteo gives UTC seconds; an ISO string is accepted too, in case.
const toMs = (v) => (typeof v === "number" ? v * 1000 : typeof v === "string" ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z") : NaN);

/** Open-Meteo's hourly forecast as the app's rows (unknown values are null, never guessed). */
export function shapeForecast(raw) {
  const h = raw?.hourly;
  const out = [];
  times(h).forEach((v, i) => {
    const t = toMs(v);
    if (!Number.isFinite(t)) return;
    const isDay = at(h.is_day, i);
    out.push({
      t: ukIso(t),
      tempC: round(at(h.temperature_2m, i), 1),
      windKph: round(at(h.wind_speed_10m, i), 0),
      gustKph: round(at(h.wind_gusts_10m, i), 0),
      windDir: round(at(h.wind_direction_10m, i), 0),
      pressureHpa: round(at(h.pressure_msl, i), 1),
      precipMm: round(at(h.precipitation, i), 1),
      cloudPct: round(at(h.cloud_cover, i), 0),
      isDay: isDay == null ? null : isDay ? 1 : 0,
      visibilityM: round(at(h.visibility, i), 0),
      code: round(at(h.weather_code, i), 0),
    });
  });
  return out;
}

/** Open-Meteo's marine hours as the app's rows, or null when the cell has no sea data at all. */
export function shapeMarine(raw) {
  const h = raw?.hourly;
  const out = [];
  times(h).forEach((v, i) => {
    const t = toMs(v);
    if (!Number.isFinite(t)) return;
    out.push({
      t: ukIso(t),
      waveM: round(at(h.wave_height, i), 1),
      swellM: round(at(h.swell_wave_height, i), 1),
      swellPeriodS: round(at(h.swell_wave_period, i), 1),
      seaTempC: round(at(h.sea_surface_temperature, i), 1),
    });
  });
  const any = out.some((r) => r.waveM != null || r.swellM != null || r.seaTempC != null);
  return any ? { hourly: out } : null;
}

// ---- handler ----

export async function handleConditions(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET for conditions.");
  try {
    const db = env.DB || null;
    if (db) {
      await ensureSchema(db);
      await maybeSweep(db, now);
      await dataThrottle(db, env, request, now);
    }
    const { lat, lon } = latLon(new URL(request.url));
    const cell = cellOf(lat, lon);
    const ctx = upstreamCtx(db, now, deps);
    let forecast;
    try {
      forecast = await cachedJson(ctx, `om-forecast1:${cell.label}`, CONDITIONS.ttlMs, async () => {
        const hourly = shapeForecast(await ctx.upstreamJson("open-meteo", forecastUrl(cell)));
        if (!hourly.length) throw new UpstreamError("open-meteo", "empty");
        return hourly;
      });
    } catch (e) {
      if (e instanceof UpstreamError) return err(502, "source_unavailable", "The weather forecast couldn't be reached just now. Try again in a few minutes.");
      throw e;
    }
    let marine = null;
    try {
      // { m: null } is kept too: an inland cell isn't asked again for sea data every time.
      const got = await cachedJson(ctx, `om-marine1:${cell.label}`, CONDITIONS.ttlMs, async () => ({
        m: shapeMarine(await ctx.upstreamJson("open-meteo-marine", marineUrl(cell), { noDataStatuses: [400] })),
      }));
      marine = got.value?.m ?? null;
    } catch {
      marine = null; // the weather still answers; sea state is shown as unknown
    }
    return json({
      source: "open-meteo",
      fetchedAt: ukIso(forecast.fetchedAt),
      cell: cell.label,
      hourly: forecast.value,
      marine,
      attribution: ATTRIBUTION,
      cached: forecast.cached,
      ...(forecast.stale ? { stale: true } : {}),
    });
  } catch (e) {
    return toResponse(e, now, "conditions");
  }
}
