// Your fishing chair and sitting in it while you wait (src/lib/world3d/chair.js).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHAIR, SEAT, SIT, SIT_EYE, wantsSit, sitStep, sitEase, buildChair } from "../src/lib/world3d/chair.js";

test("you sit once the cast has settled and you're waiting, and get up for anything else", () => {
  assert.equal(wantsSit({ ph: "waiting", age: SIT.after + 0.1 }), true);
  assert.equal(wantsSit({ ph: "waiting", age: 1 }), false, "not straight after the cast lands");
  for (const ph of ["idle", "cast", "bite", "hooked", "landing", "missed", "lost", "ended"]) assert.equal(wantsSit({ ph, age: 30 }), false, ph);
  assert.equal(wantsSit({ ph: "waiting", age: 30, walking: true }), false, "walking about");
  assert.equal(wantsSit({ ph: "waiting", age: 30, busy: true }), false, "a fish on the mat");
  assert.equal(wantsSit({ ph: "waiting", age: 30, on: false }), false, "turned off");
});

test("sitting down takes about a second, getting up for a bite half that", () => {
  let u = 0, n = 0; while (u < 1 && n < 999) { u = sitStep(u, true, 1 / 30); n++; }
  assert.ok(Math.abs(n / 30 - SIT.down) < 0.05, `down in ${(n / 30).toFixed(2)} s`);
  n = 0; while (u > 0 && n < 999) { u = sitStep(u, false, 1 / 30); n++; }
  assert.ok(Math.abs(n / 30 - SIT.up) < 0.05 && SIT.up < SIT.down, `up in ${(n / 30).toFixed(2)} s`);
  assert.equal(sitEase(0), 0); assert.equal(sitEase(1), 1); assert.ok(sitEase(0.1) < 0.1 && sitEase(0.9) > 0.9, "slow to start and to settle");
});

test("the chair: its seat at its height, four feet on the deck, the back leaning back, clear of the seat box and bucket", () => {
  const g = buildChair(); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  assert.ok(Math.abs(box.min.y) < 0.003, `its feet on the deck (lowest ${box.min.y.toFixed(3)} m)`);
  let seatTop = 0, backTop = 0, backZ = -1, feet = 0;
  g.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (o.geometry.type === "CylinderGeometry" && b.max.y < 0.02) feet++;
    if (o.material === g.children[0].material) { if (b.max.y < 0.5) seatTop = Math.max(seatTop, b.max.y); else { backTop = Math.max(backTop, b.max.y); backZ = Math.max(backZ, b.max.z); } } });
  assert.equal(feet, 4, "four mud feet");
  assert.ok(Math.abs(seatTop - CHAIR.seat) < 0.003, `the cushion's top at ${seatTop.toFixed(3)} m`);
  assert.ok(backTop > CHAIR.seat + 0.45 && backZ > CHAIR.d / 2 + 0.05, "a back, leaning back behind the seat");
  // (where angler.js puts it, beside the seat box at (-0.55, 0.25), 46 by 31 cm, and the bucket at (-0.52, 0.64), 27 cm across)
  const at = new THREE.Box3(box.min.clone().add(new THREE.Vector3(CHAIR.x, 0, CHAIR.z)), box.max.clone().add(new THREE.Vector3(CHAIR.x, 0, CHAIR.z)));
  assert.ok(at.min.x > -0.55 + 0.23, "clear of the seat box");
  assert.ok(at.min.x > -0.52 + 0.14 || at.max.z < 0.64 - 0.14, "clear of the bucket");
  assert.ok(at.max.z < 1, "within a metre behind where you stand");
});

test("sitting in it: hips on the cushion, feet in front of it on the deck, your eye lower and back over the chair", () => {
  const [x, y, z] = SEAT.hips;
  assert.ok(y - CHAIR.seat > 0.06 && y - CHAIR.seat < 0.11, "the hip joints a hand's depth above the cushion");
  assert.ok(Math.abs(x - CHAIR.x) < 0.01 && z > CHAIR.z && z < CHAIR.z + CHAIR.d / 2 - 0.1, "over the seat, a little back");
  assert.ok(SEAT.feetZ < CHAIR.z - CHAIR.d / 2, "the feet in front of the seat's front edge");
  assert.ok(Math.abs(SEAT.feetZ) < 0.15, "about where you stood to fish");
  assert.ok(SIT_EYE.dy < -0.3 && SIT_EYE.dy > -0.5, "the eye 30 to 50 cm lower");
  assert.ok(Math.abs(-0.08 + SIT_EYE.dz - (z + 0.02)) < 0.08, "and back over the hips");
});
