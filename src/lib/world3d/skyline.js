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
  // Great Yarmouth Power Station, South Denes: the combined-cycle gas plant built 1998-2001, position 52.583884, 1.733255
  // (Wikipedia, "Great Yarmouth Power Station"). Its sizes aren't published: drawn at a typical single-shaft plant's
  // (a clad turbine hall about 70 x 35 m and 28 m high, the boiler house beside it, one exhaust stack about 60 m),
  // approximate, and said so where the place is credited.
  { id: "great-yarmouth-power", lat: 52.583884, lon: 1.733255, kind: "powerstation", approx: true },
  { id: "scroby-sands", lat: 52.6489, lon: 1.7903, kind: "windfarm", n: 30, rows: 3, hub: 68, rotor: 80, bearing: 18 },
];
export const SKYLINE_NOTE = "Landmarks beyond the mapped area are placed from published positions (the power station's size is approximate); the distant town is indicative, not mapped buildings.";

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
export function buildSkyline(group, place, { groundY = 2.2, quality = 1, industry = null } = {}) {
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
    } else if (L.kind === "powerstation") {
      // pale grey cladding, a darker band at the eaves, the boiler house taller and plainer, the steel stack beside it
      const clad = hazeMat(0xc9ccca, 0.7), dark = hazeMat(0x6f7477, 0.7), stack = hazeMat(0xa7abad, 0.7);
      const turn = Math.atan2(x, z); // (its long side across the view from the pier, as seen)
      const part = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x + Math.cos(turn) * px + Math.sin(turn) * pz, groundY + py, z - Math.sin(turn) * px + Math.cos(turn) * pz); m.rotation.y = turn; group.add(m); hazed(m, d, far); };
      part(new THREE.BoxGeometry(70, 28, 35), clad, 0, 14, 0); // the turbine hall
      part(new THREE.BoxGeometry(70.4, 2.2, 35.4), dark, 0, 27, 0); // (its eaves band)
      part(new THREE.BoxGeometry(26, 36, 22), clad, 50, 18, 4); // the boiler house
      part(new THREE.BoxGeometry(14, 10, 12), dark, -44, 5, -6); // (a transformer and its compound)
      part(new THREE.CylinderGeometry(3.2, 3.6, 60, 14), stack, 66, 30, 4); // the stack
      part(new THREE.CylinderGeometry(3.4, 3.4, 1.4, 14), dark, 66, 59.3, 4);
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
  let town = null;
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
    if (out.length) town = buildTown(group, out, rnd, { groundY, industry });
  }
  return {
    count: rotors.length,
    /** the town's walls (their windows lit after dark: environment.js drives emissiveIntensity) */
    glow: town ? [town] : [],
    /** the rotors turning (slowly, about 15 turns a minute, each its own phase) */
    update(t) { for (const r of rotors) r.update(t); },
  };
}

