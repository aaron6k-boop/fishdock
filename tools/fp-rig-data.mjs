// ---- fp-rig-data: the numbers that go with fp_rig.glb, made from the Blender rig's own output ----
// Reads what the Blender jobs wrote (source-assets/blender/rig/data/: Gate 1's hold, Gate 2's ten turns, Gate 3's cast,
// the grips, the export's notes) and writes src/lib/world3d/fpRigData.js for fpRig.js and angler.js. Nothing in it is
// typed in by hand. Blender works in z up with the character
// facing -y; the game and glTF in y up, facing +z for the model: a point (x, y, z) becomes (x, z, -y) and a turn is
// carried over the same way, as Blender's glTF exporter does.
//   node tools/fp-rig-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const D = new URL("../source-assets/blender/rig/data/", import.meta.url);
const J = (f) => JSON.parse(readFileSync(new URL(f, D), "utf8"));
const g1 = J("gate1_v11.json"), g2 = J("gate2_rows.json"), grips = J("grips.json"), g3 = J("gate3_cast.json"), meta = J("fp_rig_meta.json");

const C = ([x, y, z]) => [x, z, -y];
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const R6 = (a) => a.map(r6);
const mul3 = (A, B) => A.map((row, i) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const T3 = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
const Cm = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
const rot3 = (M) => [0, 1, 2].map((i) => M[i].slice(0, 3));
const conj = (R) => mul3(mul3(Cm, R), T3(Cm));
const apply3 = (R, v) => [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
const norm3 = (R) => { const c = [0, 1, 2].map((j) => Math.hypot(R[0][j], R[1][j], R[2][j])); return R.map((row) => row.map((v, j) => v / c[j])); };
function quat(m) { // (three's Quaternion.setFromRotationMatrix, from a row-major 3x3)
  const [[m11, m12, m13], [m21, m22, m23], [m31, m32, m33]] = m, tr = m11 + m22 + m33; let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s; }
  else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s; }
  else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s; }
  else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s; }
  const n = Math.hypot(x, y, z, w); return [x / n, y / n, z / n, w / n];
}
const inv4 = (M) => { const R = rot3(M), Rt = T3(R), t = [M[0][3], M[1][3], M[2][3]], ti = apply3(Rt, t).map((v) => -v); return [[...Rt[0], ti[0]], [...Rt[1], ti[1]], [...Rt[2], ti[2]], [0, 0, 0, 1]]; };
const mul4 = (A, B) => A.map((row, i) => [0, 1, 2, 3].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j] + row[3] * B[3][j]));
/** a Blender transform (4x4, row major) as the game's { p, q } */
// (a bone keeps Blender's own axes in the glTF file: the exporter turns the whole skeleton from z up to y up at its
// root and leaves each bone's frame as it is, so a bone's turn in the game is the y-up turn applied to Blender's, not
// Blender's carried over both sides. Written both sides at first, every hand came out a quarter turn about its own x
// axis: in the right place, the fingers pointing the wrong way. The hand frames below (loc, cyl, flat) are in the hand
// bone's own frame and so stay as Blender has them)
const pq = (M) => ({ p: R6(C([M[0][3], M[1][3], M[2][3]])), q: R6(quat(mul3(Cm, norm3(rot3(M))))) });

