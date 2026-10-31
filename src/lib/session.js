// ---- session: Live Fishing Mode (adapted from DetectDock's Field Mode tracker) ----
// GPS is recorded only while a session runs and only if the angler allows it. Everything stays on the phone.
import { put, get, newId } from "./storage.js";
import { track as metric } from "./api.js";

const POINTER = "fishdock.activeSession";
const GPS = { maxAccuracy: 30, maxSpeed: 6, minMove: 4, minGapMs: 20000, breakGapMs: 15000 };

let cur = null;
let watchId = null;
let wake = null;
let saveTimer = null;
const subs = new Set();
const emit = () => { for (const f of subs) f(cur); };
export const onSessionChange = (f) => { subs.add(f); return () => subs.delete(f); };
export const activeSession = () => (cur && cur.status !== "ended" ? cur : null);

function scheduleSave(now = false) {
  clearTimeout(saveTimer);
  const doSave = () => { if (cur) put("sessions", cur).catch(() => {}); };
  if (now) doSave(); else saveTimer = setTimeout(doSave, 4000);
}

const hav = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};

function onFix(p) {
  if (!cur || cur.status !== "running") return;
  const fix = { t: p.timestamp || Date.now(), lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) };
  cur.gps = { state: "ok", acc: fix.acc, at: fix.t };
  cur.lastFix = fix;
  if (fix.acc > GPS.maxAccuracy) { cur.gps.state = "weak"; emit(); return; }
  const last = cur.track[cur.track.length - 1];
  if (last) {
    const d = hav(last, fix), dt = (fix.t - last.t) / 1000;
    if (dt > 0 && d / dt > GPS.maxSpeed) { emit(); return; } // a jump, not a walk
    if (d < GPS.minMove && fix.t - last.t < GPS.minGapMs) { emit(); return; }
    if (fix.t - last.t > GPS.breakGapMs * 4) fix.g = 1; // a gap: never drawn as a line
  }
  cur.track.push(fix);
  scheduleSave();
  emit();
}

function startGps() {
  if (!cur?.gpsAllowed || watchId != null || !("geolocation" in navigator)) return;
  try {
    watchId = navigator.geolocation.watchPosition(onFix, (e) => {
      if (!cur) return;
      cur.gps = { state: e.code === 1 ? "denied" : "unavailable", at: Date.now() };
      emit();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  } catch { if (cur) { cur.gps = { state: "unavailable" }; emit(); } }
}
function stopGps() { if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ } watchId = null; } }

async function lockScreen() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch { wake = null; }
}
function unlockScreen() { try { wake?.release(); } catch { /* ignore */ } wake = null; }

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!cur || cur.status !== "running") return;
    if (document.visibilityState === "hidden") { cur.hiddenAt = Date.now(); scheduleSave(true); }
    else {
      if (cur.hiddenAt) { cur.backgroundMs = (cur.backgroundMs || 0) + (Date.now() - cur.hiddenAt); cur.hiddenAt = null; }
      lockScreen();
      emit();
    }
  });
  addEventListener("pagehide", () => scheduleSave(true));
}

export async function startSession({ place, species, method, gpsAllowed, conditions, scene }) {
  if (activeSession()) return cur;
  cur = {
    id: newId("ses"), status: "running", startedAt: Date.now(), endedAt: null, pausedMs: 0, pausedAt: null,
    place: { id: place.id, name: place.name, kind: place.kind, lat: place.lat, lon: place.lon, region: place.region || null },
    species: species || null, method: method || null, gpsAllowed: !!gpsAllowed, gps: { state: gpsAllowed ? "starting" : "off" },
    track: [], events: [], counts: { bites: 0, missed: 0, catches: 0, casts: 0, hooked: 0, lost: 0 }, backgroundMs: 0, private: true,
    scene: scene || null, // the Live Fishing View backdrop chosen for this session (kind and viewpoint; photos stay in their own store)
  };
  if (conditions) cur.events.push({ t: Date.now(), type: "conditions", data: conditions });
  try { localStorage.setItem(POINTER, cur.id); } catch { /* ignore */ }
  startGps();
  lockScreen();
  scheduleSave(true);
  metric("session_start");
  emit();
  return cur;
}

