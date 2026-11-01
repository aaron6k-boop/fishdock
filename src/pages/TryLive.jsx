// ---- TryLive: a labelled demo of the Live Fishing View (#try, #try/<place>, #try/<place>/<species>) ----
// For trying places, fish, light and weather without a real session. Everything on the page says Demo: nothing
// here is a real session, nothing is saved or shared. Backdrops are real free-licensed photos taken near each place
// (Wikimedia Commons, credited) or the drawn scene; "Live weather" is the real forecast for that place.
import { useEffect, useMemo, useRef, useState } from "react";
import FishingScene, { QUALITY_OPTIONS } from "../components/FishingScene.jsx";
import { composeFrame } from "../lib/sceneGL.js";
import { defaultView, nearbyPhotos, detectHorizon, smallPhoto, rankWaterViews } from "../lib/scene.js";
import { DRAW_CM, activityText, phaseAt } from "../lib/liveEvents.js";
import { conditionsAt } from "../lib/bitescore.js";
import { getConditions } from "../lib/api.js";
import { spotById } from "../data/spots.js";
import { SPECIES, speciesById } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";
import ASTRO from "../lib/astro.js";
import { Icon, Seg } from "../components/ui.jsx";

const GORLESTON = { id: "gorleston-south-pier", name: "Gorleston South Pier", region: "Norfolk, East of England", kind: "sea", lat: 52.5733, lon: 1.7375 };
export const TRY_PLACES = ["gorleston-south-pier", "cromer-pier", "chesil-beach-ferry-bridge", "whitby-piers", "brixham-breakwater", "st-ives-the-island", "holyhead-breakwater", "loch-ryan-leffnol", "river-wye-ross", "royalty-fishery-avon", "rutland-water", "lough-erne-enniskillen"];
const placeOf = (id) => (id === GORLESTON.id ? GORLESTON : spotById(id)) || GORLESTON;
const LIGHT = [{ value: "now", label: "Now" }, { value: "morning", label: "Morning" }, { value: "midday", label: "Midday" }, { value: "dusk", label: "Dusk" }, { value: "night", label: "Night" }];
const WEATHER = [{ value: "live", label: "Live weather" }, { value: "calm", label: "Calm" }, { value: "breezy", label: "Breezy" }, { value: "windy", label: "Windy" }, { value: "rain", label: "Rain" }];
const DEMO_WX = { calm: { windKph: 5, cloudPct: 15, precipMm: 0 }, breezy: { windKph: 20, cloudPct: 45, precipMm: 0 }, windy: { windKph: 42, cloudPct: 70, precipMm: 0 }, rain: { windKph: 24, cloudPct: 100, precipMm: 1.5 } };
let seq = 0;
const ev = (type, data = null) => ({ id: `demo_${++seq}`, seq, t: Date.now(), type, data });

/** A time today that gives the chosen light at this place, found from the real sun. */
function timeFor(choice, place) {
  if (choice === "now") return Date.now();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  let best = Date.now(), score = Infinity;
  for (let m = 0; m < 24 * 60; m += 10) {
    const t = day.getTime() + m * 60e3, a = ASTRO.sunPos(t, place.lat, place.lon).alt, pm = m >= 12 * 60;
    const s = choice === "midday" ? -a : choice === "morning" ? (pm ? Infinity : Math.abs(a - 8)) : choice === "dusk" ? (pm ? Math.abs(a + 1) : Infinity) : (pm ? Math.abs(a + 18) : Infinity);
    if (s < score) { score = s; best = t; }
  }
  return best;
}

