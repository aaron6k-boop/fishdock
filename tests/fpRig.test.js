// Your own arms in first person (src/lib/world3d/fpRig.js), rigged and animated in Blender (public/models/fp_rig.glb,
// source-assets/blender/rig/). The rig is posed here as the game poses it, from the same eye, view and equipment, and
// held to what Blender made: the hold of Gate 1 to the millimetre, the left hand round all of Gate 2's turn of the
// knob, the two-handed cast of Gate 3 reached without a bone growing longer, the other grips on what they hold.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createFpRig, castAt, rodFrame, holdView, rigP0, bodyUp, profileAt } from "../src/lib/world3d/fpRig.js";
import { handleProfile, HANDLE_PROFILE, KNOB_PROFILE } from "../src/lib/world3d/rodKit.js";
import { RIG } from "../src/lib/world3d/fpRigData.js";
import { twoBone, wristAngles, limitsPen, pairRotation, twistAbout } from "../src/lib/world3d/fpIk.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLB = new URL("../public/models/fp_rig.glb", import.meta.url);
const DATA = (f) => JSON.parse(readFileSync(new URL("../source-assets/blender/rig/data/" + f, import.meta.url), "utf8"));

// ---- the arm's own geometry ----
test("two-bone IK: the elbow where both bones keep their lengths, bent towards the pole", () => {
  const S = V(0, 1.4, 0), W = V(0.1, 1.1, -0.35), P = V(0.3, -1, 0);
  const { elbow, wrist, short } = twoBone(S, W, 0.27, 0.25, P);
  assert.equal(short, 0);
  assert.ok(wrist.distanceTo(W) < 1e-9);
  assert.ok(Math.abs(elbow.distanceTo(S) - 0.27) < 1e-9 && Math.abs(elbow.distanceTo(W) - 0.25) < 1e-9);
  const mid = S.clone().lerp(W, 0.5), n = W.clone().sub(S).normalize(), off = elbow.clone().sub(mid);
  assert.ok(off.addScaledVector(n, -off.dot(n)).dot(P.clone().addScaledVector(n, -P.dot(n))) > 0, "the elbow is on the pole's side");
});

test("two-bone IK: out of reach the arm stops straight, never longer than it is", () => {
  const S = V(0, 1.4, 0), W = V(0, 1.4, -0.9);
  const { elbow, wrist, short } = twoBone(S, W, 0.27, 0.25, V(0, -1, 0));
  assert.ok(Math.abs(short - (0.9 - 0.52)) < 1e-3);
  assert.ok(elbow.distanceTo(S) <= 0.27 + 1e-9 && wrist.distanceTo(elbow) <= 0.25 + 1e-9);
});

test("a turn taking one pair of directions onto another, and a twist read back", () => {
  const q = pairRotation(V(1, 0, 0), V(0, 1, 0), V(0, 0, -1), V(0, 1, 0));
  assert.ok(V(1, 0, 0).applyQuaternion(q).distanceTo(V(0, 0, -1)) < 1e-9);
  assert.ok(V(0, 1, 0).applyQuaternion(q).distanceTo(V(0, 1, 0)) < 1e-9);
  const tw = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.7);
  assert.ok(Math.abs(twistAbout(tw, V(0, 1, 0)) - 0.7) < 1e-9);
});

test("a straight wrist reads as straight; one bent past its range is penalised", () => {
  const loc = { k: V(1, 0, 0), palm: V(0, 0, -1), along: V(0, 1, 0) };
  const S = V(0, 0.5, 0), E = V(0, 0.25, 0.05), W = V(0, 0, 0);
  const fo = W.clone().sub(E).normalize(), q = pairRotation(V(0, 1, 0), V(1, 0, 0), fo, V(1, 0, 0));
  const w = wristAngles(S, E, W, q, loc, "R");
  assert.ok(Math.abs(w.flex) < 1e-6 && Math.abs(w.rad) < 1e-6);
  assert.equal(limitsPen({ flex: 0, rad: 0, pron: 0, elbow: 100 }), 0);
  assert.ok(limitsPen({ flex: 80, rad: 0, pron: 0, elbow: 100 }) > 0);
});

