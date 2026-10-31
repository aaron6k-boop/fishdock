// ---- Bait & Rigs: the Bait & Tackle Advisor, the rig library, knots and baits ----
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { buildAdvice, methodsFor, METHODS } from "../lib/advisor.js";
import { biteDay, band } from "../lib/bitescore.js";
import { catchHere, LEVELS, autoTarget } from "../lib/catchhere.js";
import { ukDayStart, ukMonth, fmtTime } from "../lib/time.js";
import { track, sendFeedback } from "../lib/api.js";
import { all as allRecords } from "../lib/storage.js";
import { SPECIES } from "../data/species.js";
import { RIGS, rigById } from "../data/rigs.js";
import { KNOTS } from "../data/knots.js";
import { BAITS } from "../data/baits.js";
import { LESSONS } from "../data/lessons.js";
import { WATERS, waterById } from "../lib/pins.js";
import { Icon, Tabs, Seg, Sheet, Notice, Sources } from "../components/ui.jsx";
import { HookGlyph, RigDiagram, WaterColumn } from "../components/art.jsx";
import { KitIcon } from "../components/RigScene.jsx";
import GearCard, { ShopLinks } from "../components/GearCard.jsx";
import BaitPhoto, { BaitThumb } from "../components/BaitPhoto.jsx";
import { rigQuery, baitQuery } from "../data/shops.js";
import { FishThumb } from "../components/FishPhoto.jsx";

const VER = { verified: "Sourced", partial: "Partly sourced", unverified: "General guidance" };

export default function Tackle() {
  const { nav, place } = useApp();
  const [tab, setTab] = useState("advisor");
  // Sea or freshwater for the whole page: starts from the species asked for, else the current place
  const navType = nav?.species ? SPECIES.find((s) => s.id === nav.species)?.type : null;
  const [water, setWater] = useState(navType === "sea" || navType === "fresh" ? navType : place.kind === "sea" ? "sea" : "fresh");
  return (
    <main className="col">
      <div className="page-head"><h1>Bait & Rigs</h1></div>
      <div className="water-switch" role="group" aria-label="Sea or freshwater">
        {[["sea", "Sea", "wave"], ["fresh", "Freshwater", "river"]].map(([v, l, ic]) => (
          <button key={v} type="button" aria-pressed={water === v} onClick={() => setWater(v)}><Icon name={ic} />{l}</button>
        ))}
      </div>
      <Tabs label="Bait and rigs sections" value={tab} onChange={setTab} options={[{ value: "advisor", label: "Advisor" }, { value: "rigs", label: "Rigs" }, { value: "knots", label: "Knots" }, { value: "baits", label: "Baits" }, { value: "learn", label: "Learn" }]} />
      {tab === "advisor" ? <Advisor key={water} water={water} initialSpecies={nav?.species} /> : null}
      {tab === "rigs" ? <RigLibrary water={water} /> : null}
      {tab === "knots" ? <KnotLibrary /> : null}
      {tab === "baits" ? <BaitLibrary water={water} /> : null}
      {tab === "learn" ? <Lessons water={water} /> : null}
    </main>
  );
}

