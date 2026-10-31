// ---- liveShare: the angler's side of private Live Fishing View links (server: server/live.js) ----
// Sharing is off until the angler turns it on. Then the phone sends small activity events and a state summary, never
// video or the GPS track: new events as they happen (a fraction of a second later), a heartbeat every 30 seconds,
// and everything not yet confirmed again after a drop-out, so viewers never miss or double up a catch. The owner
// key that lets this phone change the share stays on this phone. Phones pause web apps in the background, so
// viewers are told when the angler's phone has gone quiet rather than shown anything made up.
import { toShareEvents, photoId, countsAt } from "./liveEvents.js";
import { get } from "./storage.js";
import { PREVIEW } from "./api.js";

const KEY = "fishdock.liveShare.v1";
const subs = new Set();
let st = load();
let ctxFn = null, timer = null, beat = null, busy = false, fails = 0, lastSession = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
function save() { try { if (st) localStorage.setItem(KEY, JSON.stringify(st)); else localStorage.removeItem(KEY); } catch { /* ignore */ } }
function emit() { save(); for (const f of subs) f(st); }
export const onShare = (f) => { subs.add(f); f(st); return () => subs.delete(f); };
export const shareInfo = () => st;
export const watchUrl = (token) => `${location.origin}/#watch/${token}`;
/** What the Live screen knows that the session doesn't (name, scene, conditions, sky). */
export function setShareContext(fn) { ctxFn = fn; }

