// ---- ui: icons and small shared components ----
import { useEffect, useRef } from "react";

const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  explore: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  live: "M4 20 18.5 5.5 M18.5 5.5c1.2-1.2 2.3-1 2.5-.8M15 9l-2-2 M12 12l-2-2 M18.5 5.5v8.3a2.2 2.2 0 1 1-4.4 0",
  tackle: "M14 3v9.5a4.5 4.5 0 1 1-9 0V11 M5 11l-2 2 M14 3h3",
  catches: "M2 12c3.5-5 9-6.5 14-3l3-2.5V17.5L16 15c-5 3.5-10.5 2-14-3z M8 11.2v.1",
  more: "M4 6h16 M4 12h16 M4 18h16",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  scan: "M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M8 12h8",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z",
  wave: "M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2",
  wind: "M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7",
  gauge: "M4 18a8 8 0 1 1 16 0 M12 18l4-6",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  thermo: "M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z",
  river: "M5 3c4 3-2 6 2 9s-2 6 2 9 M14 3c4 3-2 6 2 9s-2 6 2 9",
  pin: "M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z M12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4",
  chevron: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  back: "M15 6l-6 6 6 6",
  close: "M6 6l12 12 M18 6 6 18",
  plus: "M12 5v14 M5 12h14",
  share: "M12 3v12 M7 8l5-5 5 5 M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  warn: "M12 3 2 20h20L12 3z M12 10v4 M12 17v.1",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8v.1",
  beta: "M9 3h6 M10 3v6l-5 9a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 18l-5-9V3 M7.5 14h9",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8",
  play: "M7 4v16l13-8z",
  pause: "M7 4h4v16H7z M13 4h4v16h-4z",
  stop: "M6 6h12v12H6z",
  flag: "M5 21V4 M5 4h12l-2 4 2 4H5",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  fish: "M2 12c3.5-5 9-6.5 14-3l3-2.5V17.5L16 15c-5 3.5-10.5 2-14-3z",
  hook: "M14 3v9.5a4.5 4.5 0 1 1-9 0V11 M5 11l-2 2",
  bait: "M5 12c0-4 3-7 7-7s7 3 7 7-3 7-7 7 M12 19c-3 0-5-2-5-4.5",
  rig: "M12 2v6 M12 8a1.5 1.5 0 1 0 0 .1 M12 10v4 M9 14h6l-3 4z M12 18v2",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff: "M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8 M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12v.1",
  layers: "M12 3 2 8l10 5 10-5-10-5z M2 13l10 5 10-5 M2 18l10 5 10-5",
  locate: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 2v3 M12 19v3 M2 12h3 M19 12h3",
  edit: "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  check: "M5 12.5l4.5 4.5L19 7",
  copy: "M9 9h10v11H9z M5 15V4h10",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z",
  flask: "M9 3h6 M10 3v6l-5 9a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 18l-5-9V3",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M6 11a6 6 0 0 0 12 0 M12 17v4",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
};

export function Icon({ name, size, className, title }) {
  const d = P[name] || P.info;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {d.split(" M").map((seg, i) => <path key={i} d={i ? "M" + seg : seg} />)}
    </svg>
  );
}

export function Beta({ label = "Beta" }) {
  return <span className="beta-badge" title="Experimental: still being field tested">{label}</span>;
}

export function Notice({ kind = "", icon, children }) {
  return (
    <div className={`notice ${kind}`} role={kind === "danger" ? "alert" : undefined}>
      <Icon name={icon || (kind === "warn" || kind === "danger" ? "warn" : "info")} />
      <div>{children}</div>
    </div>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value, l = typeof o === "string" ? o : o.label;
        return <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>;
      })}
    </div>
  );
}

export function Tabs({ value, options, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => <button key={o.value} role="tab" type="button" aria-selected={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

// Sheets can open on top of sheets (a species from a spot, say). The page behind stays locked until the last one
// closes, whatever order React runs their clean-ups in.
let openSheets = 0, savedOverflow = "";
const sheetStack = []; let sheetSeq = 0; // Escape closes only the sheet on top
function lockPage() {
  if (openSheets++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
}
function unlockPage() {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) document.body.style.overflow = savedOverflow === "hidden" ? "" : savedOverflow;
}

export function Sheet({ title, onClose, children, wide, aside }) {
  const ref = useRef(null);
  // The latest onClose, read through a ref so a parent re-render (live data, the clock) doesn't re-run this
  // effect and pull focus back to the sheet while someone is typing in it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const myId = ++sheetSeq;
    sheetStack.push(myId);
    const onKey = (e) => { if (e.key === "Escape" && sheetStack[sheetStack.length - 1] === myId) { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    lockPage();
    return () => { document.removeEventListener("keydown", onKey); const at = sheetStack.indexOf(myId); if (at >= 0) sheetStack.splice(at, 1); unlockPage(); prev?.focus?.(); };
  }, []);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-grab" />
        <div className="sheet-h">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}><h2>{title}</h2>{aside ? <div className="tiny">{aside}</div> : null}</div>
          <button className="xbtn" type="button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MonthStrip({ peak = [], present = [], current }) {
  return (
    <div className="stack" style={{ gap: 3 }}>
      <div className="months" aria-label="Seasonal activity by month">
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const cls = peak.includes(m) ? "on" : present.includes(m) ? "some" : "";
          return <i key={m} className={`${cls}${m === current ? " cur" : ""}`} title={`${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]}: ${cls === "on" ? "peak" : cls === "some" ? "present" : "scarce"}`} />;
        })}
      </div>
      <div className="months-lbl">{"JFMAMJJASOND".split("").map((c, i) => <span key={i}>{c}</span>)}</div>
    </div>
  );
}

export function Sources({ list }) {
  if (!list?.length) return null;
  return (
    <div className="src">
      <span>Sources:</span>
      {list.slice(0, 6).map((u, i) => {
        let host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { /* keep */ }
        return <a key={i} href={u} target="_blank" rel="noopener noreferrer">{host}</a>;
      })}
    </div>
  );
}

export function Empty({ icon = "fish", title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children ? <div className="small muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function Toast({ text }) {
  return text ? <div className="toast" role="status">{text}</div> : null;
}

export function Meter({ value }) {
  return <div className="meter" aria-hidden="true"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></div>;
}
