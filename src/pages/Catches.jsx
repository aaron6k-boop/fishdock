// ---- My Catches: the catch catalogue, personal bests, and what works for you ----
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { all, onChange, remove, isMemoryOnly } from "../lib/storage.js";
import { fmtDateTime, ukHour, MONTHS, ukMonth } from "../lib/time.js";
import { speciesById } from "../data/species.js";
import { rigById } from "../data/rigs.js";
import { Icon, Tabs, Sheet, Empty, Notice } from "../components/ui.jsx";
import { FishArt } from "../components/art.jsx";
import CatchForm, { fmtWeight } from "../components/CatchForm.jsx";
import { exportFile } from "../lib/files.js";

export default function Catches() {
  const { settings, say } = useApp();
  const [list, setList] = useState([]);
  const [tab, setTab] = useState("log");
  const [form, setForm] = useState(null); // "new" | catch
  const [open, setOpen] = useState(null);
  useEffect(() => { const load = () => all("catches").then((l) => setList(l.sort((a, b) => b.at - a.at))); load(); return onChange((s) => s === "catches" && load()); }, []);
  const species = new Set(list.map((c) => c.species)).size;
  const pbs = useMemo(() => personalBests(list), [list]);
  const u = settings.units;

  return (
    <main className="col">
      <div className="page-head"><h1>My Catches</h1><button type="button" className="btn primary small" onClick={() => setForm("new")}><Icon name="plus" />Log a catch</button></div>
      <div className="stats">
        <div className="stat"><b>{list.length}</b><span>catches</span></div>
        <div className="stat"><b>{species}</b><span>species</span></div>
        <div className="stat"><b>{pbs.length}</b><span>personal bests</span></div>
      </div>
      {isMemoryOnly() ? <Notice kind="warn">This browser isn't letting FishDock save to the phone, so catches last until you close it. Install FishDock or allow site data to keep them.</Notice> : null}
      <Tabs label="Catches sections" value={tab} onChange={setTab} options={[{ value: "log", label: "Log" }, { value: "pbs", label: "Personal bests" }, { value: "works", label: "What works" }]} />

      {tab === "log" ? (list.length ? (
        <section className="card"><div className="list">{list.map((c) => (
          <button type="button" key={c.id} className="li" onClick={() => setOpen(c)}>
            {c.photo ? <img src={c.photo} alt="" className="thumb" /> : <span className="fish-ico">{speciesById(c.species) ? <FishArt art={speciesById(c.species).art} size={40} /> : <Icon name="fish" />}</span>}
            <span className="grow"><span className="t">{c.speciesName}{c.lengthCm ? `, ${c.lengthCm} cm` : ""}{c.weightKg ? `, ${fmtWeight(c.weightKg, u.weight)}` : ""}</span><span className="s">{fmtDateTime(c.at)} · {c.place?.name}{c.bait ? ` · ${c.bait}` : ""}</span></span>
            <span className="end">{c.released ? <span className="tag ok">Released</span> : <span className="tag">Kept</span>}</span>
          </button>
        ))}</div></section>
      ) : <Empty title="No catches yet" action={<button type="button" className="btn primary" onClick={() => setForm("new")}>Log your first catch</button>}>Log a catch here or from Live Fishing. FishDock saves the tide, weather and BiteScore with it, so patterns show up over time.</Empty>) : null}

      {tab === "pbs" ? (pbs.length ? (
        <section className="card"><div className="list">{pbs.map((p) => (
          <div key={p.species} className="li static">
            <span className="fish-ico">{speciesById(p.species) ? <FishArt art={speciesById(p.species).art} size={40} /> : <Icon name="trophy" />}</span>
            <span className="grow"><span className="t">{p.name}</span><span className="s">{p.byWeight ? fmtWeight(p.byWeight.weightKg, u.weight) : ""}{p.byWeight && p.byLength ? " · " : ""}{p.byLength ? `${p.byLength.lengthCm} cm` : ""} · {p.count} caught</span></span>
            <Icon name="trophy" />
          </div>
        ))}</div></section>
      ) : <Empty icon="trophy" title="No personal bests yet">Add a length or weight when you log a catch.</Empty>) : null}

      {tab === "works" ? <WhatWorks list={list} /> : null}

      <section className="card">
        <h2 className="h2">Your data</h2>
        <p className="small muted">Catches stay on this phone. Exact positions are never shared unless you choose to.</p>
        <div className="row">
          <button type="button" className="btn small" onClick={async () => { const r = await exportFile("fishdock-catches.csv", toCsv(list), "text/csv"); say(r.ok ? "Exported" : r.message); }}><Icon name="download" />Export CSV</button>
          <button type="button" className="btn small" onClick={async () => { const r = await exportFile("fishdock-catches.json", JSON.stringify(list, null, 1), "application/json"); say(r.ok ? "Exported" : r.message); }}><Icon name="download" />Export JSON</button>
        </div>
      </section>

      {form ? <CatchForm existing={form === "new" ? null : form} onClose={() => setForm(null)} /> : null}
      {open ? <CatchDetail c={open} onClose={() => setOpen(null)} onEdit={() => { setForm(open); setOpen(null); }} /> : null}
    </main>
  );
}

export function personalBests(list) {
  const by = new Map();
  for (const c of list) {
    if (!c.species) continue;
    const p = by.get(c.species) || { species: c.species, name: c.speciesName, count: 0, byWeight: null, byLength: null };
    p.count++;
    if (c.weightKg && (!p.byWeight || c.weightKg > p.byWeight.weightKg)) p.byWeight = c;
    if (c.lengthCm && (!p.byLength || c.lengthCm > p.byLength.lengthCm)) p.byLength = c;
    by.set(c.species, p);
  }
  return [...by.values()].filter((p) => p.byWeight || p.byLength).sort((a, b) => b.count - a.count);
}

function countBy(list, f) {
  const m = new Map();
  for (const c of list) { const k = f(c); if (k == null || k === "") continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Bars({ rows, total }) {
  return <div className="bars">{rows.slice(0, 6).map(([k, n]) => <div key={k} className="bar-row"><span className="bl">{k}</span><span className="bt"><i style={{ width: `${(n / total) * 100}%` }} /></span><b className="num">{n}</b></div>)}</div>;
}

function WhatWorks({ list }) {
  if (list.length < 3) return <Empty icon="star" title="Log a few more catches">After three or more, FishDock shows which baits, tides and times have worked best for you.</Empty>;
  const baits = countBy(list, (c) => c.bait?.toLowerCase());
  const tides = countBy(list.filter((c) => c.conditions?.tide), (c) => c.conditions.tide);
  const hours = countBy(list, (c) => { const h = Math.floor(ukHour(c.at)); return h < 5 ? "Night (0–5)" : h < 9 ? "Dawn and morning (5–9)" : h < 16 ? "Day (9–16)" : h < 20 ? "Evening and dusk (16–20)" : "Night (20–24)"; });
  const rigs = countBy(list, (c) => (c.rig ? rigById(c.rig)?.name || c.rig : null));
  const months = Array.from({ length: 12 }, (_, i) => list.filter((c) => ukMonth(c.at) === i + 1).length);
  const max = Math.max(1, ...months);
  const scores = list.map((c) => c.conditions?.biteScore).filter((x) => x != null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return (
    <>
      <section className="card"><h2 className="h2">Baits that caught</h2>{baits.length ? <Bars rows={baits} total={list.length} /> : <p className="tiny">Add the bait when you log.</p>}</section>
      <section className="card"><h2 className="h2">Tide when you caught</h2>{tides.length ? <Bars rows={tides} total={list.length} /> : <p className="tiny">Tides are saved automatically at sea marks.</p>}</section>
      <section className="card"><h2 className="h2">Time of day</h2><Bars rows={hours} total={list.length} /></section>
      {rigs.length ? <section className="card"><h2 className="h2">Rigs</h2><Bars rows={rigs} total={list.length} /></section> : null}
      <section className="card">
        <h2 className="h2">Catches by month</h2>
        <div className="month-bars">{months.map((n, i) => <div key={i}><i style={{ height: `${(n / max) * 100}%` }} title={`${MONTHS[i]}: ${n}`} /><span>{MONTHS[i][0]}</span></div>)}</div>
      </section>
      {avgScore != null ? <p className="small muted">Your catches came at an average BiteScore of {avgScore}. As your log grows this shows whether BiteScore suits your fishing.</p> : null}
    </>
  );
}

function CatchDetail({ c, onClose, onEdit }) {
  const { settings, say } = useApp();
  const [confirm, setConfirm] = useState(false);
  const sp = speciesById(c.species);
  return (
    <Sheet title={c.speciesName} aside={fmtDateTime(c.at)} onClose={onClose}>
      {c.photo ? <img src={c.photo} alt={`Photo of the ${c.speciesName}`} className="id-photo" /> : sp ? <FishArt art={sp.art} size={220} /> : null}
      <div className="kv">
        {c.lengthCm ? <div><span className="k">Length</span><span className="v">{c.lengthCm} cm</span></div> : null}
        {c.weightKg ? <div><span className="k">Weight</span><span className="v">{fmtWeight(c.weightKg, settings.units.weight)}</span></div> : null}
        <div><span className="k">Place</span><span className="v">{c.place?.name}</span></div>
        {c.bait ? <div><span className="k">Bait</span><span className="v">{c.bait}</span></div> : null}
        {c.hook ? <div><span className="k">Hook</span><span className="v">{c.hook}</span></div> : null}
        {c.rig ? <div><span className="k">Rig</span><span className="v">{rigById(c.rig)?.name || c.rig}</span></div> : null}
        {c.depthM != null ? <div><span className="k">Depth</span><span className="v">{c.depthM} m</span></div> : null}
        {c.conditions?.tide ? <div><span className="k">Tide</span><span className="v">{c.conditions.tide}</span></div> : null}
        {c.conditions?.windKph != null ? <div><span className="k">Wind</span><span className="v">{Math.round(c.conditions.windKph * 0.621)} mph</span></div> : null}
        {c.conditions?.biteScore != null ? <div><span className="k">BiteScore then</span><span className="v">{c.conditions.biteScore}</span></div> : null}
        <div><span className="k">Released</span><span className="v">{c.released ? "Yes" : "No"}</span></div>
      </div>
      {c.notes ? <p className="small">{c.notes}</p> : null}
      <p className="tiny"><Icon name="lock" /> {c.pos ? "Exact position saved privately on this phone." : "No position saved."}</p>
      <div className="row">
        <button type="button" className="btn" onClick={onEdit}><Icon name="edit" />Edit</button>
        {!confirm ? <button type="button" className="btn ghost danger-text" onClick={() => setConfirm(true)}><Icon name="trash" />Delete</button>
          : <button type="button" className="btn danger" onClick={async () => { await remove("catches", c.id); say("Catch deleted"); onClose(); }}>Delete for good</button>}
      </div>
    </Sheet>
  );
}

function toCsv(list) {
  const cols = ["date", "species", "length_cm", "weight_kg", "bait", "hook", "rig", "method", "depth_m", "released", "place", "tide", "wind_kph", "pressure_hpa", "bitescore", "notes"];
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = list.map((c) => [new Date(c.at).toISOString(), c.speciesName, c.lengthCm, c.weightKg, c.bait, c.hook, c.rig, c.method, c.depthM, c.released, c.place?.name, c.conditions?.tide, c.conditions?.windKph, c.conditions?.pressureHpa, c.conditions?.biteScore, c.notes].map(esc).join(","));
  return [cols.join(","), ...rows].join("\n");
}
