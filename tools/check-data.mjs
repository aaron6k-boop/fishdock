// ---- check-data: consistency checks for src/data (ids, art, seasons, rig diagrams, coordinates, wording) ----
// Run: node tools/check-data.mjs   (exits 1 on any problem)
import { SPOTS } from "../src/data/spots.js";
import { SPECIES } from "../src/data/species.js";
import { RIGS } from "../src/data/rigs.js";
import { KNOTS } from "../src/data/knots.js";
import { BAITS } from "../src/data/baits.js";
import * as RULES from "../src/data/rules.js";

const problems = [];
const bad = (where, msg) => problems.push(`${where}: ${msg}`);

const VER = new Set(["verified", "partial", "unverified"]);
const METHODS = new Set(["beachcasting", "rock-float", "shore-ledger", "sea-lure", "feathers", "float", "ledger", "feeder", "method-feeder", "carp", "fresh-lure", "deadbait", "fly", "freeline"]);
const GROUPS = new Set(["sea-predator", "sea-bottom", "flatfish", "ray-shark", "rock", "pelagic", "coarse", "coarse-night", "predator", "game"]);
const SHAPES = new Set(["torpedo", "long", "deep", "chunky", "eel", "flat", "ray", "shark"]);
const PATTERNS = new Set([null, "bars", "waves", "spots", "spots-red", "speckle", "line", "stripes", "scales", "thorns", "spots-white"]);
const DORSALS = new Set([null, "double", "long", "back"]);
const RANGES = new Set(["uk", "south", "southwest", "wales", "northwest", "northeast", "east", "scotland-west", "scotland-east", "ni"]);
const SEA_WATERS = new Set(["beach", "pier", "rocks", "breakwater", "estuary", "harbour"]);
const FRESH_WATERS = new Set(["river", "lake", "reservoir", "canal", "fishery"]);
const DIAGRAM_K = new Set(["line", "leader", "bead", "stop", "swivel", "float", "shot", "lead", "snood", "clip", "wire", "hooklength", "dropper", "hook", "lure", "trebles"]);
const LEAD_KINDS = new Set([undefined, "grip", "bomb", "feeder", "method"]);
const NATIONS = new Set(["England", "Wales", "Scotland", "Northern Ireland"]);
const KINDS = new Set(["sea", "river", "lake", "canal", "fishery"]);
const SUBTYPES = new Set(["beach", "pier", "rocks", "breakwater", "estuary", "harbour", "river", "lake", "reservoir", "canal", "fishery"]);
const LEVELS = new Set(["common", "seasonal", "occasional"]);
const TIDES = new Set([null, "high", "low", "flood", "ebb", "moving"]);
const ZONES = new Set(["bottom", "mid", "surface", "varies"]);
const MOVING = new Set(["static", "moving", "either"]);
const HEX = /^#[0-9a-f]{6}$/i;
const isMonth = (m) => Number.isInteger(m) && m >= 1 && m <= 12;
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// ---- unique ids ----
for (const [name, list] of [["SPOTS", SPOTS], ["SPECIES", SPECIES], ["RIGS", RIGS], ["KNOTS", KNOTS], ["BAITS", BAITS]]) {
  const seen = new Set();
  for (const r of list) {
    if (!r.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id)) bad(name, `id "${r.id}" is not kebab-case`);
    if (seen.has(r.id)) bad(name, `duplicate id ${r.id}`);
    seen.add(r.id);
  }
}
const speciesIds = new Set(SPECIES.map((s) => s.id));
const rigIds = new Set(RIGS.map((r) => r.id));
const baitIds = new Set(BAITS.map((b) => b.id));