// ---- the data that goes with the model ----
test("the rig's data: a grip for every angle of the knob, unit turns, all within a hand's reach of what they hold", () => {
  assert.equal(RIG.knob.length, 24);
  for (let i = 1; i < RIG.knob.length; i++) assert.ok(RIG.knob[i].th > RIG.knob[i - 1].th);
  assert.ok(RIG.knob[0].th < 15 && RIG.knob.at(-1).th > 330);
  const unit = (q) => Math.abs(Math.hypot(...q) - 1) < 1e-4;
  for (const k of RIG.knob) { assert.ok(unit(k.q)); assert.ok(Math.hypot(...k.p) < 0.2, "the hand bone within 20 cm of the knob"); }
  assert.ok(unit(RIG.seat.q) && Math.hypot(...RIG.seat.p) < 0.2);
  assert.equal(RIG.reelTh.length, 25);
  for (const name of ["rope", "hoop", "pole", "butt", "tail"]) for (const S of ["L", "R"]) { const g = RIG.cyl[name][S]; assert.ok(Math.abs(Math.hypot(...g.d) - 1) < 1e-4 && Math.abs(Math.hypot(...g.pn) - 1) < 1e-4); }
  for (let i = 0; i < RIG.cast.path.length; i++) { const k = RIG.cast.path[i]; for (const v of Object.values(k)) assert.ok(Number.isFinite(v)); if (i) assert.ok(k.t > RIG.cast.path[i - 1].t, "the cast's moments in order"); }
  const h = RIG.holdBody; assert.ok(Math.hypot(h.x, h.y, h.z) < 0.65, "the reel held within reach of the eye");
});

// ---- the model ----
const buf = readFileSync(GLB);
test("the model: the deform skeleton, the four clips, few enough points for a phone", () => {
  assert.ok(statSync(GLB).size < 2.5e6);
  const len = buf.readUInt32LE(12), j = JSON.parse(buf.subarray(20, 20 + len).toString());
  assert.deepEqual(j.animations.map((a) => a.name).sort(), ["cast", "grips", "hold", "reel"]);
  const names = new Set(j.nodes.map((n) => n.name));
  for (const S of ["L", "R"]) for (const b of ["shoulder", "upper_arm", "forearm", "hand", "f_index.01", "thumb.01"]) assert.ok(names.has(`DEF-${b}.${S}`), `DEF-${b}.${S}`);
  assert.ok(![...names].some((n) => /^(ORG|MCH)-/.test(n)), "only the deform bones");
  const pts = j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.attributes.POSITION].count, 0);
  assert.ok(pts < 25000, `${pts} points`);
});

const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", res, rej));
const scene = new THREE.Scene(), rig = createFpRig({ model: gltf }); scene.add(rig.group); rig.show(true);
const R = rig.internals;
/** the rod as angler.js places it in first person: the reel from the eye in the view's frame, the rod at its angle */
function place(pitch, key = holdView(), yaw = 0) {
  const eye = V(0, 1.6, 0), vf = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), vr = V(Math.cos(yaw), 0, Math.sin(yaw)), vu = V().crossVectors(vr, vf);
  const dir = vf.clone().multiplyScalar(Math.cos(key.e) * Math.cos(key.sw)).addScaledVector(vu, Math.sin(key.e)).addScaledVector(vr, Math.cos(key.e) * Math.sin(key.sw)).normalize();
  const h = holdView(), rest = vf.clone().multiplyScalar(Math.cos(h.e) * Math.cos(h.sw)).addScaledVector(vu, Math.sin(h.e)).addScaledVector(vr, Math.cos(h.e) * Math.sin(h.sw)).normalize();
  return { eye, vf, vr, vu, dir, rest, reel: eye.clone().addScaledVector(vr, key.x).addScaledVector(vu, key.y).addScaledVector(vf, key.z), rq: rodFrame(dir, rest, bodyUp(vf, vu)) };
}
const C = ([x, y, z]) => V(x, z, -y);
const G2 = DATA("gate2_rows.json"), META = DATA("fp_rig_meta.json"), N2 = G2.fpr * G2.revs, TURN = G2.rows.slice(N2 - G2.fpr, N2);
const HUB = [0, 1, 2].map((i) => TURN.reduce((s, r) => s + r.knob_rod[i], 0) / TURN.length), SEATB = [0, -META.seat, 0];
const inReel = (P, b) => C(b.map((v, i) => v - SEATB[i])).applyQuaternion(P.rq).add(P.reel);
const seatSpec = (P) => ({ at: P.reel.clone(), axis: P.dir.clone(), kind: "seat", sock: { pos: P.reel.clone(), quat: P.rq.clone() } });
const crankSpec = (P, row) => { const k = inReel(P, row.knob_rod); return { at: k, axis: V(1, 0, 0), kind: "crank", hub: inReel(P, HUB), spin: 0, sock: { pos: k.clone(), quat: P.rq.clone() } }; };
const pose = (P, hands, n = 1, castT = null) => { for (let i = 0; i < n; i++) rig.pose({ hands, eye: P.eye, vr: P.vr, vu: P.vu, vf: P.vf, dt: 1 / 30, castT }); };
const at = (b) => b.getWorldPosition(V());
const LOC = Object.fromEntries(["L", "R"].map((S) => [S, { k: V(...RIG.loc[S].k), palm: V(...RIG.loc[S].palm), along: V(...RIG.loc[S].along) }]));
// (a hand's turn from Blender's, as the exporter carries it: the y-up turn applied to the bone's own Blender frame, so a
// hand turned the way Blender has it, fingers round what they hold, not only a hand in the right place)
const qBlender = (M) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(...[M[0], M[2], M[1].map((v) => -v)].flatMap((r) => { const n = (j) => Math.hypot(M[0][j], M[1][j], M[2][j]); return [r[0] / n(0), r[1] / n(1), r[2] / n(2), 0]; }), 0, 0, 0, 1));
const deg = (a, b) => (a.angleTo(b) * 180) / Math.PI;
const lengthsKept = (S) => { const A = R.arm[S]; return Math.max(Math.abs(at(A.F).distanceTo(at(A.U)) / A.L1 - 1), Math.abs(at(A.H).distanceTo(at(A.F)) / A.L2 - 1)); };

