// ---- ShareSheet: private links so family and friends can watch this fishing session ----
// Private by default: only people with a link can watch, each link has its own expiry, optional passcode and what
// it may see (approximate location unless you choose exact; catch photos off unless you turn them on). Nothing here
// goes to Community. Stopping sharing deletes the shared copy at once; the session itself keeps recording.
import { useEffect, useState } from "react";
import { Sheet, Seg, Icon, Notice } from "./ui.jsx";
import { useApp } from "../lib/store.js";
import { onShare, startSharing, stopSharing, createLink, revokeLink, updateLink, refreshLinks, watchUrl } from "../lib/liveShare.js";
import { fmtDateTime } from "../lib/time.js";

const EXPIRY = [{ value: "4h", label: "4 hours" }, { value: "12h", label: "12 hours" }, { value: "24h", label: "1 day" }, { value: "3d", label: "3 days" }, { value: "7d", label: "7 days" }];
const LOC = [{ value: "area", label: "Approximate" }, { value: "exact", label: "Exact" }, { value: "hidden", label: "Hidden" }];
const LOC_WORDS = { area: "the area only", exact: "your exact position", hidden: "no location" };

export function sendText(name) { return `${name ? `${name} is` : "I'm"} fishing. Watch live on FishDock:`; }

export function ShareButtons({ url, name }) {
  const [copied, setCopied] = useState(false);
  const text = sendText(name);
  const enc = encodeURIComponent;
  const native = typeof navigator !== "undefined" && navigator.share;
  return (
    <div className="share-btns">
      {native ? <button type="button" className="btn primary" onClick={() => navigator.share({ title: "Watch me fish", text, url }).catch(() => {})}><Icon name="share" />Send</button> : null}
      <a className="btn" href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className="btn" href={`sms:?&body=${enc(`${text} ${url}`)}`}>Messages</a>
      <a className="btn" href={`mailto:?subject=${enc("Watch me fish")}&body=${enc(`${text}\n\n${url}\n\nIt's a private link. Please don't pass it on.`)}`}>Email</a>
      <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}

function PermsEditor({ perms, onChange }) {
  const set = (k, v) => onChange({ ...perms, [k]: v });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field"><span className="lbl">Location they see</span><Seg value={perms.location} onChange={(v) => set("location", v)} options={LOC} />
        <span className="tiny">{perms.location === "exact" ? "Your GPS position while sharing, with a map link. Only choose this for people you'd tell your mark." : perms.location === "hidden" ? "No place name, no map and no photo of your view: they see a representative scene." : "The area (such as the county), never your mark or coordinates."}</span></div>
      <label className="toggle" htmlFor="sp-photos"><span><b>Catch photos</b><br /><span className="tiny">Photos you add to catches, with hidden data removed.</span></span><input id="sp-photos" type="checkbox" checked={perms.photos} onChange={(e) => set("photos", e.target.checked)} /></label>
      <label className="toggle" htmlFor="sp-sizes"><span><b>Fish sizes and weights</b></span><input id="sp-sizes" type="checkbox" checked={perms.sizes} onChange={(e) => set("sizes", e.target.checked)} /></label>
      <label className="toggle" htmlFor="sp-history"><span><b>The session so far</b><br /><span className="tiny">Earlier catches and the activity timeline. Off: they see from when they open the link.</span></span><input id="sp-history" type="checkbox" checked={perms.history} onChange={(e) => set("history", e.target.checked)} /></label>
    </div>
  );
}

