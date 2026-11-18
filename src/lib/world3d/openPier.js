// ---- openPier: a seaside pier on iron legs, its deck over the water (Cromer, 1901: see localDetail.js) ----
// A Victorian or Edwardian pleasure pier is not a solid arm: its timber deck stands on cast-iron columns, set in
// rows across the pier (trestles) every few metres along it, braced with diagonal ties, with the girders that carry
// the deck running along over them. The sea and the beach run on underneath, and from the deck you see them through
// the railings. Built from the pier's outline in OpenStreetMap: the deck the shape of the outline, the columns on a
// grid inside it, the railing along its edges over the water. Sizes are estimates from photographs (the info panel
// says so). Everything repeated is instanced: a few draw calls for the whole pier.
//   ring: the outline [[x, z]...]; h: the deck's height; o.ramps: [{ a: [x, z], b: [x, z], ya, yb }] where the deck
//   slopes (to the promenade at its root; a lifeboat's slipway into the sea), linear along a to b and level beyond;
//   o.slip: (x, z) => true over a slipway (no railing, no planks: its own ramp); o.keepOff: (x, z) => true where a
//   building stands on the deck (no railing or bench along it); o.landAt, o.bedAt (the seabed or the beach under a
//   point); o.spots (no bench in front of an angler); o.quality.
//   o.style "trestle": a harbour pier's timber extension instead (Whitby's, 1912 to 1914): a solid concrete base from
//   the seabed to a little above the water, and on it a frame of square timber posts, beams and braces carrying the
//   deck; o.benches false, o.lamps false: none along it.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { weather, fbm, noise2, photoTex } from "./textures3d.js";
import { deckHeight, clipHalf } from "./pierDeck.js";
export { deckHeight };

export const OPEN_PIER = { bay: 6.2, across: 3.6, inset: 0.75, deckT: 0.32, girderH: 0.62, col: 0.15, rail: { h: 1.05, post: 1.9, inset: 0.18 }, lampEvery: 24, plank: 0.16 };
// (the timber frame on a concrete base: posts every 2.6 m along it at its edges and down its middle, the base's top
// 1.6 m over the sea at mid-tide: the photographs, estimated)
export const TRESTLE = { bay: 2.6, across: 3.4, inset: 0.3, girderH: 0.36, col: 0.15, baseUp: 1.6, baseIn: 0.15 };

const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c; } return c; };

