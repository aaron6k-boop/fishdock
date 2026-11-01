// ---- liveEvents: what a session's events mean for the Live Fishing View (pure, shared by the angler, viewers and replay) ----
// The phone records events (session.js); the same list drives the animated scene on the angler's screen, on a
// viewer's phone (through the server, docs/LIVE-VIEW.md) and in replays. Everything here is a pure function of the
// events and a time, so a reconnect or a scrub lands on exactly the same picture.

export const EV_INFO = {
  start: ["play", "Started fishing"], cast: ["target", "Cast"], bite: ["bell", "Bite"], smartbite: ["bell", "Smart Bite alert (Beta)"],
  missed: ["close", "Missed bite"], hooked: ["hook", "Fish on"], lost: ["close", "Fish lost"], snag: ["close", "Snag or weed, not a fish"],
  catch: ["fish", "Landed"], pause: ["pause", "Paused"], resume: ["play", "Back fishing"], end: ["stop", "Session ended"],
  mark: ["flag", "Mark"], note: ["edit", "Note"], conditions: ["wind", "Conditions"],
};
/** Event types the Live Fishing View plays and shares. Marks, notes and conditions snapshots stay on the phone. */
export const SHARED_TYPES = ["cast", "bite", "smartbite", "missed", "hooked", "lost", "snag", "catch", "pause", "resume", "end"];
// How long one-off moments last on screen (ms).
export const DUR = { cast: 2900, bite: 5500, smartbite: 4500, missed: 2500, lost: 2600, snag: 2200, catch: 11000 };

const byTime = (a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0);

/**
 * The scene's phase at time t: idle | cast | waiting | bite | hooked | landing | lost | paused | ended.
 * `since` is when that phase began, `ev` the event that began it.
 */
export function phaseAt(events, t, { status } = {}) {
  let phase = "idle", since = 0, ev = null, hooked = null, cast = false;
  for (const e of [...(events || [])].sort(byTime)) {
    if (e.t > t) break;
    switch (e.type) {
      case "cast": phase = "cast"; since = e.t; ev = e; cast = true; hooked = null; break;
      case "bite": case "smartbite": if (!hooked) { phase = "bite"; since = e.t; ev = e; } break;
      case "missed": if (!hooked) { phase = "missed"; since = e.t; ev = e; } break;
      case "hooked": hooked = e; phase = "hooked"; since = e.t; ev = e; break;
      case "lost": case "snag": hooked = null; phase = e.type === "lost" ? "lost" : "missed"; since = e.t; ev = e; break;
      case "catch": hooked = null; phase = "landing"; since = e.t; ev = e; break;
      case "pause": phase = "paused"; since = e.t; ev = e; break;
      case "resume": phase = hooked ? "hooked" : "waiting"; since = e.t; ev = e; break;
      case "end": phase = "ended"; since = e.t; ev = e; hooked = null; break;
      default: break;
    }
  }
  const age = t - since;
  if (phase === "cast" && age > DUR.cast) phase = "waiting";
  if (phase === "bite" && age > (ev?.type === "smartbite" ? DUR.smartbite : DUR.bite)) phase = "waiting";
  if ((phase === "missed" || phase === "lost") && age > DUR.missed) phase = "waiting";
  if (phase === "landing" && age > DUR.catch) phase = "waiting";
  if (phase === "idle" && cast) phase = "waiting";
  if (status === "paused" && phase !== "ended") phase = "paused";
  if (status === "ended") phase = "ended";
  return { phase, since, ev, hooked };
}

/** Plain words for what's happening, for the activity line and screen readers. */
export function activityText(p, { who = "", target = null } = {}) {
  const name = p?.ev?.data?.name || p?.ev?.data?.species || null;
  const w = who ? `${who} is ` : "";
  switch (p?.phase) {
    case "cast": return `${w || ""}${who ? "casting out" : "Casting out"}`;
    case "waiting": return `${who ? `${who} is waiting` : "Waiting"} for a bite${target ? ` (fishing for ${target.toLowerCase()})` : ""}`;
    case "bite": return p.ev?.type === "smartbite" ? "Smart Bite alert (Beta): checking the rod" : "Bite! Watching the rod tip";
    case "missed": return "Missed it. Baiting up again";
    case "hooked": return "Fish on! Reeling in";
    case "lost": return "Lost it. Off the hook";
    case "landing": return name ? `Landed: ${name}` : "Fish landed";
    case "paused": return "Taking a break";
    case "ended": return "Session ended";
    default: return who ? `${who} is setting up` : "Setting up";
  }
}

