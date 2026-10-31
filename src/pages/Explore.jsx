// ---- Explore: documented marks on a map (or sonar when maps can't load), and the species guide ----
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.js";
import { SPOTS, spotById } from "../data/spots.js";
import { SPECIES } from "../data/species.js";
import { all } from "../lib/storage.js";
import { catchHere, LEVELS } from "../lib/catchhere.js";
import { distanceKm, fmtKm, mapsLink } from "../lib/geo.js";
import { waterById } from "../lib/pins.js";
import { searchPlaces } from "../lib/api.js";
import { ukMonth } from "../lib/time.js";
import { Icon, Tabs, Seg, Sheet, Notice, Sources, Beta, MonthStrip } from "../components/ui.jsx";
import { FishArt } from "../components/art.jsx";
import { Sonar } from "../components/charts.jsx";
import MapView, { OVERLAYS } from "../components/MapView.jsx";
import SpeciesSheet from "../components/SpeciesSheet.jsx";
import IdentifySheet from "../components/IdentifySheet.jsx";
import PinSheet from "../components/PinSheet.jsx";
import TodayCard from "../components/TodayCard.jsx";
import CatchList from "../components/CatchList.jsx";
import AdviceSheet from "../components/AdviceSheet.jsx";
import { useMyCatches, catchesNear, withMine } from "../lib/myCatches.js";
import { ReportSheet } from "./Tackle.jsx";

export default function Explore() {
  const [tab, setTab] = useState("spots");
  return (
    <main className="col">
      <div className="page-head"><h1>Explore</h1></div>
      <Tabs label="Explore sections" value={tab} onChange={setTab} options={[{ value: "spots", label: "Fishing spots" }, { value: "species", label: "Fish species" }]} />
      {tab === "spots" ? <Spots /> : <SpeciesGuide />}
    </main>
  );
}