async function call(method, path, body) {
  if (PREVIEW) return { status: 0, body: { error: "preview", message: "Sharing needs FishDock's server, which the preview doesn't have." } };
  try {
    const res = await fetch(path, { method, headers: { accept: "application/json", "x-fishdock": "1", ...(st?.ownerKey ? { "x-fishdock-owner": st.ownerKey } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 0, body: { error: "unreachable", message: navigator.onLine === false ? "You're offline. FishDock will send updates when you're back." : "FishDock's server couldn't be reached." } };
  }
}

const activeLinks = () => (st?.links || []).filter((l) => l.active && l.expiresAt > Date.now());
const wantsExact = () => activeLinks().some((l) => l.perms?.location === "exact");
const wantsPhotos = () => activeLinks().some((l) => l.perms?.photos);

export function buildState(s) {
  const x = ctxFn?.(s) || {};
  return {
    status: s.status, startedAt: s.startedAt, pausedMs: s.pausedMs || 0, pausedAt: s.pausedAt || null, endedAt: s.endedAt || null,
    name: x.name || null, target: x.target || null, method: s.method || null,
    place: { label: s.place?.name || null, area: s.place?.region || x.area || null, kind: s.place?.kind || "sea" },
    counts: countsAt(s.events), cond: x.cond || null, light: x.light || null,
    scene: s.scene ? { kind: s.scene.kind, view: s.scene.view, commons: s.scene.kind === "commons" ? s.scene.commons : null } : { kind: "representative" },
  };
}
function posOf(s) {
  if (!wantsExact() || !s.gpsAllowed || !s.lastFix || Date.now() - s.lastFix.t > 5 * 60e3) return null;
  return { lat: s.lastFix.lat, lon: s.lastFix.lon, acc: s.lastFix.acc };
}

/** Turns sharing on for a running session (makes the share; links come next). */
export async function startSharing(session) {
  if (st && st.sessionId === session.id) return { ok: true };
  if (st) await stopSharing();
  const events = toShareEvents(session);
  const r = await call("POST", "/api/live/shares", { state: buildState(session), events });
  if (r.status !== 201) return { error: r.body.error || "failed", message: r.body.message || "Sharing couldn't start." };
  st = { shareId: r.body.share.id, ownerKey: r.body.ownerKey, sessionId: session.id, acked: r.body.accepted || [], links: [], tokens: {}, watching: 0, lastOk: Date.now(), error: null, scene: null, photos: [] };
  emit();
  lastSession = session;
  syncScene(session);
  heartbeat();
  return { ok: true };
}

export async function stopSharing() {
  if (!st) return { ok: true };
  const r = await call("DELETE", `/api/live/shares/${st.shareId}`);
  if (r.status !== 200 && r.status !== 404 && r.status !== 403) return { error: r.body.error, message: r.body.message || "Couldn't stop sharing. Try again." };
  st = null; clearTimeout(timer); clearInterval(beat); beat = null;
  emit();
  return { ok: true };
}

export async function createLink({ label, expiry, passcode, perms }) {
  if (!st) return { error: "not_sharing", message: "Start sharing first." };
  const r = await call("POST", `/api/live/shares/${st.shareId}/links`, { label, expiry, passcode: passcode || null, perms });
  if (r.status !== 201) return { error: r.body.error, message: r.body.message || "The link couldn't be made." };
  st.links = [...(st.links || []), r.body.link];
  st.tokens = { ...(st.tokens || {}), [r.body.link.id]: r.body.token };
  emit();
  if (lastSession) { if (perms?.location === "exact" || perms?.photos) push(lastSession); }
  return { link: r.body.link, url: watchUrl(r.body.token) };
}
export async function revokeLink(id) {
  const r = await call("DELETE", `/api/live/shares/${st.shareId}/links/${id}`);
  if (r.status !== 200) return { error: r.body.error, message: r.body.message || "Couldn't remove that link." };
  st.links = r.body.links; st.watching = r.body.watching;
  const tokens = { ...(st.tokens || {}) }; delete tokens[id]; st.tokens = tokens;
  emit();
  return { ok: true };
}
export async function updateLink(id, perms) {
  const r = await call("PUT", `/api/live/shares/${st.shareId}/links/${id}`, { perms });
  if (r.status !== 200) return { error: r.body.error, message: r.body.message || "Couldn't change that link." };
  st.links = r.body.links; st.watching = r.body.watching; emit();
  if (lastSession) push(lastSession);
  return { ok: true };
}
export async function refreshLinks() {
  if (!st) return;
  const r = await call("GET", `/api/live/shares/${st.shareId}`);
  if (r.status === 200) { st.links = r.body.links; st.watching = r.body.watching; emit(); }
  else if (r.status === 404 || r.status === 403) { st = null; emit(); }
}

/** The backdrop: the angler's own photo goes up once per photo (re-encoded on the phone: no EXIF or GPS). */
async function syncScene(session) {
  if (!st || !session?.scene) return;
  const sc = session.scene;
  if (sc.kind !== "own" || !sc.photoKey) return;
  const tag = `${sc.photoKey}|${sc.photoV || 0}`;
  if (st.scene === tag) return;
  const rec = await get("photos", sc.photoKey).catch(() => null);
  if (!rec?.dataUrl) return;
  const r = await call("PUT", `/api/live/shares/${st.shareId}/scene`, { photo: rec.dataUrl.split(",")[1] });
  if (r.status === 200) { st.scene = tag; emit(); }
}
/** Catch photos go up only while a link allows photos, and only the ones in this session. */
async function syncPhotos(session) {
  if (!st || !wantsPhotos()) return;
  for (const e of session.events || []) {
    if (e.type !== "catch" || !e.data?.photo || !e.data.catchId) continue;
    const pid = photoId(e.data.catchId);
    if ((st.photos || []).includes(pid)) continue;
    const rec = await get("catches", e.data.catchId).catch(() => null);
    if (!rec?.photo) continue;
    const r = await call("PUT", `/api/live/shares/${st.shareId}/photos/${pid}`, { photo: rec.photo.split(",")[1] });
    if (r.status === 200) { st.photos = [...(st.photos || []), pid]; emit(); }
  }
}

async function push(session) {
  if (!st || !session || session.id !== st.sessionId || busy) return;
  busy = true;
  try {
    const acked = new Set(st.acked || []);
    const events = toShareEvents(session).filter((e) => !acked.has(e.id)).slice(0, 200);
    const r = await call("POST", `/api/live/shares/${st.shareId}/push`, { state: buildState(session), events, pos: posOf(session) });
    if (r.status === 200) {
      st.acked = [...acked, ...(r.body.accepted || [])].slice(-4000);
      st.links = r.body.links || st.links; st.watching = r.body.watching || 0;
      st.lastOk = Date.now(); st.error = null; fails = 0;
      emit();
      syncScene(session); syncPhotos(session);
      if (events.length === 200) schedule(session, 200);
    } else if (r.status === 404 || r.status === 403 || r.status === 410) {
      st = { ...st, error: r.body.message || "This share has ended.", ended: true }; emit();
    } else {
      fails++; st.error = r.body.message || "Updates are waiting to send."; emit();
      schedule(session, Math.min(60e3, 2000 * 2 ** Math.min(fails, 5)));
    }
  } finally { busy = false; }
}
function schedule(session, ms = 350) { clearTimeout(timer); timer = setTimeout(() => push(session), ms); }
function heartbeat() {
  clearInterval(beat);
  beat = setInterval(() => { if (lastSession && st && !st.ended) push(lastSession); }, 30e3);
}

/** Called with the session whenever it changes (Live.jsx). */
export function sessionChanged(session) {
  if (!session) return;
  lastSession = session;
  if (!st || st.sessionId !== session.id || st.ended) return;
  if (!beat) heartbeat();
  schedule(session);
}
/** A session that has ended still sends its final state once. */
export function sessionEnded(session) {
  if (!st || st.sessionId !== session?.id) return;
  lastSession = session;
  push(session).then(() => { clearInterval(beat); beat = null; });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && lastSession) schedule(lastSession, 50); });
  addEventListener("online", () => { if (lastSession) schedule(lastSession, 50); });
}
