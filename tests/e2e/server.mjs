// Local end-to-end server (as DetectDock's tests/e2e/server.mjs): serves the single-file app at / and mounts the
// real server/*.js handlers at /api/* on an in-memory D1, with every outside service replaced by recorded-shape
// stand-ins, so the whole app can be exercised in a browser with no network and no keys.
// Usage: node tools/build-preview.mjs --server && node tests/e2e/server.mjs [port]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createD1 } from "../helpers/d1.js";
import { handleConditions } from "../../server/conditions.js";
import { handleTides } from "../../server/tides.js";
import { handleRiver } from "../../server/river.js";
import { handleAi } from "../../server/ai.js";
import { handleSync } from "../../server/sync.js";
import { handleCommunity } from "../../server/community.js";
import { handleFeedback } from "../../server/feedback.js";
import { handleMetrics } from "../../server/metrics.js";
import { handleAdmin } from "../../server/admin.js";
import { handleWater } from "../../server/water.js";
import { handleFishInfo } from "../../server/fishinfo.js";
import { handlePlaces } from "../../server/places.js";

const port = Number(process.argv[2] || 8792);
// --dist serves the production build (dist/, as Cloudflare Pages would); otherwise the single-file e2e build.
const DIST = process.argv.includes("--dist") ? new URL("../../dist/", import.meta.url) : null;
const html = DIST ? null : readFileSync(new URL("../../dist-preview/fishdock-e2e.html", import.meta.url));
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
function staticFile(pathname) {
  if (!DIST) return { type: "text/html; charset=utf-8", body: html };
  const clean = pathname.replace(/\.\.+/g, "").replace(/^\/+/, "") || "index.html";
  for (const f of [clean, "index.html"]) {
    try { return { type: TYPES[f.slice(f.lastIndexOf("."))] || "application/octet-stream", body: readFileSync(new URL(f, DIST)) }; } catch { /* next */ }
  }
  return { type: "text/plain", body: "not found" };
}
const env = { DB: createD1(":memory:"), ADMIRALTY_API_KEY: "test-key", GEMINI_API_KEY: "test-key", ADMIN_EMAILS: "admin@fishdock.example" };
const HANDLERS = { conditions: handleConditions, tides: handleTides, river: handleRiver, ai: handleAi, sync: handleSync, community: handleCommunity, feedback: handleFeedback, metrics: handleMetrics, admin: handleAdmin, water: handleWater, fishinfo: handleFishInfo, places: handlePlaces };