export function addEvent(type, data = {}) {
  if (!cur) return null;
  const ev = { id: newId("ev"), t: Date.now(), type, data };
  if (cur.lastFix && Date.now() - cur.lastFix.t < 60000 && cur.lastFix.acc <= 50) ev.pos = { lat: cur.lastFix.lat, lon: cur.lastFix.lon, acc: cur.lastFix.acc };
  cur.events.push(ev);
  if (type === "bite" || type === "smartbite") cur.counts.bites++;
  if (type === "missed") cur.counts.missed++;
  if (type === "catch") cur.counts.catches++;
  if (type === "cast") cur.counts.casts++;
  if (type === "hooked") cur.counts.hooked = (cur.counts.hooked || 0) + 1;
  if (type === "lost") cur.counts.lost = (cur.counts.lost || 0) + 1;
  scheduleSave(type !== "cast");
  emit();
  return ev;
}

export function undoLast(type) {
  if (!cur) return;
  for (let i = cur.events.length - 1; i >= 0; i--) {
    if (cur.events[i].type === type) {
      cur.events.splice(i, 1);
      const k = { bite: "bites", smartbite: "bites", missed: "missed", catch: "catches", cast: "casts", hooked: "hooked", lost: "lost" }[type];
      if (k) cur.counts[k] = Math.max(0, cur.counts[k] - 1);
      break;
    }
  }
  scheduleSave(); emit();
}

export function pauseSession() {
  if (!cur || cur.status !== "running") return;
  cur.status = "paused"; cur.pausedAt = Date.now();
  cur.events.push({ id: newId("ev"), t: cur.pausedAt, type: "pause", data: {} }); // for the Live Fishing View and replays
  stopGps(); unlockScreen(); scheduleSave(true); emit();
}
export function resumeSession() {
  if (!cur || cur.status !== "paused") return;
  cur.pausedMs += Date.now() - (cur.pausedAt || Date.now()); cur.pausedAt = null; cur.status = "running";
  cur.events.push({ id: newId("ev"), t: Date.now(), type: "resume", data: {} });
  startGps(); lockScreen(); scheduleSave(true); emit();
}
export async function endSession(summary = {}) {
  if (!cur) return null;
  if (cur.status === "paused") cur.pausedMs += Date.now() - (cur.pausedAt || Date.now());
  cur.status = "ended"; cur.endedAt = Date.now(); Object.assign(cur, summary);
  cur.events.push({ id: newId("ev"), t: cur.endedAt, type: "end", data: {} });
  stopGps(); unlockScreen();
  const done = cur;
  await put("sessions", done).catch(() => {});
  try { localStorage.removeItem(POINTER); } catch { /* ignore */ }
  cur = null; emit();
  return done;
}

/** Keeps the Live Fishing View's backdrop with the session, so its replay shows the same view. */
export function setSessionScene(scene) {
  if (!cur) return;
  cur.scene = scene; scheduleSave(true); emit();
}

export function setGpsAllowed(on) {
  if (!cur) return;
  cur.gpsAllowed = on;
  if (on && cur.status === "running") startGps(); else stopGps();
  if (!on) cur.gps = { state: "off" };
  scheduleSave(true); emit();
}

/** Restore a session after a reload (the page was closed or the phone restarted the browser). */
export async function recoverSession() {
  let id = null;
  try { id = localStorage.getItem(POINTER); } catch { /* ignore */ }
  if (!id) return null;
  const s = await get("sessions", id);
  if (!s || s.status === "ended") { try { localStorage.removeItem(POINTER); } catch { /* ignore */ } return null; }
  cur = s;
  if (cur.status === "running") { startGps(); lockScreen(); }
  emit();
  return cur;
}

export const elapsed = (s, now = Date.now()) => s ? Math.max(0, (s.endedAt || (s.status === "paused" ? s.pausedAt : now)) - s.startedAt - (s.pausedMs || 0)) : 0;

// ---- replay helpers (pure) ----
export function positionAt(track, t) {
  if (!track?.length) return null;
  if (t <= track[0].t) return track[0];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (b.t >= t) {
      if (b.g) return a; // never interpolate across a gap
      const f = (t - a.t) / (b.t - a.t);
      return { t, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
    }
  }
  return track[track.length - 1];
}
export const eventsUntil = (events, t) => (events || []).filter((e) => e.t <= t && e.type !== "conditions");
export function trackLengthM(track) {
  let m = 0;
  for (let i = 1; i < (track || []).length; i++) if (!track[i].g) m += hav(track[i - 1], track[i]);
  return m;
}
