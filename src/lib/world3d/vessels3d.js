// ---- vessels3d: the boats out on the water ----
// The kinds of boat that work out of a harbour like Great Yarmouth and Gorleston: a small inshore fishing boat (a
// forward wheelhouse, an open working deck aft with a gantry) and a harbour workboat or pilot boat (a longer hull, the
// cabin amidships, a mast with a radar). Each is one mesh, coloured by vertex: a hull lofted from sections (a raked
// stem, flare at the bow, the sheer rising forward, a transom), antifouling below a boot-top line, a bulwark, a
// wheelhouse with dark windows and an overhanging roof, a mast. Its lights (masthead white, port red, starboard green)
// are a second small mesh that glows after dark. A wake lies on the water astern while it is under way.
// They are generic working boats, not models of named vessels.
import * as THREE from "three";

const lerp = (a, b, t) => a + (b - a) * t;

/** hull colours seen on working boats: [topsides, antifouling] */
const LIVERIES = [[[0.13, 0.25, 0.42], [0.42, 0.1, 0.08]], [[0.8, 0.79, 0.74], [0.1, 0.16, 0.3]], [[0.72, 0.3, 0.1], [0.08, 0.08, 0.09]], [[0.12, 0.3, 0.22], [0.42, 0.1, 0.08]], [[0.09, 0.1, 0.12], [0.45, 0.12, 0.09]]];

export function vesselMaterials() {
  return {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 }),
    wake: new THREE.MeshBasicMaterial({ color: 0xf2f6f6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  };
}

