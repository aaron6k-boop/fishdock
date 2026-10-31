// /api/community: coarse areas only (coordinates and fine grid references refused), photos stripped,
// reports hide posts, blocks hide both ways, follows, bans, the community flag.
import test from "node:test";
import assert from "node:assert/strict";
import { handleCommunity, readPost } from "../server/community.js";
import { handleAdmin } from "../server/admin.js";
import { looksLikeLocation, areaCheck } from "../server/locationText.js";
import { setup, stubFetch, jpeg, b64 } from "./helpers/fishdock.js";

function cSetup(t, env = {}) {
  stubFetch(t, []);
  const s = setup({ env: { ADMIN_EMAILS: "boss@fishdock.example", ...env } });
  return { s, c: s.call(handleCommunity, "/api/community/"), admin: s.call(handleAdmin, "/api/admin/") };
}
const post = (extra = {}) => ({ kind: "catch", text: "Lovely bass on a sandeel at dusk", species: "bass", area: "Chesil Beach", ...extra });

test("location text: coordinates, grid references, postcodes, what3words and map links are spotted", () => {
  for (const s of ["50.6123, -2.4567", "50.61,-2.45", "N50.61 W2.45", "50°36'N", "SY 6781 7654", "SY67817654", "DT4 9XE", "///filled.count.soap", "https://maps.app.goo.gl/abc", "google.com/maps/@50.6,-2.4"]) {
    assert.equal(looksLikeLocation(s), true, s);
  }
  for (const s of ["Bass 52 cm, 1.4 kg", "Caught on a 2/0 hook", "Size 6 hook", "Chesil Beach", "Low water at 4.30"]) assert.equal(looksLikeLocation(s), false, s);
});

test("area: place names, 10 km squares and one-decimal coordinates are fine; anything finer is refused", () => {
  for (const a of ["Chesil Beach", "Dorset", "Lower Wye", "SY68", "SY 6 8", "sy68", "50.6°, -2.4° (10 km area)", "50.6, -2.4", "A350 lay-by area"]) assert.equal(areaCheck(a), "ok", a);
  for (const a of ["50.61, -2.45", "50.6123,-2.4567", "SY678", "SY 678 765", "SY6781", "DT4 9XE", "///filled.count.soap", "J 123 456", "maps.apple.com/?ll=50.6,-2.4", "Spot at 50.613"]) assert.equal(areaCheck(a), "fine", a);
});

test("posting needs a confirmed, unbanned account; text, area and species are checked; photos are stripped", async (t) => {
  const { s, c } = cSetup(t);
  assert.equal((await c("POST", "posts", { body: post() })).status, 401);
  assert.equal((await c("POST", "posts", { tok: "tok-dave", body: post() })).status, 403);
  assert.equal((await c("POST", "posts", { tok: "tok-alice", body: post(), origin: "https://evil.example" })).status, 403);
  const bad = async (body, code) => {
    const r = await c("POST", "posts", { tok: "tok-alice", body: post(body) });
    assert.equal(r.status === 400 || r.status === 413, true, JSON.stringify(body));
    assert.equal(r.body.error, code, JSON.stringify(body));
  };
  await bad({ area: "50.6123, -2.4567" }, "area_too_precise");
  await bad({ area: "SY 6781 7654" }, "area_too_precise");
  await bad({ area: "SY678" }, "area_too_precise");
  await bad({ area: "DT4 9XE" }, "area_too_precise");
  await bad({ text: "Fish were at 50.6123, -2.4567 tonight" }, "location_in_text");
  await bad({ text: "Try SY 678 765 at low water" }, "location_in_text");
  await bad({ text: "" }, "bad_text");
  await bad({ text: "x".repeat(1001) }, "too_long");
  await bad({ kind: "brag" }, "bad_kind");
  await bad({ species: "Bass!" }, "bad_species");
  await bad({ photo: "not a photo" }, "bad_image");

  const r = await c("POST", "posts", { tok: "tok-alice", body: post({ area: "SY68", photo: b64(jpeg()) }) });
  assert.equal(r.status, 201);
  assert.equal(r.body.post.area, "SY68");
  assert.equal(r.body.post.author.uid, "alice");
  assert.ok(r.body.post.photoUrl);
  const stored = await s.db.prepare(`SELECT photo FROM posts WHERE id = ?1`).bind(r.body.post.id).first();
  const bytes = Buffer.from(stored.photo);
  assert.equal(bytes.includes(Buffer.from("GPSLatitude")), false);
  assert.equal(bytes.includes(Buffer.from("Secret mark")), false);
  const img = await c("GET", r.body.post.photoUrl.replace("/api/community/", ""));
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  // Guests may read the feed; filters work.
  await c("POST", "posts", { tok: "tok-bob", body: { kind: "question", text: "Anyone out on the Wye this weekend?", area: "Herefordshire" } });
  const feed = await c("GET", "feed");
  assert.equal(feed.status, 200);
  assert.equal(feed.body.posts.length, 2);
  assert.equal(feed.body.posts[0].kind, "question"); // newest first
  assert.equal(feed.body.cursor, null);
  assert.deepEqual((await c("GET", "feed?species=bass")).body.posts.map((p) => p.species), ["bass"]);
  assert.deepEqual((await c("GET", "feed?kind=question")).body.posts.map((p) => p.kind), ["question"]);
  assert.equal("lat" in feed.body.posts[0] || "lon" in feed.body.posts[0], false);
  assert.throws(() => readPost({ kind: "catch", text: "ok", area: 52 }), /area/);
});

