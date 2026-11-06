import { test } from "node:test";
import assert from "node:assert/strict";
import { landCamOn } from "../src/lib/viewPrefs.js";

test("landing camera: on by default, a deliberate off is kept (old and new key)", () => {
  assert.equal(landCamOn({}), true);
  assert.equal(landCamOn({ landCam: false }), false);
  assert.equal(landCamOn({ landCam: true }), true);
  assert.equal(landCamOn({ landCam2: false }), false);
  assert.equal(landCamOn({ landCam: false, landCam2: true }), true);
});

test("fishing camera: first person unless chosen; a saved choice is kept; the old landing switch doesn't force shots", async () => {
  const { fishCamOf } = await import("../src/lib/viewPrefs.js");
  assert.equal(fishCamOf({}), "first");
  assert.equal(fishCamOf({ landCam2: true }), "first");
  assert.equal(fishCamOf({ fishCam: "third" }), "third");
  assert.equal(fishCamOf({ fishCam: "cinematic" }), "cinematic");
  assert.equal(fishCamOf({ fishCam: "nonsense" }), "first");
});
