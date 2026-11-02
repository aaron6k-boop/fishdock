// ---- FishTray: the small control at the bottom of the fishing scene ----
// One round button for the one thing that makes sense now (Cast, Strike, or hold to Reel), and nothing at all while
// the cast flies or a fish is landed, so the rod and the water stay clear. A line of small text says what's going
// on. Testing controls live in the settings sheet, not here.
import { Icon } from "./ui.jsx";

const R = 25, C = 2 * Math.PI * R;

/** phase: the scene phase; last: the last event type; reel: 0..1 while reeling. */
export default function FishTray({ phase, last, reel = 0, autoplay = false, onCast, onStrike, onHold, onNudge, onStop, hint }) {
  const lineOut = !(last === "catch" || last === "lost") && last != null;
  let act = null, label = hint || "", busy = false;
  if (autoplay) { label = "Playing it through"; }
  else if (phase === "idle" || phase === "ended" || (phase === "waiting" && !lineOut)) { act = "cast"; label = label || (last ? "Cast again" : "Ready when you are"); }
  else if (phase === "cast") { busy = true; label = "Casting"; }
  else if (phase === "waiting" || phase === "missed") { label = phase === "missed" ? "Missed it. The bait's still out" : "Waiting for a bite"; }
  else if (phase === "bite") { act = "strike"; label = "Bite! Strike now"; }
  else if (phase === "hooked") { act = "reel"; label = reel > 0.85 ? "Nearly there" : "Hold to reel"; }
  else if (phase === "landing") { busy = true; label = "Landing it"; }
  else if (phase === "lost") { label = "Lost it"; }
  const hide = busy && !autoplay;
  return (
    <div className={`fish-tray${hide ? " is-busy" : ""}`} role="group" aria-label="Fishing controls">
      {act === "cast" ? <button type="button" className="ft-main" onClick={onCast}><Icon name="target" /><span>Cast</span></button> : null}
      {act === "strike" ? <button type="button" className="ft-main ft-strike" onClick={onStrike}><Icon name="hook" /><span>Strike</span></button> : null}
      {act === "reel" ? (
        <button type="button" className="ft-main ft-reel" aria-label={`Reel in, ${Math.round(reel * 100)}% of the way`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onHold?.(true); }} onPointerUp={() => onHold?.(false)} onPointerCancel={() => onHold?.(false)} onPointerLeave={() => onHold?.(false)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNudge?.(); } }} onContextMenu={(e) => e.preventDefault()}>
          <svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r={R} className="ft-ring-bg" /><circle cx="28" cy="28" r={R} className="ft-ring" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - reel) }} /></svg>
          <Icon name="refresh" /><span>Reel</span>
        </button>
      ) : null}
      {autoplay ? <button type="button" className="ft-pill" onClick={onStop}><Icon name="stop" />Stop</button> : null}
      <span className="ft-label" aria-live="polite">{label}</span>
    </div>
  );
}
