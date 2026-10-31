/* FishDock astronomy + tide-cycle engine.
   Sun and Moon positions use the standard low-precision formulas (accurate to a
   few minutes for rise/set times, plenty for planning a fishing session). */
// ---- astro: sun, moon and the lunar tide cycle (on-device, no network) ----
export const ASTRO = (() => {
  const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
  const e = rad * 23.4397;
  const toDays = (ms) => ms / dayMs - 0.5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azimuth = (H, phi, d) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  const altitude = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

  function sunCoords(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
    return { ra: ra(l, b), dec: dec(l, b), dist };
  }
  function sunPos(ms, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(ms), c = sunCoords(d), H = sidereal(d, lw) - c.ra;
    return { alt: altitude(H, phi, c.dec) / rad, az: (azimuth(H, phi, c.dec) / rad + 180) % 360 };
  }
  function moonPos(ms, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(ms), c = moonCoords(d);
    let H = sidereal(d, lw) - c.ra;
    H = Math.atan2(Math.sin(H), Math.cos(H)); // -PI..PI, 0 = upper transit
    return { alt: altitude(H, phi, c.dec) / rad, az: (azimuth(H, phi, c.dec) / rad + 180) % 360, H };
  }
  function moonIllum(ms) {
    const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / PI };
  }
  function phaseName(p) {
    const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    return names[Math.floor(((p + 1 / 16) % 1) * 8)];
  }
  /* Springs come about 1.5 days after new and full moon. 1 = big springs, 0 = neaps. */
  function springFactor(ms) {
    const lag = 1.5 / 29.53;
    const p = moonIllum(ms - 0).phase;
    return 0.5 + 0.5 * Math.cos(4 * PI * (p - lag));
  }

  /* Scan a window for events (crossings). Steps in minutes. */
  function scan(startMs, endMs, stepMin, fn) {
    const out = [];
    let prevT = startMs, prev = fn(startMs);
    for (let t = startMs + stepMin * 6e4; t <= endMs + 1; t += stepMin * 6e4) {
      const cur = fn(t);
      out.push([prevT, prev, t, cur]);
      prevT = t; prev = cur;
    }
    return out;
  }
  function crossings(startMs, endMs, fn, level, stepMin = 4) {
    const res = [];
    for (const [t0, v0, t1, v1] of scan(startMs, endMs, stepMin, fn)) {
      if ((v0 - level) * (v1 - level) < 0 || (v0 === level && v1 !== level)) {
        const f = (level - v0) / (v1 - v0);
        res.push({ t: t0 + f * (t1 - t0), rising: v1 > v0 });
      }
    }
    return res;
  }
  function sunDay(dayStart, lat, lon) {
    const end = dayStart + dayMs, f = (t) => sunPos(t, lat, lon).alt;
    const pick = (lvl) => { const c = crossings(dayStart, end, f, lvl); return { rise: c.find((x) => x.rising)?.t ?? null, set: c.find((x) => !x.rising)?.t ?? null }; };
    const main = pick(-0.833), civil = pick(-6);
    return { sunrise: main.rise, sunset: main.set, dawn: civil.rise, dusk: civil.set };
  }
  function moonEvents(startMs, endMs, lat, lon) {
    const rs = crossings(startMs, endMs, (t) => moonPos(t, lat, lon).alt, 0.133, 5);
    const upper = [], lower = [];
    for (const [t0, v0, t1, v1] of scan(startMs, endMs, 5, (t) => moonPos(t, lat, lon).H)) {
      if (v0 < 0 && v1 >= 0 && v1 - v0 < 1) upper.push(t0 + (-v0 / (v1 - v0)) * (t1 - t0));
      if (v0 > 2 && v1 < -2) { // wrapped through +-PI: lower transit
        const a = PI - v0, b = PI + v1; lower.push(t0 + (a / (a + b)) * (t1 - t0));
      }
    }
    return { rises: rs.filter((x) => x.rising).map((x) => x.t), sets: rs.filter((x) => !x.rising).map((x) => x.t), upper, lower };
  }
  /* Transits (upper or lower) in a window: the tide-generating passes. */
  function transits(startMs, endMs, lon) {
    const ev = moonEvents(startMs, endMs, 0, lon);
    return [...ev.upper, ...ev.lower].sort((a, b) => a - b);
  }
  const SEMI = 12.4206 * 3600e3; // M2 period, ms
  /* Priming and lagging: high water comes early in the days after springs and late after neaps, because the
     solar tide (S2) pulls the combined crest. r = S2/M2 amplitude ratio (about 0.33 around the UK),
     the 1.5-day lag is the "age" of the tide. Returns hours to add to the mean interval. */
  function priming(ms, r = 0.33) {
    const E = 2 * PI * moonIllum(ms - 1.5 * dayMs).phase; // elongation, 0 at new moon
    return -(12.4206 / (2 * PI)) * Math.atan2(r * Math.sin(2 * E), 1 + r * Math.cos(2 * E));
  }
  /* High waters = moon transit + the port's lunitidal interval (hours). */
  function highWaters(startMs, endMs, lon, intervalH) {
    const lead = intervalH * 3600e3;
    return transits(startMs - lead - SEMI, endMs, lon).map((t) => t + lead + priming(t + lead) * 3600e3).filter((t) => t >= startMs - SEMI / 2 && t <= endMs + SEMI / 2);
  }
  /* Tide state at time t given surrounding high waters: height -1..1 (cosine model). */
  function tideAt(t, hws) {
    let prev = null, next = null;
    for (const h of hws) { if (h <= t) prev = h; else { next = h; break; } }
    if (prev == null) prev = next - SEMI;
    if (next == null) next = prev + SEMI;
    const period = next - prev, frac = (t - prev) / period; // 0 at HW, 0.5 at LW
    const sinceHW = (t - prev) / 3600e3, toHW = (next - t) / 3600e3;
    return { height: Math.cos(2 * PI * frac), frac, sinceHW, toHW, flooding: frac > 0.5 };
  }
  return { sunPos, moonPos, moonIllum, phaseName, springFactor, sunDay, moonEvents, transits, highWaters, tideAt, priming, SEMI, dayMs };
})();
export default ASTRO;
