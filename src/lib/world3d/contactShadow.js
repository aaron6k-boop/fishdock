// ---- contactShadow: the soft dark where something stands on the ground (feet, a tackle box, a bucket, a bench) ----
// The sun's shadow map (Balanced and High) gives the cast shadow but not the darkening right underneath, where the
// sky's light can't reach, and Performance has no shadow map at all. This is that ambient occlusion as a cheap decal:
// one small radial texture, shared by every blob, drawn as a flat quad just above the ground with no depth write.
import * as THREE from "three";
import { contactFalloff } from "./waterFx.js";

let tex = null;
function contactTex() {
  if (tex || typeof document === "undefined") return tex;
  const N = 64, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
    // (an alpha map is read from the green channel, so the falloff goes in the colour, not the canvas's alpha)
    const a = Math.round(contactFalloff(Math.hypot(u, v)) * 255);
    img.data.set([a, a, a, 255], (y * N + x) * 4);
  }
  g.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}

const mats = new Map();
function contactMat(strength) {
  const k = Math.round(strength * 20) / 20;
  if (mats.has(k)) return mats.get(k);
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: k, alphaMap: contactTex(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: true });
  mats.set(k, m); return m;
}

const flatQuad = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A soft contact shadow `w` by `d` metres (its full width), `strength` 0..1, to add under something at its foot. */
export function contactShadow(w, d, strength = 0.5, y = 0.02) {
  // (its own small geometry: the people and their kit dispose of theirs when they go)
  const m = new THREE.Mesh(flatQuad(), contactMat(strength));
  m.scale.set(w, 1, d); m.position.y = y; m.renderOrder = 2; m.castShadow = m.receiveShadow = false;
  m.userData.noPick = true; m.raycast = () => {};
  return m;
}

/** Many at once, as one instanced mesh (one draw call): `list` of [x, y, z, turn, w, d]. */
export function contactShadows(list, strength = 0.45) {
  const im = new THREE.InstancedMesh(flatQuad(), contactMat(strength), list.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([x, y, z, turn, w, d], k) => { mx.compose(p.set(x, y + 0.02, z), q.setFromAxisAngle(up, turn || 0), s.set(w, 1, d)); im.setMatrixAt(k, mx); });
  im.renderOrder = 2; im.castShadow = im.receiveShadow = false; im.raycast = () => {}; im.computeBoundingSphere();
  return im;
}