// ---- the indicative town's houses: walls, and a hipped, gabled or flat roof each (three instanced meshes) ----
// The walls' windows are drawn in the walls' shader from each house's own size in metres (rows of windows a storey
// apart, a bay apart, faded out where they'd be smaller than a pixel), a few lit after dark. Colours from a British
// seaside town: red and buff brick, cream and white render, the odd pastel; slate, red clay and brown tiled roofs.
// Further away they're greyer and flatter (atmospheric perspective, before the scene's haze is added).
const WALLS = [0x9c5a44, 0xa8674c, 0xb98a6a, 0xc9b89a, 0xddd3c0, 0xe9e5db, 0xd6c7a6, 0xb7c3c6, 0x8e6a58, 0xcfc3ae];
const ROOFS = [0x4e5358, 0x5b5f64, 0x464a50, 0x8a4c3b, 0x7b4a3c, 0x6d5146, 0x66625d];
const SHED = [0xa9aeb2, 0xc9c6bf, 0xc99a88, 0x8d969c, 0xb7b2a6], SHEDROOF = [0x8e9599, 0xa3a7a9, 0x7d8489];
function gableGeometry() { // a prism: the ridge along x, 1 x 1 x 1 (y from 0 to 1)
  const p = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, 0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0];
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]); g.computeVertexNormals(); return g.toNonIndexed();
}
function townWallMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffc27a, emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying vec3 vTp;\nvarying vec3 vTn;\nvarying float vTs;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      { vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vTp = position * sc; vTn = normal; vTs = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61; }`);
    sh.fragmentShader = "varying vec3 vTp;\nvarying vec3 vTn;\nvarying float vTs;\nfloat fdWin = 0.0, fdLit = 0.0;\n" + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
      if (abs(vTn.y) < 0.5) {
        float a = abs(vTn.x) > 0.5 ? vTp.z : vTp.x, st = fract(vTp.y / 2.9), bay = fract(a / 2.7 + 0.5);
        float fade = 1.0 - smoothstep(0.25, 0.6, max(fwidth(a / 2.7), fwidth(vTp.y / 2.9)));
        fdWin = step(0.3, st) * step(st, 0.78) * step(0.3, bay) * step(bay, 0.7) * step(0.6, vTp.y) * fade;
        float id = fract(sin(floor(a / 2.7 + 0.5) * 12.9898 + floor(vTp.y / 2.9) * 78.233 + vTs) * 43758.5453);
        fdLit = fdWin * step(0.62, id);
        diffuseColor.rgb *= 1.0 - fdWin * 0.45;
        diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.5, vTp.y)) * 0.2; // (a darker plinth)
      }`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n      totalEmissiveRadiance *= fdLit;");
  };
  m.customProgramCacheKey = () => "fdtown1";
  return m;
}
function buildTown(group, out, rnd, { groundY, industry }) {
  const wall = new THREE.BoxGeometry(1, 1, 1); wall.translate(0, 0.5, 0);
  const hip = new THREE.CylinderGeometry(0, 0.72, 1, 4, 1); hip.rotateY(Math.PI / 4); hip.translate(0, 0.5, 0); // (a low square pyramid)
  const gab = gableGeometry();
  const W = [], H = [], G = []; // [matrix, colour]
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color(), grey = new THREE.Color();
  // further away: less saturated and flatter in tone (atmospheric perspective); the scene's haze adds the rest
  const air = (hex, d) => { c.setHex(hex); const k = Math.min(0.55, d / 4500), l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; grey.setRGB(l * 0.9 + 0.06, l * 0.92 + 0.06, l * 0.95 + 0.08); return c.clone().lerp(grey, k); };
  out.forEach(([x, z, d], i) => {
    if (industry && industry(x, z)) {
      const w = 30 + rnd() * 45, dep = 18 + rnd() * 25, h = 7 + rnd() * 7;
      q.setFromAxisAngle(up, Math.round(rnd() * 3) * (Math.PI / 2) + (rnd() - 0.5) * 0.15);
      W.push([mx.clone().compose(new THREE.Vector3(x, groundY, z), q, new THREE.Vector3(w, h, dep)), air(SHED[i % SHED.length], d)]);
      G.push([mx.clone().compose(new THREE.Vector3(x, groundY + h, z), q, new THREE.Vector3(w * 1.02, 1.6, dep * 1.02)), air(SHEDROOF[i % SHEDROOF.length], d)]);
      return;
    }
    const w = 8 + rnd() * 10, dep = 7 + rnd() * 6, h = 5.5 + rnd() * (d < 1400 ? 5 : 3.5), rh = 2.2 + rnd() * 1.6, kind = rnd();
    q.setFromAxisAngle(up, Math.round(rnd() * 3) * (Math.PI / 2) + (rnd() - 0.5) * 0.3);
    W.push([mx.clone().compose(new THREE.Vector3(x, groundY, z), q, new THREE.Vector3(w, h, dep)), air(WALLS[Math.floor(rnd() * WALLS.length)], d)]);
    const roofCol = air(ROOFS[Math.floor(rnd() * ROOFS.length)], d);
    if (kind < 0.08) return; // (a flat roof behind a parapet: nothing above the walls)
    (kind < 0.55 ? G : H).push([mx.clone().compose(new THREE.Vector3(x, groundY + h, z), q, new THREE.Vector3(w * 1.04, rh, dep * 1.04)), roofCol]);
  });
  const wallMat = townWallMaterial();
  for (const [geo, list, mat] of [[wall, W, wallMat], [hip, H, new THREE.MeshLambertMaterial({ color: 0xffffff })], [gab, G, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })]]) {
    if (!list.length) continue;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([M, col], k) => { m.setMatrixAt(k, M); m.setColorAt(k, col); });
    m.instanceColor.needsUpdate = true; m.frustumCulled = false; group.add(m);
  }
  return wallMat;
}
