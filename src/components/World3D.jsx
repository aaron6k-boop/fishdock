// ---- World3D: the 360° 3D view of a representative place, with one or more anglers (Beta) ----
// three.js loads only when this opens. Drag to look round (all the way), up and down; pinch or scroll to zoom;
// double tap to face your rod again. A small compass, camera modes, Look at my rod and Watch a friend. It is drawn,
// not filmed: the label says it's a representative 3D scene, never the real place or a camera.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { spotById } from "../data/spots.js";
import { Icon } from "./ui.jsx";
import { bindSceneInput } from "../lib/world3d/sceneInput.js";
import { compassPoint } from "../lib/world3d/look.js";
import { layoutFor } from "../lib/world3d/spots.js";
import { landCamOn } from "../lib/viewPrefs.js";
import { SKYLINE_NOTE } from "../lib/world3d/skyline.js";
import { localFor } from "../lib/world3d/localDetail.js";
import { play, soundPan, soundOn, soundOff, soundEnv, setVolumes } from "../lib/sceneAudio.js";

// ---- view choices kept on this phone: follow jumps (the camera turns to a leaping fish), spatial sound (sounds come
// from where they happen: your friend's reel from their side, quieter further away) ----
const VIEW_KEY = "fishdock.view3d.v1";
// (landCam2: the landing camera. New users get it on; an earlier choice to turn it off ("landCam": false) is kept)
export const VIEW_DEFAULTS = { track: true, spatial: true, side: "right", look: "normal", smooth: true, stick: "m", stickFloat: false, gfx: "auto", camDist: "normal", autoBtn: false };
// sound levels for the three kinds of sound (sceneAudio.js setVolumes), saved on this phone
const LEVELS_KEY = "fishdock.sound.levels";
export function loadLevels() { try { return { environment: 0.8, equipment: 0.8, events: 1, ...JSON.parse(localStorage.getItem(LEVELS_KEY) || "{}") }; } catch { return { environment: 0.8, equipment: 0.8, events: 1 }; } }
export function saveLevels(v) { try { localStorage.setItem(LEVELS_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
export const LOOK_SENS = { low: 0.65, normal: 1, high: 1.5 };
export function loadView() {
  try {
    const v = { ...VIEW_DEFAULTS, ...JSON.parse(localStorage.getItem(VIEW_KEY) || "{}") };
    // the landing camera: on for anyone who hasn't chosen; someone who turned it off (then called "landCam") keeps it off
    v.landCam2 = landCamOn(v);
    return v;
  } catch { return { ...VIEW_DEFAULTS }; }
}
export function saveView(v) { try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* no storage */ } }

const World3D = forwardRef(function World3D({ fight = null, spotId = null, placeName = "", startMode = "first", feel = null, onTap, onWalk, onKept, onFishTap, onPose, onHear, venue = "pier", anglers = [], light, cond, facing = 180, quality = "auto", now = Date.now, sound = false, onPhase, onLanded, children, className = "" }, ref) {
  const wrap = useRef(null), canvas = useRef(null), W = useRef(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  // the phone can take the 3D drawing away (low memory, the browser in the background): when it gives it back the
  // view is rebuilt, with a plain "restoring" message meanwhile rather than a black screen
  const [gen, setGen] = useState(0), [lost, setLost] = useState(false), [about, setAbout] = useState(false);
  useEffect(() => {
    const c = canvas.current; if (!c) return undefined;
    const off = (e) => { e.preventDefault(); setLost(true); }, on = () => { setLost(false); setGen((g) => g + 1); };
    c.addEventListener("webglcontextlost", off); c.addEventListener("webglcontextrestored", on);
    return () => { c.removeEventListener("webglcontextlost", off); c.removeEventListener("webglcontextrestored", on); };
  }, []);
  const [heading, setHeading] = useState(0), [mode, setMode] = useState("first"), [others, setOthers] = useState([]);
  const [walk, setWalk] = useState(null); // { on, canFish, sprint } while walking about
  useEffect(() => { props.current.onWalk?.(walk); }, [walk]);
  const props = useRef({}); props.current = { anglers, onPhase, onLanded, sound, facing: spotId ? 0 : facing, now, onTap, feel, onWalk, onKept, onFishTap, onPose, onHear };
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
        const place = buildPlace(osm, lat, lon, venue, { approx }); place.id = spotId;
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
          onSound: (name, pos, _who, data) => { if (!props.current.sound) return; const cam = W.current?.camera; if (soundPan && !loadView().spatial) soundPan(0, 1); else if (cam && pos && soundPan) { const d = pos.clone().sub(cam.position); const r = new cam.position.constructor(1, 0, 0).applyQuaternion(cam.quaternion); soundPan(Math.max(-1, Math.min(1, d.normalize().dot(r))), Math.max(0.25, 1 - cam.position.distanceTo(pos) / 60)); } play(name, data); },
        });
        // the real place as built failed its scene check (sceneCheck.js): don't serve it as a real scene
        if (real && w.realCheck && !w.realCheck.ok) { w.dispose(); if (!gone) setReal(null); return; }
        if (canvas.current) canvas.current.dataset.check = w.realCheck ? (w.realCheck.ok ? "ok" : "failed") : "drawn";
        w.onPose((p) => props.current.onPose?.(p));
        W.current = w;
        w.setNow(() => props.current.now());
        w.setAnglers(props.current.anglers);
        // where you arrived, after the arrival check (spawn.js): for the tests and for anyone looking into a report
        if (canvas.current && w.spawn) { canvas.current.dataset.spawn = JSON.stringify({ safe: w.spawn.spots.length, report: w.spawn.report.filter((r) => r.problem) }); canvas.current.dataset.me = JSON.stringify(w.mySpot); }
        if (startMode !== "first") { w.setMode(startMode); setMode(w.mode || startMode); }
        let keptWas = null, heardAt = 0;
        w.onFrame(({ outs, view, walk: wk, kept, localId }) => {
          // where everyone stands, for proximity chat (a few times a second)
          if (props.current.onHear && performance.now() - heardAt > 250) { heardAt = performance.now(); const others = {}; for (const [id, o] of Object.entries(outs)) if (id !== localId) others[id] = { x: o.at.x, z: o.at.z }; const me = outs[localId]?.at; props.current.onHear({ me: me ? { x: me.x, z: me.z } : null, yaw: view.yaw, others }); }
          const ks = kept?.state || null; if (ks !== keptWas) { keptWas = ks; props.current.onKept?.(ks); }
          setWalk((o) => (!wk ? (o ? null : o) : !o || o.canFish !== wk.canFish || o.crowded !== wk.crowded || o.sprint !== wk.sprint || o.auto !== wk.auto || o.going !== wk.going ? wk : o));
          setHeading((h) => { const deg = Math.round(((props.current.facing + (view.yaw * 180) / Math.PI) % 360 + 360) % 360); return Math.abs(deg - h) >= 2 ? deg : h; });
          for (const [id, o] of Object.entries(outs)) {
            const key = `${o.phase}|${o.info.since}`, prev = phases.current[id];
            if (!prev || prev.key !== key) { phases.current[id] = { key, landed: false }; props.current.onPhase?.(id, o.phase, o.info); }
            if (o.landed && !phases.current[id].landed) { phases.current[id].landed = true; props.current.onLanded?.(id, o.info.ev); }
          }
        });
        { const v0 = loadView(); W.current?.look.setFeel({ sens: LOOK_SENS[v0.look] ?? 1, smooth: v0.smooth !== false }); W.current?.setLandShot(v0.landCam2 !== false); }
        setReady(true);
      } catch (e) { console.warn("FishDock 3D view failed", e?.message); setFailed(true); }
    })();
    return () => { gone = true; w?.dispose(); W.current = null; setReady(false); };
  }, [venue, quality, real, panoOn, gen]);

  useEffect(() => { W.current?.setFight(fight); }, [fight, ready]);
  useEffect(() => { W.current?.setAnglers(anglers); setOthers(anglers.filter((a) => !a.local).map((a) => ({ id: a.id, name: a.name }))); }, [anglers, ready]);
  useEffect(() => { if (ready) W.current?.setEnv({ light, cond, facing: facingNow }); }, [ready, JSON.stringify(light), JSON.stringify(cond), facingNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // the same sound as the photo view: the water, wind, rain and gulls for these conditions
  const heard = { kind: venue === "river" ? "river" : venue === "lake" ? "still" : "sea", wind: Math.min(1, (cond?.windKph ?? 12) / 45), rain: cond?.precipMm > 0 ? Math.min(1, 0.25 + cond.precipMm / 3) : 0, night: (light?.sunAlt ?? 30) < -6 ? 1 : 0, venue };
  useEffect(() => { if (sound) { soundOn(heard); setVolumes(loadLevels()); } else soundOff(); return () => soundOff(); }, [sound]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { soundEnv(heard); }, [JSON.stringify(heard)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ready) return undefined; const ro = new ResizeObserver(() => W.current?.resize()); ro.observe(wrap.current); return () => ro.disconnect(); }, [ready]);

  // ---- touch and keyboard input, including cancellation on focus loss ----
  useEffect(() => {
    const el = canvas.current; if (!el) return undefined;
    return bindSceneInput(el, () => W.current, () => props.current);
  }, []);

  useImperativeHandle(ref, () => ({
    setMode: (m) => { W.current?.setMode(m); setMode(W.current?.mode || m); },
    lookAtRod: () => W.current?.lookAtRod(), lookAtAngler: (id) => W.current?.lookAtAngler(id), lookAtFish: (id) => W.current?.lookAtFish(id),
    setTrack: (on) => W.current?.setTrack(on), setLandShot: (on) => W.current?.setLandShot(on),
    inspectFish: (on) => W.current?.inspectFish(on), keepFish: () => W.current?.keepFish(), releaseFish: () => W.current?.releaseFish(),
    setSpeaking: (id, on) => W.current?.setSpeaking(id, on),
    walk: (on, o) => W.current?.walk(on, o), setWalkInput: (i) => W.current?.setWalkInput(i), jump: () => W.current?.jump(), fishHere: () => W.current?.fishHere(),
    onPose: (f) => W.current?.onPose(f), emote: (k) => W.current?.emote(k),
    setLookFeel: (v) => W.current?.look.setFeel({ sens: LOOK_SENS[v.look] ?? 1, smooth: v.smooth !== false }),
    autoWalk: (on) => W.current?.autoWalk(on), get autoWalking() { return !!W.current?.autoWalking; },
    aimCast: (p) => W.current?.aimCast(p), castParams: (p) => W.current?.castParams(p), setRemotePose: (id, p) => W.current?.setRemotePose(id, p),
    get walkState() { return walk; },
    focus: (id) => W.current?.focus(id), follow: (id, sec) => W.current?.follow(id, sec), recenter: () => W.current?.look.recenter(), snapshot: () => W.current?.snapshot(),
    get mode() { return mode; },
  }), [mode, walk]);

  return (
    <div ref={wrap} className={`w3d ${className}${ready && !lost ? " is-ready" : " is-waiting"}`}>
      <canvas ref={canvas} className="w3d-canvas" tabIndex={0} aria-label="3D view: drag to look round, pinch to zoom, double tap to face your rod" />
      {(!ready || lost) && !failed ? <div className="fs-loading w3d-loading" role="status"><div className="w3d-load-card"><b>{lost ? "Restoring the 3D view" : `Setting up ${real ? placeName || "the place" : "the view"}`}</b><span className="loading-dots" aria-hidden="true" /></div></div> : null}
      {failed ? <div className="w3d-fail">This browser can't draw the 3D view. The photo view still works.</div> : null}
      <div className="w3d-compass" aria-label={`Facing ${compassPoint(heading)}`} title="Compass"><span style={{ transform: `rotate(${-heading}deg)` }}><b aria-hidden="true" /></span><i>{compassPoint(heading)}</i></div>
      {pano ? <div className="w3d-src" role="group" aria-label="What to show"><button type="button" className={`ft-pill${panoOn ? " on" : ""}`} onClick={() => setUsePano(true)}>Real 360° photo</button><button type="button" className={`ft-pill${!panoOn ? " on" : ""}`} onClick={() => setUsePano(false)}>Map model</button></div> : null}
      <div className={`w3d-label${about ? " open" : ""}`}>
        <button type="button" className="w3d-about" onClick={() => setAbout(!about)} aria-expanded={about} aria-label="About this view and its sources"><Icon name="info" /></button>
        {about ? <span className="w3d-full">{panoOn ? <>360° <a href={pano.page} target="_blank" rel="noopener noreferrer">photo near here</a> by {pano.profile ? <a href={pano.profile} target="_blank" rel="noopener noreferrer">{pano.author}</a> : pano.author}, Mapillary, {pano.licence}{pano.capturedAt ? `, ${new Date(pano.capturedAt).getFullYear()}` : ""}. Not a live camera; the rod and fish are drawn · <b>Beta</b></> : real ? <>{placeName || "This place"}: its shape and where buildings stand from OpenStreetMap; how they look is a reconstruction{real.approx ? "; the mark's position is approximate, so you're on the nearest bank" : ""}. {SKYLINE_NOTE}{localFor(spotId)?.note ? ` ${localFor(spotId).note}` : ""} · © OpenStreetMap contributors · <b>Beta</b></> : <>{layoutFor(venue).label}: a 3D drawing, not the real place · <b>Beta</b></>}</span>
          : <span className="w3d-short">{panoOn ? "360° photo, Mapillary" : real ? `${placeName || "This place"} · reconstruction · © OpenStreetMap contributors` : "A 3D drawing, not the real place"} · <b>Beta</b></span>}
      </div>
      {children}
    </div>
  );
});
export default World3D;