function Spots() {
  const { place, settings, preview, nav, say } = useApp();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState(preview ? "sonar" : "map");
  const [mapOk, setMapOk] = useState(!preview);
  const [overlays, setOverlays] = useState([]);
  const [base, setBase] = useState("map");
  const [open, setOpen] = useState(() => (nav?.spot ? spotById(nav.spot) : null));
  useEffect(() => { if (nav?.spot) setOpen(spotById(nav.spot)); }, [nav?.spot]);
  const [marks, setMarks] = useState([]);
  const [showMarks, setShowMarks] = useState(false);
  const [drop, setDrop] = useState(null);       // a pin dropped by tapping the map, not yet saved
  const [focus, setFocus] = useState(null);     // move the map to a searched place
  const [places, setPlaces] = useState([]);
  // ---- search any UK place by name (only the words are sent), a moment after typing stops ----
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setPlaces([]); return; }
    let gone = false;
    const timer = setTimeout(() => searchPlaces(t).then((r) => { if (!gone) setPlaces(r.results || []); }), 450);
    return () => { gone = true; clearTimeout(timer); };
  }, [q]);
  const [pinOpen, setPinOpen] = useState(null); // { at } for a new pin, { pin } for a saved one
  const pins = settings.pins || [];
  useEffect(() => {
    if (!showMarks) { setMarks([]); return; }
    all("sessions").then((ss) => setMarks(ss.flatMap((s) => s.events.filter((e) => e.type === "mark" && e.pos).map((e) => ({ lat: e.pos.lat, lon: e.pos.lon, label: e.data?.label || e.data?.kind || "Mark" })))));
  }, [showMarks]);
  const list = useMemo(() => SPOTS
    .filter((s) => kind === "all" || (kind === "sea" ? s.kind === "sea" : s.kind !== "sea"))
    .filter((s) => !q || `${s.name} ${s.region} ${s.nation} ${(s.species || []).map((x) => x.name || x.id).join(" ")}`.toLowerCase().includes(q.toLowerCase()))
    .map((s) => ({ s, d: distanceKm(place, s) })).sort((a, b) => a.d - b.d), [kind, q, place]);
  const shownSpots = useMemo(() => list.map((x) => x.s), [list]);

  const toggle = (k) => setOverlays((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  return (
    <>
      <div className="search"><Icon name="search" /><input id="spot-q" className="input" placeholder="Search marks, fish, towns or beaches" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" /></div>
      {places.length ? (
        <div className="place-results" role="list" aria-label="Places">
          {places.map((p) => (
            <button key={`${p.lat},${p.lon}`} type="button" className="chip place" role="listitem" onClick={() => {
              setFocus({ lat: p.lat, lon: p.lon, zoom: p.kind === "Town" || p.kind === "City" ? 13 : 14, key: Date.now() });
              if (view !== "map" && mapOk) setView("map");
              say(`${p.name}: tap the water to see what's there`);
              setQ("");
            }}><Icon name="pin" size={14} />{p.name}<small>{p.kind}{p.area ? `, ${p.area.split(",")[0]}` : ""}</small></button>
          ))}
        </div>
      ) : null}
      <div className="row between">
        <Seg value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "sea", label: "Sea" }, { value: "fresh", label: "Freshwater" }]} />
        <Seg value={view} onChange={setView} options={[...(mapOk ? [{ value: "map", label: "Map" }] : []), { value: "sonar", label: "Sonar" }, { value: "list", label: "List" }]} />
      </div>
      {view === "map" && mapOk ? (
        <>
          <MapView spots={shownSpots} marks={marks} pins={pins} dropped={drop} center={place} focus={focus} overlays={overlays} base={base} onPick={setOpen}
            onPickPin={(p) => setPinOpen({ pin: p, tapped: true })} onTap={(p) => { setDrop(p); setPinOpen({ at: p, tapped: true }); }}
            hint="Tap the water to see what's there"
            onFail={() => { setMapOk(false); setView("sonar"); }} />
          <div className="chips">
            <button type="button" className="chip" aria-pressed={base === "satellite"} onClick={() => setBase(base === "map" ? "satellite" : "map")}><Icon name="layers" />Satellite</button>
            {Object.entries(OVERLAYS).map(([k, o]) => <button key={k} type="button" className="chip" aria-pressed={overlays.includes(k)} onClick={() => toggle(k)}>{o.label}</button>)}
            <button type="button" className="chip" aria-pressed={showMarks} onClick={() => setShowMarks(!showMarks)}><Icon name="lock" />My marks</button>
          </div>
          {overlays.map((k) => <p key={k} className="tiny">{OVERLAYS[k].label}: {OVERLAYS[k].note}</p>)}
        </>
      ) : null}
      {view === "sonar" ? (
        <section className="card sonar-card">
          <div className="card-h"><h2>Around {place.name}</h2><span className="aside">by direction and distance</span></div>
          <Sonar center={place} spots={list.map((x) => x.s)} onPick={setOpen} selected={open?.id} />
          <div className="row tiny"><span className="dotkey sea" /> Sea <span className="dotkey fresh" /> Freshwater{!mapOk ? " · The map couldn't load here" : ""}</div>
        </section>
      ) : null}
      {view !== "map" || !mapOk ? (
        <button type="button" className="li card-like" onClick={() => setPinOpen({})}><Icon name="pin" /><span className="grow"><span className="t">Pin a spot to check</span><span className="s">Anywhere you want to fish, kept on this phone</span></span><Icon name="chevron" className="go" /></button>
      ) : null}
      {pins.length ? (
        <section className="card">
          <div className="card-h"><h2>My pins</h2><span className="aside"><Icon name="lock" size={13} /> on this phone</span></div>
          <div className="list">{pins.map((p) => (
            <button key={p.id} type="button" className="li" onClick={() => setPinOpen({ pin: p })}>
              <span className={`pill ${p.kind === "sea" ? "sea" : "fresh"}`}>{waterById(p.subtype)?.label.split(" ")[0] || "Pin"}</span>
              <span className="grow"><span className="t">{place.pinId === p.id ? "✓ " : ""}{p.name}</span><span className="s">{waterById(p.subtype)?.label || p.kind}{p.nation ? ` · ${p.nation}` : ""}</span></span>
              <span className="end tiny num">{fmtKm(distanceKm(place, p))}</span>
            </button>
          ))}</div>
        </section>
      ) : null}
      <section className="card">
        <div className="card-h"><h2>{list.length} documented marks</h2><span className="aside">nearest first</span></div>
        <div className="list">{list.slice(0, view === "list" ? 100 : 12).map(({ s, d }) => (
          <button key={s.id} type="button" className="li" onClick={() => setOpen(s)}>
            <span className={`pill ${s.kind === "sea" ? "sea" : "fresh"}`}>{s.kind === "sea" ? (s.subtype || "Sea") : s.kind}</span>
            <span className="grow"><span className="t">{settings.favourites.includes(s.id) ? "★ " : ""}{s.name}</span><span className="s">{s.region} · {(s.species || []).slice(0, 4).map((x) => x.name || x.id).join(", ")}</span></span>
            <span className="end tiny num">{fmtKm(d)}</span>
          </button>
        ))}</div>
        <p className="tiny">Marks come from published angling guides, clubs and councils. Being listed doesn't mean you may fish there: check access, permits and byelaws.</p>
      </section>
      {open ? <SpotSheet s={open} onClose={() => setOpen(null)} /> : null}
      {pinOpen ? <PinSheet at={pinOpen.at} pin={pinOpen.pin} withMap={!pinOpen.tapped} onClose={() => { setPinOpen(null); setDrop(null); }} /> : null}
    </>
  );
}