test("the hold in the game is Gate 1's hold: the right hand and elbow where Blender put them, to the millimetre", () => {
  // (the hold clip's own arm, from its own eye, against the arm the game's IK makes from the rod's place)
  R.clips.hold.apply(1 / RIG.fps); R.scene.parent.position.set(0, 0, 0); R.scene.parent.quaternion.identity(); R.scene.parent.updateMatrixWorld(true);
  const eyeM = R.eyeLocal.clone().applyMatrix4(R.head.matrixWorld), A = R.arm.R, hand = at(A.H).sub(eyeM), elbow = at(A.F).sub(eyeM), qClip = A.H.getWorldQuaternion(new THREE.Quaternion());
  const P = place(rigP0()); pose(P, [crankSpec(P, TURN[0]), seatSpec(P)], 20);
  const toW = (v) => V(-v.x, v.y, -v.z).add(P.eye); // (the body level, facing -z, when the view looks down by p0)
  assert.ok(at(A.H).distanceTo(toW(hand)) < 0.001, "hand");
  assert.ok(at(A.F).distanceTo(toW(elbow)) < 0.001, "elbow");
  assert.ok(lengthsKept("R") < 1e-5 && lengthsKept("L") < 1e-5);
  // (and turned as Gate 1 turned it: round the reel seat, not only at it)
  const turned = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI).multiply(qClip);
  assert.ok(deg(A.H.getWorldQuaternion(new THREE.Quaternion()), turned) < 1, `the right hand turned ${deg(A.H.getWorldQuaternion(new THREE.Quaternion()), turned).toFixed(1)} degrees off Gate 1's`);
  assert.ok(deg(A.H.getWorldQuaternion(new THREE.Quaternion()), P.rq.clone().multiply(qBlender(META.rod_grip))) < 1, "and as the rod's grip in Blender has it");
});

// ---- the fingers on the reel seat ----
// (angler.js's pier rod, as far as the handle goes: the reel at 45 cm, the rear grip 15.2 mm round)
const PIER = { name: "Pier rod", seat: 0.45, handle: [[0, 0.02, 0.016, "seat"], [0.02, 0.4, 0.0152, "grip"]] };
/** how far a hand's finger and thumb skin is inside what it holds at worst, by bone (mm), skinned as drawn: the outline
 * along the sock's z (the rod), or its x (the reel's knob) */
function inside(sock, prof, S = "R", alongX = false) {
  let skin = null; R.scene.traverse((o) => { if (o.isSkinnedMesh && !skin && !/jacket/i.test(o.name)) skin = o; });
  const qi = sock.quat.clone().invert(), pos = skin.geometry.attributes.position, si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight, v = V(), by = {};
  for (let i = 0; i < pos.count; i++) {
    let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
    const n = skin.skeleton.bones[bi].name; if (!new RegExp(`^DEF-(f_|thumb)\\w*${S}$`).test(n)) continue;
    skin.getVertexPosition(i, v); v.applyMatrix4(skin.matrixWorld).sub(sock.pos).applyQuaternion(qi); if (alongX) v.set(v.y, v.z, v.x);
    const pr = profileAt(prof, v.z); if (!pr) continue;
    const d = (pr.r - pr.soft - Math.hypot(v.x, v.y)) * 1000; if (d > (by[n] ?? -1e9)) by[n] = d;
  }
  return by;
}
const intoHandle = (P, prof) => inside({ pos: P.reel, quat: P.rq }, prof);
test("the handle's outline: rodkit.glb's measured parts, scaled to each rod as the modelled handle is", () => {
  for (let i = 1; i < HANDLE_PROFILE.length; i++) assert.ok(HANDLE_PROFILE[i][0] > HANDLE_PROFILE[i - 1][0], "in order along the rod");
  const p = handleProfile(PIER, true);
  assert.ok(Math.abs(profileAt(p, 0.0).r - 0.0134) < 1e-4, "the barrel at the reel: 13.4 mm");
  assert.ok(Math.abs(profileAt(p, 0.0205).r - 0.0161) < 1e-4 && profileAt(p, 0.0205).soft === 0, "the far trim's collar: 16.1 mm, metal");
  assert.ok(profileAt(p, 0.0175).r > 0.016, "a collar is seen from 1.2 mm either side, so it can't pass between two points of a finger");
  assert.equal(profileAt(p, -0.2).soft, 0.0015, "the rear grip is foam");
  // (a lighter rod: the handle shrinks with its grip, and the seat's place along it with the rod's)
  const river = handleProfile({ seat: 0.29, handle: [[0, 0.02, 0.014, "seat"], [0.02, 0.25, 0.0135, "cork"]] }, true);
  assert.ok(Math.abs(profileAt(river, 0).r - 0.0134 * 0.0135 / 0.0152) < 1e-5);
  // (and the simple handle's own sections when the modelled one isn't loaded)
  assert.ok(Math.abs(profileAt(handleProfile(PIER, false), -0.2).r - 0.0152) < 1e-9);
});

