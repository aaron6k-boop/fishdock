// ---- reelHandle: how the reel's handle turns for your taps (pure; tests) ----
// Each accepted tap is half a turn more for the handle to make. It goes round to it smoothly: a critically damped
// follow, so it speeds up, carries on round and slows to a stop, never overshooting (so never turning backwards) and
// never snapping. Steady tapping turns it steadily; stop and it runs down. It only ever turns for taps. The step is
// exact for any frame time, so it moves the same at 30 or 60 frames a second, or with a dropped frame.

export const HANDLE_W = 11; // how quickly it follows (per second)

/** A fresh handle at angle `at` (radians). */
export const handleState = (at = 0) => ({ angle: at, v: 0, base: null, last: null });

/**
 * One step: `turns` is the fight's count of turns so far (half a turn per accepted tap), dt seconds. A new fight counts
 * from nought: the handle carries on from where it is rather than winding backwards. A long way behind (a jump in the
 * fight's state) it catches up to within half a turn at once rather than whirring round.
 */
export function stepHandle(s, turns, dt, w = HANDLE_W) {
  let { angle: x, v, base, last } = s;
  if (last == null) base = x; // (a fight's turns start from nought)
  else if (turns < last - 1e-6) { base = x - turns * Math.PI * 2; v = 0; } // no leftover momentum into a new fight
  last = turns;
  const target = turns * Math.PI * 2 + base;
  if (target - x > Math.PI * 6) { x = target - Math.PI; v = 0; }
  const d = x - target, c = v + w * d, e = Math.exp(-w * dt);
  return { angle: target + (d + c * dt) * e, v: (c - w * (d + c * dt)) * e, base, last };
}

/** How many half turns of the handle (each a click of the reel's gears) were passed going from angle a0 to a1. */
export const halfTurnsPassed = (a0, a1) => Math.max(0, Math.floor(a1 / Math.PI + 1e-9) - Math.floor(a0 / Math.PI + 1e-9));
