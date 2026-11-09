// ---- trees3d: trees and shrubs on the map's green ground, so the town has the growth a real one has ----
// OpenStreetMap gives the parks, lawns and verges (landuse=grass, leisure=park: the ground's grass cells) and very few
// of the trees themselves, so the trees are placed here: on the grass (close together in a mapped wood), thinned where
// it is small, never on a road, a building, the pier or within a few metres of a fishing spot.
//
// Two levels. Close to (High and Ultra, within `near` of the camera) a tree is built: a tapered trunk that leans and
// bends a little, five to nine branches with a second order off them, bark drawn as colour and relief, and a crown of
// leaf clusters, each a pair of crossed cards carrying a drawn cluster of leaves, dozens of them filling the species'
// crown shape (a sycamore's broad dome, a lime's tall oval, a holm oak's dense dark round, a hawthorn's low tangle),
// their normals pointing out from the crown so they light as one mass with a lit side and a shaded side, each tinted
// a little differently, swaying and fluttering in the wind. Further off, and on Balanced and Performance throughout,
// a tree is the earlier picture: three crossed planes with the whole tree drawn on them. Both are instanced, so the
// town's trees are a handful of draws. (All of it drawn in code: no photographs, no downloaded models.)
import * as THREE from "three";

// ---- the species: what grows along a British seafront and in its parks ----
// h: height range (m); crown: [width/height, where the crown's centre sits as a share of height, roundness 0 flat-topped
// to 1 egg-shaped]; leaf: base colour (linear-ish RGB 0..1) and how much it varies; cluster: how many and how big;
// trunk: radius at the base as a share of height, and how dark the bark is
const SPECIES = {
  sycamore: { h: [9, 14], crown: [1.15, 0.66, 0.8], leaf: [0.2, 0.34, 0.13], vary: 0.3, clusters: [46, 1.9], trunk: [0.022, 0.42], bark: [0.55, 0.5, 0.45] },
  lime: { h: [11, 16], crown: [0.7, 0.6, 1.0], leaf: [0.24, 0.4, 0.15], vary: 0.25, clusters: [52, 1.7], trunk: [0.02, 0.45], bark: [0.5, 0.46, 0.42] },
  holmoak: { h: [8, 12], crown: [1.2, 0.6, 0.9], leaf: [0.12, 0.2, 0.1], vary: 0.2, clusters: [60, 1.6], trunk: [0.026, 0.4], bark: [0.42, 0.4, 0.37] },
  hawthorn: { h: [3, 5], crown: [1.3, 0.62, 0.7], leaf: [0.2, 0.33, 0.11], vary: 0.3, clusters: [26, 1.1], trunk: [0.03, 0.35], bark: [0.46, 0.43, 0.39] },
};
const PARK = ["sycamore", "lime", "holmoak", "sycamore", "lime"], VERGE = ["hawthorn", "hawthorn", "sycamore"], WOOD = ["sycamore", "lime", "lime", "holmoak"];

