// ---- BaitOnHook: a close-up of how the bait goes on for a rig (threaded worm, Pennell bait, crab, strip, hair) ----
// Drawn in the same way as the rig scenes. Which picture a rig gets is set below; the words that go with it come
// from the rig's own sourced "bait" note and each bait's sourced hooking note (baits.js).
import { useId } from "react";

export const BAIT_STYLE = {
  pulley: "worm", "pulley-pennell": "pennell", "two-hook-flapper": "worm", "one-up-one-down": "worm", "clipped-down": "worm",
  pennell: "pennell", "running-ledger": "crab", "rotten-bottom": "worm", "sliding-float": "strip", "rock-float-bait": "crab",
  "weightless-soft-plastic": "weedless", "sea-spinner": "spinner", feathers: "feathers", freeline: "head", "running-ledger-fresh": "maggots",
  "bolt-hair-rig": "hair", "method-feeder": "hair", "cage-feeder": "hair", "maggot-feeder": "maggots", helicopter: "hair",
  waggler: "maggots", "stick-float": "maggots", "freeline-fresh": "bread", "pike-float": "tail", "pike-paternoster": "deadbait",
  "pike-lure": "shad", "drop-shot": "nose", spinner: "spinner", fly: "fly",
};
// the stock baits whose hooking notes suit each picture
export const STYLE_BAITS = {
  worm: ["lugworm", "ragworm"], pennell: ["lugworm", "squid"], crab: ["peeler-crab"], strip: ["mackerel-strip", "sandeel"], head: ["ragworm", "sandeel"],
  maggots: ["maggots", "casters"], hair: ["boilies", "pellets"], bread: ["bread"], tail: ["deadbait"], deadbait: ["deadbait"],
  weedless: ["lures"], shad: ["lures"], nose: ["lures"], spinner: ["lures"], feathers: [], fly: ["flies"],
};
export const STYLE_LABEL = {
  worm: "Worm threaded up the hook", pennell: "Bait spread across two hooks", crab: "Crab bound on with bait elastic", strip: "Fish strip hooked once at the thick end",
  head: "Hooked once through the head", maggots: "Maggots hooked through the blunt end", hair: "Bait on a hair off the bend", bread: "Bread pinched round the shank",
  tail: "Deadbait hooked tail-first", deadbait: "Deadbait on two trebles", weedless: "Soft plastic, point hidden in its back", shad: "Soft plastic on a jig head",
  nose: "Soft plastic hooked through the nose", spinner: "Spinner, no bait", feathers: "Feathers, no bait", fly: "Fly, no bait",
};

function Hook({ x = 60, y = 16, len = 62, r = 17, flip }) {
  // a J hook: eye at the top, shank, bend, point with its barb
  const bx = flip ? -r * 2 : r * 2;
  return (
    <g>
      <circle cx={x} cy={y - 3} r="3.4" className="bh-eye" />
      <path d={`M${x} ${y} v${len} a${r} ${r} 0 0 0 ${bx} 0 v-${r * 1.1} l${flip ? 5 : -5} 7`} className="bh-hook" />
    </g>
  );
}
const Worm = ({ d, w = 9 }) => (
  <g>
    <path d={d} className="bh-worm" strokeWidth={w} />
    <path d={d} className="bh-worm-rings" strokeWidth={w - 1} />
    <path d={d} className="bh-worm-shine" transform="translate(-1.6 -1.6)" />
  </g>
);

