// Private backup (Firebase ID token required): GET /api/sync?since=<ms>, PUT /api/sync { records },
// DELETE /api/sync (erase everything), GET /api/sync/export (everything as one JSON document).
//
// - Every record belongs to one verified account: the primary key is (uid, kind, id) and every query is scoped by
//   the uid from the verified token, never from the request. One account can never read, overwrite or delete
//   another's records.
// - Records are opaque JSON per { kind, id, updatedAt, deleted? }: catches, sessions, marks and settings. This is
//   the only place coordinates are kept on the server, and they are never shared or shown to anyone else
//   (Community, metrics and the admin panel never read this table's contents).
// - Conflicts: last writer wins by the client's updatedAt; when the server already has a newer copy it keeps it
//   and says so ("kept_newer") so the phone can adopt it. Deletions are kept as tombstones so other devices learn.
// - Photos never travel inside records: a top-level field holding an image data URL is left out (the photo stays on
//   the phone and the result says photosLeftOnPhone: true); a record with an image data URL anywhere else is refused.
// - Caps, like DetectDock's: 100 records a push, 256 KB a record, 3 MB a push, 20,000 live records and 200 MB a
//   account (SYNC_MAX_RECORDS / SYNC_MAX_BYTES override). Over the cap new records stay on the phone ("over_quota");
//   nothing stored is removed, and deletions always go through.
// - Pulls are paged by the server's own clock (`cursor`), which strictly increases, so nothing is missed.

import { json, err, guard, readJson, toResponse, routePath, fail } from "./http.js";
import { needDb, enforce } from "./db.js";
import { requireAccount, noteActive } from "./account.js";

// Singular and plural forms are both accepted (the phone's stores are "catches", "sessions", "marks"); a record keeps
// the kind it was sent with.
export const KINDS = ["catch", "catches", "session", "sessions", "mark", "marks", "settings", "setup", "setups", "spot", "spots"];
export const SYNC_LIMITS = {
  batch: 100,
  recordBytes: 256 * 1024,
  bodyBytes: 3_000_000,
  pullPage: 500,
  recordsPerUser: 20_000,
  bytesPerUser: 200_000_000,
  pushesPerMinute: 120,
  pullsPerMinute: 240,
  exportsPerDay: 20,
  erasesPerDay: 10,
};
export function syncQuota(env = {}) {
  const pos = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
  return { records: pos(env.SYNC_MAX_RECORDS, SYNC_LIMITS.recordsPerUser), bytes: pos(env.SYNC_MAX_BYTES, SYNC_LIMITS.bytesPerUser) };
}
const ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const DATA_URL_RE = /data:image\/[a-z]+;base64,/i;

// Strictly increasing server clock so pulls never miss a write in the same millisecond.
let lastTs = 0;
function serverTs(now) {
  lastTs = Math.max(now, lastTs + 1);
  return lastTs;
}
export function resetSyncForTests() { lastTs = 0; }

const recordOut = (r) => ({
  kind: r.kind, id: r.id, updatedAt: r.updated_at, serverTs: r.server_ts,
  ...(r.deleted ? { deleted: true, data: null } : { data: JSON.parse(r.data) }),
});

async function usage(db, uid) {
  const row = await db.prepare(`SELECT COUNT(*) AS records, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM sync_records WHERE uid = ?1 AND deleted = 0`).bind(uid).first();
  return { records: row?.records ?? 0, bytes: row?.bytes ?? 0 };
}

