// ---- a thornback ray's back, tail and thorns (src/lib/world3d/fishRay.js) on its model, fish2/thornback-ray.glb ----
// (needs node_modules for three, like the tests/sim3d*.test.js files: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let THREE = null, R = null, GLTFLoader = null;
try { THREE = await import("three"); ({ GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")); R = await import("../src/lib/world3d/fishRay.js"); } catch { /* no node_modules */ }
const skip = !R && "three isn't installed";

// (the ray as angler.js's modelledFish puts it together: body, fin and eye in one geometry, groups 0, 1, 2)
async function rayGeo() {
  const buf = readFileSync(new URL("../public/models/fish2/thornback-ray.glb", import.meta.url));
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
  const node = gltf.scene.getObjectByName("fish_thornback-ray"); node.updateWorldMatrix(true, true);
  const parts = { fish_body: null, fish_fin: null, fish_eye: null }; node.traverse((o) => { if (o.isMesh && o.material?.name in parts) parts[o.material.name] = o.geometry.clone().applyMatrix4(o.matrixWorld); });
  const pos = [], uv = [], idx = [], groups = []; let base = 0;
  [parts.fish_body, parts.fish_fin, parts.fish_eye].forEach((g, gi) => { const p = g.attributes.position.array, t = g.attributes.uv.array, ix = g.index.array; for (const v of p) pos.push(v); for (const v of t) uv.push(v); groups.push([idx.length, ix.length, gi]); for (const k of ix) idx.push(k + base); base += p.length / 3; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  for (const [s, c, m] of groups) geo.addGroup(s, c, m); return geo;
}
// (the top of the body down the middle, and its half width and thickness, in bins along the fish)
function midline(geo) {
  const p = geo.attributes.position, body = new Set(), g0 = geo.groups.find((q) => q.materialIndex === 0);
  for (let i = g0.start; i < g0.start + g0.count; i++) body.add(geo.index.array[i]);
  const NB = 18, top = Array(NB).fill(0), w = Array(NB).fill(0), th = Array(NB).fill(0);
  for (const i of body) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.max(0, Math.min(NB - 1, Math.floor(x / 0.9 * NB))); if (Math.abs(y) < 0.02 && z > 0) top[k] = Math.max(top[k], z); w[k] = Math.max(w[k], Math.abs(y)); th[k] = Math.max(th[k], Math.abs(z)); }
  return { top, w, th };
}

test("the thornback: a hump along the spine, the body running into a round tail, thorns that bend with it", { skip }, async () => {
  const geo = await rayGeo(), before = geo.attributes.position.array.slice(), out = R.shapeRay(geo), m0 = midline(geo), m1 = midline(out);
  assert.deepEqual(Array.from(geo.attributes.position.array), Array.from(before), "the model given is left as it was");
  assert.ok(out.userData.thorns > 40, `thorns down the back and tail, and bucklers (${out.userData.thorns})`);
  const g3 = out.groups.find((q) => q.materialIndex === 3); assert.ok(g3 && g3.count === out.userData.thorns * 6 * 3, "in their own group, in the fish's own mesh");
  for (const v of out.attributes.position.array) assert.ok(Number.isFinite(v));
  // (a hump: the middle of the disc a good deal higher than lofted)
  assert.ok(m1.top[6] > m0.top[6] + 0.008, `the back raised along the spine (${(m0.top[6] * 1000).toFixed(0)} to ${(m1.top[6] * 1000).toFixed(0)} thousandths)`);
  // (from the disc's middle to the tail tip the spine only ever falls, never swelling again where the tail starts)
  for (let k = 7; k < 17; k++) if (m1.top[k + 1] > 0) assert.ok(m1.top[k + 1] <= m1.top[k] + 0.002, `no bump at ${(k / 18 * 0.9).toFixed(2)}: ${m1.top[k].toFixed(4)} then ${m1.top[k + 1].toFixed(4)}`);
  // (the tail round: lofted a fifteenth as thick as wide, now a quarter or more)
  for (const k of [14, 15]) assert.ok(m1.th[k] / m1.w[k] > 0.25 && m0.th[k] / m0.w[k] < 0.1, `the tail at ${(k / 18 * 0.9).toFixed(2)}: ${(m0.th[k] / m0.w[k]).toFixed(2)} to ${(m1.th[k] / m1.w[k]).toFixed(2)}`);
  // (the disc's outline is the picture's: the wings no wider and no narrower)
  for (let k = 3; k < 10; k++) assert.ok(Math.abs(m1.w[k] - m0.w[k]) < 1e-6);
});

test("another ray drawn from the thornback's picture gets the back and tail, not the thorns", { skip }, async () => {
  const out = R.shapeRay(await rayGeo(), { thorns: false });
  assert.ok(!out.groups.some((q) => q.materialIndex === 3));
});
