// Shared HTTP helpers for every /api route (Cloudflare Pages Functions).
//
// - Every answer is JSON with no-store caching; errors are { error: "<code>", message: "<plain English>" }.
// - Same-origin only (no CORS): every /api call carries `X-FishDock: 1` (a header a cross-site form or <img>
//   can't add), and every write also carries an Origin header for this site. Like DetectDock's X-DetectDock.
// - Request bodies are read with a size cap (server/body.js), never whole and then checked.

import { readCappedText } from "./body.js";

// ---- responses ----

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}
export const err = (status, code, message, extra = {}) => json({ error: code, message, ...extra }, status);

/**
 * A daily allowance or a flood throttle used up: 429, a Retry-After header and
 * { error: "rate_limited", kind: "daily", resetAt } or { kind: "slow", retryAfter }, with friendly words.
 */
export function limited(kind, resetAt, message, now = Date.now(), extra = {}) {
  const secs = Math.max(1, Math.ceil((Number(resetAt) - now) / 1000));
  const daily = kind === "daily";
  return json({
    error: "rate_limited",
    kind: daily ? "daily" : "slow",
    ...(daily ? { resetAt: Number(resetAt) } : { retryAfter: secs }),
    message: message || (daily ? "That's paused until tomorrow." : "Just a moment."),
    ...extra,
  }, 429, { "retry-after": String(secs) });
}

// ---- errors thrown inside handlers ----

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const fail = (status, code, message, extra) => new HttpError(status, code, message, extra);
/** A limit reached inside a handler (turned into limited() by toResponse). */
export const limitError = (kind, resetAt, message, extra = {}) => Object.assign(new HttpError(429, "rate_limited", message, extra), { limit: { kind, resetAt } });

/** The catch-all for a handler: known errors keep their words, anything else is a plain 500 (never internals). */
export function toResponse(e, now, label) {
  if (e?.limit) return limited(e.limit.kind, e.limit.resetAt, e.message, now, e.extra);
  if (e instanceof HttpError) return err(e.status, e.code, e.message, e.extra);
  console.error(`${label} error`, e?.message); // never request bodies, tokens or locations
  return err(500, "server_error", "Something went wrong on FishDock's server. Please try again.");
}

// ---- same-origin guard ----

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
export const isWrite = (request) => !["GET", "HEAD", "OPTIONS"].includes(request.method);
/** null when the request may go on, otherwise the 403 to answer. */
export function guard(request) {
  if (request.headers.get("x-fishdock") !== "1") return err(403, "forbidden", "Request blocked.");
  if (isWrite(request) && !sameOrigin(request)) return err(403, "forbidden", "Request blocked.");
  return null;
}

// ---- request parsing ----

export const BODY_LIMIT = 64 * 1024;
/** The body as a JSON object (an empty one for no body); 413 over `maxBytes`, 400 for anything that isn't JSON. */
export async function readJson(request, maxBytes = BODY_LIMIT) {
  const text = await readCappedText(request, maxBytes);
  if (text == null) throw fail(413, "too_large", "That's too much to send at once.");
  if (!text.trim()) return {};
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    throw fail(400, "bad_json", "The request couldn't be read.");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw fail(400, "bad_json", "The request couldn't be read.");
  return v;
}

/** Path segments after `/api/<name>/`, decoded; null if one can't be decoded. */
export function routePath(request, name) {
  const p = new URL(request.url).pathname.replace(new RegExp(`^/api/${name}/?`), "");
  try {
    return p.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

// UK and Irish waters, generously: FishDock is a UK app, and nothing outside this box is asked for upstream.
export const AREA = { minLat: 49, maxLat: 61.5, minLon: -11, maxLon: 2.5 };
/** { lat, lon } from ?lat=&lon= (lng and long accepted), or a 400. */
export function latLon(url) {
  const q = url.searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon") ?? q.get("lng") ?? q.get("long"));
  if (!q.get("lat") || !Number.isFinite(lat) || !Number.isFinite(lon) || (q.get("lon") ?? q.get("lng") ?? q.get("long")) == null) {
    throw fail(400, "bad_location", "Send a latitude and longitude (?lat=&lon=).");
  }
  if (lat < AREA.minLat || lat > AREA.maxLat || lon < AREA.minLon || lon > AREA.maxLon) {
    throw fail(400, "out_of_area", "FishDock covers the UK and its waters. That place is outside the area it can look up.");
  }
  return { lat, lon };
}

// ---- text ----

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;
/** Multi-line user text: control and bidi characters removed, at most one blank line in a row, trimmed and capped. */
export function cleanText(v, max) {
  if (v == null || typeof v === "object") return "";
  return String(v).replace(CTRL, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
/** One line of text: no control characters, no angle brackets, no em or en dashes (the site doesn't use them), capped. */
export function cleanLine(v, max) {
  if (typeof v !== "string") return "";
  return noDashes(v.replace(/[\u0000-\u001f\u007f<>]/g, " ")).replace(/\s+/g, " ").trim().slice(0, max);
}
/** Em and en dashes become commas, as DetectDock does for AI text. */
export const noDashes = (s) => String(s ?? "").replace(/\s*[\u2014\u2013]\s*/g, ", ");

// ---- small helpers ----

export const posInt = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
export function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const randomId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Bytes to standard base64 (chunked, safe for large images). */
export function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Standard base64 (or a data: URL) to bytes; null if it isn't base64. */
export function fromBase64(v) {
  if (typeof v !== "string") return null;
  const s = v.replace(/^data:image\/[a-z]+;base64,/i, "").replace(/\s+/g, "");
  if (!s || s.length % 4 === 1 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
const R_KM = 6371;
export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
export const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
