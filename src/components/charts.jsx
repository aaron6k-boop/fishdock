// ---- charts: BiteScore timeline, tide curve, sonar spot finder ----
import { band } from "../lib/bitescore.js";
import { fmtTime, ukHour } from "../lib/time.js";
import { distanceKm, bearingDeg, fmtKm, distanceUnit } from "../lib/geo.js";

export function BiteStrip({ day, sun, tide, now = Date.now(), onPick, picked }) {
  if (!day) return null;
  const start = day.slots[0].t - 900e3, span = 864e5;
  const pos = (t) => `${Math.max(0, Math.min(100, ((t - start) / span) * 100))}%`;
  const marks = [];
  if (sun?.sunrise) marks.push({ t: sun.sunrise, cls: "m-sun", label: "↑ " + fmtTime(sun.sunrise) });
  if (sun?.sunset) marks.push({ t: sun.sunset, cls: "m-sun", label: "↓ " + fmtTime(sun.sunset) });
  for (const e of tide?.events || []) if (e.type === "HW" && e.t >= start && e.t < start + span) marks.push({ t: e.t, cls: "m-hw", label: "HW " + fmtTime(e.t) });
  const showNow = now >= start && now < start + span;
  // Stagger labels that would collide onto a second line.
  marks.sort((a, b) => a.t - b.t);
  const lastX = [-1, -1];
  for (const m of marks) {
    const x = ((m.t - start) / span) * 100;
    m.row = x - lastX[0] >= 17 ? 0 : x - lastX[1] >= 17 ? 1 : 0;
    lastX[m.row] = x;
  }
  return (
    <div className="strip-wrap">
      <div className="strip" role="img" aria-label="BiteScore through the day, half-hour bars">
        {day.slots.map((s, i) => {
          const b = band(s.score);
          return (
            <i key={i} className={`l${b.level}${s.t + 900e3 < now ? " past" : ""}${picked === i ? " picked" : ""}`} style={{ height: `${Math.max(4, s.score)}%` }}
              onClick={onPick ? () => onPick(i) : undefined} title={`${fmtTime(s.t - 900e3)}: ${s.score} (${b.label})`} />
          );
        })}
      </div>
      {showNow ? <span className="strip-now" style={{ left: pos(now) }} /> : null}
      <div className="strip-axis num"><span>00</span><span>03</span><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span></div>
      <div className={`strip-marks${marks.some((m) => m.row) ? " two" : ""}`}>{marks.map((m, i) => <span key={i} className={m.cls} style={{ left: `clamp(24px, ${pos(m.t)}, calc(100% - 24px))`, top: m.row ? 15 : 0 }}>{m.label}</span>)}</div>
    </div>
  );
}

export function TideChart({ tide, dayStart, now = Date.now() }) {
  if (!tide) return null;
  const W = 340, H = 132, pad = 22, top = 18, bottom = H - 34;
  const span = 864e5;
  const lo = tide.heights ? tide.minH : -1.1, hi = tide.heights ? tide.maxH : 1.1;
  const yOf = (h) => bottom - ((h - lo) / (hi - lo || 1)) * (bottom - top);
  const xOf = (t) => pad + ((t - dayStart) / span) * (W - pad * 2);
  const pts = [];
  for (let i = 0; i <= 96; i++) { const t = dayStart + (i / 96) * span; pts.push([xOf(t), yOf(tide.heightAt(t))]); }
  const d = "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" L");
  const area = `${d} L${xOf(dayStart + span).toFixed(1)},${bottom} L${pad},${bottom} Z`;
  const evs = tide.events.filter((e) => e.t >= dayStart && e.t <= dayStart + span);
  const showNow = now >= dayStart && now <= dayStart + span;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tide-svg" role="img" aria-label="Tide height through the day">
      {[0, 6, 12, 18, 24].map((h) => <g key={h}><line x1={xOf(dayStart + h * 3600e3)} x2={xOf(dayStart + h * 3600e3)} y1={top - 6} y2={bottom} className="grid" /><text x={xOf(dayStart + h * 3600e3) - 6} y={H - 6}>{String(h % 24).padStart(2, "0")}</text></g>)}
      <path d={area} className="area" />
      <path d={d} className="curve" />
      {evs.map((e, i) => (
        <g key={i}>
          <circle cx={xOf(e.t)} cy={yOf(tide.heightAt(e.t))} r="3.5" className="dot" />
          <text x={Math.min(W - 70, Math.max(2, xOf(e.t) - 18))} y={e.type === "HW" ? yOf(tide.heightAt(e.t)) - 7 : yOf(tide.heightAt(e.t)) + 16} className={e.type === "HW" ? "hw" : ""}>
            {e.type} {fmtTime(e.t)}{e.h != null ? ` ${e.h.toFixed(1)}m` : ""}
          </text>
        </g>
      ))}
      {showNow ? <line x1={xOf(now)} x2={xOf(now)} y1={top - 6} y2={bottom} className="nowline" /> : null}
    </svg>
  );
}

