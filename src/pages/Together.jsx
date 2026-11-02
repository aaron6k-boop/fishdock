// ---- Together: the Fish Together start page (#together) ----
// Fish alone, start a party (virtual fishing or a real trip), watch a friend, join with a code, or go back to a party
// you're in. Everything here is private: parties are only for the people you invite.
import { useState } from "react";
import HapticSettings from "../components/HapticSettings.jsx";
import { Icon } from "../components/ui.jsx";
import { startParty, previewParty, remember, myParties, cleanCode, CODE_RE } from "../lib/party.js";
import { OUTFITS } from "../lib/world3d/angler.js";

const VENUES = [["pier", "Pier"], ["beach", "Beach"], ["estuary", "Estuary"], ["river", "River"], ["lake", "Lake"]];
const go = (h) => { location.hash = h; };

export function OutfitPicker({ value, onChange }) {
  return (
    <div className="outfits" role="radiogroup" aria-label="Clothes">
      {OUTFITS.map((o, i) => <button key={o.name} type="button" role="radio" aria-checked={value === i} aria-label={o.name} title={o.name} className={`outfit${value === i ? " on" : ""}`} style={{ "--jk": `#${o.jacket.toString(16).padStart(6, "0")}`, "--ht": `#${o.hat.toString(16).padStart(6, "0")}` }} onClick={() => onChange(i)}><i /></button>)}
    </div>
  );
}

