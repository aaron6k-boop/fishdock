// ---- rules: licences, close seasons, sizes and bass rules for a place, a date and a species ----
// Guidance only: FishDock links to the authority for every rule and says when it last checked.
import { LICENCES, CLOSE_SEASONS, BASS_RULES, MIN_SIZES, RULES_CHECKED } from "../data/rules.js";
import { ukParts } from "./time.js";

const mmdd = (ms) => { const p = ukParts(ms); return `${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const within = (d, from, to) => (from <= to ? d >= from && d <= to : d >= from || d <= to);
const fmt = (s) => { const [m, d] = s.split("-").map(Number); return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`; };

export function rulesFor({ nation, kind, date = Date.now(), speciesId, place, speciesOnly = false }) {
  const out = [];
  const d = mmdd(date);
  const fresh = kind && kind !== "sea";
  if (!speciesOnly && fresh && nation && LICENCES?.[nation]) {
    const L = LICENCES[nation];
    const key = (L.prices || []).filter((p) => !/salmon|3 rods|concession/i.test(p.label)).slice(0, 4);
    out.push({ level: L.needed ? "legal" : "info", title: L.needed ? `Licence needed in ${nation}` : `No rod licence in ${nation}`, text: `${L.note || ""}${key.length ? ` ${key.map((p) => `${p.label} ${p.price}`).join(", ")}.` : ""} You also need permission from whoever owns the fishing.`.trim(), link: L.buy || L.sources?.[0] });
  }
  if (fresh && nation) {
    for (const c of CLOSE_SEASONS || []) {
      if (c.nation !== nation) continue;
      const appliesHere = c.applies === "rivers" ? (kind === "river" || place?.subtype === "river")
        : c.applies === "all-coarse" ? true
          : c.applies === "trout" ? ["brown-trout", "sea-trout"].includes(speciesId)
            : c.applies === "salmon" ? speciesId === "salmon" : false;
      if (!appliesHere || !c.from || !c.to) continue;
      if (within(d, c.from, c.to)) out.push({ level: "danger", title: `Close season (${fmt(c.from)} to ${fmt(c.to)})`, text: c.text, link: c.sources?.[0] });
      else {
        const soon = new Date(date + 21 * 864e5);
        if (within(mmdd(+soon), c.from, c.to)) out.push({ level: "warn", title: `Close season starts ${fmt(c.from)}`, text: c.text, link: c.sources?.[0] });
      }
    }
  }
  if (speciesId === "bass" && BASS_RULES && (!kind || kind === "sea" || speciesOnly)) {
    const p = (BASS_RULES.periods || []).find((x) => within(d, x.from, x.to));
    out.push({
      level: "legal",
      title: p ? (p.rule === "catch-and-release" ? "Bass: catch and release only today" : `Bass: you may keep ${p.bag ?? "a limited number"} per day`) : "Bass rules",
      text: `${p ? "" : "Check today's rule. "}Minimum size ${BASS_RULES.minCm ?? 42} cm. ${BASS_RULES.text || ""}`.trim(),
      link: BASS_RULES.sources?.[0],
    });
  }
  const ms = (MIN_SIZES || []).find((m) => m.id === speciesId);
  if (ms && speciesId !== "bass") out.push({ level: "legal", title: `Minimum size: up to ${ms.cm} cm`, text: `${ms.text} Check the size for your district before keeping one.`, link: ms.source });
  if (out.length) out.checked = RULES_CHECKED;
  return out;
}
