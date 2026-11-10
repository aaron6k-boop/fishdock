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
