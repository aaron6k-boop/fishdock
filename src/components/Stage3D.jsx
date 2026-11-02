// ---- Stage3D: the 3D view with its small tools: camera modes, Look at my rod, Watch a friend, the catch card ----
// Used by the demo and by Fish Together. The overlay (`children`) is the page's own top bar and fishing tray.
import { useEffect, useRef, useState } from "react";
import World3D from "./World3D.jsx";
import { CatchCard } from "./FishingScene.jsx";
import { Icon } from "./ui.jsx";

const MODES = [["first", "First person"], ["third", "Third person"], ["spectator", "Watch someone"], ["cinematic", "Cinematic"], ["free", "Free look"]];

export default function Stage3D({ spotId = null, placeName = "", venue, anglers, light, cond, facing, quality = "auto", sound, now, demo = false, onTap, toasts = [], catchPhoto, children, onLanded, onPhase }) {
  const w = useRef(null);
  const [menu, setMenu] = useState(false), [mode, setMode] = useState("third"), [card, setCard] = useState(null), [watch, setWatch] = useState(null);
  const others = anglers.filter((a) => !a.local);
  // someone who isn't fishing watches from behind an angler rather than standing nowhere
  const watching = !anglers.some((a) => a.local) && anglers.length > 0;
  useEffect(() => { if (watching && mode !== "spectator" && mode !== "cinematic") { const t = setTimeout(() => pick("spectator"), 600); return () => clearTimeout(t); } return undefined; }, [watching]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (m) => { setMode(m); w.current?.setMode(m); setMenu(false); if (m === "spectator" && others[0]) { const id = watch || others[0].id; setWatch(id); w.current?.focus(id); } };
  const watchNext = () => {
    if (!others.length) return;
    const i = others.findIndex((a) => a.id === watch), next = others[(i + 1) % others.length];
    setWatch(next.id);
    if (mode === "spectator") w.current?.focus(next.id); else w.current?.lookAtAngler(next.id);
  };
  return (
    <div className="stage3d">
      {/* third person to start: on a phone it shows the angler, rod, line and water together (first person is in the menu) */}
      <World3D ref={w} startMode="third" spotId={spotId} placeName={placeName} onTap={onTap} venue={venue} anglers={anglers} light={light} cond={cond} facing={facing} quality={quality} sound={sound} now={now}
        onPhase={(id, phase, info) => { onPhase?.(id, phase, info); if (watching && mode === "spectator" && (phase === "bite" || phase === "hooked")) { setWatch(id); w.current?.focus(id); } }}
        onLanded={(id, ev) => { const a = anglers.find((x) => x.id === id); onLanded?.(id, ev); if (a?.local || (mode === "spectator" && watch === id)) { setCard({ ev, key: `${id}|${ev?.id || ev?.t}`, who: a?.local ? null : a?.name }); setTimeout(() => setCard((c) => (c?.ev === ev ? null : c)), 8000); } }}>
        <div className="fs-overlay">{children}</div>
        <div className="w3d-toasts" aria-live="polite">{toasts.slice(-3).map((t) => <div key={t.id} className={`w3d-toast ${t.kind || ""}`}>{t.text}</div>)}</div>
        <div className="w3d-tools">
          {menu ? (
            <div className="cam-menu" role="menu" aria-label="Camera">
              {MODES.filter(([m]) => m !== "spectator" || others.length).map(([m, l]) => <button key={m} type="button" role="menuitemradio" aria-checked={mode === m} className={`ft-pill${mode === m ? " on" : ""}`} onClick={() => pick(m)}>{l}</button>)}
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
