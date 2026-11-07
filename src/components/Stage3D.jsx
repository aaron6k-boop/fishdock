// ---- Stage3D: the 3D view with its small tools: camera modes, Look at my rod, Watch a friend, the catch card ----
// Used by the demo and by Fish Together. The overlay (`children`) is the page's own top bar and fishing tray.
import { useEffect, useMemo, useRef, useState } from "react";
import World3D, { loadView, saveView, loadLevels, saveLevels } from "./World3D.jsx";
import { setVolumes } from "../lib/sceneAudio.js";
import { WorldCtx, SceneCtx } from "./WorldContext.js";
import { CatchCard } from "./FishingScene.jsx";
import { Icon } from "./ui.jsx";
import { speciesById } from "../data/species.js";
import { catchInfo } from "../lib/catchInfo.js";
import GraphicsPanel, { FpsMeter } from "./GraphicsPanel.jsx";

const MODES = [["first", "First person"], ["third", "Third person"], ["spectator", "Watch someone"], ["cinematic", "Cinematic"], ["free", "Free look"]];

export default function Stage3D({ onWindIn, menu: pageMenu = null, spotId = null, placeName = "", feel = null, venue, anglers, light, cond, facing, quality = "auto", sound, now, demo = false, onTap, toasts = [], catchPhoto, children, onLanded, onPhase, onPose, poseBus, onHear, speaking = null, onEmote, fight = null, reelOpts = null, onReelOpts }) {
  const w = useRef(null);
  const [menu, setMenu] = useState(false), [mode, setMode] = useState(() => (loadView().fishCam === "third" ? "third" : "first")), [card, setCard] = useState(null), [watch, setWatch] = useState(null);
  const others = anglers.filter((a) => !a.local);
  // ---- walking about: a stick on the left (one thumb), a small Sprint and Jump, and Start fishing at the water's edge ----
  const [walk, setWalk] = useState(null), [walkMsg, setWalkMsg] = useState("");
  const say = (m) => { setWalkMsg(m); setTimeout(() => setWalkMsg((x) => (x === m ? "" : x)), 3200); };
  const [view, setView] = useState(loadView);
  const startWalk = (retry = false) => {
    const why = w.current?.walk(true, { dist: view.camDist });
    // your line's still in the water: wind it in, then walk (one step, never "reel in first" with nothing to reel)
    if (why === "line") { if (!retry && onWindIn?.()) setTimeout(() => startWalk(true), 250); else say("Wind your line in first."); return; }
    if (why) say(why); else { setMenu(false); say(retry ? "Line wound in. Use the stick to walk; Start fishing shows at the water's edge." : "Use the stick to walk and drag to look round. Start fishing shows at the water's edge."); }
  };
  const stopWalk = () => w.current?.walk(false);
  const fishHere = () => { const sp = w.current?.fishHere(); if (sp) say("Fishing from here. Cast when you're ready."); };
  // ---- on a computer: W A S D to walk (Shift sprints, Space jumps), Space to cast (hold for power), strike and reel
  // (hold to wind), E for the next thing to do (land it, start fishing here, back to your spot), drag to look ----
  // The keys press the same buttons a thumb would, so the fishing behaves exactly as it does on a phone.
  const keyState = useRef({ held: new Set(), space: null });
  const walkRef = useRef(null); walkRef.current = walk;
  useEffect(() => {
    const root = () => document.querySelector(".stage3d") || document;
    const press = (el, type) => { if (!el) return; const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerdown" ? 1 : 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
    const typing = (e) => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
    const move = () => {
      const h = keyState.current.held, x = (h.has("KeyD") ? 1 : 0) - (h.has("KeyA") ? 1 : 0), y = (h.has("KeyW") ? 1 : 0) - (h.has("KeyS") ? 1 : 0), sp = h.has("ShiftLeft") || h.has("ShiftRight");
      if ((x || y) && !walkRef.current) { startWalk(); }
      stick.current = [x, y]; w.current?.setWalkInput({ x, y, sprint: sp });
    };
    const down = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("[role=dialog]")) return;
      const c = e.code, R = root();
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(c)) { if (!keyState.current.held.has(c)) { keyState.current.held.add(c); move(); } e.preventDefault(); return; }
      if (c === "Space") {
        e.preventDefault(); if (e.repeat) return;
        if (walkRef.current) { w.current?.jump(); return; }
        const btn = R.querySelector(".ft-cast, .ft-strike, .ft-reel, .ft-land");
        if (btn) { keyState.current.space = btn; press(btn, "pointerdown"); }
        return;
      }
      if (c === "KeyE") {
        e.preventDefault(); if (e.repeat) return;
        const b = R.querySelector(".ft-land") || R.querySelector(".walk-fish") || (walkRef.current ? R.querySelector(".walk-pill[aria-label='Stop walking']") : null);
        if (b?.classList.contains("ft-land")) { press(b, "pointerdown"); press(b, "pointerup"); } else b?.click();
      }
    };
    const up = (e) => {
      const c = e.code;
      if (keyState.current.held.has(c)) { keyState.current.held.delete(c); move(); }
      if (c === "Space" && keyState.current.space) { const b = keyState.current.space; keyState.current.space = null; press(b, "pointerup"); }
    };
    const blur = () => { keyState.current.held.clear(); move(); if (keyState.current.space) { press(keyState.current.space, "pointerup"); keyState.current.space = null; } };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const finePointer = useMemo(() => { try { return matchMedia("(pointer: fine)").matches; } catch { return false; } }, []);
  const [sprint, setSprint] = useState(false), [myPhase, setMyPhase] = useState("idle");
  const busyFishing = !!fight || myPhase === "bite" || myPhase === "hooked" || myPhase === "cast";
  // (the stick's last position, so Sprint takes effect at once, without having to move your thumb)
  const stick = useRef([0, 0]);
  useEffect(() => { if (walk) w.current?.setWalkInput({ x: stick.current[0], y: stick.current[1], sprint }); }, [sprint]); // eslint-disable-line react-hooks/exhaustive-deps
  // emotes: wave, cheer or clap (the others in a Fish Together party see it too)
  const emote = (k) => { w.current?.emote(k); onEmote?.(k); };
  const hasMe = anglers.some((a) => a.local);
  // voice chat: a light above whoever's talking
  const spokeRef = useRef(new Set());
  useEffect(() => { const now = speaking || new Set(); for (const id of spokeRef.current) if (!now.has(id)) w.current?.setSpeaking(id, false); for (const id of now) w.current?.setSpeaking(id, true); spokeRef.current = new Set(now); }, [speaking]);
  // other people walking about (Fish Together): their poses straight to the 3D view
  useEffect(() => { if (!poseBus) return undefined; const f = (e) => w.current?.setRemotePose(e.detail.who, e.detail.p); poseBus.addEventListener("pose", f); return () => poseBus.removeEventListener("pose", f); }, [poseBus]);
  // ---- your landed fish: it waits in the net; tap it (or Look at it) to hold it up, then keep it or put it back ----
  const [kept, setKept] = useState(null), [landed, setLanded] = useState(null), [looking, setLooking] = useState(false), [busy, setBusy] = useState(null);
  // (the message that it's gone back waits until it has: said when the release ends, not when you tap Put it back)
  const releaseMsg = useRef(null), keptPrev = useRef(null);
  useEffect(() => { if (keptPrev.current === "release" && kept !== "release" && releaseMsg.current) { say(releaseMsg.current); releaseMsg.current = null; } keptPrev.current = kept; }, [kept]); // eslint-disable-line react-hooks/exhaustive-deps
  const openInspect = () => { if (!landed) return; w.current?.inspectFish(true); setLooking(true); };
  const keepIt = () => { w.current?.keepFish(); setLooking(false); if (landed) { setCard({ ev: landed.ev, key: landed.key, who: null }); setTimeout(() => setCard((c) => (c?.ev === landed.ev ? null : c)), 8000); } setLanded(null); };
  // (how it goes back depends on the place: never dropped off a high pier, but lowered in the drop net. Only the walk
  // down a beach to the water is shortened, and the page says so)
  const putBack = () => {
    w.current?.releaseFish(); setLooking(false); const sp = speciesById(landed?.ev?.data?.species), off = sp ? `: the ${sp.name.toLowerCase()} swims off` : "";
    releaseMsg.current = venue === "pier" ? `Lowered back to the water in the drop net${off}.` : venue === "beach" ? `Back into the shallows (shortened)${off}.` : `Back in the landing net at the water's edge${off}.`; setLanded(null);
  };
  useEffect(() => { if (!kept) { setLooking(false); } }, [kept]);
  useEffect(() => { if (kept === null && landed && !looking) setLanded(null); }, [kept]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!walk) setSprint(false); }, [walk]);
  // (several settings at once, from one view: Settings → Graphics)
  const setOpts = (o) => { setView((cur) => { const next = { ...cur, ...o }; saveView(next); return next; }); };
  const [gfxOpen, setGfxOpen] = useState(false);
  const setOpt = (k, v) => { const next = { ...view, [k]: v }; setView(next); saveView(next); if (k === "track") w.current?.setTrack(v); if (k === "fishCam") { w.current?.setLandShot(v === "cinematic"); const m = v === "third" ? "third" : "first"; setMode(m); w.current?.setMode(m); } if (k === "look" || k === "smooth") w.current?.setLookFeel(next); if (k === "side") { if (v === "left") document.documentElement.dataset.hand = "left"; else delete document.documentElement.dataset.hand; } };
  // someone who isn't fishing watches from behind an angler rather than standing nowhere
  const watching = !anglers.some((a) => a.local) && anglers.length > 0;
  useEffect(() => { if (watching && mode !== "spectator" && mode !== "cinematic") { const t = setTimeout(() => pick("spectator"), 600); return () => clearTimeout(t); } return undefined; }, [watching]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (m) => { setMode(m); w.current?.setMode(m); setMenu(false); if ((m === "third" || (m === "first" && view.fishCam !== "cinematic")) && view.fishCam !== m) { const next = { ...view, fishCam: m }; setView(next); saveView(next); w.current?.setLandShot(false); } if (m === "spectator" && others[0]) { const id = watch || others[0].id; setWatch(id); w.current?.focus(id); } };
  // watching someone: in spectator mode the camera glides over behind them; otherwise you stay where you are and turn
  // to keep them (their rod, the fight, the landing) in view until you drag the view yourself
  const watchOne = (id) => { setWatch(id); setAlert(null); if (mode === "spectator") w.current?.focus(id); else w.current?.follow(id, 90); };
  const watchNext = () => {
    if (!others.length) return;
    const i = others.findIndex((a) => a.id === watch), next = others[(i + 1) % others.length];
    watchOne(next.id);
  };
  // someone else has a fish on: a small chip offers to watch it
  const sceneState = useMemo(() => ({ busy }), [busy]);
  const [alert, setAlert] = useState(null);
  useEffect(() => { if (!alert) return undefined; const t = setTimeout(() => setAlert(null), 14000); return () => clearTimeout(t); }, [alert]);
  return (
    <div className={`stage3d${walk ? " walking" : ""}${menu ? " menu-open" : ""}`}>
      {/* first person to start, looking out over the line with the rod in your hands (third person and watching others are in the menu) */}
      <World3D ref={w} fight={fight} startMode={view.fishCam === "third" ? "third" : "first"} feel={feel} onWalk={setWalk} onPose={onPose} onHear={onHear} spotId={spotId} placeName={placeName} onTap={onTap} venue={venue} anglers={anglers} light={light} cond={cond} facing={facing} sound={sound} now={now} quality={view.gfx && view.gfx !== "auto" ? view.gfx : quality}
        onPhase={(id, phase, info) => {
          onPhase?.(id, phase, info);
          // your own bite or fish on: the menu gets out of the way of the Strike and Reel buttons, and Walk about
          // stays hidden until it's over (it can't be used then anyway)
          if (anglers.find((x) => x.id === id)?.local) { setMyPhase(phase); if (phase === "bite" || phase === "hooked") setMenu(false); }
          if (watching && mode === "spectator" && (phase === "bite" || phase === "hooked")) { setWatch(id); w.current?.focus(id); return; }
          const a = anglers.find((x) => x.id === id);
          if (a && !a.local && phase === "hooked" && !watching) setAlert({ id, name: a.name || "Someone" });
        }}
        onKept={setKept} onBusy={setBusy} onFishTap={() => openInspect()}
        onLanded={(id, ev) => { const a = anglers.find((x) => x.id === id); onLanded?.(id, ev); if (alert?.id === id) setAlert(null); if (a?.local && a.inspect) { setLanded({ ev, key: `${id}|${ev?.id || ev?.t}` }); return; } if (a?.local || watch === id) { setCard({ ev, key: `${id}|${ev?.id || ev?.t}`, who: a?.local ? null : a?.name }); setTimeout(() => setCard((c) => (c?.ev === ev ? null : c)), 8000); } }}>
        <div className="fs-overlay"><WorldCtx.Provider value={w}><SceneCtx.Provider value={sceneState}>{children}</SceneCtx.Provider></WorldCtx.Provider></div>
        <div className="w3d-toasts" aria-live="polite">
          {toasts.slice(-3).map((t) => <div key={t.id} className={`w3d-toast ${t.kind || ""}`}>{t.text}</div>)}
          {alert ? <button type="button" className="w3d-toast w3d-watch" onClick={() => watchOne(alert.id)}>{alert.name} has a fish on · <b>Watch</b></button> : null}
          {walkMsg ? <div className="w3d-toast msg" role="status">{walkMsg}</div> : null}
        </div>
        {walk ? (
          <>
            <Joystick size={view.stick} float={view.stickFloat} onMove={(x, y) => { stick.current = [x, y]; w.current?.setWalkInput({ x, y, sprint }); }} />
            <div className="walk-actions">
              {walk.canFish ? <button type="button" className="walk-fish" onClick={fishHere}><Icon name="target" />Start fishing</button> : walk.crowded ? <span className="walk-note">Too close to someone to fish: move along a little</span> : null}
              <div className="walk-small">
                {view.autoBtn ? <button type="button" className={`walk-pill${walk.auto ? " on" : ""}`} aria-pressed={!!walk.auto} onClick={() => w.current?.autoWalk(!walk.auto)} title="Keep walking where you look; touch the stick to stop">Auto</button> : null}
                <button type="button" className={`walk-pill${sprint ? " on" : ""}`} aria-pressed={sprint} onClick={() => setSprint(!sprint)}>Sprint</button>
                <button type="button" className="walk-pill" onClick={stopWalk} aria-label="Stop walking" title="Stop walking and go back to where you were fishing">Back to my spot</button>
              </div>
            </div>
          </>
        ) : null}
        {landed && kept === "deck" && !looking ? <div className="walk-top"><button type="button" className="walk-prompt" onClick={openInspect}><span className="key">Tap</span>Your fish is landed: have a look</button></div> : null}
        {looking && landed ? <FishLook ev={landed.ev} demo={demo} onKeep={keepIt} onRelease={putBack} onClose={() => { w.current?.inspectFish(false); setLooking(false); }} /> : null}
        {/* one menu for everything that isn't fishing or walking (top right): the page's own items (your angler, sound,
            settings, inviting a friend), the camera, emotes, watching a friend, and the view's settings */}
        {/* the menu closes with a tap anywhere else (and by itself when a fish bites: see onPhase) */}
        {menu ? <div className="w3d-menuscrim" aria-hidden="true" onPointerDown={(e) => { e.preventDefault(); setMenu(false); }} /> : null}
        <div className="w3d-menuwrap">
          <button type="button" className={`fs-btn w3d-menubtn${menu ? " on" : ""}`} onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu} title="Menu: camera, sound, settings, Fish Together"><Icon name="more" /></button>
          {menu ? (
            <div className="cam-menu w3d-menu" role="menu" aria-label="Menu">
              {pageMenu?.length ? <>
                {pageMenu.map((it) => <button key={it.key} type="button" role={it.on != null ? "menuitemcheckbox" : "menuitem"} aria-checked={it.on != null ? !!it.on : undefined} className={`ft-pill${it.on ? " on" : ""}`} onClick={() => { setMenu(false); it.onClick(); }}>{it.icon ? <Icon name={it.icon} /> : null}{it.label}</button>)}
              </> : null}
              {/* (near the top, where it's seen: at the foot of a long menu it had to be scrolled to, and was missed) */}
              <button type="button" role="menuitem" className="ft-pill" onClick={() => { setMenu(false); setGfxOpen(true); }} title="Preset, resolution, frame rate, shadows, ambient occlusion and more"><Icon name="gauge" />Graphics: {{ auto: "Auto", performance: "Low", balanced: "Medium", high: "High", ultra: "Ultra" }[view.gfx] || "Auto"}{view.gfxC && Object.keys(view.gfxC).length ? " (custom)" : ""}</button>
              <hr className="cam-sep" />
              <span className="cam-head">Camera</span>
              {MODES.filter(([m]) => m !== "spectator" || others.length).map(([m, l]) => <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} className={`ft-pill${mode === m ? " on" : ""}`} onClick={() => pick(m)}>{l}</button>)}
              <button type="button" role="menuitem" className="ft-pill" onClick={() => { setMenu(false); w.current?.lookAtRod(); }}><Icon name="rod" />Look at my rod</button>
              {others.length ? <button type="button" role="menuitem" className="ft-pill" onClick={() => { setMenu(false); watchNext(); }}><Icon name="users" />Watch {others.find((a) => a.id === watch)?.name || others[0].name}</button> : null}
              {hasMe ? <>
                <hr className="cam-sep" />
                <span className="cam-head">Say hello</span>
                <div className="cam-row">{[["wave", "Wave"], ["cheer", "Cheer"], ["clap", "Clap"]].map(([k, l]) => <button key={k} type="button" role="menuitem" className="ft-pill" onClick={() => { setMenu(false); emote(k); }}>{l}</button>)}</div>
              </> : null}
              <hr className="cam-sep" />
              <span className="cam-head">Settings</span>
              <button type="button" role="menuitemcheckbox" aria-checked={view.track} className={`ft-pill${view.track ? " on" : ""}`} onClick={() => setOpt("track", !view.track)} title="The camera turns to a leaping fish, unless you're moving the view yourself">Follow jumps</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.side === "left"} className={`ft-pill${view.side === "left" ? " on" : ""}`} onClick={() => setOpt("side", view.side === "left" ? "right" : "left")} title="Cast, Strike and Reel at the bottom left, for your left thumb">Controls on the left</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("fishCam", { first: "third", third: "cinematic", cinematic: "first" }[view.fishCam] || "first")} title="First person: everything through your own eyes, landing the fish too. Third person: from behind you. Cinematic: your own eyes, with framed shots of the landing">Fishing camera: {{ first: "First person", third: "Third person", cinematic: "Cinematic" }[view.fishCam] || "First person"}</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("look", { low: "normal", normal: "high", high: "low" }[view.look] || "normal")} title="How far the view turns for a drag">Look speed: {{ low: "Low", normal: "Normal", high: "High" }[view.look] || "Normal"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.smooth !== false} className={`ft-pill${view.smooth !== false ? " on" : ""}`} onClick={() => setOpt("smooth", view.smooth === false)} title="The view carries on turning a little after a flick">Smooth camera</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("stick", { s: "m", m: "l", l: "s" }[view.stick] || "m")} title="The walking stick's size">Stick size: {{ s: "Small", m: "Medium", l: "Large" }[view.stick] || "Medium"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.stickFloat} className={`ft-pill${view.stickFloat ? " on" : ""}`} onClick={() => setOpt("stickFloat", !view.stickFloat)} title="Touch anywhere in the lower left to walk, instead of a stick in the corner">Floating stick</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("camDist", { near: "normal", normal: "far", far: "near" }[view.camDist] || "normal")} title="How far behind you the camera follows when you walk about (pinch to change it as you go)">Walking camera: {{ near: "Near", normal: "Normal", far: "Far" }[view.camDist] || "Normal"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.autoBtn} className={`ft-pill${view.autoBtn ? " on" : ""}`} onClick={() => setOpt("autoBtn", !view.autoBtn)} title="An Auto button when you walk about: keep walking where you look until you touch the stick">Auto-walk button</button>
              {reelOpts ? <>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.holdReel !== false} className={`ft-pill${reelOpts.holdReel !== false ? " on" : ""}`} onClick={() => onReelOpts?.({ holdReel: reelOpts.holdReel === false })} title="Hold the Reel button to wind in steadily; tapping works as well">Hold to reel</button>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.assisted} className={`ft-pill${reelOpts.assisted ? " on" : ""}`} onClick={() => onReelOpts?.({ assisted: !reelOpts.assisted })} title="One tap starts winding at a steady rate, another stops it, instead of tapping again and again">Assisted reeling</button>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.advanced} className={`ft-pill${reelOpts.advanced ? " on" : ""}`} onClick={() => onReelOpts?.({ advanced: !reelOpts.advanced })} title="Set the drag yourself while you fight a fish: too tight and the line can break">Advanced fight</button>
              </> : null}
              
              {sound ? <SoundLevels /> : null}
              {sound ? <button type="button" role="menuitemcheckbox" aria-checked={view.spatial} className={`ft-pill${view.spatial ? " on" : ""}`} onClick={() => setOpt("spatial", !view.spatial)} title="Sounds come from where they happen, quieter further away">Spatial sound</button> : null}
            </div>
          ) : null}
        </div>
        {/* walking about: its own button, bottom right (while walking, the walking controls take its place) */}
        {!walk && !busyFishing ? <button type="button" className="w3d-walkbtn" onClick={() => startWalk()} aria-label="Walk about" title="Walk about (Beta)"><Icon name="walk" /></button> : null}
        {finePointer && !menu ? <div className="w3d-keys" aria-hidden="true">W A S D walk · Shift sprint · Space cast, strike, reel · E land or fish here · drag to look</div> : null}
        {gfxOpen ? <GraphicsPanel view={view} setOpts={setOpts} world={w.current} onClose={() => setGfxOpen(false)} /> : null}
        {view.fpsShow ? <FpsMeter world={w.current} /> : null}
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
// A small card at first (the fish stays in view above it): what it is, its size, Keep it and Put it back. The minimum
// size and any rule or safety point (catchInfo.js) are always shown; how to tell it and the rest of the note wait
// under "More about this fish"
function FishLook({ ev, demo, onKeep, onRelease, onClose }) {
  const d = ev?.data || {}, sp = speciesById(d.species), info = catchInfo(sp);
  const [more, setMore] = useState(false);
  const len = d.lengthCm ? `${d.lengthCm} cm (${(d.lengthCm / 2.54).toFixed(1)} in)` : null, kg = d.weightKg ? `${d.weightKg >= 1 ? d.weightKg.toFixed(1) : d.weightKg.toFixed(2)} kg` : null;
  const label = { size: "Minimum size", rule: "Rule", safety: "Take care" };
  return (
    <div className={`fish-look${more ? " open" : ""}`} role="dialog" aria-label={`Your ${sp?.name || "fish"}`}>
      <button type="button" className="xbtn fish-look-x" onClick={onClose} aria-label="Put it down"><Icon name="close" /></button>
      <span className="cc-kicker">{demo ? "Demo · not logged" : "Simulated · not a real record"}</span>
      <h3>{sp?.name || "Fish"} {sp?.latin ? <i className="tiny muted">{sp.latin}</i> : null}</h3>
      <p className="cc-facts">{[len, kg].filter(Boolean).join(" · ") || "Size not given"}</p>
      {info.must.length ? <ul className="fl-must">{info.must.map((m, i) => <li key={i} className={`fl-${m.kind}`}><b>{label[m.kind]}:</b> {m.text}{m.source ? <> <a href={m.source} target="_blank" rel="noopener noreferrer">Source</a></> : null}</li>)}</ul> : null}
      <div className="row">
        <button type="button" className="btn primary" onClick={onKeep}><Icon name="check" />Keep it</button>
        <button type="button" className="btn" onClick={onRelease}>Put it back</button>
      </div>
      {info.hasMore ? <button type="button" className="fl-more" aria-expanded={more} aria-controls="fl-more-body" onClick={() => setMore(!more)}>More about this fish<span aria-hidden="true">{more ? "▴" : "▾"}</span></button> : null}
      {more ? (
        <div className="fl-more-body" id="fl-more-body">
          {info.more.idTip ? <p className="small"><b>How to tell it:</b> {info.more.idTip}</p> : null}
          {info.more.note ? <p className="small"><b>Looking after it:</b> {info.more.note}</p> : null}
          {info.more.lookalikes ? <p className="small"><b>Lookalikes:</b> {info.more.lookalikes}</p> : null}
        </div>
      ) : null}
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
