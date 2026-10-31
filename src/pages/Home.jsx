// ---- Home: today at your place. BiteScore per species, conditions, tides, what to catch, and Start fishing ----
import { useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import ASTRO from "../lib/astro.js";
import { biteDay, band, explain, conditionsAt } from "../lib/bitescore.js";
import { catchHere, LEVELS, autoTarget } from "../lib/catchhere.js";
import { rulesFor } from "../lib/rules.js";
import { ukDayStart, fmtTime, fmtDay, ukMonth, hoursUntil, fmtShortDay, addUkDays } from "../lib/time.js";
import { compass, fmtKm, mapsLink } from "../lib/geo.js";
import { waterById } from "../lib/pins.js";
import { Icon, Notice, Sheet, Beta, Seg, Sources } from "../components/ui.jsx";
import { FishThumb } from "../components/FishPhoto.jsx";
import { BiteStrip, TideChart } from "../components/charts.jsx";
import Waterscape from "../components/Waterscape.jsx";
import SpeciesSheet from "../components/SpeciesSheet.jsx";
import IdentifySheet from "../components/IdentifySheet.jsx";
import Checklist from "../components/Checklist.jsx";
import CatchList from "../components/CatchList.jsx";
import AdviceSheet from "../components/AdviceSheet.jsx";
import { useMyCatches, catchesNear, withMine } from "../lib/myCatches.js";
import RemindButton from "../components/RemindButton.jsx";
import ForecastStrip from "../components/ForecastStrip.jsx";
import TideWeek from "../components/TideWeek.jsx";

export default function Home() {
  const app = useApp();
  const { place, live, tide, settings, update, go, nation } = app;
  const [dayOffset, setDayOffset] = useState(0);
  const [pick, setPick] = useState(null);
  const [sheet, setSheet] = useState(null); // "how" | "catch" | {species} | "identify" | "checklist" | "conditions"
  const now = Date.now();
  const dayStart = addUkDays(ukDayStart(now), dayOffset);
  const month = ukMonth(dayStart + 12 * 3600e3);
  const myCatches = useMyCatches();
  const here = useMemo(() => withMine(catchHere(place, month), catchesNear(myCatches, place), month), [place, month, myCatches]);
  const target = settings.target !== "auto" ? app.speciesById(settings.target) : autoTarget(place, month);
  const candidates = here.filter((r) => r.level !== "possible" && r.inSeason !== "out").slice(0, 6);
  if (target && !candidates.some((c) => c.species.id === target.id)) candidates.unshift({ species: target, level: "possible", inSeason: "present" });

  const manual = settings.manualConditions?.[place.id] || null;
  const cond = live.cond?.hourly?.length ? live.cond : manual ? { manual } : null;
  const day = useMemo(() => target ? biteDay({ place, species: target, dayStart, tide, cond, river: live.river?.source ? live.river : null, now }) : null, [place, target, dayStart, tide, cond, live.river, now]);
  const sun = useMemo(() => ASTRO.sunDay(dayStart, place.lat, place.lon), [dayStart, place.lat, place.lon]);
  const moon = useMemo(() => ({ ill: ASTRO.moonIllum(dayStart + 12 * 3600e3), ev: ASTRO.moonEvents(dayStart, addUkDays(dayStart, 1), place.lat, place.lon) }), [dayStart, place.lat, place.lon]);
  const week = useMemo(() => target ? Array.from({ length: 7 }, (_, i) => {
    const ds = addUkDays(ukDayStart(now), i);
    const d = biteDay({ place, species: target, dayStart: ds, tide, cond, river: live.river?.source ? live.river : null, now });
    const best = d.windows[0] || null;
    return { ds, peak: Math.max(...d.slots.map((x) => x.score)), best };
  }) : [], [place, target, tide, cond, live.river, now]);
  const nowSlot = dayOffset === 0 ? day?.nowSlot : null;
  const shown = pick != null ? day?.slots[pick] : nowSlot || day?.slots.reduce((a, b) => (b.score > a.score ? b : a), day.slots[0]);
  const b = shown ? band(shown.score) : null;
  const nextWin = day?.windows.find((w) => w.end > now) || day?.windows[0];
  const c = conditionsAt(cond, now);
  const tideNow = tide?.stateAt(now);
  const notices = rulesFor({ nation, kind: place.kind, date: dayStart + 12 * 3600e3, speciesId: target?.id, place });

  return (
    <>
      <header className="hero">
        <Waterscape lat={place.lat} lon={place.lon} kind={place.kind === "sea" ? "sea" : "river"} wind={c?.windKph || 0} />
        <div className="hero-in">
          <div className="hero-top">
            <span className="wordmark">fish<b>dock</b></span>
            <button type="button" className="icon-btn on-hero" onClick={() => go("settings")} aria-label="Settings and privacy"><Icon name="settings" /></button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="spot-btn" onClick={app.openPicker}><Icon name="pin" /><span>{place.name}</span><Icon name="down" /></button>
            {target ? <button type="button" className="spot-btn" onClick={() => setSheet("target")}><Icon name="fish" /><span>{target.name}</span><Icon name="down" /></button> : null}
          </div>
          {day && shown ? (
            <div className="hero-score">
              <div className="big-score" aria-label={`BiteScore ${shown.score} out of 100`}>{shown.score}</div>
              <div className="score-side">
                <span className="score-band">{b.label} <span className="score-of">/ 100</span></span>
                <span className="score-cap">{pick != null ? `BiteScore at ${fmtTime(shown.t - 900e3)}` : dayOffset === 0 ? "BiteScore now" : `Best on ${fmtShortDay(dayStart)}`} · {target.name}</span>
                {nextWin ? <span className="score-cap">Best window {fmtTime(nextWin.start)}–{fmtTime(nextWin.end)}{dayOffset === 0 && nextWin.start > now ? ` (in ${hoursUntil(nextWin.start)})` : ""}</span> : null}
              </div>
            </div>
          ) : <div className="score-cap">No species in season here this month. Try another place.</div>}
          <div className="hero-meta">
            {tideNow ? <span className="chip"><Icon name="wave" />{tideNow.phase}</span> : null}
            {c?.windKph != null ? <span className="chip"><Icon name="wind" />{Math.round(c.windKph * 0.621)} mph {compass(c.windDir)}</span> : null}
            <span className="chip"><Icon name="moon" />{ASTRO.phaseName(moon.ill.phase)}</span>
            <button type="button" className="chip conf" onClick={() => setSheet("how")}><Icon name="info" />{day ? `${day.confidence[0].toUpperCase()}${day.confidence.slice(1)} confidence` : "How it works"}</button>
          </div>
        </div>
      </header>

      <main className="col" style={{ marginTop: -6 }}>
        <section className="card">
          <div className="card-h"><h2>BiteScore for {target?.name || "your target"}</h2><button type="button" className="linkbtn" onClick={() => setSheet("how")}>How it works</button></div>
          <Seg label="Day" value={dayOffset} onChange={(v) => { setDayOffset(v); setPick(null); }} options={[0, 1, 2].map((d) => ({ value: d, label: d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmtShortDay(addUkDays(ukDayStart(now), d)).split(" ")[0] }))} />
          <div className="chips scroll" role="group" aria-label="Species forecast">
            {candidates.map((r) => (
              <button type="button" key={r.species.id} className="chip" aria-pressed={target?.id === r.species.id} onClick={() => { update({ target: r.species.id }); setPick(null); }}>{r.species.name}</button>
            ))}
          </div>
          <BiteStrip day={day} sun={sun} tide={tide} now={now} onPick={setPick} picked={pick} />
          {shown ? (
            <div className="why">
              <b>{pick != null ? fmtTime(shown.t - 900e3) : "Now"}: {shown.score} {b.label}</b>
              <ul>{explain(shown, place.kind).slice(0, 4).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ) : null}
          {day?.windows.length ? (
            <div className="windows">
              {day.windows.map((w, i) => {
                const past = dayOffset === 0 && w.end <= now;
                return <div className={`window${past ? " past" : ""}`} key={i}><b>{fmtTime(w.start)}–{fmtTime(w.end)}</b><span>{past ? "Earlier today" : `Peak ${w.peak}${band(w.peak).label ? `, ${band(w.peak).label}` : ""}`}</span></div>;
              })}
            </div>
          ) : null}
          {nextWin && nextWin.end > now ? <div className="row"><RemindButton win={nextWin} where={place.name} species={target?.name} /><span className="tiny">Best window {fmtTime(nextWin.start)}–{fmtTime(nextWin.end)} to your calendar</span></div> : null}
          {day?.missing.length ? <p className="tiny">Not included: {day.missing.join(", ")}{app.preview ? " (live data needs the full app)" : ""}. Those count as average.</p> : null}
        </section>

        {week.length ? (
          <section className="card">
            <div className="card-h"><h2>Best days this week</h2><span className="aside">{target.name}</span></div>
            <div className="week" role="list">
              {week.map((d, i) => {
                const wb = band(d.peak);
                return (
                  <button type="button" role="listitem" key={i} className={`wk l${wb.level}${i === dayOffset ? " on" : ""}`} onClick={() => { if (i < 3) { setDayOffset(i); setPick(null); } }} disabled={i > 2} title={d.best ? `Best ${fmtTime(d.best.start)}–${fmtTime(d.best.end)}` : ""}>
                    <span className="wk-bar"><i style={{ height: `${d.peak}%` }} /></span>
                    <b className="num">{d.peak}</b>
                    <span>{i === 0 ? "Today" : fmtShortDay(d.ds).split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
            <p className="tiny">Peak BiteScore each day. Live weather covers the next three days; after that it's tides, light and season only.</p>
          </section>
        ) : null}

        <section className="quick">
          <button type="button" className="quick-main" onClick={() => go("live")}>
            <span className="qm-ico"><Icon name="live" /></span>
            <span className="grow"><b>{app.session ? "Return to your session" : "Start fishing"}</b><span>Live Fishing Mode: timer, bites, catches, marks</span></span>
            <Icon name="chevron" className="go" />
          </button>
          <div className="quick-grid">
            <button type="button" onClick={() => go("cast")}><Icon name="scan" /><b>Cast Advisor</b><Beta /></button>
            <button type="button" onClick={() => go("tackle", { species: target?.id })}><Icon name="hook" /><b>Bait & rig for {target?.name || "a species"}</b></button>
            <button type="button" onClick={() => setSheet("catch")}><Icon name="fish" /><b>What can I catch here?</b></button>
            <button type="button" onClick={() => setSheet("identify")}><Icon name="camera" /><b>Identify a fish</b><Beta /></button>
            <button type="button" onClick={() => setSheet("checklist")}><Icon name="check" /><b>Before you go</b></button>
            <button type="button" onClick={() => go("explore")}><Icon name="explore" /><b>Find a spot</b></button>
          </div>
        </section>

        {notices.filter((n) => n.level !== "info").map((n, i) => (
          <Notice key={i} kind={n.level === "danger" ? "danger" : "warn"}><b>{n.title}.</b> {n.text} {n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer">Details</a> : null}</Notice>
        ))}

        <ConditionsCard place={place} live={live} c={c} manual={manual} onEdit={() => setSheet("conditions")} preview={app.preview} />

        {place.kind === "sea" ? (
          <section className="card">
            <div className="card-h"><h2>Tides</h2><span className="aside">{tide ? tide.rangeLabel : ""}</span></div>
            {tide ? (
              <>
                <TideChart tide={tide} dayStart={dayStart} now={now} />
                <TideWeek tide={tide} now={now} />
                <div className={`notice ${tide.source === "estimate" ? "warn" : "tide"}`}>
                  <Icon name={tide.source === "estimate" ? "warn" : "info"} />
                  <div>{tide.source === "estimate"
                    ? <>Estimated from the Moon and published {tide.station?.name} tide times. It can be out by about an hour, more at some places, and has no heights. Check the official times before you go: <a href="https://easytide.admiralty.co.uk/" target="_blank" rel="noopener noreferrer">Admiralty EasyTide</a>.</>
                    : <>{tide.label}{tide.station ? `, ${tide.station.name}${tide.station.distanceKm != null ? ` (${fmtKm(tide.station.distanceKm)})` : ""}` : ""}. Tide times are predictions; wind and pressure shift them.</>}</div>
                </div>
              </>
            ) : <p className="muted small">No tide station close enough to estimate. Check <a href="https://easytide.admiralty.co.uk/" target="_blank" rel="noopener noreferrer">Admiralty EasyTide</a>.</p>}
          </section>
        ) : null}

        {place.kind === "river" ? <RiverCard river={live.river} preview={app.preview} /> : null}

        <section className="card">
          <div className="card-h"><h2>Sun and moon</h2><span className="aside">{fmtDay(dayStart)}</span></div>
          <div className="kv">
            <div><span className="k">First light</span><span className="v">{fmtTime(sun.dawn)}</span></div>
            <div><span className="k">Sunrise</span><span className="v">{fmtTime(sun.sunrise)}</span></div>
            <div><span className="k">Sunset</span><span className="v">{fmtTime(sun.sunset)}</span></div>
            <div><span className="k">Last light</span><span className="v">{fmtTime(sun.dusk)}</span></div>
            <div><span className="k">Moon</span><span className="v">{ASTRO.phaseName(moon.ill.phase)}, {Math.round(moon.ill.fraction * 100)}%</span></div>
            <div><span className="k">Moon overhead</span><span className="v">{moon.ev.upper.map(fmtTime).join(", ") || "–"}</span></div>
          </div>
          <p className="tiny">Solunar periods (moon overhead or underfoot) carry 5% of BiteScore: the evidence for them is mixed.</p>
        </section>

        <section className="card">
          <div className="card-h"><h2>What can I catch here?</h2><button type="button" className="linkbtn" onClick={() => setSheet("catch")}>All {here.length}</button></div>
          <CatchList rows={here} limit={5} onOpen={(sp) => setSheet({ advice: sp })} />
        </section>

        {!place.verified ? (
          <section className="card">
            <div className="card-h"><h2>{place.name}</h2><span className="aside">{waterById(place.subtype)?.label || place.kind}</span></div>
            <p className="small muted">{place.pinId ? "Your pin" : "Your location"}, kept on this phone. It isn't a documented mark, so what's likely here comes from documented marks within {fmtKm(25, true)} and each species' habitat.</p>
            <p className="tiny">Being able to pin a spot doesn't mean you may fish there. Check access, permits and byelaws.</p>
            <div className="row">
              <a className="btn small" href={mapsLink(place.lat, place.lon)} target="_blank" rel="noopener noreferrer"><Icon name="route" />Directions</a>
              <button type="button" className="btn small" onClick={app.openPicker}><Icon name="pin" />Change place</button>
            </div>
          </section>
        ) : null}

        {place.verified && (place.safety || place.access) ? (
          <section className="card">
            <div className="card-h"><h2>{place.name}</h2><span className="aside">{place.region}</span></div>
            {place.best ? <p className="small"><b>When it fishes best:</b> {place.best}</p> : null}
            {place.access ? <p className="small muted"><b>Access and permits:</b> {place.access}</p> : null}
            {place.safety ? <Notice kind="warn"><b>Safety:</b> {place.safety}</Notice> : null}
            <p className="tiny">Being listed here doesn't mean you may fish it. Check access, permits and any local byelaws.</p>
            <Sources list={place.sources} />
          </section>
        ) : null}

        <p className="foot">BiteScore is a guide built from tides, light, weather, season and species habits. It isn't a promise of fish.</p>
      </main>

      {sheet === "how" ? <HowSheet day={day} kind={place.kind} onClose={() => setSheet(null)} /> : null}
      {sheet === "catch" ? (
        <Sheet title="What can I catch here?" aside={`${place.name}, ${fmtDay(dayStart).split(" ").slice(1).join(" ")}`} onClose={() => setSheet(null)}>
          <p className="small muted">In season now first, then by the strength of the evidence. FishDock never says a fish is at an exact spot.</p>
          <div className="legend">{Object.entries(LEVELS).map(([k, v]) => <span key={k} className={`lvl lvl-${k}`}>{v.label}</span>)}</div>
          <CatchList rows={here} onOpen={(sp) => setSheet({ advice: sp })} />
        </Sheet>
      ) : null}
      {sheet === "target" ? (
        <Sheet title="Target species" onClose={() => setSheet(null)}>
          <button type="button" className="li" onClick={() => { update({ target: "auto" }); setSheet(null); }}><span className="grow"><span className="t">Best in season here</span><span className="s">FishDock picks the strongest in-season species</span></span>{settings.target === "auto" ? <Icon name="check" /> : null}</button>
          <div className="list">{here.map((r) => (
            <button type="button" key={r.species.id} className="li" onClick={() => { update({ target: r.species.id }); setSheet(null); }}>
              <span className="fish-ico"><FishThumb species={r.species} /></span>
              <span className="grow"><span className="t">{r.species.name}</span><span className="s">{LEVELS[r.level].short} · {r.inSeason === "peak" ? "peak season" : r.inSeason === "present" ? "in season" : "out of season"}</span></span>
              {settings.target === r.species.id ? <Icon name="check" /> : null}
            </button>
          ))}</div>
        </Sheet>
      ) : null}
      {sheet?.species ? <SpeciesSheet species={sheet.species} onClose={() => setSheet(null)} /> : null}
      {sheet?.advice ? <AdviceSheet species={sheet.advice} spot={place} row={here.find((r) => r.species.id === sheet.advice.id)} onClose={() => setSheet(null)} /> : null}
      {sheet === "identify" ? <IdentifySheet onClose={() => setSheet(null)} /> : null}
      {sheet === "checklist" ? <Checklist onClose={() => setSheet(null)} /> : null}
      {sheet === "conditions" ? <ManualConditions onClose={() => setSheet(null)} /> : null}
    </>
  );
}

function ConditionsCard({ place, live, c, manual, onEdit, preview }) {
  const src = live.cond?.source;
  return (
    <section className="card">
      <div className="card-h"><h2>Conditions</h2><span className="aside">{src ? (live.cond.stale ? "Saved copy" : "Open-Meteo") : manual ? "Your entries" : ""}</span></div>
      {c ? (
        <div className="kv">
          {c.windKph != null ? <div><span className="k">Wind</span><span className="v">{Math.round(c.windKph * 0.621)} mph {compass(c.windDir)}{c.gustKph ? `, gusts ${Math.round(c.gustKph * 0.621)}` : ""}</span></div> : null}
          {c.pressureHpa != null ? <div><span className="k">Pressure</span><span className="v">{Math.round(c.pressureHpa)} hPa {c.pressureTrend != null ? (c.pressureTrend <= -1 ? "falling" : c.pressureTrend >= 1 ? "rising" : "steady") : ""}</span></div> : null}
          {c.tempC != null ? <div><span className="k">Air</span><span className="v">{Math.round(c.tempC)}°C</span></div> : null}
          {c.precipMm != null ? <div><span className="k">Rain this hour</span><span className="v">{c.precipMm.toFixed(1)} mm</span></div> : null}
          {c.waveM != null ? <div><span className="k">Waves</span><span className="v">{c.waveM.toFixed(1)} m</span></div> : null}
          {c.seaTempC != null ? <div><span className="k">Sea</span><span className="v">{c.seaTempC.toFixed(1)}°C</span></div> : null}
          {c.label ? <div><span className="k">Your notes</span><span className="v">{c.label}</span></div> : null}
        </div>
      ) : (
        <p className="small muted">{preview ? "Live weather and sea state need the full app (Open-Meteo, through FishDock's server). In this preview you can enter what you see." : live.cond?.message || "Loading the forecast…"}</p>
      )}
      {live.cond?.hourly?.length ? <ForecastStrip cond={live.cond} sea={place.kind === "sea"} /> : null}
      {c?.windKph > 45 || c?.gustKph > 65 ? <Notice kind="danger"><b>Storm-force wind.</b> Stay off exposed rocks, piers and steep shingle. Big waves arrive without warning.</Notice> : null}
      {place.kind === "sea" && c?.waveM > 2.5 ? <Notice kind="danger"><b>Big sea.</b> Waves over 2.5 m: rock marks and low breakwaters are dangerous today.</Notice> : null}
      <button type="button" className="linkbtn" onClick={onEdit}>{src ? "Add what you see (water colour, weed)" : "Enter conditions"}</button>
    </section>
  );
}

function RiverCard({ river, preview }) {
  return (
    <section className="card">
      <div className="card-h"><h2>River level</h2><span className="aside">{river?.source ? "Environment Agency" : ""}</span></div>
      {river?.source ? (
        <>
          <div className="kv">
            <div><span className="k">Station</span><span className="v">{river.station?.name}{river.station?.distanceKm != null ? ` (${fmtKm(river.station.distanceKm)})` : ""}</span></div>
            <div><span className="k">Level</span><span className="v">{river.readings?.at(-1)?.levelM?.toFixed(2)} m</span></div>
            <div><span className="k">State</span><span className="v">{river.state}, {river.trend}</span></div>
          </div>
          {river.floods?.length ? river.floods.map((f, i) => <Notice key={i} kind={f.level <= 2 ? "danger" : "warn"}><b>{f.severity}:</b> {f.area}</Notice>) : <p className="tiny">No flood alerts or warnings within {fmtKm(20, true)}.</p>}
          {river.state === "high" && river.trend === "rising" ? <Notice kind="danger"><b>Rising river.</b> Banks undercut and give way in high water. Stay well back from the edge.</Notice> : null}
        </>
      ) : <p className="small muted">{preview ? "River levels and flood warnings connect on the deployed app (Environment Agency, England)." : river?.note || river?.message || "No river level station close enough. Check the river yourself before you set up."}</p>}
    </section>
  );
}

function HowSheet({ day, kind, onClose }) {
  const W = day?.weights || {};
  const names = { light: "Light (dawn, dusk, night)", tide: "Tide state and size", water: "River level and flow", weather: "Weather (pressure, wind, sea, temperature)", season: "Season for this species", moon: "Solunar (moon position)" };
  return (
    <Sheet title="How BiteScore works" onClose={onClose}>
      <p className="small">BiteScore rates each half hour out of 100 for one species at one place. It adds up the factors below, each scored from rules of thumb that anglers and fisheries guides agree on, weighted like this:</p>
      <div className="stack">{Object.entries(W).map(([k, w]) => (
        <div key={k} className="weight-row"><span>{names[k] || k}</span><span className="bar"><i style={{ width: `${w * 100 / 0.36}%` }} /></span><b className="num">{Math.round(w * 100)}%</b></div>
      ))}</div>
      <p className="small muted">Species change the rules: wrasse feed in daylight, cod and whiting after dark, bass on the flood and at dusk, barbel as a river fines down after rain. Out-of-season species are capped at 35.</p>
      <p className="small"><b>Confidence</b> says how much live data went in: <b>high</b> with official tides and live weather, <b>medium</b> when one is missing, <b>low</b> when tides are estimated or nothing live is known. Unknown factors count as average rather than being guessed.</p>
      {day?.missing.length ? <Notice kind="warn">Missing right now: {day.missing.join(", ")}.</Notice> : null}
      <p className="tiny">FishDock will check BiteScore against anglers' logged catches (with permission) before it leaves Beta.</p>
    </Sheet>
  );
}

function ManualConditions({ onClose }) {
  const { place, settings, update, say } = useApp();
  const cur = settings.manualConditions?.[place.id] || {};
  const [v, setV] = useState({ wind: cur.wind || "light", colour: cur.colour || "slight", pressure: cur.pressure || "steady" });
  const save = () => {
    const windKph = { calm: 5, light: 15, fresh: 30, strong: 45 }[v.wind];
    const pressureTrend = { falling: -2, steady: 0, rising: 2 }[v.pressure];
    const manual = { windKph, pressureTrend, label: `${v.wind} wind, ${v.colour} colour, pressure ${v.pressure}`, ...v, at: Date.now() };
    update((s) => ({ manualConditions: { ...(s.manualConditions || {}), [place.id]: manual } }));
    say("Conditions saved for this place");
    onClose();
  };
  return (
    <Sheet title="What you can see" onClose={onClose} aside="Used when live weather isn't available">
      <div className="cond-row"><span>Wind</span><Seg value={v.wind} onChange={(x) => setV({ ...v, wind: x })} options={["calm", "light", "fresh", "strong"]} /></div>
      <div className="cond-row"><span>Water colour</span><Seg value={v.colour} onChange={(x) => setV({ ...v, colour: x })} options={["clear", "slight", "coloured", "very coloured"]} /></div>
      <div className="cond-row"><span>Pressure (from a forecast or barometer)</span><Seg value={v.pressure} onChange={(x) => setV({ ...v, pressure: x })} options={["falling", "steady", "rising"]} /></div>
      <button type="button" className="btn primary block" onClick={save}>Save</button>
    </Sheet>
  );
}
