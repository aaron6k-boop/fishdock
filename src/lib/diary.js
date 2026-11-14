// ---- diary: your fishing name and the fish you've caught in the game, kept on this phone ----
// The name is what other players see you as at the same place (2 to 20 letters, numbers, spaces, hyphens or
// apostrophes); chosen the first time you play. The diary: every fish landed in the game, with its species, length,
// the place and the time, and whether you kept it or put it back. Stored in this browser only (localStorage), the
// newest 5,000 (your level and badges are worked out from it: src/lib/progress.js). A game catch: never a real record,
// and never shared as one.

const NAME_KEY = "fishdock.playerName", DIARY_KEY = "fishdock.diary", MAX = 5000;

const store = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };

/** A name tidied as it'll be shown, or null if it can't be one. */
export function cleanName(s) {
  if (typeof s !== "string") return null;
  const t = s.normalize("NFKC").replace(/[^\p{L}\p{N} '\-]/gu, "").replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= 20 ? t : null;
}
export const playerName = () => cleanName(store()?.getItem(NAME_KEY) || "");
export function setPlayerName(s) { const n = cleanName(s); if (!n) return null; try { store()?.setItem(NAME_KEY, n); } catch { /* full or blocked: lasts this visit */ } return n; }

/** The diary, newest first. */
export function diary() {
  try { const v = JSON.parse(store()?.getItem(DIARY_KEY) || "[]"); return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string") : []; } catch { return []; }
}
function save(list) { try { store()?.setItem(DIARY_KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* full or blocked */ } }

/** Adds a landed catch (once: the same catch event again changes nothing). Returns the entry. */
export function addCatch({ id, species, name, lengthCm, weightKg = null, place = null, placeName = null, at = Date.now(), night = false, rough = false }) {
  if (!id || !species) return null;
  const list = diary(); const had = list.find((e) => e.id === String(id)); if (had) return had;
  const e = { id: String(id), species, name: name || species, lengthCm: Number.isFinite(lengthCm) ? Math.round(lengthCm) : null, weightKg: Number.isFinite(weightKg) ? weightKg : null, place, placeName, at, outcome: null, ...(night ? { night: true } : {}), ...(rough ? { rough: true } : {}) };
  save([e, ...list]); return e;
}
/** Kept or put back. */
export function setOutcome(id, outcome) {
  if (outcome !== "kept" && outcome !== "released") return;
  const list = diary(), e = list.find((x) => x.id === String(id)); if (!e || e.outcome === outcome) return;
  e.outcome = outcome; save(list);
}
export function clearDiary() { try { store()?.removeItem(DIARY_KEY); } catch { /* blocked */ } }

/** Totals for the top of the diary: how many, how many kinds, the biggest, and by day (newest first). */
export function summary(list = diary()) {
  const kinds = new Set(list.map((e) => e.species)), big = list.reduce((b, e) => (e.lengthCm && (!b || e.lengthCm > b.lengthCm) ? e : b), null);
  const days = []; for (const e of list) { const d = new Date(e.at).toDateString(); let g = days.find((x) => x.day === d); if (!g) days.push((g = { day: d, at: e.at, list: [] })); g.list.push(e); }
  return { count: list.length, kinds: kinds.size, biggest: big, days };
}
