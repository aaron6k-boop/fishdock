// ---- myCatches: the angler's own logged catches, matched to a place on this phone (nothing is sent) ----
// A catch counts for a place when it was logged at that documented mark, or its saved position is within 1.5 km.
import { useEffect, useState } from "react";
import { all, onChange } from "./storage.js";
import { distanceKm } from "./geo.js";
import { speciesById } from "../data/species.js";

export const NEAR_KM = 1.5;

/** Map of species id → { n, last } for catches at this place. */
export function catchesNear(catches, place) {
  const out = new Map();
  if (!place) return out;
  for (const c of catches || []) {
    if (!c?.species || c.deleted) continue;
    const pos = c.pos?.lat != null ? { lat: c.pos.lat, lon: c.pos.lon ?? c.pos.lng } : c.place?.lat != null ? { lat: c.place.lat, lon: c.place.lon } : null;
    const atMark = place.id && place.id !== "custom" && place.id !== "pin" && c.place?.id === place.id;
    const near = pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon) && distanceKm(place, pos) <= NEAR_KM;
    if (!atMark && !near) continue;
    const prev = out.get(c.species) || { n: 0, last: 0 };
    out.set(c.species, { n: prev.n + 1, last: Math.max(prev.last, c.at || 0) });
  }
  return out;
}

/** Adds the angler's own catches to catchHere rows: a badge on listed fish, and a "Yours" row for any fish not listed. */
export function withMine(rows, mine, month) {
  const ids = new Set(rows.map((r) => r.species.id));
  const out = rows.map((r) => (mine.has(r.species.id) ? { ...r, mine: mine.get(r.species.id) } : r));
  for (const [id, m] of mine) {
    if (ids.has(id)) continue;
    const sp = speciesById(id);
    if (!sp) continue;
    const inSeason = sp.peak?.includes(month) ? "peak" : sp.present?.includes(month) ? "present" : "out";
    out.push({ species: sp, level: "yours", reason: "You've caught this here", note: "", inSeason, mine: m });
  }
  const rank = { peak: 2, present: 1, out: 0 };
  return out.sort((a, b) => rank[b.inSeason] - rank[a.inSeason] || (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
}

/** The angler's catches, kept fresh as they log more. */
export function useMyCatches() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let gone = false;
    const load = () => all("catches").then((x) => { if (!gone) setList(x || []); }).catch(() => {});
    load();
    const off = onChange?.((store) => { if (store === "catches") load(); });
    return () => { gone = true; if (typeof off === "function") off(); };
  }, []);
  return list;
}
