// ---- look: the 360° look-around controller (pure; the renderer reads yaw, pitch and fov from it) ----
// Drag sideways to turn all the way round, up and down to look up or down, pinch (or the wheel) to zoom, double tap
// to face the rod again. Turning carries on a little after a flick and eases to a stop. `aim` turns smoothly to a
// heading (Look at my rod, Watch a friend). Nothing here touches the fishing: the camera is independent of it.

export const FOV = { min: 28, max: 78, base: 62 };
const TAU = Math.PI * 2;
export const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI; // -π..π
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createLook({ yaw = 0, pitch = -0.08, fov = FOV.base, home = { yaw: 0, pitch: -0.08 } } = {}) {
  const s = { yaw, pitch, fov, vyaw: 0, vpitch: 0, aim: null, home: { ...home }, dragging: false, moved: 0, lastTap: 0, touched: -1e9 };
  const api = {
    get yaw() { return s.yaw; }, get pitch() { return s.pitch; }, get fov() { return s.fov; }, get dragging() { return s.dragging; },
    /** when the person last turned or zoomed the view themselves (performance.now() ms): the camera doesn't steer itself for a while after */
    get touched() { return s.dragging ? performance.now() : s.touched; },
    get home() { return { ...s.home }; },
    /** degrees per screen pixel follow the zoom, so a drag moves the view by about the same distance at any zoom */
    drag(dx, dy, viewH = 800) {
      const k = ((s.fov * Math.PI) / 180) / Math.max(200, viewH);
      s.yaw = wrap(s.yaw - dx * k); s.pitch = clamp(s.pitch + dy * k, -1.25, 1.1);
      s.vyaw = -dx * k * 60; s.vpitch = dy * k * 60; s.aim = null; s.moved += Math.abs(dx) + Math.abs(dy); s.touched = performance.now();
    },
    start() { s.dragging = true; s.moved = 0; s.vyaw = 0; s.vpitch = 0; s.aim = null; },
    end() { s.dragging = false; },
    zoom(factor) { s.fov = clamp(s.fov / factor, FOV.min, FOV.max); s.touched = performance.now(); },
    /** turn smoothly to look at a heading (and pitch) */
    aim(yaw, pitch = s.pitch) { s.aim = { yaw: wrap(yaw), pitch: clamp(pitch, -1.25, 1.1) }; s.vyaw = 0; s.vpitch = 0; },
    recenter() { api.aim(s.home.yaw, s.home.pitch); s.fov = FOV.base; s.touched = -1e9; },
    setHome(yaw, pitch = s.home.pitch) { s.home = { yaw: wrap(yaw), pitch }; },
    /** a tap: returns true for a double tap (two taps within 320 ms that didn't move), which recentres */
    tap(now) { const dbl = now - s.lastTap < 320 && s.moved < 8; s.lastTap = dbl ? 0 : now; if (dbl) api.recenter(); return dbl; },
    /** advance by dt seconds: inertia after a flick, or easing towards an aim */
    step(dt) {
      if (s.dragging) return api;
      if (s.aim) {
        const k = 1 - Math.exp(-dt * 5);
        s.yaw = wrap(s.yaw + wrap(s.aim.yaw - s.yaw) * k); s.pitch += (s.aim.pitch - s.pitch) * k;
        if (Math.abs(wrap(s.aim.yaw - s.yaw)) < 0.002 && Math.abs(s.aim.pitch - s.pitch) < 0.002) s.aim = null;
        return api;
      }
      const damp = Math.exp(-dt * 4.5);
      s.yaw = wrap(s.yaw + s.vyaw * dt); s.pitch = clamp(s.pitch + s.vpitch * dt, -1.25, 1.1);
      s.vyaw *= damp; s.vpitch *= damp;
      if (Math.abs(s.vyaw) < 1e-3) s.vyaw = 0; if (Math.abs(s.vpitch) < 1e-3) s.vpitch = 0;
      return api;
    },
    state: () => ({ ...s }),
  };
  return api;
}

/** The heading (yaw) and pitch from an eye position to a point. */
export function lookAt(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
/** Compass points for a heading in degrees from north. */
export const compassPoint = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
