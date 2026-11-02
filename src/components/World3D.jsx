// ---- World3D: the 360° 3D view of a representative place, with one or more anglers (Beta) ----
// three.js loads only when this opens. Drag to look round (all the way), up and down; pinch or scroll to zoom;
// double tap to face your rod again. A small compass, camera modes, Look at my rod and Watch a friend. It is drawn,
// not filmed: the label says it's a representative 3D scene, never the real place or a camera.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { spotById } from "../data/spots.js";
import { Icon } from "./ui.jsx";
import { compassPoint } from "../lib/world3d/look.js";
import { layoutFor } from "../lib/world3d/spots.js";
import { play, soundPan, soundOn, soundOff, soundEnv } from "../lib/sceneAudio.js";

// ---- view choices kept on this phone: follow jumps (the camera turns to a leaping fish), spatial sound (sounds come
// from where they happen: your friend's reel from their side, quieter further away) ----
const VIEW_KEY = "fishdock.view3d.v1";
export const VIEW_DEFAULTS = { track: true, spatial: true };
export function loadView() { try { return { ...VIEW_DEFAULTS, ...JSON.parse(localStorage.getItem(VIEW_KEY) || "{}") }; } catch { return { ...VIEW_DEFAULTS }; } }
export function saveView(v) { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* no storage */ } }

