// ---- the rod's tripod: set up the way a sea angler's is, clear of the rail, the reel in reach ----
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { tripodPlan, TRIPOD, restHead } from "../src/lib/world3d/tripod.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// (where angler.js puts it: 12 cm in from a pier's railing, which is 22 cm in from the edge, never over 75 cm ahead)
const restFor = (edge) => V(0.35, 1.55, Math.max(-Math.max(0.3, edge - 0.22) + 0.12, -0.75));

test("the rod lies in the cradle at about 67 degrees, its butt in the cup on the rear leg", () => {
  const P = tripodPlan(restFor(0.9));
  const up = (Math.asin(P.dir.y) * 180) / Math.PI;
  assert.ok(up > 62 && up < 72, `the rod ${up.toFixed(1)} degrees up`);
  assert.ok(P.cradles[0].distanceTo(P.top) < 1e-9, "in the left-hand cradle, nearer you");
  assert.ok(P.cups[0].distanceTo(P.butt) < 1e-9, "its butt in the cup below it");
  // (the rear leg runs from the head through the cup bar to the deck)
  const rear = P.feet[2], onLeg = P.hub.clone().lerp(rear, (P.hub.y - P.bar.y) / P.hub.y);
  assert.ok(onLeg.distanceTo(P.bar) < 1e-6, "the cup bar on the rear leg");
  for (const f of P.feet) assert.equal(f.y, 0, "the feet on the deck");
  assert.ok(P.feet[0].z < P.top.z && P.feet[1].z < P.top.z && rear.z > P.butt.z, "two legs out in front, one back towards you");
});

test("on a pier: inside the railing, the rod and line well over it, and the reel where your right hand reaches it", () => {
  for (const edge of [0.6, 0.9, 1.8]) {
    const P = tripodPlan(restFor(edge)), railZ = -Math.max(0.3, edge - 0.22);
    for (const f of P.feet) assert.ok(f.z > railZ, `edge ${edge}: a foot past the railing`);
    // (where the rod crosses the railing it's 40 cm or more above the top rail, 1.12 m up)
    const k = (railZ - P.butt.z) / P.dir.z, yOver = P.butt.y + P.dir.y * k;
    assert.ok(k < 0 || yOver > 1.12 + 0.4, `edge ${edge}: the rod ${yOver.toFixed(2)} m up over the rail`);
    // (the pier rod's reel, 45 cm up from its butt, within the arm's 60 cm of the right shoulder standing where you
    // stand, with a little lean)
    const reel = P.butt.clone().addScaledVector(P.dir, 0.45), shoulder = V(0.19, 1.33, -0.06);
    assert.ok(reel.distanceTo(shoulder) < 0.68, `edge ${edge}: the reel ${reel.distanceTo(shoulder).toFixed(2)} m from the shoulder`);
    // (and clear of where you stand: no leg within 15 cm of your feet)
    for (const f of P.feet) assert.ok(Math.hypot(f.x, f.z) > 0.25, `edge ${edge}: a foot under yours`);
  }
  assert.ok(TRIPOD.rise > 1 && TRIPOD.back > 0.3);
});

test("the rod lies in the bottom of the cradle's rubber U, touching it and never through it", () => {
  // (each rod's blank where it lies in the cradle: a beachcaster's 8.9 mm, a pier rod's 7.3, a spinning rod's 6.2)
  for (const rodR of [0.0089, 0.0073, 0.0062]) {
    const P = tripodPlan(restFor(0.9), rodR), pos = restHead(P.top, P.dir, rodR).geo.attributes.position, v = new THREE.Vector3();
    let near = 1;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).sub(P.butt); const d = v.sub(P.dir.clone().multiplyScalar(v.dot(P.dir))).length(); near = Math.min(near, d); }
    assert.ok(near > rodR - 0.0002, `rod ${rodR * 1000} mm: the rubber ${((rodR - near) * 1000).toFixed(1)} mm inside the blank`);
    assert.ok(near < rodR + 0.001, `rod ${rodR * 1000} mm: the blank ${((near - rodR) * 1000).toFixed(1)} mm clear of the rubber, not resting on it`);
    // (open away from the ground: up, and back towards you, so it lifts straight out)
    assert.ok(P.open.y > 0.3 && P.open.z > 0.5 && Math.abs(P.open.dot(P.dir)) < 1e-9);
  }
});

test("a bank stick's rest head: the rod on the rubber, the stick up under it", () => {
  const top = V(0.45, 0.42, -0.85), butt = V(0.45, 0.22, 0.25), dir = top.clone().sub(butt).normalize(), r = 0.006;
  const h = restHead(top, dir, r), pos = h.geo.attributes.position, v = new THREE.Vector3();
  let near = 1; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).sub(top); near = Math.min(near, v.sub(dir.clone().multiplyScalar(v.dot(dir))).length()); }
  assert.ok(Math.abs(near - r) < 0.001, `the blank ${((near - r) * 1000).toFixed(1)} mm off the rubber`);
  assert.ok(h.foot.y < top.y - r && h.foot.y > top.y - r - TRIPOD.cradleT * 2, "the stick's top in the rubber under the rod");
});