test("your fingers on the reel seat stay outside it: none in the metal, the foam pressed in no more than it gives", () => {
  const prof = handleProfile(PIER, true);
  for (const [pitch, yaw] of [[rigP0(), 0], [-0.12, 0], [-0.75, 0.4], [0.35, -0.5]]) {
    const P = place(pitch, holdView(), yaw), row = TURN[0];
    pose(P, [crankSpec(P, row), seatSpec(P)], 20);
    const before = intoHandle(P, prof), A = R.arm.R, hand = at(A.H), handQ = A.H.getWorldQuaternion(new THREE.Quaternion());
    // (as it was: the index finger 4.2 mm and the thumb 2.4 mm inside the lock nut, the far trim through the index finger;
    // with the fingers slimmed, 16 November, source-assets/hands/slim_fingers.py, 2.7 and 1.8. The thumb, turned out to
    // lie along the handle's side so the index finger no longer goes through it, 17 November, is clear of it before)
    if (pitch === rigP0()) assert.ok(before["DEF-f_index02R"] > 2, JSON.stringify(before));
    pose(P, [crankSpec(P, row), { ...seatSpec(P), prof }], 20);
    const after = intoHandle(P, prof), worst = Math.max(...Object.values(after));
    assert.ok(worst < 0.25, `pitch ${pitch}: a finger ${worst.toFixed(2)} mm inside the handle (${JSON.stringify(after)})`);
    // (only the fingers move: the hand is still where Gate 1 holds the seat)
    assert.ok(at(A.H).distanceTo(hand) < 1e-6 && deg(A.H.getWorldQuaternion(new THREE.Quaternion()), handQ) < 0.1, `the hand moved ${(at(A.H).distanceTo(hand) * 1000).toFixed(3)} mm, ${deg(A.H.getWorldQuaternion(new THREE.Quaternion()), handQ).toFixed(3)} degrees`);
    // (and lifted the way fingers lift, a few degrees at the knuckles, not flung open)
    for (const segs of R.fingers.R) for (const { b } of segs) assert.ok(b.quaternion.angleTo(R.grips.hold.R.get(b.name)) < 0.35, `${b.name} turned ${(b.quaternion.angleTo(R.grips.hold.R.get(b.name)) * 57.3).toFixed(1)} degrees off the hold`);
  }
});

/** how far the right hand's fingers (middle and outer bones of the index, middle and ring) go into its own thumb (the
 * thumb's last two bones), at worst (mm), on the skin as drawn: each finger point against the nearest thumb point within
 * 12 mm, by how far it is behind that point's surface (the normals worked out from the drawn faces) */
