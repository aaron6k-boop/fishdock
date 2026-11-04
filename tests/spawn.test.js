// Arriving in a 3D place (src/lib/world3d/spawn.js): every fishing position is checked against the place's ground
// before an angler is put there, a blocked one moves to the nearest safe place, and the camera faces the water.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeSpots, spawnProblem, settle, findNear, spawnFor } from "../src/lib/world3d/spawn.js";
import { LAYOUTS, drawnGround, dirOf } from "../src/lib/world3d/spots.js";
import { buildPlace, inside, GROUND } from "../src/lib/world3d/osmPlace.js";

const osm = JSON.parse(readFileSync(new URL("./fixtures/osm-gorleston.json", import.meta.url)));
const VENUES = Object.keys(LAYOUTS);
const ahead = (s, m) => [s.at[0] + dirOf(s.face)[0] * m, s.at[2] + dirOf(s.face)[1] * m];

// ---- a ground from a real place's map outlines, as realPlace.js makes it (without three.js) ----
// Land, pier decks and jetties are ground; water isn't; nobody stands within 45 cm of a wall's edge (the railing) or
// inside a building; benches and bollards are props.
function mapGround(place, { props = [] } = {}) {
  const land = place.land || [], water = place.water || [], decks = (place.piers || []).filter((p) => p.ring), lines = (place.piers || []).filter((p) => p.line);
  const seg = (q, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2)); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t); };
  const jetty = (q) => lines.find((p) => p.line.some((a, k) => k < p.line.length - 1 && seg(q, a, p.line[k + 1]) < p.width / 2 - 0.45));
  const landAt = (q) => (land.some((r) => inside(q, r)) || decks.some((p) => inside(q, p.ring))) && !water.some((r) => inside(q, r));
  const nearEdge = (q) => (place.edges || []).some((e) => seg(q, [e[0], e[1]], [e[2], e[3]]) < 0.45);
  const built = (q) => (place.buildings || []).some((b) => inside(q, b.ring));
  const heightAt = (x, z) => { const q = [x, z], j = jetty(q); if (j) return j.h; const d = decks.find((p) => inside(q, p.ring)); if (d) return d.h; return landAt(q) ? GROUND.land : 0; };
  return { heightAt, props, walkable: (x, z) => !!jetty([x, z]) || (landAt([x, z]) && !nearEdge([x, z]) && !built([x, z])) };
}

test("the drawn places: all four fishing positions of every kind of place pass the arrival check, facing open water", () => {
  for (const venue of VENUES) {
    const ground = drawnGround(venue), { spots, report } = safeSpots(LAYOUTS[venue].spots, ground, { venue });
    assert.equal(spots.length, 4, `${venue}: four safe positions`);
    assert.deepEqual(report.filter((r) => r.problem), [], `${venue}: none blocked`);
    for (const s of spots) {
      assert.ok(ground.walkable(s.at[0], s.at[2]), `${venue} ${s.name}: on open ground`);
      assert.ok(s.at[1] >= ground.heightAt(s.at[0], s.at[2]), `${venue} ${s.name}: not below the ground`);
      const w = ahead(s, 12);
      assert.equal(ground.walkable(...w), false, `${venue} ${s.name}: water in front`);
      assert.equal(ground.heightAt(...w), 0, `${venue} ${s.name}: at water level in front`);
    }
  }
});

test("never in the water, a railing, a building or a prop, never below the ground, never facing the land", () => {
  const ground = drawnGround("pier"), base = LAYOUTS.pier.spots[0]; // the left side of the drawn pier, facing west
  assert.equal(spawnProblem(base, ground, { venue: "pier" }), null);
  assert.equal(spawnProblem({ ...base, at: [-12, 4.2, -10] }, ground), "in the water");
  assert.equal(spawnProblem({ ...base, at: [-4.3, 4.2, -10] }, ground), "inside a wall, railing or building", "in the railing");
  assert.equal(spawnProblem({ ...base, at: [-3.6, 1, -10] }, ground), "below the ground");
  assert.deepEqual(settle({ ...base, at: [-3.6, 1, -10] }, ground).at, [-3.6, 4.2, -10], "settled onto the deck");
  assert.equal(spawnProblem({ ...base, face: Math.PI }, ground), "no open water in front", "facing back along the pier");
  assert.equal(spawnProblem(base, { ...ground, props: [[-3.4, -10.2]] }), "a bench, lamp or bollard in the way");
  assert.equal(spawnProblem(base, ground, { taken: [[-3.6, -11]] }), "someone is already there");
  assert.equal(spawnProblem({ ...base, at: [NaN, 4.2, 0] }, ground), "no position");
  // a building on the bank: walkable says no, and the ground there is land, not water
  const shed = { ...drawnGround("river"), walkable: (x, z) => drawnGround("river").walkable(x, z) && !(Math.abs(x + 6) < 2 && z < 5) };
  assert.equal(spawnProblem(LAYOUTS.river.spots[0], shed, { venue: "river" }), "inside a wall, railing or building");
});

