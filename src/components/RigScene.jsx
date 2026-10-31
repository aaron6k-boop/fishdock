// ---- RigScene: a rig drawn as it sits in the water, from its `diagram` list (rod end first, hook end last) ----
// Bottom rigs lie on the sea or river bed with the lead planted and the hooklength trailing off it; paternosters run
// down to the lead with their snoods standing off the body; float rigs hang under a float at the surface; lure rigs
// swim in mid-water. Each part is drawn as the real item (barrel swivel, grip lead with its wires, cage feeder, float,
// hook with bait) and named. A picture to recognise the rig by, not to scale.
import { useId } from "react";

const W = 360;
const PAL = {
  sea: { top: "#2a7389", deep: "#0f3442", bed: "#cdb98c", bed2: "#a08c63", grain: "#efe2c0", weed: "#3f6b4c" },
  fresh: { top: "#4b7a5f", deep: "#1b3527", bed: "#8b7957", bed2: "#5f513a", grain: "#b8a77f", weed: "#557a3a" },
};
const NAMES = { line: "Mainline", leader: "Leader", bead: "Bead", stop: "Stop knot", swivel: "Swivel", float: "Float", shot: "Shot", lead: "Lead", snood: "Snood", clip: "Bait clip", wire: "Wire trace", hooklength: "Hooklength", dropper: "Dropper", hook: "Hook", lure: "Lure", trebles: "Trebles" };
const SEGMENTS = new Set(["line", "leader", "hooklength", "wire"]);
const LINE = { line: { c: "#eef3f2", w: 1.4 }, braid: { c: "#f2d36b", w: 1.4 }, leader: { c: "#f7f7f2", w: 2.6 }, hooklength: { c: "#f4c7c3", w: 1.1 }, wire: { c: "#c9ccd0", w: 1.5 } };

