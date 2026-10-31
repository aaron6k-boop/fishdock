// ---- Admin (ADMIN_EMAILS / ADMIN_UIDS only, checked on the server): usage, data health, feedback, moderation, flags ----
// Locations appear only as region names. No coordinates are ever sent to this screen.
import { useEffect, useState } from "react";
import { useApp } from "../lib/store.js";
import { callJSON } from "../lib/api.js";
import { idToken, onUser } from "../lib/account.js";
import { fmtDateTime } from "../lib/time.js";
import { Icon, Notice, Tabs } from "../components/ui.jsx";

export default function Admin() {
  const { go, say } = useApp();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [fb, setFb] = useState(null);
  const [reports, setReports] = useState(null);
  const [flags, setFlags] = useState(null);
  const [user, setUser] = useState(null);
  useEffect(() => onUser(setUser), []);
  useEffect(() => { (async () => {
    const t = await idToken();
    const [o, f, r, fl] = await Promise.all([callJSON("GET", "/api/admin/overview", t), callJSON("GET", "/api/admin/feedback", t), callJSON("GET", "/api/admin/reports", t), callJSON("GET", "/api/admin/flags", t)]);
    setData(o); setFb(f); setReports(r); setFlags(fl);
  })(); }, [user]);
  if (!data) return <main className="col"><p className="muted">Loading…</p></main>;
  if (data.error) return <main className="col"><div className="page-head"><h1>Not found</h1></div><Notice>{data.status === 404 || data.status === 403 ? "This page isn't available." : data.message}</Notice><button type="button" className="btn" onClick={() => go("home")}>Home</button></main>;
  const Stat = ({ k, v }) => <div className="stat"><b>{v ?? "–"}</b><span>{k}</span></div>;
  const toggleFlag = async (k) => { const next = { ...(flags?.flags || {}), [k]: !flags?.flags?.[k] }; const r = await callJSON("PUT", "/api/admin/flags", await idToken(), { flags: next }); if (r.error) say(r.message); else setFlags({ flags: next }); };
  return (
    <main className="col">
      <div className="page-head"><h1>Admin</h1><span className="tiny">No coordinates shown</span></div>
      <Tabs label="Admin" value={tab} onChange={setTab} options={[{ value: "overview", label: "Overview" }, { value: "health", label: "Data health" }, { value: "feedback", label: "Feedback" }, { value: "mod", label: "Moderation" }, { value: "flags", label: "Features" }]} />
      {tab === "overview" ? (
        <>
          <div className="stats">
            <Stat k="registered" v={data.users?.total} /><Stat k="active today" v={data.users?.dau} /><Stat k="active this month" v={data.users?.mau} />
            <Stat k="guests today" v={data.guests?.today} /><Stat k="sessions started" v={data.sessions?.total} /><Stat k="catches logged" v={data.catches?.total} />
            <Stat k="AI casts today" v={data.ai?.castToday} /><Stat k="AI IDs today" v={data.ai?.identifyToday} /><Stat k="feedback (7 days)" v={data.feedback?.week} />
          </div>
          <section className="card"><h2 className="h2">Most viewed species</h2><Rows rows={data.topSpecies} /></section>
          <section className="card"><h2 className="h2">Most used areas (region names only)</h2><Rows rows={data.topRegions} /></section>
          <section className="card"><h2 className="h2">Bait advisor runs</h2><Rows rows={data.topAdvisor} /></section>
        </>
      ) : null}
      {tab === "health" ? (
        <section className="card">
          <h2 className="h2">Upstream data sources</h2>
          <div className="tablewrap"><table className="t"><thead><tr><th>Source</th><th>Last OK</th><th>Last failure</th></tr></thead><tbody>
            {(data.health || []).map((h) => <tr key={h.upstream}><td>{h.upstream}</td><td className="n">{h.lastOk ? fmtDateTime(Date.parse(h.lastOk)) : "–"}</td><td className="n">{h.lastFail ? `${fmtDateTime(Date.parse(h.lastFail))}${h.lastError ? `: ${h.lastError}` : ""}` : "–"}</td></tr>)}
          </tbody></table></div>
        </section>
      ) : null}
      {tab === "feedback" ? (
        <section className="card"><h2 className="h2">Feedback and inaccuracy reports</h2>
          {(fb?.items || []).length ? (fb.items).map((f) => <div key={f.id} className="li static"><span className="tag">{f.kind}</span><span className="grow"><span className="s wrap">{f.text}</span><span className="tiny">{fmtDateTime(Date.parse(f.createdAt))}{f.ref ? ` · ${f.ref}` : ""}</span></span></div>) : <p className="small muted">{fb?.message || "Nothing yet."}</p>}
        </section>
      ) : null}
      {tab === "mod" ? (
        <section className="card"><h2 className="h2">Reported posts</h2>
          {(reports?.items || []).length ? reports.items.map((r) => (
            <div key={r.postId} className="li static"><span className="grow"><span className="t wrap">{r.text}</span><span className="tiny">{r.reports} reports · {r.author}</span></span>
              <button type="button" className="btn small" onClick={async () => { const x = await callJSON("POST", `/api/admin/posts/${r.postId}/hide`, await idToken()); say(x.error ? x.message : "Hidden"); }}>Hide</button>
              <button type="button" className="btn small danger" onClick={async () => { const x = await callJSON("POST", `/api/admin/users/${r.authorUid}/ban`, await idToken()); say(x.error ? x.message : "Banned"); }}>Ban</button>
            </div>)) : <p className="small muted">{reports?.message || "No open reports."}</p>}
        </section>
      ) : null}
      {tab === "flags" ? (
        <section className="card"><h2 className="h2">Feature switches</h2>
          {["castAdvisor", "identify", "smartBite", "community", "liveShare"].map((k) => <label key={k} className="toggle" htmlFor={`fl-${k}`}><span>{k}</span><input id={`fl-${k}`} type="checkbox" checked={flags?.flags?.[k] !== false} onChange={() => toggleFlag(k)} /></label>)}
        </section>
      ) : null}
      <button type="button" className="btn ghost" onClick={() => go("settings")}><Icon name="back" />Back</button>
    </main>
  );
}

function Rows({ rows }) {
  if (!rows?.length) return <p className="small muted">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return <div className="bars">{rows.slice(0, 10).map((r) => <div key={r.name} className="bar-row"><span className="bl">{r.name}</span><span className="bt"><i style={{ width: `${(r.count / max) * 100}%` }} /></span><b className="num">{r.count}</b></div>)}</div>;
}