test("reports: three accounts hide a post (its author still sees it); you can't report your own", async (t) => {
  const { s, c, admin } = cSetup(t);
  const id = (await c("POST", "posts", { tok: "tok-alice", body: post() })).body.post.id;
  assert.equal((await c("POST", `posts/${id}/report`, { tok: "tok-alice", body: { reason: "spam" } })).status, 400);
  assert.equal((await c("POST", `posts/${id}/report`, { body: { reason: "spam" } })).status, 401);
  for (const tok of ["tok-bob", "tok-bob", "tok-carol"]) assert.equal((await c("POST", `posts/${id}/report`, { tok, body: { reason: "location" } })).status, 200);
  assert.equal((await c("GET", "feed")).body.posts.length, 1); // two different accounts: still visible
  await c("POST", `posts/${id}/report`, { tok: "tok-erin", body: { reason: "whatever" } });
  assert.equal((await c("GET", "feed")).body.posts.length, 0);
  const mine = await c("GET", "feed", { tok: "tok-alice" });
  assert.equal(mine.body.posts.length, 1);
  assert.equal(mine.body.posts[0].hidden, true);
  const row = await s.db.prepare(`SELECT reports, hidden FROM posts WHERE id = ?1`).bind(id).first();
  assert.deepEqual({ ...row }, { reports: 3, hidden: 1 });
  // The admin queue lists it with its reasons.
  const q = await admin("GET", "reports", { tok: "tok-admin" });
  assert.equal(q.body.items.length, 1);
  assert.equal(q.body.items[0].postId, id);
  assert.equal(q.body.items[0].reports, 3);
  assert.deepEqual(q.body.items[0].reasons.sort(), ["location", "other"]);
  // An admin keeps it: visible again, queue cleared, and further reports don't hide it automatically.
  assert.equal((await admin("POST", `posts/${id}/hide`, { tok: "tok-admin", body: { hidden: false } })).body.hidden, false);
  assert.equal((await c("GET", "feed")).body.posts.length, 1);
  assert.equal((await admin("GET", "reports", { tok: "tok-admin" })).body.items.length, 0);
});

test("blocks hide posts both ways and end following; follows need a real, unblocked angler", async (t) => {
  const { c } = cSetup(t);
  await c("PUT", "me", { tok: "tok-bob", body: { name: "Bob the Bass" } });
  await c("POST", "posts", { tok: "tok-bob", body: post({ text: "Bob's bass" }) });
  await c("POST", "posts", { tok: "tok-alice", body: post({ text: "Alice's bass" }) });
  assert.equal((await c("POST", "follow/bob", { tok: "tok-alice" })).body.following, true);
  assert.equal((await c("POST", "follow/alice", { tok: "tok-alice" })).status, 400);
  assert.equal((await c("POST", "follow/nobody", { tok: "tok-alice" })).status, 404);
  const following = await c("GET", "feed?tab=following", { tok: "tok-alice" });
  assert.deepEqual(following.body.posts.map((p) => p.author.name), ["Bob the Bass"]);
  assert.equal((await c("GET", "feed?tab=following")).status, 401);
  assert.equal((await c("POST", "block/bob", { tok: "tok-alice" })).body.blocked, true);
  assert.deepEqual((await c("GET", "feed", { tok: "tok-alice" })).body.posts.map((p) => p.text), ["Alice's bass"]);
  assert.deepEqual((await c("GET", "feed", { tok: "tok-bob" })).body.posts.map((p) => p.text), ["Bob's bass"]);
  assert.equal((await c("GET", "feed?tab=following", { tok: "tok-alice" })).body.posts.length, 0);
  assert.equal((await c("POST", "follow/alice", { tok: "tok-bob" })).status, 404); // blocked either way
  assert.equal((await c("POST", "block/ghost", { tok: "tok-alice" })).status, 404);
  assert.equal((await c("DELETE", "block/bob", { tok: "tok-alice" })).body.blocked, false);
  assert.equal((await c("GET", "feed", { tok: "tok-alice" })).body.posts.length, 2);
  assert.equal((await c("PUT", "me", { tok: "tok-alice", body: { name: "a@b.com" } })).status, 400);
  assert.equal((await c("PUT", "me", { tok: "tok-alice", body: { name: "Mark 50.61,-2.45" } })).status, 400);
  const me = await c("GET", "me", { tok: "tok-alice" });
  assert.equal(me.body.me.posts, 1);
});

