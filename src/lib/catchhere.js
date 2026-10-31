// ---- What Can I Catch Here? ----
// Evidence levels, strongest first. A species is never said to be "here" at an exact point:
//   common     - named as a main species for this mark by published angling sources
//   seasonal   - recorded here by those sources for part of the year
//   occasional - recorded at this mark less often, or at a documented mark nearby (within 25 km)
//   possible   - only the habitat and the species' known UK range suggest it; no record found
import { SPOTS } from "../data/spots.js";
import { SPECIES, speciesById } from "../data/species.js";
import { distanceKm, fmtKm } from "./geo.js";

export const LEVELS = {
  common: { label: "Commonly recorded", short: "Common", rank: 4 },
  seasonal: { label: "Seasonally present", short: "Seasonal", rank: 3 },
  occasional: { label: "Occasionally recorded", short: "Occasional", rank: 2 },
  possible: { label: "Possible from habitat", short: "Possible", rank: 1 },
  yours: { label: "You've caught it here", short: "Yours", rank: 5 },
};

/** Which stretch of coast a point is on, for species ranges. Rough by design. */
export function coastOf(lat, lon) {
  if (lat > 53.9 && lat < 55.45 && lon < -5.35) return "ni";
  if (lat > 55.8 || (lat > 54.97 && lon < -3.1)) return lon < -3.6 ? "scotland-west" : "scotland-east";
  if (lon < -4.2 && lat < 51.3) return "southwest";
  if (lat < 51.2 && lon < -2.9) return "southwest";
  if (lat < 51.4) return "south";
  if (lon < -2.75 && lat < 53.45) return "wales";
  if (lon < -2.4) return "northwest";
  if (lat > 53.6) return "northeast";
  return "east";
}

const kindMatches = (sp, kind) => (kind === "sea" ? sp.type === "sea" || sp.type === "both" : sp.type === "fresh" || sp.type === "both");

export function catchHere(place, month) {
  const out = new Map();
  const add = (id, level, reason, note) => {
    const sp = speciesById(id);
    if (!sp) return;
    const prev = out.get(id);
    if (!prev || LEVELS[level].rank > LEVELS[prev.level].rank) out.set(id, { species: sp, level, reason, note: note || prev?.note || "" });
  };
  // 1. this mark's own published records
  if (place.verified && place.species) {
    for (const s of place.species) add(s.id, s.level || "common", `Listed for ${place.name}`, s.note);
  }
  // Does this species live in this kind of water? ("sea" alone, an older "My location" choice, says nothing more.)
  const water = place.subtype || place.kind;
  const suits = (sp) => kindMatches(sp, place.kind) && (!sp.waters || !water || water === "sea" || sp.waters.some((w) => w === water || (water === "fishery" && w === "lake") || (water === "reservoir" && w === "lake") || (water === "lake" && w === "reservoir")));
  // 2. documented marks nearby of the same kind, for species that suit this water (a lake beside a river
  //    doesn't get the river's salmon and barbel)
  for (const s of SPOTS) {
    if (s.id === place.id || (s.kind === "sea") !== (place.kind === "sea")) continue;
    const d = distanceKm(place, s);
    if (d > 25) continue;
    for (const x of s.species || []) { const sp = speciesById(x.id); if (sp && suits(sp)) add(x.id, "occasional", `Recorded at ${s.name}, ${fmtKm(d, true)} away`); }
  }
  // 3. habitat and range only
  const coast = coastOf(place.lat, place.lon);
  for (const sp of SPECIES) {
    if (!suits(sp)) continue;
    if (sp.range && !sp.range.includes(coast) && !sp.range.includes("uk")) continue;
    add(sp.id, "possible", "Suitable habitat within its UK range");
  }
  const list = [...out.values()].map((r) => {
    const peak = r.species.peak?.includes(month), present = r.species.present?.includes(month);
    return { ...r, inSeason: peak ? "peak" : present ? "present" : "out" };
  });
  // What's in season now comes first (peak, then present, then out of season). Within that, fish of the current
  // half of the year lead (winter fish in winter, summer fish in summer), then mixed or all-year fish, then the
  // rest; then the strength of the evidence.
  const seasonRank = { peak: 2, present: 1, out: 0 };
  const half = SUMMER.has(month) ? "Summer" : "Winter";
  const fit = (sp) => { const w = seasonWord(sp); return w === half ? 2 : w === "Summer and winter" || w === "All year" ? 1 : 0; };
  return list.sort((a, b) => seasonRank[b.inSeason] - seasonRank[a.inSeason] || fit(b.species) - fit(a.species) || LEVELS[b.level].rank - LEVELS[a.level].rank || a.species.name.localeCompare(b.species.name));
}

/** The best target for "auto": the strongest in-season species at this place. */
export function autoTarget(place, month) {
  const list = catchHere(place, month);
  // At a documented mark, follow the sources' own order (they list the headline species first).
  const order = (id) => { const i = (place.species || []).findIndex((x) => x.id === id); return i < 0 ? 99 : i; };
  const recorded = list.filter((r) => r.level !== "possible").sort((a, b) => order(a.species.id) - order(b.species.id));
  return (recorded.find((r) => r.inSeason === "peak") || recorded.find((r) => r.inSeason === "present") || list.find((r) => r.inSeason !== "out") || list[0])?.species || null;
}

const SUMMER = new Set([4, 5, 6, 7, 8, 9]);
/** "Summer", "Winter", "Summer and winter" or "All year", from a species' peak and present months. */
export function seasonWord(species) {
  const peak = species?.peak || [], present = species?.present || [];
  if (present.length >= 12 && peak.length >= 8) return "All year";
  const s = peak.filter((m) => SUMMER.has(m)).length, w = peak.length - s;
  if (s >= 2 && w >= 2) return "Summer and winter";
  if (!peak.length) return present.length >= 12 ? "All year" : "";
  return s >= w ? "Summer" : "Winter";
}
