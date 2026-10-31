// /api/sync: private per-account backup. Upsert (last writer wins), pull since a cursor, erase, export.
import test from "node:test";
import assert from "node:assert/strict";
import { handleSync, SYNC_LIMITS } from "../server/sync.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

const rec = (kind, id, updatedAt, data, extra = {}) => ({ kind, id, updatedAt, data, ...extra });

test("sign-in is required: 401 signed out or expired, 403 unconfirmed email, anonymous accounts refused", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const sync = s.call(handleSync, "/api/sync");
  assert.equal((await sync("GET", "")).status, 401);
  assert.equal((await sync("GET", "", { tok: "tok-unknown" })).status, 401);
  assert.equal((await sync("GET", "", { tok: "tok-anon" })).status, 401);
  assert.equal((await sync("GET", "", { tok: "tok-dave" })).status, 403);
  assert.equal((await sync("GET", "", { tok: "tok-alice", fishdock: false })).status, 403);
  assert.equal((await sync("PUT", "", { tok: "tok-alice", body: { records: [] }, origin: "https://evil.example" })).status, 403);
  const noDb = setup({ db: false });
  assert.equal((await noDb.call(handleSync, "/api/sync")("GET", "", { tok: "tok-alice" })).status, 503);
});

test("upsert, since and last writer wins, per account only", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const sync = s.call(handleSync, "/api/sync");
  const put = await sync("PUT", "", { tok: "tok-alice", body: { records: [
    rec("catch", "c_1", 1000, { species: "bass", lengthCm: 52, lat: 50.6123, lon: -2.4567 }),
    rec("session", "s_1", 1000, { startedAt: 1, track: [[50.61, -2.45]] }),
    rec("mark", "m_1", 1000, { name: "Secret groyne" }),
    rec("nonsense", "x", 1000, {}),
    rec("catch", "bad id!", 1000, {}),
    rec("catch", "c_2", "soon", {}),
    rec("catch", "c_3", 1000, ["not", "an", "object"]),
    rec("catch", "c_4", 1000, { photos: [{ src: "data:image/jpeg;base64,/9j/4AAQ" }] }),
    rec("catches", "c_5", 1000, { species: "pollack", photo: "data:image/jpeg;base64,/9j/4AAQ" }),
  ] } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body.results.map((r) => r.status), ["saved", "saved", "saved", "rejected", "rejected", "rejected", "rejected", "photo_not_allowed", "saved"]);
  assert.equal(put.body.results[8].photosLeftOnPhone, true);
  const c5 = await s.db.prepare(`SELECT data FROM sync_records WHERE uid = 'alice' AND id = 'c_5'`).first();
  assert.deepEqual(JSON.parse(c5.data), { species: "pollack" });

  const all = await sync("GET", "?since=0", { tok: "tok-alice" });
  assert.equal(all.body.records.length, 4);
  assert.deepEqual(all.body.records[0].data, { species: "bass", lengthCm: 52, lat: 50.6123, lon: -2.4567 });
  const cursor = all.body.cursor;
  assert.ok(cursor > 0);
  assert.equal(all.body.more, false);
  // Bob sees nothing of Alice's, and can't overwrite it.
  assert.equal((await sync("GET", "?since=0", { tok: "tok-bob" })).body.records.length, 0);
  await sync("PUT", "", { tok: "tok-bob", body: { records: [rec("catch", "c_1", 9999, { species: "cod" })] } });
  assert.equal((await s.db.prepare(`SELECT COUNT(*) AS n FROM sync_records WHERE uid = 'alice' AND kind = 'catch' AND id = 'c_1' AND data LIKE '%bass%'`).first()).n, 1);

  // An older copy is ignored ("kept_newer"); a newer one wins and shows up after the cursor.
  s.tick(1000);
  const older = await sync("PUT", "", { tok: "tok-alice", body: { records: [rec("catch", "c_1", 500, { species: "pollack" })] } });
  assert.equal(older.body.results[0].status, "kept_newer");
  assert.equal((await sync("GET", "?since=" + cursor, { tok: "tok-alice" })).body.records.length, 0);
  const newer = await sync("PUT", "", { tok: "tok-alice", body: { records: [rec("catch", "c_1", 2000, { species: "bass", lengthCm: 55 }), rec("mark", "m_1", 2000, null, { deleted: true })] } });
  assert.deepEqual(newer.body.results.map((r) => r.status), ["saved", "saved"]);
  const changed = await sync("GET", "?since=" + cursor, { tok: "tok-alice" });
  assert.equal(changed.body.records.length, 2);
  assert.deepEqual(changed.body.records.map((r) => [r.kind, r.id, r.deleted ?? false]), [["catch", "c_1", false], ["mark", "m_1", true]]);
  assert.equal(changed.body.records[0].data.lengthCm, 55);
  assert.equal(changed.body.records[1].data, null);
});

