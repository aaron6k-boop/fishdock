// Community (Beta): public catch reports, fishing reports and questions.
//
//   GET    /api/community/feed?kind=&species=&cursor=&tab=following   newest first, 20 a page (guests may read)
//   POST   /api/community/posts            { kind: "catch"|"report"|"question", text, species?, area?, photo? }
//   DELETE /api/community/posts/:id        your own post
//   POST   /api/community/posts/:id/report { reason }
//   POST   /api/community/block/:uid       DELETE to unblock (blocks hide posts both ways)
//   POST   /api/community/follow/:uid      DELETE to unfollow
//   GET    /api/community/me               PUT { name } sets the name other anglers see; DELETE erases your Community data
//   GET    /api/community/photo/:id        a post's photo (only while the post is visible)
//
// Privacy rules:
// - `area` is a coarse place label or a 10 km grid square chosen by the poster. Exact coordinates, grid references
//   finer than 10 km, postcodes, what3words and map links are refused there and in the text (locationText.js).
// - Photos are re-validated and stripped of EXIF / GPS and every other metadata segment before they're stored.
// - Nothing from the private backup (sync_records) is ever read here.
// Moderation: reports from 3 different accounts hide a post until an admin reviews it (the author still sees it);
// admins hide posts and ban accounts (admin.js). Banned accounts can't post, report, follow or block, and their
// posts leave the feed. The `community` feature flag switches the whole of Community off.

import { json, err, guard, readJson, toResponse, routePath, fail, cleanText, cleanLine, randomId, fromBase64 } from "./http.js";
import { needDb, enforce } from "./db.js";
import { accountFrom, hasToken, noteActive, isBanned } from "./account.js";
import { networkKey, noteNetwork } from "./throttle.js";
import { sanitizeJpeg } from "./jpeg.js";
import { looksLikeLocation, areaCheck } from "./locationText.js";
import { getFlags } from "./flags.js";

export const POST_KINDS = ["catch", "report", "question"];
export const REPORT_REASONS = ["spam", "abuse", "location", "illegal", "unsafe", "other"];
export const COMMUNITY_LIMITS = {
  textMax: 1000, areaMax: 60, nameMax: 30, page: 20,
  photoBytes: 600 * 1024, photoMaxDim: 2560, photoMinDim: 200, bodyBytes: 1_000_000,
  postsPerDay: 20, postsPerMinute: 3, reportsPerDay: 40, followsPerDay: 200, blocksPerDay: 100, namesPerDay: 10,
  guestReadsPerMinute: 240, readsPerMinute: 300,
};
export const REPORTS_TO_HIDE = 3;
const POST_ID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const UID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const SPECIES_RE = /^[a-z][a-z0-9-]{1,39}$/;

// ---- shapes ----

/** The only shape a post ever leaves the server in. */
export function postOut(r, viewer = null) {
  return {
    id: r.id,
    kind: r.kind,
    text: r.text,
    species: r.species || null,
    area: r.area || null,
    photoUrl: r.photo_v ? `/api/community/photo/${r.id}?v=${r.photo_v}` : null,
    createdAt: r.created_at,
    author: { uid: r.uid, name: r.name || "Angler" },
    ...(viewer ? { mine: r.uid === viewer, ...(r.uid === viewer && r.hidden ? { hidden: true } : {}) } : {}),
  };
}

// Visible: not deleted, not hidden (except to its author), author not banned, no block either way.
const visible = (vp) => `p.deleted_at IS NULL AND (p.hidden = 0 OR p.uid = ${vp}) AND u.banned_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = ${vp} AND b.blocked = p.uid) OR (b.blocker = p.uid AND b.blocked = ${vp}))`;
const COLS = `p.id, p.uid, p.kind, p.text, p.species, p.area, p.photo_v, p.hidden, p.created_at, u.name`;
const FROM = `FROM posts p LEFT JOIN users u ON u.uid = p.uid`;
const visiblePost = (db, id, viewer) => db.prepare(`SELECT ${COLS} ${FROM} WHERE p.id = ?1 AND ${visible("?2")}`).bind(id, viewer ?? "").first();

