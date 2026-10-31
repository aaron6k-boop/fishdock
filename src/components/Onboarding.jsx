// ---- First run: three cards, then straight in as a guest (DetectDock's guest-first welcome) ----
import { useState } from "react";
import { Icon } from "./ui.jsx";

const CARDS = [
  { icon: "fish", title: "Know what to fish for, where and when", text: "BiteScore for each species at your mark, tides, weather and river levels, and what has been recorded nearby." },
  { icon: "hook", title: "The right bait, hook and rig", text: "Pick a species and a method. FishDock shows the bait, hook size, rig diagram and presentation, and the rules that apply." },
  { icon: "lock", title: "Private by default. Free.", text: "Your marks, catches and sessions stay on your phone unless you choose to back them up or share. No account needed, no adverts." },
];

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0);
  const c = CARDS[i];
  return (
    <div className="onboard">
      <div className="onboard-in">
        <span className="wordmark big">fish<b>dock</b></span>
        <div className="onboard-card" key={i}>
          <span className="ob-ico"><Icon name={c.icon} /></span>
          <h1>{c.title}</h1>
          <p>{c.text}</p>
        </div>
        <div className="dots" aria-hidden="true">{CARDS.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
        <div className="stack">
          {i < CARDS.length - 1
            ? <button type="button" className="btn primary block" onClick={() => setI(i + 1)}>Next</button>
            : <button type="button" className="btn primary block" onClick={onDone}>Start as a guest</button>}
          <button type="button" className="btn ghost block" onClick={onDone}>Skip</button>
        </div>
        <p className="tiny center">Sea, beach, rock, river, canal, lake and day-ticket fisheries across England, Wales, Scotland and Northern Ireland.</p>
      </div>
    </div>
  );
}
