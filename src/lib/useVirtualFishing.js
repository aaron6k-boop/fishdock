// ---- useVirtualFishing: the angler's side of virtual fishing (the demo now, Fish Together later) ----
// Cast, and a fish bites by itself after a while (sooner for quick, plentiful fish); strike before the bite passes
// or it's missed and the bait stays out; then hold to reel while the fish fights back, until it's landed. Every
// catch made here is simulated and says so (data.simulated), and nothing here is ever saved as a real catch.
import { useCallback, useEffect, useRef, useState } from "react";
import { DUR } from "./liveEvents.js";
import { fightProfile, fightSeconds } from "./sceneActors.js";

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
export function reelStep(progress, dt, holding, { need = 6, surge = 0 } = {}) {
  const v = holding ? (1 - 0.6 * surge) / need : -0.12 * (0.5 + surge);
  return Math.max(0, Math.min(1, progress + v * dt));
}

export function useVirtualFishing({ species, name, lengthCm, auto = true, who = null, onEvent } = {}) {
  const [events, setEvents] = useState([]);
  const [reel, setReel] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const holding = useRef(false), timers = useRef([]), reelRef = useRef(0), fish = useRef({ species, name, lengthCm });
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
    if (last.type === "hooked" && autoplay) holding.current = true;
    if (last.type === "catch" && autoplay) later(DUR.catch, () => setAutoplay(false));
    return clearTimers;
  }, [last?.id, autoplay]); // eslint-disable-line react-hooks/exhaustive-deps

  // reeling: a steady tick while a fish is on
  useEffect(() => {
    if (last?.type !== "hooked") { reelRef.current = 0; setReel(0); holding.current = false; return undefined; }
    const f = fish.current, need = reelNeeded(f.species, f.lengthCm), prof = fightProfile(f.species), t0 = performance.now();
    let prev = t0;
    const id = setInterval(() => {
      const now = performance.now(), dt = (now - prev) / 1000, age = (now - t0) / 1000;
      prev = now;
      const surge = Math.max(0, Math.sin(age * 0.95 * prof.tempo + 1.3)) ** 6;
      reelRef.current = reelStep(reelRef.current, dt, holding.current, { need, surge });
      setReel(reelRef.current);
      if (reelRef.current >= 1) { holding.current = false; clearInterval(id); add("catch", { species: f.species, name: f.name, lengthCm: f.lengthCm, released: true, simulated: true }); }
    }, 100);
    return () => clearInterval(id);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => clearTimers, []);
  const f = fish.current;
  return {
    events, reel, autoplay, last,
    cast: () => add("cast"),
    strike: () => add("hooked"),
    hold: (on) => { holding.current = !!on; },
    nudge: () => { reelRef.current = Math.min(0.999, reelRef.current + 0.12); setReel(reelRef.current); }, // a tap or a key press: a turn of the handle
    reset: () => { clearTimers(); setAutoplay(false); setEvents([]); },
    playAll: () => { clearTimers(); setEvents([]); setAutoplay(true); setTimeout(() => add("cast"), 300); },
    stop: () => { clearTimers(); setAutoplay(false); setEvents([]); },
    // the testing panel: make something happen now
    biteNow: () => add("bite"),
    miss: () => add("missed"),
    lose: () => add("lost"),
    landNow: () => add("catch", { species: f.species, name: f.name, lengthCm: f.lengthCm, released: true, simulated: true }),
  };
}
