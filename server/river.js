// GET /api/river?lat=&lon=  River level near a place in England (Environment Agency real-time flood-monitoring API).
//
// - England only: the Environment Agency's API covers England. Elsewhere the answer is { source: null, note } and
//   says where official levels are published instead (SEPA, Natural Resources Wales, DfI Rivers).
// - The point is snapped to a 0.01 degree cell (about 1 km) before the Environment Agency is asked anything.
// - Nearest level station within 15 km (river stage gauges; groundwater boreholes are skipped), its last 48
//   readings, its typical range (stageScale.typicalRangeLow / High), and flood alerts and warnings in force
//   within 20 km (severity levels 1 to 3; level 4 "no longer in force" is left out).
// - trend: the latest level against the level about 3 hours before (a change under 3 cm, or under 5% of the
//   typical range, is "steady"). state: below the typical range "low", above it "high", otherwise "normal";
//   null when the station publishes no typical range (never guessed).
// - Kept for everyone: the nearest station per cell for a day (stations rarely change), readings and floods for
//   15 minutes. Works without the database (nothing kept between requests then, apart from the Cache API).
// - Open Government Licence v3.0; the Environment Agency's attribution line travels with every answer.

import { json, err, guard, latLon, toResponse, distanceKm, round, cleanLine } from "./http.js";
import { ensureSchema, maybeSweep } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";
import { ukIso } from "./time.js";

export const RIVER = { cellDeg: 0.01, stationKm: 15, floodKm: 20, readings: 48, trendHours: 3, ttlMs: 15 * 60e3, stationTtlMs: 86400e3 };
export const EA_BASE = "https://environment.data.gov.uk/flood-monitoring";
export const ATTRIBUTION = "This uses Environment Agency flood and river level data from the real-time data API (Beta). Open Government Licence v3.0.";
export const NOT_ENGLAND_NOTE = "River levels here come from the Environment Agency, which covers England only. In Scotland see SEPA, in Wales Natural Resources Wales, and in Northern Ireland DfI Rivers.";
const NO_STATION_NOTE = `There's no Environment Agency river level station within ${RIVER.stationKm} km of this place.`;

// ---- nations (an approximation, as the app's src/lib/geo.js nationAt) ----

/** "England", "Wales", "Scotland", "Northern Ireland" or null. Borders are approximate. */
export function nationAt(lat, lon) {
  if (lat > 53.9 && lat < 55.45 && lon < -5.35 && lon > -8.25) return "Northern Ireland";
  if (lon <= -3.1 ? lat > 54.97 : lon >= -2.03 ? lat > 55.81 : lat > 54.95 + ((lon + 3.1) / 1.07) * 0.83) return "Scotland";
  if (lat > 51.35 && lat < 53.45) {
    const borderLon = lat > 53.0 ? -3.0 : lat > 52.4 ? -3.05 : lat > 51.8 ? -2.95 : -2.65;
    if (lon < borderLon) return "Wales";
  }
  if (lat > 49.8 && lat < 56 && lon > -6.5 && lon < 2) return "England";
  return null;
}

// ---- parsing ----

const first = (v) => (Array.isArray(v) ? v[0] : v);
const num = (v) => {
  const x = first(v);
  return typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null;
};
const items = (raw) => (Array.isArray(raw?.items) ? raw.items : raw?.items && typeof raw.items === "object" ? [raw.items] : []);
/** The last path segment of an Environment Agency URI (a station reference or measure notation), if it looks like one. */
export function notationOf(uri) {
  const s = typeof uri === "string" ? uri.split("?")[0].split("/").filter(Boolean).pop() : null;
  return s && /^[A-Za-z0-9_.-]{1,80}$/.test(s) ? s : null;
}

