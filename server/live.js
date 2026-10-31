// Live Fishing View sharing: private links for family and friends to watch a session as it happens.
//
// What travels: lightweight activity events (cast, bite, fish on, landed...) and a small state summary, never video,
// never the GPS track. The angler's phone sends them; viewers' phones poll for anything newer than the last event
// sequence number they have, so a reconnect never duplicates a catch or loses one (docs/LIVE-VIEW.md).
//
//   Angler (owner key, returned once when the share is made, kept on the phone; sent as X-FishDock-Owner):
//   POST   /api/live/shares                     { state, events, pos? } -> { share: { id }, ownerKey }
//   POST   /api/live/shares/:id/push            { state, events, pos? } -> { lastSeq, accepted, watching, links }
//   GET    /api/live/shares/:id                 links, who's watching
//   PUT    /api/live/shares/:id/scene           { photo: base64 JPEG | null }  the angler's own scene photo
//   PUT    /api/live/shares/:id/photos/:pid     { photo: base64 JPEG }  a catch photo (shown only on links that allow it)
//   POST   /api/live/shares/:id/links           { label, expiry, passcode?, perms } -> { link, token }  (token once)
//   PUT    /api/live/shares/:id/links/:lid      { perms }   DELETE revokes it at once
//   DELETE /api/live/shares/:id                 stop sharing: everything about the share is deleted
//
//   Viewer (no account; the link token is sent as X-FishDock-Link, never in a URL the server sees):
//   GET    /api/live/view?after=<seq>           state + events after <seq>, filtered by the link's permissions
//   POST   /api/live/unlock                     { passcode } -> { grant }  (then X-FishDock-Grant)
//   GET    /api/live/scene   GET /api/live/photo/:pid
//
// Security and privacy:
// - Owner keys, link tokens and passcode grants are random 256-bit values stored only as SHA-256 hashes; every
//   request is re-checked against the database, so revoking a link or stopping sharing works immediately.
//   Passcodes are stored as salted PBKDF2 hashes and attempts are throttled per link.
// - The server accepts a fixed whitelist of fields. Exact position is stored only when the angler sends it (the
//   phone sends it only while a link allows "exact location") and is only ever returned to such links. Place
//   labels that look like coordinates, grid references, postcodes or map links are dropped.
// - Photos are re-validated and stripped of EXIF / GPS and every other metadata segment before they're stored.
// - Viewers are counted with a hash of (link, a random per-browser id), kept for minutes; never network addresses.
// - Shares are deleted a day after their last link ends (at most 9 days after they start), or at once on stop.
// - Nothing here is public or reaches Community; the `liveShare` feature flag switches sharing off.

import { json, err, guard, readJson, toResponse, routePath, fail, cleanLine, randomId, sha256Hex, fromBase64, b64url, AREA } from "./http.js";
import { needDb, enforce } from "./db.js";
import { networkKey } from "./throttle.js";
import { sanitizeJpeg } from "./jpeg.js";
import { looksLikeLocation } from "./locationText.js";
import { getFlags } from "./flags.js";

export const LIVE = {
  expiries: { "4h": 4 * 3600e3, "12h": 12 * 3600e3, "24h": 86400e3, "3d": 3 * 86400e3, "7d": 7 * 86400e3 },
  maxShareMs: 9 * 86400e3, keepAfterMs: 24 * 3600e3, idleKeepMs: 12 * 3600e3,
  maxEvents: 3000, eventsPerPush: 200, viewPage: 400, linksPerShare: 10, photosPerShare: 40,
  sharesPerNetworkPerDay: 12, pushesPerMinute: 90, linksPerDay: 40, unlockTries: 8, unlockWindowMs: 15 * 60e3,
  viewsPerMinute: 70, watchingMs: 75e3, staleMs: 100e3, bodyBytes: 900 * 1024,
  scenePhotoBytes: 450 * 1024, catchPhotoBytes: 350 * 1024, photoMaxDim: 2048, labelMax: 40, nameMax: 30,
  pbkdf2: 10000,
};
export const EVENT_TYPES = ["cast", "bite", "smartbite", "missed", "hooked", "lost", "snag", "catch", "pause", "resume", "end"];
export const LINK_PERMS = { location: "area", photos: false, sizes: true, history: true };
export const LOCATION_MODES = ["exact", "area", "hidden"];
const STATUSES = ["running", "paused", "ended"];
const PLACE_KINDS = ["sea", "river", "canal", "lake", "still", "fishery", "estuary"];
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const EID_RE = /^[A-Za-z0-9_.:-]{4,48}$/;
const PID_RE = /^[A-Za-z0-9_-]{4,40}$/;
const SPECIES_RE = /^[a-z][a-z0-9-]{1,39}$/;

