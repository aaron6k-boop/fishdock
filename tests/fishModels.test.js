// The modelled fish (public/models/fish2/<species>.glb, source-assets/blender/build_fish3.py): every species the game
// models has its file, with the parts the game looks for by name, its shade colour, and its shape keys
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const DIR = new URL("../public/models/fish2/", import.meta.url);
const SPECIES = ["cod", "bass", "whiting", "mackerel", "plaice", "pollack", "ballan-wrasse", "black-bream", "coalfish", "dab", "flounder", "garfish", "gurnard", "lesser-spotted-dogfish", "pouting", "smoothhound", "sole", "thick-lipped-mullet", "thornback-ray", "tope"];
const SHARKS = new Set(["lesser-spotted-dogfish", "smoothhound", "tope"]);
const gltf = (f) => { const b = readFileSync(new URL(f, DIR)); assert.equal(b.toString("ascii", 0, 4), "glTF"); const n = b.readUInt32LE(12); return JSON.parse(b.toString("utf8", 20, 20 + n)); };

test("every modelled species has its own file, none left over", () => {
  const have = readdirSync(DIR).filter((f) => f.endsWith(".glb")).map((f) => f.replace(".glb", "")).sort();
  assert.deepEqual(have, [...SPECIES].sort());
});

for (const sp of SPECIES) test(`${sp}: its parts, shade and shape keys`, () => {
  const J = gltf(sp + ".glb");
  assert.ok(J.nodes.some((n) => n.name === "fish_" + sp), "a node named fish_" + sp);
  const mats = J.materials.map((m) => m.name).sort();
  assert.deepEqual(mats, ["fish_body", "fish_eye", "fish_fin"]);
  const mesh = J.meshes[0], names = mesh.extras?.targetNames || [];
  for (const p of mesh.primitives) assert.ok("COLOR_0" in p.attributes, "the shade colour on every part");
  if (sp === "thornback-ray") assert.equal(names.length, 0);
  else { assert.ok(names.includes("gape"), "a jaw that drops"); if (!SHARKS.has(sp)) assert.ok(names.includes("gills"), "gill covers that lift"); }
  const kb = statSync(new URL(sp + ".glb", DIR)).size / 1000; assert.ok(kb < 450, `${kb} kB`);
  const tris = mesh.primitives.reduce((s, p) => s + J.accessors[p.indices].count / 3, 0); assert.ok(tris > 9000 && tris < 16000, `${tris} triangles`);
});
