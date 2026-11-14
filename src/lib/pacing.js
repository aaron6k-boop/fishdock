// ---- frame pacing: how sharp to draw so frames keep coming on time ----
// (world.js steps the drawing resolution down when frames run late and back up when there is room. This is the part
// that needs no graphics: how big a step, and remembering where a device settled so the next visit starts there
// instead of spending its first ten seconds finding out again.)
const KEY = "fishdock.pace.v1";

/**
 * The resolution to step down to. late: the share of recent frames that were late (0 to 1). A quarter step when
 * some are; a half step when nearly all are, so a phone far out of its depth gets there in half the time.
 */
export function stepDown(dpr, floor, late) {
  return Math.max(floor, +(dpr - (late > 0.8 ? 0.5 : 0.25)).toFixed(2));
}

/** Where this device settled on this quality setting last time (null if never, or if it has been a month). */
export function recallPace(quality, store = typeof localStorage !== "undefined" ? localStorage : null, now = Date.now()) {
  try { const v = JSON.parse(store?.getItem(KEY) || "{}")[quality]; return v && now - v.t < 30 * 864e5 && v.dpr > 0 ? v.dpr : null; } catch { return null; }
}
export function rememberPace(quality, dpr, store = typeof localStorage !== "undefined" ? localStorage : null, now = Date.now()) {
  try { const all = JSON.parse(store?.getItem(KEY) || "{}"); all[quality] = { ...(all[quality] || {}), dpr: +dpr.toFixed(2), t: now }; store?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: it finds out again next time */ }
}

// ---- when the lowest sharpness still isn't enough (Auto only): the heavier extras go, one at a time ----
// In this order, each taken when frames are still late a couple of seconds after the last: the mirrored scene in the
// water (the whole place drawn a second time), shadows at standard detail, anti-aliasing at 2x, shadows off (every
// shadow-casting thing drawn once less), glow and sharpening, then anti-aliasing off. A device remembers how far it
// went, so a phone that can't hold them starts without them next time instead of stuttering down to it again.
export const SHED = [{ refl: 0 }, { shadows: 1 }, { aa: 2 }, { shadows: 0 }, { bloom: 0, sharp: 0 }, { aa: 0 }];
/** Graphics settings with the first n shed steps applied: each only ever lowers what was asked for. */
export function capGfx(o = {}, n = 0, current = {}) {
  const out = { ...o };
  for (const step of SHED.slice(0, n)) for (const [k, v] of Object.entries(step)) { const want = out[k] ?? current[k]; if (want == null || want > v) out[k] = v; }
  return out;
}
/** How many shed steps this device settled on with this setting last time (0 if none, or after a month). */
export function recallShed(quality, store = typeof localStorage !== "undefined" ? localStorage : null, now = Date.now()) {
  try { const v = JSON.parse(store?.getItem(KEY) || "{}")[quality]; return v && now - v.t < 30 * 864e5 ? Math.max(0, Math.min(SHED.length, v.shed | 0)) : 0; } catch { return 0; }
}
export function rememberShed(quality, n, store = typeof localStorage !== "undefined" ? localStorage : null, now = Date.now()) {
  try { const all = JSON.parse(store?.getItem(KEY) || "{}"); all[quality] = { ...(all[quality] || {}), shed: n, t: now }; store?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
}
