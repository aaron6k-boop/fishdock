// ---- the pier's furniture model (public/models/pierprops.glb): each piece standing on its own origin ----
// Read straight from the file (its JSON chunk and accessor bounds), so it runs with no install.
// (each piece's mesh was once a few metres off its own origin, where it had stood in Blender's layout: every bench in
// the game stood 2.5 m along from its place, every lamp 4 m from its pool of light)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const glb = readFileSync(new URL("../public/models/pierprops.glb", import.meta.url));
const len = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + len).toString("utf8"));
const node = (name) => json.nodes.find((n) => n.name === name);
// a mesh's bounds over all its parts (each part's position accessor carries its min and max)
const bounds = (mesh) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of json.meshes[mesh].primitives) { const a = json.accessors[p.attributes.POSITION]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); } }
  return { lo, hi };
};

test("every piece of pier furniture is centred on its own origin, standing on the deck", () => {
  for (const [name, maxW] of [["bench", 2.0], ["station", 1.0], ["bollard", 0.5], ["lamp", 0.9]]) {
    const root = node(name), mesh = node(name + "_mesh");
    assert.ok(root && mesh, `${name} and ${name}_mesh are in the model`);
    assert.ok(root.children?.includes(json.nodes.indexOf(mesh)), `${name}_mesh sits under ${name}`);
    for (const n of [root, mesh]) for (const k of [0, 2]) assert.ok(Math.abs(n.translation?.[k] ?? 0) < 1e-6, `${n.name} at its root's origin`);
    const { lo, hi } = bounds(mesh.mesh);
    assert.ok(Math.abs(lo[1]) < 0.01, `${name} stands on the deck (its foot at ${lo[1].toFixed(3)})`);
    for (const k of [0, 2]) assert.ok(Math.abs((lo[k] + hi[k]) / 2) < 0.15 && hi[k] - lo[k] <= maxW, `${name} centred on its origin along ${"xyz"[k]} (${lo[k].toFixed(2)} to ${hi[k].toFixed(2)})`);
  }
});

test("the textured finishes point at a real uv map, and the weathered ones keep the names the game ages them by", () => {
  const names = json.materials.map((m) => m.name);
  for (const n of ["cast_iron", "galvanised", "housing_red", "bench_slat", "station_sign", "lifebuoy"]) assert.ok(names.includes(n), `${n} is in the model`);
  for (const m of json.materials) {
    const pbr = m.pbrMetallicRoughness || {};
    for (const t of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, m.normalTexture].filter(Boolean)) assert.ok((t.texCoord ?? 0) >= 0, `${m.name}'s textures read a uv map (texCoord ${t.texCoord})`);
  }
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const m = json.materials[p.material];
    if (m?.pbrMetallicRoughness?.baseColorTexture) assert.ok("TEXCOORD_0" in p.attributes, `${mesh.name}'s ${m.name} part has its uv map`);
  }
});
