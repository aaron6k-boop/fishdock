// How a fish moves in the 3D view (src/lib/fishMotion.js): no spinning, nothing under the mat, a release that's
// lowered and then swims away and down
import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyWave, turnToward, restHeight, surfaceSpine, releasePlan, releaseStep, swimAway } from "../src/lib/fishMotion.js";

test("the swimming wave: the tail sweeps further than the head, and a still fish only curls", () => {
  let head = 0, tail = 0;
  for (let t = 0; t < 2; t += 0.01) { head = Math.max(head, Math.abs(bodyWave(0.05, t))); tail = Math.max(tail, Math.abs(bodyWave(1, t))); }
  assert.ok(tail > head * 4, `tail ${tail} head ${head}`);
  assert.equal(bodyWave(0.5, 1.3, { beat: 0, curl: 0 }), 0);
  assert.ok(bodyWave(1, 0, { beat: 0, curl: 0.3 }) > 0.29);
});

test("turning: a fish turns at its own pace, the short way round, and never flips", () => {
  const a = turnToward(0, Math.PI * 0.9, 2, 0.1);
  assert.ok(Math.abs(a - 0.2) < 1e-9, "at most rate x dt in one step");
  // the short way round across the ±π seam
  const b = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 1, 0.1);
  assert.ok(Math.abs(Math.abs(b) - Math.PI) < 1e-9, `went the long way: ${b}`);
  assert.equal(turnToward(NaN, 1.2, 1, 0.1), 1.2);
});

test("lying on a mat: on its side the spine is half its thickness up; upright, its belly's depth", () => {
  assert.ok(Math.abs(restHeight(0.06, 0.035, Math.PI / 2) - 0.035) < 1e-9);
  assert.ok(Math.abs(restHeight(0.06, 0.035, 0) - 0.06) < 1e-9);
  assert.ok(restHeight(0.06, 0.035, 0.6) > 0.035);
});

test("at the surface on a tight line: just under it, never hanging deep or floating", () => {
  const y = surfaceSpine(-0.3, 0.06);
  assert.ok(y < -0.3 && y > -0.36);
});

test("putting it back: carried, lowered, then it swims, in that order, at every kind of place", () => {
  for (const v of ["pier", "river", "lake", "estuary", "beach"]) {
    const p = releasePlan(v);
    assert.ok(p.carry <= p.over && p.over <= p.lower && p.lower < p.swim, v);
    assert.equal(releaseStep(0.2, p), "carry");
    assert.equal(releaseStep((p.lower + p.swim) / 2, p), "swim");
    const end = p.haul || p.swim;
    assert.equal(releaseStep(end + 0.1, p), "gone");
    if (p.haul) assert.equal(releaseStep((p.swim + p.haul) / 2, p), "haul");
  }
  // off a pier the net is let down the wall: it takes a moment, not a cut
  const pier = releasePlan("pier");
  assert.ok(pier.lower - pier.over >= 2);
  // and the empty net comes back up the wall afterwards (it never just reappears on the deck), taking a few pulls
  assert.ok(pier.haul - pier.swim >= 2.5);
  // the swim-away lasts long enough to watch
  assert.ok(pier.swim - pier.lower >= 4);
  // nowhere else is there a net to haul up
  for (const v of ["river", "lake", "estuary", "beach"]) assert.equal(releasePlan(v).haul, undefined, v);
  // a light fish off a pier (one swung up, not netted) goes back by hand: no net, no haul, let go over the rail
  const light = releasePlan("pier", true);
  assert.ok(light.drop && !light.net && light.haul === undefined);
  assert.ok(light.carry <= light.over && light.over < light.lower && light.lower < light.swim);
  assert.ok(light.swim - light.lower >= 3.5, "still long enough to watch it swim off");
  assert.ok(light.swim < pier.swim, "quicker than the net");
});

test("swimming off: away and then down, never backwards or up", () => {
  let prev = swimAway(0, 0.5);
  assert.equal(prev.dist, 0); assert.equal(prev.depth, 0);
  for (let u = 0.02; u <= 1.0001; u += 0.02) {
    const s = swimAway(u, 0.5);
    assert.ok(s.dist >= prev.dist - 1e-9, "never back");
    assert.ok(s.depth >= prev.depth - 1e-9, "never up");
    prev = s;
  }
  assert.ok(prev.dist > 2 && prev.depth > 1, "well away and out of sight");
  assert.equal(swimAway(0.2, 0.5).depth, 0, "along the top first, where it can be seen");
});
