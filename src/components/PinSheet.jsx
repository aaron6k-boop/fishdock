// ---- PinSheet: tap or pin any spot to see what you're likely to catch there, when, and the best times and tides ----
// Opened from a tap on the Explore map (at, no map of its own), from "Pin a spot" (with a map), or for a saved pin.
// The water type comes from OpenStreetMap (server/water.js) and can always be changed. Pins stay on this phone.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { SPOTS } from "../data/spots.js";
import { WATERS, waterById, parseCoords, inUk, makePin, savePin, removePin, placeFromPin, nearestSpot, defaultPinName } from "../lib/pins.js";
import { catchHere, LEVELS, autoTarget } from "../lib/catchhere.js";
import { biteDay, band, biteProfile } from "../lib/bitescore.js";
import { tideModel } from "../lib/tides.js";
import { getWater, getConditions, getTides } from "../lib/api.js";
import { ukDayStart, ukMonth, fmtTime, fmtShortDay, monthsText } from "../lib/time.js";
import { fmtKm, mapsLink, nationAt } from "../lib/geo.js";
import MapView from "./MapView.jsx";
import SpeciesSheet from "./SpeciesSheet.jsx";
import { FishArt } from "./art.jsx";
import { Sheet, Icon, Notice } from "./ui.jsx";

const TIDE_WORDS = { flood: "the flood (rising tide)", ebb: "the ebb (falling tide)", moving: "a moving tide, either way", high: "around high water", low: "around low water" };
const KIND_TITLE = { sea: "The sea", river: "River", lake: "Lake", canal: "Canal", fishery: "Fishery" };

