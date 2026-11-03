// ---- LookPicker: choose your angler for the 3D view ----
// A person (men and women of different ages and skin tones, each a realistic 3D model) and what they wear for the
// coast: jacket and trousers colours, wellies or their own boots, a hat, a life jacket, gloves. A small preview turns
// slowly as you choose. Saved on this phone and shared with a party you start or join (only these choices: it's your
// character in the simulation, not anything about you).
import { useEffect, useRef } from "react";
import { OUTFITS } from "../lib/world3d/angler.js";
import { PEOPLE, COATS, LEGS, FOOTWEAR, HATS, KIT_KEYS, LOOK_KEYS, lookFor, savedLook, withPerson } from "../lib/world3d/people.js";

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
/** Your look: the saved one, or a starting point (a man in a navy jacket, green wellies and a beanie). */
export const myLook = () => savedLook() || withPerson({ outfit: 0, skin: 1, hair: 1, hat: 0, beard: 0, build: 1, coat: 1, legs: 0, boots: 1, life: 0, gloves: 0 }, 0);
/** The parts the server keeps (no jacket colour of the old kind: parties already share that as `outfit`). */
export const lookOnly = (v) => {
  if (!v) return null;
  const out = {};
  for (const k of [...Object.keys(LOOK_KEYS), ...Object.keys(KIT_KEYS)]) if (v[k] != null) out[k] = v[k];
  return out;
};

// ---- the preview: the person in a small canvas, turning slowly ----
function Preview({ value }) {
  const ref = useRef(null), live = useRef(null);
  useEffect(() => {
    let off = false, raf = 0;
    (async () => {
      const THREE = await import("three"), { createPerson, preloadPerson } = await import("../lib/world3d/human3d.js");
      if (off || !ref.current) return;
      const canvas = ref.current, r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setSize(canvas.clientWidth || 140, canvas.clientHeight || 190, false);
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdfeaf5, 0x4a4438, 1.5));
      const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(2, 3, 3); scene.add(sun);
      const cam = new THREE.PerspectiveCamera(24, (canvas.clientWidth || 140) / (canvas.clientHeight || 190), 0.1, 20);
      cam.position.set(0, 1.25, 4.9); cam.lookAt(0, 0.98, 0);
      const holder = new THREE.Group(); scene.add(holder);
      live.current = { THREE, r, scene, cam, holder, createPerson, preloadPerson, fig: null, t0: performance.now() };
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const L = live.current; if (!L?.fig) return;
        const t = (performance.now() - L.t0) / 1000;
        holder.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.8; holder.updateMatrixWorld(true);
        L.fig.pose({ t, dt: 0.016, idle: "hang" }); r.render(scene, cam);
      };
      tick(); build(value);
    })().catch(() => {});
    return () => { off = true; cancelAnimationFrame(raf); const L = live.current; if (L) { L.fig?.dispose(); L.r.dispose(); } live.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function build(v) {
    const L = live.current; if (!L) return;
    if (L.fig) { L.holder.remove(L.fig.group); L.fig.dispose(); }
    L.fig = L.createPerson({ id: "preview", look: lookFor("preview", lookOnly(v)), outfit: OUTFITS[v.outfit ?? 0], venue: "pier" });
    L.holder.add(L.fig.group);
  }
  useEffect(() => { build(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="look-preview" aria-hidden="true" />;
}

function Swatches({ label, list, value, onPick }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="look-swatches">{list.map((c, i) => <button key={c.name} type="button" role="radio" aria-checked={value === i} aria-label={c.name} title={c.name} className={`look-sw${value === i ? " on" : ""}${c.hex == null ? " own" : ""}`} style={c.hex == null ? undefined : { "--c": hex(c.hex) }} onClick={() => onPick(i)} />)}</div>
    </div>
  );
}
function Chips({ label, list, value, onPick }) {
  return (
    <div className="look-row" role="radiogroup" aria-label={label}>
      <span className="lbl">{label}</span>
      <div className="chips">{list.map((n, i) => { const name = typeof n === "string" ? n : n.name; return <button key={name} type="button" role="radio" aria-checked={value === i} className={`chip${value === i ? " on" : ""}`} onClick={() => onPick(i)}>{name}</button>; })}</div>
    </div>
  );
}
function People({ value, onPick }) {
  const group = (sex, label) => (
    <div className="look-people" role="radiogroup" aria-label={label}>
      {PEOPLE.map((p, i) => (p.sex !== sex ? null : (
        <button key={p.file} type="button" role="radio" aria-checked={value === i} aria-label={p.name} title={p.name} className={`look-person${value === i ? " on" : ""}`} onClick={() => onPick(i)}>
          <img src={`/people/${p.file}.webp`} alt="" width="48" height="60" loading="lazy" decoding="async" />
        </button>
      )))}
    </div>
  );
  return (
    <div className="look-row">
      <span className="lbl">Person</span>
      {group("m", "Men")}
      {group("f", "Women")}
    </div>
  );
}

export default function LookPicker({ value, onChange }) {
  const set = (k) => (i) => onChange({ ...value, [k]: i });
  const person = Number.isInteger(value.person) ? value.person : 0;
  return (
    <div className="look-picker">
      <Preview value={value} />
      <div className="look-opts">
        <People value={person} onPick={(i) => onChange(withPerson(value, i))} />
        <Swatches label="Jacket" list={COATS} value={value.coat ?? 0} onPick={set("coat")} />
        <Swatches label="Trousers" list={LEGS} value={value.legs ?? 0} onPick={set("legs")} />
        <Chips label="Boots" list={FOOTWEAR} value={value.boots ?? 0} onPick={set("boots")} />
        <Chips label="Headwear" list={HATS} value={value.hat} onPick={set("hat")} />
        <div className="look-row look-pair">
          <Chips label="Life jacket" list={["No", "Yes"]} value={value.life ?? 0} onPick={set("life")} />
          <Chips label="Gloves" list={["No", "Yes"]} value={value.gloves ?? 0} onPick={set("gloves")} />
        </div>
        <p className="tiny muted">People: Microsoft Rocketbox (MIT licence).</p>
      </div>
    </div>
  );
}