// ---- drawings ----
// the whole tree on a card (the far level and the lower presets)
function cardTexture(seed = 5) {
  if (typeof document === "undefined") return null;
  const n = 256, c = document.createElement("canvas"); c.width = n; c.height = n; const g = c.getContext("2d");
  let s = seed * 7919 + 17; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.clearRect(0, 0, n, n);
  g.strokeStyle = "#3a3028"; g.lineCap = "round";
  g.lineWidth = 9; g.beginPath(); g.moveTo(n * 0.5, n); g.lineTo(n * 0.5, n * 0.58); g.stroke();
  for (let b = 0; b < 5; b++) { g.lineWidth = 4; g.beginPath(); g.moveTo(n * 0.5, n * (0.58 + rnd() * 0.1)); g.lineTo(n * (0.25 + rnd() * 0.5), n * (0.25 + rnd() * 0.25)); g.stroke(); }
  const greens = [[40, 60, 30], [54, 80, 38], [70, 100, 46], [84, 118, 54], [98, 130, 62]]; // (matched to the built trees' deeper green, so a tree doesn't change colour as it changes level)
  const cx = n * 0.5, cy = n * 0.42, rx = n * 0.46, ry = n * 0.36;
  for (let layer = 0; layer < 5; layer++) {
    const col = greens[layer];
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (0.75 + layer * 0.06);
      const x = cx + Math.cos(a) * rx * r + (rnd() - 0.5) * 10, y = cy + Math.sin(a) * ry * r + (rnd() - 0.5) * 10 - layer * 2;
      if (r > 0.92 && rnd() < 0.5) continue;
      const rad = 6 + rnd() * 9 * (1 - r * 0.4), shade = 0.85 + rnd() * 0.3;
      g.fillStyle = `rgba(${col[0] * shade | 0},${col[1] * shade | 0},${col[2] * shade | 0},${0.85 + rnd() * 0.15})`;
      for (let d = 0; d < 4; d++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * rad, y + (rnd() - 0.5) * rad, rad * (0.5 + rnd() * 0.5), 0, Math.PI * 2); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// a cluster of leaves on a card: a ragged mass of small leaf shapes, white (the tint comes per instance), with its
// relief in the alpha so the edge is leaves and not a disc; the same drawing serves every species (their leaves differ
// in colour and size more than a card at 3 m can show)
function leafTexture(seed = 9) {
  if (typeof document === "undefined") return null;
  const n = 256, c = document.createElement("canvas"); c.width = n; c.height = n; const g = c.getContext("2d");
  let s = seed * 48271 + 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.clearRect(0, 0, n, n);
  const cx = n / 2, cy = n / 2;
  for (let k = 0; k < 420; k++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * 0.46 * n; if (r > 0.3 * n && rnd() < (r - 0.3 * n) / (0.17 * n)) continue; // (thinning to a ragged edge)
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, L = 12 + rnd() * 14, w = L * (0.42 + rnd() * 0.25), rot = rnd() * Math.PI * 2;
    // shade: leaves nearer the middle and lower are in the cluster's own shadow
    const sh = 0.5 + 0.5 * Math.min(1, (r / (0.42 * n)) * 0.6 + (0.5 - (y - cy) / n) * 0.7 + rnd() * 0.3);
    const v = Math.round(255 * sh);
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = `rgba(${v},${v},${v},1)`;
    g.beginPath(); g.moveTo(0, -L / 2); g.bezierCurveTo(w, -L / 4, w, L / 4, 0, L / 2); g.bezierCurveTo(-w, L / 4, -w, -L / 4, 0, -L / 2); g.fill();
    g.strokeStyle = `rgba(${v * 0.6 | 0},${v * 0.6 | 0},${v * 0.6 | 0},0.5)`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -L / 2); g.lineTo(0, L / 2); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// bark: a dark ground with vertical fissures and plates, as colour and as relief
function barkTextures(seed = 21) {
  if (typeof document === "undefined") return { map: null, normalMap: null };
  const w = 128, h = 256, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  let s = seed * 16807 + 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#8d857b"; g.fillRect(0, 0, w, h);
  const hf = new Float32Array(w * h).fill(0.5);
  // fissures: wandering dark vertical lines, deeper in the height field
  for (let f = 0; f < 14; f++) {
    let x = rnd() * w; const wd = 1.5 + rnd() * 2.5, dark = 0.35 + rnd() * 0.25;
    for (let y = 0; y < h; y++) { x += (rnd() - 0.5) * 1.6; const xi = ((Math.round(x) % w) + w) % w; g.fillStyle = `rgba(30,26,22,${dark})`; g.fillRect(xi - wd / 2, y, wd, 1); for (let d = -2; d <= 2; d++) { const k = y * w + (((xi + d) % w) + w) % w; hf[k] -= 0.12 * (1 - Math.abs(d) / 3); } }
  }
  // plates between them: lighter patches, a little raised, with a grey-green of lichen here and there
  for (let p = 0; p < 60; p++) { const x = rnd() * w, y = rnd() * h, pw = 6 + rnd() * 14, ph = 14 + rnd() * 30; const lich = rnd() < 0.25; g.fillStyle = lich ? `rgba(120,140,100,${0.25 + rnd() * 0.25})` : `rgba(${150 + rnd() * 40 | 0},${140 + rnd() * 30 | 0},${125 + rnd() * 25 | 0},${0.2 + rnd() * 0.3})`; g.fillRect(x, y, pw, ph); for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) { const k = (((y + yy) | 0) % h) * w + (((x + xx) | 0) % w); hf[k] += 0.03; } }
  // normal from the height field (Sobel), wrapping
  const nc = document.createElement("canvas"); nc.width = w; nc.height = h; const ng = nc.getContext("2d"), img = ng.createImageData(w, h);
  const at = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (at(x + 1, y) - at(x - 1, y)) * 3, dy = (at(x, y + 1) - at(x, y - 1)) * 3, l = Math.hypot(dx, dy, 1), k = (y * w + x) * 4; img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255; }
  ng.putImageData(img, 0, 0);
  const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return { map: mk(c, true), normalMap: mk(nc, false) };
}

// ---- one built tree (unit height 1, scaled per instance): trunk, branches and the crown's cluster placements ----
// Returns { wood: BufferGeometry (trunk and branches, uv for bark), clusters: [{ p: Vector3, n: Vector3, s, tint }] }.
function growTree(sp, rnd) {
  const S = SPECIES[sp], [ratio, cAt, egg] = S.crown;
  const segsR = 7, parts = [];
  const tube = (from, to, r0, r1) => {
    // a tapered tube between two points, open ended (the ends are inside other wood or the crown)
    const d = to.clone().sub(from), L = d.length(); if (L < 1e-4) return;
    const g = new THREE.CylinderGeometry(r1, r0, L, segsR, 1, true); g.translate(0, L / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.applyQuaternion(q); g.translate(from.x, from.y, from.z);
    // bark uv: round the tube and along it in metres of the unit tree (scaled later), so the fissures run along the wood
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 2 * Math.PI / 0.06)), uv.getY(i) * L / 0.3 + from.y);
    parts.push(g);
  };
  // the trunk: three pieces with a lean and a bend, up to the crown's centre
  const r0 = S.trunk[0], top = cAt + 0.1; // (the trunk's radius at the base as a share of the height: 2.2% of 12 m is 26 cm)
  const lean = (rnd() - 0.5) * 0.08, bend = (rnd() - 0.5) * 0.06;
  const P0 = new THREE.Vector3(0, -0.02, 0), P1 = new THREE.Vector3(lean * 0.3, top * 0.38, bend * 0.3), P2 = new THREE.Vector3(lean * 0.7, top * 0.72, bend * 0.9), P3 = new THREE.Vector3(lean, top, bend * 1.2);
  tube(P0, P1, r0 * 1.15, r0 * 0.85); tube(P1, P2, r0 * 0.85, r0 * 0.6); tube(P2, P3, r0 * 0.6, r0 * 0.35);
  // a root flare: a short wider ring at the foot
  tube(new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(lean * 0.05, 0.05, 0), r0 * 1.5, r0 * 1.1);
  // branches: from the upper trunk out and up into the crown, a second order off each
  const nB = 5 + Math.floor(rnd() * 4), crownR = top * ratio * 0.5 * (1 - cAt) / 0.4 * 0.5; // (a rough crown radius in unit terms)
  const cr = Math.max(0.12, Math.min(0.45, ratio * (1 - cAt) * 0.95));
  for (let b = 0; b < nB; b++) {
    const a = (b / nB) * Math.PI * 2 + rnd() * 0.8, h0 = top * (0.55 + rnd() * 0.35), base = P0.clone().lerp(P3, h0 / top);
    const up = 0.35 + rnd() * 0.4, len = cr * (0.6 + rnd() * 0.4);
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize(), end = base.clone().addScaledVector(dir, len);
    tube(base, end, r0 * 0.42, r0 * 0.14);
    for (let k = 0; k < 2; k++) { const at = base.clone().lerp(end, 0.45 + k * 0.3), d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 1.6); d2.y += 0.25; d2.normalize(); tube(at, at.clone().addScaledVector(d2, len * 0.5), r0 * 0.14, r0 * 0.05); }
  }
  void crownR;
  // the crown: clusters in an ellipsoid shell and some inside, centred at cAt, flattened under (less below the centre)
  const [nC, cs] = S.clusters, clusters = [];
  const rx = cr, ry = cr / ratio * (0.55 + 0.45 * egg) * 1.1, cy = cAt + ry * 0.15;
  for (let k = 0; k < nC; k++) {
    const u = rnd() * 2 - 1, phi = rnd() * Math.PI * 2, rr = 0.55 + 0.45 * Math.sqrt(rnd()); // (most clusters towards the outside, where leaves are)
    let y = u; if (y < 0) y *= 0.75; // (the crown's underside is shallower than its top)
    const x = Math.sqrt(Math.max(0, 1 - u * u)) * Math.cos(phi) * rr, z = Math.sqrt(Math.max(0, 1 - u * u)) * Math.sin(phi) * rr;
    const p = new THREE.Vector3(x * rx + P3.x * 0.5, cy + y * ry * rr, z * rx + P3.z * 0.5);
    const n = new THREE.Vector3(x, y * 0.8 + 0.35, z).normalize(); // (lit as the surface of the mass, a little upward)
    const edge = rr; // outer clusters a touch paler (more sun), inner darker
    clusters.push({ p, n, s: cs * (0.8 + rnd() * 0.45) / 10, tint: 0.78 + 0.3 * edge * (0.7 + 0.3 * rnd()) + (rnd() - 0.5) * S.vary, rot: rnd() * Math.PI * 2, phase: rnd() * Math.PI * 2 });
  }
  const wood = mergeGeometries(parts); parts.forEach((g) => g.dispose());
  return { wood, clusters };
}
// (BufferGeometryUtils is heavier than needed: a small merge of non-indexed tubes)
function mergeGeometries(list) {
  const pos = [], nor = [], uv = [], idx = []; let o = 0;
  for (const g of list) { const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); } for (const t of g.index.array) idx.push(t + o); o += P.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

