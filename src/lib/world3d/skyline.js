// ---- skyline: what's seen beyond the mapped square round a real place ----
// Two kinds of thing, kept apart:
// 1. Real landmarks at their real positions (LANDMARKS: from published coordinates and heights, with sources): Great
//    Yarmouth's Britannia Monument and the Scroby Sands wind farm, seen from Gorleston. The wind farm's 30 turbines
//    are at its published centre, hub height and rotor size; the exact layout of the rows isn't published here, so the
//    rows are laid out evenly along the sandbank (approximate, and said so).
// 2. An indicative town: low two- and three-storey roofs over the land beyond the mapped square (OpenStreetMap is
//    only fetched for 1.2 km round the mark). These are not real buildings: they stand for "the town goes on" so the
//    horizon isn't bare, are kept low and hazed, and are described as indicative where the place is credited.
// Everything far is hazed towards the sky's own haze colour each frame, so it sits back in the air at any hour.
import * as THREE from "three";
import { projector, PLACE3D, inside } from "./osmPlace.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const merge = (geos) => mergeGeometries(geos, false);

/** Landmarks: lat, lon, and what to draw. Sources in the comments. */
export const LANDMARKS = [
  // Britannia Monument (Nelson's Monument), South Denes, Great Yarmouth: Grade I listed (List entry 1246057), position
  // from the listing (52.588439, 1.733643); a fluted Doric column about 44 m high with Britannia on top.
  { id: "britannia-monument", lat: 52.588439, lon: 1.733643, kind: "column", h: 44 },
  // Scroby Sands offshore wind farm: 30 Vestas 2 MW turbines, centre 52.6489, 1.7903, hub 68 m, rotor 80 m
  // (Wikipedia, "Scroby Sands Wind Farm"). Layout approximate: three rows of ten along the bank.
  { id: "scroby-sands", lat: 52.6489, lon: 1.7903, kind: "windfarm", n: 30, rows: 3, hub: 68, rotor: 80, bearing: 18 },
];
export const SKYLINE_NOTE = "Landmarks beyond the mapped area are placed from published positions; the distant town is indicative, not mapped buildings.";

const NEAR_AS = 4200; // metres: the furthest anything is drawn (the camera sees to 5 km)
const hazeMat = (hex, k, opts = {}) => {
  const base = new THREE.Color(hex), m = new THREE.MeshLambertMaterial({ color: hex, fog: false, ...opts });
  m.userData.haze = { base, k }; return m;
};
// each frame (onBeforeRender), mix the material towards the scene's haze by its distance
const hazed = (mesh, dist, far) => {
  const m = mesh.material, h = m.userData.haze, k = Math.min(0.9, h.k * (dist / far));
  mesh.onBeforeRender = (r, scene) => { if (scene.fog) m.color.copy(h.base).lerp(scene.fog.color, k); };
};

/**
 * Builds the skyline for a real place into `group`. place: the built place (origin, land rings). Returns
 * { turbines, update(t) } (the rotors turn slowly), or null when nothing applies.
 */
