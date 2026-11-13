// ---- spotMap: FishDock's documented marks as map spots for the virtual 3D game (pure; the map and tests) ----
// Nothing here is a second copy of the marks: every map spot is read from src/data/spots.js (name, position, region,
// species, sources) with what the map needs worked out from it, plus what the 3D place check found ahead of time
// (src/data/scenes.js). Also the marker clustering, search and filters, and favourites and recent spots (kept on this
// phone only).

import { SPOTS, spotById } from "../data/spots.js";
import { speciesById } from "../data/species.js";
import { sceneCheckFor } from "../data/scenes.js";
import { venueOf } from "./scene.js";

// ---- kinds of spot on the map, from the mark's own subtype ----
export const TYPES = {
  pier: { label: "Pier", plural: "Piers" },
  beach: { label: "Beach", plural: "Beaches" },
  harbour: { label: "Harbour", plural: "Harbours" },
  rocks: { label: "Rock mark", plural: "Rocks" },
  estuary: { label: "Estuary", plural: "Estuaries" },
  river: { label: "River", plural: "Rivers" },
  lake: { label: "Lake", plural: "Lakes" },
};
// a breakwater is a harbour's arm; a reservoir, fishery or canal is still or slow water fished like a lake or river
const TYPE_OF = { pier: "pier", beach: "beach", breakwater: "harbour", harbour: "harbour", rocks: "rocks", estuary: "estuary", river: "river", canal: "river", lake: "lake", reservoir: "lake", fishery: "lake" };
export const typeOf = (s) => TYPE_OF[s?.subtype] || (s?.kind === "sea" ? "beach" : s?.kind === "river" ? "river" : "lake");

// ---- what the 3D scene there is ----
// exact: the real layout from OpenStreetMap, checked ahead of time with four fishing positions at the mark.
// reconstructed: built from OpenStreetMap when you arrive and checked then (Beta); a failed check means the drawn place.
// representative: the check ahead of time found no layout to stand in, so a drawn place of the same kind.
export const SCENES = {
  exact: { label: "Exact mapped scene", short: "Exact mapped", note: "The real layout from OpenStreetMap map data, with four fishing positions checked by FishDock. How buildings look is a reconstruction." },
  reconstructed: { label: "Reconstructed from map data", short: "Beta", note: "Built from OpenStreetMap map data when you arrive, and checked then. If the check fails you get a representative scene instead, and the scene says so." },
  representative: { label: "Representative scene", short: "Representative", note: "A drawn place of the same kind, not this place's own layout: the map data here didn't pass FishDock's checks (somewhere safe to stand with a clear view of the water)." },
};
export function sceneOf(s) {
  const c = sceneCheckFor(s.id);
  if (c?.result === "failed") return "representative";
  if (c?.result === "passed" && !c.approx) return "exact";
  return "reconstructed";
}

const compass = (deg) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** The map's view of one documented mark. */
export function mapSpot(s) {
  const c = sceneCheckFor(s.id), scene = sceneOf(s), points = scene === "exact" || scene === "reconstructed" ? (c?.points || []) : [];
  const species = (s.species || []).filter((x) => speciesById(x.id)).map((x) => ({ id: x.id, name: x.name, level: x.level }));
  return {
    id: s.id, name: s.name, short: s.name.replace(/ \(.*\)$/, ""), lat: s.lat, lon: s.lon, approx: c?.result === "passed" ? c.approx : s.coordsVerified === false,
    type: typeOf(s), subtype: s.subtype, kind: s.kind, region: s.region, nation: s.nation,
    venue: venueOf(s), // the kind of 3D place it opens as (scene.js), the same the game itself uses
    scene, status: scene === "exact" ? "checked" : scene === "reconstructed" ? "beta" : "representative",
    species, best: s.best || null, access: s.access || null, safety: s.safety || null,
    // the fishing positions checked ahead of time (where there are some), and the way the first one faces
    points: points.map((p, i) => ({ id: i + 1, name: p.name, face: p.face, facing: compass(p.face) })),
    facing: points[0] ? points[0].face : null,
    preview: null, // a nearby photo is looked up when the card opens (Wikimedia Commons, credited), never stored here
    sources: s.sources || [], verification: s.verification, checked: c?.checked || null,
  };
}

let cache = null;
/** Every documented mark as a map spot (worked out once, then kept). */
export const mapSpots = () => (cache ||= SPOTS.map(mapSpot));
export const mapSpotById = (id) => (id ? mapSpots().find((m) => m.id === id) || null : null);

// ---- search and filters ----
const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Spots matching the words typed (name, region, nation or a species), the chosen types and scene states, and favourites. */
export function filterSpots(spots, { q = "", types = [], scenes = [], favs = null } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return spots.filter((s) => {
    if (types.length && !types.includes(s.type)) return false;
    if (scenes.length && !scenes.includes(s.scene)) return false;
    if (favs && !favs.includes(s.id)) return false;
    if (!words.length) return true;
    const hay = fold([s.name, s.region, s.nation, TYPES[s.type]?.label, ...s.species.map((x) => x.name)].join(" "));
    return words.every((w) => hay.includes(w));
  });
}
/** What matched, for the search results: the species when the words were a fish, otherwise the region. */
export function matchedOn(s, q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const sp = s.species.find((x) => words.some((w) => fold(x.name).includes(w)));
  return sp && !words.every((w) => fold(s.name).includes(w)) ? sp.name : null;
}

