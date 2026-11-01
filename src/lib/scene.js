// ---- scene: the backdrop of the Live Fishing View for each place ----
// Best: the angler's own photo of where they're fishing, lined up with where the rod points (GPS alone can't know
// the view). Next: a free-licensed photo taken near the place (Wikimedia Commons, via /api/scene), labelled
// "Photo near here". Otherwise a representative scene, labelled as such. The chosen viewpoint is kept per place on
// this phone. Own photos are re-encoded on the phone (which drops EXIF and GPS) and stay here unless shared.
import { get, put, remove, shrinkImage } from "./storage.js";
import { PREVIEW } from "./api.js";
import { viewpointFromWords, suitsVenue } from "./viewpoint.js";

const VIEWS = "fishdock.sceneViews.v1";

export const placeKey = (place) => (place?.id && place.id !== "custom" ? place.id : `c:${Number(place?.lat || 0).toFixed(3)},${Number(place?.lon || 0).toFixed(3)}`);
/** The kind of place the angler stands at, for how the water moves, which rod and how a fish is landed:
 *  beach | pier (piers, breakwaters, harbour walls, rocks) | estuary | river | lake. From the spot's own type where
 *  FishDock has one, otherwise from the water kind and the name. */
export const VENUES = ["beach", "pier", "estuary", "river", "lake"];
export function venueOf(place) {
  const t = place?.type || place?.venue;
  if (VENUES.includes(t)) return t;
  if (t === "breakwater" || t === "rocks" || t === "harbour") return "pier";
  if (t === "reservoir" || t === "still" || t === "fishery") return "lake";
  const k = place?.kind, n = String(place?.name || place?.label || "").toLowerCase();
  if (k === "estuary") return "estuary";
  if (k === "river" || k === "canal") return "river";
  if (k === "sea") return /beach|sands|bay\b|strand/.test(n) && !/pier|harbour|breakwater|jetty|quay/.test(n) ? "beach" : "pier";
  return "lake";
}
export const waterKind = (kind) => (kind === "sea" || kind === "estuary" ? "sea" : kind === "river" || kind === "canal" ? "river" : "still");

export function defaultView(horizon = 0.42) {
  return { x: 0, y: 0, zoom: 1, rot: 0, horizon, water: [[0, horizon], [1, horizon], [1, 1], [0, 1]], cast: [0.5, Math.min(0.92, horizon + 0.2)] };
}

function readAll() { try { return JSON.parse(localStorage.getItem(VIEWS) || "{}") || {}; } catch { return {}; } }
/** The saved choice for a place: { kind: own | commons | representative, view, commons? }. */
export function loadChoice(place) {
  const c = readAll()[placeKey(place)];
  return c && c.kind ? { ...c, view: { ...defaultView(), ...(c.view || {}) } } : null;
}
export function saveChoice(place, choice) {
  const all = readAll();
  all[placeKey(place)] = { kind: choice.kind, view: choice.view, commons: choice.kind === "commons" ? choice.commons : null, at: Date.now() };
  try { localStorage.setItem(VIEWS, JSON.stringify(all)); } catch { /* storage full or blocked: the scene still works this visit */ }
}

export const scenePhotoKey = (place) => `scene:${placeKey(place)}`;
const photoKey = scenePhotoKey;
export async function ownPhoto(place) { try { return (await get("photos", photoKey(place)))?.dataUrl || null; } catch { return null; } }
/** Re-encodes the angler's photo (1600 px, JPEG; no EXIF or GPS survives the canvas) and keeps it for this place. */
export async function saveOwnPhoto(place, file) {
  const s = await shrinkImage(file, 1600, 0.84);
  await put("photos", { id: photoKey(place), dataUrl: s.dataUrl, width: s.width, height: s.height });
  return s.dataUrl;
}
export const removeOwnPhoto = (place) => remove("photos", photoKey(place)).catch(() => {});

