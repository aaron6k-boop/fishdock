// ---- TryLive: a labelled demo of the Live Fishing View (#try, #try/<place>, #try/<place>/<species>) ----
// For trying places, fish, light and weather without a real session. Everything on the page says Demo: nothing
// here is a real session, nothing is saved or shared. Backdrops are real free-licensed photos taken near each place
// (Wikimedia Commons, credited) or the drawn scene; "Live weather" is the real forecast for that place.
/* global __BUILD_ID__ */
import { useEffect, useMemo, useRef, useState } from "react";
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
import { landedCatches } from "../lib/landed.js";
import { conditionsAt } from "../lib/bitescore.js";
import { getConditions } from "../lib/api.js";
import { spotById } from "../data/spots.js";
import { SPECIES, speciesById } from "../data/species.js";
import { hasArt, artUrl } from "../data/fishart.js";
import ASTRO from "../lib/astro.js";
import { timeFor } from "../lib/timeOfDay.js";
import { Icon, Seg } from "../components/ui.jsx";

const GORLESTON = { id: "gorleston-south-pier", name: "Gorleston South Pier", region: "Norfolk, East of England", kind: "sea", type: "pier", lat: 52.5733, lon: 1.7375 };
export const TRY_PLACES = ["gorleston-south-pier", "cromer-pier", "chesil-beach-ferry-bridge", "whitby-piers", "brixham-breakwater", "st-ives-the-island", "holyhead-breakwater", "loch-ryan-leffnol", "river-wye-ross", "royalty-fishery-avon", "rutland-water", "lough-erne-enniskillen"];
const placeOf = (id) => (id === GORLESTON.id ? GORLESTON : spotById(id)) || GORLESTON;
const LIGHT = [{ value: "now", label: "Now" }, { value: "morning", label: "Morning" }, { value: "midday", label: "Midday" }, { value: "dusk", label: "Dusk" }, { value: "night", label: "Night" }];
const RODS = [{ value: "auto", label: "For the place" }, ...Object.values(ROD_STYLES).map((r) => ({ value: r.id, label: r.name }))];
const TIPS = [{ value: "auto", label: "At night" }, { value: "on", label: "On" }, { value: "off", label: "Off" }];
const FROM = [{ value: "auto", label: "The place's own" }, { value: "beach", label: "Beach" }, { value: "pier", label: "Pier" }, { value: "estuary", label: "Estuary" }, { value: "river", label: "River bank" }, { value: "lake", label: "Lake" }];
const WEATHER = [{ value: "live", label: "Live weather" }, { value: "calm", label: "Calm" }, { value: "breezy", label: "Breezy" }, { value: "windy", label: "Windy" }, { value: "overcast", label: "Overcast" }, { value: "drizzle", label: "Light rain" }, { value: "rain", label: "Heavy rain" }];
const DEMO_WX = { calm: { windKph: 5, cloudPct: 15, precipMm: 0 }, breezy: { windKph: 20, cloudPct: 45, precipMm: 0 }, windy: { windKph: 42, cloudPct: 70, precipMm: 0 }, overcast: { windKph: 14, cloudPct: 100, precipMm: 0 }, drizzle: { windKph: 16, cloudPct: 95, precipMm: 0.4 }, rain: { windKph: 30, cloudPct: 100, precipMm: 4 } };

/** A time today that gives the chosen light at this place, found from the real sun. */