export default function BaitOnHook({ rig, style: forced }) {
  const style = forced || BAIT_STYLE[rig?.id] || "worm";
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const line = <path d="M60 13 L48 0" className="bh-line" />;
  let art;
  switch (style) {
    case "pennell":
      art = (<g><path d="M60 6 L48 -6" className="bh-line" /><path d="M60 6 V54" className="bh-line" />
        <Worm d="M60 2 C60 30 61 60 60 98 C60 112 70 116 80 114" w={10} />
        <Hook x={60} y={10} len={26} r={11} /><Hook x={60} y={58} len={42} r={14} /></g>);
      break;
    case "crab":
      art = (<g>{line}<Hook />
        <g transform="translate(58 56) rotate(-12)">
          <ellipse cx="6" cy="10" rx="24" ry="17" fill={`url(#c${u})`} stroke="#7a3a1c" strokeWidth="1.4" />
          {[-18, -9, 1, 11, 21].map((x, i) => <path key={i} d={`M${x} 22 q${i % 2 ? 3 : -3} 10 ${i % 2 ? 6 : -2} 16`} stroke="#9a4a24" strokeWidth="3.4" fill="none" strokeLinecap="round" />)}
          <ellipse cx="0" cy="4" rx="9" ry="5" fill="#fff" opacity="0.25" />
        </g>
        <path d="M34 50 l50 26 M34 62 l50 20 M38 74 l44 12 M44 44 l42 26" className="bh-elastic" />
        <path d="M96 78 V60 l-5 7" className="bh-hook" /></g>);
      break;
    case "strip":
      art = (<g>{line}<Hook />
        <path d="M88 58 C106 64 130 84 170 112 C138 102 110 84 86 70 Z" fill={`url(#s${u})`} stroke="#3c5560" strokeWidth="1.2" />
        <path d="M94 62 C112 70 134 86 162 106" stroke="#1f4b58" strokeWidth="2" strokeDasharray="5 4" fill="none" />
        <path d="M96 80 V60 l-5 7" className="bh-hook" /></g>);
      break;
    case "head":
      art = (<g>{line}<Hook />
        <Worm d="M90 66 C104 70 112 82 106 96 C100 110 112 118 130 116 C146 114 150 104 166 108" w={8} />
        <path d="M96 78 V60 l-5 7" className="bh-hook" /></g>);
      break;
    case "maggots":
      art = (<g>{line}<Hook len={50} r={13} />
        {[[92, 68, 20], [100, 76, -10], [88, 80, 50]].map(([x, y, r], i) => <g key={i} transform={`rotate(${r} ${x} ${y})`}><ellipse cx={x} cy={y} rx="9" ry="4.6" className="bh-maggot" /><path d={`M${x - 5} ${y - 3} v6 M${x - 1} ${y - 4} v8 M${x + 3} ${y - 4} v8`} className="bh-maggot-rings" /></g>)}
        <path d="M86 66 V50 l-5 7" className="bh-hook" /></g>);
      break;
    case "hair":
      art = (<g>{line}<Hook />
        <path d="M78 95 C80 104 82 108 82 112" className="bh-hair" />
        <circle cx="82" cy="120" r="11" fill={`url(#b${u})`} stroke="#8a6a3a" strokeWidth="1" /><circle cx="78" cy="116" r="3" fill="#fff" opacity="0.5" />
        <path d="M78 132 h8" stroke="#2a2a2a" strokeWidth="3" strokeLinecap="round" /></g>);
      break;
    case "bread":
      art = (<g>{line}<Hook />
        <path d="M50 46 C44 30 60 22 70 30 C82 26 84 46 76 54 C84 66 74 80 64 78 C54 84 44 72 50 62 C42 58 44 50 50 46 Z" fill="#f5efe0" stroke="#b9ab8a" strokeWidth="1.4" />
        <path d="M54 40 l4 4 M66 60 l3 2 M58 68 l2 3" stroke="#d8cba8" strokeWidth="1.4" /></g>);
      break;
    case "tail": case "deadbait": {
      const tail = style === "tail";
      art = (<g><path d={tail ? "M150 10 L150 40" : "M40 10 L40 40"} className="bh-wire" />
        <g transform="translate(20 50)">
          <path d="M0 26 q40 -30 104 -10 l26 -18 l-4 22 l4 22 l-26 -18 q-64 22 -104 2 z" fill={`url(#f${u})`} stroke="#3c5560" strokeWidth="1.2" />
          <path d="M0 26 q40 -30 104 -10 q-50 -6 -104 10 z" fill="#3f6a7a" />
          <circle cx="14" cy="20" r="3.4" fill="#111" /><circle cx="13" cy="19" r="1" fill="#fff" />
        </g>
        {(tail ? [[150, 40], [104, 56]] : [[40, 40], [86, 52]]).map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><path d="M0 0 v12 M0 12 l-6 6 M0 12 l6 6 M0 12 v8" className="bh-hook" /></g>)}</g>);
      break;
    }
    case "weedless": case "shad": case "nose": {
      art = (<g><path d="M14 40 L40 40" className="bh-line" />
        <g transform="translate(40 30)">
          <path d="M0 12 q30 -22 80 -10 l26 -16 l-6 22 l6 22 l-26 -16 q-50 14 -80 -2 z" fill={`url(#p${u})`} stroke="#3e6b2e" strokeWidth="1.2" />
          <circle cx="10" cy="8" r="2.6" fill="#111" />
          {style === "shad" ? <path d="M-4 10 a8 8 0 0 1 16 0 a8 8 0 0 1 -16 0" fill="#9aa1a6" /> : null}
          {style === "weedless" ? <path d="M2 10 h44 a8 8 0 0 1 0 6 M46 16 l10 -12" className="bh-hook" /> : style === "nose" ? <path d="M4 4 v10 a6 6 0 0 0 12 0 v-4" className="bh-hook" /> : <path d="M6 10 h40 a7 7 0 0 1 0 14 l-6 -4" className="bh-hook" />}
        </g></g>);
      break;
    }
    case "spinner":
      art = (<g><path d="M10 50 H44" className="bh-line" /><circle cx="48" cy="50" r="4" className="bh-eye" />
        <ellipse cx="72" cy="38" rx="20" ry="10" transform="rotate(-25 72 38)" fill={`url(#g${u})`} stroke="#8a6a1a" />
        <rect x="70" y="44" width="40" height="12" rx="6" fill="#c6c9cc" stroke="#6a7075" /><path d="M110 50 h8 M118 50 l10 -10 M118 50 l10 10 M118 50 h12" className="bh-hook" /></g>);
      break;
    case "feathers":
      art = (<g><path d="M20 0 V130" className="bh-line" />{[20, 62, 104].map((y, i) => <g key={y}><path d={`M20 ${y} h18`} className="bh-line" /><path d={`M40 ${y - 2} q-10 14 2 28 q12 -14 2 -28 z`} fill={["#e94b3c", "#f2c230", "#5aa9e6"][i]} /><path d={`M42 ${y} v24 a5 5 0 0 0 10 0 v-5`} className="bh-hook" /></g>)}</g>);
      break;
    case "fly":
      art = (<g><path d="M10 40 H50" className="bh-line" /><path d="M50 40 h50 a10 10 0 0 1 0 20 h-6" className="bh-hook" /><path d="M56 38 q30 -22 60 -6 q-26 6 -60 8 z" fill="#8a6a3a" /><path d="M56 40 q22 16 50 10" stroke="#c9a86a" strokeWidth="3" fill="none" /><circle cx="54" cy="40" r="5" fill="#2a2a2a" /></g>);
      break;
    default:
      art = (<g>{line}
        <Worm d="M60 6 C60 30 61 52 60 76 C60 94 76 100 88 96 C102 92 112 100 116 116" />
        <Hook /><path d="M96 80 V60 l-5 7" className="bh-hook" /></g>);
  }
  return (
    <svg viewBox="-6 -10 190 150" className="bait-hook" role="img" aria-label={STYLE_LABEL[style]}>
      <defs>
        <linearGradient id={`c${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9783e" /><stop offset="1" stopColor="#8f4220" /></linearGradient>
        <linearGradient id={`s${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6170" /><stop offset="0.5" stopColor="#c9d4d8" /><stop offset="1" stopColor="#f2f4f2" /></linearGradient>
        <linearGradient id={`f${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4d7484" /><stop offset="0.55" stopColor="#d6dde0" /><stop offset="1" stopColor="#f3f5f3" /></linearGradient>
        <linearGradient id={`p${u}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5f9a48" /><stop offset="1" stopColor="#c6e6a8" /></linearGradient>
        <radialGradient id={`b${u}`} cx="0.35" cy="0.35" r="0.7"><stop offset="0" stopColor="#f3d9a2" /><stop offset="1" stopColor="#c4924a" /></radialGradient>
        <linearGradient id={`g${u}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b0" /><stop offset="0.5" stopColor="#e3b43a" /><stop offset="1" stopColor="#9a7414" /></linearGradient>
      </defs>
      {art}
    </svg>
  );
}
