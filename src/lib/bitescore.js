// ---- BiteScore: a transparent, species-specific guide to when fishing should be best ----
// Every factor is a rule of thumb from angling practice, shown to the user with its weight. It is a guide to
// conditions, not a measure of fish activity, and the confidence label says how much live data went in.
import ASTRO from "./astro.js";
import { ukMonth } from "./time.js";

const H = 3600e3;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const bell = (x, mid, width) => Math.exp(-(((x - mid) / width) ** 2));

// Defaults by species group; a species' own `bite` object overrides any of these.
const GROUP_DEFAULTS = {
  "sea-predator": { light: { twilight: 1, night: 0.8, day: 0.45 }, tide: "flood", waves: [0.4, 1.6], seaTemp: [9, 20] },
  "sea-bottom": { light: { twilight: 0.9, night: 1, day: 0.5 }, tide: "moving", waves: [0.5, 2.2], seaTemp: [6, 14] },
  "flatfish": { light: { twilight: 0.85, night: 0.7, day: 0.75 }, tide: "flood", waves: [0, 1], seaTemp: [6, 16] },
  "ray-shark": { light: { twilight: 0.9, night: 1, day: 0.5 }, tide: "moving", waves: [0.2, 1.5], seaTemp: [9, 18] },
  "rock": { light: { twilight: 0.8, night: 0.1, day: 1 }, tide: "moving", waves: [0, 0.9], seaTemp: [10, 18] },
  "pelagic": { light: { twilight: 1, night: 0.25, day: 0.8 }, tide: "high", waves: [0, 1.1], seaTemp: [11, 20] },
  "coarse": { light: { twilight: 1, night: 0.45, day: 0.6 }, flow: "normal", airTemp: [8, 24] },
  "coarse-night": { light: { twilight: 1, night: 0.85, day: 0.5 }, flow: "fining", airTemp: [8, 24] },
  "predator": { light: { twilight: 0.95, night: 0.25, day: 0.7 }, flow: "normal", airTemp: [2, 18] },
  "game": { light: { twilight: 1, night: 0.3, day: 0.6 }, flow: "fining", airTemp: [6, 18] },
};

export function biteProfile(species) {
  const g = GROUP_DEFAULTS[species?.group] || GROUP_DEFAULTS[species?.type === "sea" ? "sea-predator" : "coarse"];
  const b = species?.bite || {};
  return { ...g, ...b, light: { ...g.light, ...(b.light || {}) } };
}

// ---- factors ----
function lightFactor(sunAlt, prof) {
  const twilight = bell(sunAlt, -2, 7); // strongest from about an hour before to an hour after sunrise and sunset
  const base = sunAlt < -9 ? prof.light.night : sunAlt > 25 ? prof.light.day : sunAlt > 0
    ? prof.light.day + (prof.light.twilight - prof.light.day) * (1 - sunAlt / 25) * 0.4
    : prof.light.night + (prof.light.twilight - prof.light.night) * (1 - (-sunAlt) / 9) * 0.4;
  return clamp(Math.max(base, prof.light.twilight * twilight));
}

function tideFactor(st, pref, spring) {
  if (!st) return null;
  const x = st.relHW; // hours, negative = before high water
  const a = Math.abs(x), toLW = 6.21 - a;
  let p;
  switch (pref) {
    case "high": p = bell(x, -0.75, 2.4); break;           // last of the flood and first of the ebb
    case "low": p = bell(toLW, 0, 2.2); break;             // around low water
    case "ebb": p = bell(x, 2.6, 2.2); break;
    case "flood": p = Math.max(bell(x, -2.8, 2.3), 0.6 * bell(toLW, 0.8, 1.2)); break; // the flood, from the first push
    default: p = st.movement;                               // any moving water
  }
  return clamp((0.7 * p + 0.3 * st.movement) * (0.85 + 0.15 * spring));
}

function moonFactor(t, moonEv) {
  if (!moonEv) return 0.5;
  let major = 0, minor = 0;
  for (const m of [...moonEv.upper, ...moonEv.lower]) major = Math.max(major, bell((t - m) / H, 0, 0.8));
  for (const m of [...moonEv.rises, ...moonEv.sets]) minor = Math.max(minor, bell((t - m) / H, 0, 0.45));
  return clamp(0.4 + 0.6 * Math.max(major, 0.6 * minor));
}

