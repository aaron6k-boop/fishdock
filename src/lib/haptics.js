// ---- haptics: feeling the fishing through the phone (Beta) ----
// One service for everything FishDock makes you feel. The fishing scenes (3D and photo) call feel() at the moments the
// simulation itself produces (the cast leaving, the lead hitting the water, each tap of a bite, each surge of a fight,
// the landing), so a pattern always matches what's on screen. Real trips only ever feel what was actually recorded.
//
// What the phone can do:
// - Android browsers: the Vibration API (on/off timings only: no control of motor strength, so the presets change how
//   long and how many pulses, not how hard).
// - iPhone Safari: no vibration from web pages at all (navigator.vibrate doesn't exist). Nothing pretends otherwise:
//   a soft pulse at the edge of the screen stands in (with the sounds the scenes already play).
// - A future native app: it injects window.FishDockNative.haptics.play(pattern), where a pattern is a list of pulses
//   { at, ms, power 0..1, sharp 0..1 } — the shape Core Haptics events take (transient or continuous events with
//   intensity and sharpness), so precise patterns carry straight over.
// No React here: the settings screen and the scenes use it, and the tests run it without installing anything.

export const HAPTIC_DEFAULTS = { on: true, strength: "normal", scope: "full", party: true, saver: false, visual: true };
export const STRENGTHS = ["off", "subtle", "normal", "strong"];
export const SCOPES = { bites: "Fish bites only", catches: "Bites and catches", full: "Full fishing feedback" };
const KEY = "fishdock.haptics.v1";

export function loadHaptics() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") return { ...HAPTIC_DEFAULTS, ...s }; } catch { /* storage blocked */ }
  return { ...HAPTIC_DEFAULTS };
}
export function saveHaptics(s) { try { localStorage.setItem(KEY, JSON.stringify({ ...HAPTIC_DEFAULTS, ...s })); } catch { /* storage blocked */ } }

/** What this phone can do: "native" (a FishDock app), "vibration" (the Vibration API) or "none" (iPhone Safari and others). */
export function hapticSupport(nav = globalThis.navigator, win = globalThis.window) {
  const native = typeof win?.FishDockNative?.haptics?.play === "function";
  const ua = nav?.userAgent || "", ios = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);
  const vibrate = typeof nav?.vibrate === "function" && !ios;
  return { kind: native ? "native" : vibrate ? "vibration" : "none", ios, native, vibrate };
}

// ---- the patterns: a small set, each told apart by rhythm ----
// A pulse: { at: ms from the start, ms: how long, power: 0..1, sharp: 0..1 }. Built from the moment's own data.
const P = (at, ms, power = 0.6, sharp = 0.5) => ({ at, ms, power, sharp });
const seq = (...parts) => { const out = []; let t = 0; for (const [ms, gap = 0, power = 0.6, sharp = 0.5] of parts) { out.push(P(t, ms, power, sharp)); t += ms + gap; } return out; };

/** The size class of a fish for its bite: small, medium or large (from its length, or how hard the species pulls). */
export function sizeClass({ lengthCm = null, pull = 1 } = {}) {
  if (lengthCm != null) return lengthCm < 30 ? "small" : lengthCm < 55 ? "medium" : "large";
  return pull < 0.7 ? "small" : pull < 1.15 ? "medium" : "large";
}

// how each species feels on the line (bite rhythm and fight)
const FEEL = {
  whiting: "quick", pouting: "quick", dab: "flat", plaice: "flat", flounder: "flat", sole: "flat",
  mackerel: "jittery", garfish: "jittery", "black-bream": "quick", perch: "quick",
  cod: "heavy", pollack: "heavy", coalfish: "heavy", "ballan-wrasse": "heavy", conger: "heavy", tope: "heavy", smoothhound: "heavy",
  bass: "bursty", "thick-lipped-mullet": "bursty",
  "thornback-ray": "ray",
};
export const feelOf = (species) => FEEL[species] || null;

