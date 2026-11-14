// The light for each condition (src/lib/world3d/skyLook.js): believable, never crushed, never a glare in rain.
import test from "node:test";
import assert from "node:assert/strict";
import { lightingFor, horizonColour, lampPools, poolLight, lookQuality } from "../src/lib/world3d/skyLook.js";

const DAY = { day: 1, dusk: 0, night: 0, cloud: 0.25, rain: 0, moonLight: 0 };
const OVERCAST = { ...DAY, cloud: 0.9 };
const RAIN = { ...DAY, cloud: 0.95, rain: 1 };
const DUSK = { day: 0, dusk: 1, night: 0, cloud: 0.3, rain: 0, moonLight: 0 };
const NIGHT = { day: 0, dusk: 0, night: 1, cloud: 0.2, rain: 0, moonLight: 0.7 };

test("rain and overcast all but hide the sun, and the sky's own light takes over", () => {
  const d = lightingFor(DAY), o = lightingFor(OVERCAST), r = lightingFor(RAIN);
  assert.ok(r.sunIntensity < d.sunIntensity * 0.15, `rain sun ${r.sunIntensity}`); // (a hard sun on wet ground made a white patch)
  assert.ok(o.sunIntensity < d.sunIntensity * 0.4);
  assert.ok(o.skyIntensity > d.skyIntensity, "a bright overcast spreads the light");
  assert.ok(o.shadow < d.shadow * 0.6, "shadows soften under cloud");
});

test("dusk is warm but gold, not orange", () => {
  const [r, g, b] = lightingFor(DUSK).sunColour;
  assert.ok(g / r > 0.72 && b / r > 0.5, `sun ${r} ${g} ${b}`);
  const [hr, hg] = horizonColour(DUSK);
  assert.ok(hg / hr > 0.7, "horizon haze not orange");
});

test("night is dark but never crushed: moonlit fill and a lifted exposure", () => {
  const n = lightingFor(NIGHT), d = lightingFor(DAY);
  assert.ok(n.skyIntensity * n.exposure > 0.4, `night fill ${n.skyIntensity * n.exposure}`);
  assert.ok(n.exposure > d.exposure);
  assert.equal(n.lampOn, 1);
  assert.equal(d.lampOn, 0);
  const [r, , b] = n.skyColour; assert.ok(b > r, "moonlight is cool");
});

test("the haze is thicker in rain and matches the horizon", () => {
  assert.ok(lightingFor(RAIN).fogDensity > lightingFor(DAY).fogDensity * 3);
  const [r, g, b] = lightingFor(DAY).fogColour; assert.ok(b > r && g > r, "a blue-grey day haze");
  const [rr, rg, rb] = lightingFor(RAIN).fogColour; assert.ok(Math.max(rr, rg, rb) - Math.min(rr, rg, rb) < 0.12, "a (blue-)grey rain haze");
});

test("lamp pools: the nearest lamp posts to the anglers, none far away", () => {
  const perches = [[50, 6, 0], [3, 6, 2], [200, 6, 0], [-10, 6, 0]];
  assert.deepEqual(lampPools(perches, [0, 0], 2), [[3, 6, 2], [-10, 6, 0]]);
  assert.equal(lampPools(perches, [0, 0], 9).length, 3);
  assert.deepEqual(lampPools([], [0, 0], 3), []);
  assert.equal(lampPools([[3, 6, 2], [3.2, 6, 2.1], [9, 6, 0]], [0, 0], 2)[1][0], 9, "a lamp listed twice lights once");
  assert.ok(poolLight(9.6).intensity > poolLight(4.8).intensity * 3 && poolLight(9.6).distance > 18, "a tall column lamp lights further");
});

test("each graphics setting draws more than the one below it", () => {
  const [p, b, h] = [0.5, 1, 2].map(lookQuality);
  for (const k of ["waterGrid", "waterDetail", "lampLights", "shadowMap"]) assert.ok(p[k] < b[k] && b[k] < h[k], k);
  assert.equal(p.lampLights, 0); assert.equal(p.shadowMap, 0);
});

test("a clear day's shadow is about a fifth as bright as the sunlit deck beside it", () => {
  // (the sun against the sky on a horizontal surface, sun 35 degrees up: the sky and the reflections together fill a
  // shadow to roughly a fifth, as a real one; it was over a third, and shadows read as smudges)
  const L = lightingFor({ ...DAY, cloud: 0.1, sunDir: { x: 0, y: Math.sin((35 * Math.PI) / 180), z: 0 } });
  const direct = L.sunIntensity * Math.sin((35 * Math.PI) / 180), sky = L.skyIntensity * 0.9 + L.envIntensity * 0.7;
  const ratio = sky / (direct + sky);
  assert.ok(ratio > 0.15 && ratio < 0.3, `shadow/lit ${ratio.toFixed(2)}`);
  assert.equal(L.shadow, 1, "nothing but the sky fills a shadow in sun");
  // a low sun: the sky dims with it, and the exposure comes up a little so the scene isn't murky
  const low = lightingFor({ ...DAY, cloud: 0.1, sunDir: { x: 0, y: Math.sin((5 * Math.PI) / 180), z: 0 } });
  assert.ok(low.skyIntensity < L.skyIntensity * 0.7, `low sky ${low.skyIntensity}`);
  assert.ok(low.exposure > L.exposure);
});

test("sea fret and storms: from a preset or the real forecast's visibility and weather code", async () => {
  const { fretAndStorm, lightingFor } = await import("../src/lib/world3d/skyLook.js");
  assert.deepEqual(fretAndStorm({}), { fog: 0, thunder: 0 });
  assert.equal(fretAndStorm({ fog: 0.8 }).fog, 0.8);
  assert.equal(fretAndStorm({ visibilityM: 10000 }).fog, 0, "a clear day");
  assert.ok(fretAndStorm({ visibilityM: 200 }).fog > 0.99, "200 m: thick fret");
  assert.ok(fretAndStorm({ visibilityM: 1500 }).fog > 0.3 && fretAndStorm({ visibilityM: 1500 }).fog < 0.8);
  assert.ok(fretAndStorm({ code: 45, visibilityM: 9000 }).fog >= 0.6, "the forecast says fog");
  assert.equal(fretAndStorm({ code: 95 }).thunder, 1); assert.equal(fretAndStorm({ code: 61 }).thunder, 0); assert.equal(fretAndStorm({ thunder: true }).thunder, 1);
  // in a fret the haze is far thicker, the sun all but gone, shadows soft, and the haze a pale grey
  const clear = lightingFor({ day: 1, cloud: 0.3 }), fret = lightingFor({ day: 1, cloud: 0.9, fog: 1 });
  assert.ok(fret.fogDensity > 15 * clear.fogDensity, `${fret.fogDensity} against ${clear.fogDensity}`);
  // (exponential-squared haze in the water, three's exponential on land: at 150 m the land is mostly hidden)
  assert.ok(1 - Math.exp(-fret.fogDensity * 150) > 0.9);
  assert.ok(fret.sunIntensity < clear.sunIntensity * 0.1); assert.ok(fret.shadow < 0.3);
  const [r, g, b] = fret.fogColour; assert.ok(Math.abs(r - b) < 0.05 && r > 0.5, `a pale grey ${fret.fogColour}`);
});
