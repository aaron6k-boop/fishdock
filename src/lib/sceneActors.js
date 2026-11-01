// ---- sceneActors: the rod, line, float, fish, splashes and rain of the Live Fishing View (2D canvas over the water) ----
// Everything is drawn from the angler's point of view: the rod comes in from the bottom right, its tip over the
// water, the line running to where it enters. The pose is a pure function of the phase and its age (liveEvents.js),
// so live viewing, reconnecting and replay scrubbing all land on the same picture; splashes are spawned as the age
// crosses their moment. The fish is FishDock's own species picture, bent along its body as it wriggles and scaled
// to the logged length. It's a reconstruction of a logged catch, and the app says so.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const ease = (f) => (f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f));
const damp = (t, k, w) => Math.exp(-t * k) * Math.cos(t * w);
// smooth pseudo-random wobble
const wob = (t, s = 0) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 2.7 + s * 1.7) * 0.3 + Math.sin(t * 4.9 + s * 3.1) * 0.2;

const GUIDES = [0.42, 0.54, 0.64, 0.72, 0.79, 0.85, 0.9, 0.94, 0.975];

export function createActors(canvas, { onSound } = {}) {
  const ctx = canvas.getContext("2d");
  let W = 1, H = 1, k = 1, map = [1, 1, 0, 0];
  let castRef = [0.5, 0.62], horizon = 0.42, floatRig = false, night = 0, windN = 0.3, windDir = 1, rain = 0;
  let fishImg = null, fishCut = false, fishLenPx = 0, particles = [], ripples = [], streaks = [];
  let reelA = 0, lastPhaseKey = "", prevAge = -1, lastT = 0, nextBoil = 0, nextDrip = 0, quality = 1, dusk = 0;
  let birds = [], nextFlock = 6 + Math.random() * 10;
  const fishCanvas = document.createElement("canvas");
  const fctx = fishCanvas.getContext("2d");

  const toStage = (r) => [((r[0] - map[2]) / map[0]) * W, ((r[1] - map[3]) / map[1]) * H];
  const toRef = (x, y) => [(x / W) * map[0] + map[2], (y / H) * map[1] + map[3]];
  const depthAt = (y) => clamp((toRef(0, y)[1] - horizon) / Math.max(0.05, 1 - horizon), 0, 1);

  function addRipple(x, y, s = 1) { const [rx, ry] = toRef(x, y); ripples.push({ x: rx, y: ry, born: lastT, s }); if (ripples.length > 6) ripples.shift(); }
  function splash(x, y, size = 1, n = 22) {
    const d = depthAt(y), sc = (0.35 + d) * k * size;
    n = Math.round(n * quality);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const v = (60 + Math.random() * 170) * sc;
      particles.push({ x: x + (Math.random() - 0.5) * 10 * sc, y, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.7, r: (0.8 + Math.random() * 2.2) * sc, kind: "drop", floor: y + 4 * sc });
    }
    for (let i = 0; i < Math.round(5 * quality); i++) particles.push({ x: x + (Math.random() - 0.5) * 24 * sc, y: y - Math.random() * 8 * sc, vx: (Math.random() - 0.5) * 20 * sc, vy: -10 * sc, life: 0, max: 0.9 + Math.random() * 0.5, r: (8 + Math.random() * 10) * sc, kind: "mist", floor: 1e9 });
    addRipple(x, y, Math.min(1.4, size));
  }

  // ---- layout ----
  function layout() {
    const land = W / H >= 1.05;
    const B = land ? [W * 1.02, H * 1.14] : [W * 1.06, H * 1.1];
    const T = land ? [W * 0.68, H * 0.15] : [W * 0.6, H * 0.17];
    return { B, T, L: Math.hypot(T[0] - B[0], T[1] - B[1]), th0: Math.atan2(T[1] - B[1], T[0] - B[0]) };
  }

  function rodPoints(B, L, th, kappa) {
    const N = 30, pts = [B.slice()], ang = [];
    let x = B[0], y = B[1];
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N;
      const a = th - kappa * s * s * 1.15;
      ang.push(a);
      x += (Math.cos(a) * L) / N; y += (Math.sin(a) * L) / N;
      pts.push([x, y]);
    }
    return { pts, ang };
  }
  const at = (rod, s) => { const i = clamp(s * (rod.pts.length - 1), 0, rod.pts.length - 1.001); const j = Math.floor(i), f = i - j; return [lerp(rod.pts[j][0], rod.pts[j + 1][0], f), lerp(rod.pts[j][1], rod.pts[j + 1][1], f), rod.ang[Math.min(j, rod.ang.length - 1)]]; };
  const down = (a) => { let nx = -Math.sin(a), ny = Math.cos(a); if (ny < 0) { nx = -nx; ny = -ny; } return [nx, ny]; };

  // ---- drawing ----
  function drawRod(rod) {
    const n = rod.pts.length;
    const wBase = 21 * k, wTip = 2.2 * k;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1), a = rod.ang[Math.min(i, rod.ang.length - 1)];
      const hw = lerp(wBase, wTip, Math.pow(s, 0.75)) / 2 * (s < 0.27 ? 1.45 : 1);
      left.push([rod.pts[i][0] - Math.sin(a) * hw, rod.pts[i][1] + Math.cos(a) * hw]);
      right.push([rod.pts[i][0] + Math.sin(a) * hw, rod.pts[i][1] - Math.cos(a) * hw]);
    }
    const mid = rod.pts[Math.floor(n * 0.45)], ma = rod.ang[Math.floor(n * 0.45)];
    const nx = -Math.sin(ma) * 6 * k, ny = Math.cos(ma) * 6 * k;
    const g = ctx.createLinearGradient(mid[0] + nx, mid[1] + ny, mid[0] - nx, mid[1] - ny);
    const lit = 1 - night * 0.75;
    g.addColorStop(0, `rgba(${8 * lit + 4},${11 * lit + 5},${14 * lit + 6},1)`);
    g.addColorStop(0.55, `rgba(${46 * lit + 6},${56 * lit + 7},${66 * lit + 9},1)`);
    g.addColorStop(0.72, `rgba(${132 * lit + 10},${146 * lit + 12},${158 * lit + 14},1)`);
    g.addColorStop(1, `rgba(${14 * lit + 4},${18 * lit + 5},${22 * lit + 6},1)`);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 6 * k; ctx.shadowOffsetY = 3 * k;
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    // grip (EVA) and reel seat near the butt
    const seat = at(rod, 0.3), grip0 = at(rod, 0.0), grip1 = at(rod, 0.25);
    ctx.lineCap = "round";
    // EVA grip: dark, slightly textured
    ctx.strokeStyle = `rgba(${22 * lit + 6},${24 * lit + 6},${26 * lit + 7},1)`; ctx.lineWidth = 30 * k;
    ctx.beginPath(); ctx.moveTo(grip0[0], grip0[1]); ctx.lineTo(grip1[0], grip1[1]); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.07 * lit})`; ctx.lineWidth = 9 * k;
    ctx.beginPath(); ctx.moveTo(grip0[0] - 6 * k, grip0[1]); ctx.lineTo(grip1[0] - 6 * k, grip1[1]); ctx.stroke();
    // reel seat: a brushed metal band either side of the reel foot
    const s0 = at(rod, 0.27), s1 = at(rod, 0.33);
    const mg = ctx.createLinearGradient(s0[0] - 10 * k, s0[1], s0[0] + 10 * k, s0[1]);
    mg.addColorStop(0, `rgb(${70 * lit + 10},${74 * lit + 10},${78 * lit + 10})`); mg.addColorStop(0.5, `rgb(${190 * lit + 20},${196 * lit + 20},${202 * lit + 20})`); mg.addColorStop(1, `rgb(${60 * lit + 8},${64 * lit + 8},${68 * lit + 8})`);
    ctx.strokeStyle = mg; ctx.lineWidth = 22 * k;
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    // a thin highlight along the blank
    ctx.strokeStyle = `rgba(255,255,255,${0.16 * lit})`; ctx.lineWidth = Math.max(0.6, 1.1 * k);
    ctx.beginPath();
    for (let i = Math.floor(n * 0.22); i < n - 1; i++) { const a = rod.ang[Math.min(i, rod.ang.length - 1)], hw = lerp(wBase, wTip, i / (n - 1)) * 0.22; const p = [rod.pts[i][0] + Math.sin(a) * hw, rod.pts[i][1] - Math.cos(a) * hw]; i === Math.floor(n * 0.22) ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
    return seat;
  }

  function guidePoints(rod) {
    return GUIDES.map((s) => {
      const [x, y, a] = at(rod, s);
      const [dx, dy] = down(a);
      const r = Math.max(1.8 * k, 22 * k * Math.pow(1 - s, 1.3));
      const off = r * 1.45 + lerp(9 * k, 1.2 * k, s);
      return { x, y, cx: x + dx * off, cy: y + dy * off, r, a };
    });
  }
  function drawGuides(gs) {
    const lit = 1 - night * 0.7;
    for (const g of gs) {
      ctx.strokeStyle = `rgba(${20 * lit + 5},${24 * lit + 5},${28 * lit + 6},1)`; ctx.lineWidth = Math.max(1, 1.6 * k);
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.cx, g.cy); ctx.stroke();
      ctx.save(); ctx.translate(g.cx, g.cy); ctx.rotate(g.a);
      ctx.strokeStyle = `rgba(${170 * lit + 25},${180 * lit + 25},${190 * lit + 25},0.95)`; ctx.lineWidth = Math.max(0.8, 1.4 * k * (g.r / (10 * k)) + 0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, g.r * 0.35, g.r, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawReel(seat, a, spin) {
    const [dx, dy] = down(a);
    const k0 = k;
    k = k0 * 2.3; // the reel is close to the camera
    const c = [seat[0] + dx * 24 * k, seat[1] + dy * 24 * k];
    const lit = 1 - night * 0.7;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(${40 * lit + 6},${44 * lit + 6},${48 * lit + 7},1)`; ctx.lineWidth = 6 * k;
    ctx.beginPath(); ctx.moveTo(seat[0], seat[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    ctx.translate(c[0], c[1]); ctx.rotate(a);
    // body
    const bg = ctx.createLinearGradient(0, -14 * k, 0, 16 * k);
    bg.addColorStop(0, `rgb(${70 * lit + 8},${76 * lit + 8},${84 * lit + 10})`); bg.addColorStop(0.5, `rgb(${26 * lit + 5},${29 * lit + 5},${33 * lit + 6})`); bg.addColorStop(1, `rgb(${12 * lit + 4},${13 * lit + 4},${15 * lit + 5})`);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(-6 * k, 4 * k, 17 * k, 13 * k, 0, 0, TAU); ctx.fill();
    // spool (towards the tip), with line on it
    const sg = ctx.createLinearGradient(0, -16 * k, 0, 16 * k);
    sg.addColorStop(0, `rgb(${210 * lit + 20},${214 * lit + 20},${220 * lit + 20})`); sg.addColorStop(0.45, `rgb(${120 * lit + 12},${126 * lit + 12},${134 * lit + 14})`); sg.addColorStop(1, `rgb(${60 * lit + 8},${64 * lit + 8},${70 * lit + 9})`);
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(16 * k, 3 * k, 6 * k, 15 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${200 * lit + 30},${215 * lit + 30},${225 * lit + 30},0.55)`; ctx.lineWidth = 0.7 * k;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(13 * k - i * 1.6 * k, 3 * k, 4.5 * k, 12.5 * k, 0, -1.2, 1.2); ctx.stroke(); }
    // bail arm
    ctx.strokeStyle = `rgba(${190 * lit + 20},${196 * lit + 20},${200 * lit + 20},0.9)`; ctx.lineWidth = 1.4 * k;
    ctx.beginPath(); ctx.ellipse(18 * k, 3 * k, 8 * k, 18 * k, 0, -2.2 + Math.sin(spin) * 0.15, 0.6); ctx.stroke();
    // handle, turning when the angler reels
    const hx = -8 * k, hy = 4 * k, R = 15 * k;
    const kx = hx + Math.cos(spin) * R, ky = hy + Math.sin(spin) * R * 0.55 - 14 * k;
    ctx.strokeStyle = `rgb(${34 * lit + 6},${37 * lit + 6},${41 * lit + 7})`; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.moveTo(hx, hy - 14 * k); ctx.lineTo(kx, ky); ctx.stroke();
    const kg = ctx.createRadialGradient(kx - 2 * k, ky - 2 * k, 0.5, kx, ky, 6 * k);
    kg.addColorStop(0, `rgb(${120 * lit + 10},${126 * lit + 10},${132 * lit + 10})`); kg.addColorStop(1, `rgb(${18 * lit + 4},${20 * lit + 4},${22 * lit + 5})`);
    ctx.fillStyle = kg; ctx.beginPath(); ctx.ellipse(kx, ky, 4.6 * k, 6 * k, 0, 0, TAU); ctx.fill();
    ctx.restore();
    const out = [c[0] + Math.cos(a) * 16 * k, c[1] + Math.sin(a) * 16 * k];
    k = k0;
    return out;
  }

  function lineStroke(alpha = 0.55) {
    ctx.strokeStyle = night > 0.6 ? `rgba(200,215,230,${alpha * 0.45})` : `rgba(236,240,244,${alpha})`;
    ctx.lineWidth = Math.max(0.7, 0.9 * k);
  }
  function drawLineThroughRod(spoolExit, gs, tip) {
    lineStroke(0.5);
    ctx.beginPath(); ctx.moveTo(spoolExit[0], spoolExit[1]);
    for (const g of gs) ctx.lineTo(g.cx, g.cy - g.r * 0.4);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
  }
  function drawLineOut(tip, end, slack, t) {
    lineStroke(0.6);
    const mx = (tip[0] + end[0]) / 2 + windDir * windN * 22 * k * slack + Math.sin(t * 1.7) * 2 * k * slack;
    const my = (tip[1] + end[1]) / 2 + slack * Math.hypot(end[0] - tip[0], end[1] - tip[1]) * 0.18;
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.quadraticCurveTo(mx, my, end[0], end[1]); ctx.stroke();
  }
  function drawTipLight(tip) {
    if (night < 0.3) return;
    const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 14 * k);
    g.addColorStop(0, `rgba(170,255,190,${0.9 * night})`); g.addColorStop(0.25, `rgba(90,255,140,${0.45 * night})`); g.addColorStop(1, "rgba(60,255,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 14 * k, 0, TAU); ctx.fill();
  }
  function drawFloat(x, y, dip, t) {
    const d = depthAt(y), s = (0.4 + d * 1.2) * k;
    const bob = Math.sin(t * 2.2) * 1.2 * s - dip * 9 * s;
    ctx.save(); ctx.translate(x, y + bob);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 2 * s, 5 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
    if (dip < 0.9) {
      const g = ctx.createLinearGradient(-2 * s, 0, 2 * s, 0); g.addColorStop(0, "#c2410c"); g.addColorStop(0.4, "#fb923c"); g.addColorStop(1, "#9a3412");
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-1.6 * s, -11 * s * (1 - dip), 3.2 * s, 11 * s * (1 - dip) + 1, 1.5 * s) : ctx.rect(-1.6 * s, -11 * s * (1 - dip), 3.2 * s, 11 * s * (1 - dip) + 1); ctx.fill();
    }
    ctx.restore();
    return [x, y + bob - 10 * s * (1 - dip)];
  }

  /** The fish, bent along its body (head left in the picture), into its own canvas so a wet sheen stays on it. */
  function drawFish(cx, cy, rot, lenPx, wag, amp, alpha = 1) {
    if (!fishImg || !fishCut || alpha <= 0) return null;
    const iw = fishImg.naturalWidth, ih = fishImg.naturalHeight;
    const s = lenPx / (iw * 0.9);
    const fw = Math.ceil(iw * s * 1.1), fh = Math.ceil(ih * s * 1.5);
    if (fishCanvas.width !== fw || fishCanvas.height !== fh) { fishCanvas.width = fw; fishCanvas.height = fh; } else fctx.clearRect(0, 0, fw, fh);
    const N = 26;
    for (let j = 0; j < N; j++) {
      const u = j / N;
      const dy = Math.sin(u * 3.2 - wag) * amp * Math.pow(u, 1.6) * ih * 0.12;
      fctx.drawImage(fishImg, u * iw, 0, iw / N + 1, ih, (fw - iw * s) / 2 + u * iw * s, (fh - ih * s) / 2 + dy * s, (iw / N + 1) * s, ih * s);
    }
    fctx.globalCompositeOperation = "source-atop";
    const sh = fctx.createLinearGradient(0, fh * 0.3, 0, fh * 0.6);
    sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.45, `rgba(255,255,255,${0.2 - night * 0.12})`); sh.addColorStop(1, "rgba(255,255,255,0)");
    fctx.fillStyle = sh; fctx.fillRect(0, 0, fw, fh);
    if (night > 0.2) { fctx.fillStyle = `rgba(10,20,40,${night * 0.55})`; fctx.fillRect(0, 0, fw, fh); }
    fctx.globalCompositeOperation = "source-over";
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.drawImage(fishCanvas, -fw / 2, -fh / 2);
    ctx.restore();
    // the mouth (where the hook is) in stage coordinates
    const mx = -iw * 0.44 * s, my = ih * 0.04 * s;
    return [cx + mx * Math.cos(rot) - my * Math.sin(rot), cy + mx * Math.sin(rot) + my * Math.cos(rot), s, iw, ih];
  }

  function stepParticles(dt) {
    const g = H * 1.6;
    particles = particles.filter((p) => (p.life += dt) < p.max);
    for (const p of particles) {
      if (p.kind === "drop") { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > p.floor && p.vy > 0) p.life = p.max; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.r *= 1 + dt * 0.6; }
    }
  }
  function drawParticles() {
    for (const p of particles) {
      const f = 1 - p.life / p.max;
      if (p.kind === "drop") { ctx.fillStyle = `rgba(232,242,250,${0.75 * f})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
      else { const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); gr.addColorStop(0, `rgba(235,242,248,${0.22 * f})`); gr.addColorStop(1, "rgba(235,242,248,0)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
    }
  }
  /** Now and then a few gulls glide across the sky, wings beating, then gliding (none at night). */
  function stepBirds(t, dt) {
    if (t > nextFlock && night < 0.5) {
      nextFlock = t + 18 + Math.random() * 30;
      const dir = Math.random() < 0.5 ? 1 : -1, n = 1 + Math.floor(Math.random() * 3);
      const [, hy] = toStage([0, horizon]);
      const y0 = hy * (0.25 + Math.random() * 0.5), size = (5 + Math.random() * 6) * k;
      for (let i = 0; i < n; i++) birds.push({ x: dir > 0 ? -40 * k - i * 30 * k : W + 40 * k + i * 30 * k, y: y0 + (Math.random() - 0.5) * 30 * k, vx: dir * (28 + Math.random() * 14) * k * (1 + windN * 0.6), s: size * (0.8 + Math.random() * 0.4), ph: Math.random() * 6, bob: Math.random() * 6 });
    }
    birds = birds.filter((b) => b.x > -80 * k && b.x < W + 80 * k);
    const shade = night > 0.3 ? 0.25 : dusk > 0.4 ? 0.15 : 0.32;
    ctx.strokeStyle = `rgba(${Math.round(30 + 20 * (1 - dusk))},${Math.round(34 + 20 * (1 - dusk))},${Math.round(40 + 20 * (1 - dusk))},${0.75 - shade})`;
    ctx.lineCap = "round";
    for (const b of birds) {
      b.x += b.vx * dt; b.y += Math.sin(t * 0.7 + b.bob) * 4 * k * dt;
      const beat = Math.sin(t * 0.25 + b.ph) > 0.2 ? Math.sin(t * 9 + b.ph) : 0.25; // flaps, then a glide
      const wy = b.s * (0.15 + 0.45 * beat), dir = Math.sign(b.vx);
      ctx.lineWidth = Math.max(1, b.s * 0.22);
      ctx.beginPath();
      ctx.moveTo(b.x - b.s * dir * 0.1 - b.s, b.y - wy);
      ctx.quadraticCurveTo(b.x - b.s * 0.45, b.y - wy * 0.2 - b.s * 0.25, b.x, b.y);
      ctx.quadraticCurveTo(b.x + b.s * 0.45, b.y - wy * 0.2 - b.s * 0.25, b.x + b.s, b.y - wy);
      ctx.stroke();
    }
  }

  function drawRain(dt) {
    const want = Math.round(clamp(rain, 0, 1) * 260 * quality);
    while (streaks.length < want) streaks.push({ x: Math.random() * W, y: Math.random() * H, v: (900 + Math.random() * 700) * (H / 600), l: 8 + Math.random() * 14 });
    streaks.length = want;
    if (!want) return;
    const slant = windDir * windN * 0.35;
    ctx.strokeStyle = `rgba(210,222,235,${0.18 + 0.1 * (1 - night)})`; ctx.lineWidth = Math.max(0.6, 0.8 * k);
    ctx.beginPath();
    for (const s of streaks) {
      s.y += s.v * dt; s.x += s.v * dt * slant;
      if (s.y > H) { s.y = -20; s.x = Math.random() * W; }
      if (s.x > W) s.x -= W; if (s.x < 0) s.x += W;
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.l * slant * k, s.y - s.l * k);
    }
    ctx.stroke();
  }

  // ---- one frame ----
  function frame(t, info) {
    const dt = clamp(t - lastT, 0, 0.1);
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    const { phase = "idle", age = 0, ev = null } = info || {};
    const key = `${phase}|${info?.since || 0}`;
    if (key !== lastPhaseKey) { lastPhaseKey = key; prevAge = age > 1.2 ? age : -1; }
    const crossed = (m) => prevAge < m && age >= m;
    const { B, L, th0 } = layout();
    const E0 = toStage(castRef);
    const near = [W * (W / H > 1.05 ? 0.46 : 0.42), lerp(E0[1], H * 0.96, 0.75)];
    let th = th0, kappa = 0.04, slack = 1, end = E0, showLine = phase !== "ended" && phase !== "idle", lead = null, spinning = false, floatDip = 0;
    const sway = wob(t * 0.8) * 0.006 * (0.4 + windN) + (phase === "waiting" && !floatRig ? Math.max(0, Math.sin(t * 0.78)) * 0.012 * (0.5 + windN) : 0);
    kappa += sway;

    if (phase === "cast") {
      if (age < 0.75) { const f = ease(age / 0.75); th = th0 + 0.72 * f; kappa = -0.05 * f; showLine = false; }
      else if (age < 1.05) { const f = ease((age - 0.75) / 0.3); th = th0 + 0.72 - 1.0 * f; kappa = -0.05 + 0.32 * Math.sin(f * Math.PI); showLine = false; }
      else { const f = age - 1.05; th = th0 - 0.28 * damp(f, 3.2, 9); kappa = 0.06 * damp(f, 4, 14); }
      if (age >= 0.95 && age < 2.15) {
        const f = (age - 0.95) / 1.2;
        const tipNow = rodPoints(B, L, th, kappa).pts.at(-1);
        const x = lerp(tipNow[0], E0[0], ease(f)), y = lerp(tipNow[1], E0[1], f) - Math.sin(f * Math.PI) * H * 0.22;
        lead = [x, y, 1 - f * 0.7];
        end = [x, y]; slack = 0.05; showLine = true;
      } else if (age >= 2.15) { slack = clamp((age - 2.15) / 0.7, 0.05, 1); }
      if (crossed(0.8)) onSound?.("whoosh");
      if (crossed(2.15)) { splash(E0[0], E0[1], 0.8, 16); onSound?.("plop"); }
    } else if (phase === "bite") {
      const pulls = [[0, 0.07], [0.55, 0.12], [1.15, 0.08], [2.1, 0.16], [3.2, 0.06]];
      for (const [p0, a] of pulls) if (age > p0) kappa += a * Math.exp(-(age - p0) * 5) * Math.abs(Math.sin((age - p0) * 26));
      slack = 0.55;
      if (floatRig) floatDip = clamp(Math.max(0, Math.sin(age * 5)) * (age < 3 ? 0.8 : 0.2), 0, 1);
      if (crossed(0.02)) { onSound?.("bell"); addRipple(E0[0], E0[1], 0.5); }
      if (crossed(2.1)) { onSound?.("bell"); addRipple(E0[0], E0[1], 0.6); }
    } else if (phase === "hooked") {
      const pr = 1 - Math.exp(-age / 55);
      end = [lerp(E0[0], near[0], pr * 0.8) + Math.sin(age * 0.45) * W * 0.06 * (1 - pr * 0.6), lerp(E0[1], near[1], pr * 0.85) + Math.sin(age * 0.8) * 4 * k];
      const lunge = Math.max(0, Math.sin(age * 0.9 + Math.sin(age * 0.37) * 2)) ** 6;
      kappa = 0.34 + 0.06 * wob(age * 2.2, 1) + 0.16 * lunge;
      th = th0 - 0.05 - 0.04 * lunge;
      slack = 0;
      spinning = lunge < 0.4;
      if (t > nextBoil) { nextBoil = t + 3 + Math.random() * 5; if (age > 0.5) { splash(end[0], end[1], 0.45 + lunge * 0.5, 10); onSound?.("splash"); } }
      if (crossed(0.02)) onSound?.("reelOn");
    } else if (phase === "landing") {
      // the last pull, the fish breaking the surface, then lifted close
      const E = near;
      if (age < 0.9) { kappa = 0.42 + 0.08 * Math.sin(age * 18); slack = 0; end = [lerp(E0[0], E[0], ease(age / 0.9)), lerp(E0[1], E[1], ease(age / 0.9))]; spinning = true; }
      else { kappa = 0.3 + 0.05 * Math.sin(age * 3); slack = 0; spinning = age < 2.4; }
      if (crossed(0.85)) { splash(E[0], E[1], 1.5, 46); onSound?.("bigsplash"); }
      if (crossed(0.02)) onSound?.("reelOn");
      if (crossed(2.4)) onSound?.("reelOff");
    } else if (phase === "lost" || phase === "missed") {
      kappa = 0.3 * damp(age, 3.5, 11) * (phase === "lost" ? 1 : 0.4);
      slack = clamp(age / 0.6, 0.2, 1);
      if (crossed(0.02)) { addRipple(E0[0], E0[1], 0.7); if (phase === "lost") onSound?.("reelOff"); }
    } else if (phase === "paused") {
      th = th0 + 0.04; slack = 1;
    }
    if (phase !== "hooked" && phase !== "landing" && info?.prevPhase === "hooked") onSound?.("reelOff");
    prevAge = age;

    reelA += dt * (spinning ? 9 : 0);
    const rod = rodPoints(B, L, th, kappa);
    const tip = rod.pts.at(-1);
    const gs = guidePoints(rod);

    stepBirds(t, dt);
    // things in the water first (behind the rod)
    let fishMouth = null;
    if (phase === "landing" && age >= 0.85 && age < 9) {
      const f = clamp((age - 0.85) / 1.8, 0, 1), close = clamp((age - 2.6) / 1.6, 0, 1);
      const lift = [lerp(near[0], W * 0.5, ease(f)), lerp(near[1], H * 0.44, ease(f)) + Math.sin(age * 2.4) * 6 * k * f];
      const swing = Math.sin(age * 2.1) * 0.12 * (1 - close * 0.5);
      const rot = lerp(Math.PI / 2 + 0.35, Math.PI / 2 - 0.15, ease(f)) + swing;
      const scale = lerp(1, 1.35, ease(close));
      const fade = age > 4.4 ? clamp(1 - (age - 4.4) / 0.8, 0, 1) : 1;
      const len = fishLenPx * lerp(0.6, 1, ease(f)) * scale;
      // place it so the mouth hangs on the line
      const s = fishImg ? len / (fishImg.naturalWidth * 0.9) : 1;
      const mxL = fishImg ? -fishImg.naturalWidth * 0.44 * s : 0, myL = fishImg ? fishImg.naturalHeight * 0.04 * s : 0;
      const cx = lift[0] - (mxL * Math.cos(rot) - myL * Math.sin(rot)), cy = lift[1] - (mxL * Math.sin(rot) + myL * Math.cos(rot));
      const amp = (age < 2.6 ? 1.1 : 0.55) * (0.6 + 0.4 * Math.abs(Math.sin(age * 1.3)));
      fishMouth = drawFish(cx, cy, rot, len, age * 13, amp, fade);
      if (fishMouth && fade > 0) {
        end = [fishMouth[0], fishMouth[1]];
        if (t > nextDrip && f > 0.1 && age < 4.4) {
          nextDrip = t + 0.05;
          const u = Math.random();
          const bx = cx + Math.cos(rot) * (u - 0.5) * len * 0.9, by = cy + Math.sin(rot) * (u - 0.5) * len * 0.9;
          particles.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 30 * k, vy: 20 * k, life: 0, max: 0.9, r: (0.8 + Math.random() * 1.6) * k, kind: "drop", floor: near[1] });
        }
      }
      if (!fishMouth && age < 2.6) end = lift;
      if (!fishCut && crossed(1.2)) splash(near[0], near[1], 0.8, 18);
    }
    // a gentle ring now and then where the line goes in
    if (showLine && (phase === "waiting" || phase === "bite") && Math.random() < dt * 0.35) addRipple(E0[0], E0[1], 0.25);
    let lineEnd = end;
    if (floatRig && showLine && !lead && phase !== "hooked" && phase !== "landing") lineEnd = drawFloat(E0[0], E0[1], floatDip, t);
    if (lead) {
      ctx.fillStyle = "rgba(30,34,38,0.9)"; ctx.beginPath(); ctx.arc(lead[0], lead[1], Math.max(1.2, 3.2 * k * lead[2]), 0, TAU); ctx.fill();
    }
    stepParticles(dt);
    drawParticles();

    // the rod, reel and line
    const seat = drawRod(rod);
    drawGuides(gs);
    const spoolExit = drawReel(seat, rod.ang[9], reelA);
    if (phase !== "ended") drawLineThroughRod(spoolExit, gs, tip);
    if (showLine) drawLineOut(tip, lineEnd, slack, t);
    drawTipLight(tip);
    drawRain(dt);

    // ripple list for the water shader (ref coords, age in seconds)
    ripples = ripples.filter((r) => t - r.born < 5);
    const out = ripples.map((r) => ({ x: r.x, y: r.y, age: t - r.born, s: r.s }));
    if (showLine && phase === "hooked") { const [rx, ry] = toRef(end[0], end[1]); out.push({ x: rx, y: ry, age: (t * 0.9) % 1.6, s: 0.5 }); }
    if (showLine && floatRig && phase !== "hooked") { const [rx, ry] = toRef(E0[0], E0[1]); out.push({ x: rx, y: ry, age: (t * 0.6) % 3, s: 0.18 + floatDip * 0.6 }); }
    return out;
  }

  return {
    resize(w, h, dpr = 1) {
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      W = canvas.width; H = canvas.height;
      k = Math.min(W, H * 1.5) / 760;
      streaks = [];
    },
    setLayout({ cast, horizon: hz, map: mp }) { if (cast) castRef = cast; if (hz != null) horizon = hz; if (mp) map = mp; },
    setEnv({ night: n, wind, windDir: wd, rain: r, floatRig: f, quality: q, dusk: dk }) {
      if (dk != null) dusk = dk;
      if (n != null) night = n; if (wind != null) windN = wind; if (wd != null) windDir = wd; if (r != null) rain = r; if (f != null) floatRig = f; if (q != null) quality = q;
    },
    /** The species picture (a cut-out when FishDock has one) and the length to draw it at, in stage pixels. */
    setFish(img, cutout, lengthFrac) { fishImg = img; fishCut = !!cutout; fishLenPx = lengthFrac * Math.min(W, H * 1.6); },
    splashAt(refPt, size = 1) { const [x, y] = toStage(refPt); splash(x, y, size); },
    frame,
    stageOf: toStage,
  };
}
