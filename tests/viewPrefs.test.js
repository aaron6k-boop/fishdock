import { test } from "node:test";
import assert from "node:assert/strict";
import { landCamOn, walkCamOf, walkDist } from "../src/lib/viewPrefs.js";

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

test("walking camera: as you fish unless chosen (at your eyes when you fish in first person); the old default counts as unchosen", () => {
  assert.equal(walkCamOf({}), "auto");
  assert.equal(walkCamOf({ camDist: "normal" }), "auto", "the old default, saved before there was a choice");
  assert.equal(walkCamOf({ camDist: "normal", walkCam2: true }), "normal", "chosen since");
  assert.equal(walkCamOf({ camDist: "far" }), "far");
  assert.equal(walkCamOf({ camDist: "eyes", walkCam2: true }), "eyes");
  assert.equal(walkCamOf({ camDist: "nonsense" }), "auto");
  assert.equal(walkDist("auto", "first"), "eyes");
  assert.equal(walkDist("auto", "third"), "normal");
  assert.equal(walkDist("far", "first"), "far");
});