// ---- small helpers ----

const num = (v, lo, hi, dp = null) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < lo || n > hi) return null;
  return dp == null ? n : Math.round(n * 10 ** dp) / 10 ** dp;
};
const int = (v, lo, hi) => { const n = num(v, lo, hi); return n == null ? null : Math.round(n); };
const time = (v, now) => int(v, now - LIVE.maxShareMs, now + 5 * 60e3);
/** A short label: one line, no location-looking text (coordinates, grid refs, postcodes, map links). */
const label = (v, max = LIVE.labelMax) => { const s = cleanLine(v, max); return s && !looksLikeLocation(s) ? s : null; };
const hashOf = (kind, secret) => sha256Hex(`fishdock-live-${kind}|${secret}`);

export function cleanPerms(input, base = LINK_PERMS) {
  const p = { ...base };
  if (input && typeof input === "object") {
    if (LOCATION_MODES.includes(input.location)) p.location = input.location;
    for (const k of ["photos", "sizes", "history"]) if (typeof input[k] === "boolean") p[k] = input[k];
  }
  return p;
}

/** The share's state from the phone, rebuilt from a whitelist (anything else is dropped). */
export function cleanState(s, now) {
  s = s && typeof s === "object" ? s : {};
  const counts = {};
  for (const k of ["casts", "bites", "alerts", "missed", "hooked", "lost", "catches"]) counts[k] = int(s.counts?.[k], 0, 100000) ?? 0;
  const c = s.cond && typeof s.cond === "object" ? s.cond : {};
  const cond = {
    windKph: num(c.windKph, 0, 250, 0), gustKph: num(c.gustKph, 0, 300, 0), windDir: num(c.windDir, 0, 360, 0),
    waveM: num(c.waveM, 0, 30, 1), tempC: num(c.tempC, -30, 45, 0), precipMm: num(c.precipMm, 0, 200, 1),
    cloudPct: num(c.cloudPct, 0, 100, 0), isDay: c.isDay === 1 || c.isDay === true ? 1 : c.isDay === 0 || c.isDay === false ? 0 : null,
    tide: label(c.tide, 24), tideNext: c.tideNext && ["High", "Low"].includes(c.tideNext.type) ? { type: c.tideNext.type, t: time(c.tideNext.t, now + 2 * 86400e3) } : null,
    tideApprox: c.tideApprox === true, river: label(c.river, 40),
  };
  const l = s.light && typeof s.light === "object" ? s.light : {};
  const light = { sunAlt: num(l.sunAlt, -90, 90, 0), sunAz: num(l.sunAz, 0, 360, 0), moonAlt: num(l.moonAlt, -90, 90, 0), moonAz: num(l.moonAz, 0, 360, 0), moonIllum: num(l.moonIllum, 0, 1, 2) };
  const sc = s.scene && typeof s.scene === "object" ? s.scene : {};
  const v = sc.view && typeof sc.view === "object" ? sc.view : {};
  const pt = (q) => (Array.isArray(q) && q.length === 2 ? [num(q[0], -0.5, 1.5, 3), num(q[1], -0.5, 1.5, 3)] : null);
  const water = Array.isArray(v.water) ? v.water.slice(0, 8).map(pt).filter((q) => q && q[0] != null && q[1] != null) : null;
  const cast = pt(v.cast);
  const cm = sc.commons && typeof sc.commons === "object" ? sc.commons : null;
  const commonsUrl = cm && /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[a-z0-9/%._()~,'!-]+$/i.test(String(cm.url || "")) ? String(cm.url) : null;
  const scene = {
    kind: ["own", "commons", "representative"].includes(sc.kind) ? sc.kind : "representative",
    view: {
      x: num(v.x, -1, 1, 3) ?? 0, y: num(v.y, -1, 1, 3) ?? 0, zoom: num(v.zoom, 1, 4, 3) ?? 1, rot: num(v.rot, -45, 45, 1) ?? 0,
      horizon: num(v.horizon, 0.05, 0.9, 3) ?? 0.42, facing: num(v.facing, 0, 360, 0), water: water && water.length >= 3 ? water : null, cast: cast && cast[0] != null && cast[1] != null ? cast : null,
    },
    commons: commonsUrl ? {
      url: commonsUrl, title: label(cm.title, 90), author: cleanLine(cm.author, 80) || "Unknown author", licence: cleanLine(cm.licence, 40) || null,
      licenceUrl: /^https:\/\//.test(String(cm.licenceUrl || "")) ? String(cm.licenceUrl).slice(0, 200) : null,
      filePage: /^https:\/\/commons\.wikimedia\.org\//.test(String(cm.filePage || "")) ? String(cm.filePage).slice(0, 300) : null,
    } : null,
  };
  if (scene.kind === "commons" && !scene.commons) scene.kind = "representative";
  const t = s.target && typeof s.target === "object" ? s.target : null;
  return {
    status: STATUSES.includes(s.status) ? s.status : "running",
    startedAt: time(s.startedAt, now) ?? now, pausedMs: int(s.pausedMs, 0, LIVE.maxShareMs) ?? 0,
    pausedAt: s.status === "paused" ? time(s.pausedAt, now) : null, endedAt: s.status === "ended" ? time(s.endedAt, now) ?? now : null,
    name: label(s.name, LIVE.nameMax),
    target: t && SPECIES_RE.test(String(t.id || "")) ? { id: t.id, name: label(t.name, 40) || t.id } : null,
    method: label(s.method, 30),
    place: { label: label(s.place?.label, 60), area: label(s.place?.area, 60), kind: PLACE_KINDS.includes(s.place?.kind) ? s.place.kind : "sea" },
    counts, cond, light, scene,
  };
}

/** One event from the phone, or null. Only these types and these fields are ever kept. */
export function cleanEvent(e, now) {
  if (!e || typeof e !== "object" || !EVENT_TYPES.includes(e.type) || !EID_RE.test(String(e.id || ""))) return null;
  const t = time(e.t, now);
  if (t == null) return null;
  const d = e.data && typeof e.data === "object" ? e.data : {};
  let data = null;
  if (e.type === "catch") {
    data = {
      species: SPECIES_RE.test(String(d.species || "")) ? d.species : null, name: label(d.name, 40),
      lengthCm: num(d.lengthCm, 1, 400, 1), weightKg: num(d.weightKg, 0.01, 300, 3), released: d.released === true,
      bait: label(d.bait, 40), photo: PID_RE.test(String(d.photo || "")) ? d.photo : null,
    };
  } else if (e.type === "smartbite") {
    data = { kind: ["run", "bleep", "tip"].includes(d.kind) ? d.kind : "tip" };
  }
  return { eid: String(e.id), t, type: e.type, data };
}

/** What a link may see of one event. */
export function eventOut(r, perms) {
  const data = r.data ? JSON.parse(r.data) : null;
  if (data && r.type === "catch") {
    if (!perms.sizes) { data.lengthCm = null; data.weightKg = null; }
    if (!perms.photos) data.photo = null;
  }
  return { seq: r.seq, at: r.at, t: r.t, type: r.type, data };
}

/** What a link may see of the share. */
export function shareOut(row, perms, now) {
  const st = JSON.parse(row.state);
  const loc = perms.location;
  const place = loc === "hidden" ? { label: null, area: null, kind: st.place.kind } : loc === "area" ? { label: null, area: st.place.area, kind: st.place.kind } : st.place;
  let scene = st.scene;
  if (loc === "hidden" || (scene.kind === "own" && !row.has_scene)) scene = { kind: "representative", view: { ...scene.view, x: 0, y: 0, zoom: 1, rot: 0 }, commons: null };
  const counts = { ...st.counts };
  return {
    status: st.status, startedAt: st.startedAt, pausedMs: st.pausedMs, pausedAt: st.pausedAt, endedAt: st.endedAt,
    name: st.name, target: st.target, method: st.method, place, counts, cond: st.cond, light: st.light,
    scene: { ...scene, v: scene.kind === "own" ? row.scene_v : 0 },
    pos: loc === "exact" && row.pos ? JSON.parse(row.pos) : null,
    lastSeq: row.last_seq, anglerSeenAt: row.seen_at,
    connected: st.status !== "ended" && now - (row.seen_at || 0) < LIVE.staleMs,
  };
}

export function cleanPos(p) {
  if (!p || typeof p !== "object") return null;
  const lat = num(p.lat, AREA.minLat, AREA.maxLat, 5), lon = num(p.lon, AREA.minLon, AREA.maxLon, 5);
  return lat == null || lon == null ? null : { lat, lon, acc: int(p.acc, 0, 5000) };
}

// ---- passcodes ----
const PASS_RE = /^[A-Za-z0-9]{4,12}$/;
async function pbkdf2(pass, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: LIVE.pbkdf2 }, key, 256);
  return b64url(new Uint8Array(bits));
}
export async function hashPass(pass) { const s = randomId(12); return JSON.stringify({ s, h: await pbkdf2(pass, s) }); }
export async function checkPass(stored, pass) {
  try { const { s, h } = JSON.parse(stored); return typeof pass === "string" && PASS_RE.test(pass) && (await pbkdf2(pass, s)) === h; } catch { return false; }
}

