// ---- Before you go: a trip checklist that changes with the place (sea, river, lake) ----
import { useState } from "react";
import { useApp } from "../lib/store.js";
import { Sheet } from "./ui.jsx";

const COMMON = [
  ["safety", "Tell someone where you're going and when you'll be back"],
  ["safety", "Phone charged, in a waterproof pouch"],
  ["safety", "Checked the forecast and any warnings"],
  ["kit", "Rod, reel, spare spool or line"],
  ["kit", "Hooks, swivels, beads and leads or floats for today's rig"],
  ["kit", "Unhooking tool (disgorger or forceps) and a landing net or mat"],
  ["kit", "Knife or scissors and a bag for used line and litter"],
  ["kit", "Head torch with spare batteries"],
  ["kit", "Warm, waterproof layers and grippy footwear"],
  ["kit", "Water, food and a first aid kit"],
];
const SEA = [
  ["safety", "Checked today's tide times and how the tide floods this mark"],
  ["safety", "Lifejacket or buoyancy aid for rocks, piers and breakwaters"],
  ["kit", "Bait cool box for worms and crab"],
  ["kit", "Rod rest or tripod and a bait board"],
  ["legal", "Know the minimum sizes and bass rules for today"],
];
const FRESH = [
  ["legal", "Rod licence (England and Wales) on your phone or printed"],
  ["legal", "Permit, day ticket or club card for this water"],
  ["safety", "Checked the river level and any flood warnings"],
  ["kit", "Bank sticks or a rod pod, and a keepnet only if the fishery allows"],
  ["kit", "Unhooking mat for carp, pike and barbel"],
  ["kit", "Wire trace and long forceps if pike may be about"],
];

export default function Checklist({ onClose }) {
  const { place } = useApp();
  const key = "fishdock.checklist." + place.id;
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } });
  const items = [...COMMON, ...(place.kind === "sea" ? SEA : FRESH)];
  const toggle = (t) => {
    const next = done.includes(t) ? done.filter((x) => x !== t) : [...done, t];
    setDone(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const groups = [["safety", "Safety"], ["legal", "Licences and rules"], ["kit", "Kit"]];
  return (
    <Sheet title="Before you go" aside={`${done.length} of ${items.length} ticked for ${place.name}`} onClose={onClose}>
      {groups.map(([g, label]) => (
        <section className="card" key={g}>
          <h2 className="h2">{label}</h2>
          {items.filter((i) => i[0] === g).map(([, t], i) => (
            <label className="toggle check-item" key={i} htmlFor={`ck-${g}-${i}`}>
              <span className={done.includes(t) ? "done" : ""}>{t}</span>
              <input id={`ck-${g}-${i}`} type="checkbox" checked={done.includes(t)} onChange={() => toggle(t)} />
            </label>
          ))}
        </section>
      ))}
      <button type="button" className="btn ghost block" onClick={() => { setDone([]); try { localStorage.removeItem(key); } catch { /* ignore */ } }}>Clear ticks</button>
    </Sheet>
  );
}
