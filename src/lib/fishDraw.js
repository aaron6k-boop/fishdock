// ---- fishDraw: which fish takes the bait in the game, and how big it is ----
// The kinds FishDock's sources list for the place you're fishing (src/data/spots.js) are four times as likely as the
// others the game has for that water, so each place fishes differently. The length: around that kind's usual size in
// the game (DRAW_CM), most a little either side, a few big ones, and now and then (one bite in twenty-five) an unusually
// big fish. Game fish only: these odds are the game's, not a survey of what's caught there.
import { DRAW_CM } from "./liveEvents.js";

export const DRAW = { listed: 4, spread: 0.16, bigChance: 0.04, bigFrom: 1.25, bigTo: 1.55, maxOver: 2.2 };

/** A standard normal number from two uniform ones. */
function normal(rnd) { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** The fish on the line: { species, lengthCm, big }. list: the game's fish for this water ({ id }); placeSpecies: the place's documented kinds ({ id }). */
export function drawFish(list, placeSpecies = [], rnd = Math.random) {
  if (!list?.length) return null;
  const listed = new Set((placeSpecies || []).map((s) => s.id));
  const w = list.map((f) => (listed.has(f.id) ? DRAW.listed : 1)), sum = w.reduce((a, b) => a + b, 0);
  let x = rnd() * sum, i = 0; while (i < list.length - 1 && x >= w[i]) { x -= w[i]; i++; }
  const id = list[i].id, usual = DRAW_CM[id] || 40;
  let r = Math.exp(DRAW.spread * normal(rnd)); const big = rnd() < DRAW.bigChance;
  if (big) r = Math.max(r, 1) * (DRAW.bigFrom + rnd() * (DRAW.bigTo - DRAW.bigFrom));
  return { species: id, lengthCm: Math.max(10, Math.min(150, Math.round(usual * r), Math.round(usual * DRAW.maxOver))), big };
}
