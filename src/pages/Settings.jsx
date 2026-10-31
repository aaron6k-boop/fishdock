// ---- Settings and privacy: units, theme, privacy, account and backup, your data, Beta features, data sources ----
import { useEffect, useState } from "react";
import { useApp } from "../lib/store.js";
import { exportAll, clearAll } from "../lib/storage.js";
import { exportFile } from "../lib/files.js";
import { accountsEnabled, onUser, signIn, signOut, idToken } from "../lib/account.js";
import { callJSON, PREVIEW } from "../lib/api.js";
import { RULES_CHECKED } from "../data/rules.js";
import { Icon, Seg, Sheet, Notice, Beta } from "../components/ui.jsx";

const SOURCES = [
  ["Weather and sea state", "Open-Meteo forecast and marine APIs (CC BY 4.0)", "https://open-meteo.com/", "Live on the deployed app"],
  ["Tide predictions", "Admiralty UK Tidal API (UK Hydrographic Office)", "https://admiraltyapi.portal.azure-api.net/", "Needs an API key on the server"],
  ["Tide estimate (fallback)", "On-phone lunar model calibrated on published high-water times", null, "Always available, labelled as an estimate"],
  ["River levels and flood warnings", "Environment Agency real-time flood-monitoring API (Open Government Licence)", "https://environment.data.gov.uk/flood-monitoring/doc/reference", "England only for now"],
  ["Depth shading", "EMODnet Bathymetry (coarse modelled grid)", "https://emodnet.ec.europa.eu/en/bathymetry", "Not for navigation"],
  ["Sea marks", "OpenSeaMap (ODbL / CC BY-SA)", "https://openseamap.org/", ""],
  ["Base maps", "OpenStreetMap contributors; Esri World Imagery", "https://www.openstreetmap.org/copyright", ""],
  ["Species records and photos", "NBN Atlas (linked, not copied)", "https://nbnatlas.org/", ""],
  ["Rules and licences", `GOV.UK, Environment Agency, Natural Resources Wales, Scottish Government, DAERA, MMO and IFCAs (checked ${RULES_CHECKED})`, "https://www.gov.uk/freshwater-rod-fishing-rules", ""],
  ["Fishing marks and tackle", "Published angling guides, clubs and councils, cited on each mark, rig and species", null, ""],
];