/** Sonar: spots around a centre by bearing and distance (log scale). Works with no map tiles at all. */
export function Sonar({ center, spots, onPick, selected }) {
  const C = 200, R = 178;
  // ring distances in km, chosen to be round numbers in the unit shown
  const rings = distanceUnit() === "km" ? [5, 20, 60, 150] : [3, 12, 40, 90].map((mi) => mi * 1.609344);
  const rOf = (km) => Math.min(R, (Math.log10(1 + km) / Math.log10(1 + 160)) * R);
  const pts = spots.map((s) => {
    const km = distanceKm(center, s), b = bearingDeg(center, s) * Math.PI / 180, r = rOf(km);
    return { s, km, x: C + r * Math.sin(b), y: C - r * Math.cos(b), out: km > 160 };
  }).filter((p) => !p.out);
  return (
    <svg viewBox="0 0 400 400" className="sonar" role="img" aria-label="Spots around you by direction and distance">
      <defs>
        <radialGradient id="sweepGrad" cx="200" cy="200" r="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" /><stop offset="1" stopColor="currentColor" stopOpacity="0.16" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} className="bg" />
      <path d={`M${C},${C} L${C},${C - R} A${R},${R} 0 0 1 ${C + R * Math.sin(0.6)},${C - R * Math.cos(0.6)} Z`} className="sweep" />
      {rings.map((km) => <g key={km}><circle cx={C} cy={C} r={rOf(km)} className="ring" /><text x={C + 4} y={C - rOf(km) + 12}>{fmtKm(km)}</text></g>)}
      {[0, 45, 90, 135].map((a) => <line key={a} x1={C + R * Math.sin(a * Math.PI / 180)} y1={C - R * Math.cos(a * Math.PI / 180)} x2={C - R * Math.sin(a * Math.PI / 180)} y2={C + R * Math.cos(a * Math.PI / 180)} className="spoke" />)}
      <text x={C - 4} y={C - R - 6} className="lbl-n">N</text>
      {pts.map(({ s, x, y, km }) => (
        <g key={s.id} onClick={() => onPick?.(s)} style={{ cursor: "pointer" }}>
          <title>{`${s.name}, ${fmtKm(km)}`}</title>
          <circle cx={x} cy={y} r={selected === s.id ? 7 : 5} className={s.kind === "sea" ? "dot-sea" : "dot-fresh"} />
          {selected === s.id ? <circle cx={x} cy={y} r="11" className="ring" /> : null}
          <circle cx={x} cy={y} r="14" className="dot-hit" />
        </g>
      ))}
      <circle cx={C} cy={C} r="5" className="me" />
    </svg>
  );
}

export function hourLabel(ms) { return `${String(Math.floor(ukHour(ms))).padStart(2, "0")}:00`; }
