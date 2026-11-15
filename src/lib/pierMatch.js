// ---- pierMatch: a short match in each public place, at the same time for everyone (the game only) ----
// In the game's public places (server/party.js: everyone playing one of FishDock's marks in that mark's room) a match
// is fished in the first 20 minutes of every hour, by the clock, so anyone there then is in it without arranging
// anything. It's scored the way catch-and-release shore matches are: every fish counts, each one measured and put
// back, and the winner has the greatest total length; equal totals go to the longer best fish. Worked out on each phone
// from the room's own catch events (their lengths, by the server's clock), so nothing new is sent or kept.
// Game catches only: never a real competition, a real catch or a record.

export const MATCH = { everyMs: 60 * 60e3, lengthMs: 20 * 60e3, soonMs: 15 * 60e3 };

/**
 * The match round a time (ms, the server's clock): { on, startsAt, endsAt, next } with on true while one is being
 * fished; otherwise startsAt and endsAt are the next one's. soon: within MATCH.soonMs of starting.
 */
export function matchAt(now, M = MATCH) {
  const start = Math.floor(now / M.everyMs) * M.everyMs, on = now < start + M.lengthMs;
  const s = on ? start : start + M.everyMs;
  return { on, startsAt: s, endsAt: s + M.lengthMs, soon: !on && s - now <= M.soonMs, last: on ? { startsAt: start - M.everyMs, endsAt: start - M.everyMs + M.lengthMs } : { startsAt: start, endsAt: start + M.lengthMs } };
}

/**
 * The standings for a match from a room's events (each { type, who, t, data: { lengthCm } }, t on the server's clock):
 * [{ who, n, totalCm, bestCm }], best first. Only fish landed between the start and the end count.
 */
export function matchBoard(events, round) {
  const by = new Map();
  for (const e of events || []) {
    if (e?.type !== "catch" || !(e.t >= round.startsAt && e.t < round.endsAt)) continue;
    const cm = Number(e.data?.lengthCm); if (!(cm > 0 && cm < 400)) continue;
    const s = by.get(e.who) || { who: e.who, n: 0, totalCm: 0, bestCm: 0 }; by.set(e.who, s);
    s.n++; s.totalCm += cm; s.bestCm = Math.max(s.bestCm, cm);
  }
  return [...by.values()].map((s) => ({ ...s, totalCm: Math.round(s.totalCm) })).sort((a, b) => b.totalCm - a.totalCm || b.bestCm - a.bestCm || b.n - a.n);
}

/** "12:00" style times on the UK clock, and "14:32 left" style countdowns. */
export const ukClock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export const countdown = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
