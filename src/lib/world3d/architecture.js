// ---- architecture: what each mapped building is drawn as (pure; tests) ----
// OpenStreetMap gives a building's footprint and sometimes its type, levels or height, never what it looks like. So
// FishDock places each building where the map says, at the map's height when it has one, and draws it in a style that
// fits a British seaside town: Victorian red brick and painted render terraces and houses with slate or clay tiled
// roofs and chimneys, small huts and shelters, warehouses in cladding, a church in stone, and the special buildings
// it knows (a lighthouse, a coastwatch lookout). It's a believable reconstruction, labelled as one: not a record of
// how each building really looks.

const area2 = (ring) => { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; a += x1 * z2 - x2 * z1; } return a / 2; };
export const footprintArea = (ring) => Math.abs(area2(ring));
const hashOf = (n) => { let h = (Number(n) || 7) * 2654435761; h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// a place's own town style, from photographs (localDetail.js "town"): how many of its houses are painted render rather
// than brick, and whether they're taller than the usual two storeys. Set while that place's buildings are built.
let town = null;
export function setTownStyle(t) { town = t || null; }

/** The style for one building: { type, walls, roof, roofMat, storeys, h, shop, chimneys, tint } (walls/roof as in textures3d). */
export function styleFor(b) {
  const A = footprintArea(b.ring), r = hashOf(b.id ?? Math.round(A * 13)), r2 = hashOf((b.id ?? 3) * 7 + 1);
  const k = b.kind || "yes";
  const storeyH = 3;
  const tinted = (list) => list[Math.floor(r2 * list.length)];
  const RENDER = [[1, 1, 1], [0.98, 0.94, 0.84], [0.9, 0.95, 1], [0.98, 0.96, 0.9], [0.95, 0.9, 0.82]];
  const BRICK = [[1, 1, 1], [0.9, 0.86, 0.84], [1.05, 0.95, 0.9], [0.82, 0.78, 0.76]];
  if (b.use === "lighthouse") return { type: "lighthouse", walls: "brick", roof: "dome", storeys: 0, h: b.tall ? Math.max(12, b.h) : 21, tint: [1, 1, 1] };
  if (b.use === "lookout") return { type: "lookout", walls: "render", roof: "flat", roofMat: "felt", storeys: 2, h: 6.4, tint: [1, 1, 1] };
  // (single storey: sheds, huts, kiosks, and anything mapped as public toilets or a shelter whatever its building tag,
  // such as the Pier Head Public Toilets at Gorleston, which was drawn as a two-storey house)
  if (/^(garage|garages|shed|hut|kiosk|toilets|bandstand|cabin|shelter|roof|carport)$/.test(k) || b.use === "small" || A < 28) {
    return { type: "small", walls: r < 0.5 ? "brick" : "render", roof: A < 10 || k === "bandstand" ? "hip" : r2 < 0.5 ? "hip" : "gable", roofMat: r < 0.4 ? "clay" : "slate", storeys: 1, h: b.tall ? b.h : 3, tint: r < 0.5 ? tinted(BRICK) : tinted(RENDER) };
  }
  if (/^(church|chapel|cathedral)$/.test(k)) return { type: "church", walls: "stone", roof: "gable", roofMat: "slate", storeys: 0, h: b.tall ? b.h : 12, tint: [1, 1, 1] };
  if (/^(industrial|warehouse|commercial|retail|supermarket|hangar|boathouse|transportation|service)$/.test(k) || A > 650) {
    const flat = A > 1400 || b.roof === "flat";
    return { type: "warehouse", walls: r < 0.55 ? "cladding" : "brick", roof: flat ? "flat" : "gable", roofMat: flat ? "felt" : "slate", storeys: b.levels || 2, h: b.tall ? b.h : 8, pitch: 0.28, tint: [1, 1, 1] };
  }
  const storeys = b.levels || (/^(hotel|apartments|flats)$/.test(k) ? 4 : town?.tall ? (A < 70 ? 2 : r < 0.3 ? 4 : 3) : A < 110 ? 2 : r < 0.7 ? 2 : 3);
  const brick = town?.render != null ? r < 1 - town.render : /^(terrace|house|semidetached_house|detached)$/.test(k) ? r < 0.6 : r < 0.45;
  const roofShape = b.roof === "flat" ? "flat" : b.roof === "gabled" ? "gable" : b.roof === "hipped" ? "hip" : k === "terrace" ? "gable" : r2 < 0.55 ? "hip" : "gable";
  return {
    type: "house", walls: brick ? "brick" : "render", roof: roofShape, roofMat: roofShape === "flat" ? "felt" : r2 < 0.62 ? "slate" : "clay",
    storeys, h: b.tall ? Math.max(3, b.h) : storeys * storeyH, shop: b.use === "shop", chimneys: roofShape !== "flat" ? (A > 60 ? 2 : 1) : 0,
    tint: brick ? tinted(BRICK) : tinted(RENDER),
    wide: r2 > 0.45, // (the wider three-light windows of a seafront house on its upper storeys, on about half of them)
  };
}

/** The footprint's oriented bounding box: centre, long axis (unit), length and width (metres). */
export function obb(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length], l = Math.hypot(x2 - x1, z2 - z1); if (l < 0.2) continue;
    const ax = [(x2 - x1) / l, (z2 - z1) / l], pz = [-ax[1], ax[0]];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ring) { const a = x * ax[0] + z * ax[1], b = x * pz[0] + z * pz[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const ar = (a1 - a0) * (b1 - b0);
    if (!best || ar < best.ar) best = { ar, ax, pz, a0, a1, b0, b1 };
  }
  if (!best) return null;
  let { ax, pz, a0, a1, b0, b1 } = best;
  if (b1 - b0 > a1 - a0) { [ax, pz] = [pz, [-ax[0], -ax[1]]]; [a0, a1, b0, b1] = [b0, b1, -a1, -a0]; } // the long side along ax
  const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
  return { c: [ax[0] * ca + pz[0] * cb, ax[1] * ca + pz[1] * cb], ax, pz, L: a1 - a0, W: b1 - b0, fill: footprintArea(ring) / Math.max(1e-6, (a1 - a0) * (b1 - b0)) };
}

