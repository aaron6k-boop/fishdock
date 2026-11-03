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
