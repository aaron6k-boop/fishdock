// The sky's cloud layer (environment.js's GLSL cloudAt): its density field worked out here in JavaScript, line for
// line, with the scale and the cover threshold read from the shader's own source, to check the cover setting gives
// that much cloud and that the sky overhead isn't one patch of the field.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../src/lib/world3d/environment.js", import.meta.url), "utf8");
const [SCALE, OX, OY] = /vec2 cp = d\.xz\/\(d\.y \+ \.075\)\*([\d.]+) \+ vec2\(([\d.]+) \+ uTime\*\.0097, ([\d.]+) \+ uTime\*\.0039\)/.exec(SRC).slice(1).map(Number);
const [T0, T1] = /float thr = mix\(([\d.]+), ([\d.]+), uCloud\);/.exec(SRC).slice(1).map(Number);

// ---- GLSL_NOISE and cloudDens, as the shader has them ----
const fract = (x) => x - Math.floor(x);
const hash = (x, y) => { let px = fract(x * 123.34), py = fract(y * 456.21); const d = px * (px + 45.32) + py * (py + 45.32); px += d; py += d; return fract(px * py); };
const noise = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy; };
const fbmN = (x, y, n) => { let s = 0, a = 0.5; for (let i = 0; i < n; i++) { s += a * noise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 17.1; a *= 0.5; } return s; };
const fbm = (x, y) => fbmN(x, y, 5), fbm3 = (x, y) => fbmN(x, y, 3) * 1.14;
const dens = (cx, cy) => { const wx = fbm3(cx * 0.42, cy * 0.42) * 0.8, wy = fbm3(cx * 0.42 + 5.2, cy * 0.42 + 5.2) * 0.8; return fbm3(cx * 0.36 + wx * 0.45, cy * 0.36 + wy * 0.45) * 0.66 + fbm(cx * 1.55 + wx, cy * 1.55 + wy) * 0.46 - 0.07; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const coverAt = (n, c) => { const thr = T0 + (T1 - T0) * c; return Math.max(smooth(thr, thr + 0.1, n), smooth(0.78, 1, c)); };

let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** the sky's cloud share over directions from el0 to el1 (radians up), averaged over many moments of the drift */
function share(c, el0, el1, n = 3000, at = null) {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const az = rnd() * 2 * Math.PI, el = Math.asin(Math.sin(el0) + rnd() * (Math.sin(el1) - Math.sin(el0))), t = at ?? rnd() * 3600 * 6;
    const dx = Math.cos(el) * Math.sin(az), dy = Math.sin(el), dz = Math.cos(el) * Math.cos(az);
    s += coverAt(dens((dx / (dy + 0.075)) * SCALE + OX + t * 0.0097, (dz / (dy + 0.075)) * SCALE + OY + t * 0.0039), c);
  }
  return s / n;
}

test("the cover setting gives about that much cloud, low and high in the sky alike", () => {
  for (const c of [0.15, 0.3, 0.45, 0.6]) {
    const all = share(c, 0.17, Math.PI / 2), high = share(c, 0.52, 1.2);
    assert.ok(Math.abs(all - c) < 0.1, `cover ${c}: ${all.toFixed(2)} of the sky above 10 degrees`);
    assert.ok(Math.abs(high - c) < 0.13, `cover ${c}: ${high.toFixed(2)} of it from 30 to 70 degrees up`);
  }
  assert.ok(share(0.05, 0.17, Math.PI / 2) < 0.1, "a clear day nearly clear");
  // (and as the game opens, the clock at nought: as cloudy overhead as low down, not a clear patch over your head; one
  // moment, so a little looser)
  for (const c of [0.3, 0.45]) { const hi = share(c, 0.52, 1.4, 1500, 0), lo = share(c, 0.17, 0.52, 1500, 0); assert.ok(Math.abs(hi - c) < 0.12 && Math.abs(lo - c) < 0.12, `cover ${c} at the start: ${hi.toFixed(2)} high, ${lo.toFixed(2)} low`); }
});

test("the sky overhead takes in several heaps of the field, not one patch of it", () => {
  // (the field's broad shape is fbm3 at 0.36 a unit; the sky from 45 degrees up to the zenith spans 2 x SCALE units)
  const heap = 1 / 0.36, span = 2 * SCALE / Math.tan(Math.PI / 4);
  assert.ok(span / heap > 1, `the zenith cap spans ${(span / heap).toFixed(2)} broad heaps`);
  // (and two moments an hour apart look different overhead: the layer drifts across)
  const at = (t) => dens(t * 0.0097, t * 0.0039);
  let changed = 0; for (let k = 0; k < 20; k++) if (Math.abs(at(k * 3600) - at(k * 3600 + 3600)) > 0.05) changed++;
  assert.ok(changed > 10);
});
