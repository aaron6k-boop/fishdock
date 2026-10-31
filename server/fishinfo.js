// GET /api/fishinfo?id=<species id>  A real photo and a short description of one FishDock species, from Wikipedia.
//
// - Only FishDock's own species ids are accepted (so this can't be used to fetch anything else). The Wikipedia page
//   is found from the species' Latin name, or an override where the Latin name lands on the wrong page.
// - Photo: the page's lead image, only if it is on Wikimedia Commons with a free licence (CC0, public domain,
//   CC BY or CC BY-SA). Its author, licence and file page travel with it and are shown under the photo. Anything
//   else (no image, a non-free image, an unknown licence) gives photo: null and the app keeps its illustration.
// - Text: the page's summary (Wikipedia text is CC BY-SA 4.0), with a link back to the page. It usually covers how
//   big the fish grows. Shown as "From Wikipedia", never mixed into FishDock's own sourced advice.
// - Kept for everyone for 30 days. No location, nothing about the user.

import { json, err, guard, toResponse, cleanLine, cleanText } from "./http.js";
import { ensureSchema } from "./db.js";
import { cachedJson, upstreamCtx, UpstreamError } from "./upstream.js";
import { SPECIES } from "../src/data/species.js";

export const FISHINFO = { ttlMs: 30 * 86400e3, thumbPx: 640, extractMax: 900 };
export const UA = "FishDock/0.2 (+https://fishdock.aaron6k.workers.dev; UK fishing app)";
// Pages where the Latin name would land somewhere less useful (sea trout shares Salmo trutta with brown trout).
export const TITLE_OVERRIDES = { "sea-trout": "Sea trout", "brown-trout": "Brown trout", "smoothhound": "Mustelus mustelus", "gurnard": "Tub gurnard" };
// The whole licence name must be one of these (so "CC BY-NC" or "CC BY-ND" never pass as "CC BY").
const FREE = /^(cc0( 1\.0)?|cc[- ]zero|public domain|pd(-[a-z0-9-]+)?|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?)$/i;

/** The Commons file name from an upload.wikimedia.org URL, or null if it isn't a Commons file. Wikipedia now adds
 *  tracking parameters (?utm_source=...) to image URLs; they aren't part of the name. */
export function commonsFile(url) {
  const m = String(url || "").match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Shapes the summary and the Commons metadata into the app's answer. Pure, so it's tested without the network. */
export function shapeInfo(summary, meta) {
  const page = summary?.content_urls?.desktop?.page || null;
  const extract = cleanText(String(summary?.extract || "").replace(/\s*\u2014\s*/g, ", "), FISHINFO.extractMax) || null; // no em dashes in the app
  let photo = null;
  const info = meta ? Object.values(meta?.query?.pages || {})[0]?.imageinfo?.[0] : null;
  const ext = info?.extmetadata || {};
  const licence = stripHtml(ext.LicenseShortName?.value);
  if (info && FREE.test(licence)) {
    photo = {
      url: info.thumburl || info.url,
      width: info.thumbwidth || null, height: info.thumbheight || null,
      author: cleanLine(stripHtml(ext.Artist?.value) || "Unknown author", 80),
      licence: cleanLine(licence, 40),
      licenceUrl: /^https:\/\//.test(ext.LicenseUrl?.value || "") ? ext.LicenseUrl.value : null,
      filePage: info.descriptionurl || null,
    };
  }
  return { title: cleanLine(summary?.title || "", 80) || null, extract, page, photo, source: "wikipedia", textLicence: "CC BY-SA 4.0" };
}

export async function handleFishInfo(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.method !== "GET") return err(405, "method", "Use GET.");
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    const sp = SPECIES.find((s) => s.id === id);
    if (!sp) return err(404, "unknown_species", "FishDock doesn't have that species.");
    const db = env.DB || null;
    if (db) await ensureSchema(db);
    const ctx = upstreamCtx(db, now, deps);
    const title = TITLE_OVERRIDES[sp.id] || sp.latin || sp.name;
    try {
      // The summary and the photo's licence are kept separately: a Commons hiccup isn't remembered for a month.
      const got = await cachedJson(ctx, `fishsum1:${sp.id}`, FISHINFO.ttlMs, async () =>
        ctx.upstreamJson("wikipedia", `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`, { headers: { "user-agent": UA, "api-user-agent": UA } }));
      const summary = got.value;
      const file = commonsFile(summary?.originalimage?.source || summary?.thumbnail?.source);
      let meta = null;
      if (file) {
        try {
          meta = (await cachedJson(ctx, `fishimg1:${file}`, FISHINFO.ttlMs, async () =>
            ctx.upstreamJson("wikimedia-commons", `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=${FISHINFO.thumbPx}&titles=${encodeURIComponent("File:" + file)}`, { headers: { "user-agent": UA, "api-user-agent": UA } }))).value;
        } catch (e) {
          if (!(e instanceof UpstreamError)) throw e; // no licence details: no photo this time, the text still comes back
        }
      }
      return json({ ...shapeInfo(summary, meta), id: sp.id, cached: got.cached });
    } catch (e) {
      if (e instanceof UpstreamError) return err(502, "upstream", "Couldn't reach Wikipedia just now.");
      throw e;
    }
  } catch (e) {
    return toResponse(e, now, "fishinfo");
  }
}
