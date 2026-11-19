// ---- scrub: the rough growth on banks, cliffs and open grass, out to the edge of the place ----
// The blades of grass (grassField.js, grassTufts.js) stand within 12 to 34 m of the camera. Past that a hillside was a
// smooth painted green, which is most of what you see of it from a pier 200 m away (the pictures of 19 November, phone
// setting and Ultra alike: Gorleston's cliff read as a golf course). This is the growth that gives such ground its
// texture from a distance: mounds of bramble and thorn, gorse, and stands of bracken. Each is two crossed cards with
// its picture from the side and a third lying flat with its picture from above (crossed cards alone read as a dark
// X from a cliff top), drawn here, in three instanced meshes for the place (three draws, no shadow pass).
// Where they stand comes from the ground itself: only where grass is drawn, never on a road, a pier or a building;
// thickets by a slow noise so they gather in patches; more on a slope than on the flat; none on a dune (marram has its
// own look) and few on mown ground; within 600 m of where people fish. The same lookups as the grass, so they agree
// with it. (Tussocks of rough grass were tried as a fourth kind and taken out: flat on the ground from above they
// read as starfish.)
import * as THREE from "three";

import { KINDS, scrubSpots } from "./scrubPlan.js";
export { KINDS, SIZE, scrubSpots } from "./scrubPlan.js";

// ---- the drawings: three kinds across, each from the side (upper row, standing on the bottom edge of its square)
// and from above (lower row) ----
// (bracken is green from April to September and russet the rest of the year; gorse carries a little flower all year,
// most from March to May)
export function scrubAtlas(month = new Date().getMonth()) {
  if (typeof document === "undefined") return null;
  const n = 256, c = document.createElement("canvas"); c.width = n * 3; c.height = n * 2; const g = c.getContext("2d");
  let s = 90001; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rgb = (a, k = 1) => `rgb(${Math.min(255, a[0] * k) | 0},${Math.min(255, a[1] * k) | 0},${Math.min(255, a[2] * k) | 0})`;
  const cell = (col, row, draw) => { g.save(); g.translate(col * n, row * n); g.beginPath(); g.rect(3, 3, n - 6, n - 6); g.clip(); draw(); g.restore(); };
  const dab = (x, y, sz, col, spiky) => { g.fillStyle = rgb(col, 0.88 + rnd() * 0.24);
    if (spiky) { g.strokeStyle = g.fillStyle; g.lineWidth = 2.4; g.lineCap = "round"; for (let k = 0; k < 4; k++) { const b = rnd() * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * sz, y + Math.sin(b) * sz); g.stroke(); } g.beginPath(); g.arc(x, y, sz * 0.5, 0, 7); g.fill(); }
    else { g.beginPath(); g.ellipse(x, y, sz, sz * (0.55 + rnd() * 0.3), rnd() * 3, 0, 7); g.fill(); } };
  // from the side: a mound of leaf in a few masses, solid to the ground, darker low down and lit on top
  const mound = (cols, { wide = 0.42, tall = 0.7, dabs = 900, size = 9, spiky = false } = {}) => { const at = [];
    const lobes = [[0.5, tall * 0.34, wide, tall * 0.36]]; for (let l = 0; l < 6; l++) lobes.push([0.5 + (rnd() - 0.5) * wide * 1.3, tall * (0.4 + rnd() * 0.42), wide * (0.36 + rnd() * 0.3), tall * (0.2 + rnd() * 0.18)]);
    const pts = []; for (let d = 0; d < dabs; d++) { const L = lobes[(rnd() * lobes.length) | 0], a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); pts.push([L[0] + Math.cos(a) * L[2] * r, Math.max(0.012, L[1] + Math.sin(a) * L[3] * r)]); }
    pts.sort((a, b) => a[1] - b[1]); // (from the ground up, so the lit top lies over the dark under it)
    for (const [u, v] of pts) { if (u < 0.04 || u > 0.96) continue; const lit = Math.min(0.999, Math.max(0, v / tall * 0.8 + (rnd() - 0.5) * 0.35)); dab(u * n, n - v * n, size * (0.6 + rnd() * 0.8), cols[(lit * cols.length) | 0], spiky); if (v > tall * 0.25) at.push([u * n, n - v * n]); }
    return at;
  };
  // from above: a round head of the same leaf, lighter in the middle where it stands highest, ragged at the rim
  const head = (cols, { size = 10, spiky = false, dabs = 700 } = {}) => { const at = [];
    for (let d = 0; d < dabs; d++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (0.4 + 0.07 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7)); if (r > 0.4 && rnd() < 0.5) continue;
      const lit = Math.min(0.999, Math.max(0, 0.95 - r * 1.9 + (rnd() - 0.5) * 0.4)); dab((0.5 + Math.cos(a) * r) * n, (0.5 + Math.sin(a) * r) * n, size * (0.6 + rnd() * 0.8), cols[(lit * cols.length) | 0], spiky); if (r < 0.36) at.push([(0.5 + Math.cos(a) * r) * n, (0.5 + Math.sin(a) * r) * n]); }
    return at;
  };
  const SCRUB = [[44, 62, 34], [58, 82, 42], [76, 104, 52], [96, 126, 62], [118, 148, 76]], GORSE = [[36, 60, 40], [48, 76, 46], [62, 94, 54], [80, 114, 64]];
  const green = month >= 3 && month <= 8, BR0 = green ? [70, 110, 48] : [132, 88, 46], BR1 = green ? [112, 152, 70] : [184, 130, 72];
  // (a flower only where there is bush under it: on some of the dabs just drawn)
  const flowers = (at) => { const fl = month >= 2 && month <= 4 ? 120 : 28; for (let f = 0; f < fl && at.length; f++) { const [x, y] = at[(rnd() * at.length) | 0]; g.fillStyle = rgb([226, 190, 44], 0.9 + rnd() * 0.2); g.beginPath(); g.arc(x, y, 2.4 + rnd() * 1.4, 0, 7); g.fill(); } };
  // bracken: fronds arching out from one foot; from above, a rosette of them
  const frond = (x0, y0, ang, len, drop) => { let px = x0, py = y0;
    for (let k = 1; k <= 12; k++) { const t = k / 12, x = x0 + Math.cos(ang) * len * t, y = y0 + Math.sin(ang) * len * t + drop * t * t, wd = n * 0.075 * (1 - t) + 3, col = [0, 1, 2].map((ch) => BR0[ch] + (BR1[ch] - BR0[ch]) * t);
      g.strokeStyle = rgb(col, 0.88 + rnd() * 0.24); g.lineCap = "round"; g.lineWidth = 3; g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      const nx = -(y - py), ny = x - px, nl = Math.hypot(nx, ny) || 1; g.lineWidth = 5.5;
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (nx / nl) * wd * sd + (x - px) * 0.6, y + (ny / nl) * wd * sd + (y - py) * 0.6); g.stroke(); }
      px = x; py = y; } };
  cell(0, 0, () => mound(SCRUB, { wide: 0.43, tall: 0.74, dabs: 2600, size: 5.5 }));
  cell(1, 0, () => flowers(mound(GORSE, { wide: 0.4, tall: 0.78, dabs: 2000, size: 5, spiky: true })));
  cell(2, 0, () => { for (let f = 0; f < 17; f++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.1; frond(n * (0.5 + (rnd() - 0.5) * 0.2), n - 3, a, n * (0.5 + rnd() * 0.36), n * 0.22 * Math.abs(Math.cos(a)) + n * 0.05); } });
  cell(0, 1, () => head(SCRUB, { size: 6, dabs: 2200 }));
  cell(1, 1, () => flowers(head(GORSE, { size: 5.5, spiky: true, dabs: 1800 })));
  cell(2, 1, () => { for (let f = 0; f < 15; f++) frond(n * 0.5, n * 0.5, (f / 15) * Math.PI * 2 + rnd() * 0.3, n * (0.3 + rnd() * 0.14), 0); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// a plant: two cards crossed, standing on the ground, with its picture from the side, and one lying flat part way up
// it with its picture from above
function plantGeo(k) {
  const u0 = k / 3, du = 1 / 3, pos = [], uv = [], nrm = [], idx = [];
  for (let p = 0; p < 2; p++) { const a = (p / 2) * Math.PI, ca = Math.cos(a), sa = Math.sin(a), o = p * 4;
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { pos.push(x * ca, y, x * sa); uv.push(u0 + (x + 0.5) * du, 0.5 + y * 0.5); nrm.push(0, 1, 0); }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2); } // (each card drawn from both sides as a front face: a back face has its normal turned over, and a card lit from underneath is black)
  const top = k === 2 ? 0.34 : 0.5, half = k === 2 ? 0.5 : 0.44;
  for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) { pos.push(x, top, z); uv.push(u0 + (x / half * 0.5 + 0.5) * du, (z / half * 0.5 + 0.5) * 0.5); nrm.push(0, 1, 0); }
  idx.push(8, 10, 9, 8, 11, 10);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}

