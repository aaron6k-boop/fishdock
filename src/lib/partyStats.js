// ---- partyStats: a Fish Together party's leaderboards, from its catch events (shared by the server and the phone) ----
// Simulated and real catches never mix: a party is one kind or the other.

/** The leaderboard for a challenge (or the whole party): from the party's catch events only. */
export function standings(events, members, { kind = "most", from = 0, to = Infinity } = {}) {
  const by = {};
  for (const e of events || []) {
    if (e.type !== "catch" || e.t < from || e.t > to) continue;
    const s = (by[e.who] ||= { who: e.who, n: 0, species: new Set(), biggestKg: 0, longestCm: 0 });
    s.n++; if (e.data?.species) s.species.add(e.data.species);
    const kg = e.data?.weightKg || 0, cm = e.data?.lengthCm || 0;
    s.biggestKg = Math.max(s.biggestKg, kg || 0.0000105 * cm ** 3.02); s.longestCm = Math.max(s.longestCm, cm);
  }
  const score = (s) => ({ most: s.n, species: s.species.size, biggest: s.biggestKg, longest: s.longestCm })[kind] ?? s.n;
  return Object.values(by).map((s) => ({ who: s.who, name: members?.[s.who]?.name || null, score: score(s), n: s.n, species: s.species.size, longestCm: s.longestCm })).sort((a, b) => b.score - a.score || b.n - a.n);
}

export const CHALLENGES = { biggest: "Biggest fish", most: "Most fish", species: "Most species", longest: "Longest fish" };