export default function Settings() {
  const { settings, update, say, go } = useApp();
  const [user, setUser] = useState(null);
  const [del, setDel] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => onUser(setUser), []);
  useEffect(() => { (async () => { if (!user) return; const r = await callJSON("GET", "/api/admin/overview?probe=1", await idToken()); setAdmin(!r.error); })(); }, [user]);
  const priv = (k) => (e) => update((s) => ({ privacy: { ...s.privacy, [k]: e.target.checked } }));
  const beta = (k) => (e) => update((s) => ({ beta: { ...s.beta, [k]: e.target.checked } }));
  return (
    <main className="col">
      <div className="page-head"><button type="button" className="xbtn" onClick={() => go("home")} aria-label="Back"><Icon name="back" /></button><h1>Settings and privacy</h1><span /></div>

      <section className="card">
        <h2 className="h2">Account</h2>
        {PREVIEW ? <p className="small muted">This is the phone preview. Everything runs on your phone as a guest; accounts and backup come with the deployed app.</p>
          : !accountsEnabled() ? <p className="small muted">You're using FishDock as a guest. Accounts and backup switch on once FishDock's own sign-in project is set up.</p>
            : user ? (<><p className="small">Signed in as <b>{user.email}</b>.</p><button type="button" className="btn small" onClick={signOut}>Sign out</button></>)
              : (<><p className="small muted">Guest mode: everything stays on this phone. Sign in to back up your catches and sessions privately, and to post in Community.</p><button type="button" className="btn primary small" onClick={async () => { const r = await signIn(); if (r.error) say("Sign-in didn't complete"); }}>Sign in with Google</button></>)}
      </section>

      <section className="card">
        <h2 className="h2">Units and look</h2>
        <div className="cond-row"><span>Length</span><Seg value={settings.units.length} onChange={(v) => update((s) => ({ units: { ...s.units, length: v } }))} options={[{ value: "cm", label: "Centimetres" }, { value: "in", label: "Inches" }]} /></div>
        <div className="cond-row"><span>Weight</span><Seg value={settings.units.weight} onChange={(v) => update((s) => ({ units: { ...s.units, weight: v } }))} options={[{ value: "lb", label: "lb and oz" }, { value: "kg", label: "kg" }]} /></div>
        <div className="cond-row"><span>Theme</span><Seg value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "System" }]} /></div>
        <div className="cond-row"><span>Rules for</span><Seg value={settings.nation} onChange={(v) => update({ nation: v })} options={[{ value: "auto", label: "Where I fish" }, "England", "Wales", "Scotland", { value: "Northern Ireland", label: "NI" }]} /></div>
      </section>

      <section className="card">
        <h2 className="h2">Privacy</h2>
        <p className="small muted">Private by default: your catches, marks and sessions stay on this phone. FishDock never sells or shares location data and shows no adverts.</p>
        <label className="toggle" htmlFor="pv-gps"><span>Save GPS positions with sessions and catches</span><input id="pv-gps" type="checkbox" checked={settings.privacy.saveGps} onChange={priv("saveGps")} /></label>
        <label className="toggle" htmlFor="pv-approx"><span>Only ever share an approximate area (10 km)</span><input id="pv-approx" type="checkbox" checked disabled /></label>
        <label className="toggle" htmlFor="pv-an"><span>Send anonymous usage counts (no ids, no locations)</span><input id="pv-an" type="checkbox" checked={settings.privacy.analytics} onChange={priv("analytics")} /></label>
      </section>

      <section className="card">
        <h2 className="h2">Beta features</h2>
        <p className="small muted">These are still being field tested. They can be wrong and are labelled Beta wherever they appear.</p>
        <label className="toggle" htmlFor="bt-cast"><span>Cast Advisor <Beta /></span><input id="bt-cast" type="checkbox" checked={settings.beta.castAdvisor} onChange={beta("castAdvisor")} /></label>
        <label className="toggle" htmlFor="bt-sb"><span>Smart Bite <Beta /></span><input id="bt-sb" type="checkbox" checked={settings.beta.smartBite} onChange={beta("smartBite")} /></label>
        <label className="toggle" htmlFor="bt-com"><span>Community <Beta /></span><input id="bt-com" type="checkbox" checked={settings.beta.community} onChange={beta("community")} /></label>
      </section>

      <section className="card">
        <h2 className="h2">Your data</h2>
        <div className="row">
          <button type="button" className="btn small" onClick={async () => { const r = await exportFile("fishdock-export.json", JSON.stringify({ settings, ...(await exportAll()) }, null, 1), "application/json"); say(r.ok ? "Exported" : r.message); }}><Icon name="download" />Export everything</button>
          <button type="button" className="btn small danger" onClick={() => setDel(true)}><Icon name="trash" />Delete my data</button>
        </div>
        <button type="button" className="linkbtn" onClick={() => update({ onboarded: false })}>Show the welcome again</button>
      </section>

      <section className="card">
        <h2 className="h2">Where FishDock's information comes from</h2>
        <div className="sources-table">{SOURCES.map(([what, who, url, note]) => (
          <div key={what}><b>{what}</b><span>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{who}</a> : who}</span>{note ? <span className="tiny">{note}</span> : null}</div>
        ))}</div>
        <p className="tiny">Being on a FishDock map never means a place is legal or safe to fish. Always check access, permits, byelaws and conditions.</p>
      </section>

      {admin ? <button type="button" className="btn" onClick={() => go("admin")}><Icon name="shield" />Admin panel</button> : null}
      <p className="foot">FishDock 0.1 · a sibling of DetectDock · free, private, no adverts</p>

      {del ? (
        <Sheet title="Delete your FishDock data?" onClose={() => setDel(false)}>
          <p className="small">This removes every catch, session, mark and setting on this phone{user ? ", and your private backup on FishDock's server" : ""}. It can't be undone. Export first if you want a copy.</p>
          <button type="button" className="btn danger block" onClick={async () => {
            if (user) await callJSON("DELETE", "/api/sync", await idToken());
            await clearAll();
            try { for (const k of Object.keys(localStorage)) if (k.startsWith("fishdock.")) localStorage.removeItem(k); } catch { /* ignore */ }
            location.reload();
          }}>Delete everything</button>
        </Sheet>
      ) : null}
    </main>
  );
}
