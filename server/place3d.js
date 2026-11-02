// GET /api/place?spot=<id>  The OpenStreetMap data round a documented FishDock mark, for the 3D view.
//
// - Only FishDock's own public, documented marks (by id), never an arbitrary point: nobody's private position is
//   ever sent anywhere, and the load on OpenStreetMap stays small.
// - The answer from OpenStreetMap's API (a 1.2 km square round the mark) is passed straight through and kept at the
//   edge for 30 days; the phone turns it into the place (src/lib/world3d/osmPlace.js). Passing it through unread
//   keeps the server's work tiny however much is mapped there.
// - Map data © OpenStreetMap contributors (ODbL), credited on the scene.

import { err, guard, toResponse } from "./http.js";
import { spotById } from "../src/data/spots.js";
import { PLACE3D } from "../src/lib/world3d/osmPlace.js";

export const PLACE3D_TTL_S = 30 * 86400;
// marks whose 3D view stands better on a checked position (Gorleston: on the south pier arm itself)
export const EXTRA_MARKS = { "gorleston-south-pier": { lat: 52.5721, lon: 1.7383, type: "pier" } };
const UA = "FishDock/0.3 (+https://fishdock.aaron6k.workers.dev; UK fishing app; 3D place view)";

export const markFor = (id) => (/^[a-z0-9-]{2,80}$/.test(id || "") ? EXTRA_MARKS[id] || spotById(id) || null : null);
export function osmUrl(mark) {
  const H = PLACE3D.box, dLat = H / 111320, dLon = H / (111320 * Math.cos((mark.lat * Math.PI) / 180));
  return `https://api.openstreetmap.org/api/0.6/map.json?bbox=${[mark.lon - dLon, mark.lat - dLat, mark.lon + dLon, mark.lat + dLat].map((x) => x.toFixed(5)).join(",")}`;
}

export async function handlePlace3d(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET.");
  try {
    const id = new URL(request.url).searchParams.get("spot") || "";
    const mark = markFor(id);
    if (!mark || !Number.isFinite(mark.lat) || !Number.isFinite(mark.lon)) return err(404, "not_found", "That place isn't one of FishDock's documented marks.");
    const cache = deps.cache !== undefined ? deps.cache : globalThis.caches?.default ?? null;
    const key = new Request(`https://fishdock-cache.internal/place3d/v1/${id}`);
    const headers = { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=86400`, "x-mark": `${mark.lat},${mark.lon}` };
    if (cache) { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: { ...headers, "x-cache": "hit" } }); }
    const fetchFn = deps.fetch ?? globalThis.fetch;
    let up;
    try { up = await fetchFn(osmUrl(mark), { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout?.(15000) }); } catch { return err(502, "upstream", "Couldn't reach OpenStreetMap just now."); }
    if (!up.ok) { try { await up.body?.cancel(); } catch { /* ignore */ } return err(502, "upstream", "Couldn't reach OpenStreetMap just now."); }
    if (cache) {
      const [a, b] = up.body.tee();
      await cache.put(key, new Response(a, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${PLACE3D_TTL_S}` } })).catch(() => {});
      return new Response(b, { headers });
    }
    return new Response(up.body, { headers });
  } catch (e) {
    return toResponse(e, now, "place3d");
  }
}
