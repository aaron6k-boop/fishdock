// ---- PinSheet: tap or pin any spot to see what you're likely to catch there, when, and the best times and tides ----
// Opened from a tap on the Explore map (at, no map of its own), from "Pin a spot" (with a map), or for a saved pin.
// The water type comes from OpenStreetMap (server/water.js) and can always be changed. Pins stay on this phone.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { SPOTS } from "../data/spots.js";
import { WATERS, waterById, waterFor, MAX_PINS, parseCoords, inUk, makePin, savePin, removePin, placeFromPin, nearestSpot, defaultPinName } from "../lib/pins.js";
import { catchHere } from "../lib/catchhere.js";
import { getWater } from "../lib/api.js";
import { useMyCatches, catchesNear, withMine } from "../lib/myCatches.js";
import { ukMonth } from "../lib/time.js";
import { fmtKm, mapsLink, nationAt } from "../lib/geo.js";
import MapView from "./MapView.jsx";
import AdviceSheet from "./AdviceSheet.jsx";
import TodayCard from "./TodayCard.jsx";
import CatchList from "./CatchList.jsx";
import { Sheet, Icon, Notice } from "./ui.jsx";
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
  const [species, setSpecies] = useState(null);
  const [allFish, setAllFish] = useState(false);
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
      if (r?.kind && waterFor(r.subtype)) { const id = waterFor(r.subtype).id; setFound({ ...r, subtype: id }); setWater(id); setShowTypes(false); return; }
      // The map lookup failed or found nothing: within 3 km of a documented mark, start from that mark's water type.
      const n = nearestSpot(pos.lat, pos.lon);
      const guess = n && n.d <= 3 && waterFor(n.spot.subtype);
      setFound({ error: r?.preview ? "preview" : r?.error || "none", message: r?.message, guess: guess ? n.spot : null });
      setWater(guess ? guess.id : null);
      setShowTypes(!guess);
    });
    return () => { gone = true; };
  }, [pos?.lat, pos?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = name.trim() || pin?.name || found?.name || (pos ? defaultPinName(pos.lat, pos.lon) : "Pinned spot");
  const spot = useMemo(() => (pos && w ? { id: "pin", name: label, lat: pos.lat, lon: pos.lon, kind: w.kind, subtype: w.id, nation: nationAt(pos.lat, pos.lon), verified: false } : null), [pos, w, label]);
  const myCatches = useMyCatches();
  const here = useMemo(() => (spot ? withMine(catchHere(spot, ukMonth(Date.now())), catchesNear(myCatches, spot), ukMonth(Date.now())) : []), [spot, myCatches]);

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
    if (!pin && keep && (settings.pins || []).length >= MAX_PINS) say(`You can keep ${MAX_PINS} pins, so the oldest was removed`);
    update((s) => ({ placeId: "custom", custom: placeFromPin(p), ...(keep || pin ? { pins: savePin(s.pins, p) } : {}) }));
    say(`Forecast for ${p.name}${keep || pin ? ". Pin saved on this phone" : ""}`);
    onDone?.(); onClose(); go("home");
  }
  function savePinOnly() {
    const p = record(); if (!p) return;
    update((s) => ({ pins: savePin(s.pins, p), ...(s.placeId === "custom" && s.custom?.pinId === p.id ? { custom: placeFromPin(p) } : {}) }));
    say(pin ? "Pin updated" : (settings.pins || []).length >= MAX_PINS ? `Pin saved. You can keep ${MAX_PINS}, so the oldest was removed` : "Pin saved on this phone");
    onDone?.(); onClose();
  }
  function del() {
    // If you were fishing at this pin, move to the nearest documented mark rather than keep a deleted pin.
    const n = nearestSpot(pin.lat, pin.lon);
    const wasCurrent = settings.placeId === "custom" && settings.custom?.pinId === pin.id;
    update((s) => ({ pins: removePin(s.pins, pin.id), ...(wasCurrent && n ? { placeId: n.spot.id, custom: null } : {}) }));
    say(wasCurrent && n ? `Pin deleted. Now showing ${n.spot.name}` : "Pin deleted");
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
                <span className="small"><b>{w.label}</b>{found?.kind && found.subtype === w.id ? <span className="muted"> · {found.sure === "low" ? "best guess" : "detected"} from OpenStreetMap</span>
                  : found?.guess && waterById(water) && !found.kind ? <span className="muted"> · guessed from {found.guess.name} nearby</span> : null}</span>
                <button type="button" className="linkbtn" onClick={() => setShowTypes(true)}>Change</button>
              </div>
            ) : (
              <>
                <b className="small">{found?.error === "none" || found?.kind === null ? "Couldn't tell what water this is." : found?.error ? "Choose the water type." : "What kind of water is it?"}</b>
                {found?.error && found.error !== "none" && found.error !== "preview" && found.message ? <p className="tiny">{found.message}</p> : null}
                <WaterGrid value={water} onPick={(id) => { setWater(id); setShowTypes(false); }} />
              </>
            )}
        </section>
      ) : null}

      {spot ? (
        <>
          <TodayCard key={`${spot.lat},${spot.lon},${spot.subtype}`} spot={spot} here={here}
            borrowed={near && near.d < 3 && near.spot.kind === "sea" && spot.kind === "sea" && near.spot.tidePref ? { pref: near.spot.tidePref, name: near.spot.name } : null} />

          <section className="card">
            <div className="card-h"><h2>Likely to catch here</h2><span className="aside">{here.filter((r) => r.inSeason !== "out").length} in season</span></div>
            {here.length ? <CatchList rows={here} onOpen={setSpecies} limit={allFish ? 100 : 10} /> : <p className="small muted">No species profile matches this water type here.</p>}
            {here.length > 10 && !allFish ? <button type="button" className="linkbtn" onClick={() => setAllFish(true)}>Show all {here.length}</button> : null}
            <p className="tiny">From documented marks within {fmtKm(25)} and each species' habitat and UK range: a guide to the area, not a record of this exact spot.</p>
          </section>


          <section className="card">
            <div className="field">
              <label htmlFor="pin-name">Name</label>
              <input className="input" id="pin-name" maxLength={40} placeholder={found?.name || defaultPinName(pos.lat, pos.lon)} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {!pin ? <label className="toggle" htmlFor="pin-keep"><span>Save to My pins<br /><span className="tiny">Kept on this phone and never shared.</span></span><input id="pin-keep" type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /></label> : null}
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
      {species && spot ? <AdviceSheet species={species} spot={spot} row={here.find((r) => r.species.id === species.id)} onClose={() => setSpecies(null)} /> : null}
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
