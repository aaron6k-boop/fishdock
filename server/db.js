// The one D1 database (bound as `DB`): schema, daily allowances, throttles, activity counts and housekeeping.
//
// The schema is created and migrated by this code on a new worker's first request: additive
// `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` only, never a drop or a rename.
// There is no separate migration step. Network addresses are never stored (see ipKey.js); account ids
// are stored only where an account's own data needs them, and activity counts use hashed ids.

import { ukDay, ukDayEnd, ukDayBefore } from "./time.js";
import { sha256Hex, limitError, fail } from "./http.js";

// ---- schema ----

const SCHEMA = [
  // Signed-in accounts seen by the server (Firebase uid). `name` is the Community display name the angler chose;
  // a real name from the sign-in provider is never copied here.
  `CREATE TABLE IF NOT EXISTS users (
     uid TEXT PRIMARY KEY, name TEXT, created_at INTEGER NOT NULL, last_seen_at INTEGER,
     banned_at INTEGER, banned_by TEXT)`,
  // Private backup: opaque JSON per (account, kind, id). Never shared; the only place coordinates are kept server side.
  `CREATE TABLE IF NOT EXISTS sync_records (
     uid TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL, server_ts INTEGER NOT NULL, PRIMARY KEY (uid, kind, id))`,
  `CREATE INDEX IF NOT EXISTS sync_records_pull ON sync_records(uid, server_ts)`,
  // Community posts: a coarse `area` label at most (never coordinates), an optional photo stripped of metadata.
  `CREATE TABLE IF NOT EXISTS posts (
     id TEXT PRIMARY KEY, uid TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, species TEXT, area TEXT,
     photo BLOB, photo_v INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
     reviewed_at INTEGER, created_at INTEGER NOT NULL, deleted_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at)`,
  `CREATE INDEX IF NOT EXISTS posts_uid ON posts(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS post_reports (
     post_id TEXT NOT NULL, uid TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, uid))`,
  `CREATE TABLE IF NOT EXISTS blocks (blocker TEXT NOT NULL, blocked TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (blocker, blocked))`,
  `CREATE TABLE IF NOT EXISTS follows (follower TEXT NOT NULL, followee TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (follower, followee))`,
  `CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee)`,
  // Feedback from the app. Who sent it is not kept (only whether it came from a signed-in account).
  `CREATE TABLE IF NOT EXISTS feedback (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, ref TEXT, from_account INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS feedback_created ON feedback(created_at)`,
  // Privacy-preserving usage counters: a whitelisted name and a UK day, nothing else (see metrics.js).
  `CREATE TABLE IF NOT EXISTS metrics_daily (name TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (name, day))`,
  `CREATE INDEX IF NOT EXISTS metrics_daily_day ON metrics_daily(day)`,
  // AI allowances and counts per UK day (keys: u:<uid>:<day>, g:<network key>:<day>, all:<day>, cast:<day>, identify:<day>).
  `CREATE TABLE IF NOT EXISTS ai_usage (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage(day)`,
  // Last success and failure of every outside service (a short error code only, never an upstream body or key).
  `CREATE TABLE IF NOT EXISTS source_health (
     upstream TEXT PRIMARY KEY, last_ok INTEGER, last_fail INTEGER, last_error TEXT,
     ok_count INTEGER NOT NULL DEFAULT 0, fail_count INTEGER NOT NULL DEFAULT 0)`,
  // Feature flags set from the admin panel (JSON values).
  `CREATE TABLE IF NOT EXISTS flags (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT)`,
  // Upstream answers kept for everyone (per coarse cell or station), JSON, until `expires` (ms).
  `CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS cache_expires ON cache(expires)`,
  // Throttles and daily allowances (see allowance()).
  `CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  // Who was active on a UK day, as hashed keys only: "u:" + hashed account id, "g:" + the day's network key.
  `CREATE TABLE IF NOT EXISTS active_days (day TEXT NOT NULL, who TEXT NOT NULL, PRIMARY KEY (day, who))`,
  // Every admin action (short JSON detail; never coordinates, tokens or email bodies).
  `CREATE TABLE IF NOT EXISTS admin_audit (
     id TEXT PRIMARY KEY, at INTEGER NOT NULL, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT)`,
  `CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit(at)`,
];
// Columns added after the first release go here, one ALTER each. "duplicate column" (already migrated) is expected.
const MIGRATIONS = [];

let schemaReady = null; // once per isolate
export function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      for (const m of MIGRATIONS) {
        try {
          await db.prepare(m).run();
        } catch (e) {
          if (!/duplicate column/i.test(String(e?.message))) throw e;
        }
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}
export function resetSchemaForTests() {
  schemaReady = null;
  lastSweep = 0;
}

/** The database, ready, or a 503 thrown for routes that need it. */
export async function needDb(env, now, what = "This part of FishDock") {
  if (!env?.DB) throw fail(503, "not_configured", `${what} isn't switched on for this site yet.`);
  await ensureSchema(env.DB);
  await maybeSweep(env.DB, now);
  return env.DB;
}

