// ---- tides: official events when the server has them, otherwise a labelled lunar estimate ----
import ASTRO from "./astro.js";
import { distanceKm } from "./geo.js";
import { TIDE_PORTS } from "../data/tidePorts.js";

const H = 3600e3;

/** Nearest calibrated port for the on-device estimate. */
export function nearestPort(lat, lon, maxKm = 70) {
  let best = null;
  for (const p of TIDE_PORTS) {
    if (p.spreadH > 0.8) continue; // double high waters (Solent, Poole): a simple estimate would mislead
    const d = distanceKm({ lat, lon }, p);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { ...p, distanceKm: d };
  }
  return best;
}

function phaseLabel(sinceExtreme, toNext, nextType) {
  // nextType: the extreme we are heading to
  if (sinceExtreme < 0.75) return nextType === "LW" ? "High water" : "Low water";
  if (toNext < 0.75) return nextType === "HW" ? "High water soon" : "Low water soon";
  if (nextType === "LW") return sinceExtreme < 2.2 ? "First of the ebb" : "Ebbing";
  return sinceExtreme < 2.2 ? "First of the flood" : toNext < 2.2 ? "Last of the flood" : "Flooding";
}

/**
 * Build a tide model for a place.
 * api: response of GET /api/tides (or null). Returns null when no tide applies or nothing usable is known.
 */
export function tideModel(place, api, now = Date.now()) {
  if (!place || place.lat == null) return null;
  let events = [], source = null, label = "", station = null, confidence = "low", heights = false;
  if (api && api.source && Array.isArray(api.events) && api.events.length >= 2) {
    events = api.events
      .map((e) => ({ type: /high/i.test(e.type) ? "HW" : "LW", t: Date.parse(e.t), h: typeof e.heightM === "number" ? e.heightM : null }))
      .filter((e) => Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t);
    source = api.source;
    label = api.source === "admiralty" ? "Admiralty tide predictions (UKHO)" : "Tide predictions";
    station = api.station || null;
    confidence = "high";
    heights = events.every((e) => e.h != null);
  } else {
    const port = nearestPort(place.lat, place.lon);
    if (!port) return null;
    const start = now - 2 * 864e5, end = now + 4 * 864e5;
    const hws = ASTRO.highWaters(start, end, port.lon, port.li);
    for (let i = 0; i < hws.length; i++) {
      events.push({ type: "HW", t: hws[i], h: null });
      if (i + 1 < hws.length) events.push({ type: "LW", t: (hws[i] + hws[i + 1]) / 2, h: null });
    }
    source = "estimate";
    label = `Estimate from the Moon and ${port.port} tide times`;
    station = { name: port.port, distanceKm: port.distanceKm };
    confidence = "low";
  }
  if (events.length < 2) return null;
  const sf = ASTRO.springFactor(now);

  function around(t) {
    let i = events.findIndex((e) => e.t > t);
    if (i <= 0) i = i === 0 ? 1 : events.length - 1;
    return [events[i - 1], events[i]];
  }
  function heightAt(t) {
    const [a, b] = around(t);
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const ha = a.h ?? (a.type === "HW" ? 1 : -1), hb = b.h ?? (b.type === "HW" ? 1 : -1);
    return ha + (hb - ha) * (1 - Math.cos(Math.PI * f)) / 2;
  }
  function stateAt(t) {
    const [a, b] = around(t);
    const since = (t - a.t) / H, to = (b.t - t) / H;
    const flooding = b.type === "HW";
    // signed hours relative to high water: negative before HW (flood), positive after (ebb)
    const relHW = flooding ? -to : since;
    const range = (b.t - a.t) / H;
    const movement = Math.sin(Math.PI * Math.min(1, Math.max(0, since / range))); // 0 at slack, 1 mid-tide
    return { flooding, since, to, relHW, movement, prev: a, next: b, phase: phaseLabel(since, to, b.type) };
  }
  const minH = Math.min(...events.map((e) => e.h ?? -1)), maxH = Math.max(...events.map((e) => e.h ?? 1));
  return {
    source, label, station, confidence, heights, events, heightAt, stateAt, minH, maxH,
    springFactor: sf,
    rangeLabel: sf > 0.72 ? "Spring tides" : sf < 0.28 ? "Neap tides" : ASTRO.springFactor(now + 864e5) > sf ? "Building to springs" : "Dropping to neaps",
  };
}

/**
 * Clock windows for a mark's preferred tide that overlap [from, to): "high" and "low" are two hours either side of
 * that tide, "flood" runs from low water to high water and "ebb" from high water to low water. "moving" and
 * unknown preferences give nothing (they are about avoiding slack, not a window). Each is { start, end, at }.
 */
export function tideWindows(tide, pref, from, to) {
  if (!tide?.events?.length || !pref) return [];
  const H2 = 2 * 3600e3, ev = tide.events, out = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i], next = ev[i + 1];
    let w = null;
    if (pref === "high" && e.type === "HW") w = { start: e.t - H2, end: e.t + H2, at: e.t };
    else if (pref === "low" && e.type === "LW") w = { start: e.t - H2, end: e.t + H2, at: e.t };
    else if (pref === "flood" && e.type === "LW" && next?.type === "HW") w = { start: e.t, end: next.t, at: next.t };
    else if (pref === "ebb" && e.type === "HW" && next?.type === "LW") w = { start: e.t, end: next.t, at: e.t };
    if (w && w.end > from && w.start < to) out.push(w);
  }
  return out;
}