function intoThumb() {
  let skin = null; R.scene.traverse((o) => { if (o.isSkinnedMesh && !skin && !/jacket/i.test(o.name)) skin = o; });
  const pos = skin.geometry.attributes.position, si = skin.geometry.attributes.skinIndex, sw = skin.geometry.attributes.skinWeight, n = pos.count, P = new Float32Array(n * 3), dom = [], v = V();
  for (let i = 0; i < n; i++) { skin.getVertexPosition(i, v); v.applyMatrix4(skin.matrixWorld); P[3 * i] = v.x; P[3 * i + 1] = v.y; P[3 * i + 2] = v.z; let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } dom[i] = skin.skeleton.bones[bi].name; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setIndex(skin.geometry.index); g.computeVertexNormals(); const N = g.attributes.normal.array;
  const thumb = [], fing = []; for (let i = 0; i < n; i++) { if (/^DEF-thumb0[23]R$/.test(dom[i])) thumb.push(i); else if (/^DEF-f_(index|middle|ring)0[23]R$/.test(dom[i])) fing.push(i); }
  let worst = 0;
  for (const i of fing) { let bj = -1, bd = 0.012 ** 2; for (const j of thumb) { const d = (P[3 * i] - P[3 * j]) ** 2 + (P[3 * i + 1] - P[3 * j + 1]) ** 2 + (P[3 * i + 2] - P[3 * j + 2]) ** 2; if (d < bd) { bd = d; bj = j; } }
    if (bj >= 0) worst = Math.max(worst, -((P[3 * i] - P[3 * bj]) * N[3 * bj] + (P[3 * i + 1] - P[3 * bj + 1]) * N[3 * bj + 1] + (P[3 * i + 2] - P[3 * bj + 2]) * N[3 * bj + 2]) * 1000); }
  return worst;
}
test("your fingers on the reel seat stay out of your own thumb (Aaron, 17 November: the index finger went 8 mm into it)", () => {
  const prof = handleProfile(PIER, true);
  for (const [pitch, yaw] of [[rigP0(), 0], [-0.75, 0.4], [0.35, -0.5]]) {
    const P = place(pitch, holdView(), yaw);
    pose(P, [crankSpec(P, TURN[0]), { ...seatSpec(P), prof }], 20);
    const w = intoThumb(); assert.ok(w < 1, `pitch ${pitch}: a finger ${w.toFixed(1)} mm into the thumb`);
    // (and the thumb moved out of the way still rests on the handle, not held off it)
    const t = intoHandle(P, prof); assert.ok(t["DEF-thumb03R"] > -3 && t["DEF-thumb02R"] > -3, `the thumb ${(-t["DEF-thumb03R"]).toFixed(1)} mm off the handle`);
  }
});

test("your fingers round the reel's knob stay out of it all the way round a turn, on the pier reel and the bigger beach reel", () => {
  // (the beach reel is the same reel made 1.3 times the size, the hand the same: its knob was 3 mm into the fingers)
  const BEACH = { name: "Beachcaster", seat: 0.68, reel: 1.3, handle: [[0, 0.03, 0.018, "seat"], [0.03, 0.62, 0.0165, "grip"]] };
  for (const [rod, big] of [[PIER, false], [BEACH, true]]) {
    const knob = KNOB_PROFILE.map(([z, r, s]) => [z * (rod.reel || 1), r * (rod.reel || 1), s]), prof = handleProfile(rod, true), P = place(rigP0());
    let worstBefore = 0;
    for (const row of TURN) {
      pose(P, [crankSpec(P, row), seatSpec(P)], 3);
      const sock = crankSpec(P, row).sock; worstBefore = Math.max(worstBefore, ...Object.values(inside(sock, knob, "L", true)));
      pose(P, [{ ...crankSpec(P, row), prof: knob, profAxis: "x" }, { ...seatSpec(P), prof }], 3);
      const after = inside(sock, knob, "L", true), w = Math.max(...Object.values(after)), seat = Math.max(...Object.values(intoHandle(P, prof)));
      // (on the bigger knob the knuckle's own skin, which the hand carries as much as the finger, can stay under a millimetre in)
      assert.ok(w < (big ? 1 : 0.3), `${rod.name}, knob at ${row.th} degrees: a finger ${w.toFixed(2)} mm inside it (${JSON.stringify(after)})`);
      assert.ok(seat < 0.3, `${rod.name}: a finger ${seat.toFixed(2)} mm inside the seat`);
      const want = inReel(P, [row.hand_rod[0][3], row.hand_rod[1][3], row.hand_rod[2][3]]);
      assert.ok(at(R.arm.L.H).distanceTo(want) < 0.001, "the hand where Gate 2 has it");
    }
    if (big) assert.ok(worstBefore > 2, `the beach reel's knob: ${worstBefore.toFixed(1)} mm into the fingers before`);
  }
});

