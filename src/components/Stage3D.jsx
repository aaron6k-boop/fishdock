// ---- Stage3D: the 3D view with its small tools: camera modes, Look at my rod, Watch a friend, the catch card ----
// Used by the demo and by Fish Together. The overlay (`children`) is the page's own top bar and fishing tray.
import { useEffect, useRef, useState } from "react";
import World3D, { loadView, saveView } from "./World3D.jsx";
import { CatchCard } from "./FishingScene.jsx";
import { Icon } from "./ui.jsx";

const MODES = [["first", "First person"], ["third", "Third person"], ["spectator", "Watch someone"], ["cinematic", "Cinematic"], ["free", "Free look"]];

export default function Stage3D({ spotId = null, placeName = "", feel = null, venue, anglers, light, cond, facing, quality = "auto", sound, now, demo = false, onTap, toasts = [], catchPhoto, children, onLanded, onPhase, onPose, onToast }) {
  const w = useRef(null);
  const [menu, setMenu] = useState(false), [mode, setMode] = useState("first"), [card, setCard] = useState(null), [watch, setWatch] = useState(null);
  const others = anglers.filter((a) => !a.local);
  // ---- walking about (Roblox-style): a thumbstick, jump, sprint, and "Fish here" at the water's edge ----
  const [walk, setWalk] = useState(null), [walkMsg, setWalkMsg] = useState("");
  const say = (m) => { setWalkMsg(m); setTimeout(() => setWalkMsg((x) => (x === m ? "" : x)), 3200); };
  const startWalk = () => { const why = w.current?.walk(true); if (why) say(why); else { setMenu(false); say("Walk with the stick; drag to look round. Find the water's edge to fish."); } };
  const stopWalk = () => w.current?.walk(false);
  const fishHere = () => { const sp = w.current?.fishHere(); if (sp) say("Fishing from here. Cast when you're ready."); };
  const [sprint, setSprint] = useState(false);
  useEffect(() => { if (!walk) setSprint(false); }, [walk]);
  const [view, setView] = useState(loadView);
  const setOpt = (k, v) => { const next = { ...view, [k]: v }; setView(next); saveView(next); if (k === "track") w.current?.setTrack(v); if (k === "hand") { if (v === "right") document.documentElement.dataset.hand = "right"; else delete document.documentElement.dataset.hand; } };
  // someone who isn't fishing watches from behind an angler rather than standing nowhere
  const watching = !anglers.some((a) => a.local) && anglers.length > 0;
  useEffect(() => { if (watching && mode !== "spectator" && mode !== "cinematic") { const t = setTimeout(() => pick("spectator"), 600); return () => clearTimeout(t); } return undefined; }, [watching]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (m) => { setMode(m); w.current?.setMode(m); setMenu(false); if (m === "spectator" && others[0]) { const id = watch || others[0].id; setWatch(id); w.current?.focus(id); } };
  // watching someone: in spectator mode the camera glides over behind them; otherwise you stay where you are and turn
  // to keep them (their rod, the fight, the landing) in view until you drag the view yourself
  const watchOne = (id) => { setWatch(id); setAlert(null); if (mode === "spectator") w.current?.focus(id); else w.current?.follow(id, 90); };
  const watchNext = () => {
    if (!others.length) return;
    const i = others.findIndex((a) => a.id === watch), next = others[(i + 1) % others.length];
    watchOne(next.id);
  };
  // someone else has a fish on: a small chip offers to watch it
  const [alert, setAlert] = useState(null);
  useEffect(() => { if (!alert) return undefined; const t = setTimeout(() => setAlert(null), 14000); return () => clearTimeout(t); }, [alert]);
  return (
    <div className={`stage3d${walk ? " walking" : ""}`}>
      {/* first person to start, looking out over the line with the rod in your hands (third person and watching others are in the menu) */}
      <World3D ref={w} startMode="first" feel={feel} onWalk={setWalk} spotId={spotId} placeName={placeName} onTap={onTap} venue={venue} anglers={anglers} light={light} cond={cond} facing={facing} quality={quality} sound={sound} now={now}
        onPhase={(id, phase, info) => {
          onPhase?.(id, phase, info);
          if (watching && mode === "spectator" && (phase === "bite" || phase === "hooked")) { setWatch(id); w.current?.focus(id); return; }
          const a = anglers.find((x) => x.id === id);
          if (a && !a.local && phase === "hooked" && !watching) setAlert({ id, name: a.name || "Someone" });
        }}
        onLanded={(id, ev) => { const a = anglers.find((x) => x.id === id); onLanded?.(id, ev); if (alert?.id === id) setAlert(null); if (a?.local || watch === id) { setCard({ ev, key: `${id}|${ev?.id || ev?.t}`, who: a?.local ? null : a?.name }); setTimeout(() => setCard((c) => (c?.ev === ev ? null : c)), 8000); } }}>
        <div className="fs-overlay">{children}</div>
        <div className="w3d-toasts" aria-live="polite">
          {toasts.slice(-3).map((t) => <div key={t.id} className={`w3d-toast ${t.kind || ""}`}>{t.text}</div>)}
          {alert ? <button type="button" className="w3d-toast w3d-watch" onClick={() => watchOne(alert.id)}>{alert.name} has a fish on · <b>Watch</b></button> : null}
        </div>
        {walk ? (
          <>
            <Joystick onMove={(x, y) => w.current?.setWalkInput({ x, y, sprint })} />
            <div className="walk-buttons">
              <button type="button" className={`walk-btn small${sprint ? " on" : ""}`} aria-pressed={sprint} onClick={() => setSprint(!sprint)}>Sprint</button>
              <button type="button" className="walk-btn jump" onPointerDown={(e) => { e.preventDefault(); w.current?.jump(); }} aria-label="Jump"><Icon name="jump" /></button>
            </div>
            <div className="walk-top">
              {walk.canFish ? <button type="button" className="walk-prompt" onClick={fishHere}><span className="key">Tap</span>Fish here</button> : null}
              <button type="button" className="walk-done" onClick={stopWalk}>Back to my spot</button>
            </div>
          </>
        ) : null}
        {walkMsg ? <div className="walk-msg" role="status">{walkMsg}</div> : null}
        <div className="w3d-tools">
          {!walk ? <button type="button" className="fs-btn" onClick={startWalk} aria-label="Walk about" title="Walk about"><Icon name="walk" /></button> : null}
          {menu ? (
            <div className="cam-menu" role="menu" aria-label="Camera">
              {MODES.filter(([m]) => m !== "spectator" || others.length).map(([m, l]) => <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} className={`ft-pill${mode === m ? " on" : ""}`} onClick={() => pick(m)}>{l}</button>)}
              <hr className="cam-sep" />
              <button type="button" role="menuitemcheckbox" aria-checked={view.track} className={`ft-pill${view.track ? " on" : ""}`} onClick={() => setOpt("track", !view.track)} title="The camera turns to a leaping fish, unless you're moving the view yourself">Follow jumps</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.hand === "right"} className={`ft-pill${view.hand === "right" ? " on" : ""}`} onClick={() => setOpt("hand", view.hand === "right" ? "left" : "right")} title="Cast, Strike and Reel at the bottom right, for your right thumb">Controls on the right</button>
              {sound ? <button type="button" role="menuitemcheckbox" aria-checked={view.spatial} className={`ft-pill${view.spatial ? " on" : ""}`} onClick={() => setOpt("spatial", !view.spatial)} title="Sounds come from where they happen, quieter further away">Spatial sound</button> : null}
            </div>
          ) : null}
          <button type="button" className={`fs-btn${menu ? " on" : ""}`} onClick={() => setMenu(!menu)} aria-label="Camera" aria-expanded={menu}><Icon name="camera" /></button>
          {others.length ? <button type="button" className="fs-btn" onClick={watchNext} aria-label={`Watch ${others.find((a) => a.id === watch)?.name || others[0].name}`} title="Watch a friend"><Icon name="users" /></button> : null}
          <button type="button" className="fs-btn" onClick={() => w.current?.lookAtRod()} aria-label="Look at my rod" title="Look at my rod"><Icon name="rod" /></button>
        </div>
        {card ? <div className="w3d-card"><CatchCard ev={card.ev} demo={demo} compact photoUrl={catchPhoto?.(card.ev)} onClose={() => setCard(null)} who={card.who} /></div> : null}
      </World3D>
    </div>
  );
}

// ---- the thumbstick: drag from its middle; how far you push sets the speed ----
function Joystick({ onMove }) {
  const base = useRef(null), [knob, setKnob] = useState([0, 0]), id = useRef(null);
  const R = 46;
  const move = (e) => {
    const r = base.current.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    setKnob([dx, dy]); onMove(dx / R, -dy / R);
  };
  const end = () => { id.current = null; setKnob([0, 0]); onMove(0, 0); };
  return (
    <div ref={base} className="joystick" role="application" aria-label="Walk: drag the stick"
      onPointerDown={(e) => { e.preventDefault(); id.current = e.pointerId; base.current.setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) move(e); }}
      onPointerUp={end} onPointerCancel={end}>
      <div className="joystick-knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}
