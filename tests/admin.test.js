// /api/admin: access control (404 for everyone else), overview from hashed activity and counters, feedback,
// flags, and moderation.
import test from "node:test";
import assert from "node:assert/strict";
import { handleAdmin } from "../server/admin.js";
import { handleConditions } from "../server/conditions.js";
import { handleMetrics } from "../server/metrics.js";
import { handleFeedback } from "../server/feedback.js";
import { handleCommunity } from "../server/community.js";
import { handleSync } from "../server/sync.js";
import { handleAi } from "../server/ai.js";
import { setup, stubFetch, jpeg, b64 } from "./helpers/fishdock.js";

const ENV = { ADMIN_EMAILS: " Boss@FishDock.example , someone@else.example", ADMIN_UIDS: "admin2" };

test("access: only ADMIN_EMAILS (verified Google or Apple) or ADMIN_UIDS; everyone else gets a plain 404", async (t) => {
  stubFetch(t, []);
  const s = setup({ env: ENV });
  const a = s.call(handleAdmin, "/api/admin/");
  for (const opts of [{}, { tok: "tok-alice" }, { tok: "tok-unknown" }, { tok: "tok-anon" }, { tok: "tok-admin", fishdock: false }]) {
    for (const p of ["me", "overview", "feedback", "reports", "flags"]) {
      const r = await a("GET", p, opts);
      assert.equal(r.status, 404, `${p} ${JSON.stringify(opts)}`);
      assert.equal(r.body.error, "not_found");
    }
  }
  assert.equal((await a("PUT", "flags", { tok: "tok-alice", body: { flags: { community: false } } })).status, 404);
  assert.equal((await a("PUT", "flags", { tok: "tok-admin", body: { flags: { community: false } }, origin: "https://evil.example" })).status, 404);
  const me = await a("GET", "me", { tok: "tok-admin" });
  assert.equal(me.status, 200);
  assert.equal(me.body.email, "boss@fishdock.example"); // case-insensitive
  assert.equal((await a("GET", "me", { tok: "tok-uidadmin" })).status, 200); // by uid, any provider
  // An email match needs a verified Google or Apple sign-in, not an email and password account.
  const pw = setup({ env: { ADMIN_EMAILS: "erin@example.com" } });
  assert.equal((await pw.call(handleAdmin, "/api/admin/")("GET", "me", { tok: "tok-erin" })).status, 404);
  // No database: 404 as well (nothing revealed).
  assert.equal((await setup({ db: false, env: ENV }).call(handleAdmin, "/api/admin/")("GET", "me", { tok: "tok-admin" })).status, 404);
  assert.equal((await a("GET", "nope", { tok: "tok-admin" })).status, 404);
});

test("overview: users, DAU/MAU from hashed ids, guest network keys, sessions and catches from metrics, top lists, AI, health, feedback", async (t) => {
  const s = setup({ env: { ...ENV, GEMINI_API_KEY: "g" } });
  stubFetch(t, [
    [/\/\/api\.open-meteo\.com/, () => new Response("down", { status: 503 })],
    [/marine-api/, () => ({ hourly: { time: [] } })],
    [/generativelanguage/, () => ({ candidates: [{ content: { parts: [{ text: '{"candidates":[{"species":"Bass","id":"bass","confidence":"high","why":"spiny dorsal"}]}' }] } }] })],
  ]);
  const sync = s.call(handleSync, "/api/sync");
  const metrics = s.call(handleMetrics, "/api/metrics");
  // Yesterday: alice and bob active; today: alice and carol, plus two guest networks.
  s.tick(-86400e3);
  await sync("GET", "", { tok: "tok-alice" });
  await sync("GET", "", { tok: "tok-bob" });
  s.tick(86400e3);
  await sync("GET", "", { tok: "tok-alice" });
  await sync("GET", "", { tok: "tok-carol" });
  await s.call(handleConditions, "/api/conditions")("GET", "?lat=50.6&lon=-2.45", { ip: "198.51.100.1" });
  await metrics("POST", "", { ip: "198.51.100.2", body: { events: [
    { name: "session_start" }, { name: "session_start" }, { name: "catch_logged" }, { name: "species_view:bass" }, { name: "species_view:bass" },
    { name: "species_view:pollack" }, { name: "area_view:Dorset" }, { name: "advisor_run:bass" },
  ] } });
  await s.call(handleFeedback, "/api/feedback")("POST", "", { body: { kind: "bug", text: "Wind arrow points the wrong way" } });
  await s.call(handleAi, "/api/ai/")("POST", "identify", { tok: "tok-alice", body: { image: b64(jpeg()) } });

  const o = await s.call(handleAdmin, "/api/admin/")("GET", "overview", { tok: "tok-admin" });
  assert.equal(o.status, 200);
  assert.equal(o.body.users.total, 3); // alice, bob, carol (opening the admin panel isn't app activity)
  assert.equal(o.body.users.dau, 2); // alice and carol today
  assert.equal(o.body.users.mau, 3);
  assert.equal(o.body.guests.today, 3); // networks seen today: conditions, metrics and feedback came from three
  assert.equal(o.body.sessions.total, 2);
  assert.equal(o.body.catches.total, 1);
  assert.deepEqual(o.body.topSpecies, [{ name: "bass", count: 2 }, { name: "pollack", count: 1 }]);
  assert.deepEqual(o.body.topRegions, [{ name: "dorset", count: 1 }]);
  assert.deepEqual(o.body.topAdvisor, [{ name: "bass", count: 1 }]);
  assert.equal(o.body.ai.identifyToday, 1);
  assert.equal(o.body.ai.castToday, 0);
  assert.equal(o.body.feedback.week, 1);
  const om = o.body.health.find((h) => h.upstream === "open-meteo");
  assert.ok(om.lastFail > 0);
  assert.equal(om.lastError, "http_503");
  assert.equal(o.body.health.find((h) => h.upstream === "gemini").lastError, null);
  // Activity is stored only as hashed keys: no uid or address anywhere in it.
  const active = JSON.stringify((await s.db.prepare(`SELECT * FROM active_days`).all()).results);
  assert.doesNotMatch(active, /alice|bob|carol|198\.51/);
});

