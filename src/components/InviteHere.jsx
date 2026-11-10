// ---- InviteHere: invite a friend to fish beside you at this place (Fish Together, Beta) ----
// From the Live Fishing View: starts a private virtual party at the same documented mark (its 3D reconstruction),
// then gives you the invite link to share. Tapping it, your friend joins and stands beside you. A virtual party: both
// of you fish the simulation, nothing is a real catch, and the party only knows the mark's name (a public place), never
// where either of you are.
import { useState } from "react";
import { startParty, remember } from "../lib/party.js";
import { Icon } from "./ui.jsx";
import { myLook, lookOnly } from "./LookPicker.jsx";

export default function InviteHere({ markId, placeName, venue, open, onClose }) {
  const [name, setName] = useState(() => { try { return localStorage.getItem("fishdock.party.name") || ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [made, setMade] = useState(null), [copied, setCopied] = useState(false);
  const start = async () => {
    setBusy(true); setErr("");
    try {
      try { localStorage.setItem("fishdock.party.name", name.trim()); } catch { /* ignore */ }
      const r = await startParty({ mode: "virtual", venue, place: { label: placeName, mark: markId }, name: name.trim() || "Host", outfit: myLook().outfit, look: lookOnly(myLook()), hours: 12 });
      remember(r.code, { key: r.member.key, member: r.member.id, mode: "virtual", venue, expiresAt: r.expiresAt, host: true, secret: r.secret });
      setMade({ code: r.code, link: `${location.origin}${location.pathname}#party/${r.code}/${r.secret}` });
    } catch (e) { setErr(e?.message || "Couldn't start the party just now. Try again in a moment."); }
    setBusy(false);
  };
  const share = () => navigator.share?.({ title: "Fish with me on FishDock", text: `Come and fish with me at ${placeName} (virtual fishing on FishDock)`, url: made.link }).catch(() => {});
  const copy = async () => { try { await navigator.clipboard.writeText(made.link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  if (!open) return null;
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <aside className="watch-panel sheet open invite-here" aria-label="Invite a friend here">
        <div className="sheet-head">
          <div className="try-head"><h1>Invite a friend here <span className="beta-pill">Beta</span></h1><p className="small muted">Fish side by side at {placeName}. A private virtual party: catches are simulated and nobody's position is shared.</p></div>
          <button type="button" className="xbtn sheet-x" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {!made ? (
          <section className="watch-sec">
            <label className="field"><span className="lbl">Your name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Shown above your angler" /></label>
            <button type="button" className="btn primary" disabled={busy} onClick={start}><Icon name="users" />{busy ? "Starting…" : "Start and get a link"}</button>
            {err ? <p className="small warn" role="alert">{err}</p> : null}
          </section>
        ) : (
          <section className="watch-sec">
            <p className="small">Send this link. Whoever taps it joins you here. Only people with the link or the code can come in, and you can lock the party or remove anyone.</p>
            <div className="invite-code-box"><span className="lbl">Join PIN</span><b className="invite-code">{made.code.length === 6 ? `${made.code.slice(0, 3)} ${made.code.slice(3)}` : made.code}</b><span className="tiny">Or they open FishDock, tap Fish Together, then Join with a PIN.</span></div>
            <div className="row">
              {navigator.share ? <button type="button" className="btn primary" onClick={share}><Icon name="share" />Share</button> : null}
              <button type="button" className="btn" onClick={copy}><Icon name="copy" />{copied ? "Copied" : "Copy link"}</button>
            </div>
            <a className="btn" href={`#party/${made.code}`}><Icon name="target" />Go to the party</a>
          </section>
        )}
      </aside>
    </>
  );
}
