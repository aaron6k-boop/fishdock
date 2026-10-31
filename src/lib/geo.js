// ---- geo: distances, bearings, nations, privacy rounding ----

const R = 6371; // km
const rad = Math.PI / 180;

export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

export function compass(deg) {
  if (deg == null || Number.isNaN(deg)) return "";
  return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16];
}

/** Rough nation for UK rules. Borders are approximated, so callers show "check locally" and let people override. */
export function nationAt(lat, lon) {
  if (lat == null || lon == null) return null;
  if (lat > 53.9 && lat < 55.45 && lon < -5.35 && lon > -8.25) return "Northern Ireland";
  // England–Scotland border: Solway Firth (54.95, -3.1) to Berwick (55.78, -2.03).
  if (lon <= -3.1 ? lat > 54.97 : lon >= -2.03 ? lat > 55.81 : lat > 54.95 + ((lon + 3.1) / 1.07) * 0.83) return "Scotland";
  // England–Wales border, approximated by the Dee estuary, Offa's Dyke line and the Severn.
  if (lat > 51.35 && lat < 53.45) {
    const borderLon = lat > 53.0 ? -3.0 : lat > 52.4 ? -3.05 : lat > 51.8 ? -2.95 : -2.65;
    if (lon < borderLon) return "Wales";
  }
  if (lat > 49.8 && lat < 56 && lon > -6.5 && lon < 2) return "England";
  return null;
}

/** Coarse 10 km square label for sharing ("approximate location"). Never reveals more than ~10 km. */
export function coarseCell(lat, lon) {
  const qLat = Math.floor(lat * 10) / 10, qLon = Math.floor(lon * 7) / 7; // ~11 km x ~10 km at UK latitudes
  return { lat: +(qLat + 0.05).toFixed(2), lon: +(qLon + 1 / 14).toFixed(2), label: `${qLat.toFixed(1)}°, ${qLon.toFixed(1)}° (10 km area)` };
}

// ---- distances: miles by default (UK roads and anglers), kilometres if chosen in Settings ----
let UNIT = "mi";
/** Set from settings.units.distance on every App render, so every screen formats the same way. */
export function setDistanceUnit(u) { UNIT = u === "km" ? "km" : "mi"; }
export const distanceUnit = () => UNIT;
/** The size of the approximate area used when sharing (coarseCell), in the chosen unit. */
export const areaSize = () => (UNIT === "km" ? "10 km" : "6 miles");

/** A distance given in km, in the chosen unit. long: "12 miles" rather than "12 mi". Short distances in yards or metres. */
export function fmtKm(km, long = false) {
  if (km == null || !Number.isFinite(km)) return "";
  if (UNIT === "km") {
    return km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : km < 10 ? `${+km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  const mi = km / 1.609344;
  if (mi < 0.25) return `${Math.max(10, Math.round(mi * 1760 / 10) * 10)} yd`;
  const v = mi < 10 ? +mi.toFixed(1) : Math.round(mi);
  return `${v}${long ? (v === 1 ? " mile" : " miles") : " mi"}`;
}

export function mapsLink(lat, lon, label) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}${label ? "" : ""}`;
}