/** The pattern for a moment, or null when there's nothing to feel. Pure (tested). */
export function patternFor(name, d = {}) {
  const feel = feelOf(d.species), size = sizeClass(d);
  switch (name) {
    case "release": return seq([16, 0, 0.35, 0.7]);                                  // the line leaving the reel
    case "splashdown": return seq([26, 0, 0.5, 0.3]);                                // the lead hitting the water
    case "bite": {                                                                   // the first knock of a bite
      if (feel === "quick") return seq([14, 45, 0.35, 0.9], [14, 0, 0.35, 0.9]);
      if (feel === "jittery") return seq([18, 30, 0.45, 0.9], [12, 55, 0.4, 0.9], [22, 0, 0.5, 0.9]);
      if (feel === "flat") return seq([18, 160, 0.3, 0.4], [18, 0, 0.3, 0.4]);
      if (feel === "ray") return seq([40, 320, 0.5, 0.2], [80, 0, 0.7, 0.2]);
      if (feel === "heavy") return seq([70, 120, 0.75, 0.25], [110, 0, 0.85, 0.2]);
      if (feel === "bursty") return seq([45, 40, 0.8, 0.8], [120, 0, 0.9, 0.6]);
      return size === "small" ? seq([18, 70, 0.4, 0.8], [18, 0, 0.4, 0.8]) : size === "medium" ? seq([35, 70, 0.6, 0.6], [35, 0, 0.6, 0.6]) : seq([60, 50, 0.85, 0.4], [95, 0, 0.9, 0.3]);
    }
    case "tap": {                                                                    // each later tap of the same bite
      const a = Math.max(0, Math.min(1, (d.a || 0) * 9 + (d.b || 0) * 2));
      if (a < 0.2) return null;
      return seq([Math.round(12 + 40 * a * (feel === "heavy" || feel === "ray" ? 1.4 : feel === "quick" ? 0.6 : 1)), 0, 0.3 + 0.5 * a, feel === "heavy" ? 0.3 : 0.7]);
    }
    case "hooked": return seq([60, 40, 0.9, 0.7], [30, 0, 0.7, 0.7]);                // a firm strike: fish on
    case "missed": return seq([14, 90, 0.25, 0.5], [14, 0, 0.2, 0.5]);               // a soft miss
    case "pull": {                                                                   // a surge in the fight
      const ten = Math.max(0, Math.min(1.6, d.tension || 1));
      if (feel === "jittery") return seq([16, 35, 0.4, 0.9], [22, 30, 0.45, 0.9], [14, 0, 0.4, 0.9]);
      if (feel === "bursty") return (d.surge || 0) > 0.85 ? seq([40, 30, 0.85, 0.7], [110, 0, 0.95, 0.5]) : seq([30, 0, 0.55, 0.6]);
      if (feel === "flat") return seq([45, 0, 0.35, 0.2]);
      if (feel === "ray" || feel === "heavy") return seq([Math.round(70 + 60 * ten), 0, 0.6 + 0.25 * Math.min(1, ten), 0.2]);
      return seq([Math.round(30 + 50 * ten), 0, 0.45 + 0.3 * Math.min(1, ten), 0.5]);
    }
    case "run": return seq([22, 40, 0.6, 0.8], [40, 30, 0.75, 0.7], [18, 0, 0.5, 0.8]); // a sudden dash or a leap
    case "reel": return seq([10, 0, 0.2 + 0.25 * Math.min(1, d.load || 0.5), 0.6]);    // reeling under load
    case "landed": return seq([30, 60, 0.6, 0.6], [30, 60, 0.6, 0.6], [90, 0, 0.9, 0.4]); // a short, satisfying finish
    case "lost": return seq([90, 150, 0.7, 0.2], [20, 0, 0.3, 0.6]);                  // the line falling slack
    case "friendJoined": return seq([14, 0, 0.3, 0.6]);
    case "friendHooked": return seq([22, 70, 0.5, 0.7], [22, 70, 0.5, 0.7], [22, 0, 0.5, 0.7]);
    case "reaction": return seq([10, 0, 0.25, 0.8]);
    case "invite": return seq([18, 60, 0.4, 0.7], [18, 0, 0.4, 0.7]);
    case "alert": return seq([180, 80, 0.8, 0.5], [180, 0, 0.8, 0.5]);               // a Smart Bite alert (real fishing)
    case "button": return seq([25, 0, 0.4, 0.8]);                                    // logging something on a real trip
    case "test": return [...patternFor("bite", { lengthCm: 45 }), ...patternFor("landed").map((p) => ({ ...p, at: p.at + 700 }))];
    default: return null;
  }
}