/** Free-licensed photos within a few km (the position is rounded to about 1 km before it leaves the phone). */
export async function nearbyPhotos(place) {
  if (PREVIEW) return { photos: [], preview: true };
  const lat = Math.round(place.lat * 100) / 100, lon = Math.round(place.lon * 100) / 100;
  try {
    const res = await fetch(`/api/scene?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, { headers: { accept: "application/json", "x-fishdock": "1" } });
    const body = await res.json().catch(() => ({}));
    return res.ok ? body : { photos: [], error: body.message || "Nearby photos aren't available just now." };
  } catch {
    return { photos: [], error: navigator.onLine === false ? "You're offline." : "Nearby photos aren't available just now." };
  }
}

/** A small copy of a nearby photo for the picker (a standard Commons thumbnail width). */
export const smallPhoto = (url) => (url.includes("/thumb/") ? url.replace(/\/1280px-/, "/330px-") : url);

/** The scene to draw at a place: { kind, view, src, label, photoKey? }. */
export async function resolveScene(place, choice = loadChoice(place)) {
  if (choice?.kind === "own") {
    const src = await ownPhoto(place);
    if (src) return { kind: "own", view: choice.view, src, label: "Your photo of this spot", photoKey: photoKey(place), photoV: choice.at || 0 };
  }
  if (choice?.kind === "commons" && choice.commons?.url) {
    return { kind: "commons", view: choice.view, src: choice.commons.url, commons: choice.commons, label: "Photo near here, not your exact view" };
  }
  return { kind: "representative", view: choice?.view || defaultView(), src: null, label: "Representative scene, not a photo of this place" };
}

function pixels(img, w) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const h = Math.max(24, Math.round((w * ih) / iw));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return { d: g.getImageData(0, 0, w, h).data, w, h };
}
// the strongest long horizontal edge between 15% and 75% of the way down, looking only at columns x0..x1
function horizonIn({ d, w, h }, x0 = 0, x1 = w) {
  const rowLum = [], rowBlue = [], n = x1 - x0;
  for (let y = 0; y < h; y++) {
    let s = 0, b = 0;
    for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; b += d[i + 2] - d[i]; }
    rowLum.push(s / n); rowBlue.push(b / n);
  }
  let best = -1, at = 0.42;
  for (let y = Math.max(2, Math.round(h * 0.15)); y < Math.min(h - 2, Math.round(h * 0.75)); y++) {
    const up = (rowLum[y - 1] + rowLum[y - 2]) / 2, dn = (rowLum[y + 1] + rowLum[y + 2]) / 2;
    const score = Math.abs(up - dn) + 0.3 * Math.abs(rowBlue[y - 2] - rowBlue[y + 2]);
    if (score > best) { best = score; at = y / h; }
  }
  return best > 6 ? Math.round(at * 1000) / 1000 : null;
}

/** A guess at the horizon in a photo: the strongest long horizontal edge between 15% and 75% of the way down. */
export function detectHorizon(img) {
  try { return horizonIn(pixels(img, 96)); } catch { return null; }
}

/** What a photo shows, measured on a small copy (numbers only; judgeView makes the call):
 *  hz      the horizon, 0 top .. 1 bottom (null when there's no clear one)
 *  tilt    how far it leans, in degrees (the horizon found in the left and right parts of the picture)
 *  water   the share of the frame below the horizon that reads as water: mostly level lines (waves, ripples,
 *          reflections) or smooth, where buildings, railings, rocks and boats bring upright edges
 *  mid     the same for the middle, where the line lands and all that a phone held upright shows of a wide photo
 *  foot    the same for the bottom strip, and sand for how much of it is a beach (a beach angler stands on it) */
export function viewFeatures(img) {
  const px = pixels(img, 120), { d, w, h } = px;
  const hz = horizonIn(px), hzL = horizonIn(px, 0, Math.round(w * 0.4)), hzR = horizonIn(px, Math.round(w * 0.6), w);
  const tilt = hz != null && hzL != null && hzR != null && Math.abs(hzL - hz) < 0.12 && Math.abs(hzR - hz) < 0.12
    ? Math.round((Math.atan2((hzR - hzL) * h, w * 0.6) * 180) / Math.PI * 10) / 10 : 0;
  const L = (x, y) => { const i = (y * w + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
  const top = Math.round(h * ((hz ?? 0.42) + 0.03)), S = 6;
  const zones = { water: [0, 0], mid: [0, 0], foot: [0, 0], sand: [0, 0] };
  let lum = 0, nl = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) { lum += L(x, y); nl++; }
  for (let cy = top; cy + S < h - 1; cy += S) {
    for (let cx = 1; cx + S < w - 1; cx += S) {
      let dx = 0, dy = 0, r = 0, gg = 0, b = 0;
      for (let y = cy; y < cy + S; y++) for (let x = cx; x < cx + S; x++) {
        dx += Math.abs(L(x + 1, y) - L(x - 1, y)); dy += Math.abs(L(x, y + 1) - L(x, y - 1));
        const i = (y * w + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2];
      }
      const n = S * S; r /= n; gg /= n; b /= n;
      const level = dy / Math.max(1, dx + dy), tex = (dx + dy) / n, mx = Math.max(r, gg, b), sat = mx ? (mx - Math.min(r, gg, b)) / mx : 0;
      const warm = r - b > 34 && sat > 0.28; // roofs, brick, sand, grass in sun
      const water = (level > 0.56 || tex < 4) && !warm && mx > 14 ? 1 : 0;
      const sand = !water && tex < 9 && r - b > 12 && sat > 0.12 && mx > 95 ? 1 : 0;
      const u = (cx + S / 2) / w, v = (cy + S / 2) / h;
      zones.water[0] += water; zones.water[1]++;
      if (u > 0.3 && u < 0.7 && v < (hz ?? 0.42) + 0.45 * (1 - (hz ?? 0.42))) { zones.mid[0] += water; zones.mid[1]++; }
      if (u > 0.2 && u < 0.8 && v > 0.8) { zones.foot[0] += water; zones.foot[1]++; zones.sand[0] += sand; zones.sand[1]++; }
    }
  }
  const f = (z) => (z[1] ? Math.round((z[0] / z[1]) * 100) / 100 : 0);
  return { hz, tilt, water: f(zones.water), mid: f(zones.mid), foot: f(zones.foot), sand: f(zones.sand), lum: Math.round(lum / Math.max(1, nl)) };
}

/** Whether a photo makes a believable backdrop for a rod held at the water's edge: { fit 0..1, ok, problems[] }.
 *  Words (from viewpointFromWords) say whether it was taken from high up; the picture says whether the water is
 *  where the line lands, whether the foreground is blocked and whether the horizon is level. */
export function judgeView(f, { elevated = false, level = false, kind = null, venue = null } = {}) {
  const problems = [];
  const foot = Math.min(1, f.foot + (venue === "beach" ? 1 : 0.5) * f.sand);
  let fit = 0.15 + 0.3 * f.water + 0.3 * f.mid + 0.25 * foot;
  if (f.hz == null) { problems.push("No clear horizon"); fit -= 0.12; }
  else if (f.hz < 0.2) { problems.push("Looks down from high up"); fit -= 0.25; } // a horizon near the top: the camera points down
  else if (f.hz > 0.7) { problems.push("Horizon too low"); fit -= 0.12; }
  if (Math.abs(f.tilt) > 4) { problems.push("Horizon tilted"); fit -= 0.2; }
  if (f.mid < 0.45) { problems.push("Little water where the line would land"); fit -= 0.15; }
  if (foot < 0.3) { problems.push("Foreground blocked"); fit -= 0.15; }
  if (elevated) { problems.push("Taken from high up"); fit -= 0.4; }
  if (f.lum < 35) { problems.push("Too dark"); fit -= 0.15; }
  if (level) fit += 0.05;
  if (suitsVenue(kind, venue)) fit += 0.05;
  fit = Math.round(Math.max(0, Math.min(1, fit)) * 100) / 100;
  return { fit, ok: fit >= 0.6 && !elevated, problems };
}

/** How much to turn a photo to level its horizon, and the zoom that keeps the corners filled (3:2 frame). */
export function levelling(tilt) {
  if (!(Math.abs(tilt) >= 1.5 && Math.abs(tilt) <= 4)) return { rot: 0, zoom: 1 }; // under 1.5° is within what a small copy can measure
  const r = (Math.abs(tilt) * Math.PI) / 180;
  return { rot: -tilt, zoom: Math.round((Math.cos(r) + 1.5 * Math.sin(r)) * 1000) / 1000 };
}

/** Nearby photos with the best views for a rod at this kind of place first, each with its verdict and viewpoint.
 *  Each is judged from its small copy; one that can't load is judged unusable rather than guessed at. */
export async function rankWaterViews(photos, venue = null) {
  const judged = await Promise.all((photos || []).map((p, i) => new Promise((res) => {
    const words = p.view || viewpointFromWords(p.title);
    const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer";
    im.onload = () => { try { const f = viewFeatures(im); res({ p, i, f, words, v: judgeView(f, { ...words, venue }) }); } catch { res({ p, i, words, v: { fit: 0, ok: false, problems: ["Couldn't check this photo"] } }); } };
    im.onerror = () => res({ p, i, words, v: { fit: 0, ok: false, problems: ["The photo didn't load"] } });
    im.src = smallPhoto(p.url);
  })));
  return judged.sort((a, b) => b.v.fit - a.v.fit || a.i - b.i)
    .map((x) => ({ ...x.p, water: x.v.fit, ok: x.v.ok, problems: x.v.problems, viewKind: x.words.kind, elevated: x.words.elevated, tilt: x.f?.tilt || 0, hz: x.f?.hz ?? null }));
}
