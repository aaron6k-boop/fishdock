// GET /api/pano?spot=<id>  A real 360° photo taken near a documented FishDock mark, from Mapillary.
//
// - Needs MAPILLARY_TOKEN (a free Mapillary client token) as a server secret; the phone never sees it. Without it
//   this answers 503 and the 3D view uses the map-data place instead.
// - Only FishDock's public, documented marks, never an arbitrary position. The nearest panorama within about 250 m
//   is chosen; photos are CC BY-SA 4.0 and shown with the photographer's name and a link to the photo.
// - Kept for 12 hours (Mapillary's image links are signed and expire).

import { json, err, guard, toResponse } from "./http.js";
import { ensureSchema } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { markFor } from "./place3d.js";

export const PANO_TTL = 12 * 3600e3;

/** The nearest panorama to the mark from Mapillary's answer (pure, tested). */
export function pickPano(answer, lat, lon) {
  const R = 111320, k = Math.cos((lat * Math.PI) / 180);
  let best = null;
  for (const im of answer?.data || []) {
    const c = im.computed_geometry?.coordinates || im.geometry?.coordinates;
    if (!im.is_pano || !Array.isArray(c) || !/^https:\/\//.test(im.thumb_2048_url || "")) continue;
    const d = Math.hypot((c[0] - lon) * R * k, (c[1] - lat) * R);
    if (d > 250) continue;
    if (!best || d < best.d) best = { d, im, c };
  }
  if (!best) return null;
  const { im, c, d } = best, heading = Number(im.computed_compass_angle ?? im.compass_angle);
  return {
    id: String(im.id), url: im.thumb_2048_url, heading: Number.isFinite(heading) ? heading : 0, metres: Math.round(d),
    at: [Math.round(c[1] * 1e5) / 1e5, Math.round(c[0] * 1e5) / 1e5], capturedAt: Number(im.captured_at) || null,
    author: String(im.creator?.username || "a Mapillary contributor").slice(0, 60), licence: "CC BY-SA 4.0", page: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(im.id)}`,
  };
}

export async function handlePano(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET.");
  try {
    const id = new URL(request.url).searchParams.get("spot") || "";
    const mark = markFor(id);
    if (!mark) return err(404, "not_found", "That place isn't one of FishDock's documented marks.");
    if (!env?.MAPILLARY_TOKEN) return err(503, "not_configured", "Real 360° photos aren't switched on yet.");
    if (env.DB) await ensureSchema(env.DB);
    const ctx = upstreamCtx(env.DB, now, deps);
    const dLat = 250 / 111320, dLon = 250 / (111320 * Math.cos((mark.lat * Math.PI) / 180));
    const bbox = [mark.lon - dLon, mark.lat - dLat, mark.lon + dLon, mark.lat + dLat].map((x) => x.toFixed(6)).join(",");
    const got = await cachedJson(ctx, `pano:v1:${id}`, PANO_TTL, async () => {
      const a = await ctx.upstreamJson("mapillary", `https://graph.mapillary.com/images?access_token=${encodeURIComponent(env.MAPILLARY_TOKEN)}&fields=id,thumb_2048_url,computed_compass_angle,compass_angle,computed_geometry,geometry,captured_at,is_pano,creator&is_pano=true&bbox=${bbox}&limit=100`);
      return pickPano(a, mark.lat, mark.lon);
    });
    if (!got.value) return err(404, "no_pano", "There's no 360° photo near this place yet.");
    return json({ pano: got.value });
  } catch (e) {
    if (e instanceof UpstreamError) return err(502, "upstream", "Couldn't reach Mapillary just now.");
    return toResponse(e, now, "pano");
  }
}
