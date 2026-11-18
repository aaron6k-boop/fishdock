// ---- Stage3D: the 3D view with its small tools: camera modes, Look at my rod, Watch a friend, the catch card ----
// Used by the demo and by Fish Together. The overlay (`children`) is the page's own top bar and fishing tray.
import { useEffect, useMemo, useRef, useState } from "react";
import World3D, { loadView, saveView, loadLevels, saveLevels } from "./World3D.jsx";
import { setVolumes } from "../lib/sceneAudio.js";
import { WorldCtx, SceneCtx } from "./WorldContext.js";
import { CatchCard } from "./FishingScene.jsx";
import { Icon } from "./ui.jsx";
import { PHRASES } from "../lib/chatPhrases.js";
import { speciesById } from "../data/species.js";
import { catchInfo } from "../lib/catchInfo.js";
import { landingTech } from "../lib/sceneActors.js";
import GraphicsPanel, { FpsMeter } from "./GraphicsPanel.jsx";
import { walkDist } from "../lib/viewPrefs.js";
const TORCHES = ["off", "white", "red", "green"], TORCH_NAMES = { off: "Off", white: "White", red: "Red", green: "Green" }; // (as nightKit.js)

const MODES = [["first", "First person"], ["third", "Third person"], ["spectator", "Watch someone"], ["cinematic", "Cinematic"], ["free", "Free look"]];

