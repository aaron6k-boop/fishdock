// ---- Bait & Tackle Advisor: a recommendation assembled only from FishDock's sourced tackle database ----
// No AI writes this advice. Each part names where it comes from; anything general is labelled as general.
import { RIGS, rigById } from "../data/rigs.js";
import { BAITS } from "../data/baits.js";
import { catchHere } from "./catchhere.js";
import { rulesFor } from "./rules.js";
import { ukMonth } from "./time.js";

export const METHODS = {
  beachcasting: { label: "Beachcasting", water: ["sea"], icon: "wave" },
  "rock-float": { label: "Float from rocks or pier", water: ["sea"], icon: "rig" },
  "shore-ledger": { label: "Bottom fishing from pier, rocks or harbour", water: ["sea"], icon: "rig" },
  "sea-lure": { label: "Lure fishing (sea)", water: ["sea"], icon: "target" },
  feathers: { label: "Feathers or sabikis", water: ["sea"], icon: "target" },
  float: { label: "Float fishing", water: ["river", "lake", "canal", "fishery"], icon: "rig" },
  ledger: { label: "Ledgering", water: ["river", "lake", "canal", "fishery"], icon: "rig" },
  feeder: { label: "Feeder fishing", water: ["river", "lake", "canal", "fishery"], icon: "rig" },
  "method-feeder": { label: "Method feeder", water: ["lake", "fishery"], icon: "rig" },
  carp: { label: "Carp rigs (bolt and hair)", water: ["lake", "fishery", "river"], icon: "rig" },
  "fresh-lure": { label: "Lure fishing (freshwater)", water: ["river", "lake", "canal"], icon: "target" },
  deadbait: { label: "Deadbait for predators", water: ["river", "lake", "canal"], icon: "rig" },
  fly: { label: "Fly fishing", water: ["river", "lake"], icon: "target" },
  freeline: { label: "Freelining", water: ["river", "lake", "canal", "sea"], icon: "rig" },
};