export default function TryLive({ initialPlace, initialSpecies }) {
  const [placeId, setPlaceId] = useState(TRY_PLACES.includes(initialPlace) ? initialPlace : GORLESTON.id);
  const place = placeOf(placeId);
  const fresh = place.kind !== "sea";
  const fishList = useMemo(() => SPECIES.filter((s) => (fresh ? s.type !== "sea" : s.type !== "fresh")).sort((a, b) => (hasArt(b.id) ? 1 : 0) - (hasArt(a.id) ? 1 : 0)), [fresh]);
  const [species, setSpecies] = useState(speciesById(initialSpecies) ? initialSpecies : fresh ? "perch" : "cod");
  const sp = speciesById(species) || fishList[0];
  const [length, setLength] = useState(DRAW_CM[species] || 45);
  const [events, setEvents] = useState([]);
  const [photos, setPhotos] = useState(null);
  const [pick, setPick] = useState(0);
  const [view, setView] = useState(defaultView());
  const [light, setLight] = useState("now");
  const [wx, setWx] = useState("live");
  const [cond, setCond] = useState(null);
  const [quality, setQuality] = useState("auto");
  const [sound, setSound] = useState(false);
  const [copied, setCopied] = useState("");
  const timers = useRef([]);
  const sceneRef = useRef(null);
  const clearAuto = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => { // address bar follows the choice, so the page can be shared or bookmarked
    const h = `#try/${placeId}/${species}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }, [placeId, species]);
  useEffect(() => { clearAuto(); setEvents([]); setPhotos(null); setPick(0); setView(defaultView()); setCond(null);
    // the clearest open-water view first; if none looks like open water, the drawn scene
    nearbyPhotos(place).then((r) => rankWaterViews(r.photos || [])).then((list) => { setPhotos(list); setPick(list[0]?.water >= 0.62 ? 0 : -1); });
    getConditions(place.lat, place.lon).then((c) => setCond(c?.hourly?.length ? c : null));
    if (!fishList.some((f) => f.id === species)) { const f = fresh ? "perch" : "cod"; setSpecies(f); setLength(DRAW_CM[f] || 40); }
    return clearAuto;
  }, [placeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const photo = photos && pick >= 0 ? photos[pick] : null;
  useEffect(() => { // line the horizon up with the photo
    if (!photo) { setView(defaultView()); return; }
    const i = new Image(); i.crossOrigin = "anonymous"; i.referrerPolicy = "no-referrer";
    i.onload = () => { const h = detectHorizon(composeFrame(i, defaultView(), 600)); setView(defaultView(h || 0.42)); };
    i.src = photo.url;
  }, [photo?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = timeFor(light, place);
  const live = conditionsAt(cond, t);
  const c = wx === "live" ? (live ? { windKph: live.windKph, windDir: live.windDir, cloudPct: live.cloudPct, precipMm: live.precipMm, waveM: live.waveM } : DEMO_WX.breezy) : DEMO_WX[wx];
  const sun = ASTRO.sunPos(t, place.lat, place.lon), moon = ASTRO.moonPos(t, place.lat, place.lon);
  const lightNow = { sunAlt: sun.alt, sunAz: sun.az, moonAlt: moon.alt, moonAz: moon.az, moonIllum: ASTRO.moonIllum(t).fraction };
  // at dusk the demo faces the sunset, so the glitter path shows
  const v = { ...view, facing: light === "dusk" ? Math.round(sun.az) : light === "night" && moon.alt > 0 ? Math.round(moon.az) : null };
  const scene = photo ? { kind: "commons", src: photo.url, view: v, commons: photo } : { kind: "representative", src: null, view: { ...defaultView(), facing: v.facing } };
  const p = phaseAt(events, Date.now());
  const add = (type, data) => setEvents((e) => [...e, ev(type, data)]);
  const land = () => add("catch", { species: sp.id, name: sp.name, lengthCm: length, released: true });
  function playAll() {
    clearAuto();
    setEvents([]);
    const steps = [[300, () => add("cast")], [5200, () => add("bite")], [8200, () => add("hooked")], [17000, land]];
    timers.current = steps.map(([ms, f]) => setTimeout(f, ms));
  }
  const base = `${location.origin}/#try`;
  const copy = async (u) => { try { await navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(""), 1800); } catch { /* ignore */ } };

  return (
    <div className="watch-shell try-shell">
      <div className="watch">
        <div className="watch-stage">
          <FishingScene ref={sceneRef} scene={scene} events={events} status="running" now={Date.now} env={{ cond: c, light: lightNow, kind: place.kind }} quality={quality} sound={sound} floatRig={fresh}>
            <div className="fs-top">
              <span className="live-badge s-replay">Demo</span>
              <span className="fs-chip">{light === "now" ? "Now" : LIGHT.find((x) => x.value === light).label}</span>
              {c?.windKph != null ? <span className="fs-chip"><Icon name="wind" />{Math.round(c.windKph * 0.621)} mph</span> : null}
            </div>
            <div className="fs-who"><b>{place.name}</b><span> · {sp.name}</span></div>
          </FishingScene>
        </div>
        <div className="watch-panel">
          <div className="try-head">
            <h1>Try the Live Fishing View</h1>
            <p className="small muted">A demo: nothing here is a real session, and nothing is saved or shared. Pick a place and a fish, then play it.</p>
          </div>
          <div className="watch-activity" aria-live="polite">{activityText(p, { who: "", target: sp.name })}</div>
          <div className="ctl-grid">
            <button type="button" className="ctl cast" onClick={() => add("cast")}><Icon name="target" /><span>Cast</span></button>
            <button type="button" className="ctl bite" onClick={() => add("bite")}><Icon name="bell" /><span>Bite</span></button>
            <button type="button" className="ctl hook" onClick={() => add("hooked")}><Icon name="hook" /><span>Fish on</span></button>
            <button type="button" className="ctl catch" onClick={land}><Icon name="fish" /><span>Land it</span></button>
          </div>
          <div className="row">
            <button type="button" className="btn primary" onClick={playAll}><Icon name="play" />Play it all</button>
            <button type="button" className="btn small" onClick={() => add("lost")}>Lose it</button>
            <button type="button" className="btn small" onClick={() => add("missed")}>Miss a bite</button>
            <button type="button" className="btn ghost small" onClick={() => { clearAuto(); setEvents([]); }}>Reset</button>
          </div>

          <section className="watch-sec">
            <div className="card-h"><h2>Fish</h2><span className="aside">{sp.name}, {length} cm</span></div>
            <div className="try-fish">
              {fishList.map((f) => (
                <button key={f.id} type="button" className={`try-fish-b${f.id === sp.id ? " on" : ""}`} onClick={() => { setSpecies(f.id); setLength(DRAW_CM[f.id] || 40); }}>
                  {hasArt(f.id) ? <img src={artUrl(f.id, "s")} alt="" loading="lazy" /> : <span className="ph"><Icon name="fish" /></span>}
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <div className="cond-row"><span>Length</span><input type="range" min="10" max="150" step="1" value={length} onChange={(e) => setLength(Number(e.target.value))} aria-label="Demo length in cm" /><span className="num tiny">{length} cm</span></div>
            <p className="tiny">Sea fish lift out of the water in FishDock's own pictures. Freshwater fish without a cut-out picture yet splash and go straight to the close-up.</p>
          </section>

          <section className="watch-sec">
            <div className="card-h"><h2>Place</h2></div>
            <div className="moments">{TRY_PLACES.map((id) => { const pl = placeOf(id); return <button key={id} type="button" className={`chip${id === placeId ? " on" : ""}`} onClick={() => setPlaceId(id)}>{pl.name.replace(/ \(.*\)$/, "").replace(/,.*$/, "")}</button>; })}</div>
            <div className="sv-near">
              {photos == null ? <span className="loading-dots" aria-label="Finding photos" /> : photos.map((ph, i) => (
                <button key={ph.url} type="button" className={`sv-thumb${i === pick ? " on" : ""}`} onClick={() => setPick(i)}>
                  <img src={smallPhoto(ph.url)} alt={ph.title} loading="lazy" referrerPolicy="no-referrer" /><span>{ph.title}</span>
                </button>
              ))}
              {photos ? <button type="button" className={`sv-thumb${pick === -1 ? " on" : ""}`} onClick={() => setPick(-1)}><span className="try-drawn">Drawn scene</span><span>Representative</span></button> : null}
            </div>
            <p className="tiny">Real photos taken near {place.name.replace(/ \(.*\)$/, "")}, from Wikimedia Commons (credited on the scene). In a real session your own photo of where your rod points works best.</p>
          </section>

          <section className="watch-sec">
            <div className="field"><span className="lbl">Light</span><Seg value={light} onChange={setLight} options={LIGHT} /></div>
            <div className="field"><span className="lbl">Weather</span><Seg value={wx} onChange={setWx} options={WEATHER} />{wx === "live" && !cond ? <span className="tiny">Live weather isn't available just now; showing a breeze.</span> : null}</div>
            <div className="field"><span className="lbl">Animation quality</span><Seg value={quality} onChange={setQuality} options={QUALITY_OPTIONS} /></div>
            <button type="button" className={`btn small${sound ? " primary" : ""}`} onClick={() => setSound(!sound)}><Icon name={sound ? "bell" : "mic"} />{sound ? "Sound on" : "Sound off"}</button>
          </section>

          <section className="watch-sec">
            <div className="card-h"><h2>Links to try</h2></div>
            <div className="list">
              {TRY_PLACES.map((id) => { const u = `${base}/${id}`; return (
                <div key={id} className="li"><span className="grow"><span className="t">{placeOf(id).name}</span><span className="s">{u.replace(/^https?:\/\//, "")}</span></span>
                  <a className="xbtn" href={`#try/${id}`} onClick={() => setPlaceId(id)} aria-label={`Open ${placeOf(id).name}`}><Icon name="chevron" /></a>
                  <button type="button" className="xbtn" onClick={() => copy(u)} aria-label={`Copy the link for ${placeOf(id).name}`}><Icon name={copied === u ? "check" : "copy"} /></button></div>
              ); })}
            </div>
          </section>
          <p className="tiny watch-foot">Demo of FishDock's Live Fishing View. Real sessions are shared on private links from the fishing screen. <a href="/">Open FishDock</a></p>
        </div>
      </div>
    </div>
  );
}
