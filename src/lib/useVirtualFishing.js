// ---- useVirtualFishing: the angler's side of virtual fishing (the demo and Fish Together) ----
// Cast (with the power and aim you chose), and a fish bites by itself after a while (sooner for quick, plentiful
// fish); strike in time (too soon or too late and it can let go); then tap the reel to wind it in while it fights
// back (reelModel.js): watch the line's tension, let the drag do its work through a run, and land it once it's close.
// Tapping in an even rhythm winds best (reelModel.js rhythm). Pressing and holding the Reel button winds at an even rate
// for as long as it's held, a little slower than good tapping (on unless turned off; a hold starts a quarter of a
// second into a press, so quick taps are taps), and Assisted reeling (an option) winds steadily after one tap, for
// anyone who can't tap or hold. Every catch
// made here is simulated and says so (data.simulated), and nothing here is ever saved as a real catch.
import { useCallback, useEffect, useRef, useState } from "react";
import { DUR } from "./liveEvents.js";
import { fightProfile, fightSeconds } from "./sceneActors.js";
import { createFight, fightStep, tapRate, rhythm, DRAG, strikeTiming } from "./reelModel.js";

// ---- reeling options, saved on this phone: Assisted reeling, and Advanced (set the drag yourself) ----
const OPT_KEY = "fishdock.reel";
export function loadReelOpts() { try { const v = JSON.parse(localStorage.getItem(OPT_KEY) || "{}"); return { assisted: !!v.assisted, advanced: !!v.advanced, holdReel: v.holdReel !== false }; } catch { return { assisted: false, advanced: false, holdReel: true }; } }
// (holdReel, on unless turned off: holding the Reel button winds steadily for as long as it's held; tapping still works too)
export function saveReelOpts(o) { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch { /* ignore */ } }
export { strikeTiming };

let seq = 0;
export const virtualEvent = (type, data = null, who = null) => ({ id: `v_${Date.now().toString(36)}_${++seq}`, seq, t: Date.now(), type, data, ...(who ? { who } : {}) });

/** Seconds from the bait settling to a bite: quick, shoaling fish sooner, big predators later; a little random. */
export function biteDelay(species, rnd = Math.random) {
  const p = fightProfile(species);
  const base = p.pull < 0.8 ? 5 : p.pull > 1.3 ? 11 : 8;
  return Math.round((base * (0.6 + rnd() * 0.9)) * 10) / 10;
}
/** Seconds of reeling a fish needs (holding the reel), from how long that kind and size of fish fights. */
export const reelNeeded = (species, lengthCm) => Math.max(3, Math.round(fightSeconds(species, lengthCm) * 0.6 * 10) / 10);
/** One step of reeling: holding gains line (less while the fish surges); letting go, the fish takes some back. */
/** The page hears about the fight on every third of its twenty steps a second (the 3D view reads every one). */
export const FIGHT_UI_EVERY = 3;
export function reelStep(progress, dt, holding, { need = 6, surge = 0 } = {}) {
  const v = holding ? (1 - 0.6 * surge) / need : -0.12 * (0.5 + surge);
  return Math.max(0, Math.min(1, progress + v * dt));
}

