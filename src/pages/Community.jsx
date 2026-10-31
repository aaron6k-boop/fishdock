// ---- Community (Beta): catch reports, fishing reports and questions. Never an exact location. ----
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { callJSON, PREVIEW } from "../lib/api.js";
import { accountsEnabled, onUser, signIn, idToken } from "../lib/account.js";
import { shrinkImage } from "../lib/storage.js";
import { coarseCell, areaSize } from "../lib/geo.js";
import { fmtDateTime } from "../lib/time.js";
import { SPECIES, speciesById } from "../data/species.js";
import { Icon, Beta, Seg, Sheet, Notice, Empty } from "../components/ui.jsx";
import { FishArt } from "../components/art.jsx";

export default function Community() {
  const { place, say } = useApp();
  const [user, setUser] = useState(null);
  const [kind, setKind] = useState("all");
  const [species, setSpecies] = useState("");
  const [feed, setFeed] = useState({ loading: true, posts: [], error: null });
  const [compose, setCompose] = useState(false);
  const [menu, setMenu] = useState(null);
  useEffect(() => onUser(setUser), []);
  async function load() {
    setFeed((f) => ({ ...f, loading: true }));
    const r = await callJSON("GET", `/api/community/feed?${new URLSearchParams({ ...(kind !== "all" ? { kind } : {}), ...(species ? { species } : {}) })}`, await idToken());
    setFeed(r.error ? { loading: false, posts: [], error: r } : { loading: false, posts: r.posts || [], error: null });
  }
  useEffect(() => { load(); }, [kind, species]); // eslint-disable-line react-hooks/exhaustive-deps
  const trending = Object.entries(feed.posts.reduce((m, p) => { if (p.species) m[p.species] = (m[p.species] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <main className="col">
      <div className="page-head"><h1>Community <Beta /></h1>{accountsEnabled() && user ? <button type="button" className="btn primary small" onClick={() => setCompose(true)}><Icon name="plus" />Post</button> : null}</div>
      <p className="page-sub">Catch reports, conditions reports and questions from UK anglers. Posts show an area, never an exact mark.</p>
      <Seg value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "catch", label: "Catches" }, { value: "report", label: "Reports" }, { value: "question", label: "Questions" }]} />
      <div className="chips scroll">
        <button type="button" className="chip" aria-pressed={!species} onClick={() => setSpecies("")}>All species</button>
        {(trending.length ? trending.map(([id]) => id) : ["bass", "cod", "carp", "pike", "barbel"]).map((id) => <button key={id} type="button" className="chip" aria-pressed={species === id} onClick={() => setSpecies(id)}>{speciesById(id)?.name || id}</button>)}
      </div>
      {PREVIEW ? <Notice>Community runs on FishDock's server, so it's empty in this preview. Nothing here is made up: once the app is deployed, real posts appear.</Notice> : null}
      {!PREVIEW && !accountsEnabled() ? <Notice kind="warn">Posting needs an account, and accounts aren't available yet. You can still read everything here.</Notice> : null}
      {!PREVIEW && accountsEnabled() && !user ? <button type="button" className="btn block" onClick={async () => { const r = await signIn(); if (r.error) say("Sign-in didn't complete"); }}><Icon name="users" />Sign in to post, follow and reply</button> : null}
      {feed.error && !PREVIEW ? <Notice kind="warn">{feed.error.message}</Notice> : null}
      {!feed.loading && !feed.posts.length && !feed.error ? <Empty icon="users" title="No posts yet">Be the first to share a catch or a report from your area.</Empty> : null}
      {feed.posts.map((p) => (
        <article key={p.id} className="card post">
          <div className="post-h">
            <span className="avatar">{(p.author?.name || "A")[0]}</span>
            <span className="grow"><b>{p.author?.name || "Angler"}</b><span className="tiny">{fmtDateTime(Date.parse(p.createdAt) || p.createdAt)}{p.area ? ` · ${p.area}` : ""}</span></span>
            <button type="button" className="xbtn" aria-label="Post options" onClick={() => setMenu(p)}><Icon name="more" /></button>
          </div>
          {p.species ? <div className="row"><span className="chip">{speciesById(p.species)?.name || p.species}</span><span className="tag">{p.kind}</span></div> : null}
          {p.photoUrl ? <img src={p.photoUrl} alt="" className="id-photo" loading="lazy" /> : speciesById(p.species) ? <FishArt art={speciesById(p.species).art} size={160} /> : null}
          <p className="post-text">{p.text}</p>
        </article>
      ))}
      {compose ? <Compose place={place} onClose={() => setCompose(false)} onPosted={() => { setCompose(false); load(); say("Posted"); }} /> : null}
      {menu ? (
        <Sheet title="Post options" onClose={() => setMenu(null)}>
          <button type="button" className="li" onClick={async () => { const r = await callJSON("POST", `/api/community/follow/${menu.author?.uid}`, await idToken()); say(r.error ? r.message : "Following"); setMenu(null); }}><Icon name="users" /><span className="grow"><span className="t">Follow {menu.author?.name || "this angler"}</span></span></button>
          <button type="button" className="li" onClick={async () => { const r = await callJSON("POST", `/api/community/posts/${menu.id}/report`, await idToken(), { reason: "inappropriate" }); say(r.error ? r.message : "Reported to the moderators"); setMenu(null); }}><Icon name="flag" /><span className="grow"><span className="t">Report this post</span></span></button>
          <button type="button" className="li" onClick={async () => { const r = await callJSON("POST", `/api/community/block/${menu.author?.uid}`, await idToken()); say(r.error ? r.message : "Blocked. You won't see each other's posts."); setMenu(null); load(); }}><Icon name="eyeoff" /><span className="grow"><span className="t">Block {menu.author?.name || "this angler"}</span></span></button>
        </Sheet>
      ) : null}
    </main>
  );
}

/** The new-post sheet. `initial` prefills it (Share to Community from a fishing session); nothing posts until Post. */
export function Compose({ place, onClose, onPosted, initial = null }) {
  const [kind, setKind] = useState(initial?.kind || "catch");
  const [text, setText] = useState(initial?.text || "");
  const [species, setSpecies] = useState(initial?.species || "");
  const [area, setArea] = useState(place.region || "");
  const [photo, setPhoto] = useState(initial?.photo ? { dataUrl: initial.photo } : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const cell = coarseCell(place.lat, place.lon);
  return (
    <Sheet title="New post" aside="Shows an area only. Exact marks are never shared." onClose={onClose}>
      <Seg value={kind} onChange={setKind} options={[{ value: "catch", label: "Catch" }, { value: "report", label: "Report" }, { value: "question", label: "Question" }]} />
      <div className="field"><label htmlFor="cp-sp">Species</label><select id="cp-sp" className="input" value={species} onChange={(e) => setSpecies(e.target.value)}><option value="">None</option>{SPECIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="field"><label htmlFor="cp-text">Your post</label><textarea id="cp-text" className="input" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="What, when, how. Please don't name a precise mark if it isn't public." /></div>
      <div className="field"><span className="lbl">Area shown</span><Seg value={area} onChange={setArea} options={[...(place.region ? [{ value: place.region, label: place.region }] : []), { value: cell.label, label: `${areaSize()} area` }, { value: "", label: "No location" }]} /></div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPhoto(await shrinkImage(f, 1280, 0.8)); }} id="cp-photo" />
      <div className="row"><button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="camera" />{photo ? "Change photo" : "Add photo"}</button>{photo ? <img src={photo.dataUrl} alt="" className="thumb" /> : null}</div>
      <p className="tiny">Photos are re-encoded on your phone, which removes their GPS data, and checked again on the server.</p>
      {err ? <Notice kind="warn">{err}</Notice> : null}
      <button type="button" className="btn primary block" disabled={busy || text.trim().length < 3} onClick={async () => {
        setBusy(true); setErr("");
        const r = await callJSON("POST", "/api/community/posts", await idToken(), { kind, text: text.trim(), species: species || null, area: area || null, photo: photo ? photo.dataUrl.split(",")[1] : null });
        setBusy(false);
        if (r.error) setErr(r.message); else onPosted();
      }}>Post</button>
    </Sheet>
  );
}