export default function ShareSheet({ session, onClose }) {
  const { settings, update, preview } = useApp();
  const [st, setSt] = useState(null);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("24h");
  const [pass, setPass] = useState("");
  const [perms, setPerms] = useState({ location: "area", photos: false, sizes: true, history: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [made, setMade] = useState(null);
  const [edit, setEdit] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const name = settings.liveName || "";
  useEffect(() => onShare(setSt), []);
  useEffect(() => { refreshLinks(); const id = setInterval(refreshLinks, 20e3); return () => clearInterval(id); }, []);
  const mine = st && st.sessionId === session.id ? st : null;

  async function make() {
    setBusy(true); setMsg(""); setMade(null);
    if (!mine) { const r = await startSharing(session); if (r.error) { setBusy(false); setMsg(r.message); return; } }
    const r = await createLink({ label: label.trim() || "Family and friends", expiry, passcode: pass.trim() || null, perms });
    setBusy(false);
    if (r.error) { setMsg(r.message); return; }
    setMade({ ...r, pass: pass.trim() });
    setLabel(""); setPass("");
  }

  const links = (mine?.links || []).filter((l) => !l.revoked);
  return (
    <Sheet title="Share fishing session" aside="Private links for family and friends. Nothing goes to Community." onClose={onClose}>
      {preview ? <Notice kind="warn">Sharing needs FishDock's server, which this preview doesn't have. It works on the live site.</Notice> : null}
      {mine ? (
        <div className={`share-status${mine.error ? " warn" : ""}`}>
          <span className="rec-dot" aria-hidden="true" />
          <span className="grow">{mine.error ? mine.error : <>Sharing · <b>{mine.watching || 0}</b> watching now</>}</span>
          <span className="tiny">{mine.lastOk ? `Sent ${Math.max(0, Math.round((Date.now() - mine.lastOk) / 1000))} s ago` : ""}</span>
        </div>
      ) : null}

      {made ? (
        <div className="card share-made">
          <div className="card-h"><h2>Link for {made.link.label}</h2><span className="aside">until {fmtDateTime(made.link.expiresAt)}</span></div>
          <code className="share-url">{made.url}</code>
          <ShareButtons url={made.url} name={name} />
          {made.pass ? <p className="small">Passcode: <b>{made.pass}</b>. Send it separately, for example by phone.</p> : null}
          <p className="tiny">They don't need FishDock or an account. They'll see {LOC_WORDS[made.link.perms.location]}{made.link.perms.photos ? ", catch photos" : ""}{made.link.perms.sizes ? ", sizes" : ""}.</p>
        </div>
      ) : null}

      <section className="stack" style={{ gap: 10 }}>
        <h3 className="eyebrow">{links.length ? "Add another link" : "Make a private link"}</h3>
        <div className="field"><label htmlFor="sh-name">Your name on the link</label><input id="sh-name" className="input" maxLength={30} value={name} onChange={(e) => update({ liveName: e.target.value })} placeholder="e.g. Aaron" /></div>
        <div className="field"><label htmlFor="sh-label">Who it's for</label><input id="sh-label" className="input" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mum, or the family group" /><span className="tiny">One link each lets you see who's watching and remove one person without the others.</span></div>
        <div className="field"><span className="lbl">Link lasts</span><Seg value={expiry} onChange={setExpiry} options={EXPIRY} /></div>
        <div className="field"><label htmlFor="sh-pass">Passcode (optional)</label><input id="sh-pass" className="input" inputMode="text" autoComplete="off" maxLength={12} value={pass} onChange={(e) => setPass(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="4 to 12 letters or numbers" /></div>
        <PermsEditor perms={perms} onChange={setPerms} />
        {msg ? <Notice kind="warn">{msg}</Notice> : null}
        <button type="button" className="btn primary block" onClick={make} disabled={busy || preview || (pass && pass.length < 4)}><Icon name="share" />{busy ? "Making the link…" : "Create private link"}</button>
      </section>

      {links.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h3 className="eyebrow">Links</h3>
          <div className="list">
            {links.map((l) => (
              <div key={l.id} className={`li share-link${l.active ? "" : " ended"}`}>
                <span className="grow"><span className="t">{l.label}{l.hasPasscode ? " · passcode" : ""}</span>
                  <span className="s">{l.active ? `${l.watching || 0} watching · until ${fmtDateTime(l.expiresAt)}` : "Expired"} · {LOC_WORDS[l.perms.location]}</span></span>
                {l.active && mine?.tokens?.[l.id] ? <button type="button" className="xbtn" aria-label={`Send ${l.label}'s link again`} onClick={() => setMade({ link: l, url: watchUrl(mine.tokens[l.id]) })}><Icon name="share" /></button> : null}
                {l.active ? <button type="button" className="xbtn" aria-label={`Change what ${l.label} sees`} onClick={() => setEdit({ id: l.id, label: l.label, perms: l.perms })}><Icon name="settings" /></button> : null}
                <button type="button" className="xbtn danger-text" aria-label={`Remove ${l.label}'s link`} onClick={async () => { const r = await revokeLink(l.id); if (r.error) setMsg(r.message); }}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {edit ? (
        <div className="card">
          <div className="card-h"><h2>What {edit.label} sees</h2></div>
          <PermsEditor perms={edit.perms} onChange={(p) => setEdit({ ...edit, perms: p })} />
          <div className="row"><button type="button" className="btn primary" onClick={async () => { const r = await updateLink(edit.id, edit.perms); if (r.error) setMsg(r.message); else setEdit(null); }}>Save</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      ) : null}

      {mine ? (confirmStop ? (
        <div className="card">
          <p className="small">Everyone loses access at once and the shared copy is deleted. Your session keeps recording on this phone.</p>
          <div className="row"><button type="button" className="btn danger" onClick={async () => { const r = await stopSharing(); if (r.error) setMsg(r.message); else { setConfirmStop(false); setMade(null); } }}><Icon name="stop" />Stop sharing</button><button type="button" className="btn ghost" onClick={() => setConfirmStop(false)}>Keep sharing</button></div>
        </div>
      ) : <button type="button" className="btn ghost danger-text block" onClick={() => setConfirmStop(true)}><Icon name="eyeoff" />Stop sharing</button>) : null}

      <p className="tiny">Viewers see an animated reconstruction from what you log (casts, bites, fish on, catches), with the weather and tide. It isn't a camera. Phones pause web apps when the screen locks or you switch apps, so updates wait until FishDock is open again; viewers are told your phone has gone quiet.</p>
    </Sheet>
  );
}