// ---- outside services, shaped like the real ones ----
const now = Date.now();
const hours = Array.from({ length: 72 }, (_, i) => new Date(Math.floor(now / 3600e3) * 3600e3 + (i - 6) * 3600e3).toISOString().slice(0, 16));
globalThis.fetch = async (input, init) => {
  const url = String(typeof input === "string" ? input : input.url);
  const J = (b) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
  if (url.includes("geocoding-api.open-meteo.com")) return J({ results: [{ name: "Gorleston-on-Sea", latitude: 52.5764, longitude: 1.7291, feature_code: "PPL", country_code: "GB", admin1: "England", admin2: "Norfolk" }, { name: "Gorleston Beach", latitude: 52.5650, longitude: 1.7350, feature_code: "BCH", country_code: "GB", admin1: "England", admin2: "Norfolk" }] });
  if (url.includes("marine-api.open-meteo.com")) return J({ utc_offset_seconds: 0, hourly: { time: hours, wave_height: hours.map(() => 0.9), swell_wave_height: hours.map(() => 0.6), swell_wave_period: hours.map(() => 9), sea_surface_temperature: hours.map(() => 13.4) } });
  if (url.includes("api.open-meteo.com")) return J({ utc_offset_seconds: 0, hourly: { time: hours, temperature_2m: hours.map((_, i) => 10 + 3 * Math.sin(i / 4)), wind_speed_10m: hours.map((_, i) => 14 + (i % 9)), wind_gusts_10m: hours.map((_, i) => 26 + (i % 9)), wind_direction_10m: hours.map(() => 230), pressure_msl: hours.map((_, i) => 1014 - i * 0.15), precipitation: hours.map((_, i) => (i % 11 === 0 ? 0.6 : 0)), cloud_cover: hours.map(() => 60), is_day: hours.map((t) => (+t.slice(11, 13) >= 7 && +t.slice(11, 13) < 17 ? 1 : 0)) } });
  if (url.includes("admiraltyapi") && /Stations\/?(\?|$)/.test(url)) return J({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-2.4383, 50.5650] }, properties: { Id: "0028", Name: "Portland", Country: "England" } }] });
  if (url.includes("admiraltyapi") && url.includes("TidalEvents")) {
    const base = Math.floor(now / 864e5) * 864e5;
    const ev = [];
    for (let d = 0; d < 7; d++) for (const [h, type, ht] of [[1.2, "HighWater", 1.9], [7.4, "LowWater", 0.3], [13.6, "HighWater", 1.8], [19.8, "LowWater", 0.4]]) ev.push({ EventType: type, DateTime: new Date(base + d * 864e5 + (h + d * 0.8) * 3600e3).toISOString().slice(0, 19), Height: ht, IsApproximateTime: false, IsApproximateHeight: false });
    return J(ev);
  }
  if (url.includes("flood-monitoring")) {
    if (url.includes("/readings")) return J({ items: Array.from({ length: 48 }, (_, i) => ({ dateTime: new Date(now - (47 - i) * 900e3).toISOString(), value: 0.82 + i * 0.002 })) });
    if (url.includes("/floods")) return J({ items: [] });
    return J({ items: [{ "@id": "http://environment.data.gov.uk/flood-monitoring/id/stations/E1", notation: "E1", label: "Test station", riverName: "River Test", lat: 51.95, long: -2.6, measures: [{ "@id": "http://environment.data.gov.uk/flood-monitoring/id/measures/E1-level-stage-i-15_min-m", parameter: "level", qualifier: "Stage" }], stageScale: { typicalRangeLow: 0.3, typicalRangeHigh: 1.9 } }] });
  }
  if (url.includes("en.wikipedia.org/api/rest_v1/page/summary/")) {
    const name = decodeURIComponent(url.split("/summary/")[1].split("?")[0]).replace(/_/g, " ");
    return J({ title: name, extract: `${name} is a fish found in UK waters. It can grow to about 1 m long (test text).`, content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/" + name.replace(/ /g, "_") } }, originalimage: { source: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Test_fish.jpg" } });
  }
  if (url.includes("commons.wikimedia.org/w/api.php")) return J({ query: { pages: { "1": { imageinfo: [{ url: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Test_fish.jpg", thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Test_fish.jpg/640px-Test_fish.jpg", thumbwidth: 640, thumbheight: 400, descriptionurl: "https://commons.wikimedia.org/wiki/File:Test_fish.jpg", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Test Photographer" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" } } }] } } } });
  if (url.includes("overpass-api.de")) {
    // inland (west of 1.0 E and south of 52.8 N here) is a named river; anything else is the coast by a pier
    const q = decodeURIComponent(String(init?.body || "").slice(5));
    const m = q.match(/is_in\((-?[\d.]+),(-?[\d.]+)\)/);
    const inland = m && +m[2] < 1.0 && +m[1] < 52.8;
    return J({ elements: inland ? [{ type: "way", id: 1, tags: { waterway: "river", name: "River Test" } }] : [{ type: "way", id: 2, tags: { natural: "coastline" } }, { type: "way", id: 3, tags: { man_made: "pier", name: "Test Pier" } }] });
  }
  if (url.includes("generativelanguage.googleapis.com")) return J({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "A shingle beach with a gentle swell.", scene: "beach", features: [{ x: 0.55, y: 0.58, kind: "surf", label: "Second breaker line", why: "Waves turn over food here.", how: "Cast just beyond it.", for: ["Bass", "Cod"], confidence: "medium" }], avoid: [], safety: ["Steep shingle: keep well back from the waterline."], candidates: [{ species: "Bass", id: "bass", confidence: "high", why: "Silver, two dorsal fins, spiny gill cover." }] }) }] } }] });
  if (url.includes("googleapis.com/service_accounts") || url.includes("securetoken")) return J({ keys: [] });
  return new Response("not stubbed", { status: 599 });
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const m = url.pathname.match(/^\/api\/([a-z]+)/);
  if (!m) { const f = staticFile(url.pathname); res.writeHead(200, { "content-type": f.type }); res.end(f.body); return; }
  const h = HANDLERS[m[1]];
  if (!h) { res.writeHead(404); res.end("{}"); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
  try {
    const r = await h(request, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: "server_error", message: e.message })); }
}).listen(port, () => console.log(`FishDock e2e on http://localhost:${port}`));
