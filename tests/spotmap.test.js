// The UK spot map for the virtual 3D game (src/lib/spotMap.js): every documented mark on the map with the fields the
// map needs worked out from the mark itself (no second copy), honest scene states, marker clustering that expands
// when you zoom in, search and filters, and favourites and recent spots kept on this phone.
import test from "node:test";
import assert from "node:assert/strict";
import { SPOTS, spotById } from "../src/data/spots.js";
import { speciesById } from "../src/data/species.js";
import { SCENE_CHECKS } from "../src/data/scenes.js";
import { parsePlay, parsePlayMap } from "../src/lib/playRoute.js";
import { mapSpots, mapSpotById, TYPES, SCENES, typeOf, filterSpots, matchedOn, randomSpot, clusterSpots, expandZoom, clusterType, toPixel, CLUSTER, favsOf, toggleFav, loadRecent, addRecent, firstSpecies, fishHereLink } from "../src/lib/spotMap.js";

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test("every documented mark is on the map, read from the marks themselves, with a kind, a region and its 3D scene", () => {
  const all = mapSpots();
  assert.equal(all.length, SPOTS.length);
  for (const s of all) {
    const src = spotById(s.id);
    assert.equal(s.lat, src.lat); assert.equal(s.lon, src.lon); assert.equal(s.region, src.region); assert.equal(s.name, src.name);
    assert.ok(TYPES[s.type], `${s.id}: a known kind (${s.subtype})`);
    assert.ok(SCENES[s.scene], `${s.id}: a scene state`);
    assert.ok(["pier", "beach", "estuary", "river", "lake"].includes(s.venue));
    assert.ok(s.species.every((x) => speciesById(x.id)), `${s.id}: only species FishDock has`);
    assert.deepEqual(s.sources, src.sources, "the mark's own sources");
    assert.equal(s.preview, null, "no photo stored: one is looked up, credited, when the card opens");
  }
  // the kinds the map shows: the brief's six, plus rock marks (never called something they aren't)
  const kinds = new Set(all.map((s) => s.type));
  for (const k of ["pier", "beach", "harbour", "river", "lake", "estuary"]) assert.ok(kinds.has(k), k);
  assert.equal(typeOf({ subtype: "breakwater" }), "harbour"); assert.equal(typeOf({ subtype: "reservoir" }), "lake"); assert.equal(typeOf({ subtype: "rocks" }), "rocks");
  assert.equal(mapSpotById("not-a-mark"), null);
});

test("scene states are only what the checks found: exact needs a passed check at an accurate position", () => {
  for (const [id, c] of Object.entries(SCENE_CHECKS)) {
    const s = mapSpotById(id);
    assert.ok(s, `${id} is a documented mark`);
    assert.ok(c.sources.length && c.verification && c.checked, `${id}: sources, verification, date`);
    if (c.result === "failed") { assert.equal(s.scene, "representative"); assert.deepEqual(s.points, []); }
    else if (c.approx) assert.equal(s.scene, "reconstructed", `${id}: approximate, so not exact`);
    else { assert.equal(s.scene, "exact"); assert.equal(s.points.length, 4, `${id}: four checked positions`); assert.equal(s.facing, c.points[0].face); }
  }
  // a mark nobody has checked ahead of time is reconstructed when you arrive (Beta), never claimed as exact
  const unchecked = mapSpots().filter((s) => !SCENE_CHECKS[s.id]);
  assert.ok(unchecked.length > 50);
  assert.ok(unchecked.every((s) => s.scene === "reconstructed" && s.status === "beta" && s.points.length === 0));
  assert.equal(mapSpotById("gorleston-south-pier").scene, "exact");
  assert.equal(mapSpotById("chesil-beach-ferry-bridge").scene, "representative");
  assert.equal(mapSpotById("rutland-water").scene, "reconstructed");
  for (const v of Object.values(SCENES)) assert.doesNotMatch(v.label + v.note, /—/, "no em dashes in what users see");
});

test("clustering: close spots join when zoomed out and split as you zoom in; every spot is in exactly one group", () => {
  const all = mapSpots();
  for (const z of [4, 5, 6, 7, 8, 9, 10, 11, 12, 14]) {
    const groups = clusterSpots(all, z), ids = groups.flatMap((g) => g.spots.map((s) => s.id));
    assert.equal(ids.length, all.length, `zoom ${z}: every spot once`);
    assert.equal(new Set(ids).size, all.length);
    for (const g of groups) { const [[s, w], [n, e]] = g.bounds; assert.ok(g.lat >= s && g.lat <= n && g.lon >= w && g.lon <= e); }
  }
  const at5 = clusterSpots(all, 5).length, at9 = clusterSpots(all, 9).length;
  assert.ok(at5 < all.length / 2, `zoomed out: ${at5} groups for ${all.length} spots`);
  assert.ok(at9 > at5, "more, smaller groups further in");
  assert.equal(clusterSpots(all, CLUSTER.maxZoom + 1).length, all.length, "past the clustering zoom every spot stands alone");
  // the two Newhaven breakwater marks are 2 km apart: one group at zoom 6, and tapping it zooms to where it splits
  const sussex = all.filter((s) => ["newhaven-west-breakwater", "seaford-bay-newhaven-east-arm"].includes(s.id));
  const g = clusterSpots(sussex, 6);
  assert.equal(g.length, 1);
  const z = expandZoom(g[0], 6);
  assert.ok(z > 6 && z <= CLUSTER.maxZoom + 1);
  assert.ok(clusterSpots(sussex, z).length > 1, `splits at zoom ${z}`);
  assert.ok(clusterSpots(sussex, z - 1).length === 1, "and not before");
  assert.equal(clusterType([{ type: "pier" }, { type: "pier" }, { type: "pier" }, { type: "beach" }]), "pier", "mostly piers");
  assert.equal(clusterType(all), "mixed");
  // pixels: the same as the tiles (zoom 0 is 256 px across, the equator in the middle)
  assert.deepEqual(toPixel(0, 0, 0).map(Math.round), [128, 128]);
});

