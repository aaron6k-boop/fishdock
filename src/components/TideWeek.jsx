// ---- TideWeek: high and low water for the next seven days, one row per UK day (estimate or Admiralty, as labelled) ----
import { useState } from "react";
import { ukDayStart, addUkDays, fmtTime, fmtShortDay } from "../lib/time.js";

export default function TideWeek({ tide, now = Date.now() }) {
  const [open, setOpen] = useState(false);
  if (!tide?.events?.length) return null;
  const d0 = ukDayStart(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const s = addUkDays(d0, i), e = addUkDays(d0, i + 1);
    return { s, ev: tide.events.filter((x) => x.t >= s && x.t < e) };
  }).filter((d) => d.ev.length);
  if (!days.length) return null;
  return (
    <details className="tide-week" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Tide times this week</summary>
      <table>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.s}>
              <th scope="row">{i === 0 ? "Today" : fmtShortDay(d.s).replace(/ \w+$/, "")}</th>
              <td>{d.ev.map((x, j) => <span key={j} className={x.type === "HW" ? "hw" : "lw"}>{x.type === "HW" ? "High" : "Low"} {fmtTime(x.t)}{x.h != null ? ` (${x.h.toFixed(1)} m)` : ""}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny">{tide.source === "estimate" ? `Estimated from ${tide.station?.name || "the nearest port"}: can be out by about an hour.` : tide.label}</p>
    </details>
  );
}
