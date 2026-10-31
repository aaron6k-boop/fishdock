// ---- Choose where you're fishing: a documented mark, a pin of your own, or your own location (all kept private) ----
import { useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { SPOTS } from "../data/spots.js";
import { distanceKm, fmtKm, nationAt } from "../lib/geo.js";
import { waterById, placeFromPin } from "../lib/pins.js";
import { Sheet, Icon, Seg, Notice } from "./ui.jsx";
import PinSheet, { WaterGrid } from "./PinSheet.jsx";

export default function PlacePicker({ onClose }) {
  const { place, update, settings, say } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [mine, setMine] = useState(null); // { lat, lon, acc } from GPS
  const [askKind, setAskKind] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const [pinning, setPinning] = useState(null); // {} for a new pin, { pin } for a saved one
  const ref = mine || place;
  const pins = settings.pins || [];
  const list = useMemo(() => SPOTS
    .filter((s) => (kind === "all" || (kind === "sea" ? s.kind === "sea" : s.kind !== "sea")))
    .filter((s) => !q || `${s.name} ${s.region} ${s.nation}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => ({ s, d: distanceKm(ref, s) }))
    .sort((a, b) => (settings.favourites.includes(b.s.id) - settings.favourites.includes(a.s.id)) || a.d - b.d), [q, kind, ref, settings.favourites]);
  const myPins = useMemo(() => pins
    .filter((p) => kind === "all" || (kind === "sea" ? p.kind === "sea" : p.kind !== "sea"))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [pins, kind, q]);

  if (pinning) return <PinSheet pin={pinning.pin} onClose={() => setPinning(null)} onDone={onClose} />;

  function locate() {
    setGpsMsg("Finding you…");
    if (!("geolocation" in navigator)) { setGpsMsg("This browser can't share its location."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setMine({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); setGpsMsg(""); setAskKind(true); },
      (e) => setGpsMsg(e.code === 1 ? "Location is blocked. Allow it in your browser settings, or pick a mark below." : "Couldn't get a location fix. Pick a mark below."),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }
  function useMine(id) {
    const w = waterById(id);
    update({ placeId: "custom", custom: { name: "My location", lat: +mine.lat.toFixed(5), lon: +mine.lon.toFixed(5), kind: w.kind, subtype: w.id, nation: nationAt(mine.lat, mine.lon) } });
    say("Using your location. It stays on this phone.");
    onClose();
  }
  return (
    <Sheet title="Where are you fishing?" onClose={onClose}>
      <div className="row nowrap">
        <button type="button" className="btn grow-btn" onClick={locate}><Icon name="locate" />My location</button>
        <button type="button" className="btn grow-btn" onClick={() => setPinning({})}><Icon name="pin" />Pin on the map</button>
      </div>
      {gpsMsg ? <p className="small muted" aria-live="polite">{gpsMsg}</p> : null}
      {askKind && mine ? (
        <div className="card">
          <b>What kind of water is it?</b>
          <WaterGrid value={null} onPick={useMine} />
          <p className="tiny">Your position is used on this phone only and never shared.</p>
        </div>
      ) : null}
      <div className="search"><Icon name="search" /><input className="input" id="place-q" placeholder="Search marks, rivers, towns" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Seg value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "sea", label: "Sea" }, { value: "fresh", label: "Freshwater" }]} />
      {myPins.length ? (
        <>
          <div className="water-group"><Icon name="lock" size={12} /> My pins, on this phone</div>
          <div className="list">
            {myPins.map((p) => (
              <div key={p.id} className="li">
                <button type="button" className="li-main" onClick={() => { update({ placeId: "custom", custom: placeFromPin(p) }); say(`Fishing at ${p.name}`); onClose(); }}>
                  <span className={`pill ${p.kind === "sea" ? "sea" : "fresh"}`}>Pin</span>
                  <span className="grow"><span className="t">{p.name}</span><span className="s">{waterById(p.subtype)?.label || p.kind}</span></span>
                  <span className="end"><span className="tiny num">{fmtKm(distanceKm(ref, p))}</span>{place.pinId === p.id ? <Icon name="check" /> : null}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => setPinning({ pin: p })}><Icon name="edit" /></button>
              </div>
            ))}
          </div>
          <div className="water-group">Documented marks</div>
        </>
      ) : null}
      <div className="list">
        {list.map(({ s, d }) => (
          <button type="button" key={s.id} className="li" onClick={() => { update({ placeId: s.id }); onClose(); }}>
            <span className={`pill ${s.kind === "sea" ? "sea" : "fresh"}`}>{s.kind === "sea" ? "Sea" : s.kind === "river" ? "River" : "Still"}</span>
            <span className="grow"><span className="t">{settings.favourites.includes(s.id) ? "★ " : ""}{s.name}</span><span className="s">{s.region} · {(s.species || []).slice(0, 3).map((x) => x.name || x.id).join(", ")}</span></span>
            <span className="end"><span className="tiny num">{fmtKm(d)}</span>{place.id === s.id ? <Icon name="check" /> : null}</span>
          </button>
        ))}
      </div>
      {!list.length ? <Notice>No documented marks match. Pin a spot on the map to fish anywhere.</Notice> : null}
    </Sheet>
  );
}
