// spray off the rock armour: how hard a crest breaks, and where along the rocks it can
import { test } from "node:test";
import assert from "node:assert/strict";
import { burstStrength, breakHeight, thinEdge, splashPlan, burstPlan, SPRAY } from "../src/lib/world3d/rockSpray.js";

test("a flat calm throws no spray, however fast the water moves", () => {
  assert.equal(burstStrength(1, 0), 0);
  assert.equal(burstStrength(1, 0.1), 0);
});
test("falling water throws none", () => {
  assert.equal(burstStrength(0, 0.8), 0);
  assert.equal(burstStrength(-0.5, 0.8), 0);
});
test("a bigger sea breaks harder, and never past 1", () => {
  const light = burstStrength(0.4, 0.3, 0.5), fresh = burstStrength(0.4, 0.8, 0.5), gale = burstStrength(3, 1.5, 1);
  assert.ok(light > 0 && fresh > light, `${light} ${fresh}`);
  assert.ok(gale <= 1);
});
test("a crest has to stand higher before it breaks in a bigger sea", () => {
  assert.ok(breakHeight(1) > breakHeight(0.2));
  assert.ok(breakHeight(0) > 0);
});
test("the rocks' edge is thinned to one point every few metres", () => {
  const pts = []; for (let i = 0; i < 200; i++) pts.push([i * 0.25, 0, 0, -1]);
  const out = thinEdge(pts, SPRAY.gap);
  assert.ok(out.length < 25 && out.length > 10, String(out.length));
  assert.deepEqual(thinEdge([], 3), []);
});
test("a bigger splash throws more, faster, and a small one still throws something", () => {
  const rig = splashPlan(0.6), fish = splashPlan(1.2), tiny = splashPlan(0.05);
  assert.ok(fish.crown > rig.crown && fish.speed > rig.speed && fish.mist >= rig.mist);
  assert.ok(tiny.crown > 0 && tiny.jet > 0 && tiny.mist > 0);
  assert.ok(splashPlan(0.6, 2.2).crown > rig.crown * 2);
});
test("no splash can use up the whole pool of points", () => {
  const big = splashPlan(5, 10);
  assert.ok(big.crown + big.jet + big.mist * 2 + big.foam < SPRAY.max / 3, JSON.stringify(big)); // (the mist is thrown twice: the sheet and the puff)
});

// (15 November: every drop was a near-solid white disc; a net coming up out of the water stood in a halo of snow)
test("drops are drawn as clear streaks along their path, the mist as puffs", async () => {
  const THREE = await import("three"); const { createRockSpray } = await import("../src/lib/world3d/rockSpray.js");
  const sp = createRockSpray(new THREE.Scene()), g = sp.points.geometry;
  sp.splash(0, 0, 0, 0.9); sp.update(0.05, 0.05, { swell: 0, wind: 0 }, () => -5, null, 800, 60);
  const v = g.attributes.aVel.array, s = g.attributes.aSeed.array;
  let moving = 0; for (let i = 0; i < s.length; i++) if (s[i] >= 2 && Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]) > 0.5) moving++;
  assert.ok(moving > 20, `the drops' speeds go to the shader (${moving})`);
  const vs = sp.points.material.vertexShader, fs = sp.points.material.fragmentShader;
  assert.match(vs, /: clamp\(1\.0 \+ len \/ max\(px, 1\.5\), 1\.0, 5\.0\)/, "drawn out by how far it moves on screen, five times its size at most");
  assert.match(fs, /vFade \* 0\.75 \/ mix\(1\.0, vStretch, 0\.6\)/, "three quarters at most, fainter as it's drawn out");
  sp.dispose();
});