export default function PinSheet({ at = null, pin = null, withMap = true, onClose, onDone }) {
  const { place: current, settings, update, say, go, preview } = useApp();
  const start = pin || at;
  const [pos, setPos] = useState(start ? { lat: start.lat, lon: start.lon } : null);
  const [focus, setFocus] = useState(start ? { lat: start.lat, lon: start.lon, zoom: 14, key: 1 } : null);
  const [water, setWater] = useState(pin?.subtype && waterById(pin.subtype) ? pin.subtype : null);
  const [found, setFound] = useState(null);       // the server's answer for pos: { kind, subtype, name, sure } or { error }
  const [checking, setChecking] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [name, setName] = useState(pin?.name || "");
  const [keep, setKeep] = useState(true);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [mapOk, setMapOk] = useState(withMap && !preview);
  const [base, setBase] = useState("map");
  const [live, setLive] = useState({ cond: null, tides: null });
  const [targetId, setTargetId] = useState(null);
  const [species, setSpecies] = useState(null);
  const others = useMemo(() => (settings.pins || []).filter((p) => p.id !== pin?.id), [settings.pins, pin?.id]);
  const near = useMemo(() => (pos ? nearestSpot(pos.lat, pos.lon) : null), [pos]);
  const outside = pos && !inUk(pos.lat, pos.lon);
  const w = waterById(water);

  // ---- what water is here (skipped for a saved pin that hasn't moved) ----
  useEffect(() => {
    if (!pos) return;
    if (pin && pos.lat === pin.lat && pos.lon === pin.lon) return;
    let gone = false;
    setChecking(true); setFound(null);
    getWater(pos.lat, pos.lon).then((r) => {
      if (gone) return;
      setChecking(false);
      if (r?.kind && waterById(r.subtype)) { setFound(r); setWater(r.subtype); setShowTypes(false); }
      else { setFound({ error: r?.preview ? "preview" : r?.error || "none", message: r?.message }); setWater(null); setShowTypes(true); }
    });
    return () => { gone = true; };
  }, [pos?.lat, pos?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- live weather and tides for the area (the same cached calls Home makes) ----
  useEffect(() => {
    if (!pos || !w) return;
    let gone = false;
    Promise.all([getConditions(pos.lat, pos.lon), w.kind === "sea" ? getTides(pos.lat, pos.lon) : Promise.resolve(null)])
      .then(([cond, tides]) => { if (!gone) setLive({ cond, tides }); });
    return () => { gone = true; };
  }, [pos?.lat, pos?.lon, w?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = name.trim() || pin?.name || found?.name || (pos ? defaultPinName(pos.lat, pos.lon) : "Pinned spot");
  const spot = useMemo(() => (pos && w ? { id: "pin", name: label, lat: pos.lat, lon: pos.lon, kind: w.kind, subtype: w.id, nation: nationAt(pos.lat, pos.lon), verified: false } : null), [pos, w, label]);
  const now = Date.now();
  const dayStart = ukDayStart(now);
  const month = ukMonth(now);
  const here = useMemo(() => (spot ? catchHere(spot, month) : []), [spot, month]);
  const inSeason = here.filter((r) => r.inSeason !== "out");
  const target = (targetId && here.find((r) => r.species.id === targetId)?.species) || (spot ? autoTarget(spot, month) : null);
  const tide = useMemo(() => (spot?.kind === "sea" ? tideModel(spot, live.tides) : null), [spot, live.tides]);
  const cond = live.cond?.hourly?.length ? live.cond : null;
  const day = useMemo(() => (spot && target ? biteDay({ place: spot, species: target, dayStart, tide, cond, river: null, now }) : null), [spot, target, dayStart, tide, cond]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = useMemo(() => (spot && target ? Array.from({ length: 7 }, (_, i) => {
    const ds = dayStart + i * 864e5;
    const d = biteDay({ place: spot, species: target, dayStart: ds, tide, cond, river: null, now });
    // today counts only what's still to come
    const slots = i === 0 ? d.slots.filter((s) => s.t + 900e3 > now) : d.slots;
    const best = (i === 0 ? d.windows.filter((x) => x.end > now) : d.windows).sort((a, b) => b.peak - a.peak)[0] || null;
    return { ds, today: i === 0, peak: slots.length ? Math.max(...slots.map((s) => s.score)) : 0, best };
  }) : []), [spot, target, dayStart, tide, cond]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestDay = week.reduce((a, b) => (!a || b.peak > a.peak ? b : a), null);
  const tidesToday = tide ? tide.events.filter((e) => e.t >= now - 1800e3 && e.t < dayStart + 864e5 + 6 * 3600e3).slice(0, 4) : [];
  const peakSlot = day?.windows[0] ? day.slots.filter((s) => s.t >= day.windows[0].start && s.t <= day.windows[0].end).sort((a, b) => b.score - a.score)[0] : null;
  const tidePref = target ? biteProfile(target).tide : null;
  const docTide = near && near.d < 3 && near.spot.kind === "sea" && near.spot.tidePref ? near.spot.tidePref : null;

  function moveTo(p) { setPos(p); setFocus({ ...p, zoom: 15, key: Date.now() }); }
  function readText(e) {
    e.preventDefault();
    const p = parseCoords(text);
    if (!p) { setMsg("Couldn't read that. Try 52.5730, 1.7390 or paste a Google Maps link."); return; }
    setMsg(""); moveTo(p); setText("");
  }
  function locate() {
    setMsg("Finding you…");
    if (!("geolocation" in navigator)) { setMsg("This browser can't share its location."); return; }
    navigator.geolocation.getCurrentPosition(
      (g) => { setMsg(""); moveTo({ lat: +g.coords.latitude.toFixed(5), lon: +g.coords.longitude.toFixed(5) }); },
      (e) => setMsg(e.code === 1 ? "Location is blocked. Allow it in your browser settings, or tap the map." : "Couldn't get a location fix. Tap the map instead."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  const record = () => makePin({ ...pos, water, name: label, id: pin?.id, createdAt: pin?.createdAt });
  function forecast() {
    const p = record(); if (!p) return;
    update((s) => ({ placeId: "custom", custom: placeFromPin(p), ...(keep || pin ? { pins: savePin(s.pins, p) } : {}) }));
    say(`Forecast for ${p.name}${keep || pin ? ". Pin saved on this phone" : ""}`);
    onDone?.(); onClose(); go("home");
  }
  function savePinOnly() {
    const p = record(); if (!p) return;
    update((s) => ({ pins: savePin(s.pins, p) }));
    say(pin ? "Pin updated" : "Pin saved on this phone");
    onDone?.(); onClose();
  }
  function del() {
    update((s) => ({ pins: removePin(s.pins, pin.id) }));
    say("Pin deleted");
    onDone?.(); onClose();
  }

  const title = pin ? pin.name : found?.name || (w ? KIND_TITLE[w.kind] : pos ? "Dropped pin" : "Pin a spot");
  const aside = pos ? `${near ? `${fmtKm(near.d)} from ${near.spot.name}` : `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`}` : "Your pins stay on this phone";
  return (
    <Sheet title={title} aside={aside} onClose={onClose}>
      {mapOk ? (
        <>
          <MapView spots={SPOTS} pins={others} dropped={pos} center={current} zoom={pos ? 14 : 11} focus={focus} base={base} short
            onTap={setPos} onDrag={setPos} onFail={() => setMapOk(false)} hint={pos ? "Drag the pin or tap to move it" : "Tap the water you want to fish"} label="Map: tap to pin a spot" />
          <div className="row">
            <button type="button" className="chip" aria-pressed={base === "satellite"} onClick={() => setBase(base === "map" ? "satellite" : "map")}><Icon name="layers" />Satellite</button>
            <button type="button" className="chip" onClick={locate}><Icon name="locate" />My location</button>
          </div>
        </>
      ) : null}
      {withMap ? (
        <>
          {!mapOk ? <div className="row"><button type="button" className="btn small" onClick={locate}><Icon name="locate" />Use my location</button></div> : null}
          <form className="row nowrap" onSubmit={readText}>
            <input className="input" id="pin-coords" aria-label="Position or Google Maps link" placeholder="Paste a position or Google Maps link" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
            <button type="submit" className="btn" disabled={!text.trim()}>Go</button>
          </form>
        </>
      ) : null}
      {msg ? <p className="small muted" aria-live="polite">{msg}</p> : null}
      {!pos ? <p className="small muted">{mapOk ? "Tap the map on the water you want to fish." : "Add a position to carry on."}</p> : null}
      {outside ? <Notice kind="warn">That's outside the UK. FishDock's rules, tides and species data only cover the UK.</Notice> : null}

      {pos ? (
        <section className="card water-card" aria-live="polite">
          {checking ? <p className="small muted"><Icon name="search" size={14} /> Checking the map…</p>
            : w && !showTypes ? (
              <div className="row between nowrap">
                <span className="small"><b>{w.label}</b>{found?.kind && found.subtype === w.id ? <span className="muted"> · {found.sure === "low" ? "best guess" : "detected"} from OpenStreetMap</span> : null}</span>
                <button type="button" className="linkbtn" onClick={() => setShowTypes(true)}>Change</button>
              </div>
            ) : (
              <>
                <b className="small">{found?.error === "none" || found?.kind === null ? "Couldn't tell what water this is." : found?.error ? "Choose the water type." : "What kind of water is it?"}</b>
                {found?.error && found.error !== "none" && found.error !== "preview" && found.message ? <p className="tiny">{found.message}</p> : null}
                <WaterGrid value={water} onPick={(id) => { setWater(id); setShowTypes(false); setTargetId(null); }} />
              </>
            )}
        </section>
      ) : null}

      {spot ? (
        <>
          <section className="card">
            <div className="card-h"><h2>Likely to catch here</h2><span className="aside">{inSeason.length} in season</span></div>
            {here.length ? (
              <div className="list">{here.slice(0, 8).map((r) => (
                <button key={r.species.id} type="button" className="li" onClick={() => setSpecies(r.species)}>
                  <span className={`fish-ico ${r.species.type === "sea" ? "" : "fresh"}`}><FishArt art={r.species.art} size={40} /></span>
                  <span className="grow">
                    <span className="t">{r.species.name}</span>
                    <span className="s">{r.species.peak?.length ? `Best ${monthsText(r.species.peak)}` : r.species.present?.length ? `Here ${monthsText(r.species.present)}` : r.reason}</span>
                  </span>
                  <span className="end">
                    <span className={`lvl lvl-${r.level}`}>{LEVELS[r.level].short}</span>
                    <span className={`tiny season-${r.inSeason}`}>{r.inSeason === "peak" ? "Peak now" : r.inSeason === "present" ? "In season" : "Out of season"}</span>
                  </span>
                </button>
              ))}</div>
            ) : <p className="small muted">No species profile matches this water type here.</p>}
            <p className="tiny">From documented marks within {fmtKm(25)} and each species' habitat and UK range: a guide to the area, not a record of this exact spot.</p>
          </section>

          {target && day ? (
            <section className="card">
              <div className="card-h"><h2>Best times today</h2><span className="aside">{target.name}</span></div>
              {inSeason.length > 1 ? (
                <div className="chips scroll" role="group" aria-label="Species">
                  {inSeason.slice(0, 6).map((r) => <button key={r.species.id} type="button" className="chip" aria-pressed={target.id === r.species.id} onClick={() => setTargetId(r.species.id)}>{r.species.name}</button>)}
                </div>
              ) : null}
              {day.windows.length ? (
                <div className="windows">{day.windows.map((x, i) => <div className="window" key={i}><b>{fmtTime(x.start)}–{fmtTime(x.end)}</b><span>Peak {x.peak}, {band(x.peak).label}</span></div>)}</div>
              ) : <p className="small muted">No stand-out window today.</p>}
              {spot.kind === "sea" ? (
                <div className="kv">
                  {tidesToday.map((e, i) => <div key={i}><span className="k">{e.type === "HW" ? "High water" : "Low water"}</span><span className="v">{fmtTime(e.t)}{e.t >= dayStart + 864e5 ? ` (${fmtShortDay(e.t).split(" ")[0]})` : ""}</span></div>)}
                </div>
              ) : null}
              <ul className="small tips">
                {spot.kind === "sea" && tidePref ? <li>{target.name} usually feed best on {TIDE_WORDS[tidePref] || tidePref}.{docTide && docTide !== tidePref ? ` At ${near.spot.name}, anglers favour ${TIDE_WORDS[docTide] || docTide}.` : ""}</li> : null}
                {peakSlot?.f.tideState ? <li>Tide in today's best window: {peakSlot.f.tideState.toLowerCase()}.</li> : null}
                {bestDay?.best ? <li>Best day this week: {bestDay.today ? "today" : fmtShortDay(bestDay.ds)}, {fmtTime(bestDay.best.start)}–{fmtTime(bestDay.best.end)} (peak {bestDay.best.peak}).</li> : null}
                {target.peak?.length ? <li>Best months for {target.name.toLowerCase()}: {monthsText(target.peak)}.</li> : null}
              </ul>
              <p className="tiny">{cond ? "Uses live weather for the area" : "Without live weather yet"}{spot.kind === "sea" ? (tide?.source === "estimate" ? `, and tides estimated from ${tide.station?.name} (can be out by an hour; check official times)` : tide ? `, and ${tide.label}` : ", no tide station close enough") : ""}. BiteScore is a guide, not a promise.</p>
            </section>
          ) : null}

          <section className="card">
            <div className="field">
              <label htmlFor="pin-name">Name</label>
              <input className="input" id="pin-name" maxLength={40} placeholder={found?.name || defaultPinName(pos.lat, pos.lon)} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {!pin ? <label className="toggle" htmlFor="pin-keep"><span>Save to My pins<br /><span className="tiny">On this phone only. Never shared or backed up.</span></span><input id="pin-keep" type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /></label> : null}
            <button type="button" className="btn primary block" onClick={forecast}><Icon name="fish" />Full forecast here</button>
            <div className="row">
              <button type="button" className="btn" onClick={savePinOnly}><Icon name="pin" />{pin ? "Save changes" : "Just save the pin"}</button>
              <a className="btn" href={mapsLink(pos.lat, pos.lon)} target="_blank" rel="noopener noreferrer"><Icon name="route" />Directions</a>
              {pin ? <button type="button" className="btn ghost" onClick={del}><Icon name="trash" />Delete</button> : null}
            </div>
          </section>
          <Notice kind="warn">A pin isn't a documented mark, and being on the map doesn't mean you may fish there. Check access, permits and byelaws.</Notice>
          {found?.kind ? <p className="tiny">Water type: OpenStreetMap contributors (ODbL).</p> : null}
        </>
      ) : null}
      {species ? <SpeciesSheet species={species} onClose={() => setSpecies(null)} /> : null}
    </Sheet>
  );
}

export function WaterGrid({ value, onPick }) {
  return (
    <>
      <div className="water-group">Sea</div>
      <div className="water-grid" role="group" aria-label="Sea">
        {WATERS.filter((x) => x.kind === "sea").map((x) => <button key={x.id} type="button" aria-pressed={value === x.id} onClick={() => onPick(x.id)}>{x.label}<small>{x.hint}</small></button>)}
      </div>
      <div className="water-group">Freshwater</div>
      <div className="water-grid" role="group" aria-label="Freshwater">
        {WATERS.filter((x) => x.kind !== "sea").map((x) => <button key={x.id} type="button" aria-pressed={value === x.id} onClick={() => onPick(x.id)}>{x.label}<small>{x.hint}</small></button>)}
      </div>
    </>
  );
}
