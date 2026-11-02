// ---- osmPlace: the real shape of a documented fishing place, from OpenStreetMap (pure; server and tests) ----
// From an OpenStreetMap answer (the API's JSON) round a public, documented FishDock mark: the land and the sea
// (from the coastline), lakes and rivers, piers, breakwaters and groynes, beaches, green spaces and the buildings
// with their heights, in metres round the mark (x east, z south, so north is -z). Then the fishing spots: along the
// pier's sides and off its end, or along the shore facing the water. Map data © OpenStreetMap contributors (ODbL).

const R = 111320;
const r1 = (v) => Math.round(v * 10) / 10;
export const PLACE3D = { box: 600, buildingsMax: 700, farOut: 6000 };
/** heights the 3D view gives the ground: built-up land and harbour walls, and a beach above the waterline */
export const GROUND = { land: 2.2, beach: 0.9, grass: 2.2, water: -1.6 };

/** lat/lon to local metres round the origin */
export function projector(lat0, lon0) {
  const k = Math.cos((lat0 * Math.PI) / 180) * R;
  return (lat, lon) => [r1((lon - lon0) * k), r1(-(lat - lat0) * R)];
}
const closed = (w) => w.length > 3 && w[0] === w[w.length - 1];
function area2(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const [x1, z1] = ring[i], [x2, z2] = ring[(i + 1) % ring.length]; a += x1 * z2 - x2 * z1; } return a / 2; }
export function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestOnLine(p, line) {
  let best = { d: Infinity, at: null, i: 0, t: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)), q = [a[0] + dx * t, a[1] + dz * t], d = dist(p, q);
    if (d < best.d) best = { d, at: q, i, t };
  }
  return best;
}
// join line pieces that share end nodes (coastline ways, multipolygon members)
function stitch(lines) {
  const out = [], pool = lines.map((l) => [...l]);
  while (pool.length) {
    let cur = pool.shift(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p[0] === cur[cur.length - 1]) { cur = cur.concat(p.slice(1)); pool.splice(i, 1); grew = true; break; }
        if (p[p.length - 1] === cur[0]) { cur = p.concat(cur.slice(1)); pool.splice(i, 1); grew = true; break; }
        if (p[p.length - 1] === cur[cur.length - 1]) { cur = cur.concat([...p].reverse().slice(1)); pool.splice(i, 1); grew = true; break; }
        if (p[0] === cur[0]) { cur = [...p].reverse().concat(cur.slice(1)); pool.splice(i, 1); grew = true; break; }
      }
    }
    out.push(cur);
  }
  return out;
}