// (17 November: the breaks on the rocks were round soft puffs, cotton wool on the stones, and the foam they left more puffs)
test("a break on the rocks comes in stages: sheets of water first, then drops, then mist, then foam on the water", () => {
  for (const s of [0.2, 0.6, 1]) {
    const P = burstPlan(s);
    assert.ok(P.at.sheets[0] < P.at.drops[1] && P.at.drops[0] < P.at.mist[0] && P.at.mist[0] < P.at.foam[0], JSON.stringify(P.at));
    assert.ok(P.sheets >= 3 && P.drops > P.sheets && P.mist < P.sheets, JSON.stringify(P));
  }
  const small = burstPlan(0.2), big = burstPlan(1);
  assert.ok(big.sheetUp > small.sheetUp * 2 && big.sheets > small.sheets && big.sheetSize > small.sheetSize);
  // (a break throws a sheet about as high as the sea is big: under a metre in a light sea, three or four in a big one)
  assert.ok(small.sheetUp ** 2 / 19.6 < 1.2 && big.sheetUp ** 2 / 19.6 > 2.5, `${small.sheetUp} ${big.sheetUp}`);
});

test("sheets burst into drops, and a break leaves foam lying on the water that spreads and goes", async () => {
  const THREE = await import("three"); const { createRockSpray } = await import("../src/lib/world3d/rockSpray.js");
  const sp = createRockSpray(new THREE.Scene()), g = sp.points.geometry, sea = { swell: 0.8, wind: 0.6, windDir: [0, -1] }, water = () => 0;
  sp.burst(0, 0.3, 0, 0.9, 0, 1);
  // (nothing shows before its moment: the sheets wait a little, the foam longer)
  assert.equal(sp.foamLive, 2);
  const kinds = () => { const s = g.attributes.aSeed.array, f = g.attributes.aFade.array, out = { sheet: 0, drop: 0, mist: 0 }; for (let i = 0; i < s.length; i++) if (f[i] > 0.01) out[s[i] >= 4 ? "sheet" : s[i] >= 2 ? "drop" : "mist"]++; return out; };
  let t = 0; const step = (sec) => { for (let k = 0; k < sec / 0.02; k++) { t += 0.02; sp.update(t, 0.02, sea, water, null, 800, 60); } };
  step(0.3); const early = kinds();
  assert.ok(early.sheet >= 5, JSON.stringify(early));
  step(0.9); const later = kinds();
  assert.ok(later.drop > early.drop && later.sheet < early.sheet, `${JSON.stringify(early)} then ${JSON.stringify(later)}`);
  // the foam: on the water, flat, bigger as it ages, and gone after several seconds
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const foamSize = () => { let r = 0; for (let i = 0; i < SPRAY.foam; i++) { sp.foam.getMatrixAt(i, m); m.decompose(p, q, sc); r = Math.max(r, sc.x); } return r; };
  step(0.5); const r1 = foamSize(); step(2); const r2 = foamSize();
  assert.ok(r1 > 0.5 && r2 > r1, `${r1} ${r2}`);
  step(10); assert.equal(sp.foamLive, 0);
  assert.equal(foamSize(), 0);
  sp.dispose();
});

test("a crest against the wall slaps up its face instead of throwing a ring, and the spray and foam take the haze", async () => {
  const THREE = await import("three"); const { createRockSpray } = await import("../src/lib/world3d/rockSpray.js");
  const sp = createRockSpray(new THREE.Scene()), g = sp.points.geometry;
  sp.splash(0, 0.2, 0, 0.8, 2.2, { x: 0, z: 1 });
  sp.update(0.3, 0.3, { swell: 0.8, wind: 0.5 }, () => 0, null, 800, 60);
  const s = g.attributes.aSeed.array, v = g.attributes.aVel.array; let sheets = 0, up = 0;
  for (let i = 0; i < s.length; i++) if (s[i] >= 4) { sheets++; if (v[i * 3 + 1] > Math.abs(v[i * 3 + 2])) up++; }
  assert.ok(sheets >= 3 && up >= sheets * 0.8, `${sheets} sheets, ${up} going more up than out`);
  assert.ok(sp.points.material.fog && sp.foam.material.fog, "in the haze like everything else");
  sp.dispose();
});
