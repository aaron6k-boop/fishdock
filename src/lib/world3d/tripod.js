// ---- tripod: a sea angler's rod tripod, for the rod to rest in while you wait for a bite ----
// Three telescopic aluminium legs from a head with two rubber rod cradles, and the butt cups on a bar clamped to the leg
// nearest you, as pier and beach tripods are made. The rod lies in the cradle nearer you with its butt in the cup below
// it, at about 67 degrees: high, as anglers set them, so the line stays up over the rail and the surf and the tip shows
// every knock. tripodPlan says where each part goes (no drawing, so it can be tested); buildTripod draws it as two
// meshes (the metal, and the black plastic and rubber).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// (metres, in the angler's own frame: x right, y up, -z ahead)
export const TRIPOD = {
  rise: 1.1, back: 0.47, // the butt's place below and behind where the rod rests in the cradle: 67 degrees up
  side: 0.1, // each cradle and cup either side of the middle; the rod's in the left-hand one, nearer you
  // the two front feet either side of the head and just ahead of it: 11 cm in from the railing's line, clear of its posts'
  // base plates (8 cm round) and the braces between them. (At 2 cm in, wherever you stood by a post, a foot stood
  // in its plate, or a leg went through a brace)
  spread: 0.3, ahead: 0.01,
  rodR: 0.011, // the blank's radius where it lies in the cradle (angler.js gives each rod's own)
  cradleR: 0.026, cradleT: 0.0065, // the rubber U: its radius to the middle of the rubber, and the rubber's own
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Where everything goes for a rod resting at `top` (the point on the rod's axis where it lies in the cradle): its butt,
 * the head, the three feet, the cup bar and the cups, the two cradles.
 */
export function tripodPlan(top, rodR = TRIPOD.rodR) {
  const T = TRIPOD, cx = top.x + T.side;
  const butt = V(top.x, top.y - T.rise, top.z + T.back);
  // (the head 10 cm under the cradles, so the bar across it passes 3 cm under the rod: 6 cm under, the bar went 1.4 mm
  // into the blank as it lay, and 7 mm as it was lifted out)
  const hub = V(cx, top.y - 0.1, top.z);
  const bar = V(cx, butt.y - 0.035, butt.z); // (the cup bar: clamped to the rear leg, the cups' bottoms on it)
  const k = hub.y / (hub.y - bar.y), rear = hub.clone().add(bar.clone().sub(hub).multiplyScalar(k)); rear.y = 0;
  const feet = [V(cx - T.spread, 0, top.z - T.ahead), V(cx + T.spread, 0, top.z - T.ahead), rear];
  const dir = top.clone().sub(butt).normalize();
  // the cradle's U is square to the rod, opening away from the ground (up, and back towards you): the rod lies in the
  // bottom of it along its length, and lifts straight out of its open side. (It used to stand upright, square only to
  // the rod's heading: at 67 degrees the rod went in through the rubber at the bottom of the U, 9 mm deep)
  const open = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
  return { top: top.clone(), butt, dir, open, rodR, hub, bar, feet, cups: [-1, 1].map((s) => V(cx + s * T.side, butt.y, butt.z)), cradles: [-1, 1].map((s) => V(cx + s * T.side, top.y, top.z)) };
}

/** Where the bottom of a cradle's U is (the middle of the rubber, under the rod): the post comes up to it. */
export const cradleFoot = (P, c) => c.clone().addScaledVector(P.open, -(P.rodR + TRIPOD.cradleT));

// ---- the drawing ----
const Y = V(0, 1, 0);
function tube(a, b, r0, r1 = r0, seg = 10, open = false) {
  const d = b.clone().sub(a), len = d.length() || 1e-4, g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.multiplyScalar(1 / len));
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}
// half a torus, the U, with its two ends rounded off. (Until 17 November the ends were left open: from most places you
// saw into the tube past its own back faces, and the two Us of each rest head, one inside the other, showed against the
// sea as black torn shapes with ragged points rather than a rubber U)
function roundedU(R, r) {
  const g = new THREE.TorusGeometry(R, r, 12, 28, Math.PI); g.rotateZ(Math.PI);
  const ends = [-1, 1].map((s) => new THREE.SphereGeometry(r, 14, 10).translate(s * R, 0, 0));
  return mergeGeometries([g, ...ends]);
}
function cradle(at, P) {
  // a U of rubber the rod lies in, square to the rod, its inside resting on the rod's underside
  const { cradleR: R, cradleT: r } = TRIPOD, g = roundedU(R, r);
  // (the torus lies in its own x-y plane, the half drawn below its middle: x across the rod, y the open side, z along it)
  const x = new THREE.Vector3().crossVectors(P.open, P.dir).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, P.open, P.dir));
  return g.applyMatrix4(new THREE.Matrix4().compose(at.clone().addScaledVector(P.open, R - r - P.rodR), q, V(1, 1, 1)));
}
function cup(at, dir) {
  // a butt cup: open at the top, round the end of the rod, the butt standing on its floor; flared, with a rolled rim
  const bottom = at.clone().addScaledVector(dir, -0.001), top = at.clone().addScaledVector(dir, 0.075);
  const rim = new THREE.TorusGeometry(0.0285, 0.0032, 8, 22); rim.applyMatrix4(new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir), V(1, 1, 1)));
  return [tube(bottom, top, 0.022, 0.0285, 22, true), tube(bottom.clone().addScaledVector(dir, -0.008), bottom, 0.023, 0.022, 22), rim];
}
// a rest head's rubber is thicker than the U the rod lies in: a rim round its outside, the same shape, wider and further
// out (never nearer the rod than the U itself)
function outerU(at, P) {
  const { cradleR: R, cradleT: r } = TRIPOD, g = roundedU(R + 0.006, r + 0.004);
  const x = new THREE.Vector3().crossVectors(P.open, P.dir).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, P.open, P.dir));
  return g.applyMatrix4(new THREE.Matrix4().compose(at.clone().addScaledVector(P.open, R - r - P.rodR), q, V(1, 1, 1)));
}
/**
 * A bank stick's rest head for a rod lying along `dir` with its axis through `at` (radius rodR there): the rubber U,
 * and the point the stick comes up to under it. (By a river or a lake: two sticks, a head on each)
 */