/** a boat: kind "fishing" | "workboat"; returns a Group with userData { L, wake } */
export function vesselMesh(mats, rnd, kind = "fishing") {
  const fishing = kind === "fishing", L = fishing ? 9.5 + rnd() * 3 : 13 + rnd() * 4, Bm = L * (fishing ? 0.34 : 0.28), D = L * 0.085, F = L * (fishing ? 0.1 : 0.085);
  const [top, anti] = LIVERIES[Math.floor(rnd() * LIVERIES.length)], white = [0.86, 0.85, 0.8], deckC = [0.36, 0.37, 0.36], glass = [0.05, 0.07, 0.09], dark = [0.1, 0.1, 0.11], steel = [0.5, 0.52, 0.53];
  const pos = [], col = [], idx = [];
  const V = (x, y, z, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
  const quad = (a, b, c, d, cc) => { const i = [V(...a, cc), V(...b, cc), V(...c, cc), V(...d, cc)]; idx.push(i[0], i[1], i[2], i[0], i[2], i[3]); };
  const box = (cx, cy, cz, w, h, d, cc) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], cc); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], cc);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], cc); quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], cc);
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cc);
  };
  // ---- the hull: stations from the stern (z = +L/2) to the stem (z = -L/2), bow towards -z ----
  const N = 12, st = [];
  for (let i = 0; i <= N; i++) {
    const f = i / N, z = lerp(L / 2, -L / 2, f);
    // half beam: full aft and amidships, drawn in to the stem; a little tuck at the transom
    const b = (Bm / 2) * (f < 0.12 ? lerp(0.86, 1, f / 0.12) : f < 0.55 ? 1 : Math.max(0.02, Math.cos(((f - 0.55) / 0.45) * Math.PI * 0.5) ** 0.75));
    const sheer = F * (1 + 0.75 * Math.max(0, (f - 0.45) / 0.55) ** 2 + 0.12 * (1 - f)); // rising to the bow, a touch at the stern
    const keel = -D * (f > 0.82 ? lerp(1, 0.1, (f - 0.82) / 0.18) : 1), flare = 1 + 0.16 * Math.max(0, (f - 0.6) / 0.4);
    // keel, turn of the bilge, waterline, boot-top, sheer, bulwark top (y), each with its half breadth
    st.push({ z: z - (f > 0.9 ? (f - 0.9) * L * 0.25 : 0), pts: [[0.03 * b, keel], [0.72 * b, keel * 0.55], [0.93 * b, 0], [0.95 * b, 0.12], [b * flare, sheer], [b * flare, sheer + 0.38]] });
  }
  const bands = [anti, anti, [0.92, 0.92, 0.9], top, top];
  for (const sgn of [1, -1]) for (let i = 0; i < N; i++) for (let k = 0; k < 5; k++) {
    const a = st[i], b = st[i + 1], p = (s, j) => [s.pts[j][0] * sgn, s.pts[j][1], s.z];
    if (sgn > 0) quad(p(a, k), p(b, k), p(b, k + 1), p(a, k + 1), bands[k]); else quad(p(b, k), p(a, k), p(a, k + 1), p(b, k + 1), bands[k]);
  }
  // the transom, and the deck inside the bulwarks
  { const a = st[0]; for (let k = 0; k < 5; k++) quad([-a.pts[k][0], a.pts[k][1], a.z], [a.pts[k][0], a.pts[k][1], a.z], [a.pts[k + 1][0], a.pts[k + 1][1], a.z], [-a.pts[k + 1][0], a.pts[k + 1][1], a.z], bands[k]); }
  for (let i = 0; i < N; i++) { const a = st[i], b = st[i + 1]; quad([-a.pts[4][0], a.pts[4][1], a.z], [a.pts[4][0], a.pts[4][1], a.z], [b.pts[4][0], b.pts[4][1], b.z], [-b.pts[4][0], b.pts[4][1], b.z], deckC); }
  const deckY = F * 1.05;
  // ---- the wheelhouse: forward on a fishing boat, amidships on a workboat; windows all round, a roof that overhangs ----
  const hw = Bm * (fishing ? 0.52 : 0.56), hl = L * (fishing ? 0.2 : 0.3), hh = fishing ? 2.0 : 2.1, hz = fishing ? -L * 0.16 : -L * 0.02, hy = deckY + hh / 2;
  box(0, hy, hz, hw, hh, hl, fishing ? white : [0.9, 0.9, 0.88]);
  const wy = deckY + hh * 0.68, wh = hh * 0.34;
  quad([-hw * 0.44, wy - wh / 2, hz - hl / 2 - 0.01], [hw * 0.44, wy - wh / 2, hz - hl / 2 - 0.01], [hw * 0.44, wy + wh / 2, hz - hl / 2 - 0.01], [-hw * 0.44, wy + wh / 2, hz - hl / 2 - 0.01], glass); // forward windows
  for (const sgn of [1, -1]) quad([sgn * (hw / 2 + 0.01), wy - wh / 2, hz - hl * 0.42], [sgn * (hw / 2 + 0.01), wy - wh / 2, hz + hl * 0.3], [sgn * (hw / 2 + 0.01), wy + wh / 2, hz + hl * 0.3], [sgn * (hw / 2 + 0.01), wy + wh / 2, hz - hl * 0.42], glass);
  quad([-hw * 0.3, wy - wh / 2, hz + hl / 2 + 0.01], [hw * 0.3, wy - wh / 2, hz + hl / 2 + 0.01], [hw * 0.3, wy + wh / 2, hz + hl / 2 + 0.01], [-hw * 0.3, wy + wh / 2, hz + hl / 2 + 0.01], glass);
  box(0, deckY + hh + 0.05, hz, hw + 0.3, 0.1, hl + 0.35, [0.78, 0.78, 0.76]); // the roof
  const roofY = deckY + hh + 0.1;
  // the mast on the wheelhouse roof, a crosstree, a radar bar on a workboat, an aerial
  const mh = fishing ? 2.6 : 3.2; box(0, roofY + mh / 2, hz + hl * 0.2, 0.09, mh, 0.09, steel); box(0, roofY + mh * 0.62, hz + hl * 0.2, 1.1, 0.06, 0.06, steel);
  if (!fishing) box(0, roofY + 0.45, hz - hl * 0.1, 1.3, 0.12, 0.18, [0.9, 0.9, 0.9]);
  box(hw * 0.3, roofY + 0.9, hz + hl * 0.35, 0.03, 1.8, 0.03, dark);
  if (fishing) {
    // the working deck aft: a gantry over the stern, a net drum, fish boxes
    for (const sgn of [1, -1]) box(sgn * Bm * 0.36, deckY + 1.25, L * 0.4, 0.1, 2.5, 0.1, steel);
    box(0, deckY + 2.5, L * 0.4, Bm * 0.72 + 0.1, 0.1, 0.1, steel); box(0, deckY + 0.45, L * 0.22, Bm * 0.42, 0.7, 0.7, [0.2, 0.33, 0.3]);
    box(-Bm * 0.2, deckY + 0.2, L * 0.05, 0.8, 0.4, 0.55, [0.75, 0.3, 0.12]); box(Bm * 0.18, deckY + 0.2, L * 0.08, 0.8, 0.4, 0.55, [0.2, 0.35, 0.6]);
  } else {
    // a workboat: a rubbing strake of fendering round the hull, a low rail aft, a towing post
    for (const sgn of [1, -1]) for (let i = 1; i < N - 2; i++) { const a = st[i], b = st[i + 1]; quad([a.pts[4][0] * sgn * 1.02, a.pts[4][1] - 0.22, a.z], [b.pts[4][0] * sgn * 1.02, b.pts[4][1] - 0.22, b.z], [b.pts[4][0] * sgn * 1.02, b.pts[4][1] - 0.02, b.z], [a.pts[4][0] * sgn * 1.02, a.pts[4][1] - 0.02, a.z], dark); }
    box(0, deckY + 0.5, L * 0.3, 0.16, 1.0, 0.16, steel);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const g = new THREE.Group(), body = new THREE.Mesh(geo, mats.paint); body.castShadow = false; g.add(body);
  // ---- lights: masthead white, port (left, -x looking to the bow) red, starboard green; lit after dark ----
  { const lp = [], lc = [], li = []; const lamp = (x, y, z, c, s = 0.14) => { const o = lp.length / 3; for (const [dx, dy, dz] of [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]]) { lp.push(x + dx, y + dy, z + dz); lc.push(...c); } li.push(...[0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3].map((v) => v + o)); };
    lamp(0, roofY + mh + 0.12, hz + hl * 0.2, [1, 0.95, 0.8]); lamp(-hw / 2 - 0.12, roofY - 0.25, hz - hl * 0.2, [1, 0.12, 0.08], 0.1); lamp(hw / 2 + 0.12, roofY - 0.25, hz - hl * 0.2, [0.1, 1, 0.3], 0.1); lamp(0, deckY + 1.2, L * 0.47, [1, 0.95, 0.8], 0.09);
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute("color", new THREE.Float32BufferAttribute(lc, 3)); lg.setIndex(li); lg.computeVertexNormals(); g.add(new THREE.Mesh(lg, mats.lamp)); }
  // ---- the wake: a long narrow fan of broken water astern, and a curl at the bow; scaled with the boat's way ----
  { const wp = [0, 0.03, L * 0.48, -Bm * 0.4, 0.03, L * 0.5, Bm * 0.4, 0.03, L * 0.5, -Bm * 1.5, 0.03, L * 3.2, Bm * 1.5, 0.03, L * 3.2, -Bm * 0.5, 0.04, -L * 0.36, -Bm * 0.95, 0.04, -L * 0.05, -Bm * 0.55, 0.04, -L * 0.05, Bm * 0.5, 0.04, -L * 0.36, Bm * 0.95, 0.04, -L * 0.05, Bm * 0.55, 0.04, -L * 0.05];
    const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.setIndex([1, 2, 4, 1, 4, 3, 5, 6, 7, 8, 10, 9]);
    const wake = new THREE.Mesh(wg, mats.wake); wake.renderOrder = 2; g.add(wake); g.userData.wake = wake; }
  g.userData.L = L;
  return g;
}
