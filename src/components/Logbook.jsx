// ---- Logbook: your level, the fish you've landed in the game, your species book and your badges ----
// Everything here is worked out from the game diary on this phone (src/lib/progress.js). Game catches only, never real
// records; levels and badges are for the record of what you've done, and never open or close anywhere.
import { useMemo, useState } from "react";
import { Icon } from "./ui.jsx";
import { progress, CHALLENGE_XP } from "../lib/progress.js";
import { summary as diarySummary } from "../lib/diary.js";
import { SPECIES } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";

const dateOf = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function LevelBar({ p, compact = false }) {
  // (in the game's top row: the level in a ring that fills towards the next one)
  if (compact) { const C = 2 * Math.PI * 15; return (
    <span className="lvl-ring" aria-label={`Level ${p.level}, ${Math.round(p.pct * 100)}% of the way to level ${p.level + 1}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" className="bg" /><circle cx="18" cy="18" r="15" className="fg" strokeDasharray={`${(p.pct * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 18 18)" /></svg>
      <b>{p.level}</b>
    </span>); }
  return (
    <div className={`lvl${compact ? " compact" : ""}`}>
      <span className="lvl-n" aria-label={`Level ${p.level}`}>{p.level}</span>
      <span className="lvl-track" role="progressbar" aria-valuemin={0} aria-valuemax={p.to - p.from} aria-valuenow={p.into} aria-label="Towards the next level"><i style={{ width: `${Math.round(p.pct * 100)}%` }} /></span>
      {!compact ? <span className="lvl-need">{p.need.toLocaleString("en-GB")} XP to level {p.level + 1}</span> : null}
    </div>
  );
}

export function MedalPill({ medal }) { return medal ? <span className={`medal m-${medal.id}`}>{medal.name}</span> : null; }

export default function Logbook({ list, name, onClose }) {
  const [tab, setTab] = useState("catches");
  const p = useMemo(() => progress(list), [list]);
  const xpOf = useMemo(() => new Map(p.rows.map((r) => [r.e.id, r])), [p]);
  const s = useMemo(() => diarySummary(list), [list]);
  const book = useMemo(() => SPECIES.filter((f) => hasArt(f.id)).sort((a, b) => a.name.localeCompare(b.name)), []);
  const caught = new Map(p.species.map((k) => [k.species, k]));
  const got = p.badges.filter((b) => b.got).length;
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <aside className="watch-panel sheet open diary-sheet" aria-label="Your logbook">
        <div className="sheet-head"><div className="try-head"><h1>{name ? `${name}'s logbook` : "Your logbook"}</h1><p className="small muted">Every fish you've landed in the game, on this phone. Game catches, never real records.</p></div>
          <button type="button" className="xbtn sheet-x" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <section className="watch-sec">
          <LevelBar p={p} />
          <p className="tiny muted lvl-how">{p.xp.toLocaleString("en-GB")} XP. Bigger fish earn more, with medals for big ones of their kind, a bonus for a new kind and for a personal best. The same kind again the same day earns a little less each time.</p>
        </section>
        <section className="watch-sec">
          <div className="card-h"><h2>Today's challenges</h2><span className="aside">{p.today.filter((c) => c.done).length} of {p.today.length} · {CHALLENGE_XP} XP each</span></div>
          <ul className="log-today">{p.today.map((c) => <li key={c.id} className={c.done ? "done" : ""}><Icon name={c.done ? "check" : "target"} /><span>{c.name}</span></li>)}</ul>
          <p className="tiny muted">Three new ones every day.</p>
        </section>
        <section className="watch-sec diary-totals">
          <div><b>{s.count}</b><span>fish</span></div><div><b>{p.stats.kinds} / {book.length}</b><span>kinds</span></div><div><b>{got} / {p.badges.length}</b><span>badges</span></div>
        </section>
        <div className="seg log-tabs" role="tablist" aria-label="Logbook">
          {[["catches", "Catches"], ["species", "Species"], ["badges", "Badges"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === "catches" ? (s.days.length ? s.days.map((d) => (
          <section key={d.day} className="watch-sec">
            <div className="card-h"><h2>{new Date(d.at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h2><span className="aside">{d.list.length} fish · {d.list.reduce((a, e) => a + (xpOf.get(e.id)?.xp || 0), 0)} XP</span></div>
            <div className="list">{d.list.map((e) => { const r = xpOf.get(e.id); return (
              <div key={e.id} className="li diary-li">
                {hasArt(e.species) ? <img src={artUrl(e.species, "s")} alt="" className="diary-art" /> : <span className="diary-art ph"><Icon name="fish" /></span>}
                <span className="grow"><span className="t">{e.name}{e.lengthCm ? `, ${e.lengthCm} cm` : ""} <MedalPill medal={r?.medal} />{r?.first ? <span className="log-tag">New kind</span> : r?.best ? <span className="log-tag">Best</span> : null}</span>
                  <span className="s">{[e.placeName, new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), e.outcome === "kept" ? "kept" : e.outcome === "released" ? "put back" : null].filter(Boolean).join(" · ")}</span></span>
                {r ? <span className="log-xp">+{r.xp}</span> : null}
              </div>
            ); })}</div>
          </section>
        )) : <section className="watch-sec"><p className="small">Nothing yet: cast out and land your first fish.</p></section>) : null}

        {tab === "species" ? (
          <section className="watch-sec">
            <div className="card-h"><h2>Species book</h2><span className="aside">{p.stats.kinds} of {book.length}</span></div>
            <div className="log-book">{book.map((f) => { const k = caught.get(f.id); return (
              <div key={f.id} className={`log-kind${k ? "" : " none"}`}>
                <img src={artUrl(f.id, "s")} alt="" loading="lazy" />
                <span className="t">{f.name}</span>
                <span className="s">{k ? <>{k.n} caught{k.best ? ` · best ${k.best.lengthCm} cm` : ""} <MedalPill medal={k.medal} /></> : "Not caught yet"}</span>
              </div>
            ); })}</div>
          </section>
        ) : null}

        {tab === "badges" ? (
          <section className="watch-sec">
            <div className="log-badges">{p.badges.map((b) => (
              <div key={b.id} className={`log-badge${b.got ? " got" : ""}`}>
                <span className="ic" aria-hidden="true"><Icon name={b.got ? "check" : "star"} /></span>
                <span className="t">{b.name}</span><span className="s">{b.desc}{b.got && b.at ? ` · ${dateOf(b.at)}` : ""}</span>
              </div>
            ))}</div>
          </section>
        ) : null}
      </aside>
    </>
  );
}
