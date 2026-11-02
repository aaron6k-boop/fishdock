// ---- Watch: the page a private Live Fishing View link opens (no account, no app install, no onboarding) ----
// Polls the server for events newer than the last sequence number it has, so a reconnect never repeats or loses a
// catch. The scene plays a few seconds behind the angler, like any live stream, so every cast and catch plays in
// full and in order. When the angler's phone goes quiet (locked screen, no signal) it says so and keeps the last
// known state; nothing is made up to fill the gap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FishingScene, { CatchCard } from "../components/FishingScene.jsx";
import { QUALITY_OPTIONS } from "../components/FishingScene.jsx";
import { phaseAt, activityText, timelineRows, notable, EV_INFO } from "../lib/liveEvents.js";
import { landedCatches, isLanded } from "../lib/landed.js";
import { defaultView } from "../lib/scene.js";
import { fmtTime, fmtDuration, fmtClock, fmtDateTime } from "../lib/time.js";
import { speciesById } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";
import { Icon, Seg } from "../components/ui.jsx";

const DELAY = 4500; // ms the scene runs behind the angler's phone
const VKEY = "fishdock.viewerId";
function viewerId() {
  try { let v = localStorage.getItem(VKEY); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem(VKEY, v); } return v; } catch { return "viewer-" + Math.random().toString(36).slice(2, 14); }
}
const grantKey = (token) => `fishdock.grant.${token.slice(0, 10)}`;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (deg) => (deg == null ? "" : COMPASS[Math.round(deg / 45) % 8]);
const elapsedOf = (s, now) => (s ? Math.max(0, (s.endedAt || (s.status === "paused" && s.pausedAt ? s.pausedAt : now)) - s.startedAt - (s.pausedMs || 0)) : 0);

const TL_MARKS = ["cast", "bite", "missed", "hooked", "lost", "catch"];