export function restHead(at, dir, rodR) {
  const open = V(0, 1, 0).addScaledVector(dir, -dir.y).normalize(), P = { dir, open, rodR };
  return { geo: cradle(at, P), foot: cradleFoot(P, at).addScaledVector(open, -TRIPOD.cradleT * 0.5) };
}
const flat = (gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal") g.deleteAttribute(n); return g; }));

let mats = null;
const materials = () => (mats ||= {
  // (16 November, Aaron: the rest "just looks blocky". It was thin black sticks and a small black block: now drawn as a
  // sea tripod is made, silver anodised legs with black clamps and a red-anodised trim ring at each, a cast head the
  // legs hinge from, rubber feet, a chunky rubber rest head on each post and flared butt cups)
  metal: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.9, roughness: 0.3 }), // (anodised aluminium, satin)
  black: new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.05, roughness: 0.5 }), // (moulded plastic: the clamps, caps and cups)
  rubber: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: 0, roughness: 0.78 }), // (the rest heads and the feet: black rubber, which is a dark grey with a soft sheen, not the near-black 0x0d0e0f it was, which drew the heads as flat silhouettes)
  cast: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.65, roughness: 0.45 }), // (the head's cast body)
  trim: new THREE.MeshStandardMaterial({ color: 0xb3202a, metalness: 0.6, roughness: 0.35 }), // (a red anodised ring at each clamp)
});

