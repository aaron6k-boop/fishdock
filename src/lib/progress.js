// ---- progress: your level, XP, medals, species book, personal bests and badges in the game ----
// Worked out from the game diary on this phone (src/lib/diary.js), so it always agrees with it and can't drift. Game
// catches only: nothing here is a real catch or a real record, and none of it ever opens or closes a place.
//
// XP for a fish: how big a fish that kind usually is in the game (its usual length, DRAW_CM), how big this one is
// against that (squared, so a big one counts for much more), and its medal. Then:
//   - the first of a kind: a discovery bonus;
//   - your biggest of that kind yet: a personal best bonus;
//   - the same kind again the same day: a little less each time (down to a third), so a run of easy fish isn't the
//     quickest way up. A new day starts afresh.
// Medals, by length against that usual length: bronze from the usual length, silver from 1.15 times, gold from 1.3,
// specimen from 1.5. (The game's own sizes, not the angling clubs' specimen lists.)
import { DRAW_CM } from "./liveEvents.js";

export const MEDALS = [
  { id: "specimen", name: "Specimen", at: 1.5, mult: 2.5 },
  { id: "gold", name: "Gold", at: 1.3, mult: 1.6 },
  { id: "silver", name: "Silver", at: 1.15, mult: 1.3 },
  { id: "bronze", name: "Bronze", at: 1.0, mult: 1.1 },
];
export const XP = { firstKind: 60, best: 20, repeat: 0.85, floor: 0.35 };
const usual = (species) => DRAW_CM[species] || 40;

/** The medal a fish of this length earns (null below the usual size). */
export function medalFor(species, lengthCm) {
  if (!Number.isFinite(lengthCm)) return null;
  const r = lengthCm / usual(species);
  return MEDALS.find((m) => r >= m.at) || null;
}

/** Total XP needed to reach a level: 100 for level 2, 300 for 3, 600 for 4, 1,000 for 5, 4,500 for 10. */
export const xpToReach = (level) => 50 * (level - 1) * level;
/** The level for an XP total, and how far into it: { level, xp, from, to, into, need, pct }. */
export function levelFor(xp) {
  const x = Math.max(0, Math.floor(xp || 0));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * x) / 100)) / 2));
  while (xpToReach(level + 1) <= x) level++;
  while (level > 1 && xpToReach(level) > x) level--;
  const from = xpToReach(level), to = xpToReach(level + 1);
  return { level, xp: x, from, to, into: x - from, need: to - x, pct: (x - from) / (to - from) };
}

const dayOf = (t) => new Date(t).toDateString();

/**
 * Every catch with what it earned, oldest first: { e, xp, medal, first, best, parts }. The diary is newest first.
 * parts: what made up the XP, for showing ("Silver bass 52 cm", "+60 first bass", ...).
 */
export function replay(list) {
  const out = [], best = new Map(), sameDay = new Map();
  for (const e of [...list].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    const sp = e.species, cm = Number.isFinite(e.lengthCm) ? e.lengthCm : usual(sp) * 0.8;
    const medal = medalFor(sp, cm), r = cm / usual(sp);
    const k = `${dayOf(e.at || 0)}|${sp}`, n = sameDay.get(k) || 0; sameDay.set(k, n + 1);
    const repeat = Math.max(XP.floor, Math.pow(XP.repeat, n));
    const base = Math.round((8 + 0.5 * usual(sp)) * r * r * (medal?.mult || 1) * repeat);
    const had = best.get(sp), first = had === undefined, isBest = !first && cm > had;
    if (first || isBest) best.set(sp, cm);
    const xp = base + (first ? XP.firstKind : 0) + (isBest ? XP.best : 0);
    out.push({ e, xp, medal, first, best: isBest, repeat, base });
  }
  return out;
}