// ---- spots ----
for (const s of SPOTS) {
  const w = `spot ${s.id}`;
  if (!s.name || !s.region) bad(w, "missing name or region");
  if (!NATIONS.has(s.nation)) bad(w, `bad nation ${s.nation}`);
  if (!KINDS.has(s.kind)) bad(w, `bad kind ${s.kind}`);
  if (!SUBTYPES.has(s.subtype)) bad(w, `bad subtype ${s.subtype}`);
  if (typeof s.lat !== "number" || typeof s.lon !== "number" || s.lat < 49.8 || s.lat > 60.9 || s.lon < -8.7 || s.lon > 1.8) bad(w, `coordinates outside the UK (${s.lat}, ${s.lon})`);
  if (typeof s.coordsVerified !== "boolean") bad(w, "coordsVerified must be true or false");
  if (!TIDES.has(s.tidePref)) bad(w, `bad tidePref ${s.tidePref}`);
  if (s.kind !== "sea" && s.tidePref !== null) bad(w, "tidePref is for sea spots only");
  if (!Array.isArray(s.species) || !s.species.length) bad(w, "no species");
  for (const x of s.species || []) {
    if (!speciesIds.has(x.id)) bad(w, `unknown species id ${x.id}`);
    if (!LEVELS.has(x.level)) bad(w, `bad level ${x.level} for ${x.id}`);
    const sp = SPECIES.find((y) => y.id === x.id);
    if (sp && sp.type !== "both" && (s.kind === "sea") !== (sp.type === "sea")) bad(w, `${x.id} (${sp.type}) listed at a ${s.kind} spot`);
  }
  if (new Set((s.species || []).map((x) => x.id)).size !== (s.species || []).length) bad(w, "species listed twice");
  if (!Array.isArray(s.baits)) bad(w, "baits must be an array");
  if (!Array.isArray(s.sources) || !s.sources.length) bad(w, "no sources");
  if (!["verified", "partial"].includes(s.verification)) bad(w, `bad verification ${s.verification}`);
  if (!MMDD.test((s.checked || "").slice(5))) bad(w, "missing checked date");
}

// ---- species ----
for (const s of SPECIES) {
  const w = `species ${s.id}`;
  if (!s.name || !s.latin) bad(w, "missing name or latin");
  if (!["sea", "fresh", "both"].includes(s.type)) bad(w, `bad type ${s.type}`);
  if (!GROUPS.has(s.group)) bad(w, `bad group ${s.group}`);
  const a = s.art;
  if (!a) bad(w, "no art");
  else {
    if (!SHAPES.has(a.shape)) bad(w, `bad art.shape ${a.shape}`);
    for (const k of ["back", "body", "belly", "fins"]) if (!HEX.test(a[k] || "")) bad(w, `art.${k} is not a hex colour`);
    if (!PATTERNS.has(a.pattern ?? null)) bad(w, `bad art.pattern ${a.pattern}`);
    if (!DORSALS.has(a.dorsal ?? null)) bad(w, `bad art.dorsal ${a.dorsal}`);
    if (typeof a.barbels !== "boolean") bad(w, "art.barbels must be true or false");
  }
  if (!Array.isArray(s.peak) || !s.peak.length || !s.peak.every(isMonth)) bad(w, "peak must be a non-empty list of months");
  if (!Array.isArray(s.present) || !s.present.length || !s.present.every(isMonth)) bad(w, "present must be a non-empty list of months");
  for (const m of s.peak || []) if (!(s.present || []).includes(m)) bad(w, `peak month ${m} missing from present`);
  if (!Array.isArray(s.range) || !s.range.length || !s.range.every((r) => RANGES.has(r))) bad(w, `bad range ${JSON.stringify(s.range)}`);
  const okWater = s.type === "sea" ? SEA_WATERS : s.type === "fresh" ? FRESH_WATERS : new Set([...SEA_WATERS, ...FRESH_WATERS]);
  if (!Array.isArray(s.waters) || !s.waters.length || !s.waters.every((x) => okWater.has(x))) bad(w, `bad waters ${JSON.stringify(s.waters)}`);
  if (!Array.isArray(s.methods) || !s.methods.length) bad(w, "no methods");
  for (const m of s.methods || []) if (!METHODS.has(m)) bad(w, `unknown method ${m}`);
  if (!Array.isArray(s.rigs) || !s.rigs.length) bad(w, "no rigs");
  for (const r of s.rigs || []) if (!rigIds.has(r)) bad(w, `unknown rig id ${r}`);
  for (const m of s.methods || []) if (!(s.rigs || []).some((r) => RIGS.find((x) => x.id === r)?.methods.includes(m))) bad(w, `no listed rig covers method ${m}`);
  for (const b of s.baits?.natural || []) {
    if (b.id !== null && !baitIds.has(b.id)) bad(w, `unknown bait id ${b.id}`);
    if (!b.name) bad(w, "natural bait without a name");
  }
  for (const b of s.baits?.artificial || []) if (!b.name) bad(w, "artificial bait without a name");
  if (!s.hooks || !("range" in s.hooks)) bad(w, "no hooks object");
  const p = s.presentation;
  if (!p || !ZONES.has(p.zone) || !MOVING.has(p.moving)) bad(w, "presentation zone or moving missing or invalid");
  for (const k of Object.keys(s.tackle || {})) if (!METHODS.has(k)) bad(w, `tackle override for unknown method ${k}`);
  if (s.minSize !== null && (typeof s.minSize?.cm !== "number" || !s.minSize.source)) bad(w, "minSize needs cm and a source, or null");
  if (s.tempC !== null && (!s.tempC?.text || !s.tempC?.source)) bad(w, "tempC needs text and a source, or null");
  if (!Array.isArray(s.sources)) bad(w, "sources must be an array");
  if (!VER.has(s.verification)) bad(w, `bad verification ${s.verification}`);
  if (s.verification === "verified" && !s.sources.length) bad(w, "verified with no sources");
}

