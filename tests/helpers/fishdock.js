// Test harness for FishDock's server modules: a fresh SQLite-backed D1 stand-in, stubbed sign-in, a stubbed
// globalThis.fetch (any call to a URL a test didn't expect fails the test: no real network), and a small client.
import { createD1 } from "./d1.js";
import { resetSchemaForTests } from "../../server/db.js";
import { resetAccountsForTests } from "../../server/account.js";
import { resetThrottleForTests } from "../../server/throttle.js";
import { resetIpKeysForTests } from "../../server/ipKey.js";
import { resetSyncForTests } from "../../server/sync.js";

export const O = "https://fishdock.example";
// 31 Oct 2026 12:00 UTC: UK winter time (the clocks went back on 25 Oct), so UK time is UTC.
export const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);

/** The accounts the stubbed verifier knows, by token. */
export function accounts(now = T0) {
  return {
    "tok-alice": { uid: "alice", email: "alice@example.com", emailVerified: true, provider: "google.com", authTime: now },
    "tok-bob": { uid: "bob", email: "bob@example.com", emailVerified: true, provider: "google.com", authTime: now },
    "tok-carol": { uid: "carol", email: "carol@example.com", emailVerified: true, provider: "apple.com", authTime: now },
    "tok-erin": { uid: "erin", email: "erin@example.com", emailVerified: true, provider: "password", authTime: now },
    "tok-dave": { uid: "dave", email: "dave@example.com", emailVerified: false, provider: "password", authTime: now },
    "tok-anon": { uid: "anon1", email: null, emailVerified: false, provider: "anonymous", authTime: now },
    "tok-admin": { uid: "admin1", email: "Boss@FishDock.example", emailVerified: true, provider: "google.com", authTime: now },
    "tok-uidadmin": { uid: "admin2", email: "other@example.com", emailVerified: true, provider: "password", authTime: now },
    "tok-oldadmin": { uid: "admin3", email: "old@fishdock.example", emailVerified: true, provider: "google.com", authTime: now - 3600e3 },
  };
}

/**
 * Replaces globalThis.fetch for the rest of the test. `routes` is a list of [RegExp | (url, init) => bool, handler];
 * a handler returns a Response, or a value sent as JSON. Every call is recorded in `calls`.
 */
const realFetch = globalThis.fetch;
export function stubFetch(t, routes = []) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init, headers: new Headers(init.headers || {}) });
    for (const [match, handler] of routes) {
      if (match instanceof RegExp ? match.test(url) : match(url, init)) {
        const r = await handler(url, init);
        return r instanceof Response ? r : new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
      }
    }
    throw new Error("unexpected network call in a test: " + url);
  };
  t.after(() => { globalThis.fetch = realFetch; });
  return { calls, count: (re) => calls.filter((c) => re.test(c.url)).length };
}

/** A Cache API stand-in (match / put by URL), to check the edge cache path. */
export function memoryCache() {
  const m = new Map();
  return {
    store: m,
    async match(req) { const hit = m.get(req.url); return hit ? new Response(hit.body, { headers: hit.headers }) : undefined; },
    async put(req, res) { m.set(req.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  };
}

export function setup({ env = {}, db = true, users = null, cache = null } = {}) {
  resetSchemaForTests();
  resetAccountsForTests();
  resetThrottleForTests();
  resetIpKeysForTests();
  resetSyncForTests();
  const e = { ...(db ? { DB: createD1() } : {}), ...env };
  let now = T0;
  const tokens = users ?? accounts(now);
  const deps = { verifyIdToken: async (tok) => tokens[tok] ?? null, cache };
  const call = (fn, prefix) => async (method, path = "", { tok, body, headers = {}, ip = "203.0.113.5", fishdock = true, origin = O } = {}) => {
    const h = { "cf-connecting-ip": ip, ...headers };
    if (fishdock) h["x-fishdock"] = "1";
    if (origin) h.origin = origin;
    if (tok) h.authorization = "Bearer " + tok;
    if (body !== undefined) h["content-type"] = "application/json";
    const req = new Request(O + prefix + path, { method, headers: h, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
    const res = await fn(req, e, now, deps);
    const ct = res.headers.get("content-type") || "";
    const raw = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, text: new TextDecoder().decode(raw), raw, body: ct.includes("json") ? JSON.parse(new TextDecoder().decode(raw)) : raw };
  };
  return { env: e, db: e.DB, deps, tokens, call, tick: (ms) => (now += ms), now: () => now };
}

/** A small valid JPEG with EXIF (GPS) and a comment, as a phone might send. */
export function jpeg({ w = 1200, h = 900 } = {}) {
  const seg = (m, payload) => [0xff, m, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
  const txt = (s) => [...Buffer.from(s, "binary")];
  return new Uint8Array([0xff, 0xd8, ...seg(0xe0, txt("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    ...seg(0xe1, txt("Exif\0\0GPSLatitude=50.6123 GPSLongitude=-2.4567 Make=PhoneCo")), ...seg(0xfe, txt("Secret mark by the groyne")),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]), ...seg(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0x56, 0xff, 0xd9]);
}
export const b64 = (u8) => Buffer.from(u8).toString("base64");
