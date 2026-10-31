// GET /api/tides?lat=&lon=  High and low water at the nearest official tide station (Admiralty UK Tidal API, UKHO).
//
// - Only when ADMIRALTY_API_KEY is set. Without it (or with no station within 40 km, or the service down) the answer
//   is { source: null, note } and the app falls back to its on-device lunar estimate, clearly labelled as one.
// - The key is sent only to UKHO, in the Ocp-Apim-Subscription-Key header, and never reaches the app.
// - Station list: GET {base}/Stations (GeoJSON FeatureCollection; coordinates are [lon, lat]).
//   Events: GET {base}/Stations/{id}/TidalEvents?duration=7 (today plus 6 days on the Discovery tier).
//   Times are GMT (UTC) without an offset; they're answered in UK local time with their offset.
// - Caching depends on the subscription (ADMIRALTY_TIER). UKHO's FAQ says caching is NOT permitted on the free
//   Discovery tier and is permitted on Foundation and Premium. So:
//     discovery (default): nothing is kept; every lookup asks UKHO (watch the subscription's quota);
//     foundation / premium: the station list is kept a week and each station's events 6 hours.
//   See docs/BACKEND.md: the Foundation / Premium base paths are taken from a third-party client, not UKHO's docs.

import { json, err, guard, latLon, toResponse, distanceKm, round } from "./http.js";
import { ensureSchema, maybeSweep } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";
import { ukIso } from "./time.js";

export const TIDES = { maxKm: 40, durationDays: 7, stationsTtlMs: 7 * 86400e3, eventsTtlMs: 6 * 3600e3 };
export const ATTRIBUTION = "Contains ADMIRALTY® tidal data: © Crown Copyright and database right.";
const BASES = {
  discovery: "https://admiraltyapi.azure-api.net/uktidalapi/api/V1",
  foundation: "https://admiraltyapi.azure-api.net/uktidalapi-foundation/api/V2",
  premium: "https://admiraltyapi.azure-api.net/uktidalapi-premium/api/V2",
};
export function tierOf(env) {
  const t = String(env?.ADMIRALTY_TIER || "discovery").trim().toLowerCase();
  return BASES[t] ? t : "discovery";
}
const mayCache = (tier) => tier !== "discovery";
const NO_KEY_NOTE = "Official tide times aren't connected on this server yet, so FishDock shows its own estimate from the Moon (labelled as an estimate).";
const NO_STATION_NOTE = `There's no official tide station within ${TIDES.maxKm} km of this place.`;
const DOWN_NOTE = "Official tide times couldn't be reached just now, so FishDock shows its own estimate from the Moon.";

// ---- parsing ----

const num = (v) => (Array.isArray(v) ? num(v[0]) : typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

/** The station list as [{ id, name, lat, lon }] from UKHO's GeoJSON (features[].properties.Id / Name, geometry [lon, lat]). */
export function parseStations(raw) {
  const features = Array.isArray(raw?.features) ? raw.features : Array.isArray(raw) ? raw : [];
  const out = [];
  for (const f of features) {
    const p = f?.properties ?? f ?? {};
    const c = f?.geometry?.coordinates;
    const lon = num(Array.isArray(c) ? c[0] : null), lat = num(Array.isArray(c) ? c[1] : null);
    const id = typeof p.Id === "string" ? p.Id : typeof p.id === "string" ? p.id : null;
    if (!id || !/^[A-Za-z0-9]{1,12}$/.test(id) || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ id, name: String(p.Name ?? p.name ?? id).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80) || id, lat, lon });
  }
  return out;
}

export function nearestStation(stations, lat, lon, maxKm = TIDES.maxKm) {
  let best = null;
  for (const s of stations) {
    const d = distanceKm({ lat, lon }, s);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { ...s, distanceKm: d };
  }
  return best;
}

// UKHO gives GMT (UTC) date-times without an offset, e.g. "2026-10-31T04:12:00".
const utcMs = (v) => (typeof v === "string" ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z") : NaN);

/** TidalEvents as [{ type: "HighWater"|"LowWater", t, heightM, approximate? }], in time order. */
export function parseEvents(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const out = [];
  for (const e of list) {
    const type = e?.EventType === "HighWater" || e?.EventType === "LowWater" ? e.EventType : null;
    const t = utcMs(e?.DateTime);
    if (!type || !Number.isFinite(t)) continue;
    const h = num(e?.Height);
    const ev = { type, t: ukIso(t), heightM: h == null ? null : round(h, 2) };
    if (e?.IsApproximateTime === true || e?.IsApproximateHeight === true) ev.approximate = true;
    out.push([t, ev]);
  }
  return out.sort((a, b) => a[0] - b[0]).map(([, ev]) => ev);
}

// ---- handler ----

export async function handleTides(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET for tides.");
  try {
    const db = env.DB || null;
    if (db) {
      await ensureSchema(db);
      await maybeSweep(db, now);
      await dataThrottle(db, env, request, now);
    }
    const { lat, lon } = latLon(new URL(request.url));
    const key = typeof env.ADMIRALTY_API_KEY === "string" ? env.ADMIRALTY_API_KEY.trim() : "";
    if (!key) return json({ source: null, note: NO_KEY_NOTE });
    const tier = tierOf(env);
    const base = BASES[tier];
    const ctx = upstreamCtx(db, now, deps);
    const headers = { "Ocp-Apim-Subscription-Key": key };
    try {
      const stations = await cachedJson(ctx, `ukho-stations1:${tier}`, mayCache(tier) ? TIDES.stationsTtlMs : 0, async () => {
        const list = parseStations(await ctx.upstreamJson("admiralty", `${base}/Stations`, { headers }));
        if (!list.length) throw new UpstreamError("admiralty", "empty");
        return list;
      });
      const station = nearestStation(stations.value, lat, lon);
      if (!station) return json({ source: null, note: NO_STATION_NOTE });
      const events = await cachedJson(ctx, `ukho-events1:${tier}:${station.id}`, mayCache(tier) ? TIDES.eventsTtlMs : 0, async () =>
        parseEvents(await ctx.upstreamJson("admiralty", `${base}/Stations/${encodeURIComponent(station.id)}/TidalEvents?duration=${TIDES.durationDays}`, { headers })));
      if (events.value.length < 2) return json({ source: null, note: DOWN_NOTE });
      return json({
        source: "admiralty",
        station: { id: station.id, name: station.name, lat: round(station.lat, 3), lon: round(station.lon, 3), distanceKm: round(station.distanceKm, 1) },
        events: events.value,
        fetchedAt: ukIso(events.fetchedAt),
        attribution: ATTRIBUTION,
        ...(events.stale ? { stale: true } : {}),
      });
    } catch (e) {
      // Never the upstream's words or status: the app shows its labelled estimate instead.
      if (e instanceof UpstreamError) return json({ source: null, note: DOWN_NOTE, unavailable: true });
      throw e;
    }
  } catch (e) {
    return toResponse(e, now, "tides");
  }
}
