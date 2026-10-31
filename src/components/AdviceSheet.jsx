// ---- AdviceSheet: one fish at one place. How you'd normally catch it there: bait, hook, rig, where to cast, when,
// what local marks say about its timing, and the rules. Built from the same sourced data as the Advisor. ----
import { useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { buildAdvice, METHODS } from "../lib/advisor.js";
import { seasonWord, LEVELS } from "../lib/catchhere.js";
import { SPOTS } from "../data/spots.js";
import { distanceKm, fmtKm } from "../lib/geo.js";
import { monthsText, ukMonth } from "../lib/time.js";
import TodayCard from "./TodayCard.jsx";
import SpeciesSheet from "./SpeciesSheet.jsx";
import { RigSheet } from "../pages/Tackle.jsx";
import GearCard, { ShopLinks, VideoLink } from "./GearCard.jsx";
import { rigQuery } from "../data/shops.js";
import { Sheet, Notice, Sources, Icon, Seg } from "./ui.jsx";
import { HookGlyph, RigDiagram } from "./art.jsx";
import FishPhoto, { useFishInfo, AboutFish } from "./FishPhoto.jsx";


/** species: a species record. spot: the place ({ lat, lon, kind, subtype, name, verified, best? }). row: its catchHere row. */
export default function AdviceSheet({ species: sp, spot, row = null, onClose }) {
  const { nation } = useApp();
  const [profile, setProfile] = useState(false);
  const [rigOpen, setRigOpen] = useState(null);
  const info = useFishInfo(sp.id);
  const sea = spot.kind === "sea";
  // The size you're after and the conditions on the day change the hook, bait and tactics.
  const [cond, setCond] = useState({ size: "average", sea: "moderate", clarity: "slight", flow: "normal", tide: "", snags: "clean" });
  const set = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));
  const a = useMemo(() => buildAdvice({ place: spot, species: sp, method: "auto", cond, nation }), [spot, sp, nation, cond]);
  // What documented marks in the area say about this fish: local timing beats the UK-wide season.
  const local = useMemo(() => SPOTS
    .map((s) => ({ s, rec: (s.species || []).find((x) => x.id === sp.id), d: distanceKm(spot, s) }))
    .filter((x) => x.rec && x.d <= 25 && (x.s.kind === "sea") === (spot.kind === "sea"))
    .sort((x, y) => x.d - y.d).slice(0, 3), [sp.id, spot]);
  const month = ukMonth(Date.now());
  const season = sp.peak?.includes(month) ? "Peak season now" : sp.present?.includes(month) ? "In season now" : "Out of season now";
  if (!a) return null;
  const hookFirst = String(a.hook.range || "").split(/[–-]/)[0]?.trim();
  const method = METHODS[a.method]?.label || "";
  return (
    <Sheet title={sp.name} aside={`at ${spot.name}`} onClose={onClose}>
      <FishPhoto species={sp} info={info} size={220} />
      <div className="advice-top">
        <div className="stack" style={{ gap: 4 }}>
          <span className={`tiny season-${sp.peak?.includes(month) ? "peak" : sp.present?.includes(month) ? "present" : "out"}`}><b>{season}</b></span>
          <span className="small">{seasonWord(sp)}{sp.peak?.length ? `, best ${monthsText(sp.peak)}` : ""}</span>
          {row ? <span className={`lvl lvl-${row.level}`}>{LEVELS[row.level].label}</span> : null}
          {method ? <span className="small muted">Usually: {method.toLowerCase()}</span> : null}
        </div>
      </div>

      <section className="card">
        <h2 className="h2">What are you after?</h2>
        <div className="cond-row"><span>Fish size</span><Seg label="Fish size" value={cond.size} onChange={set("size")} options={[{ value: "average", label: "Typical" }, { value: "specimen", label: "Big fish" }]} /></div>
        {sea ? <div className="cond-row"><span>Sea</span><Seg label="Sea" value={cond.sea} onChange={set("sea")} options={["calm", "moderate", "rough"]} /></div>
          : <div className="cond-row"><span>Flow</span><Seg label="Flow" value={cond.flow} onChange={set("flow")} options={["low", "normal", "high"]} /></div>}
        <div className="cond-row"><span>Water</span><Seg label="Water colour" value={cond.clarity} onChange={set("clarity")} options={[{ value: "clear", label: "Clear" }, { value: "slight", label: "Slight colour" }, { value: "coloured", label: "Coloured" }]} /></div>
        <div className="cond-row"><span>Bottom</span><Seg label="Bottom" value={cond.snags} onChange={set("snags")} options={[{ value: "clean", label: "Clean" }, { value: "snaggy", label: "Snaggy" }]} /></div>
      </section>

      {sp.bestTimes || sp.behaviour ? (
        <section className="card">
          <h2 className="h2">How it feeds</h2>
          {sp.bestTimes ? <p className="small"><b>Best times:</b> {sp.bestTimes}</p> : null}
          {sp.behaviour ? <p className="small"><b>Behaviour:</b> {sp.behaviour}</p> : null}
          {sp.tempC ? <p className="small muted"><b>Water temperature:</b> {sp.tempC.text}</p> : null}
        </section>
      ) : null}

      {local.length ? (
        <section className="card">
          <h2 className="h2">What local marks say</h2>
          <div className="list">{local.map(({ s, rec, d }) => (
            <div key={s.id} className="li static">
              <span className="grow"><span className="t">{s.name}</span><span className="s">{fmtKm(d)} · {LEVELS[rec.level]?.label || ""}{rec.note ? ` · ${rec.note}` : ""}</span></span>
            </div>
          ))}</div>
          <p className="tiny">Timing at nearby documented marks, from their published sources. It can differ from the UK-wide season above.</p>
        </section>
      ) : null}

      <TodayCard spot={spot} here={[]} species={sp} />

      <section className="card">
        <h2 className="h2">Best bait</h2>
        {a.bait.primary ? <p><b className="big">{a.bait.primary.name}</b>{a.bait.primary.note ? <span className="small muted"> · {a.bait.primary.note}</span> : null}</p>
          : a.bait.artificial.length ? <p className="small"><b>Usually caught on lures or flies:</b></p> : <p className="small muted">No sourced bait list yet for this fish.</p>}
        {a.bait.size ? <p className="small"><b>How much:</b> {a.bait.size}</p> : null}
        {a.bait.prep ? <p className="small"><b>How to hook it:</b> {a.bait.prep}</p> : null}
        {a.bait.alternatives.length ? <div className="chips">{a.bait.alternatives.map((b) => <span key={b.name} className="chip">{b.name}</span>)}</div> : null}
        {a.bait.artificial.length ? <div className="chips">{a.bait.artificial.map((b) => <span key={b.name} className="chip tide">{b.name}</span>)}</div> : null}
      </section>

      <section className="card">
        <h2 className="h2">Hook and rig</h2>
        <div className="hook-row"><HookGlyph size={hookFirst || ""} /><div><b className="big">{a.hook.range ? `Size ${a.hook.range}` : "Hook size not sourced"}</b><span>{a.hook.pattern || (a.hook.range ? "" : "No source gives a size for this fish")}</span></div></div>
        {a.hook.rigNote ? <p className="small muted"><b>The rig guide's sizes (for other fish):</b> {a.hook.rigNote}</p> : null}
        {a.hook.size ? <p className="small"><b>{cond.size === "specimen" ? "For big fish" : "For typical fish"}:</b> {a.hook.size}</p> : cond.size === "specimen" ? <p className="small muted">No separate big-fish hook advice in the sources for this fish: go up a size with a bigger bait.</p> : null}
        {a.hook.why ? <p className="small muted">{a.hook.why}</p> : null}
        {a.hook.barbless ? <p className="small"><b>Barbless:</b> {a.hook.barbless}</p> : null}
        {a.rig ? (
          <button type="button" className="rig-card" onClick={() => setRigOpen(a.rig)}>
            <RigDiagram rig={a.rig} compact />
            <span className="t">{a.rig.name}</span>
            <span className="s">Tap for step by step and how to bait it</span>
          </button>
        ) : null}
        {a.rig ? <div className="rig-links"><VideoLink rig={a.rig} /><ShopLinks q={rigQuery(a.rig)} label={a.rig.name} /></div> : null}
        {a.line ? <p className="small"><b>Line:</b> {a.line}</p> : null}
        {a.weight ? <p className="small"><b>Lead or float:</b> {a.weight}</p> : null}
      </section>

      <GearCard species={sp} advice={a} />

      <section className="card">
        <h2 className="h2">Where to cast</h2>
        {a.where.text ? <p className="small">{a.where.text}</p> : null}
        {a.distance ? <p className="small"><b>Distance:</b> {a.distance}</p> : null}
        {sp.depth ? <p className="small"><b>Depth:</b> {sp.depth}</p> : null}
        {a.presentation.text ? <p className="small"><b>Presentation:</b> {a.presentation.text}</p> : null}
        <p className="tiny">{a.where.verified ? `From published notes on ${spot.name}.` : "General guidance for this fish, not about this exact spot. Cast Advisor (Beta) can suggest spots from a photo of the water."}</p>
      </section>

      {a.adjust.length ? (
        <section className="card">
          <h2 className="h2">If things change</h2>
          {a.adjust.map((x, i) => <p key={i} className="small"><b>{x.if}:</b> {x.then}</p>)}
        </section>
      ) : null}

      {a.legal.length ? (
        <section className="card">
          <h2 className="h2">Rules</h2>
          {a.legal.map((n, i) => <Notice key={i} kind={n.level === "legal" || n.level === "warn" ? "warn" : ""}><b>{n.title}.</b> {n.text} {n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer">Details</a> : null}</Notice>)}
        </section>
      ) : null}

      {sp.minSize?.cm && !a.legal.some((n) => /minimum size/i.test(n.title)) ? <Notice kind="warn"><b>Minimum size:</b> {sp.minSize.text || `${sp.minSize.cm} cm`} {sp.minSize.source ? <a href={sp.minSize.source} target="_blank" rel="noopener noreferrer">Source</a> : null}</Notice> : null}
      <AboutFish info={info} />
      <button type="button" className="btn block" onClick={() => setProfile(true)}><Icon name="book" />Full {sp.name.toLowerCase()} profile</button>
      <Sources list={a.sources} />
      {profile ? <SpeciesSheet species={sp} onClose={() => setProfile(false)} onPicked={() => { setProfile(false); onClose(); }} /> : null}
      {rigOpen ? <RigSheet rig={rigOpen} onClose={() => setRigOpen(null)} /> : null}
    </Sheet>
  );
}
