// ---- gameBait: the bait on your hook in the game, and which fish it brings ----
// The game's baits are the natural ones FishDock has sourced for that water (src/data/baits.js: sea, fresh or both):
// lures and flies are left out until the game has a retrieve to fish them with. Which fish take a bait comes from the
// sources: the bait's own list in baits.js and every species whose sourced baits name it (species.js). The season is
// species.js's months present and at their peak (general UK angling knowledge, as that file says).
// The odds are the game's own, not a survey: a fish that takes your bait is four times as likely to bite, one that
// doesn't a quarter as likely (fish do take the odd surprising bait); at its peak half as likely again, out of season a
// fifth. fishDraw.js puts these together with the place's own fish.
import { BAITS } from "../data/baits.js";
import { SPECIES } from "../data/species.js";

export const GAME_BAIT = { takes: 4, other: 0.25 };
export const SEASON = { peak: 1.5, in: 1, out: 0.2 };
export const DEFAULT_BAIT = { sea: "ragworm", fresh: "maggots" };

/** The baits to choose from at this water (fresh: a river or lake), in baits.js's order. */
export function gameBaits(fresh) {
  return BAITS.filter((b) => b.kind === "natural" && (b.type === "both" || b.type === (fresh ? "fresh" : "sea")));
}
/** A bait by its id, if the game offers it at this water. */
export function gameBait(id, fresh) { return gameBaits(fresh).find((b) => b.id === id) || null; }

const TAKES = new Map();
/** The species ids the sources say take this bait (baits.js's list, and species.js's own baits). */
export function baitTakes(id) {
  if (TAKES.has(id)) return TAKES.get(id);
  const out = new Set(BAITS.find((b) => b.id === id)?.species || []);
  for (const s of SPECIES) if ((s.baits?.natural || []).some((n) => n.id === id)) out.add(s.id);
  TAKES.set(id, out);
  return out;
}

/** "peak", "in" or "out" for a species in a month (1 to 12), or null without months for it. */
export function seasonOf(sp, month) {
  if (!sp?.present?.length) return null;
  if (sp.peak?.includes(month)) return "peak";
  return sp.present.includes(month) ? "in" : "out";
}

/** The extra weight of a species in the draw for a bait and a month (1 with neither). */
export function biteWeight(id, { bait = null, month = null } = {}) {
  let w = 1;
  if (bait) w *= baitTakes(bait).has(id) ? GAME_BAIT.takes : GAME_BAIT.other;
  if (month) { const s = seasonOf(SPECIES.find((x) => x.id === id), month); if (s) w *= SEASON[s]; }
  return w;
}

/** For the bait picker: the fish of this water (list: { id, name }) that take a bait, those in season first, each with
 * its season and whether the place's sources list it. */
export function takesHere(id, list, month, placeIds = []) {
  const t = baitTakes(id), listed = new Set(placeIds), rank = { peak: 0, in: 1, out: 3 };
  return list.filter((f) => t.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, season: seasonOf(f, month), here: listed.has(f.id) }))
    .sort((a, b) => (rank[a.season] ?? 2) - (rank[b.season] ?? 2) || (b.here ? 1 : 0) - (a.here ? 1 : 0));
}
