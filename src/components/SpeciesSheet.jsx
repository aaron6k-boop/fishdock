// ---- Species profile: identification, season, habitat, feeding, bait, hooks, rigs, rules, conservation ----
import { useApp } from "../lib/store.js";
import { ukMonth } from "../lib/time.js";
import { rigById } from "../data/rigs.js";
import { rulesFor } from "../lib/rules.js";
import { track } from "../lib/api.js";
import { useEffect } from "react";
import { Sheet, MonthStrip, Sources, Notice, Icon } from "./ui.jsx";
import { FishArt, HookGlyph, WaterColumn } from "./art.jsx";

export default function SpeciesSheet({ species: sp, onClose }) {
  const { go, nation, place } = useApp();
  useEffect(() => { track(`species_view:${sp.id}`); }, [sp.id]);
  const month = ukMonth(Date.now());
  const legal = rulesFor({ nation, kind: sp.type === "fresh" ? "river" : "sea", date: Date.now(), speciesId: sp.id, place, speciesOnly: true });
  const firstHook = String(sp.hooks?.range || "").split(/[–-]/)[0]?.trim();
  return (
    <Sheet title={sp.name} aside={sp.latin} onClose={onClose}>
      <div className="species-hero">
        <FishArt art={sp.art} size={240} title={`Illustration of a ${sp.name.toLowerCase()}`} />
        <div className="row"><span className={`pill ${sp.type === "sea" ? "sea" : "fresh"}`}>{sp.type === "sea" ? "Sea" : sp.type === "both" ? "Sea and fresh" : "Freshwater"}</span>{sp.minSize?.cm ? <span className="chip warn">Min {sp.minSize.cm} cm</span> : null}</div>
      </div>
      <section className="card">
        <div className="card-h"><h2>Season</h2><span className="aside">{sp.peak?.includes(month) ? "Peak now" : sp.present?.includes(month) ? "In season" : "Scarce now"}</span></div>
        <MonthStrip peak={sp.peak} present={sp.present} current={month} />
        {sp.bestTimes ? <p className="small"><b>Best times:</b> {sp.bestTimes}</p> : null}
        {sp.tempC ? <p className="small muted"><b>Water temperature:</b> {sp.tempC.text}</p> : null}
      </section>
      <section className="card">
        <h2 className="h2">Where and how it lives</h2>
        {sp.habitat ? <p className="small"><b>Habitat:</b> {sp.habitat}</p> : null}
        {sp.depth ? <p className="small"><b>Depth:</b> {sp.depth}</p> : null}
        {sp.behaviour ? <p className="small"><b>Feeding:</b> {sp.behaviour}</p> : null}
      </section>
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
        <p className="tiny">The picture above is an illustration. Use photos and records from NBN Atlas to confirm an ID.</p>
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
