// ---- TryLive: the virtual fishing game (#play, #play/<place>; older links #try, #try/<place>/<species>, /3d) ----
// Places, fish, light and weather to play with, and the testing buttons that skip the waiting. A game, not a real
// session: nothing here is shared as a real catch. (Until 13 November it was labelled a demo throughout; Aaron asked
// for it to be the game, one link straight into it.) Backdrops are real free-licensed photos taken near each place
// (Wikimedia Commons, credited) or the drawn scene; "Live weather" is the real forecast for that place.
/* global __BUILD_ID__ */
import { useEffect, useMemo, useRef, useState } from "react";
import HapticSettings from "../components/HapticSettings.jsx";
import { haptics } from "../lib/haptics.js";
import FishingScene, { QUALITY_OPTIONS } from "../components/FishingScene.jsx";
import { ROD_STYLES } from "../lib/sceneActors.js";
import { composeFrame } from "../lib/sceneGL.js";
import { defaultView, nearbyPhotos, detectHorizon, smallPhoto, rankWaterViews, venueOf, viewFeatures, levelling } from "../lib/scene.js";
import { VIEWPOINTS } from "../lib/viewpoint.js";
import { shrinkImage } from "../lib/storage.js";
import { DRAW_CM, phaseAt } from "../lib/liveEvents.js";
import { useVirtualFishing } from "../lib/useVirtualFishing.js";
import FishTray from "../components/FishTray.jsx";
import Stage3D from "../components/Stage3D.jsx";
import InviteHere from "../components/InviteHere.jsx";
import LookPicker, { myLook, lookOnly } from "../components/LookPicker.jsx";
import { saveLook } from "../lib/world3d/people.js";
import { landedCatches } from "../lib/landed.js";
import { useParty, joinPublic, publicSeat, forgetPublic, momentText } from "../lib/party.js";
import { playerName, setPlayerName, cleanName, addCatch, setOutcome, diary as readDiary } from "../lib/diary.js";
import { progress, afterCatch, medalFor, CHALLENGE_XP } from "../lib/progress.js";
import { drawFish } from "../lib/fishDraw.js";
import { FILM } from "../lib/world3d/film.js";
import Logbook, { LevelBar } from "../components/Logbook.jsx";
import { conditionsAt } from "../lib/bitescore.js";
import { getConditions } from "../lib/api.js";
import { spotById } from "../data/spots.js";
import { SPECIES, speciesById } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";
import ASTRO from "../lib/astro.js";
import { timeFor } from "../lib/timeOfDay.js";
import { Icon, Seg } from "../components/ui.jsx";

const GORLESTON = { id: "gorleston-south-pier", name: "Gorleston South Pier", region: "Norfolk, East of England", kind: "sea", type: "pier", lat: 52.5721, lon: 1.7383 };
export const TRY_PLACES = ["gorleston-south-pier", "cromer-pier", "chesil-beach-ferry-bridge", "whitby-piers", "brixham-breakwater", "st-ives-the-island", "holyhead-breakwater", "loch-ryan-leffnol", "river-wye-ross", "royalty-fishery-avon", "rutland-water", "lough-erne-enniskillen"];
const placeOf = (id) => (id === GORLESTON.id ? GORLESTON : spotById(id)) || GORLESTON;
const LIGHT = [{ value: "now", label: "Now" }, { value: "morning", label: "Morning" }, { value: "midday", label: "Midday" }, { value: "dusk", label: "Dusk" }, { value: "night", label: "Night" }];
const RODS = [{ value: "auto", label: "For the place" }, ...Object.values(ROD_STYLES).map((r) => ({ value: r.id, label: r.name }))];
const TIPS = [{ value: "auto", label: "At night" }, { value: "on", label: "On" }, { value: "off", label: "Off" }];
const FROM = [{ value: "auto", label: "The place's own" }, { value: "beach", label: "Beach" }, { value: "pier", label: "Pier" }, { value: "estuary", label: "Estuary" }, { value: "river", label: "River bank" }, { value: "lake", label: "Lake" }];
const WEATHER = [{ value: "live", label: "Live weather" }, { value: "calm", label: "Calm" }, { value: "breezy", label: "Breezy" }, { value: "windy", label: "Windy" }, { value: "overcast", label: "Overcast" }, { value: "drizzle", label: "Light rain" }, { value: "rain", label: "Heavy rain" }, { value: "fret", label: "Sea fret" }, { value: "storm", label: "Storm" }];
const DEMO_WX = { calm: { windKph: 5, cloudPct: 15, precipMm: 0 }, breezy: { windKph: 20, cloudPct: 45, precipMm: 0 }, windy: { windKph: 42, cloudPct: 70, precipMm: 0 }, overcast: { windKph: 14, cloudPct: 100, precipMm: 0 }, drizzle: { windKph: 16, cloudPct: 95, precipMm: 0.4 }, rain: { windKph: 30, cloudPct: 100, precipMm: 4 },
  // (a sea fret: the North Sea's summer fog, still air, the far end of the pier gone grey; a storm: a gale, heavy rain and
  // thunder. Both simulated, as every preset is: Live weather is the real forecast)
  fret: { windKph: 6, cloudPct: 100, precipMm: 0, fog: 0.85 }, storm: { windKph: 58, cloudPct: 100, precipMm: 6, thunder: true } };

