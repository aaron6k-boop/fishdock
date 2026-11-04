// ---- landmarks3d: a mark's own landmark buildings, modelled from photographs (see localDetail.js) ----
// Each is a handful of shapes merged by material (one draw call per material), placed on the building's outline from
// OpenStreetMap. Sizes are estimates from photographs.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bricks } from "./textures3d.js";

// ---- a few shapes merged by material: one mesh (one draw call) per material ----
function kit() {
  const parts = {};
  const box = (mat, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); (parts[mat] ||= []).push(g); };
  // a bar between two points (a lattice member or a railing), square in section
  const bar = (mat, a, b, t) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); if (L < 1e-3) return;
    const g = new THREE.BoxGeometry(t, L, t); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); (parts[mat] ||= []).push(g);
  };
  return { parts, box, bar };
}

// a square lattice mast: four legs tapering from base to top, rings and cross-bracing each section
function lattice(K, mat, x, z, y0, h, w0, w1, sect = 1.2, t = 0.05) {
  const n = Math.max(1, Math.round(h / sect)), at = (k) => { const f = k / n; return { y: y0 + h * f, w: (w0 + (w1 - w0) * f) / 2 }; };
  const corner = (c, i) => [x + (i & 1 ? c.w : -c.w), c.y, z + (i & 2 ? c.w : -c.w)], order = [0, 1, 3, 2];
  for (let i = 0; i < 4; i++) K.bar(mat, corner(at(0), i), corner(at(n), i), t * 1.4);
  for (let k = 0; k <= n; k++) for (let s = 0; s < 4; s++) {
    const a = order[s], b = order[(s + 1) % 4];
    K.bar(mat, corner(at(k), a), corner(at(k), b), t);
    if (k < n) K.bar(mat, corner(at(k), (k % 2) ? a : b), corner(at(k + 1), (k % 2) ? b : a), t * 0.8);
  }
}

// a railing of posts and two rails along a run of points (closed or open)
function railing(K, mat, pts, y, h = 1.05, post = 1.3, t = 0.045) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1], L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / post));
    for (let k = 0; k < n; k++) { const f = k / n; K.box(mat, t, h, t, x1 + (x2 - x1) * f, y + h / 2, z1 + (z2 - z1) * f); }
    for (const yy of [h, h * 0.5]) K.bar(mat, [x1, y + yy, z1], [x2, y + yy, z2], t);
  }
  const [xl, zl] = pts[pts.length - 1]; K.box(mat, t, h, t, xl, y + h / 2, zl);
}