export default function Together() {
  const [panel, setPanel] = useState(null);
  const [mode, setMode] = useState("virtual"), [venue, setVenue] = useState("pier"), [label, setLabel] = useState(""), [hours, setHours] = useState(12);
  const [name, setName] = useState(() => { try { return localStorage.getItem("fishdock.party.name") || ""; } catch { return ""; } });
  const [outfit, setOutfit] = useState(0), [code, setCode] = useState(""), [link, setLink] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const saveName = (n) => { setName(n); try { localStorage.setItem("fishdock.party.name", n); } catch { /* ignore */ } };
  const mine = myParties();
  async function start() {
    setBusy(true); setMsg("");
    try {
      const r = await startParty({ mode, venue, place: { label: label.trim() || null }, name: name.trim() || "Host", outfit, hours });
      remember(r.code, { key: r.member.key, member: r.member.id, mode, venue, expiresAt: r.expiresAt, host: true, secret: r.secret });
      go(`#party/${r.code}/${r.secret}`);
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function byCode() {
    const c = cleanCode(code);
    if (!CODE_RE.test(c)) { setMsg("A party code is six letters and numbers."); return; }
    setBusy(true); setMsg("");
    try { await previewParty(c, { viaCode: true }); go(`#party/${c}/code`); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  function openLink() {
    const m = link.match(/#party\/([A-Z0-9]{6})\/([A-Za-z0-9_-]{8,40})/);
    if (!m) { setMsg("That doesn't look like a FishDock party link. It should contain #party/ and a code."); return; }
    go(`#party/${m[1]}/${m[2]}`);
  }
  const card = (id, icon, title, sub, onClick) => (
    <button type="button" className={`tg-card${panel === id ? " on" : ""}`} onClick={onClick || (() => { setMsg(""); setPanel(panel === id ? null : id); })}>
      <span className="tg-ico"><Icon name={icon} /></span><span className="grow"><b>{title}</b><span>{sub}</span></span><Icon name="chevron" />
    </button>
  );
  return (
    <div className="watch-shell tg-shell">
      <main className="tg">
        <header className="tg-head">
          <a href="/" className="xbtn" aria-label="Back to FishDock"><Icon name="back" /></a>
          <div><h1>Fish Together <span className="beta-pill">Beta</span></h1><p className="small muted">Fish beside friends in a 3D place, or share a real trip with family. Private: only people you invite can join.</p></div>
        </header>
        {card("alone", "target", "Fish alone", "Cast, strike and reel in, on a photo of a real place or in 3D", () => go("#try"))}
        {card("start", "users", "Fish together", "Start a private party and invite up to three friends")}
        {panel === "start" ? (
          <section className="tg-form">
            <div className="field"><span className="lbl">What kind of party</span>
              <div className="tg-modes">
                <button type="button" className={`tg-mode${mode === "virtual" ? " on" : ""}`} onClick={() => setMode("virtual")}><b>Virtual fishing</b><span>Everyone fishes the simulation from wherever they are. Every catch is marked simulated and never goes in anyone's real records.</span></button>
                <button type="button" className={`tg-mode${mode === "real" ? " on" : ""}`} onClick={() => setMode("real")}><b>Real trip</b><span>People actually fishing log their casts, bites and catches; friends and family watch it animated. Nothing is made up.</span></button>
              </div>
            </div>
            <div className="field"><span className="lbl">The place</span><div className="moments">{VENUES.map(([v, l]) => <button key={v} type="button" className={`chip${venue === v ? " on" : ""}`} onClick={() => setVenue(v)}>{l}</button>)}</div></div>
            <label className="field"><span className="lbl">Name the place (optional)</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Norfolk coast" /><span className="tiny">Shown to everyone in the party. An area is enough: the party never knows exactly where anyone is.</span></label>
            <div className="field"><span className="lbl">How long it stays open</span><div className="moments">{[2, 6, 12, 24].map((h) => <button key={h} type="button" className={`chip${hours === h ? " on" : ""}`} onClick={() => setHours(h)}>{h} hours</button>)}</div></div>
            <label className="field"><span className="lbl">Your name</span><input value={name} onChange={(e) => saveName(e.target.value)} maxLength={24} placeholder="Shown above your angler" /></label>
            <div className="field"><span className="lbl">Your clothes</span><OutfitPicker value={outfit} onChange={setOutfit} /></div>
            <button type="button" className="btn primary block" disabled={busy} onClick={start}><Icon name="users" />{busy ? "Starting…" : "Start the party"}</button>
          </section>
        ) : null}
        {card("watch", "eye", "Watch a friend", "Open the private link a friend sent you")}
        {panel === "watch" ? (
          <section className="tg-form">
            <p className="small">A friend's live session or party link opens straight from the message they sent. Or paste it here:</p>
            <label className="field"><span className="lbl">Party link</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/#party/…" /></label>
            <button type="button" className="btn block" onClick={openLink}>Open</button>
          </section>
        ) : null}
        {card("code", "lock", "Join with an invite code", "Six letters and numbers from the host")}
        {panel === "code" ? (
          <section className="tg-form">
            <label className="field"><span className="lbl">Invite code</span><input className="tg-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="ABC234" maxLength={6} /></label>
            <button type="button" className="btn primary block" disabled={busy || code.length !== 6} onClick={byCode}>{busy ? "Checking…" : "Find the party"}</button>
          </section>
        ) : null}
        {mine.length ? card("mine", "clock", "Continue a party", `${mine.length} on this phone`) : null}
        {panel === "mine" ? (
          <section className="tg-form list">
            {mine.map((p) => <a key={p.code} className="li" href={`#party/${p.code}`}><span className="grow"><span className="t">{p.mode === "real" ? "Real trip" : "Virtual fishing"} · {p.code}</span><span className="s">{p.host ? "You're the host" : "Joined"}{p.expiresAt ? ` · open until ${new Date(p.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span></span><Icon name="chevron" /></a>)}
          </section>
        ) : null}
        {msg ? <p className="notice warn small" role="alert"><Icon name="info" /><span>{msg}</span></p> : null}
        <details className="tg-haptics"><summary className="small">Haptic feedback</summary><HapticSettings compact /></details>
        <p className="tiny tg-foot">Fish Together is in Beta. Virtual catches are simulated and kept apart from real ones. A party knows the kind of place and the name you give it, never anyone's position. The host can lock it, remove people and close it.</p>
      </main>
    </div>
  );
}