export function SpotSheet({ s, onClose }) {
  const { update, settings, say, go } = useApp();
  const [report, setReport] = useState(false);
  const [species, setSpecies] = useState(null);
  const month = ukMonth(Date.now());
  const myCatches = useMyCatches();
  const all = useMemo(() => withMine(catchHere({ ...s, verified: true }, month), catchesNear(myCatches, s), month), [s, month, myCatches]);
  const here = all.filter((r) => r.level !== "possible");
  const fav = settings.favourites.includes(s.id);
  return (
    <Sheet title={s.name} aside={`${s.region}, ${s.nation} · ${s.subtype || s.kind}`} onClose={onClose}>
      <div className="spot-actions">
        <button type="button" className="btn primary" onClick={() => { update({ placeId: s.id }); say(`Fishing at ${s.name}`); onClose(); go("home"); }}><Icon name="pin" />Fish here</button>
        <button type="button" className="btn" onClick={() => update((x) => ({ favourites: fav ? x.favourites.filter((i) => i !== s.id) : [...x.favourites, s.id] }))}><Icon name="star" />{fav ? "Saved" : "Save"}</button>
        <a className="btn" href={mapsLink(s.lat, s.lon)} target="_blank" rel="noopener noreferrer"><Icon name="route" />Directions</a>
      </div>
      <button type="button" className="linkbtn share-link" onClick={() => shareSpot(s, say)}><Icon name="share" size={15} /> Share this mark</button>
      {s.coordsVerified === false ? <Notice kind="warn">Approximate position. Check the exact access point locally before you travel.</Notice> : null}
      {s.best ? <section className="card"><h2 className="h2">When it fishes best</h2><p className="small">{s.best}</p>{s.baits?.length ? <div className="chips">{s.baits.map((b) => <span key={b} className="chip">{b}</span>)}</div> : null}</section> : null}
      <TodayCard spot={{ ...s, verified: true }} here={here} />
      <section className="card">
        <h2 className="h2">What's caught here</h2>
        <CatchList rows={here} onOpen={setSpecies} />
      </section>
      {s.alsoCaught?.length ? (
        <section className="card">
          <h2 className="h2">Also caught here</h2>
          {s.alsoCaught.map((x) => <p key={x.name} className="small"><b>{x.name}:</b> {x.note} {x.link ? <a href={x.link} target="_blank" rel="noopener noreferrer">Rules</a> : null}</p>)}
        </section>
      ) : null}
      {s.access ? <section className="card"><h2 className="h2">Access, parking and permits</h2><p className="small">{s.access}</p></section> : null}
      {s.safety ? <Notice kind="danger"><b>Safety:</b> {s.safety}</Notice> : null}
      <p className="tiny">{s.verification === "partial" ? "Some details here rest on one or two sources. " : ""}Last checked {s.checked || "October 2026"}.</p>
      <Sources list={s.sources} />
      <button type="button" className="btn ghost" onClick={() => setReport(true)}><Icon name="flag" />Report wrong or out-of-date information</button>
      {report ? <ReportSheet kind="inaccurate-spot" refText={`spot:${s.id}`} onClose={() => setReport(false)} /> : null}
      {species ? <AdviceSheet species={species} spot={{ ...s, verified: true }} row={here.find((r) => r.species.id === species.id)} onClose={() => setSpecies(null)} /> : null}
    </Sheet>
  );
}

// Documented marks are public information, so they can be shared as a link that opens the mark in FishDock.
async function shareSpot(s, say) {
  const url = `${location.origin}/#spot/${s.id}`;
  const fish = (s.species || []).slice(0, 4).map((x) => x.name).join(", ");
  const text = `${s.name}, ${s.region}${fish ? `: ${fish}` : ""}. On FishDock:`;
  try {
    if (navigator.share) { await navigator.share({ title: s.name, text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    say("Link copied");
  } catch (e) {
    if (e?.name !== "AbortError") say("Couldn't share from this browser");
  }
}

function SpeciesGuide() {
  const { place } = useApp();
  const [type, setType] = useState(place.kind === "sea" ? "sea" : "fresh");
  const [q, setQ] = useState("");
  const [season, setSeason] = useState(false);
  const [open, setOpen] = useState(null);
  const [idOpen, setIdOpen] = useState(false);
  const month = ukMonth(Date.now());
  const list = SPECIES.filter((s) => (type === "all" || s.type === type || s.type === "both") && (!season || s.present?.includes(month)) && (!q || `${s.name} ${s.latin}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <button type="button" className="li card-like" onClick={() => setIdOpen(true)}><Icon name="camera" /><span className="grow"><span className="t">Identify a fish from a photo <Beta /></span><span className="s">AI suggestions you confirm yourself</span></span><Icon name="chevron" className="go" /></button>
      <div className="search"><Icon name="search" /><input id="sp-q" className="input" placeholder="Search species" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="row between">
        <Seg value={type} onChange={setType} options={[{ value: "sea", label: "Sea" }, { value: "fresh", label: "Freshwater" }, { value: "all", label: "All" }]} />
        <button type="button" className="chip" aria-pressed={season} onClick={() => setSeason(!season)}>In season now</button>
      </div>
      <div className="species-grid">
        {list.map((s) => (
          <button key={s.id} type="button" className="sp-card" onClick={() => setOpen(s)}>
            <FishArt art={s.art} size={130} />
            <span className="t">{s.name}</span>
            <MonthStrip peak={s.peak} present={s.present} current={month} />
          </button>
        ))}
      </div>
      {open ? <SpeciesSheet species={open} onClose={() => setOpen(null)} /> : null}
      {idOpen ? <IdentifySheet onClose={() => setIdOpen(false)} /> : null}
    </>
  );
}