// ---- in-memory throttles for the high-volume viewer routes (per worker; they only catch floods) ----
const seenWrites = new Map(); // link|vkey -> last write ms
const viewHits = new Map(); // link|vkey -> { n, until }
export function resetLiveForTests() { seenWrites.clear(); viewHits.clear(); lastSweep = 0; }
function viewFlood(key, now) {
  const h = viewHits.get(key);
  if (!h || h.until <= now) { viewHits.set(key, { n: 1, until: now + 60e3 }); if (viewHits.size > 20000) viewHits.clear(); return false; }
  h.n++;
  return h.n > LIVE.viewsPerMinute;
}

// ---- housekeeping ----
let lastSweep = 0;
export async function deleteShares(db, ids) {
  if (!ids.length) return;
  const stmts = [];
  for (const id of ids) {
    stmts.push(db.prepare(`DELETE FROM live_grants WHERE link_id IN (SELECT id FROM live_links WHERE share_id = ?1)`).bind(id));
    stmts.push(db.prepare(`DELETE FROM live_viewers WHERE link_id IN (SELECT id FROM live_links WHERE share_id = ?1)`).bind(id));
    for (const t of ["live_links", "live_events", "live_photos"]) stmts.push(db.prepare(`DELETE FROM ${t} WHERE share_id = ?1`).bind(id));
    stmts.push(db.prepare(`DELETE FROM live_shares WHERE id = ?1`).bind(id));
  }
  await db.batch(stmts);
}
async function sweep(db, now) {
  if (now - lastSweep < 10 * 60e3) return;
  lastSweep = now;
  try {
    const old = (await db.prepare(`SELECT id FROM live_shares WHERE keep_until < ?1 OR created_at < ?2 LIMIT 50`).bind(now, now - LIVE.maxShareMs).all()).results || [];
    await deleteShares(db, old.map((r) => r.id));
    await db.batch([
      db.prepare(`DELETE FROM live_viewers WHERE seen_at < ?1`).bind(now - 3600e3),
      db.prepare(`DELETE FROM live_grants WHERE expires_at < ?1`).bind(now),
    ]);
  } catch {
    // housekeeping never fails a request
  }
}