test("a blocked position moves to the nearest safe one along the same edge, keeping its name; nowhere safe drops it", () => {
  const ground = drawnGround("pier"), spots = LAYOUTS.pier.spots.map((s) => ({ ...s }));
  // a lifebuoy station put where the first spot stands
  const withProp = { ...ground, props: [[spots[0].at[0], spots[0].at[2]]] };
  const { spots: safe, report } = safeSpots(spots, withProp, { venue: "pier" });
  assert.equal(safe.length, 4);
  const moved = safe.find((s) => s.id === 1);
  assert.equal(moved.name, spots[0].name);
  assert.ok(moved.movedBy > 0 && moved.movedBy <= 3, `moved ${moved.movedBy} m`);
  assert.equal(spawnProblem(moved, withProp, { venue: "pier" }), null, "the new position passes the check");
  assert.deepEqual(report.find((r) => r.id === 1), { id: 1, name: spots[0].name, problem: "a bench, lamp or bollard in the way", moved: true });
  // the whole left rail blocked: the left-side spots can't stay there, and never end up in the water or the railing
  const noLeft = { ...ground, walkable: (x, z) => ground.walkable(x, z) && x > -1 };
  const r2 = safeSpots(spots, noLeft, { venue: "pier" });
  for (const s of r2.spots) assert.equal(spawnProblem(s, noLeft, { venue: "pier" }), null, `${s.name} is safe`);
  // a place with no safe ground at all: nothing is offered (World3D then shows the drawn place instead)
  const sea = { walkable: () => false, heightAt: () => 0 };
  assert.deepEqual(safeSpots(spots, sea).spots, []);
  assert.equal(findNear(spots[0], sea), null);
});

test("several fishing positions: the one you picked when it's safe, otherwise the first safe one nobody else has", () => {
  const { spots } = safeSpots(LAYOUTS.lake.spots, drawnGround("lake"), { venue: "lake" });
  assert.equal(spawnFor(spots, 3).id, 3, "your choice");
  const without3 = spots.filter((s) => s.id !== 3);
  assert.equal(spawnFor(without3, 3, [1]).id, 2, "3 was blocked and 1 is taken by a friend");
  assert.equal(spawnFor(without3, 3, []).id, 1, "3 was blocked: the best (first) one");
  assert.equal(spawnFor([], 1), null);
});

test("real Gorleston from OpenStreetMap: every position checked against the map's land, walls and buildings, facing the sea", () => {
  const place = buildPlace(osm, 52.5721, 1.7383, "pier");
  const ground = mapGround(place);
  const { spots, report } = safeSpots(place.spots, ground, { venue: "pier" });
  assert.equal(spots.length, 4, JSON.stringify(report));
  for (const s of spots) {
    assert.equal(spawnProblem(s, ground, { venue: "pier" }), null, `${s.name}`);
    assert.ok(Math.hypot(s.at[0], s.at[2]) < 120, `${s.name} near the mark`);
    assert.equal(ground.walkable(...ahead(s, 20)), false, `${s.name} faces the water`);
  }
  // a bench put on the first position: the angler arrives beside it instead, still at the water's edge facing out
  const s1 = place.spots[0], bench = mapGround(place, { props: [[s1.at[0], s1.at[2]]] });
  const r2 = safeSpots(place.spots, bench, { venue: "pier" }), m = r2.spots.find((s) => s.id === s1.id);
  assert.ok(m && m.movedBy > 0 && m.movedBy < 25, `moved ${m?.movedBy} m`);
  assert.equal(spawnProblem(m, bench, { venue: "pier" }), null);
});
