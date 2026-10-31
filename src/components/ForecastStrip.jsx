// ---- ForecastStrip: the next 36 hours every 2 hours, as anglers read it: sky, temperature, wind (arrow points where
// the wind is going), gusts, rain and waves. Scrolls sideways; the current hour is first. ----
import { fmtTime } from "../lib/time.js";

const H = 3600e3;
const mph = (kph) => Math.round(kph * 0.621);

function Sky({ cloud, rain, day }) {
  // Simple, legible weather glyphs drawn in SVG (no icon font, no network)
  const sun = day !== 0;
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="fc-sky">
      {cloud < 60 ? (sun
        ? <g className="sun"><circle cx="14" cy="13" r="5.5" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1={14 + 8 * Math.cos(a * Math.PI / 180)} y1={13 + 8 * Math.sin(a * Math.PI / 180)} x2={14 + 10.5 * Math.cos(a * Math.PI / 180)} y2={13 + 10.5 * Math.sin(a * Math.PI / 180)} />)}</g>
        : <path className="moon" d="M19 6a8 8 0 1 0 6 13A7 7 0 0 1 19 6z" />) : null}
      {cloud >= 25 ? <path className="cloud" d={cloud < 60 ? "M12 25h12a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.5A3.8 3.8 0 0 0 12 25z" : "M8 23h16a5 5 0 0 0 0-10 7 7 0 0 0-13.4 1.8A4.2 4.2 0 0 0 8 23z"} /> : null}
      {rain >= 0.2 ? <g className="rain">{[11, 16, 21].slice(0, rain >= 2 ? 3 : rain >= 0.8 ? 2 : 1).map((x) => <line key={x} x1={x} y1="26" x2={x - 2} y2="30.5" />)}</g> : null}
    </svg>
  );
}

function WindArrow({ dir }) {
  if (dir == null) return null;
  // Meteorological direction is where the wind comes FROM; the arrow shows where it blows TO.
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="fc-wind" style={{ transform: `rotate(${(dir + 180) % 360}deg)` }}>
      <path d="M10 2 15 12h-3.5v6h-3v-6H5z" />
    </svg>
  );
}

/** cond: the /api/conditions answer. now: ms. sea: show waves. */
export default function ForecastStrip({ cond, now = Date.now(), sea = false }) {
  const hourly = cond?.hourly || [];
  if (!hourly.length) return null;
  const marine = cond.marine?.hourly || [];
  const start = now - H;
  const cols = hourly.filter((h) => { const t = Date.parse(h.t); return t >= start && t <= now + 36 * H; })
    .filter((_, i) => i % 2 === 0).slice(0, 18)
    .map((h) => ({ ...h, ms: Date.parse(h.t), wave: marine.find((m) => Math.abs(Date.parse(m.t) - Date.parse(h.t)) < 1.1 * H)?.waveM ?? null }));
  if (!cols.length) return null;
  const maxGust = Math.max(...cols.map((c) => c.gustKph || 0));
  return (
    <div className="fc-strip" role="list" aria-label="Forecast, every two hours">
      {cols.map((c, i) => {
        const strong = (c.gustKph || 0) >= 50 || (c.windKph || 0) >= 35;
        const newDay = i > 0 && new Date(c.ms).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) !== new Date(cols[i - 1].ms).toLocaleDateString("en-GB", { timeZone: "Europe/London" });
        return (
          <div key={c.t} className={`fc-col${i === 0 ? " now" : ""}${newDay ? " newday" : ""}`} role="listitem"
            aria-label={`${fmtTime(c.ms)}: ${c.tempC ?? "?"} degrees, wind ${c.windKph != null ? mph(c.windKph) : "?"} miles an hour${c.gustKph ? `, gusts ${mph(c.gustKph)}` : ""}${c.precipMm ? `, rain ${c.precipMm} millimetres` : ""}${sea && c.wave != null ? `, waves ${c.wave} metres` : ""}`}>
            <span className="fc-time">{i === 0 ? "Now" : newDay ? new Date(c.ms).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short" }) : fmtTime(c.ms).slice(0, 2)}</span>
            <Sky cloud={c.cloudPct ?? 0} rain={c.precipMm ?? 0} day={c.isDay} />
            <span className="fc-temp">{c.tempC != null ? `${Math.round(c.tempC)}°` : "–"}</span>
            <span className={`fc-windv${strong ? " strong" : ""}`}><WindArrow dir={c.windDir} />{c.windKph != null ? mph(c.windKph) : "–"}</span>
            <span className="fc-gust" title="Gusts, mph">{c.gustKph ? mph(c.gustKph) : ""}</span>
            <span className="fc-rainbar" title="Rain"><i style={{ height: `${Math.min(100, (c.precipMm || 0) * 40)}%` }} /></span>
            {sea ? <span className="fc-wave">{c.wave != null ? `${c.wave.toFixed(1)}m` : "–"}</span> : null}
          </div>
        );
      })}
      <div className="fc-key" aria-hidden="true">
        <span>mph</span><span>gust</span><span>rain</span>{sea ? <span>waves</span> : null}
        {maxGust >= 50 ? <span className="strong">strong</span> : null}
      </div>
    </div>
  );
}
