// The Live Fishing View's motion rules (src/lib/sceneActors.js): how each species fights, how hard it loads the rod,
// and the landing's timings, which the scene, the catch card and highlight clips all share.
import test from "node:test";
import assert from "node:assert/strict";
import { fightProfile, fishLoad, landingTimes, landingTech, fightSeconds } from "../src/lib/sceneActors.js";
import { DUR } from "../src/lib/liveEvents.js";
import { ART_IDS } from "../src/data/fishart.js";

test("every species with a FishDock picture has its own way of fighting", () => {
  const base = fightProfile("no-such-fish");
  for (const id of ART_IDS) {
    const p = fightProfile(id);
    assert.notDeepEqual(p, base, `${id} has no fight profile`);
    for (const k of ["pull", "tempo", "erratic", "splashy", "flex", "long"]) assert.ok(p[k] > 0 && p[k] < 3, `${id}.${k}`);
  }
  assert.equal(fightProfile("plaice").flat, true);
  assert.equal(fightProfile("conger").eel, true);
  assert.equal(fightProfile(undefined).pull, 1);
});

test("a bigger, stronger fish loads the rod more; a small whiting least", () => {
  const whiting = fishLoad("whiting", 30), cod = fishLoad("cod", 55), bigCod = fishLoad("cod", 90), tope = fishLoad("tope", 150);
  assert.ok(whiting < cod && cod < bigCod && bigCod <= tope, `${whiting} ${cod} ${bigCod} ${tope}`);
  assert.ok(whiting >= 0.45 && tope <= 1.7);
  // a logged weight is used when there is one
  assert.ok(fishLoad("cod", 55, 6) > fishLoad("cod", 55, 1));
});

test("fights in the demo: a whiting is quick, a cod takes longer, a tope longer still, all within limits", () => {
  const w = fightSeconds("whiting", 30), c = fightSeconds("cod", 55), t = fightSeconds("tope", 150);
  assert.ok(w < c && c < t, `${w} ${c} ${t}`);
  for (const id of ART_IDS) for (const cm of [10, 40, 120, 200]) { const s = fightSeconds(id, cm); assert.ok(s >= 4 && s <= 18, `${id} ${cm}: ${s}`); }
});

test("the landing's beats come in order and always finish within the landing phase, at every kind of place", () => {
  for (const venue of ["beach", "pier", "estuary", "river", "lake"]) {
    for (const id of [...ART_IDS, null]) {
      for (const cm of [8, 30, 55, 100, 200]) {
        const L = landingTimes(id, cm, null, venue);
        const order = [0, L.T1, L.T2, L.T3, L.T4, L.swingIn, L.card, L.end];
        for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `${venue} ${id} ${cm}: beat ${i}`);
        assert.ok(L.end * 1000 <= DUR.catch, `${venue} ${id} ${cm}: ends at ${L.end}s, after the landing phase`);
      }
    }
  }
  // the same way of landing takes a little longer for a heavier fish, never a lot
  assert.ok(landingTimes("cod", 90, null, "pier").end > landingTimes("cod", 50, null, "pier").end);
  assert.ok(landingTimes("cod", 90, null, "pier").end - landingTimes("cod", 50, null, "pier").end < 1.5);
});

test("each kind of place lands a fish its own way", () => {
  assert.equal(landingTech("whiting", 28, null, "pier"), "lift");
  assert.equal(landingTech("cod", 55, null, "pier"), "dropnet");
  assert.equal(landingTech("bass", 45, null, "beach"), "beach");
  assert.equal(landingTech("perch", 25, null, "river"), "net");
  assert.equal(landingTech("thick-lipped-mullet", 50, null, "estuary"), "net");
  assert.equal(landingTech("whiting", 25, null, "estuary"), "lift");
  // a logged weight counts as well as the length
  assert.equal(landingTech("cod", 40, 1.6, "pier"), "dropnet");
});
