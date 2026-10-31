// ---- api: the app's only door to live data and AI (/api/*). Keys stay on the server. ----
// In the phone preview (a claude.ai artifact) there is no server: every call answers { source: null, preview: true }
// and screens say plainly that live data connects on the deployed app. Nothing is ever made up.

/* global __PREVIEW__ */
export const PREVIEW = (typeof __PREVIEW__ !== "undefined" && __PREVIEW__ === true);

const memo = new Map();
const TTL = { conditions: 20 * 60e3, tides: 3 * 3600e3, river: 10 * 60e3 };

async function getJSON(path, { timeout = 9000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(path, { signal: ctl.signal, headers: { accept: "application/json", "x-fishdock": "1" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { source: null, error: body.error || `http_${res.status}`, message: body.message || "The live data service didn't answer." };
    return body;
  } catch (e) {
    return { source: null, error: navigator.onLine === false ? "offline" : "unreachable", message: navigator.onLine === false ? "You're offline." : "The live data service couldn't be reached." };
  } finally { clearTimeout(timer); }
}

async function cached(kind, lat, lon) {
  if (PREVIEW) return { source: null, preview: true };
  const key = `${kind}:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL[kind]) return hit.data;
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem("fd." + key) || "null"); } catch { /* ignore */ }
  if (stored && Date.now() - stored.at < TTL[kind]) { memo.set(key, stored); return stored.data; }
  const data = await getJSON(`/api/${kind}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (data.source) {
    const rec = { at: Date.now(), data };
    memo.set(key, rec);
    try { sessionStorage.setItem("fd." + key, JSON.stringify(rec)); } catch { /* ignore */ }
  } else if (stored) return { ...stored.data, stale: true };
  return data;
}

export const getConditions = (lat, lon) => cached("conditions", lat, lon);
export const getTides = (lat, lon) => cached("tides", lat, lon);
export const getRiver = (lat, lon) => cached("river", lat, lon);

/** UK places by name (towns, beaches, harbours, lakes), to move the map. Only the words are sent. */
export async function searchPlaces(q) {
  if (PREVIEW) return { results: [], preview: true };
  const key = `places:${q.trim().toLowerCase()}`;
  if (memo.has(key)) return memo.get(key).data;
  const data = await getJSON(`/api/places?q=${encodeURIComponent(q.trim())}`, { timeout: 8000 });
  if (Array.isArray(data.results)) memo.set(key, { at: Date.now(), data });
  return data;
}

/** A free-licensed photo and Wikipedia's summary for one FishDock species (kept in memory for the visit). */
export async function getFishInfo(id) {
  if (PREVIEW) return { preview: true, photo: null, extract: null };
  const key = `fishinfo:${id}`;
  if (memo.has(key)) return memo.get(key).data;
  const data = await getJSON(`/api/fishinfo?id=${encodeURIComponent(id)}`, { timeout: 12000 });
  if (!data.error) memo.set(key, { at: Date.now(), data });
  return data;
}

/** What water is at a tapped point (OpenStreetMap via the server). Kept in memory only, per point. */
export async function getWater(lat, lon) {
  if (PREVIEW) return { source: null, preview: true, kind: null };
  const key = `water:${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (memo.has(key)) return memo.get(key).data;
  const data = await getJSON(`/api/water?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { timeout: 16000 });
  if (data.source) memo.set(key, { at: Date.now(), data });
  return data;
}

export async function postJSON(path, body, token) {
  if (PREVIEW) return { error: "preview", message: "This needs the FishDock server, which the preview doesn't have." };
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-fishdock": "1", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `http_${res.status}`, message: data.message || "Something went wrong on the server.", ...data };
    return data;
  } catch {
    return { error: "unreachable", message: navigator.onLine === false ? "You're offline." : "FishDock's server couldn't be reached." };
  }
}

// ---- privacy-preserving usage counters (names only, no ids or coordinates) ----
const queue = [];
let flushTimer = null;
export function track(name) {
  if (PREVIEW) return;
  try { if (JSON.parse(localStorage.getItem("fishdock.settings.v1") || "{}")?.privacy?.analytics === false) return; } catch { /* default on */ }
  queue.push({ name: String(name).slice(0, 60) });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const events = queue.splice(0, 50);
    if (events.length) fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json", "x-fishdock": "1" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
  }, 4000);
}

export const sendFeedback = (kind, text, ref) => postJSON("/api/feedback", { kind, text, ref });

/** Authenticated GET/DELETE/PUT for account routes (sync, community writes, admin). */
export async function callJSON(method, path, token, body) {
  if (PREVIEW) return { error: "preview", message: "This needs FishDock's server, which the preview doesn't have." };
  try {
    const res = await fetch(path, { method, headers: { accept: "application/json", "x-fishdock": "1", ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `http_${res.status}`, message: data.message || "Something went wrong on the server.", status: res.status };
    return data;
  } catch {
    return { error: "unreachable", message: navigator.onLine === false ? "You're offline." : "FishDock's server couldn't be reached." };
  }
}