test("winding: the left hand and arm go round with the knob as in Gate 2's turns, wherever you look, arms unstretched", () => {
  for (const [pitch, yaw] of [[rigP0(), 0], [-0.12, 0], [-0.75, 0.4], [0.35, -0.5]]) {
    const P = place(pitch, holdView(), yaw);
    for (const row of TURN) {
      pose(P, [crankSpec(P, row), seatSpec(P)], 2);
      const want = inReel(P, [row.hand_rod[0][3], row.hand_rod[1][3], row.hand_rod[2][3]]);
      assert.ok(at(R.arm.L.H).distanceTo(want) < 0.001, `pitch ${pitch} knob ${row.th}`);
      const turn = deg(R.arm.L.H.getWorldQuaternion(new THREE.Quaternion()), P.rq.clone().multiply(qBlender(row.hand_rod)));
      assert.ok(turn < 1, `pitch ${pitch} knob ${row.th}: the left hand turned ${turn.toFixed(1)} degrees off Gate 2's`);
      assert.ok(lengthsKept("L") < 1e-5);
      // (and the arm as Gate 2 had it: the wrist's bends and the forearm's turn within 5 degrees of Blender's)
      const A = R.arm.L, w = wristAngles(at(A.U), at(A.F), at(A.H), A.H.getWorldQuaternion(new THREE.Quaternion()), LOC.L, "L");
      [w.flex, w.rad, w.pron].forEach((v, k) => assert.ok(Math.abs(v - row.wrist[k]) < 5, `knob ${row.th}: wrist ${k} ${v.toFixed(1)} against Gate 2's ${row.wrist[k]}`));
    }
  }
});

test("the cast: both hands on the rod all the way through, arms never stretched, wrists inside their range", () => {
  let worstR = 0, worstL = 0, worstLen = 0, worstPen = 0;
  for (let t = 0; t <= 2.4 + 1e-9; t += 1 / 24) {
    const key = castAt(t);
    const P = place(rigP0(), key), butt = P.reel.clone().addScaledVector(P.dir, -META.seat), a = butt.clone().addScaledVector(P.dir, 0.065);
    const left = t < 1.95 ? { at: a, axis: P.dir.clone(), palm: V(1, 0.2, 0), kind: "butt", sock: { pos: a.clone(), quat: rodFrame(P.dir, P.rest, bodyUp(P.vf, P.vu)) } } : crankSpec(P, TURN[0]);
    pose(P, [left, seatSpec(P)], 12, t);
    worstR = Math.max(worstR, at(R.arm.R.H).distanceTo(P.reel.clone().add(V(...RIG.seat.p).applyQuaternion(P.rq))));
    worstL = Math.max(worstL, rig.shortfall[0]);
    worstLen = Math.max(worstLen, lengthsKept("L"), lengthsKept("R"));
    for (const S of ["R", ...(t < 1.95 ? ["L"] : [])]) { const A = R.arm[S]; worstPen = Math.max(worstPen, limitsPen(wristAngles(at(A.U), at(A.F), at(A.H), A.H.getWorldQuaternion(new THREE.Quaternion()), LOC[S], S))); }
  }
  assert.ok(worstPen < 1, `the wrists and elbows at most ${worstPen.toFixed(2)} outside their range (the gates' measure)`);
  assert.ok(worstR < 0.002, `right hand off the reel seat by ${worstR}`);
  assert.ok(worstL < 0.005, `left hand short of the butt by ${worstL}`);
  assert.ok(worstLen < 1e-5, "no bone longer or shorter");
});

test("a hand out over the railing on the drop net's rope: the arm comes over the top rail, not through it", () => {
  const P = place(-0.6), rail = { y: 1.12, z: -0.42 };
  // (in the y-z plane, how far a segment comes into the top rail: its radius and the limb's, less their distance)
  const into = (a, b, r) => { const dy = b.y - a.y, dz = b.z - a.z, l2 = dy * dy + dz * dz, u = Math.max(0, Math.min(1, ((rail.y - a.y) * dy + (rail.z - a.z) * dz) / l2)); return 0.026 + r - Math.hypot(a.y + dy * u - rail.y, a.z + dz * u - rail.z); };
  let worst = -1;
  // (the rope runs over the top rail: the hands on it just past the rail, at and a little above its top)
  for (const [x, y, z] of [[-0.15, 1.2, -0.52], [-0.25, 1.15, -0.5], [-0.1, 1.25, -0.58], [-0.2, 1.3, -0.48]]) {
    pose(P, [{ at: V(x, y, z), axis: V(0, 1, 0), palm: V(0.3, 0, 1), kind: "rope", rail, sock: { pos: V(x, y, z), quat: new THREE.Quaternion() } }, seatSpec(P)], 30);
    const A = R.arm.L; worst = Math.max(worst, into(at(A.U), at(A.F), 0.045), into(at(A.F), at(A.H), 0.035));
  }
  assert.ok(worst < 0.01, `the left arm ${(worst * 100).toFixed(1)} cm into the top rail`);
});

