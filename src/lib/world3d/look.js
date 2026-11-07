// ---- look: the 360° look-around controller (pure; the renderer reads yaw, pitch and fov from it) ----
// Drag sideways to turn all the way round, up and down to look up or down, pinch (or the wheel) to zoom, double tap
// to face the rod again. Turning carries on a little after a flick and eases to a stop. `aim` turns smoothly to a
// heading (Look at my rod, Watch a friend). Nothing here touches the fishing: the camera is independent of it.

export const FOV = { min: 28, max: 78, base: 62 };
const TAU = Math.PI * 2;
export const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI; // -π..π
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** How far the view can tip down and up (radians); walking about narrows it (WALK_PITCH) */
export const PITCH = { min: -1.25, max: 1.1 };

export function createLook({ yaw = 0, pitch = -0.08, fov = FOV.base, home = { yaw: 0, pitch: -0.08 } } = {}) {
  const s = { yaw, pitch, fov, vyaw: 0, vpitch: 0, aim: null, home: { ...home }, dragging: false, moved: 0, lastTap: 0, touched: -1e9, sens: 1, smooth: true, dragFov: null, pmin: PITCH.min, pmax: PITCH.max, flickPitch: true, baseFov: null, fv: 0 };
  const api = {
    get yaw() { return s.yaw; }, get pitch() { return s.pitch; }, get fov() { return s.fov; }, get dragging() { return s.dragging; },
    /** when the person last turned or zoomed the view themselves (performance.now() ms): the camera doesn't steer itself for a while after */
    get touched() { return s.dragging ? performance.now() : s.touched; },
    get home() { return { ...s.home }; },
    /** degrees per screen pixel follow the zoom, so a drag moves the view by about the same distance at any zoom
     *  (walking about, the zoom sets how far behind you the camera is, so the camera's own fov is used: dragFov) */
    drag(dx, dy, viewH = 800) {
      const k = ((((s.dragFov ?? s.fov) * Math.PI) / 180) / Math.max(200, viewH)) * s.sens;
      s.yaw = wrap(s.yaw - dx * k); s.pitch = clamp(s.pitch + dy * k, s.pmin, s.pmax);
      // the flick's speed: a blend of this move and the last, so one uneven touch event doesn't set a jerky spin
      const now = performance.now(), gap = Math.max(8, Math.min(60, now - (s.dragAt || now - 16))) / 1000; s.dragAt = now;
      s.vyaw = s.vyaw * 0.4 + ((-dx * k) / gap) * 0.6; s.vpitch = s.vpitch * 0.4 + ((dy * k) / gap) * 0.6;
      s.aim = null; s.moved += Math.abs(dx) + Math.abs(dy); s.touched = now;
    },
    /** the field of view a drag is measured against (null: the zoom) */
    setDragFov(f) { s.dragFov = Number.isFinite(f) ? f : null; },
    start() { s.dragging = true; s.moved = 0; s.vyaw = 0; s.vpitch = 0; s.aim = null; s.dragAt = 0; },
    // (a finger held still before letting go is no flick: the view stops where it is)
    end() { s.dragging = false; if (!s.smooth || performance.now() - (s.dragAt || 0) > 90) { s.vyaw = 0; s.vpitch = 0; } s.vyaw = clamp(s.vyaw, -6, 6); s.vpitch = s.flickPitch ? clamp(s.vpitch, -3, 3) : 0; },
    /** the range the view may tip through, and whether a flick carries on up or down (walking about: a narrower range,
     *  and no vertical flick, so a thumb lifting off the screen never throws the view up into the sky). No args: as normal */
    setPitchRange(min = PITCH.min, max = PITCH.max, flick = true) { s.pmin = min; s.pmax = max; s.flickPitch = !!flick; s.pitch = clamp(s.pitch, min, max); if (!flick) s.vpitch = 0; },
    /** the zoom a recentre goes back to (null: the usual) */
    setBaseFov(f) { s.baseFov = Number.isFinite(f) ? f : null; },
    /** how the view feels: sensitivity (0.5..2, 1 normal) and smoothing (the turn carries on a little after a flick) */
    setFeel({ sens, smooth } = {}) { if (Number.isFinite(sens)) s.sens = clamp(sens, 0.4, 2.5); if (smooth != null) s.smooth = !!smooth; },
    zoom(factor) { s.fov = clamp(s.fov / factor, FOV.min, FOV.max); s.touched = performance.now(); },
    setFov(f) { s.fov = clamp(f, FOV.min, FOV.max); },
    /** turn smoothly to look at a heading (and pitch) */
    // (rate: the most it may turn a second, radians, as a head does: a big change of where to look then takes its time
    // rather than whipping round; none for the usual quick ease)
    aim(yaw, pitch = s.pitch, rate = 0) { s.aim = { yaw: wrap(yaw), pitch: clamp(pitch, s.pmin, s.pmax), rate }; s.vyaw = 0; s.vpitch = 0; },
    recenter() { api.aim(s.home.yaw, s.home.pitch); s.fov = s.baseFov ?? FOV.base; s.touched = -1e9; },
    setHome(yaw, pitch = s.home.pitch) { s.home = { yaw: wrap(yaw), pitch }; },
    /** a tap: returns true for a double tap (two taps within 320 ms that didn't move), which recentres */
    tap(now) { const dbl = now - s.lastTap < 320 && s.moved < 8; s.lastTap = dbl ? 0 : now; if (dbl) api.recenter(); return dbl; },
    /** follow a heading (walking: the camera coming round behind you): k is how far to go this frame (0..1) */
    follow(yaw, pitch, k, dt) {
      if (s.dragging || s.aim) { s.fv = 0; return; }
      if (!(dt > 0)) { if (!(k > 0)) return; s.yaw = wrap(s.yaw + wrap(yaw - s.yaw) * k); if (pitch != null) s.pitch += (pitch - s.pitch) * k * 0.6; return; }
      // (with dt: the turn's own speed eases up and down, so the camera never starts or stops swinging round with a jolt,
      // and never carries on past where you face)
      const off = wrap(yaw - s.yaw), want = k > 0 ? (off * k) / dt : 0;
      s.fv += (want - s.fv) * (1 - Math.exp(-dt * 7));
      let step = s.fv * dt; if (step * off <= 0 && k > 0) step = 0; else if (Math.abs(step) > Math.abs(off) && k > 0) step = off;
      s.yaw = wrap(s.yaw + step); if (pitch != null && k > 0) s.pitch += (pitch - s.pitch) * k * 0.6;
    },
    /** ease the pitch towards `to` by k (0..1), unless the person is turning the view or it's being aimed */
    easePitch(to, k) { if (s.dragging || s.aim || !(k > 0)) return; s.pitch = clamp(s.pitch + (to - s.pitch) * Math.min(1, k), s.pmin, s.pmax); },
    /** advance by dt seconds: inertia after a flick, or easing towards an aim */
    step(dt) {
      if (s.dragging) return api;
      if (s.aim) {
        const k = 1 - Math.exp(-dt * 5), R = s.aim.rate, lim = (v) => (R > 0 ? clamp(v, -R * dt, R * dt) : v);
        s.yaw = wrap(s.yaw + lim(wrap(s.aim.yaw - s.yaw) * k)); s.pitch += lim((s.aim.pitch - s.pitch) * k) * (R > 0 ? 0.8 : 1);
        if (Math.abs(wrap(s.aim.yaw - s.yaw)) < 0.002 && Math.abs(s.aim.pitch - s.pitch) < 0.002) s.aim = null;
        return api;
      }
      const damp = Math.exp(-dt * 4.5);
      s.yaw = wrap(s.yaw + s.vyaw * dt); s.pitch = clamp(s.pitch + s.vpitch * dt, s.pmin, s.pmax);
      s.vyaw *= damp; s.vpitch *= damp;
      if (Math.abs(s.vyaw) < 1e-3) s.vyaw = 0; if (Math.abs(s.vpitch) < 1e-3) s.vpitch = 0;
      return api;
    },
    state: () => ({ ...s }),
  };
  return api;
}