// ---- throttles and daily allowances ----
// Daily allowances reset at UK midnight (Europe/London), so "back tomorrow" is true for UK anglers.
// Short throttles (per minute) only catch floods and runaway scripts. Either way the answer is a 429 with
// { error: "rate_limited", kind, ... } and a Retry-After header.

/**
 * Counts one use of `key` against `max`. { daily: true }: resets at UK midnight; otherwise a window of
 * `windowMs` from the first use. Returns { ok, used, left, resetAt }. One atomic statement.
 */
export async function allowance(db, key, max, now, { daily = false, windowMs = 60e3 } = {}) {
  const until = daily ? ukDayEnd(now) : now + windowMs;
  const row = await db.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN rate.reset_at <= ?3 THEN 1 ELSE rate.n + 1 END,
       reset_at = CASE WHEN rate.reset_at <= ?3 THEN ?2 ELSE rate.reset_at END
     RETURNING n, reset_at`
  ).bind(key, until, now).first();
  const used = row?.n ?? 1;
  return { ok: used <= max, used, left: Math.max(0, max - used), resetAt: Number(row?.reset_at ?? until) };
}
/** Gives one use of `key` back (something that failed shouldn't use up anyone's day). */
export async function giveBack(db, key) {
  await db.prepare(`UPDATE rate SET n = MAX(0, n - 1) WHERE k = ?1`).bind(key).run();
}
/** allowance() that throws a 429 (kind "daily" or "slow") with `words` when it's used up. */
export async function enforce(db, key, max, now, opts, words) {
  const a = await allowance(db, key, max, now, opts);
  if (!a.ok) throw limitError(opts?.daily ? "daily" : "slow", a.resetAt, words);
  return a;
}

// ---- activity (hashed ids only) ----

/** A non-reversible stand-in for an account id in activity counts. */
export async function hashedId(env, uid) {
  return (await sha256Hex(`fishdock-active|${env?.IP_HASH_SECRET || ""}|${uid}`)).slice(0, 24);
}
/** Marks a signed-in account active today (users row and a hashed active_days row). */
export async function noteAccount(db, env, uid, now) {
  const day = ukDay(now);
  await db.batch([
    db.prepare(`INSERT INTO users (uid, created_at, last_seen_at) VALUES (?1, ?2, ?2) ON CONFLICT(uid) DO UPDATE SET last_seen_at = ?2`).bind(uid, now),
    db.prepare(`INSERT OR IGNORE INTO active_days (day, who) VALUES (?1, ?2)`).bind(day, "u:" + (await hashedId(env, uid))),
  ]);
}
/** Marks a network (the day's keyed hash of it, see ipKey.js) active today. */
export async function noteGuest(db, netKey, now) {
  await db.prepare(`INSERT OR IGNORE INTO active_days (day, who) VALUES (?1, ?2)`).bind(ukDay(now), "g:" + netKey).run();
}

// ---- metrics counters ----

export async function bump(db, name, day, by = 1) {
  return db.prepare(`INSERT INTO metrics_daily (name, day, count) VALUES (?1, ?2, ?3)
    ON CONFLICT(name, day) DO UPDATE SET count = metrics_daily.count + ?3`).bind(name, day, by);
}

// ---- housekeeping ----
// At most every 10 minutes per worker: spent throttles, long-expired cache rows and old activity rows.
export const KEEP = { userActivityDays: 400, guestActivityDays: 35, aiUsageDays: 35, cacheGraceMs: 86400e3, sweepEveryMs: 10 * 60e3 };
let lastSweep = 0;
export async function maybeSweep(db, now) {
  if (now - lastSweep < KEEP.sweepEveryMs) return;
  lastSweep = now;
  try {
    await db.batch([
      db.prepare(`DELETE FROM rate WHERE reset_at <= ?1`).bind(now),
      db.prepare(`DELETE FROM cache WHERE expires < ?1`).bind(now - KEEP.cacheGraceMs),
      db.prepare(`DELETE FROM active_days WHERE who LIKE 'g:%' AND day < ?1`).bind(ukDayBefore(now, KEEP.guestActivityDays)),
      db.prepare(`DELETE FROM active_days WHERE day < ?1`).bind(ukDayBefore(now, KEEP.userActivityDays)),
      db.prepare(`DELETE FROM ai_usage WHERE day < ?1`).bind(ukDayBefore(now, KEEP.aiUsageDays)),
    ]);
  } catch {
    // housekeeping never fails a request
  }
}
