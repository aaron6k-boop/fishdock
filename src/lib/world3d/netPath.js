// ---- netPath: the drop net's way over the pier's rail (pure: plain {x, y, z} points, so it can be tested) ----

/** Where the drop net is, a fraction f of the way from a to b over the top rail (railPt), its bag ns times the usual
 *  size: straight up until the bag clears the rail, across, then down, at an even pace along the way. (A curve from the
 *  deck to the water dipped through the rail on the way.) */
export function overRail(railPt, ns, a, b, f) {
  const top = Math.max(railPt.y + 0.36 * ns + 0.12, a.y, b.y), d1 = top - a.y, d2 = Math.hypot(b.x - a.x, b.z - a.z), d3 = top - b.y, D = d1 + d2 + d3 || 1;
  let u = Math.min(1, Math.max(0, f)) * D;
  if (u <= d1) return { x: a.x, y: a.y + u, z: a.z };
  u -= d1;
  if (u <= d2) { const k = d2 ? u / d2 : 1; return { x: a.x + (b.x - a.x) * k, y: top, z: a.z + (b.z - a.z) * k }; }
  u -= d2;
  return { x: b.x, y: top - u, z: b.z };
}