// ---- input ----

export function readPost(body) {
  const kind = POST_KINDS.includes(body?.kind) ? body.kind : null;
  if (!kind) throw fail(400, "bad_kind", "Choose a catch, a report or a question.");
  const text = cleanText(body.text, COMMUNITY_LIMITS.textMax + 1);
  if (!text) throw fail(400, "bad_text", "Write something first.");
  if (text.length > COMMUNITY_LIMITS.textMax) throw fail(400, "too_long", `Keep it under ${COMMUNITY_LIMITS.textMax} characters.`);
  if (looksLikeLocation(text)) throw fail(400, "location_in_text", "Remove exact location details (coordinates, grid references, postcodes, what3words or map links) before posting. Use the area box for a rough area.");
  let species = null;
  if (body.species != null && body.species !== "") {
    if (typeof body.species !== "string" || !SPECIES_RE.test(body.species)) throw fail(400, "bad_species", "Choose the species from the list.");
    species = body.species;
  }
  let area = null;
  if (body.area != null && body.area !== "") {
    if (typeof body.area !== "string") throw fail(400, "bad_area", "The area should be a place name or a 10 km square.");
    area = cleanLine(body.area, COMMUNITY_LIMITS.areaMax + 1);
    if (area.length > COMMUNITY_LIMITS.areaMax) throw fail(400, "bad_area", `Keep the area under ${COMMUNITY_LIMITS.areaMax} characters.`);
    if (areaCheck(area) !== "ok") throw fail(400, "area_too_precise", "The area can be a place or region name, or a 10 km square. Exact coordinates, detailed grid references and postcodes aren't allowed.");
    area = area || null;
  }
  let photo = null;
  if (body.photo != null && body.photo !== "") {
    const bytes = fromBase64(body.photo);
    if (!bytes) throw fail(400, "bad_image", "That photo couldn't be read. Try another (a JPEG).");
    if (bytes.length > COMMUNITY_LIMITS.photoBytes) throw fail(413, "too_large", "That photo is too large. Try a smaller one.");
    photo = sanitizeJpeg(bytes, { maxBytes: COMMUNITY_LIMITS.photoBytes, maxDim: COMMUNITY_LIMITS.photoMaxDim, minDim: COMMUNITY_LIMITS.photoMinDim });
    if (!photo) throw fail(400, "bad_image", "That photo couldn't be used. Try another (a JPEG).");
  }
  return { kind, text, species, area, photo };
}

export function cleanName(v) {
  const name = cleanLine(v, COMMUNITY_LIMITS.nameMax + 1);
  if (!name || name.length < 2) throw fail(400, "bad_name", "Choose a name of 2 to 30 characters.");
  if (name.length > COMMUNITY_LIMITS.nameMax) throw fail(400, "bad_name", "Keep your name under 30 characters.");
  if (/@/.test(name)) throw fail(400, "bad_name", "Don't use an email address as your name.");
  if (looksLikeLocation(name)) throw fail(400, "location_in_text", "Remove location details from your name.");
  return name;
}

// ---- handler ----

