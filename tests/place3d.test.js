// The real place for the 3D view: OpenStreetMap data round a documented mark turned into land, water, piers,
// buildings and fishing spots (src/lib/world3d/osmPlace.js, checked on real Gorleston data), the route that fetches
// it (server/place3d.js) and the 360° photo route (server/pano.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace, unrle, landFromCoast, GROUND } from "../src/lib/world3d/osmPlace.js";
import { handlePlace3d, markFor } from "../server/place3d.js";
import { handlePano, pickPano } from "../server/pano.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

// Map data © OpenStreetMap contributors (ODbL): a trimmed extract round Gorleston harbour mouth
const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-gorleston.json", import.meta.url)));

test("Gorleston from real map data: the sea and the river are water, the town is land, the anglers stand at the water's edge facing it", () => {
  const L = buildPlace(osm, 52.5721, 1.7383, "pier");
  const n = L.grid.xs.length, cls = unrle(L.grid.cls, n * n);
  const at = (x, z) => { let i = 0, j = 0; while (i < n - 1 && L.grid.xs[i + 1] <= x) i++; while (j < n - 1 && L.grid.xs[j + 1] <= z) j++; return cls[j * n + i]; };
  assert.equal(at(400, 300), 0, "the open sea to the south-east is water");
  assert.equal(at(-450, 0), 1, "the town to the west is land");
  assert.ok(L.buildings.length > 300, `${L.buildings.length} buildings`);
  assert.ok(L.buildings.every((b) => b.h >= 2 && b.h < 200));
  assert.equal(L.spots.length, 4);
  for (const s of L.spots) {
    assert.equal(at(s.at[0], s.at[2]) !== 0, true, `${s.name} stands on land`);
    const ahead = [s.at[0] + Math.sin(s.face) * 20, s.at[2] - Math.cos(s.face) * 20];
    assert.equal(at(...ahead), 0, `${s.name} faces the water`);
    assert.ok(Math.hypot(s.at[0], s.at[2]) < 120, `${s.name} is near the mark`);
    assert.equal(s.at[1], GROUND.land);
  }
  assert.match(L.attribution, /OpenStreetMap/);
});

test("the coastline closes into land on its left, round the edge of the area", () => {
  // a straight coast running north (land to the west, the sea to the east) across a 100 m box
  const rings = landFromCoast([[[0, -200], [0, 200]]], 100);
  assert.equal(rings.length, 1);
  const xs = rings[0].map((p) => p[0]);
  assert.ok(Math.min(...xs) === -100 && Math.max(...xs) <= 0.01, JSON.stringify(rings[0]));
  assert.deepEqual(landFromCoast([], 100), []);
});

test("the place route: only FishDock's documented marks, OpenStreetMap's answer passed through, kept at the edge", async (t) => {
  const s = setup();
  const c = s.call(handlePlace3d, "/api/place");
  assert.equal((await c("GET", "?spot=somewhere-secret")).status, 404);
  assert.equal((await c("GET", "?spot=../etc")).status, 404);
  assert.ok(markFor("gorleston-south-pier"));
  const calls = stubFetch(t, [[/api\.openstreetmap\.org\/api\/0\.6\/map\.json\?bbox=1\.7/, () => ({ elements: [] })]]);
  const r = await c("GET", "?spot=gorleston-south-pier");
  assert.equal(r.status, 200, r.text); assert.deepEqual(r.body, { elements: [] });
  assert.equal(r.headers.get("x-mark"), "52.5721,1.7383");
  assert.equal(calls.calls.length, 1);
});

test("360° photos: off without a Mapillary token, hidden until made public; otherwise the nearest panorama, credited", async (t) => {
  const s = setup();
  const c = s.call(handlePano, "/api/pano");
  assert.equal((await c("GET", "?spot=gorleston-south-pier")).status, 503);
  const im = (id, lon, lat, pano = true) => ({ id, is_pano: pano, thumb_2048_url: `https://scontent.example/${id}.jpg`, computed_compass_angle: 95, computed_geometry: { type: "Point", coordinates: [lon, lat] }, captured_at: 1693526400000, creator: { username: "pierphotos" } });
  const answer = { data: [im("far", 1.7383, 52.575), im("flat", 1.7384, 52.5721, false), im("near", 1.7385, 52.5722), im("nearer", 1.7383, 52.57211)] };
  const p = pickPano(answer, 52.5721, 1.7383);
  assert.equal(p.id, "nearer"); assert.equal(p.heading, 95); assert.equal(p.author, "pierphotos"); assert.equal(p.licence, "CC BY-SA 4.0"); assert.match(p.page, /mapillary\.com/); assert.equal(p.profile, "https://www.mapillary.com/profile/pierphotos");
  assert.equal(pickPano({ data: [im("far", 1.7383, 52.58)] }, 52.5721, 1.7383), null);
  s.env.MAPILLARY_TOKEN = "MLY|test";
  const calls = stubFetch(t, [[/graph\.mapillary\.com\/images\?access_token=MLY%7Ctest&.*is_pano=true/, () => answer]]);
  assert.equal((await c("GET", "?spot=gorleston-south-pier")).status, 503, "hidden until PANO_PUBLIC is set");
  const r = await c("GET", "?spot=gorleston-south-pier&preview=1");
  assert.equal(r.status, 200, r.text); assert.equal(r.body.pano.id, "nearer");
  s.env.PANO_PUBLIC = "1";
  assert.equal((await c("GET", "?spot=gorleston-south-pier")).status, 200, "public once switched on");
  assert.doesNotMatch(r.text, /MLY/, "the token never reaches the phone");
  assert.equal(calls.calls.length, 1);
});
