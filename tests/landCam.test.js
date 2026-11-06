// The landing shots (src/lib/world3d/landCam.js): every stage's camera keeps what has to be seen in the picture
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOTS, fitShot, fromAngler, shotFor, onScreen } from "../src/lib/world3d/landCam.js";

// a portrait phone (390x780) with the landing lens: 52° across the long side, as world.js sets it
const lens = (fovDeg = 52 * 1.12, aspect = 390 / 780) => { const tanV = Math.tan((fovDeg * Math.PI) / 360); return { tanV, tanH: tanV * aspect }; };

test("fitShot: every point lands inside the picture with its margin", () => {
  const L = lens(), pts = [[0, 0, 0], [2, -4, 1], [-1, 1.7, -0.5]];
  for (const dir of [[0, 0.3, 1], [-0.7, 0.3, 0.7], [0.2, 0.8, 0.4]]) {
    const f = fitShot(pts, dir, { ...L, margin: 0.8, near: 1, far: 50 });
    for (const p of pts) assert.ok(onScreen(p, f.pos, f.at, { ...L, margin: 0.8 }), `${p} off screen from ${dir}`);
  }
});

test("fitShot: never closer than near, never further than far", () => {
  const L = lens();
  assert.equal(fitShot([[0, 0, 0]], [0, 0, 1], { ...L, near: 3, far: 9 }).dist, 3);
  assert.equal(fitShot([[0, 0, 0], [0, 40, 0]], [0, 0, 1], { ...L, near: 3, far: 9 }).dist, 9);
});

test("fromAngler: right, up and forward follow the way the angler faces", () => {
  const f = fromAngler([0, 0, 1], 0); assert.ok(Math.abs(f[2] + 1) < 1e-9, "forward is -z facing 0");
  const r = fromAngler([1, 0, 0], 0); assert.ok(Math.abs(r[0] - 1) < 1e-9, "right is +x facing 0");
  const r2 = fromAngler([1, 0, 0], Math.PI / 2); assert.ok(Math.abs(r2[2] - 1) < 1e-9, "turned a quarter, right is +z");
});

// a high pier like Gorleston's: the deck 4.5 m over the water, the angler at the rail facing out, the net hanging at the
// foot of the wall a little to their left, the fish beside it
const scene = (face) => {
  const F = (r, u, f) => { const fx = Math.sin(face), fz = -Math.cos(face), sx = -fz, sz = fx; return [r * sx + f * fx, u, r * sz + f * fz]; };
  return {
    up: { fish: F(-1.4, -4.4, 2.2), head: F(0, 1.7, 0), feet: F(0, 0.05, 0) },
    pick: { net: F(-1.65, 0.25, -0.22), head: F(0, 1.2, 0), feet: F(0, 0.05, 0), fish: F(-1.4, -4.4, 2.2) },
    lower: { net: F(-0.32, -2.2, 1.15), head: F(0, 1.7, 0), feet: F(0, 0.05, 0), fish: F(-1.4, -4.4, 2.2) },
    lead: { net: F(-0.32, -4.45, 1.15), fish: F(-0.8, -4.45, 1.6), head: F(0, 1.7, 0) },
    haul: { net: F(-0.32, -1.5, 1.15), head: F(0, 1.7, 0), feet: F(0, 0.05, 0) },
    in: { net: F(-0.32, 1.4, 0.4), head: F(0, 1.6, 0), feet: F(0, 0.05, 0) },
    deck: { net: F(-1.65, 0.1, -0.22), head: F(0, 1.7, 0), feet: F(0, 0.05, 0) },
    swim: { net: F(-0.32, -4.45, 1.15), fish: F(-0.9, -4.6, 2.6) },
  };
};

test("each landing stage: what must be seen is in the picture, whichever way the pier faces", () => {
  const L = lens();
  for (const face of [0, 1.2, Math.PI, -2.3]) {
    const S = scene(face);
    for (const [st, named] of Object.entries(S)) {
      const shot = shotFor(st, named, face, { ...L, margin: 0.8 });
      assert.ok(shot, st);
      for (const k of SHOTS[st].must) if (named[k]) assert.ok(onScreen(named[k], shot.pos, shot.at, { ...L, margin: 0.85 }), `${st}: ${k} off screen (face ${face})`);
      // and the camera is never under the water or inside the pier (it stands out over the water or above the deck)
      assert.ok(shot.pos[1] > -4.0, `${st}: camera at ${shot.pos[1].toFixed(2)} under the water`);
    }
  }
});

test("the swim-away is close enough to see the fish: a 45 cm fish is over 40 px long on a 390 px wide screen", () => {
  const L = lens(), face = 0.7, S = scene(face).swim, shot = shotFor("swim", S, face, { ...L, margin: 0.8 });
  const px = (0.45 / shot.dist) / L.tanH * 195;
  assert.ok(px > 40, `${px.toFixed(0)} px`);
});

test("from one stage to the next the camera comes from the same side (no swinging round the angler)", () => {
  for (const s of Object.values(SHOTS)) { assert.ok(s.from[0] < 0, "from your left"); assert.ok(s.from[2] > 0, "out in front"); }
});

test("lift: on a phone the things to see are framed above the controls at the bottom of the screen", () => {
  const pts = [[0, 0, 0], [0, 3, 0], [1, 1.5, 2]], dir = [-0.6, 0.3, 0.74], tanV = Math.tan((58 * Math.PI) / 360), tanH = tanV * 0.5;
  const s = fitShot(pts, dir, { tanH, tanV, margin: 0.8, near: 2, far: 30, lift: 0.2 });
  // each point inside the picture, and none in its bottom fifth (where the controls are)
  for (const p of pts) {
    assert.ok(onScreen(p, s.pos, s.at, { tanH, tanV }), "on screen");
    const f = [s.at[0] - s.pos[0], s.at[1] - s.pos[1], s.at[2] - s.pos[2]], l = Math.hypot(...f), fw = f.map((x) => x / l);
    const r0 = [-fw[2], 0, fw[0]], rl = Math.hypot(...r0), r = r0.map((x) => x / rl), u = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]];
    const q = [p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]], z = q[0] * fw[0] + q[1] * fw[1] + q[2] * fw[2], y = (q[0] * u[0] + q[1] * u[1] + q[2] * u[2]) / z;
    assert.ok(Math.abs(y) <= tanV + 1e-9 && y >= -tanV * 0.6 - 1e-6, `above the bottom fifth: ${(y / tanV).toFixed(2)}`);
  }
});