test("search by name, region or fish, filters by kind and scene, and a random spot", () => {
  const all = mapSpots();
  assert.ok(filterSpots(all, { q: "deal" }).some((s) => s.id === "deal-pier"));
  const norfolk = filterSpots(all, { q: "norfolk" });
  assert.ok(norfolk.length >= 3 && norfolk.every((s) => /norfolk/i.test(s.region)));
  const barbel = filterSpots(all, { q: "barbel" });
  assert.ok(barbel.length && barbel.every((s) => s.species.some((x) => /barbel/i.test(x.name))));
  assert.equal(matchedOn(barbel[0], "barbel"), "Barbel");
  assert.ok(filterSpots(all, { q: "llyn" }).some((s) => s.id === "aberdaron-beach"), "Llŷn without the accent");
  assert.ok(filterSpots(all, { q: "kent pier" }).every((s) => /kent/i.test(s.region) && s.type === "pier"));
  const piers = filterSpots(all, { types: ["pier"] });
  assert.ok(piers.length && piers.every((s) => s.type === "pier"));
  const both = filterSpots(all, { types: ["pier", "harbour"], scenes: ["exact"] });
  assert.ok(both.length >= 5 && both.every((s) => ["pier", "harbour"].includes(s.type) && s.scene === "exact"));
  assert.ok(filterSpots(all, { scenes: ["representative"] }).every((s) => s.scene === "representative"));
  assert.deepEqual(filterSpots(all, { favs: [] }), []);
  assert.deepEqual(filterSpots(all, { q: "nowhere at all" }), []);
  assert.equal(randomSpot(all, 0).id, all[0].id);
  assert.notEqual(randomSpot(all, 0, all[0].id).id, all[0].id, "never the same spot twice running");
  assert.equal(randomSpot([], 0.5), null);
});

test("favourites and recent spots: only documented marks, kept on this phone, newest first", () => {
  const st = memory();
  // favourites are the app's own favourite marks (the same star as Explore's)
  assert.deepEqual(favsOf({ favourites: ["deal-pier", "not-a-mark", 3] }), ["deal-pier"]);
  assert.deepEqual(favsOf({}), []);
  assert.deepEqual(favsOf(null), []);
  assert.deepEqual(toggleFav([], "deal-pier"), ["deal-pier"]);
  assert.deepEqual(toggleFav(["deal-pier"], "cromer-pier"), ["cromer-pier", "deal-pier"]);
  assert.deepEqual(toggleFav(["cromer-pier", "deal-pier"], "deal-pier"), ["cromer-pier"]);
  assert.deepEqual(toggleFav([], "not-a-mark"), [], "only documented marks");
  for (const id of ["deal-pier", "cromer-pier", "deal-pier", "not-a-mark"]) addRecent(id, st);
  assert.deepEqual(loadRecent(st), ["deal-pier", "cromer-pier"]);
  for (const s of mapSpots().slice(0, 12)) addRecent(s.id, st);
  assert.equal(loadRecent(st).length, 8, "the last eight");
  st.setItem("fishdock.mapRecent.v1", "not json"); assert.deepEqual(loadRecent(st), []);
  assert.deepEqual(loadRecent({ getItem() { throw new Error("blocked"); } }), [], "storage blocked: nothing, no error");
});

test("Fish here opens the game at that spot: a random fish each cast unless one's chosen, and the chosen position", () => {
  const deal = mapSpotById("deal-pier"), wye = mapSpotById("river-wye-ross");
  assert.equal(fishHereLink(deal, null), "#play/deal-pier");
  assert.equal(fishHereLink(deal, null, 3), "#play/deal-pier/p3");
  assert.equal(fishHereLink(deal, "mackerel", 3), "#play/deal-pier/mackerel/p3");
  assert.equal(fishHereLink(deal, "perch"), "#play/deal-pier", "a fish the game can't put there isn't asked for");
  assert.equal(firstSpecies(deal, "perch"), "whiting", "no freshwater fish off a pier");
  assert.equal(speciesById(firstSpecies(wye)).type === "sea", false);
  // the links are ones the app's own route reads (App.jsx, src/lib/playRoute.js)
  assert.deepEqual(parsePlay(fishHereLink(deal, "mackerel", 2)), { place: "deal-pier", species: "mackerel", fish: true, view3d: true, point: 2 });
  assert.deepEqual(parsePlay(fishHereLink(deal, null, 2)), { place: "deal-pier", species: null, fish: false, view3d: true, point: 2 });
  assert.deepEqual(parsePlay("#play"), { place: null, species: null, fish: false, view3d: true, point: null });
  assert.equal(parsePlay("#play/map"), null, "the map isn't a place"); assert.equal(parsePlay("#play/map/deal-pier"), null);
  assert.deepEqual(parsePlayMap("#play/map/deal-pier"), { spot: "deal-pier" }); assert.deepEqual(parsePlayMap("#play/map"), { spot: null });
  assert.equal(parsePlayMap("#play/deal-pier"), null);
});