// ---- the right hand on the reel seat: Gate 1's grip, from the rod's frame (butt) moved to the seat (the reel) ----
const seatT = [[1, 0, 0, 0], [0, 1, 0, meta.seat], [0, 0, 1, 0], [0, 0, 0, 1]];
const seat = pq(mul4(seatT, meta.rod_grip));
// ---- the left hand on the knob, all the way round: the last of Gate 2's ten turns ----
const N = g2.fpr * g2.revs, last = g2.rows.slice(N - g2.fpr, N);
const hub = [0, 1, 2].map((i) => last.reduce((s, r) => s + r.knob_rod[i], 0) / last.length);
const thOf = (k) => { const dy = k[1] - hub[1], dz = k[2] - hub[2]; return ((Math.atan2(dy, -dz) * 180) / Math.PI + 360) % 360; };
// (with the elbow where Blender's IK put it at each angle, from the knob in the same frame: the game's IK bends the
// arm through it, so the forearm turns as Gate 2's did, not only the hand)
const RWi = inv4(meta.rod_world), inRod = (w) => apply3(rot3(RWi), w).map((v, i) => v + RWi[i][3]);
const knob = last.map((r) => { const H = r.hand_rod.map((row) => row.slice()); for (let i = 0; i < 3; i++) H[i][3] -= r.knob_rod[i]; const e = inRod(r.elbow); return { th: Math.round(thOf(r.knob_rod) * 100) / 100, ...pq(H), e: R6(C(e.map((v, i) => v - r.knob_rod[i]))) }; }).sort((a, b) => a.th - b.th);
const reelTh = g2.rows.slice(N - g2.fpr, N + 1).map((r) => Math.round(thOf(r.knob_rod) * 100) / 100);
// (the knob's own circle in the reel's frame, for drawing the reel where there's no game reel: the rig test page)
const hubG = C([hub[0], hub[1] + meta.seat, hub[2]]), rad = last.reduce((s2, r) => s2 + Math.hypot(r.knob_rod[1] - hub[1], r.knob_rod[2] - hub[2]), 0) / last.length;
const reel = { hub: R6(hubG), r: r6(rad) };
// ---- the palm's frame in each hand, and the handle-sized grips ----
const loc = {}, cyl = {}, flat = {};
for (const S of ["L", "R"]) { const g = grips["pole_" + S]; loc[S] = { k: R6(g.kn), palm: R6(g.pn), along: R6(g.an) }; flat[S] = { c: R6(g.c.map((v, i) => v - g.pn[i] * (g.r + 0.0015))) }; }
for (const name of ["rope", "hoop", "pole", "butt", "tail"]) { cyl[name] = { r: grips[name + "_L"].r }; for (const S of ["L", "R"]) { const g = grips[name + "_" + S]; cyl[name][S] = { c: R6(g.c), d: R6(g.d), pn: R6(g.pn) }; } }
// ---- the eye: where Gate 1 placed the rod from and Blender's first-person views were taken from (the eyes of the
// model as it stands in the hold), in the model's own frame; the game finds it in the head bone's frame from the hold clip, so it moves with the head ----
// ---- the hold and the cast: where the reel is from the eye, level, facing ahead (x right, y up, z ahead, metres) and
// the rod's angle up from level (e) and round to the right (sw), radians. The game turns these into its view's frame
// (fpRig.js toView), level when the view looks down by p0 ----
const body = ([x, y, z, eDeg, sw]) => ({ x: r6(x), y: r6(y), z: r6(z), e: r6((eDeg * Math.PI) / 180), sw: r6(sw) });
const holdBody = body(g3.K0), reelBelow = Math.round((Math.atan2(-g3.K0[1], g3.K0[2]) * 180 / Math.PI) * 100) / 100;
const order = ["K0", "KM1", "KB", "KM2", "KF", "KH", "KH", "K0"];
const cast = { path: g3.path_t.map((t, i) => ({ t, ...(order[i] === "K0" ? holdBody : body(g3.keys[order[i]].key)) })), still: g3.still };
const RIG = { fps: meta.fps, grips: meta.grips_order, eye: { bone: meta.head, hold: R6(C(g1.eye)) }, seat, knob, reelTh, reel, loc, cyl, flat, holdBody, reelBelow, cast };
const out = `// ---- fpRigData: made by tools/fp-rig-data.mjs from the Blender rig's output (source-assets/blender/rig/data/); not edited by hand ----
// eye: the eye in the model's frame at the hold; seat: the right hand
// bone on the reel seat, in the reel's frame (x left, y up, z to the tip); knob: the left hand bone on the knob through
// one turn of the handle (th: the knob's angle round the reel, 0 at the bottom, 90 back towards you), from the knob's
// centre in the reel's frame; reelTh: the reel clip's frames' knob angles; reel: the knob's circle (hub, radius); loc: each palm's frame in its hand bone's
// frame; cyl: each grip round a handle (c a point on the handle's axis, d its direction, pn the palm's normal, in the
// hand bone's frame; r the handle's radius); flat: the palm's centre; holdBody and cast: where the reel is held from
// the eye, level (metres), and the rod's angle up and round (radians); reelBelow: the held reel's angle below the eye.
export const RIG = ${JSON.stringify(RIG, null, 1)};
`;
writeFileSync(new URL("../src/lib/world3d/fpRigData.js", import.meta.url), out);
console.log("wrote fpRigData.js:", knob.length, "knob angles from", knob[0].th, "to", knob.at(-1).th, "; the hold", holdBody, "the reel", reelBelow, "degrees below the eye; cast path", cast.path.map((k) => [k.t, k.e.toFixed(2), k.sw.toFixed(2)].join(" ")).join(" | "));
