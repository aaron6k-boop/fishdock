// ---- Live Fishing Mode: timer, bites, catches, marks, conditions snapshots, Smart Bite (Beta), history and replay ----
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { startSession, addEvent, undoLast, pauseSession, resumeSession, endSession, elapsed, recoverSession, setGpsAllowed, positionAt, eventsUntil, trackLengthM, onSessionChange, setSessionScene } from "../lib/session.js";
import { all, onChange, remove } from "../lib/storage.js";
import { biteDay, conditionsAt } from "../lib/bitescore.js";
import { autoTarget } from "../lib/catchhere.js";
import { ukDayStart, ukMonth, fmtTime, fmtDuration, fmtDateTime, fmtClock } from "../lib/time.js";
import { fmtKm } from "../lib/geo.js";
import { createMotionWatch, createAlarmListen, alertAngler } from "../lib/smartbite.js";
import { SPECIES, speciesById } from "../data/species.js";
import { Icon, Beta, Notice, Sheet, Seg, Empty } from "../components/ui.jsx";
import CatchForm from "../components/CatchForm.jsx";
import FishingScene from "../components/FishingScene.jsx";
import SceneEditor from "../components/SceneEditor.jsx";
import ShareSheet from "../components/ShareSheet.jsx";
import { Compose } from "./Community.jsx";
import { EV_INFO, phaseAt, sceneEvents, catchesOf, notable, countsAt } from "../lib/liveEvents.js";
import { onShare, shareInfo, setShareContext, sessionChanged, sessionEnded, stopSharing } from "../lib/liveShare.js";
import { resolveScene, loadChoice, scenePhotoKey } from "../lib/scene.js";
import { accountsEnabled, onUser } from "../lib/account.js";
import { hasArt, artUrl } from "../data/fishart.js";
import ASTRO from "../lib/astro.js";