// ---- land from the coastline: the coastline has land on its left; close each piece round the box anticlockwise ----
// worked in (x, n) with n = north = -z, the usual anticlockwise sense
function clipToBox(chain, H) {
  // pieces of the polyline inside the square [-H, H]², each starting and ending where it crosses the edge
  // (Liang-Barsky on each segment; a piece that starts or ends inside the box can't be closed and is dropped)
  const pieces = []; let cur = null;
  const clip = (a, b) => {
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] + H], [dx, H - a[0]], [-dy, a[1] + H], [dy, H - a[1]]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [t0, t1];
  };
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i], c = clip(a, b);
    if (!c) { cur = null; continue; }
    const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (c[0] > 0) cur = [pt(c[0])]; // entering
    else if (!cur) { cur = null; continue; } // the chain starts inside: can't close it
    cur.push(pt(c[1]));
    if (c[1] < 1) { pieces.push(cur); cur = null; } // leaving
  }
  return pieces;
}
const perim = ([x, n], H) => { // position anticlockwise round the square's edge, from the bottom-right corner
  const e = 1e-3;
  if (Math.abs(x - H) < e) return n + H;              // right edge, going up
  if (Math.abs(n - H) < e) return 2 * H + (H - x);    // top edge, going left
  if (Math.abs(x + H) < e) return 4 * H + (H - n);    // left edge, going down
  return 6 * H + (x + H);                              // bottom edge, going right
};
const corners = (H) => [[H, -H, 0], [H, H, 2 * H], [-H, H, 4 * H], [-H, -H, 6 * H]];
export function landFromCoast(chains, H) {
  const pieces = chains.flatMap((c) => clipToBox(c, H)).filter((p) => p.length >= 2).map((p) => ({ p, a: perim(p[0], H), b: perim(p[p.length - 1], H) }));
  if (!pieces.length) return [];
  const P8 = 8 * H, ccw = (from, to) => (((to - from) % P8) + P8) % P8;
  const used = new Set(), rings = [];
  for (let s = 0; s < pieces.length; s++) {
    if (used.has(s)) continue;
    const ring = []; let i = s, guard = 0;
    for (;;) {
      used.add(i); const pc = pieces[i]; ring.push(...pc.p);
      // the next coastline piece met going anticlockwise round the edge (the first piece closes the ring)
      let next = s, nd = ccw(pc.b, pieces[s].a) || P8;
      for (let j = 0; j < pieces.length; j++) { if (used.has(j)) continue; const d = ccw(pc.b, pieces[j].a); if (d > 0 && d < nd) { nd = d; next = j; } }
      // the box's corners on the way
      corners(H).map(([x, n, cp]) => ({ x, n, d: ccw(pc.b, cp) })).filter((c) => c.d > 0 && c.d < nd).sort((a, b) => a.d - b.d).forEach((c) => ring.push([c.x, c.n]));
      if (next === s || guard++ > 60) break;
      i = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

// ---- the ground grid ----
export function gridAxis(H) {
  // 3 m round the mark (where you can see the edges up close), 6 m out to the box, 250 m to the horizon
  const a = [], near = 240;
  for (let x = -PLACE3D.farOut; x < -H; x += 250) a.push(x);
  for (let x = -H; x < -near; x += 6) a.push(x);
  for (let x = -near; x <= near; x += 3) a.push(x);
  for (let x = near + 6; x <= H; x += 6) a.push(x);
  for (let x = H + 250; x <= PLACE3D.farOut; x += 250) a.push(x);
  return a;
}
const nearestIdx = (xs, v) => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; } return v - xs[lo] < xs[hi] - v ? lo : hi; };
// fill a polygon into the grid by scanlines (even-odd); onlyLand keeps water as water
function fill(cls, xs, ring, v, onlyLand = false) {
  const n = xs.length; let zmin = Infinity, zmax = -Infinity;
  for (const p of ring) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  for (let j = 0; j < n; j++) {
    const z = xs[j]; if (z < zmin || z > zmax) continue;
    const cuts = [];
    for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) { const [x1, z1] = ring[k], [x2, z2] = ring[m]; if ((z1 > z) !== (z2 > z)) cuts.push(x1 + ((z - z1) * (x2 - x1)) / (z2 - z1)); }
    cuts.sort((a, b) => a - b);
    for (let c = 0; c + 1 < cuts.length; c += 2) {
      let i = Math.max(0, nearestIdx(xs, cuts[c])); if (xs[i] < cuts[c]) i++;
      for (; i < n && xs[i] <= cuts[c + 1]; i++) { const q = j * n + i; if (!onlyLand || cls[q] !== 0) cls[q] = v; }
    }
  }
}
const rle = (a) => { let out = "", cur = a[0], run = 0; for (const v of a) { if (v === cur) run++; else { out += `${cur}${run},`; cur = v; run = 1; } } return out + `${cur}${run}`; };
export const unrle = (s, size) => { const a = new Uint8Array(size); let k = 0; for (const part of s.split(",")) { const v = +part[0], r = +part.slice(1); a.fill(v, k, k + r); k += r; } return a; };

