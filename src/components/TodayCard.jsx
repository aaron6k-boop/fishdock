// ---- TodayCard: actual clock times for a place today. BiteScore windows, high and low water, the mark's own
// tide preference turned into times, first light and dusk, and the best day this week. Used on spot and pin sheets.
import { useEffect, useMemo, useState } from "react";
import ASTRO from "../lib/astro.js";
import { biteDay, band, biteProfile } from "../lib/bitescore.js";
import { tideModel, tideWindows } from "../lib/tides.js";
import { autoTarget } from "../lib/catchhere.js";
import { getConditions, getTides } from "../lib/api.js";
import RemindButton from "./RemindButton.jsx";
import { ukDayStart, ukMonth, fmtTime, fmtShortDay, monthsText, addUkDays } from "../lib/time.js";

const PREF_WORDS = { flood: "on the flood (low to high water)", ebb: "on the ebb (high to low water)", high: "around high water", low: "around low water", moving: "while the tide is moving" };
const range = (w) => `${fmtTime(w.start)} to ${fmtTime(w.end)}`;
const dayTag = (t, dayStart) => (t >= addUkDays(dayStart, 1) ? ` ${fmtShortDay(t).split(" ")[0]}` : "");

/** spot: { lat, lon, kind, subtype, tidePref?, name }. here: catchHere(spot) for the species chips. */
export default function TodayCard({ spot, here, borrowed = null }) {
  const [live, setLive] = useState({ cond: null, tides: null });
  const [targetId, setTargetId] = useState(null);
  const sea = spot.kind === "sea";
  useEffect(() => {
    let gone = false;
    Promise.all([getConditions(spot.lat, spot.lon), sea ? getTides(spot.lat, spot.lon) : Promise.resolve(null)])
      .then(([cond, tides]) => { if (!gone) setLive({ cond, tides }); });
    return () => { gone = true; };
  }, [spot.lat, spot.lon, sea]);

  const now = Date.now();
  const dayStart = ukDayStart(now);
  const month = ukMonth(now);
  const inSeason = (here || []).filter((r) => r.inSeason !== "out");
  const target = (targetId && inSeason.find((r) => r.species.id === targetId)?.species) || autoTarget(spot, month);
  const tide = useMemo(() => (sea ? tideModel(spot, live.tides) : null), [spot, sea, live.tides]);
  const cond = live.cond?.hourly?.length ? live.cond : null;
  const sun = useMemo(() => ASTRO.sunDay(dayStart, spot.lat, spot.lon), [dayStart, spot.lat, spot.lon]);
  const days = useMemo(() => (target ? [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const ds = addUkDays(dayStart, i);
    const d = biteDay({ place: spot, species: target, dayStart: ds, tide, cond, river: null, now });
    const windows = i === 0 ? d.windows.filter((x) => x.end > now) : d.windows;
    return { ds, i, windows, d, best: [...windows].sort((a, b) => b.peak - a.peak)[0] || null };
  }) : []), [spot, target, dayStart, tide, cond]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target) return null;
  const today = days[0];
  const showDay = today?.windows.length ? today : days[1];
  const bestDay = days.filter((x) => x.best).sort((a, b) => b.best.peak - a.best.peak)[0];
  const next24 = tide ? tide.events.filter((e) => e.t > now - 1800e3 && e.t < now + 24 * 3600e3).slice(0, 4) : [];
  const pref = spot.tidePref || borrowed?.pref || null;
  const prefWins = sea && pref ? tideWindows(tide, pref, now, now + 24 * 3600e3).slice(0, 2) : [];
  const fishPref = sea ? biteProfile(target).tide : null;
  const peakSlot = showDay?.best ? showDay.d.slots.filter((s) => s.t >= showDay.best.start && s.t <= showDay.best.end).sort((a, b) => b.score - a.score)[0] : null;

  return (
    <section className="card today-card">
      <div className="card-h"><h2>{showDay === today ? "Best times today" : "Best times tomorrow"}</h2><span className="aside">{target.name}</span></div>
      {inSeason.length > 1 ? (
        <div className="chips scroll" role="group" aria-label="Species">
          {inSeason.slice(0, 8).map((r) => <button key={r.species.id} type="button" className="chip" aria-pressed={target.id === r.species.id} onClick={() => setTargetId(r.species.id)}>{r.species.name}</button>)}
        </div>
      ) : null}
      {showDay?.windows.length ? (
        <div className="windows">{showDay.windows.map((x, i) => <div className="window" key={i}><b>{fmtTime(x.start)}–{fmtTime(x.end)}</b><span>Peak {x.peak}, {band(x.peak).label}</span></div>)}</div>
      ) : <p className="small muted">No stand-out window in the next two days.</p>}
      {showDay?.best ? <div className="row"><RemindButton win={showDay.best} where={spot.name} species={target.name} /><span className="tiny">Adds the best window to your calendar</span></div> : null}
      <div className="kv">
        {next24.map((e, i) => <div key={i}><span className="k">{e.type === "HW" ? "High water" : "Low water"}</span><span className="v">{fmtTime(e.t)}{dayTag(e.t, dayStart)}</span></div>)}
        <div><span className="k">First light</span><span className="v">{fmtTime(sun.dawn)}</span></div>
        <div><span className="k">Sunrise</span><span className="v">{fmtTime(sun.sunrise)}</span></div>
        <div><span className="k">Sunset</span><span className="v">{fmtTime(sun.sunset)}</span></div>
        <div><span className="k">Last light</span><span className="v">{fmtTime(sun.dusk)}</span></div>
      </div>
      <ul className="small tips">
        {prefWins.length ? <li><b>{spot.tidePref ? "This mark fishes" : `${borrowed.name}, nearby, fishes`} {PREF_WORDS[pref]}:</b> {prefWins.map((w) => `${range(w)}${dayTag(w.start, dayStart)}`).join(" and ")}.</li> : null}
        {sea && fishPref && fishPref !== pref ? <li>{target.name} usually feed best {PREF_WORDS[fishPref] || fishPref}.</li> : null}
        {peakSlot?.f.tideState ? <li>Tide in the best window: {peakSlot.f.tideState.toLowerCase()}.</li> : null}
        {bestDay?.best ? <li>Best day this week: {bestDay.i === 0 ? "today" : fmtShortDay(bestDay.ds)}, {range(bestDay.best)} (peak {bestDay.best.peak}).</li> : null}
        {target.peak?.length ? <li>Best months for {target.name.toLowerCase()}: {monthsText(target.peak)}.</li> : null}
      </ul>
      <p className="tiny">{cond ? "Uses live weather for the area" : "Live weather not loaded yet"}{sea ? (tide?.source === "estimate" ? `; tides estimated from ${tide.station?.name}, which can be out by an hour, so check official times` : tide ? `; ${tide.label}` : "; no tide station close enough") : ""}. A guide, not a promise.</p>
    </section>
  );
}