function weatherFactor(w, prof, kind, sunAlt) {
  if (!w) return { f: null, notes: [] };
  const notes = [];
  let f = 0.7;
  if (w.pressureTrend != null) {
    if (w.pressureTrend <= -1.5) { f += 0.12; notes.push("pressure falling"); }
    else if (w.pressureTrend >= 1.5) { f -= 0.08; notes.push("pressure rising"); }
  }
  if (w.pressureHpa > 1025 && (w.cloudPct ?? 50) < 25 && sunAlt > 10) { f -= 0.12; notes.push("high pressure, bright sun"); }
  if (w.windKph != null) {
    if (w.windKph > 45) { f -= 0.3; notes.push("gale-force wind"); }
    else if (w.windKph > 32) { f -= 0.12; notes.push("strong wind"); }
  }
  if (kind === "sea" && w.waveM != null && prof.waves) {
    const [lo, hi] = prof.waves;
    if (w.waveM < lo) { f -= 0.08 * Math.min(1, (lo - w.waveM) / 0.4); notes.push("flat calm sea"); }
    else if (w.waveM > hi) { f -= 0.25 * Math.min(1, (w.waveM - hi) / 1); notes.push("rough sea"); }
    else { f += 0.08; notes.push("good sea state"); }
  }
  const temp = kind === "sea" ? w.seaTempC : w.tempC;
  const range = kind === "sea" ? prof.seaTemp : prof.airTemp;
  if (temp != null && range) {
    if (temp < range[0]) { f -= 0.15 * Math.min(1, (range[0] - temp) / 4); notes.push(kind === "sea" ? "cold sea" : "cold day"); }
    else if (temp > range[1]) { f -= 0.1; notes.push(kind === "sea" ? "warm sea" : "hot day"); }
  }
  return { f: clamp(f), notes };
}

function waterFactor(river, prof) {
  if (!river || !river.state) return { f: null, notes: [] };
  const { state, trend } = river;
  const notes = [`river ${state}${trend && trend !== "steady" ? ", " + trend : ""}`];
  let f;
  if (state === "high" && trend === "rising") f = 0.2;
  else if (state === "high") f = prof.flow === "fining" ? 0.75 : 0.45;
  else if (state === "normal" && trend === "falling") f = prof.flow === "fining" ? 0.95 : 0.8;
  else if (state === "normal") f = 0.75;
  else f = prof.flow === "fining" ? 0.45 : 0.55; // low
  return { f, notes };
}

export function seasonFactor(species, month) {
  if (!species) return 0.6;
  if (species.peak?.includes(month)) return 1;
  if (species.present?.includes(month)) return 0.6;
  return 0.15;
}

// Hourly conditions lookup from /api/conditions (or manual entries)
export function conditionsAt(cond, t) {
  if (!cond?.hourly?.length) return cond?.manual || null;
  const idx = cond.hourly.findIndex((h) => Date.parse(h.t) > t) - 1;
  const i = Math.max(0, idx < 0 ? cond.hourly.length - 1 : idx);
  const h = cond.hourly[i];
  const back = cond.hourly[Math.max(0, i - 3)];
  const marine = cond.marine?.hourly?.find((m) => Math.abs(Date.parse(m.t) - Date.parse(h.t)) < 1.1 * H);
  return {
    ...h, pressureTrend: h.pressureHpa != null && back?.pressureHpa != null ? h.pressureHpa - back.pressureHpa : null,
    waveM: marine?.waveM ?? null, seaTempC: marine?.seaTempC ?? null,
  };
}

const WEIGHTS = {
  sea: { light: 0.26, tide: 0.3, weather: 0.2, season: 0.19, moon: 0.05 },
  river: { light: 0.3, water: 0.25, weather: 0.2, season: 0.2, moon: 0.05 },
  still: { light: 0.36, weather: 0.3, season: 0.29, moon: 0.05 },
};

/**
 * Score a day in 30-minute slots for one species at one place.
 * opts: { place: {lat, lon, kind}, species, dayStart, tide (model|null), cond (api|null), river (api|null), now }
 */