/** The layout for the 3D view from an OpenStreetMap JSON answer round (lat0, lon0). venue: pier | beach | estuary | river | lake. */
export function buildPlace(osm, lat0, lon0, venue = "pier", { box = PLACE3D.box } = {}) {
  const P = projector(lat0, lon0), nodes = new Map(), ways = new Map(), out = { origin: [lat0, lon0], venue, land: [], water: [], piers: [], beaches: [], green: [], buildings: [], spots: [], attribution: "Map data © OpenStreetMap contributors (ODbL)" };
  const rels = [];
  for (const e of osm?.elements || []) {
    if (e.type === "node") nodes.set(e.id, P(e.lat, e.lon));
    else if (e.type === "way") ways.set(e.id, e);
    else if (e.type === "relation" && e.tags?.type === "multipolygon") rels.push(e);
  }
  const pts = (ids) => ids.map((id) => nodes.get(id)).filter(Boolean);
  const coast = [], waterRings = [];
  for (const w of ways.values()) {
    const t = w.tags || {}, ids = w.nodes || [];
    if (t.natural === "coastline") { coast.push(ids); continue; }
    const ring = pts(ids);
    if (ring.length < 2) continue;
    const isClosed = closed(ids);
    if (isClosed && (t.natural === "water" || t.waterway === "riverbank" || t.landuse === "basin" || t.landuse === "reservoir" || t.water)) waterRings.push(ring.slice(0, -1));
    else if (/^(pier|breakwater|groyne|quay)$/.test(t.man_made || "")) {
      const kind = t.man_made, wTag = parseFloat(t.width);
      const width = Number.isFinite(wTag) && wTag > 0 && wTag < 40 ? wTag : kind === "groyne" ? 2 : kind === "breakwater" ? 7 : 8;
      const area = isClosed && (t.area === "yes" || ring.length > 5 && Math.abs(area2(ring.slice(0, -1))) > 400);
      out.piers.push({ kind, width, area, line: area ? null : ring, ring: area ? ring.slice(0, -1) : null, h: kind === "groyne" ? 1.2 : kind === "quay" ? 2.4 : kind === "breakwater" ? 3.5 : 4.2 });
    } else if (isClosed && (t.natural === "beach" || t.natural === "sand" || t.natural === "shingle")) out.beaches.push(ring.slice(0, -1));
    else if (isClosed && (t.leisure === "park" || t.landuse === "grass" || t.leisure === "pitch" || t.landuse === "recreation_ground" || t.leisure === "golf_course" || t.landuse === "meadow")) out.green.push(ring.slice(0, -1));
    else if (isClosed && t.building) {
      const lv = parseFloat(t["building:levels"]), hh = parseFloat(t.height);
      const h = Number.isFinite(hh) && hh > 2 && hh < 200 ? hh : Number.isFinite(lv) && lv > 0 && lv < 60 ? lv * 3 + 1 : /^(garage|shed|hut|kiosk|toilets)$/.test(t.building) ? 3 : /^(church|cathedral)$/.test(t.building) ? 14 : 7;
      const ring2 = ring.slice(0, -1), c = ring2.reduce((a, p) => [a[0] + p[0] / ring2.length, a[1] + p[1] / ring2.length], [0, 0]);
      out.buildings.push({ ring: ring2, h: r1(h), d: r1(Math.hypot(c[0], c[1])), kind: t.building, roof: t["roof:shape"] || null });
    }
  }
  // multipolygons (a river or lake drawn in pieces): their outer rings
  for (const r of rels) {
    const t = r.tags || {};
    const outer = stitch((r.members || []).filter((m) => m.type === "way" && m.role !== "inner" && ways.get(m.ref)).map((m) => ways.get(m.ref).nodes)).filter((ids) => closed(ids)).map((ids) => pts(ids).slice(0, -1));
    if (t.natural === "water" || t.waterway === "riverbank" || t.water || t.landuse === "basin" || t.landuse === "reservoir") waterRings.push(...outer);
    else if (t.natural === "beach" || t.natural === "sand" || t.natural === "shingle") out.beaches.push(...outer);
    else if (t.leisure === "park" || t.landuse === "grass" || t.landuse === "meadow" || t.leisure === "golf_course") out.green.push(...outer);
  }
  out.buildings.sort((a, b) => a.d - b.d); out.buildings = out.buildings.slice(0, PLACE3D.buildingsMax).map(({ d, ...b }) => b);
  // the land: from the coastline where there is one; inland (rivers, lakes) the whole box, less the water
  const coastChains = stitch(coast).map((ids) => pts(ids).map(([x, z]) => [x, -z]));
  const H = box;
  let land = landFromCoast(coastChains, H).map((r) => r.map(([x, n]) => [r1(x), r1(-n)]));
  if (!coastChains.length && (venue === "river" || venue === "lake" || venue === "estuary")) land = [[[-H, -H], [H, -H], [H, H], [-H, H]]];
  // push the box's edges out so the land carries on to the horizon
  const far = PLACE3D.farOut / H;
  land = land.map((r) => r.map(([x, z]) => (Math.abs(Math.abs(x) - H) < 0.5 || Math.abs(Math.abs(z) - H) < 0.5 ? [r1(x * far), r1(z * far)] : [x, z])));
  // the ground as a grid (fine round the mark, coarse out to the horizon): 0 water, 1 land, 2 beach, 3 grass
  const xs = gridAxis(H), n = xs.length, cls = new Uint8Array(n * n);
  if (land.length) for (const r of land) fill(cls, xs, r, 1);
  else if (!coastChains.length && venue !== "pier" && venue !== "beach") cls.fill(1);
  for (const w of waterRings) fill(cls, xs, w, 0);
  for (const b of out.beaches) fill(cls, xs, b, 2, true);
  for (const g of out.green) fill(cls, xs, g, 3, true);
  out.grid = { xs, cls: rle(cls) };
  out.land = land; out.water = waterRings;
  const at = (p) => { const i = nearestIdx(xs, p[0]), j = nearestIdx(xs, p[1]); return cls[j * n + i]; };
  const inWater = (p) => at(p) === 0;
  out.spots = spotsFor(out, venue, inWater);
  out.check = checkLayout(out, inWater);
  delete out.green; delete out.beaches;
  return out;
}

