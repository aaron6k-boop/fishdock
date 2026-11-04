// ---- SpotMap: choose where to fish in the virtual 3D game, on a map of the UK (#map, #map/<spot id>) ----
// Every documented FishDock mark is a marker (by kind of spot, grouped when zoomed out). A tap opens the spot's card:
// what and where it is, a photo taken near it where Wikimedia Commons has one, the fish it's known for, what the 3D
// scene there is, today's weather and tide where FishDock has them, and "Fish here", which opens the 3D game at a
// checked fishing position. This is the virtual game only: nothing here starts a real session or logs a real catch.
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
import { Icon, Sheet } from "../components/ui.jsx";
import SpotMapView, { TYPE_GLYPH } from "../components/SpotMapView.jsx";
import { mapSpots, mapSpotById, filterSpots, matchedOn, randomSpot, TYPES, SCENES, favsOf, toggleFav, loadRecent, addRecent, firstSpecies, fishHereLink } from "../lib/spotMap.js";
import { getConditions, getTides } from "../lib/api.js";
import { conditionsAt } from "../lib/bitescore.js";
import { tideModel } from "../lib/tides.js";
import { nearbyPhotos, smallPhoto } from "../lib/scene.js";
import { hasArt, artUrl } from "../data/fishart.js";

const SCENE_FILTERS = [["exact", "Exact mapped"], ["reconstructed", "Beta"], ["representative", "Representative"]];
const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function TypeBadge({ type, big = false }) {
  return <span className={`smk-badge t-${type}${big ? " big" : ""}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={TYPE_GLYPH[type] || TYPE_GLYPH.beach} /></svg></span>;
}

export default function SpotMap() {
  const app = useApp();
  const all = useMemo(() => mapSpots(), []);
  const mapRef = useRef(null);
  const [q, setQ] = useState("");
  const [types, setTypes] = useState([]), [scenes, setScenes] = useState([]);
  const [only, setOnly] = useState(null); // null | "favs" | "recent"
  const favs = useMemo(() => favsOf(app?.settings), [app?.settings]), [recent, setRecent] = useState(loadRecent);
  const flipFav = (id) => app?.update?.((x) => ({ favourites: toggleFav(x.favourites || [], id) }));
  const [sel, setSel] = useState(() => mapSpotById(app?.nav?.spot) || null);
  const [filters, setFilters] = useState(false), [list, setList] = useState(false), [noMap, setNoMap] = useState(false);
  const [found, setFound] = useState(false); // the search box's results list is open
  // the note that this is the virtual game, not a real trip: shown until it's hidden, for this visit
  const [mode, setMode] = useState(() => { try { return sessionStorage.getItem("fishdock.mapNote") !== "off"; } catch { return true; } });
  const hideMode = () => { setMode(false); try { sessionStorage.setItem("fishdock.mapNote", "off"); } catch { /* no storage */ } };

  const shown = useMemo(() => {
    const base = filterSpots(all, { q, types, scenes, favs: only === "favs" ? favs : null });
    return only === "recent" ? recent.map((id) => base.find((s) => s.id === id)).filter(Boolean) : base;
  }, [all, q, types, scenes, only, favs, recent]);
  const nFilters = types.length + scenes.length;

  // a shared link (#map/<id>) or "Back to map" opens on that spot
  useEffect(() => { const s = mapSpotById(app?.nav?.spot); if (s) { setSel(s); setTimeout(() => mapRef.current?.show(s, 11), 350); } }, [app?.nav?.spot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // the address bar follows the open card, so it can be shared or come back to
    const h = sel ? `#map/${sel.id}` : "#map";
    if (location.hash !== h) history.replaceState(null, "", h);
  }, [sel?.id]);

  const pick = (s, move = true) => { setSel(s); setFound(false); if (move) mapRef.current?.show(s); };
  const random = () => { const s = randomSpot(shown.length ? shown : all, Math.random(), sel?.id); if (s) pick(s); };
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const showOnly = (k) => { const next = only === k ? null : k; setOnly(next); setSel(null); if (next) { const ids = next === "favs" ? favs : recent; mapRef.current?.fit(all.filter((s) => ids.includes(s.id))); } };

  return (
    <>
    <div className="smap">
      {!noMap ? <SpotMapView ref={mapRef} spots={shown} selectedId={sel?.id} onPick={(s) => pick(s, false)} onFail={() => { setNoMap(true); setList(true); }} /> : null}

      {/* ---- the top bar: back, search, filters, map or list ---- */}
      <div className="smap-top">
        <div className="smap-bar">
          <button type="button" className="smap-ib" onClick={() => app.go("home")} aria-label="Back to Home"><Icon name="back" /></button>
          <label className="smap-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setFound(!!e.target.value); }} onFocus={() => q && setFound(true)} placeholder="Spot, county or fish" aria-label="Search spots by name, region or species" enterKeyHint="search" onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { pick(shown[0]); e.currentTarget.blur(); } }} />
            {q ? <button type="button" className="smap-clear" onClick={() => { setQ(""); setFound(false); }} aria-label="Clear the search"><Icon name="close" /></button> : null}
          </label>
          <button type="button" className={`smap-ib${nFilters ? " on" : ""}`} onClick={() => setFilters(true)} aria-label={`Filters${nFilters ? `, ${nFilters} on` : ""}`}><Icon name="layers" />{nFilters ? <i className="smap-n">{nFilters}</i> : null}</button>
          {!noMap ? <button type="button" className="smap-ib" onClick={() => { setList(!list); setFound(false); }} aria-label={list ? "Show the map" : "Show as a list"}><Icon name={list ? "explore" : "list"} /></button> : null}
        </div>
        <div className="smap-chips" role="toolbar" aria-label="Quick choices">
          <button type="button" className="chip" onClick={random}><Icon name="refresh" />Random spot</button>
          <button type="button" className={`chip${only === "favs" ? " on" : ""}`} aria-pressed={only === "favs"} onClick={() => showOnly("favs")}><Icon name="star" />Favourites{favs.length ? ` ${favs.length}` : ""}</button>
          <button type="button" className={`chip${only === "recent" ? " on" : ""}`} aria-pressed={only === "recent"} onClick={() => showOnly("recent")}><Icon name="clock" />Recent</button>
          {types.map((t) => <button key={t} type="button" className="chip on" onClick={() => toggle(types, setTypes, t)} aria-label={`${TYPES[t].plural} only: remove`}>{TYPES[t].plural}<Icon name="close" /></button>)}
          {scenes.map((t) => <button key={t} type="button" className="chip on" onClick={() => toggle(scenes, setScenes, t)} aria-label={`${SCENES[t].short} only: remove`}>{SCENES[t].short}<Icon name="close" /></button>)}
        </div>
        {mode ? <p className="smap-mode"><span><b>Virtual fishing</b> in 3D (Beta): catches are simulated and never logged. <button type="button" className="linkbtn" onClick={() => app.go("live")}>Fishing for real? Log a real trip</button></span><button type="button" className="smap-mode-x" onClick={hideMode} aria-label="Hide this note"><Icon name="close" /></button></p> : null}
        {found && q ? (
          <div className="smap-results" role="listbox" aria-label="Matching spots">
            {shown.length ? shown.slice(0, 8).map((s) => { const why = matchedOn(s, q); return (
              <button key={s.id} type="button" role="option" aria-selected={sel?.id === s.id} className="smap-row" onClick={() => pick(s)}>
                <TypeBadge type={s.type} /><span className="grow"><b>{s.short}</b><span>{TYPES[s.type].label} · {s.region}{why ? ` · ${why}` : ""}</span></span><Icon name="chevron" />
              </button>
            ); }) : <p className="smap-none">No spots match "{q}"{nFilters || only ? " with these filters" : ""}.</p>}
            {shown.length > 8 ? <button type="button" className="smap-more" onClick={() => { setFound(false); setList(true); }}>All {shown.length} matches</button> : null}
          </div>
        ) : null}
      </div>

      {/* ---- the list (also what shows when the map can't load) ---- */}
      {list ? (
        <div className="smap-list">
          {noMap ? <p className="smap-none">The map can't load here, so the spots are listed instead.</p> : null}
          <p className="tiny smap-count">{shown.length} of {all.length} spots{only === "favs" ? ", your favourites" : only === "recent" ? ", fished recently" : ""}</p>
          {shown.map((s) => (
            <button key={s.id} type="button" className={`smap-row card-like${sel?.id === s.id ? " on" : ""}`} onClick={() => { setList(noMap); pick(s); }}>
              <TypeBadge type={s.type} /><span className="grow"><b>{s.short}</b><span>{TYPES[s.type].label} · {s.region}</span></span><span className={`smap-scene s-${s.scene}`}>{SCENES[s.scene].short}</span>
            </button>
          ))}
          {!shown.length ? <p className="smap-none">{only === "favs" ? "No favourites yet: tap the star on a spot's card." : only === "recent" ? "Spots you fish will show here." : "No spots match these filters."}</p> : null}
        </div>
      ) : null}

      {!list && !sel && !shown.length ? <div className="smap-empty card-like">{only === "favs" ? "No favourites yet: tap the star on a spot's card." : only === "recent" ? "Spots you fish will show here." : "No spots match these filters."}</div> : null}
      {sel ? <SpotCard key={sel.id} s={sel} fav={favs.includes(sel.id)} onFav={() => flipFav(sel.id)} onClose={() => setSel(null)} onFish={() => setRecent(addRecent(sel.id))} /> : null}

    </div>
      {filters ? (
        <Sheet title="Filter spots" onClose={() => setFilters(false)} aside={`${shown.length} of ${all.length} spots`}>
          <div className="field"><span className="lbl">Kind of spot</span>
            <div className="chips">{Object.entries(TYPES).map(([k, t]) => { const n = all.filter((s) => s.type === k).length; return n ? <button key={k} type="button" className={`chip${types.includes(k) ? " on" : ""}`} aria-pressed={types.includes(k)} onClick={() => toggle(types, setTypes, k)}><TypeBadge type={k} />{t.plural} <small>{n}</small></button> : null; })}</div>
          </div>
          <div className="field"><span className="lbl">3D scene</span>
            <div className="chips">{SCENE_FILTERS.map(([k, label]) => <button key={k} type="button" className={`chip${scenes.includes(k) ? " on" : ""}`} aria-pressed={scenes.includes(k)} onClick={() => toggle(scenes, setScenes, k)}>{label} <small>{all.filter((s) => s.scene === k).length}</small></button>)}</div>
            <ul className="smap-key tiny">{Object.entries(SCENES).map(([k, v]) => <li key={k}><b>{v.label}.</b> {v.note}</li>)}</ul>
          </div>
          <div className="row"><button type="button" className="btn ghost" onClick={() => { setTypes([]); setScenes([]); }} disabled={!nFilters}>Clear filters</button><button type="button" className="btn primary grow" onClick={() => setFilters(false)}>Show {shown.length} spots</button></div>
        </Sheet>
      ) : null}
    </>
  );
}

