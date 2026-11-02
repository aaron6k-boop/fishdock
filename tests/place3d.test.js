// The real place for the 3D view: OpenStreetMap data round a documented mark turned into land, water, piers,
// buildings and fishing spots (src/lib/world3d/osmPlace.js, checked on real Gorleston data), the route that fetches
// it (server/place3d.js) and the 360° photo route (server/pano.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlace, unrle, landFromCoast, GROUND, checkLayout } from "../src/lib/world3d/osmPlace.js";
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
  assert.deepEqual(L.check, { ok: true, why: [] }, "real Gorleston passes the layout check");
});

test("the layout check: anglers away from the mark, or looking at land or across a pier, mean the drawn place is used", () => {
  const water = (q) => q[1] < 0; // water to the north (z < 0)
  const spot = (name, x, z, face) => ({ name, at: [x, 2.2, z], face });
  const good = { piers: [], spots: [spot("a", 0, 1, 0), spot("b", 10, 1, 0), spot("c", -10, 1, 0), spot("d", 20, 1, 0)] };
  assert.deepEqual(checkLayout(good, water), { ok: true, why: [] });
  const far = { piers: [], spots: good.spots.map((s) => ({ ...s, at: [s.at[0], 2.2, 300] })) };
  assert.equal(checkLayout(far, (q) => q[1] < 290).ok, false, "300 m from the mark");
  assert.match(checkLayout(far, (q) => q[1] < 290).why[0], /300 m from the mark/);
  const inland = { piers: [], spots: good.spots.map((s) => ({ ...s, face: Math.PI })) };
  assert.match(checkLayout(inland, water).why[0], /no open water ahead/, "facing inland");
  const pier = { piers: [{ line: [[-50, -18], [50, -18]], width: 8 }], spots: good.spots };
  assert.match(checkLayout(pier, water).why[0], /no open water ahead/, "a pier deck straight ahead");
  assert.equal(checkLayout({ piers: [], spots: good.spots.slice(0, 3) }, water).ok, false, "fewer than four spots");
  const shed = { piers: [], buildings: [{ ring: [[-3, 3], [3, 3], [3, 9], [-3, 9]], h: 3 }], spots: good.spots };
  assert.match(checkLayout(shed, water).why[0], /a building in the way/, "a building just behind an angler");
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
  { const off = await c("GET", "?spot=gorleston-south-pier"); assert.equal(off.status, 200); assert.equal(off.body.pano, null); assert.equal(off.body.off, "not_configured"); }
  const im = (id, lon, lat, pano = true) => ({ id, is_pano: pano, thumb_2048_url: `https://scontent.example/${id}.jpg`, computed_compass_angle: 95, computed_geometry: { type: "Point", coordinates: [lon, lat] }, captured_at: 1693526400000, creator: { username: "pierphotos" } });
  const answer = { data: [im("far", 1.7383, 52.575), im("flat", 1.7384, 52.5721, false), im("near", 1.7385, 52.5722), im("nearer", 1.7383, 52.57211)] };
  const NOW = Date.parse("2026-11-01");
  const p = pickPano(answer, 52.5721, 1.7383, NOW);
  assert.equal(p.id, "nearer"); assert.equal(p.heading, 95); assert.equal(p.author, "pierphotos"); assert.equal(p.licence, "CC BY-SA 4.0"); assert.match(p.page, /mapillary\.com/); assert.equal(p.profile, "https://www.mapillary.com/profile/pierphotos");
  assert.equal(p.suitable, true); assert.deepEqual(p.problems, []);
  // the checks: too far, an uncorrected position or direction, too old, no date
  const bad = (over) => pickPano({ data: [{ ...im("x", 1.7383, 52.57211), ...over }] }, 52.5721, 1.7383, NOW);
  assert.match(bad({ computed_geometry: { type: "Point", coordinates: [1.7383, 52.5728] } }).problems.join(), /m from the mark/);
  assert.match(bad({ computed_geometry: null, geometry: { type: "Point", coordinates: [1.7383, 52.57211] } }).problems.join(), /position not corrected/);
  assert.match(bad({ computed_compass_angle: null, compass_angle: 80 }).problems.join(), /direction not corrected/);
  assert.match(bad({ captured_at: Date.parse("2014-06-01") }).problems.join(), /years ago/);
  assert.equal(bad({ captured_at: null }).suitable, false);
  // a suitable photo is preferred over a nearer one that fails a check
  const mix = pickPano({ data: [{ ...im("old", 1.7383, 52.57210), captured_at: Date.parse("2012-01-01") }, im("good", 1.7385, 52.5722)] }, 52.5721, 1.7383, NOW);
  assert.equal(mix.id, "good");
  assert.equal(pickPano({ data: [im("far", 1.7383, 52.58)] }, 52.5721, 1.7383), null);
  s.env.MAPILLARY_TOKEN = "MLY|test";
  const calls = stubFetch(t, [[/graph\.mapillary\.com\/images\?access_token=MLY%7Ctest&.*is_pano=true/, () => answer]]);
  { const hid = await c("GET", "?spot=gorleston-south-pier"); assert.equal(hid.body.pano, null, "hidden until PANO_PUBLIC is set"); assert.equal(hid.body.off, "not_public"); }
  const r = await c("GET", "?spot=gorleston-south-pier&preview=1");
  assert.equal(r.status, 200, r.text); assert.equal(r.body.pano.id, "nearer");
  s.env.PANO_PUBLIC = "1";
  assert.equal((await c("GET", "?spot=gorleston-south-pier")).status, 200, "public once switched on");
  assert.doesNotMatch(r.text, /MLY/, "the token never reaches the phone");
  assert.equal(calls.calls.length, 1);
});