// ---- is this layout right? ----
// The real place is only used when it passes: four spots, all near the documented mark (positions in the marks list
// can be approximate, and a coastline that didn't close properly puts the "shore" somewhere else entirely), each on
// dry ground or a pier deck with open water straight ahead. Otherwise the phone shows the drawn place, labelled as one.
export const LAYOUT_CHECK = { nearMark: 70, waterAhead: [14, 26] };
export function checkLayout(L, inWater) {
  const why = [];
  // a pier's deck in front blocks the view as much as land does
  const onPier = (q) => L.piers.some((p) => (p.ring ? inside(q, p.ring) : p.line && nearestOnLine(q, p.line).d < p.width / 2 + 0.5));
  if (L.spots.length !== 4) why.push(`${L.spots.length} spots`);
  for (const sp of L.spots) {
    const [x, , z] = sp.at, d = Math.hypot(x, z), f = [Math.sin(sp.face), -Math.cos(sp.face)];
    if (d > LAYOUT_CHECK.nearMark) why.push(`${sp.name}: ${Math.round(d)} m from the mark`);
    const ahead = (m) => [x + f[0] * m, z + f[1] * m], clear = [];
    for (let m = 3; m <= LAYOUT_CHECK.waterAhead[1]; m += 2) clear.push(ahead(m)); // no pier anywhere in the view out to there
    if (!LAYOUT_CHECK.waterAhead.every((m) => inWater(ahead(m))) || clear.some(onPier)) why.push(`${sp.name}: no open water ahead`);
    // nothing built where the angler stands or just behind (where the camera goes in third person)
    const around = [[0, 0], [0, -3], [0, -6], [0, -9], [2.5, -4], [-2.5, -4]].map(([side, back]) => [x + f[0] * back - f[1] * side, z + f[1] * back + f[0] * side]);
    if ((L.buildings || []).some((b) => around.some((q) => Math.abs(q[0] - b.ring[0][0]) < 300 && inside(q, b.ring)))) why.push(`${sp.name}: a building in the way`);
  }
  return { ok: !why.length, why };
}

