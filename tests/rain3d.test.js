// rain3d: how the rain is drawn for its amount, the wind and the quality (src/lib/world3d/rain3d.js)
import test from "node:test";
import assert from "node:assert/strict";
import { rainPlan } from "../src/lib/world3d/rain3d.js";

test("no rain draws nothing: no drops falling, no curtains, no splashes", () => {
  const p = rainPlan(0, 0.5, 2);
  assert.equal(p.on, 0); assert.equal(p.sheet, 0); assert.equal(p.splashes, 0); assert.equal(p.every, Infinity);
});

test("a drizzle is a few small, slow drops; a downpour fills the air with big fast ones and splashes everywhere", () => {
  const light = rainPlan(0.35, 0.3, 2), heavy = rainPlan(1, 0.3, 2);
  assert.ok(light.on > 0 && light.on < 0.35, `drizzle ${light.on}`);
  assert.equal(heavy.on, 1);
  assert.ok(heavy.fall > light.fall && light.fall >= 4.5 && heavy.fall <= 9, `${light.fall} ${heavy.fall} m/s`);
  assert.ok(heavy.width > light.width && heavy.len > light.len);
  assert.ok(heavy.sheet > light.sheet * 3);
  assert.ok(heavy.every < light.every / 3, "splashes come far more often in a downpour");
});

test("the drops are carried across with the wind, up to about its own speed", () => {
  assert.equal(rainPlan(1, 0, 1).drift, 0);
  const gale = rainPlan(1, 1, 1).drift;
  assert.ok(gale > 8 && gale < 12.5, `${gale} m/s in a near gale`);
});

test("a phone draws fewer drops, one curtain and fewer splashes than a computer", () => {
  const phone = rainPlan(1, 0.3, 0.5), balanced = rainPlan(1, 0.3, 1), pc = rainPlan(1, 0.3, 2);
  assert.ok(phone.drops < balanced.drops && balanced.drops < pc.drops);
  assert.equal(phone.curtains, 1); assert.equal(balanced.curtains, 1); assert.equal(pc.curtains, 2);
  assert.ok(phone.splashes < balanced.splashes && balanced.splashes < pc.splashes);
  assert.ok(pc.drops <= 10000, `${pc.drops} drops on a computer`);
});