/** A level measure to read: river stage first, then any other non-groundwater level. */
export function levelMeasure(station) {
  const ms = (Array.isArray(station?.measures) ? station.measures : station?.measures ? [station.measures] : [])
    .filter((m) => m && typeof m === "object" && m.parameter === "level" && !/groundwater/i.test(String(m.qualifier || "")));
  const pick = ms.find((m) => /^stage$/i.test(String(m.qualifier || ""))) || ms.find((m) => !/tidal/i.test(String(m.qualifier || ""))) || ms[0];
  return pick ? notationOf(pick["@id"]) : null;
}

/** Stations from a list answer as [{ ref, name, river, lat, lon, measure, typicalLow, typicalHigh }]. */
export function parseStations(raw) {
  const out = [];
  for (const s of items(raw)) {
    const lat = num(s?.lat), lon = num(s?.long);
    const ref = notationOf(s?.["@id"]) || (typeof s?.notation === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(s.notation) ? s.notation : null);
    if (!ref || lat == null || lon == null) continue;
    if (/closed|suspended/i.test(String(first(s?.status) || ""))) continue;
    const measure = levelMeasure(s);
    if (!measure) continue;
    const scale = s?.stageScale && typeof s.stageScale === "object" ? s.stageScale : null;
    out.push({
      ref, lat, lon, measure,
      name: cleanLine(String(first(s?.label) ?? ref), 80) || ref,
      river: cleanLine(String(first(s?.riverName) ?? ""), 60) || null,
      typicalLow: num(scale?.typicalRangeLow),
      typicalHigh: num(scale?.typicalRangeHigh),
    });
  }
  return out;
}

/** The typical range from a single-station answer (its embedded stageScale), or nulls. */
export function parseScale(raw) {
  const s = items(raw)[0];
  const scale = s?.stageScale && typeof s.stageScale === "object" ? s.stageScale : null;
  return { typicalLow: num(scale?.typicalRangeLow), typicalHigh: num(scale?.typicalRangeHigh) };
}

