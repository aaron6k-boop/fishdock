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
  spread: 0.3, ahead: 0.1, // the two front feet either side and ahead of the head
  rodR: 0.011, // the blank's radius where it lies in the cradle
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Where everything goes for a rod resting at `top` (the point on the rod's axis where it lies in the cradle): its butt,
 * the head, the three feet, the cup bar and the cups, the two cradles.
 */
export function tripodPlan(top) {
  const T = TRIPOD, cx = top.x + T.side;
  const butt = V(top.x, top.y - T.rise, top.z + T.back);
  const hub = V(cx, top.y - 0.06, top.z);
  const bar = V(cx, butt.y - 0.035, butt.z); // (the cup bar: clamped to the rear leg, the cups' bottoms on it)
  const k = hub.y / (hub.y - bar.y), rear = hub.clone().add(bar.clone().sub(hub).multiplyScalar(k)); rear.y = 0;
  const feet = [V(cx - T.spread, 0, top.z - T.ahead), V(cx + T.spread, 0, top.z - T.ahead), rear];
  return { top: top.clone(), butt, dir: top.clone().sub(butt).normalize(), hub, bar, feet, cups: [-1, 1].map((s) => V(cx + s * T.side, butt.y, butt.z)), cradles: [-1, 1].map((s) => V(cx + s * T.side, top.y, top.z)) };
}

// ---- the drawing ----
const Y = V(0, 1, 0);
function tube(a, b, r0, r1 = r0, seg = 10, open = false) {
  const d = b.clone().sub(a), len = d.length() || 1e-4, g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.multiplyScalar(1 / len));
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
}
function cradle(at, along) {
  // a U of rubber the rod lies in, open upwards, across the rod
  const g = new THREE.TorusGeometry(0.026, 0.0065, 6, 14, Math.PI); g.rotateZ(Math.PI);
  const flat = V(along.x, 0, along.z); if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1); flat.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), flat);
  return g.applyMatrix4(new THREE.Matrix4().compose(V(at.x, at.y - TRIPOD.rodR - 0.0065 + 0.026, at.z), q, V(1, 1, 1)));
}
function cup(at, dir) {
  // a butt cup: open at the top, round the end of the rod
  const bottom = at.clone().addScaledVector(dir, -0.012), top = at.clone().addScaledVector(dir, 0.06);
  return [tube(bottom, top, 0.021, 0.025, 14, true), tube(bottom.clone().addScaledVector(dir, -0.006), bottom, 0.021, 0.021, 14)];
}
const flat = (gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal") g.deleteAttribute(n); return g; }));

let mats = null;
const materials = () => (mats ||= {
  metal: new THREE.MeshStandardMaterial({ color: 0xb5b9bd, metalness: 0.75, roughness: 0.38 }), // (anodised aluminium)
  black: new THREE.MeshStandardMaterial({ color: 0x1d1f22, metalness: 0.05, roughness: 0.62 }), // (moulded plastic, rubber)
});

/** The tripod as a group, and place(plan) to set it up for a plan from tripodPlan. */
export function buildTripod() {
  const M = materials(), group = new THREE.Group(); group.name = "tripod";
  const metal = new THREE.Mesh(new THREE.BufferGeometry(), M.metal), black = new THREE.Mesh(new THREE.BufferGeometry(), M.black);
  metal.castShadow = black.castShadow = true; group.add(metal, black);
  function place(P) {
    const ms = [], bs = [];
    for (const f of P.feet) {
      // each leg: the inner tube out of a thicker outer one, a clamp where they meet, a rubber foot
      const mid = P.hub.clone().lerp(f, 0.52);
      bs.push(tube(P.hub, mid, 0.0145, 0.0145, 10)); ms.push(tube(mid, f.clone().add(V(0, 0.025, 0)), 0.011, 0.011, 10));
      bs.push(tube(mid.clone().lerp(P.hub, 0.05), mid.clone().lerp(f, 0.04), 0.018, 0.018, 10));
      bs.push(tube(f, f.clone().add(V(0, 0.03, 0)), 0.017, 0.015, 10));
    }
    // the head: a block the legs meet at, a bar across it, a short post up to each cradle
    bs.push(tube(P.hub.clone().add(V(0, -0.035, 0)), P.hub.clone().add(V(0, 0.03, 0)), 0.03, 0.026, 12));
    const hx = (s) => P.hub.clone().add(V(s * (TRIPOD.side + 0.04), 0.02, 0));
    ms.push(tube(hx(-1), hx(1), 0.0095, 0.0095, 10));
    for (const c of P.cradles) { ms.push(tube(V(c.x, P.hub.y + 0.02, c.z), V(c.x, c.y - TRIPOD.rodR - 0.016, c.z), 0.007, 0.007, 8)); bs.push(cradle(c, P.dir)); }
    // the cup bar, clamped to the rear leg, and the two cups on it
    const bx = (s) => P.bar.clone().add(V(s * (TRIPOD.side + 0.04), 0, 0));
    ms.push(tube(bx(-1), bx(1), 0.0095, 0.0095, 10)); bs.push(tube(P.bar.clone().add(V(0, -0.025, 0)), P.bar.clone().add(V(0, 0.025, 0)), 0.02, 0.02, 10));
    for (const c of P.cups) { bs.push(...cup(c, P.dir)); ms.push(tube(V(c.x, P.bar.y, c.z), c.clone().addScaledVector(P.dir, -0.018), 0.007, 0.007, 8)); }
    metal.geometry.dispose(); black.geometry.dispose();
    metal.geometry = flat(ms); black.geometry = flat(bs);
  }
  return { group, place };
}