test("the other grips: each hand reaches what it holds and its fingers take that grip's shape", () => {
  const P = place(-0.5);
  const cases = [["rope", { at: V(-0.12, 1.15, -0.38), axis: V(0, 1, 0), palm: V(0.3, 0, 1), kind: "rope" }], ["hoop", { at: V(-0.18, 1.05, -0.4), axis: V(0, 0, 1), palm: V(0, -1, 0), kind: "hoop" }],
    ["pole", { at: V(-0.15, 1.1, -0.35), axis: V(0.2, 0.3, -1), palm: V(0, 1, 0), kind: "pole" }], ["cradle", { at: V(0.05, 1.15, -0.4), axis: V(1, 0, 0), palm: V(0, 1, 0), kind: "fish" }]];
  for (const [grip, spec] of cases) {
    pose(P, [spec, seatSpec(P)], 40); // (time to lean towards it, as the body does when a hand can't reach)
    const A = R.arm.L; const g = R.grips[grip].L;
    for (const [n, q] of g) assert.ok(R.bones.get(n).quaternion.angleTo(q) < 2e-3, `${grip}: ${n}`);
    assert.ok(lengthsKept("L") < 1e-5);
    assert.ok(rig.shortfall[0] < 0.005 && at(A.H).distanceTo(spec.at) < 0.2, `${grip}: the hand at what it holds`);
  }
  pose(P, [null, null]); assert.equal(R.scene.visible, false, "nothing in either hand: the arms are put away");
});

