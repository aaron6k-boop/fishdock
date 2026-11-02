// ---- landed: when a catch counts as landed on screen ----
// A logged catch starts the landing animation; the scene shouldn't say "landed" (or add it to the catch list) until
// the fish is actually out of the water, which is when the close-up card comes up. The same timing the scene uses.
import { landingTimes } from "./sceneActors.js";

/** Seconds after a catch event that the fish is out of the water and its card shows. */
export const landedAfter = (ev, venue) => landingTimes(ev?.data?.species || null, ev?.data?.lengthCm || null, ev?.data?.weightKg || null, venue || "pier").card;
/** Whether this catch has finished landing at time t (ms). */
export const isLanded = (ev, t, venue) => !!ev && t - ev.t >= landedAfter(ev, venue) * 1000;
/** Catches that have finished landing by time t, oldest first. */
export const landedCatches = (events, t, venue) => (events || []).filter((e) => e.type === "catch" && e.t <= t && isLanded(e, t, venue)).sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0));
