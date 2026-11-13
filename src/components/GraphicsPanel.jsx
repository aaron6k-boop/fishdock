// ---- GraphicsPanel: Settings → Graphics. A preset, or your own settings on top of one, and an FPS display ----
// Every control here changes what's drawn (world.js setGfx); nothing is for show. The preset sets the scene's own
// detail too (the sea's mesh, cloud shading, the people's textures, shadow quality), which needs the place built
// again: your fishing carries on, but someone walking about goes back to their spot. The rest change at once.
import { useEffect, useState } from "react";
import { createFrameLog, reportText } from "../lib/frameLog.js";

export const PRESETS = [["auto", "Auto"], ["performance", "Low"], ["balanced", "Medium"], ["high", "High"], ["ultra", "Ultra"]];
const NAME = Object.fromEntries(PRESETS);
// what each preset starts from (world.js QUALITY3D sets the rest)
export const PRESET_GFX = {
  performance: { res: 1, fps: 0, shadows: 0, shadowDist: 30, ao: 0, bloom: 0, aa: 0, refl: 0, tex: 4, sea: 0 },
  balanced: { res: 1, fps: 0, shadows: 1, shadowDist: 30, ao: 0, bloom: 1, aa: 4, sharp: 0.5, refl: 0, tex: 16, sea: 0 },
  high: { res: 1, fps: 0, shadows: 2, shadowDist: 30, ao: 1, bloom: 1, aa: 4, sharp: 0.5, refl: 1, tex: 16, sea: 0 },
  ultra: { res: 1, fps: 0, shadows: 2, shadowDist: 80, ao: 2, bloom: 1, aa: 4, sharp: 0.5, refl: 2, tex: 16, sea: 1 },
};
// Battery saver: 30 frames a second, three quarters of the pixels, no contact shade, glow or mirrored scene
export const BATTERY = { fps: 30, res: 0.75, ao: 0, bloom: 0, refl: 0 };
/** the settings in force: the preset's, your own changes, then Battery saver if it's on */
export function effectiveGfx(preset, custom = {}, battery = false) {
  return { ...(PRESET_GFX[preset] || PRESET_GFX.balanced), ...(custom || {}), ...(battery ? BATTERY : {}) };
}

const CONTROLS = [
  { k: "res", label: "Resolution", opts: [[0.5, "50%"], [0.75, "75%"], [1, "100%"]], why: "How many pixels are drawn. Lower is smoother and cooler on a phone, softer to look at." },
  { k: "fps", label: "Frame rate limit", opts: [[30, "30"], [60, "60"], [0, "Screen's rate"]], why: "30 saves battery. The screen's rate goes above 60 only where the screen and browser allow it." },
  { k: "shadows", label: "Shadows", opts: [[0, "Off"], [1, "Standard"], [2, "High"]], why: "High draws them at four times the detail: sharp at your feet, not stepped." },
  { k: "shadowDist", label: "Shadow distance", opts: [[20, "Near"], [30, "Normal"], [45, "Far"], [80, "Furthest"]], why: "How far round you things cast shadows. Further spreads the same detail wider; Furthest reaches the lookout and the far railings and wants the High shadow detail.", needs: "shadows" },
  { k: "ao", label: "Ambient occlusion", opts: [[0, "Off"], [1, "On"], [2, "Fine"]], why: "The soft shade where things meet: under benches, along walls, round your kit.", post: true },
  { k: "bloom", label: "Glow", opts: [[0, "Off"], [1, "On"]], why: "A soft glow on the brightest light: the sun on the sea, lamps after dark.", post: true },
  { k: "sea", label: "Sea", opts: [[0, "Waves"], [1, "Spectrum"]], why: "Spectrum simulates the wind sea from a wave spectrum on the graphics card: crowding crests, chop and whitecaps that come and go. Needs a graphics card with WebGL 2 float textures; a phone keeps Waves.", post: true },
  { k: "refl", label: "Water reflections", opts: [[0, "Sky only"], [1, "Scene"], [2, "Scene, smooth"]], why: "The dune, rocks, pier and town mirrored in the water. Scene draws the place a second time, smaller; smooth does it every frame.", post: true },
  { k: "sharp", label: "Sharpening", opts: [[0, "Off"], [0.5, "On"], [1, "Strong"]], why: "Crisper textures and edges after anti-aliasing, without bright halos round them.", post: true },
  { k: "aa", label: "Anti-aliasing", opts: [[0, "Off"], [2, "2x"], [4, "4x"]], why: "Smooths jagged edges on railings, rods and the line.", post: true },
  { k: "tex", label: "Texture sharpness", opts: [[2, "Low"], [4, "Medium"], [8, "High"], [16, "Highest"]], why: "How clear the deck, brick and sea stay when seen at a low angle." },
];