// ---- badges: earned once, kept ----
export const BADGES = [
  { id: "first", name: "First fish", desc: "Land your first fish", test: (s) => s.count >= 1 },
  { id: "ten", name: "Into double figures", desc: "Land 10 fish", test: (s) => s.count >= 10 },
  { id: "fifty", name: "Fifty up", desc: "Land 50 fish", test: (s) => s.count >= 50 },
  { id: "hundred", name: "The ton", desc: "Land 100 fish", test: (s) => s.count >= 100 },
  { id: "kinds5", name: "Mixed bag", desc: "Catch 5 kinds of fish", test: (s) => s.kinds >= 5 },
  { id: "kinds10", name: "Naturalist", desc: "Catch 10 kinds of fish", test: (s) => s.kinds >= 10 },
  { id: "kinds20", name: "Full set in sight", desc: "Catch 20 kinds of fish", test: (s) => s.kinds >= 20 },
  { id: "silver", name: "Silver", desc: "Land a silver-medal fish", test: (s) => s.medals.silver + s.medals.gold + s.medals.specimen >= 1 },
  { id: "gold", name: "Gold", desc: "Land a gold-medal fish", test: (s) => s.medals.gold + s.medals.specimen >= 1 },
  { id: "specimen", name: "Specimen hunter", desc: "Land a specimen fish", test: (s) => s.medals.specimen >= 1 },
  { id: "places3", name: "Wanderer", desc: "Catch fish at 3 places", test: (s) => s.places >= 3 },
  { id: "places10", name: "Coast to coast", desc: "Catch fish at 10 places", test: (s) => s.places >= 10 },
  { id: "release25", name: "Back they go", desc: "Put 25 fish back", test: (s) => s.released >= 25 },
  { id: "night", name: "After dark", desc: "Land a fish at night", test: (s) => s.night >= 1 },
  { id: "rough", name: "Hardy", desc: "Land a fish in the rain or a strong wind", test: (s) => s.rough >= 1 },
  { id: "day10", name: "Good session", desc: "Land 10 fish in one day", test: (s) => s.bestDay >= 10 },
];

// ---- the day's challenges: three each day, the same for everyone that day, each worth a bonus once done ----
// (picked from the date, so they're there before you've caught anything and change at midnight; done or not, worked
// out from that day's catches, so they count in your XP for good)
export const CHALLENGES = [
  { id: "kinds3", name: "Catch 3 different kinds", test: (d) => new Set(d.rows.map((r) => r.e.species)).size >= 3 },
  { id: "five", name: "Land 5 fish", test: (d) => d.rows.length >= 5 },
  { id: "medal", name: "Land a fish with a medal", test: (d) => d.rows.some((r) => r.medal) },
  { id: "silver", name: "Land a silver medal or better", test: (d) => d.rows.some((r) => r.medal && r.medal.id !== "bronze") },
  { id: "release3", name: "Put 3 fish back", test: (d) => d.rows.filter((r) => r.e.outcome === "released").length >= 3 },
  { id: "newkind", name: "Add a new kind to your book", test: (d) => d.rows.some((r) => r.first) },
  { id: "best", name: "Beat one of your personal bests", test: (d) => d.rows.some((r) => r.best) },
  { id: "place2", name: "Land fish at 2 places", test: (d) => new Set(d.rows.map((r) => r.e.place).filter(Boolean)).size >= 2 },
];
export const CHALLENGE_XP = 40;
const ukDay = (t) => new Date(t).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
const dayHash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
/** The three challenges for the day a time falls on (UK days). */
export function challengesFor(t) {
  const pool = [...CHALLENGES], out = []; let h = dayHash(ukDay(t));
  while (out.length < 3) { out.push(pool.splice(h % pool.length, 1)[0]); h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; }
  return out;
}
/** Each day's challenges and which were done, from the replayed catches: [{ day, at, list: [{ id, name, done, doneAt }] }]. */
export function challengeDays(rows) {
  const by = new Map();
  for (const r of rows) { const d = ukDay(r.e.at || 0); if (!by.has(d)) by.set(d, { day: d, at: r.e.at || 0, rows: [] }); by.get(d).rows.push(r); }
  return [...by.values()].map((d) => ({ day: d.day, at: d.at, list: challengesFor(d.at).map((c) => {
    // (when it was done: the catch that first made it true)
    let doneAt = null; for (let i = 1; i <= d.rows.length && doneAt == null; i++) if (c.test({ rows: d.rows.slice(0, i) })) doneAt = d.rows[i - 1].e.at;
    // (put-backs are known only once you've decided, so the whole day is checked too)
    if (doneAt == null && c.test(d)) doneAt = d.rows.at(-1).e.at;
    return { id: c.id, name: c.name, done: doneAt != null, doneAt };
  }) }));
}