// ---- small geometry ----
const lerp = (a, b, t) => a + (b - a) * t;
function along(route, t) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); segs.push(d); total += d; }
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, want / segs[i]) : 0, a = route[i], b = route[i + 1];
      return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), ang: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    }
    want -= segs[i];
  }
  return { x: route[0][0], y: route[0][1], ang: 0 };
}
function tAt(route, k) {
  let total = 0, upto = 0;
  for (let i = 1; i < route.length; i++) { const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); total += d; if (i <= k) upto += d; }
  return total ? upto / total : 0;
}
function slice(route, t0, t1, n = 16) { const out = []; for (let i = 0; i <= n; i++) { const p = along(route, lerp(t0, t1, i / n)); out.push([p.x, p.y]); } return out; }
function curve(a, b, sag, n = 18) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + Math.sin(t * Math.PI) * sag]); } return out; }
const d = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
const at = (p, rot = true) => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})${rot ? ` rotate(${p.ang.toFixed(1)})` : ""}`;

// ---- the tackle itself, each drawn about the origin ----
function Bait({ kind }) {
  if (kind === "boilie") return <g><path d="M0 0 q4 6 0 11" className="rs-hair" /><circle cx="0" cy="15" r="5.2" fill="#e2c48a" stroke="#8a6a3a" strokeWidth="0.8" /><circle cx="-1.6" cy="13.4" r="1.4" fill="#fff" opacity="0.5" /></g>;
  if (kind === "maggots") return <g fill="#f3ead2" stroke="#b9a77c" strokeWidth="0.6">{[[-3, 7, 30], [2, 9, -20], [-1, 12, 60]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="1.4" transform={`rotate(${r} ${x} ${y})`} />)}</g>;
  if (kind === "plastic") return <path d="M-2 6 q8 -2 16 2 l6 -4 l-2 6 l2 6 l-6 -4 q-8 4 -16 2 z" fill="#86c46a" stroke="#3e6b2e" strokeWidth="0.8" />;
  // worm: lug or rag, wrapped down the shank
  return <path d="M1 3 q5 3 0 6 q-5 3 0 6 q5 3 1 7" fill="none" stroke="#b5654f" strokeWidth="3.4" strokeLinecap="round" />;
}
function Hook({ bait = "worm", two }) {
  const one = (dx = 0) => (
    <g transform={`translate(${dx} 0)`}>
      <path d="M0 0 v14 a5.5 5.5 0 0 0 11 0 v-4 l-2.4 2.6" className="rs-hook" />
      <circle cx="0" cy="-1.4" r="1.6" className="rs-hookeye" />
    </g>
  );
  return <g>{one()}{two ? one(14) : null}{bait ? <g transform="translate(2 0)"><Bait kind={bait} /></g> : null}</g>;
}
const Bead = () => <g><circle r="3.8" fill="url(#rsBead)" /><circle cx="-1.2" cy="-1.3" r="1" fill="#fff" opacity="0.7" /></g>;
const Stop = () => <g><rect x="-1.6" y="-4" width="3.2" height="8" rx="1.2" fill="#1b1d1f" /><rect x="-0.6" y="-3.2" width="0.9" height="6.4" fill="#5a5f63" /></g>;
const Swivel = () => <g><circle cx="-7" r="2.6" className="rs-ring" /><rect x="-4.6" y="-2.6" width="9.2" height="5.2" rx="2.4" fill="url(#rsMetal)" stroke="#5c6166" strokeWidth="0.6" /><circle cx="7" r="2.6" className="rs-ring" /></g>;
const Clip = () => <g><path d="M-3 -1 v7 q3 3 6 0 v-4" className="rs-ring" /></g>;
const Shot = ({ big }) => <g><circle r={big ? 5.2 : 2.7} fill="url(#rsLead)" /><circle cx={big ? -1.6 : -0.8} cy={big ? -1.8 : -0.9} r={big ? 1.4 : 0.7} fill="#fff" opacity="0.5" /></g>;
function Lead({ kind }) {
  if (kind === "grip") return <g><path d="M-9 -4 l-7 6 M-9 -4 l-4 9 M9 -4 l7 6 M9 -4 l4 9" className="rs-wire" /><path d="M0 -22 l8 6 l3 14 h-22 l3 -14 z" fill="url(#rsLead)" stroke="#4a4f53" strokeWidth="0.7" /><circle cx="0" cy="-24" r="2" className="rs-ring" /></g>;
  if (kind === "feeder") return <g><rect x="-7" y="-26" width="14" height="22" rx="2" fill="#7d5a34" /><path d="M-7 -21 h14 M-7 -15 h14 M-7 -9 h14 M-3 -26 v22 M3 -26 v22" stroke="#d6dadc" strokeWidth="1" /><rect x="-7" y="-26" width="14" height="22" rx="2" fill="none" stroke="#c4c9cc" strokeWidth="1.2" /><rect x="-7" y="-5" width="14" height="5" rx="1" fill="url(#rsLead)" /></g>;
  if (kind === "method") return <g><ellipse cx="0" cy="-9" rx="12" ry="9" fill="#8a6338" /><g fill="#b88b55">{[[-5, -12], [3, -14], [6, -7], [-2, -6], [-7, -6]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" />)}</g><path d="M-12 -4 h24" stroke="#2c2f31" strokeWidth="2" /></g>;
  if (kind === "dropshot") return <g><rect x="-3.5" y="-16" width="7" height="16" rx="3.4" fill="url(#rsLead)" stroke="#4a4f53" strokeWidth="0.6" /><circle cx="0" cy="-17.5" r="1.6" className="rs-ring" /></g>;
  return <g><path d="M0 -20 c6 6 9 11 9 15 a9 7 0 0 1 -18 0 c0 -4 3 -9 9 -15 z" fill="url(#rsLead)" stroke="#4a4f53" strokeWidth="0.7" /><circle cx="0" cy="-22" r="2" className="rs-ring" /></g>;
}
function Float({ kind }) {
  // drawn standing on the surface at y 0
  if (kind === "waggler") return <g><rect x="-2" y="-12" width="4" height="9" rx="1" fill="#f06a2a" /><rect x="-2.2" y="-3" width="4.4" height="40" rx="2" fill="#d8cfb8" stroke="#7a705c" strokeWidth="0.5" /><circle cy="38" r="1.6" className="rs-ring" /></g>;
  if (kind === "stick") return <g><path d="M-2 -12 h4 v8 h-4 z" fill="#f06a2a" /><path d="M-2 -4 h4 l2.5 22 q-4.5 6 -9 0 z" fill="#e9e1cf" stroke="#7a705c" strokeWidth="0.5" /><path d="M0 24 v6" stroke="#2a2a2a" strokeWidth="1.4" /></g>;
  if (kind === "pike") return <g><path d="M-3 -18 h6 v6 h-6 z" fill="#f2c230" /><ellipse cx="0" cy="-2" rx="9" ry="12" fill="#e2401f" stroke="#7a2412" strokeWidth="0.7" /><ellipse cx="0" cy="6" rx="8.4" ry="5.6" fill="#f4f1e8" opacity="0.92" /><path d="M0 10 v8" stroke="#2a2a2a" strokeWidth="1.4" /></g>;
  return <g><path d="M-2 -18 h4 v8 h-4 z" fill="#f2c230" /><path d="M0 -10 c6 3 7 9 7 14 c0 7 -3 13 -7 18 c-4 -5 -7 -11 -7 -18 c0 -5 1 -11 7 -14 z" fill="#e2401f" stroke="#7a2412" strokeWidth="0.7" /><path d="M-7 4 c0 7 3 13 7 18 c4 -5 7 -11 7 -18 z" fill="#f4f1e8" opacity="0.92" /></g>;
}
function Lure({ kind }) {
  if (kind === "spinner") return <g><path d="M0 0 h8" className="rs-wireline" /><ellipse cx="10" cy="-3" rx="6" ry="3.4" transform="rotate(-25 10 -3)" fill="url(#rsGold)" stroke="#8a6a1a" strokeWidth="0.6" /><rect x="10" y="-2" width="12" height="4" rx="2" fill="#c6c9cc" /><path d="M23 0 l5 -4 M23 0 l5 4 M23 0 l6 0" className="rs-hook" /></g>;
  if (kind === "fly") return <g><path d="M0 0 h4" className="rs-wireline" /><path d="M4 -1 q10 -8 20 -2 q-8 2 -20 3 z" fill="#8a6a3a" /><path d="M4 0 q8 6 18 4" stroke="#c9a86a" strokeWidth="1.4" fill="none" /><path d="M4 0 h14 a4 4 0 0 1 0 8 h-2" className="rs-hook" /></g>;
  if (kind === "plug") return <g><path d="M2 0 q10 -8 26 -2 q-14 8 -26 2 z" fill="#d7e2e6" stroke="#3a4a52" strokeWidth="0.7" /><path d="M2 0 q10 -8 26 -2 l-2 0 q-12 -2 -24 2 z" fill="#2f5e6e" /><circle cx="7" cy="-1.6" r="1.4" fill="#111" /><path d="M14 3 l-2 6 M22 2 l-2 6" className="rs-hook" /></g>;
  // soft plastic shad (also the weedless one)
  return <g><path d="M0 0 q8 -7 20 -4 l7 -5 l-2 7 l2 7 l-7 -5 q-12 3 -20 0 z" fill="#d9dfe2" stroke="#4d5a62" strokeWidth="0.7" /><path d="M0 0 q8 -7 20 -4 l-1 2 q-10 -2 -19 2 z" fill="#5d7f8c" /><circle cx="4" cy="-1.6" r="1.2" fill="#111" /><path d="M2 -1 h10 a3.5 3.5 0 0 1 0 7" className="rs-hook" /></g>;
}
function Deadbait() {
  return <g><path d="M0 0 q14 -9 32 -1 l8 -6 l-1 7 l1 7 l-8 -6 q-18 8 -32 -1 z" fill="#cfd6d9" stroke="#4d5a62" strokeWidth="0.7" /><path d="M0 0 q14 -9 32 -1 q-14 -3 -32 1 z" fill="#4d6b78" /><circle cx="5" cy="-1.6" r="1.4" fill="#111" />{[10, 22].map((x) => <g key={x} transform={`translate(${x} 2)`}><path d="M0 0 v6 M0 6 l-3 3 M0 6 l3 3 M0 6 v4" className="rs-hook" /></g>)}</g>;
}
function Feather({ hue }) { return <g><path d="M0 0 v6" className="rs-hookline" /><path d="M-1 6 q-4 6 1 13 q5 -7 1 -13 z" fill={hue} opacity="0.9" /><path d="M0 8 v11 a3.4 3.4 0 0 0 6.8 0 v-3" className="rs-hook" /></g>; }

// ---- which kind of each item, from its label ----
const leadKind = (p) => p.kind === "grip" || /grip/i.test(p.label || "") ? "grip" : p.kind === "feeder" ? "feeder" : p.kind === "method" ? "method" : /drop-shot/i.test(p.label || "") ? "dropshot" : "plain";
const floatKind = (p) => /waggler/i.test(p.label || "") ? "waggler" : /stick/i.test(p.label || "") ? "stick" : /pike/i.test(p.label || "") ? "pike" : "sea";
const lureKind = (p) => /spinner/i.test(p.label || "") ? "spinner" : /fly/i.test(p.label || "") ? "fly" : /plug/i.test(p.label || "") ? "plug" : "plastic";
function baitFor(rig) {
  if (/hair|method/.test(rig.id)) return "boilie";
  if (/maggot|waggler|stick|cage|helicopter/.test(rig.id)) return "maggots";
  return "worm";
}

/** Places each part of the rig along a route through the scene. */
function layout(rig, H, bedY, surf) {
  const parts = (rig.diagram || []).map((p, i) => ({ ...p, i }));
  const hasFloat = parts.findIndex((p) => p.k === "float");
  const leadAt = parts.findIndex((p) => p.k === "lead");
  const hasLure = parts.some((p) => p.k === "lure");
  const pater = leadAt >= 0 && parts.some((p, i) => i < leadAt && (p.k === "snood" || p.k === "dropper" || (p.k === "hook" && /plastic/i.test(p.label || ""))));
  let route, anchor = -1, ta = 1, kind;
  if (hasFloat >= 0) {
    kind = "float"; anchor = hasFloat;
    const fx = 150, fy = surf;
    route = [[6, 4], [fx, fy - 10], [fx, fy + 30], [fx + 18, bedY - 26]];
    ta = tAt(route, 1);
  } else if (pater) {
    kind = "paternoster";
    const lx = parts.length - 1 > leadAt ? 190 : 250;
    route = [[6, 6], [lx * 0.45, surf + 30], [lx, bedY - 3]];
    if (parts.length - 1 > leadAt) route.push([lx + 60, bedY - 8], [W - 34, bedY - 10]);
    anchor = leadAt; ta = parts.length - 1 > leadAt ? tAt(route, 2) : 1;
  } else if (leadAt >= 0) {
    kind = "ledger"; anchor = leadAt;
    const lx = 150;
    route = [[6, 6], [70, surf + 40], [lx, bedY - 3], [lx + 70, bedY - 10], [W - 40, bedY - 9]];
    ta = tAt(route, 2);
  } else if (hasLure) {
    kind = "lure";
    route = [[6, 6], [110, surf + 30], [230, (surf + bedY) / 2 + 4], [W - 70, (surf + bedY) / 2 - 2]];
  } else {
    kind = "freeline";
    route = [[6, 6], [110, surf + 26], [220, bedY - 30], [W - 50, bedY - 9]];
  }
  // spread the parts: those before the anchor along its approach, those after it toward the end
  const before = anchor >= 0 ? parts.slice(0, anchor) : parts.slice(0, -1);
  const after = anchor >= 0 ? parts.slice(anchor + 1) : [];
  const last = anchor >= 0 ? null : parts[parts.length - 1];
  const end0 = (anchor >= 0 ? ta : 1) * (kind === "float" ? 0.97 : 0.92);
  const t0 = kind === "float" ? ta * 0.62 : kind === "paternoster" ? 0.3 : 0.12;
  before.forEach((p, i) => { p.t = before.length === 1 ? (kind === "float" ? ta * 0.9 : end0 * 0.6) : lerp(t0, end0, i / (before.length - 1)); });
  if (anchor >= 0) parts[anchor].t = ta;
  after.forEach((p, i) => { p.t = i === after.length - 1 ? 1 : lerp(ta + (1 - ta) * 0.14, 0.96, i / Math.max(1, after.length - 1)); });
  if (last) last.t = 1;
  // a lead hung at the end of a paternoster sits at the end of the route
  return { parts, route, kind };
}

export default function RigScene({ rig, compact }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "") + (rig?.id || "").replace(/[^a-z0-9]/g, "");
  const H = compact ? 150 : 196;
  const surf = 30, bedY = H - 26;
  const pal = PAL[rig?.type === "fresh" ? "fresh" : "sea"];
  const { parts, route, kind } = layout(rig || {}, H, bedY, surf);
  const bait = baitFor(rig || {});
  const els = [], labels = [], lines = [];

  // line sections, styled by the section they belong to (mainline, braid, leader, hooklength, wire)
  let style = /braid/i.test(parts[0]?.label || "") ? "braid" : "line";
  const marks = parts.filter((p) => p.t != null).sort((a, b) => a.t - b.t);
  let from = 0;
  for (const p of marks) {
    if (p.t > from) lines.push({ pts: slice(route, from, p.t), s: style });
    if (SEGMENTS.has(p.k)) style = p.k === "line" ? (/braid/i.test(p.label || "") ? "braid" : "line") : p.k;
    from = p.t;
  }
  if (from < 1 && kind !== "paternoster") lines.push({ pts: slice(route, from, 1), s: style });

  for (const p of marks) {
    const pos = along(route, p.t);
    const name = p.label ? p.label[0].toUpperCase() + p.label.slice(1) : NAMES[p.k] || p.k;
    let labelAt = pos, key = `${p.k}${p.i}`;
    switch (p.k) {
      case "bead": els.push(<g key={key} transform={at(pos)}><Bead /></g>); break;
      case "stop": els.push(<g key={key} transform={at(pos)}><Stop /></g>); break;
      case "swivel": els.push(<g key={key} transform={at(pos)}><Swivel /></g>); break;
      case "clip": els.push(<g key={key} transform={at(pos)}><Clip /></g>); break;
      case "shot": {
        const big = /ball/i.test(p.label || "");
        const n = /dropper|shirt/i.test(p.label || "") ? 3 : 1;
        els.push(<g key={key}>{Array.from({ length: n }, (_, k) => <g key={k} transform={at(along(route, p.t + k * 0.035))}><Shot big={big} /></g>)}</g>);
        break;
      }
      case "lead": {
        const lk = leadKind(p), onBed = kind !== "float";
        const pt = onBed ? { x: pos.x, y: bedY + 3, ang: 0 } : pos;
        els.push(<g key={key} transform={at(pt, false)}><Lead kind={lk} /></g>);
        if (lk === "plain" && /link|boom|clip/i.test(p.label || "")) els.push(<path key={key + "l"} d={`M${pos.x} ${pos.y} L${pos.x} ${bedY - 18}`} className="rs-hookline" />);
        labelAt = { ...pt, y: bedY - 18 };
        break;
      }
      case "float": els.push(<g key={key} transform={`translate(${pos.x.toFixed(1)} ${surf})`}><Float kind={floatKind(p)} /></g>); labelAt = { x: pos.x, y: surf - 8, ang: 0 }; break;
      case "snood": case "dropper": {
        // a branch off the rig body with its own hook and bait (feathers on a feather rig)
        const up = p.k === "dropper" && kind !== "paternoster";
        const len = p.k === "dropper" ? 26 : 40;
        const end = { x: pos.x + len * 0.9, y: Math.min(bedY - 22, pos.y + (up ? -len * 0.3 : len * 0.32)) };
        els.push(<path key={key + "b"} d={d(curve([pos.x, pos.y], [end.x, end.y], 4, 10))} className="rs-snood" />);
        els.push(<g key={key} transform={`translate(${end.x.toFixed(1)} ${end.y.toFixed(1)})`}>{rig.id === "feathers" ? <Feather hue={["#e94b3c", "#f2c230", "#5aa9e6"][p.i % 3]} /> : <Hook bait={bait} />}</g>);
        labelAt = { ...end, ang: 0 };
        break;
      }
      case "hook": {
        const plastic = /plastic/i.test(p.label || "");
        if (kind === "paternoster" && plastic) {
          // drop-shot: the hook stands off the line with a soft plastic on it
          els.push(<g key={key} transform={`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}><path d="M0 0 h6" className="rs-hookline" /><g transform="translate(6 -3)"><Lure kind="plastic" /></g></g>);
        } else {
          els.push(<g key={key} transform={`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}><Hook bait={plastic ? "plastic" : p.bait === false || /top hook/i.test(p.label || "") ? null : p.hair ? "boilie" : bait} two={/pennell|pair/i.test(p.label || "")} /></g>);
        }
        break;
      }
      case "lure": els.push(<g key={key} transform={`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}><Lure kind={lureKind(p)} /></g>); break;
      case "trebles": els.push(<g key={key} transform={`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`}><Deadbait /></g>); break;
      default: {
        // a length of line: named at the middle of its section
        const next = marks.find((m) => m.t > p.t);
        labelAt = along(route, lerp(p.t, next ? next.t : 1, 0.5));
      }
    }
    if (!compact) labels.push({ x: labelAt.x, y: labelAt.y, ang: labelAt.ang ?? pos.ang, text: name, k: p.k });
  }
  if (kind === "paternoster") {
    // the body ends at the lead; anything after it trails along the bed
    const last = marks[marks.length - 1];
    if (last && last.t < 1) lines.push({ pts: slice(route, last.t, 1), s: style });
  }

  // labels: set off to one side of the line, alternating sides, then nudged apart and kept inside the picture
  const placed = [];
  labels.forEach((l, n) => {
    const wTxt = Math.min(118, l.text.length * 5.2 + 6);
    const onBed = l.y > bedY - 26;
    const a = ((l.ang ?? 0) * Math.PI) / 180;
    let nx = -Math.sin(a), ny = Math.cos(a);
    const side = onBed ? (ny > 0 ? -1 : 1) : n % 2 ? 1 : -1;
    nx *= side; ny *= side;
    let dist = onBed ? 18 + (n % 2) * 13 : 15;
    let x, y, anchor;
    const fits = () => !placed.some((q) => Math.abs(q.cx - (x + (anchor === "start" ? wTxt / 2 : anchor === "end" ? -wTxt / 2 : 0))) < (q.w + wTxt) / 2 + 3 && Math.abs(q.y - y) < 11);
    for (let tries = 0; tries < 8; tries++) {
      x = l.x + nx * dist; y = Math.max(10, Math.min(H - 5, l.y + ny * dist + 3));
      anchor = nx > 0.35 ? "start" : nx < -0.35 ? "end" : "middle";
      if (fits()) break;
      dist += 10;
      if (y <= 10 || y >= H - 5) { nx = -nx; ny = -ny; dist = 15; } // ran out of room: try the other side
    }
    const left = anchor === "start" ? x : anchor === "end" ? x - wTxt : x - wTxt / 2;
    const shift = Math.max(4, Math.min(W - 4 - wTxt, left)) - left;
    x += shift; y = Math.max(10, Math.min(H - 5, y));
    placed.push({ x, y, anchor, w: wTxt, cx: x + (anchor === "start" ? wTxt / 2 : anchor === "end" ? -wTxt / 2 : 0), ax: l.x, ay: l.y, text: l.text });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rig-scene" role="img" aria-label={`Diagram of the ${rig?.name || "rig"}: ${(rig?.diagram || []).map((p) => p.label || NAMES[p.k] || p.k).join(", ")}`}>
      <defs>
        <linearGradient id={`w${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={pal.top} /><stop offset="1" stopColor={pal.deep} /></linearGradient>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={pal.bed} /><stop offset="1" stopColor={pal.bed2} /></linearGradient>
        <radialGradient id="rsBead" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stopColor="#ff9a6a" /><stop offset="1" stopColor="#c2321a" /></radialGradient>
        <linearGradient id="rsMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2f4f5" /><stop offset="0.5" stopColor="#9aa1a6" /><stop offset="1" stopColor="#5e656a" /></linearGradient>
        <linearGradient id="rsLead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9bec2" /><stop offset="0.55" stopColor="#7b8287" /><stop offset="1" stopColor="#4a5055" /></linearGradient>
        <linearGradient id="rsGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b0" /><stop offset="0.5" stopColor="#e3b43a" /><stop offset="1" stopColor="#9a7414" /></linearGradient>
      </defs>
      <rect x="0" y={surf} width={W} height={H - surf} fill={`url(#w${uid})`} />
      <path d={`M0 ${surf} ${Array.from({ length: 19 }, (_, i) => `q${10} ${i % 2 ? 3 : -3} 20 0`).join(" ")}`} className="rs-surface" />
      {kind === "float" ? null : <path d={`M0 ${surf + 1} h${W}`} stroke="#fff" strokeOpacity="0.18" />}
      <path d={`M0 ${bedY} q40 -6 90 -2 t110 2 t100 -3 t60 1 V${H} H0 Z`} fill={`url(#b${uid})`} />
      <g fill={pal.grain} opacity="0.55">{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 89) % W} cy={bedY + 6 + ((i * 37) % (H - bedY - 8))} r={0.8 + (i % 3) * 0.5} />)}</g>
      {rig?.type === "fresh" ? <g stroke={pal.weed} strokeWidth="2" fill="none" opacity="0.7"><path d={`M${W - 18} ${bedY} q-6 -20 2 -40 q6 -12 -2 -26`} /><path d={`M${W - 10} ${bedY} q4 -16 -2 -30`} /></g>
        : <g fill={pal.bed2} opacity="0.9"><ellipse cx={W - 22} cy={bedY + 2} rx="16" ry="7" /><ellipse cx={W - 44} cy={bedY + 5} rx="9" ry="4" /></g>}
      {lines.map((l, i) => <path key={i} d={d(l.pts)} fill="none" stroke={LINE[l.s]?.c || LINE.line.c} strokeWidth={LINE[l.s]?.w || 1.4} strokeLinecap="round" strokeDasharray={l.s === "braid" ? "5 2" : undefined} />)}
      {els}
      {placed.map((l, i) => (
        <g key={i} className="rs-label">
          <path d={`M${l.ax.toFixed(1)} ${l.ay.toFixed(1)} L${l.x.toFixed(1)} ${(l.y - 3).toFixed(1)}`} className="rs-tick" />
          <text x={l.x} y={l.y} textAnchor={l.anchor}>{l.text}</text>
        </g>
      ))}
    </svg>
  );
}

