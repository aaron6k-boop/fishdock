// FishDock: the tops of the chimney stacks, modelled in Blender (source-assets/blender/build_chimneys.py ->
// public/models/chimney_caps.glb): two courses of brick oversailing the stack, the cement flaunching and two clay pots.
// Every chimney has the far model (six-sided pots, one instanced mesh for the town); those within NEAR metres of the
// camera have the near one (round, rolled rims, sooty inside) instead, looked at again as the camera moves.
import * as THREE from "three";
import { loadPart } from "./glbParts.js";

const NEAR = 70;

/**
 * @param {THREE.Group} group
 * @param {number[][]} caps   [x, y (the stack's top), z, turn (0 or 1: a quarter turn)] for each chimney
 * @param {THREE.Material} brickMat  the stacks' own brick (buildings3d.js M.tower)
 * @returns {{ update(t, cam), ready: Promise }}
 */
export function buildChimneyCaps(group, caps, brickMat) {
  const st = { near: null, far: null, nearKeys: new Set(), at: new THREE.Vector3(1e9, 0, 1e9) };
  if (!caps?.length || typeof document === "undefined") return { update() {}, ready: Promise.resolve(null) };
  const potMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  // (each chimney's own small turn and tint: the pots weathered a little differently)
  const tint = caps.map((c, i) => { const h = Math.abs(Math.sin(c[0] * 12.9898 + c[2] * 78.233 + i) * 43758.5453) % 1; return 0.85 + h * 0.3; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  // (shadows from the near level only: the far level is every other chimney in the town, two thousand at Whitby, and
  // their pots' shadows on a roof a hundred metres off don't show)
  const make = (parts, n, shadow) => parts.map(({ geo, brick }) => {
    const mesh = new THREE.InstancedMesh(geo, brick ? brickMat : potMat, n);
    mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.name = "fdChimneyCaps"; mesh.frustumCulled = false; mesh.count = 0;
    if (!brick) for (let k = 0; k < n; k++) mesh.setColorAt(k, col.setRGB(1, 1, 1));
    group.add(mesh); return mesh;
  });
  const place = (meshes, list) => {
    for (const mesh of meshes) {
      let k = 0;
      for (const i of list) { const c = caps[i]; q.setFromAxisAngle(up, c[3] ? Math.PI / 2 : 0); m4.compose(p.set(c[0], c[1], c[2]), q, s1); mesh.setMatrixAt(k, m4); if (mesh.instanceColor) mesh.setColorAt(k, col.setScalar(tint[i])); k++; }
      mesh.count = k; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };
  const ready = loadPart("chimney_caps").then((scene) => {
    const parts = { near: [], far: [] };
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const lv = /near/.test(o.name) ? "near" : /far/.test(o.name) ? "far" : null; if (!lv) return;
      const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
      parts[lv].push({ geo, brick: /brick/.test(o.name) || /brick/.test(o.material?.name || "") });
    });
    if (!parts.near.length || !parts.far.length) return null;
    st.near = make(parts.near, Math.min(caps.length, 400), true); st.far = make(parts.far, caps.length, false);
    place(st.far, caps.map((_, i) => i));
    return true;
  }).catch(() => null);
  function update(t, cam) {
    if (!st.far || !cam) return;
    if (cam.position.distanceToSquared(st.at) < 25) return; // (looked at again every 5 m)
    st.at.copy(cam.position);
    const near = [], far = [], cx = cam.position.x, cz = cam.position.z, n2 = NEAR * NEAR;
    caps.forEach((c, i) => { const dx = c[0] - cx, dz = c[2] - cz; (dx * dx + dz * dz < n2 && near.length < 400 ? near : far).push(i); });
    place(st.near, near); place(st.far, far);
  }
  return { update, ready };
}