// ---- reads ----
const SHARE_COLS = `s.id, s.owner_hash, s.created_at, s.seen_at, s.last_seq, s.state, s.pos, s.scene_v, s.keep_until, (s.scene IS NOT NULL) AS has_scene`;

async function ownedShare(db, request, id) {
  if (!ID_RE.test(id || "")) throw fail(404, "not_found", "That share has ended.");
  const key = request.headers.get("x-fishdock-owner") || "";
  const row = await db.prepare(`SELECT ${SHARE_COLS} FROM live_shares s WHERE s.id = ?1`).bind(id).first();
  if (!row) throw fail(404, "not_found", "That share has ended.");
  if (!key || (await hashOf("owner", key)) !== row.owner_hash) throw fail(403, "not_owner", "This phone can't change that share.");
  return row;
}

const ENDED = () => fail(404, "link_ended", "This link has ended or been switched off.");
/** The link (and its share) for a viewer's token, re-checked on every request: revoked or expired is 404. */
async function viewerLink(db, request, now, { needGrant = true } = {}) {
  const token = request.headers.get("x-fishdock-link") || "";
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) throw ENDED();
  const row = await db.prepare(`SELECT l.id AS link_id, l.label, l.perms, l.pass, l.expires_at, l.revoked_at, ${SHARE_COLS}
    FROM live_links l JOIN live_shares s ON s.id = l.share_id WHERE l.token_hash = ?1`).bind(await hashOf("link", token)).first();
  if (!row || row.revoked_at || row.expires_at <= now) throw ENDED();
  if (row.pass && needGrant) {
    const grant = request.headers.get("x-fishdock-grant") || "";
    const ok = grant && (await db.prepare(`SELECT 1 AS ok FROM live_grants WHERE hash = ?1 AND link_id = ?2 AND expires_at > ?3`).bind(await hashOf("grant", grant), row.link_id, now).first());
    if (!ok) throw fail(401, "passcode_required", "This link needs its passcode.");
  }
  return row;
}