const SEASON = (m) => (m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter");
const waterKind = (place) => (place.kind === "sea" ? "sea" : place.subtype && place.subtype !== "river" ? place.subtype : place.kind);

/** Methods that suit this species at this kind of water, best first. */
export function methodsFor(species, place) {
  const wk = waterKind(place);
  const ok = (species?.methods || []).filter((m) => METHODS[m] && (METHODS[m].water.includes(wk) || METHODS[m].water.includes(place.kind)));
  return ok.length ? ok : (species?.methods || []).filter((m) => METHODS[m]);
}

function pickBaits(species, { month, clarity }) {
  const season = SEASON(month);
  const nat = (species.baits?.natural || []).map((b, i) => {
    let s = 10 - i; // the source ranking
    if (b.seasons?.length) s += b.seasons.includes(season) ? 3 : -4;
    const info = BAITS.find((x) => x.id === b.id);
    if (clarity === "coloured" || clarity === "very coloured") { if (info?.scent || b.scent) s += 2; }
    if (clarity === "clear" && (info?.natural || b.natural)) s += 1;
    return { ...b, info, s };
  }).sort((a, b) => b.s - a.s);
  const art = (species.baits?.artificial || []).map((b) => ({ ...b }));
  return { primary: nat[0] || null, alternatives: nat.slice(1, 4), artificial: art.slice(0, 3), season };
}

function pickRig(species, method, cond) {
  const pool = (species.rigs || []).map(rigById).filter(Boolean);
  const scored = pool.map((r, i) => {
    let s = 10 - i;
    if (r.methods?.includes(method)) s += 6;
    if (cond.snags === "snaggy" && r.snaggy) s += 3;
    if (cond.snags === "snaggy" && r.snaggy === false) s -= 4;
    if ((cond.tide === "strong" || cond.sea === "rough" || cond.flow === "high") && r.heavyFlow) s += 2;
    if (cond.sea === "calm" && r.calm) s += 1;
    return { r, s };
  }).sort((a, b) => b.s - a.s);
  const best = scored[0]?.r || RIGS.find((r) => r.methods?.includes(method)) || null;
  return { rig: best, alternatives: scored.slice(1, 3).map((x) => x.r) };
}

/**
 * A rig's hook note can cover several fish ("Bass in estuaries: 3/0–4/0. Conger: 6/0–8/0."). Only the part for this
 * species counts as its hook size; a note naming other fish, or another fish in brackets, doesn't. Plain notes
 * with no fish named ("12–8") apply to whatever the rig is for.
 */
export function hookFromRig(note, species) {
  const text = String(note || "").trim();
  if (!text || !species) return "";
  const words = [species.name, species.id.replace(/-/g, " "), ...(species.name.split(/[ (]/).filter((w) => w.length > 3))].map((w) => w.toLowerCase());
  const parts = text.split(/(?<=\.)\s+(?=[A-Z])/);
  const named = parts.map((p) => p.match(/^([^:]{2,40}):\s*(.+?)\.?$/)).filter(Boolean);
  if (named.length) {
    const hit = named.find((m) => words.some((w) => m[1].toLowerCase().includes(w)));
    return hit ? hit[2].trim() : "";
  }
  const bracket = text.match(/\(([a-z ]+)\)/i);
  if (bracket && !words.some((w) => bracket[1].toLowerCase().includes(w)) && !/^pac$/i.test(bracket[1].trim())) return "";
  if (/not given/i.test(text)) return "";
  return text;
}

/**
 * Build advice. cond: { tide: "flooding"|"ebbing"|"slack"|"strong"|"", sea: "calm"|"moderate"|"rough"|"",
 * clarity: "clear"|"slight"|"coloured"|"very coloured", flow: "low"|"normal"|"high"|"", snags: "clean"|"snaggy", size: "average"|"specimen" }
 */
export function buildAdvice({ place, species, method, cond = {}, date = Date.now(), nation, windows = null }) {
  if (!species) return null;
  const month = ukMonth(date);
  const methods = methodsFor(species, place);
  const m = method && method !== "auto" && METHODS[method] ? method : methods[0];
  const baits = pickBaits(species, { month, clarity: cond.clarity });
  const { rig, alternatives } = pickRig(species, m, cond);
  const tack = species.tackle?.[m] || {};
  const here = catchHere(place, month).find((r) => r.species.id === species.id) || null;
  const hooks = species.hooks || {};
  const fromRig = hookFromRig(rig?.hook, species);
  const hook = {
    range: tack.hook || hooks.range || fromRig || "",
    rigNote: !(tack.hook || hooks.range || fromRig) && rig?.hook ? rig.hook : "",
    pattern: tack.pattern || hooks.pattern || "",
    why: hooks.why || "",
    size: cond.size === "specimen" ? (hooks.specimen || "") : (hooks.small || ""),
    barbless: species.barbless || "",
  };
  const pres = species.presentation || {};
  const adjust = [];
  if (place.kind === "sea") {
    if (cond.tide === "strong" || cond.sea === "rough") adjust.push({ if: "Strong tide or rough sea", then: tack.rough || "Step up to a grip lead heavy enough to hold, shorten snoods, and use a bait clip so the bait arrives intact." });
    if (cond.sea === "calm" || cond.clarity === "clear") adjust.push({ if: "Calm, clear water", then: tack.clear || "Fish lighter and longer, scale down the hook and bait, and favour dawn, dusk and dark." });
    if (cond.clarity === "coloured" || cond.clarity === "very coloured") adjust.push({ if: "Coloured water", then: tack.coloured || "Use the smelliest fresh bait you have (crab, lug, squid or fish cocktails) and refresh it often." });
  } else {
    if (cond.flow === "high" || cond.clarity === "coloured" || cond.clarity === "very coloured") adjust.push({ if: "High or coloured water", then: tack.coloured || "Fish slacks and inside lines, use bigger, smellier baits, and heavier leads or feeders to hold." });
    if (cond.flow === "low" || cond.clarity === "clear") adjust.push({ if: "Low, clear water", then: tack.clear || "Scale down: lighter line, smaller hooks and baits, fish early and late, and keep back from the edge." });
  }
  if (pres.missed) adjust.push({ if: "Missing bites", then: pres.missed });
  if (cond.snags === "snaggy") adjust.push({ if: "Snaggy ground", then: tack.snaggy || "Use a rotten-bottom or weak link to the lead, a pulley rig at sea, and stronger line so fish can be steered clear." });

  const legal = rulesFor({ nation, kind: place.kind, date, speciesId: species.id, place });
  const where = place.verified && place.best
    ? { text: place.best, verified: true }
    : { text: species.where || pres.where || "", verified: false };
  return {
    species, method: m, methods, here,
    bait: { ...baits, size: tack.baitSize || species.baitSize || "", prep: baits.primary?.info?.hooking || baits.primary?.hooking || "" },
    hook, rig, rigAlternatives: alternatives,
    presentation: { zone: tack.zone || pres.zone || "bottom", text: tack.presentation || pres.text || "", moving: pres.moving || "", offBottom: pres.offBottom || "" },
    line: tack.line || species.line || rig?.line || "",
    weight: tack.weight || species.weights || rig?.weight || "",
    distance: tack.distance || species.distance || "",
    where, windows, adjust, legal,
    sources: [...new Set([...(species.sources || []), ...(rig?.sources || [])])],
  };
}
