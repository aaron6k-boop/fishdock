// sunShade: the clouds' shadows and the near shadow map (src/lib/world3d/sunShade.js)
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { cloudShadeStrength, cloudCut, CLOUD_SCALE, installSunShade, lightPlane, nearShadowLight, placeNear, NEAR, NEAR_MAP, updateClouds, CLOUDS, DRIFT } from "../src/lib/world3d/sunShade.js";

// the shader's noise, as it is written there (for the share of ground in shade)
const fr = (x) => x - Math.floor(x);
const h = (x, y) => { let a = fr(x * 0.1031), b = fr(y * 0.1031), c = fr(x * 0.1031); const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d; return fr((a + b) * c); };
const n2 = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * fx, b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * fx; return a + (b - a) * fy; };
const field = (x, y) => n2(x, y) * 0.5 + n2(x * 2.13 + 5.2, y * 2.13 + 1.3) * 0.3 + n2(x * 4.71 + 1.7, y * 4.71 + 8.4) * 0.2;

test("about as much of the ground is in a cloud's shade as the sky has cloud", () => {
  for (const cover of [0.2, 0.35, 0.5, 0.65]) {
    const cut = cloudCut(cover); let n = 0, k = 0;
    for (let i = 0; i < 160; i++) for (let j = 0; j < 160; j++) { k++; if (field(i * 0.37 + 0.11, j * 0.41 + 0.07) > cut + 0.01) n++; }
    assert.ok(Math.abs(n / k - cover) < 0.1, `cover ${cover}: ${(n / k).toFixed(2)} in shade`);
  }
});

test("cloud shadows: none under a clear sky, a full overcast or at night; strongest under broken cloud", () => {
  assert.equal(cloudShadeStrength(0, 1, 0.5), 0);
  assert.equal(cloudShadeStrength(1, 1, 0.5), 0);
  assert.equal(cloudShadeStrength(0.4, 0, 0.5), 0); // night
  assert.ok(cloudShadeStrength(0.4, 1, 0.5) > 0.7);
  assert.ok(cloudShadeStrength(0.4, 1, 0.05) < cloudShadeStrength(0.4, 1, 0.3)); // a low sun: softer
  assert.ok(cloudShadeStrength(0.4, 1, 0.6) <= 0.75);
});

test("the shade's patches are a few hundred metres across and drift at a cloud's speed", () => {
  assert.ok(CLOUD_SCALE >= 300 && CLOUD_SCALE <= 1000);
  const speed = Math.hypot(...DRIFT); assert.ok(speed > 3 && speed < 15, `${speed} m/s`);
});

test("three's light loop takes the clouds' shade and the near map", () => {
  assert.ok(installSunShade());
  assert.ok(THREE.ShaderChunk.lights_fragment_begin.includes("fdCloudShade( vDirectionalShadowCoord[ i ] )"));
  assert.ok(THREE.ShaderChunk.lights_fragment_begin.includes("directionalShadowMap[ 1 ]"));
  assert.ok(THREE.ShaderChunk.lights_pars_begin.includes("float fdCloudAt( vec2 u )"));
  for (const k of ["standard", "physical", "lambert", "phong"]) assert.equal(THREE.ShaderLib[k].uniforms.fdCloudA.value, CLOUDS.a);
  assert.ok(installSunShade()); // (twice is once)
  assert.equal(THREE.ShaderChunk.lights_pars_begin.split("float fdCloudAt").length, 2);
});

test("the light's plane: square to the light, as three's shadow camera has it", () => {
  const d = new THREE.Vector3(0.3, 0.5, -0.8).normalize(), [X, Y] = lightPlane(d, new THREE.Vector3(), new THREE.Vector3());
  assert.ok(Math.abs(X.dot(d)) < 1e-9 && Math.abs(Y.dot(d)) < 1e-9 && Math.abs(X.dot(Y)) < 1e-9);
  const cam = new THREE.OrthographicCamera(); cam.position.copy(d).multiplyScalar(120); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const cx = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), cy = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  assert.ok(cx.distanceTo(X) < 1e-9 && cy.distanceTo(Y) < 1e-9);
});

test("the clouds' numbers place a point's shade the same from the land's shadow coordinate as from the sea's own position", () => {
  const sun = new THREE.DirectionalLight(); sun.target.position.set(10, 0, -4); sun.position.copy(sun.target.position).addScaledVector(new THREE.Vector3(0.3, 0.5, -0.8).normalize(), 120);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 240 }); sun.shadow.camera.updateProjectionMatrix();
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
  updateClouds({ sun, t: 1234, cloud: 0.4, day: 1, sunY: 0.5 });
  const P = new THREE.Vector3(17, 3.8, -11), sc = new THREE.Vector4(P.x, P.y, P.z, 1).applyMatrix4(sun.shadow.matrix);
  const land = [CLOUDS.a.x + (sc.x / sc.w - 0.5) * CLOUDS.a.z, CLOUDS.a.y + (sc.y / sc.w - 0.5) * CLOUDS.a.z];
  const sea = [CLOUDS.camX.x * P.x + CLOUDS.camX.y * P.y + CLOUDS.camX.z * P.z - CLOUDS.b.y, CLOUDS.camY.x * P.x + CLOUDS.camY.y * P.y + CLOUDS.camY.z * P.z - CLOUDS.b.z];
  assert.ok(Math.abs(land[0] - sea[0]) < 1e-6 && Math.abs(land[1] - sea[1]) < 1e-6, `${land} vs ${sea}`);
  assert.ok(CLOUDS.a.w > 0.65);
});

test("the near map: no light of its own, off until switched on, its box squared to its own pixels round your feet", () => {
  const L = nearShadowLight();
  assert.equal(L.intensity, 0); assert.equal(L.visible, false); assert.equal(L.castShadow, false);
  assert.equal(L.shadow.camera.right - L.shadow.camera.left, 2 * NEAR);
  const d = new THREE.Vector3(0.3, 0.5, -0.8).normalize(), cam = new THREE.PerspectiveCamera(); cam.position.set(3.37, 5.4, -1.91); cam.lookAt(10, 4, -10); cam.updateMatrixWorld();
  placeNear(L, cam, d);
  const [X, Y] = lightPlane(d, new THREE.Vector3(), new THREE.Vector3()), px = (2 * NEAR) / NEAR_MAP;
  for (const v of [X.dot(L.target.position) / px, Y.dot(L.target.position) / px]) assert.ok(Math.abs(v - Math.round(v)) < 1e-6);
  assert.ok(L.target.position.distanceTo(cam.position) < NEAR * 0.75); // (you are well inside it)
  assert.ok(L.position.clone().sub(L.target.position).normalize().distanceTo(d) < 1e-9);
});