async function watchingOf(db, shareId, now) {
  const rows = (await db.prepare(`SELECT v.link_id, COUNT(*) AS n FROM live_viewers v JOIN live_links l ON l.id = v.link_id
    WHERE l.share_id = ?1 AND v.seen_at > ?2 GROUP BY v.link_id`).bind(shareId, now - LIVE.watchingMs).all()).results || [];
  const by = Object.fromEntries(rows.map((r) => [r.link_id, r.n]));
  return { total: rows.reduce((a, r) => a + r.n, 0), by };
}
async function linksOf(db, shareId, now) {
  const w = await watchingOf(db, shareId, now);
  const rows = (await db.prepare(`SELECT id, label, perms, pass, created_at, expires_at, revoked_at FROM live_links WHERE share_id = ?1 ORDER BY created_at`).bind(shareId).all()).results || [];
  return {
    watching: w.total,
    links: rows.map((r) => ({ id: r.id, label: r.label, perms: cleanPerms(JSON.parse(r.perms)), hasPasscode: !!r.pass, createdAt: r.created_at, expiresAt: r.expires_at,
      active: !r.revoked_at && r.expires_at > now, revoked: !!r.revoked_at, watching: w.by[r.id] || 0 })),
  };
}

// ---- writes ----
async function storeEvents(db, shareId, list, now) {
  const stmts = list.map((e) => db.prepare(`INSERT OR IGNORE INTO live_events (share_id, seq, eid, at, t, type, data)
    SELECT ?1, COALESCE((SELECT MAX(seq) FROM live_events WHERE share_id = ?1), 0) + 1, ?2, ?3, ?4, ?5, ?6`)
    .bind(shareId, e.eid, now, e.t, e.type, e.data ? JSON.stringify(e.data) : null));
  return stmts;
}
async function pushInto(db, row, body, now) {
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length > LIVE.eventsPerPush) throw fail(413, "too_many_events", "Too many events at once.");
  const clean = events.map((e) => cleanEvent(e, now)).filter(Boolean);
  if (clean.length) {
    const have = await db.prepare(`SELECT COUNT(*) AS n FROM live_events WHERE share_id = ?1`).bind(row.id).first();
    if ((have?.n || 0) + clean.length > LIVE.maxEvents) throw fail(413, "share_full", "This share has reached its limit. Stop sharing and share again to carry on.");
  }
  const state = body.state ? cleanState(body.state, now) : JSON.parse(row.state);
  const pos = body.pos === null ? null : body.pos ? cleanPos(body.pos) : row.pos ? JSON.parse(row.pos) : null;
  const keep = Math.max(row.keep_until, now + LIVE.idleKeepMs);
  const stmts = await storeEvents(db, row.id, clean, now);
  stmts.push(db.prepare(`UPDATE live_shares SET state = ?2, pos = ?3, updated_at = ?4, seen_at = ?4, keep_until = ?5,
    last_seq = COALESCE((SELECT MAX(seq) FROM live_events WHERE share_id = ?1), 0) WHERE id = ?1`)
    .bind(row.id, JSON.stringify(state), pos ? JSON.stringify(pos) : null, now, keep));
  await db.batch(stmts);
  const after = await db.prepare(`SELECT last_seq FROM live_shares WHERE id = ?1`).bind(row.id).first();
  return { lastSeq: after?.last_seq ?? 0, accepted: clean.map((e) => e.eid) };
}