// ---- rigs ----
for (const r of RIGS) {
  const w = `rig ${r.id}`;
  if (!["sea", "fresh"].includes(r.type)) bad(w, `bad type ${r.type}`);
  for (const m of r.methods || []) if (!METHODS.has(m)) bad(w, `unknown method ${m}`);
  if (!r.methods?.length) bad(w, "no methods");
  for (const id of r.species || []) {
    if (!speciesIds.has(id)) bad(w, `unknown species id ${id}`);
    else if (!SPECIES.find((s) => s.id === id).rigs.includes(r.id)) bad(w, `lists ${id}, but ${id} doesn't list this rig`);
  }
  if (!Array.isArray(r.diagram) || r.diagram.length < 2) bad(w, "diagram needs at least two parts");
  for (const [i, d] of (r.diagram || []).entries()) {
    if (!DIAGRAM_K.has(d.k)) bad(w, `diagram[${i}] has invalid k "${d.k}"`);
    if (d.k === "lead" && !LEAD_KINDS.has(d.kind)) bad(w, `diagram[${i}] lead kind "${d.kind}" invalid`);
    for (const key of Object.keys(d)) if (!["k", "label", "kind", "boom", "hair", "bait"].includes(key)) bad(w, `diagram[${i}] has unknown key ${key}`);
  }
  const last = r.diagram?.[r.diagram.length - 1]?.k;
  if (last && !["hook", "lure", "trebles", "lead", "snood"].includes(last)) bad(w, `diagram should end at the hook end, not "${last}"`);
  if (!r.steps?.length) bad(w, "no steps");
  if (!Array.isArray(r.components) || !r.components.length) bad(w, "no components");
  if (!Array.isArray(r.mistakes)) bad(w, "mistakes must be an array");
  for (const m of r.mistakes || []) if (!m.m || !m.fix) bad(w, "mistake needs m and fix");
  if (!VER.has(r.verification)) bad(w, `bad verification ${r.verification}`);
  if (r.verification === "verified" && !r.sources?.length) bad(w, "verified with no sources");
}
// every species' rig lists the species back
for (const s of SPECIES) for (const id of s.rigs || []) { const r = RIGS.find((x) => x.id === id); if (r && !r.species.includes(s.id)) bad(`species ${s.id}`, `uses rig ${id}, which doesn't list it`); }

// ---- knots and baits ----
for (const k of KNOTS) {
  if (!k.name || !k.use || !k.steps?.length) bad(`knot ${k.id}`, "missing name, use or steps");
  if (!VER.has(k.verification)) bad(`knot ${k.id}`, `bad verification ${k.verification}`);
  if (!Array.isArray(k.sources)) bad(`knot ${k.id}`, "sources must be an array");
}
for (const b of BAITS) {
  const w = `bait ${b.id}`;
  if (!["sea", "fresh", "both"].includes(b.type)) bad(w, `bad type ${b.type}`);
  if (!["natural", "artificial"].includes(b.kind)) bad(w, `bad kind ${b.kind}`);
  for (const id of b.species || []) if (!speciesIds.has(id)) bad(w, `unknown species id ${id}`);
  for (const k of ["hooking", "where", "storage"]) if (!b[k]) bad(w, `missing ${k}`);
  if (typeof b.scent !== "boolean" || typeof b.natural !== "boolean") bad(w, "scent and natural must be booleans");
  if (!Array.isArray(b.sources)) bad(w, "sources must be an array");
}

