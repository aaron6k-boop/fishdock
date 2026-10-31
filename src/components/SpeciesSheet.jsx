// ---- Species profile: identification, season, habitat, feeding, bait, hooks, rigs, rules, conservation ----
import { useApp } from "../lib/store.js";
import { ukMonth } from "../lib/time.js";
import { rigById } from "../data/rigs.js";
import { SPOTS } from "../data/spots.js";
import { LESSONS } from "../data/lessons.js";
import { rulesFor } from "../lib/rules.js";
import { LEVELS } from "../lib/catchhere.js";
import { distanceKm, fmtKm } from "../lib/geo.js";
import { track } from "../lib/api.js";
import { useEffect, useMemo, useState } from "react";
import { Sheet, MonthStrip, Sources, Notice, Icon } from "./ui.jsx";
import { HookGlyph, WaterColumn } from "./art.jsx";
import FishPhoto, { useFishInfo, AboutFish } from "./FishPhoto.jsx";

export default function SpeciesSheet({ species: sp, onClose, onPicked }) {
  const { go, nation, place } = useApp();
  useEffect(() => { track(`species_view:${sp.id}`); }, [sp.id]);
  const month = ukMonth(Date.now());
  const legal = rulesFor({ nation, kind: sp.type === "fresh" ? "river" : "sea", date: Date.now(), speciesId: sp.id, place, speciesOnly: true });
  const firstHook = String(sp.hooks?.range || "").split(/[–-]/)[0]?.trim();
  const info = useFishInfo(sp.id);
  return (
    <Sheet title={sp.name} aside={sp.latin} onClose={onClose}>
      <div className="species-hero">
        <FishPhoto species={sp} info={info} size={240} />
        <div className="row"><span className={`pill ${sp.type === "sea" ? "sea" : "fresh"}`}>{sp.type === "sea" ? "Sea" : sp.type === "both" ? "Sea and fresh" : "Freshwater"}</span>{sp.minSize?.cm ? <span className="chip warn">Min {sp.minSize.cm} cm</span> : null}</div>
      </div>
      <section className="card">
        <div className="card-h"><h2>Season</h2><span className="aside">{sp.peak?.includes(month) ? "Peak now" : sp.present?.includes(month) ? "In season" : "Scarce now"}</span></div>
        <MonthStrip peak={sp.peak} present={sp.present} current={month} />
        {sp.bestTimes ? <p className="small"><b>Best times:</b> {sp.bestTimes}</p> : null}
        {sp.tempC ? <p className="small muted"><b>Water temperature:</b> {sp.tempC.text}</p> : null}
      </section>
      <SizesCard sp={sp} />
      <AboutFish info={info} />
      <section className="card">
        <h2 className="h2">Where and how it lives</h2>
        {sp.habitat ? <p className="small"><b>Habitat:</b> {sp.habitat}</p> : null}
        {sp.depth ? <p className="small"><b>Depth:</b> {sp.depth}</p> : null}
        {sp.behaviour ? <p className="small"><b>Feeding:</b> {sp.behaviour}</p> : null}
      </section>
      <WhereToCatch sp={sp} onClose={onPicked || onClose} />
      <Guides sp={sp} />
      <section className="card">
        <div className="card-h"><h2>Bait, hooks and presentation</h2></div>
        <div className="advice-mini">
          <div className="am-hook"><HookGlyph size={firstHook || "4"} /><div><b>{sp.hooks?.range ? `Size ${sp.hooks.range}` : "See rig"}</b><span>{sp.hooks?.pattern}</span></div></div>
          {sp.presentation?.zone ? <WaterColumn zone={sp.presentation.zone} kind={sp.type === "sea" ? "sea" : "fresh"} /> : null}
        </div>
        {sp.baits?.natural?.length ? <div className="stack"><span className="eyebrow">Natural baits</span><div className="chips">{sp.baits.natural.map((b) => <span className="chip" key={b.name}>{b.name}</span>)}</div></div> : null}
        {sp.baits?.artificial?.length ? <div className="stack"><span className="eyebrow">Lures and flies</span><div className="chips">{sp.baits.artificial.map((b) => <span className="chip tide" key={b.name}>{b.name}</span>)}</div></div> : null}
        {sp.rigs?.length ? <div className="stack"><span className="eyebrow">Rigs</span><div className="chips">{sp.rigs.map((id) => rigById(id)).filter(Boolean).map((r) => <span className="chip" key={r.id}>{r.name}</span>)}</div></div> : null}
        <button type="button" className="btn primary block" onClick={() => { onClose(); go("tackle", { species: sp.id }); }}><Icon name="hook" />Full bait and rig advice</button>
      </section>
      <section className="card">
        <h2 className="h2">Identification</h2>
        {sp.idTip ? <p className="small">{sp.idTip}</p> : null}
        {sp.lookalikes ? <p className="small muted"><b>Don't confuse with:</b> {sp.lookalikes}</p> : null}
        <a className="btn small" href={`https://species.nbnatlas.org/search?q=${encodeURIComponent(sp.latin || sp.name)}`} target="_blank" rel="noopener noreferrer">Photos and UK records on NBN Atlas</a>
        <p className="tiny">{info?.photo ? "Check the photo against the ID notes: colours vary with size, season and water." : "The picture above is an illustration. Use photos and records from NBN Atlas to confirm an ID."}</p>
      </section>
      {legal.length || sp.conservation ? (
        <section className="card">
          <h2 className="h2">Rules and conservation</h2>
          {legal.map((n, i) => <Notice key={i} kind={n.level === "legal" ? "warn" : ""}><b>{n.title}.</b> {n.text} {n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer">Details</a> : null}</Notice>)}
          {sp.conservation ? <p className="small muted">{sp.conservation}</p> : null}
        </section>
      ) : null}
      <Sources list={sp.sources} />
    </Sheet>
  );
}

// ---- where to catch it: documented marks that name this species, nearest first, by kind of water ----
const waterGroup = (s) => (s.kind === "sea" ? "sea" : s.kind === "river" ? "river" : "still");
const GROUPS = [["all", "All"], ["river", "Rivers"], ["still", "Lakes and canals"], ["sea", "Sea"]];

function WhereToCatch({ sp, onClose }) {
  const { place, update, say, go } = useApp();
  const marks = useMemo(() => SPOTS
    .map((s) => ({ s, rec: (s.species || []).find((x) => x.id === sp.id) }))
    .filter((x) => x.rec)
    .map((x) => ({ ...x, d: distanceKm(place, x.s) }))
    .sort((a, b) => a.d - b.d), [sp.id, place]);
  const groups = GROUPS.filter(([g]) => g === "all" || marks.some((m) => waterGroup(m.s) === g));
  const [g, setG] = useState("all");
  const [more, setMore] = useState(false);
  const list = marks.filter((m) => g === "all" || waterGroup(m.s) === g);
  return (
    <section className="card">
      <div className="card-h"><h2>Where to catch {sp.name.toLowerCase()}</h2><span className="aside">{marks.length ? `${marks.length} documented marks` : ""}</span></div>
      {groups.length > 2 ? <div className="chips">{groups.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={g === k} onClick={() => { setG(k); setMore(false); }}>{l}</button>)}</div> : null}
      {list.length ? (
        <div className="list">{list.slice(0, more ? 100 : 6).map(({ s, rec, d }) => (
          <button key={s.id} type="button" className="li" onClick={() => { update({ placeId: s.id }); say(`Fishing at ${s.name}`); onClose(); go("home"); }}>
            <span className={`pill ${s.kind === "sea" ? "sea" : "fresh"}`}>{s.kind === "river" ? "River" : s.kind === "sea" ? s.subtype || "Sea" : "Still"}</span>
            <span className="grow"><span className="t">{s.name}</span><span className="s">{LEVELS[rec.level]?.short || ""}{rec.note ? ` · ${rec.note}` : ` · ${s.region}`}</span></span>
            <span className="end tiny num">{fmtKm(d)}</span>
          </button>
        ))}</div>
      ) : <p className="small muted">No documented mark names {sp.name.toLowerCase()} yet. Tap any water on the Explore map to see what's likely there.</p>}
      {list.length > 6 && !more ? <button type="button" className="linkbtn" onClick={() => setMore(true)}>Show all {list.length}</button> : null}
      <p className="tiny">Nearest to {place.name} first. Tap one to fish there. Notes marked "river-wide" come from reports about the whole river, not that stretch.</p>
    </section>
  );
}

// ---- guides from the Learn tab that are about this species ----
function Guides({ sp }) {
  const [open, setOpen] = useState(null);
  const list = LESSONS.filter((l) => l.species?.includes(sp.id));
  if (!list.length) return null;
  return (
    <section className="card">
      <h2 className="h2">Guides</h2>
      <div className="list">{list.map((l) => (
        <button key={l.id} type="button" className="li" onClick={() => setOpen(l)}>
          <Icon name="book" /><span className="grow"><span className="t">{l.title}</span><span className="s">{l.steps.length} tips · about {l.minutes} min</span></span><Icon name="chevron" className="go" />
        </button>
      ))}</div>
      {open ? (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <ol className="guide-steps">{open.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
          {open.note ? <p className="tiny">{open.note}</p> : null}
          <Sources list={open.sources || []} />
        </Sheet>
      ) : null}
    </section>
  );
}

// ---- sizes: the legal minimum (sourced) and what the hook advice says about bigger fish ----
function SizesCard({ sp }) {
  if (!sp.minSize?.cm && !sp.hooks?.specimen && !sp.hooks?.small) return null;
  return (
    <section className="card">
      <h2 className="h2">Sizes</h2>
      {sp.minSize?.cm ? <p className="small"><b>Minimum size:</b> {sp.minSize.text || `${sp.minSize.cm} cm`} {sp.minSize.source ? <a href={sp.minSize.source} target="_blank" rel="noopener noreferrer">Source</a> : null}</p> : <p className="small muted">No minimum size in FishDock's sources; local or fishery rules may set one.</p>}
      {sp.hooks?.small ? <p className="small"><b>Typical fish:</b> {sp.hooks.small}</p> : null}
      {sp.hooks?.specimen ? <p className="small"><b>Bigger fish:</b> {sp.hooks.specimen}</p> : null}
    </section>
  );
}