export default function GraphicsPanel({ view, setOpts, world, onClose, scene = null }) {
  const preset = view.gfx || "auto", custom = view.gfxC && typeof view.gfxC === "object" ? view.gfxC : {}, battery = !!view.battery;
  const info = world?.gfx || null, built = info?.preset || (preset === "auto" ? "balanced" : preset);
  const eff = effectiveGfx(built, custom, battery);
  const hasPost = info ? info.post : built !== "performance";
  const anisoCap = info?.anisoCap || 16;
  // apply a change at once (and save it); the preset buttons change view.gfx, which builds the place again
  const set = (k, v) => { const next = { ...custom, [k]: v }; setOpts({ gfxC: next }); world?.setGfx(effectiveGfx(built, next, battery)); };
  const pickPreset = (p) => { setOpts({ gfx: p, gfxC: {} }); if (p === preset) world?.setGfx(effectiveGfx(built, {}, battery)); };
  const setBattery = (on) => { setOpts({ battery: on }); world?.setGfx(effectiveGfx(built, custom, on)); };
  const reset = () => { setOpts({ gfx: "auto", gfxC: {}, battery: false }); world?.setGfx(effectiveGfx(built, {}, false)); };
  const customised = Object.keys(custom).length > 0;
  // the screen's own rate, measured over a second (only to say whether above 60 is possible here)
  const [hz, setHz] = useState(null);
  useEffect(() => {
    let n = 0, t0 = 0, raf = 0;
    const f = (t) => { if (!t0) t0 = t; n++; if (t - t0 < 1000) raf = requestAnimationFrame(f); else setHz(Math.round((n * 1000) / (t - t0))); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="gfx-panel" role="dialog" aria-label="Graphics settings">
      <div className="gfx-head">
        <strong>Graphics</strong>
        <button type="button" className="ft-pill" onClick={onClose}>Done</button>
      </div>
      <span className="cam-head">Preset</span>
      <div className="cam-row gfx-presets">
        {PRESETS.map(([id, label]) => (
          <button key={id} type="button" className={`ft-pill${preset === id ? " on" : ""}`} aria-pressed={preset === id} onClick={() => pickPreset(id)}>{label}</button>
        ))}
      </div>
      <p className="gfx-note">
        {preset === "auto" ? `Auto chose ${NAME[built] || "Medium"} for this device, and lowers the resolution a step at a time if frames run slow.` : `${NAME[preset]}.`}
        {customised ? " Custom: your own settings on top." : ""} Changing preset builds the scene again; your fishing carries on.
      </p>
      <button type="button" role="switch" aria-checked={battery} className={`ft-pill${battery ? " on" : ""}`} onClick={() => setBattery(!battery)}>Battery saver</button>
      <span className="cam-head">Custom</span>
      {CONTROLS.map((c) => {
        const off = (c.post && !hasPost) || (c.needs && !eff[c.needs]) || (battery && c.k in BATTERY);
        const why = c.post && !hasPost ? "Needs Medium or above on this device." : battery && c.k in BATTERY ? "Set by Battery saver." : c.why;
        return (
          <div key={c.k} className={`gfx-row${off ? " off" : ""}`}>
            <span className="gfx-label">{c.label}</span>
            <div className="cam-row">
              {c.opts.filter(([v]) => c.k !== "tex" || v <= anisoCap).map(([v, l]) => (
                <button key={l} type="button" disabled={off} className={`ft-pill${eff[c.k] === v ? " on" : ""}`} aria-pressed={eff[c.k] === v} onClick={() => set(c.k, v)}>{l}</button>
              ))}
            </div>
            <span className="gfx-why">{why}{c.k === "fps" && hz ? ` This screen: about ${hz} a second.` : ""}</span>
          </div>
        );
      })}
      <button type="button" role="switch" aria-checked={view.fps2 !== false} className={`ft-pill${view.fps2 !== false ? " on" : ""}`} onClick={() => setOpts({ fps2: view.fps2 === false })}>Show FPS</button>
      <button type="button" className="ft-pill" onClick={reset}>Reset to recommended</button>
      {devMode() ? <DevDiagnostics world={world} view={view} setOpts={setOpts} scene={scene} /> : null}
    </div>
  );
}

// ---- developer diagnostics ----
// Shown in a development build (__FD_FILM__, which production never sets) and in the Windows launcher, where the
// player is testing on their own machine. It is read-only about this machine's own drawing (frame times, draw
// calls, the graphics card's name, which any website can read, the camera's place in the scene): nothing about the
// person, their catches, their location or their account, and no action beyond the graphics presets the panel
// already offers. The launcher is recognised by its user agent, which a browser can imitate; that gains it only
// these figures about itself.
/* global __FD_FILM__ */
// (the developer diagnostics and the benchmark: in the film build, the desktop launcher, or any browser once
// fishdock.dev is set to 1 in its storage or the address carries "dev=1": so a benchmark can be run and copied from the
// live site and a PR preview alike, on the same PC)
export const devMode = () => { try { if (/\bdev=1\b/.test(location.hash + location.search)) localStorage.setItem("fishdock.dev", "1"); return (typeof __FD_FILM__ !== "undefined" && __FD_FILM__ === true) || /FishDockDesktop\/\d/.test(navigator.userAgent) || localStorage.getItem("fishdock.dev") === "1"; } catch { return false; } };
const PRESET_ORDER = ["performance", "balanced", "high", "ultra"];
// ---- the catch recording (frameLog.js): kept here, outside any component, so it runs on while the panel is closed ----
const catchRec = { cur: null, text: null, onDone: null };
function stopCatchRec(world) {
  const r = catchRec.cur; if (!r) return; catchRec.cur = null; r.world?.tapFrames?.(null); clearTimeout(r.timer); try { r.po?.disconnect(); } catch { /* not offered */ }
  const w = r.world || world, last = w?.perf?.(), g = w?.gfx || {};
  const where = navigator.userAgent.match(/FishDockDesktop\/[\d.]+/)?.[0] || (/iPhone|iPad/.test(navigator.userAgent) ? "iOS browser" : /Android/.test(navigator.userAgent) ? "Android browser" : "browser");
  const head = `FishDock catch recording · ${last?.gpuName || "unknown GPU"} · ${where} · window ${innerWidth}x${innerHeight} @${devicePixelRatio}x · drawn at ${last?.res?.join("x") || "?"} · preset ${NAME[last?.preset] || last?.preset || "?"}`;
  const extra = `long tasks (the page busy for over 50 ms): ${r.po ? `${r.long.n}, ${Math.round(r.long.ms)} ms in all, longest ${Math.round(r.long.max)} ms` : "not reported by this browser"} · memory: ${performance.memory ? `${Math.round(r.mem0 / 1e6)} MB at the start, ${Math.round(performance.memory.usedJSHeapSize / 1e6)} MB at the end` : "not reported by this browser"} · resolution at the end ${g.dpr?.toFixed?.(2) ?? "?"}x`;
  catchRec.text = r.log.frames.length ? reportText(head, r.log.report(), extra) : `${head}\nNo frames were recorded.`;
  catchRec.onDone?.(catchRec.text);
}
function startCatchRec(world) {
  if (!world?.tapFrames || catchRec.cur) return false;
  const log = createFrameLog(), long = { n: 0, ms: 0, max: 0 }; let po = null;
  try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { long.n++; long.ms += e.duration; long.max = Math.max(long.max, e.duration); } }); po.observe({ type: "longtask" }); } catch { po = null; }
  catchRec.cur = { world, log, long, po, mem0: performance.memory?.usedJSHeapSize || 0, timer: setTimeout(() => stopCatchRec(world), 120000) };
  catchRec.text = null; world.tapFrames((ms, info) => log.frame(ms, info));
  return true;
}
function DevDiagnostics({ world, view, setOpts, scene }) {
  const [p, setP] = useState(null), [d, setD] = useState(null), [bench, setBench] = useState(null), [running, setRunning] = useState(false);
  useEffect(() => { const t = setInterval(() => { setP(world?.perf?.() || null); setD(world?.diag?.() || null); }, 1000); return () => clearInterval(t); }, [world]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pct = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(a.length * q) - 1))];
  // the benchmark: the same scene for every run (a clear afternoon, a light wind, looking out over the rod from your
  // spot), each preset in turn with no custom settings and no battery saver, 6 s to build and settle, then 8 s
  // measured frame by frame; everything you had set is put back afterwards, whatever happens
  const run = async () => {
    if (running || !world) return; setRunning(true);
    const saved = { gfx: view.gfx || "auto", gfxC: view.gfxC && typeof view.gfxC === "object" ? { ...view.gfxC } : {}, battery: !!view.battery, fps2: view.fps2 !== false };
    const rows = [];
    try {
      const fixed = () => { world.setEnv?.({ light: { sunAlt: 28, sunAz: 200 }, cond: { cloudPct: 30, windKph: 16, precipMm: 0 }, facing: scene?.facing ?? 180 }); world.lookAtRod?.(); };
      // a preset change rebuilds the world: wait until it is drawing again (frames ticking), up to 40 s
      const ready = async () => { let n0 = -1; for (let i = 0; i < 40; i++) { await wait(1000); const f = world.frameTimes?.(); if (f && n0 >= 0 && f.n > n0 + 5) return f.n; n0 = f ? f.n : -1; } return world.frameTimes?.()?.n ?? 0; };
      for (const q of PRESET_ORDER) {
        setOpts({ gfx: q, gfxC: {}, battery: false }); await wait(500); await ready();
        world.setGfx?.(effectiveGfx(q, {}, false)); fixed(); await wait(5000);
        const t0 = performance.now(); let since = world.frameTimes?.()?.n ?? 0; const all = [];
        while (performance.now() - t0 < 8000) { await wait(1000); const f = world.frameTimes?.(since); if (f) { all.push(...f.times); since = f.n; } }
        const last = world.perf?.();
        if (all.length > 10 && last) {
          const a = all.slice().sort((x, y) => x - y), mean = a.reduce((s2, v) => s2 + v, 0) / a.length;
          rows.push({ q, frames: a.length, fps: Math.round(1000 / mean), p50: +pct(a, 0.5).toFixed(1), p95: +pct(a, 0.95).toFixed(1), p99: +pct(a, 0.99).toFixed(1), low1: Math.round(1000 / pct(a, 0.99)), gpu: last.gpu, calls: last.calls, tris: last.tris, texMB: last.texMB, res: last.res });
          setBench([...rows]);
        }
      }
    } finally {
      setOpts(saved); world.setGfx?.(effectiveGfx(saved.gfx === "auto" ? (world.gfx?.preset || "balanced") : saved.gfx, saved.gfxC, saved.battery));
      if (scene?.light && scene?.cond) world.setEnv?.({ light: scene.light, cond: scene.cond, facing: scene.facing ?? 180 });
      setRunning(false);
    }
  };
  // ---- record a catch: every frame from now until you stop (or two minutes), summed up by what you were doing ----
  // (the recording carries on with this panel closed: it is kept outside the component, catchRec below)
  const [rec, setRec] = useState(catchRec.text), [recOn, setRecOn] = useState(!!catchRec.cur);
  useEffect(() => { catchRec.onDone = (t) => { setRec(t); setRecOn(false); }; return () => { catchRec.onDone = null; }; }, []);
  const stopRec = () => stopCatchRec(world);
  const startRec = () => { if (startCatchRec(world)) { setRec(null); setRecOn(true); } };
  const text = () => {
    const head = `FishDock benchmark · ${p?.gpuName || "unknown GPU"} · ${navigator.userAgent.match(/FishDockDesktop\/[\d.]+/)?.[0] || "browser"} · window ${innerWidth}x${innerHeight} @${devicePixelRatio}x · scene: Gorleston, clear afternoon, 16 kph, from the spot\npreset | frames | avg fps | p50 ms | p95 ms | p99 ms | 1% low fps | GPU ms | draws | tris | tex MB | drawn at`;
    return [head, ...(bench || []).map((r) => `${NAME[r.q]} | ${r.frames} | ${r.fps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.low1} | ${r.gpu ?? "n/a"} | ${r.calls} | ${r.tris} | ${r.texMB} | ${r.res?.join("x")}`)].join("\n");
  };
  return (
    <div className="gfx-dev">
      <span className="cam-head">Developer diagnostics</span>
      {p ? <pre className="gfx-pre">{`${p.fps} fps · 1% low ${p.low} · ${p.ms} ms/frame${p.gpu != null ? ` · GPU ${p.gpu} ms` : " · GPU time n/a"}
${p.calls} draw calls · ${Math.round(p.tris / 1000)}k triangles · ${p.geometries} geometries · ${p.textures} textures (~${p.texMB} MB)
drawn at ${p.res?.join(" x ")} (${p.dpr.toFixed(2)}x) · preset ${NAME[p.preset] || p.preset}
GPU: ${p.gpuName || "not reported"}`}</pre> : null}
      {d ? <pre className="gfx-pre">{`camera ${d.cam.join(", ")} · yaw ${d.yawDeg}° pitch ${d.pitchDeg}° fov ${d.fov} · ${d.mode}
light day ${d.light.day} dusk ${d.light.dusk} night ${d.light.night} cloud ${d.light.cloud} rain ${d.light.rain} · exposure ${d.light.exposure}
sea swell ${d.sea.swell} wind ${d.sea.wind} from ${d.sea.windDir.join(", ")} · built in ${d.buildMs} ms · ${d.programs} shaders
you at ${d.at ? d.at.join(", ") : "-"} · ${d.phase || "-"}`}</pre> : null}
      <div className="cam-row">
        <button type="button" className="ft-pill" disabled={running} onClick={run}>{running ? "Benchmarking: about a minute, your settings come back after" : "Run benchmark: every preset"}</button>
        {bench?.length ? <button type="button" className="ft-pill" onClick={() => navigator.clipboard?.writeText(text()).catch(() => {})}>Copy results</button> : null}
      </div>
      {bench?.length ? <pre className="gfx-pre">{text()}</pre> : null}
      <div className="cam-row">
        <button type="button" className={`ft-pill${recOn ? " on" : ""}`} disabled={running} onClick={recOn ? stopRec : startRec}>{recOn ? "Stop recording" : "Record a catch"}</button>
        {rec ? <button type="button" className="ft-pill" onClick={() => navigator.clipboard?.writeText(rec).catch(() => {})}>Copy recording</button> : null}
      </div>
      <span className="gfx-why">{recOn ? "Recording every frame. Close this panel, cast, catch a fish and look at it, then come back and stop (it stops by itself after two minutes)." : "Record a catch: start, close this panel, fish as usual, then stop. It says how smooth each part was (waiting, the strike, the fight, landing, the fish in hand) and what was being built or sent when a frame ran long."}</span>
      {rec ? <pre className="gfx-pre">{rec}</pre> : null}
      <span className="gfx-why">Measured on this machine, in this window. GPU time needs a browser that offers the timer (Chrome and the launcher do; Safari doesn't).</span>
    </div>
  );
}

/** the FPS display: average and 1% low over the last few seconds, frame time, draw calls and the resolution in use */
export function FpsMeter({ world }) {
  const [p, setP] = useState(null);
  useEffect(() => { const t = setInterval(() => setP(world?.perf?.() || null), 500); return () => clearInterval(t); }, [world]);
  if (!p) return null;
  return (
    <div className="fps-meter" aria-live="off">
      {p.fps} fps · 1% low {p.low}<br />{p.ms} ms · {p.calls} draws · {Math.round(p.tris / 1000)}k tris · {p.dpr.toFixed(2)}x
    </div>
  );
}
