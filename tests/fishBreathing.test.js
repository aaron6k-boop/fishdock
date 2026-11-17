// The fish's breathing (fishMotion.js breathing): how far its mouth is open and its gill covers lifted
import { test } from "node:test";
import assert from "node:assert/strict";
import { breathing } from "../src/lib/fishMotion.js";

const over = (mode, opt = {}) => { const g = [], l = []; for (let t = 0; t < 30; t += 0.02) { const b = breathing(t, { mode, ...opt }); g.push(b.gape); l.push(b.gills); } return { g, l }; };
const max = (a) => Math.max(...a), min = (a) => Math.min(...a);

test("every value stays between shut and fully open", () => {
  for (const mode of ["water", "hooked", "air"]) for (const seed of [0, 0.37, 0.99]) for (const flat of [false, true]) {
    const { g, l } = over(mode, { seed, flat });
    assert.ok(min(g) >= 0 && max(g) <= 1 && min(l) >= 0 && max(l) <= 1, `${mode} ${seed} ${flat}`);
  }
});

test("out of the water it gasps: wide open now and then, shut between", () => {
  const { g, l } = over("air", { seed: 0.2 });
  assert.ok(max(g) > 0.8, "a gasp opens the mouth wide");
  assert.ok(g.filter((v) => v < 0.1).length > g.length * 0.4, "shut for most of the time between gasps");
  assert.ok(max(l) > 0.8, "the gill covers flare");
});

test("in the water it breathes slightly, the gill covers opening as the mouth closes", () => {
  const { g, l } = over("water");
  assert.ok(max(g) < 0.25 && max(l) < 0.3);
  // (the covers lag the mouth: their peaks don't fall together)
  const tg = g.indexOf(max(g)), tl = l.indexOf(max(l));
  assert.notEqual(tg, tl);
});

test("hooked, the mouth is held half open", () => {
  const { g } = over("hooked");
  assert.ok(min(g) > 0.2 && max(g) < 0.6);
});

test("a flatfish's mouth opens less", () => {
  assert.ok(max(over("air", { flat: true }).g) < max(over("air").g));
});

import { flapping, swimKind, bodyWave, bodyWaveSlope } from "../src/lib/fishMotion.js";
test("on the mat it flaps in bursts, then lies still, and tires", () => {
  const big = (tired) => { let n = 0, still = 0; for (let t = 0; t < 60; t += 0.02) { const c = Math.abs(flapping(t, { seed: 0.3, tired }).curl); if (c > 0.3) n++; if (c < 0.02) still++; } return { n, still }; };
  const fresh = big(0), tired = big(1);
  assert.ok(fresh.n > 0 && fresh.still > fresh.n, "bursts, with stillness between");
  assert.ok(tired.n < fresh.n, "fewer strong flips when tired");
  for (let t = 0; t < 30; t += 0.05) assert.ok(Math.abs(flapping(t, { seed: 0.7 }).curl) <= 0.56);
});
test("each kind of swimming: an eel bends along its whole body, a mackerel mostly at the tail; slopes match", () => {
  const amp = (kind, u) => { let m = 0; for (let t = 0; t < 2; t += 0.01) m = Math.max(m, Math.abs(bodyWave(u, t, { kind }))); return m; };
  assert.ok(amp("eel", 0.4) > amp("carangiform", 0.4) && amp("carangiform", 0.4) > amp("tuna", 0.4));
  assert.equal(swimKind("mackerel"), "tuna"); assert.equal(swimKind("tope"), "shark"); assert.equal(swimKind("conger", { eel: true }), "eel"); assert.equal(swimKind("bass"), "carangiform");
  for (const o of [{ kind: "eel" }, { kind: "shark", shake: 0.7 }, { kind: "tuna", curl: 0.2 }]) for (const u of [0.1, 0.5, 0.9]) for (const t of [0.2, 1.7]) {
    const fd = (bodyWave(u + 1e-5, t, o) - bodyWave(u - 1e-5, t, o)) / 2e-5; assert.ok(Math.abs(fd - bodyWaveSlope(u, t, o)) < 1e-4, JSON.stringify(o));
  }
});
test("a head shake swings the head, not the tail", () => {
  let head = 0, tail = 0; for (let t = 0; t < 2; t += 0.005) { head = Math.max(head, Math.abs(bodyWave(0.05, t, { beat: 0, shake: 1 }))); tail = Math.max(tail, Math.abs(bodyWave(0.95, t, { beat: 0, shake: 1 }))); }
  assert.ok(head > 10 * tail);
});