export default function TryLive({ initialPlace, initialSpecies }) {
  const [placeId, setPlaceId] = useState(TRY_PLACES.includes(initialPlace) ? initialPlace : GORLESTON.id);
  const place = placeOf(placeId);
  const fresh = place.kind !== "sea";
  const fishList = useMemo(() => SPECIES.filter((s) => (fresh ? s.type !== "sea" : s.type !== "fresh")).sort((a, b) => (hasArt(b.id) ? 1 : 0) - (hasArt(a.id) ? 1 : 0)), [fresh]);
  const [species, setSpecies] = useState(speciesById(initialSpecies) ? initialSpecies : fresh ? "perch" : "cod");
  const sp = speciesById(species) || fishList[0];
  const [length, setLength] = useState(DRAW_CM[species] || 45);
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
  const [sound, setSound] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [own, setOwn] = useState(null); // the visitor's own photo for this demo: kept in this page only, never sent anywhere
  const [copied, setCopied] = useState("");
  const [uiHidden, setUiHidden] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [view3d, setView3d] = useState(() => /\/3d$/.test(location.hash)); // the 360° 3D view (Beta)
  const sceneRef = useRef(null);
  const vfReset = useRef(null); // a new place starts afresh

  useEffect(() => { // address bar follows the choice, so the page can be shared or bookmarked
    const h = `#try/${placeId}/${species}${view3d ? "/3d" : ""}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }, [placeId, species, view3d]);
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
  const c = wx === "live" ? (live ? { windKph: live.windKph, windDir: live.windDir, cloudPct: live.cloudPct, precipMm: live.precipMm, waveM: live.waveM } : DEMO_WX.breezy) : DEMO_WX[wx];
  const sun = ASTRO.sunPos(t, place.lat, place.lon), moon = ASTRO.moonPos(t, place.lat, place.lon);
  const lightNow = { sunAlt: sun.alt, sunAz: sun.az, moonAlt: moon.alt, moonAz: moon.az, moonIllum: ASTRO.moonIllum(t).fraction };
  // at dusk the demo faces the sunset, so the glitter path shows
  const v = { ...view, facing: light === "dusk" ? Math.round(sun.az) : light === "night" && moon.alt > 0 ? Math.round(moon.az) : null };
  const scene = own ? { kind: "own", src: own.url, view: v, label: "Your photo (it stays on this device)" } : photo ? { kind: "commons", src: photo.url, view: v, commons: photo } : { kind: "representative", src: null, view: { ...defaultView(), facing: v.facing } };
  // virtual fishing: cast, a fish bites by itself, strike, hold to reel; every catch is simulated
  const vf = useVirtualFishing({ species: sp.id, name: sp.name, lengthCm: length });
  vfReset.current = vf.reset;
  const events = vf.events;
  const [, setTick] = useState(0);
  useEffect(() => { if (!events.length) return undefined; const id = setInterval(() => setTick((n) => n + 1), 400); return () => clearInterval(id); }, [events.length]);
  const p = phaseAt(events, Date.now());
  const last = events.at(-1)?.type;
  const base = `${location.origin}/#try`;
  const copy = async (u) => { try { await navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(""), 1800); } catch { /* ignore */ } };

  const venue = from === "auto" ? venueOf(place) : from;
  const catches = landedCatches(events, Date.now(), venue); // only once each is out of the water
  const anglers3d = useMemo(() => [{ id: "you", name: "You", spot: 1, outfit: 0, local: true, events, fishHint: { species: sp.id, lengthCm: length } }], [events, sp.id, length]);
  const facing3d = v.facing ?? (venue === "river" || venue === "lake" ? 200 : 110); // which way the 3D place faces (the sea at about east-south-east)
  const overlay = (
    <>
      <div className="fs-top">
              <span className="live-badge s-replay">Demo</span>
              <span className="fs-chip">{light === "now" ? "Now" : LIGHT.find((x) => x.value === light).label}</span>
              {c?.windKph != null ? <span className="fs-chip"><Icon name="wind" />{Math.round(c.windKph * 0.621)} mph</span> : null}
              <button type="button" className="fs-chip" onClick={() => setSheet(true)} aria-label={`${sp.name}, ${length} cm at ${place.name}: change`}>{sp.name}, {length} cm</button>
              <span className="grow" />
              <button type="button" className={`fs-btn${view3d ? " on" : ""}`} onClick={() => setView3d(!view3d)} aria-pressed={view3d} aria-label={view3d ? "Back to the photo view" : "Look around in 3D (Beta)"} title="360° look-around (Beta)"><Icon name="compass" /></button>
              <button type="button" className="fs-btn" onClick={() => setSound(!sound)} aria-label={sound ? "Sound off" : "Sound on"} aria-pressed={sound}><Icon name={sound ? "volume" : "mute"} /></button>
              <button type="button" className="fs-btn" onClick={() => setSheet(true)} aria-label="Demo settings"><Icon name="settings" /></button>
            </div>
            <div className="fs-bottom">
              <FishTray phase={p.phase} last={last} reel={vf.reel} autoplay={vf.autoplay} onCast={vf.cast} onStrike={vf.strike} onHold={vf.hold} onNudge={vf.nudge} onStop={vf.stop} />
            </div>
    </>
  );
  return (
    <div className={`watch-shell try-shell immersive${uiHidden ? " ui-hidden" : ""}`}>
      <div className="watch">
        <div className="watch-stage">
          {view3d ? (
            <Stage3D venue={venue} anglers={anglers3d} light={lightNow} cond={c} facing={facing3d} sound={sound} now={Date.now} demo onTap={() => setUiHidden((h) => !h)}>
              {overlay}
            </Stage3D>
          ) : (
            <FishingScene ref={sceneRef} scene={scene} events={events} status="running" now={Date.now} env={{ cond: c, light: lightNow, kind: place.kind, venue }} quality={quality} sound={sound} volume={volume} floatRig={fresh} fishHint={{ species: sp.id, lengthCm: length }} rod={rod} tipLight={tipLight} demo onTap={() => setUiHidden((h) => !h)}>
              {overlay}
            </FishingScene>
          )}
        </div>
        {sheet ? <div className="sheet-scrim" onClick={() => setSheet(false)} /> : null}
        <aside className={`watch-panel sheet${sheet ? " open" : ""}`} aria-label="Demo settings">
          <div className="sheet-head">
            <div className="try-head">
              <h1>Try the Live Fishing View</h1>
              <p className="small muted">A demo: nothing here is a real session or a real catch, and nothing is saved or shared.</p>
              <a className="btn small" href="#together"><Icon name="users" />Fish Together with friends (Beta)</a>
            </div>
            <button type="button" className="xbtn sheet-x" onClick={() => setSheet(false)} aria-label="Close settings"><Icon name="close" /></button>
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
          </section>

          {catches.length ? (
            <section className="watch-sec">
              <div className="card-h"><h2>Demo catches</h2><span className="aside">{catches.length}</span></div>
              <div className="catch-strip">{catches.slice().reverse().map((e) => (
                <button key={e.id} type="button" className="catch-tile" onClick={() => { setSheet(false); sceneRef.current?.replayCatch(e); }}>
                  {hasArt(e.data.species) ? <img src={artUrl(e.data.species, "s")} alt="" className="art" /> : <span className="ct-ph"><Icon name="fish" /></span>}
                  <span className="t">{e.data.name}</span><span className="s">{e.data.lengthCm} cm · demo</span>
                </button>
              ))}</div>
            </section>
          ) : null}

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
          <p className="tiny watch-foot">Demo of FishDock's Live Fishing View. Real sessions are shared on private links from the fishing screen. <a href="/">Open FishDock</a>{typeof __BUILD_ID__ !== "undefined" ? <><br />Version {__BUILD_ID__}</> : null}</p>
        </aside>
      </div>
    </div>
  );
}
