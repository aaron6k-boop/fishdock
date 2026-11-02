// ---- Party: a Fish Together party (#party/<code>/<secret>, or #party/<code> to come back to one) ----
// Up to four anglers at their own spots in one 3D place, each with their own rod, casts, bites, fights and landings,
// synchronised through the party's live connection; others can watch. Virtual parties fish the simulation and every
// catch is marked simulated; real trips are logged by the people actually fishing, and others watch reconstructions.
// The group button opens people, voice and text chat, catches and challenges, the invitation and the host's controls.
import { useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "../lib/haptics.js";
import Stage3D from "../components/Stage3D.jsx";
import FishTray from "../components/FishTray.jsx";
import { Icon } from "../components/ui.jsx";
import LookPicker, { myLook, lookOnly } from "../components/LookPicker.jsx";
import { saveLook } from "../lib/world3d/people.js";
import { useParty, previewParty, joinParty, remember, membershipOf, forget, partyLink, momentText, uploadPartyPhoto, partyPhotoUrl } from "../lib/party.js";
import { useVirtualFishing } from "../lib/useVirtualFishing.js";
import { phaseAt } from "../lib/liveEvents.js";
import { isLanded } from "../lib/landed.js";
import { standings, CHALLENGES } from "../lib/partyStats.js";
import { createVoice, proximityOf } from "../lib/voice.js";
import { qrSvg } from "../lib/qr.js";
import { SPECIES, speciesById } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";
import { fmtTime } from "../lib/time.js";
import { shrinkImage } from "../lib/storage.js";
import { spotById } from "../lib/world3d/spots.js";
import ASTRO from "../lib/astro.js";
import { timeFor, LIGHTS } from "../lib/timeOfDay.js";

const REACT = [["nice", "Nice one"], ["wow", "Wow"], ["clap", "Well done"]];
const BLOCK_KEY = "fishdock.party.blocked";
const blockedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(BLOCK_KEY) || "[]")); } catch { return new Set(); } };