/** A random spot from the list (rnd: 0..1, for tests), never the one just shown when there's another. */
export function randomSpot(spots, rnd = Math.random(), not = null) {
  const pool = spots.length > 1 && not ? spots.filter((s) => s.id !== not) : spots;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))] : null;
}

// ---- clustering: spots close together on screen join into one marker, by a grid in map pixels ----
// Web Mercator, as the map tiles: at zoom z the world is 256 * 2^z pixels across.
export function toPixel(lat, lon, z) {
  const s = 256 * 2 ** z, sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}
export const CLUSTER = { cell: 64, maxZoom: 11 }; // past maxZoom every spot shows on its own

/**
 * Groups of spots for this zoom: [{ key, lat, lon, spots, bounds: [[s, w], [n, e]] }], every spot in exactly one.
 * Spots sharing a grid cell join; a lone spot is a group of one.
 */
export function clusterSpots(spots, z, { cell = CLUSTER.cell, maxZoom = CLUSTER.maxZoom } = {}) {
  if (z > maxZoom) return spots.map((s) => group([s], `s:${s.id}`));
  const cells = new Map();
  for (const s of spots) {
    const [x, y] = toPixel(s.lat, s.lon, z), k = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(s);
  }
  // groups either side of a cell's edge can land almost on top of each other: join any closer than most of a cell
  let groups = [...cells.entries()].map(([k, list]) => ({ k, list, p: centre(list, z) }));
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (Math.hypot(groups[i].p[0] - groups[j].p[0], groups[i].p[1] - groups[j].p[1]) < cell * 0.75) {
        const list = [...groups[i].list, ...groups[j].list];
        groups[i] = { k: groups[i].k, list, p: centre(list, z) }; groups.splice(j, 1); merged = true; break outer;
      }
    }
  }
  return groups.map(({ k, list }) => group(list, list.length === 1 ? `s:${list[0].id}` : `c:${z}:${k}`));
}
function centre(list, z) { const ps = list.map((s) => toPixel(s.lat, s.lon, z)); return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length]; }
function group(list, key) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity, la = 0, lo = 0;
  for (const p of list) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); la += p.lat; lo += p.lon; }
  return { key, lat: la / list.length, lon: lo / list.length, spots: list, bounds: [[s, w], [n, e]] };
}
/** The zoom at which a cluster first splits up (tapping it zooms there), at most one past CLUSTER.maxZoom. */
export function expandZoom(cluster, z, opts = {}) {
  const max = (opts.maxZoom ?? CLUSTER.maxZoom) + 1;
  for (let zz = Math.floor(z) + 1; zz <= max; zz++) if (clusterSpots(cluster.spots, zz, opts).length > 1) return zz;
  return max;
}
/** The type most of a cluster's spots share (for its colour), or "mixed". */
export function clusterType(spots) {
  const n = {}; for (const s of spots) n[s.type] = (n[s.type] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1]);
  return top.length === 1 || top[0][1] / spots.length >= 0.75 ? top[0][0] : "mixed";
}

// ---- favourites and recent spots: ids kept on this phone only ----
// Favourites are the app's own favourite marks (settings.favourites in store.js, the same star as in Explore), so
// there's one list, not two. Recent spots are the ones fished in the virtual game, newest first.
const RECENT_KEY = "fishdock.mapRecent.v1", RECENT_MAX = 8;
const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const readIds = (k, st = store()) => { try { const v = JSON.parse(st?.getItem(k) || "[]"); return Array.isArray(v) ? v.filter((id) => typeof id === "string" && spotById(id)) : []; } catch { return []; } };
const writeIds = (k, ids, st = store()) => { try { st?.setItem(k, JSON.stringify(ids)); } catch { /* storage full or blocked: kept for this visit only */ } };
/** The favourite marks from the app's settings: only documented ones. */
export const favsOf = (settings) => (Array.isArray(settings?.favourites) ? settings.favourites : []).filter((id) => typeof id === "string" && spotById(id));
/** The favourites with this mark added (newest first) or taken off. */
export const toggleFav = (favs, id) => (favs.includes(id) ? favs.filter((x) => x !== id) : spotById(id) ? [id, ...favs] : favs);
export const loadRecent = (st) => readIds(RECENT_KEY, st);
export function addRecent(id, st) { if (!spotById(id)) return loadRecent(st); const next = [id, ...loadRecent(st).filter((x) => x !== id)].slice(0, RECENT_MAX); writeIds(RECENT_KEY, next, st); return next; }

// ---- going fishing there ----
/** The species to fish for first at a spot: one it lists that the game can draw for this kind of water. */
export function firstSpecies(spot, chosen = null) {
  const ok = (id) => { const sp = speciesById(id); return sp && (spot.kind === "sea" ? sp.type !== "fresh" : sp.type !== "sea"); };
  if (chosen && ok(chosen)) return chosen;
  return spot.species.find((x) => ok(x.id))?.id || (spot.kind === "sea" ? "cod" : "perch");
}
/** The 3D game's link for a spot: #play/<spot>, with /<fish> when one's chosen (otherwise a random fish each cast) and
 * /p<n> for a chosen fishing position (src/lib/playRoute.js reads it). */
export const fishHereLink = (spot, species, point = null) => `#play/${spot.id}${species && firstSpecies(spot, species) === species ? `/${species}` : ""}${point ? `/p${point}` : ""}`;
