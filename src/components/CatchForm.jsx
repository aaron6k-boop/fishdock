// ---- Log a catch: species, size, photo, bait, hook, rig, depth, conditions and position (private by default) ----
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { put, newId, shrinkImage } from "../lib/storage.js";
import { conditionsAt, biteDay } from "../lib/bitescore.js";
import { track } from "../lib/api.js";
import { ukDayStart } from "../lib/time.js";
import { SPECIES, speciesById } from "../data/species.js";
import { RIGS } from "../data/rigs.js";
import { MIN_SIZES, BASS_RULES } from "../data/rules.js";
import { Sheet, Notice, Icon, Seg } from "./ui.jsx";
import IdentifySheet from "./IdentifySheet.jsx";

export const toCm = (v, unit) => (v == null || v === "" ? null : unit === "in" ? +(Number(v) * 2.54).toFixed(1) : Number(v));
export const toKg = (lb, oz, kg, unit) => (unit === "kg" ? (kg === "" ? null : Number(kg)) : lb === "" && oz === "" ? null : +(((Number(lb) || 0) + (Number(oz) || 0) / 16) * 0.45359237).toFixed(3));
export function fmtWeight(kg, unit) {
  if (kg == null) return "";
  if (unit === "kg") return `${kg.toFixed(2)} kg`;
  const tot = kg / 0.45359237, lb = Math.floor(tot), oz = Math.round((tot - lb) * 16);
  return oz === 16 ? `${lb + 1} lb` : `${lb} lb ${oz} oz`;
}
export function minSizeFor(id) {
  if (id === "bass") return BASS_RULES?.minCm || 42;
  return (MIN_SIZES || []).find((m) => m.id === id)?.cm || null;
}