export function useVirtualFishing({ species, name, lengthCm, auto = true, who = null, onEvent } = {}) {
  const [events, setEvents] = useState([]);
  const [reel, setReel] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const autoplayRef = useRef(false); autoplayRef.current = autoplay;
  const holding = useRef(false), timers = useRef([]), reelRef = useRef(0), fish = useRef({ species, name, lengthCm });
  // tapping the reel: recent tap times, the fight's state (reelModel.js), assisted winding on or off, the drag
  const live = useRef(null), tickN = useRef(0), flagsWas = useRef("");
  const taps = useRef([]), pending = useRef(0), fightRef = useRef(null), assistOn = useRef(false), dragRef = useRef(DRAG.standard), tapN = useRef(0);
  const [fight, setFight] = useState(null), [opts, setOptsNow] = useState(loadReelOpts), [note, setNote] = useState("");
  const optsRef = useRef(opts); optsRef.current = opts;
  const say = (t) => { setNote(t); setTimeout(() => setNote((n) => (n === t ? "" : n)), 2600); };
  fish.current = { species, name, lengthCm };
  const emit = useRef(onEvent); emit.current = onEvent;
  const add = useCallback((type, data = null) => {
    const e = virtualEvent(type, data, who);
    setEvents((list) => [...list, e]);
    emit.current?.(e);
    return e;
  }, [who]);
  const last = events.at(-1);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms, f) => { timers.current.push(setTimeout(f, ms)); };

  // what happens by itself after each step
  useEffect(() => {
    clearTimers();
    if (!last) return undefined;
    const f = fish.current;
    if (auto && (last.type === "cast" || last.type === "missed")) later((last.type === "cast" ? DUR.cast : DUR.missed) + biteDelay(f.species) * 1000, () => add("bite"));
    if (last.type === "bite") {
      if (autoplay) later(1100, () => add("hooked"));
      else later(DUR.bite - 700, () => add("missed")); // not struck in time: the fish lets go, the bait is still out
    }

    if (last.type === "catch" && autoplay) later(DUR.catch, () => setAutoplay(false));
    return clearTimers;
  }, [last?.id, autoplay]); // eslint-disable-line react-hooks/exhaustive-deps

  // the fight: tapping winds line in against the fish (reelModel.js), ten steps a second
  useEffect(() => {
    if (last?.type !== "hooked") { reelRef.current = 0; setReel(0); holding.current = false; assistOn.current = false; taps.current = []; fightRef.current = null; live.current = null; setFight(null); return undefined; }
    const f = fish.current, castEv = [...events].reverse().find((e) => e.type === "cast");
    fightRef.current = createFight({ species: f.species, lengthCm: f.lengthCm, startM: castEv?.data?.dist || 30, mode: optsRef.current.advanced ? "advanced" : "standard", seed: Math.floor(last.t % 100000) });
    let prev = performance.now(); pending.current = 0;
    // twenty steps a second; the taps made since the last one each wind in there and then
    const id = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.3, (now - prev) / 1000); prev = now;
      const assisted = assistOn.current || autoplayRef.current, hold = !assisted && holding.current && optsRef.current.holdReel !== false;
      const n = pending.current; pending.current = 0;
      const s = fightStep(fightRef.current, dt, { taps: n, rate: tapRate(taps.current, Date.now()), steady: rhythm(taps.current, Date.now()), hold, assisted, drag: dragRef.current });
      fightRef.current = s; reelRef.current = s.progress;
      const view = { progress: s.progress, dist: s.dist, tension: s.tension, slipping: s.slipping, near: s.near, drag: s.drag, turns: s.turns, taps: tapN.current, assisted, hold, steady: s.steady || 0, running: s.running, taking: s.taking, dashed: !!s.dashed, mode: s.mode, dir: s.dir, shake: s.shake, dive: s.dive, stamina: s.stamina };
      // (the 3D view reads this itself every frame, fightLive below. The page is only told six or seven times a second,
      // or at once when something it shows as a word changes: told all twenty, React drew the whole screen again
      // twenty times a second through every fight, between the frames and never in step with them)
      live.current = view;
      const flags = `${s.near}|${s.running}|${s.taking}|${s.slipping}|${s.mode}|${assisted}|${!!s.out}`;
      if (++tickN.current % FIGHT_UI_EVERY === 0 || flags !== flagsWas.current) { flagsWas.current = flags; setReel(s.progress); setFight(view); }
      if (s.out) { clearInterval(id); say(s.out === "broke" ? "The line broke. Ease the drag off when it runs." : "The hook came free. Keep the line tight."); add("lost", { why: s.out }); return; }
      if (s.near && autoplayRef.current) { clearInterval(id); land(); }
    }, 50);
    return () => clearInterval(id);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, []);
  const f = fish.current;
  const catchData = () => ({ species: f.species, name: f.name, lengthCm: f.lengthCm, released: true, simulated: true });
  function land() { if (last?.type === "hooked" || fightRef.current) { fightRef.current = null; add("catch", catchData()); } }
  return {
    events, reel, autoplay, last, fight, note, opts,
    /** The fight as it is this instant (a ref: read it, don't render from it). null when no fish is on. */
    fightLive: live,
    /** cast: optionally { dist (m), aim (radians from straight out), power (0..1) } from the 3D view's aim */
    cast: (d) => add("cast", d && Number.isFinite(d.dist) ? { dist: Math.round(d.dist * 10) / 10, aim: Math.round((d.aim || 0) * 1000) / 1000 } : null),
    strike: () => {
      // timing: right in the first moment of a bite, or as it's ending, and it can let go
      const bite = [...events].reverse().find((e) => e.type === "bite"), when = strikeTiming(Date.now() - (bite?.t || Date.now()));
      if (when !== "good" && Math.random() < (when === "early" ? 0.3 : 0.35)) { say(when === "early" ? "Too soon: it let go. Wait for the pull." : "Too late: it dropped the bait."); add("missed"); return; }
      add("hooked");
    },
    /** one tap of the reel (or, with Assisted reeling on, start or stop winding) */
    tap: () => {
      if (last?.type !== "hooked") return;
      if (optsRef.current.assisted) { assistOn.current = !assistOn.current; return; }
      const now = Date.now(); taps.current = [...taps.current.filter((t) => now - t < 2000), now]; tapN.current++; pending.current++;
    },
    land,
    /** wind the line in (between bites): ready to cast again or walk about; nothing happens if it isn't out */
    windIn: () => { if (last && (last.type === "cast" || last.type === "missed")) { clearTimers(); add("reelin"); return true; } return false; },
    setDrag: (d) => { dragRef.current = Math.max(DRAG.min, Math.min(DRAG.max, d)); },
    setOpts: (o) => { const next = { ...optsRef.current, ...o }; setOptsNow(next); saveReelOpts(next); },
    hold: (on) => { holding.current = !!on; },
    nudge: () => { if (last?.type !== "hooked") return; const now = Date.now(); taps.current = [...taps.current.filter((t) => now - t < 2000), now]; tapN.current++; pending.current++; }, // a key press: a tap
    reset: () => { clearTimers(); setAutoplay(false); setEvents([]); },
    playAll: () => { clearTimers(); setEvents([]); setAutoplay(true); setTimeout(() => add("cast"), 300); },
    stop: () => { clearTimers(); setAutoplay(false); setEvents([]); },
    // the testing panel: make something happen now
    biteNow: () => add("bite"),
    miss: () => add("missed"),
    lose: () => add("lost"),
    landNow: () => { fightRef.current = null; add("catch", catchData()); },
  };
}
