// ---- the rod-tip light and the head torch (src/lib/world3d/nightKit.js) ----
// (needs node_modules for three, like the tests/sim3d*.test.js files: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";

let kit = null, THREE = null;
try { THREE = await import("three"); kit = await import("../src/lib/world3d/nightKit.js"); } catch { /* no node_modules */ }
const skip = !kit && "three isn't installed";

test("the tip light: green in the dark while you wait, off by day, red with a fish on at any hour", { skip }, () => {
  const { tipLightFor } = kit;
  assert.equal(tipLightFor("waiting", 0).level, 0, "nothing to see in daylight");
  const g = tipLightFor("waiting", 1); assert.equal(g.level, 1); assert.equal((g.hex >> 8) & 255 > 200 && (g.hex >> 16) < 100, true, "green");
  for (const dark of [0, 1]) for (const ph of ["hooked", "landing"]) { const r = tipLightFor(ph, dark); assert.equal(r.level, 1); assert.ok((r.hex >> 16) > 200 && ((r.hex >> 8) & 255) < 100, "red"); }
  // the bite itself flashes red: both bright and dim within a third of a second
  const lv = Array.from({ length: 20 }, (_, i) => tipLightFor("bite", 1, i / 60).level);
  assert.ok(Math.max(...lv) === 1 && Math.min(...lv) < 0.3);
  assert.ok(tipLightFor("idle", 0.5).level > 0 && tipLightFor("idle", 0.5).level < 1, "comes on gradually through dusk");
});

test("tip lights follow the anglers given, and go when an angler does", { skip }, () => {
  const scene = new THREE.Scene(), L = kit.createTipLights(scene);
  L.update([{ id: "a", tip: new THREE.Vector3(1, 2, 3), phase: "waiting" }, { id: "b", tip: new THREE.Vector3(4, 2, 3), phase: "hooked" }], 1, 0);
  assert.equal(L.count, 2); assert.equal(scene.children.length, 4);
  const bulbs = scene.children.filter((o) => o.isMesh); assert.deepEqual(bulbs[0].position.toArray(), [1, 2, 3]);
  assert.ok(bulbs[0].material.color.g > bulbs[0].material.color.r, "green"); assert.ok(bulbs[1].material.color.r > bulbs[1].material.color.g, "red");
  L.update([{ id: "b", tip: new THREE.Vector3(4, 2, 3), phase: "waiting" }], 0, 0);
  assert.equal(L.count, 1); assert.equal(scene.children.filter((o) => o.visible).length, 0, "daylight, waiting: off");
  L.dispose(); assert.equal(scene.children.length, 0);
});

test("the head torch: off until chosen, white, red or green, pointing where you look, dimmer by day", { skip }, () => {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.7, 0); cam.lookAt(0, 1.7, -10); cam.updateMatrixWorld(true);
  const T = kit.createHeadTorch(scene, cam);
  T.update(1, 1); assert.equal(T.light.intensity, 0);
  T.set("red"); T.update(1, 1); const night = T.light.intensity; assert.ok(night > 0); assert.ok(T.light.color.r > 0.9 && T.light.color.g < 0.3);
  assert.ok(T.light.target.position.z < -5, "aimed down the view");
  T.update(0, 1); assert.ok(T.light.intensity < night * 0.3);
  T.set("green"); assert.ok(T.light.color.g > T.light.color.r);
  T.set("purple"); T.update(1, 1); assert.equal(T.colour, "off"); assert.equal(T.light.intensity, 0);
  T.dispose();
});

test("the demo's Tip light setting: Off is dark whatever happens, On shows the green by day", { skip }, () => {
  const { tipLightFor } = kit;
  for (const ph of ["waiting", "bite", "hooked"]) assert.equal(tipLightFor(ph, 1, 0, "off").level, 0);
  assert.ok(tipLightFor("waiting", 0, 0, "on").level >= 0.7); assert.equal(tipLightFor("waiting", 0, 0, "auto").level, 0);
  assert.equal(tipLightFor("hooked", 0, 0, "on").level, 1);
});