test("bans: a banned account can't post, report, follow or block, and its posts leave the feed", async (t) => {
  const { c, admin, s } = cSetup(t);
  const id = (await c("POST", "posts", { tok: "tok-bob", body: post({ text: "Bob's post" }) })).body.post.id;
  await c("POST", "posts", { tok: "tok-alice", body: post({ text: "Alice's post" }) });
  assert.equal((await admin("POST", "users/bob/ban", { tok: "tok-admin", body: {} })).body.banned, true);
  for (const [m, p, body] of [["POST", "posts", post()], ["POST", `posts/${id}/report`, { reason: "spam" }], ["POST", "follow/alice"], ["POST", "block/alice"], ["PUT", "me", { name: "Bob" }]]) {
    const r = await c(m, p, { tok: "tok-bob", body });
    assert.equal(r.status, 403, p);
    assert.equal(r.body.error, "banned", p);
  }
  assert.deepEqual((await c("GET", "feed")).body.posts.map((p) => p.text), ["Alice's post"]);
  assert.equal((await c("GET", `photo/${id}`)).status, 404);
  assert.equal((await c("POST", "follow/bob", { tok: "tok-alice" })).status, 404);
  const audit = await s.db.prepare(`SELECT action, target FROM admin_audit`).all();
  assert.deepEqual(audit.results.map((r) => r.action), ["user.ban"]);
  await admin("POST", "users/bob/ban", { tok: "tok-admin", body: { banned: false } });
  assert.equal((await c("GET", "feed")).body.posts.length, 2);
});

test("authors delete their own posts; the community flag switches Community off; no database is a 503", async (t) => {
  const { c, admin } = cSetup(t);
  const id = (await c("POST", "posts", { tok: "tok-alice", body: post() })).body.post.id;
  assert.equal((await c("DELETE", `posts/${id}`, { tok: "tok-bob" })).status, 404);
  assert.equal((await c("DELETE", `posts/${id}`, { tok: "tok-alice" })).status, 200);
  assert.equal((await c("GET", "feed")).body.posts.length, 0);
  await admin("PUT", "flags", { tok: "tok-admin", body: { flags: { community: false } } });
  const off = await c("GET", "feed");
  assert.equal(off.status, 503);
  assert.equal(off.body.error, "feature_off");
  const noDb = setup({ db: false });
  assert.equal((await noDb.call(handleCommunity, "/api/community/")("GET", "feed")).status, 503);
});

test("DELETE /me erases an account's Community data (posts, reports, follows, blocks, name) but keeps a ban", async (t) => {
  const { s, c, admin } = cSetup(t);
  await c("PUT", "me", { tok: "tok-alice", body: { name: "Alice" } });
  const a1 = (await c("POST", "posts", { tok: "tok-alice", body: post({ photo: b64(jpeg()) }) })).body.post.id;
  const b1 = (await c("POST", "posts", { tok: "tok-bob", body: post({ text: "Bob's" }) })).body.post.id;
  await c("POST", `posts/${b1}/report`, { tok: "tok-alice", body: { reason: "spam" } });
  await c("POST", "follow/bob", { tok: "tok-alice" });
  await c("PUT", "me", { tok: "tok-carol", body: { name: "Carol" } });
  assert.equal((await c("POST", "block/carol", { tok: "tok-alice" })).status, 200);
  const r = await c("DELETE", "me", { tok: "tok-alice" });
  assert.equal(r.status, 200);
  assert.equal(r.body.postsDeleted, 1);
  const row = await s.db.prepare(`SELECT text, photo, area, deleted_at FROM posts WHERE id = ?1`).bind(a1).first();
  assert.equal(row.text, "");
  assert.equal(row.photo, null);
  assert.ok(row.deleted_at);
  for (const table of ["post_reports", "follows", "blocks"]) assert.equal((await s.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0, table);
  assert.equal(await s.db.prepare(`SELECT 1 FROM users WHERE uid = 'alice'`).first(), null);
  assert.deepEqual((await c("GET", "feed")).body.posts.map((p) => p.text), ["Bob's"]);
  // A banned account can delete its data, and stays banned.
  await admin("POST", "users/bob/ban", { tok: "tok-admin" });
  assert.equal((await c("DELETE", "me", { tok: "tok-bob" })).status, 200);
  assert.ok((await s.db.prepare(`SELECT banned_at FROM users WHERE uid = 'bob'`).first()).banned_at);
  assert.equal((await c("DELETE", "me")).status, 401);
});

test("posting limits: a few a minute and 20 a UK day", async (t) => {
  const { s, c } = cSetup(t);
  for (let i = 0; i < 3; i++) assert.equal((await c("POST", "posts", { tok: "tok-alice", body: post({ text: "Post " + i }) })).status, 201);
  const slow = await c("POST", "posts", { tok: "tok-alice", body: post() });
  assert.equal(slow.status, 429);
  assert.equal(slow.body.kind, "slow");
  s.tick(61e3); // the minute window has passed
  for (let i = 3; i < 20; i++) {
    s.tick(25e3);
    assert.equal((await c("POST", "posts", { tok: "tok-alice", body: post({ text: "Post " + i }) })).status, 201, "post " + i);
  }
  s.tick(61e3);
  const daily = await c("POST", "posts", { tok: "tok-alice", body: post() });
  assert.equal(daily.status, 429);
  assert.equal(daily.body.kind, "daily");
  assert.ok(daily.body.resetAt > s.now());
});
