// Body types (src/lib/world3d/human3d.js buildMorph): one morph moves every point out from the bones that carry it,
// so a broad build is wider at the chest and belly, its arms and legs thicker, and the head, hands and feet keep their
// size; a garment carried by the same bones as the body under it moves with it and the two never cross.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildMorph, BUILD_AT } from "../src/lib/world3d/human3d.js";
import { BUILDS } from "../src/lib/world3d/people.js";

// a stick figure on the shared skeleton's names, standing on z = 0, facing -y (z up, as the people's meshes are), in metres
function skeleton() {
  const at = {
    Pelvis: [0, 0, 0.95], Spine: [0, 0, 1.05], Neck: [0, 0, 1.5], Head: [0, 0, 1.6],
    L_Clavicle: [0.03, 0, 1.45], R_Clavicle: [-0.03, 0, 1.45], L_UpperArm: [0.18, 0, 1.42], R_UpperArm: [-0.18, 0, 1.42],
    L_Forearm: [0.18, 0, 1.12], R_Forearm: [-0.18, 0, 1.12], L_Hand: [0.18, 0, 0.86], R_Hand: [-0.18, 0, 0.86],
    L_Thigh: [0.1, 0, 0.92], R_Thigh: [-0.1, 0, 0.92], L_Calf: [0.1, 0, 0.5], R_Calf: [-0.1, 0, 0.5],
    L_Foot: [0.1, 0, 0.08], R_Foot: [-0.1, 0, 0.08], L_Toe0: [0.1, -0.13, 0.02], R_Toe0: [-0.1, -0.13, 0.02],
  };
  const names = Object.keys(at), bones = names.map((n) => { const b = new THREE.Bone(); b.name = "Bip01_" + n; b.position.fromArray(at[n]); return b; });
  const root = new THREE.Group(); bones.forEach((b) => root.add(b)); root.updateMatrixWorld(true);
  return { names, bones, inv: bones.map((b) => b.matrixWorld.clone().invert()) };
}
function geometry(points) {
  const { names } = skeleton(), g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap((p) => p.at), 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(points.flatMap((p) => [names.indexOf(p.bone), 0, 0, 0]), 4));
  g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(points.flatMap(() => [1, 0, 0, 0]), 4));
  return g;
}
const delta = (D, i) => new THREE.Vector3(D.getX(i), D.getY(i), D.getZ(i));

test("broad: fuller at the belly, wider at the sides, thicker limbs; the head and hands keep their size", () => {
  const { bones, inv } = skeleton();
  const pts = [
    { bone: "Spine", at: [0, -0.13, 1.08] },      // 0 the belly, in front
    { bone: "Spine", at: [0.16, 0, 1.08] },       // 1 the left side
    { bone: "Spine", at: [0, 0.11, 1.08] },       // 2 the back
    { bone: "L_UpperArm", at: [0.23, 0, 1.3] },   // 3 the outside of the left upper arm
    { bone: "L_Thigh", at: [0.1, -0.08, 0.75] },  // 4 the front of the left thigh
    { bone: "Head", at: [0, -0.09, 1.65] },       // 5 the face
    { bone: "L_Hand", at: [0.18, -0.02, 0.8] },   // 6 the left hand
  ];
  const D = buildMorph(geometry(pts), bones, inv, new THREE.Matrix4());
  assert.ok(D, "a morph for a skinned mesh on the shared skeleton");
  assert.ok(delta(D, 0).y < -0.02, "the belly comes forward by more than 2 cm");
  assert.ok(delta(D, 1).x > 0.008, "the side moves out");
  assert.ok(delta(D, 2).y > 0 && delta(D, 2).y < delta(D, 0).y * -0.5, "the back a little, less than the belly");
  assert.ok(delta(D, 3).x > 0.01, "the upper arm thicker and the arm out with the chest");
  assert.ok(delta(D, 4).y < -0.005, "the thigh thicker");
  assert.equal(delta(D, 5).length(), 0, "the head keeps its size");
  const hand = delta(D, 6);
  assert.ok(hand.x > 0 && Math.abs(hand.y) < 1e-9 && Math.abs(hand.z) < 1e-9, "the hand only moves out with the arm");
});

test("a garment over the body moves with it: the gap between them never closes", () => {
  const { bones, inv } = skeleton();
  const pts = [];
  for (const [bone, c] of [["Spine", [0, 0, 1.1]], ["L_UpperArm", [0.18, 0, 1.3]], ["L_Thigh", [0.1, 0, 0.75]]]) {
    for (let a = 0; a < 12; a++) {
      const dx = Math.cos(a / 12 * Math.PI * 2), dy = Math.sin(a / 12 * Math.PI * 2), r = bone === "Spine" ? 0.14 : 0.06;
      pts.push({ bone, at: [c[0] + dx * r, c[1] + dy * r, c[2]] }, { bone, at: [c[0] + dx * (r + 0.02), c[1] + dy * (r + 0.02), c[2]] });
    }
  }
  const g = geometry(pts), D = buildMorph(g, bones, inv, new THREE.Matrix4()), P = g.attributes.position;
  for (const s of BUILD_AT) {
    for (let i = 0; i < pts.length; i += 2) {
      const body = new THREE.Vector3().fromBufferAttribute(P, i).addScaledVector(delta(D, i), s);
      const cloth = new THREE.Vector3().fromBufferAttribute(P, i + 1).addScaledVector(delta(D, i + 1), s);
      const out = new THREE.Vector3().fromBufferAttribute(P, i + 1).sub(new THREE.Vector3().fromBufferAttribute(P, i)).normalize();
      const gap = cloth.clone().sub(body).dot(out);
      assert.ok(gap > 0.012, `the cloth stays outside the body (build ${s}, point ${i / 2}, gap ${gap.toFixed(4)}, ${pts[i].bone})`);
    }
  }
});

test("one weight per body type, medium unchanged; a mesh without the skeleton gets none", () => {
  assert.equal(BUILD_AT.length, BUILDS.length);
  assert.equal(BUILD_AT[1], 0);
  assert.ok(BUILD_AT[0] < 0 && BUILD_AT[2] > 0);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const b = new THREE.Bone(); b.name = "Bip01_Head";
  assert.equal(buildMorph(g, [b], [new THREE.Matrix4()], new THREE.Matrix4()), null);
});
