// ---- fishLine: the fishing line as one continuous thread, from the spool to the rig or the fish ----
// The line is worked out in three parts each frame, joined end to end and drawn as one fine lit thread (fatLine.js):
//   - on the reel: with the bail closed it comes off the spool under the line roller (wherever the rotor has carried the
//     roller round, at whatever point the spool's in-and-out stroke has reached) and over the roller; with the bail open
//     for a cast it leaves the front of the spool in coils that spin round as line pours off and are choked down by the
//     butt ring, settling as the line slows;
//   - up the rod: through every ring. Each ring is a hole the line has to pass through, not a point it's pinned to: the
//     line takes the straightest path it can from the roller to the tip, and where the bent rod pulls the rings off that
//     path it bears on the side of the ring towards the straight line (so it runs through the rings as the rod bends,
//     and leaves the tip ring on the side towards the fish);
//   - from the tip: a light rope of fixed segments (position-based, with tethers from both ends so it never stretches),
//     its length the line paid out: it pays out freely in the cast, is wound in only as fast as the reel winds, gives as
//     the drag gives, and is straight and humming whenever it's pulled tighter than its length. Slack, it falls slowly
//     (a fine line is held back by the air), bows down wind, and under the water drifts with the current and sinks
//     slowly. It's always fixed to the rig or the fish's mouth: it can't float off on its own.
// Nothing here allocates once built: every point lives in fixed arrays.
import * as THREE from "three";
import { fatLine } from "./fatLine.js";

const NC = 16; // points on the reel: the spool, the roller and the run to the butt ring (or the coils of a cast)
const NF = 36; // points along the free line, the tip's included
const LINE_R = 0.00018; // (half a 0.35 mm line: it bears on a ring this far inside the ring's edge)

