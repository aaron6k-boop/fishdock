// POST /api/feedback (guests allowed, rate-limited, nothing about the sender kept) and POST /api/metrics
// (whitelisted counter names only: no ids, no coordinates).
import test from "node:test";
import assert from "node:assert/strict";
import { handleFeedback } from "../server/feedback.js";
import { handleMetrics, metricName } from "../server/metrics.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

test("feedback: guests and accounts can send it; nothing identifying is stored", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const fb = s.call(handleFeedback, "/api/feedback");
  const r = await fb("POST", "", { body: { kind: "inaccurate-spot", text: "The car park at this spot has closed.", ref: "chesil-beach" } });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.equal((await fb("POST", "", { tok: "tok-alice", body: { kind: "idea", text: "A wind arrow on the map please" } })).status, 201);
  const rows = (await s.db.prepare(`SELECT * FROM feedback ORDER BY created_at`).all()).results;
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["created_at", "from_account", "id", "kind", "ref", "text"]);
  assert.equal(rows[0].from_account, 0);
  assert.equal(rows[1].from_account, 1);
  assert.doesNotMatch(JSON.stringify(rows), /alice|203\.0\.113/);
  // Validation and headers.
  assert.equal((await fb("POST", "", { body: { kind: "rant", text: "hello there" } })).body.error, "bad_kind");
  assert.equal((await fb("POST", "", { body: { kind: "bug", text: "x" } })).body.error, "bad_text");
  assert.equal((await fb("POST", "", { body: { kind: "bug", text: "y".repeat(2001) } })).body.error, "too_long");
  assert.equal((await fb("GET", "")).status, 405);
  assert.equal((await fb("POST", "", { body: { kind: "bug", text: "hello there" }, fishdock: false })).status, 403);
  assert.equal((await fb("POST", "", { body: { kind: "bug", text: "hello there" }, origin: null })).status, 403);
  assert.equal((await setup({ db: false }).call(handleFeedback, "/api/feedback")("POST", "", { body: { kind: "bug", text: "hello there" } })).status, 503);
});

test("feedback: 3 a minute and 20 a UK day per network or account (429 with kind and Retry-After)", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const fb = s.call(handleFeedback, "/api/feedback");
  const send = (opts = {}) => fb("POST", "", { body: { kind: "bug", text: "The tide chart is blank" }, ip: "198.51.100.7", ...opts });
  for (let i = 0; i < 3; i++) assert.equal((await send()).status, 201);
  const slow = await send();
  assert.equal(slow.status, 429);
  assert.equal(slow.body.error, "rate_limited");
  assert.equal(slow.body.kind, "slow");
  assert.ok(Number(slow.headers.get("retry-after")) >= 1);
  assert.equal((await send({ ip: "198.51.100.8" })).status, 201); // another network is fine
  for (let i = 3; i < 20; i++) {
    if (i % 3 === 0) s.tick(61e3);
    assert.equal((await send()).status, 201, "feedback " + i);
  }
  s.tick(61e3);
  const daily = await send();
  assert.equal(daily.status, 429);
  assert.equal(daily.body.kind, "daily");
  assert.equal(daily.body.resetAt, Date.UTC(2026, 10, 1));
});

test("metric names: whitelist only, species ids and region names, never ids or coordinates", () => {
  for (const [raw, out] of [
    ["session_start", "session_start"], ["catch_logged", "catch_logged"], ["ai_cast", "ai_cast"], ["ai_identify", "ai_identify"],
    ["species_view:bass", "species_view:bass"], ["advisor_run:ballan-wrasse", "advisor_run:ballan-wrasse"],
    ["area_view:South West", "area_view:south west"], ["area_view:Dorset", "area_view:dorset"], ["area_view:Ynys Môn", "area_view:ynys môn"],
    ["area_view:St. Ives Bay", "area_view:st. ives bay"], ["area_view:custom", "area_view:custom"],
  ]) assert.equal(metricName(raw), out, raw);
  for (const raw of ["page_view", "species_view:", "species_view:Bass", "species_view:bass 50.6", "area_view:50.61,-2.45", "area_view:SY68",
    "area_view:custom1", "user:alice", "session_start:alice", "catch_logged:50.6", "area_view:" + "a".repeat(40), 42, null, "advisor_run:<script>"]) {
    assert.equal(metricName(raw), null, String(raw));
  }
});

test("POST /api/metrics counts per UK day; unknown names are dropped and nothing about the sender is kept", async (t) => {
  stubFetch(t, []);
  const s = setup();
  const m = s.call(handleMetrics, "/api/metrics");
  const r = await m("POST", "", { tok: "tok-alice", body: { events: [
    { name: "species_view:bass" }, { name: "species_view:bass" }, { name: "catch_logged", value: 3 }, { name: "catch_logged", value: 999 },
    { name: "area_view:Dorset" }, { name: "lat:50.6123" }, { name: "user:alice" }, { name: "session_start", uid: "alice", lat: 50.6 },
  ] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.counted, 6);
  assert.equal(r.body.dropped, 2);
  const rows = (await s.db.prepare(`SELECT name, day, count FROM metrics_daily ORDER BY name`).all()).results.map((x) => ({ ...x }));
  assert.deepEqual(rows, [
    { name: "area_view:dorset", day: "2026-10-31", count: 1 },
    { name: "catch_logged", day: "2026-10-31", count: 4 },
    { name: "session_start", day: "2026-10-31", count: 1 },
    { name: "species_view:bass", day: "2026-10-31", count: 2 },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /alice|50\.6/);
  // Each name at most 10 times a request; at most 50 events.
  const flood = await m("POST", "", { body: { events: Array.from({ length: 80 }, () => ({ name: "session_start" })) } });
  assert.equal(flood.body.counted, 10);
  assert.equal(flood.body.dropped, 70);
  // The next UK day is a new row.
  s.tick(13 * 3600e3);
  await m("POST", "", { body: { events: [{ name: "session_start" }] } });
  assert.equal((await s.db.prepare(`SELECT count FROM metrics_daily WHERE name = 'session_start' AND day = '2026-11-01'`).first()).count, 1);
  assert.equal((await m("POST", "", { body: { events: "nope" } })).body.counted, 0);
  assert.equal((await m("GET", "")).status, 405);
});
