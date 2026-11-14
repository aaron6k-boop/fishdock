// The FPS display's worst-frame line (src/lib/frameReport.js): what the frame spent its time on, and where the rest went.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spikeParts } from "../src/lib/frameReport.js";

test("a long frame with little of the game's code says whether the page's thread or the graphics card held it up", () => {
  // (14 November: 1,551 ms lowering a ray back, 6 ms of the game's code, no shaders or textures)
  assert.deepEqual(spikeParts({ ms: 1551, js: 6, main: 1490 }), ["JS 6 ms", "page busy 1490 ms"]);
  assert.deepEqual(spikeParts({ ms: 1551, js: 6, main: 4 }), ["JS 6 ms", "GPU or browser 1545 ms"]);
  assert.deepEqual(spikeParts({ ms: 383, js: 366, main: 0, shaders: 92, tex: 11 }), ["92 shaders", "11 textures", "JS 366 ms"]);
  assert.deepEqual(spikeParts({ ms: 900, js: 2, main: 0, hidden: true }), ["page hidden", "JS 2 ms"]);
  assert.deepEqual(spikeParts({ ms: 120, js: 3, main: 1, resized: true }), ["resolution changed", "JS 3 ms", "GPU or browser 117 ms"]);
  assert.deepEqual(spikeParts({ ms: 80, js: 30, main: 5 }), ["JS 30 ms"], "a short frame mostly the game's own: nothing more to say");
});
