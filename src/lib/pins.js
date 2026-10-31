// ---- pins: spots the angler pins on the map to check fishing there. Kept in this phone's settings only ----
// A pin is never sent anywhere as a pin. Checking fishing at one asks /api/conditions (and tides or rivers) for
// its area, and the server snaps that to a grid cell before calling any upstream.
import { SPOTS } from "../data/spots.js";
import { distanceKm, nationAt } from "./geo.js";

// The water type picks the species habitat (species.waters), the BiteScore weights (sea, river or still) and
// whether tides or river levels are fetched. Sea types are the same subtypes the documented marks use.
export const WATERS = [
  { id: "beach", kind: "sea", label: "Beach", hint: "Sand or shingle" },
  { id: "pier", kind: "sea", label: "Pier or harbour", hint: "Walls and breakwaters" },
  { id: "rocks", kind: "sea", label: "Rocks", hint: "Rock marks and ledges" },
  { id: "estuary", kind: "sea", label: "Estuary", hint: "Tidal river mouth" },
  { id: "river", kind: "river", label: "River", hint: "Running water" },
  { id: "lake", kind: "lake", label: "Lake or pond", hint: "Includes reservoirs" },
  { id: "canal", kind: "canal", label: "Canal", hint: "Still, narrow water" },
  { id: "fishery", kind: "fishery", label: "Day-ticket fishery", hint: "Stocked lakes" },
];
export const waterById = (id) => WATERS.find((w) => w.id === id) || null;
/** Subtypes the map lookup and the documented marks use that fold into a water type here. */
const FOLD = { reservoir: "lake", breakwater: "pier", harbour: "pier" };
export const waterFor = (subtype) => waterById(FOLD[subtype] || subtype);

export const MAX_PINS = 50;

const valid = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat: +lat.toFixed(5), lon: +lon.toFixed(5) } : null);

/** Great Britain, Northern Ireland, the Isle of Man and the Channel Islands, roughly. */
export function inUk(lat, lon) {
  return lat >= 49.1 && lat <= 61 && lon >= -8.7 && lon <= 2.1;
}

/**
 * Reads a position from what people paste: "50.6123, -2.4567", "50.6123N 2.4567W", 50°36'44.3"N 2°27'24.1"W,
 * or a Google Maps link (…/@50.61,-2.45,15z, ?q=50.61,-2.45, ?query=…, ll=…). Returns { lat, lon } or null.
 */
export function parseCoords(text) {
  if (!text) return null;
  let s = String(text).trim();
  try { s = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* keep as typed */ }
  // links
  const link = s.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    || s.match(/[?&](?:q|query|ll|center|destination|daddr)=(?:loc:)?\s*(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/i);
  if (link) return valid(+link[1], +link[2]);
  // degrees, minutes, seconds with hemispheres
  const dms = [...s.matchAll(/(\d{1,3}(?:\.\d+)?)\s*[°º]\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:["″”]|'')\s*)?([NSEW])/gi)];
  if (dms.length >= 2) {
    const val = (m) => (+m[1] + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600) * (/[SW]/i.test(m[4]) ? -1 : 1);
    const lat = dms.find((m) => /[NS]/i.test(m[4])), lon = dms.find((m) => /[EW]/i.test(m[4]));
    return lat && lon ? valid(val(lat), val(lon)) : null;
  }
  // decimal degrees, optionally with hemisphere letters
  const dec = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])?\s*$/i);
  if (dec) {
    let a = +dec[1], b = +dec[3];
    const ha = (dec[2] || "").toUpperCase(), hb = (dec[4] || "").toUpperCase();
    if (ha === "S" || ha === "W") a = -Math.abs(a);
    if (hb === "S" || hb === "W") b = -Math.abs(b);
    if (ha === "E" || ha === "W" || hb === "N" || hb === "S") [a, b] = [b, a]; // written longitude first
    else if (!ha && !hb && !inUk(a, b) && inUk(b, a)) [a, b] = [b, a]; // "-2.45, 50.61": clearly the wrong way round
    return valid(a, b);
  }
  return null;
}

/** The nearest documented mark, for naming a pin and for context. */
export function nearestSpot(lat, lon) {
  let best = null;
  for (const s of SPOTS) {
    const d = distanceKm({ lat, lon }, s);
    if (!best || d < best.d) best = { spot: s, d };
  }
  return best;
}

const shortName = (name) => name.replace(/\s*\(.*\)\s*$/, "").trim();

export function defaultPinName(lat, lon) {
  const n = nearestSpot(lat, lon);
  return n && n.d <= 10 ? `Pin near ${shortName(n.spot.name)}` : "Pinned spot";
}

/** A pin record. Positions are kept to 5 decimal places (about 1 m), as the angler's own GPS marks are. */
export function makePin({ lat, lon, water, name, id, createdAt, now = Date.now() }) {
  const w = waterById(water);
  const p = valid(+lat, +lon);
  if (!w || !p) return null;
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40);
  return {
    id: id || `pin-${now.toString(36)}`,
    name: clean || defaultPinName(p.lat, p.lon),
    lat: p.lat, lon: p.lon,
    kind: w.kind, subtype: w.id,
    nation: nationAt(p.lat, p.lon),
    createdAt: createdAt || now,
    updatedAt: now,
  };
}

/** Adds or replaces a pin (newest first), keeping at most MAX_PINS. */
export function savePin(pins, pin, max = MAX_PINS) {
  return [pin, ...(pins || []).filter((p) => p.id !== pin.id)].slice(0, max);
}

export function removePin(pins, id) {
  return (pins || []).filter((p) => p.id !== id);
}

/** The settings.custom place for a pin (App adds id "custom" and verified: false). */
export function placeFromPin(pin) {
  return { name: pin.name, lat: pin.lat, lon: pin.lon, kind: pin.kind, subtype: pin.subtype, nation: pin.nation, pinId: pin.id };
}