// ---- the wind in the leaves: a sway of the whole crown with the wind and a flutter of each card, in the vertex shader ----
function windy(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uWindDir = U.uWindDir;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime, uWind; uniform vec2 uWindDir; attribute float aPhase; attribute float aHeight;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        // (the instance's height above its root, so the crown moves and the foot does not; the sway grows with the
        // wind, slow for the mass of the crown, a quick small flutter on each card)
        float sway = (0.6 + 0.4 * sin(uTime * 0.9 + aPhase)) * sin(uTime * 1.3 + aPhase * 0.7) * uWind * 0.35 * aHeight;
        vec2 dir = normalize(uWindDir + vec2(1e-4));
        transformed.xz += dir * sway * 0.06; transformed.y += sin(uTime * 2.7 + aPhase * 3.1 + position.x * 3.0) * uWind * 0.025 * aHeight;`);
  };
  return mat;
}

/**
 * @param group where to add the meshes
 * @param o.cls ground classes (0 water, 1 land, 2 beach, 3 grass), o.xs the grid axis, o.n its size
 * @param o.heightAt (x, z) => ground height; o.avoid (x, z) => true where nothing may grow (spots, roads, buildings)
 * @param o.bank (x, z) => 0..1 how much the cliff's grassy bank is here (scrub and a few trees on it)
 * @param o.wood (x, z) => true inside a wood on the map (dense, tall)
 * @param o.quality 0.5 | 1 | 2 (how many, and whether trees are built close to: from 1 up)
 * @returns { mesh (the cards), count, update(t, cam, wind), dispose }
 */
export function buildTrees(group, { cls, xs, n, heightAt, avoid = () => false, bank = () => 0, wood = () => false, quality = 1, seed = 3 } = {}) {
  const cardTex = cardTexture(seed); if (!cardTex) return null;
  let s = seed * 104729 + 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const hash = (x, z) => { const v = Math.sin(x * 127.1 + z * 311.7 + seed) * 43758.5453; return v - Math.floor(v); };
  // ---- where they stand ----
  const placed = [];
  const tooClose = (x, z, d) => placed.some((p) => Math.hypot(p.x - x, p.z - z) < d);
  const density = quality >= 2 ? 1 : quality >= 1 ? 0.75 : 0.45;
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, x = xs[i], z = xs[j], cw = xs[i + 1] - xs[i];
    if (cw > 8) continue;
    const grass = cls[k] === 3, bk = bank(x, z);
    if (!grass && bk < 0.3) continue;
    let deep = 0; if (grass) { deep = 1; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (cls[(j + dj) * n + i + di] !== 3) deep = 0; }
    const inWood = grass && wood(x, z);
    const p = inWood ? 0.95 : grass ? (deep ? 0.5 : 0.12) : 0.035 * bk;
    if (hash(i, j) > p * density) continue;
    const px = x + (rnd() - 0.5) * cw * 0.8, pz = z + (rnd() - 0.5) * cw * 0.8;
    if (avoid(px, pz) || tooClose(px, pz, inWood ? 3.5 : grass ? 5.5 : 5)) continue;
    const list = inWood ? WOOD : grass && deep ? PARK : VERGE, sp = list[Math.floor(rnd() * list.length)], S = SPECIES[sp];
    let h = S.h[0] + rnd() * (S.h[1] - S.h[0]); if (inWood) h *= 1.1; if (!grass) h *= 0.8; // (the cliff's bank: wind-cut)
    placed.push({ x: px, z: pz, y: heightAt(px, pz), h, sp, w: h * (0.75 + rnd() * 0.3), rot: rnd() * Math.PI * 2, tint: 0.85 + rnd() * 0.3, lean: (rnd() - 0.5) * 0.06, phase: rnd() * Math.PI * 2 });
  }
  if (!placed.length) return null;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), col = new THREE.Color(), v3 = new THREE.Vector3();
  const disposables = [];
  // ---- the far level: three crossed planes a tree (the whole tree drawn on them), instanced ----
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cardGeo = new THREE.BufferGeometry();
  { const pos = [], uv = [], idx = [], nrm = []; let o = 0;
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), P = plane.attributes.position, U = plane.attributes.uv;
      for (let v = 0; v < P.count; v++) { const x = P.getX(v), y = P.getY(v); pos.push(x * ca, y, x * sa); uv.push(U.getX(v), U.getY(v)); nrm.push(0, 1, 0); }
      for (const t of plane.index.array) idx.push(t + o); o += P.count; }
    cardGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); cardGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); cardGeo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); cardGeo.setIndex(idx); }
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xffffff });
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, placed.length);
  const setCard = (t, i, on) => { e.set(t.lean, t.rot, 0); q.setFromEuler(e); sc.set(on ? t.w : 0, on ? t.h : 0, on ? t.w : 0); m.compose(v3.set(t.x, t.y - 0.05, t.z), q, sc); cards.setMatrixAt(i, m); };
  placed.forEach((t, i) => { setCard(t, i, true); col.setRGB(t.tint, t.tint * (0.97 + 0.06 * (t.tint - 1)), t.tint * 0.95); cards.setColorAt(i, col); });
  cards.instanceMatrix.needsUpdate = true; if (cards.instanceColor) cards.instanceColor.needsUpdate = true;
  cards.castShadow = true; cards.receiveShadow = false; cards.frustumCulled = false; cards.userData.kind = "trees"; cards.name = "fdTrees";
  group.add(cards); disposables.push(cardGeo, cardMat, cardTex);

  // ---- the near level (High and Ultra): built trees, by species variant, instanced; wood and leaves separately ----
  const built = quality >= 1;
  const U = { uTime: { value: 0 }, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.3, -1) } };
  const near = quality >= 2 ? 150 : 90, variants = [];
  const woodMeshes = [], leafMeshes = [];
  if (built) {
    const bark = barkTextures(seed + 1), leafTex = leafTexture(seed + 2);
    const leafGeo = new THREE.BufferGeometry();
    { // two crossed cards, each 1 x 1 centred, drawn from both sides as two windings (so a card seen from behind keeps
      // the same normal rather than three's flipped one: a cluster is a mass of leaves, lit the same way round from
      // either side), the normals domed outward so each card shades like a rounded tuft and not a flat tile
      const P = [], N = [], UV = [], I = []; let o = 0;
      const card = (ax) => { // ax 0: in the xy plane facing +z; 1: in the zy plane facing +x
        for (const flip of [0, 1]) {
          for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
            const nx = u * 1.3, ny = v * 1.3, nz = 1, l = Math.hypot(nx, ny, nz);
            if (ax === 0) { P.push(u, v, 0); N.push(nx / l, ny / l, nz / l); } else { P.push(0, v, -u); N.push(nz / l, ny / l, -nx / l); }
            UV.push(u + 0.5, v + 0.5);
          }
          if (!flip) I.push(o, o + 1, o + 2, o, o + 2, o + 3); else I.push(o, o + 2, o + 1, o, o + 3, o + 2);
          o += 4;
        }
      };
      card(0); card(1);
      leafGeo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); leafGeo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3)); leafGeo.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2)); leafGeo.setIndex(I); }
    for (const sp of Object.keys(SPECIES)) {
      const trees = placed.filter((t) => t.sp === sp); if (!trees.length) continue;
      const S = SPECIES[sp];
      // three variants a species, trees round-robin
      const vs = [0, 1, 2].map(() => growTree(sp, rnd));
      vs.forEach((vt, vi) => {
        const mine = trees.filter((t, k) => k % 3 === vi); if (!mine.length) return;
        const woodMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95, color: new THREE.Color(...S.bark) });
        const wm = new THREE.InstancedMesh(vt.wood, woodMat, mine.length); wm.castShadow = true; wm.receiveShadow = true; wm.frustumCulled = false; wm.name = "fdTreeWood";
        const leafCol = new THREE.Color(S.leaf[0], S.leaf[1], S.leaf[2]).multiplyScalar(1.45);
        // (a little light through the leaves: the shaded side of a real crown is not black, light scatters through it)
        const leafMat = windy(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.FrontSide, roughness: 0.8, metalness: 0, color: leafCol, emissive: leafCol.clone().multiplyScalar(0.06), emissiveMap: leafTex }), U);
        const geo = leafGeo.clone(); const nL = vt.clusters.length * mine.length;
        const ph = new Float32Array(nL), hh = new Float32Array(nL);
        const lm = new THREE.InstancedMesh(geo, leafMat, nL); lm.castShadow = true; lm.receiveShadow = false; lm.frustumCulled = false; lm.name = "fdTreeLeaves";
        mine.forEach((t, ti) => { t.vi = vi; vt.clusters.forEach((c, ci) => { const k = ti * vt.clusters.length + ci; ph[k] = t.phase + c.phase; hh[k] = c.p.y; }); });
        geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(ph, 1)); geo.setAttribute("aHeight", new THREE.InstancedBufferAttribute(hh, 1));
        variants.push({ sp, vt, mine, wm, lm });
        group.add(wm, lm); woodMeshes.push(wm); leafMeshes.push(lm); disposables.push(woodMat, leafMat, geo, vt.wood);
      });
    }
    disposables.push(leafGeo, leafTex, bark.map, bark.normalMap);
  }
  // set a built tree's instances on or off (scale 0 hides it)
  const zAxis = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), q2 = new THREE.Quaternion(), m2 = new THREE.Matrix4(), tp = new THREE.Vector3(), tn = new THREE.Vector3();
  function setBuilt(variant, ti, on) {
    const { vt, mine, wm, lm } = variant, t = mine[ti];
    e.set(t.lean, t.rot, 0); q.setFromEuler(e); sc.set(on ? t.h : 0, on ? t.h : 0, on ? t.h : 0); m.compose(v3.set(t.x, t.y - 0.03, t.z), q, sc); wm.setMatrixAt(ti, m);
    vt.clusters.forEach((c, ci) => {
      const k = ti * vt.clusters.length + ci;
      if (!on) { m2.makeScale(0, 0, 0); lm.setMatrixAt(k, m2); return; }
      tp.copy(c.p).multiplyScalar(t.h).applyQuaternion(q).add(v3); tn.copy(c.n).applyQuaternion(q);
      q2.setFromUnitVectors(zAxis, tn); e.set(0, 0, c.rot); const qr = new THREE.Quaternion().setFromEuler(e); q2.multiply(qr);
      const size = c.s * t.h; m2.compose(tp, q2, sc.set(size, size, size)); lm.setMatrixAt(k, m2);
      col.setRGB(c.tint * t.tint, c.tint * t.tint * (0.96 + 0.08 * (t.tint - 0.85)), c.tint * t.tint * 0.9); lm.setColorAt(k, col);
    });
  }
  void up;
  for (const v of variants) { for (let k = 0; k < v.lm.count; k++) v.lm.setColorAt(k, col.setRGB(1, 1, 1)); for (let ti = 0; ti < v.mine.length; ti++) setBuilt(v, ti, false); v.wm.instanceMatrix.needsUpdate = true; v.lm.instanceMatrix.needsUpdate = true; if (v.lm.instanceColor) v.lm.instanceColor.needsUpdate = true; }
  // ---- the level of each tree, by its distance from the camera, looked at twice a second ----
  let lastAt = -1e9; const camP = new THREE.Vector3(1e9, 0, 1e9);
  function update(t, cam, wind = 0.3, windDir = null) {
    U.uTime.value = t; U.uWind.value = Math.max(0.08, wind); if (windDir) U.uWindDir.value.set(windDir[0], windDir[1]);
    if (!built || !cam) return;
    if (t - lastAt < 0.5 && cam.position.distanceToSquared(camP) < 4) return;
    lastAt = t; camP.copy(cam.position);
    let changed = false;
    for (const v of variants) {
      let dirty = false;
      v.mine.forEach((tr, ti) => { const nearNow = Math.hypot(tr.x - cam.position.x, tr.z - cam.position.z) < near; if (nearNow === !!tr.built) return; tr.built = nearNow; setBuilt(v, ti, nearNow); setCard(tr, placed.indexOf(tr), !nearNow); dirty = true; });
      if (dirty) { v.wm.instanceMatrix.needsUpdate = true; v.lm.instanceMatrix.needsUpdate = true; if (v.lm.instanceColor) v.lm.instanceColor.needsUpdate = true; changed = true; }
    }
    if (changed) cards.instanceMatrix.needsUpdate = true;
  }
  return {
    mesh: cards, count: placed.length, built: built ? variants.reduce((a, v) => a + v.mine.length, 0) : 0, update,
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
export const TREE_SPECIES = Object.keys(SPECIES);
