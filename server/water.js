// GET /api/water?lat=&lon=  What kind of water is at a point someone tapped on the map, from OpenStreetMap.
//
// - Asks the Overpass API (OpenStreetMap data) what's at and around the point: water areas it sits in (lakes,
//   reservoirs, wide rivers, canals, fisheries, named bays), river and canal lines within 90 m, the coastline
//   within 2.5 km, piers and breakwaters within 60 m, and beach or rock within 150 m.
// - Answers { kind, subtype, name, sure, attribution }: kind "sea" | "river" | "lake" | "canal" | "fishery" | null,
//   subtype one of FishDock's water types (beach, pier, rocks, estuary, river, lake, reservoir, canal, fishery).
//   sure is "high" (the point is inside a mapped water area, or on a river line), "medium" (worked out from
//   features nearby) or "low" (a guess the app asks people to check). null kind means nothing was found nearby.
// - The point (4 decimal places, about 10 m) goes to Overpass with nothing about who asked. Nothing is stored:
//   no cache row, no log line with coordinates. A tapped point can be someone's private mark.
// - OpenStreetMap data is © OpenStreetMap contributors, ODbL; the attribution travels with every answer.

import { json, err, guard, latLon, toResponse, cleanLine } from "./http.js";
import { ensureSchema } from "./db.js";
import { upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";

// Public Overpass instances, tried in turn (https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).
// The main instance limits busy networks, and Cloudflare's outgoing addresses are shared, so a second and third
// instance keep taps working when one refuses or is slow.
export const OVERPASS_URLS = [
  ["overpass", "https://overpass-api.de/api/interpreter"],
  ["overpass-coffee", "https://overpass.private.coffee/api/interpreter"],
  ["overpass-vk", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"],
];
export const OVERPASS_URL = OVERPASS_URLS[0][1];
// Overpass asks for a User-Agent that says who is calling and how to reach them.
export const OVERPASS_UA = "FishDock/0.2 (+https://fishdock.aaron6k.workers.dev; UK fishing app)";
export const ATTRIBUTION = "Water features © OpenStreetMap contributors (ODbL)";
export const WATER = { riverM: 90, coastM: 1500, pierM: 60, shoreM: 150, tryMs: 4500 };

export function overpassQuery(lat, lon) {
  const p = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  return `[out:json][timeout:6];
is_in(${p})->.a;
(
  area.a["natural"="water"];
  area.a["water"];
  area.a["waterway"="riverbank"];
  area.a["landuse"="reservoir"];
  area.a["leisure"="fishing"];
  area.a["natural"~"^(bay|strait)$"];
);
out tags;
(
  way(around:${WATER.riverM},${p})["waterway"~"^(river|canal|stream|tidal_channel)$"];
  way(around:${WATER.coastM},${p})["natural"="coastline"];
  way(around:${WATER.pierM},${p})["man_made"~"^(pier|breakwater|groyne|quay)$"];
  nwr(around:${WATER.shoreM},${p})["natural"~"^(beach|shingle|bare_rock|cliff|rock)$"];
);
out tags 80;`;
}

const nameOf = (t) => cleanLine(t?.["name:en"] || t?.name || "", 60) || null;

/** Turns Overpass elements into FishDock's answer. Pure, so it's tested without the network. */
export function classifyWater(elements) {
  const els = Array.isArray(elements) ? elements : [];
  const inside = els.filter((e) => e.type === "area").map((e) => e.tags || {});
  const near = els.filter((e) => e.type !== "area").map((e) => e.tags || {});
  const coast = near.some((t) => t.natural === "coastline");
  const lines = near.filter((t) => t.waterway);
  const named = (list) => list.map(nameOf).find(Boolean) || null;
  const bay = inside.filter((t) => t.natural === "bay" || t.natural === "strait");
  const out = (kind, subtype, name, sure) => ({ kind, subtype, name, sure });

  // 1. inside a mapped water area
  const fishing = inside.filter((t) => t.leisure === "fishing");
  if (fishing.length) return out("fishery", "fishery", named(fishing), "high");
  const water = inside.filter((t) => t.natural === "water" || t.water || t.waterway === "riverbank" || t.landuse === "reservoir");
  if (water.length) {
    const t = water.find((x) => x.water === "canal") || water.find((x) => x.water === "river" || x.waterway === "riverbank" || x.water === "tidal" || x.water === "lagoon")
      || water.find((x) => x.water === "reservoir" || x.landuse === "reservoir") || water[0];
    const name = nameOf(t) || named(lines) || named(water);
    if (t.water === "canal") return out("canal", "canal", name, "high");
    if (t.water === "river" || t.waterway === "riverbank" || t.water === "tidal" || t.water === "lagoon") {
      const tidal = coast || t.tidal === "yes" || t.water === "tidal" || t.water === "lagoon";
      return tidal ? out("sea", "estuary", name, "medium") : out("river", "river", name, "high");
    }
    if (t.water === "reservoir" || t.landuse === "reservoir") return out("lake", "reservoir", name, "high");
    return out("lake", "lake", name, "high");
  }
  // 2. on or beside a river or canal line
  const canal = lines.find((t) => t.waterway === "canal");
  if (canal) return out("canal", "canal", nameOf(canal) || named(lines), "high");
  const river = lines.find((t) => t.waterway === "river" && nameOf(t)) || lines.find((t) => t.waterway === "river") || lines.find((t) => t.waterway === "tidal_channel") || lines.find((t) => t.waterway === "stream");
  if (river) {
    const tidal = river.tidal === "yes" || river.waterway === "tidal_channel" || coast;
    return tidal ? out("sea", "estuary", nameOf(river), "medium") : out("river", "river", nameOf(river), river.waterway === "stream" ? "medium" : "high");
  }
  // 3. the coast: which kind of shore mark
  if (coast) {
    const pier = near.find((t) => /^(pier|breakwater|groyne|quay)$/.test(t.man_made || ""));
    if (pier) return out("sea", "pier", nameOf(pier) || named(bay), "medium");
    const rock = near.find((t) => /^(bare_rock|cliff|rock)$/.test(t.natural || ""));
    const beach = near.find((t) => /^(beach|shingle)$/.test(t.natural || ""));
    if (rock && !beach) return out("sea", "rocks", named(bay), "medium");
    if (beach) return out("sea", "beach", named(bay), "medium");
    return out("sea", "beach", named(bay), "low");
  }
  if (bay.length) return out("sea", "beach", named(bay), "low");
  return out(null, null, null, "low");
}

export async function handleWater(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET to look up water.");
  try {
    const db = env.DB || null;
    if (db) {
      await ensureSchema(db);
      await dataThrottle(db, env, request, now);
    }
    const { lat, lon } = latLon(new URL(request.url));
    const ctx = upstreamCtx(db, now, deps);
    const body = "data=" + encodeURIComponent(overpassQuery(lat, lon));
    for (const [name, url] of OVERPASS_URLS) {
      try {
        const raw = await ctx.upstreamJson(name, url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": OVERPASS_UA },
          body,
          timeoutMs: WATER.tryMs,
        });
        if (!Array.isArray(raw?.elements)) continue; // an Overpass error page or a timeout remark: try the next one
        return json({ ...classifyWater(raw.elements), source: "openstreetmap", attribution: ATTRIBUTION });
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e;
      }
    }
    return err(502, "upstream", "Couldn't check the map data just now. Choose the water type yourself.");
  } catch (e) {
    return toResponse(e, now, "water");
  }
}