// ---- a small picture of one item on a rig's kit list, chosen from its wording ----
const KIT = [
  [/pennell|\bhooks?\b/i, () => <g transform="translate(10 4)"><Hook bait={null} /></g>],
  [/hooklength|hooklink|snood|\bleader\b|\bbody\b|mainline|braid|mono|fluoro|\bline\b/i, () => <path d="M2 20 q8 -16 24 -10" fill="none" stroke="#eef3f2" strokeWidth="2" strokeLinecap="round" />],
  [/feeder/i, () => <g transform="translate(14 27)"><Lead kind="feeder" /></g>],
  [/grip|breakout|impact/i, () => <g transform="translate(14 25)"><Lead kind="grip" /></g>],
  [/lead|weight|sinker|bomb/i, () => <g transform="translate(14 25)"><Lead kind="plain" /></g>],
  [/swivel/i, () => <g transform="translate(14 14) rotate(-30)"><Swivel /></g>],
  [/bead/i, () => <g transform="translate(14 14) scale(1.6)"><Bead /></g>],
  [/clip|link/i, () => <g transform="translate(14 9) scale(1.6)"><Clip /></g>],
  [/float/i, () => <g transform="translate(14 16) scale(0.8)"><Float kind="sea" /></g>],
  [/shot/i, () => <g transform="translate(14 14) scale(1.8)"><Shot /></g>],
  [/stop|knot/i, () => <g transform="translate(14 14) scale(1.6)"><Stop /></g>],
  [/spinner|spoon/i, () => <g transform="translate(1 15)"><Lure kind="spinner" /></g>],
  [/fly/i, () => <g transform="translate(1 15)"><Lure kind="fly" /></g>],
  [/plastic|shad|lure|plug/i, () => <g transform="translate(0 16) scale(0.95)"><Lure kind="plastic" /></g>],
  [/wire|trace/i, () => <path d="M3 22 q6 -14 11 -6 t11 -8" className="rs-wire" strokeWidth="2" />],
  [/elastic|cotton|bait/i, () => <g transform="translate(11 4)"><Bait kind="worm" /></g>],
];
export function KitIcon({ text }) {
  const hit = KIT.find(([re]) => re.test(text));
  return (
    <svg viewBox="0 0 28 28" className="kit-svg" aria-hidden="true">
      <defs>
        <radialGradient id="rsBead" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stopColor="#ff9a6a" /><stop offset="1" stopColor="#c2321a" /></radialGradient>
        <linearGradient id="rsMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2f4f5" /><stop offset="0.5" stopColor="#9aa1a6" /><stop offset="1" stopColor="#5e656a" /></linearGradient>
        <linearGradient id="rsLead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b9bec2" /><stop offset="0.55" stopColor="#7b8287" /><stop offset="1" stopColor="#4a5055" /></linearGradient>
        <linearGradient id="rsGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b0" /><stop offset="0.5" stopColor="#e3b43a" /><stop offset="1" stopColor="#9a7414" /></linearGradient>
      </defs>
      {hit ? hit[1]() : <path d="M2 20 q8 -16 24 -10" fill="none" stroke="#eef3f2" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}
