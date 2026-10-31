// ---- scene: the backdrop of the Live Fishing View for each place ----
// Best: the angler's own photo of where they're fishing, lined up with where the rod points (GPS alone can't know
// the view). Next: a free-licensed photo taken near the place (Wikimedia Commons, via /api/scene), labelled
// "Photo near here". Otherwise a representative scene, labelled as such. The chosen viewpoint is kept per place on
// this phone. Own photos are re-encoded on the phone (which drops EXIF and GPS) and stay here unless shared.
import { get, put, remove, shrinkImage } from "./storage.js";
import { PREVIEW } from "./api.js";

const VIEWS = "fishdock.sceneViews.v1";

export const placeKey = (place) => (place?.id && place.id !== "custom" ? place.id : `c:${Number(place?.lat || 0).toFixed(3)},${Number(place?.lon || 0).toFixed(3)}`);
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

/** A guess at the horizon in a photo: the strongest long horizontal edge between 15% and 75% of the way down. */
export function detectHorizon(img) {
  try {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const w = 96, h = Math.max(24, Math.round((96 * ih) / iw));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const rowLum = [], rowBlue = [];
    for (let y = 0; y < h; y++) {
      let s = 0, b = 0;
      for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; b += d[i + 2] - d[i]; }
      rowLum.push(s / w); rowBlue.push(b / w);
    }
    let best = -1, at = 0.42;
    for (let y = Math.round(h * 0.15); y < Math.round(h * 0.75); y++) {
      const up = (rowLum[y - 1] + rowLum[y - 2]) / 2, dn = (rowLum[y + 1] + rowLum[y + 2]) / 2;
      const score = Math.abs(up - dn) + 0.3 * Math.abs(rowBlue[y - 2] - rowBlue[y + 2]);
      if (score > best) { best = score; at = y / h; }
    }
    return best > 6 ? Math.round(at * 1000) / 1000 : null;
  } catch { return null; }
}