/**
 * A pitched roof over a footprint: each wall's eave rises to the nearest point on a ridge along the long axis.
 * Hipped: the ridge stops short of the ends (half the width in from each), so every side slopes. Gabled: the ridge runs
 * the full length and the ends are upright triangles (drawn in the wall's material). Returns faces as
 * { pts: [[x, y, z], ...] (3 or 4, outward-facing order), gable: bool }, plus the ridge and its height.
 */
export function pitchedRoof(ring, base, { shape = "hip", pitch = 0.62, eave = 0.3, maxRise = 5 } = {}) {
  const box = obb(ring); if (!box) return null;
  const { c, ax, W, L } = box;
  const rise = Math.min(maxRise, (W / 2) * Math.tan(pitch));
  // the eave: the footprint pushed out a little from its centre; a gable's ridge runs out to the eaves' ends so the
  // gable is upright
  const grow = 1 + eave / Math.max(1, W / 2);
  const half = shape === "hip" ? Math.max(0, L / 2 - W / 2) : (L / 2) * grow;
  const r0 = [c[0] - ax[0] * half, c[1] - ax[1] * half], r1 = [c[0] + ax[0] * half, c[1] + ax[1] * half];
  const eaves = ring.map(([x, z]) => [c[0] + (x - c[0]) * grow, c[1] + (z - c[1]) * grow]);
  const ccw = area2(eaves) > 0;
  const onRidge = ([x, z]) => { const t = Math.max(-half, Math.min(half, (x - c[0]) * ax[0] + (z - c[1]) * ax[1])); return [c[0] + ax[0] * t, base + rise, c[1] + ax[1] * t]; };
  const faces = [];
  for (let i = 0; i < eaves.length; i++) {
    const p = eaves[i], q = eaves[(i + 1) % eaves.length], rp = onRidge(p), rq = onRidge(q);
    const P = [p[0], base, p[1]], Q = [q[0], base, q[1]];
    const same = Math.hypot(rp[0] - rq[0], rp[2] - rq[2]) < 0.05;
    // outward and upward: three.js faces are anticlockwise seen from outside, which in x, z (y up) means walking a
    // footprint whose signed area is negative; a footprint the other way round gets its faces reversed
    const pts = same ? [P, Q, rp] : [P, Q, rq, rp];
    const gable = shape === "gable" && same && Math.abs((q[0] - p[0]) * ax[0] + (q[1] - p[1]) * ax[1]) < 0.35 * Math.hypot(q[0] - p[0], q[1] - p[1]);
    faces.push({ pts: ccw ? pts.slice().reverse() : pts, gable });
  }
  return { faces, ridge: [r0, r1], rise, box };
}
