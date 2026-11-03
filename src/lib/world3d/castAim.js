// ---- castAim: where a cast goes, from how hard you cast and where you look (pure; tests) ----
// Hold Cast to build power, look where you want it to go, let go. The distance comes from the rod and rig for this kind
// of place (a beachcaster with a heavy lead goes far; a float rod on a river doesn't), the power you chose, and the
// wind along the cast (behind you it carries further, in your face it falls short). It never goes beyond the water the
// place has been checked for: aiming off to the side is limited, and a cast that would land on a pier, a wall or the
// bank is shortened to land in the water before it.

// the furthest each kind of rod and rig casts here at full power (metres), and how far off straight you may aim
export const ROD_REACH = { beach: 95, pier: 55, estuary: 42, river: 22, lake: 34 };
export const AIM_MAX = 0.35;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The cast for this power (0..1) and view: { dist, aim, power, point: [x, z], max }. spot: { at, face, cast, edge };
 * lookYaw: where the camera faces (radians, 0 = -z); wind: { strength 0..1, dir: [x, z] the way it blows };
 * water(x, z): true where the cast may land (optional; the place's own check).
 */
export function planCast({ venue = "pier", spot, power = 0.5, lookYaw = null, wind = null, water = null }) {
  const face = spot.face || 0, edge = Number.isFinite(spot.edge) ? spot.edge : 1;
  const aim = lookYaw == null ? 0 : clamp(wrapA(lookYaw - face), -AIM_MAX, AIM_MAX);
  const reach = ROD_REACH[venue] ?? 50, checked = Number.isFinite(spot.cast) ? spot.cast * 1.6 : reach;
  const max = Math.max(edge + 6, Math.min(reach, checked));
  const dx = Math.sin(face + aim), dz = -Math.cos(face + aim);
  let along = 0;
  if (wind && wind.dir) { const l = Math.hypot(wind.dir[0], wind.dir[1]) || 1; along = (dx * wind.dir[0] + dz * wind.dir[1]) / l; }
  const p = clamp(power, 0, 1);
  let dist = max * (0.3 + 0.7 * p ** 0.9) * (1 + 0.14 * clamp(wind?.strength || 0, 0, 1) * along);
  dist = clamp(dist, edge + 4, max);
  // never onto land: walk out along the line and stop short of the first solid ground beyond the edge
  if (water) for (let k = edge + 3; k <= dist; k += 1) if (!water(spot.at[0] + dx * k, spot.at[2] + dz * k)) { dist = Math.max(edge + 3, k - 3); break; }
  return { dist: Math.round(dist * 10) / 10, aim: Math.round(aim * 1000) / 1000, power: p, max, point: [spot.at[0] + dx * dist, spot.at[2] + dz * dist] };
}