// ---- the spot card ----
function SpotCard({ s, fav, onFav, onClose, onFish }) {
  const app = useApp();
  const [species, setSpecies] = useState(() => firstSpecies(s));
  const [point, setPoint] = useState(null); // null: the best safe position, chosen as the scene loads
  const [photo, setPhoto] = useState(undefined); // undefined while looking, null when there's none
  const [wx, setWx] = useState(undefined), [tide, setTide] = useState(undefined);
  const [more, setMore] = useState(false), [why, setWhy] = useState(false);
  useEffect(() => {
    let gone = false;
    nearbyPhotos(s).then((r) => { if (!gone) setPhoto((r.photos || []).find((p) => p.url) || null); }).catch(() => { if (!gone) setPhoto(null); });
    getConditions(s.lat, s.lon).then((c) => { if (!gone) setWx(c?.hourly?.length ? { now: conditionsAt(c, Date.now()), stale: !!c.stale } : null); }).catch(() => { if (!gone) setWx(null); });
    if (s.kind === "sea") getTides(s.lat, s.lon).then((api) => { if (gone) return; const m = tideModel(s, api); const st = m?.stateAt(Date.now()); setTide(st ? { next: st.next, label: m.label, estimate: m.source === "estimate" } : null); }).catch(() => { if (!gone) setTide(null); });
    else setTide(null);
    return () => { gone = true; };
  }, [s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = fishHereLink(s, species, point);
  const go = () => { onFish(); try { sessionStorage.setItem("fishdock.fromMap", s.id); } catch { /* no storage */ } location.hash = link; };
  async function share() {
    const url = `${location.origin}${location.pathname}#map/${s.id}`, text = `${s.short}, ${s.region}: fish it in FishDock's 3D game`;
    try { if (navigator.share) { await navigator.share({ title: s.short, text, url }); return; } await navigator.clipboard.writeText(url); app?.say?.("Link copied"); } catch { /* cancelled */ }
  }
  const w = wx?.now;
  return (
    <section className="smap-card" aria-label={`${s.short}: spot card`}>
      <div className="smap-grab" aria-hidden="true" />
      <div className="smap-hero">
        {photo ? <img src={smallPhoto(photo.url)} alt={`Photo near ${s.short}`} referrerPolicy="no-referrer" onError={() => setPhoto(null)} /> : <div className={`smap-ph t-${s.type}`}><TypeBadge type={s.type} big />{photo === undefined ? <span className="loading-dots" aria-label="Looking for a photo" /> : null}</div>}
        <button type="button" className="smap-x" onClick={onClose} aria-label="Close the card"><Icon name="close" /></button>
        {photo ? <a className="smap-credit" href={photo.filePage || "#"} target="_blank" rel="noopener noreferrer">Photo near here: {photo.author}, {photo.licence}</a> : null}
      </div>
      <div className="smap-body">
        <div className="smap-head">
          <div className="grow">
            <h2>{s.short}</h2>
            <p className="smap-sub"><TypeBadge type={s.type} />{TYPES[s.type].label}{s.subtype === "breakwater" ? " (breakwater)" : s.subtype === "reservoir" ? " (reservoir)" : ""} · {s.region}</p>
          </div>
          <button type="button" className={`smap-ib${fav ? " fav" : ""}`} onClick={onFav} aria-pressed={fav} aria-label={fav ? "Remove from favourites" : "Save to favourites"}><Icon name="star" /></button>
          <button type="button" className="smap-ib" onClick={share} aria-label="Share this spot"><Icon name="share" /></button>
        </div>

        <button type="button" className={`smap-scene-line s-${s.scene}`} onClick={() => setWhy(!why)} aria-expanded={why}>
          <span className={`smap-scene s-${s.scene}`}>{SCENES[s.scene].label}</span>{s.approx ? <span className="tiny">Approximate position</span> : null}<Icon name="info" />
        </button>
        {why ? <p className="tiny smap-why">{SCENES[s.scene].note}{s.checked ? ` Checked ${new Date(s.checked).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.` : ""}</p> : null}

        {s.best ? <p className={`smap-desc${more ? " open" : ""}`} onClick={() => setMore(!more)}>{s.best}</p> : null}

        {s.species.length ? (
          <div className="smap-fish" role="group" aria-label="Fish for">
            {s.species.slice(0, 8).map((f) => (
              <button key={f.id} type="button" className={`smap-f${f.id === species ? " on" : ""}`} aria-pressed={f.id === species} onClick={() => setSpecies(f.id)} disabled={firstSpecies(s, f.id) !== f.id} title={firstSpecies(s, f.id) !== f.id ? "Not in the 3D game for this water yet" : f.level}>
                {hasArt(f.id) ? <img src={artUrl(f.id, "s")} alt="" loading="lazy" /> : <Icon name="fish" />}<span>{f.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="smap-now">
          {w ? <span><Icon name="wind" />{Math.round(w.windKph * 0.621)} mph{w.tempC != null ? <> · {Math.round(w.tempC)}°C</> : null}<small>{wx.stale ? "Saved forecast" : "Open-Meteo"}</small></span> : wx === null ? <span className="muted">Weather isn't available just now</span> : <span className="loading-dots" aria-label="Loading the weather" />}
          {tide ? <span><Icon name="wave" />{tide.next.type === "HW" ? "High" : "Low"} water {clock(tide.next.t)}<small>{tide.estimate ? "Estimate" : "Admiralty"}</small></span> : null}
        </div>

        <div className="smap-points" role="radiogroup" aria-label="Where to start">
          <span className="lbl">Start at</span>
          <button type="button" role="radio" aria-checked={point === null} className={`chip${point === null ? " on" : ""}`} onClick={() => setPoint(null)}><Icon name="target" />Best position</button>
          {s.points.map((p) => <button key={p.id} type="button" role="radio" aria-checked={point === p.id} className={`chip${point === p.id ? " on" : ""}`} onClick={() => setPoint(p.id)} title={`Facing ${p.facing}`}>{p.name}<small>faces {p.facing}</small></button>)}
          {!s.points.length ? <span className="tiny">Positions are found and checked when the scene loads.</span> : null}
        </div>

        <div className="smap-actions">
          <a className="btn primary smap-go" href={link} onClick={(e) => { e.preventDefault(); go(); }}><Icon name="play" />Fish here</a>
          <button type="button" className="btn" onClick={() => app.go("explore", { spot: s.id })} aria-label={`Real-world details for ${s.short}: access, safety and sources`}><Icon name="info" />Details</button>
        </div>
        <p className="tiny smap-foot">Virtual fishing: you arrive at a checked spot facing the water. For access, permits and safety before a real trip, see Details.</p>
      </div>
    </section>
  );
}