// which moments belong to which choice of what to feel
const GROUP = {
  bites: new Set(["bite", "tap", "hooked", "missed", "alert", "test", "button"]),
  catches: new Set(["bite", "tap", "hooked", "missed", "landed", "lost", "alert", "test", "button"]),
  full: null, // everything
};
const PARTY = new Set(["friendJoined", "friendHooked", "reaction", "invite"]);
// a real trip feels only what someone actually logged: the bite, the fish on, the landing, the loss (never the
// taps, surges or reeling the animation fills in between)
export const RECORDED = new Set(["bite", "hooked", "landed", "lost", "missed", "alert", "button"]);
// the shortest time between two of the same kind, so nothing becomes a buzz
const GAP = { tap: 140, pull: 1200, run: 900, reel: 1600, friendJoined: 8000, friendHooked: 15000, reaction: 6000, invite: 6000, release: 400, splashdown: 400 };
const SAVER_SKIP = new Set(["release", "splashdown", "tap", "reel", "reaction", "friendJoined"]);
export const BUDGET_MS = { normal: 4000, saver: 1500 }; // most vibration in any minute

/** The Vibration API's on/off list for a pattern at a strength (the API can't set motor strength, so the presets
 *  lengthen or shorten pulses, and Subtle leaves out the faintest). Pure (tested). */
export function toVibration(pulses, strength = "normal") {
  if (!pulses?.length || strength === "off") return [];
  const k = strength === "subtle" ? 0.6 : strength === "strong" ? 1.45 : 1;
  const kept = pulses.filter((p) => strength !== "subtle" || p.power >= 0.3);
  const out = []; let t = 0;
  for (const p of kept) {
    const gap = Math.max(0, p.at - t), on = Math.round(Math.max(10, Math.min(400, p.ms * (0.7 + 0.5 * p.power) * k)));
    if (out.length) out.push(Math.max(20, gap)); else if (gap > 0) { out.push(0, gap); }
    out.push(on); t = p.at + p.ms;
  }
  return out;
}

/**
 * The service. createHaptics() makes one; the app uses the shared `haptics` below. feel(name, data) where data may
 * carry: species, lengthCm, pull, tension, surge, a, b, load, key (de-duplicates: a moment with a key already felt is
 * ignored, e.g. after reconnecting), real (this is a real trip: only RECORDED moments), recorded (this moment was
 * logged by a person), party (another angler's activity). Returns what it did, for tests.
 */
