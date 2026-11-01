// The 3D fish (src/lib/fish3d.js): finding the body, fins and tail in a cut-out's alpha, building the mesh, and
// bending and placing it. The renderer itself needs WebGL and is checked in the browser.
import test from "node:test";
import assert from "node:assert/strict";
import { fishShape, buildFishMesh, deformFish, bodyWidth, CURLED } from "../src/lib/fish3d.js";

// a drawn fish: an oval body from x 40 to 360, a triangular dorsal fin on its back, a fan tail behind a narrow wrist
function drawFish(w = 480, h = 320) {
  const a = new Uint8Array(w * h);
  const on = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) a[y * w + x] = 255; };
  for (let x = 40; x <= 360; x++) {
    const u = (x - 40) / 320, half = 60 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.4) / 0.62, 2))) + 6;
    for (let y = Math.round(160 - half); y <= Math.round(160 + half); y++) on(x, y);
  }
  for (let x = 150; x <= 190; x++) for (let y = 70; y < 110; y++) if (y >= 70 + (190 - x)) on(x, y); // dorsal fin
  for (let x = 361; x <= 440; x++) { const half = 8 + (x - 361) * 0.75; for (let y = Math.round(160 - half); y <= Math.round(160 + half); y++) on(x, y); } // tail
  return a;
}

test("the body, a fin and the tail are found in a cut-out's outline", () => {
  const s = fishShape(drawFish(), 480, 320);
  assert.equal(s.ok, true, s.why);
  assert.equal(s.x0, 40); assert.equal(s.x1, 440);
  assert.ok(s.xp > 330 && s.xp < 375, `the wrist at ${s.xp}`);
  assert.ok(s.tail && s.tail[0] === s.xp, "a tail behind the wrist");
  const top = s.fins.filter((f) => f.side === "top");
  assert.equal(top.length, 1, JSON.stringify(s.fins));
  assert.ok(top[0].box[0] >= 140 && top[0].box[2] <= 195, JSON.stringify(top[0].box));
  // the body's top edge runs under the fin (the body's own edge there is at y 94), not over its tip (y 70)
  assert.ok(s.top[180] >= 92, `body top under the fin: ${s.top[180]}`);
  assert.equal(fishShape(new Uint8Array(480 * 320), 480, 320).ok, false);
});

test("the mesh: a lofted body plus flat fins and tail, all inside the picture", () => {
  const s = fishShape(drawFish(), 480, 320);
  const m = buildFishMesh(s, { width: bodyWidth("cod") });
  const n = m.pos.length / 3;
  assert.ok(n > 500 && n < 2000, `${n} vertices`);
  for (const i of m.idx) assert.ok(i < n);
  for (const i of m.finIdx) assert.ok(i < n);
  for (let i = 0; i < m.uv.length; i++) assert.ok(m.uv[i] >= -0.01 && m.uv[i] <= 1.01);
  // body depth from the outline, thickness from the species
  let zmax = 0; for (let v = 0; v < n; v++) if (m.kind[v] === 0) zmax = Math.max(zmax, Math.abs(m.pos[v * 3 + 2]));
  assert.ok(zmax > 0.05 && zmax < 0.2, `half thickness ${zmax}`);
  assert.ok(m.kind.some((k) => k === 1) && m.kind.some((k) => k === 2), "fins and tail");
  assert.equal(bodyWidth("plaice") < 0.2, true);
  assert.equal(CURLED.has("conger"), true);
});

test("placing the fish: the mouth on the anchor, its length as asked, mirrored when facing the other way", () => {
  const s = fishShape(drawFish(), 480, 320), m = buildFishMesh(s, { width: 0.5 });
  const xs = (o) => { let a = Infinity, b = -Infinity; for (let i = 0; i < o.p.length; i += 3) { a = Math.min(a, o.p[i]); b = Math.max(b, o.p[i]); } return [a, b]; };
  const o = deformFish(m, { anchor: [100, 200], len: 200, rot: 0 }, {});
  assert.ok(Math.abs(o.spine[0] - 100) < 10 && Math.abs(o.spine[1] - 200) < 15, `mouth near the anchor: ${o.spine[0]}, ${o.spine[1]}`);
  const [a, b] = xs(o);
  assert.ok(Math.abs(b - a - 200) < 12, `length ${b - a}`);
  assert.ok(a > 90, "tail to the right of the mouth");
  const f = deformFish(m, { anchor: [300, 200], len: 200, rot: Math.PI, flip: true }, {});
  const [fa, fb] = xs(f);
  assert.ok(fb < 312 && fa > 80, `facing right: ${fa}..${fb}`);
  // rolling and turning don't lengthen it; bending keeps it joined up
  const r = deformFish(m, { anchor: [100, 200], len: 200, rot: 0, twist: 1, yaw: 0.6, lat: (u) => 0.4 * u * u, dv: (u) => 0.2 * u }, {});
  const [ra, rb] = xs(r);
  assert.ok(rb - ra < 205, `turned shorter: ${rb - ra}`);
  for (let i = 2; i < r.spine.length; i += 2) assert.ok(Math.hypot(r.spine[i] - r.spine[i - 2], r.spine[i + 1] - r.spine[i - 1]) < 8);
});
