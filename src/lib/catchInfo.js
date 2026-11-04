// ---- catchInfo: what the catch card shows at once, and what waits under "More about this fish" ----
// The card over your landed fish starts small (the fish stays in view), but nothing that is a rule or a safety point
// is ever folded away: the minimum size, and any sentence of the species' conservation note that says what you must or
// may not do (must be returned, may not be landed, cannot be sold, limits, seasons, licences) or warns about handling
// it (spines, thorns, teeth). Everything else (how to tell it, the rest of the note, lookalikes) goes in the
// expandable part. The words are the species data's own (src/data/species.js): nothing is added or reworded here.

const RULE = /\b(must|may not|cannot|can't|banned|ban|illegal|law|licen[cs]e[ds]?|permit|limits?|closed|close season|protected|required|never move|exempt|a day|daily|seasons?)\b/i;
const SAFETY = /\b(spines?|thorns?|stings?|venom\w*|teeth|grazes?|sharp|handle with care|wraps? round)\b/i;

/** A note split into its sentences (on ". " followed by a capital, so "15 March to 15 June." and "51°N." stay whole). */
export function sentences(text) {
  if (!text) return [];
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The card's lines for a species (a species record, or null):
 *   must: [{ kind: "size" | "rule" | "safety", text, source? }] shown at once, never folded away;
 *   more: { idTip, note, lookalikes } for "More about this fish" (each a string or null); hasMore: anything in it.
 */
export function catchInfo(sp) {
  const must = [], rest = [];
  if (sp?.minSize?.cm || sp?.minSize?.text) must.push({ kind: "size", text: sp.minSize.text || `${sp.minSize.cm} cm`, source: sp.minSize.source || null });
  for (const s of sentences(sp?.conservation)) {
    if (RULE.test(s)) must.push({ kind: "rule", text: s });
    else if (SAFETY.test(s)) must.push({ kind: "safety", text: s });
    else rest.push(s);
  }
  const more = { idTip: sp?.idTip || null, note: rest.length ? rest.join(" ") : null, lookalikes: sp?.lookalikes || null };
  return { must, more, hasMore: !!(more.idTip || more.note || more.lookalikes) };
}