/** Everything for the logbook: level, totals, species book, badges (with when each was earned), each catch's XP, and
 * today's challenges. */
export function progress(list = [], now = Date.now()) {
  const rows = replay(list), days = challengeDays(rows), bonus = days.reduce((a, d) => a + d.list.filter((c) => c.done).length * CHALLENGE_XP, 0);
  const total = rows.reduce((a, r) => a + r.xp, 0) + bonus;
  const s = { count: 0, kinds: 0, places: 0, released: 0, night: 0, rough: 0, bestDay: 0, medals: { bronze: 0, silver: 0, gold: 0, specimen: 0 } };
  const kinds = new Map(), places = new Set(), perDay = new Map(), earned = new Map();
  let running = 0;
  for (const r of rows) {
    const e = r.e; running += r.xp; s.count++;
    const k = kinds.get(e.species) || { species: e.species, name: e.name || e.species, n: 0, best: null, medal: null, first: e.at };
    k.n++; if (Number.isFinite(e.lengthCm) && (!k.best || e.lengthCm > k.best.lengthCm)) k.best = e;
    if (r.medal && (!k.medal || MEDALS.indexOf(r.medal) < MEDALS.indexOf(k.medal))) k.medal = r.medal;
    kinds.set(e.species, k); s.kinds = kinds.size;
    if (e.place) places.add(e.place); s.places = places.size;
    if (e.outcome === "released") s.released++;
    if (e.night) s.night++;
    if (e.rough) s.rough++;
    if (r.medal) s.medals[r.medal.id]++;
    const d = dayOf(e.at || 0); perDay.set(d, (perDay.get(d) || 0) + 1); s.bestDay = Math.max(s.bestDay, perDay.get(d));
    for (const b of BADGES) if (!earned.has(b.id) && b.test(s)) earned.set(b.id, { at: e.at, xpThen: running });
  }
  return {
    ...levelFor(total), stats: s,
    species: [...kinds.values()].sort((a, b) => a.name.localeCompare(b.name)),
    badges: BADGES.map((b) => ({ id: b.id, name: b.name, desc: b.desc, got: earned.has(b.id), at: earned.get(b.id)?.at ?? null })),
    rows, challengeXp: bonus,
    today: days.find((d) => d.day === ukDay(now))?.list || challengesFor(now).map((c) => ({ id: c.id, name: c.name, done: false, doneAt: null })),
  };
}

/** What one new catch earned and changed, for the toast after you've decided: { xp, medal, first, best, levelUp, level,
 * badges, challenges }. listBefore: the diary before it (with this catch's outcome, if decided, on the entry). */
export function afterCatch(listBefore, entry, now = entry?.at ?? Date.now()) {
  const before = progress(listBefore, now), after = progress([entry, ...listBefore.filter((e) => e.id !== entry.id)], now);
  const row = after.rows.find((r) => r.e.id === entry.id) || null;
  const was = new Set(before.badges.filter((b) => b.got).map((b) => b.id)), wasDone = new Set(before.today.filter((c) => c.done).map((c) => c.id));
  return { xp: row?.xp || 0, medal: row?.medal || null, first: !!row?.first, best: !!row?.best, level: after.level, levelUp: after.level > before.level, badges: after.badges.filter((b) => b.got && !was.has(b.id)), challenges: after.today.filter((c) => c.done && !wasDone.has(c.id)) };
}
