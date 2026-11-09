// ---- trees3d: trees and shrubs on the map's green ground, so the town has the growth a real one has ----
// OpenStreetMap gives the parks, lawns and verges (landuse=grass, leisure=park: the ground's grass cells) and very few
// of the trees themselves, so the trees are placed here: on the grass, thinned where it is small, never on a road,
// a building, the pier or within a few metres of a fishing spot. Each tree is three crossed planes with a drawn
// canopy (clusters of leaves over a branching dark core, a ragged edge, see-through gaps) and a short trunk; all of
// them in two instanced draws. Seen from the pier at 100 to 400 m they read as the broadleaf trees of a seaside
// town (sycamore, lime, holm oak); close to, as you walk the gardens, the planes still hold up at a glance. A shrub
// is the same drawing at a third of the size. (Original drawing, no photographs.)
import * as THREE from "three";

// ---- the canopy picture: leaf clusters over a branching core ----
function canopyTexture(seed = 5) {
  if (typeof document === "undefined") return null;
  const n = 256, c = document.createElement("canvas"); c.width = n; c.height = n; const g = c.getContext("2d");
  let s = seed * 7919 + 17; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.clearRect(0, 0, n, n);
  // the trunk and a few branches up into the crown
  g.strokeStyle = "#3a3028"; g.lineCap = "round";
  g.lineWidth = 9; g.beginPath(); g.moveTo(n * 0.5, n); g.lineTo(n * 0.5, n * 0.58); g.stroke();
  for (let b = 0; b < 5; b++) { g.lineWidth = 4; g.beginPath(); g.moveTo(n * 0.5, n * (0.58 + rnd() * 0.1)); g.lineTo(n * (0.25 + rnd() * 0.5), n * (0.25 + rnd() * 0.25)); g.stroke(); }
  // leaf clusters: dark ones first (the shaded inside of the crown), then the lit ones over them, each a ragged
  // blob of small discs, the crown wider than tall and a little lopsided, thinning to gaps at the edge
  const greens = [[52, 74, 36], [68, 96, 44], [86, 118, 52], [104, 138, 60], [122, 150, 70]];
  const cx = n * 0.5, cy = n * 0.42, rx = n * 0.46, ry = n * 0.36;
  for (let layer = 0; layer < 5; layer++) {
    const col = greens[layer];
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (0.75 + layer * 0.06);
      const x = cx + Math.cos(a) * rx * r + (rnd() - 0.5) * 10, y = cy + Math.sin(a) * ry * r + (rnd() - 0.5) * 10 - layer * 2;
      if (r > 0.92 && rnd() < 0.5) continue; // gaps at the edge
      const rad = 6 + rnd() * 9 * (1 - r * 0.4), shade = 0.85 + rnd() * 0.3;
      g.fillStyle = `rgba(${col[0] * shade | 0},${col[1] * shade | 0},${col[2] * shade | 0},${0.85 + rnd() * 0.15})`;
      for (let d = 0; d < 4; d++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * rad, y + (rnd() - 0.5) * rad, rad * (0.5 + rnd() * 0.5), 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/**
 * @param group where to add the meshes
 * @param o.cls ground classes (0 water, 1 land, 2 beach, 3 grass), o.xs the grid axis, o.n its size
 * @param o.heightAt (x, z) => ground height; o.avoid (x, z) => true where nothing may grow (spots, roads, buildings)
 * @param o.bank (x, z) => 0..1 how much the cliff's grassy bank is here (scrub and a few trees on it)
 * @param o.quality 0.5 | 1 | 2 (how many)
 */
export function buildTrees(group, { cls, xs, n, heightAt, avoid = () => false, bank = () => 0, quality = 1, seed = 3 } = {}) {
  const tex = canopyTexture(seed); if (!tex) return null;
  let s = seed * 104729 + 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const hash = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7 + seed) * 43758.5453; return v - Math.floor(v); };
  // where the grass is: each grass cell gets a chance of a tree, more in the middle of a large lawn (parks have trees;
  // a verge has the odd one), with a minimum spacing
  const placed = [];
  const tooClose = (x, z, d) => placed.some((p) => Math.hypot(p.x - x, p.z - z) < d);
  const density = quality >= 2 ? 1 : quality >= 1 ? 0.75 : 0.45;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, x = xs[i], z = xs[j], cw = xs[i + 1] - xs[i];
    if (cw > 8) continue; // (the coarse far grid: no trees out there)
    const grass = cls[k] === 3, bk = bank(x, z);
    if (!grass && bk < 0.3) continue;
    // how deep into the grass this cell is (a tree stands back from the edge of a lawn)
    let deep = 0; if (grass) { deep = 1; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cls[(j + dj) * n + i + di] !== 3) deep = 0; }
    const p = grass ? (deep ? 0.5 : 0.12) : 0.035 * bk;
    if (hash(i, j) > p * density) continue;
    const px = x + (rnd() - 0.5) * cw * 0.8, pz = z + (rnd() - 0.5) * cw * 0.8;
    if (avoid(px, pz) || tooClose(px, pz, grass ? 5.5 : 5)) continue;
    const big = grass && deep && rnd() < 0.7;
    const h = big ? 7 + rnd() * 5 : 3 + rnd() * 2.5; // (a park tree 7 to 12 m; a verge tree or scrub 3 to 5.5)
    placed.push({ x: px, z: pz, y: heightAt(px, pz), h, w: h * (0.75 + rnd() * 0.3), rot: rnd() * Math.PI, tint: 0.85 + rnd() * 0.3, lean: (rnd() - 0.5) * 0.06 });
  }
  if (!placed.length) return null;
  // ---- the meshes: three crossed planes a tree (the canopy picture includes its trunk), instanced ----
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const geo = new THREE.BufferGeometry();
  { const pos = [], uv = [], idx = [], nrm = []; let o = 0;
    for (let q = 0; q < 3; q++) { const a = (q / 3) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), P = plane.attributes.position, U = plane.attributes.uv;
      for (let v = 0; v < P.count; v++) { const x = P.getX(v), y = P.getY(v); pos.push(x * ca, y, x * sa); uv.push(U.getX(v), U.getY(v)); nrm.push(0, 1, 0); } // (normals up: lit as a mass by the sky, not as three cards)
      for (const t of plane.index.array) idx.push(t + o); o += P.count; }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx); }
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, placed.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), c = new THREE.Color();
  placed.forEach((t, i) => { e.set(t.lean, t.rot, 0); q.setFromEuler(e); sc.set(t.w, t.h, t.w); m.compose(new THREE.Vector3(t.x, t.y - 0.05, t.z), q, sc); mesh.setMatrixAt(i, m); c.setRGB(t.tint, t.tint * (0.97 + 0.06 * (t.tint - 1)), t.tint * 0.95); mesh.setColorAt(i, c); });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.userData.kind = "trees"; mesh.name = "fdTrees";
  group.add(mesh);
  return { mesh, count: placed.length, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } };
}