/** Readings as [{ t (ms), levelM }], oldest first, values missing (NaN readings) left out. */
export function parseReadings(raw) {
  const out = [];
  for (const r of items(raw)) {
    const t = Date.parse(r?.dateTime);
    const v = num(r?.value);
    if (Number.isFinite(t) && v != null) out.push({ t, levelM: round(v, 3) });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((r, i) => i === 0 || r.t !== out[i - 1].t).slice(-RIVER.readings);
}

const SEVERITY = { 1: "Severe flood warning", 2: "Flood warning", 3: "Flood alert" };
/** Flood alerts and warnings in force (levels 1 to 3), most severe first. */
export function parseFloods(raw) {
  const out = [];
  for (const f of items(raw)) {
    const level = num(f?.severityLevel);
    if (![1, 2, 3].includes(level)) continue;
    out.push({
      severity: SEVERITY[level], // the same plain wording whatever the source wrote
      level,
      area: cleanLine(String(f?.description || f?.eaAreaName || ""), 160),
      message: cleanLine(String(f?.message || ""), 600),
    });
  }
  return out.sort((a, b) => a.level - b.level).slice(0, 10);
}

// ---- trend and state ----

export function trendOf(readings, { typicalLow = null, typicalHigh = null } = {}) {
  if (!Array.isArray(readings) || readings.length < 2) return null;
  const last = readings[readings.length - 1];
  const target = last.t - RIVER.trendHours * 3600e3;
  let before = readings[0];
  for (const r of readings) if (r.t <= target) before = r;
  if (before === last) return null;
  const range = typicalLow != null && typicalHigh != null && typicalHigh > typicalLow ? typicalHigh - typicalLow : null;
  const thr = Math.max(0.03, range ? 0.05 * range : 0);
  const d = last.levelM - before.levelM;
  return d > thr ? "rising" : d < -thr ? "falling" : "steady";
}

export function stateOf(level, typicalLow, typicalHigh) {
  if (level == null || typicalLow == null || typicalHigh == null || !(typicalHigh > typicalLow)) return null;
  return level < typicalLow ? "low" : level > typicalHigh ? "high" : "normal";
}

const cellOf = (lat, lon) => {
  const d = RIVER.cellDeg;
  const la = Number((Math.round(lat / d) * d).toFixed(2)), lo = Number((Math.round(lon / d) * d).toFixed(2));
  return { lat: la, lon: lo, label: `${la.toFixed(2)},${lo.toFixed(2)}` };
};

// ---- handler ----

export async function handleRiver(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET for river levels.");
  try {
    const db = env.DB || null;
    if (db) {
      await ensureSchema(db);
      await maybeSweep(db, now);
      await dataThrottle(db, env, request, now);
    }
    const { lat, lon } = latLon(new URL(request.url));
    if (nationAt(lat, lon) !== "England") return json({ source: null, note: NOT_ENGLAND_NOTE });
    const cell = cellOf(lat, lon);
    const ctx = upstreamCtx(db, now, deps);
    try {
      const near = await cachedJson(ctx, `ea-stations1:${cell.label}`, RIVER.stationTtlMs, async () =>
        parseStations(await ctx.upstreamJson("ea-flood", `${EA_BASE}/id/stations?parameter=level&lat=${cell.lat}&long=${cell.lon}&dist=${RIVER.stationKm + 1}&_limit=100`)));
      let best = null;
      for (const s of near.value) {
        const d = distanceKm({ lat, lon }, s);
        if (d <= RIVER.stationKm && (!best || d < best.distanceKm)) best = { ...s, distanceKm: d };
      }
      if (!best) return json({ source: null, note: NO_STATION_NOTE, attribution: ATTRIBUTION });
      // The typical range: from the list if it came embedded, else from the station's own record (kept a day).
      let range = { typicalLow: best.typicalLow, typicalHigh: best.typicalHigh };
      if (range.typicalLow == null || range.typicalHigh == null) {
        try {
          range = (await cachedJson(ctx, `ea-scale1:${best.ref}`, RIVER.stationTtlMs, async () =>
            parseScale(await ctx.upstreamJson("ea-flood", `${EA_BASE}/id/stations/${encodeURIComponent(best.ref)}`)))).value;
        } catch {
          range = { typicalLow: null, typicalHigh: null }; // levels still answer; state is then unknown
        }
      }
      const readings = await cachedJson(ctx, `ea-readings1:${best.measure}`, RIVER.ttlMs, async () =>
        parseReadings(await ctx.upstreamJson("ea-flood", `${EA_BASE}/id/measures/${encodeURIComponent(best.measure)}/readings?_sorted&_limit=${RIVER.readings}`)));
      let floods = [];
      try {
        floods = (await cachedJson(ctx, `ea-floods1:${cell.label}`, RIVER.ttlMs, async () =>
          parseFloods(await ctx.upstreamJson("ea-flood", `${EA_BASE}/id/floods?lat=${cell.lat}&long=${cell.lon}&dist=${RIVER.floodKm}`)))).value;
      } catch {
        floods = null; // unknown, not "none"
      }
      const list = readings.value;
      const latest = list.length ? list[list.length - 1] : null;
      return json({
        source: "environment-agency",
        station: {
          id: best.ref, name: best.name, river: best.river, distanceKm: round(best.distanceKm, 1),
          typicalLow: range.typicalLow, typicalHigh: range.typicalHigh,
        },
        readings: list.map((r) => ({ t: ukIso(r.t), levelM: r.levelM })),
        latest: latest ? { t: ukIso(latest.t), levelM: latest.levelM } : null,
        trend: trendOf(list, range),
        state: stateOf(latest?.levelM ?? null, range.typicalLow, range.typicalHigh),
        floods,
        fetchedAt: ukIso(readings.fetchedAt),
        attribution: ATTRIBUTION,
        ...(readings.stale ? { stale: true } : {}),
      });
    } catch (e) {
      if (e instanceof UpstreamError) return err(502, "source_unavailable", "The Environment Agency's river levels couldn't be reached just now. Try again in a few minutes.");
      throw e;
    }
  } catch (e) {
    return toResponse(e, now, "river");
  }
}
