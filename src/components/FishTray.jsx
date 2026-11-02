// ---- FishTray: the fishing control at the bottom of the scene ----
// One large button for the step that makes sense now, and nothing else, so the rod and the water stay clear:
//   Cast (hold to build power, look where you want it, let go) → Strike (one tap) → Reel (tap it, again and again:
//   each tap turns the handle) → Land (once the fish is close) → Cast again.
// While a fish is on, a slim gauge beside the button shows the line's tension and where the drag will slip. Assisted
// reeling (an option) winds steadily after one tap. In Advanced mode two small buttons set the drag. Nothing shows
// while the cast flies or a fish is being landed. A line of small text says what's going on.
import { useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { WorldCtx } from "./WorldContext.js";

const R = 29, C = 2 * Math.PI * R;
const HOLD_CYCLE = 1150; // ms from no power to full (then back down: let go at the top)

/**
 * phase: the scene phase; last: the last event type; reel: 0..1; fight: the fight's state while a fish is on
 * (useVirtualFishing); note: a short message; opts: { assisted, advanced }.
 */
export default function FishTray({ phase, last, reel = 0, fight = null, note = "", opts = {}, autoplay = false, onCast, onStrike, onTap, onLand, onDrag, onStop, onNudge, hint }) {
  const world = useContext(WorldCtx);
  const lineOut = !(last === "catch" || last === "lost") && last != null;
  const [power, setPower] = useState(null);
  const hold = useRef(null);
  let act = null, label = hint || "", busy = false;
  if (autoplay) { label = "Playing it through"; }
  else if (phase === "idle" || phase === "ended" || (phase === "waiting" && !lineOut)) { act = "cast"; label = label || (power != null ? "Let go to cast" : last ? "Hold to cast again" : "Hold Cast, aim, let go"); }
  else if (phase === "cast") { busy = true; label = "Casting"; }
  else if (phase === "waiting" || phase === "missed") { label = phase === "missed" ? "Missed it. The bait's still out" : "Waiting for a bite"; }
  else if (phase === "bite") { act = "strike"; label = "Bite! Strike now"; }
  else if (phase === "hooked") {
    act = fight?.near ? "land" : "reel";
    const m = fight ? `\u00a0· ${Math.round(fight.dist)}\u00a0m` : "";
    label = fight?.near ? "It's close: land it" : fight?.slipping ? `The drag's giving line${m}` : fight?.running ? `It's running! Keep it tight${m}` : opts.assisted ? (fight?.assisted ? `Winding: tap to stop${m}` : "Tap once to start winding") : `Tap to reel${m}`;
  }
  else if (phase === "landing") { busy = true; label = "Landing it"; }
  else if (phase === "lost") { label = "Lost it"; }
  if (note) label = note;
  const hide = busy && !autoplay;

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
  const castDown = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); hold.current = { t0: performance.now(), p: 0 }; setPower(0); };
  const castUp = () => {
    const h = hold.current; if (!h) return; hold.current = null;
    // a quick tap is a gentle cast; holding sets the power
    const p = performance.now() - h.t0 < 180 ? 0.5 : h.p;
    const params = world?.current?.castParams?.(p) || { power: p };
    world?.current?.aimCast?.(null); setPower(null);
    onCast?.(params);
  };
  const castCancel = () => { if (!hold.current) return; hold.current = null; world?.current?.aimCast?.(null); setPower(null); };

  const ten = fight ? Math.max(0, Math.min(1.2, fight.tension)) : 0, dragAt = fight ? Math.min(1.2, fight.drag) : 0.78;
  const tenCls = fight?.slipping ? "slip" : ten > dragAt * 0.85 ? "high" : ten > 0.45 ? "mid" : "low";
  return (
    <div className={`fish-tray${hide ? " is-busy" : ""}`} role="group" aria-label="Fishing controls">
      {act === "cast" ? (
        <button type="button" className={`ft-main ft-cast${power != null ? " holding" : ""}`} aria-label="Cast: hold to build power, let go to cast"
          onPointerDown={castDown} onPointerUp={castUp} onPointerCancel={castCancel} onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); onCast?.(world?.current?.castParams?.(0.6) || { power: 0.6 }); } }}>
          {power != null ? <svg className="ft-ringsvg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={R} className="ft-ring-bg" /><circle cx="32" cy="32" r={R} className="ft-ring power" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - power) }} /></svg> : null}
          <Icon name="target" /><span>{power != null ? `${Math.round(power * 100)}%` : "Cast"}</span>
        </button>
      ) : null}
      {act === "strike" ? <button type="button" className="ft-main ft-strike" onPointerDown={(e) => { e.preventDefault(); onStrike?.(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onStrike?.(); } }}><Icon name="hook" /><span>Strike</span></button> : null}
      {act === "reel" || act === "land" ? (
        <div className="ft-fight">
          <div className={`ft-tension ${tenCls}`} role="meter" aria-label="Line tension" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((ten / 1.2) * 100)}>
            <i className="ft-ten-fill" style={{ height: `${(ten / 1.2) * 100}%` }} />
            <i className="ft-ten-drag" style={{ bottom: `${(dragAt / 1.2) * 100}%` }} />
          </div>
          {act === "land" ? (
            <button type="button" className="ft-main ft-land" onPointerDown={(e) => { e.preventDefault(); onLand?.(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLand?.(); } }}><Icon name="fish" /><span>Land</span></button>
          ) : (
            <button type="button" className={`ft-main ft-reel${fight?.assisted ? " assisted" : ""}`} aria-label={`Reel: tap again and again. ${Math.round(reel * 100)}% of the way in`}
              onPointerDown={(e) => { e.preventDefault(); onTap?.(); }} onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (onTap || onNudge)?.(); } }}>
              <svg className="ft-ringsvg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r={R} className="ft-ring-bg" /><circle cx="32" cy="32" r={R} className="ft-ring" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - reel) }} /></svg>
              <span className="ft-handle" style={{ transform: `rotate(${((fight?.turns || 0) * 360) % 360}deg)` }}><Icon name="refresh" /></span><span>Reel</span>
            </button>
          )}
          {opts.advanced && act === "reel" ? (
            <div className="ft-drag" role="group" aria-label="Drag">
              <button type="button" className="ft-pill" onClick={() => onDrag?.(+1)} aria-label="Tighten the drag">Drag +</button>
              <button type="button" className="ft-pill" onClick={() => onDrag?.(-1)} aria-label="Loosen the drag">Drag −</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {autoplay ? <button type="button" className="ft-pill" onClick={onStop}><Icon name="stop" />Stop</button> : null}
      <span className="ft-label" aria-live="polite">{label}</span>
    </div>
  );
}
