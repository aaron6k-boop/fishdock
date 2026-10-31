// GET /api/places?q=<text>  Find a UK town, beach, harbour or lake by name, to move the map there.
//
// - Open-Meteo's geocoding API (GeoNames data, CC BY 4.0), limited to the UK (countryCode=GB). No key needed.
// - Only the typed words are sent, never a position. Answers are kept for everyone for a week per query.
// - Each result: { name, area, lat, lon, kind } where kind says if it's a populated place, water, coast and so on.

import { json, err, guard, toResponse, cleanLine } from "./http.js";
import { ensureSchema } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";

export const PLACES = { ttlMs: 7 * 86400e3, max: 8 };
export const ATTRIBUTION = "Place search: Open-Meteo geocoding, GeoNames data (CC BY 4.0)";
// GeoNames feature codes worth naming for anglers (others show as "Place")
const KINDS = { PPL: "Town", PPLA: "Town", PPLA2: "Town", PPLA3: "Town", PPLA4: "Town", PPLC: "City", PPLX: "Area", PPLL: "Village",
  BCH: "Beach", BAY: "Bay", CAPE: "Headland", PT: "Point", HBR: "Harbour", PRT: "Port", PIER: "Pier", LK: "Lake", LKS: "Lakes",
  RSV: "Reservoir", STM: "River", ESTY: "Estuary", ISL: "Island", INLT: "Inlet", CHN: "Channel", LGN: "Lagoon", MRSH: "Marsh", CLF: "Cliff" };

export function cleanQuery(q) {
  return cleanLine(String(q || ""), 60).replace(/[^\p{L}\p{N}\s'’.,-]/gu, "").replace(/\s+/g, " ").trim();
}

export function shapePlaces(raw) {
  return (Array.isArray(raw?.results) ? raw.results : [])
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && (r.country_code || "GB") === "GB")
    .slice(0, PLACES.max)
    .map((r) => ({
      name: cleanLine(r.name, 60),
      area: cleanLine([r.admin2, r.admin1].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "), 80),
      lat: Math.round(r.latitude * 1e4) / 1e4, lon: Math.round(r.longitude * 1e4) / 1e4,
      kind: KINDS[r.feature_code] || "Place",
    }));
}

export async function handlePlaces(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET.");
  try {
    const q = cleanQuery(new URL(request.url).searchParams.get("q"));
    if (q.length < 2) return json({ results: [], attribution: ATTRIBUTION });
    const db = env.DB || null;
    if (db) { await ensureSchema(db); await dataThrottle(db, env, request, now); }
    const ctx = upstreamCtx(db, now, deps);
    try {
      const got = await cachedJson(ctx, `places1:${q.toLowerCase()}`, PLACES.ttlMs, async () =>
        shapePlaces(await ctx.upstreamJson("open-meteo-geocoding", `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=en&format=json&countryCode=GB`)));
      return json({ results: got.value, attribution: ATTRIBUTION });
    } catch (e) {
      if (e instanceof UpstreamError) return err(502, "upstream", "Place search isn't answering just now.");
      throw e;
    }
  } catch (e) {
    return toResponse(e, now, "places");
  }
}
