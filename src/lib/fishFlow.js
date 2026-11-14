// ---- fishFlow: one answer to "what can you do now", from the fight's state and what the scene is still showing ----
// The fight's own record finishes a landing before the scene does (the net still coming up the wall, then your fish on
// the mat until you've looked at it, kept it or put it back). Casting waits for both: a Cast button over a fish still in
// your hands, or a "Hold to cast again" while the net was still coming up, contradicted what you could see.
import { bitePlan } from "./reelModel.js";

/** Can a new cast start? phase: the fight's phase; lineOut: a line still in the water; busy: the scene's (SceneCtx). */
export function canCast({ phase, lineOut = false, busy = null }) {
  if (busy) return false;
  return phase === "idle" || phase === "ended" || (phase === "waiting" && !lineOut);
}

/** The one line to show while the scene is busy with your last fish (null: nothing to add). */
export function busyLabel(busy) {
  if (busy === "landing") return "Landing it";
  if (busy === "release") return "Putting it back";
  // (on the mat and in your hands the scene's own prompt says what to do: have a look, then keep it or put it back)
  return null;
}

/** The bite on now, from a list of events (the newest a bite): { t (ms, Date), plan: when to strike } or null. */
export function biteOf(events) {
  const e = events?.at?.(-1);
  if (!e || e.type !== "bite") return null;
  return { t: e.t, plan: bitePlan(e.data?.taps) };
}
