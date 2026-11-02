// The 3D view's pure parts: where anglers stand (src/lib/world3d/spots.js) and the 360° look-around controller
// (src/lib/world3d/look.js). The renderer itself needs WebGL and is checked in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS, layoutFor, assignSpots, castPoint, spotById, MAX_ANGLERS, dirOf } from "../src/lib/world3d/spots.js";
import { createLook, wrap, lookAt, compassPoint, FOV } from "../src/lib/world3d/look.js";

test("every kind of place has four fishing spots, well apart, each casting onto open water away from the others", () => {
  for (const [venue, L] of Object.entries(LAYOUTS)) {
    assert.equal(L.spots.length, MAX_ANGLERS, venue);
    for (const a of L.spots) for (const b of L.spots) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2]) >= 8, `${venue}: spots ${a.id} and ${b.id} too close`);
      // lines don't cross: the landing points are further apart than the anglers' rod tips could reach
      const ca = castPoint(a), cb = castPoint(b);
      assert.ok(Math.hypot(ca[0] - cb[0], ca[2] - cb[2]) >= 8, `${venue}: lines ${a.id} and ${b.id} land together`);
    }
    for (const s of L.spots) { const c = castPoint(s); assert.equal(c[1], 0); assert.ok(s.cast >= 10); }
  }
  // on the pier, both sides and the end: people stand on the deck, inside its width and length
  const P = LAYOUTS.pier;
  for (const s of P.spots) { assert.ok(Math.abs(s.at[0]) <= P.width / 2 && s.at[2] <= P.from && s.at[2] >= P.to, `spot ${s.id} on the deck`); assert.equal(s.at[1], P.deck); }
  const [dx, dz] = dirOf(P.spots[0].face); assert.ok(dx < -0.99 && Math.abs(dz) < 1e-9, "the left side faces left");
  assert.equal(layoutFor("nowhere"), LAYOUTS.pier);
});

test("spots: as the host assigns them, otherwise in order of joining, never two anglers in one spot", () => {
  assert.deepEqual(assignSpots("pier", ["a", "b", "c"]), { a: 1, b: 2, c: 3 });
  assert.deepEqual(assignSpots("pier", ["a", "b", "c"], { b: 4, c: 4 }), { b: 4, a: 1, c: 2 });
  const five = assignSpots("beach", ["a", "b", "c", "d", "e"]);
  assert.equal(Object.keys(five).length, 4, "four anglers at most");
  assert.equal(new Set(Object.values(five)).size, 4);
  assert.equal(spotById("river", 3).name, "Further upstream");
  assert.equal(spotById("river", 99).id, 1);
});

test("looking round: a drag turns all the way round, pitch stops at straight up and down, a flick carries on and eases off", () => {
  const L = createLook({ yaw: 0 });
  L.start(); for (let i = 0; i < 40; i++) L.drag(-40, 0, 800); L.end();
  assert.ok(Math.abs(L.yaw) <= Math.PI, "heading stays in -π..π however far it turns");
  L.start(); L.drag(0, 5000, 800); L.end();
  assert.ok(L.pitch <= 1.1 && L.pitch > 1);
  const M = createLook({ yaw: 0, pitch: 0 }); M.start(); M.drag(-30, 0, 800); M.end();
  const y0 = M.yaw; M.step(0.05); const y1 = M.yaw; for (let i = 0; i < 100; i++) M.step(0.05);
  assert.ok(y1 > y0, "keeps turning after the finger lifts");
  assert.ok(Math.abs(M.state().vyaw) === 0, "and stops");
  // zoom limits
  M.zoom(10); assert.equal(M.fov, FOV.min); M.zoom(0.01); assert.equal(M.fov, FOV.max);
});

test("double tap and Look at my rod turn smoothly back; headings and compass points", () => {
  const L = createLook({ yaw: 0, home: { yaw: 0.5, pitch: -0.1 } });
  L.start(); L.drag(300, 0, 800); L.end();
  L.start(); L.end(); assert.equal(L.tap(1000), false);
  L.start(); L.end(); assert.equal(L.tap(1200), true, "a quick second tap recentres");
  for (let i = 0; i < 200; i++) L.step(1 / 60);
  assert.ok(Math.abs(L.yaw - 0.5) < 0.01 && Math.abs(L.pitch + 0.1) < 0.01, `${L.yaw} ${L.pitch}`);
  assert.equal(L.fov, FOV.base);
  // aiming across the ±π seam takes the short way round
  const A = createLook({ yaw: 3.0 }); A.aim(-3.0); A.step(1 / 60); assert.ok(A.yaw > 3.0 || A.yaw < -3.0);
  const { yaw, pitch } = lookAt([0, 2, 0], [10, 0, -10]); assert.ok(Math.abs(yaw - Math.PI / 4) < 1e-9 && pitch < 0);
  assert.equal(Math.abs(wrap(Math.PI * 3)), Math.PI);
  assert.equal(compassPoint(0), "N"); assert.equal(compassPoint(-90), "W"); assert.equal(compassPoint(200), "S");
});

test("each kind of fish fights its own way in 3D: divers deep, upper-water fish shallow and erratic, bass and garfish leap, rays heavy", async () => {
  const { fightProfile, fightStyle } = await import("../src/lib/sceneActors.js");
  const st = (s) => fightStyle(fightProfile(s));
  assert.ok(st("cod").depth > st("mackerel").depth * 3, "a cod bores down; a mackerel stays up");
  assert.ok(st("mackerel").runWidth > st("cod").runWidth, "a mackerel runs about more");
  assert.equal(st("bass").leaps, true); assert.equal(st("garfish").leaps, true); assert.equal(st("cod").leaps, false); assert.equal(st("plaice").leaps, false);
  assert.ok(st("plaice").runWidth > 1.2 && st("plaice").runSpeed < 0.7, "flatfish swing wide and slow");
  assert.ok(st("thornback-ray").depth > st("cod").depth && st("thornback-ray").heavy > st("cod").heavy, "a ray sits deep and heavy");
  assert.equal(st("conger").pump, true);
});

test("the shore map: distance to the nearest land for the water's foam and shallows, from real or drawn places", async () => {
  const { shoreDistances, shoreBytes, drawnLand, SHORE } = await import("../src/lib/world3d/shoreMap.js");
  // land is everything north of z = -100 (z < -100 is... water south): a straight shore
  const d = shoreDistances((x, z) => z < -100, { half: 240, n: 96 });
  const at = (x, z) => d[Math.floor((z + 240) / 5) * 96 + Math.floor((x + 240) / 5)];
  assert.equal(at(0, -150), 0, "on land");
  assert.ok(Math.abs(at(0, -90) - 10) < 5.1, `10 m out: ${at(0, -90)}`);
  assert.equal(at(0, 200), SHORE.cap, "far out is capped");
  const b = shoreBytes(d); assert.equal(b[0], 0); assert.equal(b[b.length - 1], 255);
  const pier = drawnLand("pier", { width: 9, from: 70, to: -48 });
  assert.equal(pier(0, 0), true); assert.equal(pier(10, 0), false); assert.equal(drawnLand("beach", {}), null, "the beach has its own surf");
});