// ---- the skin's shading (14 November: the hands read as pale plastic at dusk) ----
test("skin: warm light round the shadow's edge and a little variation, worked into three's own lighting", async () => {
  const { skinShade } = await import("../src/lib/world3d/fpRig.js");
  const lib = THREE.ShaderLib.physical;
  const sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  skinShade(sh);
  // (the scatter goes into the diffuse light only, after three's own; the patches are worked out from the point before
  // the bones move it, so they stay on the skin as the arm moves rather than the arm moving through them)
  assert.match(sh.fragmentShader, /reflectedLight\.directDiffuse \+= irradiance \* BRDF_Lambert\( material\.diffuseColor \);\s*\{ float fpW/);
  assert.ok(!sh.fragmentShader.includes("#include <lights_physical_pars_fragment>"), "the lighting chunk is written out with the scatter in it");
  assert.match(sh.vertexShader, /vSkinP = transformed;\n#include <skinning_vertex>/);
  assert.ok(sh.vertexShader.indexOf("vSkinP = transformed;") < sh.vertexShader.indexOf("#include <skinning_vertex>"), "taken before skinning");
  assert.match(sh.fragmentShader, /varying vec3 vSkinP;/);
  assert.match(sh.fragmentShader, /diffuseColor\.rgb \*= mix\(/);
  // (the scatter adds light only on the dark side of the edge: max(w - dotNL, 0) is never negative)
  assert.match(sh.fragmentShader, /max\( fpW - dotNL, 0\.0 \)/);
});

// ---- your arms in the rain ----
test("rain: skin and coat wet through in about a minute, glossier and a touch darker, and dry slowly after", async () => {
  const { setHandsWet, setHandsDim, handsWet } = await import("../src/lib/world3d/fpRig.js");
  const mats = []; R.scene.traverse((o) => { if (o.isMesh) mats.push(o.material); });
  const coat = mats.find((m) => m.type === "MeshPhysicalMaterial"), skin = mats.find((m) => m !== coat);
  setHandsWet(0, 1e6); setHandsDim(1);
  const dry = { coat: coat.roughness, skin: skin.roughness, coatL: coat.color.r + coat.color.g + coat.color.b };
  for (let i = 0; i < 60 * 10; i++) setHandsWet(0.8, 0.1); // (a minute of steady rain)
  assert.ok(handsWet() > 0.7, `wet after a minute of rain (${handsWet().toFixed(2)})`);
  assert.ok(coat.roughness < dry.coat * 0.7 && skin.roughness < dry.skin * 0.8, "both glossier");
  assert.ok(coat.color.r + coat.color.g + coat.color.b < dry.coatL * 0.95, "the coat darker");
  setHandsWet(0, 60); // (a minute after it stops: still damp)
  assert.ok(handsWet() > 0.4, `still damp a minute after (${handsWet().toFixed(2)})`);
  for (let i = 0; i < 60 * 15; i++) setHandsWet(0, 1); // (a quarter of an hour)
  assert.ok(handsWet() < 0.01, `dry a quarter of an hour after (${handsWet().toFixed(3)})`);
  assert.ok(Math.abs(coat.roughness / dry.coat - 1) < 0.01 && Math.abs(skin.roughness / dry.skin - 1) < 0.01, "as glossy as before, within 1%");
  // (one long step never overshoots)
  setHandsWet(1, 1e6); assert.ok(handsWet() <= 1); setHandsWet(0, 1e6); assert.equal(handsWet(), 0);
});

// ---- the coat's cut near the eye (15 November: a 5 cm dither showed as a screen of dots over the sleeve, looking down) ----
test("the coat's cut near your eye is softened over a narrow band only", () => {
  let coat = null; R.scene.traverse((o) => { if (o.isMesh && o.material?.type === "MeshPhysicalMaterial") coat = o.material; });
  const lib = THREE.ShaderLib.physical, sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  coat.onBeforeCompile(sh, {});
  const m = /fpNearCut \+ \(fpB4\(gl_FragCoord\.xy\) - 0\.5\) \* ([0-9.]+)/.exec(sh.fragmentShader);
  assert.ok(m, "the cut is there, with its dither");
  assert.ok(+m[1] <= 0.015, `the dither's band ${(+m[1] * 100).toFixed(1)} cm wide`);
});

// ---- the jacket's lining (14 November: a dark ring round the forearm looking down a sleeve cut near the eye) ----
test("the jacket's inward-facing lining is left out when the rig is built, and what's left faces outwards", async () => {
  const { dropLining } = await import("../src/lib/world3d/fpRig.js");
  const { clone: cloneSkinned } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const sc = cloneSkinned(gltf.scene); let jacket = null; sc.traverse((o) => { if (o.isSkinnedMesh && /jacket/i.test(o.name)) jacket = o; });
  assert.ok(jacket, "the model has a jacket");
  const before = jacket.geometry.index.count, origGeo = jacket.geometry;
  const t0 = performance.now(), dropped = dropLining(jacket); console.log(`dropLining took ${(performance.now() - t0).toFixed(0)} ms`);
  assert.ok(dropped > 0.33 && dropped < 0.6, `about half its triangles were lining (${(dropped * 100).toFixed(0)}%)`);
  assert.ok(jacket.geometry.index.count < before && origGeo.index.count === before, "the shared model is untouched; this rig's copy lost the lining");
  // (what's left: its normals point away from the bone each vertex hangs from, on almost every triangle)
  const g = jacket.geometry, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index.array, used = new Set(idx);
  console.log(`lining dropped: ${(dropped * 100).toFixed(1)}% of triangles; vertices in use ${used.size} of ${pos.count}`);
  assert.ok(used.size < 0.8 * pos.count, `fewer vertices in use (${used.size} of ${pos.count})`);
});

test("the jacket's body is marked for leaving out when you look down (chest, shoulders, hips, the trousers), the sleeves aren't", async () => {
  const { markTorso, dropLining } = await import("../src/lib/world3d/fpRig.js");
  const { clone: cloneSkinned } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const sc = cloneSkinned(gltf.scene); let jacket = null; sc.traverse((o) => { if (o.isSkinnedMesh && /jacket/i.test(o.name)) jacket = o; });
  const shared = jacket.geometry; dropLining(jacket); const share = markTorso(jacket);
  assert.ok(share > 0.1 && share < 0.85, `the body and trousers are part of the jacket's mesh, not all of it (${(share * 100).toFixed(0)}%)`);
  // (the trousers below the knee too: left in, looking down over the rail they were scraps of navy along the bottom)
  const legs = jacket.skeleton.bones.map((b) => /^DEF-(shin|foot|toe)/.test(b.name)), si0 = jacket.geometry.attributes.skinIndex, sw0 = jacket.geometry.attributes.skinWeight, ft0 = jacket.geometry.attributes.fpTorso;
  let shinN = 0; for (let i = 0; i < si0.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (legs[si0.getComponent(i, k)]) w += sw0.getComponent(i, k); if (w > 0.5) { shinN++; assert.ok(ft0.getX(i) > 0.5); } }
  assert.ok(shinN > 0, "the mesh has shins to leave out");
  assert.ok(jacket.geometry.attributes.fpTorso && !shared.attributes.fpTorso, "on this rig's copy only");
  // (the vertices hanging from the forearms are never the body)
  const sk = jacket.skeleton, fi = sk.bones.findIndex((b) => /forearm/.test(b.name)), si = jacket.geometry.attributes.skinIndex, sw = jacket.geometry.attributes.skinWeight, ft = jacket.geometry.attributes.fpTorso;
  for (let i = 0; i < si.count; i++) if (si.getComponent(i, 0) === fi && sw.getComponent(i, 0) > 0.9) assert.ok(ft.getX(i) < 0.1);
});

test("the hands' uvs come onto their one tile, alike for both hands, and the rest onto a plain corner, once", async () => {
  const THREE = await import("three"); const { handUV } = await import("../src/lib/world3d/fpRig.js");
  const g = new THREE.BufferGeometry(); g.setAttribute("uv", new THREE.Float32BufferAttribute([2.25, 0.5, 2.25, -1.5, 3.2, 0.3, 2.9, 0.06], 2));
  handUV(g); handUV(g);
  const uv = Array.from(g.attributes.uv.array).map((x) => Math.round(x * 1000) / 1000);
  assert.deepEqual(uv, [0.25, 0.5, 0.25, 0.5, 0.998, 0.998, 0.9, 0.06]);
});