// ---- Advisor ----
function Advisor({ water, initialSpecies }) {
  const { place: current, nation, tide: currentTide, live: currentLive, settings, update, say, openPicker } = useApp();
  const month = ukMonth(Date.now());
  // Your place when it matches the switch; otherwise general advice for a chosen water type near you
  const matches = (current.kind === "sea") === (water === "sea");
  const [generic, setGeneric] = useState(water === "sea" ? "beach" : "river");
  const place = useMemo(() => {
    if (matches) return current;
    const w = waterById(generic);
    return { id: `any-${w.id}`, name: `Any ${w.label.toLowerCase()}`, lat: current.lat, lon: current.lon, nation: current.nation, kind: w.kind, subtype: w.id, verified: false, generic: true };
  }, [matches, current, generic]);
  const tide = matches ? currentTide : null;
  const live = matches ? currentLive : {};
  const sea = place.kind === "sea";
  const here = useMemo(() => catchHere(place, month), [place, month]);
  const pool = useMemo(() => {
    const ids = new Set(here.map((r) => r.species.id));
    return [...here.map((r) => r.species), ...SPECIES.filter((s) => !ids.has(s.id) && (sea ? s.type !== "fresh" : s.type !== "sea"))];
  }, [here, sea]);
  const fits = (id) => pool.some((s) => s.id === id);
  const [sid, setSid] = useState([initialSpecies, settings.target !== "auto" ? settings.target : null, autoTarget(place, month)?.id].find((id) => id && fits(id)) || pool[0]?.id);
  const species = SPECIES.find((s) => s.id === sid) || pool[0];
  const methods = species ? methodsFor(species, place) : [];
  const [method, setMethod] = useState("auto");
  const [cond, setCond] = useState({ tide: tide?.stateAt(Date.now())?.flooding ? "flooding" : sea ? "ebbing" : "", sea: "moderate", clarity: "slight", flow: "normal", snags: "clean", size: "average" });
  useEffect(() => { setMethod("auto"); }, [sid]);
  useEffect(() => { if (species) track(`advisor_run:${species.id}`); }, [species?.id]);

  const dayStart = ukDayStart(Date.now());
  const day = useMemo(() => species ? biteDay({ place, species, dayStart, tide, cond: live.cond?.hourly?.length ? live.cond : null, river: live.river?.source ? live.river : null }) : null, [place, species, dayStart, tide, live.cond, live.river]);
  const a = useMemo(() => species ? buildAdvice({ place, species, method, cond, nation, windows: day?.windows }) : null, [place, species, method, cond, nation, day]);
  const [rigOpen, setRigOpen] = useState(null);
  const [report, setReport] = useState(false);
  const [mine, setMine] = useState([]);
  useEffect(() => { allRecords("catches").then(setMine).catch(() => {}); }, []);
  const myLog = useMemo(() => {
    const list = mine.filter((c) => c.species === species?.id);
    if (list.length < 2) return null;
    const top = (f) => { const m = {}; for (const c of list) { const k = f(c); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1])[0] || null; };
    return { n: list.length, bait: top((c) => c.bait?.toLowerCase()), tide: top((c) => c.conditions?.tide), hook: top((c) => c.hook) };
  }, [mine, species?.id]);
  const set = (k) => (v) => setCond((c) => ({ ...c, [k]: v }));

  const saved = settings.savedSetups || [];
  if (!species) return <Notice>Choose a place first.</Notice>;
  const lvl = a?.here ? LEVELS[a.here.level] : null;
  const hookFirst = String(a?.hook.range || "").split(/[–-]/)[0]?.trim() || "4";

  return (
    <>
      <section className="card">
        <div className="card-h"><h2>{matches ? "Your session" : "Where you'll fish"}</h2><button type="button" className="linkbtn" onClick={openPicker}>Change place</button></div>
        {matches ? (
          <button type="button" className="li" onClick={openPicker}><Icon name="pin" /><span className="grow"><span className="t">{place.name}</span><span className="s">{place.region || "Your location"} · {sea ? "Sea" : place.kind}</span></span><Icon name="chevron" className="go" /></button>
        ) : (
          <>
            <Seg label="Water type" value={generic} onChange={(v) => setGeneric(v)} options={WATERS.filter((w) => (w.kind === "sea") === sea).map((w) => ({ value: w.id, label: w.label }))} />
            <p className="tiny">General {sea ? "sea" : "freshwater"} advice. {current.name} is {current.kind === "sea" ? "a sea mark" : "freshwater"}, so pick a {sea ? "sea" : "freshwater"} place for local detail, tides and live conditions.</p>
          </>
        )}
        <span className="eyebrow">Target fish</span>
        <div className="species-picker" role="group" aria-label="Target species">
          {pool.slice(0, 30).map((s) => {
            const r = here.find((x) => x.species.id === s.id);
            return (
              <button type="button" key={s.id} aria-pressed={s.id === species.id} onClick={() => setSid(s.id)} className="sp-chip">
                <span className="chip-photo"><FishThumb species={s} kind="chip" /></span>
                <span>{s.name}</span>
                {r ? <i className={`dotlvl lvl-${r.level}`} title={LEVELS[r.level].label} /> : null}
              </button>
            );
          })}
        </div>
        <span className="eyebrow">Method</span>
        <Seg label="Method" value={method === "auto" ? a?.method : method} onChange={setMethod} options={methods.map((m) => ({ value: m, label: METHODS[m].label }))} />
        <details className="conds">
          <summary>Conditions: {sea ? `${cond.tide || "tide"}, ${cond.sea} sea` : `${cond.flow} flow`}, {cond.clarity} water{cond.snags === "snaggy" ? ", snaggy" : ""}</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            {sea ? <div className="cond-row"><span>Tide</span><Seg value={cond.tide} onChange={set("tide")} options={[{ value: "flooding", label: "Flooding" }, { value: "ebbing", label: "Ebbing" }, { value: "slack", label: "Slack" }, { value: "strong", label: "Big spring tide" }]} /></div> : null}
            {sea ? <div className="cond-row"><span>Sea</span><Seg value={cond.sea} onChange={set("sea")} options={["calm", "moderate", "rough"]} /></div> : <div className="cond-row"><span>River flow</span><Seg value={cond.flow} onChange={set("flow")} options={["low", "normal", "high"]} /></div>}
            <div className="cond-row"><span>Water colour</span><Seg value={cond.clarity} onChange={set("clarity")} options={["clear", "slight", "coloured", "very coloured"]} /></div>
            <div className="cond-row"><span>Bottom</span><Seg value={cond.snags} onChange={set("snags")} options={[{ value: "clean", label: "Clean" }, { value: "snaggy", label: "Snaggy" }]} /></div>
            <div className="cond-row"><span>Fish size</span><Seg value={cond.size} onChange={set("size")} options={[{ value: "average", label: "Average fish" }, { value: "specimen", label: "Specimen hunting" }]} /></div>
          </div>
        </details>
      </section>

      {a ? (
        <>
          <div className="advice-head">
            <span className="head-photo"><FishThumb species={species} kind="head" /></span>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <h2>{species.name}: {METHODS[a.method]?.label || "set-up"}</h2>
              {place.generic ? <span className="lvl lvl-possible">General advice, any {waterById(generic).label.toLowerCase()}</span>
                : lvl ? <span className={`lvl lvl-${a.here.level}`}>{lvl.label} here</span> : <span className="lvl lvl-possible">No local record found</span>}
              <span className="tiny">{species.verification === "verified" ? "Built from sourced tackle guides" : species.verification === "partial" ? "Partly sourced: gaps are marked" : "Few sources found: treat as general guidance"}</span>
            </div>
          </div>

          {myLog ? (
            <div className="notice tide"><Icon name="star" /><div><b>From your own log ({myLog.n} {species.name.toLowerCase()}):</b> {[myLog.bait ? `most caught on ${myLog.bait[0]}` : null, myLog.tide ? `often at ${myLog.tide.toLowerCase()}` : null, myLog.hook ? `hook ${myLog.hook[0]}` : null].filter(Boolean).join(", ")}.</div></div>
          ) : null}

          <div className="advice-grid">
            <section className="acard bait">
              <span className="eyebrow">1 · Bait</span>
              {a.bait.primary ? <><b className="big">{a.bait.primary.name}</b><p>{a.bait.primary.note || (a.bait.primary.seasons?.length ? `Best in ${a.bait.primary.seasons.join(" and ")}.` : "")}</p></> : <p>No sourced bait list yet for this species.</p>}
              {a.bait.size ? <p className="small"><b>How much:</b> {a.bait.size}</p> : null}
              {a.bait.prep ? <p className="small"><b>How to hook it:</b> {a.bait.prep}</p> : null}
              {a.bait.alternatives.length ? <div className="chips">{a.bait.alternatives.map((b) => <span key={b.name} className="chip">{b.name}</span>)}</div> : null}
              {a.bait.artificial.length ? <><span className="eyebrow">Lure or fly</span><div className="chips">{a.bait.artificial.map((b) => <span key={b.name} className="chip tide">{b.name}</span>)}</div></> : null}
            </section>

            <section className="acard hook">
              <span className="eyebrow">2 · Hook</span>
              <div className="hook-row"><HookGlyph size={hookFirst} /><div><b className="big">{a.hook.range ? `Size ${a.hook.range}` : "Not sourced for this fish"}</b><span>{a.hook.pattern}</span></div></div>
              {a.hook.size ? <p className="small">{a.hook.size}</p> : null}
              {a.hook.why ? <p className="small muted">{a.hook.why}</p> : null}
              {a.hook.barbless ? <p className="small"><b>Barbless:</b> {a.hook.barbless}</p> : null}
            </section>

            <section className="acard rig wide">
              <span className="eyebrow">3 · Rig</span>
              {a.rig ? (
                <>
                  <div className="card-h"><b className="big">{a.rig.name}</b><button type="button" className="linkbtn" onClick={() => setRigOpen(a.rig)}>Step by step</button></div>
                  <RigDiagram rig={a.rig} />
                  <div className="kv">
                    {a.line ? <div><span className="k">Line</span><span className="v small">{a.line}</span></div> : null}
                    {a.weight ? <div><span className="k">Lead or float</span><span className="v small">{a.weight}</span></div> : null}
                  </div>
                  {a.rigAlternatives.length ? <div className="row small">Also good: {a.rigAlternatives.map((r) => <button type="button" key={r.id} className="chip" onClick={() => setRigOpen(r)}>{r.name}</button>)}</div> : null}
                </>
              ) : <p className="small">No sourced rig for this method yet.</p>}
            </section>

            <section className="acard pres wide">
              <span className="eyebrow">4 · Presentation</span>
              <div className="pres-row">
                <WaterColumn zone={a.presentation.zone} kind={sea ? "sea" : "fresh"} />
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  {a.presentation.text ? <p className="small">{a.presentation.text}</p> : null}
                  {a.presentation.moving ? <span className="chip">{a.presentation.moving === "static" ? "Keep it still" : a.presentation.moving === "moving" ? "Keep it moving" : "Static or moving"}</span> : null}
                  {a.presentation.offBottom ? <p className="small muted">{a.presentation.offBottom}</p> : null}
                </div>
              </div>
            </section>

            <section className="acard where">
              <span className="eyebrow">5 · Where to cast</span>
              {a.where.text ? <p className="small">{a.where.text}</p> : <p className="small muted">No published notes for this mark. Look for the features in the species profile, or use Cast Advisor.</p>}
              <span className={`tag ${a.where.verified ? "ok" : ""}`}>{a.where.verified ? `From published notes on ${place.name}` : "General guidance, not about this exact place"}</span>
              {a.distance ? <p className="small"><b>How far:</b> {a.distance}</p> : null}
            </section>

            <section className="acard when">
              <span className="eyebrow">6 · When</span>
              {day?.windows.some((w) => w.end > Date.now()) ? day.windows.filter((w) => w.end > Date.now()).map((w, i) => <p key={i} className="small"><b className="num">{fmtTime(w.start)}–{fmtTime(w.end)}</b> today, BiteScore {w.peak} ({band(w.peak).label})</p>)
                : <p className="small muted">{day?.windows.length ? "Today's best windows have passed. Check tomorrow on Home." : "No strong window today."}</p>}
              {species.bestTimes ? <p className="small muted">{species.bestTimes}</p> : null}
            </section>
          </div>

          {a.adjust.length ? (
            <section className="card">
              <h2 className="h2">7 · If things change</h2>
              <div className="ifthen">{a.adjust.map((x, i) => <div key={i}><b>{x.if}</b><span>{x.then}</span></div>)}</div>
            </section>
          ) : null}

          {a.legal.length ? (
            <section className="card">
              <h2 className="h2">8 · Rules today</h2>
              {a.legal.map((n, i) => <Notice key={i} kind={n.level === "danger" ? "danger" : n.level === "legal" ? "warn" : ""}><b>{n.title}.</b> {n.text} {n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer">Source</a> : null}</Notice>)}
              {a.legal.checked ? <p className="tiny">Rules last checked {a.legal.checked}. Local byelaws can be stricter: check the fishery or the local IFCA.</p> : null}
            </section>
          ) : null}

          <GearCard species={species} advice={a} method={a.method} title="9 · Get the gear" />

          <div className="row">
            <button type="button" className="btn" onClick={() => { update((s) => ({ savedSetups: [{ id: Date.now(), species: species.id, method: a.method, rig: a.rig?.id, bait: a.bait.primary?.name, hook: a.hook.range, place: place.name }, ...(s.savedSetups || [])].slice(0, 30) })); say("Set-up saved"); }}><Icon name="star" />Save this set-up</button>
            <button type="button" className="btn ghost" onClick={() => setReport(true)}><Icon name="flag" />Report a problem</button>
          </div>
          <Sources list={a.sources} />
        </>
      ) : null}
      {saved.length ? (
        <section className="card">
          <div className="card-h"><h2>Saved set-ups</h2><span className="aside">{saved.length}</span></div>
          <div className="list">{saved.slice(0, 8).map((x) => (
            <div key={x.id} className="li static">
              <button type="button" className="grow linkish" onClick={() => { setSid(x.species); setTimeout(() => setMethod(x.method), 0); window.scrollTo({ top: 0 }); }}>
                <span className="t">{SPECIES.find((s) => s.id === x.species)?.name || x.species}: {rigById(x.rig)?.name || "rig"}</span>
                <span className="s">{[x.bait, x.hook ? `hook ${x.hook}` : null, x.place].filter(Boolean).join(" · ")}</span>
              </button>
              <button type="button" className="xbtn" aria-label="Remove saved set-up" onClick={() => update((st) => ({ savedSetups: (st.savedSetups || []).filter((y) => y.id !== x.id) }))}><Icon name="close" /></button>
            </div>
          ))}</div>
        </section>
      ) : null}
      {rigOpen ? <RigSheet rig={rigOpen} onClose={() => setRigOpen(null)} /> : null}
      {report ? <ReportSheet refText={`advisor:${species.id}:${a?.method}:${place.id}`} onClose={() => setReport(false)} /> : null}
    </>
  );
}

export function ReportSheet({ refText, onClose, kind = "inaccurate-forecast" }) {
  const { say, preview } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Report a problem" onClose={onClose} aside="Goes to the FishDock team. No location is sent.">
      <label className="field" htmlFor="fb-text"><span className="lbl">What's wrong?</span><textarea id="fb-text" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: this mark is now closed to anglers" /></label>
      <button type="button" className="btn primary block" disabled={busy || text.trim().length < 5} onClick={async () => {
        setBusy(true);
        const r = await sendFeedback(kind, text.trim().slice(0, 2000), refText);
        setBusy(false);
        if (r?.error) say(preview ? "Reports send from the full app, not the preview" : r.message || "Couldn't send. Try again later.");
        else { say("Thanks, report sent"); onClose(); }
      }}>Send report</button>
    </Sheet>
  );
}

// ---- Rig library ----
function RigLibrary({ water }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const list = RIGS.filter((r) => (r.type === water || r.type === "both") && (!q || `${r.name} ${r.best} ${(r.species || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="search"><Icon name="search" /><input id="rig-q" className="input" placeholder="Search rigs, species or conditions" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="rig-grid">
        {list.map((r) => (
          <button type="button" key={r.id} className="rig-card" onClick={() => setOpen(r)}>
            <RigDiagram rig={r} compact />
            <span className="t">{r.name}</span>
            <span className="s">{r.species?.length ? r.species.slice(0, 4).map((id) => SPECIES.find((s) => s.id === id)?.name || id).join(", ") : ""}</span>
            <span className="rig-tags">{r.snaggy ? <span className="tag">Rough ground</span> : null}{r.heavyFlow ? <span className="tag">Tide or flow</span> : null}{r.calm ? <span className="tag">Calm water</span> : null}</span>
            {r.verification !== "verified" ? <span className="tag">{VER[r.verification] || "General guidance"}</span> : null}
          </button>
        ))}
      </div>
      {open ? <RigSheet rig={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export function RigSheet({ rig, onClose }) {
  const { say } = useApp();
  const [step, setStep] = useState(0);
  // what's packed: ticked on this phone only, so a half-packed bag is still ticked tomorrow
  const key = `fishdock.kit.${rig.id}`;
  const [packed, setPacked] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); } });
  const toggle = (i) => setPacked((p) => {
    const n = new Set(p);
    if (n.has(i)) n.delete(i); else n.add(i);
    try { localStorage.setItem(key, JSON.stringify([...n])); } catch { /* storage blocked: kept for now */ }
    return n;
  });
  const kit = rig.components || [];
  const copy = async () => {
    const text = `${rig.name}: what you need\n${kit.map((c) => `- ${c}`).join("\n")}${rig.hook ? `\nHook: ${rig.hook}` : ""}${rig.line ? `\nLine: ${rig.line}` : ""}${rig.weight ? `\nLead or float: ${rig.weight}` : ""}`;
    try { await navigator.clipboard.writeText(text); say("List copied"); } catch { say("Couldn't copy on this browser"); }
  };
  const tags = [rig.type === "sea" ? "Sea" : rig.type === "fresh" ? "Freshwater" : "Sea or fresh", rig.snaggy ? "Good over rough ground" : null, rig.heavyFlow ? "Holds in tide or flow" : null, rig.calm ? "Best in calm water" : null].filter(Boolean);
  const facts = [["Hook", rig.hook, "hook"], ["Line", rig.line, "line"], ["Lead or float", rig.weight, "lead"], ["Bait", rig.bait, "bait"]].filter((f) => f[1]);
  return (
    <Sheet title={rig.name} aside={VER[rig.verification] || ""} onClose={onClose}>
      <RigDiagram rig={rig} />
      <div className="chips">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
      {rig.best ? <p className="small"><b>Works best:</b> {rig.best}</p> : null}
      {facts.length ? <div className="rig-facts">{facts.map(([k, v, ico]) => <div key={k} className="rig-fact"><span className="kit-ico"><KitIcon text={ico} /></span><span><span className="k">{k}</span><span className="v">{v}</span></span></div>)}</div> : null}
      <div className="buy-row"><span className="small"><b>Buy it ready-tied:</b></span><ShopLinks q={rigQuery(rig)} label={rig.name} /></div>
      {kit.length ? (
        <section className="card">
          <div className="card-h"><h2>What you need</h2><span className="aside">{packed.size ? `${[...packed].filter((i) => i < kit.length).length} of ${kit.length} packed` : `${kit.length} items`}</span></div>
          <ul className="kit">{kit.map((c, i) => (
            <li key={i}><button type="button" className={`kit-row${packed.has(i) ? " on" : ""}`} aria-pressed={packed.has(i)} onClick={() => toggle(i)}>
              <span className="kit-ico"><KitIcon text={c} /></span><span className="kit-t">{c}</span><span className="kit-tick">{packed.has(i) ? <Icon name="check" /> : null}</span>
            </button></li>
          ))}</ul>
          <div className="row"><button type="button" className="btn small" onClick={copy}><Icon name="copy" />Copy the list</button>{packed.size ? <button type="button" className="linkbtn" onClick={() => { setPacked(new Set()); try { localStorage.removeItem(key); } catch { /* ignore */ } }}>Clear ticks</button> : null}</div>
        </section>
      ) : null}
      {rig.steps?.length ? (
        <section className="card">
          <div className="card-h"><h2>Tie it</h2><span className="aside">Step {step + 1} of {rig.steps.length}</span></div>
          <ol className="tie-steps">{rig.steps.map((t, i) => (
            <li key={i} className={i < step ? "done" : i === step ? "now" : ""}><button type="button" onClick={() => setStep(i)}><span className="n">{i < step ? <Icon name="check" /> : i + 1}</span><span className="t">{t}</span></button></li>
          ))}</ol>
          <div className="row"><button type="button" className="btn small" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button type="button" className="btn small primary" disabled={step === rig.steps.length - 1} onClick={() => setStep(step + 1)}>{step === rig.steps.length - 1 ? "Done" : "Next step"}</button></div>
        </section>
      ) : null}
      {rig.species?.length ? <div className="chips">{rig.species.map((id) => <span key={id} className="chip">{SPECIES.find((s) => s.id === id)?.name || id}</span>)}</div> : null}
      {rig.mistakes?.length ? <section className="card"><h2 className="h2">Common mistakes</h2><div className="ifthen">{rig.mistakes.map((m, i) => <div key={i}><b>{m.m}</b><span>{m.fix}</span></div>)}</div></section> : null}
      <Sources list={rig.sources} />
    </Sheet>
  );
}

// ---- Knots ----
function KnotLibrary() {
  const [open, setOpen] = useState(null);
  const [step, setStep] = useState(0);
  return (
    <>
      <div className="list card">
        {KNOTS.map((k) => (
          <button type="button" key={k.id} className="li" onClick={() => { setOpen(k); setStep(0); }}>
            <span className="fish-ico"><Icon name="rig" /></span>
            <span className="grow"><span className="t">{k.name}</span><span className="s">{k.use}</span></span>
            {k.verification !== "verified" ? <span className="tag">{k.verification === "partial" ? "Standard steps" : "General"}</span> : null}
          </button>
        ))}
      </div>
      {open ? (
        <Sheet title={open.name} aside={open.use} onClose={() => setOpen(null)}>
          <div className="knot-stepper">
            <div className="knot-num">{step + 1}<span>/{open.steps.length}</span></div>
            <p className="step-now">{open.steps[step]}</p>
            <div className="progress"><i style={{ width: `${((step + 1) / open.steps.length) * 100}%` }} /></div>
            <div className="row"><button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><button type="button" className="btn primary" disabled={step === open.steps.length - 1} onClick={() => setStep(step + 1)}>Next</button></div>
          </div>
          <p className="small muted">Wet the knot before you pull it tight, and test it with a firm pull before you cast.</p>
          {open.strength ? <p className="small">{open.strength}</p> : null}
          <Sources list={open.sources} />
        </Sheet>
      ) : null}
    </>
  );
}

// ---- Baits ----
function BaitLibrary({ water }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const list = BAITS.filter((b) => (b.type === water || b.type === "both") && (!q || `${b.name} ${(b.species || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="search"><Icon name="search" /><input id="bait-q" className="input" placeholder="Search baits or species" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="list card">
        {list.map((b) => (
          <button type="button" key={b.id} className="li" onClick={() => setOpen(b)}>
            <BaitThumb bait={b} />
            <span className="grow"><span className="t">{b.name} <span className={`pill ${b.type === "sea" ? "sea" : "fresh"}`}>{b.type === "sea" ? "Sea" : b.type === "both" ? "Both" : "Fresh"}</span></span><span className="s">{(b.species || []).slice(0, 5).map((id) => SPECIES.find((s) => s.id === id)?.name || id).join(", ")}</span></span>
            <Icon name="chevron" className="go" />
          </button>
        ))}
      </div>
      {open ? (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <BaitPhoto bait={open} />
          {open.hooking ? <p className="small"><b>How to hook it:</b> {open.hooking}</p> : null}
          {open.where ? <p className="small"><b>Where to get it:</b> {open.where}</p> : null}
          {open.storage ? <p className="small"><b>Keeping it fresh:</b> {open.storage}</p> : null}
          <div className="buy-row"><span className="small"><b>Buy it:</b></span><ShopLinks q={baitQuery(open)} label={open.name} /></div>
          <div className="chips">{(open.species || []).map((id) => <span key={id} className="chip">{SPECIES.find((s) => s.id === id)?.name || id}</span>)}</div>
          <Sources list={open.sources} />
        </Sheet>
      ) : null}
    </>
  );
}

// ---- Learn: short beginner lessons with a step-by-step reader ----
function Lessons({ water }) {
  const [open, setOpen] = useState(null);
  const [step, setStep] = useState(0);
  return (
    <>
      <div className="list card">
        {LESSONS.filter((l) => !l.water || l.water === "both" || l.water === water).map((l) => (
          <button type="button" key={l.id} className="li" onClick={() => { setOpen(l); setStep(0); }}>
            <span className="fish-ico"><Icon name="book" /></span>
            <span className="grow"><span className="t">{l.title}</span><span className="s">{l.steps.length} steps · about {l.minutes} min</span></span>
            <Icon name="chevron" className="go" />
          </button>
        ))}
      </div>
      <p className="tiny">General guidance for beginners. Rules and limits in these lessons are summaries: the Rules section and the official pages decide.</p>
      {open ? (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <div className="knot-stepper">
            <div className="knot-num">{step + 1}<span>/{open.steps.length}</span></div>
            <p className="step-now">{open.steps[step]}</p>
            <div className="progress"><i style={{ width: `${((step + 1) / open.steps.length) * 100}%` }} /></div>
            <div className="row"><button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>{step < open.steps.length - 1 ? <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className="btn primary" onClick={() => setOpen(null)}>Done</button>}</div>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export { rigById };