// ---- small made-up maps for the spot rules (metres from the mark turned into latitude and longitude) ----
const LAT = 52, LON = -1, mLat = 1 / 111320, mLon = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
function mapOf(ways) {
  const elements = []; let id = 1;
  for (const w of ways) {
    const refs = w.pts.map(([x, z]) => { elements.push({ type: "node", id, lat: LAT - z * mLat, lon: LON + x * mLon }); return id++; });
    if (w.closed) refs.push(refs[0]);
    elements.push({ type: "way", id: id++, nodes: refs, tags: w.tags });
  }
  return { elements };
}
const ok = (L) => assert.deepEqual(L.check, { ok: true, why: [] }, JSON.stringify(L.check));
const standsOn = (L, x0, x1, z0, z1) => L.spots.every((s) => s.at[0] >= x0 && s.at[0] <= x1 && s.at[2] >= z0 && s.at[2] <= z1);

test("a river drawn only as its centre line becomes water, and anglers stand on its bank facing it", () => {
  // the river runs east-west 40 m north of the mark, 20 m wide
  const L = buildPlace(mapOf([{ pts: [[-400, -40], [400, -40]], tags: { waterway: "river" } }]), LAT, LON, "river");
  ok(L);
  for (const s of L.spots) { assert.ok(s.at[2] > -30 && s.at[2] < -20, `${s.name} on the south bank (z ${s.at[2]})`); assert.ok(Math.abs(s.face) < 0.3, `${s.name} faces north, over the river`); }
});

test("a pier drawn as an outline: anglers on its deck facing out, never in front of a building on it", () => {
  // the sea to the north of a coastline at z = 60; a pier 10 m wide out to z = -100 with a pavilion on its head
  const coast = { pts: [[600, 60], [-600, 60]], tags: { natural: "coastline" } }; // land on the left (south)
  const pier = { pts: [[-5, 60], [5, 60], [5, -100], [-5, -100]], closed: true, tags: { man_made: "pier" } };
  const pavilion = { pts: [[-5, -100], [5, -100], [5, -70], [-5, -70]], closed: true, tags: { building: "yes" } };
  const L = buildPlace(mapOf([coast, pier, pavilion]), LAT, LON, "pier");
  ok(L);
  assert.ok(standsOn(L, -5, 5, -100, 60), "all on the pier");
  for (const s of L.spots) assert.ok(!(s.at[2] < -60), `${s.name} isn't up against the pavilion (z ${s.at[2]})`);
  assert.ok(L.spots.every((s) => s.at[1] === 4.2), "standing on the deck, not sunk into it");
});

test("a mark whose position is approximate may use the nearest bank within 400 m; an accurate one may not", () => {
  const lake = { pts: [[-600, -250], [600, -250], [600, -900], [-600, -900]], closed: true, tags: { natural: "water" } };
  const exact = buildPlace(mapOf([lake]), LAT, LON, "lake");
  assert.equal(exact.check.ok, false, "250 m away is too far for a mark said to be exact");
  const approx = buildPlace(mapOf([lake]), LAT, LON, "lake", { approx: true });
  ok(approx); assert.equal(approx.approx, true);
});
