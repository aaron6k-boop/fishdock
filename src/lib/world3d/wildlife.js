// ---- wildlife: gulls over the water and a few boats out at sea (coastal places only) ----
// A handful of herring gulls wheel over the harbour or beach, flapping and gliding, and one or two sit on the lamp
// posts; out at sea a couple of small boats ride the swell, far off, with a masthead light after dark. Nothing here is a
// record of anything: it's the kind of life you'd see at a British seaside place, kept sparse so it never clutters, and
// left out at rivers and lakes (which aren't a gull's harbour and have no sea for boats). Cheap: a few small meshes.
import * as THREE from "three";

const rngOf = (seed) => { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// a herring gull: white body and head, grey wings with black tips, yellow beak; wings pivot at the shoulders
function gullMesh(mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mats.white); body.scale.set(0.085, 0.075, 0.26); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.white); head.position.set(0, 0.05, -0.24); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 5), mats.beak); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.04, -0.32); g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), mats.white); tail.rotation.x = Math.PI / 2; tail.scale.set(1.3, 0.3, 1); tail.position.set(0, 0, 0.3); g.add(tail);
  const wing = (s) => {
    // a long tapering wing, swept back a little, grey with a black tip (vertex colours)
    const pos = [0, 0, -0.09, 0, 0, 0.1, 0.36 * s, 0.01, 0.07, 0.36 * s, 0.01, -0.07, 0.68 * s, 0, 0.12, 0.7 * s, 0, 0.05];
    const grey = [0.66, 0.69, 0.72], dark = [0.08, 0.08, 0.09];
    const col = [...grey, ...grey, ...grey, ...grey, ...dark, ...dark];
    const idx = s > 0 ? [0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5] : [0, 2, 1, 0, 3, 2, 3, 4, 2, 3, 5, 4];
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const pivot = new THREE.Group(); pivot.position.set(0.05 * s, 0.03, -0.03); pivot.add(new THREE.Mesh(geo, mats.wing)); g.add(pivot); return pivot;
  };
  g.userData.wings = [wing(-1), wing(1)];
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// a small boat: a hull narrowing to the bow, a wheelhouse and a mast with a light
function boatMesh(mats, rnd) {
  const g = new THREE.Group(), L = 8 + rnd() * 5, W = L * 0.32;
  const hg = new THREE.BoxGeometry(W, 1.3, L, 2, 1, 6), p = hg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / L, y = p.getY(i);
    let x = p.getX(i);
    if (z < -0.2) x *= Math.max(0.05, 1 - ((-z - 0.2) / 0.3) ** 1.6); // the bow
    if (y < 0) x *= 0.7; // a rounded bottom
    p.setX(i, x); if (z < -0.4 && y > 0) p.setY(i, y + 0.25);
  }
  hg.computeVertexNormals();
  const hull = new THREE.Mesh(hg, mats.hulls[Math.floor(rnd() * mats.hulls.length)]); hull.position.y = 0.3; g.add(hull);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 1.5, L * 0.28), mats.cabin); cab.position.set(0, 1.65, L * 0.08); g.add(cab);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 6), mats.mast); mast.position.set(0, 3.3, -L * 0.12); g.add(mast);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mats.light); light.position.set(0, 5.6, -L * 0.12); g.add(light);
  g.userData.L = L;
  return g;
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
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 }), beak: new THREE.MeshStandardMaterial({ color: 0xe8b82c, roughness: 0.6 }),
    wing: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    hulls: [0xf0efe9, 0x22466e, 0xa8322c, 0x2f6b4f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
    cabin: new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7 }), mast: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.4 }),
    light: new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffe8b0, emissiveIntensity: 0 }),
  };
  // ---- gulls: four or five wheeling, up to two perched ----
  const gulls = [];
  const nFly = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < nFly; i++) {
    const m = gullMesh(mats); group.add(m);
    gulls.push({ m, fly: true, cx: centre[0] + (rnd() - 0.5) * 60, cz: centre[1] + (rnd() - 0.5) * 60, r: 14 + rnd() * 26, h: 9 + rnd() * 14, w: (0.12 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), a: rnd() * Math.PI * 2, ph: rnd() * 10 });
  }
  const sitOn = [...perches].sort(() => rnd() - 0.5).slice(0, Math.min(2, perches.length));
  for (const p of sitOn) { const m = gullMesh(mats); m.position.set(p[0], p[1] + 0.12, p[2]); m.rotation.y = rnd() * Math.PI * 2; for (const w of m.userData.wings) w.rotation.z = 0; m.userData.wings.forEach((w, k) => { w.rotation.y = k ? -1.35 : 1.35; }); group.add(m); gulls.push({ m, fly: false, ph: rnd() * 10 }); }
  // ---- boats: only where there's open water well away from any land ----
  const boats = [];
  if (waterAt) {
    const clear = (x, z, r) => { for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (!waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; } return waterAt(x, z); };
    const spots = [];
    for (let tries = 0; tries < 400 && spots.length < 3; tries++) {
      const x = centre[0] + (rnd() - 0.5) * 2 * box, z = centre[1] + (rnd() - 0.5) * 2 * box, d = Math.hypot(x - centre[0], z - centre[1]);
      if (d < 180 || d > box) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 120)) continue;
      // open water all round it, and open water all the way from the anglers to it (never beyond a pier or the land)
      let seen = true; for (let k = 60; k < d; k += 12) { const f = k / d; if (!waterAt(centre[0] + (x - centre[0]) * f, centre[1] + (z - centre[1]) * f)) { seen = false; break; } }
      if (seen && clear(x, z, 70) && clear(x, z, 35)) spots.push([x, z]);
    }
    for (const [x, z] of spots) { const m = boatMesh(mats, rnd); m.position.set(x, 0, z); const head = rnd() * Math.PI * 2; m.rotation.y = head; group.add(m); boats.push({ m, x, z, head, v: 0.6 + rnd() * 1.2, ph: rnd() * 10, x0: x, z0: z }); }
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
      for (const b of boats) {
        // a slow course back and forth, riding the swell
        const s = Math.sin(t * 0.02 * b.v + b.ph) * 60;
        b.m.position.set(b.x0 + Math.sin(b.head) * s, Math.sin(t * 0.7 + b.ph) * 0.25 * (0.5 + swell), b.z0 - Math.cos(b.head) * s);
        b.m.rotation.set(Math.sin(t * 0.55 + b.ph) * 0.05 * (0.5 + swell), b.head + (Math.cos(t * 0.02 * b.v + b.ph) > 0 ? 0 : Math.PI), Math.sin(t * 0.8 + b.ph * 2) * 0.07 * (0.5 + swell));
      }
      mats.light.emissiveIntensity = night > 0.3 ? 2.5 * Math.min(1, night) : 0;
    },
    dispose() { parent.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); }); for (const m of Object.values(mats).flat()) m.dispose?.(); },
  };
}