/**
 * The scrub of a place, added to group. Returns { count, byKind, dispose } or null (Performance, or no document).
 * @param o the grass's own lookups (grassAt, yAt, roughAt, avoid), quality 0.5 | 1 | 2, x0, x1 the ground's square; focus [[x, z]] the
 *   fishing spots
 */
export function buildScrub(group, { grassAt, yAt, roughAt, avoid, quality = 1, seed = 1, x0 = -400, x1 = 400, focus = [] } = {}) {
  if (quality < 1 || typeof document === "undefined") return null;
  const t0 = performance.now();
  const spots = scrubSpots({ grassAt, yAt, roughAt, avoid, x0, x1, step: quality >= 2 ? 3.2 : 4, cap: quality >= 2 ? 14000 : 7000, seed, focus, reach: quality >= 2 ? 650 : 500 });
  if (!spots.length) return null;
  const tex = scrubAtlas(), mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.FrontSide, roughness: 0.95, metalness: 0, color: 0xffffff });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
  const meshes = [], byKind = {};
  KINDS.forEach((kind, k) => {
    const list = spots.filter((s) => s.kind === kind); byKind[kind] = list.length; if (!list.length) return;
    const geo = plantGeo(k), mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => { e.set(0, s.rot, 0); q.setFromEuler(e); m.compose(v.set(s.x, s.y - 0.06, s.z), q, sc.set(s.w, s.h, s.w)); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setRGB(s.tint, s.tint, s.tint * 0.96)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.computeBoundingSphere(); mesh.name = "fdScrub"; mesh.userData.kind = "scrub"; mesh.userData.plant = kind; mesh.userData.placedMs = Math.round(performance.now() - t0); mesh.userData.wanted = spots.total; mesh.noReflect = true;
    group.add(mesh); meshes.push(mesh);
  });
  return { count: spots.length, byKind, dispose() { for (const me of meshes) { group.remove(me); me.geometry.dispose(); } mat.dispose(); tex?.dispose(); } };
}
