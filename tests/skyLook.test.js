// The light for each condition (src/lib/world3d/skyLook.js): believable, never crushed, never a glare in rain.
import test from "node:test";
import assert from "node:assert/strict";
import { lightingFor, horizonColour, lampPools, lookQuality } from "../src/lib/world3d/skyLook.js";

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
});

test("each graphics setting draws more than the one below it", () => {
  const [p, b, h] = [0.5, 1, 2].map(lookQuality);
  for (const k of ["waterGrid", "waterDetail", "lampLights", "shadowMap"]) assert.ok(p[k] < b[k] && b[k] < h[k], k);
  assert.equal(p.lampLights, 0); assert.equal(p.shadowMap, 0);
});