/** A time today that gives the chosen light at this place, found from the real sun. */

export default function TryLive({ initialPlace, initialSpecies, chosenFish = false, initialPoint = null }) {
  // the chips offer the demo places, but a link to any documented mark opens that mark (never a different place)
  const [placeId, setPlaceId] = useState(initialPlace && (initialPlace === GORLESTON.id || spotById(initialPlace)) ? initialPlace : GORLESTON.id);
  const place = placeOf(placeId);
  const fresh = place.kind !== "sea";
  const fishList = useMemo(() => SPECIES.filter((s) => (fresh ? s.type !== "sea" : s.type !== "fresh")).sort((a, b) => (hasArt(b.id) ? 1 : 0) - (hasArt(a.id) ? 1 : 0)), [fresh]);
  const [species, setSpecies] = useState(speciesById(initialSpecies) ? initialSpecies : fresh ? "perch" : "cod");
  const sp = speciesById(species) || fishList[0];
  const [length, setLength] = useState(DRAW_CM[species] || 45);
  // which fish the demo catches: a different one each cast (the default), or the one you choose below
  // (a random fish every time the game opens; choosing one lasts this visit. The choice used to be remembered, so a
  // fish picked once to test came back every time)
  // (a fish chosen on the map, #play/<place>/<fish>, is the one you'll catch)
  const [randomFish, setRandomFish] = useState(!(chosenFish && speciesById(initialSpecies)));
  const setFishMode = (random) => setRandomFish(random);
  const [photos, setPhotos] = useState(null);
  const [pick, setPick] = useState(0);
  const [view, setView] = useState(defaultView());
  // the demo opens in daylight light at night (when "Now" is too dark to see much); "Now" is one tap away
  const [light, setLight] = useState(() => (ASTRO.sunPos(Date.now(), place.lat, place.lon).alt > -4 ? "now" : "dusk"));
  const [wx, setWx] = useState("live");
  const [cond, setCond] = useState(null);
  const [quality, setQuality] = useState("auto");
  const [rod, setRod] = useState("auto");
  const [tipLight, setTipLight] = useState("auto");
  const [from, setFrom] = useState("auto");
  const [sound, setSound] = useState(() => { try { return localStorage.getItem("fishdock.gameSound") !== "off"; } catch { return true; } }); // (on unless you've turned it off; it starts at your first tap, as browsers require)
  useEffect(() => { try { localStorage.setItem("fishdock.gameSound", sound ? "on" : "off"); } catch { /* no storage */ } }, [sound]);
  const [volume, setVolume] = useState(0.7);
  const [own, setOwn] = useState(null); // the visitor's own photo for this demo: kept in this page only, never sent anywhere
  const [copied, setCopied] = useState("");
  const [uiHidden, setUiHidden] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [invite, setInvite] = useState(false);
  const [lookOpen, setLookOpen] = useState(false), [look, setLookNow] = useState(myLook);
  // ---- your fishing name (asked the first time you play) and your diary of the fish you've landed ----
  const [name, setName] = useState(playerName), [naming, setNaming] = useState(() => !playerName()), [nameDraft, setNameDraft] = useState(() => playerName() || "");
  const [diaryOpen, setDiaryOpen] = useState(false), [diaryList, setDiaryList] = useState(readDiary);
  const saveName = () => { const n = setPlayerName(nameDraft); if (n) { setName(n); setNaming(false); } };
  // ---- the others fishing here: everyone playing this place is in its room (server/party.js public places), seen
  // in the 3D view with the names they chose; you're in it as soon as you have a name ----
  const [seat, setSeat] = useState(null), [toasts, setToasts] = useState([]);
  const toast = (text, kind = "") => { const id = Math.random().toString(36).slice(2); setToasts((t) => [...t.slice(-3), { id, text, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), typeof text === "object" ? 5200 : 4200); };
  const poseBus = useMemo(() => new EventTarget(), []);
  const Proom = useParty(seat?.code || null, seat?.key || null, { onMessage: (m) => {
    const who = (id) => Proom_ref.current?.members.find((x) => x.id === id)?.name || "Someone", mine = (id) => id === Proom_ref.current?.me?.id;
    if (m.t === "pose") { poseBus.dispatchEvent(new CustomEvent("pose", { detail: { who: m.who, p: m.p } })); return; }
    if (m.t === "chat" && m.c.sys && !mine(m.c.who)) toast(m.c.sys === "joined" ? `${m.c.name} is fishing here` : `${m.c.name} has gone`, "join");
    if (m.t === "event" && !mine(m.ev.who)) { const txt = momentText(who(m.ev.who), m.ev, "virtual"); if (txt && (m.ev.type === "catch" || m.ev.type === "hooked")) toast(txt.replace(" (simulated)", "")); }
  } });
  const Proom_ref = useRef(Proom); Proom_ref.current = Proom;
  useEffect(() => { // into this place's room (the one this phone had, or a new seat); out of the last place's
    if (!name) return undefined;
    let gone = false; const had = publicSeat(placeId);
    if (had) setSeat(had); else joinPublic(placeId, { venue: venueOf(place), name, outfit: look.outfit, look: lookOnly(look) }).then((s) => { if (!gone) setSeat(s); }).catch(() => { /* offline or no server: fishing alone */ });
    return () => { gone = true; Proom_ref.current?.send({ t: "leave" }); setSeat(null); };
  }, [placeId, name]); // eslint-disable-line react-hooks/exhaustive-deps
  // (dropped from the room while away, or it's ended: a fresh seat)
  useEffect(() => { if (Proom.status === "denied" || Proom.status === "ended") { forgetPublic(placeId); setSeat(null); joinPublic(placeId, { venue: venueOf(place), name, outfit: look.outfit, look: lookOnly(look) }).then(setSeat).catch(() => {}); } }, [Proom.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const meRoom = Proom.members.find((m) => m.id === Proom.me?.id);
  const others = Proom.status === "live" ? Proom.members.filter((m) => m.spot && m.online && m.id !== Proom.me?.id) : []; // (only who's here now)
  const poseSent = useRef({ at: 0, p: null });
  const sendPose = (p) => {
    const now = Date.now(), last = poseSent.current;
    if (p && !p.spotAt && last.p && now - last.at < 300) return;
    if (p && !p.spotAt && last.p && Math.hypot(p.x - last.p.x, p.z - last.p.z) < 0.05 && Math.abs(p.face - last.p.face) < 0.05 && p.air === last.p.air && now - last.at < 2000) return;
    poseSent.current = { at: now, p: p && !p.spotAt ? p : null };
    Proom_ref.current?.send({ t: "pose", p: p ? (p.spotAt ? { spotAt: true, at: p.at, face: p.face, edge: p.edge, cast: p.cast } : { x: p.x, y: p.y, z: p.z, face: p.face, air: p.air }) : null });
  };
  const setLook = (v) => { setLookNow(v); saveLook(v); };
  const [panoPreview, setPanoPreview] = useState(() => { try { return localStorage.getItem("fishdock.panoPreview") === "1"; } catch { return false; } });
  const [view3d, setView3d] = useState(() => /\/3d(\/p[1-4])?$/.test(location.hash) || /^#\/?play/.test(location.hash)); // the 360° 3D view (#play opens straight into it)
  const sceneRef = useRef(null);
  // ---- arriving from the UK spot map (#map): the fishing position chosen there, a way back, and a short label ----
  const [point] = useState(initialPoint); // 1 to 4, or null for the best one (the first safe position, spawn.js)
  const fromMap = useMemo(() => { try { return sessionStorage.getItem("fishdock.fromMap") === placeId; } catch { return false; } }, [placeId]);
  const [arrived, setArrived] = useState(true);
  // (it goes when its fade ends, which in 3D starts only once the place is ready: spotmap.css; the timer is a backstop)
  useEffect(() => { setArrived(true); const t = setTimeout(() => setArrived(false), 60000); return () => clearTimeout(t); }, [placeId]);
  const vfReset = useRef(null); // a new place starts afresh

  useEffect(() => { // address bar follows the choice, so the page can be shared or bookmarked
    const h = view3d ? `#play/${placeId}${point && placeId === initialPlace ? `/p${point}` : ""}` : `#try/${placeId}/${species}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }, [placeId, species, view3d, point]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { vfReset.current?.(); setPhotos(null); setPick(0); setView(defaultView()); setCond(null); setOwn(null);
    // the photo that best suits a rod at the water's edge here; if none does (only views from high up, no water
    // where the line lands, a blocked foreground), the drawn scene, labelled as representative
    nearbyPhotos(place).then((r) => rankWaterViews(r.photos || [], venueOf(place))).then((list) => { setPhotos(list); setPick(list[0]?.ok ? 0 : -1); });
    getConditions(place.lat, place.lon).then((c) => setCond(c?.hourly?.length ? c : null));
    if (!fishList.some((f) => f.id === species)) { const f = fresh ? "perch" : "cod"; setSpecies(f); setLength(DRAW_CM[f] || 40); }
    return undefined;
  }, [placeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const photo = own || (photos && pick >= 0 ? photos[pick] : null);
  useEffect(() => { // level the photo if it leans a little, then line the water and the cast up with its horizon
    if (!photo) { setView(defaultView()); return; }
    const i = new Image(); i.crossOrigin = "anonymous"; i.referrerPolicy = "no-referrer";
    i.onload = () => {
      let lv = { rot: 0, zoom: 1 };
      try { lv = levelling(viewFeatures(i).tilt); } catch { /* a photo we can't read is used as it is */ }
      const h = detectHorizon(composeFrame(i, { ...defaultView(), ...lv }, 600));
      setView({ ...defaultView(h || 0.42), ...lv });
    };
    i.src = photo.url;
  }, [photo?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  async function useOwn(file) {
    if (!file) return;
    try { const s = await shrinkImage(file, 1600, 0.84); setOwn({ url: s.dataUrl, own: true }); setSheet(false); } catch { /* not an image this browser can read */ }
  }

  const t = timeFor(light, place);
  const live = conditionsAt(cond, t);
  const c = wx === "live" ? (live ? { windKph: live.windKph, windDir: live.windDir, cloudPct: live.cloudPct, precipMm: live.precipMm, waveM: live.waveM, visibilityM: live.visibilityM, code: live.code } : DEMO_WX.breezy) : DEMO_WX[wx];
  const sun = ASTRO.sunPos(t, place.lat, place.lon), moon = ASTRO.moonPos(t, place.lat, place.lon);
  const lightNow = { sunAlt: sun.alt, sunAz: sun.az, moonAlt: moon.alt, moonAz: moon.az, moonIllum: ASTRO.moonIllum(t).fraction };
  // at dusk the demo faces the sunset, so the glitter path shows
  const v = { ...view, facing: light === "dusk" ? Math.round(sun.az) : light === "night" && moon.alt > 0 ? Math.round(moon.az) : null };
  const scene = own ? { kind: "own", src: own.url, view: v, label: "Your photo (it stays on this device)" } : photo ? { kind: "commons", src: photo.url, view: v, commons: photo } : { kind: "representative", src: null, view: { ...defaultView(), facing: v.facing } };
  // virtual fishing: cast, a fish bites by itself, strike, hold to reel; every catch is simulated
  const vf = useVirtualFishing({ species: sp.id, name: sp.name, lengthCm: length, onEvent: (e) => { if (Proom_ref.current?.status === "live") Proom_ref.current.sendEvent(e.type, e.data); } });
  if (FILM && typeof window !== "undefined") window.__fdVf = vf; // (test pages only: a whole catch played through the game's own events)
  // (your fight, a few times a second, so the others see the fish come in as you reel; never saved)
  const fightSent = useRef(0);
  useEffect(() => { const f = vf.fight; if (!f || Proom.status !== "live") return; const now = Date.now(); if (now - fightSent.current < 330) return; fightSent.current = now; Proom.send({ t: "pose", p: { fight: { progress: f.progress, tension: f.tension, slipping: f.slipping, turns: f.turns } } }); }, [vf.fight]); // eslint-disable-line react-hooks/exhaustive-deps
  vfReset.current = vf.reset;
  const events = vf.events;
  const [, setTick] = useState(0);
  useEffect(() => { if (!events.length) return undefined; const id = setInterval(() => setTick((n) => n + 1), 400); return () => clearInterval(id); }, [events.length]);
  const p = phaseAt(events, Date.now());
  // the fight's over (landed, lost or never started): the reeling ticks stop with it
  useEffect(() => { if (p.phase !== "hooked") haptics.reeling(false); }, [p.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = events.at(-1)?.type;
  // (a random fish: one of this water's kinds that FishDock has a picture of, at four fifths to five quarters of the
  // size the demo usually draws it; drawn as each cast goes out, however it was made, so nothing changes under a fish
  // already on)
  const castN = events.reduce((n, e) => n + (e.type === "cast" ? 1 : 0), 0);
  useEffect(() => {
    if (!castN || !randomFish) return;
    // (the place's own documented fish more often, and a natural spread of sizes with the odd big one: fishDraw.js)
    const pool = fishList.filter((f) => hasArt(f.id)), f = drawFish(pool.length ? pool : fishList, spotById(placeId)?.species || []);
    if (f) { setSpecies(f.species); setLength(f.lengthCm); }
  }, [castN]); // eslint-disable-line react-hooks/exhaustive-deps
  // (what is on the line isn't known until it is hooked)
  const fishKnown = !randomFish || p.phase === "hooked" || last === "catch";
  const fishLabel = fishKnown ? `${sp.name}, ${length} cm` : "Random fish";
  const base = `${location.origin}/#play`;
  const copy = async (u) => { try { await navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(""), 1800); } catch { /* ignore */ } };

  const venue = from === "auto" ? venueOf(place) : from;
  const catches = landedCatches(events, Date.now(), venue); // only once each is out of the water
  // (each fish landed goes in your diary once, with the place; keeping it or putting it back is added when you choose)
  // (each landed fish into the diary, with what it earned worked out now and shown once you've decided what to do with
  // it: Keep it or Put it back. Night and rough weather noted for the badges)
  const rewards = useRef(new Map());
  useEffect(() => { let added = false, before = diaryList; for (const e of catches) if (e?.id && e.data?.species && !before.some((d) => d.id === String(e.id))) {
    const entry = addCatch({ id: String(e.id), species: e.data.species, name: e.data.name || speciesById(e.data.species)?.name, lengthCm: e.data.lengthCm, weightKg: e.data.weightKg, place: placeId, placeName: place.name.replace(/ \(.*\)$/, ""), at: e.t || Date.now(), night: lightNow.sunAlt < -6, rough: (c?.precipMm || 0) > 0.2 || (c?.windKph || 0) >= 35 });
    if (entry) { rewards.current.set(entry.id, afterCatch(before, entry)); before = [entry, ...before]; } added = true; } if (added) setDiaryList(readDiary()); }, [catches.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const prog = useMemo(() => progress(diaryList), [diaryList]);
  // (worked out again once you've decided, so a put-back counts towards the day's challenges)
  const reward = (id) => { if (!rewards.current.has(String(id))) return; rewards.current.delete(String(id));
    const all = readDiary(), e = all.find((d) => d.id === String(id)); if (!e) return;
    const r = afterCatch(all.filter((d) => d.id !== e.id), e, Date.now()), what = `${r.medal ? `${r.medal.name.toLowerCase()} ` : ""}${(e.name || "fish").toLowerCase()}`;
    // (one card for everything a fish earned, rather than a stack of three or four that piled up over the top of the
    // picture and each other in the 14 November recording)
    const xp = r.xp + r.challenges.length * CHALLENGE_XP;
    toast({ xp, title: `${what[0].toUpperCase()}${what.slice(1)}${r.first ? " · New kind" : r.best ? " · Your biggest" : ""}`,
      lines: [r.levelUp ? `Level ${r.level} reached` : null, ...r.challenges.map((c) => `Challenge done: ${c.name}`), ...r.badges.slice(0, 2).map((b) => `Badge: ${b.name}`)].filter(Boolean).slice(0, 3) }, "good reward"); };
  const anglers3d = useMemo(() => [{ id: "you", name: "You", spot: meRoom?.spot || (placeId === initialPlace && point) || 1, outfit: look.outfit, look: lookOnly(look), local: true, inspect: true, events, fishHint: { species: sp.id, lengthCm: length } }, ...others.map((m) => ({ id: m.id, name: m.name + (m.online ? "" : " (away)"), spot: m.spot, outfit: m.outfit, look: m.look || null, local: false, inspect: false, real: false, events: Proom.events.filter((e) => e.who === m.id), fishHint: null }))], [events, sp.id, length, look, placeId, point, meRoom?.spot, others, Proom.events]); // eslint-disable-line react-hooks/exhaustive-deps
  const facing3d = v.facing ?? (venue === "river" || venue === "lake" ? 200 : 110); // which way the 3D place faces (the sea at about east-south-east)
  const overlay = (
    <>
      <div className="fs-top">
              {fromMap ? <a className="fs-chip map-back" href={`#play/map/${placeId}`} aria-label="Back to the map" title="Back to the map"><Icon name="back" /><Icon name="explore" /></a> : null}
              <span className="fs-chip">{light === "now" ? "Now" : LIGHT.find((x) => x.value === light).label}{c?.windKph != null ? <> · <Icon name="wind" />{Math.round(c.windKph * 0.621)} mph</> : null}</span>
              <button type="button" className="fs-chip" onClick={() => setSheet(true)} aria-label={`${fishLabel} at ${place.name}: change`}>{fishLabel}</button>
              <button type="button" className="fs-chip lvl-chip" onClick={() => { setDiaryList(readDiary()); setDiaryOpen(true); }} aria-label={`Level ${prog.level}: your logbook`} title="Your logbook"><LevelBar p={prog} compact /></button>
              {others.length ? <span className="fs-chip here-chip" title={others.map((m) => m.name).join(", ")}><Icon name="users" />{others.length + 1} here</span> : null}
              <span className="grow" />
              {/* in 3D these live in the view's one menu (top right); the photo view keeps its buttons */}
              {!view3d ? <>
                <button type="button" className="fs-chip back3d" onClick={() => setView3d(true)} aria-label="Back to 3D" title="Back to the 3D view"><Icon name="compass" />Back to 3D</button>
                <button type="button" className="fs-btn" onClick={() => setInvite(true)} aria-label="Invite a friend here" title="Invite a friend here"><Icon name="users" /></button>
                <button type="button" className="fs-btn" onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} aria-pressed={sound}><Icon name={sound ? "volume" : "mute"} /></button>
                <button type="button" className="fs-btn" onClick={() => setSheet(true)} aria-label="Game settings"><Icon name="settings" /></button>
              </> : null}
            </div>
            {arrived ? <div className="arrive-label" role="status" onAnimationEnd={() => setArrived(false)}><b>{place.name.replace(/ \(.*\)$/, "")}</b><span>{place.region || "Virtual fishing"}</span></div> : null}
            <div className="fs-bottom">
              <FishTray phase={p.phase} last={last} reel={vf.reel} fight={vf.fight} live={vf.fightLive} note={vf.note} opts={vf.opts} autoplay={vf.autoplay} onCast={vf.cast} onWindIn={vf.windIn} onStrike={vf.strike} onTap={() => { vf.tap(); haptics.feel("reelTap", { load: vf.fight?.tension, species: sp.id }); }} onHold={vf.hold} onLand={vf.land} onDrag={(d) => vf.setDrag((vf.fight?.drag ?? 0.78) + d * 0.08)} onNudge={vf.nudge} onStop={vf.stop} />
            </div>
    </>
  );
  return (
    <div className={`watch-shell try-shell immersive${uiHidden ? " ui-hidden" : ""}`}>
      <div className="watch">
        <div className="watch-stage">
          {view3d ? (
            <Stage3D onWindIn={vf.windIn} fightLive={vf.fightLive} tipLight={tipLight} onReel={{ tap: () => { vf.tap(); haptics.feel("reelTap", { load: vf.fight?.tension, species: sp.id }); }, hold: vf.hold }} menu={[{ key: "diary", label: `Your logbook · level ${prog.level}`, icon: "book", onClick: () => { setDiaryList(readDiary()); setDiaryOpen(true); } }, { key: "name", label: name ? `Your name: ${name}` : "Choose your name", icon: "person", onClick: () => { setNameDraft(name || ""); setNaming(true); } }, { key: "angler", label: "Your angler", icon: "person", onClick: () => setLookOpen(true) }, { key: "sound", label: sound ? "Sound on" : "Sound off", icon: sound ? "volume" : "mute", on: sound, onClick: () => setSound(!sound) }, { key: "invite", label: "Invite a friend here", icon: "users", onClick: () => setInvite(true) }, { key: "demo", label: "Fish, place and weather", icon: "settings", onClick: () => setSheet(true) }, { key: "map", label: "Choose another place", icon: "explore", onClick: () => { location.hash = `#play/map/${placeId}`; } }, { key: "photo", label: "2D view (simpler)", icon: "layers", onClick: () => setView3d(false) }]} feel={haptics.feel} fight={vf.fight} reelOpts={vf.opts} onReelOpts={vf.setOpts} spotId={place.id} placeName={place.name.replace(/ \(.*\)$/, "")} venue={venue} anglers={anglers3d} light={lightNow} cond={c} facing={facing3d} sound={sound} now={Date.now} demo poseBus={poseBus} onPose={sendPose} toasts={toasts} onDecide={(what, ev) => { if (ev?.id) { setOutcome(String(ev.id), what); setDiaryList(readDiary()); reward(ev.id); } }} rateCatch={(ev) => { const d = ev?.data || {}, r = ev?.id ? rewards.current.get(String(ev.id)) : null; return { medal: medalFor(d.species, d.lengthCm), first: !!r?.first, best: !!r?.best }; }} onTap={() => setUiHidden((h) => !h)}>
              {overlay}
            </Stage3D>
          ) : (
            <FishingScene ref={sceneRef} feel={haptics.feel} scene={scene} events={events} status="running" now={Date.now} env={{ cond: c, light: lightNow, kind: place.kind, venue }} quality={quality} sound={sound} volume={volume} floatRig={fresh} fishHint={{ species: sp.id, lengthCm: length }} rod={rod} tipLight={tipLight} demo onTap={undefined /* (the 2D view keeps its controls: a tap on the picture hid them all, and it looked as if nothing could be done) */}>
              {overlay}
            </FishingScene>
          )}
        </div>
        {lookOpen ? <>
          <div className="sheet-scrim" onClick={() => setLookOpen(false)} />
          <aside className="watch-panel sheet open look-sheet" aria-label="Your angler">
            <div className="sheet-head">
              <div className="try-head"><h1>Your angler</h1><p className="small muted">How you look in the 3D view, and to friends in Fish Together. Saved on this phone.</p></div>
              <button type="button" className="xbtn sheet-x" onClick={() => setLookOpen(false)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <section className="watch-sec"><LookPicker value={look} onChange={setLook} /></section>
          </aside>
        </> : null}
        {naming ? <>
          <div className="sheet-scrim" onClick={() => { if (name) setNaming(false); }} />
          <aside className="watch-panel sheet open name-sheet" aria-label="Your fishing name">
            <div className="sheet-head"><div className="try-head"><h1>{name ? "Your fishing name" : "Before you start: your name"}</h1><p className="small muted">What other anglers see you as when they're fishing the same place. 2 to 20 letters or numbers. Kept on this phone; you can change it from the menu.</p></div>
              {name ? <button type="button" className="xbtn sheet-x" onClick={() => setNaming(false)} aria-label="Close"><Icon name="close" /></button> : null}</div>
            <section className="watch-sec">
              <form className="name-form" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
                <input type="text" value={nameDraft} maxLength={24} autoFocus placeholder="Your name" aria-label="Your fishing name" onChange={(e) => setNameDraft(e.target.value)} />
                <button type="submit" className="btn primary" disabled={!cleanName(nameDraft)}>{name ? "Save" : "Start fishing"}</button>
              </form>
              {nameDraft && !cleanName(nameDraft) ? <p className="tiny">2 to 20 letters, numbers, spaces, hyphens or apostrophes.</p> : null}
            </section>
          </aside>
        </> : null}
        {diaryOpen ? <Logbook list={diaryList} name={name} onClose={() => setDiaryOpen(false)} /> : null}
        <InviteHere open={invite} onClose={() => setInvite(false)} markId={place.id} placeName={place.name.replace(/ \(.*\)$/, "")} venue={venue} />
        {sheet ? <div className="sheet-scrim" onClick={() => setSheet(false)} /> : null}
        <aside className={`watch-panel sheet${sheet ? " open" : ""}`} aria-label="Game settings">
          <div className="sheet-head">
            <div className="try-head">
              <h1>Fish, place and weather</h1>
              <p className="small muted">Which fish, where, the light and the weather; the testing buttons further down skip the waiting.</p>
              <a className="btn small" href="#together"><Icon name="users" />Fish Together with friends (Beta)</a>
            </div>
            <button type="button" className="xbtn sheet-x" onClick={() => setSheet(false)} aria-label="Close settings"><Icon name="close" /></button>
          </div>

          <section className="watch-sec">
            <div className="card-h"><h2>Fish</h2><span className="aside">{randomFish ? "A different fish each cast" : `${sp.name}, ${length} cm`}</span></div>
            <div className="moments" role="group" aria-label="Which fish you catch">
              <button type="button" className={`chip${randomFish ? " on" : ""}`} aria-pressed={randomFish} onClick={() => setFishMode(true)}>Random fish</button>
              <button type="button" className={`chip${randomFish ? "" : " on"}`} aria-pressed={!randomFish} onClick={() => setFishMode(false)}>Choose a fish</button>
            </div>
            <div className="try-fish">
              {fishList.map((f) => (
                <button key={f.id} type="button" className={`try-fish-b${!randomFish && f.id === sp.id ? " on" : ""}`} onClick={() => { setFishMode(false); setSpecies(f.id); setLength(DRAW_CM[f.id] || 40); }}>
                  {hasArt(f.id) ? <img src={artUrl(f.id, "s")} alt="" loading="lazy" /> : <span className="ph"><Icon name="fish" /></span>}
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <div className="cond-row"><span>Length</span><input type="range" min="10" max="150" step="1" value={length} disabled={randomFish} onChange={(e) => setLength(Number(e.target.value))} aria-label="Length in cm" /><span className="num tiny">{length} cm</span></div>
            <p className="tiny">Sea fish are drawn from FishDock's own pictures. Freshwater fish without one yet splash and go straight to the close-up.</p>
          </section>

          <section className="watch-sec">
            <div className="card-h"><h2>Place</h2></div>
            <div className="moments">{TRY_PLACES.map((id) => { const pl = placeOf(id); return <button key={id} type="button" className={`chip${id === placeId ? " on" : ""}`} onClick={() => setPlaceId(id)}>{pl.name.replace(/ \(.*\)$/, "").replace(/,.*$/, "")}</button>; })}</div>
            <div className="sv-near">
              {photos == null ? <span className="loading-dots" aria-label="Finding photos" /> : photos.map((ph, i) => (
                <button key={ph.url} type="button" className={`sv-thumb${!own && i === pick ? " on" : ""}${ph.ok ? "" : " poor"}`} onClick={() => { setOwn(null); setPick(i); }}>
                  <img src={smallPhoto(ph.url)} alt={ph.title} loading="lazy" referrerPolicy="no-referrer" />
                  <span>{ph.title}</span>
                  <span className={`sv-fit${ph.ok ? " good" : ""}`}>{ph.ok ? (VIEWPOINTS[ph.viewKind] ? `${VIEWPOINTS[ph.viewKind]} view` : "Good match") : ph.problems?.[0] || "Poor match"}</span>
                </button>
              ))}
              {photos ? <button type="button" className={`sv-thumb${!own && pick === -1 ? " on" : ""}`} onClick={() => { setOwn(null); setPick(-1); }}><span className="try-drawn">Drawn scene</span><span>Representative</span></button> : null}
              <label className={`sv-thumb sv-own${own ? " on" : ""}`}>
                <input type="file" accept="image/*" onChange={(e) => { useOwn(e.target.files?.[0]); e.target.value = ""; }} />
                {own ? <img src={own.url} alt="Your photo" /> : <span className="try-drawn"><Icon name="camera" /></span>}
                <span>{own ? "Your photo" : "Use your own photo"}</span>
              </label>
            </div>
            <p className="tiny">Real photos taken near {place.name.replace(/ \(.*\)$/, "")}, from Wikimedia Commons (credited on the scene), checked for a view a rod could be held in: water where the line lands, the camera at the water's edge, a level horizon. Photos taken from high up aren't used. Your own photo stays on this device.</p>
          </section>

          <section className="watch-sec">
            <div className="field"><span className="lbl">Light</span><Seg value={light} onChange={setLight} options={LIGHT} /></div>
            <div className="field"><span className="lbl">Weather</span><Seg value={wx} onChange={setWx} options={WEATHER} />{wx === "live" && !cond ? <span className="tiny">Live weather isn't available just now; showing a breeze.</span> : null}</div>
            <div className="field"><span className="lbl">Fishing from</span><Seg value={from} onChange={setFrom} options={FROM} /></div>
            <div className="field"><span className="lbl">Rod</span><Seg value={rod} onChange={setRod} options={RODS} /></div>
            <div className="field"><span className="lbl">Tip light</span><Seg value={tipLight} onChange={setTipLight} options={TIPS} /></div>
            <div className="field"><span className="lbl">Sound</span><div className="vol-row"><button type="button" className="btn small" onClick={() => setSound(!sound)} aria-pressed={sound}><Icon name={sound ? "volume" : "mute"} />{sound ? "On" : "Off"}</button><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => { setVolume(Number(e.target.value)); if (!sound) setSound(true); }} aria-label="Volume" /><span className="num tiny">{Math.round(volume * 100)}%</span></div></div>
            <div className="field"><span className="lbl">Animation quality</span><Seg value={quality} onChange={setQuality} options={QUALITY_OPTIONS} /></div>
          </section>

          <section className="watch-sec">
            <div className="card-h"><h2>Haptic feedback</h2></div>
            <HapticSettings compact />
          </section>

          <section className="watch-sec test-panel">
            <div className="card-h"><h2>Testing</h2><span className="aside">Skips the waiting</span></div>
            <div className="moments">
              <button type="button" className="chip" onClick={() => { setSheet(false); vf.playAll(); }}><Icon name="play" />Play it all</button>
              <button type="button" className="chip" disabled={!(p.phase === "waiting" || p.phase === "missed") || last === "catch" || last === "lost"} onClick={() => { setSheet(false); vf.biteNow(); }}>Bite now</button>
              <button type="button" className="chip" disabled={p.phase !== "bite"} onClick={() => { setSheet(false); vf.miss(); }}>Miss the bite</button>
              <button type="button" className="chip" disabled={p.phase !== "hooked"} onClick={() => { setSheet(false); vf.landNow(); }}>Land it now</button>
              <button type="button" className="chip" disabled={p.phase !== "hooked"} onClick={() => { setSheet(false); vf.lose(); }}>Lose the fish</button>
              <button type="button" className="chip" disabled={!events.length} onClick={() => { setSheet(false); vf.reset(); }}>Reset</button>
            </div>
            <p className="tiny">Only steps that make sense now are offered: there's no landing a fish before a bite.</p>
            <label className="check"><input type="checkbox" checked={panoPreview} onChange={(e) => { const on = e.target.checked; setPanoPreview(on); try { if (on) localStorage.setItem("fishdock.panoPreview", "1"); else localStorage.removeItem("fishdock.panoPreview"); } catch { /* no storage */ } }} /><span>Preview real 360° photos in 3D on this phone (not public yet; reopen the 3D view to see it)</span></label>
          </section>

          {catches.length ? (
            <section className="watch-sec">
              <div className="card-h"><h2>Your catches this visit</h2><span className="aside">{catches.length}</span></div>
              <div className="catch-strip">{catches.slice().reverse().map((e) => (
                <button key={e.id} type="button" className="catch-tile" onClick={() => { setSheet(false); sceneRef.current?.replayCatch(e); }}>
                  {hasArt(e.data.species) ? <img src={artUrl(e.data.species, "s")} alt="" className="art" /> : <span className="ct-ph"><Icon name="fish" /></span>}
                  <span className="t">{e.data.name}</span><span className="s">{e.data.lengthCm} cm</span>
                </button>
              ))}</div>
            </section>
          ) : null}

          <section className="watch-sec">
            <div className="card-h"><h2>Places to fish</h2></div>
            <div className="list">
              {TRY_PLACES.map((id) => { const u = `${base}/${id}`; return (
                <div key={id} className="li"><span className="grow"><span className="t">{placeOf(id).name}</span><span className="s">{u.replace(/^https?:\/\//, "")}</span></span>
                  <a className="xbtn" href={`#play/${id}`} onClick={() => setPlaceId(id)} aria-label={`Open ${placeOf(id).name}`}><Icon name="chevron" /></a>
                  <button type="button" className="xbtn" onClick={() => copy(u)} aria-label={`Copy the link for ${placeOf(id).name}`}><Icon name={copied === u ? "check" : "copy"} /></button></div>
              ); })}
            </div>
          </section>
          <p className="tiny watch-foot">FishDock virtual fishing. Real sessions are shared on private links from the fishing screen. <a href="/">Open FishDock</a>{typeof __BUILD_ID__ !== "undefined" ? <><br />Version {__BUILD_ID__}</> : null}</p>
        </aside>
      </div>
    </div>
  );
}
