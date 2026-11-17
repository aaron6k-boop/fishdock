// ---- fp-cast-view: the cast's wind-up searched again with your view as a condition ----
// Gate 3 (Blender) solved the cast for the arms alone. This searches its three wind-up moments (the rod coming up at
// 0.3 s, the top at 0.6 s, the drive forward at 0.72 s: the reel's place from the eye and the rod's angle) for one that
// keeps each arm out of the middle of the picture and away from your eye, both hands on the rod, no arm stretched,
// every wrist inside its range (fpIk.js limitsPen, the gates' measure), and the rod still well back at the top. It
// poses the rig as tests/fpRig.test.js does. Prints the moments found, for tools/fp-rig-data.mjs's VIEW.
//   node tools/fp-cast-view.mjs            (N=400 tries; OUT=file.json writes where each arm is on screen, before and after)
// Needs three (node_modules), like the tests/sim3d*.test.js files.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
const W = new URL("../", import.meta.url).pathname;
const { createFpRig, castAt, rodFrame, holdView, rigP0, bodyUp } = await import(W + "src/lib/world3d/fpRig.js");
const { RIG } = await import(W + "src/lib/world3d/fpRigData.js");
const { wristAngles, limitsPen } = await import(W + "src/lib/world3d/fpIk.js");
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const buf = readFileSync(W + "public/models/fp_rig.glb");
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
const scene = new THREE.Scene(), rig = createFpRig({ model: gltf }); scene.add(rig.group); rig.show(true); const R = rig.internals;
const META = JSON.parse(readFileSync(W + "source-assets/blender/rig/data/fp_rig_meta.json", "utf8"));
const LOC = Object.fromEntries(["L", "R"].map((S) => [S, { k: V(...RIG.loc[S].k), palm: V(...RIG.loc[S].palm), along: V(...RIG.loc[S].along) }]));
function place(pitch, key) {
  const eye = V(0, 1.6, 0), vf = V(0, Math.sin(pitch), -Math.cos(pitch)), vr = V(1, 0, 0), vu = V().crossVectors(vr, vf);
  const dir = vf.clone().multiplyScalar(Math.cos(key.e) * Math.cos(key.sw)).addScaledVector(vu, Math.sin(key.e)).addScaledVector(vr, Math.cos(key.e) * Math.sin(key.sw)).normalize();
  const h = holdView(), rest = vf.clone().multiplyScalar(Math.cos(h.e) * Math.cos(h.sw)).addScaledVector(vu, Math.sin(h.e)).addScaledVector(vr, Math.cos(h.e) * Math.sin(h.sw)).normalize();
  return { eye, vf, vr, vu, dir, rest, reel: eye.clone().addScaledVector(vr, key.x).addScaledVector(vu, key.y).addScaledVector(vf, key.z), rq: rodFrame(dir, rest, bodyUp(vf, vu)) };
}
const at = (b) => b.getWorldPosition(V());
const ty = Math.tan(35 * Math.PI / 180), asp = 16 / 9;
const scr = (P, p) => { const d = p.clone().sub(P.eye), x = d.dot(P.vr), y = d.dot(P.vu), z = d.dot(P.vf); return { sx: x / z / (ty * asp), sy: y / z / ty, z, dist: d.length() }; };
const pitch = rigP0();
const ORIG = JSON.parse(JSON.stringify(RIG.cast.path));
function evalPath(report = false) {
  let cost = 0, pen = 0, shortL = 0, offR = 0; const rows = [];
  rig.reset?.();
  for (let t = 0; t <= 1.3 + 1e-9; t += 0.05) {
    const key = castAt(t), P = place(pitch, key), butt = P.reel.clone().addScaledVector(P.dir, -META.seat), a = butt.clone().addScaledVector(P.dir, 0.065);
    const left = { at: a, axis: P.dir.clone(), palm: V(1, 0.2, 0), kind: "butt", sock: { pos: a.clone(), quat: rodFrame(P.dir, P.rest, bodyUp(P.vf, P.vu)) } };
    const seat = { at: P.reel.clone(), axis: P.dir.clone(), kind: "seat", sock: { pos: P.reel.clone(), quat: P.rq.clone() } };
    for (let i = 0; i < 12; i++) rig.pose({ hands: [left, seat], eye: P.eye, vr: P.vr, vu: P.vu, vf: P.vf, dt: 1 / 30, castT: t });
    for (const S of ["L", "R"]) { const A = R.arm[S]; pen = Math.max(pen, limitsPen(wristAngles(at(A.U), at(A.F), at(A.H), A.H.getWorldQuaternion(new THREE.Quaternion()), LOC[S], S))); }
    shortL = Math.max(shortL, rig.shortfall[0]); offR = Math.max(offR, at(R.arm.R.H).distanceTo(P.reel.clone().add(V(...RIG.seat.p).applyQuaternion(P.rq))));
    const pts = {}; for (const S of ["L", "R"]) { const A = R.arm[S]; pts[S + "h"] = at(A.H); pts[S + "e"] = at(A.F); pts[S + "f"] = at(A.F).add(at(A.H)).multiplyScalar(0.5); pts[S + "u"] = at(A.U).add(at(A.F)).multiplyScalar(0.5); }
    const row = { t: +t.toFixed(2) };
    for (const [n, p] of Object.entries(pts)) {
      const s = scr(P, p); row[n] = s.z > 0.02 && Math.abs(s.sx) < 1.05 && Math.abs(s.sy) < 1.05 ? [+s.sx.toFixed(2), +s.sy.toFixed(2), +s.dist.toFixed(2)] : null;
      if (!row[n]) continue;
      const central = 1 - 0.6 * Math.min(1, Math.max(Math.abs(s.sx), Math.abs(s.sy)));
      if (n.endsWith("h")) cost += Math.max(0, 0.33 - s.dist) * 30 * central + (s.sy > -0.2 ? (s.sy + 0.2) * 1.5 : 0);
      else cost += (0.6 + Math.max(0, 0.45 - s.dist) * 8) * central * (n[1] === "u" ? 1.4 : 1);
    }
    rows.push(row);
  }
  cost += Math.max(0, pen - 0.6) * 40 + Math.max(0, shortL - 0.004) * 4000 + Math.max(0, offR - 0.0015) * 8000;
  // (the cast must still read: the rod well back at the top of the wind-up; and not wander far from Gate 3's own shape)
  const k2 = RIG.cast.path[2]; cost += Math.max(0, 2.25 - k2.e) * 20;
  for (const i of [1, 2, 3]) for (const c of ["x", "y", "z"]) cost += (RIG.cast.path[i][c] - ORIG[i][c]) ** 2 * 3;
  if (report) return { cost, pen, shortL, offR, rows };
  return cost;
}
const KEYS = [1, 2, 3], CH = ["x", "y", "z", "e", "sw"], STEP = { x: 0.04, y: 0.04, z: 0.04, e: 0.15, sw: 0.15 };
let best = evalPath(); const r0 = evalPath(true); console.log("start cost", best.toFixed(2), "pen", r0.pen.toFixed(2), "shortL", r0.shortL.toFixed(4), "offR", r0.offR.toFixed(4));
let scale = 1; const N = +(process.env.N || 400);
for (let it = 0; it < N; it++) {
  const save = JSON.parse(JSON.stringify(RIG.cast.path));
  const nch = 1 + Math.floor(Math.random() * 3);
  for (let q = 0; q < nch; q++) { const k = KEYS[Math.floor(Math.random() * 3)], c = CH[Math.floor(Math.random() * 5)]; RIG.cast.path[k][c] += (Math.random() * 2 - 1) * STEP[c] * scale; }
  const c = evalPath();
  if (c < best) { best = c; } else { for (let i = 0; i < save.length; i++) Object.assign(RIG.cast.path[i], save[i]); }
  if (it % 50 === 49) { scale *= 0.85; console.log(it + 1, "cost", best.toFixed(2)); }
}
const rep = evalPath(true);
console.log("end cost", best.toFixed(2), "pen", rep.pen.toFixed(2), "shortL", rep.shortL.toFixed(4), "offR", rep.offR.toFixed(4));
console.log(JSON.stringify(RIG.cast.path.slice(1, 4).map((k) => Object.fromEntries(Object.entries(k).map(([a, b]) => [a, +b.toFixed(3)])))));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ path: RIG.cast.path, rows: rep.rows, before: r0.rows }, null, 1));