export function buildSkyline(group, place, { groundY = 2.2, quality = 1 } = {}) {
  if (!place?.origin) return null;
  const [lat0, lon0] = place.origin, P = projector(lat0, lon0), H = PLACE3D.box;
  const far = 9000, rotors = [];
  for (const L of LANDMARKS) {
    const [x, z] = P(L.lat, L.lon), d = Math.hypot(x, z);
    if (d > 12000 || d < H) continue;
    if (L.kind === "column") {
      // one mesh (the pieces merged): a plinth, the pedestal, the fluted column, the capital and the caryatids' drum,
      // Britannia on her globe
      const geos = [[new THREE.BoxGeometry(7, 2, 7), 1], [new THREE.BoxGeometry(4.6, 6, 4.6), 5], [new THREE.CylinderGeometry(1.25, 1.45, L.h - 14, 16), 8 + (L.h - 14) / 2],
        [new THREE.BoxGeometry(3.2, 0.8, 3.2), L.h - 5.6], [new THREE.CylinderGeometry(1.1, 1.4, 2.4, 10), L.h - 4], [new THREE.SphereGeometry(0.9, 10, 8), L.h - 2.2], [new THREE.ConeGeometry(0.55, 2.2, 8), L.h - 0.6]]
        .map(([g, y]) => g.translate(0, y, 0).toNonIndexed());
      const m = new THREE.Mesh(merge(geos), hazeMat(0xd9d2c2, 0.75)); m.position.set(x, groundY, z); group.add(m); hazed(m, d, far);
    } else if (L.kind === "windfarm") {
      // instanced: the towers in one draw, the blades in another (their matrices turned each frame)
      const white = hazeMat(0xe9ecee, 0.9), b = (L.bearing * Math.PI) / 180, along = [Math.sin(b), -Math.cos(b)], across = [Math.cos(b), Math.sin(b)];
      const per = Math.ceil(L.n / L.rows), sp = 330, rowSp = 480, face = Math.atan2(-across[0], -across[1]); // (facing the prevailing south-west wind, roughly)
      const tower = new THREE.CylinderGeometry(1.6, 2.4, L.hub, 8); tower.translate(0, L.hub / 2, 0);
      const blade = new THREE.BoxGeometry(1.4, L.rotor / 2, 0.4); blade.translate(0, L.rotor / 4, 0);
      const spots = [];
      for (let r = 0; r < L.rows; r++) for (let i = 0; i < per && r * per + i < L.n; i++) {
        const o = (i - (per - 1) / 2) * sp, q = (r - (L.rows - 1) / 2) * rowSp;
        const tx = x + along[0] * o + across[0] * q, tz = z + along[1] * o + across[1] * q, td = Math.hypot(tx, tz);
        // (past the camera's far plane each one is drawn nearer and smaller in proportion: from the pier it looks the same)
        const sc = Math.min(1, NEAR_AS / td); spots.push({ x: tx * sc, z: tz * sc, sc, ph: (r * 7 + i * 3) % 6 });
      }
      const towers = new THREE.InstancedMesh(tower, white, spots.length), blades = new THREE.InstancedMesh(blade, white, spots.length * 3), mx = new THREE.Matrix4();
      spots.forEach((p, k) => { mx.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion(), new THREE.Vector3(p.sc, p.sc, p.sc)); towers.setMatrixAt(k, mx); });
      for (const m of [towers, blades]) { m.frustumCulled = false; group.add(m); hazed(m, d, far); }
      const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face), qb = new THREE.Quaternion(), z1 = new THREE.Vector3(0, 0, 1), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      rotors.push({ update(t) { spots.forEach((p, k) => { for (let j = 0; j < 3; j++) { qb.setFromAxisAngle(z1, t * 1.6 + p.ph + (j * Math.PI * 2) / 3); mx.compose(pv.set(p.x, L.hub * p.sc, p.z), qa.clone().multiply(qb), sv.setScalar(p.sc)); blades.setMatrixAt(k * 3 + j, mx); } }); blades.instanceMatrix.needsUpdate = true; } });
      rotors[rotors.length - 1].update(0);
    }
  }
  // ---- the indicative town: low roofs over the land beyond the mapped square ----
  const land = place.land || [];
  if (land.length) {
    const step = quality < 1 ? 85 : 60, R = 2600, out = [];
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let gx = -R; gx <= R; gx += step) for (let gz = -R; gz <= R; gz += step) {
      if (Math.max(Math.abs(gx), Math.abs(gz)) < H + 40) continue; // (the mapped square has its real buildings)
      const jx = gx + (rnd() - 0.5) * step * 0.6, jz = gz + (rnd() - 0.5) * step * 0.6, d = Math.hypot(jx, jz);
      if (d > R || rnd() < 0.35) continue;
      if (!land.some((r) => inside([jx, jz], r))) continue;
      // not right at the shore: a few metres in from any water
      if (![[30, 0], [-30, 0], [0, 30], [0, -30]].every(([dx, dz]) => land.some((r) => inside([jx + dx, jz + dz], r)))) continue;
      out.push([jx, jz, d]);
    }
    if (out.length) {
      const n = out.length, wall = new THREE.BoxGeometry(1, 1, 1); wall.translate(0, 0.5, 0);
      const roof = new THREE.CylinderGeometry(0, 0.72, 1, 4, 1); roof.rotateY(Math.PI / 4); roof.translate(0, 0.5, 0); // (a hipped roof: a low square pyramid)
      const wm = new THREE.InstancedMesh(wall, new THREE.MeshLambertMaterial({ color: 0xffffff }), n), rm = new THREE.InstancedMesh(roof, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
      const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      const BRICK = [0xb9a48e, 0xa78e78, 0xc8b8a4, 0xd6cfc2, 0x9a8676], SLATE = [0x5d5f63, 0x6b5148, 0x7a4a3c, 0x55585c];
      out.forEach(([x, z, d], i) => {
        const w = 8 + rnd() * 10, dep = 7 + rnd() * 6, h = 5.5 + rnd() * (d < 1400 ? 5 : 3.5), rh = 2.2 + rnd() * 1.6;
        q.setFromAxisAngle(up, Math.round(rnd() * 3) * (Math.PI / 2) + (rnd() - 0.5) * 0.3);
        mx.compose(new THREE.Vector3(x, groundY, z), q, new THREE.Vector3(w, h, dep)); wm.setMatrixAt(i, mx);
        mx.compose(new THREE.Vector3(x, groundY + h, z), q, new THREE.Vector3(w * 1.02, rh, dep * 1.02)); rm.setMatrixAt(i, mx);
        const k = Math.min(0.85, 0.25 + d / 3200); // (further, paler)
        wm.setColorAt(i, c.setHex(BRICK[i % BRICK.length])); rm.setColorAt(i, c.setHex(SLATE[(i * 7) % SLATE.length]));
        void k;
      });
      for (const m of [wm, rm]) { m.instanceColor.needsUpdate = true; m.frustumCulled = false; group.add(m); }
    }
  }
  return {
    count: rotors.length,
    /** the rotors turning (slowly, about 15 turns a minute, each its own phase) */
    update(t) { for (const r of rotors) r.update(t); },
  };
}
