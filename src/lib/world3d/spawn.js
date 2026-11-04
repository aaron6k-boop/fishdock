// ---- spawn: where your angler arrives in a 3D place (pure, no three.js; world.js and tests) ----
// Every fishing position is checked against the place's own ground (realPlace.js for a real place, environment.js
// for a drawn one) before anyone is put there: on open ground, never in the water, inside a wall, a railing, a
// building or a prop, never below the ground, with room to stand and open water in front. A position that fails is
// replaced by the nearest one that passes (along the same edge first); one with no safe replacement is dropped, and
// someone asking for it gets the next safe position instead. Headings are as spots.js: 0 is -z, positive turns to +x.

import { dirOf } from "./spots.js";
import { LAYOUT_CHECK } from "./osmPlace.js";

export const SPAWN = {
  room: 0.4,        // clear ground either side of the angler (m)
  behind: 0.6,      // and behind them, where the chair and tackle go
  propGap: 0.9,     // how close a bench, lamp, bollard or lifebuoy may be
  others: 2.4,      // how close another angler may be
  floor: 0.05,      // how far below the ground counts as below it
  waterAhead: { river: [6, 10], other: LAYOUT_CHECK.waterAhead },
  // where to look for a replacement: along the edge either way, and a little further back from it
  along: [1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 9, -9, 12, -12, 16, -16, 20, -20],
  back: [0, 1, 2, 3.5],
};

const ok3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);

/** The spot stood on the ground: raised to the ground's height where it would be below it (never lowered). */
export function settle(spot, ground) {
  if (!ground || !ok3(spot?.at)) return spot;
  const [x, y, z] = spot.at, h = ground.heightAt(x, z);
  return Number.isFinite(h) && y < h ? { ...spot, at: [x, h, z] } : spot;
}

/** What's wrong with arriving at this spot, or null when it's safe. taken: [x, z] where other anglers stand. */
export function spawnProblem(spot, ground, { venue = "pier", taken = [] } = {}) {
  if (!spot || !ok3(spot.at) || !Number.isFinite(spot.face)) return "no position";
  if (!ground) return null; // a 360° photo: everyone stands where it was taken
  const [x, y, z] = spot.at, f = dirOf(spot.face), r = dirOf(spot.face + Math.PI / 2);
  const at = (fw, rt) => [x + f[0] * fw + r[0] * rt, z + f[1] * fw + r[1] * rt];
  const h = ground.heightAt(x, z);
  if (!ground.walkable(x, z)) return h > SPAWN.floor ? "inside a wall, railing or building" : "in the water";
  if (!(h > SPAWN.floor)) return "in the water";
  if (y < h - SPAWN.floor) return "below the ground";
  // room to stand and set up: either side and behind are open ground too
  for (const [fw, rt] of [[0, -SPAWN.room], [0, SPAWN.room], [-SPAWN.behind, 0]]) { const q = at(fw, rt); if (!ground.walkable(q[0], q[1])) return "pressed against a wall or railing"; }
  // nothing in the way: the place's benches, lamps, bollards and lifebuoys, round the angler and where the rod swings
  const props = ground.props || [];
  for (const q of [[x, z], at(0.7, 0)]) if (props.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < SPAWN.propGap)) return "a bench, lamp or bollard in the way";
  // open water in front, as far as the layout check looks
  for (const m of SPAWN.waterAhead[venue === "river" ? "river" : "other"]) { const q = at(m, 0); if (ground.walkable(q[0], q[1]) || ground.heightAt(q[0], q[1]) > SPAWN.floor) return "no open water in front"; }
  if (taken.some((t) => Math.hypot(t[0] - x, t[1] - z) < SPAWN.others)) return "someone is already there";
  return null;
}

/** The nearest safe position to a blocked spot: along its edge either way, then a little further back; or null. */
export function findNear(spot, ground, opts = {}) {
  if (!ground || !ok3(spot?.at) || !Number.isFinite(spot.face)) return null;
  const [x, , z] = spot.at, f = dirOf(spot.face), r = dirOf(spot.face + Math.PI / 2);
  for (const a of [0, ...SPAWN.along]) {
    for (const b of SPAWN.back) {
      const qx = x + r[0] * a - f[0] * b, qz = z + r[1] * a - f[1] * b;
      // where the ground says you could fish from here (facing its nearest water's edge), or the spot's own heading
      const edge = ground.fishHere?.(qx, qz);
      for (const c of edge ? [{ ...spot, at: edge.at, face: edge.face, edge: edge.edge }, { ...spot, at: [qx, spot.at[1], qz] }] : [{ ...spot, at: [qx, spot.at[1], qz] }]) {
        const s = settle(c, ground);
        if (!spawnProblem(s, ground, opts)) return s;
      }
    }
  }
  return null;
}

/**
 * Check every fishing position of a place before anyone arrives. Returns { spots, report }: the safe positions (a
 * blocked one replaced by the nearest safe one, keeping its id and name; one with no safe replacement left out) and,
 * for each original, { id, name, problem, moved }.
 */
export function safeSpots(spots, ground, { venue = "pier" } = {}) {
  const out = [], report = [];
  for (const sp of spots || []) {
    const taken = out.map((s) => [s.at[0], s.at[2]]);
    const s = settle(sp, ground), problem = spawnProblem(s, ground, { venue, taken });
    if (!problem) { out.push(s); report.push({ id: sp.id, name: sp.name, problem: null, moved: false }); continue; }
    const near = findNear(s, ground, { venue, taken });
    if (near) out.push({ ...near, movedBy: Math.round(Math.hypot(near.at[0] - sp.at[0], near.at[2] - sp.at[2]) * 10) / 10 });
    report.push({ id: sp.id, name: sp.name, problem, moved: !!near });
  }
  return { spots: out, report };
}

/** The spot for an angler who asked for `id`: that one when it's safe, otherwise the first safe one nobody has. */
export function spawnFor(spots, id, takenIds = []) {
  return spots.find((s) => s.id === id) || spots.find((s) => !takenIds.includes(s.id)) || spots[0] || null;
}
