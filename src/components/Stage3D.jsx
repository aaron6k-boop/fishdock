// ---- Stage3D: the 3D view with its small tools: camera modes, Look at my rod, Watch a friend, the catch card ----
// Used by the demo and by Fish Together. The overlay (`children`) is the page's own top bar and fishing tray.
import { useEffect, useRef, useState } from "react";
import World3D, { loadView, saveView, loadLevels, saveLevels } from "./World3D.jsx";
import { setVolumes } from "../lib/sceneAudio.js";
import { WorldCtx } from "./WorldContext.js";
import { CatchCard } from "./FishingScene.jsx";
import { Icon } from "./ui.jsx";
import { speciesById } from "../data/species.js";

const MODES = [["first", "First person"], ["third", "Third person"], ["spectator", "Watch someone"], ["cinematic", "Cinematic"], ["free", "Free look"]];

export default function Stage3D({ spotId = null, placeName = "", feel = null, venue, anglers, light, cond, facing, quality = "auto", sound, now, demo = false, onTap, toasts = [], catchPhoto, children, onLanded, onPhase, onPose, poseBus, onHear, speaking = null, onEmote, fight = null, reelOpts = null, onReelOpts }) {
  const w = useRef(null);
  const [menu, setMenu] = useState(false), [mode, setMode] = useState("first"), [card, setCard] = useState(null), [watch, setWatch] = useState(null);
  const others = anglers.filter((a) => !a.local);
  // ---- walking about: a stick on the left (one thumb), a small Sprint and Jump, and Start fishing at the water's edge ----
  const [walk, setWalk] = useState(null), [walkMsg, setWalkMsg] = useState("");
  const say = (m) => { setWalkMsg(m); setTimeout(() => setWalkMsg((x) => (x === m ? "" : x)), 3200); };
  const [view, setView] = useState(loadView);
  const startWalk = () => { const why = w.current?.walk(true, { dist: view.camDist }); if (why) say(why); else { setMenu(false); say("Walk with the stick and drag to look round. At the water's edge, tap Start fishing."); } };
  const stopWalk = () => w.current?.walk(false);
  const fishHere = () => { const sp = w.current?.fishHere(); if (sp) say("Fishing from here. Cast when you're ready."); };
  const [sprint, setSprint] = useState(false);
  // emotes: wave, cheer or clap (the others in a Fish Together party see it too)
  const [emotes, setEmotes] = useState(false);
  const emote = (k) => { w.current?.emote(k); onEmote?.(k); setEmotes(false); };
  const hasMe = anglers.some((a) => a.local);
  // voice chat: a light above whoever's talking
  const spokeRef = useRef(new Set());
  useEffect(() => { const now = speaking || new Set(); for (const id of spokeRef.current) if (!now.has(id)) w.current?.setSpeaking(id, false); for (const id of now) w.current?.setSpeaking(id, true); spokeRef.current = new Set(now); }, [speaking]);
  // other people walking about (Fish Together): their poses straight to the 3D view
  useEffect(() => { if (!poseBus) return undefined; const f = (e) => w.current?.setRemotePose(e.detail.who, e.detail.p); poseBus.addEventListener("pose", f); return () => poseBus.removeEventListener("pose", f); }, [poseBus]);
  // ---- your landed fish: it waits in the net; tap it (or Look at it) to hold it up, then keep it or put it back ----
  const [kept, setKept] = useState(null), [landed, setLanded] = useState(null), [looking, setLooking] = useState(false);
  const openInspect = () => { if (!landed) return; w.current?.inspectFish(true); setLooking(true); };
  const keepIt = () => { w.current?.keepFish(); setLooking(false); if (landed) { setCard({ ev: landed.ev, key: landed.key, who: null }); setTimeout(() => setCard((c) => (c?.ev === landed.ev ? null : c)), 8000); } setLanded(null); };
  const putBack = () => { w.current?.releaseFish(); setLooking(false); const sp = speciesById(landed?.ev?.data?.species); say(`Back it goes${sp ? `: the ${sp.name.toLowerCase()} swims off` : ""}.`); setLanded(null); };
  useEffect(() => { if (!kept) { setLooking(false); } }, [kept]);
  useEffect(() => { if (kept === null && landed && !looking) setLanded(null); }, [kept]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!walk) setSprint(false); }, [walk]);
  const setOpt = (k, v) => { const next = { ...view, [k]: v }; setView(next); saveView(next); if (k === "track") w.current?.setTrack(v); if (k === "look" || k === "smooth") w.current?.setLookFeel(next); if (k === "hand") { if (v === "right") document.documentElement.dataset.hand = "right"; else delete document.documentElement.dataset.hand; } };
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
      <World3D ref={w} fight={fight} startMode="first" feel={feel} onWalk={setWalk} onPose={onPose} onHear={onHear} spotId={spotId} placeName={placeName} onTap={onTap} venue={venue} anglers={anglers} light={light} cond={cond} facing={facing} sound={sound} now={now} quality={view.gfx && view.gfx !== "auto" ? view.gfx : quality}
        onPhase={(id, phase, info) => {
          onPhase?.(id, phase, info);
          if (watching && mode === "spectator" && (phase === "bite" || phase === "hooked")) { setWatch(id); w.current?.focus(id); return; }
          const a = anglers.find((x) => x.id === id);
          if (a && !a.local && phase === "hooked" && !watching) setAlert({ id, name: a.name || "Someone" });
        }}
        onKept={setKept} onFishTap={() => openInspect()}
        onLanded={(id, ev) => { const a = anglers.find((x) => x.id === id); onLanded?.(id, ev); if (alert?.id === id) setAlert(null); if (a?.local && a.inspect) { setLanded({ ev, key: `${id}|${ev?.id || ev?.t}` }); return; } if (a?.local || watch === id) { setCard({ ev, key: `${id}|${ev?.id || ev?.t}`, who: a?.local ? null : a?.name }); setTimeout(() => setCard((c) => (c?.ev === ev ? null : c)), 8000); } }}>
        <div className="fs-overlay"><WorldCtx.Provider value={w}>{children}</WorldCtx.Provider></div>
        <div className="w3d-toasts" aria-live="polite">
          {toasts.slice(-3).map((t) => <div key={t.id} className={`w3d-toast ${t.kind || ""}`}>{t.text}</div>)}
          {alert ? <button type="button" className="w3d-toast w3d-watch" onClick={() => watchOne(alert.id)}>{alert.name} has a fish on · <b>Watch</b></button> : null}
        </div>
        {walk ? (
          <>
            <Joystick size={view.stick} float={view.stickFloat} onMove={(x, y) => w.current?.setWalkInput({ x, y, sprint })} />
            <div className="walk-actions">
              {walk.canFish ? <button type="button" className="walk-fish" onClick={fishHere}><Icon name="target" />Start fishing</button> : walk.crowded ? <span className="walk-note">Too close to someone to fish: move along a little</span> : null}
              <div className="walk-small">
                {view.autoBtn ? <button type="button" className={`walk-pill${walk.auto ? " on" : ""}`} aria-pressed={!!walk.auto} onClick={() => w.current?.autoWalk(!walk.auto)} title="Keep walking where you look; touch the stick to stop">Auto</button> : null}
                <button type="button" className={`walk-pill${sprint ? " on" : ""}`} aria-pressed={sprint} onClick={() => setSprint(!sprint)}>Sprint</button>
                <button type="button" className="walk-pill" onPointerDown={(e) => { e.preventDefault(); w.current?.jump(); }} aria-label="Jump"><Icon name="jump" /></button>
              </div>
            </div>
          </>
        ) : null}
        {walkMsg ? <div className="walk-msg" role="status">{walkMsg}</div> : null}
        {landed && kept === "deck" && !looking ? <div className="walk-top"><button type="button" className="walk-prompt" onClick={openInspect}><span className="key">Tap</span>Your fish is in the net: have a look</button></div> : null}
        {looking && landed ? <FishLook ev={landed.ev} demo={demo} onKeep={keepIt} onRelease={putBack} onClose={() => { w.current?.inspectFish(false); setLooking(false); }} /> : null}
        <div className="w3d-tools">
          {walk ? <button type="button" className="fs-btn on" onClick={stopWalk} aria-label="Stop walking" title="Stop walking and go back to where you were fishing"><Icon name="walk" /></button>
            : <button type="button" className="fs-btn" onClick={startWalk} aria-label="Walk about" title="Walk about (Beta)"><Icon name="walk" /></button>}
          {menu ? (
            <div className="cam-menu" role="menu" aria-label="Camera">
              {MODES.filter(([m]) => m !== "spectator" || others.length).map(([m, l]) => <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} className={`ft-pill${mode === m ? " on" : ""}`} onClick={() => pick(m)}>{l}</button>)}
              <hr className="cam-sep" />
              <button type="button" role="menuitemcheckbox" aria-checked={view.track} className={`ft-pill${view.track ? " on" : ""}`} onClick={() => setOpt("track", !view.track)} title="The camera turns to a leaping fish, unless you're moving the view yourself">Follow jumps</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.hand === "right"} className={`ft-pill${view.hand === "right" ? " on" : ""}`} onClick={() => setOpt("hand", view.hand === "right" ? "left" : "right")} title="Cast, Strike and Reel at the bottom right, for your right thumb">Controls on the right</button>
              <hr className="cam-sep" />
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("look", { low: "normal", normal: "high", high: "low" }[view.look] || "normal")} title="How far the view turns for a drag">Look speed: {{ low: "Low", normal: "Normal", high: "High" }[view.look] || "Normal"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.smooth !== false} className={`ft-pill${view.smooth !== false ? " on" : ""}`} onClick={() => setOpt("smooth", view.smooth === false)} title="The view carries on turning a little after a flick">Smooth camera</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("stick", { s: "m", m: "l", l: "s" }[view.stick] || "m")} title="The walking stick's size">Stick size: {{ s: "Small", m: "Medium", l: "Large" }[view.stick] || "Medium"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.stickFloat} className={`ft-pill${view.stickFloat ? " on" : ""}`} onClick={() => setOpt("stickFloat", !view.stickFloat)} title="Touch anywhere in the lower left to walk, instead of a stick in the corner">Floating stick</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("camDist", { near: "normal", normal: "far", far: "near" }[view.camDist] || "normal")} title="How far behind you the camera follows when you walk about (pinch to change it as you go)">Walking camera: {{ near: "Near", normal: "Normal", far: "Far" }[view.camDist] || "Normal"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.autoBtn} className={`ft-pill${view.autoBtn ? " on" : ""}`} onClick={() => setOpt("autoBtn", !view.autoBtn)} title="An Auto button when you walk about: keep walking where you look until you touch the stick">Auto-walk button</button>
              {reelOpts ? <>
                <hr className="cam-sep" />
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.assisted} className={`ft-pill${reelOpts.assisted ? " on" : ""}`} onClick={() => onReelOpts?.({ assisted: !reelOpts.assisted })} title="One tap starts winding at a steady rate, another stops it, instead of tapping again and again">Assisted reeling</button>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.advanced} className={`ft-pill${reelOpts.advanced ? " on" : ""}`} onClick={() => onReelOpts?.({ advanced: !reelOpts.advanced })} title="Set the drag yourself while you fight a fish: too tight and the line can break">Advanced fight</button>
              </> : null}
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("gfx", { auto: "performance", performance: "balanced", balanced: "high", high: "auto" }[view.gfx] || "auto")} title="Performance runs smoother and saves battery; Quality looks best on a newer phone">Graphics: {{ auto: "Auto", performance: "Performance", balanced: "Balanced", high: "Quality" }[view.gfx] || "Auto"}</button>
              {sound ? <SoundLevels /> : null}
              {sound ? <button type="button" role="menuitemcheckbox" aria-checked={view.spatial} className={`ft-pill${view.spatial ? " on" : ""}`} onClick={() => setOpt("spatial", !view.spatial)} title="Sounds come from where they happen, quieter further away">Spatial sound</button> : null}
            </div>
          ) : null}
          {emotes ? (
            <div className="cam-menu" role="menu" aria-label="Emotes">
              {[["wave", "Wave"], ["cheer", "Cheer"], ["clap", "Clap"]].map(([k, l]) => <button key={k} type="button" role="menuitem" className="ft-pill" onClick={() => emote(k)}>{l}</button>)}
            </div>
          ) : null}
          {hasMe ? <button type="button" className={`fs-btn${emotes ? " on" : ""}`} onClick={() => { setEmotes(!emotes); setMenu(false); }} aria-label="Emotes" aria-expanded={emotes} title="Wave, cheer or clap"><Icon name="hand" /></button> : null}
          <button type="button" className={`fs-btn${menu ? " on" : ""}`} onClick={() => { setMenu(!menu); setEmotes(false); }} aria-label="Camera" aria-expanded={menu}><Icon name="camera" /></button>
          {others.length ? <button type="button" className="fs-btn" onClick={watchNext} aria-label={`Watch ${others.find((a) => a.id === watch)?.name || others[0].name}`} title="Watch a friend"><Icon name="users" /></button> : null}
          <button type="button" className="fs-btn" onClick={() => w.current?.lookAtRod()} aria-label="Look at my rod" title="Look at my rod"><Icon name="rod" /></button>
        </div>
        {card ? <div className="w3d-card"><CatchCard ev={card.ev} demo={demo} compact photoUrl={catchPhoto?.(card.ev)} onClose={() => setCard(null)} who={card.who} /></div> : null}
      </World3D>
    </div>
  );
}