export async function handleCommunity(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const path = routePath(request, "community");
    if (!path) return err(404, "not_found", "Unknown route.");
    const db = await needDb(env, now, "Community");
    const flags = await getFlags(db);
    if (!flags.community) return err(503, "feature_off", "Community is switched off for now. Everything else in FishDock still works.");
    const m = request.method;
    const url = new URL(request.url);

    // Guests may read; an expired token on a read is treated as a guest, on a write as "sign in again".
    const owner = await accountFrom(request, env, now, deps);
    const viewer = owner?.uid ?? null;
    if (owner) await noteActive(db, env, owner.uid, now);
    if (m === "GET") {
      if (owner) await enforce(db, "cread:" + owner.uid, COMMUNITY_LIMITS.readsPerMinute, now, { windowMs: 60e3 }, "Just a moment.");
      else {
        const net = await networkKey(db, env, request, now);
        await noteNetwork(db, net, now);
        await enforce(db, "cgread:" + net, COMMUNITY_LIMITS.guestReadsPerMinute, now, { windowMs: 60e3 }, "Just a moment.");
      }
    }
    const needAccount = async () => {
      if (!owner) throw fail(401, "sign_in_required", hasToken(request) ? "Your sign-in has expired. Sign in again." : "Sign in to take part in Community.");
      // Deleting your own data is always allowed, even unverified or banned.
      if (path[0] === "me" && path.length === 1 && m === "DELETE") return owner;
      if (owner.unverified) throw fail(403, "email_unverified", "Confirm your email address first: check your inbox.");
      if (await isBanned(db, owner.uid)) throw fail(403, "banned", "Your Community access has been suspended.");
      return owner;
    };

    // ---- GET /photo/:id ----
    if (path[0] === "photo" && path.length === 2 && m === "GET") {
      if (!POST_ID_RE.test(path[1])) return err(404, "not_found", "Not found.");
      const row = await db.prepare(`SELECT p.photo, p.photo_v FROM posts p LEFT JOIN users u ON u.uid = p.uid WHERE p.id = ?1 AND p.photo IS NOT NULL AND ${visible("?2")}`).bind(path[1], viewer ?? "").first();
      if (!row) return err(404, "not_found", "Not found.");
      return new Response(new Uint8Array(row.photo), {
        headers: { "content-type": "image/jpeg", "cache-control": "private, no-cache", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
      });
    }

    // ---- GET /feed ----
    if (path[0] === "feed" && path.length === 1 && m === "GET") {
      const q = url.searchParams;
      const kind = POST_KINDS.includes(q.get("kind")) ? q.get("kind") : null;
      const species = SPECIES_RE.test(q.get("species") || "") ? q.get("species") : null;
      const following = q.get("tab") === "following";
      if (following && !viewer) return err(401, "sign_in_required", "Sign in to see anglers you follow.");
      const c = Number(q.get("cursor"));
      const cursor = Number.isFinite(c) && c > 0 ? c : now + 1;
      const N = COMMUNITY_LIMITS.page;
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${visible("?1")}
          AND (?2 IS NULL OR p.kind = ?2) AND (?3 IS NULL OR p.species = ?3)
          AND (?4 = 0 OR p.uid IN (SELECT followee FROM follows WHERE follower = ?1))
          AND p.created_at < ?5 ORDER BY p.created_at DESC LIMIT ${N}`)
        .bind(viewer ?? "", kind, species, following ? 1 : 0, cursor).all()).results || [];
      return json({ posts: rows.map((r) => postOut(r, viewer)), cursor: rows.length === N ? rows[rows.length - 1].created_at : null });
    }

    // ---- /me ----
    if (path[0] === "me" && path.length === 1) {
      const me = await needAccount();
      if (m === "GET") {
        const row = await db.prepare(`SELECT name,
          (SELECT COUNT(*) FROM follows WHERE followee = ?1) AS followers, (SELECT COUNT(*) FROM follows WHERE follower = ?1) AS following,
          (SELECT COUNT(*) FROM posts WHERE uid = ?1 AND deleted_at IS NULL) AS posts FROM users WHERE uid = ?1`).bind(me.uid).first();
        return json({ me: { uid: me.uid, name: row?.name ?? null, followers: row?.followers ?? 0, following: row?.following ?? 0, posts: row?.posts ?? 0 } });
      }
      // DELETE /me: the Community half of "Delete my data" (DELETE /api/sync is the backup half).
      if (m === "DELETE") return json({ ok: true, ...(await deleteCommunityData(db, me.uid, now)) });
      if (m === "PUT") {
        await enforce(db, "cname:" + me.uid, COMMUNITY_LIMITS.namesPerDay, now, { daily: true }, "You've changed your name a lot today. Try again tomorrow.");
        const name = cleanName((await readJson(request)).name);
        await db.prepare(`INSERT INTO users (uid, name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(uid) DO UPDATE SET name = ?2`).bind(me.uid, name, now).run();
        return json({ ok: true, name });
      }
    }

    // ---- POST /posts ----
    if (path[0] === "posts" && path.length === 1 && m === "POST") {
      const me = await needAccount();
      const input = readPost(await readJson(request, COMMUNITY_LIMITS.bodyBytes));
      await enforce(db, "cpost-m:" + me.uid, COMMUNITY_LIMITS.postsPerMinute, now, { windowMs: 60e3 }, "Just a moment between posts.");
      await enforce(db, "cpost-d:" + me.uid, COMMUNITY_LIMITS.postsPerDay, now, { daily: true }, "You've shared a lot today. New posts are back tomorrow; everything else in Community still works.");
      const id = randomId(16);
      await db.prepare(`INSERT INTO posts (id, uid, kind, text, species, area, photo, photo_v, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(id, me.uid, input.kind, input.text, input.species, input.area, input.photo, input.photo ? 1 : 0, now).run();
      return json({ post: postOut(await visiblePost(db, id, me.uid), me.uid) }, 201);
    }

    if (path[0] === "posts" && POST_ID_RE.test(path[1] || "")) {
      const pid = path[1];
      // ---- DELETE /posts/:id (author only) ----
      if (path.length === 2 && m === "DELETE") {
        const me = await needAccount();
        const r = await db.prepare(`UPDATE posts SET deleted_at = ?3, text = '', photo = NULL, photo_v = 0, area = NULL WHERE id = ?1 AND uid = ?2 AND deleted_at IS NULL`).bind(pid, me.uid, now).run();
        if (!r.meta?.changes) return err(404, "not_found", "Post not found.");
        await db.prepare(`DELETE FROM post_reports WHERE post_id = ?1`).bind(pid).run();
        return json({ ok: true });
      }
      // ---- POST /posts/:id/report ----
      if (path[2] === "report" && path.length === 3 && m === "POST") {
        const me = await needAccount();
        const post = await visiblePost(db, pid, me.uid);
        if (!post) return err(404, "not_found", "This post isn't available.");
        if (post.uid === me.uid) return err(400, "own_post", "You can't report your own post. You can delete it instead.");
        await enforce(db, "creport:" + me.uid, COMMUNITY_LIMITS.reportsPerDay, now, { daily: true }, "You've sent a lot of reports today. More are back tomorrow; our moderators have the ones you've sent.");
        const body = await readJson(request);
        const reason = REPORT_REASONS.includes(body.reason) ? body.reason : "other";
        const r = await db.prepare(`INSERT OR IGNORE INTO post_reports (post_id, uid, reason, created_at) VALUES (?1, ?2, ?3, ?4)`).bind(pid, me.uid, reason, now).run();
        if (r.meta?.changes) {
          // Every report reaches the admin queue. Reports from REPORTS_TO_HIDE different accounts hide the post until
          // an admin reviews it; a post an admin kept isn't hidden automatically again.
          await db.prepare(`UPDATE posts SET reports = reports + 1,
              hidden = CASE WHEN reviewed_at IS NULL AND (SELECT COUNT(*) FROM post_reports WHERE post_id = ?1) >= ?2 THEN 1 ELSE hidden END
            WHERE id = ?1`).bind(pid, REPORTS_TO_HIDE).run();
        }
        return json({ ok: true });
      }
    }

    // ---- POST/DELETE /block/:uid and /follow/:uid ----
    if ((path[0] === "block" || path[0] === "follow") && path.length === 2 && (m === "POST" || m === "DELETE")) {
      const me = await needAccount();
      const other = path[1];
      if (!UID_RE.test(other)) return err(404, "not_found", "Angler not found.");
      if (other === me.uid) return err(400, "self", path[0] === "block" ? "You can't block yourself." : "You can't follow yourself.");
      if (path[0] === "block") {
        if (m === "DELETE") {
          await db.prepare(`DELETE FROM blocks WHERE blocker = ?1 AND blocked = ?2`).bind(me.uid, other).run();
          return json({ ok: true, blocked: false });
        }
        const known = await db.prepare(`SELECT 1 FROM users WHERE uid = ?1 UNION SELECT 1 FROM posts WHERE uid = ?1 LIMIT 1`).bind(other).first();
        if (!known) return err(404, "not_found", "Angler not found.");
        await enforce(db, "cblock:" + me.uid, COMMUNITY_LIMITS.blocksPerDay, now, { daily: true }, "You've blocked a lot of anglers today. Try again tomorrow.");
        // Blocking also ends following, both ways.
        await db.batch([
          db.prepare(`INSERT OR IGNORE INTO blocks (blocker, blocked, at) VALUES (?1, ?2, ?3)`).bind(me.uid, other, now),
          db.prepare(`DELETE FROM follows WHERE (follower = ?1 AND followee = ?2) OR (follower = ?2 AND followee = ?1)`).bind(me.uid, other),
        ]);
        return json({ ok: true, blocked: true });
      }
      if (m === "DELETE") {
        await db.prepare(`DELETE FROM follows WHERE follower = ?1 AND followee = ?2`).bind(me.uid, other).run();
        return json({ ok: true, following: false });
      }
      const target = await db.prepare(`SELECT uid, banned_at FROM users WHERE uid = ?1`).bind(other).first();
      if (!target || target.banned_at) return err(404, "not_found", "Angler not found.");
      if (await db.prepare(`SELECT 1 FROM blocks WHERE (blocker = ?1 AND blocked = ?2) OR (blocker = ?2 AND blocked = ?1)`).bind(me.uid, other).first()) {
        return err(404, "not_found", "Angler not found.");
      }
      await enforce(db, "cfollow:" + me.uid, COMMUNITY_LIMITS.followsPerDay, now, { daily: true }, "You've followed a lot of anglers today. Try again tomorrow.");
      await db.prepare(`INSERT OR IGNORE INTO follows (follower, followee, at) VALUES (?1, ?2, ?3)`).bind(me.uid, other, now).run();
      return json({ ok: true, following: true });
    }

    return err(404, "not_found", "Unknown route.");
  } catch (e) {
    return toResponse(e, now, "community");
  }
}

// ---- deleting an account's Community data ----

/**
 * Removes everything this account put into Community: its posts (text, photo and area cleared, kept only as deleted
 * rows so reports about them can be resolved), reports it made, its follows and blocks both ways, and its name.
 * A ban stays in place (the users row keeps only the ban), so deleting data can't be used to lift one.
 */
export async function deleteCommunityData(db, uid, now) {
  const posts = await db.prepare(`UPDATE posts SET deleted_at = ?2, text = '', photo = NULL, photo_v = 0, area = NULL, species = NULL WHERE uid = ?1 AND deleted_at IS NULL`).bind(uid, now).run();
  await db.batch([
    db.prepare(`DELETE FROM post_reports WHERE uid = ?1 OR post_id IN (SELECT id FROM posts WHERE uid = ?1)`).bind(uid),
    db.prepare(`DELETE FROM follows WHERE follower = ?1 OR followee = ?1`).bind(uid),
    db.prepare(`DELETE FROM blocks WHERE blocker = ?1 OR blocked = ?1`).bind(uid),
    db.prepare(`DELETE FROM users WHERE uid = ?1 AND banned_at IS NULL`).bind(uid),
    db.prepare(`UPDATE users SET name = NULL WHERE uid = ?1`).bind(uid),
  ]);
  return { postsDeleted: posts.meta?.changes ?? 0 };
}

// ---- moderation (admin.js) ----

export async function setBan(db, uid, banned, byUid, now) {
  if (banned) {
    await db.prepare(`INSERT INTO users (uid, created_at, banned_at, banned_by) VALUES (?1, ?2, ?2, ?3)
      ON CONFLICT(uid) DO UPDATE SET banned_at = ?2, banned_by = ?3`).bind(uid, now, byUid ?? null).run();
  } else {
    await db.prepare(`UPDATE users SET banned_at = NULL, banned_by = NULL WHERE uid = ?1`).bind(uid).run();
  }
}
