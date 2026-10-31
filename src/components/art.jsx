// ---- art: species illustrations, rig diagrams, hook sizes and the water column, all drawn from data ----

// Fish are drawn from a small set of body plans plus each species' colours and markings, so every species card has
// a recognisable picture without using anyone's photos. They are illustrations, not identification photos.
const SHAPES = {
  torpedo: { len: 100, h: 26, head: 0.24, tail: 16, fork: 0.55 },
  long: { len: 108, h: 18, head: 0.22, tail: 13, fork: 0.25 },
  deep: { len: 92, h: 38, head: 0.26, tail: 15, fork: 0.5 },
  chunky: { len: 96, h: 32, head: 0.3, tail: 15, fork: 0.15 },
  eel: { len: 112, h: 14, head: 0.14, tail: 0, fork: 0 },
};

export function FishArt({ art, size = 120, title }) {
  const a = art || {};
  const shape = a.shape || "torpedo";
  if (shape === "flat") return <FlatArt a={a} size={size} title={title} />;
  if (shape === "ray") return <RayArt a={a} size={size} title={title} />;
  if (shape === "shark") return <SharkArt a={a} size={size} title={title} />;
  const S = SHAPES[shape] || SHAPES.torpedo;
  const x0 = 6, x1 = x0 + S.len, cy = 34, h = S.h / 2;
  const tailX = x1 + S.tail;
  const body = shape === "eel"
    ? `M${x0},${cy} C${x0 + 10},${cy - h * 1.2} ${x0 + 30},${cy - h} ${x0 + 50},${cy - h * 0.9} S${x1 - 10},${cy - h * 0.5} ${x1 + 6},${cy} S${x0 + 50},${cy + h * 0.9} ${x0 + 30},${cy + h} S${x0 + 4},${cy + h * 0.8} ${x0},${cy} Z`
    : `M${x0},${cy} C${x0 + 4},${cy - h * 0.9} ${x0 + S.len * S.head},${cy - h * 1.05} ${x0 + S.len * 0.45},${cy - h} C${x0 + S.len * 0.75},${cy - h * 0.95} ${x1 - 6},${cy - h * 0.45} ${x1},${cy - h * 0.22} L${x1},${cy + h * 0.22} C${x1 - 6},${cy + h * 0.45} ${x0 + S.len * 0.75},${cy + h * 0.9} ${x0 + S.len * 0.45},${cy + h} C${x0 + S.len * S.head},${cy + h * 1.02} ${x0 + 4},${cy + h * 0.8} ${x0},${cy} Z`;
  const tail = shape === "eel" ? "" : `M${x1 - 2},${cy - h * 0.2} L${tailX},${cy - h * 0.95 - 4} Q${tailX - S.tail * S.fork},${cy} ${tailX},${cy + h * 0.95 + 4} L${x1 - 2},${cy + h * 0.2} Z`;
  const dorsal = a.dorsal === "double"
    ? `M${x0 + S.len * 0.3},${cy - h * 0.98} l6,-${h * 0.7 + 4} l10,${h * 0.62 + 3} Z M${x0 + S.len * 0.52},${cy - h * 0.95} l5,-${h * 0.5 + 3} l14,${h * 0.45 + 3} Z`
    : a.dorsal === "long" ? `M${x0 + S.len * 0.3},${cy - h * 0.98} Q${x0 + S.len * 0.55},${cy - h * 1.6 - 4} ${x0 + S.len * 0.82},${cy - h * 0.55} Z`
      : a.dorsal === "back" ? `M${x0 + S.len * 0.66},${cy - h * 0.8} l4,-${h * 0.7 + 3} l9,${h * 0.75 + 2} Z`
        : `M${x0 + S.len * 0.36},${cy - h * 0.99} Q${x0 + S.len * 0.46},${cy - h * 1.55 - 2} ${x0 + S.len * 0.62},${cy - h * 0.92} Z`;
  const id = `g${(a.body || "x").replace("#", "")}${shape}`;
  return (
    <svg viewBox={`0 0 ${tailX + 6} 68`} width={size} height={size * 68 / (tailX + 6)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} className="fish-art">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.back || "#4d6473"} />
          <stop offset="0.55" stopColor={a.body || "#9fb4c4"} />
          <stop offset="1" stopColor={a.belly || "#eef2f4"} />
        </linearGradient>
        <clipPath id={id + "c"}><path d={body} /></clipPath>
      </defs>
      {shape !== "eel" && <path d={tail} fill={a.fins || a.back || "#567"} opacity="0.92" />}
      {shape !== "eel" && <path d={dorsal} fill={a.fins || a.back || "#567"} opacity="0.9" />}
      {shape !== "eel" && <path d={`M${x0 + S.len * 0.5},${cy + h * 0.95} l4,${h * 0.45 + 2} l9,-${h * 0.42}`} fill={a.fins || a.back} opacity="0.85" />}
      <path d={body} fill={`url(#${id})`} />
      <g clipPath={`url(#${id}c)`}>
        {a.pattern === "bars" && Array.from({ length: 6 }, (_, i) => <rect key={i} x={x0 + S.len * (0.28 + i * 0.1)} y={cy - h * 1.2} width={S.len * 0.045} height={h * 1.7} fill="#1d2a1a" opacity="0.45" />)}
        {a.pattern === "waves" && Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${x0 + 18 + i * 9},${cy - h} q3,${h * 0.45} -1,${h * 0.9}`} stroke="#0d2633" strokeWidth="1.8" fill="none" opacity="0.7" />)}
        {(a.pattern === "spots" || a.pattern === "spots-red") && Array.from({ length: 16 }, (_, i) => <circle key={i} cx={x0 + 16 + ((i * 37) % 70)} cy={cy - h * 0.6 + ((i * 13) % (h * 1.3))} r={1.6} fill={a.pattern === "spots-red" ? "#d0503a" : "#2a2420"} opacity="0.8" />)}
        {a.pattern === "speckle" && Array.from({ length: 34 }, (_, i) => <circle key={i} cx={x0 + 8 + ((i * 29) % 90)} cy={cy - h + ((i * 7) % (h * 1.6))} r={0.9} fill="#2d2520" opacity="0.7" />)}
        {a.pattern === "line" && <path d={`M${x0 + 12},${cy - h * 0.1} C${x0 + 40},${cy - h * 0.25} ${x1 - 30},${cy - h * 0.05} ${x1},${cy}`} stroke={a.line || "#d7dde0"} strokeWidth="1.4" fill="none" opacity="0.9" />}
        {a.pattern === "stripes" && Array.from({ length: 5 }, (_, i) => <path key={i} d={`M${x0},${cy - h * 0.7 + i * h * 0.32} L${x1},${cy - h * 0.5 + i * h * 0.25}`} stroke="#2a3b47" strokeWidth="1.1" opacity="0.5" />)}
        {a.pattern === "scales" && Array.from({ length: 30 }, (_, i) => <path key={i} d={`M${x0 + 20 + (i % 10) * 7},${cy - h * 0.5 + Math.floor(i / 10) * h * 0.45} a3.4,3.4 0 0 1 0,5`} stroke="#ffffff" strokeWidth="0.6" fill="none" opacity="0.35" />)}
      </g>
      <circle cx={x0 + S.len * (shape === "eel" ? 0.07 : 0.11)} cy={cy - h * 0.25} r={shape === "deep" ? 3.4 : 2.8} fill="#f7f4ea" />
      <circle cx={x0 + S.len * (shape === "eel" ? 0.07 : 0.11) + 0.5} cy={cy - h * 0.25} r={1.6} fill="#151515" />
      {a.barbels && <path d={`M${x0 + 2},${cy + 2} q-3,6 -1,10 M${x0 + 5},${cy + 3} q-1,6 2,9`} stroke={a.back} strokeWidth="1.2" fill="none" />}
      <path d={`M${x0 + S.len * 0.2},${cy - h * 0.6} q4,${h * 0.6} 0,${h * 1.2}`} stroke="#000" strokeOpacity="0.18" fill="none" />
    </svg>
  );
}

function FlatArt({ a, size, title }) {
  return (
    <svg viewBox="0 0 130 68" width={size} height={size * 68 / 130} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} className="fish-art">
      <path d="M100,34 L124,20 Q118,34 124,48 Z" fill={a.fins || a.back} opacity="0.9" />
      <ellipse cx="56" cy="34" rx="50" ry="27" fill={a.fins || a.back} opacity="0.55" />
      <ellipse cx="56" cy="34" rx="45" ry="22" fill={a.body || "#9c8a6a"} />
      {Array.from({ length: a.pattern === "spots-red" ? 12 : 0 }, (_, i) => <circle key={i} cx={24 + ((i * 23) % 64)} cy={20 + ((i * 11) % 28)} r="3" fill="#e0622f" opacity="0.9" />)}
      {a.pattern === "speckle" && Array.from({ length: 26 }, (_, i) => <circle key={i} cx={18 + ((i * 17) % 76)} cy={16 + ((i * 7) % 36)} r="1.2" fill="#3a2f22" opacity="0.6" />)}
      <path d="M20,26 Q60,22 98,32" stroke="#000" strokeOpacity="0.15" fill="none" />
      <circle cx="18" cy="24" r="3" fill="#f6f2e6" /><circle cx="18.6" cy="24" r="1.6" fill="#111" />
      <circle cx="24" cy="20" r="2.6" fill="#f6f2e6" /><circle cx="24.5" cy="20" r="1.4" fill="#111" />
    </svg>
  );
}

function RayArt({ a, size, title }) {
  return (
    <svg viewBox="0 0 130 80" width={size} height={size * 80 / 130} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} className="fish-art">
      <path d="M60,40 L125,40" stroke={a.back} strokeWidth="4" strokeLinecap="round" />
      <path d="M10,40 L48,6 L80,40 L48,74 Z" fill={a.body || "#8f7a5a"} />
      {a.pattern === "thorns" && Array.from({ length: 7 }, (_, i) => <circle key={i} cx={60 + i * 8} cy="40" r="1.8" fill="#f2e6c8" />)}
      {Array.from({ length: 18 }, (_, i) => <circle key={i} cx={26 + ((i * 13) % 44)} cy={22 + ((i * 17) % 36)} r="1.6" fill="#3d2f1f" opacity="0.55" />)}
      <circle cx="30" cy="36" r="2.2" fill="#f6f2e6" /><circle cx="30" cy="44" r="2.2" fill="#f6f2e6" />
    </svg>
  );
}

function SharkArt({ a, size, title }) {
  return (
    <svg viewBox="0 0 136 64" width={size} height={size * 64 / 136} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} className="fish-art">
      <path d="M100,30 L132,12 L124,34 L130,46 Z" fill={a.fins || a.back} />
      <path d="M44,22 L54,6 L64,22 Z M80,26 L86,16 L92,27 Z" fill={a.fins || a.back} />
      <path d="M4,34 C8,22 30,18 60,20 C84,22 100,26 104,32 C100,38 84,42 60,44 C30,46 10,42 4,34 Z" fill={a.body || "#8c98a0"} />
      {a.pattern === "speckle" && Array.from({ length: 40 }, (_, i) => <circle key={i} cx={10 + ((i * 23) % 90)} cy={22 + ((i * 7) % 20)} r="1.1" fill="#2d2520" opacity="0.7" />)}
      {a.pattern === "spots-white" && Array.from({ length: 12 }, (_, i) => <circle key={i} cx={20 + ((i * 29) % 76)} cy={24 + ((i * 11) % 14)} r="1.6" fill="#f0f0f0" opacity="0.9" />)}
      <path d="M40,40 L52,52 L56,42 Z" fill={a.fins || a.back} />
      <circle cx="16" cy="30" r="2.4" fill="#f6f2e6" /><circle cx="16.4" cy="30" r="1.3" fill="#111" />
    </svg>
  );
}

// ---- hook size glyph: UK sizes run 22 (tiny) to 1, then 1/0 to 10/0 (big) ----
export function hookScale(size) {
  const s = String(size).trim();
  const m = s.match(/^(\d+)\/0$/);
  if (m) return 1.25 + 0.22 * Number(m[1]);
  const n = Number(s);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.28, 1.2 - n * 0.045);
}
export function HookGlyph({ size, label }) {
  const k = hookScale(size);
  return (
    <svg viewBox="0 0 60 80" width={34 * Math.min(2.6, k)} height={46 * Math.min(2.6, k)} className="hook-glyph" role="img" aria-label={label || `Hook size ${size}`}>
      <circle cx="30" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M30 13 V52 a14 14 0 0 1 -28 0 V44" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M2 44 l7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

// ---- water column: where the bait should sit ----
export function WaterColumn({ zone = "bottom", kind = "sea" }) {
  const y = zone === "surface" ? 24 : zone === "mid" ? 56 : zone === "varies" ? 56 : 88;
  const label = zone === "bottom" ? "On the bottom" : zone === "mid" ? "Mid-water" : zone === "surface" ? "Near the surface" : "Varies";
  return (
    <svg viewBox="0 0 120 110" className="water-col" role="img" aria-label={`Bait zone: ${label}`}>
      <rect x="0" y="10" width="120" height="100" rx="10" className="wc-water" />
      <path d="M0 14 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0" className="wc-surface" />
      <path d={kind === "sea" ? "M0 98 q20 -8 40 -2 t40 2 t40 -4 V110 H0 Z" : "M0 100 q30 -10 60 -4 t60 0 V110 H0 Z"} className="wc-bed" />
      {zone === "varies" ? <path d="M60 24 V88" className="wc-arrow" /> : null}
      <circle cx="60" cy={y} r="8" className="wc-bait" />
      <text x="60" y={zone === "bottom" ? y - 14 : y + 22} textAnchor="middle" className="wc-label">{label}</text>
    </svg>
  );
}

// ---- rig diagram: drawn from the rig's component list, mainline on the left, hook on the right ----
export function RigDiagram({ rig, compact }) {
  const parts = rig?.diagram || [];
  const W = 340, H = compact ? 112 : 124, y = 40;
  let x = 10;
  const els = [];
  const step = (W - 40) / Math.max(4, parts.length);
  parts.forEach((p, i) => {
    const cx = x + step * 0.5;
    const key = i;
    switch (p.k) {
      case "line": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><text x={x + 2} y={y - 8}>{p.label || "Mainline"}</text></g>); break;
      case "leader": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln thick" /><text x={x + 2} y={y - 8}>{p.label || "Leader"}</text></g>); break;
      case "bead": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><circle cx={cx} cy={y} r="4" className="bead" /><text x={cx - 10} y={y + 18}>bead</text></g>); break;
      case "stop": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><rect x={cx - 2} y={y - 5} width="4" height="10" className="stop" /><text x={cx - 12} y={y + 18}>stop</text></g>); break;
      case "swivel": els.push(<g key={key}><line x1={x} y1={y} x2={cx - 7} y2={y} className="ln" /><ellipse cx={cx - 3} cy={y} rx="4" ry="3" className="swivel" /><ellipse cx={cx + 3} cy={y} rx="4" ry="3" className="swivel" /><line x1={cx + 7} y1={y} x2={x + step} y2={y} className="ln" /><text x={cx - 14} y={y + 18}>swivel</text></g>); break;
      case "float": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><path d={`M${cx} ${y - 22} L${cx + 4} ${y - 6} L${cx} ${y + 4} L${cx - 4} ${y - 6} Z`} className="float" /><rect x={cx - 1.5} y={y - 28} width="3" height="7" className="float-tip" /><text x={cx - 14} y={y + 18}>{p.label || "float"}</text></g>); break;
      case "shot": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" />{[0, 6, 12].map((d) => <circle key={d} cx={x + 6 + d} cy={y} r="2.6" className="lead" />)}<text x={x + 2} y={y + 18}>{p.label || "shot"}</text></g>); break;
      case "lead": {
        const leg = p.boom ? 24 : 16;
        els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><line x1={cx} y1={y} x2={cx} y2={y + leg} className="ln" />
          {p.kind === "grip" ? <g><path d={`M${cx - 6} ${y + leg} h12 l-3 14 h-6 Z`} className="lead" />{[-6, 6].map((d) => <path key={d} d={`M${cx + d * 0.5} ${y + leg + 12} l${d} 6`} className="wire" />)}</g>
            : p.kind === "feeder" ? <rect x={cx - 7} y={y + leg} width="14" height="18" rx="3" className="feeder" />
              : p.kind === "method" ? <ellipse cx={cx} cy={y + leg + 8} rx="10" ry="8" className="method" />
                : <path d={`M${cx} ${y + leg} l6 6 l-2 10 h-8 l-2 -10 Z`} className="lead" />}
          <text x={cx} y={y + leg + 30} textAnchor="middle">{p.label || (p.kind === "grip" ? "grip lead" : p.kind === "feeder" ? "feeder" : p.kind === "method" ? "method" : "lead")}</text></g>);
        break;
      }
      case "snood": {
        const drop = 30;
        els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><line x1={cx} y1={y} x2={cx + 10} y2={y + drop} className="ln" /><HookPath x={cx + 10} y={y + drop} /><circle cx={cx + 14} cy={y + drop + 10} r="4.5" className="bait" /><text x={cx - 18} y={y + drop + 26}>{p.label || "snood"}</text></g>);
        break;
      }
      case "clip": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><path d={`M${cx - 4} ${y + 2} v6 h8 v-6`} className="clip" /><text x={cx - 14} y={y + 20}>bait clip</text></g>); break;
      case "wire": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="wire" /><text x={x + 2} y={y - 8}>{p.label || "wire trace"}</text></g>); break;
      case "hooklength": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln fine" /><text x={x + 2} y={y - 8}>{p.label || "hooklength"}</text></g>); break;
      case "dropper": els.push(<g key={key}><line x1={x} y1={y} x2={x + step} y2={y} className="ln" /><line x1={cx} y1={y} x2={cx} y2={y - 22} className="ln fine" /><HookPath x={cx} y={y - 26} up /><circle cx={cx + 4} cy={y - 36} r="4" className="bait" /></g>); break;
      case "hook": {
        els.push(<g key={key}><line x1={x} y1={y} x2={cx} y2={y} className="ln fine" /><HookPath x={cx} y={y} />{p.bait !== false ? <circle cx={cx + 5} cy={y + 12} r="6" className="bait" /> : null}{p.hair ? <path d={`M${cx} ${y + 16} q6 8 0 14`} className="ln fine" /> : null}<text x={cx + 4} y={y + 34} textAnchor="middle">{p.label || "hook"}</text></g>);
        break;
      }
      case "lure": els.push(<g key={key}><line x1={x} y1={y} x2={cx - 10} y2={y} className="ln fine" /><path d={`M${cx - 10} ${y} q12 -10 26 0 q-12 10 -26 0 Z`} className="lure" /><text x={cx - 14} y={y + 20}>{p.label || "lure"}</text></g>); break;
      case "trebles": els.push(<g key={key}><line x1={x} y1={y} x2={cx} y2={y} className="wire" /><path d={`M${cx} ${y} v10 m0 0 q-6 4 -8 -2 m8 2 q6 4 8 -2`} className="hookline" /><text x={cx - 18} y={y + 28}>{p.label || "trebles"}</text></g>); break;
      default: els.push(<line key={key} x1={x} y1={y} x2={x + step} y2={y} className="ln" />);
    }
    x += step;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rig-svg" role="img" aria-label={`Diagram of the ${rig?.name || "rig"}`}>
      <rect x="0" y={y + 20} width={W} height={H - y - 20} className="water" />
      {els}
    </svg>
  );
}
function HookPath({ x, y, up }) {
  return up
    ? <path d={`M${x} ${y} v-10 a5 5 0 0 1 10 0 v3`} className="hookline" />
    : <path d={`M${x} ${y} v10 a5 5 0 0 0 10 0 v-3`} className="hookline" />;
}