// ---- joining (name, angler or spectator, clothes) ----
function JoinScreen({ code, secret, onJoined }) {
  const viaCode = secret === "code";
  const [pv, setPv] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [name, setName] = useState(() => { try { return localStorage.getItem("fishdock.party.name") || ""; } catch { return ""; } });
  const [role, setRole] = useState("angler"), [look, setLookNow] = useState(myLook);
  const setLook = (v) => { setLookNow(v); saveLook(v); };
  useEffect(() => { previewParty(code, viaCode ? { viaCode: true } : { secret }).then((r) => { setPv(r.party); if (!r.party.anglersOn || r.party.spotsFree <= 0) setRole("spectator"); }).catch((e) => setErr(e.message)); }, [code, secret]); // eslint-disable-line react-hooks/exhaustive-deps
  async function join() {
    setBusy(true); setErr("");
    try {
      try { localStorage.setItem("fishdock.party.name", name.trim()); } catch { /* ignore */ }
      const r = await joinParty(code, { secret: viaCode ? null : secret, viaCode, name: name.trim() || (role === "angler" ? "Angler" : "Watching"), role, outfit: look.outfit, look: lookOnly(look) });
      remember(code, { key: r.member.key, member: r.member.id, mode: pv.mode, venue: pv.venue, expiresAt: pv.expiresAt });
      history.replaceState(null, "", `#party/${code}`);
      onJoined();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (err && !pv) return <div className="watch-shell"><div className="watch-msg"><Icon name="info" /><h1>Can't open this party</h1><p>{err}</p><a className="btn" href="#together">Fish Together</a></div></div>;
  if (!pv) return <div className="watch-shell"><div className="watch-msg"><span className="loading-dots" aria-label="Loading" /></div></div>;
  return (
    <div className="watch-shell tg-shell"><main className="tg">
      <header className="tg-head"><a href="#together" className="xbtn" aria-label="Back"><Icon name="back" /></a><div>
        <h1>{pv.host}'s party <span className="beta-pill">Beta</span></h1>
        <p className="small muted">{pv.mode === "real" ? "A real fishing trip: what you'll see is animated from what the anglers log, not a camera." : "Virtual fishing: a simulation. Catches here are simulated and kept apart from real records."} {pv.place?.label ? `At: ${pv.place.label}.` : ""} {pv.anglers} of {pv.maxAnglers} anglers so far.</p>
      </div></header>
      <section className="tg-form">
        <label className="field"><span className="lbl">Your name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Shown to the others" /></label>
        <div className="field"><span className="lbl">Join as</span><div className="tg-modes">
          <button type="button" disabled={!pv.anglersOn || pv.spotsFree <= 0} className={`tg-mode${role === "angler" ? " on" : ""}`} onClick={() => setRole("angler")}><b>{pv.mode === "real" ? "An angler" : "An angler"}</b><span>{pv.spotsFree > 0 ? `Your own spot and rod. ${pv.spotsFree} free.` : "All four spots are taken."}</span></button>
          <button type="button" className={`tg-mode${role === "spectator" ? " on" : ""}`} onClick={() => setRole("spectator")}><b>A spectator</b><span>Watch, chat and cheer; you don't fish.</span></button>
        </div></div>
        {role === "angler" ? <div className="field"><span className="lbl">Your angler</span><LookPicker value={look} onChange={setLook} /></div> : null}
        <button type="button" className="btn primary block" disabled={busy || pv.locked} onClick={join}>{pv.locked ? "The host has locked this party" : busy ? "Joining…" : "Join the party"}</button>
        {err ? <p className="notice warn small"><Icon name="info" /><span>{err}</span></p> : null}
        <p className="tiny">No account needed. Your name is only shown in this party. Voice chat is off until you choose to join it.</p>
      </section>
    </main></div>
  );
}

// ---- logging a real catch ----
function RealCatchForm({ onSave, onCancel, code, mkey }) {
  const [sp, setSp] = useState("cod"), [len, setLen] = useState(""), [kg, setKg] = useState(""), [rel, setRel] = useState(true), [photo, setPhoto] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    try {
      let id = null;
      if (photo) { const s = await shrinkImage(photo, 1280, 0.8); const blob = await (await fetch(s.dataUrl)).blob(); id = await uploadPartyPhoto(code, mkey, blob); }
      onSave({ species: sp, name: speciesById(sp)?.name || "Fish", lengthCm: Number(len) || null, weightKg: Number(kg) || null, released: rel, photo: id });
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}><div className="watch-card-pop tg-form">
      <h2>Log the catch</h2>
      <label className="field"><span className="lbl">Species</span><select value={sp} onChange={(e) => setSp(e.target.value)}>{SPECIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="row"><label className="field"><span className="lbl">Length (cm)</span><input inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} placeholder="Optional" /></label>
        <label className="field"><span className="lbl">Weight (kg)</span><input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="Optional" /></label></div>
      <label className="check"><input type="checkbox" checked={rel} onChange={(e) => setRel(e.target.checked)} /> Released</label>
      <label className="field"><span className="lbl">Photo (optional)</span><input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /><span className="tiny">Re-encoded on your phone (no location in it) and only shown to people in this party.</span></label>
      <div className="row"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></div>
      {err ? <p className="notice warn small">{err}</p> : null}
    </div></div>
  );
}

// ---- the party ----
function PartyLive({ code, mkey }) {
  const [toasts, setToasts] = useState([]), [sheet, setSheet] = useState(null), [uiHidden, setUiHidden] = useState(false), [sound, setSound] = useState(false);
  const [voiceState, setVoiceState] = useState({ on: false, muted: false, ptt: false, peers: [] }), [blocked, setBlocked] = useState(blockedSet);
  const [replay, setReplay] = useState(null), [logging, setLogging] = useState(false), [chatText, setChatText] = useState(""), [copied, setCopied] = useState(false);
  const voice = useRef(null);
  const toast = (text, kind = "") => { const id = Math.random().toString(36).slice(2); setToasts((t) => [...t.slice(-4), { id, text, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200); };
  // walking about: others' poses go straight to the 3D view; yours are sent a few times a second while you move
  const poseBus = useMemo(() => new EventTarget(), []);
  const poseSent = useRef({ at: 0, p: null });
  const sendPose = (p) => {
    const now = Date.now(), last = poseSent.current;
    if (p && !p.spotAt && last.p && now - last.at < 300) return;
    if (p && !p.spotAt && last.p && Math.hypot(p.x - last.p.x, p.z - last.p.z) < 0.05 && Math.abs(p.face - last.p.face) < 0.05 && p.air === last.p.air && now - last.at < 2000) return;
    poseSent.current = { at: now, p: p && !p.spotAt ? p : null };
    P_ref.current?.send({ t: "pose", p: p ? (p.spotAt ? { spotAt: true, at: p.at, face: p.face, edge: p.edge, cast: p.cast } : { x: p.x, y: p.y, z: p.z, face: p.face, air: p.air }) : null });
  };
  const P = useParty(code, mkey, {
    onMessage: (m) => {
      const name = (id) => P_ref.current?.members.find((x) => x.id === id)?.name || "Someone";
      if (m.t === "pose") { poseBus.dispatchEvent(new CustomEvent("pose", { detail: { who: m.who, p: m.p } })); return; }
      if (m.t === "react" && !blocked.has(m.from)) { toast(`${name(m.from)}: ${REACT.find((r) => r[0] === m.r)?.[1] || "Nice"}`, "react"); if (m.from !== P_ref.current?.me?.id) haptics.feel("reaction"); }
      if (m.t === "chat" && m.c.who !== P_ref.current?.me?.id && !blocked.has(m.c.who) && sheetRef.current !== "chat") toast(`${name(m.c.who)}: ${m.c.text}`, "chat");
      if (m.t === "signal") voice.current?.signal(m.from, m.data);
      if (m.t === "voice" && m.voice.on && m.who !== P_ref.current?.me?.id && !blocked.has(m.who)) voice.current?.meet(m.who);
      if (m.t === "voice" && !m.voice.on) voice.current?.drop(m.who);
      if (m.t === "error" && m.message) toast(m.message);
    },
  });
  const P_ref = useRef(P); P_ref.current = P;
  const sheetRef = useRef(sheet); sheetRef.current = sheet;
  const me = P.me, party = P.party, mode = party?.mode || "virtual", venue = party?.venue || "pier";
  const meM = P.members.find((m) => m.id === me?.id);
  const fishing = !!meM?.spot;

  // ---- my own fishing: virtual (the simulation, every catch marked simulated) or real (I log what happens) ----
  const [hint] = useState(() => { const pool = ["cod", "bass", "whiting", "mackerel", "pollack", "plaice", "thornback-ray", "pouting"]; const sp = pool[Math.floor(Math.random() * pool.length)]; return { species: sp, lengthCm: 30 + Math.round(Math.random() * 35) }; });
  const [fishFor, setFishFor] = useState(hint);
  const vf = useVirtualFishing({ species: fishFor.species, name: speciesById(fishFor.species)?.name || "Fish", lengthCm: fishFor.lengthCm, onEvent: (e) => { if (mode === "virtual" && fishing) P.sendEvent(e.type, e.data); if (e.type === "catch") { const pool = ["cod", "bass", "whiting", "mackerel", "pollack", "plaice", "pouting", "black-bream", "garfish"]; setTimeout(() => setFishFor({ species: pool[Math.floor(Math.random() * pool.length)], lengthCm: 25 + Math.round(Math.random() * 45) }), 12000); } } });
  const myServerEvents = P.events.filter((e) => e.who === me?.id);
  const myEvents = mode === "virtual" ? vf.events : myServerEvents;
  const now = Date.now();
  const myPhase = phaseAt(myEvents, now);
  useEffect(() => { if (myPhase.phase !== "hooked") haptics.reeling(false); }, [myPhase.phase]); // the fight's over: no more reeling ticks
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(id); }, []);
  // once you're in, the invite secret leaves the address bar: it can't be copied, screenshotted or kept in history by
  // mistake, and a link replaced by the host is never left showing (Invite has the current link; coming back to
  // #party/<code> works with this phone's member key)
  useEffect(() => { if (location.hash.startsWith(`#party/${code}/`)) history.replaceState(null, "", `${location.pathname}${location.search}#party/${code}`); }, [code]);

  // ---- notifications: what the others are doing (from their recorded events only) ----
  const seen = useRef(new Set()), firstLoad = useRef(true);
  useEffect(() => {
    if (!P.events.length) return;
    for (const e of P.events) {
      if (seen.current.has(e.seq)) continue;
      seen.current.add(e.seq);
      if (firstLoad.current || e.who === me?.id || blocked.has(e.who) || Date.now() - e.t > 15000) continue;
      const name = P.members.find((m) => m.id === e.who)?.name;
      if (e.type === "catch") { const at = landedDelay(e, venue); setTimeout(() => toast(momentText(name, e, mode), "catch"), at); }
      else { const t = momentText(name, e, mode); if (t) toast(t); }
      // another angler with a fish on: one distinct notification (each event once, never on catching up after reconnecting)
      if (e.type === "hooked") haptics.feel("friendHooked", { key: `${e.who}|${e.seq}|hooked` });
    }
    firstLoad.current = false;
  }, [P.events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // a friend coming online: one subtle pulse. Compared with who was online before (kept across this phone's own
  // reconnects, so catching up never buzzes); someone dropping in and out is felt once a minute at most
  const onlineBefore = useRef(null);
  useEffect(() => {
    if (!me?.id || !P.members.length) return;
    const now = new Set(P.members.filter((m) => m.online && m.id !== me.id && !blocked.has(m.id)).map((m) => m.id));
    if (onlineBefore.current) for (const id of now) if (!onlineBefore.current.has(id)) haptics.feel("friendJoined", { key: `${id}|joined|${Math.floor(Date.now() / 60000)}` });
    onlineBefore.current = now;
  }, [P.members, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- voice ----
  useEffect(() => () => voice.current?.leave(), []);
  async function joinVoice() {
    if (!voice.current) voice.current = createVoice({ me: me.id, send: (m) => P.send(m), onChange: setVoiceState });
    try { await voice.current.join(P.members.filter((m) => m.id !== me.id && m.voice?.on && !blocked.has(m.id)).map((m) => m.id)); }
    catch { toast("Voice needs the microphone. It wasn't allowed, so text chat is there instead."); }
  }
  // the mic button on the fishing screen: the first tap joins voice (the phone asks for the microphone then, not
  // before); after that it mutes and unmutes you
  const micTap = async () => {
    if (!voiceState.on) { await joinVoice(); if (voice.current?.state().on) toast("Voice on. People near you sound louder. Tap the mic to mute."); return; }
    voice.current?.mute(!voiceState.muted);
  };
  // proximity chat: everyone's loudness and side from where they stand in the 3D place
  const onHear = (h) => { const v = voice.current; if (!v || !v.state().on) return; for (const p of v.state().peers) { const r = proximityOf(h.me, h.others[p.id], h.yaw); v.setPlace(p.id, r.near, r.pan); } };
  const speakingKey = [...(voiceState.peers || []).filter((p) => p.speaking && !p.muted).map((p) => p.id), ...(voiceState.on && voiceState.talking && voiceState.level > 0.05 && me ? [me.id] : [])].sort().join(",");
  const speaking = useMemo(() => new Set(speakingKey ? speakingKey.split(",") : []), [speakingKey]);
  const block = (id, on) => { const s = new Set(blocked); if (on) { s.add(id); voice.current?.drop(id); } else s.delete(id); setBlocked(s); try { localStorage.setItem(BLOCK_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };

  // ---- the anglers in the 3D place ----
  const anglers = useMemo(() => P.members.filter((m) => m.spot).map((m) => {
    let events = m.id === me?.id && mode === "virtual" ? vf.events : P.events.filter((e) => e.who === m.id);
    if (replay?.who === m.id && Date.now() - replay.start < 12000) events = [{ ...replay.ev, t: replay.start }];
    return { id: m.id, name: m.name + (m.online ? "" : " (away)"), spot: m.spot, outfit: m.outfit, look: m.look || null, local: m.id === me?.id, inspect: m.id === me?.id && mode === "virtual", real: mode === "real", events, fishHint: m.id === me?.id && mode === "virtual" ? fishFor : null };
  }), [P.members, P.events, vf.events, me?.id, mode, replay, fishFor]);

  // the light: a real trip is always now; a virtual party at whatever time of day the host picks (midday to start)
  const lightPick = mode === "real" ? "now" : party?.light || "midday";
  const lightNow = useMemo(() => { const at = { lat: 52.6, lon: 1.7 }, t = timeFor(lightPick, at), sun = ASTRO.sunPos(t, at.lat, at.lon), moon = ASTRO.moonPos(t, at.lat, at.lon); return { sunAlt: sun.alt, sunAz: sun.az, moonAlt: moon.alt, moonAz: moon.az, moonIllum: ASTRO.moonIllum(t).fraction }; }, [lightPick, Math.floor(now / 600000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cond = { windKph: 18, cloudPct: 40, precipMm: 0 };
  const catches = P.events.filter((e) => e.type === "catch" && isLanded(e, now, venue)).reverse();
  const memberById = Object.fromEntries(P.members.map((m) => [m.id, m]));
  const board = party?.challenge ? standings(P.events, memberById, { kind: party.challenge.kind, from: party.challenge.startsAt + P.offset * 0, to: party.challenge.endsAt }) : standings(P.events, memberById, { kind: "most" });

  if (P.status === "ended" || P.status === "kicked" || P.status === "denied") {
    return <div className="watch-shell"><div className="watch-msg"><Icon name="info" /><h1>{P.status === "kicked" ? "You've been removed from this party" : P.status === "denied" ? "This party can't be opened from here" : "This party has ended"}</h1><p>{P.status === "ended" ? "Thanks for fishing together." : ""}</p><a className="btn" href="#together" onClick={() => forget(code)}>Fish Together</a></div></div>;
  }
  if (!party) return <div className="watch-shell"><div className="watch-msg"><span className="loading-dots" aria-label="Connecting" /><p>{P.status === "reconnecting" ? "Reconnecting…" : "Joining the party…"}</p></div></div>;

  const host = me?.host, link = party.secret ? partyLink(code, party.secret) : null;
  const tab = sheet || "people"; // on a wide screen the panel is always there, open at People
  const lastMine = myEvents.at(-1)?.type;
  // real trips: one tap for what just happened, only the steps that make sense now
  const realNext = (() => {
    const ph = myPhase.phase;
    if (ph === "hooked") return [["Landed it", () => setLogging(true), "fish"], ["Lost it", () => P.sendEvent("lost"), "close"]];
    if (ph === "bite") return [["Fish on", () => P.sendEvent("hooked"), "hook"], ["Missed", () => P.sendEvent("missed"), "close"]];
    if (ph === "waiting" && lastMine && lastMine !== "catch" && lastMine !== "lost") return [["Bite", () => P.sendEvent("bite"), "bell"], ["Landed one", () => setLogging(true), "fish"], ["Cast again", () => P.sendEvent("cast"), "target"]];
    if (ph === "cast" || ph === "landing") return [];
    return [["Cast", () => P.sendEvent("cast"), "target"], ["Landed one", () => setLogging(true), "fish"]];
  })();

  return (
    <div className={`watch-shell try-shell immersive party-shell${uiHidden ? " ui-hidden" : ""}`}>
      <div className="watch"><div className="watch-stage">
        <Stage3D feel={haptics.feel} fight={mode === "virtual" ? vf.fight : null} reelOpts={mode === "virtual" ? vf.opts : null} onReelOpts={vf.setOpts} poseBus={poseBus} onHear={onHear} speaking={speaking} onPose={mode === "virtual" ? sendPose : undefined} onEmote={mode === "virtual" ? (k) => P_ref.current?.send({ t: "pose", p: { emote: k } }) : undefined} spotId={party?.place?.mark || null} placeName={party?.place?.label || ""} venue={venue} anglers={anglers} light={lightNow} cond={cond} facing={venue === "river" || venue === "lake" ? 200 : 110} sound={sound} now={Date.now} onTap={() => setUiHidden((h) => !h)} toasts={toasts}
          catchPhoto={(ev) => (ev?.data?.photo ? partyPhotoUrl(code, mkey, ev.data.photo) : null)}>
          <div className="fs-top">
            <span className={`live-badge ${mode === "real" ? "s-live" : "s-replay"}`}>{mode === "real" ? <><span className="rec-dot" />Real trip</> : "Virtual"}</span>
            {party.place?.label ? <span className="fs-chip">{party.place.label}</span> : null}
            <button type="button" className="fs-chip" onClick={() => setSheet("people")}><Icon name="users" />{P.members.filter((m) => m.spot).length}{P.members.some((m) => !m.spot) ? ` + ${P.members.filter((m) => !m.spot).length} watching` : ""}</button>
            {P.status === "reconnecting" ? <span className="fs-chip">Reconnecting…</span> : null}
            <span className="grow" />
            {party.voiceOn ? <button type="button" className={`fs-btn mic${voiceState.on && !voiceState.muted ? " on" : ""}${voiceState.on && voiceState.talking && voiceState.level > 0.05 ? " talking" : ""}`} onClick={micTap} aria-pressed={voiceState.on && !voiceState.muted} aria-label={!voiceState.on ? "Turn on your microphone (voice chat)" : voiceState.muted ? "Unmute your microphone" : "Mute your microphone"} title={!voiceState.on ? "Voice chat: tap to turn your mic on" : voiceState.muted ? "Muted: tap to talk" : "Mic on: tap to mute"}><Icon name={voiceState.on && !voiceState.muted ? "mic" : "micoff"} /></button> : null}
            <button type="button" className="fs-btn" onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} aria-pressed={sound}><Icon name={sound ? "volume" : "mute"} /></button>
            <button type="button" className={`fs-btn${sheet ? " on" : ""}`} onClick={() => setSheet(sheet ? null : "people")} aria-label="Party: people, voice, chat, catches, invite"><Icon name="users" /></button>
          </div>
          <div className="fs-bottom">
            {voiceState.on && voiceState.ptt ? <button type="button" className="ft-pill ptt" onPointerDown={() => voice.current?.talk(true)} onPointerUp={() => voice.current?.talk(false)} onPointerLeave={() => voice.current?.talk(false)}><Icon name="mic" />Hold to talk</button> : null}
            {!fishing ? <span className="ft-label">Watching{meM?.role === "spectator" ? "" : " (no spot free)"}</span>
              : mode === "virtual" ? <FishTray phase={myPhase.phase} last={lastMine} reel={vf.reel} fight={vf.fight} note={vf.note} opts={vf.opts} autoplay={false} onCast={vf.cast} onStrike={vf.strike} onTap={() => { vf.tap(); haptics.feel("reelTap", { load: vf.fight?.tension }); }} onLand={vf.land} onDrag={(d) => vf.setDrag((vf.fight?.drag ?? 0.78) + d * 0.08)} onNudge={vf.nudge} />
              : <div className="fish-tray real-tray" role="group" aria-label="Log what happens">{realNext.map(([l, f, ic]) => <button key={l} type="button" className="ft-pill" onClick={f}><Icon name={ic} />{l}</button>)}<span className="ft-label">{meM?.presence === "water" ? "At the water" : "Not at the water"}</span></div>}
          </div>
        </Stage3D>
      </div>

      {sheet ? <div className="sheet-scrim" onClick={() => setSheet(null)} /> : null}
      <aside className={`watch-panel sheet party-sheet${sheet ? " open" : ""}`} aria-label="Party">
        <div className="sheet-head"><div className="try-head"><h1>{mode === "real" ? "Real trip" : "Virtual fishing"} <span className="beta-pill">Beta</span></h1><p className="small muted">{mode === "real" ? "Animated from what the anglers log. Not a camera." : "A simulation: every catch here is simulated and kept apart from real records."}</p></div><button type="button" className="xbtn sheet-x" onClick={() => setSheet(null)} aria-label="Close"><Icon name="close" /></button></div>
        <div className="seg party-tabs" role="tablist">{[["people", "People"], ["catches", "Catches"], ["chat", "Chat"], ["invite", "Invite"], ...(host ? [["host", "Host"]] : [])].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setSheet(k)}>{l}</button>)}</div>

        {tab === "people" ? (
          <section className="watch-sec">
            <div className="voice-bar">
              {!voiceState.on ? <button type="button" className="btn small primary" disabled={!party.voiceOn} onClick={joinVoice}><Icon name="mic" />{party.voiceOn ? "Join voice" : "Voice is off"}</button>
                : <><button type="button" className="btn small" onClick={() => voice.current?.leave()}>Leave voice</button>
                  <button type="button" className={`btn small${voiceState.muted ? " primary" : ""}`} onClick={() => voice.current?.mute(!voiceState.muted)}><Icon name={voiceState.muted ? "mute" : "mic"} />{voiceState.muted ? "Unmute" : "Mute me"}</button>
                  <label className="check small"><input type="checkbox" checked={voiceState.ptt} onChange={(e) => voice.current?.setPushToTalk(e.target.checked)} /> Push to talk</label>
                  <label className="check small"><input type="checkbox" checked={voiceState.proximity !== false} onChange={(e) => voice.current?.setProximity(e.target.checked)} /> Proximity chat (people near you are louder, from their side; off: hear everyone)</label></>}
            </div>
            <p className="tiny">Voice goes phone to phone. It asks for the microphone only when you join. On some mobile networks someone may not connect; text chat always works.</p>
            <div className="list">{P.members.map((m) => {
              const vp = voiceState.peers.find((x) => x.id === m.id), isMe = m.id === me.id;
              return (
                <div key={m.id} className="li party-person">
                  <span className={`speak${(isMe ? voiceState.talking && voiceState.level > 0.05 : vp?.speaking) ? " on" : ""}`} aria-hidden="true" />
                  <span className="grow"><span className="t">{m.name}{isMe ? " (you)" : ""}{m.role === "host" ? " · host" : ""}</span>
                    <span className="s">{m.spot ? `${spotById(venue, m.spot).name} · ${mode === "real" ? (m.presence === "water" ? "At the water" : "Not at the water") : "Fishing virtually"}` : "Watching"}{m.online ? "" : " · away"}{m.voice?.on ? (m.voice.muted ? " · voice (muted)" : " · in voice") : ""}{vp ? (vp.connected ? (voiceState.proximity !== false && vp.near < 0.05 ? " · too far away to hear" : " · you can hear each other") : vp.failed ? " · voice couldn't connect" : " · connecting voice…") : ""}</span></span>
                  {!isMe && vp ? <input type="range" min="0" max="1" step="0.1" value={vp.volume} onChange={(e) => voice.current?.setVolume(m.id, Number(e.target.value))} aria-label={`${m.name}'s volume`} className="vol-mini" /> : null}
                  {!isMe && vp ? <button type="button" className="xbtn" onClick={() => voice.current?.muteOther(m.id, !vp.muted)} aria-label={vp.muted ? `Unmute ${m.name}` : `Mute ${m.name}`}><Icon name={vp.muted ? "mute" : "volume"} /></button> : null}
                  {!isMe && m.spot ? <button type="button" className="xbtn" onClick={() => { setSheet(null); }} aria-label={`Watch ${m.name}`} title="Watch"><Icon name="eye" /></button> : null}
                  {!isMe ? <details className="more"><summary className="xbtn" aria-label={`More for ${m.name}`}><Icon name="more" /></summary><div className="more-pop">
                    <button type="button" onClick={() => block(m.id, !blocked.has(m.id))}>{blocked.has(m.id) ? "Unblock" : "Block (hide their chat and voice)"}</button>
                    <button type="button" onClick={() => { P.send({ t: "report", who: m.id, reason: "Reported from the party" }); toast("Reported. Thank you."); }}>Report</button>
                    {host ? <><button type="button" onClick={() => P.send({ t: "kick", who: m.id })}>Remove from the party</button>
                      {m.spot ? [1, 2, 3, 4].filter((s) => s !== m.spot).map((s) => <button key={s} type="button" onClick={() => P.send({ t: "assign", who: m.id, spot: s })}>Move to: {spotById(venue, s).name}</button>) : null}</> : null}
                  </div></details> : null}
                </div>
              );
            })}</div>
            {fishing && mode === "real" ? <div className="row"><button type="button" className={`btn small${meM.presence === "water" ? " primary" : ""}`} onClick={() => P.send({ t: "presence", presence: "water" })}>I'm at the water</button><button type="button" className={`btn small${meM.presence !== "water" ? " primary" : ""}`} onClick={() => P.send({ t: "presence", presence: "remote" })}>I'm not</button></div> : null}
            {fishing ? <div className="moments">{[1, 2, 3, 4].filter((s) => s !== meM.spot && !P.members.some((m) => m.spot === s)).map((s) => <button key={s} type="button" className="chip" onClick={() => P.send({ t: "spot", spot: s })}>Move to {spotById(venue, s).name.toLowerCase()}</button>)}</div> : null}
            <button type="button" className="btn small block" onClick={() => { voice.current?.leave(); P.send({ t: "leave" }); forget(code); location.hash = "#together"; }}>Leave the party</button>
          </section>
        ) : null}

        {tab === "catches" ? (
          <section className="watch-sec">
            {party.challenge ? <div className="notice small"><Icon name="trophy" /><span>Challenge: {CHALLENGES[party.challenge.kind]}{Date.now() + P.offset < party.challenge.endsAt ? `, until ${fmtTime(party.challenge.endsAt - P.offset)}` : ", finished"}.{mode === "virtual" ? " Simulated catches only." : " Real logged catches only."}</span></div> : null}
            {board.length ? <ol className="board">{board.slice(0, 4).map((s, i) => <li key={s.who}><b>{i + 1}</b><span className="grow">{s.name || "Someone"}</span><span className="num">{party.challenge?.kind === "longest" ? `${s.score} cm` : party.challenge?.kind === "biggest" ? `${Math.round(s.score * 2.2046 * 10) / 10} lb` : s.score}</span></li>)}</ol> : <p className="tiny">No fish yet. The first one lands here.</p>}
            <div className="catch-strip">{catches.map((e) => {
              const sp = speciesById(e.data?.species), who = memberById[e.who]?.name || "Someone";
              return (
                <div key={e.seq} className="catch-tile party-catch">
                  {e.data?.photo ? <img src={partyPhotoUrl(code, mkey, e.data.photo)} alt={`${who}'s ${sp?.name || "fish"}`} /> : sp && hasArt(sp.id) ? <img src={artUrl(sp.id, "s")} alt="" className="art" /> : <span className="ct-ph"><Icon name="fish" /></span>}
                  <span className="t">{e.data?.name || sp?.name || "Fish"}{e.data?.simulated ? " · simulated" : ""}</span>
                  <span className="s">{who} · {[e.data?.lengthCm ? `${e.data.lengthCm} cm` : null, e.data?.weightKg ? `${e.data.weightKg} kg` : null, fmtTime(e.t)].filter(Boolean).join(" · ")}</span>
                  <span className="row">
                    <button type="button" className="ft-pill" onClick={() => { setReplay({ who: e.who, ev: e, start: Date.now() }); setSheet(null); }}><Icon name="play" />Replay</button>
                    {e.who !== me.id ? REACT.map(([r, l]) => <button key={r} type="button" className="ft-pill" onClick={() => P.send({ t: "react", r, seq: e.seq })}>{l}</button>) : null}
                  </span>
                </div>
              );
            })}</div>
          </section>
        ) : null}

        {tab === "chat" ? (
          <section className="watch-sec">
            {!party.chatOn ? <p className="notice small">The host has turned chat off.</p> : null}
            <ol className="chat">{P.chat.filter((c) => !blocked.has(c.who)).map((c) => <li key={c.seq} className={c.who === me.id ? "mine" : ""}><b>{memberById[c.who]?.name || "Someone"}</b> {c.text}<span className="tiny"> {fmtTime(c.at - P.offset)}</span></li>)}</ol>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (chatText.trim()) { P.send({ t: "chat", text: chatText.trim() }); setChatText(""); } }}>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={200} placeholder={party.chatOn ? "Say something" : "Chat is off"} disabled={!party.chatOn} aria-label="Message" />
              <button type="submit" className="btn small primary" disabled={!party.chatOn}>Send</button>
            </form>
          </section>
        ) : null}

        {tab === "invite" ? (
          <section className="watch-sec">
            {link ? (
              <>
                <div className="qr" aria-label="QR code for the invite link" dangerouslySetInnerHTML={{ __html: qrSvg(link) || "" }} />
                <p className="small"><b>Code: {code}</b>{party.codeOn ? "" : " (turned off: only the link works)"}</p>
                <div className="row">
                  {navigator.share ? <button type="button" className="btn small primary" onClick={() => navigator.share({ title: "Fish with me on FishDock", text: `Join my ${mode === "real" ? "fishing trip" : "virtual fishing party"} on FishDock`, url: link }).catch(() => {})}><Icon name="share" />Share</button> : null}
                  <button type="button" className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy link"}</button>
                </div>
                <p className="tiny">Private: only people with this link{party.codeOn ? " or the code" : ""} can join. Don't post it publicly. You can make a new link in Host if it gets passed on.</p>
              </>
            ) : <p className="small">Ask the host for the invitation. Only the host can share it.</p>}
          </section>
        ) : null}

        {tab === "host" && host ? (
          <section className="watch-sec host-ctl">
            {[["locked", "Lock the party (no one new can join)"], ["codeOn", "Let people join with the short code"], ["anglersOn", "Let new people join as anglers"], ["chatOn", "Text chat"], ["voiceOn", "Voice chat"]].map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={!!party[k]} onChange={(e) => P.send({ t: "settings", [k]: e.target.checked })} /> {l}</label>)}
            {mode === "virtual" ? <div className="field"><span className="lbl">Time of day</span><div className="moments">{LIGHTS.map(([k, l]) => <button key={k} type="button" className={`chip${(party.light || "midday") === k ? " on" : ""}`} onClick={() => P.send({ t: "settings", light: k })}>{l}</button>)}</div></div> : null}
            <button type="button" className="btn small" onClick={() => { P.send({ t: "newLink" }); toast("New link made. The old one no longer works."); }}>Make a new invite link</button>
            <div className="field"><span className="lbl">Friendly challenge</span><div className="moments">
              {Object.entries(CHALLENGES).map(([k, l]) => <button key={k} type="button" className={`chip${party.challenge?.kind === k ? " on" : ""}`} onClick={() => P.send({ t: "challenge", kind: k, minutes: 60 })}>{l} (1 hour)</button>)}
              {party.challenge ? <button type="button" className="chip" onClick={() => P.send({ t: "challenge", kind: null })}>Stop the challenge</button> : null}
            </div><span className="tiny">{mode === "virtual" ? "Counts simulated catches in this party only." : "Counts real logged catches in this party only."}</span></div>
            <button type="button" className="btn small danger" onClick={() => { if (confirmClose.current) P.send({ t: "close" }); else { confirmClose.current = true; toast("Tap Close the party again to close it for everyone."); setTimeout(() => { confirmClose.current = false; }, 4000); } }}>Close the party</button>
          </section>
        ) : null}
      </aside>
      </div>
      {logging ? <RealCatchForm code={code} mkey={mkey} onCancel={() => setLogging(false)} onSave={(d) => { if (myPhase.phase !== "hooked") P.sendEvent("hooked"); setTimeout(() => P.sendEvent("catch", d), 50); setLogging(false); }} /> : null}
    </div>
  );
}
const confirmClose = { current: false };
// a catch's notification waits until the fish is out of the water on screen
function landedDelay(e, venue) { const at = e.t + 0; const now = Date.now(); for (let ms = 0; ms < 12000; ms += 250) if (isLanded(e, now + ms, venue)) return ms; return 8000 - (now - at); }

export default function Party({ code, secret }) {
  const [m, setM] = useState(() => membershipOf(code));
  if (!m?.key) {
    if (!secret) return <div className="watch-shell"><div className="watch-msg"><Icon name="lock" /><h1>Join with the invitation</h1><p>This party needs its invite link or code. Ask the host.</p><a className="btn" href="#together">Fish Together</a></div></div>;
    return <JoinScreen code={code} secret={secret} onJoined={() => setM(membershipOf(code))} />;
  }
  return <PartyLive code={code} mkey={m.key} />;
}