export default function Live() {
  const { session } = useApp();
  useEffect(() => { if (!session) recoverSession(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return session ? <Running s={session} /> : <StartAndHistory />;
}

function snapshot(app) {
  const { live, tide, place } = app;
  const now = Date.now();
  const c = conditionsAt(live.cond?.hourly?.length ? live.cond : null, now);
  const st = tide?.stateAt(now);
  return { windKph: c?.windKph ?? null, windDir: c?.windDir ?? null, pressureHpa: c?.pressureHpa ?? null, tempC: c?.tempC ?? null, waveM: c?.waveM ?? null, tide: st?.phase || null, river: live.river?.state ? `${live.river.state}, ${live.river.trend}` : null, place: place.name };
}

function StartAndHistory() {
  const app = useApp();
  const { place, settings, preview } = app;
  const month = ukMonth(Date.now());
  const auto = autoTarget(place, month);
  const [species, setSpecies] = useState(settings.target !== "auto" ? settings.target : auto?.id || "");
  const [gps, setGps] = useState(settings.privacy.saveGps);
  const [history, setHistory] = useState([]);
  const [replay, setReplay] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [choice, setChoice] = useState(() => loadChoice(place));
  const [share, setShare] = useState(null);
  useEffect(() => onShare(setShare), []);
  useEffect(() => { setChoice(loadChoice(place)); }, [place.id, place.lat, place.lon]);
  const sceneFor = () => { const c = loadChoice(place); return c ? { kind: c.kind, view: c.view, commons: c.commons || null, photoKey: c.kind === "own" ? scenePhotoKey(place) : null, photoV: c.at || 0 } : null; };
  useEffect(() => { const load = () => all("sessions").then((l) => setHistory(l.filter((s) => s.status === "ended").sort((a, b) => b.startedAt - a.startedAt))); load(); return onChange((st) => st === "sessions" && load()); }, []);
  return (
    <main className="col">
      <div className="page-head"><h1>Live Fishing</h1></div>
      <section className="card">
        <div className="card-h"><h2>Start a session</h2><span className="aside">{place.name}</span></div>
        <div className="field"><label htmlFor="ls-species">Fishing for</label>
          <select id="ls-species" className="input" value={species} onChange={(e) => setSpecies(e.target.value)}>
            <option value="">Anything</option>
            {SPECIES.filter((s) => (place.kind === "sea" ? s.type !== "fresh" : s.type !== "sea")).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <label className="toggle" htmlFor="ls-gps"><span><b>Record where I fish</b><br /><span className="tiny">GPS track and marked positions, kept on this phone. You can turn it off any time.</span></span><input id="ls-gps" type="checkbox" checked={gps} onChange={(e) => setGps(e.target.checked)} /></label>
        {preview && gps ? <Notice kind="warn">This preview can't use GPS. The timer, bites, catches and marks still work; positions record in the installed app.</Notice> : null}
        <button type="button" className="li view-pick" onClick={() => setViewOpen(true)}>
          <span className="fish-ico"><Icon name="camera" /></span>
          <span className="grow"><span className="t">Your view: {choice?.kind === "own" ? "your photo" : choice?.kind === "commons" ? "a photo near here" : "representative scene"}</span><span className="s">{choice?.kind === "own" ? "Lined up for this place" : "Take a photo of where your rod points for the best view"}</span></span>
          <Icon name="chevron" className="go" />
        </button>
        <button type="button" className="btn primary block big-btn" onClick={() => startSession({ place, species: species || null, gpsAllowed: gps, conditions: snapshot(app), scene: sceneFor() })}><Icon name="play" />Start fishing</button>
        <p className="tiny">Keep FishDock open on screen for the best record. Phones pause web apps in the background, so FishDock notes any gaps rather than guessing.</p>
      </section>
      {share && !share.ended ? (
        <section className="card">
          <div className="card-h"><h2>Still sharing</h2><span className="aside">{share.watching || 0} watching</span></div>
          <p className="small muted">Your last session is still on its private links, so people can watch it back until the links end.</p>
          <button type="button" className="btn danger" onClick={async () => { await stopSharing(); }}><Icon name="eyeoff" />Stop sharing now</button>
        </section>
      ) : null}
      {viewOpen ? <SceneEditor place={place} quality={settings.liveQuality || "auto"} onQuality={(q) => app.update({ liveQuality: q })} onClose={() => setViewOpen(false)} onSaved={() => setChoice(loadChoice(place))} /> : null}
      <section className="card">
        <div className="card-h"><h2>Past sessions</h2><span className="aside">{history.length}</span></div>
        {history.length ? <div className="list">{history.map((s) => (
          <button key={s.id} type="button" className="li" onClick={() => setReplay(s)}>
            <span className="fish-ico"><Icon name="route" /></span>
            <span className="grow"><span className="t">{s.place?.name} · {fmtDateTime(s.startedAt)}</span><span className="s">{fmtDuration(elapsed(s))} · {s.counts.bites} bites · {s.counts.catches} caught{s.counts.missed ? ` · ${s.counts.missed} missed` : ""}</span></span>
            <Icon name="chevron" className="go" />
          </button>
        ))}</div> : <Empty icon="route" title="No sessions yet">Start one when you're set up at the water. You'll get a timeline you can replay and compare.</Empty>}
      </section>
      {history.length >= 2 ? <Compare history={history} /> : null}
      {replay ? <Replay s={replay} onClose={() => setReplay(null)} /> : null}
    </main>
  );
}

function lightAt(place, t) {
  try {
    const sun = ASTRO.sunPos(t, place.lat, place.lon), moon = ASTRO.moonPos(t, place.lat, place.lon);
    return { sunAlt: Math.round(sun.alt), sunAz: Math.round(sun.az), moonAlt: Math.round(moon.alt), moonAz: Math.round(moon.az), moonIllum: Math.round(ASTRO.moonIllum(t).fraction * 100) / 100 };
  } catch { return null; }
}
function condAt(live, tide, t) {
  const c = conditionsAt(live.cond?.hourly?.length ? live.cond : null, t);
  const st = tide?.stateAt(t);
  return {
    windKph: c?.windKph ?? null, gustKph: c?.gustKph ?? null, windDir: c?.windDir ?? null, waveM: c?.waveM ?? null, tempC: c?.tempC ?? null,
    precipMm: c?.precipMm ?? null, cloudPct: c?.cloudPct ?? null, isDay: c?.isDay ?? null,
    tide: st?.phase || null, tideNext: st?.next ? { type: st.next.type === "HW" ? "High" : "Low", t: st.next.t } : null, tideApprox: !!tide && tide.source !== "admiralty",
    river: live.river?.state ? `${live.river.state}, ${live.river.trend}` : null,
  };
}
const FLOAT_METHODS = /float|waggler|stick|pole/i;

function Running({ s }) {
  const app = useApp();
  const { place, tide, live, say, settings, update } = app;
  const [, tick] = useState(0);
  const [catchOpen, setCatchOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [smart, setSmart] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [commOpen, setCommOpen] = useState(false);
  const [scene, setScene] = useState(null);
  const [share, setShare] = useState(shareInfo());
  const [myCatches, setMyCatches] = useState([]);
  const sceneRef = useRef(null);
  useEffect(() => { const iv = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(iv); }, []);
  useEffect(() => { // hourly conditions snapshot, as DetectDock snapshots weather in Field Mode
    const last = [...s.events].reverse().find((e) => e.type === "conditions");
    if (!last || Date.now() - last.t > 3600e3) addEvent("conditions", snapshot(app));
  });
  const sp = speciesById(s.species);
  const day = useMemo(() => sp ? biteDay({ place, species: sp, dayStart: ukDayStart(Date.now()), tide, cond: live.cond?.hourly?.length ? live.cond : null, river: live.river?.source ? live.river : null }) : null, [place, sp, tide, live.cond, live.river]);
  const st = tide?.stateAt(Date.now());
  const gpsLabel = { ok: `GPS ±${s.gps.acc} m`, weak: `Weak GPS ±${s.gps.acc} m`, starting: "Finding GPS…", denied: "Location blocked", unavailable: "No GPS here", off: "Not recording position" }[s.gps.state] || "";

  // the backdrop: what this session was started with, or the place's saved view
  useEffect(() => { let gone = false; resolveScene(s.place || place, s.scene || loadChoice(s.place || place)).then((r) => { if (!gone) setScene(r); }); return () => { gone = true; }; }, [s.scene?.kind, s.scene?.photoV, JSON.stringify(s.scene?.view), s.scene?.commons?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  // sharing: what the share needs that the session doesn't hold, and every change sent on
  setShareContext(() => ({ name: settings.liveName || null, target: sp ? { id: sp.id, name: sp.name } : null, cond: condAt(live, tide, Date.now()), light: lightAt(place, Date.now()), area: place.region || null }));
  useEffect(() => onShare(setShare), []);
  useEffect(() => onSessionChange((c) => { if (c) sessionChanged(c); }), []);
  useEffect(() => { sessionChanged(s); }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // this session's catches (for their photos)
  useEffect(() => { const load = () => all("catches").then((l) => setMyCatches(l.filter((c) => c.sessionId === s.id))); load(); return onChange((x) => x === "catches" && load()); }, [s.id]);
  const photoOf = (ev) => myCatches.find((c) => c.id === ev?.data?.catchId)?.photo || null;

  const evs = sceneEvents(s);
  const ph = phaseAt(evs, Date.now(), { status: s.status });
  const hooked = !!ph.hooked;
  const press = (type, label) => { addEvent(type); try { navigator.vibrate?.(30); } catch { /* ignore */ } say(label); };
  const sharing = share && share.sessionId === s.id && !share.ended ? share : null;
  const catches = catchesOf(evs).reverse();
  const counts = countsAt(s.events);
  const floatRig = place.kind !== "sea" ? !/feeder|ledger|carp|lure|fly/i.test(s.method || "") : FLOAT_METHODS.test(s.method || "");

  return (
    <main className="col live-col">
      <div className="live-stage">
        <FishingScene ref={sceneRef} scene={scene} events={evs} status={s.status} now={Date.now}
          env={{ cond: condAt(live, tide, Date.now()), light: lightAt(place, Date.now()), kind: place.kind }}
          quality={settings.liveQuality || "auto"} sound={!!settings.liveSound} floatRig={floatRig} catchPhoto={photoOf}>
          <div className="fs-top">
            <span className={`live-badge s-${s.status === "paused" ? "paused" : "live"}`}><span className="rec-dot" />{s.status === "paused" ? "Paused" : "Fishing"}</span>
            <span className="fs-chip num" aria-label={`Fishing for ${fmtDuration(elapsed(s))}`}>{fmtClock(elapsed(s))}</span>
            {st ? <span className="fs-chip"><Icon name="wave" />{st.phase}</span> : null}
            {day?.nowSlot ? <span className="fs-chip">BiteScore {day.nowSlot.score}</span> : null}
            <span className="grow" />
            {sharing ? <button type="button" className="fs-chip share-on" onClick={() => setShareOpen(true)}><Icon name="eye" />{sharing.watching || 0} watching</button> : null}
            <button type="button" className="fs-chip" onClick={() => setViewOpen(true)} aria-label="Change your view"><Icon name="camera" />View</button>
          </div>
          <div className="fs-who"><b>{s.place.name}</b>{sp ? <span> · {sp.name}</span> : null}</div>
        </FishingScene>
      </div>

      <div className="stat-line" aria-label="This session">
        <div><b className="num">{counts.casts}</b><span>Casts</span></div>
        <div><b className="num">{counts.bites}</b><span>Bites</span></div>
        <div><b className="num">{counts.missed}</b><span>Missed</span></div>
        <div className="hl"><b className="num">{counts.catches}</b><span>Caught</span></div>
      </div>
      {counts.alerts ? <p className="tiny center-text">Plus {counts.alerts} Smart Bite alert{counts.alerts === 1 ? "" : "s"} <Beta />, not counted as bites.</p> : null}

      {hooked ? (
        <div className="ctl-grid hooked">
          <button type="button" className="ctl catch" onClick={() => setCatchOpen(true)}><Icon name="fish" /><span>Landed</span></button>
          <button type="button" className="ctl" onClick={() => press("lost", "Fish lost")}><Icon name="close" /><span>Lost it</span></button>
          <button type="button" className="ctl" onClick={() => press("snag", "Snag or weed")}><Icon name="rig" /><span>Snag or weed</span></button>
        </div>
      ) : (
        <div className="ctl-grid">
          <button type="button" className="ctl cast" onClick={() => press("cast", "Cast")}><Icon name="target" /><span>Cast</span></button>
          <button type="button" className="ctl bite" onClick={() => press("bite", "Bite logged")}><Icon name="bell" /><span>Bite</span></button>
          <button type="button" className="ctl hook" onClick={() => press("hooked", "Fish on!")}><Icon name="hook" /><span>Fish on</span></button>
          <button type="button" className="ctl catch" onClick={() => setCatchOpen(true)}><Icon name="fish" /><span>Catch</span></button>
        </div>
      )}
      <div className="row ctl-more">
        <button type="button" className="btn small" onClick={() => press("missed", "Missed bite logged")}><Icon name="close" />Missed</button>
        <button type="button" className="btn small" onClick={() => setMarkOpen(true)}><Icon name="flag" />Mark spot</button>
        <button type="button" className="btn small" onClick={() => setSmart(true)}><Icon name="bell" />Smart Bite <Beta /></button>
        <button type="button" className="btn ghost small" onClick={() => undoLast([...s.events].reverse().find((e) => ["bite", "missed", "cast", "mark", "note", "hooked", "lost", "snag"].includes(e.type))?.type)}>Undo</button>
      </div>
      {s.backgroundMs > 60000 ? <Notice kind="warn">FishDock was in the background for {fmtDuration(s.backgroundMs)}. Phones stop web apps recording there, so your track has gaps{sharing ? " and viewers saw your phone go quiet" : ""}.</Notice> : null}

      <section className="card">
        <div className="card-h"><h2>Catches this session</h2><span className="aside">{catches.length}</span></div>
        {catches.length ? <div className="catch-strip">{catches.map((e) => {
          const csp = speciesById(e.data?.species);
          const photo = photoOf(e);
          return (
            <button key={e.id} type="button" className="catch-tile" onClick={() => { scrollTo({ top: 0, behavior: "smooth" }); sceneRef.current?.replayCatch(e); }}>
              {photo ? <img src={photo} alt="" /> : csp && hasArt(csp.id) ? <img src={artUrl(csp.id, "s")} alt="" className="art" /> : <span className="ct-ph"><Icon name="fish" /></span>}
              <span className="t">{e.data?.name || "Fish"}</span>
              <span className="s">{[e.data?.lengthCm ? `${e.data.lengthCm} cm` : null, fmtTime(e.t)].filter(Boolean).join(" · ")}</span>
            </button>
          );
        })}</div> : <p className="tiny">Tap Catch when you land one. It's saved to your diary and plays in the view.</p>}
      </section>

      <section className="card">
        <div className="card-h"><h2>Share this session</h2><span className="aside">{sharing ? `${(sharing.links || []).filter((l) => l.active).length} link${(sharing.links || []).filter((l) => l.active).length === 1 ? "" : "s"}` : "Private"}</span></div>
        <p className="small muted">{sharing ? (sharing.error ? sharing.error : `${sharing.watching || 0} watching now. They see the view above, your catches and the weather, never your track.`) : "Let family and friends watch on a private link: no camera, no account needed. You choose what they see."}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setShareOpen(true)}><Icon name="share" />{sharing ? "Manage sharing" : "Share fishing session"}</button>
          <button type="button" className="btn" onClick={() => setCommOpen(true)}><Icon name="users" />Share to Community</button>
        </div>
      </section>

      <details className="card fold">
        <summary><span className="grow"><b>Session map</b><span className="tiny"> · {s.track.length ? `${Math.round(trackLengthM(s.track))} m walked` : gpsLabel}</span></span><Icon name="down" /></summary>
        <div className="live-meta"><span className={`chip ${s.gps.state === "ok" ? "tide" : s.gps.state === "off" ? "" : "warn"}`}><Icon name="locate" />{gpsLabel}</span></div>
        <SessionPlot track={s.track} events={s.events} />
      </details>

      <section className="card">
        <div className="card-h"><h2>Activity</h2></div>
        <Timeline events={s.events} />
      </section>

      <div className="row">
        {s.status === "running" ? <button type="button" className="btn" onClick={pauseSession}><Icon name="pause" />Pause</button> : <button type="button" className="btn primary" onClick={resumeSession}><Icon name="play" />Resume</button>}
        <button type="button" className="btn" onClick={() => setGpsAllowed(!s.gpsAllowed)}><Icon name={s.gpsAllowed ? "eyeoff" : "locate"} />{s.gpsAllowed ? "Stop recording position" : "Record position"}</button>
        <button type="button" className="btn danger" onClick={() => setEndOpen(true)}><Icon name="stop" />End</button>
      </div>

      {catchOpen ? <CatchForm session={s} gps={s.lastFix && s.gpsAllowed ? { lat: s.lastFix.lat, lon: s.lastFix.lon, acc: s.lastFix.acc } : null} onClose={() => setCatchOpen(false)} onSaved={(rec) => addEvent("catch", { catchId: rec.id, species: rec.speciesName, speciesId: rec.species || null, lengthCm: rec.lengthCm, weightKg: rec.weightKg ?? null, released: rec.released, bait: rec.bait || null, photo: !!rec.photo })} /> : null}
      {markOpen ? <MarkSheet onClose={() => setMarkOpen(false)} /> : null}
      {smart ? <SmartBite onClose={() => setSmart(false)} /> : null}
      {viewOpen ? <SceneEditor place={place} quality={settings.liveQuality || "auto"} onQuality={(q) => update({ liveQuality: q })} onClose={() => setViewOpen(false)} onSaved={(c) => setSessionScene(c)} /> : null}
      {shareOpen ? <ShareSheet session={s} onClose={() => setShareOpen(false)} /> : null}
      {commOpen ? <CommunityShare s={s} catches={catches} photoOf={photoOf} onClose={() => setCommOpen(false)} /> : null}
      {endOpen ? (
        <Sheet title="End this session?" onClose={() => setEndOpen(false)}>
          <p className="small">{fmtDuration(elapsed(s))} · {s.counts.bites} bites · {s.counts.catches} caught · {s.counts.missed} missed.</p>
          <p className="small muted">It's saved on this phone with its timeline{s.track.length ? " and track" : ""}. {sharing ? "People with a link see that you've finished, and can replay it until their link ends. Stop sharing any time from the session's replay." : "Nothing is shared."}</p>
          <button type="button" className="btn primary block" onClick={async () => { const done = await endSession({ endSnapshot: snapshot(app) }); sessionEnded(done); say("Session saved"); }}>End and save</button>
          <button type="button" className="btn ghost block" onClick={() => setEndOpen(false)}>Keep fishing</button>
        </Sheet>
      ) : null}
      <div className="tiny live-sound">
        <label className="toggle-inline" htmlFor="lv-sound"><input id="lv-sound" type="checkbox" checked={!!settings.liveSound} onChange={(e) => update({ liveSound: e.target.checked })} /> Sound in the view</label>
        <span>The view is animated from what you log. It isn't a camera.</span>
      </div>
    </main>
  );
}

/** Share to Community: a catch or a summary, through the normal post sheet. Never automatic, never the live session. */
function CommunityShare({ s, catches, photoOf, onClose }) {
  const { place } = useApp();
  const [user, setUser] = useState(null);
  const [pick, setPick] = useState(null);
  useEffect(() => onUser(setUser), []);
  if (pick) return <Compose place={place} initial={pick} onClose={onClose} onPosted={onClose} />;
  const summary = `${fmtDuration(elapsed(s))} at ${place.region || "the coast"}: ${s.counts.casts} casts, ${s.counts.bites} bites, ${s.counts.catches} caught${catches.length ? ` (${[...new Set(catches.map((e) => e.data?.name).filter(Boolean))].join(", ")})` : ""}.`;
  return (
    <Sheet title="Share to Community" aside="Public. Only what you choose, after you check it." onClose={onClose}>
      {!accountsEnabled() ? <Notice kind="warn">Posting to Community needs a FishDock account, and accounts aren't switched on yet. Private links to family and friends work without one.</Notice> : !user ? <Notice>Sign in on the Community tab first, then come back here.</Notice> : null}
      <p className="small muted">Your private live link stays private: nothing from it goes to Community. A post shows an area at most, never your mark.</p>
      <div className="list">
        {catches.map((e) => (
          <button key={e.id} type="button" className="li" disabled={!accountsEnabled() || !user} onClick={() => setPick({ kind: "catch", species: e.data?.species || "", text: `${e.data?.name || "Fish"}${e.data?.lengthCm ? `, ${e.data.lengthCm} cm` : ""}${e.data?.bait ? ` on ${e.data.bait}` : ""}${e.data?.released ? ". Released" : ""}.`, photo: photoOf(e) })}>
            <span className="fish-ico"><Icon name="fish" /></span><span className="grow"><span className="t">A catch: {e.data?.name || "fish"}</span><span className="s">{fmtTime(e.t)}{photoOf(e) ? " · with photo" : ""}</span></span><Icon name="chevron" className="go" />
          </button>
        ))}
        <button type="button" className="li" disabled={!accountsEnabled() || !user} onClick={() => setPick({ kind: "report", text: summary })}>
          <span className="fish-ico"><Icon name="route" /></span><span className="grow"><span className="t">A session summary</span><span className="s">{summary}</span></span><Icon name="chevron" className="go" />
        </button>
      </div>
      <p className="tiny">Replays of a moment or a whole session can't be posted to Community yet. You can watch them back from Past sessions.</p>
    </Sheet>
  );
}

function MarkSheet({ onClose }) {
  const { say } = useApp();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("productive");
  return (
    <Sheet title="Mark this spot" aside="Private. Only you can see your marks." onClose={onClose}>
      <Seg value={kind} onChange={setKind} options={[{ value: "productive", label: "Productive" }, { value: "snag", label: "Snag" }, { value: "feature", label: "Feature" }, { value: "access", label: "Access point" }]} />
      <label className="field" htmlFor="mk-l"><span className="lbl">Note (optional)</span><input id="mk-l" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. gully at 60 m, bites on the flood" /></label>
      <button type="button" className="btn primary block" onClick={() => { addEvent("mark", { kind, label }); say("Spot marked"); onClose(); }}>Save mark</button>
    </Sheet>
  );
}

const EV = { ...EV_INFO, catch: ["fish", "Catch"] };
function Timeline({ events, upTo }) {
  const list = (events || []).filter((e) => e.type !== "cast" && (upTo == null || e.t <= upTo)).slice(-40).reverse();
  if (!list.length) return <p className="tiny">Bites, catches and marks appear here as you log them.</p>;
  return (
    <ol className="timeline">
      {list.map((e) => (
        <li key={e.id || e.t} className={`ev-${e.type}`}>
          <span className="tl-time num">{fmtTime(e.t)}</span>
          <Icon name={EV[e.type]?.[0] || "info"} />
          <span className="grow">{EV[e.type]?.[1] || e.type}{e.type === "catch" && e.data?.species ? `: ${e.data.species}${e.data.lengthCm ? `, ${e.data.lengthCm} cm` : ""}${e.data.released ? ", released" : ""}` : ""}{e.type === "mark" ? `: ${e.data?.kind}${e.data?.label ? `, ${e.data.label}` : ""}` : ""}{e.type === "conditions" ? `: ${[e.data?.tide, e.data?.windKph != null ? `${Math.round(e.data.windKph * 0.621)} mph wind` : null, e.data?.river].filter(Boolean).join(", ") || "snapshot"}` : ""}{e.type === "smartbite" ? ` (${e.data?.kind})` : ""}</span>
        </li>
      ))}
    </ol>
  );
}

/** Track and events drawn on their own, with no base map: nothing about the place is revealed by the picture. */
function SessionPlot({ track, events, at }) {
  const pts = track || [];
  const evs = (events || []).filter((e) => e.pos && (at == null || e.t <= at));
  const all = [...pts, ...evs.map((e) => e.pos)];
  if (all.length < 1) return <div className="plot-empty tiny">No positions recorded{pts.length ? "" : " yet"}. Marks and catches still show on the timeline.</div>;
  const lat0 = all.reduce((a, p) => a + p.lat, 0) / all.length;
  const k = Math.cos(lat0 * Math.PI / 180);
  const xs = all.map((p) => p.lon * k), ys = all.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.0006);
  const W = 320, H = 200, P = 18;
  const sx = (p) => P + ((p.lon * k - minX) / span) * (W - 2 * P);
  const sy = (p) => H - P - ((p.lat - minY) / span) * (H - 2 * P);
  const shown = at == null ? pts : pts.filter((p) => p.t <= at);
  let d = "";
  shown.forEach((p, i) => { d += `${i === 0 || p.g ? "M" : "L"}${sx(p).toFixed(1)},${sy(p).toFixed(1)} `; });
  const here = at != null ? positionAt(pts, at) : pts[pts.length - 1];
  const metres = span * 111320;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="plot" role="img" aria-label="Your track and marks">
      <rect width={W} height={H} rx="14" className="plot-bg" />
      {d ? <path d={d} className="plot-track" /> : null}
      {evs.map((e, i) => <circle key={i} cx={sx(e.pos)} cy={sy(e.pos)} r={e.type === "catch" ? 6 : 4.5} className={`plot-ev ev-${e.type}`}><title>{EV[e.type]?.[1]} {fmtTime(e.t)}</title></circle>)}
      {here ? <circle cx={sx(here)} cy={sy(here)} r="5.5" className="plot-me" /> : null}
      <text x={P} y={H - 6} className="plot-scale">{`${fmtKm(metres / 1000)} across`}</text>
    </svg>
  );
}

function Replay({ s, onClose }) {
  const start = s.startedAt, end = s.endedAt || Date.now();
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [scene, setScene] = useState(null);
  const [photos, setPhotos] = useState([]);
  const raf = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => { resolveScene(s.place, s.scene || loadChoice(s.place)).then(setScene); }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { all("catches").then((l) => setPhotos(l.filter((c) => c.sessionId === s.id))); }, [s.id]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now) => {
      const dt = now - last; last = now;
      setT((x) => { const nx = x + dt * speed; if (nx >= end) { setPlaying(false); return end; } return nx; });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, start, end, speed]);
  const evs = sceneEvents(s);
  const until = eventsUntil(s.events, t);
  const cond = [...(s.events || [])].reverse().find((e) => e.type === "conditions" && e.t <= Math.max(t, start + 1))?.data || s.events.find((e) => e.type === "conditions")?.data || null;
  const jump = (to) => { setPlaying(false); setT(Math.max(start, to)); setSpeed(1); setTimeout(() => setPlaying(true), 30); };
  const photoOf = (ev) => photos.find((c) => c.id === ev?.data?.catchId)?.photo || null;
  return (
    <Sheet title={`${s.place?.name}`} aside={`${fmtDateTime(start)} · ${fmtDuration(elapsed(s))}`} onClose={onClose} wide>
      <div className="replay-stage">
        <FishingScene scene={scene} events={evs} status="running" now={() => tRef.current} env={{ cond, light: lightAt(s.place, t), kind: s.place?.kind }} quality="auto" catchPhoto={photoOf}>
          <div className="fs-top"><span className="live-badge s-replay">Replay</span><span className="fs-chip num">{fmtTime(t)}</span></div>
        </FishingScene>
      </div>
      <div className="replay-bar">
        <button type="button" className="xbtn" onClick={() => { if (t >= end) setT(start); setSpeed(30); setPlaying(!playing); }} aria-label={playing ? "Pause replay" : "Play replay"}><Icon name={playing ? "pause" : "play"} /></button>
        <input type="range" min={start} max={end} step={1000} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Replay time" id="replay-t" />
        <span className="num tiny">{fmtTime(t)}</span>
      </div>
      <div className="moments">{notable(evs).map((m) => <button key={m.id || m.t} type="button" className="chip" onClick={() => jump(m.t - 2500)}>{fmtTime(m.t)} {m.label}{m.type === "catch" && m.data?.name ? `: ${m.data.name}` : ""}</button>)}</div>
      <p className="tiny">Tap a moment to watch it at real speed. The replay is animated from what you logged; it isn't video.</p>
      <div className="kv">
        <div><span className="k">Bites</span><span className="v">{until.filter((e) => e.type === "bite" || e.type === "smartbite").length}</span></div>
        <div><span className="k">Missed</span><span className="v">{until.filter((e) => e.type === "missed").length}</span></div>
        <div><span className="k">Caught</span><span className="v">{until.filter((e) => e.type === "catch").length}</span></div>
        <div><span className="k">Walked</span><span className="v">{Math.round(trackLengthM((s.track || []).filter((p) => p.t <= t)))} m</span></div>
      </div>
      <details className="fold-plain"><summary>Session map</summary><SessionPlot track={s.track} events={s.events} at={t} /></details>
      <Timeline events={s.events} upTo={t} />
      <button type="button" className="btn ghost danger-text" onClick={async () => { await remove("sessions", s.id); onClose(); }}><Icon name="trash" />Delete this session</button>
    </Sheet>
  );
}

/** Which conditions your best sessions had in common (needs a few sessions to mean anything). */
function Compare({ history }) {
  const rows = history.slice(0, 20).map((s) => {
    const c = s.events.find((e) => e.type === "conditions")?.data || {};
    const hrs = Math.max(0.25, elapsed(s) / 3600e3);
    return { s, rate: (s.counts.bites || 0) / hrs, tide: c.tide || "–", wind: c.windKph != null ? Math.round(c.windKph * 0.621) : null };
  }).sort((a, b) => b.rate - a.rate);
  return (
    <section className="card">
      <div className="card-h"><h2>Compare sessions</h2><span className="aside">bites per hour</span></div>
      <div className="tablewrap"><table className="t">
        <thead><tr><th>Session</th><th>Bites/h</th><th>Tide at start</th><th>Wind</th></tr></thead>
        <tbody>{rows.slice(0, 8).map(({ s, rate, tide, wind }) => <tr key={s.id}><td>{s.place?.name}<br /><span className="tiny">{fmtDateTime(s.startedAt)}</span></td><td className="n">{rate.toFixed(1)}</td><td>{tide}</td><td className="n">{wind != null ? `${wind} mph` : "–"}</td></tr>)}</tbody>
      </table></div>
      <p className="tiny">A handful of sessions is too few to prove anything. Patterns get more useful as your log grows.</p>
    </section>
  );
}

// ---- Smart Bite (Beta) ----
function SmartBite({ onClose }) {
  const { preview, say } = useApp();
  const [mode, setMode] = useState("rod");
  const [state, setState] = useState("idle"); // idle | starting | on | error
  const [msg, setMsg] = useState("");
  const [level, setLevel] = useState(0);
  const [sound, setSound] = useState(true);
  const [sens, setSens] = useState(0.5);
  const [alerts, setAlerts] = useState([]);
  const videoRef = useRef(null), streamRef = useRef(null), engineRef = useRef(null);
  const roi = useRef({ x: 0.35, y: 0.08, w: 0.3, h: 0.4 });
  const [, redraw] = useState(0);

  function stop() { engineRef.current?.stop(); engineRef.current = null; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setState("idle"); setLevel(0); }
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function trigger(info) {
    addEvent("smartbite", { kind: info.kind, hz: info.hz || null });
    setAlerts((a) => [{ t: Date.now(), ...info }, ...a].slice(0, 6));
    alertAngler({ sound });
    say(info.kind === "run" ? "Possible run! Check your rod" : "Movement at the rod tip: check it");
  }

  async function start() {
    setMsg(""); setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) { setState("error"); setMsg(preview ? "The preview can't use the camera or microphone. Smart Bite works in the installed app and in the browser on the deployed site." : "This browser can't use the camera or microphone."); return; }
    try {
      if (mode === "rod") {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } }, audio: false });
        streamRef.current = s; videoRef.current.srcObject = s; await videoRef.current.play();
        engineRef.current = createMotionWatch({ video: videoRef.current, roi, sensitivity: sens, onTrigger: trigger, onLevel: (l) => setLevel(l) });
      } else {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        streamRef.current = s;
        engineRef.current = createAlarmListen({ stream: s, onTrigger: trigger, onLevel: (l) => setLevel(l) });
      }
      setState("on");
    } catch (e) {
      setState("error");
      setMsg(e?.name === "NotAllowedError" ? `${mode === "rod" ? "Camera" : "Microphone"} permission was refused. Allow it in your browser settings to try Smart Bite.` : preview ? "The preview can't use the camera or microphone. Smart Bite works in the full app." : "Couldn't start. Close other apps using the camera or microphone and try again.");
    }
  }

  function dragRoi(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height;
    roi.current = { x: Math.max(0, Math.min(0.8, x - 0.12)), y: Math.max(0, Math.min(0.7, y - 0.15)), w: 0.24, h: 0.3 };
    redraw((n) => n + 1);
  }

  return (
    <Sheet title="Smart Bite" aside={<>Experimental <Beta /></>} onClose={() => { stop(); onClose(); }}>
      <Notice kind="warn">Smart Bite can't reliably tell a bite from wind, waves, rain, a bird or a passing boat. Treat an alert as a prompt to look at your rod, and keep watching it yourself.</Notice>
      <Seg value={mode} onChange={(m) => { stop(); setMode(m); }} options={[{ value: "rod", label: "Watch rod tip (camera)" }, { value: "alarm", label: "Listen for bite alarm" }]} />
      {mode === "rod" ? (
        <>
          <p className="small muted">Prop the phone steady, point the camera at your rod tip, then tap the picture to put the box round the tip. Alerts come from movement inside the box only; if the whole picture moves, FishDock ignores it.</p>
          <div className="viewfinder rod" onClick={state === "on" ? dragRoi : undefined}>
            <video ref={videoRef} playsInline muted />
            {state === "on" ? <span className="roi" style={{ left: `${roi.current.x * 100}%`, top: `${roi.current.y * 100}%`, width: `${roi.current.w * 100}%`, height: `${roi.current.h * 100}%` }} /> : <div className="vf-empty"><Icon name="camera" /><span>Camera off</span></div>}
          </div>
          <div className="cond-row"><span>Sensitivity</span><input type="range" id="sb-sens" min="0" max="1" step="0.05" value={sens} onChange={(e) => setSens(Number(e.target.value))} disabled={state === "on"} /></div>
        </>
      ) : (
        <p className="small muted">For electronic bite alarms. FishDock listens for their short electronic bleeps and alerts you on a run (three or more quick bleeps). Nothing is recorded or kept. It won't hear a bite without an alarm.</p>
      )}
      <div className="level"><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
      <label className="toggle" htmlFor="sb-sound"><span>Alert sound as well as vibration</span><input id="sb-sound" type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /></label>
      {msg ? <Notice kind="warn">{msg}</Notice> : null}
      {state === "on" ? <button type="button" className="btn block" onClick={stop}><Icon name="stop" />Stop Smart Bite</button> : <button type="button" className="btn primary block" onClick={start} disabled={state === "starting"}><Icon name="play" />Start</button>}
      {alerts.length ? <ol className="timeline">{alerts.map((a, i) => <li key={i}><span className="tl-time num">{fmtTime(a.t)}</span><Icon name="bell" /><span className="grow">{a.kind === "run" ? "Possible run" : a.kind === "bleep" ? "Single bleep" : "Rod-tip movement"}</span></li>)}</ol> : null}
      <p className="tiny">Each alert is added to your session timeline as "Smart Bite alert", separate from bites you log yourself, so you can see how often it was right.</p>
    </Sheet>
  );
}
