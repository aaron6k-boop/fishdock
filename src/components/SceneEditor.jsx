// ---- SceneEditor: choose and line up the Live Fishing View's backdrop for this place ----
// Your own photo is best (GPS can't tell which way the rod points); a free-licensed photo taken near the place is
// next; a representative scene otherwise. Line it up (move, zoom, level), then mark the horizon, the water and
// where your line goes in, so the moving water stays on the water. Saved for this place on this phone.
import { useEffect, useRef, useState } from "react";
import { Sheet, Seg, Icon, Notice } from "./ui.jsx";
import { composeFrame, REF_ASPECT } from "../lib/sceneGL.js";
import { loadChoice, saveChoice, defaultView, ownPhoto, saveOwnPhoto, nearbyPhotos, detectHorizon, smallPhoto, scenePhotoKey } from "../lib/scene.js";
import { QUALITY_OPTIONS } from "./FishingScene.jsx";

const FACING = [["", "Not set"], ["0", "North"], ["45", "North-east"], ["90", "East"], ["135", "South-east"], ["180", "South"], ["225", "South-west"], ["270", "West"], ["315", "North-west"]];
const VW = 1500, VH = 1000;

export default function SceneEditor({ place, quality, onQuality, onClose, onSaved }) {
  const saved = loadChoice(place);
  const [kind, setKind] = useState(saved?.kind || "own");
  const [view, setView] = useState(saved?.view || defaultView());
  const [commons, setCommons] = useState(saved?.commons || null);
  const [own, setOwn] = useState(null);
  const [near, setNear] = useState(null);
  const [tool, setTool] = useState("move");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [img, setImg] = useState(null);
  const canvas = useRef(null), svg = useRef(null), camRef = useRef(null), fileRef = useRef(null), drag = useRef(null);
  const editedWater = useRef(!!saved?.view?.water);

  useEffect(() => { ownPhoto(place).then(setOwn); }, [place]);
  useEffect(() => { if (kind === "commons" && !near) nearbyPhotos(place).then(setNear); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const src = kind === "own" ? own : kind === "commons" ? commons?.url : null;
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const i = new Image();
    if (/^https:/.test(src)) { i.crossOrigin = "anonymous"; i.referrerPolicy = "no-referrer"; }
    i.onload = () => setImg(i);
    i.onerror = () => { setImg(null); setMsg("That photo couldn't load."); };
    i.src = src;
  }, [src]);
  // draw the lined-up frame
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const g = c.getContext("2d");
    c.width = 900; c.height = 600;
    if (img) g.drawImage(composeFrame(img, view, 900), 0, 0);
    else {
      const gr = g.createLinearGradient(0, 0, 0, 600);
      gr.addColorStop(0, "#56809f"); gr.addColorStop(view.horizon, "#c4d3dc"); gr.addColorStop(Math.min(1, view.horizon + 0.004), "#2d4d5f"); gr.addColorStop(1, "#0d2230");
      g.fillStyle = gr; g.fillRect(0, 0, 900, 600);
    }
  }, [img, view]);

  const setHorizon = (h) => setView((v) => {
    const hz = Math.max(0.08, Math.min(0.85, h));
    const water = editedWater.current && v.water ? v.water : [[0, hz], [1, hz], [1, 1], [0, 1]];
    const cast = v.cast && v.cast[1] > hz + 0.03 ? v.cast : [0.5, Math.min(0.92, hz + 0.2)];
    return { ...v, horizon: hz, water, cast };
  });
  function autoHorizon() {
    if (!img) return;
    const h = detectHorizon(composeFrame(img, view, 600));
    if (h) { setHorizon(h); setMsg(""); } else setMsg("Couldn't find a clear horizon. Drag the line to where the water meets the sky or far bank.");
  }
  useEffect(() => { if (img && !saved?.view) autoHorizon(); }, [img]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setBusy(true); setMsg("");
    try { const url = await saveOwnPhoto(place, f); setOwn(url); setKind("own"); setView(defaultView()); editedWater.current = false; }
    catch { setMsg("That photo couldn't be used. Try another."); }
    setBusy(false);
  }

  // ---- dragging on the frame ----
  const pt = (e) => { const r = svg.current.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  function down(e, what) {
    e.preventDefault(); e.stopPropagation();
    svg.current.setPointerCapture?.(e.pointerId);
    drag.current = { what, start: pt(e), view };
    if (tool === "cast" && what === "frame") { const [x, y] = pt(e); setView((v) => ({ ...v, cast: [x, Math.max(v.horizon + 0.02, y)] })); }
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const [x, y] = pt(e);
    if (d.what === "frame" && tool === "move") setView({ ...d.view, x: Math.max(-1, Math.min(1, d.view.x + (x - d.start[0]) * 2)), y: Math.max(-1, Math.min(1, d.view.y + (y - d.start[1]) * 2)) });
    else if (d.what === "horizon" || (d.what === "frame" && tool === "horizon")) setHorizon(y);
    else if (typeof d.what === "number") { editedWater.current = true; setView((v) => ({ ...v, water: v.water.map((p, i) => (i === d.what ? [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))] : p)) })); }
    else if (d.what === "cast" || (d.what === "frame" && tool === "cast")) setView((v) => ({ ...v, cast: [Math.max(0.02, Math.min(0.98, x)), Math.max(v.horizon + 0.02, Math.min(0.98, y))] }));
  }
  const up = () => { drag.current = null; };

  function save() {
    const choice = { kind: kind === "own" && !own ? "representative" : kind === "commons" && !commons ? "representative" : kind, view, commons: kind === "commons" ? commons : null };
    saveChoice(place, choice);
    onSaved?.({ ...choice, photoKey: choice.kind === "own" ? scenePhotoKey(place) : null, photoV: Date.now() });
    onClose();
  }

  const wp = view.water || defaultView(view.horizon).water;
  return (
    <Sheet title="Your view" aside={`${place.name}. Saved on this phone for next time.`} onClose={onClose} wide>
      <Seg value={kind} onChange={(k) => { setKind(k); setMsg(""); }} options={[{ value: "own", label: "My photo" }, { value: "commons", label: "Near here" }, { value: "representative", label: "Representative" }]} />
      {kind === "own" ? (
        <div className="row">
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pickFile} id="sv-cam" />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} id="sv-file" />
          <button type="button" className="btn" onClick={() => camRef.current?.click()} disabled={busy}><Icon name="camera" />Take a photo</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="plus" />Choose a photo</button>
        </div>
      ) : null}
      {kind === "own" ? <p className="tiny">Stand where you fish and point the camera where your rod points. The photo is re-encoded on this phone, which removes its GPS and other hidden data. It's only shown to people you share a link with, and never with a hidden-location link. Pick a view that doesn't give away a secret mark.</p> : null}
      {kind === "commons" ? (
        near == null ? <div className="loading-dots" aria-label="Finding photos" /> : near.photos?.length ? (
          <div className="sv-near">
            {near.photos.map((p) => (
              <button key={p.url} type="button" className={`sv-thumb${commons?.url === p.url ? " on" : ""}`} onClick={() => { setCommons(p); setView(defaultView()); editedWater.current = false; }}>
                <img src={smallPhoto(p.url)} alt={p.title} loading="lazy" referrerPolicy="no-referrer" />
                <span>{p.title}{p.km != null ? ` · ${p.km} km` : ""}</span>
              </button>
            ))}
          </div>
        ) : <Notice kind="warn">{near.preview ? "Nearby photos need FishDock's server, which the preview doesn't have." : near.error || "No free-licensed photos of the water were found near here. Take your own, or use the representative scene."}</Notice>
      ) : null}
      {kind === "commons" ? <p className="tiny">Free-licensed photos taken within a few km, from Wikimedia Commons. They're shown as "Photo near here", never as your exact view. Only a 1 km square is sent to look them up.</p> : null}
      {kind === "representative" ? <p className="tiny">A drawn sea, river or lake that follows the real time of day and weather. It's labelled as representative, not a photo of this place.</p> : null}

      <div className="sv-frame" style={{ aspectRatio: String(REF_ASPECT) }}>
        <canvas ref={canvas} aria-label="Your view, lined up" />
        <svg ref={svg} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" onPointerDown={(e) => down(e, "frame")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className={`sv-svg tool-${tool}`}>
          <polygon points={wp.map((p) => `${p[0] * VW},${p[1] * VH}`).join(" ")} className="sv-water" />
          <line x1="0" x2={VW} y1={view.horizon * VH} y2={view.horizon * VH} className="sv-hz" />
          {tool === "horizon" ? <rect x="0" y={view.horizon * VH - 30} width={VW} height="60" className="sv-hz-hit" onPointerDown={(e) => down(e, "horizon")} /> : null}
          {tool === "water" ? wp.map((p, i) => <circle key={i} cx={p[0] * VW} cy={p[1] * VH} r="34" className="sv-handle" onPointerDown={(e) => down(e, i)} />) : null}
          {view.cast ? <g onPointerDown={(e) => down(e, "cast")}><circle cx={view.cast[0] * VW} cy={view.cast[1] * VH} r="30" className="sv-cast" /><circle cx={view.cast[0] * VW} cy={view.cast[1] * VH} r="7" className="sv-cast-dot" /></g> : null}
        </svg>
        <span className="sv-tag">Horizon</span>
      </div>
      <Seg value={tool} onChange={setTool} options={[{ value: "move", label: "Move" }, { value: "horizon", label: "Horizon" }, { value: "water", label: "Water" }, { value: "cast", label: "Line in" }]} />
      <p className="tiny">{{ move: "Drag the picture to line it up. Use zoom and level below.", horizon: "Drag the line to where the water meets the sky or the far bank.", water: "Drag the four corners round the water, so a pier, rocks or a bank stay still.", cast: "Tap where your line goes into the water." }[tool]}</p>
      {tool === "move" ? (
        <>
          <div className="cond-row"><span>Zoom</span><input type="range" id="sv-zoom" min="1" max="3" step="0.02" value={view.zoom} onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))} /></div>
          <div className="cond-row"><span>Level</span><input type="range" id="sv-rot" min="-15" max="15" step="0.2" value={view.rot} onChange={(e) => setView((v) => ({ ...v, rot: Number(e.target.value) }))} /></div>
        </>
      ) : null}
      {tool === "horizon" && img ? <button type="button" className="btn small" onClick={autoHorizon}><Icon name="scan" />Find the horizon for me</button> : null}
      <div className="field"><label htmlFor="sv-facing">Which way are you facing?</label>
        <select id="sv-facing" className="input" value={view.facing == null ? "" : String(view.facing)} onChange={(e) => setView((v) => ({ ...v, facing: e.target.value === "" ? null : Number(e.target.value) }))}>
          {FACING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="tiny">Optional. It puts the sun's and moon's glitter on the water in the right place.</span>
      </div>
      <div className="field"><span className="lbl">Animation quality</span><Seg value={quality} onChange={onQuality} options={QUALITY_OPTIONS} /><span className="tiny">Auto picks for this phone and drops to Battery Saver when the battery is low.</span></div>
      {msg ? <Notice kind="warn">{msg}</Notice> : null}
      <button type="button" className="btn primary block" onClick={save} disabled={busy}><Icon name="check" />Use this view</button>
    </Sheet>
  );
}
