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
  try { const all = JSON.parse(store?.getItem(KEY) || "{}"); all[quality] = { dpr: +dpr.toFixed(2), t: now }; store?.setItem(KEY, JSON.stringify(all)); } catch { /* private mode: it finds out again next time */ }
}