function readPhoto(body, maxBytes) {
  const bytes = fromBase64(body?.photo);
  if (!bytes) throw fail(400, "bad_photo", "That photo couldn't be read. Try a JPEG.");
  const clean = sanitizeJpeg(bytes, { maxBytes, maxDim: LIVE.photoMaxDim, minDim: 64 });
  if (!clean) throw fail(400, "bad_photo", "That photo couldn't be used. Try a smaller JPEG.");
  return clean;
}
const jpegResponse = (bytes, maxAge = 600) => new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": `private, max-age=${maxAge}`, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });

// ---- the route ----
export async function handleLive(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const path = routePath(request, "live");
    if (!path) return err(400, "bad_path", "That address couldn't be read.");
    const db = await needDb(env, now, "Live sharing");
    await sweep(db, now);
    const m = request.method;
    const [a, id, b, sub] = path;

    // ---- viewers ----
    if (a === "view" && m === "GET") {
      const row = await viewerLink(db, request, now);
      const perms = cleanPerms(JSON.parse(row.perms));
      const vid = request.headers.get("x-fishdock-viewer") || "";
      const vkey = /^[A-Za-z0-9_-]{8,48}$/.test(vid) ? (await hashOf("viewer", `${row.link_id}|${vid}`)).slice(0, 24) : null;
      if (vkey) {
        const k = `${row.link_id}|${vkey}`;
        if (viewFlood(k, now)) return err(429, "rate_limited", "Just a moment.", {});
        if (now - (seenWrites.get(k) || 0) > 25e3) {
          await db.prepare(`INSERT INTO live_viewers (link_id, vkey, seen_at) VALUES (?1, ?2, ?3) ON CONFLICT(link_id, vkey) DO UPDATE SET seen_at = ?3`).bind(row.link_id, vkey, now).run();
          seenWrites.set(k, now);
          if (seenWrites.size > 20000) seenWrites.clear();
        }
      }
      const after = Math.max(0, Number.parseInt(new URL(request.url).searchParams.get("after") || "0", 10) || 0);
      // Without "history" a viewer sees what happens from now on (and the last two minutes), not the session so far.
      const since = !perms.history && after === 0 ? now - 120e3 : 0;
      const rows = (await db.prepare(`SELECT seq, at, t, type, data FROM live_events WHERE share_id = ?1 AND seq > ?2 AND at >= ?3 ORDER BY seq DESC LIMIT ?4`)
        .bind(row.id, after, since, LIVE.viewPage + 1).all()).results || [];
      const more = rows.length > LIVE.viewPage;
      const events = rows.slice(0, LIVE.viewPage).reverse().map((r) => eventOut(r, perms));
      const share = shareOut(row, perms, now);
      const w = await watchingOf(db, row.id, now);
      return json({
        share, events, more, now, watching: w.total,
        link: { label: row.label, expiresAt: row.expires_at, perms },
        nextPollMs: share.status === "ended" ? 60e3 : share.connected ? 3000 : 8000,
      });
    }
    if (a === "unlock" && m === "POST") {
      const row = await viewerLink(db, request, now, { needGrant: false });
      if (!row.pass) return json({ grant: null });
      await enforce(db, `liveunlock:${row.link_id}`, LIVE.unlockTries, now, { windowMs: LIVE.unlockWindowMs }, "Too many wrong passcodes. Try again in a few minutes.");
      const body = await readJson(request, 2048);
      if (!(await checkPass(row.pass, body.passcode))) return err(403, "wrong_passcode", "That passcode isn't right.");
      const grant = randomId(32);
      await db.prepare(`INSERT INTO live_grants (hash, link_id, expires_at) VALUES (?1, ?2, ?3)`).bind(await hashOf("grant", grant), row.link_id, row.expires_at).run();
      return json({ grant });
    }
    if (a === "scene" && m === "GET") {
      const row = await viewerLink(db, request, now);
      const perms = cleanPerms(JSON.parse(row.perms));
      if (perms.location === "hidden" || !row.has_scene) return err(404, "no_scene", "No scene photo.");
      const r = await db.prepare(`SELECT scene FROM live_shares WHERE id = ?1`).bind(row.id).first();
      return r?.scene ? jpegResponse(new Uint8Array(r.scene)) : err(404, "no_scene", "No scene photo.");
    }
    if (a === "photo" && m === "GET") {
      const row = await viewerLink(db, request, now);
      const perms = cleanPerms(JSON.parse(row.perms));
      if (!perms.photos || !PID_RE.test(id || "")) return err(404, "no_photo", "No photo.");
      const r = await db.prepare(`SELECT data FROM live_photos WHERE share_id = ?1 AND pid = ?2`).bind(row.id, id).first();
      return r?.data ? jpegResponse(new Uint8Array(r.data), 3600) : err(404, "no_photo", "No photo.");
    }

    // ---- the angler ----
    if (a !== "shares") return err(404, "not_found", "There's nothing here.");
    if (!id && m === "POST") {
      const flags = await getFlags(db);
      if (flags.liveShare === false) return err(503, "switched_off", "Live sharing is switched off for now.");
      const net = await networkKey(db, env, request, now);
      await enforce(db, `liveshare:${net}`, LIVE.sharesPerNetworkPerDay, now, { daily: true }, "That's the most shares for today. Stop an old one or try tomorrow.");
      const body = await readJson(request, LIVE.bodyBytes);
      const shareId = randomId(18), ownerKey = randomId(32);
      const state = cleanState(body.state, now);
      await db.prepare(`INSERT INTO live_shares (id, owner_hash, created_at, updated_at, seen_at, last_seq, state, keep_until) VALUES (?1, ?2, ?3, ?3, ?3, 0, ?4, ?5)`)
        .bind(shareId, await hashOf("owner", ownerKey), now, JSON.stringify(state), now + LIVE.idleKeepMs).run();
      const row = await db.prepare(`SELECT ${SHARE_COLS} FROM live_shares s WHERE s.id = ?1`).bind(shareId).first();
      const out = await pushInto(db, row, body, now);
      return json({ share: { id: shareId }, ownerKey, ...out }, 201);
    }
    const row = await ownedShare(db, request, id);
    if (!b && m === "GET") return json({ share: { id: row.id, lastSeq: row.last_seq }, ...(await linksOf(db, row.id, now)) });
    if (!b && m === "DELETE") { await deleteShares(db, [row.id]); return json({ ok: true, stopped: true }); }
    if (b === "push" && m === "POST") {
      if (now - row.created_at > LIVE.maxShareMs) throw fail(410, "share_too_old", "This share is too old. Stop sharing and share again.");
      await enforce(db, `livepush:${row.id}`, LIVE.pushesPerMinute, now, { windowMs: 60e3 }, "Just a moment.");
      const out = await pushInto(db, row, await readJson(request, LIVE.bodyBytes), now);
      return json({ ...out, ...(await linksOf(db, row.id, now)) });
    }
    if (b === "scene" && m === "PUT") {
      const body = await readJson(request, LIVE.bodyBytes);
      if (body.photo === null) {
        await db.prepare(`UPDATE live_shares SET scene = NULL, scene_v = scene_v + 1 WHERE id = ?1`).bind(row.id).run();
      } else {
        const photo = readPhoto(body, LIVE.scenePhotoBytes);
        await db.prepare(`UPDATE live_shares SET scene = ?2, scene_v = scene_v + 1 WHERE id = ?1`).bind(row.id, photo).run();
      }
      const r = await db.prepare(`SELECT scene_v FROM live_shares WHERE id = ?1`).bind(row.id).first();
      return json({ sceneV: r?.scene_v ?? 0 });
    }
    if (b === "photos" && m === "PUT") {
      if (!PID_RE.test(sub || "")) return err(400, "bad_photo_id", "That photo id isn't valid.");
      const n = await db.prepare(`SELECT COUNT(*) AS n FROM live_photos WHERE share_id = ?1`).bind(row.id).first();
      if ((n?.n || 0) >= LIVE.photosPerShare) throw fail(413, "too_many_photos", "That's the most photos for one share.");
      const photo = readPhoto(await readJson(request, LIVE.bodyBytes), LIVE.catchPhotoBytes);
      await db.prepare(`INSERT INTO live_photos (share_id, pid, data, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(share_id, pid) DO UPDATE SET data = ?3`).bind(row.id, sub, photo, now).run();
      return json({ ok: true, pid: sub });
    }
    if (b === "links" && !sub && m === "POST") {
      const body = await readJson(request, 8192);
      const ms = LIVE.expiries[body.expiry];
      if (!ms) return err(400, "bad_expiry", "Choose how long the link lasts.");
      if (body.passcode != null && body.passcode !== "" && !PASS_RE.test(String(body.passcode))) return err(400, "bad_passcode", "A passcode is 4 to 12 letters or numbers.");
      const count = await db.prepare(`SELECT COUNT(*) AS n FROM live_links WHERE share_id = ?1`).bind(row.id).first();
      if ((count?.n || 0) >= LIVE.linksPerShare) throw fail(413, "too_many_links", "That's the most links for one share. Remove one first.");
      await enforce(db, `livelinks:${row.id}`, LIVE.linksPerDay, now, { daily: true }, "That's the most links for today.");
      const token = randomId(32), lid = randomId(12);
      const expiresAt = Math.min(now + ms, row.created_at + LIVE.maxShareMs);
      const perms = cleanPerms(body.perms);
      const name = label(body.label, LIVE.labelMax) || "Family and friends";
      await db.batch([
        db.prepare(`INSERT INTO live_links (id, share_id, token_hash, label, perms, pass, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
          .bind(lid, row.id, await hashOf("link", token), name, JSON.stringify(perms), body.passcode ? await hashPass(String(body.passcode)) : null, now, expiresAt),
        db.prepare(`UPDATE live_shares SET keep_until = MAX(keep_until, ?2) WHERE id = ?1`).bind(row.id, expiresAt + LIVE.keepAfterMs),
      ]);
      return json({ link: { id: lid, label: name, perms, hasPasscode: !!body.passcode, expiresAt, active: true, watching: 0 }, token }, 201);
    }
    if (b === "links" && sub) {
      const link = await db.prepare(`SELECT id FROM live_links WHERE id = ?1 AND share_id = ?2`).bind(sub, row.id).first();
      if (!link) return err(404, "not_found", "That link has gone.");
      if (m === "DELETE") {
        await db.batch([
          db.prepare(`UPDATE live_links SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL`).bind(sub, now),
          db.prepare(`DELETE FROM live_grants WHERE link_id = ?1`).bind(sub),
          db.prepare(`DELETE FROM live_viewers WHERE link_id = ?1`).bind(sub),
        ]);
        return json({ ok: true, revoked: true, ...(await linksOf(db, row.id, now)) });
      }
      if (m === "PUT") {
        const body = await readJson(request, 4096);
        await db.prepare(`UPDATE live_links SET perms = ?2 WHERE id = ?1`).bind(sub, JSON.stringify(cleanPerms(body.perms))).run();
        return json({ ok: true, ...(await linksOf(db, row.id, now)) });
      }
    }
    return err(405, "method", "That isn't supported here.");
  } catch (e) {
    return toResponse(e, now, "live");
  }
}