// ---- rules ----
if (!RULES.RULES_CHECKED) bad("rules", "no RULES_CHECKED");
for (const n of NATIONS) {
  const L = RULES.LICENCES?.[n];
  if (!L) { bad("rules", `no licence entry for ${n}`); continue; }
  if (typeof L.needed !== "boolean" || !Array.isArray(L.prices) || !L.buy || !L.note || !L.sources?.length) bad("rules", `licence entry for ${n} is incomplete`);
}
for (const c of RULES.CLOSE_SEASONS || []) {
  if (!NATIONS.has(c.nation)) bad("rules", `close season with bad nation ${c.nation}`);
  if (!["rivers", "all-coarse", "salmon", "trout"].includes(c.applies)) bad("rules", `close season with bad applies ${c.applies}`);
  if ((c.from === null) !== (c.to === null)) bad("rules", `close season ${c.nation} ${c.applies}: from and to must both be set or both null`);
  if (c.from && (!MMDD.test(c.from) || !MMDD.test(c.to))) bad("rules", `close season ${c.nation} ${c.applies}: dates must be MM-DD`);
  if (!c.text || !c.sources?.length) bad("rules", `close season ${c.nation} ${c.applies} needs text and sources`);
}
const B = RULES.BASS_RULES;
if (!B || typeof B.minCm !== "number" || !B.periods?.length) bad("rules", "BASS_RULES incomplete");
for (const p of B?.periods || []) if (!MMDD.test(p.from) || !MMDD.test(p.to) || !["catch-and-release", "retain"].includes(p.rule)) bad("rules", `bad bass period ${JSON.stringify(p)}`);
for (const m of RULES.MIN_SIZES || []) {
  if (!speciesIds.has(m.id)) bad("rules", `MIN_SIZES unknown species id ${m.id}`);
  if (typeof m.cm !== "number" || !m.text || !m.source) bad("rules", `MIN_SIZES ${m.id} incomplete`);
  const sp = SPECIES.find((s) => s.id === m.id);
  if (sp?.minSize && sp.minSize.cm !== m.cm) bad("rules", `MIN_SIZES ${m.id} is ${m.cm} cm but species.js says ${sp.minSize.cm} cm`);
}
for (const [name, list, key] of [["SAFETY", RULES.SAFETY, "title"], ["CONSERVATION", RULES.CONSERVATION, "title"], ["EVIDENCE", RULES.EVIDENCE, "factor"]]) {
  if (!Array.isArray(list) || !list.length) { bad("rules", `${name} empty`); continue; }
  for (const x of list) if (!x[key] || !x.text || !("source" in x)) bad("rules", `${name} entry incomplete: ${x[key]}`);
}

// ---- wording: no em dashes (or spaced en dashes) in any text ----
function walk(v, path) {
  if (typeof v === "string") {
    if (/^https?:\/\//.test(v)) return;
    if (v.includes("—")) bad(path, `em dash in "${v.slice(0, 60)}"`);
    if (/\s–\s/.test(v) || / - /.test(v)) bad(path, `dash used as punctuation in "${v.slice(0, 60)}"`);
    if (/\s{2,}/.test(v) || v !== v.trim()) bad(path, `stray whitespace in "${v.slice(0, 60)}"`);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
}
walk(SPOTS, "SPOTS"); walk(SPECIES, "SPECIES"); walk(RIGS, "RIGS"); walk(KNOTS, "KNOTS"); walk(BAITS, "BAITS");
for (const [k, v] of Object.entries(RULES)) if (typeof v !== "function") walk(v, k);

// ---- report ----
const counts = `spots ${SPOTS.length}, species ${SPECIES.length}, rigs ${RIGS.length}, knots ${KNOTS.length}, baits ${BAITS.length}, min sizes ${RULES.MIN_SIZES.length}, close seasons ${RULES.CLOSE_SEASONS.length}`;
if (problems.length) {
  console.error(`check-data: ${problems.length} problem(s)\n` + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(`check-data: OK (${counts})`);
