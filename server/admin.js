// Admin panel API, mounted at /api/admin/*.
//
// Access
//  - A verified Firebase ID token whose uid is in ADMIN_UIDS, or whose verified email (Google or Apple sign-in) is in
//    ADMIN_EMAILS (both comma-separated; emails case-insensitive). Anyone else, and any request without the
//    X-FishDock header or (on writes) a same-origin Origin, gets a plain 404 so the panel's existence isn't revealed.
//  - A banned admin account loses the panel at once. Banning needs a sign-in from the last 10 minutes.
//  - Every action writes an admin_audit row.
// Privacy
//  - Nothing here reads the private backup's contents (sync_records) or any coordinates. Activity is counted from
//    hashed ids and the day's hashed network keys only; sessions and catches from the metrics counters.
//
//   GET  /api/admin/me          { admin: true, uid, email }
//   GET  /api/admin/overview    users, active accounts, guests, sessions, catches, AI, feedback, top lists, health
//   GET  /api/admin/feedback    { items: [{ id, kind, text, ref, createdAt, fromAccount }] }  (?cursor= for older)
//   GET  /api/admin/reports     { items: [{ postId, text, reports, reasons, author, authorUid, hidden, createdAt }] }
//   POST /api/admin/posts/:id/hide     { hidden?: boolean (default true) } and clears its reports (reviewed)
//   POST /api/admin/users/:uid/ban     { banned?: boolean (default true) }
//   GET  /api/admin/flags  PUT /api/admin/flags { flags: { castAdvisor, identify, smartBite, community } }

import { json, err, readJson, toResponse, sameOrigin, isWrite, randomId, fail } from "./http.js";
import { ensureSchema, maybeSweep, enforce } from "./db.js";
import { accountFrom, isBanned } from "./account.js";
import { setBan } from "./community.js";
import { getFlags, setFlags } from "./flags.js";
import { limitsFor } from "./ai.js";
import { ukDay, ukDayBefore } from "./time.js";

export const ADMIN_LIMITS = { requestsPerMinute: 600, feedbackPage: 100, reportsMax: 200, topN: 10, topDays: 30 };
export const ADMIN_RECENT_MS = 10 * 60e3;
const UID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const POST_ID_RE = /^[A-Za-z0-9_-]{16,32}$/;

const notFound = () => err(404, "not_found", "Not found.");
const listOf = (v, lower = false) => String(v || "").split(",").map((s) => (lower ? s.trim().toLowerCase() : s.trim())).filter(Boolean);

/** The admin { uid, email, authTime } for this request, or null (the caller answers 404). */
export async function adminFrom(request, env, now, deps = {}) {
  const me = await accountFrom(request, env, now, deps);
  if (!me) return null;
  const byUid = listOf(env.ADMIN_UIDS).includes(me.uid);
  const byEmail = Boolean(me.email) && me.emailVerified && ["google.com", "apple.com"].includes(me.provider) && listOf(env.ADMIN_EMAILS, true).includes(me.email);
  if (!byUid && !byEmail) return null;
  if (env.DB && (await isBanned(env.DB, me.uid))) return null;
  return { uid: me.uid, email: me.email, authTime: me.authTime };
}
const recent = (admin, now) => Boolean(admin.authTime) && now - admin.authTime <= ADMIN_RECENT_MS;

