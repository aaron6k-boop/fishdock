// Text that would reveal where someone fishes: coordinates, grid references, postcodes, what3words and map links
// (ported from DetectDock's server/locationText.js). Used wherever a person types something other people will see
// (Community posts and their area label). It's a pattern check: it can't recognise a mark's name, so the app also
// says plainly that anything public shows a region or a 10 km area at most.

const LOCATION_PATTERNS = [
  /-?\b\d{1,2}\.\d{3,}\s*[,;/ ]\s*-?\d{1,3}\.\d{3,}\b/, // decimal lat, lng
  /-?\b\d{1,2}\.\d{2,}\s*°\s*[NS]?\s*[,;/ ]?\s*-?\d{1,3}\.\d{2,}\s*°?/i, // 50.63°, -2.45° (FishDock addition)
  /\b\d{1,3}°\s*\d{1,2}['′]/, // degrees/minutes
  /\b\d{1,2}(?:\.\d+)?\s*°\s*[NS]\b/i, // 52°N, 52.5° N
  /\b\d{1,2}\.\d+\s*°?\s*[NS]\b[\s,;/]*\d{1,3}(?:\.\d+)?\s*°?\s*[EW]\b/i, // 53.5228N 1.1285W, 52.1N 1.2W
  /\b[NS]\s?\d{1,2}\.\d+[\s,;/]+[EW]\s?\d{1,3}\.\d+\b/i, // N52.1 W1.2
  /\b(?:H[L-Z]|N[A-HJ-Z]|O[ABFGLMQRVW]|S[A-HJ-Z]|T[AFGLMQRV])\s?\d{2,5}\s?\d{2,5}\b/i, // OS grid reference
  /\/\/\/[a-z]+\.[a-z]+\.[a-z]+/i, // what3words
  /\b(?:[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?)\s*\d[ABD-HJLNP-UW-Z]{2}\b/i, // UK postcode
  /\b(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|maps\.apple\.com|what3words\.com|goo\.gl\/maps)\b/i,
];

// Short decimal pairs such as "52.1, -1.2": flagged when they read as a latitude and longitude (a first number in
// the British Isles' latitude band, or a minus sign), not for any two numbers ("1.4 kg, 18.5 cm" stays allowed).
const PAIR_RE = /(-?\d{1,3}\.\d+)\s*°?\s*[,;/ ]\s*(-?\d{1,3}\.\d+)/g;
function decimalPair(text) {
  for (const m of text.matchAll(PAIR_RE)) {
    const a = Number(m[1]), b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) continue;
    if ((a >= 49 && a <= 62) || m[1].startsWith("-") || m[2].startsWith("-")) return true;
  }
  return false;
}

export function looksLikeLocation(text) {
  const s = String(text || "");
  return LOCATION_PATTERNS.some((re) => re.test(s)) || decimalPair(s);
}

// ---- coarse areas (FishDock) ----
// A post's `area` may be a place or region name, a 10 km OS (or Irish) grid square such as "SY68" or "SY 6 8",
// or a latitude and longitude to one decimal place (about 11 km by 7 km in the UK), as the app's own
// "approximate location" label writes it: "50.6°, -2.4° (10 km area)". Anything finer is refused.

const OS_10KM = /^(?:H[L-Z]|N[A-HJ-Z]|O[ABFGLMQRVW]|S[A-HJ-Z]|T[AFGLMQRV])\s?\d\s?\d$/i;
const IRISH_10KM = /^[A-HJ-Z]\s?\d\s?\d$/i;
const COARSE_PAIR = /^(-?\d{1,2}(?:\.\d)?)\s*°?\s*[NS]?\s*[,;/ ]\s*(-?\d{1,3}(?:\.\d)?)\s*°?\s*[EW]?\s*(?:\(\s*10\s*km(?:\s+(?:area|square))?\s*\))?$/i;
const FINE_NUMBER = /\d\.\d{2,}/; // any number with two or more decimals
// An OS grid square then three or more figures (finer than 10 km), or a whole label that is an Irish grid reference
// finer than 10 km. (A road such as "A350" inside a longer label isn't a grid reference and stays allowed.)
const FINE_GRID = /\b(?:H[L-Z]|N[A-HJ-Z]|O[ABFGLMQRVW]|S[A-HJ-Z]|T[AFGLMQRV])\s?\d{3,}/i;
const FINE_IRISH = /^[A-HJ-Z]\s?\d{2,5}\s?\d{2,5}$/i;

/**
 * "ok" for an area label that is coarse enough to be public, "fine" for one that pins a place more closely
 * than about 10 km (coordinates with two or more decimals, a grid reference finer than 10 km, a postcode, a
 * what3words address or a map link).
 */
export function areaCheck(label) {
  const s = String(label || "").trim();
  if (!s) return "ok";
  if (OS_10KM.test(s) || IRISH_10KM.test(s)) return "ok";
  const pair = COARSE_PAIR.exec(s);
  if (pair) {
    const a = Number(pair[1]), b = Number(pair[2]);
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? "ok" : "fine";
  }
  if (FINE_NUMBER.test(s) || FINE_GRID.test(s) || FINE_IRISH.test(s) || looksLikeLocation(s)) return "fine";
  return "ok";
}
