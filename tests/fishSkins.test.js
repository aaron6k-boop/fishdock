// ---- the 3D fish's skins from photographs (public/fish/skin, source-assets/fish-skins/skins.py): every one there at
// both sizes, every photograph credited, and the pectoral fins pointed at the corner of the skin they're painted in ----
// (the last test needs node_modules for three, like the tests/sim3d*.test.js files: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SKIN_PHOTOS, PROCEDURAL } from "../src/data/fishSkins.js";
import { SPECIES } from "../src/data/species.js";

let THREE = null, GLTFLoader = null, A = null;
try { THREE = await import("three"); ({ GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js")); A = await import("../src/lib/world3d/angler.js"); } catch { /* no node_modules */ }

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

/** A WebP's width and height from its header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(buf) {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF"); assert.equal(buf.toString("ascii", 8, 12), "WEBP");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === "VP8L") { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error("not a WebP I know: " + kind);
}

const ALL = [...Object.keys(SKIN_PHOTOS), ...PROCEDURAL];

test("fish skins: every species with a skin has its colour and normal map at both sizes, in the cut-out's frame", () => {
  const ids = new Set(SPECIES.map((s) => s.id));
  assert.equal(ALL.length, 22);
  for (const sp of ALL) {
    assert.ok(ids.has(sp), `${sp} is a species`);
    for (const [suffix, w, h] of [["", 1920, 1280], ["-m", 960, 640], ["_n", 1920, 1280], ["_n-m", 960, 640]]) {
      const p = `public/fish/skin/${sp}${suffix}.webp`;
      assert.ok(existsSync(new URL(p, root)), p);
      assert.deepEqual(webpSize(read(p)), [w, h], p);
    }
  }
  if (A) assert.deepEqual([...A.FISH_SKINS].sort(), [...ALL].sort());
});

test("fish skins: every photograph is in the licence register and the credits, under a licence that allows it", () => {
  const reg = JSON.parse(read("source-assets/ASSET-LICENCES.json")).assets;
  const credits = read("public/models/CREDITS.txt").toString();
  for (const [sp, p] of Object.entries(SKIN_PHOTOS)) {
    assert.match(p.licence, /^CC (BY|BY-SA) [34]\.0$/, sp);
    const e = reg.find((a) => a.id === `commons:fish-skin-${sp}`);
    assert.ok(e, `${sp} in the register`);
    assert.equal(e.licence, p.licence, sp); assert.equal(e.author, p.author, sp);
    assert.ok(e.files?.[0]?.sha256?.length === 64, `${sp}: the copy used, with its hash`);
    assert.ok(credits.includes(`by ${p.author}, ${p.licence}`), `${sp} in CREDITS.txt`);
    assert.ok(credits.includes(p.file.replace(/\.[a-z]+$/i, "").replace(/_/g, " ")), `${sp}'s photograph named in CREDITS.txt`);
  }
});

test("fish skins: the pectoral fins' boxes are the ones the models and the skins were made with", () => {
  if (!A) return;
  const py = read("source-assets/blender/build_fish3.py").toString() + "\n" + read("source-assets/fish-skins/skins.py").toString();
  for (const [sp, box] of Object.entries(A.PEC_BOX)) {
    const want = `pec=(${box.join(", ")})`;
    const hits = py.split("\n").filter((l) => l.includes(`"${sp}"`) && l.includes("pec="));
    assert.equal(hits.length, 2, `${sp}: in build_fish3.py and skins.py`);
    for (const l of hits) assert.ok(l.includes(want), `${sp}: ${want} in ${l.trim().slice(0, 60)}`);
  }
});

test("fish skins: a cod's pectoral plates are pointed at the skin's corner, and nothing else moves", { skip: !A && "three isn't installed" }, async () => {
  const buf = read("public/models/fish2/cod.glb");
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
  const node = gltf.scene.getObjectByName("fish_cod"); node.updateWorldMatrix(true, true);
  const parts = { fish_body: null, fish_fin: null, fish_eye: null };
  node.traverse((o) => { if (o.isMesh && o.material?.name in parts) parts[o.material.name] = o.geometry.clone(); });
  // (put together as angler.js's modelledFish does: groups 0, 1, 2; the uvs turned the way a canvas texture reads them)
  const uv = [], idx = []; let base = 0; const geo = new THREE.BufferGeometry(), groups = [];
  [parts.fish_body, parts.fish_fin, parts.fish_eye].forEach((g, gi) => {
    const t = g.attributes.uv.array; for (let i = 0; i < t.length; i += 2) uv.push(t[i], 1 - t[i + 1]);
    groups.push([idx.length, g.index.count, gi]); for (const k of g.index.array) idx.push(k + base); base += g.attributes.uv.count;
  });
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); for (const [s, c, m] of groups) geo.addGroup(s, c, m);
  const before = geo.attributes.uv.array.slice();
  const moved = A.pecToCorner(geo, "cod");
  assert.ok(moved >= 2 * 4 * 6, `the two plates' vertices moved (${moved})`);
  const [x0, y0, x1, y1] = A.PEC_BOX.cod, after = geo.attributes.uv.array; let changed = 0;
  for (let i = 0; i < after.length; i += 2) {
    if (after[i] === before[i] && after[i + 1] === before[i + 1]) continue;
    changed++;
    const x = after[i] * 480, y = (1 - after[i + 1]) * 320;
    assert.ok(x > A.PEC_AT - 5 && x < A.PEC_AT + (x1 - x0) + 5 && y > A.PEC_AT - 5 && y < A.PEC_AT + (y1 - y0) + 5, `moved into the corner (${x.toFixed(1)}, ${y.toFixed(1)})`);
    // (and from the fin's box on the flank)
    const bx = before[i] * 480, by = (1 - before[i + 1]) * 320;
    assert.ok(bx >= x0 - 4 && bx <= x1 + 4 && by >= y0 - 4 && by <= y1 + 4);
  }
  assert.equal(changed, moved);
  // (the body's own uvs under the fin left alone, and a second call does nothing)
  const bodyEnd = parts.fish_body.attributes.uv.count * 2;
  assert.deepEqual([...after.slice(0, bodyEnd)], [...before.slice(0, bodyEnd)]);
  assert.equal(A.pecToCorner(geo, "cod"), 0);
});
