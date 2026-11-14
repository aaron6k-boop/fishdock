// ---- wildlife: gulls over the water and a few boats out at sea (coastal places only) ----
// A handful of herring gulls wheel over the harbour or beach, flapping and gliding, and one or two sit on the lamp
// posts; out at sea a couple of small boats ride the swell, far off, with a masthead light after dark. Nothing here is a
// record of anything: it's the kind of life you'd see at a British seaside place, kept sparse so it never clutters, and
// left out at rivers and lakes (which aren't a gull's harbour and have no sea for boats). Cheap: a few small meshes.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { vesselMesh, vesselMaterials } from "./vessels3d.js";

const rngOf = (seed) => { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// a herring gull: white body and head, grey wings with black tips, yellow beak; wings pivot at the shoulders.
// All the gulls are drawn together, three draws in all (bodies, left wings, right wings: instanced), where each used
// to be six meshes of its own, six draw calls a gull, a fifth of everything drawn at Gorleston on a phone. Each gull
// keeps a little unseen frame of its own (gullRig) that's moved as before; its body's and wings' places are copied
// into the instances each frame.
function gullBodyGeometry() {
  const part = (geo, m, col) => { geo.applyMatrix4(m); geo.deleteAttribute("uv"); const g2 = geo.toNonIndexed(), n = g2.attributes.position.count, c = new Float32Array(n * 3); for (let k = 0; k < n; k++) c.set(col, k * 3); g2.setAttribute("color", new THREE.BufferAttribute(c, 3)); return g2; };
  const M = (pos, rot = [0, 0, 0], sc = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...sc));
  const white = [0.95, 0.95, 0.93], yellow = [0.91, 0.72, 0.17];
  return mergeGeometries([
    part(new THREE.SphereGeometry(1, 10, 8), M([0, 0, 0], [0, 0, 0], [0.085, 0.075, 0.26]), white),
    part(new THREE.SphereGeometry(0.06, 8, 6), M([0, 0.05, -0.24]), white),
    part(new THREE.ConeGeometry(0.014, 0.07, 5), M([0, 0.04, -0.32], [-Math.PI / 2, 0, 0]), yellow),
    part(new THREE.ConeGeometry(0.06, 0.14, 4), M([0, 0, 0.3], [Math.PI / 2, 0, 0], [1.3, 0.3, 1]), white),
  ]);
}
function gullWingGeometry(s) {
  // a long tapering wing, swept back a little, grey with a black tip (vertex colours)
  const pos = [0, 0, -0.09, 0, 0, 0.1, 0.36 * s, 0.01, 0.07, 0.36 * s, 0.01, -0.07, 0.68 * s, 0, 0.12, 0.7 * s, 0, 0.05];
  const grey = [0.66, 0.69, 0.72], dark = [0.08, 0.08, 0.09];
  const col = [...grey, ...grey, ...grey, ...grey, ...dark, ...dark];
  const idx = s > 0 ? [0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5] : [0, 2, 1, 0, 3, 2, 3, 4, 2, 3, 5, 4];
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// the unseen frame a gull is moved by: its body, and a pivot at each shoulder
function gullRig() {
  const g = new THREE.Object3D(), wings = [-1, 1].map((s) => { const p = new THREE.Object3D(); p.position.set(0.05 * s, 0.03, -0.03); g.add(p); return p; });
  g.userData.wings = wings; return g;
}

/**
 * venue: the kind of place; waterAt(x, z): true for open water (a real place's map, or the drawn layout's sea);
 * perches: [[x, y, z]] lamp tops a gull may sit on; centre: [x, z] where the anglers are; seed.
 * Returns { update(t, dt, { night, swell }), dispose() } or null where there's no wildlife to show.
 */
export function createWildlife(parent, { venue = "pier", waterAt = null, perches = [], centre = [0, 0], seed = 7, box = 500 } = {}) {
  if (venue === "river" || venue === "lake") return null;
  const rnd = rngOf(seed), group = new THREE.Group(); group.name = "wildlife"; parent.add(group);
  const mats = {
    bird: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
    wing: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    hulls: [0xf0efe9, 0x22466e, 0xa8322c, 0x2f6b4f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
    cabin: new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 }), mast: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.4 }),
    light: new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe8b0, emissiveIntensity: 0 }),
  };
  const vmats = vesselMaterials();
  // ---- gulls: four or five wheeling, up to two perched ----
  const gulls = [];
  const nFly = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < nFly; i++) {
    const m = gullRig();
    gulls.push({ m, fly: true, cx: centre[0] + (rnd() - 0.5) * 60, cz: centre[1] + (rnd() - 0.5) * 60, r: 14 + rnd() * 26, h: 9 + rnd() * 14, w: (0.12 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), a: rnd() * Math.PI * 2, ph: rnd() * 10 });
  }
  const sitOn = [...perches].sort(() => rnd() - 0.5).slice(0, Math.min(2, perches.length));
  for (const p of sitOn) { const m = gullRig(); m.position.set(p[0], p[1] + 0.12, p[2]); m.rotation.y = rnd() * Math.PI * 2; for (const w of m.userData.wings) w.rotation.z = 0; m.userData.wings.forEach((w, k) => { w.rotation.y = k ? -1.35 : 1.35; }); gulls.push({ m, fly: false, ph: rnd() * 10 }); }
  // (the three instanced meshes: bodies, left wings, right wings; moving, so never culled as a block)
  const bodies = new THREE.InstancedMesh(gullBodyGeometry(), mats.bird, Math.max(1, gulls.length));
  const wingIMs = [-1, 1].map((s) => new THREE.InstancedMesh(gullWingGeometry(s), mats.wing, Math.max(1, gulls.length)));
  for (const im of [bodies, ...wingIMs]) { im.castShadow = false; im.frustumCulled = false; im.count = gulls.length; group.add(im); }
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const show = () => { gulls.forEach((g, k) => {
    if (!g.m.visible) { bodies.setMatrixAt(k, HIDE); wingIMs[0].setMatrixAt(k, HIDE); wingIMs[1].setMatrixAt(k, HIDE); return; }
    g.m.updateMatrixWorld(true); bodies.setMatrixAt(k, g.m.matrixWorld); g.m.userData.wings.forEach((w, s) => wingIMs[s].setMatrixAt(k, w.matrixWorld)); });
    for (const im of [bodies, ...wingIMs]) im.instanceMatrix.needsUpdate = true; };
  show();
  // ---- boats: only where there's open water well away from any land ----
  const boats = [];
  if (waterAt) {
    const clear = (x, z, r) => { for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (!waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; } return waterAt(x, z); };
    const spots = [];
    // (well out: 320 m at the nearest and up to 650 m, where a working boat is a small thing on the water, not a toy at
    // the end of the pier; nearer only if the map's water gives nowhere further)
    for (const [near, far] of [[320, 650], [260, box]]) for (let tries = 0; tries < 500 && spots.length < 3; tries++) {
      const a0 = rnd() * Math.PI * 2, d = near + rnd() * (far - near), x = centre[0] + Math.sin(a0) * d, z = centre[1] - Math.cos(a0) * d;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 160)) continue;
      // open water all round it, and open water all the way from the anglers to it (never beyond a pier or the land)
      let seen = true; for (let k = 60; k < d; k += 12) { const f = k / d; if (!waterAt(centre[0] + (x - centre[0]) * f, centre[1] + (z - centre[1]) * f)) { seen = false; break; } }
      if (seen && clear(x, z, 70) && clear(x, z, 35)) spots.push([x, z]);
    }
    spots.forEach(([x, z], k) => {
      const m = vesselMesh(vmats, rnd, k % 2 ? "workboat" : "fishing"); m.position.set(x, 0, z); const head = rnd() * Math.PI * 2; m.rotation.y = head; group.add(m);
      // (its beat: a long narrow loop, 120 to 200 m by 30, at 2 to 3.5 m/s, so it holds a course, comes round and returns)
      boats.push({ m, head, v: 2 + rnd() * 1.5, ph: rnd() * 10, x0: x, z0: z, a: 120 + rnd() * 80, b: 30 });
    });
  }
  return {
    update(t, dt, { night = 0, swell = 0.3 } = {}) {
      // gulls rest after dark
      const awake = night < 0.6;
      for (const g of gulls) {
        g.m.visible = awake || !g.fly;
        if (!g.fly) { g.m.userData.wings.forEach((w) => { w.rotation.z = 0; }); g.m.rotation.y += Math.sin(t * 0.3 + g.ph) * 0.002; continue; }
        g.a += g.w * dt;
        const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r, y = g.h + Math.sin(t * 0.4 + g.ph) * 1.5;
        g.m.position.set(x, y, z);
        // facing along its circle, banked into the turn
        g.m.rotation.set(0, -g.a + (g.w > 0 ? Math.PI : 0), g.w > 0 ? -0.35 : 0.35, "YXZ");
        // flap a while, then glide with the wings held a little up
        const flapping = Math.sin(t * 0.35 + g.ph) > -0.2, f = flapping ? Math.sin(t * 9 + g.ph) * 0.55 : 0.12;
        g.m.userData.wings[0].rotation.z = -f; g.m.userData.wings[1].rotation.z = f;
      }
      if (gulls.length) show();
      for (const b of boats) {
        // round its beat, heading the way it goes, riding the swell: pitching a little, rolling a little more
        const th = (t * b.v) / b.a + b.ph, ca = Math.cos(th), sa = Math.sin(th), hx = Math.sin(b.head), hz = -Math.cos(b.head);
        const px = b.x0 + hx * ca * b.a + -hz * sa * b.b, pz = b.z0 + hz * ca * b.a + hx * sa * b.b;
        const vx = -hx * sa * b.a + -hz * ca * b.b, vz = -hz * sa * b.a + hx * ca * b.b; // (the way it is going)
        b.m.position.set(px, Math.sin(t * 0.7 + b.ph) * 0.18 * (0.5 + swell) - 0.05, pz);
        b.m.rotation.set(Math.sin(t * 0.55 + b.ph) * 0.035 * (0.5 + swell), Math.atan2(-vx, -vz), Math.sin(t * 0.8 + b.ph * 2) * 0.06 * (0.5 + swell));
        // (slower through the turns at the ends of the beat, and its wake shorter there)
        const way = Math.hypot(vx, vz) / b.a; if (b.m.userData.wake) b.m.userData.wake.scale.set(1, 1, 0.35 + 0.65 * way);
      }
      vmats.lamp.emissiveIntensity = night > 0.3 ? 3 * Math.min(1, night) : 0; vmats.wake.opacity = 0.32 * (1 - 0.8 * Math.min(1, night));
    },
    dispose() { parent.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); }); for (const m of [...Object.values(mats).flat(), ...Object.values(vmats)]) m.dispose?.(); },
  };
}
