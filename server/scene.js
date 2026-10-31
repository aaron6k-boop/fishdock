// GET /api/scene?lat=&lon=  Free-licensed photos taken near a fishing place, for the Live Fishing View backdrop.
//
// - Wikimedia Commons' own geographic search (files with a camera position) within a few km of the point. Only
//   photos with a free licence (CC0, public domain, CC BY or CC BY-SA) and a landscape shape come back, scored so
//   views of water (pier, beach, harbour, river, lake...) come first and birds, signs and buildings drop out.
// - The point is rounded to two decimals (about 1 km) on the phone and again here, so neither FishDock's server
//   nor Wikimedia ever learns the exact mark. Answers are kept for everyone for a week per 1 km square.
// - Every photo travels with its author, licence and file page, which the app shows under the scene. The app
//   labels these "Photo near here", never as the angler's own view: GPS alone can't say where the rod points.

import { json, err, guard, toResponse, cleanLine, latLon, AREA } from "./http.js";
import { ensureSchema } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { dataThrottle } from "./throttle.js";
import { UA } from "./fishinfo.js";

export const SCENE = { ttlMs: 7 * 86400e3, radiusM: 4000, wideRadiusM: 10000, max: 8, thumbPx: 1280, minWidth: 640, minAspect: 1.25 };
const FREE = /^(cc0( 1\.0)?|cc[- ]zero|public domain|pd(-[a-z0-9-]+)?|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?)$/i;
const GOOD = /\b(pier|piers|beach|sea|seafront|harbour|harbor|quay|jetty|breakwater|groyne|river|estuary|mouth|lake|loch|lough|reservoir|broad|canal|pond|pool|weir|bay|cove|shore|coast|cliffs?|sands?|surf|marina|waterfront|promenade|fishing|anglers?|view|towards|sunset|sunrise|evening|dusk)\b/i;
const BAD = /\b(plaque|sign|signs|office|offices|business|units|warehouses?|sheds?|church|interior|inside|crane|map|birds?|turnstone|gull|plover|sandpiper|redshank|cormorant|duck|swan|geese|goose|seal|flowers?|insect|butterfly|portrait|grave|memorial|window|door|statue|bus|train|car park|house|houses|street|shop|pub|hotel|station|lorry|van|tractor|industrial|offices|logo|poster|leaflet|exhibit|museum)\b/i;

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const roundCell = (v) => Math.round(Number(v) * 100) / 100;

/** A readable title from the file name: no extension, no "- geograph.org.uk - 123456". */
export function niceTitle(file) {
  return cleanLine(String(file || "").replace(/^File:/, "").replace(/\.[a-z0-9]{3,4}$/i, "").replace(/\s*-\s*geograph\.org\.uk\s*-\s*\d+$/i, "").replace(/_/g, " "), 90);
}

/** The 1280 px copy of a big Commons original (a standard thumbnail width), or the original when it's smaller. */
export function sceneUrl(original, width) {
  const m = String(original || "").match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/);
  if (!m) return null;
  if (!(width > SCENE.thumbPx)) return original;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${SCENE.thumbPx}px-${m[3]}`;
}

/** Commons' geosearch answer to the app's list, best first. Pure, so it's tested without the network. */
export function shapeScenes(answer) {
  const out = [];
  for (const p of Object.values(answer?.query?.pages || {})) {
    const info = p?.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png)$/.test(info.mime || "")) continue;
    const w = Number(info.width), h = Number(info.height);
    if (!(w >= SCENE.minWidth) || !(h > 0) || w / h < SCENE.minAspect) continue;
    const ext = info.extmetadata || {};
    const licence = stripHtml(ext.LicenseShortName?.value);
    if (!FREE.test(licence)) continue;
    const url = sceneUrl(String(info.url || "").split("?")[0], w);
    if (!url) continue;
    const title = niceTitle(p.title);
    const words = `${title} ${stripHtml(ext.ImageDescription?.value).slice(0, 300)}`;
    const dist = Number(p.coordinates?.[0]?.dist);
    const good = (words.match(new RegExp(GOOD.source, "gi")) || []).length;
    const bad = (words.match(new RegExp(BAD.source, "gi")) || []).length + (/'[A-Z][a-z]+ [a-z]+'/.test(words) ? 2 : 0);
    if (bad >= 2 && good === 0) continue;
    const score = Math.min(good, 3) * 2 - bad * 3 + (w >= SCENE.thumbPx ? 1 : 0) - (Number.isFinite(dist) ? dist / 1500 : 1);
    out.push({
      file: String(p.title || "").replace(/^File:/, ""), title, url,
      width: w > SCENE.thumbPx ? SCENE.thumbPx : w, height: w > SCENE.thumbPx ? Math.round((h * SCENE.thumbPx) / w) : h,
      author: cleanLine(stripHtml(ext.Artist?.value) || "Unknown author", 80),
      licence: cleanLine(licence, 40),
      licenceUrl: /^https:\/\//.test(ext.LicenseUrl?.value || "") ? ext.LicenseUrl.value : null,
      filePage: /^https:\/\/commons\.wikimedia\.org\//.test(info.descriptionurl || "") ? info.descriptionurl : null,
      km: Number.isFinite(dist) ? Math.round(dist / 100) / 10 : null,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, SCENE.max).map(({ score, ...p }) => p);
}

const searchUrl = (lat, lon, radius) => "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=geosearch"
  + `&ggscoord=${lat}%7C${lon}&ggsradius=${radius}&ggslimit=50&ggsnamespace=6&prop=imageinfo%7Ccoordinates&colimit=max&codistancefrompoint=${lat}%7C${lon}`
  + "&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiextmetadatafilter=LicenseShortName%7CLicenseUrl%7CArtist%7CImageDescription";

export async function handleScene(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET.");
  try {
    const url = new URL(request.url);
    const p = latLon(url);
    if (p.lat < AREA.minLat || p.lat > AREA.maxLat || p.lon < AREA.minLon || p.lon > AREA.maxLon) return err(400, "outside_uk", "Scene photos are for UK and Irish waters.");
    const lat = roundCell(p.lat), lon = roundCell(p.lon);
    const db = env.DB || null;
    if (db) await ensureSchema(db);
    await dataThrottle(db, env, request, now);
    const ctx = upstreamCtx(db, now, deps);
    try {
      const got = await cachedJson(ctx, `scene1:${lat.toFixed(2)},${lon.toFixed(2)}`, SCENE.ttlMs, async () => {
        const near = shapeScenes(await ctx.upstreamJson("wikimedia-commons", searchUrl(lat, lon, SCENE.radiusM), { headers: { "user-agent": UA, "api-user-agent": UA } }));
        if (near.length >= 3) return { photos: near, radiusKm: SCENE.radiusM / 1000 };
        const wide = shapeScenes(await ctx.upstreamJson("wikimedia-commons", searchUrl(lat, lon, SCENE.wideRadiusM), { headers: { "user-agent": UA, "api-user-agent": UA } }));
        return { photos: wide.length > near.length ? wide : near, radiusKm: wide.length > near.length ? SCENE.wideRadiusM / 1000 : SCENE.radiusM / 1000 };
      });
      return json({ source: "wikimedia-commons", cell: { lat, lon }, ...got.value, cached: got.cached });
    } catch (e) {
      if (e instanceof UpstreamError) return err(502, "upstream", "Couldn't reach Wikimedia Commons just now.");
      throw e;
    }
  } catch (e) {
    return toResponse(e, now, "scene");
  }
}
