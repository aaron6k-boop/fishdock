// ---- LookPicker: choose how your angler looks in the 3D view ----
// Jacket, skin tone, hair, hat, beard and build, with a small turning preview of the figure. Saved on this phone and
// shared with a party you start or join (only these choices: it's your character in the simulation).
import { useEffect, useRef } from "react";
import { OUTFITS } from "../lib/world3d/angler.js";
import { SKINS, HAIRS, HATS, BEARDS, BUILDS, lookFor, savedLook } from "../lib/world3d/people.js";

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
/** Your look: the saved one, or a starting point (jacket 0, a medium build, a beanie). */
export const myLook = () => savedLook() || { outfit: 0, skin: 1, hair: 1, hat: 0, beard: 0, build: 1 };
/** The parts the server keeps (no jacket: parties already share that as `outfit`). */
export const lookOnly = (v) => (v ? { skin: v.skin, hair: v.hair, hat: v.hat, beard: v.beard, build: v.build } : null);

// ---- the preview: the figure in a small canvas, turning slowly ----
function Preview({ value }) {
  const ref = useRef(null), live = useRef(null);
  useEffect(() => {
    let off = false, raf = 0;
    (async () => {
      const THREE = await import("three"), { createFigure } = await import("../lib/world3d/figure3d.js");
      if (off || !ref.current) return;
      const canvas = ref.current, r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(canvas.clientWidth || 140, canvas.clientHeight || 190, false);
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x4a4438, 1.5));
      const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(2, 3, 3); scene.add(sun);
      const cam = new THREE.PerspectiveCamera(24, (canvas.clientWidth || 140) / (canvas.clientHeight || 190), 0.1, 20);
      cam.position.set(0, 1.25, 4.6); cam.lookAt(0, 0.98, 0);
      const holder = new THREE.Group(); scene.add(holder);
      live.current = { THREE, r, scene, cam, holder, createFigure, fig: null, t0: performance.now() };
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const L = live.current; if (!L?.fig) return;
        const t = (performance.now() - L.t0) / 1000;
        holder.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.8;
        L.fig.pose({ t, dt: 0.016, idle: "hang" }); r.render(scene, cam);
      };
      tick(); build(value);
    })().catch(() => {});
    return () => { off = true; cancelAnimationFrame(raf); const L = live.current; if (L) { L.fig?.dispose(); L.r.dispose(); } live.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function build(v) {
    const L = live.current; if (!L) return;
    if (L.fig) { L.holder.remove(L.fig.group); L.fig.dispose(); }
    L.fig = L.createFigure({ id: "preview", look: lookFor("preview", lookOnly(v)), outfit: OUTFITS[v.outfit ?? 0], venue: "pier" });
    L.holder.add(L.fig.group);
  }
  useEffect(() => { build(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="look-preview" aria-hidden="true" />;
}

function Swatches({ label, list, value, onPick }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="look-swatches">{list.map((c, i) => <button key={c.name} type="button" role="radio" aria-checked={value === i} aria-label={c.name} title={c.name} className={`look-sw${value === i ? " on" : ""}`} style={{ "--c": hex(c.hex) }} onClick={() => onPick(i)} />)}</div>
    </div>
  );
}
function Chips({ label, list, value, onPick }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="chips">{list.map((n, i) => <button key={n} type="button" role="radio" aria-checked={value === i} className={`chip${value === i ? " on" : ""}`} onClick={() => onPick(i)}>{n}</button>)}</div>
    </div>
  );
}

export default function LookPicker({ value, onChange }) {
  const set = (k) => (i) => onChange({ ...value, [k]: i });
  return (
    <div className="look-picker">
      <Preview value={value} />
      <div className="look-opts">
        <div className="look-row" role="radiogroup" aria-label="Jacket">
          <span className="lbl">Jacket</span>
          <div className="outfits">{OUTFITS.map((o, i) => <button key={o.name} type="button" role="radio" aria-checked={value.outfit === i} aria-label={o.name} title={o.name} className={`outfit${value.outfit === i ? " on" : ""}`} style={{ "--jk": hex(o.jacket), "--ht": hex(o.hat) }} onClick={() => set("outfit")(i)}><i /></button>)}</div>
        </div>
        <Swatches label="Skin" list={SKINS} value={value.skin} onPick={set("skin")} />
        <Swatches label="Hair" list={HAIRS} value={value.hair} onPick={set("hair")} />
        <Chips label="Hat" list={HATS} value={value.hat} onPick={set("hat")} />
        <Chips label="Beard" list={BEARDS} value={value.beard} onPick={set("beard")} />
        <Chips label="Build" list={BUILDS} value={value.build} onPick={set("build")} />
      </div>
    </div>
  );
}
