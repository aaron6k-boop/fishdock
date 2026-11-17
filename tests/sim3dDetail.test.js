// ---- near and far detail for the railing posts (src/lib/world3d/realPlace.js) ----
// (needs node_modules for three, like the other tests/sim3d*.test.js files: skipped without it)
import test from "node:test";
import assert from "node:assert/strict";

let rp = null; try { rp = await import("../src/lib/world3d/realPlace.js"); } catch { /* no node_modules */ }
const skip = !rp && "three isn't installed";

test("railing posts: only those near your eye get the full fittings, and every post gets one set or the other", { skip }, () => {
  const posts = Array.from({ length: 200 }, (_, q) => [q * 1.5, 0, 0, 1]); // (a 300 m pier, a post every 1.5 m)
  const [near, far] = rp.splitByDistance(posts, 30, 0, rp.POST_DETAIL_M ** 2);
  assert.equal(near.length + far.length, posts.length); assert.equal(new Set([...near, ...far]).size, posts.length);
  assert.ok(near.every((q) => Math.abs(posts[q][0] - 30) < rp.POST_DETAIL_M) && far.every((q) => Math.abs(posts[q][0] - 30) >= rp.POST_DETAIL_M));
  assert.ok(near.length > 4 && near.length < 20, `a handful near (${near.length})`);
  assert.deepEqual(rp.splitByDistance(posts, 5000, 0, 81)[0], [], "none when you are far from them all");
});

test("rock armour: the fine stone only near you, every stone in one band, shadows only within their reach", { skip }, () => {
  const xz = Array.from({ length: 400 }, (_, q) => [q * 0.6, 3]); // (a 240 m breakwater, a stone every 0.6 m)
  const reach = 125.6; // (Ultra's: shadow distance 80)
  const [near, mid, lit, away] = rp.armourBands(xz, 0, 0, reach);
  assert.equal(near.length + mid.length + lit.length + away.length, xz.length);
  assert.equal(new Set([...near, ...mid, ...lit, ...away]).size, xz.length);
  const d = (i) => Math.hypot(xz[i][0], xz[i][1]);
  assert.ok(near.every((i) => d(i) < rp.ARMOUR_LOD.near) && mid.every((i) => d(i) >= rp.ARMOUR_LOD.near && d(i) < rp.ARMOUR_LOD.mid));
  assert.ok(lit.every((i) => d(i) >= rp.ARMOUR_LOD.mid && d(i) < reach) && away.every((i) => d(i) >= reach));
  assert.ok(near.length < xz.length / 4, `most of a long breakwater is not drawn fine (${near.length} of ${xz.length})`);
  // (a short reach, as on Low: nothing past it in the coarse band that casts shadows)
  const short = rp.armourBands(xz, 0, 0, 40);
  assert.equal(short[2].length, 0); assert.ok(short[3].every((i) => d(i) >= rp.ARMOUR_LOD.mid));
});
