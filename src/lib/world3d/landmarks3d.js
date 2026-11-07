// ---- landmarks3d: a mark's own landmark buildings, modelled from photographs (see localDetail.js) ----
// Each is a handful of shapes merged by material (one draw call per material), placed on the building's outline from
// OpenStreetMap. Sizes are estimates from photographs.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bricks, weather, photoTex } from "./textures3d.js";
import { TOWN_BUILDERS } from "./landmarksTown.js";

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
  K.box("plinth", L + 0.5, 0.2, W + 0.5, 0, y0 + 0.1, 0); // (it stands on a low concrete step, as photographed)
  // the landward end of the ground storey is bare brick, its foot painted black, with a black door
  K.box("brick", 1.7, G, W + 0.1, -ex * (L / 2 - 0.81), y0 + G / 2, 0);
  K.box("iron", 1.72, 0.95, W + 0.12, -ex * (L / 2 - 0.81), y0 + 0.2 + 0.475, 0);
  K.box("iron", 0.06, 2.0, 0.9, -ex * (L / 2 + 0.06), y0 + 0.2 + 1.0, nzS * W * 0.2);
  // (the panels and doors start on top of the concrete step: dipping into it, their edges glinted along the foot)
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) K.box("panel", L / 4 - 0.12, 1.9, 0.006, (i - 1.5) * (L / 4), y0 + 1.2, s * (W / 2 + 0.003)); // (all but flush, as boarding is: a deeper top edge caught the sun and glowed as a bright bar)
  for (const e of [-1, 1]) for (let i = 0; i < 2; i++) K.box("panel", 0.006, 1.9, W / 2 - 0.12, e * (L / 2 + 0.003), y0 + 1.2, (i - 0.5) * (W / 2));
  for (const s of [-1, 1]) K.box("glass", 1.0, 2.0, 0.012, -ex * L * 0.18, y0 + 1.22, s * (W / 2 + 0.006));
  // ---- first slab: cantilevered well out all round, a downstand under its edge and brackets under it ----
  // (photographed: only a little way out along the long sides, further at the ends, where the balcony wraps round)
  const o1x = 1.0, o1z = 0.5, y1 = y0 + G;
  K.box("white", L + o1x * 2, S1, W + o1z * 2, 0, y1 + S1 / 2, 0);
  K.box("white", L + o1x * 2 - 0.1, 0.16, W + o1z * 2 - 0.1, 0, y1 - 0.08, 0);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) K.box("white", 0.18, 0.4, o1z, (i - 2) * (L / 4.3), y1 - 0.2, s * (W / 2 + o1z / 2));
  // ---- the lookout storey: inset from the slab's edge ----
  const li = 0.15, lL = L - li * 2, lW = W - li * 2, yU = y1 + S1;
  const sill = 1.15, win = 1.15, fas = U - sill - win;
  // the lookout storey, as photographed from all sides: bare red-brown brick up to the sills all round. The seaward half
  // is the watch room: a band of windows wrapping the seaward end and along each side, under a white fascia with the
  // navy "National Coastwatch" plate. The landward half is brick right up to the roof slab, with small separate windows
  // and a door out onto the balcony.
  const lk = lL * 0.5, xSea = ex * (lL / 2 - lk / 2), xLand = -ex * (lk / 2);
  K.box("brick", lL, sill, lW, 0, yU + sill / 2, 0);
  K.box("trim", lk + 0.04, 0.08, lW + 0.08, xSea, yU + sill + 0.04, 0); // the sill under the watch windows
  K.box("white", lk - 0.02, win, lW - 0.02, xSea, yU + sill + win / 2, 0); // (behind the glass)
  K.box("brick", lL - lk, win + fas, lW, xLand, yU + sill + (win + fas) / 2, 0);
  // ---- the windows: white frames proud of the brick, a concrete sill under each, the glass just behind the frame ----
  // (as photographed: a row of separate windows down each long side, a wide three-light window on the seaward end for
  // the watch out to sea, a single one on the landward end)
  const wy = yU + sill + win / 2;
  const windowAt = (w, h, x, z, face, lights = 2) => { // face: the way out (+x, -x, +z or -z)
    const ax = face === "x+" || face === "x-", sgn = face === "x+" || face === "z+" ? 1 : -1, o = 0.03; // (o: how far the frame stands proud)
    const at = (u, d) => (ax ? [x + sgn * d, z + u] : [x + u, z + sgn * d]); // u along the wall, d out from it
    const bx = (mat, uw, hh, dd, u, y, d) => { const [px, pz] = at(u, d); K.box(mat, ax ? dd : uw, hh, ax ? uw : dd, px, y, pz); };
    bx("glass", w - 0.08, h - 0.08, 0.02, 0, wy, 0.004);
    bx("trim", w, 0.08, 0.07, 0, wy + h / 2 - 0.04, o); bx("trim", w, 0.08, 0.07, 0, wy - h / 2 + 0.04, o); // head and foot of the frame
    for (let k = 0; k <= lights; k++) bx("trim", 0.07, h, 0.07, -w / 2 + 0.035 + (w - 0.07) * k / lights, wy, o); // jambs and mullions
    bx("trim", w - 0.07, 0.05, 0.05, 0, wy + h * 0.22, o); // a transom: the small opening lights at the top
    bx("white", w + 0.16, 0.07, 0.12, 0, wy - h / 2 - 0.035, 0.06); // the sill, projecting
  };
  for (const sd of [1, -1]) {
    windowAt(lk - 0.1, win - 0.06, xSea + ex * 0.03, sd * lW / 2, sd > 0 ? "z+" : "z-", 4); // the watch band along the side
    // the landward half: two small windows, white frames in the brick (one top-hung, as photographed)
    for (const f of [0.3, 0.7]) windowAt(0.75, win * 0.7, -ex * (lL / 2 - (lL - lk) * f), sd * lW / 2, sd > 0 ? "z+" : "z-", 1);
  }
  windowAt(lW - 0.2, win - 0.06, ex * lL / 2, 0, ex > 0 ? "x+" : "x-", 4); // right across the seaward end
  windowAt(0.75, win * 0.7, -ex * lL / 2, 0, ex > 0 ? "x-" : "x+", 1); // landward end
  // the door out onto the balcony, on the river side of the landward half
  K.box("frame", 0.85, 2.0, 0.06, -ex * (lL / 2 - (lL - lk) * 0.5), yU + 1.0, -nzS * (lW / 2 + 0.02));
  K.box("white", lk + 0.03, fas, lW + 0.06, xSea, yU + sill + win + fas / 2, 0); // the fascia over the watch windows
  // ---- roof slab: deep, cantilevered, stepped under its edge ----
  const o2 = 0.8, yR = yU + U;
  K.box("white", lL + o2 * 2, S2, lW + o2 * 2, 0, yR + S2 / 2, 0);
  K.box("white", lL + o2 * 2 - 0.5, 0.18, lW + o2 * 2 - 0.5, 0, yR - 0.09, 0);
  // ---- red railings: round the balcony and round the roof ----
  const b1x = L / 2 + o1x - 0.12, b1z = W / 2 + o1z - 0.12;
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
  // ---- the spiral stair at the seaward corner on the river side, up to the balcony ----
  // Standing clear of the balcony slab (it rose up through it), as photographed: a red steel newel, galvanised steps
  // fanning round it, a red baluster on every step's outer end, a red outer string and a continuous handrail, the last
  // step level with the balcony and pointing into it, a short landing across to the slab's edge.
  const ssR = 0.76, spX = ex * (L / 2 + 0.3), spZ = -nzS * (W / 2 + o1z + ssR + 0.06), rise = G + S1, nS = 17;
  const aEnd = nzS > 0 ? Math.PI / 2 : -Math.PI / 2, spTurn = Math.PI * 1.75 * ex, aAt = (k) => aEnd - spTurn * (1 - k / nS), yAt = (k) => y0 + rise * (k / nS);
  K.box("red", 0.11, rise + 1.0, 0.11, spX, y0 + (rise + 1.0) / 2, spZ); // the newel
  const outer = (k, r, dy = 0) => [spX + Math.cos(aAt(k)) * r, yAt(k) + dy, spZ + Math.sin(aAt(k)) * r];
  for (let k = 1; k <= nS; k++) {
    const a = aAt(k), y = yAt(k);
    K.box("galv", ssR - 0.06, 0.045, 0.2, spX + Math.cos(a) * (ssR / 2 + 0.03), y, spZ + Math.sin(a) * (ssR / 2 + 0.03), -a); // the step (narrow at the newel)
    K.box("galv", ssR * 0.45, 0.045, 0.16, spX + Math.cos(a - 0.12 * ex) * (ssR * 0.72), y, spZ + Math.sin(a - 0.12 * ex) * (ssR * 0.72), -(a - 0.12 * ex)); // (its wide outer end)
    const [bx, , bz] = outer(k, ssR); K.box("red", 0.028, 0.92, 0.028, bx, y + 0.46, bz); // the baluster
    K.bar("red", outer(k - 1, ssR, 0.92), outer(k, ssR, 0.92), 0.042); // the handrail
    K.bar("red", outer(k - 1, ssR, -0.04), outer(k, ssR, -0.04), 0.05); // the outer string
  }
  { const [lx, , lz] = outer(nS, ssR * 0.5); const toSlab = Math.abs(spZ) - (W / 2 + o1z); K.box("galv", 0.8, 0.05, toSlab + 0.1, lx, y0 + rise, (lz + -nzS * (W / 2 + o1z)) / 2); } // the landing to the balcony
  // ---- a flagpole off the balcony's seaward end ----
  const fX = ex * (b1x - 0.1), fZ = -nzS * (b1z - 0.25); // (at the river-side corner, by the stair)
  K.box("galv", 0.05, 3.2, 0.05, fX, y1 + S1 + 1.6, fZ);
  // ---- the steel stair up the landward end: deck to the balcony, then the balcony to the roof (zigzag, outside the
  // slabs), galvanised treads and stringers, red handrails, a landing across to each level ----
  const flight = (x, za, zb, ya, yb, w = 0.8) => {
    const n = Math.max(4, Math.round((yb - ya) / 0.2));
    for (let k = 0; k < n; k++) { const f = (k + 0.5) / n; K.box("galv", w, 0.04, 0.24, x, ya + (yb - ya) * ((k + 1) / n), za + (zb - za) * f); }
    for (const sx of [-w / 2, w / 2]) {
      K.bar("galv", [x + sx, ya, za], [x + sx, yb, zb], 0.06);
      K.bar("red", [x + sx, ya + 0.95, za], [x + sx, yb + 0.95, zb], 0.045);
      for (let k = 0; k <= 3; k++) { const f = k / 3; K.box("red", 0.04, 0.95, 0.04, x + sx, ya + (yb - ya) * f + 0.475, za + (zb - za) * f); }
    }
  };
  const stX = -ex * (L / 2 + o1x + 0.55), zA = nzS * (W / 2 - 0.1), zB = -nzS * (W / 2 - 0.4);
  flight(stX, zA, zB, y0, y1 + S1); // up to the balcony
  K.box("galv", 1.25, 0.06, 0.9, stX + ex * 0.4, y1 + S1, zB - nzS * 0.45); // the landing, across to the balcony
  flight(stX, zB - nzS * 0.9, zA, y1 + S1, yR + S2); // and on up to the roof
  K.box("galv", Math.abs(stX) - (lL / 2 + o2) + 0.4, 0.06, 0.9, (stX + -ex * (lL / 2 + o2)) / 2, yR + S2, zA + nzS * 0.45);
  // ---- the tall lattice mast beside it on the landward side ----
  const tX = -ex * (L / 2 + o1x + 2.4), tZ = nzS * W * 0.35, tH = 15; // (close by the landward end, as photographed)
  lattice(K, "galv", tX, tZ, y0, tH, 1.5, 0.9, 1.5, 0.06);
  K.box("galv", 1.4, 0.08, 1.4, tX, y0 + tH, tZ);
  railing(K, "galv", [[tX - 0.7, tZ - 0.7], [tX + 0.7, tZ - 0.7], [tX + 0.7, tZ + 0.7], [tX - 0.7, tZ + 0.7], [tX - 0.7, tZ - 0.7]], y0 + tH, 0.9, 0.7, 0.035);
  K.box("galv", 0.08, 2.2, 0.08, tX, y0 + tH + 1.1, tZ);
  K.box("galv", 1.6, 0.06, 0.06, tX, y0 + tH + 1.9, tZ);
  K.box("lamp", 0.3, 0.2, 0.3, tX, y0 + tH + 0.2, tZ + 0.8);

  // ---- signs, banners and the flag: flat quads with their part of the sign texture ----
  const sq = (key, w, h, x, y, z, ry) => { const g = new THREE.PlaneGeometry(w, h), [u0, v0, u1, v1] = SIGN_UV[key], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); g.rotateY(ry); g.translate(x, y, z); (K.parts.sign ||= []).push(g); };
  const endX = ex * (lL / 2 + 0.035), faceEnd = ex > 0 ? Math.PI / 2 : -Math.PI / 2;
  // (the black "National Coastwatch" plate on the long sides' fascia, over the watch windows, as photographed)
  for (const sd of [1, -1]) sq("fascia", Math.min(2.4, lk * 0.8), fas * 0.72, xSea, yU + sill + win + fas / 2, sd * (lW / 2 + 0.045), sd > 0 ? 0 : Math.PI);
  void endX; void faceEnd;
  const bX = ex * (b1x + 0.03);
  sq("navy", 2.9, 0.36, bX, y1 + S1 + 0.72, nzS * 1.55 * (W / 6.5), faceEnd); // (navy on the south half, white on the river half)
  sq("white", 2.6, 0.5, bX, y1 + S1 + 0.7, -nzS * 1.55 * (W / 6.5), faceEnd);
  sq("flag", 1.1, 0.7, fX, y1 + S1 + 2.75, fZ + nzS * 0.6, Math.PI / 2); // (flying in over the balcony from the pole)

  const brk = bricks(23, [116, 74, 60]); // (a darker, browner brick than the town's, as photographed)
  // photographed brick and painted render (Poly Haven CC0, public/textures): real mortar, chipped faces and the
  // unevenness of old paint, where the drawn ones were too regular to read as a real wall. Both tile at about 1.1 m
  // (the brick: fourteen 75 mm courses a tile, as British brick is laid)
  const bPhoto = photoTex("brick_red_diff"), bN = bPhoto && photoTex("brick_red_nor", { srgb: false }), bR = bPhoto && photoTex("brick_red_rough", { srgb: false });
  const pPhoto = photoTex("plaster_diff"), pN = pPhoto && photoTex("plaster_nor", { srgb: false }), pR = pPhoto && photoTex("plaster_rough", { srgb: false });
  const sign = signTexture();
  const M = {
    // (the ground storey is painted brick: the paint's own unevenness over the brick's courses)
    // (the render photograph comes already lifted to white paint: source-assets/prepare_textures.py "rgb-white")
    paint: new THREE.MeshStandardMaterial({ color: pPhoto ? new THREE.Color(0xf4f4f0) : new THREE.Color(0xe9e7e1), map: pPhoto || null, normalMap: bN || brk.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughnessMap: pR || null, roughness: pR ? 1 : 0.9 }),
    panel: new THREE.MeshStandardMaterial({ color: pPhoto ? new THREE.Color(0xe8e8e4) : new THREE.Color(0xe2e2df), map: pPhoto || null, roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: pPhoto ? new THREE.Color(0xffffff) : new THREE.Color(0xf1f0ec), map: pPhoto || null, normalMap: pN || null, roughnessMap: pR || null, roughness: pR ? 1 : 0.85 }),
    brick: bPhoto ? new THREE.MeshStandardMaterial({ map: bPhoto, normalMap: bN, roughnessMap: bR, roughness: 1, color: 0xe2d4ca })
      : new THREE.MeshStandardMaterial({ map: brk.map, normalMap: brk.normalMap, roughness: 0.88 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8a98a2, roughness: 0.05, metalness: 0.92, emissive: 0xffd890, emissiveIntensity: 0 }), // (dark, reflecting the sky as window glass does from outside)
    red: new THREE.MeshStandardMaterial({ color: 0x8e3a2e, roughness: 0.6, metalness: 0.2 }), // (a faded, rusting maroon red, as photographed)
    plinth: new THREE.MeshStandardMaterial({ color: 0x9a9890, map: photoTex("cap_concrete_diff") || null, roughness: 0.95 }),
    redbox: new THREE.MeshStandardMaterial({ color: 0xd9561e, roughness: 0.7 }), // (the roof box is orange, as photographed)
    drum: new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.5, metalness: 0.3 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.6, metalness: 0.4 }),
    galv: new THREE.MeshStandardMaterial({ color: 0xa9adae, roughness: 0.6, metalness: 0.55 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf4efe0, emissive: 0xffe2b0, emissiveIntensity: 0, roughness: 0.4 }),
    sign: new THREE.MeshStandardMaterial({ map: sign, color: sign ? 0xffffff : 0x1d2a5c, roughness: 0.75, side: THREE.DoubleSide }),
  };
  // ---- weathering: seventy years by the sea ----
  // The painted brick dirtier towards the deck (splashback and salt) and streaked below the slab's edge where the rain
  // runs off it; the white slabs and fascia with grey runs from their drips; the red railings faded and rust-spotted;
  // the iron stair and the galvanised masts dull, rusting at the joints.
  const age = {
    // (as photographed: the white paint grubby towards the deck and streaked grey where rain runs off the slab above it;
    // the slabs' edges streaked and stained; the brick weathered unevenly, darker under the sills)
    paint: { scale: 0.8, mottle: 0.18, grime: [base, base + 1.1, 0.34], streaks: [y1, 2.6, 0.24], rough: [0.9, 1.15] },
    panel: { scale: 0.8, mottle: 0.16, grime: [base, base + 0.9, 0.3], streaks: [y1, 2.6, 0.2] },
    white: { scale: 1.2, mottle: 0.16, streaks: [yR + S2, 1.4, 0.22], rough: [0.9, 1.15] },
    brick: { scale: 0.8, mottle: 0.22, streaks: [yU + sill, 1.1, 0.18], grime: [yU, yU + 0.3, 0.12] },
    plinth: { scale: 0.6, mottle: 0.3, grime: [base, base + 0.2, 0.25] },
    red: { scale: 0.4, mottle: 0.35, bump: 0.35, rust: [0.4, 0.15, 0.06, 0.025], rough: [0.85, 1.3] },
    redbox: { scale: 0.4, mottle: 0.25, rust: [0.15, 0.15, 0.06, 0.025] },
    iron: { scale: 0.3, mottle: 0.3, bump: 0.3, rust: [0.35, 0.14, 0.055, 0.024], grime: [base, base + 0.5, 0.2] },
    galv: { scale: 0.5, mottle: 0.35, rust: [0.2, 0.16, 0.065, 0.028] },
  };
  for (const [k, o] of Object.entries(age)) weather(M[k], o);
  brk.map.wrapS = brk.map.wrapT = THREE.RepeatWrapping; brk.normalMap.wrapS = brk.normalMap.wrapT = THREE.RepeatWrapping;
  // brick uvs: the brick texture's tile is about 0.86 m across and 0.6 m high (box uvs would run 0..1 a face)
  const turn = Math.atan2(-ax[1], ax[0]), meshes = [];
  for (const [k, list] of Object.entries(K.parts)) {
    const g = mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)));
    // (the walls and slabs: uvs from their size, so the brick and render keep their real scale on every face; the
    // drawn brick's tile was 0.86 by 0.6 m, the photographs' about 1.1 m square)
    const tile = bPhoto ? [1.1, 1.1] : [0.86, 0.6];
    if (k === "brick" || k === "paint" || (pPhoto && (k === "white" || k === "panel"))) { const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) { const sideX = Math.abs(n.getX(i)) > 0.5, flat = Math.abs(n.getY(i)) > 0.5; uv.setXY(i, (sideX ? p.getZ(i) : p.getX(i)) / tile[0], (flat ? p.getZ(i) : p.getY(i)) / tile[1]); } }
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

export const LANDMARK_BUILDERS = { gorlestonLighthouse, ...TOWN_BUILDERS };
