// A pier's lighting columns and the pools of lamplight on the deck (src/lib/world3d/lamps3d.js).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { columnGeometry, lanternAt, lampPools, poolFalloff, COLUMN } from "../src/lib/world3d/lamps3d.js";

test("the column: a pole to the bracket, a swan neck reaching over the deck, the lantern on it, its lens underneath", () => {
  const { pole, lens } = columnGeometry();
  pole.computeBoundingBox(); lens.computeBoundingBox();
  const pb = pole.boundingBox, lb = lens.boundingBox, L = lanternAt();
  assert.ok(Math.abs(pb.min.y) < 0.002, "standing on the deck");
  assert.ok(pb.max.y > COLUMN.h + COLUMN.rise && pb.max.y < COLUMN.h + COLUMN.rise + 0.15, `its top at ${pb.max.y.toFixed(2)} m`);
  assert.ok(pb.max.z > COLUMN.reach + 0.4 && pb.min.z > -0.2, "the lantern out over the deck side only");
  assert.ok(Math.abs(pb.max.x) < 0.2, "slim across");
  // (the lens: under the housing, facing down, within the lantern's length)
  assert.ok(lb.max.y < L.y && lb.min.y > L.y - 0.1, "just under the housing");
  assert.ok(lb.min.z > COLUMN.reach - 0.1 && lb.max.z < pb.max.z, "along the lantern");
  const n = new THREE.Vector3().fromBufferAttribute(lens.attributes.normal, 0);
  assert.ok(n.y < -0.95, "facing the deck");
  assert.ok(L.top > COLUMN.h + COLUMN.rise, "a gull's perch on top of it");
  assert.ok(!pole.attributes.uv && !lens.attributes.uv, "no texture coordinates (the weathering is worked out in the world)");
});

test("the pools of lamplight: soft, brightest under the lamp, nothing at their edge, dark until the lamps come on", () => {
  assert.equal(poolFalloff(1), 0); assert.equal(poolFalloff(1.2), 0);
  assert.ok(poolFalloff(0) > poolFalloff(0.3) && poolFalloff(0.3) > poolFalloff(0.7) && poolFalloff(0.7) > poolFalloff(0.95));
  assert.ok(poolFalloff(0.95) < 0.02, "it fades out before the edge");
  const { mesh, material } = lampPools([[0, 2, 0, 3.6], [10, 2, 0, 2.6]]);
  assert.equal(mesh.count, 2);
  assert.equal(material.emissiveIntensity, 0, "nothing until after dark");
  assert.equal(material.blending, THREE.AdditiveBlending); assert.equal(material.color.getHex(), 0, "light added to the deck, never darkening it");
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); mesh.getMatrixAt(0, m); m.decompose(p, q, s);
  assert.ok(Math.abs(p.y - 2) < 0.02 && Math.abs(s.x - 3.6) < 1e-6, "on the deck, its radius as given");
  assert.equal(lampPools([]).mesh, null);
});
