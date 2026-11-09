// ---- GraphicsPanel: Settings → Graphics. A preset, or your own settings on top of one, and an FPS display ----
// Every control here changes what's drawn (world.js setGfx); nothing is for show. The preset sets the scene's own
// detail too (the sea's mesh, cloud shading, the people's textures, shadow quality), which needs the place built
// again: your fishing carries on, but someone walking about goes back to their spot. The rest change at once.
import { useEffect, useState } from "react";

export const PRESETS = [["auto", "Auto"], ["performance", "Low"], ["balanced", "Medium"], ["high", "High"], ["ultra", "Ultra"]];
const NAME = Object.fromEntries(PRESETS);
// what each preset starts from (world.js QUALITY3D sets the rest)
export const PRESET_GFX = {
  performance: { res: 1, fps: 0, shadows: 0, shadowDist: 30, ao: 0, bloom: 0, aa: 0, refl: 0, tex: 4, sea: 0 },
  balanced: { res: 1, fps: 0, shadows: 1, shadowDist: 30, ao: 0, bloom: 1, aa: 4, sharp: 0.5, refl: 0, tex: 16, sea: 0 },
  high: { res: 1, fps: 0, shadows: 2, shadowDist: 30, ao: 1, bloom: 1, aa: 4, sharp: 0.5, refl: 1, tex: 16, sea: 0 },
  ultra: { res: 1, fps: 0, shadows: 2, shadowDist: 45, ao: 2, bloom: 1, aa: 4, sharp: 0.5, refl: 2, tex: 16, sea: 1 },
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
  { k: "shadowDist", label: "Shadow distance", opts: [[20, "Near"], [30, "Normal"], [45, "Far"]], why: "How far round you things cast shadows. Further spreads the same detail wider.", needs: "shadows" },
  { k: "ao", label: "Ambient occlusion", opts: [[0, "Off"], [1, "On"], [2, "Fine"]], why: "The soft shade where things meet: under benches, along walls, round your kit.", post: true },
  { k: "bloom", label: "Glow", opts: [[0, "Off"], [1, "On"]], why: "A soft glow on the brightest light: the sun on the sea, lamps after dark.", post: true },
  { k: "sea", label: "Sea", opts: [[0, "Waves"], [1, "Spectrum"]], why: "Spectrum simulates the wind sea from a wave spectrum on the graphics card: crowding crests, chop and whitecaps that come and go. Needs a graphics card with WebGL 2 float textures; a phone keeps Waves.", post: true },
  { k: "refl", label: "Water reflections", opts: [[0, "Sky only"], [1, "Scene"], [2, "Scene, smooth"]], why: "The dune, rocks, pier and town mirrored in the water. Scene draws the place a second time, smaller; smooth does it every frame.", post: true },
  { k: "sharp", label: "Sharpening", opts: [[0, "Off"], [0.5, "On"], [1, "Strong"]], why: "Crisper textures and edges after anti-aliasing, without bright halos round them.", post: true },
  { k: "aa", label: "Anti-aliasing", opts: [[0, "Off"], [2, "2x"], [4, "4x"]], why: "Smooths jagged edges on railings, rods and the line.", post: true },
  { k: "tex", label: "Texture sharpness", opts: [[2, "Low"], [4, "Medium"], [8, "High"], [16, "Highest"]], why: "How clear the deck, brick and sea stay when seen at a low angle." },
];

export default function GraphicsPanel({ view, setOpts, world, onClose }) {
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
      <button type="button" role="switch" aria-checked={!!view.fpsShow} className={`ft-pill${view.fpsShow ? " on" : ""}`} onClick={() => setOpts({ fpsShow: !view.fpsShow })}>Show FPS</button>
      <button type="button" className="ft-pill" onClick={reset}>Reset to recommended</button>
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