// the signs, banners and flag, drawn once into one small texture (one draw call for all of them): [u0, v0, u1, v1]
const SIGN_UV = { fascia: [0, 0.75, 1, 1], navy: [0, 0.5, 1, 0.75], white: [0, 0.25, 1, 0.5], flag: [0, 0, 0.25, 0.25] };
function signTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d");
  const text = (t, x, y, size, col, w = "bold") => { g.fillStyle = col; g.font = `${w} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(t, x, y); };
  const star = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, rr = k % 2 ? r * 0.3 : r; g.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr); } g.fill(); };
  // the fascia: a black plate with white capitals on the white panel
  g.fillStyle = "#f2f1ec"; g.fillRect(0, 0, 512, 64); g.fillStyle = "#16181b"; g.fillRect(150, 6, 212, 52);
  text("NATIONAL", 256, 21, 19, "#f4f4f4"); text("COASTWATCH", 256, 44, 19, "#f4f4f4");
  // the navy banner and the white banner hung on the balcony railing
  g.fillStyle = "#1d2a5c"; g.fillRect(0, 64, 512, 64); g.fillStyle = "#f2f2f2"; g.beginPath(); g.arc(34, 96, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = "#1d2a5c"; g.beginPath(); g.arc(34, 96, 20, 0, Math.PI * 2); g.fill(); star(34, 96, 17, "#e5b93a");
  text("National Coastwatch", 280, 84, 26, "#ffffff"); text("EYES ALONG THE COAST", 280, 114, 15, "#dfe4ef", "normal");
  g.fillStyle = "#f4f4f2"; g.fillRect(0, 128, 512, 64); g.fillStyle = "#1d2a5c"; g.beginPath(); g.arc(40, 160, 27, 0, Math.PI * 2); g.fill(); star(40, 160, 19, "#e5b93a");
  text("National Coastwatch Institution", 285, 146, 21, "#1d2a5c"); text("EYES ALONG THE COAST", 285, 176, 15, "#1d2a5c", "normal");
  // the flag: navy with the compass star
  g.fillStyle = "#1d2a5c"; g.fillRect(0, 192, 128, 64); star(64, 224, 24, "#e5b93a");
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/**
 * Gorleston South Pier Lighthouse (1955), home of the National Coastwatch station. Modelled from photographs of its
 * ends and sides: three stepped tiers. A ground storey of painted brick with boarded panels; a wide cantilevered white
 * slab carrying a balcony with red railings (banners hung on them, an iron spiral stair up to it at the seaward
 * corner); the lookout storey, brick to sill height under a continuous band of white-framed windows and a white fascia
 * with the black "National Coastwatch" plate; a deep white roof slab with red railings, the drum lanterns at its
 * corners, a red hatch, aerial poles and the light's lattice mast with its platform. A tall lattice mast stands beside
 * it on the landward side. The light: Fl R 3s (one red flash every three seconds; Wikipedia, the Admiralty list).
 * ring: the building's outline from the map; base: the deck's height. Returns { meshes, glow, flash, collider }.
 */
function gorlestonLighthouse(group, ring, base) {
  // the outline's long axis and its middle
  const pts = ring.length > 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  let best = 0, ax = [1, 0];
  for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length], L = Math.hypot(x2 - x1, z2 - z1); if (L > best) { best = L; ax = [(x2 - x1) / L, (z2 - z1) / L]; } }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let L = 0, W = 0; for (const [x, z] of pts) { L = Math.max(L, Math.abs((x - cx) * ax[0] + (z - cz) * ax[1])); W = Math.max(W, Math.abs(-(x - cx) * ax[1] + (z - cz) * ax[0])); }
  L *= 2; W *= 2;
  // built along +x (the long axis) and turned into place. ex: +1 when the seaward (east) end is at +x. The river (north)
  // side is at -z when +x points east (turned, local +z points south).
  const ex = ax[0] > 0 ? 1 : -1, nzS = ex; // (local z of the north side is -nzS)
  const K = kit(), y0 = base;
  const G = 3.25, S1 = 0.32, U = 3.0, S2 = 0.36; // ground storey, first slab, lookout storey, roof slab (metres)
  // ---- ground storey: painted brick, boarded panels below, a dark door on each long side ----
  K.box("paint", L, G, W, 0, y0 + G / 2, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) K.box("panel", L / 4 - 0.12, 2.0, 0.05, (i - 1.5) * (L / 4), y0 + 1.05, s * (W / 2 + 0.025));
  for (const e of [-1, 1]) for (let i = 0; i < 2; i++) K.box("panel", 0.05, 2.0, W / 2 - 0.12, e * (L / 2 + 0.025), y0 + 1.05, (i - 0.5) * (W / 2));
  for (const s of [-1, 1]) K.box("glass", 1.0, 2.1, 0.07, -ex * L * 0.18, y0 + 1.05, s * (W / 2 + 0.04));
  // ---- first slab: cantilevered well out all round, a downstand under its edge and brackets under it ----
  const o1 = 0.95, y1 = y0 + G;
  K.box("white", L + o1 * 2, S1, W + o1 * 2, 0, y1 + S1 / 2, 0);
  K.box("white", L + o1 * 2 - 0.1, 0.16, W + o1 * 2 - 0.1, 0, y1 - 0.08, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) K.box("white", 0.18, 0.4, o1, (i - 2) * (L / 4.3), y1 - 0.2, s * (W / 2 + o1 / 2));
  // ---- the lookout storey: inset from the slab's edge ----
  const li = 0.15, lL = L - li * 2, lW = W - li * 2, yU = y1 + S1;
  const sill = 1.15, win = 1.15, fas = U - sill - win;
  K.box("brick", lL, sill, lW, 0, yU + sill / 2, 0);
  K.box("trim", lL + 0.08, 0.08, lW + 0.08, 0, yU + sill + 0.04, 0); // the sill
  // the window band: glass all round, white mullions at the corners and between the panes, a white head
  K.box("glass", lL - 0.06, win, lW - 0.06, 0, yU + sill + win / 2, 0);
  const posts = (len, n) => Array.from({ length: n + 1 }, (_, k) => -len / 2 + (len * k) / n);
  for (const x of posts(lL, 7)) for (const s of [-1, 1]) K.box("trim", 0.1, win, 0.1, x, yU + sill + win / 2, s * lW / 2);
  for (const z of posts(lW, 3)) for (const e of [-1, 1]) K.box("trim", 0.1, win, 0.1, e * lL / 2, yU + sill + win / 2, z);
  K.box("white", lL + 0.06, fas, lW + 0.06, 0, yU + sill + win + fas / 2, 0); // the fascia
  for (const e of [-1, 1]) for (const s of [-1, 1]) K.box("frame", 0.16, fas + 0.02, 0.16, e * lL / 2, yU + sill + win + fas / 2, s * lW / 2); // (dark corner posts)
  // ---- roof slab: deep, cantilevered, stepped under its edge ----
  const o2 = 0.8, yR = yU + U;
  K.box("white", lL + o2 * 2, S2, lW + o2 * 2, 0, yR + S2 / 2, 0);
  K.box("white", lL + o2 * 2 - 0.5, 0.18, lW + o2 * 2 - 0.5, 0, yR - 0.09, 0);
  // ---- red railings: round the balcony and round the roof ----
  const b1x = L / 2 + o1 - 0.12, b1z = W / 2 + o1 - 0.12;
  railing(K, "red", [[-b1x, -b1z], [b1x, -b1z], [b1x, b1z], [-b1x, b1z], [-b1x, -b1z]], y1 + S1, 1.05, 1.4);
  const rT = yR + S2, b2x = lL / 2 + o2 - 0.15, b2z = lW / 2 + o2 - 0.15;
  railing(K, "red", [[-b2x, -b2z], [b2x, -b2z], [b2x, b2z], [-b2x, b2z], [-b2x, -b2z]], rT, 1.0, 1.6);
  // ---- on the roof ----
  K.box("redbox", 1.15, 1.35, 0.5, -ex * 0.4, rT + 0.68, -nzS * (lW / 2 - 0.1)); // the red hatch at the back
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { // drum lanterns and cowls at the corners
    const g = new THREE.CylinderGeometry(0.24, 0.24, 0.6, 10); g.translate(sx * (b2x - 0.35), rT + 0.3, sz * (b2z - 0.35)); (K.parts.drum ||= []).push(g);
    const c = new THREE.ConeGeometry(0.25, 0.18, 10); c.translate(sx * (b2x - 0.35), rT + 0.69, sz * (b2z - 0.35)); (K.parts.drum ||= []).push(c);
  }
  // aerial poles, a radar dish and a little lantern on a post
  K.box("galv", 0.06, 3.0, 0.06, ex * 0.6, rT + 1.5, -nzS * 0.3); K.box("galv", 0.06, 2.0, 0.06, ex * (b2x - 1.0), rT + 1.0, nzS * 0.6);
  K.box("galv", 0.7, 0.06, 0.25, ex * (b2x - 1.0), rT + 2.0, nzS * 0.6); K.box("galv", 0.36, 0.3, 0.36, ex * 0.2, rT + 0.9, nzS * 0.2);
  // the light's mast: a short lattice tower on the roof with a grating platform and a ladder
  const mX = ex * b2x * 0.3, mZ = nzS * (b2z - 1.0), mH = 3.2; // (towards the seaward end, on the south side)
  lattice(K, "galv", mX, mZ, rT, mH, 1.2, 1.0, 0.8, 0.045);
  K.box("galv", 1.5, 0.06, 1.5, mX, rT + mH, mZ);
  railing(K, "galv", [[mX - 0.72, mZ - 0.72], [mX + 0.72, mZ - 0.72], [mX + 0.72, mZ + 0.72], [mX - 0.72, mZ + 0.72], [mX - 0.72, mZ - 0.72]], rT + mH, 0.95, 0.5, 0.035);
  for (let k = 0; k < 9; k++) K.box("galv", 0.4, 0.03, 0.05, mX + ex * 0.8, rT + 0.35 * k + 0.2, mZ); // the ladder's rungs
  K.box("galv", 0.08, 1.6, 0.08, mX, rT + mH + 0.8, mZ);
  const lampAt = [mX, rT + mH + 1.75, mZ];
  // ---- the iron spiral stair at the seaward corner on the river side, up to the balcony ----
  const sX = ex * (L / 2 + 0.55), sZ = -nzS * (W / 2 + 0.25), steps = 15;
  K.box("iron", 0.12, G + S1 + 1.1, 0.12, sX, y0 + (G + S1 + 1.1) / 2, sZ);
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 1.7 * ex, y = y0 + ((k + 1) / (steps + 1)) * (G + S1);
    K.box("iron", 0.72, 0.04, 0.26, sX + Math.cos(a) * 0.38, y, sZ + Math.sin(a) * 0.38, -a);
    if (k % 2 === 0) K.box("iron", 0.03, 0.95, 0.03, sX + Math.cos(a) * 0.72, y + 0.48, sZ + Math.sin(a) * 0.72);
  }
  for (let k = 0; k < steps; k++) { const a0 = (k / steps) * Math.PI * 1.7 * ex, a1 = ((k + 1) / steps) * Math.PI * 1.7 * ex, y = (q) => y0 + ((q + 1) / (steps + 1)) * (G + S1) + 0.95; K.bar("iron", [sX + Math.cos(a0) * 0.72, y(k), sZ + Math.sin(a0) * 0.72], [sX + Math.cos(a1) * 0.72, y(k + 1), sZ + Math.sin(a1) * 0.72], 0.035); }
  // ---- a flagpole off the balcony's seaward end ----
  const fX = ex * (b1x - 0.1), fZ = -nzS * (b1z - 0.25); // (at the river-side corner, by the stair)
  K.box("galv", 0.05, 3.2, 0.05, fX, y1 + S1 + 1.6, fZ);
  // ---- the tall lattice mast beside it on the landward side ----
  const tX = -ex * (L / 2 + 4.5), tZ = nzS * W * 0.35, tH = 15; // (off the landward end, on the south side)
  lattice(K, "galv", tX, tZ, y0, tH, 1.5, 0.9, 1.5, 0.06);
  K.box("galv", 1.4, 0.08, 1.4, tX, y0 + tH, tZ);
  railing(K, "galv", [[tX - 0.7, tZ - 0.7], [tX + 0.7, tZ - 0.7], [tX + 0.7, tZ + 0.7], [tX - 0.7, tZ + 0.7], [tX - 0.7, tZ - 0.7]], y0 + tH, 0.9, 0.7, 0.035);
  K.box("galv", 0.08, 2.2, 0.08, tX, y0 + tH + 1.1, tZ);
  K.box("galv", 1.6, 0.06, 0.06, tX, y0 + tH + 1.9, tZ);
  K.box("lamp", 0.3, 0.2, 0.3, tX, y0 + tH + 0.2, tZ + 0.8);

  // ---- signs, banners and the flag: flat quads with their part of the sign texture ----
  const sq = (key, w, h, x, y, z, ry) => { const g = new THREE.PlaneGeometry(w, h), [u0, v0, u1, v1] = SIGN_UV[key], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); g.rotateY(ry); g.translate(x, y, z); (K.parts.sign ||= []).push(g); };
  const endX = ex * (lL / 2 + 0.035), faceEnd = ex > 0 ? Math.PI / 2 : -Math.PI / 2;
  sq("fascia", lW, fas, endX, yU + sill + win + fas / 2, 0, faceEnd); // (the plate on the seaward end)
  sq("fascia", lW, fas, -endX, yU + sill + win + fas / 2, 0, -faceEnd);
  const bX = ex * (b1x + 0.03);
  sq("navy", 2.9, 0.36, bX, y1 + S1 + 0.72, nzS * 1.55 * (W / 6.5), faceEnd); // (navy on the south half, white on the river half)
  sq("white", 2.6, 0.5, bX, y1 + S1 + 0.7, -nzS * 1.55 * (W / 6.5), faceEnd);
  sq("flag", 1.1, 0.7, fX, y1 + S1 + 2.75, fZ + nzS * 0.6, Math.PI / 2); // (flying in over the balcony from the pole)

  const brk = bricks(23, [116, 74, 60]); // (a darker, browner brick than the town's, as photographed)
  const sign = signTexture();
  const M = {
    paint: new THREE.MeshStandardMaterial({ color: 0xe9e7e1, normalMap: brk.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xe2e2df, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1f0ec, roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: brk.map, normalMap: brk.normalMap, roughness: 0.88 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x55636c, roughness: 0.08, metalness: 0.5, emissive: 0xffd890, emissiveIntensity: 0 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb8342a, roughness: 0.55, metalness: 0.2 }),
    redbox: new THREE.MeshStandardMaterial({ color: 0xb4482e, roughness: 0.75 }),
    drum: new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.5, metalness: 0.3 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.6, metalness: 0.4 }),
    galv: new THREE.MeshStandardMaterial({ color: 0xa9adae, roughness: 0.6, metalness: 0.55 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.4 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, color: sign ? 0xffffff : 0x1d2a5c, roughness: 0.75, side: THREE.DoubleSide }),
  };
  brk.map.wrapS = brk.map.wrapT = THREE.RepeatWrapping; brk.normalMap.wrapS = brk.normalMap.wrapT = THREE.RepeatWrapping;
  // brick uvs: the brick texture's tile is about 0.86 m across and 0.6 m high (box uvs would run 0..1 a face)
  const turn = Math.atan2(-ax[1], ax[0]), meshes = [];
  for (const [k, list] of Object.entries(K.parts)) {
    const g = mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)));
    if (k === "brick" || k === "paint") { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const sideX = Math.abs(n.getX(i)) > 0.5; uv.setXY(i, (sideX ? p.getZ(i) : p.getX(i)) / 0.86, p.getY(i) / 0.6); } }
    g.rotateY(turn); g.translate(cx, 0, cz);
    const m = new THREE.Mesh(g, M[k]); m.castShadow = k !== "sign"; m.receiveShadow = k !== "galv" && k !== "red" && k !== "iron"; group.add(m); meshes.push(m);
  }
  const lp = new THREE.Vector3(...lampAt).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(cx, 0, cz));
  // the light itself: a red lantern that flashes once every three seconds (lit after dark, environment.js)
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x8a1a14, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 }));
  lantern.position.copy(lp); group.add(lantern);
  return {
    meshes, glow: [M.glass, M.lamp],
    flash(t, night) { lantern.material.emissiveIntensity = night * ((t % 3) < 0.5 ? 3.5 : 0.15); },
    collider: { ring: pts, base, top: rT + 1.0 },
  };
}

export const LANDMARK_BUILDERS = { gorlestonLighthouse };
