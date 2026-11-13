// ---- fpIk: the arm's own geometry for the first-person rig (fpRig.js) ----
// Two-bone IK from the shoulder (the elbow on the circle where an upper arm and forearm of their own lengths meet,
// bent towards a pole), and the wrist's angles measured the way the Blender gates measure them
// (source-assets/blender/rig/lib/gatelib_v1.py), so a grip chosen here for comfort is judged by the same numbers.
// Nothing here stretches a bone: a target out of reach is met as near as the straight arm gets, and the shortfall is
// returned so the caller can do something honest about it (bring the shoulder forward, slide the hand along a handle).
import * as THREE from "three";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = 180 / Math.PI;

/**
 * The elbow for a shoulder S, a wrist target W, an upper arm L1 and a forearm L2 long, bent towards the pole direction P
 * (only its part square to the shoulder-to-wrist line counts). Returns { elbow, wrist, short }: where the elbow and the
 * wrist go (the wrist is W itself when it's within reach) and how far short of W the straight arm stops (0 if not).
 */
export function twoBone(S, W, L1, L2, P) {
  const v = W.clone().sub(S); let d = v.length();
  const n = d > 1e-9 ? v.multiplyScalar(1 / d) : new THREE.Vector3(0, -1, 0);
  const max = L1 + L2 - 1e-4, min = Math.abs(L1 - L2) + 1e-4, short = Math.max(0, d - max);
  d = clamp(d, min, max);
  const x = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  const p = P.clone().addScaledVector(n, -P.dot(n));
  if (p.lengthSq() < 1e-10) { p.set(0, -1, 0).addScaledVector(n, n.y); if (p.lengthSq() < 1e-10) p.set(1, 0, 0).addScaledVector(n, -n.x); }
  p.normalize();
  return { elbow: S.clone().addScaledVector(n, x).addScaledVector(p, h), wrist: S.clone().addScaledVector(n, d), short };
}

/**
 * The wrist's angles in degrees, as the gates measure them: flex (the palm bent towards the forearm's palm side is
 * positive), rad (bent towards the thumb), pron (the forearm's turn, from palm in), elbow (the elbow's inside angle).
 * hand: the hand's rotation (a quaternion); loc: the palm's own frame in the hand bone's frame ({ k: across the
 * knuckles towards the first finger, palm: the way the palm faces, along: towards the fingers }); side "L" or "R".
 */
export function wristAngles(S, E, W, hand, loc, side) {
  const kw = loc.k.clone().applyQuaternion(hand), pw = loc.palm.clone().applyQuaternion(hand), aw = loc.along.clone().applyQuaternion(hand);
  const fo = W.clone().sub(E).normalize();
  const flex = Math.atan2(-fo.dot(pw), fo.dot(aw)) * DEG, rad = Math.atan2(-fo.dot(kw), fo.dot(aw)) * DEG;
  const se = E.clone().sub(S), u = se.clone().addScaledVector(fo, -se.dot(fo)).normalize();
  const nArm = se.clone().cross(W.clone().sub(E)).normalize(); if (side === "R") nArm.negate();
  const pp = pw.clone().addScaledVector(fo, -pw.dot(fo)).normalize();
  const elbow = S.clone().sub(E).angleTo(W.clone().sub(E)) * DEG;
  return { flex, rad, pron: Math.atan2(pp.dot(u), pp.dot(nArm)) * DEG, elbow };
}

/** How far outside a wrist's and elbow's natural range an arm is (0 inside it), weighted as the gates weigh it. */
export function limitsPen({ flex, rad, pron, elbow }) {
  return (Math.max(0, flex - 55) + Math.max(0, -45 - flex)) * 0.15 + (Math.max(0, rad - 15) + Math.max(0, -30 - rad)) * 0.15
    + (Math.max(0, pron - 85) + Math.max(0, -75 - pron)) * 0.12 + (Math.max(0, elbow - 150) + Math.max(0, 60 - elbow)) * 0.1;
}

/** The rotation taking the pair of directions (a0, b0) onto (a1, b1) (each pair made square first). */
export function pairRotation(a0, b0, a1, b1) {
  const m = (a, b) => { const x = a.clone().normalize(), y = b.clone().addScaledVector(x, -b.dot(x)).normalize(), z = x.clone().cross(y); return new THREE.Matrix4().makeBasis(x, y, z); };
  const M0 = m(a0, b0), M1 = m(a1, b1);
  return new THREE.Quaternion().setFromRotationMatrix(M1.multiply(M0.transpose()));
}

/** The turn of q about the unit axis ax (radians): the twist part of a swing-twist split. */
export function twistAbout(q, ax) {
  const p = q.x * ax.x + q.y * ax.y + q.z * ax.z;
  let a = 2 * Math.atan2(p, q.w); if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
