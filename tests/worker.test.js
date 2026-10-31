// The Workers entry routes /api/* to the same handlers as Pages, sends /__/* to the sign-in helper, and leaves
// everything else to static assets.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const assets = { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`) };
const call = (path, init = {}) => worker.fetch(new Request(`https://fishdock.example${path}`, init), { ASSETS: assets });

test("static paths go to the assets binding", async () => {
  assert.equal(await (await call("/")).text(), "asset:/");
  assert.equal(await (await call("/assets/main.js")).text(), "asset:/assets/main.js");
});

test("API paths reach the server handlers (and their X-FishDock guard)", async () => {
  const res = await call("/api/conditions?lat=50.6&lon=-2.5");
  assert.equal(res.status, 403); // no X-FishDock header: refused by the shared guard, not served as an asset
  const missing = await call("/api/nothing", { headers: { "x-fishdock": "1" } });
  assert.equal(missing.status, 404);
});

test("only the Firebase helper paths under /__/ are proxied", async () => {
  const res = await call("/__/other/thing");
  assert.equal(res.status, 404);
});