export function createHaptics({ nav = globalThis.navigator, win = globalThis.window, doc = globalThis.document, now = () => Date.now(), settings = null } = {}) {
  let S = settings ? { ...HAPTIC_DEFAULTS, ...settings } : loadHaptics();
  const last = new Map(), seen = new Set(), spent = []; // spent: [time, ms] in the last minute
  let reelTimer = null, visualEl = null;
  const support = () => hapticSupport(nav, win);

  function allowed(name, d, t) {
    if (!S.on || S.strength === "off") return "off";
    if (doc && doc.visibilityState === "hidden") return "hidden";                                  // never in the background
    if (nav?.userActivation && !nav.userActivation.hasBeenActive && name !== "test") return "no tap yet"; // browsers need a tap first
    if (PARTY.has(name) && !S.party) return "party off";
    if (GROUP[S.scope] && !GROUP[S.scope].has(name) && !PARTY.has(name)) return "not chosen";
    if (S.saver && SAVER_SKIP.has(name)) return "battery saver";
    if (S.saver && name === "pull" && (d.tension || 0) < 1) return "battery saver";
    if (d.real && !(RECORDED.has(name) && d.recorded)) return "real trip: not recorded";
    if (d.key) { if (seen.has(d.key)) return "already felt"; }
    const gap = (GAP[name] || 0) * (S.saver && name === "pull" ? 3.5 : 1);
    if (gap && t - (last.get(name) || -1e12) < gap) return "too soon";
    return null;
  }
  function budgetLeft(t) { while (spent.length && t - spent[0][0] > 60e3) spent.shift(); return (S.saver ? BUDGET_MS.saver : BUDGET_MS.normal) - spent.reduce((a, s) => a + s[1], 0); }
  function visualPulse(power) {
    if (!S.visual || !doc?.body) return false;
    try {
      if (!visualEl) { visualEl = doc.createElement("div"); visualEl.setAttribute("aria-hidden", "true"); visualEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000;border-radius:0;box-shadow:inset 0 0 0 0 rgba(126,232,222,0)"; doc.body.appendChild(visualEl); }
      const reduce = win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      visualEl.animate?.([{ boxShadow: "inset 0 0 0 0 rgba(126,232,222,0)" }, { boxShadow: `inset 0 0 ${Math.round(18 + 30 * power)}px ${Math.round(2 + 6 * power)}px rgba(126,232,222,${(reduce ? 0.25 : 0.45) * (0.5 + power / 2)})` }, { boxShadow: "inset 0 0 0 0 rgba(126,232,222,0)" }], { duration: reduce ? 260 : 420, easing: "ease-out" });
      return true;
    } catch { return false; }
  }

  const api = {
    get settings() { return { ...S }; },
    set(next) { S = { ...S, ...next }; saveHaptics(S); if (!S.on || S.strength === "off") api.stop(); },
    reload() { S = loadHaptics(); },
    support,
    feel(name, d = {}) {
      const t = now(), why = allowed(name, d, t);
      if (why) return { done: false, why };
      const pulses = patternFor(name, d);
      if (!pulses) return { done: false, why: "no pattern" };
      if (d.key) { seen.add(d.key); if (seen.size > 600) seen.delete(seen.values().next().value); }
      last.set(name, t);
      const cap = support();
      // the landing and an escape end any fight vibration still playing
      if (name === "landed" || name === "lost") api.stop(false);
      if (cap.kind === "native") { try { win.FishDockNative.haptics.play(pulses.map((p) => ({ ...p, power: Math.min(1, p.power * (S.strength === "subtle" ? 0.6 : S.strength === "strong" ? 1.25 : 1)) }))); return { done: true, how: "native", pulses }; } catch { /* fall through */ } }
      if (cap.kind === "vibration") {
        const v = toVibration(pulses, S.strength), ms = v.filter((_, i) => i % 2 === (v[0] === 0 ? 1 : 0)).reduce((a, b) => a + b, 0);
        if (budgetLeft(t) < ms && name !== "test" && name !== "landed" && name !== "lost") return { done: false, why: "minute's budget used" };
        try { nav.vibrate(v); spent.push([t, ms]); return { done: true, how: "vibration", pattern: v }; } catch { return { done: false, why: "vibration refused" }; }
      }
      // no vibration on this phone: a soft pulse at the edge of the screen for the moments that matter
      const strong = Math.max(...pulses.map((p) => p.power));
      if (["bite", "hooked", "landed", "lost", "friendHooked", "alert", "test"].includes(name) && visualPulse(strong)) return { done: true, how: "visual" };
      return { done: false, why: "no vibration" };
    },
    /** Reeling under load: a gentle tick every 1.6 s while the reel is held (stops by itself after 90 s). */
    reeling(on, d = {}) {
      clearInterval(reelTimer); reelTimer = null;
      if (!on) return;
      let n = 0; reelTimer = setInterval(() => { if (++n > 56) { clearInterval(reelTimer); reelTimer = null; return; } api.feel("reel", d); }, 1600);
    },
    stop(all = true) { if (all) { clearInterval(reelTimer); reelTimer = null; } try { if (support().kind === "vibration") nav.vibrate(0); } catch { /* ignore */ } },
  };
  return api;
}

/** The app's one haptics service (created on first use in the browser). */
let shared = null;
export const haptics = new Proxy({}, { get(_, k) { if (!shared) shared = createHaptics(); const v = shared[k]; return typeof v === "function" ? v.bind(shared) : v; } });
