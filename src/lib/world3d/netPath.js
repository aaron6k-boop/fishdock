// ---- netPath: the drop net's way over the pier's rail (pure: plain {x, y, z} points, so it can be tested) ----

/** Where the drop net's hoop is, a fraction f of the way from a to b over the top rail at railPt, its bag ns times the
 *  usual size (n: the way out over the water, square to the rail): up and across to just short of the rail, clear over its top, then down, at an even pace along the way.
 *  The bag is soft mesh and follows the hoop over the rail, as a real one is lifted over; the hoop held no higher than
 *  that, never over your head. (A curve from the deck to the water dipped through the rail; straight up from the deck
 *  first brought it up past your face.) */
export function overRail(railPt, ns, a, b, f, n = null, bag = 1) {
  // (bag: how much of its depth the bag hangs below the hoop as it crosses. Slumped over the rail as a wet net is
  // dragged across it, the hoop need only be lifted to your chest, not to your face)
  const top = Math.max(railPt.y + 0.1 + 0.36 * ns * bag, Math.min(a.y, b.y) + 0.05); // (the bag's bottom clear of the top rail too, not dragged through it)
  let dx = b.x - a.x, dz = b.z - a.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  // (where the way from a to b crosses the rail's line: n is the way out over the water, square to the rail)
  const nx = n ? n.x : dx, nz = n ? n.z : dz, dn = dx * nx + dz * nz;
  const along = Math.abs(dn) > 1e-6 ? clamp01(((railPt.x - a.x) * nx + (railPt.z - a.z) * nz) / dn / dl) * dl : dl / 2;
  // (m: how far either side of the rail it rises and comes down: the hoop's own half-width and a little, so the hoop
  // never comes down through the rail or a post; 14 cm let it cut through the post it came down beside)
  const cx = a.x + dx * along, cz = a.z + dz * along, m = Math.max(0.14, 0.36 * ns + 0.08) / Math.max(0.3, Math.abs(dn));
  // (on the sea side the wall's concrete cap stands out past the rail: the hoop comes up and goes down well clear of it
  // there, or it went through the concrete)
  const out = n ? Math.sign(dx * nx + dz * nz) : 0, mA = m + (out < 0 ? 0.35 : 0) / Math.max(0.3, Math.abs(dn)), mB = m + (out > 0 ? 0.35 : 0) / Math.max(0.3, Math.abs(dn));
  const pts = [a, { x: cx - dx * mA, y: Math.max(top, a.y), z: cz - dz * mA }, { x: cx + dx * mB, y: Math.max(top, b.y), z: cz + dz * mB }, b];
  const seg = []; let D = 0;
  for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i], l = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); seg.push(l); D += l; }
  let u = clamp01(f) * D;
  for (let i = 0; i < seg.length; i++) {
    if (u <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, u / seg[i]) : 1, p = pts[i], q = pts[i + 1]; return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k }; }
    u -= seg[i];
  }
  return { ...b };
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
