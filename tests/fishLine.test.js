// The fishing line (src/lib/world3d/fishLine.js): one thread from the spool, over the roller, through every ring of the
// bending rod and out to the rig or the fish. It must pass inside every ring, stay fixed to both ends, never stretch,
// be wound in no faster than the reel winds, pay out in a cast, hang straight when pulled tight and never balloon into
// big loops when slack.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fishLine } from "../src/lib/world3d/fishLine.js";

const NR = 6;
// a rod 3.6 m long rising from the origin along -z at 35 degrees, bent down towards its tip by `bend`, rings hanging
// under it, shrinking towards the tip
function rod(line, bend = 0.3) {
  const pts = [], n = 40; let p = new THREE.Vector3(0, 1, 0), ang = 0.6;
  for (let i = 0; i <= n; i++) { pts.push(p.clone()); const s = i / n; ang -= bend * 2 * s / n; p = p.clone().add(new THREE.Vector3(0, Math.sin(ang), -Math.cos(ang)).multiplyScalar(3.6 / n)); }
  const at = (s) => { const x = s * n, i = Math.min(n - 1, Math.floor(x)); return { p: pts[i].clone().lerp(pts[i + 1], x - i), t: pts[i + 1].clone().sub(pts[i]).normalize() }; };
  [0.25, 0.4, 0.55, 0.7, 0.82, 0.93].forEach((s, i) => {
    const { p: c, t } = at(s), down = new THREE.Vector3(0, -1, 0).addScaledVector(t, t.y).normalize(), g = 0.012 * Math.pow(0.25, i / (NR - 1));
    line.rings[i].c.copy(c).addScaledVector(down, 0.006 + 1.85 * g); line.rings[i].ax.copy(t); line.rings[i].r = g;
  });
  const tp = at(1); line.tip.c.copy(tp.p).add(new THREE.Vector3(0, -0.003, 0)); line.tip.ax.copy(tp.t); line.tip.r = 0.0022;
  line.reel.roller.set(0.03, 0.88, -0.45); line.reel.spool.set(0.01, 0.87, -0.44); line.reel.lip.set(0, 0.9, -0.46); line.reel.lipR = 0.026; line.reel.bail = 0;
}
const run = (line, o, frames, dt = 1 / 60) => { for (let f = 0; f < frames; f++) line.update({ dt, t: f * dt, show: true, ...o }); };
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0), len = (a) => Math.hypot(...a);
// where the drawn line crosses a ring's plane, how far from its centre
function crossing(pts, ring) {
  const c = ring.c.toArray(), ax = ring.ax.toArray(); let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const da = dot(sub(pts[i], c), ax), db = dot(sub(pts[i + 1], c), ax);
    if (da * db <= 0 && da !== db) { const t = da / (da - db); best = Math.min(best, len(sub(pts[i].map((v, j) => v + (pts[i + 1][j] - v) * t), c))); }
  }
  return best;
}

test("the line runs from the spool over the roller, inside every ring and the tip ring, to the rig", () => {
  const line = fishLine(NR); rod(line);
  const end = new THREE.Vector3(1, -4, -30);
  for (const bend of [0, 0.3, 0.8]) {
    rod(line, bend); run(line, { end, excess: 0.0015, waterY: -4 }, 90);
    const pts = line.points();
    assert.ok(pts.flat().every(Number.isFinite));
    assert.deepEqual(pts[0].map((v) => +v.toFixed(5)), line.reel.spool.toArray().map((v) => +v.toFixed(5)), "starts on the spool");
    assert.ok(pts.some((p) => len(sub(p, line.reel.roller.toArray())) < 1e-6), "goes over the roller");
    for (const r of line.rings) assert.ok(crossing(pts, r) <= r.r * 0.84 + 1e-6, `inside ring (bend ${bend})`);
    assert.ok(crossing(pts, line.tip) <= line.tip.r * 0.84 + 1e-6, "inside the tip ring");
    assert.ok(len(sub(pts[pts.length - 1], end.toArray())) < 1e-6, "fixed to the rig");
  }
});

test("it never stretches, and slack it sags only a little (no big floating loops)", () => {
  const line = fishLine(NR); rod(line);
  const end = new THREE.Vector3(0, -4, -30);
  run(line, { end, excess: 0.0015, waterY: -4, wind: [1.5, 0] }, 240);
  const seg = line.segment(), free = line.points().slice(seg.free[0]);
  const L = line.length, step = L / (free.length - 1);
  for (let i = 0; i < free.length - 1; i++) assert.ok(len(sub(free[i + 1], free[i])) <= step * 1.02, "no piece longer than its share of the line");
  // the sag: furthest any point is from the straight line tip to rig
  const a = free[0], b = free[free.length - 1], d = sub(b, a), dl = len(d);
  const off = Math.max(...free.map((p) => { const w = sub(p, a), t = dot(w, d) / (dl * dl); return len(sub(w, d.map((v) => v * t))); }));
  assert.ok(off < 1.2, `sag ${off.toFixed(2)} m on 30 m of line`);
  assert.ok(off > 0.05, "slack line does sag");
});

test("pulled tighter than its length it's straight; a fish running at you outpaces the reel and the line bellies", () => {
  const line = fishLine(NR); rod(line);
  const end = new THREE.Vector3(0, -3, -25);
  run(line, { end, excess: 0, tension: 1, waterY: -3 }, 30);
  const free = line.points().slice(line.segment().free[0]), a = free[0], b = free[free.length - 1], d = sub(b, a), dl = len(d);
  const off = Math.max(...free.map((p) => { const w = sub(p, a), t = dot(w, d) / (dl * dl); return len(sub(w, d.map((v) => v * t))); }));
  assert.ok(off < 0.01, "straight under load (only a hum)");
  // the fish swims 1.2 m closer at once; the reel winds 1 m/s: a second later there's still slack
  const L0 = line.length; end.z += 1.2;
  run(line, { end, excess: 0, retrieve: 1, waterY: -3 }, 60);
  assert.ok(L0 - line.length <= 1.05 && L0 - line.length > 0.9, `wound in ${(L0 - line.length).toFixed(2)} m in a second`);
  // but metres of slack aren't left out: past 6% of the distance it's wound down quickly
  end.z += 8; run(line, { end, excess: 0, retrieve: 1, waterY: -3 }, 120);
  const d2 = line.tip.c.distanceTo(end); assert.ok(line.length <= d2 * 1.061, `slack ${(line.length / d2 - 1).toFixed(3)}`);
});

test("in a cast the line pays out freely and only goes out; the drop hangs the lead under the tip", () => {
  const line = fishLine(NR); rod(line);
  run(line, { freeEnd: true, drop: 1.2 }, 120);
  assert.ok(Math.abs(line.endPos.y - (line.tip.c.y - 1.2)) < 0.05, "the lead hangs on its drop");
  const end = line.tip.c.clone();
  let was = line.length;
  for (let f = 0; f < 60; f++) { end.add(new THREE.Vector3(0, 0.05, -0.4)); line.update({ dt: 1 / 60, t: f / 60, show: true, end, payout: true, excess: 0.015 }); assert.ok(line.length >= was); was = line.length; }
  assert.ok(line.payRate > 10, "line pouring off the spool");
  line.reel.bail = 1; run(line, { end, payout: true, excess: 0.015 }, 1);
  assert.ok(line.points().flat().every(Number.isFinite));
});