// ---- the thumbstick: drag from its middle; how far you push sets the speed ----
function Joystick({ onMove, size = "m", float = false }) {
  // fixed: a stick in the bottom-left corner; floating: touch anywhere in the lower left and the stick appears under
  // your thumb. It fades back when you're not using it
  const zone = useRef(null), [knob, setKnob] = useState([0, 0]), [at, setAt] = useState(null), [busy, setBusy] = useState(false), id = useRef(null);
  const R = { s: 38, m: 46, l: 56 }[size] || 46;
  const centre = () => { if (float && at) return at; const r = zone.current.querySelector(".joystick").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const move = (e, c = centre()) => {
    let dx = e.clientX - c[0], dy = e.clientY - c[1]; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    setKnob([dx, dy]); onMove(dx / R, -dy / R);
  };
  const end = (e) => { if (e && id.current !== e.pointerId) return; id.current = null; setBusy(false); setKnob([0, 0]); setAt(null); onMove(0, 0); };
  const down = (e) => {
    if (id.current != null) return;
    e.preventDefault(); id.current = e.pointerId; setBusy(true); e.currentTarget.setPointerCapture(e.pointerId);
    if (float) { const r = zone.current.getBoundingClientRect(); zone.current.style.setProperty("--jx", `${e.clientX - r.left}px`); zone.current.style.setProperty("--jy", `${e.clientY - r.top}px`); setAt([e.clientX, e.clientY]); move(e, [e.clientX, e.clientY]); }
    else move(e);
  };
  const handlers = { onPointerDown: down, onPointerMove: (e) => { if (id.current === e.pointerId) move(e); }, onPointerUp: end, onPointerCancel: end };
  return (
    <div ref={zone} className={`joystick-zone stick-${size}${float ? " floating" : ""}${busy ? " active" : ""}`} {...(float ? handlers : {})}>
      <div className={`joystick${float && at ? " placed" : ""}`} role="application" aria-label="Walk: drag the stick" {...(float ? {} : handlers)}>
        <div className="joystick-knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
      </div>
    </div>
  );
}

// ---- having a look at your fish before you decide ----
function FishLook({ ev, demo, onKeep, onRelease, onClose }) {
  const d = ev?.data || {}, sp = speciesById(d.species);
  const len = d.lengthCm ? `${d.lengthCm} cm (${(d.lengthCm / 2.54).toFixed(1)} in)` : null, kg = d.weightKg ? `${d.weightKg >= 1 ? d.weightKg.toFixed(1) : d.weightKg.toFixed(2)} kg` : null;
  return (
    <div className="fish-look" role="dialog" aria-label={`Your ${sp?.name || "fish"}`}>
      <button type="button" className="xbtn fish-look-x" onClick={onClose} aria-label="Put it down"><Icon name="close" /></button>
      <span className="cc-kicker">{demo ? "Demo · not logged" : "Simulated · not a real record"}</span>
      <h3>{sp?.name || "Fish"} {sp?.latin ? <i className="tiny muted">{sp.latin}</i> : null}</h3>
      <p className="cc-facts">{[len, kg].filter(Boolean).join(" · ")}</p>
      {sp?.idTip ? <p className="small"><b>How to tell it:</b> {sp.idTip}</p> : null}
      {sp?.conservation ? <p className="small muted">{sp.conservation}</p> : null}
      <div className="row">
        <button type="button" className="btn primary" onClick={onKeep}><Icon name="check" />Keep it</button>
        <button type="button" className="btn" onClick={onRelease}>Put it back</button>
      </div>
    </div>
  );
}

// ---- sound levels: the surroundings (waves, wind, gulls), the tackle (reel, line), and the moments (bites, splashes) ----
function SoundLevels() {
  const [lv, setLv] = useState(loadLevels);
  const set = (k, v) => { const next = { ...lv, [k]: v }; setLv(next); saveLevels(next); setVolumes(next); };
  return (
    <div className="sound-levels" role="group" aria-label="Sound levels">
      {[["environment", "Surroundings"], ["equipment", "Reel and tackle"], ["events", "Bites and splashes"]].map(([k, l]) => (
        <label key={k} className="sl-row"><span>{l}</span><input type="range" min="0" max="1" step="0.05" value={lv[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={`${l} volume`} /></label>
      ))}
    </div>
  );
}
