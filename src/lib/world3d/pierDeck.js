// ---- pierDeck: an open pier's deck heights and the cutting of its outline (pure: no three.js; openPier.js, tests) ----

/** The deck's height at (x, z): level at h; along a ramp from a (ya, and beyond a) to b (yb), sloping between. */
export function deckHeight(h, ramps = []) {
  return (x, z) => {
    for (const r of ramps) {
      const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], L2 = dx * dx + dz * dz || 1, t = ((x - r.a[0]) * dx + (z - r.a[1]) * dz) / L2;
      if (t < 1) return t <= 0 ? r.ya : r.ya + (r.yb - r.ya) * t;
    }
    return h;
  };
}

// the outline clipped by a half-plane (keep where (p - o) . n >= 0): Sutherland–Hodgman
export function clipHalf(poly, o, n) {
  const out = [], f = (p) => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