/** Checks one incoming record: { kind, id, updatedAt, deleted, data } or { kind, id, status } when it's refused. */
export function checkRecord(r) {
  const kind = r?.kind, id = r?.id, updatedAt = Number(r?.updatedAt);
  if (!KINDS.includes(kind) || typeof id !== "string" || !ID_RE.test(id) || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    return { kind: typeof kind === "string" ? kind.slice(0, 20) : null, id: typeof id === "string" ? id.slice(0, 80) : null, status: "rejected" };
  }
  const deleted = r.deleted === true;
  let data = null;
  if (!deleted) {
    if (!r.data || typeof r.data !== "object" || Array.isArray(r.data)) return { kind, id, status: "rejected" };
    const kept = {};
    let stripped = false;
    for (const [k, v] of Object.entries(r.data)) {
      if (typeof v === "string" && /^data:image\//i.test(v)) stripped = true;
      else kept[k] = v;
    }
    data = JSON.stringify(kept);
    if (data.length > SYNC_LIMITS.recordBytes) return { kind, id, status: "too_large" };
    if (DATA_URL_RE.test(data)) return { kind, id, status: "photo_not_allowed" };
    if (stripped) return { kind, id, updatedAt: Math.round(updatedAt), deleted, data, stripped };
  }
  return { kind, id, updatedAt: Math.round(updatedAt), deleted, data };
}

export async function handleSync(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const path = routePath(request, "sync");
    if (!path) return err(404, "not_found", "Unknown route.");
    const db = await needDb(env, now, "Backup");
    const me = await requireAccount(request, env, now, deps, "Sign in to back up your catches.");
    if (me.unverified) throw fail(403, "email_unverified", "Confirm your email address first: check your inbox.");
    const uid = me.uid;
    await noteActive(db, env, uid, now);
    const m = request.method;

    // ---- GET /api/sync?since=<serverTs>: changed records, paged ----
    if (path.length === 0 && m === "GET") {
      await enforce(db, "spull:" + uid, SYNC_LIMITS.pullsPerMinute, now, { windowMs: 60e3 }, "Syncing a lot at once: carrying on in a moment.");
      const since = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("since")) || 0));
      const rows = (await db.prepare(`SELECT kind, id, data, deleted, updated_at, server_ts FROM sync_records WHERE uid = ?1 AND server_ts > ?2 ORDER BY server_ts LIMIT ?3`)
        .bind(uid, since, SYNC_LIMITS.pullPage).all()).results || [];
      return json({
        records: rows.map(recordOut),
        cursor: rows.length ? rows[rows.length - 1].server_ts : since,
        more: rows.length === SYNC_LIMITS.pullPage,
        serverTime: now,
      });
    }

    // ---- PUT /api/sync { records: [...] }: upsert, last writer wins ----
    if (path.length === 0 && m === "PUT") {
      await enforce(db, "spush:" + uid, SYNC_LIMITS.pushesPerMinute, now, { windowMs: 60e3 }, "Backing up a lot at once: carrying on in a moment.");
      const body = await readJson(request, SYNC_LIMITS.bodyBytes);
      if (!Array.isArray(body.records)) return err(400, "bad_request", "Send { records: [...] }.");
      if (body.records.length > SYNC_LIMITS.batch) return err(413, "too_many", `Send at most ${SYNC_LIMITS.batch} records at a time.`);
      const checked = body.records.map(checkRecord);
      const valid = checked.filter((c) => !c.status);
      // Storage cap: only checked when this push adds something.
      if (valid.some((c) => !c.deleted)) {
        const quota = syncQuota(env);
        const use = await usage(db, uid);
        const prev = new Map(((await db.prepare(`SELECT r.kind, r.id, r.deleted, r.updated_at, LENGTH(r.data) AS len FROM json_each(?2) j
          CROSS JOIN sync_records r ON r.uid = ?1 AND r.kind = json_extract(j.value, '$[0]') AND r.id = json_extract(j.value, '$[1]')`)
          .bind(uid, JSON.stringify(valid.map((c) => [c.kind, c.id]))).all()).results || []).map((x) => [x.kind + ":" + x.id, x]));
        for (const c of valid) {
          const old = prev.get(c.kind + ":" + c.id);
          if (old && c.updatedAt <= old.updated_at) continue; // the server keeps its newer copy: no change
          const addRecords = (c.deleted ? 0 : 1) - (old && !old.deleted ? 1 : 0);
          const addBytes = (c.deleted ? 0 : c.data.length) - (old && !old.deleted ? old.len ?? 0 : 0);
          if (!c.deleted && ((addRecords > 0 && use.records + addRecords > quota.records) || (addBytes > 0 && use.bytes + addBytes > quota.bytes))) {
            c.status = "over_quota";
            continue;
          }
          use.records += addRecords;
          use.bytes += addBytes;
          prev.set(c.kind + ":" + c.id, { deleted: c.deleted ? 1 : 0, updated_at: c.updatedAt, len: c.deleted ? 0 : c.data.length });
        }
      }
      const stmts = [];
      const pending = [];
      for (const c of checked) {
        if (c.status) continue;
        const ts = serverTs(now);
        pending.push(c);
        stmts.push(db.prepare(
          `INSERT INTO sync_records (uid, kind, id, data, deleted, updated_at, server_ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(uid, kind, id) DO UPDATE SET data = excluded.data, deleted = excluded.deleted,
             updated_at = excluded.updated_at, server_ts = excluded.server_ts
           WHERE excluded.updated_at > sync_records.updated_at`
        ).bind(uid, c.kind, c.id, c.data, c.deleted ? 1 : 0, c.updatedAt, ts));
      }
      if (stmts.length) {
        const out = await db.batch(stmts);
        pending.forEach((c, i) => { c.status = out[i]?.meta?.changes ? "saved" : "kept_newer"; });
      }
      return json({ results: checked.map((c) => ({ kind: c.kind, id: c.id, status: c.status, ...(c.stripped && c.status === "saved" ? { photosLeftOnPhone: true } : {}) })), serverTime: now });
    }

    // ---- DELETE /api/sync: erase every record for the account ("Delete my data") ----
    if (path.length === 0 && m === "DELETE") {
      await enforce(db, "serase:" + uid, SYNC_LIMITS.erasesPerDay, now, { daily: true }, "That's a lot of erasing today. Try again tomorrow.");
      const r = await db.prepare(`DELETE FROM sync_records WHERE uid = ?1`).bind(uid).run();
      return json({ ok: true, deleted: r.meta?.changes ?? 0 });
    }

    // ---- GET /api/sync/export: everything stored for the account ----
    if (path.length === 1 && path[0] === "export" && m === "GET") {
      await enforce(db, "sexport:" + uid, SYNC_LIMITS.exportsPerDay, now, { daily: true }, "You've exported a lot today. Exports are back tomorrow.");
      const rows = (await db.prepare(`SELECT kind, id, data, deleted, updated_at, server_ts FROM sync_records WHERE uid = ?1 AND deleted = 0 ORDER BY kind, id`).bind(uid).all()).results || [];
      const user = await db.prepare(`SELECT name, created_at, last_seen_at FROM users WHERE uid = ?1`).bind(uid).first();
      const posts = (await db.prepare(`SELECT id, kind, text, species, area, created_at, hidden FROM posts WHERE uid = ?1 AND deleted_at IS NULL ORDER BY created_at`).bind(uid).all()).results || [];
      const follows = (await db.prepare(`SELECT followee, at FROM follows WHERE follower = ?1`).bind(uid).all()).results || [];
      const blocks = (await db.prepare(`SELECT blocked, at FROM blocks WHERE blocker = ?1`).bind(uid).all()).results || [];
      return json({
        app: "FishDock",
        exportedAt: new Date(now).toISOString(),
        account: { uid, communityName: user?.name ?? null, firstSeenAt: user?.created_at ?? null, lastSeenAt: user?.last_seen_at ?? null },
        records: rows.map(recordOut),
        community: {
          posts: posts.map((p) => ({ id: p.id, kind: p.kind, text: p.text, species: p.species, area: p.area, createdAt: p.created_at, hidden: Boolean(p.hidden) })),
          following: follows.map((f) => ({ uid: f.followee, at: f.at })),
          blocked: blocks.map((b) => ({ uid: b.blocked, at: b.at })),
        },
      }, 200, { "content-disposition": `attachment; filename="fishdock-export.json"` });
    }

    return err(404, "not_found", "Unknown route.");
  } catch (e) {
    return toResponse(e, now, "sync");
  }
}
