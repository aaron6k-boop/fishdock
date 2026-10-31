// ---- Choose where you're fishing: a documented mark, a favourite, or your own location (kept private) ----
import { useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { SPOTS } from "../data/spots.js";
import { distanceKm, fmtKm, nationAt } from "../lib/geo.js";
import { Sheet, Icon, Seg, Notice } from "./ui.jsx";

export default function PlacePicker({ onClose }) {
  const { place, update, settings, say } = useApp();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [mine, setMine] = useState(null); // { lat, lon, acc } from GPS
  const [askKind, setAskKind] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const ref = mine || place;
  const list = useMemo(() => SPOTS
    .filter((s) => (kind === "all" || (kind === "sea" ? s.kind === "sea" : s.kind !== "sea")))
    .filter((s) => !q || `${s.name} ${s.region} ${s.nation}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => ({ s, d: distanceKm(ref, s) }))
    .sort((a, b) => (settings.favourites.includes(b.s.id) - settings.favourites.includes(a.s.id)) || a.d - b.d), [q, kind, ref, settings.favourites]);

  function locate() {
    setGpsMsg("Finding you…");
    if (!("geolocation" in navigator)) { setGpsMsg("This browser can't share its location."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setMine({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); setGpsMsg(""); setAskKind(true); },
      (e) => setGpsMsg(e.code === 1 ? "Location is blocked. Allow it in your browser settings, or pick a mark below." : "Couldn't get a location fix. Pick a mark below."),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }
  function useMine(k) {
    update({ placeId: "custom", custom: { name: "My location", lat: +mine.lat.toFixed(5), lon: +mine.lon.toFixed(5), kind: k, subtype: k, nation: nationAt(mine.lat, mine.lon) } });
    say("Using your location. It stays on this phone.");
    onClose();
  }
  return (
    <Sheet title="Where are you fishing?" onClose={onClose}>
      <button type="button" className="btn block" onClick={locate}><Icon name="locate" />Use my location</button>
      {gpsMsg ? <p className="small muted" aria-live="polite">{gpsMsg}</p> : null}
      {askKind && mine ? (
        <div className="card">
          <b>What kind of water is it?</b>
          <div className="seg">{[["sea", "Sea or beach"], ["river", "River"], ["lake", "Lake or pond"], ["canal", "Canal"], ["fishery", "Day-ticket fishery"]].map(([k, l]) => <button type="button" key={k} onClick={() => useMine(k)}>{l}</button>)}</div>
          <p className="tiny">Your position is used on this phone only and never shared.</p>
        </div>
      ) : null}
      <div className="search"><Icon name="search" /><input className="input" id="place-q" placeholder="Search marks, rivers, towns" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Seg value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "sea", label: "Sea" }, { value: "fresh", label: "Freshwater" }]} />
      <div className="list">
        {list.map(({ s, d }) => (
          <button type="button" key={s.id} className="li" onClick={() => { update({ placeId: s.id }); onClose(); }}>
            <span className={`pill ${s.kind === "sea" ? "sea" : "fresh"}`}>{s.kind === "sea" ? "Sea" : s.kind === "river" ? "River" : "Still"}</span>
            <span className="grow"><span className="t">{settings.favourites.includes(s.id) ? "★ " : ""}{s.name}</span><span className="s">{s.region} · {(s.species || []).slice(0, 3).map((x) => x.name || x.id).join(", ")}</span></span>
            <span className="end"><span className="tiny num">{fmtKm(d)}</span>{place.id === s.id ? <Icon name="check" /> : null}</span>
          </button>
        ))}
      </div>
      {!list.length ? <Notice>No documented marks match. Try "Use my location" to fish anywhere.</Notice> : null}
    </Sheet>
  );
}