export default function Watch({ token }) {
  const [phase, setPhase] = useState("loading"); // loading | passcode | ended | ok
  const [share, setShare] = useState(null);
  const [events, setEvents] = useState([]);
  const [link, setLink] = useState(null);
  const [watching, setWatching] = useState(0);
  const [conn, setConn] = useState("ok");
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(() => { try { return Number(localStorage.getItem("fishdock.watch.volume") ?? 0.7); } catch { return 0.7; } });
  const [buzz, setBuzz] = useState(false);
  const [quality, setQuality] = useState(() => { try { return localStorage.getItem("fishdock.watch.quality") || "auto"; } catch { return "auto"; } });
  const [replayT, setReplayT] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [sceneSrc, setSceneSrc] = useState(null);
  const [photos, setPhotos] = useState({});
  const [pass, setPass] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [open, setOpen] = useState(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [sheet, setSheet] = useState(false);
  const goTo = (id) => { setSheet(true); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 320); };
  const [, tick] = useState(0);
  const sceneRef = useRef(null);
  const st = useRef({ lastSeq: 0, offset: 0, skew: null, timer: 0, fails: 0, stopped: false, sceneV: -1 });
  const headers = useCallback(() => {
    const h = { accept: "application/json", "x-fishdock": "1", "x-fishdock-link": token, "x-fishdock-viewer": viewerId() };
    try { const g = sessionStorage.getItem(grantKey(token)) || localStorage.getItem(grantKey(token)); if (g) h["x-fishdock-grant"] = g; } catch { /* ignore */ }
    return h;
  }, [token]);

  const poll = useCallback(async () => {
    const s = st.current;
    clearTimeout(s.timer);
    if (s.stopped) return;
    let next = 3000;
    try {
      const res = await fetch(`/api/live/view?after=${s.lastSeq}`, { headers: headers(), cache: "no-store" });
      if (res.status === 401) { setPhase("passcode"); return; }
      if (res.status === 404) { setPhase("ended"); s.stopped = true; return; }
      if (!res.ok) throw new Error(String(res.status));
      const b = await res.json();
      const off = b.now - Date.now();
      s.offset = s.fails || !s.offset ? off : s.offset * 0.7 + off * 0.3;
      if (b.events?.length) {
        for (const e of b.events) { const k = e.at - e.t; s.skew = s.skew == null ? k : Math.min(s.skew, k); }
        setEvents((old) => { const m = new Map(old.map((e) => [e.seq, e])); for (const e of b.events) m.set(e.seq, e); return [...m.values()].sort((a, c) => a.seq - c.seq); });
      }
      s.lastSeq = Math.max(s.lastSeq, b.share?.lastSeq || 0, ...(b.events || []).map((e) => e.seq));
      setShare(b.share); setLink(b.link); setWatching(b.watching || 0); setConn("ok"); setPhase("ok");
      s.fails = 0;
      next = b.nextPollMs || 3000;
    } catch {
      s.fails++; setConn("retrying");
      next = Math.min(30000, 2000 * 2 ** Math.min(s.fails, 4));
    }
    if (document.visibilityState === "hidden") next = Math.max(next, 30000);
    s.timer = setTimeout(poll, next);
  }, [headers]);

  useEffect(() => {
    poll();
    const vis = () => { if (document.visibilityState === "visible" && !st.current.stopped) poll(); };
    document.addEventListener("visibilitychange", vis);
    addEventListener("online", vis);
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => { clearTimeout(st.current.timer); st.current.stopped = true; document.removeEventListener("visibilitychange", vis); removeEventListener("online", vis); clearInterval(iv); };
  }, [poll]);

  // the angler's scene photo, fetched with the link (it isn't at a public address)
  useEffect(() => {
    const sc = share?.scene;
    if (!sc) return;
    if (sc.kind === "commons") { setSceneSrc(sc.commons?.url || null); return; }
    if (sc.kind !== "own") { setSceneSrc(null); return; }
    if (st.current.sceneV === sc.v) return;
    st.current.sceneV = sc.v;
    fetch(`/api/live/scene?v=${sc.v}`, { headers: headers() }).then((r) => (r.ok ? r.blob() : null)).then((b) => setSceneSrc(b ? URL.createObjectURL(b) : null)).catch(() => setSceneSrc(null));
  }, [share?.scene?.kind, share?.scene?.v, share?.scene?.commons?.url, headers]);

  // catch photos, when the link allows them
  useEffect(() => {
    for (const e of events) {
      const pid = e.type === "catch" ? e.data?.photo : null;
      if (!pid || photos[pid] !== undefined) continue;
      setPhotos((p) => ({ ...p, [pid]: null }));
      fetch(`/api/live/photo/${pid}`, { headers: headers() }).then((r) => (r.ok ? r.blob() : null)).then((b) => setPhotos((p) => ({ ...p, [pid]: b ? URL.createObjectURL(b) : false }))).catch(() => {});
    }
  }, [events, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  // replay playback (20x speed)
  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now(), raf = 0;
    const step = (ts) => { const dt = ts - last; last = ts; setReplayT((t) => (t == null ? t : t + dt * 20)); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const phoneNow = () => Date.now() + st.current.offset - (st.current.skew ?? 0);
  const liveNow = () => phoneNow() - DELAY;
  const end = share?.endedAt || phoneNow();
  useEffect(() => { if (replayT != null && share && replayT >= end) { setPlaying(false); setReplayT(null); } }, [replayT, end, share]);
  const sceneNow = useCallback(() => (replayT != null ? replayT : liveNow()), [replayT]); // eslint-disable-line react-hooks/exhaustive-deps
  const evs = useMemo(() => {
    if (!share) return [];
    const list = [{ type: "start", t: share.startedAt, seq: 0 }, ...events];
    if (share.status === "ended" && share.endedAt && !events.some((e) => e.type === "end")) list.push({ type: "end", t: share.endedAt, seq: 1e9 });
    return list;
  }, [events, share]);

  if (phase === "loading") return <div className="watch-shell"><div className="watch-msg"><span className="loading-dots" aria-label="Loading" /><p className="muted">Opening the live view…</p></div></div>;
  if (phase === "ended") return (
    <div className="watch-shell"><div className="watch-msg">
      <Icon name="eyeoff" size={34} />
      <h1>This link has ended</h1>
      <p className="muted">It may have expired, or the angler stopped sharing. Ask them for a new link.</p>
      <a className="btn" href="/">Open FishDock</a>
    </div></div>
  );
  if (phase === "passcode") return (
    <div className="watch-shell"><form className="watch-msg" onSubmit={async (e) => {
      e.preventDefault(); setPassMsg("");
      const r = await fetch("/api/live/unlock", { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify({ passcode: pass.trim() }) }).catch(() => null);
      const b = r ? await r.json().catch(() => ({})) : {};
      if (r?.ok && b.grant) { try { sessionStorage.setItem(grantKey(token), b.grant); } catch { /* ignore */ } setPhase("loading"); st.current.stopped = false; poll(); }
      else setPassMsg(b.message || "That didn't work. Check the passcode.");
    }}>
      <Icon name="lock" size={34} />
      <h1>Enter the passcode</h1>
      <p className="muted">The angler protected this link. They'll have sent the passcode separately.</p>
      <input className="input" autoFocus autoComplete="off" inputMode="text" maxLength={12} value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passcode" />
      {passMsg ? <p className="small" style={{ color: "var(--warn)" }}>{passMsg}</p> : null}
      <button type="submit" className="btn primary" disabled={pass.trim().length < 4}>Watch</button>
    </form></div>
  );

  const now = sceneNow();
  const p = phaseAt(evs, now, { status: replayT != null ? undefined : share.status });
  const who = share.name || "The angler";
  const target = share.target?.name || null;
  const catches = landedCatches(evs, now, share.place?.venue).reverse(); // a catch joins the list once it's out of the water
  // "landed" only once the fish is out of the water on screen; until then it's being landed
  const landingNow = p.phase === "landing" && !isLanded(p.ev, now, share.place?.venue);
  const actShort = landingNow ? "Landing a fish" : activityText(p, { who: "", target });
  const actText = p.phase === "landing" && !isLanded(p.ev, now, share.place?.venue) ? `${share.name || "The angler"} is landing a fish` : activityText(p, { who: share.name, target });
  const tlPct = (t) => Math.max(0, Math.min(100, ((t - share.startedAt) / Math.max(60e3, end - share.startedAt)) * 100));
  const counts = replayT != null ? null : share.counts;
  const statusChip = share.status === "ended" ? ["ended", "Ended"] : share.status === "paused" ? ["paused", "Paused"] : !share.connected ? ["quiet", "Phone quiet"] : ["live", "LIVE"];
  const c = share.cond || {};
  const scene = { kind: sceneSrc ? share.scene.kind : "representative", src: sceneSrc, view: share.scene?.view || defaultView(), commons: share.scene?.commons };
  const quietFor = share.anglerSeenAt ? Date.now() + st.current.offset - share.anglerSeenAt : 0;

  return (
    <div className={`watch-shell immersive${uiHidden ? " ui-hidden" : ""}`}>
      <div className="watch">
        <div className="watch-stage">
          <FishingScene ref={sceneRef} scene={scene} events={evs} status={replayT != null ? "running" : share.status} now={sceneNow}
            env={{ cond: share.cond, light: share.light, kind: share.place?.kind, venue: share.place?.venue }} quality={quality} sound={sound} volume={volume} vibrate={buzz && replayT == null}
            catchPhoto={(ev) => (ev?.data?.photo ? photos[ev.data.photo] || null : null)} onTap={() => setUiHidden((h) => !h)}>
            <div className="fs-top">
              <span className={`live-badge s-${replayT != null ? "replay" : statusChip[0]}`}>{replayT != null ? "Replay" : <><span className="rec-dot" />{statusChip[1]}</>}</span>
              <span className="fs-chip num">{fmtClock(elapsedOf(share, phoneNow()))}</span>
              {c.windKph != null ? <span className="fs-chip"><Icon name="wind" />{Math.round(c.windKph * 0.621)} mph {compass(c.windDir)}</span> : null}
              {c.tide ? <span className="fs-chip"><Icon name="wave" />{c.tide}</span> : null}
              <span className="grow" />
              <button type="button" className="fs-btn" onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} aria-pressed={sound}><Icon name={sound ? "volume" : "mute"} /></button>
              <button type="button" className="fs-btn watch-more" onClick={() => setSheet(true)} aria-label="Session details"><Icon name="list" /></button>
            </div>
            <div className="fs-bottom">
              {/* a slim tray, out of the rod's way: what's happening, the session at a glance, the catches; it steps
                  aside while a fish is landed */}
              <div className={`view-tray${p.phase === "landing" && !isLanded(p.ev, now, share.place?.venue) ? " is-busy" : ""}`}>
                <div className="vt-act" aria-live="polite"><b>{who}</b><span>{replayT != null ? "Replay: " : ""}{actShort}</span></div>
                {evs.some((e) => TL_MARKS.includes(e.type)) ? (
                  <button type="button" className="mini-tl" onClick={() => goTo("w-timeline")} aria-label={`Timeline: ${catches.length} caught. Open the full timeline`}>
                    {evs.filter((e) => TL_MARKS.includes(e.type) && e.t <= now && (e.type !== "catch" || isLanded(e, now, share.place?.venue))).slice(-80).map((e) => <i key={`${e.seq}-${e.t}`} className={`t-${e.type}`} style={{ left: `${tlPct(e.t)}%` }} />)}
                    <b style={{ left: `${tlPct(now)}%` }} />
                  </button>
                ) : null}
                <div className="vt-btns">
                  <button type="button" className="ft-pill" onClick={() => goTo("w-catches")}><Icon name="fish" />{catches.length ? `${catches.length} caught` : "Catches"}</button>
                  <button type="button" className="ft-pill" onClick={() => goTo("w-timeline")}><Icon name="clock" />Timeline</button>
                  {catches[0] ? <button type="button" className="ft-pill" onClick={() => setOpen(catches[0])}>{catches[0].data?.name || "Fish"}{catches[0].data?.lengthCm ? `, ${catches[0].data.lengthCm} cm` : ""}</button> : null}
                </div>
              </div>
            </div>
          </FishingScene>
        </div>

        {sheet ? <div className="sheet-scrim" onClick={() => setSheet(false)} /> : null}
        <div className={`watch-panel sheet${sheet ? " open" : ""}`} aria-label="Session details">
          <div className="sheet-head"><div className="try-head"><h1>{who}{replayT != null ? ": replay" : ""}</h1><p className="small muted">Animated from logged events, not a camera.</p></div><button type="button" className="xbtn sheet-x" onClick={() => setSheet(false)} aria-label="Close details"><Icon name="close" /></button></div>
          {replayT == null && !share.connected && share.status !== "ended" ? <div className="notice warn small"><Icon name="info" /><span>{who}'s phone hasn't sent anything for {fmtDuration(quietFor)}. Phones pause FishDock when the screen locks or there's no signal. This is the last thing it sent.</span></div> : null}
          {conn === "retrying" ? <div className="notice small"><Icon name="info" /><span>Reconnecting… you'll catch up on anything you missed.</span></div> : null}
          <div className="watch-activity" aria-live="polite">{actText}</div>
          <div className="stat-line">
            <div><b className="num">{counts ? counts.casts : evs.filter((e) => e.type === "cast" && e.t <= now).length}</b><span>Casts</span></div>
            <div><b className="num">{counts ? counts.bites : evs.filter((e) => e.type === "bite" && e.t <= now).length}</b><span>Bites</span></div>
            <div><b className="num">{counts ? counts.missed : evs.filter((e) => e.type === "missed" && e.t <= now).length}</b><span>Missed</span></div>
            <div className="hl"><b className="num">{counts ? counts.catches : catches.length}</b><span>Caught</span></div>
          </div>
          <div className="watch-chips">
            {target ? <span className="chip"><Icon name="target" />Fishing for {target}</span> : null}
            {c.waveM != null ? <span className="chip"><Icon name="wave" />Waves {c.waveM} m</span> : null}
            {c.tempC != null ? <span className="chip"><Icon name="thermo" />{c.tempC}°C</span> : null}
            {c.tideNext?.t ? <span className="chip"><Icon name="clock" />{c.tideNext.type} water {c.tideApprox ? "about " : ""}{fmtTime(c.tideNext.t)}</span> : null}
            {c.river ? <span className="chip"><Icon name="river" />{c.river}</span> : null}
            {c.precipMm > 0 ? <span className="chip"><Icon name="drop" />Rain</span> : null}
            {share.counts?.alerts ? <span className="chip"><Icon name="bell" />{share.counts.alerts} Smart Bite alert{share.counts.alerts === 1 ? "" : "s"} (Beta)</span> : null}
            <span className="chip"><Icon name="eye" />{watching} watching</span>
          </div>
          {share.pos ? <a className="btn small" href={`https://www.google.com/maps/search/?api=1&query=${share.pos.lat},${share.pos.lon}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" />Exact location, shared by {who}</a> : null}

          <section className="watch-sec" id="w-catches">
            <div className="card-h"><h2>Catches</h2><span className="aside">{catches.length}</span></div>
            {catches.length ? <div className="catch-strip">{catches.map((e) => {
              const sp = speciesById(e.data?.species);
              const ph = e.data?.photo ? photos[e.data.photo] : null;
              return (
                <button key={e.seq} type="button" className="catch-tile" onClick={() => { setOpen(e); }}>
                  {ph ? <img src={ph} alt="" /> : sp && hasArt(sp.id) ? <img src={artUrl(sp.id, "s")} alt="" className="art" /> : <span className="ct-ph"><Icon name="fish" /></span>}
                  <span className="t">{e.data?.name || sp?.name || "Fish"}</span>
                  <span className="s">{[e.data?.lengthCm ? `${e.data.lengthCm} cm` : null, e.data?.weightKg ? `${e.data.weightKg} kg` : null, fmtTime(e.t)].filter(Boolean).join(" · ")}</span>
                </button>
              );
            })}</div> : <p className="tiny">{share.counts?.catches && link?.perms && !link.perms.history ? "Catches from before you opened the link aren't shown on this link." : "Nothing landed yet. When a fish comes in, you'll see it here."}</p>}
          </section>

          <section className="watch-sec" id="w-timeline">
            <div className="card-h"><h2>What's happened</h2>{evs.length > 1 ? <button type="button" className="btn small" onClick={() => { setReplayT(share.startedAt); setPlaying(true); setSheet(false); scrollTo({ top: 0, behavior: "smooth" }); }}><Icon name="play" />Replay</button> : null}</div>
            <ol className="timeline">
              {timelineRows(evs, { upTo: now, limit: 50 }).map((e) => (
                <li key={`${e.seq}-${e.t}`} className={`ev-${e.type}`}>
                  <span className="tl-time num">{fmtTime(e.t)}</span><Icon name={EV_INFO[e.type]?.[0] || "info"} />
                  <span className="grow">{EV_INFO[e.type]?.[1]}{e.type === "catch" ? `: ${e.data?.name || "fish"}${e.data?.lengthCm ? `, ${e.data.lengthCm} cm` : ""}${e.data?.released ? ", released" : ""}` : ""}</span>
                  {e.type !== "start" ? <button type="button" className="xbtn" aria-label={`Replay from ${fmtTime(e.t)}`} onClick={() => { setReplayT(Math.max(share.startedAt, e.t - 3000)); setPlaying(true); setSheet(false); scrollTo({ top: 0, behavior: "smooth" }); }}><Icon name="play" /></button> : null}
                </li>
              ))}
            </ol>
          </section>

          {replayT != null || share.status === "ended" ? (
            <section className="watch-sec replay-box">
              <div className="replay-bar">
                <button type="button" className="xbtn" onClick={() => { if (replayT == null) setReplayT(share.startedAt); setPlaying(!playing); }} aria-label={playing ? "Pause replay" : "Play replay"}><Icon name={playing ? "pause" : "play"} /></button>
                <input type="range" min={share.startedAt} max={end} step={1000} value={replayT ?? end} onChange={(e) => { setPlaying(false); setReplayT(Number(e.target.value)); }} aria-label="Replay time" />
                <span className="num tiny">{fmtTime(replayT ?? end)}</span>
              </div>
              <div className="moments">{notable(evs).slice(-12).map((m) => <button key={`${m.seq}-${m.t}`} type="button" className="chip" onClick={() => { setPlaying(false); setReplayT(Math.max(share.startedAt, m.t - 2500)); setTimeout(() => setPlaying(true), 50); }}>{fmtTime(m.t)} {m.label}</button>)}</div>
              {replayT != null ? <button type="button" className="btn small" onClick={() => { setPlaying(false); setReplayT(null); }}>{share.status === "ended" ? "Close replay" : "Back to live"}</button> : null}
              <p className="tiny">A replay is animated from the logged events. It isn't video.</p>
            </section>
          ) : null}

          <section className="watch-sec">
            <div className="row">
              <button type="button" className={`btn small${sound ? " primary" : ""}`} onClick={() => setSound(!sound)}><Icon name={sound ? "bell" : "mic"} />{sound ? "Sound on" : "Sound off"}</button>
              {"vibrate" in navigator ? <button type="button" className={`btn small${buzz ? " primary" : ""}`} onClick={() => setBuzz(!buzz)}><Icon name="bell" />{buzz ? "Buzz on bites" : "No buzz"}</button> : null}
            </div>
            <div className="field"><span className="lbl">Sound level</span><div className="vol-row"><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (!sound) setSound(true); try { localStorage.setItem("fishdock.watch.volume", String(v)); } catch { /* ignore */ } }} aria-label="Sound level" /><span className="num tiny">{Math.round(volume * 100)}%</span></div><span className="tiny">Waves, wind, rain and gulls to match the weather there, the bite, the reel and the splashes.</span></div>
            <div className="field"><span className="lbl">Animation quality</span><Seg value={quality} onChange={(q) => { setQuality(q); try { localStorage.setItem("fishdock.watch.quality", q); } catch { /* ignore */ } }} options={QUALITY_OPTIONS} /></div>
          </section>
          <p className="tiny watch-foot">A private link from FishDock{link?.label ? ` for ${link.label}` : ""}, until {link ? fmtDateTime(link.expiresAt) : ""}. Please don't pass it on. What you see is animated from {who === "The angler" ? "the angler's" : `${who}'s`} logged casts, bites and catches, with the weather and tide: it isn't a camera.</p>
        </div>
      </div>
      {open ? (
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="watch-card-pop">
            <CatchCard ev={open} photoUrl={open.data?.photo ? photos[open.data.photo] || null : null} onClose={() => setOpen(null)} />
            <button type="button" className="btn primary block" onClick={() => { const e = open; setOpen(null); setSheet(false); setReplayT(null); scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => sceneRef.current?.replayCatch(e), 300); }}><Icon name="play" />Watch it landed again</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