// ---- where the anglers stand ----
function spotsFor(L, venue, inWater) {
  const spot = (id, at, face, y, cast, name) => ({ id, name, at: [r1(at[0]), y, r1(at[1])], face: Math.round(face * 1000) / 1000, cast });
  const faceOf = (dx, dz) => Math.atan2(dx, -dz); // heading of a direction: 0 is north (-z), positive turns east
  // the nearest shore edge (coastline, a pier arm drawn as land, a river's or lake's edge) and the nearest pier line
  const edges = [...L.land, ...L.water].map((r) => [...r, r[0]]);
  let shore = null;
  for (const e of edges) { const n = nearestOnLine([0, 0], e); if (n.at && (!shore || n.d < shore.n.d)) shore = { e, n }; }
  const piers = L.piers.filter((p) => p.line && p.kind !== "groyne").map((p) => ({ p, near: nearestOnLine([0, 0], p.line) })).filter((x) => x.near.d < 160).sort((a, b) => a.near.d - b.near.d);
  // a pier drawn as its own line, when the mark is on it: both sides and the seaward end
  if ((venue === "pier" || venue === "estuary") && piers.length && (!shore || piers[0].near.d < shore.n.d + 10 || (venue === "pier" && piers[0].near.d < 40))) {
    const { p } = piers[0], line = p.line, a = line[0], b = line[line.length - 1];
    const sea = inWater(b) && !inWater(a) ? line : inWater(a) && !inWater(b) ? [...line].reverse() : dist(b, [0, 0]) > dist(a, [0, 0]) ? line : [...line].reverse();
    const end = sea[sea.length - 1], prev = sea[sea.length - 2];
    let len = 0; for (let k = 1; k < sea.length; k++) len += dist(sea[k], sea[k - 1]);
    const along = (m) => { let left = len - m; for (let k = sea.length - 1; k > 0; k--) { const sl = dist(sea[k], sea[k - 1]); if (left <= sl) { const t = 1 - left / Math.max(sl, 1e-6); return { q: [sea[k - 1][0] + (sea[k][0] - sea[k - 1][0]) * t, sea[k - 1][1] + (sea[k][1] - sea[k - 1][1]) * t], dir: [(sea[k][0] - sea[k - 1][0]) / sl, (sea[k][1] - sea[k - 1][1]) / sl] }; } left -= sl; } return { q: sea[0], dir: [0, -1] }; };
    const half = p.width / 2 - 0.6, out = [];
    // where the mark is along the pier (a long pier's mark is often well out from the shore): the spots go round it
    const mk = nearestOnLine([0, 0], sea);
    let s0 = 0; for (let k = 0; k < mk.i; k++) s0 += dist(sea[k], sea[k + 1]); s0 += mk.t * dist(sea[mk.i], sea[mk.i + 1]);
    const at = (m) => Math.max(4, Math.min(len - 4, m));
    const sideSpot = (id, m, side, name) => { const { q, dir } = along(at(m)); const nx = -dir[1] * side, nz = dir[0] * side; return spot(id, [q[0] + nx * half, q[1] + nz * half], faceOf(nx, nz), p.h, 26, name); };
    out.push(sideSpot(1, s0 - 6, -1, "Left side of the pier"), sideSpot(2, s0 + 6, 1, "Right side of the pier"), sideSpot(3, s0 + 18, -1, "Further along the pier"));
    const ed = [(end[0] - prev[0]) / dist(end, prev), (end[1] - prev[1]) / dist(end, prev)];
    if (len - s0 < 90) out.push(spot(4, [end[0] - ed[0] * 1.8, end[1] - ed[1] * 1.8], faceOf(ed[0], ed[1]), p.h, 34, "End of the pier"));
    else out.push(sideSpot(4, s0 - 18, 1, "Back along the pier"));
    return out;
  }
  if (venue === "pier" || venue === "estuary") {
    const areas = L.piers.filter((p) => p.ring && p.ring.length > 2).map((p) => ({ p, ring: [...p.ring, p.ring[0]], inside: inside([0, 0], p.ring) })).map((x) => ({ ...x, near: nearestOnLine([0, 0], x.ring) })).filter((x) => x.inside || x.near.d < 30).sort((a, b) => (b.inside - a.inside) || a.near.d - b.near.d);
    if (areas.length) {
      const { p, ring, near } = areas[0], onDeck = (q) => inside(q, p.ring), got = [];
      const segs = ring.length - 1, segLen = (k) => dist(ring[k], ring[k + 1]);
      const walkRing = (m) => { let k = near.i, t = near.t, left = Math.abs(m); const fw = m >= 0; for (let g = 0; g < segs * 2; g++) { const sl = segLen(k) || 1e-6, have = fw ? (1 - t) * sl : t * sl; if (left <= have) { const tt = fw ? t + left / sl : t - left / sl; return { q: [ring[k][0] + (ring[k + 1][0] - ring[k][0]) * tt, ring[k][1] + (ring[k + 1][1] - ring[k][1]) * tt], dir: [(ring[k + 1][0] - ring[k][0]) / sl, (ring[k + 1][1] - ring[k][1]) / sl] }; } left -= have; if (fw) { k = (k + 1) % segs; t = 0; } else { k = (k - 1 + segs) % segs; t = 1; } } return null; };
      const offs = [0]; for (let m = 5; m <= 90; m += 5) offs.push(m, -m);
      for (const m of offs) {
        if (got.length === 4) break;
        const w = walkRing(m); if (!w) continue;
        let nrm = [-w.dir[1], w.dir[0]]; if (onDeck([w.q[0] + nrm[0] * 1.5, w.q[1] + nrm[1] * 1.5])) nrm = [-nrm[0], -nrm[1]]; // outward
        const q = [w.q[0] - nrm[0] * 1.2, w.q[1] - nrm[1] * 1.2];
        if (!onDeck(q) || !inWater([w.q[0] + nrm[0] * 12, w.q[1] + nrm[1] * 12]) || !inWater([w.q[0] + nrm[0] * 25, w.q[1] + nrm[1] * 25])) continue;
        if (got.some((g) => dist(g.q, q) < 9)) continue;
        got.push({ q, nrm });
      }
      const names = ["On the pier", "Along the pier", "Other side of the pier", "Further along the pier"];
      if (got.length === 4) return got.map(({ q, nrm }, k) => spot(k + 1, q, faceOf(nrm[0], nrm[1]), p.h, 30, names[k]));
    }
  }
  if (!shore || shore.n.d > 400) return [];
  // along the shore edge, walking round it from the nearest point, facing the water
  const e = shore.e, n = shore.n, segLen = (k) => dist(e[k], e[k + 1]);
  const walk = (m) => {
    let k = n.i, t = n.t, left = Math.abs(m), fw = m >= 0;
    for (let guard = 0; guard < e.length * 2; guard++) {
      const sl = segLen(k), have = fw ? (1 - t) * sl : t * sl;
      if (left <= have) { const tt = fw ? t + left / sl : t - left / sl; return { at: [e[k][0] + (e[k + 1][0] - e[k][0]) * tt, e[k][1] + (e[k + 1][1] - e[k][1]) * tt], dir: [(e[k + 1][0] - e[k][0]) / sl, (e[k + 1][1] - e[k][1]) / sl] }; }
      left -= have;
      if (fw) { k = (k + 1) % (e.length - 1); t = 0; } else { k = (k - 1 + e.length - 1) % (e.length - 1); t = 1; }
    }
    return { at: n.at, dir: [1, 0] };
  };
  const pierLike = venue === "pier";
  const back = venue === "beach" ? 6 : pierLike ? 1.6 : 2.2, y = venue === "beach" ? GROUND.beach : GROUND.land;
  const names = venue === "beach" ? ["On the beach, left", "On the beach, right", "Further along, left", "Further along, right"] : pierLike ? ["On the pier", "Along the pier", "Further along the pier", "Along the other way"] : ["Along the bank, left", "Along the bank, right", "Further along, left", "Further along, right"];
  // try places along the edge, nearest first, until four stand on dry ground with open water ahead, well apart
  const got = [], offsets = [0];
  for (let m = 6; m <= 180; m += 6) offsets.push(m, -m);
  for (const m of offsets) {
    if (got.length === 4) break;
    const w = walk(m);
    for (const bk of [back, back + 1.5, back + 3.5, back + 6]) {
      const probe = [w.at[0] - w.dir[1] * 4, w.at[1] + w.dir[0] * 4], sgn = inWater(probe) ? 1 : -1, wn = [-w.dir[1] * sgn, w.dir[0] * sgn];
      const p = [w.at[0] - wn[0] * bk, w.at[1] - wn[1] * bk];
      const ok = !inWater(p) && inWater([p[0] + wn[0] * 15, p[1] + wn[1] * 15]) && inWater([p[0] + wn[0] * 28, p[1] + wn[1] * 28]) && got.every((g) => dist(g.p, p) >= 9);
      if (ok) { got.push({ p, wn }); break; }
    }
  }
  return got.map(({ p, wn }, k) => spot(k + 1, p, faceOf(wn[0], wn[1]), y, venue === "beach" ? 70 : venue === "river" ? 14 : 30, names[k]));
}