export function fishLine(nRings, opts = {}) {
  const NR = 2 * nRings + 1; // each ring, a point halfway to the next, and the tip ring
  const NP = NC + NR + NF - 1;
  const src = new Float32Array(NP * 3);
  const mesh = fatLine(src, NP, opts);
  const v3 = () => new THREE.Vector3();
  // filled by the caller each frame, in the world's space
  const rings = Array.from({ length: nRings }, () => ({ c: v3(), ax: v3(), r: 0.005 }));
  const tip = { c: v3(), ax: v3(), r: 0.002 };
  const reel = { spool: v3(), roller: v3(), lip: v3(), axis: v3(), lipR: 0.026, bail: 0 };
  // the free line: positions now and a step ago
  const X = new Float32Array(NF * 3), XP = new Float32Array(NF * 3);
  const X2 = new Float32Array(NF * 3), XP2 = new Float32Array(NF * 3), CUM = new Float32Array(NF); // (for taking line in or letting it out at the tip)
  const Q = Array.from({ length: nRings + 1 }, v3); // where the line bears in each ring, and the tip ring
  const a = v3(), b = v3(), d = v3(), e1 = v3(), e2 = v3(), A = v3(), endV = v3(), dir = v3(), side = v3();
  let L = 0, inited = false, theta = 0, payRate = 0, feed = 0, lastShow = false;
  const tipWas = v3(), endWas = v3();
  const endPos = v3();

  const reset = (from, to) => {
    for (let i = 0; i < NF; i++) { const s = i / (NF - 1); for (let c = 0; c < 3; c++) X[i * 3 + c] = XP[i * 3 + c] = from.getComponent(c) + (to.getComponent(c) - from.getComponent(c)) * s; }
  };
  // line wound in or let out goes in or comes out at the tip ring: the line already out keeps its shape and moves
  // along itself, rather than every piece shrinking or growing at once (which threw the slack into zigzags)
  const feedAtTip = (L0, L1) => {
    if (Math.abs(L1 - L0) < 1e-5) return;
    CUM[0] = 0; for (let i = 1; i < NF; i++) { const j = i * 3; CUM[i] = CUM[i - 1] + Math.hypot(X[j] - X[j - 3], X[j + 1] - X[j - 2], X[j + 2] - X[j - 1]); }
    const tot = CUM[NF - 1], s1 = L1 / (NF - 1); X2.set(X); XP2.set(XP);
    let k = 0;
    for (let i = 1; i < NF - 1; i++) {
      const at = Math.max(0, tot - (NF - 1 - i) * s1); // (measured from the tip, keeping each point's distance from the far end)
      while (k < NF - 2 && CUM[k + 1] < at) k++;
      const sg = CUM[k + 1] - CUM[k], f = sg > 1e-9 ? Math.min(1, (at - CUM[k]) / sg) : 0, a = k * 3, b = a + 3, j = i * 3;
      for (let c = 0; c < 3; c++) { X[j + c] = X2[a + c] + (X2[b + c] - X2[a + c]) * f; XP[j + c] = XP2[a + c] + (XP2[b + c] - XP2[a + c]) * f; }
    }
  };
  const getX = (i, out) => out.set(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]);
  const setX = (i, p) => { X[i * 3] = p.x; X[i * 3 + 1] = p.y; X[i * 3 + 2] = p.z; };
  // where a line from p to n crosses the plane of a ring, kept inside the ring (out: the point)
  const throughRing = (ring, p, n, out) => {
    d.subVectors(n, p); const den = d.dot(ring.ax);
    if (Math.abs(den) < 1e-7) out.copy(ring.c);
    else { const s = Math.min(1, Math.max(0, a.subVectors(ring.c, p).dot(ring.ax) / den)); out.copy(p).addScaledVector(d, s); }
    d.subVectors(out, ring.c); d.addScaledVector(ring.ax, -d.dot(ring.ax));
    const lim = Math.max(0, ring.r * 0.84 - LINE_R), l = d.length();
    if (l > lim) d.multiplyScalar(lim / l);
    return out.copy(ring.c).add(d);
  };

  /**
   * o: { dt, t, show, end (Vector3: the rig or the fish's mouth; null with freeEnd), freeEnd (the rig hanging free on
   * a drop of `drop` metres, as in the wind-up of a cast), excess (slack wanted, as a fraction of the distance),
   * payout (the spool running free: line only goes out), retrieve (m/s the reel can wind in), give (m/s the drag lets
   * out), wound (metres the reel wound in this frame, for the glints), tension (0-1.4: the hum), wind [x, z] (m/s/s),
   * current [x, z] (m/s), waterY, rodSag (0-1: how slack the line between the rings is) }
   */
  function update(o) {
    mesh.visible = !!o.show;
    if (!o.show) { inited = false; lastShow = false; return; }
    const dt = Math.min(0.05, Math.max(1e-4, o.dt || 0.016));
    // ---- the free line's length ----
    const tc = tip.c;
    if (o.freeEnd) {
      const want = o.drop || 1.2;
      if (!inited) { endV.copy(tc).add(a.set(0, -want, 0)); reset(tc, endV); L = want; }
      L += (want - L) * Math.min(1, dt * 6);
    } else {
      endV.copy(o.end);
      const dist = endV.distanceTo(tc);
      if (!inited || !lastShow) { reset(tc, endV); L = dist * (1 + (o.excess || 0)); }
      const want = dist * (1 + Math.max(0, o.excess || 0));
      const L0 = L;
      if (o.payout) L = Math.max(L, want);
      else if (want > L) L = Math.min(want, L + (o.give ?? 60) * dt);
      else L = Math.max(want, L - (o.retrieve ?? 2) * dt);
      // (an angler doesn't leave metres of slack out: past a little, they wind down to it quickly)
      if (!o.payout) { const cap = dist * (1 + (o.maxSlack ?? 0.03)); if (L > cap) L = Math.max(cap, L - 6 * dt); }
      L = Math.max(L, dist * 0.999, 0.05);
      payRate = (L - L0) / dt;
      if (inited && lastShow) feedAtTip(L0, L);
    }
    // the line goes where its ends go: a fish swimming off or the rod swept round drags the line nearest it most, so
    // nothing is left behind to fold back on itself
    if (inited && lastShow) {
      const last0 = NF - 1, tdx = tc.x - tipWas.x, tdy = tc.y - tipWas.y, tdz = tc.z - tipWas.z;
      const edx = o.freeEnd ? 0 : endV.x - endWas.x, edy = o.freeEnd ? 0 : endV.y - endWas.y, edz = o.freeEnd ? 0 : endV.z - endWas.z;
      for (let i = 1; i < last0; i++) {
        const u = i / last0, wt = 1 - u, we = u, j = i * 3; // (spread evenly: dragging only the near end bunched the line there)
        const dx = tdx * wt + edx * we, dy = tdy * wt + edy * we, dz = tdz * wt + edz * we;
        X[j] += dx; X[j + 1] += dy; X[j + 2] += dz; XP[j] += dx; XP[j + 1] += dy; XP[j + 2] += dz;
      }
    }
    // (and if that leaves the line shorter than its length, it falls into one smooth belly, as slack line does, rather
    // than buckling into zigzags as it's pushed apart)
    if (inited && lastShow && !o.freeEnd) {
      let lc = 0; for (let i = 1; i < NF; i++) { const j = i * 3; lc += Math.hypot(X[j] - X[j - 3], X[j + 1] - X[j - 2], X[j + 2] - X[j - 1]); }
      const D = Math.max(0.01, endV.distanceTo(tc));
      if (lc < L * 0.995) { const h = Math.sqrt((3 * D * (L - lc)) / 8); for (let i = 1; i < NF - 1; i++) { const dy = -h * Math.sin(Math.PI * i / (NF - 1)); X[i * 3 + 1] += dy; XP[i * 3 + 1] += dy; } }
    }
    tipWas.copy(tc); if (!o.freeEnd) endWas.copy(endV);
    inited = true; lastShow = true;
    feed += (o.wound || 0) - Math.max(0, payRate) * dt;
    const seg = L / (NF - 1), last = NF - 1;
    const dist = o.freeEnd ? 0 : endV.distanceTo(tc);
    const taut = !o.freeEnd && dist >= L * 0.9995;
    if (taut) {
      // pulled tighter than its length: straight from the tip to the fish, humming
      dir.subVectors(endV, tc); const dl = dir.length() || 1; dir.divideScalar(dl);
      side.set(-dir.z, 0, dir.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      const hum = 0.0035 * Math.min(1.4, o.tension || 0);
      for (let i = 0; i < NF; i++) {
        const s = i / last, w = Math.sin(Math.PI * s) * hum * Math.sin(o.t * 47 + s * 9);
        a.copy(tc).lerp(endV, s).addScaledVector(side, w).y += w * 0.6;
        setX(i, a); XP[i * 3] = X[i * 3]; XP[i * 3 + 1] = X[i * 3 + 1]; XP[i * 3 + 2] = X[i * 3 + 2];
      }
    } else {
      const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
      const wx = o.wind ? o.wind[0] : 0, wz = o.wind ? o.wind[1] : 0, cx = o.current ? o.current[0] : 0, cz = o.current ? o.current[1] : 0, wy = o.waterY ?? -1e9;
      for (let st = 0; st < steps; st++) {
        // ---- move: each point carries on as it was going, held back by the air (or the water), pulled by the wind ----
        const airK = Math.exp(-1.8 * h), watK = Math.exp(-6 * h);
        for (let i = 1; i < NF; i++) {
          if (i === last && !o.freeEnd) continue;
          const j = i * 3, lead = o.freeEnd && i === last;
          let vx = X[j] - XP[j], vy = X[j + 1] - XP[j + 1], vz = X[j + 2] - XP[j + 2], ax = 0, ay, az = 0;
          if (lead) { vx *= 0.995; vy *= 0.995; vz *= 0.995; ay = -9.8; } // (the lead: heavy, it swings)
          else if (X[j + 1] < wy) {
            // under the water: drags towards the current, sinks slowly
            vx = cx * h + (vx - cx * h) * watK; vz = cz * h + (vz - cz * h) * watK; vy *= watK; ay = -0.8;
          } else { vx *= airK; vy *= airK; vz *= airK; ax = wx; az = wz; ay = -2.6; }
          XP[j] = X[j]; XP[j + 1] = X[j + 1]; XP[j + 2] = X[j + 2];
          X[j] += vx + ax * h * h; X[j + 1] += vy + ay * h * h; X[j + 2] += vz + az * h * h;
        }
        setX(0, tc); if (!o.freeEnd) setX(last, endV);
        // ---- keep each piece its length, and nothing further from either end than the line between allows ----
        for (let it = 0; it < 8; it++) {
          for (let pass = 0; pass < 2; pass++) {
            for (let k = 0; k < last; k++) {
              const i = pass ? last - 1 - k : k, j = i * 3, jn = j + 3;
              const dx = X[jn] - X[j], dy = X[jn + 1] - X[j + 1], dz = X[jn + 2] - X[j + 2], l = Math.hypot(dx, dy, dz) || 1e-9;
              const fixA = i === 0, fixB = i + 1 === last && !o.freeEnd, wA = fixA ? 0 : fixB ? 1 : 0.5, wB = fixB ? 0 : fixA ? 1 : 0.5;
              if (l <= seg) continue; // (a line can't push: it only stops itself stretching, so slack never buckles)
              const c = (l - seg) / l;
              X[j] += dx * c * wA; X[j + 1] += dy * c * wA; X[j + 2] += dz * c * wA;
              X[jn] -= dx * c * wB; X[jn + 1] -= dy * c * wB; X[jn + 2] -= dz * c * wB;
            }
          }
          // (tethers: no point further from the tip, or from the fish, than the line between them)
          for (let i = 1; i < last + (o.freeEnd ? 1 : 0); i++) {
            const j = i * 3;
            let dx = X[j] - tc.x, dy = X[j + 1] - tc.y, dz = X[j + 2] - tc.z, l = Math.hypot(dx, dy, dz), m = i * seg;
            if (l > m) { const k = m / l; X[j] = tc.x + dx * k; X[j + 1] = tc.y + dy * k; X[j + 2] = tc.z + dz * k; }
            if (!o.freeEnd) { dx = X[j] - endV.x; dy = X[j + 1] - endV.y; dz = X[j + 2] - endV.z; l = Math.hypot(dx, dy, dz); m = (last - i) * seg; if (l > m) { const k = m / l; X[j] = endV.x + dx * k; X[j + 1] = endV.y + dy * k; X[j + 2] = endV.z + dz * k; } }
          }
          setX(0, tc); if (!o.freeEnd) setX(last, endV);
        }
      }
      // (anything gone wrong, start again straight rather than draw it)
      for (let i = 0; i < NF * 3; i++) if (!Number.isFinite(X[i])) { reset(tc, o.freeEnd ? a.copy(tc).add(b.set(0, -L, 0)) : endV); break; }
    }
    getX(last, endPos);

    // ---- up the rod: where the line bears in each ring, the straightest path from the reel to the line leaving the tip ----
    A.copy(reel.roller).lerp(reel.lip, reel.bail);
    for (let i = 0; i < nRings; i++) Q[i].copy(rings[i].c);
    Q[nRings].copy(tip.c);
    getX(Math.min(2, last), b); // (the line beyond the tip ring: the way it leaves)
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i <= nRings; i++) {
        const ring = i < nRings ? rings[i] : tip, p = i ? Q[i - 1] : A, n = i < nRings ? Q[i + 1] : b;
        throughRing(ring, p, n, Q[i]);
      }
    }
    // the tip ring's contact is where the free line starts
    setX(0, Q[nRings]);

    // ---- the points, in order ----
    let k = 0;
    const put = (p) => { src[k * 3] = p.x; src[k * 3 + 1] = p.y; src[k * 3 + 2] = p.z; k++; };
    // on the reel. Closed: off the spool under the roller, over the roller, straight to the butt ring. Open: coils off
    // the front of the spool, spinning round as line pours off, choked down to the butt ring
    const q0 = Q[0];
    const pr = Math.max(0, payRate); theta += Math.min(2.4, (pr / Math.max(0.01, reel.lipR)) * dt);
    d.subVectors(q0, reel.lip); const dl = d.length() || 1; d.divideScalar(dl);
    e1.set(0, 1, 0).addScaledVector(d, -d.y); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize(); e2.crossVectors(d, e1);
    const balloon = reel.lipR * (1 + 1.6 * Math.min(1, pr / 25));
    for (let i = 0; i < NC; i++) {
      // closed
      if (i === 0) a.copy(reel.spool); else if (i === 1) a.copy(reel.roller); else a.copy(reel.roller).lerp(q0, (i - 1) / NC);
      // open: a coil from the spool's lip, its turns shrinking towards the ring
      // (still, the line runs straight from the spool's rim to the ring; pouring off, it balloons out in turns)
      const u = i / NC, coil = Math.min(1, pr / 3), rr = i === 0 ? reel.lipR + (balloon - reel.lipR) * coil : balloon * Math.pow(1 - u, 1.4) * coil, ang = theta + u * Math.PI * 2.6;
      b.copy(reel.lip).addScaledVector(d, dl * Math.pow(u, 1.5)).addScaledVector(e1, Math.cos(ang) * rr).addScaledVector(e2, Math.sin(ang) * rr);
      put(a.lerp(b, reel.bail));
    }
    // up the rod: each ring, then halfway to the next (sagging a touch when the line's slack)
    const sagK = 0.04 * Math.max(0, Math.min(1, o.rodSag || 0));
    for (let i = 0; i <= nRings; i++) {
      put(Q[i]);
      if (i < nRings) { a.copy(Q[i]).lerp(Q[i + 1], 0.5); a.y -= sagK * Q[i].distanceToSquared(Q[i + 1]); put(a); }
    }
    // and out from the tip
    for (let i = 1; i < NF; i++) { src[k * 3] = X[i * 3]; src[k * 3 + 1] = X[i * 3 + 1]; src[k * 3 + 2] = X[i * 3 + 2]; k++; }
    mesh.userData.feed = feed;
    mesh.userData.sync();
  }

  return {
    mesh, rings, tip, reel, update, endPos,
    get length() { return L; }, get payRate() { return payRate; },
    // (for checks: every point of the line, and where it bears in each ring)
    points: () => Array.from({ length: NP }, (_, i) => [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]),
    contacts: () => Q.map((q) => q.toArray()),
    segment: () => ({ reel: [0, NC], rod: [NC, NC + NR], free: [NC + NR - 1, NP] }),
  };
}
