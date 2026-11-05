// ---- scene input: touch gestures and keyboard ownership ----
export function bindSceneInput(el, getWorld, getProps, { win = window, doc = document } = {}) {
  const pts = new Map(); let pinch = 0, stopping = false, multi = false;
  // a touch while the view is still turning (after a flick, or steering itself) just stops it: it isn't a tap, so it
  // doesn't show or hide the controls by accident
  const down = (e) => { if (e.button != null && e.button !== 0) return; el.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) { multi = false; const st = getWorld()?.look.state(); stopping = !!st && (Math.abs(st.vyaw) > 0.05 || Math.abs(st.vpitch) > 0.05 || !!st.aim); getWorld()?.look.start(); } if (pts.size === 2) { multi = true; clearTimeout(tapTimer); const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
  const move = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) getWorld()?.look.drag(dx, dy, el.clientHeight);
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) getWorld()?.look.zoom(d / pinch); pinch = d; }
  };
  // a tap (no drag) shows or hides the controls, unless a second tap follows (that recentres instead)
  let tapTimer = 0;
  const up = (e) => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size === 0) {
      const L = getWorld()?.look; L?.end(); if (multi) { L?.cancel(); pinch = 0; return; }
      // a tap on your landed fish: have a look at it
      if (L && L.state().moved < 8 && getProps().onFishTap) { const r = el.getBoundingClientRect(); if (getWorld()?.tapFish(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))) { getProps().onFishTap(); pinch = 0; return; } }
      if (L && L.state().moved < 8 && !stopping) {
        clearTimeout(tapTimer);
        // walking about: a tap on the ground walks you there (a double tap still recentres the view)
        if (getWorld()?.walking) { const r = el.getBoundingClientRect(), nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -(((e.clientY - r.top) / r.height) * 2 - 1); if (!L.tap(performance.now())) tapTimer = setTimeout(() => { if (!getWorld()?.walkTo(nx, ny)) getProps().onTap?.(); }, 260); }
        // (while a fish is on, a tap that misses the Reel button does nothing: no recentring, no hiding the controls)
        else if (getProps().fight) { /* fighting a fish */ }
        else if (!L.tap(performance.now())) tapTimer = setTimeout(() => getProps().onTap?.(), 330);
      }
    }
    pinch = 0;
  };
  const wheel = (e) => { e.preventDefault(); getWorld()?.look.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); };
  // walking with the keyboard: WASD (or the arrow keys) to move, Space to jump, Shift to sprint
  const held = new Set();
  const cancel = () => { clearTimeout(tapTimer); pts.clear(); pinch = 0; multi = false; held.clear(); getWorld()?.look.cancel(); getWorld()?.setWalkInput({ x: 0, y: 0, sprint: false }); };
  const lost = (e) => { if (pts.has(e.pointerId)) cancel(); };
  const hidden = () => { if (doc.hidden) cancel(); };
  const walkKeys = () => { const w = getWorld(); if (!w?.walking) return; const has = (...k) => k.some((x) => held.has(x.toLowerCase())); w.setWalkInput({ x: (has("d", "D") ? 1 : 0) - (has("a", "A") ? 1 : 0), y: (has("w", "W") ? 1 : 0) - (has("s", "S") ? 1 : 0), sprint: has("Shift") }); };
  const keyUp = (e) => { held.delete(e.key.toLowerCase()); walkKeys(); };
  const key = (e) => {
    if (getWorld()?.walking) { if (e.key === " ") { e.preventDefault(); if (!e.repeat) getWorld().jump(); return; } if (/^[wasdWASD]$|^Shift$/.test(e.key)) { e.preventDefault(); held.add(e.key.toLowerCase()); walkKeys(); return; } }
    const L = getWorld()?.look; if (!L) return; const k = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] }[e.key]; if (k) { e.preventDefault(); L.start(); L.drag(-k[0], -k[1], el.clientHeight); L.end(); } if (e.key === "Home") L.recenter(); };
  el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", cancel); el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("keydown", key); el.addEventListener("keyup", keyUp);
  el.addEventListener("lostpointercapture", lost); el.addEventListener("blur", cancel); win.addEventListener("blur", cancel); doc.addEventListener("visibilitychange", hidden);
  return () => { cancel(); el.removeEventListener("lostpointercapture", lost); el.removeEventListener("blur", cancel); win.removeEventListener("blur", cancel); doc.removeEventListener("visibilitychange", hidden); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancel); el.removeEventListener("wheel", wheel); el.removeEventListener("keydown", key); el.removeEventListener("keyup", keyUp); };
}
