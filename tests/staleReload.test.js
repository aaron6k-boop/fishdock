// A page left open across an update: a code file it asks for is gone, so it loads itself again, once.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh, moduleGone } from "../src/lib/staleReload.js";

const env = (t0 = 1e6, stored = null) => { const m = new Map(stored ? [["fishdock.staleReload", String(stored)]] : []); const e = { t: t0, reloads: 0, now: () => e.t, store: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }, reload: () => { e.reloads++; } }; return e; };
const gone = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module: https://example.test/assets/chunk-OLD.js"));

test("each browser's wording for a code file that can't be fetched is recognised, other errors are not", () => {
  for (const m of ["Failed to fetch dynamically imported module: /assets/chunk-A.js", "error loading dynamically imported module", "Importing a module script failed."]) assert.ok(moduleGone(new TypeError(m)), m);
  for (const m of ["x is not a function", "no place", ""]) assert.ok(!moduleGone(new Error(m)), m);
});

test("a file that loads is handed straight back", async () => {
  const e = env(); assert.equal(await fresh(() => Promise.resolve(42), e), 42); assert.equal(e.reloads, 0);
});

test("a file that is gone: the page loads again once, and the screen waits for it", async () => {
  const e = env(); let settled = false; fresh(gone, e).then(() => { settled = true; }, () => { settled = true; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(e.reloads, 1); assert.equal(settled, false, "nothing shown from the old page");
});

test("gone again within half a minute of reloading: the error is shown, no second reload", async () => {
  const e = env(1e6, 1e6 - 5000);
  await assert.rejects(fresh(gone, e), /dynamically imported/); assert.equal(e.reloads, 0);
  e.t += 60e3; fresh(gone, e).catch(() => {}); await new Promise((r) => setTimeout(r, 5)); assert.equal(e.reloads, 1, "later, it may try again");
});

test("any other failure is passed on untouched, and nothing reloads without somewhere to remember it", async () => {
  const e = env(); await assert.rejects(fresh(() => Promise.reject(new Error("no place")), e), /no place/); assert.equal(e.reloads, 0);
  const bare = { now: () => 1, store: null, reload: () => { throw new Error("must not reload"); } };
  await assert.rejects(fresh(gone, bare), /dynamically imported/);
});
