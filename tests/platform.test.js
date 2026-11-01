// Platform glue: every functions/api/<name>/[[path]].js mounts server/<name>.js; the Firebase helper proxy forwards
// only /__/auth and /__/firebase to FishDock's own project; UK-day allowances; the X-FishDock header everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { onRequest as middleware, upstreamFor } from "../functions/_middleware.js";
import { ukDay, ukDayEnd, ukIso } from "../server/time.js";
import { allowance, ensureSchema } from "../server/db.js";
import { verifyIdToken } from "../server/firebaseAuth.js";
import { setup, stubFetch, O } from "./helpers/fishdock.js";

const NAMES = ["conditions", "tides", "river", "ai", "sync", "community", "feedback", "metrics", "admin"];

test("every API name has a [[path]].js and index.js that mount server/<name>.js and answer the X-FishDock check", async (t) => {
  stubFetch(t, []);
  for (const name of NAMES) {
    const file = new URL(`../functions/api/${name}/[[path]].js`, import.meta.url);
    assert.ok(existsSync(file), name);
    assert.match(readFileSync(file, "utf8"), new RegExp(`server/${name}\\.js`));
    const mod = await import(file.href);
    const idx = await import(new URL(`../functions/api/${name}/index.js`, import.meta.url).href);
    assert.equal(idx.onRequest, mod.onRequest);
    // Without the header every route refuses (admin with a 404, so it isn't revealed).
    const res = await mod.onRequest({ request: new Request(`${O}/api/${name}`), env: {} });
    assert.equal(res.status, name === "admin" ? 404 : 403, name);
  }
});

test("Firebase helper proxy: FishDock's own project only, only /__/auth and /__/firebase, no cookies either way", async (t) => {
  const net = stubFetch(t, [[/firebaseapp\.com\/__\/auth\/handler/, () => new Response("<html>helper</html>", { headers: { "content-type": "text/html", "set-cookie": "a=b" } })]]);
  assert.equal(upstreamFor({}), "https://fishdock.firebaseapp.com");
  assert.equal(upstreamFor({ FIREBASE_PROJECT_ID: "fishdock-prod" }), "https://fishdock-prod.firebaseapp.com");
  assert.equal(upstreamFor({ FIREBASE_PROJECT_ID: "evil.com/x" }), "https://fishdock.firebaseapp.com");
  let nexted = 0;
  const next = () => { nexted++; return new Response("static"); };
  const r = await middleware({ request: new Request(`${O}/__/auth/handler?x=1`, { headers: { cookie: "session=1" } }), next, env: {} });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("set-cookie"), null);
  assert.equal(net.calls[0].url, "https://fishdock.firebaseapp.com/__/auth/handler?x=1");
  assert.equal(net.calls[0].headers.get("cookie"), null);
  assert.equal((await middleware({ request: new Request(`${O}/__/other`), next, env: {} })).status, 404);
  await middleware({ request: new Request(`${O}/api/conditions`), next, env: {} });
  assert.equal(nexted, 1);
});

test("UK day: allowances reset at UK midnight in winter and summer; times carry their offset", async () => {
  assert.equal(ukDay(Date.UTC(2026, 6, 1, 23, 30)), "2026-07-02"); // 00:30 BST
  assert.equal(ukDayEnd(Date.UTC(2026, 6, 1, 12)), Date.UTC(2026, 6, 1, 23)); // midnight BST
  assert.equal(ukDayEnd(Date.UTC(2026, 9, 31, 12)), Date.UTC(2026, 10, 1)); // midnight GMT
  assert.equal(ukIso(Date.UTC(2026, 2, 29, 1)), "2026-03-29T02:00:00+01:00"); // clocks go forward
  const s = setup();
  await ensureSchema(s.db);
  const t0 = Date.UTC(2026, 6, 1, 22, 50); // 23:50 BST
  for (let i = 0; i < 2; i++) assert.equal((await allowance(s.db, "k", 2, t0, { daily: true })).ok, true);
  assert.equal((await allowance(s.db, "k", 2, t0 + 5 * 60e3, { daily: true })).ok, false);
  assert.equal((await allowance(s.db, "k", 2, t0 + 11 * 60e3, { daily: true })).ok, true); // 00:01 BST, a new day
});

test("Firebase ID tokens: malformed, wrong project or expired tokens are refused before any key fetch", async (t) => {
  const net = stubFetch(t, []);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Date.UTC(2026, 9, 31);
  const sec = Math.floor(now / 1000);
  const tok = (p) => `${enc({ alg: "RS256", kid: "k1" })}.${enc({ aud: "fishdock", iss: "https://securetoken.google.com/fishdock", sub: "u1", iat: sec - 10, auth_time: sec - 10, exp: sec + 3600, ...p })}.sig`;
  assert.equal(await verifyIdToken("nope", "fishdock", { now }), null);
  assert.equal(await verifyIdToken(tok({ aud: "detectdock", iss: "https://securetoken.google.com/detectdock" }), "fishdock", { now }), null);
  assert.equal(await verifyIdToken(tok({ exp: sec - 1 }), "fishdock", { now }), null);
  assert.equal(await verifyIdToken(tok({}), "fishdock", { now, keys: [{ kid: "other" }] }), null);
  assert.equal(net.calls.length, 0);
});

test("a database that never answers fails the setting-up in time instead of hanging every request, then retries", async () => {
  const { resetSchemaForTests } = await import("../server/db.js");
  resetSchemaForTests();
  let calls = 0;
  const stuck = { prepare: () => ({ run: () => new Promise(() => {}) }), batch: () => { calls++; return new Promise(() => {}); } };
  const t0 = Date.now();
  await assert.rejects(ensureSchema(stuck, { waitMs: 60 }), (e) => e.status === 503 && e.code === "db_slow");
  assert.ok(Date.now() - t0 < 1000, "gave up promptly");
  // the next request tries again rather than waiting on the stuck attempt
  await assert.rejects(ensureSchema(stuck, { waitMs: 60 }));
  assert.equal(calls, 2);
  resetSchemaForTests();
});
