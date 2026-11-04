// ---- trayGuard: one press for one thing on the fishing tray's buttons (pure; tests) ----
// How long a button ignores presses after it has just appeared (a tap meant for the button it replaced: tapping Reel
// as the fish comes close and Land takes its place under your thumb), and after it has been pressed (a double tap, or
// a second press before the scene has caught up: two strikes, two landings). Reel itself is never guarded: every tap
// counts.
export const GUARD = { appear: { land: 450, strike: 120, cast: 250 }, again: { strike: 900, land: 1200, cast: 900 } };
/** Whether a press of `act` at `now` (ms) counts, given when that button appeared and when it was last pressed. */
export function pressOk(act, now, { shownAt = -1e9, pressedAt = -1e9 } = {}) {
  if (now - shownAt < (GUARD.appear[act] || 0)) return false;
  if (now - (pressedAt ?? -1e9) < (GUARD.again[act] || 0)) return false;
  return true;
}