// ---- the walking camera: behind you, coming round smoothly as you turn ----
// It follows only while you're walking, never while you're dragging the view, and not for a moment after you let go
// (so you can look round and then carry on); it doesn't swing round when you walk back towards it, and a slow walk
// turns it more gently than a brisk one.
// (maxRate: never faster than this, in radians a second, so a sharp turn brings the camera round steadily rather than
// in a swing; the speed ramp and the eased start after a look round keep it from starting with a jolt)
export const FOLLOW = { wait: 1200, rate: 2.2, minSpeed: 0.3, pitch: -0.2, maxOff: 2.3, maxRate: 1.5 };
/** How far (0..1) the walking camera turns towards where you're facing this frame. */
export function walkFollow({ dragging = false, sinceTouch = 1e9, speed = 0, off = 0, dt = 0.016 } = {}) {
  const a = Math.abs(wrap(off));
  if (dragging || sinceTouch < FOLLOW.wait || speed < FOLLOW.minSpeed || a > FOLLOW.maxOff) return 0;
  const ramp = Math.min(1, (sinceTouch - FOLLOW.wait) / 800); // easing in after a look round, not snapping back
  const sp = Math.min(1, (speed - FOLLOW.minSpeed) / 1.0); // from nothing at the slowest walk, so it never starts with a step
  // and less for a camera nearly opposite you (walking back towards it): it comes round gently once you turn
  const far = a > 1.6 ? Math.max(0, (FOLLOW.maxOff - a) / (FOLLOW.maxOff - 1.6)) : 1;
  const k = 1 - Math.exp(-dt * FOLLOW.rate * sp * ramp * far);
  return a > 1e-6 ? Math.min(k, (FOLLOW.maxRate * dt) / a) : k;
}

// ---- the walking camera's pitch: a comfortable range, and back to the usual gently after a look up or down ----
// (WALK_PITCH: how far you can tip the view while walking about; level: where it settles. With the follow camera's
// height that keeps the deck ahead of you in view and never lets the sky fill the screen)
export const WALK_PITCH = { min: -0.75, max: 0.1, level: -0.2, wait: 1600, rate: 1.4 };
/** How far (0..1) the walking camera's pitch eases back towards its level this frame, whether or not you're moving. */
export function walkPitchBack({ dragging = false, sinceTouch = 1e9, dt = 0.016 } = {}) {
  if (dragging || sinceTouch < WALK_PITCH.wait) return 0;
  const ramp = Math.min(1, (sinceTouch - WALK_PITCH.wait) / 900);
  return 1 - Math.exp(-dt * WALK_PITCH.rate * ramp);
}

// ---- easing between camera views: walking about and back, so the switch is a glide and never a cut ----
/** Smoothstep easing of a blend's progress (0..1). */
export const easeBlend = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
/** How far the camera's distance behind you moves towards what's wanted this frame: in at once when something's in
 *  the way (never through a wall), out again slowly when it clears (no popping back). */
export function followDist(cur, want, dt) {
  if (!(cur > 0)) return want;
  if (want < cur) return want;
  return cur + (want - cur) * (1 - Math.exp(-dt * 2.5));
}

/** The heading (yaw) and pitch from an eye position to a point. */
export function lookAt(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
/** Compass points for a heading in degrees from north. */
export const compassPoint = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