test("feedback list, flags GET/PUT (known booleans only) and audit", async (t) => {
  stubFetch(t, []);
  const s = setup({ env: ENV });
  const a = s.call(handleAdmin, "/api/admin/");
  const fb = s.call(handleFeedback, "/api/feedback");
  await fb("POST", "", { body: { kind: "idea", text: "Please add carp venues", ref: "explore" } });
  s.tick(1000);
  await fb("POST", "", { tok: "tok-alice", body: { kind: "inaccurate-forecast", text: "It rained all day" } });
  const list = await a("GET", "feedback", { tok: "tok-admin" });
  assert.deepEqual(list.body.items.map((i) => [i.kind, i.ref, i.fromAccount]), [["inaccurate-forecast", null, true], ["idea", "explore", false]]);
  assert.ok(list.body.items[0].createdAt > list.body.items[1].createdAt);
  assert.deepEqual(Object.keys(list.body.items[0]).sort(), ["createdAt", "fromAccount", "id", "kind", "ref", "text"]);

  assert.deepEqual((await a("GET", "flags", { tok: "tok-admin" })).body, { flags: { castAdvisor: true, identify: true, smartBite: true, community: true, liveShare: true } });
  const put = await a("PUT", "flags", { tok: "tok-admin", body: { flags: { smartBite: false, community: "no", hacker: true } } });
  assert.deepEqual(put.body.flags, { castAdvisor: true, identify: true, smartBite: false, community: true, liveShare: true });
  assert.equal((await a("PUT", "flags", { tok: "tok-admin", body: { nope: 1 } })).status, 400);
  const audit = (await s.db.prepare(`SELECT action, detail FROM admin_audit`).all()).results;
  assert.equal(audit.length, 1);
  assert.deepEqual(JSON.parse(audit[0].detail), { smartBite: false });
});

test("moderation: hide a post, ban needs a recent sign-in, admins can't ban themselves; banned admins lose the panel", async (t) => {
  stubFetch(t, []);
  const s = setup({ env: { ...ENV, ADMIN_EMAILS: ENV.ADMIN_EMAILS + ",old@fishdock.example" } });
  const a = s.call(handleAdmin, "/api/admin/");
  const c = s.call(handleCommunity, "/api/community/");
  const id = (await c("POST", "posts", { tok: "tok-bob", body: { kind: "report", text: "Mackerel showing off the pier", area: "Weymouth" } })).body.post.id;
  await c("POST", `posts/${id}/report`, { tok: "tok-alice", body: { reason: "spam" } });
  const reports = await a("GET", "reports", { tok: "tok-admin" });
  assert.deepEqual(Object.keys(reports.body.items[0]).sort(), ["area", "author", "authorBanned", "authorUid", "createdAt", "hidden", "kind", "lastReportAt", "postId", "reasons", "reports", "species", "text"]);
  assert.equal(reports.body.items[0].authorUid, "bob");
  assert.equal((await a("POST", `posts/${id}/hide`, { tok: "tok-admin" })).body.hidden, true);
  assert.equal((await c("GET", "feed")).body.posts.length, 0);
  assert.equal((await a("POST", "posts/doesnotexist000000/hide", { tok: "tok-admin" })).status, 404);
  assert.equal((await a("POST", "users/bob/ban", { tok: "tok-oldadmin" })).status, 401); // signed in an hour ago
  assert.equal((await a("POST", "users/admin1/ban", { tok: "tok-admin" })).status, 400);
  assert.equal((await a("POST", "users/bob/ban", { tok: "tok-admin" })).status, 200);
  assert.equal((await c("POST", "posts", { tok: "tok-bob", body: { kind: "report", text: "Still here?" } })).body.error, "banned");
  // A banned admin loses the panel at once.
  assert.equal((await a("GET", "me", { tok: "tok-uidadmin" })).status, 200);
  assert.equal((await a("POST", "users/admin2/ban", { tok: "tok-admin" })).status, 200);
  assert.equal((await a("GET", "me", { tok: "tok-uidadmin" })).status, 404);
  const actions = (await s.db.prepare(`SELECT action FROM admin_audit ORDER BY at, rowid`).all()).results.map((r) => r.action);
  assert.deepEqual(actions, ["post.hide", "user.ban", "user.ban"]);
});
