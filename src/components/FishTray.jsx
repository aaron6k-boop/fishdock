// ---- FishTray: the fishing control at the bottom of the scene ----
// One large button for the step that makes sense now, and nothing else, so the rod and the water stay clear:
//   Cast (hold to build power, look where you want it, let go) → Strike (one tap) → Reel (tap it, again and again:
//   each tap turns the handle) → Land (once the fish is close) → Cast again.
// The button sits in the thumb's corner on its own, with one short line above it only when there's something to say.
// While a fish is on, the button is the whole readout: a ring round it for the line's tension (with where the drag will
// slip) and how far out the fish is under the word Reel, so nothing sits over your hands and the reel. Assisted reeling (an option) winds steadily after one tap. In Advanced mode
// two small buttons set the drag. Nothing shows while the cast flies or a fish is being landed.
// Each button takes one press for one thing: a second Strike or Land straight after the first is ignored, and Land
// doesn't take a tap meant for Reel in the moment it appears under your thumb.
import { useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { WorldCtx, SceneCtx } from "./WorldContext.js";
import { canCast, busyLabel } from "../lib/fishFlow.js";
import { GUARD, pressOk } from "../lib/trayGuard.js";

const R = 29, C = 2 * Math.PI * R;
const HOLD_CYCLE = 1150; // ms from no power to full (then back down: let go at the top)

/**
 * phase: the scene phase; last: the last event type; reel: 0..1; fight: the fight's state while a fish is on
 * (useVirtualFishing); note: a short message; opts: { assisted, advanced }.
 */
export default function FishTray({ phase, last, reel = 0, fight = null, note = "", opts = {}, autoplay = false, onCast, onStrike, onTap, onHold, onLand, onDrag, onStop, onNudge, onWindIn, hint }) {
  const world = useContext(WorldCtx), { busy: sceneBusy } = useContext(SceneCtx);
  // the line is in the water after a cast (and a bite, or a missed one) until a fish is landed or lost or you wind in
  const lineOut = last === "cast" || last === "bite" || last === "missed" || last === "smartbite";
  const landOn = useRef(false), castAt = useRef(-1e9), shown = useRef({ act: null, at: -1e9 }), pressed1 = useRef({});
  const [power, setPower] = useState(null), [tapFx, setTapFx] = useState(0), [pressed, setPressed] = useState(false);
  const hold = useRef(null);
  if (phase !== "hooked") landOn.current = false;
  let act = null, label = hint || "", busy = false, status = "", dist = null;
  if (autoplay) { label = "Playing it through"; }
  // (the last fish not finished with yet in the scene: no Cast, and only what's true now)
  else if (sceneBusy && (phase === "idle" || phase === "ended" || phase === "waiting" || phase === "landing")) { busy = sceneBusy === "landing" || sceneBusy === "release"; label = busyLabel(sceneBusy) || ""; }
  else if (canCast({ phase, lineOut })) { act = "cast"; label = label || (power != null ? "Let go to cast" : last ? "Hold to cast again" : "Hold Cast, aim, let go"); }
  else if (phase === "cast") { busy = true; label = "Casting"; }
  else if (phase === "waiting" || phase === "missed") { act = onWindIn && !autoplay ? "wait" : null; label = phase === "missed" ? "Missed it. The bait's still out" : "Waiting for a bite"; }
  else if (phase === "bite") { act = "strike"; label = "Bite! Strike now"; }
  else if (phase === "hooked") {
    // (Land stays once it's shown unless the fish really pulls away, so it doesn't flicker with Reel at the edge)
    const near = !!fight?.near || (landOn.current && (fight?.progress ?? 0) > 0.88);
    landOn.current = near; act = near ? "land" : "reel";
    // what's happening, said only when it's true: a run only while the fish is taking line, the drag only while it slips
    // (the how-to only for the first few taps: after that the button, its ring and the reel turning say it)
    status = near ? "It's close: tap Land" : fight?.running ? "It's running: line going out" : fight?.slipping ? "Too tight: the drag's giving line" : fight?.taking ? "It's taking line: keep tapping" : opts.assisted ? (fight?.assisted ? "Winding: tap to stop" : "Tap once to start winding") : (fight?.taps ?? 0) < 4 ? "Tap Reel again and again" : "";
    dist = fight && !near ? `${Math.round(fight.dist)}\u00a0m` : null; label = status;
  }
  else if (phase === "landing") { busy = true; label = "Landing it"; }
  else if (phase === "lost") { label = "Lost it"; }
  if (note) label = note;
  const hide = busy && !autoplay;
  // when this button appeared, and when each was last pressed (one press for one thing, above)
  if (shown.current.act !== act) shown.current = { act, at: performance.now() };
  const ok = (a) => { const t = performance.now(); if (!pressOk(a, t, { shownAt: shown.current.at, pressedAt: pressed1.current[a] })) return false; pressed1.current[a] = t; return true; };
  const urgent = act === "strike" || act === "reel" || act === "land";

  // ---- hold to cast: the power rises and falls while you hold; the 3D view shows where it would land ----
  useEffect(() => {
    if (power == null) return undefined;
    let raf = 0;
    const tick = () => {
      const h = hold.current; if (!h) return;
      const u = ((performance.now() - h.t0) / HOLD_CYCLE) % 2, p = u < 1 ? u : 2 - u;
      h.p = p; setPower(p); world?.current?.aimCast?.(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [power != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => world?.current?.aimCast?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  // (one cast at a time: a second press straight after a cast, before the scene has caught up, is ignored)
  const castDown = (e) => { e.preventDefault(); if (performance.now() - castAt.current < GUARD.again.cast || performance.now() - shown.current.at < GUARD.appear.cast) return; e.currentTarget.setPointerCapture?.(e.pointerId); hold.current = { t0: performance.now(), p: 0 }; setPower(0); };
  const castUp = () => {
    const h = hold.current; if (!h) return; hold.current = null;
    // a quick tap is a gentle cast; holding sets the power
    const p = performance.now() - h.t0 < 180 ? 0.5 : h.p;
    const params = world?.current?.castParams?.(p) || { power: p };
    world?.current?.aimCast?.(null); setPower(null);
    if (act !== "cast") return; // (the scene became busy while it was held: no cast)
    castAt.current = performance.now(); onCast?.(params);
  };
  const castCancel = () => { if (!hold.current) return; hold.current = null; world?.current?.aimCast?.(null); setPower(null); };

  const ten = fight ? Math.max(0, Math.min(1.2, fight.tension)) : 0, dragAt = fight ? Math.min(1.2, fight.drag) : 0.78;
  const tenCls = fight?.slipping ? "slip" : ten > dragAt * 0.85 ? "high" : ten > 0.45 ? "mid" : "low";
  const strike = (e) => { e?.preventDefault?.(); if (ok("strike")) onStrike?.(); };
  const land = (e) => { e?.preventDefault?.(); if (ok("land")) onLand?.(); };
  const key = (f) => (e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); f(); } };
  const fighting = act === "reel" || act === "land";
  // the line's tension as a ring round the button you're pressing (green, amber, then red; the white mark where the
  // drag slips), so the one thing you watch and the one thing you press are in the same place
  const dragDeg = (dragAt / 1.2) * 360;
  const tenRing = fighting ? (
    <svg className={`ft-ringsvg ft-tension ${tenCls}`} viewBox="0 0 64 64" role="meter" aria-label="Line tension" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((ten / 1.2) * 100)}>
      <circle cx="32" cy="32" r={R} className="ft-ring-bg" />
      <circle cx="32" cy="32" r={R} className="ft-ring ft-ten-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - ten / 1.2) }} />
      <line x1={32 + 25.5 * Math.cos((dragDeg * Math.PI) / 180)} y1={32 + 25.5 * Math.sin((dragDeg * Math.PI) / 180)} x2={32 + 32.5 * Math.cos((dragDeg * Math.PI) / 180)} y2={32 + 32.5 * Math.sin((dragDeg * Math.PI) / 180)} className="ft-ten-drag" />
    </svg>
  ) : null;
  return (
    <div className={`fish-tray${hide ? " is-busy" : ""}${urgent ? " is-urgent" : ""}`} data-act={act || (busy ? "busy" : "none")} role="group" aria-label="Fishing controls">
      {/* what you read: one short line above the button, only when it says something (clear of your hands and your
          thumb); while a fish is on, the tension and the distance are on the Reel button itself */}
      <div className={`ft-readout${fighting ? " fight" : ""}`}>
        {label ? <span className="ft-label" aria-live="polite">{label}</span> : null}
      </div>
      <div className="ft-row">
        {act === "wait" ? <button type="button" className="ft-pill ft-windin" onClick={() => onWindIn?.()} title="Wind your line in: then cast again, or walk about">Wind in</button> : null}
        {autoplay ? <button type="button" className="ft-pill" onClick={onStop}><Icon name="stop" />Stop</button> : null}
        {opts.advanced && act === "reel" ? (
          <div className="ft-drag" role="group" aria-label="Drag">
            <button type="button" className="ft-pill" onClick={() => onDrag?.(+1)} aria-label="Tighten the drag">Drag +</button>
            <button type="button" className="ft-pill" onClick={() => onDrag?.(-1)} aria-label="Loosen the drag">Drag −</button>
          </div>
        ) : null}
        {act === "cast" ? (
          <button type="button" className={`ft-main ft-cast${power != null ? " holding" : ""}`} aria-label="Cast: hold to build power, let go to cast"
            onPointerDown={castDown} onPointerUp={castUp} onPointerCancel={castCancel} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={key(() => { if (ok("cast")) onCast?.(world?.current?.castParams?.(0.6) || { power: 0.6 }); })}>
            {power != null ? <svg className="ft-ringsvg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={R} className="ft-ring-bg" /><circle cx="32" cy="32" r={R} className="ft-ring power" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - power) }} /></svg> : null}
            <Icon name="target" /><span>{power != null ? `${Math.round(power * 100)}%` : "Cast"}</span>
          </button>
        ) : null}
        {act === "strike" ? <button type="button" className="ft-main ft-strike" onPointerDown={strike} onContextMenu={(e) => e.preventDefault()} onKeyDown={key(strike)}><Icon name="hook" /><span>Strike</span></button> : null}
        {act === "land" ? <button type="button" className="ft-main ft-land" onPointerDown={land} onContextMenu={(e) => e.preventDefault()} onKeyDown={key(land)}>{tenRing}<Icon name="fish" /><span>Land</span></button> : null}
        {act === "reel" ? (
          <button type="button" className={`ft-main ft-reel${fight?.assisted ? " assisted" : ""}${pressed ? " pressed" : ""}`} aria-label={`Reel: tap again and again, or hold. ${Math.round(reel * 100)}% of the way in`}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ } onTap?.(); onHold?.(true); setTapFx((n) => n + 1); setPressed(true); }} onPointerUp={() => { setPressed(false); onHold?.(false); }} onPointerCancel={() => { setPressed(false); onHold?.(false); }} onPointerLeave={() => { setPressed(false); onHold?.(false); }} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (onTap || onNudge)?.(); } }}>
            {tenRing}
            {tapFx ? <span key={tapFx} className="ft-tapfx" aria-hidden="true" /> : null}
            <span className="ft-handle" style={{ transform: `rotate(${((fight?.turns || 0) * 360) % 360}deg)` }}><Icon name="refresh" /></span><span className="ft-word">Reel</span>
            {dist ? <b className="ft-dist" aria-label={`About ${dist.replace("\u00a0", " ")} out`}>{dist}</b> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
