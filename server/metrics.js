// POST /api/metrics { events: [{ name, value? }] }  Privacy-preserving usage counters.
//
// - Only whitelisted names are counted, as a total per UK day (metrics_daily). No ids, no coordinates, no
//   timestamps finer than the day, nothing about who sent them: the request's account and network aren't kept.
// - Names: session_start, catch_logged, ai_cast, ai_identify, and three with a suffix:
//   species_view:<species id>, advisor_run:<species id> (a lowercase id such as "bass" or "ballan-wrasse"),
//   area_view:<region> (a region name only: letters, spaces and . , ' & ( ) -; anything with a digit,
//   which could be a grid square or coordinates, is refused).
// - Anything else is dropped silently (counted as "dropped" in the answer). At most 50 events a request,
//   and each name at most 10 times a request; `value` (1 to 10) is added instead of 1 where given.
// - Rate-limited per network (the day's keyed hash) only to stop floods.

import { json, err, guard, readJson, toResponse } from "./http.js";
import { needDb, enforce, bump } from "./db.js";
import { networkKey, noteNetwork } from "./throttle.js";
import { ukDay } from "./time.js";

export const PLAIN = ["session_start", "catch_logged", "ai_cast", "ai_identify"];
export const SUFFIXED = { species_view: "species", advisor_run: "species", area_view: "region" };
export const METRIC_LIMITS = { perRequest: 50, perNamePerRequest: 10, requestsPerMinute: 30, maxValue: 10 };
const SPECIES_SUFFIX = /^[a-z][a-z0-9_-]{1,39}$/;
// Letters (any alphabet, so Welsh and Gaelic names work), spaces and a little punctuation; never a digit.
const REGION_SUFFIX = /^\p{L}[\p{L} '&.,()-]{0,29}$/u;

/** The counter name to bump for an incoming name, or null if it isn't allowed. */
export function metricName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (PLAIN.includes(name)) return name;
  const i = name.indexOf(":");
  if (i < 0) return null;
  const head = name.slice(0, i), tail = name.slice(i + 1).trim();
  const type = SUFFIXED[head];
  if (!type) return null;
  if (type === "species") return SPECIES_SUFFIX.test(tail) ? `${head}:${tail}` : null;
  if (!REGION_SUFFIX.test(tail)) return null;
  return `${head}:${tail.replace(/\s+/g, " ").toLowerCase()}`;
}

export async function handleMetrics(request, env, now = Date.now()) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/metrics\/?/, "");
    if (path) return err(404, "not_found", "Unknown route.");
    if (request.method !== "POST") return err(405, "method", "Use POST.");
    const db = await needDb(env, now, "Usage counts");
    const net = await networkKey(db, env, request, now);
    await noteNetwork(db, net, now);
    await enforce(db, "metrics:" + net, METRIC_LIMITS.requestsPerMinute, now, { windowMs: 60e3 }, "Just a moment.");
    const body = await readJson(request, 16 * 1024);
    const events = Array.isArray(body.events) ? body.events.slice(0, METRIC_LIMITS.perRequest) : [];
    const totals = new Map();
    const perName = new Map();
    let dropped = Array.isArray(body.events) ? Math.max(0, body.events.length - events.length) : 0;
    for (const e of events) {
      const name = metricName(e?.name);
      if (!name) { dropped++; continue; }
      const seen = perName.get(name) ?? 0;
      if (seen >= METRIC_LIMITS.perNamePerRequest) { dropped++; continue; }
      perName.set(name, seen + 1);
      const v = Number(e?.value);
      const by = Number.isInteger(v) && v >= 1 && v <= METRIC_LIMITS.maxValue ? v : 1;
      totals.set(name, (totals.get(name) ?? 0) + by);
    }
    const day = ukDay(now);
    if (totals.size) await db.batch(await Promise.all([...totals].map(([name, by]) => bump(db, name, day, by))));
    return json({ ok: true, counted: [...perName.values()].reduce((a, b) => a + b, 0), dropped });
  } catch (e) {
    return toResponse(e, now, "metrics");
  }
}