export default function CatchForm({ onClose, existing, session, onSaved, gps }) {
  const { place, settings, live, tide, say } = useApp();
  const units = settings.units;
  const [f, setF] = useState(() => existing ? { ...existing, lengthIn: existing.lengthCm ?? "" } : {
    species: settings.target !== "auto" ? settings.target : session?.species || "", at: Date.now(), length: "", lb: "", oz: "", kg: "",
    bait: "", hook: "", rig: "", depthM: "", released: true, notes: "", photo: null, method: session?.method || "",
  });
  const [idOpen, setIdOpen] = useState(false);
  const fileRef = useRef(null);
  const sp = speciesById(f.species);
  const lenCm = existing && f.length === "" ? existing.lengthCm : toCm(f.length, units.length);
  const min = minSizeFor(f.species);
  const under = min && lenCm && lenCm < min;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));
  const sorted = useMemo(() => [...SPECIES].sort((a, b) => a.name.localeCompare(b.name)), []);

  async function addPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const s = await shrinkImage(file, 1280, 0.8);
    setF((x) => ({ ...x, photo: s.dataUrl }));
  }

  async function save() {
    const t = Number(f.at) || Date.now();
    const c = conditionsAt(live.cond?.hourly?.length ? live.cond : null, t);
    const tst = tide?.stateAt(t);
    let score = null;
    if (sp) { try { const d = biteDay({ place, species: sp, dayStart: ukDayStart(t), tide, cond: live.cond }); score = d.slots.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)).score; } catch { /* ignore */ } }
    const rec = {
      id: existing?.id || newId("catch"), kind: "catch", at: t,
      species: f.species || null, speciesName: sp?.name || f.speciesOther || "Unknown",
      lengthCm: lenCm ?? null, weightKg: existing && f.lb === "" && f.oz === "" && f.kg === "" ? existing.weightKg ?? null : toKg(f.lb, f.oz, f.kg, units.weight),
      bait: f.bait || null, hook: f.hook || null, rig: f.rig || null, method: f.method || null, depthM: f.depthM === "" ? null : Number(f.depthM),
      released: !!f.released, notes: f.notes || "", photo: f.photo || null,
      place: existing?.place || { id: place.id, name: place.name, kind: place.kind, region: place.region || null },
      pos: existing?.pos || (settings.privacy.saveGps && gps ? gps : null),
      conditions: existing?.conditions || { windKph: c?.windKph ?? null, windDir: c?.windDir ?? null, pressureHpa: c?.pressureHpa ?? null, tempC: c?.tempC ?? null, waveM: c?.waveM ?? null, tide: tst?.phase || null, tideFlooding: tst?.flooding ?? null, biteScore: score },
      sessionId: existing?.sessionId || session?.id || null, private: true,
      createdAt: existing?.createdAt || Date.now(),
    };
    await put("catches", rec);
    if (!existing) track("catch_logged");
    say(existing ? "Catch updated" : "Catch logged");
    onSaved?.(rec);
    onClose();
  }

  const dt = new Date(Number(f.at) || Date.now());
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <Sheet title={existing ? "Edit catch" : "Log a catch"} aside="Private to you unless you share it" onClose={onClose}>
      <div className="field">
        <label htmlFor="c-species">Species</label>
        <div className="row nowrap">
          <select id="c-species" className="input" value={f.species} onChange={set("species")}>
            <option value="">Choose…</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="btn small" onClick={() => setIdOpen(true)}><Icon name="camera" />AI ID</button>
        </div>
      </div>
      <div className="split">
        <div className="field"><label htmlFor="c-len">Length ({units.length})</label><input id="c-len" className="input" inputMode="decimal" value={f.length} onChange={set("length")} placeholder={existing?.lengthCm ? String(existing.lengthCm) : ""} /></div>
        {units.weight === "kg"
          ? <div className="field"><label htmlFor="c-kg">Weight (kg)</label><input id="c-kg" className="input" inputMode="decimal" value={f.kg} onChange={set("kg")} /></div>
          : <div className="field"><span className="lbl">Weight</span><div className="row nowrap"><input id="c-lb" aria-label="Pounds" className="input" inputMode="numeric" placeholder="lb" value={f.lb} onChange={set("lb")} /><input id="c-oz" aria-label="Ounces" className="input" inputMode="numeric" placeholder="oz" value={f.oz} onChange={set("oz")} /></div></div>}
      </div>
      {under ? (f.species === "bass"
        ? <Notice kind="danger"><b>Under the legal minimum size (42 cm).</b> Return it to the water quickly and carefully.</Notice>
        : <Notice kind="warn"><b>Under {min} cm,</b> the minimum size in some districts. Check your local size, and return it if in doubt.</Notice>) : null}
      {f.species === "eel" ? <Notice kind="warn">All eels caught on rod and line must be returned alive in England and Wales.</Notice> : null}
      <label className="toggle" htmlFor="c-rel"><span>Released</span><input id="c-rel" type="checkbox" checked={f.released} onChange={set("released")} /></label>
      <div className="split">
        <div className="field"><label htmlFor="c-bait">Bait or lure</label><input id="c-bait" className="input" value={f.bait} onChange={set("bait")} list="bait-list" /></div>
        <div className="field"><label htmlFor="c-hook">Hook size and type</label><input id="c-hook" className="input" value={f.hook} onChange={set("hook")} placeholder="e.g. 2/0 Aberdeen" /></div>
      </div>
      <div className="split">
        <div className="field"><label htmlFor="c-rig">Rig</label><select id="c-rig" className="input" value={f.rig} onChange={set("rig")}><option value="">Not recorded</option>{RIGS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="field"><label htmlFor="c-depth">Water depth (m, if known)</label><input id="c-depth" className="input" inputMode="decimal" value={f.depthM} onChange={set("depthM")} /></div>
      </div>
      <div className="field"><label htmlFor="c-at">When</label><input id="c-at" type="datetime-local" className="input" value={local} onChange={(e) => setF((x) => ({ ...x, at: new Date(e.target.value).getTime() || Date.now() }))} /></div>
      <div className="field"><label htmlFor="c-notes">Notes</label><textarea id="c-notes" className="input" value={f.notes} onChange={set("notes")} placeholder="Where in the swim, how it took the bait…" /></div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={addPhoto} id="c-photo" />
      <div className="row">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="camera" />{f.photo ? "Change photo" : "Add photo"}</button>
        {f.photo ? <img src={f.photo} alt="" className="thumb" /> : null}
      </div>
      <p className="tiny">Photos are resized on your phone and their location data is removed. Tide, weather and BiteScore are saved with the catch automatically.</p>
      <button type="button" className="btn primary block" onClick={save} disabled={!f.species}>{existing ? "Save changes" : "Save catch"}</button>
      <datalist id="bait-list">{(sp?.baits?.natural || []).map((b) => <option key={b.name} value={b.name} />)}</datalist>
      {idOpen ? <IdentifySheet onClose={() => setIdOpen(false)} onPick={(id) => { setF((x) => ({ ...x, species: id })); setIdOpen(false); }} /> : null}
    </Sheet>
  );
}