export function biteDay({ place, species, dayStart, tide, cond, river, now = Date.now() }) {
  const kind = place.kind === "sea" ? "sea" : place.kind === "river" ? "river" : "still";
  const W = { ...WEIGHTS[kind] };
  const prof = biteProfile(species);
  const moonEv = ASTRO.moonEvents(dayStart - 3 * H, dayStart + 27 * H, place.lat, place.lon);
  const spring = ASTRO.springFactor(dayStart + 12 * H);
  const month = ukMonth(dayStart + 12 * H);
  const season = seasonFactor(species, month);
  const wf = waterFactor(river, prof);
  // Unknown inputs count as neutral and lower the confidence, rather than being guessed.
  const missing = [];
  if (kind === "sea" && !tide) missing.push("tides");
  if (kind === "sea" && tide?.source === "estimate") missing.push("official tide times");
  if (!cond?.hourly?.length && !cond?.manual) missing.push("weather");
  if (kind === "river" && wf.f == null) missing.push("river level");

  const slots = [];
  for (let i = 0; i < 48; i++) {
    const t = dayStart + i * 1800e3 + 900e3;
    const sunAlt = ASTRO.sunPos(t, place.lat, place.lon).alt;
    const f = { light: lightFactor(sunAlt, prof), season, moon: moonFactor(t, moonEv) };
    if (kind === "sea") {
      const st = tide ? tide.stateAt(t) : null;
      f.tide = tideFactor(st, prof.tide, spring) ?? 0.55;
      f.tideState = st?.phase || null;
    }
    const w = weatherFactor(conditionsAt(cond, t), prof, kind, sunAlt);
    f.weather = w.f ?? 0.62;
    f.weatherNotes = w.notes;
    if (kind === "river") { f.water = wf.f ?? 0.65; f.waterNotes = wf.notes; }
    let s = 0;
    for (const k of Object.keys(W)) s += W[k] * (f[k] ?? 0.6);
    // Out of season fish are capped: a perfect tide can't make a summer species bite in January.
    if (season < 0.3) s = Math.min(s, 0.35);
    slots.push({ t, score: Math.round(100 * clamp(s)), f, sunAlt });
  }
  const confidence = missing.length === 0 ? "high" : missing.length === 1 && missing[0] !== "tides" ? "medium" : "low";
  return { slots, windows: bestWindows(slots), confidence, missing, weights: W, profile: prof, spring, nowSlot: slots.find((s) => now >= s.t - 900e3 && now < s.t + 900e3) || null };
}

export function bestWindows(slots, max = 2) {
  if (!slots.length) return [];
  const top = Math.max(...slots.map((s) => s.score));
  const thr = Math.max(50, top - 8);
  const groups = [];
  let cur = null;
  for (const s of slots) {
    if (s.score >= thr) {
      if (!cur) cur = { start: s.t - 900e3, end: s.t + 900e3, peak: s.score, sum: s.score };
      else { cur.end = s.t + 900e3; cur.peak = Math.max(cur.peak, s.score); cur.sum += s.score; }
    } else if (cur) { groups.push(cur); cur = null; }
  }
  if (cur) groups.push(cur);
  return groups.sort((a, b) => b.peak - a.peak || b.sum - a.sum).slice(0, max).sort((a, b) => a.start - b.start);
}

export function band(score) {
  if (score >= 80) return { label: "Prime", level: 5 };
  if (score >= 65) return { label: "Good", level: 4 };
  if (score >= 50) return { label: "Fair", level: 3 };
  if (score >= 35) return { label: "Slow", level: 2 };
  return { label: "Poor", level: 1 };
}

/** Plain-English reasons for one slot, strongest first. */
export function explain(slot, kind) {
  const out = [];
  const f = slot.f;
  if (f.light > 0.85) out.push(slot.sunAlt < -9 ? "Dark: this species feeds well at night" : "Dawn or dusk light");
  else if (f.light < 0.5) out.push(slot.sunAlt > 0 ? "Bright daylight is a quieter time" : "Night is a quieter time for this species");
  if (kind === "sea" && f.tideState) out.push(`${f.tideState}${f.tide > 0.75 ? ": a favoured state" : f.tide < 0.45 ? ": slack or less favoured" : ""}`);
  if (f.season >= 1) out.push("In peak season");
  else if (f.season < 0.3) out.push("Out of season here");
  for (const n of f.weatherNotes || []) out.push(n[0].toUpperCase() + n.slice(1));
  for (const n of f.waterNotes || []) out.push(n[0].toUpperCase() + n.slice(1));
  if (f.moon > 0.85) out.push("Moon overhead or underfoot (solunar major)");
  return out;
}