/** The tripod as a group, and place(plan) to set it up for a plan from tripodPlan. */
export function buildTripod() {
  const M = materials(), group = new THREE.Group(); group.name = "tripod";
  const parts = Object.fromEntries(Object.keys(M).map((k) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), M[k]); m.castShadow = true; m.receiveShadow = true; group.add(m); return [k, m]; }));
  function place(P) {
    const G = { metal: [], black: [], rubber: [], cast: [], trim: [] };
    // a collar round a tube: its axis from a to b, radius r (a clamp, a cap)
    const collar = (k, a, b, r, seg = 18) => G[k].push(tube(a, b, r, r, seg));
    const up = V(0, 1, 0);
    for (const f of P.feet) {
      const ax = f.clone().sub(P.hub).normalize(), out = V(f.x - P.hub.x, 0, f.z - P.hub.z); if (out.lengthSq() < 1e-8) out.set(0, 0, 1); out.normalize();
      const side = out.clone().addScaledVector(ax, -out.dot(ax)).normalize(), across = new THREE.Vector3().crossVectors(ax, side).normalize();
      // (each leg hinges from the head's side: it starts at the cast body's edge, not its middle)
      const start = P.hub.clone().addScaledVector(ax, 0.045), mid = P.hub.clone().lerp(f, 0.52), end = f.clone().addScaledVector(ax, -0.03);
      // the upper (outer) tube, 31 mm, and the lower (inner) one sliding out of it, 24 mm
      G.metal.push(tube(start, mid, 0.0155, 0.0155, 20), tube(mid, end, 0.012, 0.012, 20));
      // the hinge at the head: a lug either side of the leg's top and the pin across them
      G.cast.push(tube(start.clone().addScaledVector(across, -0.02), start.clone().addScaledVector(across, 0.02), 0.012, 0.012, 14));
      // the leg lock: a black collar where the tubes meet, a red trim ring at its top, the lever folded flat along it
      collar("black", mid.clone().addScaledVector(ax, -0.045), mid.clone().addScaledVector(ax, 0.02), 0.0205);
      collar("trim", mid.clone().addScaledVector(ax, -0.051), mid.clone().addScaledVector(ax, -0.045), 0.021);
      const l0 = mid.clone().addScaledVector(ax, -0.035).addScaledVector(side, 0.024);
      G.black.push(tube(l0, l0.clone().addScaledVector(ax, 0.07).addScaledVector(side, 0.004), 0.0065, 0.005, 10));
      // a black end cap on the upper tube's top, under the hinge
      collar("black", start.clone().addScaledVector(ax, -0.004), start.clone().addScaledVector(ax, 0.012), 0.0165);
      // the rubber foot: a cup flaring to the deck
      G.rubber.push(tube(f, end.clone().addScaledVector(ax, 0.008), 0.026, 0.0145, 18));
    }
    // the head: a cast body the legs hinge from, a cap on it, and the hook under it for a bag or a weight to steady it in
    // a wind, as sea tripods have
    G.cast.push(tube(P.hub.clone().add(V(0, -0.05, 0)), P.hub.clone().add(V(0, 0.025, 0)), 0.042, 0.036, 24));
    G.black.push(tube(P.hub.clone().add(V(0, 0.025, 0)), P.hub.clone().add(V(0, 0.034, 0)), 0.03, 0.026, 24));
    { const h0 = P.hub.clone().add(V(0, -0.05, 0)), h1 = h0.clone().add(V(0, -0.055, 0)); G.metal.push(tube(h0, h1, 0.0032, 0.0032, 8));
      const hk = new THREE.TorusGeometry(0.014, 0.0032, 6, 14, Math.PI * 1.3); hk.rotateZ(Math.PI * 0.85); hk.translate(h1.x + 0.014 * Math.cos(Math.PI * 1.85), h1.y - 0.004, h1.z); G.metal.push(hk); }
    // the rest bar across the head (under the rod: tripod.test.js), black caps on its ends
    const hx = (s) => P.hub.clone().add(V(s * (TRIPOD.side + 0.04), 0.02, 0));
    G.metal.push(tube(hx(-1), hx(1), 0.0095, 0.0095, 18));
    for (const sgn of [-1, 1]) collar("black", hx(sgn), hx(sgn).add(V(sgn * 0.014, 0, 0)), 0.0115);
    // each post leans forward a little, up from the bar into the bottom of its rest head: a thumb-screw where it meets
    // the bar, and the rest head's rubber: the U the rod lies in, a thicker rim round its outside and a boss under it
    for (const c of P.cradles) {
      const foot = cradleFoot(P, c), base = V(c.x, P.hub.y + 0.02, c.z), top = foot.clone().addScaledVector(P.open, -TRIPOD.cradleT * 0.5);
      G.metal.push(tube(base, top, 0.0075, 0.0075, 12));
      G.black.push(tube(base.clone().add(V(0, 0, 0.012)), base.clone().add(V(0, 0, 0.03)), 0.007, 0.007, 12), tube(base.clone().add(V(0, 0, 0.03)), base.clone().add(V(0, 0, 0.036)), 0.011, 0.011, 12));
      G.rubber.push(cradle(c, P), outerU(c, P), tube(top.clone().addScaledVector(P.open, -0.022), top.clone().addScaledVector(P.open, 0.002), 0.011, 0.013, 14));
    }
    // the cup bar, clamped to the rear leg (black clamp, red ring), black caps on its ends, and the two cups on it
    const bx = (s) => P.bar.clone().add(V(s * (TRIPOD.side + 0.04), 0, 0));
    G.metal.push(tube(bx(-1), bx(1), 0.0095, 0.0095, 18));
    for (const sgn of [-1, 1]) collar("black", bx(sgn), bx(sgn).add(V(sgn * 0.014, 0, 0)), 0.0115);
    collar("black", P.bar.clone().add(V(0, -0.03, 0)), P.bar.clone().add(V(0, 0.025, 0)), 0.021);
    collar("trim", P.bar.clone().add(V(0, 0.025, 0)), P.bar.clone().add(V(0, 0.031, 0)), 0.0215);
    for (const c of P.cups) { G.black.push(...cup(c, P.dir)); G.metal.push(tube(V(c.x, P.bar.y, c.z), c.clone().addScaledVector(P.dir, -0.018), 0.007, 0.007, 10)); }
    for (const k of Object.keys(parts)) { parts[k].geometry.dispose(); parts[k].geometry = G[k].length ? flat(G[k]) : new THREE.BufferGeometry(); }
  }
  return { group, place };
}