/** Counts from the events up to t. Bites are the ones the angler logged; Smart Bite (Beta) alerts are counted apart. */
export function countsAt(events, t = Infinity) {
  const c = { casts: 0, bites: 0, alerts: 0, missed: 0, hooked: 0, lost: 0, catches: 0 };
  for (const e of events || []) {
    if (e.t > t) continue;
    if (e.type === "cast") c.casts++;
    else if (e.type === "bite") c.bites++;
    else if (e.type === "smartbite") c.alerts++;
    else if (e.type === "missed") c.missed++;
    else if (e.type === "hooked") c.hooked++;
    else if (e.type === "lost") c.lost++;
    else if (e.type === "catch") c.catches++;
  }
  return c;
}

export const catchesOf = (events, t = Infinity) => (events || []).filter((e) => e.type === "catch" && e.t <= t).sort(byTime);

/** The moments worth jumping to in a replay: the first cast, bites, fish on, lost fish and catches. */
export function notable(events) {
  const out = [];
  let firstCast = false;
  for (const e of [...(events || [])].sort(byTime)) {
    if (e.type === "cast" && !firstCast) { firstCast = true; out.push({ ...e, label: "First cast" }); }
    else if (["bite", "smartbite", "missed", "hooked", "lost", "catch", "pause", "end"].includes(e.type)) out.push({ ...e, label: EV_INFO[e.type]?.[1] || e.type });
  }
  return out;
}

/** The phone's session events in the shape the server takes (only the shared types and fields). */
export function toShareEvents(session) {
  return (session?.events || []).filter((e) => SHARED_TYPES.includes(e.type) && e.id).map((e) => {
    const d = e.data || {};
    if (e.type === "catch") {
      return { id: e.id, t: e.t, type: "catch", data: { species: d.speciesId || null, name: d.species || null, lengthCm: d.lengthCm ?? null, weightKg: d.weightKg ?? null, released: !!d.released, bait: d.bait || null, photo: d.photo ? photoId(d.catchId) : null } };
    }
    return { id: e.id, t: e.t, type: e.type, data: e.type === "smartbite" ? { kind: d.kind || "tip" } : null };
  });
}
/** A catch photo's id on a share (the catch id, made URL-safe). */
export const photoId = (catchId) => String(catchId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || null;

/** Events as the scene sees them: the start, the phone's events (catches in the shared shape: species id, name), the end. */
export function sceneEvents(session) {
  if (!session) return [];
  const evs = (session.events || []).filter((e) => SHARED_TYPES.includes(e.type))
    .map((e) => (e.type === "catch" ? { ...e, data: { ...e.data, species: e.data?.speciesId || null, name: e.data?.species || null } } : e));
  const out = [{ type: "start", t: session.startedAt, id: "start" }, ...evs];
  if (session.endedAt && !evs.some((e) => e.type === "end")) out.push({ type: "end", t: session.endedAt, id: "end" });
  return out.sort(byTime);
}

/** "18:05" style list rows for the activity timeline (newest first), without casts after the first. */
export function timelineRows(events, { upTo = Infinity, limit = 60 } = {}) {
  let casts = 0;
  return [...(events || [])].sort(byTime).filter((e) => e.t <= upTo && (e.type !== "cast" || ++casts === 1) && EV_INFO[e.type] && e.type !== "conditions")
    .slice(-limit).reverse();
}

/** Typical lengths (cm) used to draw a fish when no length was logged (shown without a number). */
export const DRAW_CM = { cod: 55, bass: 48, whiting: 32, mackerel: 32, flounder: 30, plaice: 32, dab: 24, sole: 30, pollack: 45, coalfish: 40, "ballan-wrasse": 35, "thornback-ray": 60, smoothhound: 80, "lesser-spotted-dogfish": 55, tope: 110, conger: 110, "black-bream": 32, "thick-lipped-mullet": 45, garfish: 55, gurnard: 32, pouting: 25, eel: 55, perch: 25, pike: 70, carp: 55, roach: 22, bream: 40, tench: 40, chub: 38, barbel: 55, rudd: 22, "brown-trout": 33, "rainbow-trout": 40, "sea-trout": 50, salmon: 70, zander: 50, grayling: 32, dace: 18, gudgeon: 12 };
