// The 3D rebuild of real places (osmPlace.shoreEdges, architecture.js): walls only where land meets water, the
// building styles, and pitched roofs whose faces point up and outward.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace, shoreEdges, inside } from "../src/lib/world3d/osmPlace.js";
import { styleFor, obb, pitchedRoof, footprintArea } from "../src/lib/world3d/architecture.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-gorleston.json", import.meta.url)));

test("walls only where land meets water: none across the harbour mouth, each facing the water", () => {
  const L = buildPlace(osm, 52.5721, 1.7383, "pier");
  const landAt = (q) => L.land.some((r) => inside(q, r)) && !L.water.some((r) => inside(q, r));
  const walls = L.edges.filter((e) => e[6] === "wall");
  assert.ok(walls.length > 40, `${walls.length} walls`);
  for (const [x1, z1, x2, z2, nx, nz] of walls) {
    const m = [(x1 + x2) / 2, (z1 + z2) / 2];
    assert.equal(landAt([m[0] + nx * 2, m[1] + nz * 2]), false, `water in front of the wall at ${m}`);
    assert.equal(landAt([m[0] - nx * 2, m[1] - nz * 2]), true, `land behind the wall at ${m}`);
  }
  // OpenStreetMap closes the coastline straight across the river mouth (about x = 38, z -10 to -90): no wall there
  assert.equal(walls.filter(([x1, z1, x2, z2]) => Math.abs(x1 - 38) < 5 && Math.abs(x2 - 38) < 5 && Math.min(z1, z2) < -20).length, 0);
  // a made-up square island: four walls, all facing out
  const isle = shoreEdges({ land: [[[-10, -10], [10, -10], [10, 10], [-10, 10]]], water: [], piers: [] });
  assert.equal(isle.length, 4); for (const e of isle) { const m = [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2]; assert.ok(m[0] * e[4] + m[1] * e[5] > 0, "faces away from the island"); }
  // the same island with a beach along it: beach, not wall
  const beach = shoreEdges({ land: [[[-10, -10], [10, -10], [10, 10], [-10, 10]]], water: [], piers: [] }, [[[-12, 5], [12, 5], [12, 14], [-12, 14]]]);
  assert.equal(beach.filter((e) => e[6] === "beach").length, 1);
});

test("building styles: the lighthouse, the lookout, huts, houses and warehouses; the map's height is kept", () => {
  const sq = (s) => [[0, 0], [s, 0], [s, s], [0, s]];
  assert.equal(styleFor({ id: 1, ring: sq(6), use: "lighthouse", h: 7 }).type, "lighthouse");
  assert.equal(styleFor({ id: 2, ring: sq(8), use: "lookout", h: 7 }).type, "lookout");
  assert.equal(styleFor({ id: 3, ring: sq(4), kind: "shed", h: 3 }).storeys, 1);
  const house = styleFor({ id: 4, ring: [[0, 0], [12, 0], [12, 7], [0, 7]], kind: "house", h: 7 });
  assert.equal(house.type, "house"); assert.ok(["brick", "render"].includes(house.walls)); assert.ok(house.storeys >= 2);
  assert.equal(styleFor({ id: 5, ring: sq(40), kind: "industrial", h: 8 }).type, "warehouse");
  assert.equal(styleFor({ id: 6, ring: [[0, 0], [12, 0], [12, 7], [0, 7]], kind: "yes", h: 16, tall: true }).h, 16, "a mapped height is used");
  // the same building always gets the same style
  assert.deepEqual(styleFor({ id: 77, ring: sq(9), kind: "yes", h: 7 }), styleFor({ id: 77, ring: sq(9), kind: "yes", h: 7 }));
});

test("roofs: the long axis found, every pitched face pointing up and outward, gable ends upright", () => {
  const ring = [[0, 0], [0, 6], [14, 6], [14, 0]]; // 14 m by 6 m
  const b = obb(ring); assert.ok(Math.abs(b.L - 14) < 1e-6 && Math.abs(b.W - 6) < 1e-6); assert.ok(Math.abs(footprintArea(ring) - 84) < 1e-9);
  for (const order of [ring, ring.slice().reverse()]) for (const shape of ["hip", "gable"]) {
    const R = pitchedRoof(order, 6, { shape });
    const c = [7, 3];
    for (const f of R.faces) {
      const [a, bq, cq] = f.pts, u = [bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]], v = [cq[0] - a[0], cq[1] - a[1], cq[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const mid = f.pts.reduce((s, p) => [s[0] + p[0] / f.pts.length, s[1] + p[2] / f.pts.length], [0, 0]);
      assert.ok(n[0] * (mid[0] - c[0]) + n[2] * (mid[1] - c[1]) > -1e-6, `${shape}: a face points outward`);
      if (f.gable) assert.ok(Math.abs(n[1]) < 0.2 * Math.hypot(...n), "a gable end is upright"); else assert.ok(n[1] > 0, `${shape}: a roof face points up`);
    }
    assert.ok(R.rise > 1 && R.rise <= 5);
  }
});