const World3D = forwardRef(function World3D({ spotId = null, placeName = "", startMode = "first", feel = null, onTap, venue = "pier", anglers = [], light, cond, facing = 180, quality = "auto", now = Date.now, sound = false, onPhase, onLanded, children, className = "" }, ref) {
  const wrap = useRef(null), canvas = useRef(null), W = useRef(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [heading, setHeading] = useState(0), [mode, setMode] = useState("first"), [others, setOthers] = useState([]);
  const props = useRef({}); props.current = { anglers, onPhase, onLanded, sound, facing: spotId ? 0 : facing, now, onTap, feel };
  const phases = useRef({});
  // ---- a real 360° photo near the mark (Mapillary), when there is one and it's switched on ----
  const [pano, setPano] = useState(null), [usePano, setUsePano] = useState(true);
  useEffect(() => {
    setPano(null); if (!spotId) return undefined; let gone = false;
    // (before real photos are public, a phone with fishdock.panoPreview = "1" in its storage can preview them)
    let preview = ""; try { if (localStorage.getItem("fishdock.panoPreview") === "1") preview = "&preview=1"; } catch { /* no storage */ }
    fetch(`/api/pano?spot=${encodeURIComponent(spotId)}${preview}`, { headers: { accept: "application/json", "x-fishdock": "1" } }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (!gone && b?.pano) setPano(b.pano); }).catch(() => {});
    return () => { gone = true; };
  }, [spotId]);
  const panoOn = !!pano && usePano;
  // ---- the real place, for FishDock's documented marks: OpenStreetMap's data, built into 3D on this phone ----
  const [real, setReal] = useState(spotId ? undefined : null); // undefined while loading, null for the drawn place
  useEffect(() => {
    if (!spotId) { setReal(null); return undefined; }
    let gone = false; setReal(undefined);
    (async () => {
      try {
        const r = await fetch(`/api/place?spot=${encodeURIComponent(spotId)}`, { headers: { accept: "application/json", "x-fishdock": "1" } });
        if (!r.ok) throw new Error("no place");
        const [lat, lon] = (r.headers.get("x-mark") || "").split(",").map(Number);
        const osm = await r.json();
        const { buildPlace } = await import("../lib/world3d/osmPlace.js");
        // a mark whose listed position is approximate may use the nearest bank within 400 m (and the label says so)
        // (only when the server used that listed position: some marks have a checked position kept on the server)
        const listed = spotById(spotId);
        const approx = listed?.coordsVerified === false && Math.abs(listed.lat - lat) < 1e-4 && Math.abs(listed.lon - lon) < 1e-4;
        const place = buildPlace(osm, lat, lon, venue, { approx });
        // only a layout that passes the check (anglers at the mark, water in front); otherwise the labelled drawing
        if (!gone) setReal(place.grid && place.spots.length === 4 && place.check?.ok ? place : null);
      } catch { if (!gone) setReal(null); }
    })();
    return () => { gone = true; };
  }, [spotId, venue]);
  const facingNow = real || panoOn ? 0 : facing; // a real place is laid out with north ahead

  // ---- start the renderer (and three.js) once per place ----
  useEffect(() => {
    if (real === undefined) return undefined;
    let gone = false, w = null;
    (async () => {
      try {
        const mod = await import("../lib/world3d/world.js");
        if (gone) return;
        const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
        const q = quality === "auto" ? mod.autoQuality3d() : quality;
        w = mod.createWorld(canvas.current, {
          venue, quality: q, reduceMotion: reduce, real, pano: panoOn ? pano : null, trackJumps: loadView().track,
          onFeel: (n, d) => props.current.feel?.(n, d),
          onSound: (name, pos) => { if (!props.current.sound) return; const cam = W.current?.camera; if (soundPan && !loadView().spatial) soundPan(0, 1); else if (cam && pos && soundPan) { const d = pos.clone().sub(cam.position); const r = new cam.position.constructor(1, 0, 0).applyQuaternion(cam.quaternion); soundPan(Math.max(-1, Math.min(1, d.normalize().dot(r))), Math.max(0.25, 1 - cam.position.distanceTo(pos) / 60)); } play(name); },
        });
        W.current = w;
        w.setNow(() => props.current.now());
        w.setAnglers(props.current.anglers);
        if (startMode !== "first") { w.setMode(startMode); setMode(w.mode || startMode); }
        w.onFrame(({ outs, view }) => {
          setHeading((h) => { const deg = Math.round(((props.current.facing + (view.yaw * 180) / Math.PI) % 360 + 360) % 360); return Math.abs(deg - h) >= 2 ? deg : h; });
          for (const [id, o] of Object.entries(outs)) {
            const key = `${o.phase}|${o.info.since}`, prev = phases.current[id];
            if (!prev || prev.key !== key) { phases.current[id] = { key, landed: false }; props.current.onPhase?.(id, o.phase, o.info); }
            if (o.landed && !phases.current[id].landed) { phases.current[id].landed = true; props.current.onLanded?.(id, o.info.ev); }
          }
        });
        setReady(true);
      } catch (e) { console.warn("FishDock 3D view failed", e?.message); setFailed(true); }
    })();
    return () => { gone = true; w?.dispose(); W.current = null; setReady(false); };
  }, [venue, quality, real, panoOn]);

  useEffect(() => { W.current?.setAnglers(anglers); setOthers(anglers.filter((a) => !a.local).map((a) => ({ id: a.id, name: a.name }))); }, [anglers, ready]);
  useEffect(() => { if (ready) W.current?.setEnv({ light, cond, facing: facingNow }); }, [ready, JSON.stringify(light), JSON.stringify(cond), facingNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // the same sound as the photo view: the water, wind, rain and gulls for these conditions
  const heard = { kind: venue === "river" ? "river" : venue === "lake" ? "still" : "sea", wind: Math.min(1, (cond?.windKph ?? 12) / 45), rain: cond?.precipMm > 0 ? Math.min(1, 0.25 + cond.precipMm / 3) : 0, night: (light?.sunAlt ?? 30) < -6 ? 1 : 0, venue };
  useEffect(() => { if (sound) soundOn(heard); else soundOff(); return () => soundOff(); }, [sound]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { soundEnv(heard); }, [JSON.stringify(heard)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ready) return undefined; const ro = new ResizeObserver(() => W.current?.resize()); ro.observe(wrap.current); return () => ro.disconnect(); }, [ready]);

  // ---- touch and mouse: drag to look, pinch or wheel to zoom, double tap to recentre ----
  useEffect(() => {
    const el = canvas.current; if (!el) return undefined;
    const pts = new Map(); let pinch = 0;
    const down = (e) => { el.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) W.current?.look.start(); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } };
    const move = (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) W.current?.look.drag(dx, dy, el.clientHeight);
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) W.current?.look.zoom(d / pinch); pinch = d; }
    };
    // a tap (no drag) shows or hides the controls, unless a second tap follows (that recentres instead)
    let tapTimer = 0;
    const up = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pts.size === 0) {
        const L = W.current?.look; L?.end();
        if (L && L.state().moved < 8) { clearTimeout(tapTimer); if (!L.tap(performance.now())) tapTimer = setTimeout(() => props.current.onTap?.(), 330); }
      }
      pinch = 0;
    };
    const wheel = (e) => { e.preventDefault(); W.current?.look.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); };
    const key = (e) => { const L = W.current?.look; if (!L) return; const k = { ArrowLeft: [-40, 0], ArrowRight: [40, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] }[e.key]; if (k) { e.preventDefault(); L.start(); L.drag(-k[0], -k[1], el.clientHeight); L.end(); } if (e.key === "Home") L.recenter(); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("wheel", wheel, { passive: false }); el.addEventListener("keydown", key);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("wheel", wheel); el.removeEventListener("keydown", key); };
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (m) => { W.current?.setMode(m); setMode(W.current?.mode || m); },
    lookAtRod: () => W.current?.lookAtRod(), lookAtAngler: (id) => W.current?.lookAtAngler(id), lookAtFish: (id) => W.current?.lookAtFish(id),
    setTrack: (on) => W.current?.setTrack(on),
    focus: (id) => W.current?.focus(id), follow: (id, sec) => W.current?.follow(id, sec), recenter: () => W.current?.look.recenter(), snapshot: () => W.current?.snapshot(),
    get mode() { return mode; },
  }), [mode]);

  return (
    <div ref={wrap} className={`w3d ${className}`}>
      <canvas ref={canvas} className="w3d-canvas" tabIndex={0} aria-label="3D view: drag to look round, pinch to zoom, double tap to face your rod" />
      {!ready && !failed ? <div className="fs-loading"><span className="loading-dots" aria-label="Loading the 3D view" /></div> : null}
      {failed ? <div className="w3d-fail">This browser can't draw the 3D view. The photo view still works.</div> : null}
      <div className="w3d-compass" aria-label={`Facing ${compassPoint(heading)}`} title="Compass"><span style={{ transform: `rotate(${-heading}deg)` }}><b>N</b></span><i>{compassPoint(heading)}</i></div>
      {pano ? <div className="w3d-src" role="group" aria-label="What to show"><button type="button" className={`ft-pill${panoOn ? " on" : ""}`} onClick={() => setUsePano(true)}>Real 360° photo</button><button type="button" className={`ft-pill${!panoOn ? " on" : ""}`} onClick={() => setUsePano(false)}>Map model</button></div> : null}
      <div className="w3d-label">{panoOn ? <>360° <a href={pano.page} target="_blank" rel="noopener noreferrer">photo near here</a> by {pano.profile ? <a href={pano.profile} target="_blank" rel="noopener noreferrer">{pano.author}</a> : pano.author}, Mapillary, {pano.licence}{pano.capturedAt ? `, ${new Date(pano.capturedAt).getFullYear()}` : ""}. Not a live camera; the rod and fish are drawn · <b>Beta</b></> : real ? <>{placeName || "This place"}: its shape and buildings from OpenStreetMap, drawn in 3D{real.approx ? "; the mark's position is approximate, so you're on the nearest bank" : ""} · © OpenStreetMap contributors · <b>Beta</b></> : <>{layoutFor(venue).label}: a 3D drawing, not the real place · <b>Beta</b></>}</div>
      {children}
    </div>
  );
});
export default World3D;
