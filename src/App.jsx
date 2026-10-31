// ---- App shell: state routing (as DetectDock), tab bar, current place, live data, onboarding ----
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, Component } from "react";
import { AppCtx, loadSettings, saveSettings, applyTheme } from "./lib/store.js";
import { SPOTS, spotById } from "./data/spots.js";
import { SPECIES, speciesById } from "./data/species.js";
import { getConditions, getTides, getRiver, PREVIEW, track } from "./lib/api.js";
import { tideModel } from "./lib/tides.js";
import { nationAt, setDistanceUnit } from "./lib/geo.js";
import { activeSession, onSessionChange, recoverSession } from "./lib/session.js";
import { restore } from "./lib/account.js";
import { startSync } from "./lib/sync.js";
import { Icon, Toast } from "./components/ui.jsx";
import Home from "./pages/Home.jsx";
import Onboarding from "./components/Onboarding.jsx";
import PlacePicker from "./components/PlacePicker.jsx";

const Explore = lazy(() => import("./pages/Explore.jsx"));
const Tackle = lazy(() => import("./pages/Tackle.jsx"));
const Catches = lazy(() => import("./pages/Catches.jsx"));
const Community = lazy(() => import("./pages/Community.jsx"));
const Live = lazy(() => import("./pages/Live.jsx"));
const CastAdvisor = lazy(() => import("./pages/CastAdvisor.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "explore", label: "Explore", icon: "explore" },
  { id: "tackle", label: "Bait & Rigs", icon: "tackle" },
  { id: "catches", label: "Catches", icon: "catches" },
  { id: "community", label: "Community", icon: "users" },
];
// Screens that aren't tabs light their parent tab, as DetectDock's MOBILE_PARENTS does.
const PARENT = { live: "home", cast: "home", settings: "home", admin: "home" };
const ROUTES = new Set(["home", "explore", "tackle", "catches", "community", "live", "cast", "settings", "admin"]);

class ScreenBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="col" style={{ paddingTop: 24 }}>
        <div className="card"><h2>This screen hit a problem</h2>
          <p className="muted small">Your catches and sessions are safe on this phone. Try again, or go back to Home.</p>
          <div className="row"><button className="btn" type="button" onClick={() => this.setState({ err: null })}>Try again</button><button className="btn ghost" type="button" onClick={() => { this.setState({ err: null }); this.props.onHome(); }}>Home</button></div>
        </div>
      </div>
    );
  }
}

function routeFromHash() {
  const h = (location.hash || "").replace(/^#\/?/, "");
  return ROUTES.has(h) ? h : "home";
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  setDistanceUnit(settings.units?.distance); // before any child formats a distance this render
  const [tab, setTab] = useState(routeFromHash);
  const [picker, setPicker] = useState(false);
  const [toast, setToast] = useState("");
  const [live, setLive] = useState({ cond: null, tides: null, river: null, loading: false });
  const [session, setSession] = useState(activeSession());
  const [nav, setNav] = useState(null); // optional payload for the next screen (e.g. species to open)

  useEffect(() => { applyTheme(settings.theme); saveSettings(settings); }, [settings]);
  useEffect(() => onSessionChange(() => setSession(activeSession())), []);
  useEffect(() => { restore().then(startSync); recoverSession(); }, []);
  useEffect(() => {
    const on = () => setTab(routeFromHash());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);
  const go = useCallback((id, payload = null) => {
    setNav(payload);
    setTab(id);
    if (location.hash.replace("#", "") !== id) history.pushState(null, "", id === "home" ? location.pathname + location.search : "#" + id);
    window.scrollTo({ top: 0 });
  }, []);
  const say = useCallback((t) => { setToast(t); clearTimeout(say.t); say.t = setTimeout(() => setToast(""), 2600); }, []);

  // ---- the current place: a verified spot, or the angler's own location (never shared) ----
  const place = useMemo(() => {
    if (settings.placeId === "custom" && settings.custom) return { id: "custom", ...settings.custom, verified: false };
    const s = spotById(settings.placeId) || SPOTS[0];
    return { ...s, verified: true };
  }, [settings.placeId, settings.custom]);
  const nation = settings.nation !== "auto" ? settings.nation : place.nation || nationAt(place.lat, place.lon);

  useEffect(() => {
    let cancelled = false;
    setLive((l) => ({ ...l, loading: true }));
    (async () => {
      const [cond, tides, river] = await Promise.all([
        getConditions(place.lat, place.lon),
        place.kind === "sea" ? getTides(place.lat, place.lon) : Promise.resolve(null),
        place.kind === "river" ? getRiver(place.lat, place.lon) : Promise.resolve(null),
      ]);
      if (!cancelled) setLive({ cond, tides, river, loading: false });
    })();
    track(`area_view:${(place.region || "custom").slice(0, 30)}`);
    return () => { cancelled = true; };
  }, [place.lat, place.lon, place.kind, place.region]);

  const tide = useMemo(() => (place.kind === "sea" ? tideModel(place, live.tides) : null), [place, live.tides]);

  const ctx = {
    settings, update, go, say, place, nation, live, tide, session, preview: PREVIEW, nav,
    openPicker: () => setPicker(true),
    species: SPECIES, speciesById,
  };

  const active = PARENT[tab] || tab;
  const show = !settings.onboarded ? "onboarding" : tab;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {show === "onboarding" ? <Onboarding onDone={() => update({ onboarded: true })} /> : (
          <ScreenBoundary key={tab} onHome={() => go("home")}>
            <Suspense fallback={<div className="col" style={{ paddingTop: 40 }}><div className="loading-dots" aria-label="Loading" /></div>}>
              {tab === "home" && <Home />}
              {tab === "explore" && <Explore />}
              {tab === "tackle" && <Tackle />}
              {tab === "catches" && <Catches />}
              {tab === "community" && <Community />}
              {tab === "live" && <Live />}
              {tab === "cast" && <CastAdvisor />}
              {tab === "settings" && <Settings />}
              {tab === "admin" && <Admin />}
            </Suspense>
          </ScreenBoundary>
        )}
      </div>
      {session && tab !== "live" && settings.onboarded ? (
        <button type="button" className="live-pill" onClick={() => go("live")}>
          <span className="rec-dot" aria-hidden="true" />Fishing live · tap to return
        </button>
      ) : null}
      {settings.onboarded ? (
        <nav className="tabbar" aria-label="Main">
          <div className="tabbar-in">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="tab" data-tab={t.id} aria-current={active === t.id ? "page" : undefined} onClick={() => go(t.id)}>
                <span className="pillwrap"><Icon name={t.icon} /></span>
                <span className="lbl">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      ) : null}
      {picker ? <PlacePicker onClose={() => setPicker(false)} /> : null}
      <Toast text={toast} />
    </AppCtx.Provider>
  );
}
