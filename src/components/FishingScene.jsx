// ---- FishingScene: the Live Fishing View itself (moving water over the place's photo, the rod, the catch) ----
// Used on the angler's fishing screen, on a viewer's private link and in replays. It draws whatever the events say
// at `now()` (liveEvents.phaseAt); it never invents a bite, a size or a fish. Quality: Auto, Battery Saver, Balanced
// or High; it stops drawing when off screen or in the background, and steps down by itself if the phone struggles.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createWaterRenderer, composeFrame, composeMask, composeSkyMask, composeWaterAuto, defaultWater, coverMap, skyLight } from "../lib/sceneGL.js";
import { createActors } from "../lib/sceneActors.js";
import { phaseAt, DRAW_CM, DUR } from "../lib/liveEvents.js";
import { defaultView, waterKind } from "../lib/scene.js";
import { hasArt, artUrl } from "../data/fishart.js";
import { photoFor, photoUrl } from "../data/photos.js";
import { speciesById } from "../data/species.js";
import { soundOn, soundOff, play } from "../lib/sceneAudio.js";
import { fmtTime } from "../lib/time.js";
import { Icon } from "./ui.jsx";

export const QUALITY = {
  saver: { label: "Battery Saver", scale: 0.5, fps: 20, oct: 2, flow: 0.6, parts: 0.4, frame: 800, ui: 0.8 },
  balanced: { label: "Balanced", scale: 0.75, fps: 30, oct: 3, flow: 1, parts: 0.75, frame: 1024, ui: 1 },
  high: { label: "High Quality", scale: 1, fps: 60, oct: 4, flow: 1, parts: 1, frame: 1600, ui: 1 },
};
export const QUALITY_OPTIONS = [{ value: "auto", label: "Auto" }, { value: "saver", label: "Battery Saver" }, { value: "balanced", label: "Balanced" }, { value: "high", label: "High" }];
const CUTOUTS = (id) => hasArt(id) && id !== "perch"; // every sea fish has a cut-out; perch's small picture is a crop

export function autoQuality() {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "saver";
    const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    if (mem <= 2 || cores <= 2) return "saver";
    if (mem >= 6 && cores >= 8) return "high";
  } catch { /* defaults */ }
  return "balanced";
}

const rel = (az, facing) => ((((az - facing) % 360) + 540) % 360) - 180;
/** Light and weather for the shader and the actors, from the shared conditions and sky. */
export function sceneEnv({ cond, light, view, kind, photo = true }) {
  const sky = skyLight(light?.sunAlt);
  const wind = Math.min(1, Math.max(0, (cond?.windKph ?? 12) / 45));
  const cloud = cond?.cloudPct != null ? cond.cloudPct / 100 : 0.35;
  const rain = cond?.precipMm > 0 ? Math.min(1, 0.25 + cond.precipMm / 3) : 0;
  const facing = view?.facing;
  // On a photo the sun and moon (and their paths on the water) only appear when we know they're in view: the angler
  // said which way they face. The drawn scene can always show them.
  let sunX = 0.62, sun = 0, moonX = 0.4, moon = 0, moonInView = false;
  if (light?.sunAlt != null && light.sunAlt > -2) {
    if (facing != null && light.sunAz != null) { const r = rel(light.sunAz, facing); if (Math.abs(r) < 60) { sunX = 0.5 + r / 75; sun = Math.min(1, 0.35 + (35 - Math.min(35, light.sunAlt)) / 40); } }
    else if (!photo) sun = sky.dusk * 0.45;
  }
  if (light?.moonAlt != null && light.moonAlt > 0 && sky.night > 0.3) {
    if (facing != null && light.moonAz != null) { const r = rel(light.moonAz, facing); if (Math.abs(r) < 60) { moonX = 0.5 + r / 75; moon = (light.moonIllum ?? 0.5) * sky.night; moonInView = true; } }
    else if (!photo) { moon = (light.moonIllum ?? 0.5) * sky.night * 0.5; moonInView = true; }
  }
  sun *= 1 - cloud * 0.8; moon *= 1 - cloud * 0.85;
  // the sun's glow in the sky: on a photo only where we know the sun is in view; the drawn sky always has it
  const sunUp = light?.sunAlt != null ? Math.min(1, Math.max(0, light.sunAlt / 40)) : 0.3;
  const sunGlow = photo ? (facing != null ? sun : 0) : light?.sunAlt != null && light.sunAlt > -3 ? Math.max(sun, 0.55 * (1 - cloud * 0.85)) : 0;
  const moonUp = light?.moonAlt != null ? Math.min(1, Math.max(0, light.moonAlt / 50)) : 0.3;
  const moonDisc = moonInView && light.moonAlt > 2 ? (1 - cloud * 0.9) * sky.night * (0.5 + 0.5 * (light.moonIllum ?? 0.5)) : 0;
  const wk = waterKind(kind);
  const windDir = cond?.windDir != null && facing != null ? (Math.sin(((cond.windDir + 180 - facing) * Math.PI) / 180) >= 0 ? 1 : -1) : 1;
  return {
    ...sky, wind, cloud, rain, fog: cloud > 0.95 && rain > 0 ? 0.3 : 0, sunX, sun, moonX, moon, sunUp, sunGlow, moonUp, moonDisc,
    river: wk === "river" ? 1 : 0, still: wk === "still" ? 1 : 0, flowX: windDir * 0.7, windDir,
  };
}