// (seconds without input before the view goes calm)
const CALM_AFTER = 4000;
export default function Stage3D({ onWindIn, menu: pageMenu = null, spotId = null, placeName = "", feel = null, venue, anglers, light, cond, facing, quality = "auto", sound, now, demo = false, onTap, onReel = null, fightLive = null, tipLight = "auto", toasts = [], catchPhoto, children, onLanded, onPhase, onPose, poseBus, onHear, speaking = null, onEmote, chat = null, chatMode = null, onSay, onChat, fight = null, reelOpts = null, onReelOpts, onDecide = null, rateCatch = null }) {
  const w = useRef(null);
  const [menu, setMenu] = useState(false), [mode, setMode] = useState(() => (loadView().fishCam === "third" ? "third" : "first")), [card, setCard] = useState(null), [watch, setWatch] = useState(null);
  const others = anglers.filter((a) => !a.local);
  // ---- walking about: a stick on the left (one thumb), a small Sprint and Jump, and Start fishing at the water's edge ----
  const [walk, setWalk] = useState(null), [walkMsg, setWalkMsg] = useState("");
  const say = (m) => { setWalkMsg(m); setTimeout(() => setWalkMsg((x) => (x === m ? "" : x)), 3200); };
  const [view, setView] = useState(loadView);
  const startWalk = (retry = false) => {
    const why = w.current?.walk(true, { dist: walkDist(view.camDist, mode) }); // (as you fish: walking off in first person stays at your eyes)
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
      if (c === "KeyF" && !e.repeat) { e.preventDefault(); toggleFs(); return; } // (F: full screen, as video players)
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
  // ---- chat (Fish Together and public places): each new line in a bubble over whoever said it, and a chat panel ----
  // (chat: [{ seq, who: the angler's id here, name, text, mine }], oldest first; chatMode: "phrases" in a public place,
  // where strangers can only pick from src/lib/chatPhrases.js; "free" in a party with chat on, typed lines as well)
  const [chatOpen, setChatOpen] = useState(false), [chatDraft, setChatDraft] = useState(""), [unread, setUnread] = useState(0);
  const seenSeq = useRef(null);
  useEffect(() => {
    if (!chat) return;
    const top = chat.length ? chat[chat.length - 1].seq : 0;
    if (seenSeq.current == null) { seenSeq.current = top; return; } // (what was said before you arrived isn't bubbled again)
    const fresh = chat.filter((c) => c.seq > seenSeq.current); seenSeq.current = Math.max(seenSeq.current, top);
    if (view.bubbles !== false) for (const c of fresh) w.current?.say(c.who, c.text);
    if (!chatOpen && fresh.some((c) => !c.mine)) setUnread((n) => n + fresh.filter((c) => !c.mine).length);
  }, [chat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (chatOpen) setUnread(0); }, [chatOpen]);
  const sendChat = (e) => { e.preventDefault(); const t = chatDraft.trim(); if (!t) return; onChat?.(t); setChatDraft(""); };
  // other people walking about (Fish Together): their poses straight to the 3D view
  useEffect(() => { if (!poseBus) return undefined; const f = (e) => w.current?.setRemotePose(e.detail.who, e.detail.p); poseBus.addEventListener("pose", f); return () => poseBus.removeEventListener("pose", f); }, [poseBus]);
  // ---- your landed fish: it waits in the net; tap it (or Look at it) to hold it up, then keep it or put it back ----
  const [kept, setKept] = useState(null), [landed, setLanded] = useState(null), [looking, setLooking] = useState(false), [busy, setBusy] = useState(null);
  // (the message that it's gone back waits until it has: said when the release ends, not when you tap Put it back)
  const releaseMsg = useRef(null), keptPrev = useRef(null);
  useEffect(() => { if (keptPrev.current === "release" && kept !== "release" && releaseMsg.current) { say(releaseMsg.current); releaseMsg.current = null; } keptPrev.current = kept; }, [kept]); // eslint-disable-line react-hooks/exhaustive-deps
  const openInspect = () => { if (!landed) return; w.current?.inspectFish(true); setLooking(true); };
  const keepIt = () => { w.current?.keepFish(); setLooking(false); onDecide?.("kept", landed?.ev); if (landed) { setCard({ ev: landed.ev, key: landed.key, who: null }); setTimeout(() => setCard((c) => (c?.ev === landed.ev ? null : c)), 8000); } setLanded(null); };
  // (how it goes back depends on the place and the fish: a fish heavy enough to have been netted off a high pier is
  // lowered in the drop net; a light one, swung up on the line, is let go by hand over the rail. Only the walk down a
  // beach to the water is shortened, and the page says so)
  const putBack = () => {
    w.current?.releaseFish(); setLooking(false); onDecide?.("released", landed?.ev); const d = landed?.ev?.data || {}, sp = speciesById(d.species), off = sp ? `: the ${sp.name.toLowerCase()} swims off` : "";
    const netted = venue === "pier" && landingTech(d.species, d.lengthCm, d.weightKg, "pier") === "dropnet";
    releaseMsg.current = venue === "pier" ? (netted ? `Lowered back to the water in the drop net${off}.` : `Let go over the rail${off}.`) : venue === "beach" ? `Back into the shallows (shortened)${off}.` : `Back in the landing net at the water's edge${off}.`; setLanded(null);
  };
  useEffect(() => { if (!kept) { setLooking(false); } }, [kept]);
  useEffect(() => { if (kept === null && landed && !looking) setLanded(null); }, [kept]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!walk) setSprint(false); }, [walk]);
  // (several settings at once, from one view: Settings → Graphics)
  const setOpts = (o) => { setView((cur) => { const next = { ...cur, ...o }; saveView(next); return next; }); };
  const [gfxOpen, setGfxOpen] = useState(false);
  // ---- calm: while you fish and leave the controls alone, what isn't the fishing steps back ----
  // After a few seconds without a touch, a mouse move or a key (other than the fishing keys), the chips along the top,
  // the compass, the frame rate, the key guide and the small buttons fade, and the place's credit dims; the one fishing
  // button and what it says stay. Any touch or move brings them back. Not while walking, in a menu or a panel, or
  // looking at a fish. (Only real input counts: the keys press the fishing button with made-up pointer events)
  const [calm, setCalm] = useState(false);
  const calmBlock = !!walk || menu || chatOpen || gfxOpen || looking || !!card;
  useEffect(() => {
    if (calmBlock) { setCalm(false); return undefined; }
    let t = 0, x0 = -1, y0 = -1;
    const later = () => { clearTimeout(t); t = setTimeout(() => setCalm(true), CALM_AFTER); };
    const wake = (e) => {
      if (!e.isTrusted) return;
      if (e.type === "keydown" && (e.code === "Space" || e.code === "KeyE" || e.repeat)) return;
      if (e.type === "pointermove") { if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; x0 = e.clientX; y0 = e.clientY; }
      setCalm(false); later();
    };
    const evs = ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"];
    evs.forEach((n) => addEventListener(n, wake, { passive: true }));
    later();
    return () => { clearTimeout(t); evs.forEach((n) => removeEventListener(n, wake)); };
  }, [calmBlock]);
  const setOpt = (k, v) => { const next = { ...view, [k]: v }; setView(next); saveView(next); if (k === "track") w.current?.setTrack(v); if (k === "torch") w.current?.setTorch(v); if (k === "sit") w.current?.setSit(v); if (k === "fishCam") { w.current?.setLandShot(v === "cinematic"); const m = v === "third" ? "third" : "first"; setMode(m); w.current?.setMode(m); } if (k === "look" || k === "smooth") w.current?.setLookFeel(next); if (k === "side") { if (v === "left") document.documentElement.dataset.hand = "left"; else delete document.documentElement.dataset.hand; } };
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
  // (for the app's update check, main.jsx: nothing being landed, kept or looked at in the scene just now)
  useEffect(() => { window.__fdSceneIdle = !busy && !looking && (!kept || kept === "gone"); return () => { window.__fdSceneIdle = undefined; }; }, [busy, looking, kept]);
  const [alert, setAlert] = useState(null);
  useEffect(() => { if (!alert) return undefined; const t = setTimeout(() => setAlert(null), 14000); return () => clearTimeout(t); }, [alert]);
  // ---- full screen (a PC, mostly: on a phone the view already fills the screen): the browser's own full screen where
  // it has one, the whole window otherwise; Escape or the same option leaves it ----
  const stageEl = useRef(null); const [fs, setFs] = useState(false); const fsRef = useRef(false); fsRef.current = fs;
  useEffect(() => {
    const on = () => { const el = document.fullscreenElement || document.webkitFullscreenElement; if (!el) setFs(false); else if (el === stageEl.current) setFs(true); };
    document.addEventListener("fullscreenchange", on); document.addEventListener("webkitfullscreenchange", on);
    const k = (e) => { if (e.key === "Escape" && fsRef.current && !(document.fullscreenElement || document.webkitFullscreenElement)) setFs(false); };
    addEventListener("keydown", k);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); removeEventListener("keydown", k); };
  }, []);
  async function toggleFs() {
    const el = stageEl.current; if (!el) return;
    if (fsRef.current) { try { if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); } catch { /* fine */ } setFs(false); return; }
    try { if (el.requestFullscreen) { await el.requestFullscreen({ navigationUI: "hide" }); setFs(true); return; } if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); setFs(true); return; } } catch { /* fall back to the window */ }
    setFs(true);
  }
  return (
    <div ref={stageEl} className={`stage3d${walk ? " walking" : ""}${menu ? " menu-open" : ""}${fs ? " is-fs" : ""}${calm && !calmBlock ? " calm" : ""}`}>
      {/* first person to start, looking out over the line with the rod in your hands (third person and watching others are in the menu) */}
      <World3D ref={w} fight={fight} fightLive={fightLive} startMode={view.fishCam === "third" ? "third" : "first"} feel={feel} onWalk={setWalk} onPose={onPose} onHear={onHear} spotId={spotId} placeName={placeName} onTap={onTap} onReel={onReel} tipLight={tipLight} venue={venue} anglers={anglers} light={light} cond={cond} facing={facing} sound={sound} now={now} quality={view.gfx && view.gfx !== "auto" ? view.gfx : quality}
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
          {toasts.slice(-3).map((t) => typeof t.text === "object" && t.text ? (
            <div key={t.id} className={`w3d-toast ${t.kind || ""}`} role="status">
              <span className="rw-head">{t.text.xp ? <b className="rw-xp">+{t.text.xp} XP</b> : null}<span className="rw-t">{t.text.title}</span></span>
              {t.text.lines?.length ? <span className="rw-lines">{t.text.lines.map((l) => <span key={l}>{l}</span>)}</span> : null}
            </div>
          ) : <div key={t.id} className={`w3d-toast ${t.kind || ""}`}>{t.text}</div>)}
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
        {looking && landed ? <FishLook ev={landed.ev} demo={demo} rate={rateCatch?.(landed.ev)} onKeep={keepIt} onRelease={putBack} onClose={() => { w.current?.inspectFish(false); setLooking(false); }} /> : null}
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
              <button type="button" role="menuitemcheckbox" aria-checked={fs} className={`ft-pill${fs ? " on" : ""}`} onClick={() => { setMenu(false); toggleFs(); }} title="The view fills the whole screen (F on a keyboard; Escape to leave)"><Icon name={fs ? "close" : "expand"} />{fs ? "Leave full screen" : "Full screen"}</button>
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
              <button type="button" role="menuitem" className={`ft-pill${view.torch && view.torch !== "off" ? " on" : ""}`} onClick={() => setOpt("torch", TORCHES[(TORCHES.indexOf(view.torch || "off") + 1) % TORCHES.length])} title="A lamp on your head that lights where you look. Red and green are kinder to your night sight than white"><Icon name="sun" />Head torch: {TORCH_NAMES[view.torch] || "Off"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.sit !== false} className={`ft-pill${view.sit !== false ? " on" : ""}`} onClick={() => setOpt("sit", view.sit === false)} title="Sit in your fishing chair behind the rod once the cast has settled; you get up when a bite comes">Sit while you wait</button>
              <button type="button" role="menuitemcheckbox" aria-checked={view.smooth !== false} className={`ft-pill${view.smooth !== false ? " on" : ""}`} onClick={() => setOpt("smooth", view.smooth === false)} title="The view carries on turning a little after a flick">Smooth camera</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpt("stick", { s: "m", m: "l", l: "s" }[view.stick] || "m")} title="The walking stick's size">Stick size: {{ s: "Small", m: "Medium", l: "Large" }[view.stick] || "Medium"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.stickFloat} className={`ft-pill${view.stickFloat ? " on" : ""}`} onClick={() => setOpt("stickFloat", !view.stickFloat)} title="Touch anywhere in the lower left to walk, instead of a stick in the corner">Floating stick</button>
              <button type="button" role="menuitem" className="ft-pill" onClick={() => setOpts({ camDist: { auto: "near", near: "normal", normal: "far", far: "eyes", eyes: "auto" }[view.camDist] || "auto", walkCam2: true })} title="Where the camera is when you walk about: as you fish (at your eyes in first person, behind you in third), behind you near, normal or far, or at your eyes. Pinch or the wheel changes it as you go">Walking camera: {{ auto: "As you fish", near: "Near", normal: "Normal", far: "Far", eyes: "Your eyes" }[view.camDist] || "As you fish"}</button>
              <button type="button" role="menuitemcheckbox" aria-checked={!!view.autoBtn} className={`ft-pill${view.autoBtn ? " on" : ""}`} onClick={() => setOpt("autoBtn", !view.autoBtn)} title="An Auto button when you walk about: keep walking where you look until you touch the stick">Auto-walk button</button>
              {reelOpts ? <>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.holdReel !== false} className={`ft-pill${reelOpts.holdReel !== false ? " on" : ""}`} onClick={() => onReelOpts?.({ holdReel: reelOpts.holdReel === false })} title="Press and hold the Reel button to wind in steadily, a little slower than tapping in a steady rhythm">Hold to reel</button>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.assisted} className={`ft-pill${reelOpts.assisted ? " on" : ""}`} onClick={() => onReelOpts?.({ assisted: !reelOpts.assisted })} title="One tap starts winding at a steady rate, another stops it, instead of tapping again and again">Assisted reeling</button>
                <button type="button" role="menuitemcheckbox" aria-checked={reelOpts.advanced} className={`ft-pill${reelOpts.advanced ? " on" : ""}`} onClick={() => onReelOpts?.({ advanced: !reelOpts.advanced })} title="Set the drag yourself while you fight a fish: too tight and the line can break">Advanced fight</button>
              </> : null}
              
              {sound ? <SoundLevels /> : null}
              {sound ? <button type="button" role="menuitemcheckbox" aria-checked={view.spatial} className={`ft-pill${view.spatial ? " on" : ""}`} onClick={() => setOpt("spatial", !view.spatial)} title="Sounds come from where they happen, quieter further away">Spatial sound</button> : null}
            </div>
          ) : null}
        </div>
        {chatMode && !busyFishing ? <button type="button" className={`w3d-chatbtn${chatOpen ? " on" : ""}`} onClick={() => setChatOpen(!chatOpen)} aria-label={unread ? `Chat, ${unread} new` : "Chat"} aria-expanded={chatOpen} title="Chat"><Icon name="chat" />{unread ? <span className="w3d-unread" aria-hidden="true">{Math.min(9, unread)}</span> : null}</button> : null}
        {chatMode && chatOpen ? (
          <div className="w3d-chat" role="dialog" aria-label="Chat">
            <div className="w3d-chat-head"><b>Chat</b>
              <button type="button" className={`ft-pill w3d-chat-bub${view.bubbles !== false ? " on" : ""}`} aria-pressed={view.bubbles !== false} onClick={() => setOpt("bubbles", view.bubbles === false)} title="Show what people say over their heads">Bubbles</button>
              <button type="button" className="xbtn" onClick={() => setChatOpen(false)} aria-label="Close chat"><Icon name="close" /></button></div>
            <ol className="w3d-chat-lines" aria-live="polite">{(chat || []).slice(-8).map((c) => <li key={c.seq} className={c.mine ? "mine" : ""}><b>{c.mine ? "You" : c.name}:</b> {c.text}</li>)}
              {!(chat || []).length ? <li className="w3d-chat-none">Nobody's said anything yet.</li> : null}</ol>
            {chatMode === "phrases" ? <p className="w3d-chat-note">You're fishing with strangers here, so chat is set phrases only.</p> : null}
            <div className="w3d-chat-phrases">{PHRASES.map((ph) => <button key={ph.id} type="button" className="ft-pill" onClick={() => onSay?.(ph.id)}>{ph.text}</button>)}</div>
            {chatMode === "free" ? <form className="w3d-chat-form" onSubmit={sendChat}><input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} maxLength={200} placeholder="Say something" aria-label="Message" enterKeyHint="send" /><button type="submit" className="ft-pill on" disabled={!chatDraft.trim()}>Send</button></form> : null}
          </div>
        ) : null}
        {/* walking about: its own button, bottom right (while walking, the walking controls take its place) */}
        {!walk && !busyFishing ? <button type="button" className="w3d-walkbtn" onClick={() => startWalk()} aria-label="Walk about" title="Walk about (Beta)"><Icon name="walk" /></button> : null}
        {finePointer && !menu ? <div className="w3d-keys" aria-hidden="true">W A S D walk · Shift sprint · Space cast, strike, reel · E land or fish here · drag to look</div> : null}
        {gfxOpen ? <GraphicsPanel view={view} setOpts={setOpts} world={w.current} scene={{ light, cond, facing }} onClose={() => setGfxOpen(false)} /> : null}
        {view.fps2 !== false ? <FpsMeter world={w.current} /> : null /* (on unless it has been turned off: Aaron, 13 November. A new setting, fps2, so an old "off" saved before then, when it was off by default, doesn't hide it) */}
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
function FishLook({ ev, demo, rate = null, onKeep, onRelease, onClose }) {
  const d = ev?.data || {}, sp = speciesById(d.species), info = catchInfo(sp);
  const [more, setMore] = useState(false);
  const len = d.lengthCm ? `${d.lengthCm} cm (${(d.lengthCm / 2.54).toFixed(1)} in)` : null, kg = d.weightKg ? `${d.weightKg >= 1 ? d.weightKg.toFixed(1) : d.weightKg.toFixed(2)} kg` : null;
  const label = { size: "Minimum size", rule: "Rule", safety: "Take care" };
  return (
    <div className={`fish-look${more ? " open" : ""}`} role="dialog" aria-label={`Your ${sp?.name || "fish"}`}>
      <button type="button" className="xbtn fish-look-x" onClick={onClose} aria-label="Put it down"><Icon name="close" /></button>
      {demo ? null : <span className="cc-kicker">Simulated · not a real record</span>}
      <h3>{sp?.name || "Fish"} {sp?.latin ? <i className="tiny muted">{sp.latin}</i> : null}</h3>
      <p className="cc-facts">{[len, kg].filter(Boolean).join(" · ") || "Size not given"}</p>
      {rate && (rate.medal || rate.first || rate.best) ? <p className="fl-rate">{rate.medal ? <span className={`medal m-${rate.medal.id}`}>{rate.medal.name}</span> : null}{rate.first ? <span className="log-tag">New kind for your book</span> : rate.best ? <span className="log-tag">Your biggest yet</span> : null}</p> : null}
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
