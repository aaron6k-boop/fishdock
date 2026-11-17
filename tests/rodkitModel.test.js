// rodkit.glb: the rod and reel modelled in Blender (source-assets/blender/build_rodkit.py), as the game fits them (rodKit.js)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const buf = readFileSync(new URL("../public/models/rodkit.glb", import.meta.url));
const J = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
const nodes = J.nodes, byName = new Map(nodes.map((n, i) => [n.name, i]));
const parentOf = new Map(); nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const under = (i, name) => { for (let p = parentOf.get(i); p != null; p = parentOf.get(p)) if (nodes[p].name === name) return true; return false; };
const t = (name) => (nodes[byName.get(name)].translation || [0, 0, 0]).map((v) => +v.toFixed(4));

test("the reel has every part the game turns and every point the hands and the line use, where they always were", () => {
  for (const n of ["reel", "rotor", "bail", "spool", "crank", "att_knob", "att_roller", "rodhandle", "blank", "guide", "wrap", "tiptop"]) assert.ok(byName.has(n), n);
  // (the rotor and spool turn and slide about the spool's axis under the gearbox; the crank's axle; the knob the left
  // hand holds, 58 mm down the arm; the line roller on the bail: rodKit.js KNOB_PROFILE and the grips depend on these)
  assert.deepEqual(t("rotor"), [0, -0.076, 0.016]); assert.deepEqual(t("spool"), [0, -0.076, 0.05]); assert.deepEqual(t("crank"), [0.031, -0.076, -0.012]);
  assert.deepEqual(t("att_knob"), [0.032, -0.058, 0]); assert.deepEqual(t("att_roller"), [0.0335, 0.0015, 0]); assert.deepEqual(t("bail"), [0, 0, 0.041]);
  assert.ok(under(byName.get("bail"), "rotor") && under(byName.get("att_roller"), "bail") && under(byName.get("att_knob"), "crank"));
});

test("the reel is modelled in its real shapes, not stacked boxes: one swept leg, a lofted body, a one-piece handle arm", () => {
  const reelParts = nodes.filter((n, i) => n.mesh != null && under(i, "reel")).map((n) => n.name);
  assert.ok(reelParts.includes("reel_stem") && !reelParts.some((n) => /^reel_stem\d/.test(n)), reelParts.join(","));
  assert.ok(reelParts.includes("crank_arm") && !reelParts.some((n) => /^crank_arm\d/.test(n)));
  for (const n of ["reel_body", "reel_foot", "rotor_cup", "rotor_cup_armL", "rotor_cup_armR", "spool_body", "spool_skirt", "spool_braid", "drag_knob", "crank_knob", "bail_wire", "line_roller"]) assert.ok(reelParts.includes(n), n);
  // the braid on the spool keeps its own material (angler.js finds it by name for the line's start)
  const braid = nodes[byName.get("spool_braid")], mat = J.materials[J.meshes[braid.mesh].primitives[0].material].name;
  assert.equal(mat, "braid_blue");
});

test("small enough for a phone: the whole kit under 40,000 triangles and a megabyte", () => {
  let tris = 0;
  for (const m of J.meshes) for (const p of m.primitives) tris += (p.indices != null ? J.accessors[p.indices].count : J.accessors[p.attributes.POSITION].count) / 3;
  assert.ok(tris < 40000, `${tris} triangles`); assert.ok(buf.length < 1e6, `${buf.length} bytes`);
});