const fmtLen = (cm) => (cm ? `${cm} cm (${(cm / 2.54).toFixed(1)} in)` : null);
function fmtWeight(kg) {
  if (!kg) return null;
  const oz = Math.round(kg * 35.274), lb = Math.floor(oz / 16);
  return `${kg < 10 ? kg.toFixed(2) : kg.toFixed(1)} kg (${lb} lb ${oz % 16} oz)`;
}

/** The close-up of a landed fish: the angler's own photo when shared, otherwise FishDock's picture of the species. */
export function CatchCard({ ev, photoUrl: own, onClose, compact, onClip }) {
  const d = ev?.data || {};
  const sp = speciesById(d.species);
  const name = d.name || sp?.name || "Fish";
  const art = sp && hasArt(sp.id) ? artUrl(sp.id, "l") : null;
  const ph = !art && sp ? photoFor(sp.id) : null;
  return (
    <div className={`catch-card${compact ? " compact" : ""}`} role="dialog" aria-label={`Landed: ${name}`}>
      {onClose ? <button type="button" className="xbtn cc-x" onClick={onClose} aria-label="Close"><Icon name="close" /></button> : null}
      <div className="cc-pics">
        {own ? <figure className="cc-own"><img src={own} alt={`The angler's photo of the ${name.toLowerCase()}`} /><figcaption>Angler's photo</figcaption></figure> : null}
        {art ? <img className={`cc-art${own ? " small" : ""}`} src={art} alt="" /> : ph ? <img className={`cc-art photo${own ? " small" : ""}`} src={photoUrl(ph, 500)} alt="" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : null}
      </div>
      <div className="cc-body">
        <span className="cc-kicker">Landed{ev?.t ? ` at ${fmtTime(ev.t)}` : ""}</span>
        <h3>{name}</h3>
        <p className="cc-facts">{[fmtLen(d.lengthCm), fmtWeight(d.weightKg)].filter(Boolean).join(" · ") || "Size not logged"}{d.released ? " · Released" : ""}</p>
        {d.bait ? <p className="tiny">On {d.bait}</p> : null}
        <p className="cc-note">Animated reconstruction of a logged catch, not a video.{!own ? (art ? " Picture: FishDock's species picture." : ph ? ` Species photo: ${ph.author}, ${ph.licence}.` : "") : ""}</p>
        {onClip ? <button type="button" className="btn small cc-clip" onClick={onClip}><Icon name="play" />Make a highlight clip</button> : null}
      </div>
    </div>
  );
}

const FishingScene = forwardRef(function FishingScene({ scene, events, status, now = Date.now, env: envIn, quality = "auto", sound = false, floatRig = false, live = false, vibrate = false, catchPhoto, children, className = "", onPhase }, ref) {
  const wrap = useRef(null), glc = useRef(null), fxc = useRef(null);
  const R = useRef({ gl: null, actors: null, raf: 0, visible: true, onScreen: true, override: null, lastFrame: 0, slow: 0, q: null, prevPhase: "", fishFor: "", fallback: null, frameCanvas: null });
  const [q, setQ] = useState(() => (quality === "auto" ? autoQuality() : quality));
  const [card, setCard] = useState(null);
  const [banner, setBanner] = useState(null);
  const [fs, setFs] = useState(false);
  const [glOk, setGlOk] = useState(true);
  const [photoState, setPhotoState] = useState("none"); // none | loading | ok | failed
  const [clip, setClip] = useState(null);
  const clipOk = typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && !!HTMLCanvasElement.prototype.captureStream;
  const props = useRef({});
  props.current = { events, status, now, envIn, floatRig, live, vibrate, catchPhoto, onPhase, sound };
  const view = scene?.view || defaultView();

  useEffect(() => { setQ(quality === "auto" ? autoQuality() : quality); }, [quality]);
  useEffect(() => { // battery: an unplugged phone below 30% drops to Battery Saver in Auto
    if (quality !== "auto" || !navigator.getBattery) return;
    let b = null; const on = () => { if (b && !b.charging && b.level < 0.3) setQ("saver"); };
    navigator.getBattery().then((x) => { b = x; on(); x.addEventListener("levelchange", on); x.addEventListener("chargingchange", on); }).catch(() => {});
    return () => { b?.removeEventListener("levelchange", on); b?.removeEventListener("chargingchange", on); };
  }, [quality]);

  // ---- set up the renderers once ----
  useEffect(() => {
    const r = R.current;
    r.gl = createWaterRenderer(glc.current);
    if (!r.gl) { setGlOk(false); r.fallback = glc.current.getContext("2d"); }
    r.actors = createActors(fxc.current, { onSound: (n) => { if (props.current.sound) play(n); } });
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { r.onScreen = e.isIntersecting; }) : null;
    io?.observe(wrap.current);
    const vis = () => { r.visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(r.raf); io?.disconnect(); document.removeEventListener("visibilitychange", vis); r.gl?.destroy(); };
  }, []);

  // ---- the photo (or the representative scene) ----
  useEffect(() => {
    const r = R.current;
    let gone = false;
    const qq = QUALITY[q] || QUALITY.balanced;
    const apply = (img) => {
      if (gone) return;
      const frame = img ? composeFrame(img, view, qq.frame) : null;
      r.frameCanvas = frame;
      // the water area: the angler's corners if they set them, otherwise found from the photo itself
      const mask = (frame && defaultWater(view) && composeWaterAuto(frame, view.horizon)) || composeMask(view, 600);
      r.gl?.setScene(frame, mask, view.horizon, frame ? composeSkyMask(frame, view.horizon) : null);
    };
    if (!scene?.src) { setPhotoState("none"); apply(null); return () => { gone = true; }; }
    setPhotoState("loading");
    const img = new Image();
    if (/^https:/.test(scene.src)) { img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer"; }
    img.onload = () => { setPhotoState("ok"); apply(img); };
    img.onerror = () => { setPhotoState("failed"); apply(null); };
    img.src = scene.src;
    return () => { gone = true; };
  }, [scene?.src, JSON.stringify(view), q]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sizing ----
  useEffect(() => {
    const r = R.current;
    const fit = () => {
      const el = wrap.current; if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1), qq = QUALITY[q] || QUALITY.balanced;
      const gs = Math.max(0.35, dpr * qq.scale);
      glc.current.width = Math.max(2, Math.round(w * gs)); glc.current.height = Math.max(2, Math.round(h * gs));
      r.actors.resize(w, h, dpr * qq.ui);
      r.actors.setLayout({ cast: view.cast || defaultView(view.horizon).cast, horizon: view.horizon, map: coverMap(w / Math.max(1, h)) });
      r.fishFor = "";
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(wrap.current);
    addEventListener("orientationchange", fit);
    return () => { ro?.disconnect(); removeEventListener("orientationchange", fit); };
  }, [q, JSON.stringify(view)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sound on/off ----
  useEffect(() => { if (sound) soundOn({ kind: waterKind(envIn?.kind), wind: Math.min(1, (envIn?.cond?.windKph ?? 12) / 45) }); else soundOff(); return () => soundOff(); }, [sound, envIn?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the loop ----
  useEffect(() => {
    const r = R.current;
    const qq = QUALITY[q] || QUALITY.balanced;
    let lastPhase = "";
    const loop = (ts) => {
      r.raf = requestAnimationFrame(loop);
      if (!r.visible || !r.onScreen) return;
      if (ts - r.lastFrame < 1000 / (r.rec ? 30 : qq.fps) - 2) return;
      r.lastFrame = ts;
      const P = props.current;
      const t = ts / 1000;
      const nowMs = P.now();
      let info;
      if (r.override && ts - r.override.start < DUR.catch) info = { phase: "landing", since: r.override.start, age: (ts - r.override.start) / 1000, ev: r.override.ev };
      else {
        r.override = null;
        const p = phaseAt(P.events, nowMs, { status: P.status });
        info = { ...p, age: Math.max(0, (nowMs - p.since) / 1000) };
      }
      // the fish to draw for a landing
      if (info.phase === "landing") {
        const d = info.ev?.data || {};
        const key = `${d.species}|${d.lengthCm}|${glc.current.width}`;
        if (r.fishFor !== key) {
          r.fishFor = key;
          const cm = d.lengthCm || DRAW_CM[d.species] || 40;
          const frac = Math.min(0.7, Math.max(0.1, (cm / 100) * 0.6));
          if (d.species && CUTOUTS(d.species)) {
            const img = new Image();
            img.onload = () => r.actors.setFish(img, true, frac);
            img.src = artUrl(d.species, "s");
            r.actors.setFish(null, false, frac);
          } else r.actors.setFish(null, false, frac);
        }
      }
      const env = sceneEnv({ cond: P.envIn?.cond, light: P.envIn?.light, view, kind: P.envIn?.kind, photo: !!r.frameCanvas });
      r.actors.setEnv({ night: env.night, wind: env.wind, windDir: env.windDir, rain: env.rain, floatRig: P.floatRig, quality: qq.parts, dusk: env.dusk });
      const t0 = performance.now();
      const ripples = r.actors.frame(t, info);
      if (r.gl) {
        r.gl.set({ ...env, oct: qq.oct, flow: qq.flow });
        r.gl.render(t, ripples);
        if (r.rec) drawClipFrame(r);
      } else if (r.fallback && r.frameCanvas) {
        const c = glc.current, [sx, sy, ox, oy] = coverMap(c.width / c.height), f = r.frameCanvas;
        r.fallback.drawImage(f, ox * f.width, oy * f.height, sx * f.width, sy * f.height, 0, 0, c.width, c.height);
      } else if (r.fallback) {
        const g = r.fallback.createLinearGradient(0, 0, 0, glc.current.height);
        g.addColorStop(0, "#5d87a8"); g.addColorStop(view.horizon, "#b9cad6"); g.addColorStop(Math.min(1, view.horizon + 0.01), "#2c4a5c"); g.addColorStop(1, "#0f2430");
        r.fallback.fillStyle = g; r.fallback.fillRect(0, 0, glc.current.width, glc.current.height);
      }
      if (r.rec && !r.gl) drawClipFrame(r);
      // a phone that can't keep up steps down a level (Auto only)
      const spent = performance.now() - t0;
      r.slow = r.slow * 0.95 + (spent > 1000 / qq.fps * 0.8 ? 1 : 0) * 0.05;
      if (quality === "auto" && r.slow > 0.5 && q !== "saver") { r.slow = 0; setQ(q === "high" ? "balanced" : "saver"); }
      // banners, the close-up card, vibration
      const key = `${info.phase}|${info.since}`;
      if (key !== lastPhase) {
        const fresh = info.age < 2.5;
        const prev = lastPhase.split("|")[0];
        lastPhase = key;
        P.onPhase?.(info);
        if (prev === "hooked" && info.phase !== "landing") play("reelOff");
        const text = { bite: info.ev?.type === "smartbite" ? "Smart Bite alert (Beta)" : "Bite!", hooked: "Fish on!", lost: "Fish lost", missed: info.ev?.type === "snag" ? "Snag, not a fish" : "Missed", paused: "Paused" }[info.phase];
        setBanner(text && fresh ? { text, kind: info.phase, key } : null);
        if (fresh && P.vibrate && info.phase === "bite") try { navigator.vibrate?.([70, 50, 70]); } catch { /* ignore */ }
        if (info.phase === "landing" && fresh) setTimeout(() => setCard({ ev: info.ev, key }), 3600);
      }
    };
    r.raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(r.raf);
  }, [q, quality, JSON.stringify(view)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!banner) return undefined; const id = setTimeout(() => setBanner(null), banner.kind === "hooked" ? 4000 : 2600); return () => clearTimeout(id); }, [banner]);
  useEffect(() => { if (!card) return undefined; const id = setTimeout(() => setCard((c) => (c?.key === card.key ? null : c)), 9000); return () => clearTimeout(id); }, [card]);

  // ---- a short highlight clip of a catch: the landing replayed, then the close-up with the angler's photo ----
  async function recordClip(ev) {
    const r = R.current, el = wrap.current;
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
    if (!type) { setClip({ error: "This browser can't make video clips." }); return; }
    const scale = Math.min(1, 1280 / Math.max(1, el.clientWidth * 2));
    const out = document.createElement("canvas");
    out.width = Math.round(el.clientWidth * 2 * scale / 2) * 2; out.height = Math.round(el.clientHeight * 2 * scale / 2) * 2;
    const load = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const d = ev?.data || {};
    const [photo, art] = await Promise.all([load(props.current.catchPhoto?.(ev)), load(d.species && hasArt(d.species) ? artUrl(d.species, "l") : null)]);
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 5e6 }); } catch { setClip({ error: "This browser can't make video clips." }); return; }
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    const st = performance.now();
    r.rec = { canvas: out, g: out.getContext("2d"), start: st, ev, photo, art, name: d.name || speciesById(d.species)?.name || "Fish", facts: [fmtLen(d.lengthCm), fmtWeight(d.weightKg)].filter(Boolean).join(" · ") };
    r.override = { ev, start: st }; r.fishFor = "";
    setClip({ busy: true });
    rec.start(250);
    await new Promise((res) => setTimeout(res, 9500));
    rec.stop(); await done;
    r.rec = null;
    const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: type.split(";")[0] });
    const file = new File([blob], `fishdock-${(d.name || "catch").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${ext}`, { type: blob.type });
    setClip({ file, url: URL.createObjectURL(blob) });
  }
  function drawClipFrame(r) {
    const c = r.rec, g = c.g, w = c.canvas.width, h = c.canvas.height;
    g.drawImage(glc.current, 0, 0, w, h);
    g.drawImage(fxc.current, 0, 0, w, h);
    const age = (performance.now() - c.start) / 1000;
    if (age > 4.6) {
      const a = Math.min(1, (age - 4.6) / 0.5);
      g.fillStyle = `rgba(5,9,12,${0.55 * a})`; g.fillRect(0, 0, w, h);
      const pic = c.photo || c.art;
      g.globalAlpha = a;
      if (pic) {
        const bw = w * 0.56, bh = h * 0.62, k = Math.min(bw / pic.naturalWidth, bh / pic.naturalHeight);
        const pw = pic.naturalWidth * k, ph = pic.naturalHeight * k;
        g.drawImage(pic, w * 0.06 + (bw - pw) / 2, h * 0.12 + (bh - ph) / 2, pw, ph);
      }
      g.fillStyle = "#45d3cb"; g.font = `700 ${Math.round(h * 0.035)}px system-ui, sans-serif`; g.fillText("LANDED", w * 0.65, h * 0.3);
      g.fillStyle = "#fff"; g.font = `800 ${Math.round(h * 0.08)}px system-ui, sans-serif`; g.fillText(c.name, w * 0.65, h * 0.4);
      g.font = `600 ${Math.round(h * 0.04)}px system-ui, sans-serif`; g.fillText(c.facts || "", w * 0.65, h * 0.48);
      if (c.photo) { g.fillStyle = "#c9d6de"; g.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`; g.fillText("Angler's photo", w * 0.06, h * 0.09); }
      g.globalAlpha = 1;
    }
    g.fillStyle = "rgba(5,9,12,0.6)"; g.fillRect(0, h - h * 0.07, w, h * 0.07);
    g.fillStyle = "#e6f3f7"; g.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
    g.fillText("FishDock · animated reconstruction of a logged catch, not video", w * 0.03, h - h * 0.022);
  }

  useImperativeHandle(ref, () => ({
    /** Plays a logged catch's landing again, then shows its close-up. */
    recordClip,
    replayCatch(ev) { const st = performance.now(); R.current.override = { ev, start: st }; R.current.fishFor = ""; setCard(null); setTimeout(() => setCard({ ev, key: `r${st}` }), 3600); },
    showCard(ev) { setCard({ ev, key: `s${Date.now()}` }); },
  }), []);

  // ---- full screen: the Fullscreen API where there is one, a full-window view otherwise (iPhone Safari) ----
  useEffect(() => {
    const on = () => setFs(document.fullscreenElement === wrap.current || document.webkitFullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", on); document.addEventListener("webkitfullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); };
  }, []);
  const toggleFs = async () => {
    const el = wrap.current;
    if (fs) { if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); setFs(false); return; }
    try { if (el.requestFullscreen) { await el.requestFullscreen(); try { await screen.orientation?.lock?.("landscape"); } catch { /* not allowed */ } return; } if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return; } } catch { /* fall back */ }
    setFs(true);
  };
  useEffect(() => { if (!fs) return undefined; const k = (e) => { if (e.key === "Escape") setFs(false); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [fs]);

  const credit = scene?.kind === "commons" && scene.commons ? <>Photo near here, not the exact view: <a href={scene.commons.filePage || "#"} target="_blank" rel="noopener noreferrer">{scene.commons.author}, {scene.commons.licence}</a></>
    : scene?.kind === "own" ? (photoState === "failed" ? "The scene photo couldn't load" : "The angler's photo of this spot")
    : "Representative scene, not a photo of this place";

  return (
    <div ref={wrap} className={`fscene${fs ? " is-fs" : ""} ${className}`} data-phase={banner?.kind || ""}>
      <canvas ref={glc} className="fs-water" aria-hidden="true" />
      <canvas ref={fxc} className="fs-fx" aria-hidden="true" />
      {photoState === "loading" ? <div className="fs-loading"><span className="loading-dots" aria-label="Loading the scene" /></div> : null}
      <div className="fs-overlay">{children}</div>
      {banner ? <div className={`fs-banner b-${banner.kind}`} key={banner.key} role="status">{banner.text}</div> : null}
      {card && !clip?.busy ? <div className="fs-cardwrap"><CatchCard ev={card.ev} photoUrl={props.current.catchPhoto?.(card.ev)} onClose={() => setCard(null)} compact onClip={clipOk ? () => { setCard(null); recordClip(card.ev); } : null} /></div> : null}
      <button type="button" className="fs-btn fs-fsbtn" onClick={toggleFs} aria-label={fs ? "Leave full screen" : "Full screen"}><Icon name={fs ? "close" : "layers"} /></button>
      <div className="fs-foot">
        <span className="fs-credit">{credit}{!glOk ? " · Simple view (this browser can't draw moving water)" : ""}</span>
      </div>
      {clip ? (
        <div className="clip-box" role="status">
          <span className="grow">{clip.busy ? "Making the highlight clip… keep this screen open." : clip.error ? clip.error : "Highlight clip ready. It's labelled as an animated reconstruction."}</span>
          {clip.file && navigator.canShare?.({ files: [clip.file] }) ? <button type="button" className="btn small primary" onClick={() => navigator.share({ files: [clip.file], title: "FishDock highlight" }).catch(() => {})}><Icon name="share" />Share</button> : null}
          {clip.url ? <a className="btn small" href={clip.url} download={clip.file?.name}><Icon name="download" />Save</a> : null}
          {!clip.busy ? <button type="button" className="xbtn" onClick={() => { if (clip.url) URL.revokeObjectURL(clip.url); setClip(null); }} aria-label="Close"><Icon name="close" /></button> : null}
        </div>
      ) : null}
    </div>
  );
});

export default FishingScene;