// ---- the deck's boards: weathered timber planks laid across the pier, drawn once (one tile: 8 boards by 3 m) ----
let plankC = null;
function plankTex() {
  if (plankC || typeof document === "undefined") return plankC;
  const W = 512, H = 1024, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"), img = g.createImageData(W, H);
  const N = 8, bw = H / N; // (boards along the tile's height: each board runs across its width)
  for (let y = 0; y < H; y++) {
    const k = Math.floor(y / bw), v = (y % bw) / bw, seed = k * 13 + 7;
    const tone = 0.86 + (noise2(k * 3.1, 0.5, 64, 61) - 0.5) * 0.22, warm = (noise2(k * 1.7, 2.5, 64, 62) - 0.5) * 30;
    const edge = v < 0.045 || v > 0.955 ? 0.18 : v < 0.09 || v > 0.91 ? 0.78 : 1; // (the gap between boards, and its rounded edge)
    // (the boards' own ends: a joint across each board somewhere along it, staggered)
    const joint = (x) => Math.abs(((x / W + noise2(k, 9.1, 64, 63)) % 1) - 0.5) < 0.004 ? 0.35 : 1;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const grain = 0.5 + 0.5 * Math.sin((v * 7 + fbm(u * 3, v * 2 + k, 3, seed, 3) * 4) * Math.PI);
      const fib = fbm(u * 40, v * 6 + k, 40, seed + 1, 2);
      const blot = fbm(u * 2 + k * 0.37, v, 2, 64, 3);
      let L = tone * (0.84 + grain * 0.1 + (fib - 0.5) * 0.18) * edge * joint(x) * (0.9 + blot * 0.2);
      const r = 168 * L + warm, gg = 162 * L + warm * 0.5, b = 150 * L - warm * 0.3;
      img.data.set([Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, gg)), Math.max(0, Math.min(255, b)), 255], (y * W + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return (plankC = t);
}

/**
 * Builds the pier into group. Returns { meshes, fishEdges, deckAt, solids, glow, lamps } where fishEdges are
 * [x1, z1, x2, z2, nx, nz, "pier", y] along the railing (for walking and fishing), deckAt(x, z) the deck's height.
 */
export function buildOpenPier(group, ring, h, o = {}) {
  const trestle = o.style === "trestle";
  const C = { ...OPEN_PIER, ...(trestle ? TRESTLE : {}), ...(o.sizes || {}) }, ramps = o.ramps || [], slip = o.slip || (() => false), keepOff = o.keepOff || (() => false);
  const deckAt = deckHeight(h, ramps), bedAt = o.bedAt || (() => -2.4), landAt = o.landAt || (() => false), spots = o.spots || [];
  const meshes = [], fishEdges = [], glow = [], solids = [];
  // ---- the pier's own axis: the long way of its outline ----
  let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= ring.length; cz /= ring.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of ring) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), U = [Math.cos(ang), Math.sin(ang)], V = [-U[1], U[0]];
  const uOf = (x, z) => (x - cx) * U[0] + (z - cz) * U[1], vOf = (x, z) => (x - cx) * V[0] + (z - cz) * V[1];
  const at = (u, v) => [cx + U[0] * u + V[0] * v, cz + U[1] * u + V[1] * v];
  let u0 = Infinity, u1 = -Infinity; for (const [x, z] of ring) { const u = uOf(x, z); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }

  // ---- materials ----
  // (the boards: Poly Haven's Brown Planks 03, CC0, a photograph of weathered grey-brown boards, laid across the pier;
  // the drawn boards stand in where it can't load)
  const pd = photoTex("deck_planks_diff"), pn = pd && photoTex("deck_planks_nor", { srgb: false }), pr = pd && photoTex("deck_planks_rough", { srgb: false });
  const mDeck = pd ? new THREE.MeshStandardMaterial({ color: 0xe4e0d8, map: pd, normalMap: pn, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: pr, roughness: 1 }) : new THREE.MeshStandardMaterial({ color: 0xd8d2c8, map: plankTex(), roughness: 0.92 });
  weather(mDeck, { scale: 2.2, mottle: 0.14, rough: [0.85, 1.1], wet: o.wet });
  const mUnder = new THREE.MeshStandardMaterial({ color: 0x5d5850, roughness: 0.95, side: THREE.DoubleSide }); // (the deck's underside and edge: old timber in shade)
  weather(mUnder, { scale: 1.2, mottle: 0.25, grime: [h - 1.5, h, 0.3] });
  const mIron = new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 0.68, metalness: 0.35 });
  weather(mIron, { scale: 0.9, mottle: 0.3, rust: [0.55, 0.36, 0.17, 0.07], grime: [(o.waterY ?? -0.25) - 1.2, (o.waterY ?? -0.25) + 2.2, 0.75], streaks: [h - 0.4, 3.5, 0.25], rough: [0.8, 1.15] });
  // (a trestle's frame: square timber gone grey with the weather, darker and green-stained low down near the sea)
  const mFrame = trestle ? new THREE.MeshStandardMaterial({ color: 0x6b655b, roughness: 0.92 }) : null;
  if (mFrame) weather(mFrame, { wood: "y", scale: 1.1, mottle: 0.3, bump: 0.35, grime: [(o.waterY ?? -0.25) + C.baseUp, (o.waterY ?? -0.25) + C.baseUp + 1.4, 0.55], rough: [0.85, 1.05], wet: o.wet });
  const mSlip = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.9 });
  weather(mSlip, { scale: 1.5, mottle: 0.3, grime: [(o.waterY ?? -0.25) - 1, (o.waterY ?? -0.25) + 2.5, 0.6] });
  const mWhite = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.45, metalness: 0.1 }); // (gloss white paint: the railings and bench ends)
  weather(mWhite, { scale: 0.7, mottle: 0.08, rust: [0.12, 0.42, 0.25, 0.12], grime: [h, h + 0.4, 0.15] });
  const mSeat = new THREE.MeshStandardMaterial({ color: 0x9c7a58, roughness: 0.8 });
  weather(mSeat, { wood: "x", scale: 1, mottle: 0.2, bump: 0.3, rough: [0.85, 1.05], wet: o.wet });
  const mLampIron = new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.45, metalness: 0.5 });
  const mLampGlass = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, emissive: new THREE.Color().setRGB(2.2, 1.6, 0.9), emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.9 });
  glow.push(mLampGlass);

  // ---- the deck: the outline cut where it slopes, each piece at its own heights (planks; the slipway its own) ----
  {
    let pieces = [ring.slice()];
    for (const r of ramps) {
      const d = [r.b[0] - r.a[0], r.b[1] - r.a[1]], L = Math.hypot(d[0], d[1]) || 1, n = [d[0] / L, d[1] / L], m = [-n[0], -n[1]];
      const next = [];
      for (const p of pieces) { for (const q of [clipHalf(p, r.a, m), clipHalf(clipHalf(p, r.a, n), r.b, m), clipHalf(p, r.b, n)]) if (q.length >= 3) next.push(q); }
      pieces = next;
    }
    const top = { deck: [], slip: [] }, under = [];
    for (const piece of pieces) {
      const pts = piece.slice(); let A = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; A += x1 * z2 - x2 * z1; } if (Math.abs(A) < 0.02) continue;
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length, isSlip = slip(mx, mz);
      const list = isSlip ? top.slip : top.deck;
      for (const t of tris) {
        // (wound upwards whichever way the outline ran)
        const [i, j, k] = A > 0 ? [t[0], t[2], t[1]] : t;
        for (const q of [pts[i], pts[j], pts[k]]) list.push(q[0], deckAt(q[0], q[1]), q[1]);
        for (const q of [pts[i], pts[k], pts[j]]) under.push(q[0], deckAt(q[0], q[1]) - C.deckT, q[1]);
      }
    }
    // the edge all round: the deck's thickness, its timber fascia
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], ya = deckAt(a[0], a[1]), yb = deckAt(b[0], b[1]);
      under.push(a[0], ya, a[1], b[0], yb - C.deckT, b[1], b[0], yb, b[1], a[0], ya, a[1], a[0], ya - C.deckT, a[1], b[0], yb - C.deckT, b[1]);
    }
    const mk = (list, mat, uv) => {
      if (!list.length) return null;
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
      // (the photographed boards run up their picture, so its height goes across the pier: 1.7 m a picture, ten boards
      // about 17 cm wide; the drawn ones run across theirs)
      if (uv) { const t = []; for (let i = 0; i < list.length; i += 3) { const x = list[i], z = list[i + 2]; if (pd) t.push(uOf(x, z) / 1.7, vOf(x, z) / 1.7); else t.push(vOf(x, z) / 3.0, uOf(x, z) / (C.plank * 8)); } g.setAttribute("uv", new THREE.Float32BufferAttribute(t, 2)); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; group.add(m); meshes.push(m); return m;
    };
    // (the planks run across the pier, a board every 16 cm along it)
    const d1 = mk(top.deck, mDeck, true); if (d1) { d1.userData.kind = "the pier"; solids.push(d1); }
    const d2 = mk(top.slip, mSlip, false); if (d2) { d2.userData.kind = "the slipway"; solids.push(d2); }
    const d3 = mk(under, mUnder, false); if (d3) d3.castShadow = true;
  }

  // ---- the iron underneath: columns in rows across the pier, girders along and across, diagonal ties ----
  const cols = [], beams = []; // beams: [x1, y1, z1, x2, y2, z2, w, h]
  const rows = [];
  for (let u = u0 + 1.2; u <= u1 - 0.8; u += C.bay) {
    // where the row crosses the deck: the inside spans along v
    const xs = []; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], ua = uOf(a[0], a[1]), ub = uOf(b[0], b[1]); if ((ua > u) !== (ub > u)) { const t = (u - ua) / (ub - ua); xs.push(vOf(a[0], a[1]) + (vOf(b[0], b[1]) - vOf(a[0], a[1])) * t); } }
    xs.sort((p, q) => p - q);
    const row = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const v0 = xs[k] + C.inset, v1 = xs[k + 1] - C.inset; if (v1 - v0 < 0.5) continue;
      const n = Math.max(1, Math.round((v1 - v0) / C.across));
      for (let i = 0; i <= n; i++) {
        const v = v0 + ((v1 - v0) * i) / n, [x, z] = at(u, v); if (slip(x, z)) continue;
        const yTop = deckAt(x, z) - C.deckT - C.girderH, yBot = trestle ? (o.waterY ?? -0.25) + C.baseUp : landAt(x, z) ? Math.min(yTop - 0.5, o.landY ?? 2.2) : bedAt(x, z) - 0.6;
        if (yTop - yBot < 0.6) continue;
        row.push({ x, z, v, yTop, yBot });
      }
    }
    for (const c of row) cols.push(c);
    rows.push({ u, row });
    // across the row: the cross girder under the deck and the X ties between neighbouring columns
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i], b = row[i + 1]; if (b.v - a.v > C.across * 1.6) continue;
      beams.push([a.x, a.yTop + C.girderH * 0.5, a.z, b.x, b.yTop + C.girderH * 0.5, b.z, 0.22, C.girderH]);
      const lo = Math.max(Math.max(a.yBot, b.yBot) + 0.8, (o.waterY ?? -0.25) - 1.0), hi = Math.min(a.yTop, b.yTop) - 0.25;
      if (trestle) { const lo2 = a.yBot + 0.15, hi2 = Math.min(a.yTop, b.yTop) - 0.1; if (hi2 - lo2 > 0.8) beams.push([a.x, lo2, a.z, b.x, hi2, b.z, 0.12, 0.2]); } // (one timber brace across each pair of posts, alternating)
      else if (hi - lo > 1.2) {
        beams.push([a.x, lo, a.z, b.x, hi, b.z, 0.07, 0.14], [a.x, hi, a.z, b.x, lo, b.z, 0.07, 0.14]);
        beams.push([a.x, (lo + hi) / 2 + 0.6, a.z, b.x, (lo + hi) / 2 + 0.6, b.z, 0.08, 0.12]); // (a horizontal tie)
      }
    }
  }
  // along the pier: the main girders from row to row over the columns, and ties in every other bay along the outer lines
  for (let r = 0; r + 1 < rows.length; r++) {
    const A = rows[r].row, B = rows[r + 1].row;
    for (const a of A) {
      let best = null; for (const b of B) { const d = Math.abs(b.v - a.v); if (d < 1.2 && (!best || d < Math.abs(best.v - a.v))) best = b; }
      if (!best) continue;
      beams.push([a.x, a.yTop + C.girderH * 0.5, a.z, best.x, best.yTop + C.girderH * 0.5, best.z, 0.2, C.girderH]);
      const outer = a === A[0] || a === A[A.length - 1];
      if (trestle) { if (outer && r % 2 === 0) beams.push([a.x, a.yBot + 0.15, a.z, best.x, best.yTop - 0.1, best.z, 0.12, 0.2]); continue; }
      if (outer && r % 2 === 0) { const lo = Math.max(Math.max(a.yBot, best.yBot) + 0.8, (o.waterY ?? -0.25) - 1.0), hi = Math.min(a.yTop, best.yTop) - 0.25; if (hi - lo > 1.2) beams.push([a.x, lo, a.z, best.x, hi, best.z, 0.07, 0.14]); }
    }
  }
  if (cols.length && trestle) {
    // a post: square timber, 30 cm, from the base to the beam under the deck
    const post = new THREE.BoxGeometry(C.col * 2, 1, C.col * 2).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(post, mFrame, cols.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    cols.forEach((c, i) => { mx.compose(p.set(c.x, c.yBot, c.z), q.identity(), s.set(1, c.yTop - c.yBot, 1)); im.setMatrixAt(i, mx); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); meshes.push(im);
  } else if (cols.length) {
    // a column: a cast-iron shaft, flaring at its foot (the screw pile's collar) and its head (the cap under the girder)
    const shaft = new THREE.CylinderGeometry(C.col * 0.9, C.col, 1, 10, 1, true).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(shaft, mIron, cols.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    cols.forEach((c, i) => { mx.compose(p.set(c.x, c.yBot, c.z), q.identity(), s.set(1, c.yTop - c.yBot, 1)); im.setMatrixAt(i, mx); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); meshes.push(im);
    const capG = mergeGeometries([new THREE.CylinderGeometry(C.col * 1.5, C.col * 1.05, 0.28, 10).translate(0, -0.14, 0), new THREE.BoxGeometry(C.col * 3.2, 0.08, C.col * 3.2).translate(0, 0.0, 0)]);
    const footG = new THREE.CylinderGeometry(C.col * 1.15, C.col * 1.6, 0.5, 10).translate(0, 0.25, 0);
    const caps = new THREE.InstancedMesh(capG, mIron, cols.length * 2);
    cols.forEach((c, i) => { mx.compose(p.set(c.x, c.yTop, c.z), q.identity(), s.set(1, 1, 1)); caps.setMatrixAt(i * 2, mx); mx.compose(p.set(c.x, c.yBot + 0.6, c.z), q.identity(), s.set(1, 1, 1)); caps.setMatrixAt(i * 2 + 1, mx); });
    void footG; caps.castShadow = true; caps.computeBoundingSphere(); group.add(caps); meshes.push(caps);
  }
  if (beams.length) {
    const box = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(box, trestle ? mFrame : mIron, beams.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
    beams.forEach(([x1, y1, z1, x2, y2, z2, w, hh], i) => { d.set(x2 - x1, y2 - y1, z2 - z1); const L = d.length(); q.setFromUnitVectors(X, d.normalize()); mx.compose(p.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2), q, s.set(L, hh, w)); im.setMatrixAt(i, mx); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); meshes.push(im);
  }

  // ---- a trestle's base: solid concrete from the seabed up to a little above the sea, the deck's outline ----
  if (trestle) {
    const wy = o.waterY ?? -0.25, top = wy + C.baseUp, bot = Math.min(...ring.map(([x, z]) => bedAt(x, z))) - 0.8;
    const pts = ring.slice(); let A2 = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; A2 += x1 * z2 - x2 * z1; } if (A2 < 0) pts.reverse();
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: top - bot, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, bot, 0);
    const mBase = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95 });
    weather(mBase, { scale: 0.8, mottle: 0.35, grime: [wy - 1.2, wy + 1.0, 0.7], streaks: [top, 1.4, 0.25], rough: [0.9, 1.1] });
    const m = new THREE.Mesh(g, mBase); m.castShadow = m.receiveShadow = true; m.userData.kind = "the pier"; group.add(m); meshes.push(m);
  }

  // ---- the railing along the deck's edge over the water, with the benches set into it ----
  const posts = [], rails = [], benchEnds = [], seats = [], lampsAt = [];
  const nearSpot = (x, z, r) => spots.some((sp) => Math.hypot(x - sp.at[0], z - sp.at[2]) < r);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.4) continue;
    const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; let nrm = [-t[1], t[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (inside([mid[0] + nrm[0] * 0.6, mid[1] + nrm[1] * 0.6], ring)) nrm = [-nrm[0], -nrm[1]]; // (outward)
    const steps = Math.max(1, Math.round(len / C.rail.post));
    let run = null;
    const flush = () => { if (run && run.n >= 1) rails.push(run); run = null; };
    for (let k = 0; k <= steps; k++) {
      const f = k / steps, ex = a[0] + (b[0] - a[0]) * f, ez = a[1] + (b[1] - a[1]) * f, x = ex - nrm[0] * C.rail.inset, z = ez - nrm[1] * C.rail.inset;
      // (no railing over the land at the pier's root, along a building on the deck, or down the slipway)
      const over = !landAt(ex + nrm[0] * 1.2, ez + nrm[1] * 1.2) && !slip(x, z) && !keepOff(x, z) && !keepOff(x - nrm[0] * 0.6, z - nrm[1] * 0.6);
      if (!over) { flush(); continue; }
      const y = deckAt(x, z);
      posts.push([x, y, z, Math.atan2(nrm[0], nrm[1])]);
      if (!run) run = { pts: [], n: 0 }; run.pts.push([x, y, z]); run.n = run.pts.length - 1;
      if (k < steps) {
        const x2 = a[0] + (b[0] - a[0]) * ((k + 1) / steps) - nrm[0] * C.rail.inset, z2 = a[1] + (b[1] - a[1]) * ((k + 1) / steps) - nrm[1] * C.rail.inset;
        // a bench along the inside of the railing (Cromer's are part of it: white cast-iron ends, timber slats), not
        // where an angler stands at the rail
        if (o.benches !== false && len > 5 && !nearSpot((x + x2) / 2, (z + z2) / 2, 5) && !keepOff((x + x2) / 2 - nrm[0] * 1, (z + z2) / 2 - nrm[1] * 1) && (k % 4 !== 3)) {
          seats.push([x, y, z, x2, deckAt(x2, z2), z2, nrm[0], nrm[1]]);
          benchEnds.push([x, y, z, Math.atan2(nrm[0], nrm[1])]);
        }
      }
    }
    flush();
    // fishing over the railing, and walking up to it but not through it
    const y0 = deckAt(a[0], a[1]);
    if (!landAt(mid[0] + nrm[0] * 1.2, mid[1] + nrm[1] * 1.2) && !slip(mid[0], mid[1]) && !keepOff(mid[0] - nrm[0] * 0.5, mid[1] - nrm[1] * 0.5)) fishEdges.push([a[0], a[1], b[0], b[1], nrm[0], nrm[1], "pier", y0]);
  }
  if (posts.length) {
    // a post: a white flat bar with a little scroll leaning out at its top (approximated), on a small foot
    const pg = mergeGeometries([new THREE.BoxGeometry(0.05, C.rail.h, 0.035).translate(0, C.rail.h / 2, 0), new THREE.BoxGeometry(0.09, 0.05, 0.09).translate(0, 0.025, 0), new THREE.BoxGeometry(0.04, 0.22, 0.03).rotateX(-0.5).translate(0, C.rail.h - 0.08, 0.05)]);
    const im = new THREE.InstancedMesh(pg, mWhite, posts.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    posts.forEach(([x, y, z, ry], i) => { mx.compose(p.set(x, y, z), q.setFromAxisAngle(Y, ry), s); im.setMatrixAt(i, mx); });
    im.castShadow = true; im.computeBoundingSphere(); group.add(im); meshes.push(im);
  }
  if (rails.length) {
    // three rails: a rounded top rail (its outward lean drawn by setting it 4 cm out), a middle and a lower one
    const parts = [];
    for (const r of rails) for (let i = 0; i + 1 < r.pts.length; i++) {
      const [x1, y1, z1] = r.pts[i], [x2, y2, z2] = r.pts[i + 1];
      for (const [hh, rad] of [[C.rail.h, 0.032], [C.rail.h * 0.62, 0.02], [0.24, 0.02]]) {
        const a = new THREE.Vector3(x1, y1 + hh, z1), b = new THREE.Vector3(x2, y2 + hh, z2), d = b.clone().sub(a), L = d.length(); if (L < 0.05) continue;
        const g = new THREE.CylinderGeometry(rad, rad, L + 0.02, 8, 1, true); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((x1 + x2) / 2, (y1 + y2) / 2 + hh, (z1 + z2) / 2); parts.push(g);
      }
    }
    const g = parts.length ? mergeGeometries(parts) : null;
    if (g) { const m = new THREE.Mesh(g, mWhite); m.castShadow = true; group.add(m); meshes.push(m); }
  }
  if (seats.length) {
    // the seat (three slats) and the back (two), along the inside of the railing between two posts
    const slat = new THREE.BoxGeometry(1, 0.035, 0.11), im = new THREE.InstancedMesh(slat, mSeat, seats.length * 5), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    let n = 0;
    for (const [x1, y1, z1, x2, y2, z2, nx, nz] of seats) {
      const L = Math.hypot(x2 - x1, z2 - z1) - 0.06, ry = Math.atan2(-(z2 - z1), x2 - x1), mxp = (x1 + x2) / 2, mzp = (z1 + z2) / 2, my = (y1 + y2) / 2;
      for (const [off, hh, tilt] of [[0.2, 0.44, 0], [0.33, 0.44, 0], [0.46, 0.44, 0], [0.06, 0.62, 1.35], [0.07, 0.78, 1.35]]) {
        q.setFromAxisAngle(Y, ry); if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(X, tilt));
        mx.compose(p.set(mxp - nx * off, my + hh, mzp - nz * off), q, s.set(L, 1, 1)); im.setMatrixAt(n++, mx);
      }
    }
    im.count = n; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); meshes.push(im);
    // the bench ends: white cast iron, an S-curved frame from the deck to the seat and up the back (three pieces)
    const eg = mergeGeometries([
      new THREE.BoxGeometry(0.04, 0.42, 0.05).translate(0, 0.21, 0.42).rotateX(0.0),
      new THREE.BoxGeometry(0.04, 0.05, 0.48).translate(0, 0.42, 0.25),
      new THREE.BoxGeometry(0.04, 0.5, 0.05).rotateX(-0.22).translate(0, 0.62, 0.05),
    ]);
    const ie = new THREE.InstancedMesh(eg, mWhite, benchEnds.length);
    benchEnds.forEach(([x, y, z, ry], i) => { mx.compose(p.set(x, y, z), q.setFromAxisAngle(Y, ry + Math.PI), s.set(1, 1, 1)); ie.setMatrixAt(i, mx); });
    ie.castShadow = true; ie.computeBoundingSphere(); group.add(ie); meshes.push(ie);
  }

  // ---- the lamps: black Victorian columns with two lanterns on a scrolled arm, down the middle of the pier ----
  if (o.lamps !== false) {
    for (let u = u0 + 10; u <= u1 - 6; u += C.lampEvery) {
      // the middle of the deck across this point
      const xs = []; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], ua = uOf(a[0], a[1]), ub = uOf(b[0], b[1]); if ((ua > u) !== (ub > u)) { const t = (u - ua) / (ub - ua); xs.push(vOf(a[0], a[1]) + (vOf(b[0], b[1]) - vOf(a[0], a[1])) * t); } }
      if (xs.length < 2) continue; xs.sort((p, q) => p - q);
      const v = (xs[0] + xs[1]) / 2, [x, z] = at(u, v);
      if (xs[1] - xs[0] > 16 || slip(x, z) || keepOff(x, z) || nearSpot(x, z, 3) || landAt(x, z)) continue;
      lampsAt.push([x, deckAt(x, z), z, ang]);
    }
    if (lampsAt.length) {
      const H = 3.7;
      const iron = mergeGeometries([
        new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8).translate(0, 0.25, 0), // (the base)
        new THREE.CylinderGeometry(0.075, 0.11, H - 0.5, 10).translate(0, 0.5 + (H - 0.5) / 2, 0),
        new THREE.TorusGeometry(0.1, 0.02, 6, 12).rotateX(Math.PI / 2).translate(0, 1.1, 0),
        new THREE.BoxGeometry(1.05, 0.05, 0.05).translate(0, H - 0.05, 0), // (the cross arm)
        new THREE.TorusGeometry(0.13, 0.018, 6, 12, Math.PI).translate(-0.26, H - 0.2, 0), new THREE.TorusGeometry(0.13, 0.018, 6, 12, Math.PI).translate(0.26, H - 0.2, 0), // (its scrolls)
        new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).translate(0, H + 0.2, 0), new THREE.SphereGeometry(0.06, 8, 6).translate(0, H + 0.48, 0), // (the finial)
        ...[-0.5, 0.5].flatMap((s) => [new THREE.ConeGeometry(0.2, 0.2, 6).translate(s, H + 0.52, 0), new THREE.CylinderGeometry(0.11, 0.07, 0.08, 6).translate(s, H - 0.02, 0)]), // (each lantern's cap and its base)
      ]);
      const glass = mergeGeometries([-0.5, 0.5].map((s) => new THREE.CylinderGeometry(0.17, 0.11, 0.42, 6, 1).translate(s, H + 0.23, 0)));
      const ii = new THREE.InstancedMesh(iron, mLampIron, lampsAt.length), ig = new THREE.InstancedMesh(glass, mLampGlass, lampsAt.length), mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
      lampsAt.forEach(([x, y, z, a], i) => { mx.compose(p.set(x, y, z), q.setFromAxisAngle(Y, -a), s); ii.setMatrixAt(i, mx); ig.setMatrixAt(i, mx); });
      ii.castShadow = true; ii.computeBoundingSphere(); ig.computeBoundingSphere(); group.add(ii, ig); meshes.push(ii, ig);
    }
  }
  return { meshes, fishEdges, deckAt, solids, glow, lamps: lampsAt.map(([x, y, z]) => [x, y + 3.9, z]), posts: posts.map(([x, , z]) => [x, z]), benches: seats.length };
}