test("caps: batch size, record size, body size and the per-account storage limit", async (t) => {
  stubFetch(t, []);
  const s = setup({ env: { SYNC_MAX_RECORDS: "3" } });
  const sync = s.call(handleSync, "/api/sync");
  const many = Array.from({ length: SYNC_LIMITS.batch + 1 }, (_, i) => rec("catch", "c" + i, 1, { i }));
  assert.equal((await sync("PUT", "", { tok: "tok-alice", body: { records: many } })).status, 413);
  const big = await sync("PUT", "", { tok: "tok-alice", body: { records: [rec("session", "s", 1, { track: "x".repeat(SYNC_LIMITS.recordBytes) })] } });
  assert.equal(big.body.results[0].status, "too_large");
  assert.equal((await sync("PUT", "", { tok: "tok-alice", body: "{" })).status, 400);
  assert.equal((await sync("PUT", "", { tok: "tok-alice", body: { nope: 1 } })).status, 400);
  const four = await sync("PUT", "", { tok: "tok-alice", body: { records: ["a", "b", "c", "d"].map((id) => rec("catch", id, 1, { id })) } });
  assert.deepEqual(four.body.results.map((r) => r.status), ["saved", "saved", "saved", "over_quota"]);
  // Updating a stored record and deleting one still work when full.
  const upd = await sync("PUT", "", { tok: "tok-alice", body: { records: [rec("catch", "a", 2, { id: "a", more: true }), rec("catch", "b", 2, null, { deleted: true }), rec("catch", "d", 3, { id: "d" })] } });
  assert.deepEqual(upd.body.results.map((r) => r.status), ["saved", "saved", "saved"]);
});

test("export has everything for the account; DELETE erases every record (and only this account's)", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const sync = s.call(handleSync, "/api/sync");
  await sync("PUT", "", { tok: "tok-alice", body: { records: [rec("catch", "c1", 1, { species: "bass" }), rec("settings", "main", 1, { units: "cm" }), rec("mark", "gone", 1, null, { deleted: true })] } });
  await sync("PUT", "", { tok: "tok-bob", body: { records: [rec("catch", "b1", 1, { species: "cod" })] } });
  const ex = await sync("GET", "/export", { tok: "tok-alice" });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.app, "FishDock");
  assert.equal(ex.body.account.uid, "alice");
  assert.deepEqual(ex.body.records.map((r) => r.id).sort(), ["c1", "main"]);
  assert.match(ex.headers.get("content-disposition"), /attachment/);
  assert.deepEqual(ex.body.community.posts, []);
  const del = await sync("DELETE", "", { tok: "tok-alice" });
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, 3);
  assert.equal((await sync("GET", "?since=0", { tok: "tok-alice" })).body.records.length, 0);
  assert.equal((await sync("GET", "?since=0", { tok: "tok-bob" })).body.records.length, 1);
  assert.equal((await sync("POST", "", { tok: "tok-alice", body: {} })).status, 404);
  assert.equal((await sync("GET", "/other", { tok: "tok-alice" })).status, 404);
});

test("pull pages by the server clock, so nothing written in the same millisecond is missed", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const sync = s.call(handleSync, "/api/sync");
  for (let b = 0; b < 6; b++) {
    await sync("PUT", "", { tok: "tok-alice", body: { records: Array.from({ length: 100 }, (_, i) => rec("catch", `c${b}_${i}`, 1, { i })) } });
  }
  let since = 0, got = 0, pages = 0;
  for (;;) {
    const r = await sync("GET", "?since=" + since, { tok: "tok-alice" });
    got += r.body.records.length;
    pages++;
    since = r.body.cursor;
    if (!r.body.more) break;
  }
  assert.equal(got, 600);
  assert.equal(pages, 2);
});
