// FishDock: the house fronts' windows, doors and shop fronts in depth, near the camera (High and Ultra).
// The baked fronts (build_facades.py) carry their windows as a picture with its relief in the normal map; close to,
// a wall is plainly flat. Within NEAR metres of the camera each window, door and shop front of the baked fronts is
// built here as geometry at the same size and place as the picture's (the bake's own measurements): the opening's
// reveals going back into the wall, the box frame set back in them, the two sashes and their glazing bars, the glass,
// a stone sill standing out, a lintel or arch over; the door in its case under a fanlight, on its step; the shop front's
// mullions, glass and fascia. The wall's picture is cut away there (buildings3d.js: the opening's rectangle, worked
// out from the wall's own texture coordinates, nearer than CUT metres), so the light falls into real reveals.
// Instanced: per kind of opening, one mesh each for the paintwork (tinted per house: its trim or door colour), the
// masonry (sill, lintel, reveals: tinted per house as its walls) and the glass.
import * as THREE from "three";

export const NEAR = 70, CUT = 64;
// (the openings in a 3 m bay, metres: the bake's own (build_facades.py bay_window, bay_door, bay_shop, bay_wide))
export const OPENINGS = { 0: [0.975, 2.025, 0.9, 2.45], 1: [1.025, 1.975, 0, 2.46], 2: [0.25, 2.75, 0.45, 2.45], 4: [0.65, 2.35, 0.9, 2.45] };

