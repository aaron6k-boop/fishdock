import { test } from "node:test";
import assert from "node:assert/strict";
import { canCast, busyLabel } from "../src/lib/fishFlow.js";

test("no casting while the last fish is still being landed, on the mat, in your hands or going back", () => {
  for (const busy of ["landing", "deck", "inspect", "release"]) {
    for (const phase of ["idle", "ended", "waiting"]) assert.equal(canCast({ phase, busy }), false, `${busy}/${phase}`);
  }
});

test("casting when nothing is going on, and not while the line's out or a fish is on", () => {
  assert.equal(canCast({ phase: "idle" }), true);
  assert.equal(canCast({ phase: "ended" }), true);
  assert.equal(canCast({ phase: "waiting", lineOut: false }), true);
  assert.equal(canCast({ phase: "waiting", lineOut: true }), false);
  for (const phase of ["cast", "bite", "hooked", "landing", "lost", "missed"]) assert.equal(canCast({ phase }), false, phase);
});

test("what the tray says while the scene is busy", () => {
  assert.equal(busyLabel("landing"), "Landing it");
  assert.equal(busyLabel("release"), "Putting it back");
  assert.equal(busyLabel("deck"), null);
  assert.equal(busyLabel(null), null);
});
