// ---- HapticSettings: the Haptic feedback section (Settings, the Live Fishing View demo, Fish Together) ----
// Says plainly what this phone can do: Android browsers vibrate (on/off timings only, so the presets change the
// pulses, not the motor's strength); iPhone Safari can't vibrate from a web page, so FishDock pulses the edge of the
// screen and plays sounds instead. Settings are kept on this phone (haptics.js).
import { useState } from "react";
import { haptics, hapticSupport, SCOPES } from "../lib/haptics.js";
import { Seg } from "./ui.jsx";

export default function HapticSettings({ compact = false }) {
  const [s, setS] = useState(() => haptics.settings);
  const [tested, setTested] = useState("");
  const cap = hapticSupport();
  const set = (next) => { haptics.set(next); setS(haptics.settings); };
  const test = () => { const r = haptics.feel("test"); setTested(r.done ? (r.how === "visual" ? "This phone can't vibrate, so the edge of the screen pulsed." : "Sent: a bite, then a landing.") : r.why === "off" ? "Haptic feedback is off." : "Nothing to feel just now."); setTimeout(() => setTested(""), 4000); };
  return (
    <div className={`haptic-settings${compact ? " compact" : ""}`}>
      <p className="small muted">
        {cap.kind === "vibration" ? "This phone can vibrate. Browsers only control how long and how often the motor runs, not how hard, so the presets change the pulses, not the strength."
          : cap.kind === "native" ? "The FishDock app uses this phone's own haptics."
            : cap.ios ? "Safari on iPhone can't vibrate from a web page. FishDock shows a soft pulse at the edge of the screen, and plays sounds, instead."
              : "This browser can't vibrate. FishDock shows a soft pulse at the edge of the screen, and plays sounds, instead."}
      </p>
      <label className="check"><input type="checkbox" checked={s.on} onChange={(e) => set({ on: e.target.checked })} /> Haptic feedback <span className="beta-pill">Beta</span></label>
      {s.on ? (<>
        <div className="field"><span className="lbl">Strength</span><Seg value={s.strength} onChange={(v) => set({ strength: v })} options={[{ value: "off", label: "Off" }, { value: "subtle", label: "Subtle" }, { value: "normal", label: "Normal" }, { value: "strong", label: "Strong" }]} label="Strength" /></div>
        <div className="field"><span className="lbl">What to feel</span><Seg value={s.scope} onChange={(v) => set({ scope: v })} options={Object.entries(SCOPES).map(([value, label]) => ({ value, label: label.replace("Full fishing feedback", "Everything").replace("Fish bites only", "Bites only") }))} label="What to feel" /></div>
        <label className="check"><input type="checkbox" checked={s.party} onChange={(e) => set({ party: e.target.checked })} /> Friends' activity in Fish Together (someone joining, hooking a fish, a reaction)</label>
        <label className="check"><input type="checkbox" checked={s.saver} onChange={(e) => set({ saver: e.target.checked })} /> Battery saver (only bites, strikes, strong pulls and landings)</label>
        {cap.kind === "none" ? <label className="check"><input type="checkbox" checked={s.visual} onChange={(e) => set({ visual: e.target.checked })} /> Pulse the edge of the screen instead</label> : null}
        <div className="row"><button type="button" className="btn small" onClick={test}>Test</button>{tested ? <span className="tiny" role="status">{tested}</span> : null}</div>
      </>) : null}
      {!compact ? <p className="tiny">Simulated fishing feels the simulation's own bites, pulls and landings. On a real trip you only feel what was actually logged: a bite, a fish on, a landing or a loss.</p> : null}
    </div>
  );
}