// ---- geometry: boxes in a bay's frame (x along the wall from its left end, 0 to 3; y up from the floor; z out of the
// wall, its face at 0), each its part and colour ----
function builder() {
  const parts = { paint: { p: [], n: [], c: [] }, mason: { p: [], n: [], c: [] }, glass: { p: [], n: [], c: [] } };
  const box = (part, x0, x1, y0, y1, z0, z1, col = [1, 1, 1], faces = "all") => {
    const P = parts[part];
    const F = [
      ["+z", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]], ["-z", [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
      ["+x", [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]], ["-x", [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
      ["+y", [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]], ["-y", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
    ];
    for (const [k, q, nrm] of F) {
      if (faces !== "all" && !faces.includes(k)) continue;
      for (const i of [0, 1, 2, 0, 2, 3]) { P.p.push(...q[i]); P.n.push(...nrm); P.c.push(...col); }
    }
  };
  return { parts, box };
}
const TRIM = [1, 1, 1], STONE = [0.92, 0.9, 0.85], SOOT = [0.03, 0.03, 0.035];
function sash(B, xa, xb, ya, yb, panes, D) {
  // the box frame set back D in the reveal, a meeting rail, two sashes with their bars (the top one outside), the glass
  const w = xb - xa, mid = ya + (yb - ya) * 0.5;
  for (const [a, b, c, d] of [[xa, xa + 0.07, ya, yb], [xb - 0.07, xb, ya, yb], [xa, xb, yb - 0.07, yb], [xa, xb, ya, ya + 0.06]]) B.box("paint", a, b, c, d, D - 0.08, D, TRIM);
  B.box("paint", xa + 0.06, xb - 0.06, mid - 0.03, mid + 0.03, D - 0.05, D + 0.015, TRIM);
  for (const [s0, s1, dz] of [[ya + 0.06, mid - 0.03, D - 0.045], [mid + 0.03, yb - 0.07, D - 0.02]]) {
    for (let k = 1; k < panes[0]; k++) { const xx = xa + 0.07 + (w - 0.14) * k / panes[0]; B.box("paint", xx - 0.013, xx + 0.013, s0, s1, dz - 0.03, dz, TRIM); }
    for (let k = 1; k < panes[1]; k++) { const yy = s0 + (s1 - s0) * k / panes[1]; B.box("paint", xa + 0.07, xb - 0.07, yy - 0.013, yy + 0.013, dz - 0.03, dz, TRIM); }
    // (each sash's own frame: stiles and rails round its glass)
    B.box("paint", xa + 0.06, xa + 0.1, s0, s1, dz - 0.035, dz, TRIM); B.box("paint", xb - 0.1, xb - 0.06, s0, s1, dz - 0.035, dz, TRIM);
  }
  B.box("glass", xa + 0.06, xb - 0.06, ya + 0.05, yb - 0.06, D - 0.075, D - 0.07, [1, 1, 1], ["+z"]);
}
function reveal(B, xa, xb, ya, yb, depth, sides = "lrtb") {
  // the opening's sides going back into the wall (its masonry: tinted per house as its walls)
  if (sides.includes("l")) B.box("mason", xa - 0.02, xa, ya, yb, -depth, 0, [0.82, 0.82, 0.82], ["+x"]);
  if (sides.includes("r")) B.box("mason", xb, xb + 0.02, ya, yb, -depth, 0, [0.82, 0.82, 0.82], ["-x"]);
  if (sides.includes("t")) B.box("mason", xa, xb, yb, yb + 0.02, -depth, 0, [0.62, 0.62, 0.62], ["-y"]);
  if (sides.includes("b")) B.box("mason", xa, xb, ya - 0.02, ya, -depth, 0, [0.9, 0.9, 0.9], ["+y"]);
  B.box("mason", xa, xb, ya, yb, -depth - 0.02, -depth, SOOT, ["+z"]); // (the dark beyond, should the eye get past the glass)
}
function window_(B, wide) {
  const w = wide ? 1.7 : 1.05, xa = 1.5 - w / 2, xb = 1.5 + w / 2, ya = 0.9, yb = 2.45, D = -0.12;
  reveal(B, xa, xb, ya, yb, 0.3);
  sash(B, xa, xb, ya, yb, wide ? [3, 2] : [2, 2], D);
  B.box("mason", xa - 0.12, xb + 0.12, ya - 0.11, ya, -0.04, 0.07, STONE); // the sill
  B.box("mason", xa - 0.14, xb + 0.14, yb, yb + 0.2, -0.005, 0.02, [0.86, 0.84, 0.8]); // the lintel (or the arch, tinted as the wall)
}
function door_(B) {
  const w = 0.95, xa = 1.5 - w / 2, xb = 1.5 + w / 2, h = 2.1;
  reveal(B, xa, xb, 0, h + 0.36, 0.3, "lrt");
  B.box("paint", xa + 0.02, xb - 0.02, 0.05, h, -0.2, -0.16, TRIM);
  for (const [y0, y1] of [[0.2, 0.95], [1.1, 1.95]]) for (const [a, b] of [[xa + 0.12, 1.45], [1.55, xb - 0.12]]) B.box("paint", a, b, y0, y1, -0.165, -0.15, [0.82, 0.82, 0.82]);
  B.box("mason", xb - 0.16, xb - 0.11, 1.0, 1.05, -0.15, -0.11, [0.75, 0.55, 0.2]); B.box("mason", 1.36, 1.64, 1.0, 1.04, -0.15, -0.14, [0.75, 0.55, 0.2]); // knob, letterplate
  B.box("glass", xa + 0.03, xb - 0.03, h + 0.06, h + 0.3, -0.2, -0.195, [1, 1, 1], ["+z"]); B.box("paint", xa, xb, h, h + 0.06, -0.2, -0.14, [1.15, 1.15, 1.15]); // fanlight, transom
  for (const a of [xa - 0.16, xb]) B.box("paint", a, a + 0.16, 0.05, h + 0.36, -0.02, 0.07, [1.15, 1.15, 1.15]); // the door case's pilasters
  B.box("paint", xa - 0.24, xb + 0.24, h + 0.36, h + 0.5, -0.02, 0.13, [1.15, 1.15, 1.15]); // and its cornice
  B.box("mason", xa - 0.15, xb + 0.15, 0.0, 0.08, -0.2, 0.3, STONE); // the step
}
function shop_(B) {
  const xa = 0.25, xb = 2.75, ya = 0.45, yb = 2.45;
  reveal(B, xa, xb, ya, yb, 0.25);
  B.box("paint", 0.05, 2.95, 2.45, 2.95, -0.02, 0.12, [0.55, 0.55, 0.55]); B.box("paint", 0.0, 3.0, 2.92, 3.0, -0.02, 0.16, [1.15, 1.15, 1.15]); // fascia, cornice
  B.box("paint", 0.25, 2.75, 0.0, 0.45, -0.02, 0.06, [0.55, 0.55, 0.55]); // stall riser
  for (const xx of [0.25, 1.47, 2.69]) B.box("paint", xx, xx + 0.06, ya, yb, -0.12, -0.04, [0.55, 0.55, 0.55]);
  B.box("paint", xa, xb, 2.05, 2.1, -0.12, -0.04, [0.55, 0.55, 0.55]);
  B.box("glass", xa + 0.05, xb - 0.05, ya + 0.02, yb - 0.02, -0.1, -0.095, [1, 1, 1], ["+z"]);
}
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {};
  for (const [t, make] of [[0, (B) => window_(B, false)], [4, (B) => window_(B, true)], [1, door_], [2, shop_]]) {
    const B = builder(); make(B); GEO[t] = {};
    for (const [k, P] of Object.entries(B.parts)) {
      if (!P.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(P.n, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(P.c, 3));
      GEO[t][k] = g;
    }
  }
  return GEO;
}

/**
 * @param {THREE.Group} group
 * @param {object[]} mods  each opening: { t (FACADE_TILE), x, y, z (its bay's left end at the floor), ux, uz (along the
 *   wall), sx, sy (the bay's width and the storey's height over the drawn 3 m), trim (rgb), wall (rgb), door (rgb) }
 * @returns {{ update(t, cam), count }}
 */
export function buildWindowModules(group, mods) {
  if (!mods?.length || typeof document === "undefined") return { update() {}, count: 0 };
  const G = geometries();
  const mats = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
    mason: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.06, metalness: 0.2, emissive: 0xffd890, emissiveIntensity: 0 }),
  };
  const byT = {}; mods.forEach((m, i) => { (byT[m.t] ||= []).push(i); });
  const meshes = [];
  for (const [t, list] of Object.entries(byT)) {
    if (!G[t]) continue;
    for (const [part, geo] of Object.entries(G[t])) {
      const mesh = new THREE.InstancedMesh(geo, mats[part], Math.min(list.length, 1500));
      mesh.castShadow = part !== "glass"; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0; mesh.name = "fdWindows";
      if (part !== "glass") { const w = new THREE.Color(1, 1, 1); for (let k = 0; k < mesh.instanceMatrix.count; k++) mesh.setColorAt(k, w); } // (made now, so its shader is built with it)
      group.add(mesh); meshes.push({ t: +t, part, mesh, list });
    }
  }
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), at = new THREE.Vector3(1e9, 0, 1e9);
  function update(time, cam) {
    if (!cam || cam.position.distanceToSquared(at) < 16) return; // (looked at again every 4 m)
    at.copy(cam.position);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, n2 = NEAR * NEAR;
    for (const M of meshes) {
      let k = 0; const cap = M.mesh.instanceMatrix.count;
      for (const i of M.list) {
        const m = mods[i], mx = m.x + m.ux * m.sx * 1.5, mz = m.z + m.uz * m.sx * 1.5, dx = mx - cx, dy = m.y - cy, dz = mz - cz;
        if (dx * dx + dy * dy + dz * dz > n2 || k >= cap) continue;
        // (the bay's frame: x along the wall, y up, z out of it; stretched as the bay is)
        m4.set(m.ux * m.sx, 0, -m.uz, m.x, 0, m.sy, 0, m.y, m.uz * m.sx, 0, m.ux, m.z, 0, 0, 0, 1);
        M.mesh.setMatrixAt(k, m4);
        if (M.part !== "glass") { const c = M.part === "mason" ? m.wall : (M.t === 1 ? m.door : m.trim); M.mesh.setColorAt(k, col.setRGB(c[0], c[1], c[2])); }
        k++;
      }
      M.mesh.count = k; M.mesh.instanceMatrix.needsUpdate = true; if (M.mesh.instanceColor) M.mesh.instanceColor.needsUpdate = true;
    }
  }
  return { update, count: mods.length, glass: mats.glass };
}