async function audit(db, admin, action, target, detail, now) {
  await db.prepare(`INSERT INTO admin_audit (id, at, admin_uid, action, target, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(randomId(12), now, admin.uid, action, target ?? null, detail ? JSON.stringify(detail).slice(0, 500) : null).run();
}
const one = async (db, sql, ...args) => {
  try { return (await db.prepare(sql).bind(...args).first()) ?? {}; } catch { return {}; }
};
async function top(db, prefix, since, n = ADMIN_LIMITS.topN) {
  const rows = (await db.prepare(`SELECT name, SUM(count) AS c FROM metrics_daily WHERE name LIKE ?1 AND day >= ?2 GROUP BY name ORDER BY c DESC, name LIMIT ?3`)
    .bind(prefix + ":%", since, n).all()).results || [];
  return rows.map((r) => ({ name: r.name.slice(prefix.length + 1), count: r.c }));
}

// ---- overview ----

export async function overview(db, env, now) {
  const today = ukDay(now), monthFrom = ukDayBefore(now, 29), weekFrom = ukDayBefore(now, 6), topFrom = ukDayBefore(now, ADMIN_LIMITS.topDays - 1);
  const users = await one(db, `SELECT (SELECT COUNT(*) FROM users) AS total,
    (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL) AS banned,
    (SELECT COUNT(*) FROM active_days WHERE day = ?1 AND who LIKE 'u:%') AS dau,
    (SELECT COUNT(DISTINCT who) FROM active_days WHERE day >= ?2 AND who LIKE 'u:%') AS mau,
    (SELECT COUNT(*) FROM active_days WHERE day = ?1 AND who LIKE 'g:%') AS guests`, today, monthFrom);
  const metric = async (name) => one(db, `SELECT COALESCE(SUM(count), 0) AS total, COALESCE(SUM(CASE WHEN day = ?2 THEN count END), 0) AS today,
    COALESCE(SUM(CASE WHEN day >= ?3 THEN count END), 0) AS week FROM metrics_daily WHERE name = ?1`, name, today, weekFrom);
  const [sessions, catches] = [await metric("session_start"), await metric("catch_logged")];
  const ai = await one(db, `SELECT (SELECT n FROM ai_usage WHERE k = ?1) AS cast, (SELECT n FROM ai_usage WHERE k = ?2) AS identify,
    (SELECT n FROM ai_usage WHERE k = ?3) AS used, (SELECT COUNT(*) FROM ai_usage WHERE day = ?4 AND k LIKE 'u:%') AS accounts,
    (SELECT COUNT(*) FROM ai_usage WHERE day = ?4 AND k LIKE 'g:%') AS guests`, `cast:${today}`, `identify:${today}`, `all:${today}`, today);
  const feedback = await one(db, `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END), 0) AS week FROM feedback`, now - 7 * 86400e3);
  const reports = await one(db, `SELECT COUNT(DISTINCT post_id) AS open FROM post_reports`);
  const posts = await one(db, `SELECT COUNT(*) AS total, COALESCE(SUM(hidden), 0) AS hidden FROM posts WHERE deleted_at IS NULL`);
  const health = ((await db.prepare(`SELECT upstream, last_ok, last_fail, last_error, ok_count, fail_count FROM source_health ORDER BY upstream`).all()).results || [])
    .map((h) => ({ upstream: h.upstream, lastOk: h.last_ok ?? null, lastFail: h.last_fail ?? null, lastError: h.last_error ?? null, okCount: h.ok_count, failCount: h.fail_count }));
  return {
    day: today,
    users: { total: users.total ?? 0, dau: users.dau ?? 0, mau: users.mau ?? 0, banned: users.banned ?? 0 },
    guests: { today: users.guests ?? 0 },
    sessions: { total: sessions.total ?? 0, today: sessions.today ?? 0, week: sessions.week ?? 0 },
    catches: { total: catches.total ?? 0, today: catches.today ?? 0, week: catches.week ?? 0 },
    ai: { castToday: ai.cast ?? 0, identifyToday: ai.identify ?? 0, usedToday: ai.used ?? 0, accountsToday: ai.accounts ?? 0, guestNetworksToday: ai.guests ?? 0, globalLimit: limitsFor(env).global, configured: Boolean(env.GEMINI_API_KEY) },
    feedback: { week: feedback.week ?? 0, total: feedback.total ?? 0 },
    community: { posts: posts.total ?? 0, hidden: posts.hidden ?? 0, reported: reports.open ?? 0 },
    topSpecies: await top(db, "species_view", topFrom),
    topRegions: await top(db, "area_view", topFrom),
    topAdvisor: await top(db, "advisor_run", topFrom),
    health,
    sources: { admiralty: Boolean(env.ADMIRALTY_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) },
  };
}

// ---- handler ----

export async function handleAdmin(request, env, now = Date.now(), deps = {}) {
  const db = env.DB;
  if (!db) return notFound();
  try {
    if (request.headers.get("x-fishdock") !== "1") return notFound();
    if (isWrite(request) && !sameOrigin(request)) return notFound();
    let path;
    try {
      path = new URL(request.url).pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return notFound();
    }
    await ensureSchema(db);
    await maybeSweep(db, now);
    const admin = await adminFrom(request, env, now, deps);
    if (!admin) return notFound();
    await enforce(db, "adm:" + admin.uid, ADMIN_LIMITS.requestsPerMinute, now, { windowMs: 60e3 }, "Just a moment.");
    const m = request.method;
    const url = new URL(request.url);

    if (path[0] === "me" && path.length === 1 && m === "GET") return json({ admin: true, uid: admin.uid, email: admin.email });

    if (path[0] === "overview" && path.length === 1 && m === "GET") return json(await overview(db, env, now));

    if (path[0] === "feedback" && path.length === 1 && m === "GET") {
      const c = Number(url.searchParams.get("cursor"));
      const kind = url.searchParams.get("kind");
      const rows = (await db.prepare(`SELECT id, kind, text, ref, from_account, created_at FROM feedback
          WHERE created_at < ?1 AND (?2 IS NULL OR kind = ?2) ORDER BY created_at DESC LIMIT ${ADMIN_LIMITS.feedbackPage}`)
        .bind(Number.isFinite(c) && c > 0 ? c : now + 1, typeof kind === "string" && /^[a-z-]{2,30}$/.test(kind) ? kind : null).all()).results || [];
      return json({
        items: rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, ref: r.ref ?? null, createdAt: r.created_at, fromAccount: Boolean(r.from_account) })),
        cursor: rows.length === ADMIN_LIMITS.feedbackPage ? rows[rows.length - 1].created_at : null,
      });
    }

    if (path[0] === "reports" && path.length === 1 && m === "GET") {
      const rows = (await db.prepare(`SELECT p.id, p.uid, p.text, p.kind, p.species, p.area, p.hidden, p.created_at, u.name, u.banned_at,
          COUNT(r.uid) AS n, GROUP_CONCAT(r.reason) AS reasons, MAX(r.created_at) AS last_at
        FROM post_reports r JOIN posts p ON p.id = r.post_id LEFT JOIN users u ON u.uid = p.uid
        WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY n DESC, last_at DESC LIMIT ${ADMIN_LIMITS.reportsMax}`).all()).results || [];
      return json({
        items: rows.map((r) => ({
          postId: r.id, text: String(r.text || "").slice(0, 500), kind: r.kind, species: r.species ?? null, area: r.area ?? null,
          reports: r.n, reasons: [...new Set(String(r.reasons || "").split(",").filter(Boolean))],
          author: r.name || "Angler", authorUid: r.uid, authorBanned: Boolean(r.banned_at), hidden: Boolean(r.hidden),
          createdAt: r.created_at, lastReportAt: r.last_at,
        })),
      });
    }

    if (path[0] === "posts" && POST_ID_RE.test(path[1] || "") && path[2] === "hide" && path.length === 3 && m === "POST") {
      const body = await readJson(request);
      const hidden = body.hidden === false ? 0 : 1;
      const post = await db.prepare(`SELECT id, uid FROM posts WHERE id = ?1 AND deleted_at IS NULL`).bind(path[1]).first();
      if (!post) return err(404, "not_found", "Post not found.");
      const open = (await db.prepare(`SELECT COUNT(*) AS n FROM post_reports WHERE post_id = ?1`).bind(post.id).first())?.n ?? 0;
      // Reviewed: its reports are resolved, and later reports reach the queue without hiding it automatically again.
      await db.batch([
        db.prepare(`UPDATE posts SET hidden = ?2, reports = 0, reviewed_at = ?3 WHERE id = ?1`).bind(post.id, hidden, now),
        db.prepare(`DELETE FROM post_reports WHERE post_id = ?1`).bind(post.id),
      ]);
      await audit(db, admin, hidden ? "post.hide" : "post.keep", post.id, { author: post.uid, reports: open }, now);
      return json({ ok: true, hidden: Boolean(hidden) });
    }

    if (path[0] === "users" && UID_RE.test(path[1] || "") && path[2] === "ban" && path.length === 3 && m === "POST") {
      const body = await readJson(request);
      const banned = body.banned !== false;
      if (path[1] === admin.uid) return err(400, "self", banned ? "You can't ban yourself." : "You can't unban yourself.");
      if (!recent(admin, now)) return err(401, "recent_sign_in_required", "For safety, sign in again (within the last 10 minutes) to do this.");
      await setBan(db, path[1], banned, admin.uid, now);
      await audit(db, admin, banned ? "user.ban" : "user.unban", path[1], null, now);
      return json({ ok: true, banned });
    }

    if (path[0] === "flags" && path.length === 1) {
      if (m === "GET") return json({ flags: await getFlags(db) });
      if (m === "PUT") {
        const body = await readJson(request);
        const patch = body.flags && typeof body.flags === "object" && !Array.isArray(body.flags) ? body.flags : null;
        if (!patch) throw fail(400, "bad_request", "Send { flags: { name: true or false } }.");
        const flags = await setFlags(db, patch, admin.uid, now);
        await audit(db, admin, "flags.set", null, Object.fromEntries(Object.entries(patch).filter(([k, v]) => k in flags && typeof v === "boolean")), now);
        return json({ flags });
      }
    }

    return notFound();
  } catch (e) {
    return toResponse(e, now, "admin");
  }
}
