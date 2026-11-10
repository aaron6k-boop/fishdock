// ---- textures3d: surfaces for the real places, drawn on this phone (no downloads) ----
// Weathered concrete for decks and promenades, steel sheet piling for harbour walls (the brown corrugated faces under
// a concrete cap, as at Gorleston), brick and painted render for buildings with sash windows and doors, slate and
// clay roofs, corrugated cladding for warehouses. Each is a colour map, and where it matters a normal map and a
// roughness map, so light catches the joints, the corrugations and the wet patches rather than a flat picture.
import * as THREE from "three";

// ---- value noise (repeatable, tiles at `period`) ----
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function noise2(x, y, period = 256, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const P = (a) => ((a % period) + period) % period;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(P(xi), P(yi), seed), b = hash(P(xi + 1), P(yi), seed), c = hash(P(xi), P(yi + 1), seed), d = hash(P(xi + 1), P(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, period, seed = 1, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += a * noise2(x * f, y * f, period * f, seed + o); n += a; a *= 0.5; f *= 2; } return s / n; }

const smoothstep01 = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
function canvas(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// a normal map from a height field (Sobel), strength in "pixels of height per pixel"
function normalFrom(hf, w, h, strength = 2) {
  const c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), at = (x, y) => hf[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), k = (y * w + x) * 4;
    img.data[k] = (-dx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); return toTex(c, { srgb: false });
}
function greyTex(vals, w, h) { const c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, vals[i] * 255)); img.data.set([v, v, v, 255], i * 4); } g.putImageData(img, 0, 0); return toTex(c, { srgb: false }); }

// ---- weathered concrete: one tile covers 8 m; faint expansion joints every 4 m, aggregate, stains and hairline cracks ----
export function concrete({ size = 256, seed = 3, tint = [196, 186, 166], joints = true } = {}) { // sun-bleached, warm pale concrete (as Gorleston's deck)
  const n = size, col = canvas(n), g = col.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n), rough = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const stain = fbm(u * 6, v * 6, 6, seed, 4), blotch = fbm(u * 2, v * 2, 2, seed + 9, 2);
    const grit = hash(x, y, seed), pit = 0; // (no pock marks: at this scale they read as a pattern of holes)
    // joints: a shallow groove every half tile, slightly wavy so it doesn't read as a drawn grid
    const jx = Math.abs(((u * 2 + noise2(v * 4, 0.5, 4, seed + 4) * 0.004) % 1 + 1) % 1 - 0.5), jy = Math.abs(((v * 2 + noise2(u * 4, 0.3, 4, seed + 5) * 0.004) % 1 + 1) % 1 - 0.5);
    const joint = joints ? Math.max(0, 1 - Math.min(jx, jy) * n / 1.6) * (Math.min(jx, jy) > 0.48 ? 1 : 0) : 0; // (joints: false where the deck's shader draws its own, square to the pier)
    const crack = Math.abs(fbm(u * 3, v * 3, 3, seed + 7, 3) - 0.5) < 0.008 && noise2(u * 1.5, v * 1.5, 1.5, seed + 8) > 0.55 ? 1 : 0;
    let L = 0.9 + (stain - 0.5) * 0.28 + (blotch - 0.5) * 0.18 + (grit - 0.5) * 0.06 - pit * 0.18 - joint * 0.2 - crack * 0.07;
    const warm = (blotch - 0.5) * 10;
    img.data.set([tint[0] * L + warm, tint[1] * L + warm * 0.6, tint[2] * L, 255], i * 4);
    hf[i] = grit * 0.05 + stain * 0.25 - joint * 1.2 - crack * 0.1 - pit * 0.4; // smooth, worn concrete: the joints and cracks catch the light, not a gritty bump everywhere
    rough[i] = 0.82 + (stain - 0.5) * 0.25 + joint * 0.1;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(col), normalMap: normalFrom(hf, n, n, 1.2), roughnessMap: greyTex(rough, n, n) };
}

// ---- steel sheet piling under a concrete cap: one tile = 4 pans (about 2.4 m) wide and the wall's full height ----
// v: 0 at the bottom (below the water) to 1 at the top of the cap. The cap is the top 11%; under it rust, streaks,
// a dark wet band and weed round the waterline (v about 0.45 to 0.55)
export function sheetPiling({ w = 128, h = 256, seed = 5, water = 0.5 } = {}) {
  const col = canvas(w, h), g = col.getContext("2d"), img = g.createImageData(w, h), hf = new Float32Array(w * h), rough = new Float32Array(w * h);
  const cap = 0.89;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = 1 - y / h, i = y * w + x;
    const pan = (u * 4) % 1, prof = pan < 0.12 ? pan / 0.12 : pan < 0.5 ? 1 : pan < 0.62 ? 1 - (pan - 0.5) / 0.12 : 0; // trapezoid corrugation
    let r, gg, b, hh, ro;
    if (v > cap) { // the concrete cap, its lower edge stained
      const c = 0.86 + (fbm(u * 8, v * 8, 8, seed + 3, 3) - 0.5) * 0.25 - (v < cap + 0.02 ? 0.25 : 0);
      r = 168 * c; gg = 164 * c; b = 156 * c; hh = 0.5 + (v < cap + 0.01 ? -0.6 : 0); ro = 0.9;
    } else {
      const streak = fbm(u * 24, v * 2, 24, seed, 2), rust = fbm(u * 6, v * 6, 6, seed + 1, 3);
      const wet = Math.max(0, 1 - Math.abs(v - water) / 0.12), weed = v < water + 0.04 ? Math.min(1, (water + 0.04 - v) / 0.08) : 0;
      const shade = 0.72 + prof * 0.28;
      r = (110 + rust * 60 - streak * 25) * shade; gg = (66 + rust * 28 - streak * 12) * shade; b = (44 + rust * 12) * shade;
      r = r * (1 - wet * 0.45) * (1 - weed) + 46 * weed; gg = gg * (1 - wet * 0.4) * (1 - weed) + 54 * weed; b = b * (1 - wet * 0.35) * (1 - weed) + 34 * weed;
      hh = prof; ro = 0.55 + rust * 0.3 - wet * 0.35;
    }
    img.data.set([r, gg, b, 255], i * 4); hf[i] = hh; rough[i] = ro;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(col), normalMap: normalFrom(hf, w, h, 3.5), roughnessMap: greyTex(rough, w, h) };
}

// ---- facades: an atlas of five bays, each one storey (3 m) high and one bay (3.2 m) wide, 256 px a bay ----
// [0] a sash window, [1] a front door with a fanlight, [2] a shop front, [3] plain wall, [4] a wider three-light
// window with a stone surround. Besides the colour: a height field (window reveals set back into the wall, frames
// and sills standing proud, lintels, the brick courses, a downpipe) turned into a normal map, so the sun gives the
// facade depth; a roughness map, so the glass mirrors the sky while the wall stays matt; and the pane areas in an
// emissive map, so windows glow after dark. Weathering: rain runs down from the sills, dirt collects at the foot.
export const FACADE_TILE = { window: 0, door: 1, shop: 2, plain: 3, window2: 4 };
export const FACADE_N = 5;
export function facade(kind = "brick", seed = 7) {
  const T = 256, N = FACADE_N, W = T * N, c = canvas(W, T), g = c.getContext("2d"), e = canvas(W, T), ge = e.getContext("2d");
  ge.fillStyle = "#000"; ge.fillRect(0, 0, W, T);
  const px = T / 3.0; // pixels a metre (the storey is 3 m)
  const hf = new Float32Array(W * T), rough = new Float32Array(W * T), glassM = new Uint8Array(W * T);
  const base = kind === "brick" ? [152, 82, 60] : kind === "cladding" ? [116, 128, 120] : kind === "stone" ? [178, 170, 152] : [236, 230, 216];
  const wallRough = kind === "brick" ? 0.88 : kind === "cladding" ? 0.55 : kind === "stone" ? 0.8 : 0.74;
  // ---- the wall itself, every tile ----
  for (let t = 0; t < N; t++) {
    const x0 = t * T, img = g.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * W + x0 + x;
      let L = 0.95 + (fbm((x0 + x) / 80, y / 80, W / 80, seed, 2) - 0.5) * (kind === "render" ? 0.07 : 0.16), h = 0, ro = wallRough;
      if (kind === "brick") {
        // real brick coursing: 65 mm bricks, 10 mm beds, 215 mm long, stretcher bond; each brick its own tone and a
        // little of its own face colour (some darker, a few blue-black headers as in Norfolk red brick)
        const course = 0.075 * px, row = Math.floor(y / course), off = row % 2 ? 0.1125 * px : 0, bl = 0.225 * px;
        const fy = (y % course) / course, fx = (((x + off) % bl) + bl) % bl / bl, mortar = fy < 0.13 || fx < 0.045;
        const bi = Math.floor((x + off) / bl), bh = hash(bi, row, seed), dark = hash(bi, row, seed + 2) > 0.93;
        if (mortar) { L *= 1.28; ro = 0.95; h = -0.5; } else { L *= (0.82 + bh * 0.3) * (dark ? 0.62 : 1); h = 0.4 + hash(x >> 1, y >> 1, seed + 4) * 0.1; }
        if (dark && !mortar) { L *= 1; }
      } else if (kind === "stone") {
        const course = 0.32 * px, row = Math.floor(y / course), off = row % 2 ? 0.3 * px : 0, bl = 0.62 * px;
        const fy = (y % course) / course, fx = (((x + off) % bl) + bl) % bl / bl, joint = fy < 0.05 || fx < 0.03;
        L *= joint ? 0.8 : 0.94 + hash(Math.floor((x + off) / bl), row, seed) * 0.12; h = joint ? -0.4 : 0.3 + fbm(x / 9, y / 9, T / 9, seed + 6, 2) * 0.3;
      } else if (kind === "cladding") {
        const p = ((x % (0.15 * px)) / (0.15 * px)); L *= p < 0.25 ? 0.78 : 1.02; h = p < 0.25 ? -0.5 : 0.5; ro = 0.5 + p * 0.1;
      } else { // painted render: smooth, a little uneven, faint trowel sweeps
        L *= 0.98 + hash(x >> 2, y >> 2, seed) * 0.03 + (fbm(x / 14, y / 30, T / 14, seed + 8, 2) - 0.5) * 0.05; h = fbm(x / 6, y / 6, T / 6, seed + 9, 2) * 0.25;
      }
      // weathering: rain streaks down the wall (more towards the foot of each storey), dirt splashed up at the bottom,
      // and a green-grey damp tide along the base course
      const streak = smoothstep01((fbm((x0 + x) / 5, y / 90, W / 5, seed + 21, 2) - 0.5) * 4) * (kind === "render" ? 0.05 : 0.1) * (0.3 + y / T); // (painted render is repainted and stays cleaner than brick)
      const foot = y > T * 0.86 ? (y - T * 0.86) / (T * 0.14) : 0;
      L *= 1 - streak - foot * 0.1;
      const r = base[0] * L, gg = base[1] * L * (1 - foot * 0.04), b = base[2] * L;
      img.data.set([Math.min(255, r), Math.min(255, gg), Math.min(255, b), 255], (y * T + x) * 4);
      hf[i] = h; rough[i] = ro + streak * 0.3;
    }
    g.putImageData(img, x0, 0);
  }
  // ---- drawing helpers that keep the height and roughness fields in step with the colour ----
  const fillH = (x, y, w, h, colour, height, ro, glass = false) => {
    g.fillStyle = colour; g.fillRect(x, y, w, h);
    const X0 = Math.max(0, Math.round(x)), Y0 = Math.max(0, Math.round(y)), X1 = Math.min(W, Math.round(x + w)), Y1 = Math.min(T, Math.round(y + h));
    for (let yy = Y0; yy < Y1; yy++) for (let xx = X0; xx < X1; xx++) { const i = yy * W + xx; hf[i] = height; rough[i] = ro; glassM[i] = glass ? 1 : 0; }
    if (glass) { ge.fillStyle = "#fff"; ge.fillRect(x, y, w, h); }
  };
  const trim = kind === "brick" ? "#ece6d8" : kind === "cladding" ? "#5d6a63" : kind === "stone" ? "#e9e4d6" : "#fbfaf6";
  const trimRo = 0.45;
  // glass: a dark room behind it, the sky's gradient over it, a hint of curtain at the sides, the frame's shadow at the top
  const glass = (x, y, w, h) => {
    fillH(x, y, w, h, "#232d36", -1.6, 0.1, true);
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, "rgba(150,178,205,.5)"); gr.addColorStop(0.45, "rgba(90,110,130,.18)"); gr.addColorStop(1, "rgba(40,52,64,.1)"); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x, y, w, 3); g.fillRect(x, y, 2, h); // the reveal's shadow, top and left
    const cw = w * 0.16; g.fillStyle = "rgba(225,220,205,.22)"; g.fillRect(x + 2, y + 3, cw, h - 5); g.fillRect(x + w - cw - 2, y + 3, cw, h - 5); // curtains
  };
  // ---- the bays ----
  for (let t = 0; t < N; t++) {
    const x0 = t * T;
    if ((t === FACADE_TILE.window || t === FACADE_TILE.window2) && kind !== "cladding") {
      const wide = t === FACADE_TILE.window2;
      const w = (wide ? 1.7 : 1.05) * px, h = 1.55 * px, x = x0 + (T - w) / 2, y = 0.55 * px;
      // the reveal: the opening set 0.1 m back into the wall; its frame standing a little proud of the glass
      fillH(x - 0.1 * px, y - 0.1 * px, w + 0.2 * px, h + 0.14 * px, kind === "render" ? "#e4ded0" : trim, -1.2, 0.6); // the reveal's sides and head
      fillH(x - 0.05 * px, y - 0.05 * px, w + 0.1 * px, h + 0.08 * px, trim, -0.8, trimRo); // the box frame
      glass(x, y, w, h);
      // sash bars and the meeting rail, proud of the glass
      fillH(x, y + h * 0.47, w, 0.06 * px, trim, -0.7, trimRo);
      if (wide) { for (const f of [1 / 3, 2 / 3]) fillH(x + w * f - 0.04 * px, y, 0.08 * px, h, trim, -0.7, trimRo); }
      else fillH(x + w / 2 - 0.02 * px, y, 0.04 * px, h * 0.47, trim, -0.75, trimRo);
      // the sill: a stone or painted ledge standing out from the wall, with grime run off its ends and under it
      const sillC = kind === "brick" ? "#d6d0c2" : kind === "stone" ? "#dcd6c8" : "#e6e1d6";
      fillH(x - 0.12 * px, y + h + 0.04 * px, w + 0.24 * px, 0.11 * px, sillC, 1.4, 0.7);
      g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x - 0.12 * px, y + h + 0.15 * px, w + 0.24 * px, 3); // its shadow line
      const run = g.createLinearGradient(0, y + h + 0.17 * px, 0, y + h + 0.5 * px); run.addColorStop(0, "rgba(40,36,30,.26)"); run.addColorStop(1, "rgba(40,36,30,0)");
      g.fillStyle = run; g.fillRect(x - 0.12 * px, y + h + 0.17 * px, 0.07 * px, 0.33 * px); g.fillRect(x + w + 0.05 * px, y + h + 0.17 * px, 0.07 * px, 0.33 * px); g.fillRect(x + 0.05 * px, y + h + 0.17 * px, w - 0.1 * px, 0.12 * px);
      // over the head: a brick soldier arch on brick, a stone lintel on render and stone
      if (kind === "brick") { for (let k = 0; k < 9; k++) fillH(x - 0.1 * px + (k * (w + 0.2 * px)) / 9, y - 0.3 * px, (w + 0.2 * px) / 9 - 1.5, 0.2 * px, k % 2 ? "#8e4a39" : "#9a5242", 0.5, 0.88); }
      else fillH(x - 0.14 * px, y - 0.3 * px, w + 0.28 * px, 0.2 * px, kind === "stone" ? "#e2dccd" : "#eee9dd", 1.2, 0.7);
    } else if (t === FACADE_TILE.window || t === FACADE_TILE.window2) {
      glass(x0 + T * 0.3, T * 0.35, T * 0.4, T * 0.18);
    }
    if (t === FACADE_TILE.door) {
      const w = 0.95 * px, h = 2.1 * px, x = x0 + (T - w) / 2, y = T - h - 0.04 * px;
      fillH(x - 0.12 * px, y - 0.42 * px, w + 0.24 * px, h + 0.46 * px, kind === "render" ? "#e4ded0" : trim, -1.4, 0.6); // the reveal (deeper than a window's)
      fillH(x - 0.06 * px, y - 0.36 * px, w + 0.12 * px, h + 0.4 * px, trim, -1.0, trimRo); // the door case
      glass(x + 0.02 * px, y - 0.3 * px, w - 0.04 * px, 0.22 * px); // fanlight
      const doorCol = ["#1f3a5f", "#5b1f24", "#23402e", "#2b2b2b", "#6b1d1d", "#1c2e23"][seed % 6];
      fillH(x, y, w, h, doorCol, -1.3, 0.35);
      // panels, a letter plate, a brass knob, a step
      g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x + 0.1 * px, y + 0.15 * px, w - 0.2 * px, h * 0.36); g.fillRect(x + 0.1 * px, y + h * 0.55, w - 0.2 * px, h * 0.38);
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + 0.1 * px, y + 0.15 * px, w - 0.2 * px, 2); g.fillRect(x + 0.1 * px, y + h * 0.55, w - 0.2 * px, 2);
      g.fillStyle = "#c8a24a"; g.fillRect(x + w - 0.16 * px, y + h * 0.5, 0.05 * px, 0.05 * px); g.fillRect(x + w * 0.35, y + h * 0.46, w * 0.3, 0.035 * px);
      fillH(x - 0.1 * px, T - 0.08 * px, w + 0.2 * px, 0.08 * px, "#bdb8ad", 0.8, 0.85);
      // a number plate and a bell: small, but the eye reads them as a lived-in door
      g.fillStyle = "#f2f0ea"; g.fillRect(x + w - 0.3 * px, y - 0.6 * px, 0.2 * px, 0.14 * px);
    }
    if (t === FACADE_TILE.shop) {
      const y = 0.5 * px; const fasciaC = ["#1f3a5f", "#5b1f24", "#23402e", "#3d3d46", "#2a4a3a", "#4a2a2a"][(seed + 1) % 6];
      fillH(x0, y - 0.5 * px, T, 0.5 * px, fasciaC, 0.6, 0.5); // the fascia, standing proud
      g.fillStyle = "rgba(255,255,255,.75)"; for (let k = 0; k < 4; k++) g.fillRect(x0 + 0.5 * px + k * 0.55 * px, y - 0.33 * px, 0.4 * px, 0.14 * px); // lettering, unreadable at this size
      g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x0, y - 0.03 * px, T, 0.03 * px);
      fillH(x0 + 0.1 * px, y, T - 0.2 * px, 2.1 * px, trim, -0.6, trimRo); // the shop front's frame
      glass(x0 + 0.16 * px, y + 0.06 * px, T - 0.32 * px, 1.95 * px);
      fillH(x0 + T / 2 - 0.03 * px, y + 0.06 * px, 0.06 * px, 1.95 * px, trim, -0.5, trimRo); // mullion
      fillH(x0 + 0.1 * px, y + 2.1 * px, T - 0.2 * px, 0.4 * px, kind === "brick" ? "#5a4a44" : "#4a4c50", 0.2, 0.7); // the stall riser
      fillH(x0, y - 0.5 * px, 0.1 * px, 2.6 * px, trim, 0.9, 0.6); fillH(x0 + T - 0.1 * px, y - 0.5 * px, 0.1 * px, 2.6 * px, trim, 0.9, 0.6); // pilasters
    }
    if (t === FACADE_TILE.plain) {
      // a downpipe down the right edge of the bay, with its bracket and the damp streak behind it; an air brick low
      const pxp = x0 + T - 0.18 * px;
      g.fillStyle = "rgba(30,30,28,.14)"; g.fillRect(pxp - 0.05 * px, 0, 0.16 * px, T);
      fillH(pxp, 0, 0.065 * px, T, kind === "brick" ? "#3a3634" : "#2e2e30", 1.6, 0.4);
      g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(pxp + 0.01 * px, 0, 0.015 * px, T); // its highlight
      for (const yy of [0.4 * px, 2.2 * px]) fillH(pxp - 0.02 * px, yy, 0.105 * px, 0.06 * px, "#3a3634", 1.9, 0.4);
      fillH(x0 + 0.9 * px, T - 0.5 * px, 0.22 * px, 0.15 * px, kind === "brick" ? "#9a5b4a" : "#8a8a86", -0.3, 0.9); // air brick
      for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(x0 + 0.92 * px, T - 0.48 * px + k * 0.045 * px, 0.18 * px, 1.5); }
    }
    if (kind === "cladding" && t === FACADE_TILE.door) { fillH(x0 + 0.3 * px, T * 0.2, T - 0.6 * px, T * 0.8, "#6e7670", -0.4, 0.5); for (let k = 0; k < 20; k++) { g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(x0 + 0.3 * px, T * 0.2 + k * 10, T - 0.6 * px, 2); } }
  }
  return { map: toTex(c), emissiveMap: toTex(e), normalMap: normalFrom(hf, W, T, 1.1), roughnessMap: greyTex(rough, W, T) };
}

// ---- roofs: slate (grey-blue), clay pantiles (red-brown) or felt; one tile = 3 m square ----
// Slates 0.5 m by 0.25 m in overlapping courses, each its own tone and a slight twist; pantiles 0.34 m wide with
// their S-profile, courses of 0.3 m; moss in the shaded laps, lichen spots, a grey-green bloom along the lower
// edges where the damp holds. Height fields for both, so the sun rakes across the courses.
export function roof(kind = "slate", seed = 11) {
  const n = 256, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n), rough = new Float32Array(n * n);
  const base = kind === "slate" ? [76, 82, 90] : kind === "felt" ? [62, 62, 60] : [152, 74, 50];
  const px = n / 3;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let L = 1, h = 0, ro = kind === "slate" ? 0.55 : 0.85, mossK = 0;
    if (kind === "felt") { L = 0.9 + hash(x, y, seed) * 0.15 + (fbm(x / 40, y / 40, n / 40, seed, 2) - 0.5) * 0.1; h = hash(x, y, seed) * 0.1; }
    else if (kind === "slate") {
      const course = 0.25 * px, row = Math.floor(y / course), off = row % 2 ? 0.25 * px : 0, sw = 0.5 * px;
      const fy = (y % course) / course, fx = ((((x + off) % sw) + sw) % sw) / sw, si = Math.floor((x + off) / sw);
      const tone = 0.84 + hash(si, row, seed) * 0.32, twist = (hash(si, row, seed + 1) - 0.5) * 0.08 * fx;
      const lap = fy < 0.1 ? 0.55 + fy * 4 : 1, gap = fx < 0.03 ? 0.6 : 1; // the shadow of the course above; the thin gap between slates
      L = tone * lap * gap + twist; h = (1 - fy) * 0.8 * gap; mossK = fy < 0.2 && fbm(x / 30, y / 30, n / 30, seed + 2, 2) > 0.62 ? 0.5 : 0;
      ro = 0.5 + hash(si, row, seed + 3) * 0.2 + (fy < 0.1 ? 0.2 : 0);
    } else {
      const course = 0.3 * px, row = Math.floor(y / course), tw = 0.34 * px, off = row % 2 ? tw * 0.5 : 0;
      const fy = (y % course) / course, fx = ((((x + off) % tw) + tw) % tw) / tw, ti = Math.floor((x + off) / tw);
      const prof = Math.sin(fx * Math.PI * 2 - 0.6) * 0.5 + 0.5; // the pantile's S: a roll and a pan
      const tone = 0.82 + hash(ti, row, seed) * 0.36, shade = 0.78 + prof * 0.3, lap = fy < 0.12 ? 0.5 + fy * 4 : 1;
      L = tone * shade * lap; h = prof * 0.9 + (1 - fy) * 0.4; mossK = (prof < 0.3 || fy < 0.15) && fbm(x / 26, y / 26, n / 26, seed + 2, 2) > 0.6 ? 0.6 : 0;
      ro = 0.8 + prof * 0.1;
    }
    const weather = 0.92 + fbm(x / 60, y / 100, n / 60, seed + 5, 2) * 0.16; // broad patches of paler and darker
    const lich = kind !== "felt" && hash(x >> 1, y >> 1, seed + 3) > 0.988 ? 0.3 : 0;
    L = L * weather + lich;
    const i = y * n + x, m = mossK;
    img.data.set([Math.min(255, base[0] * L * (1 - m) + 74 * m), Math.min(255, base[1] * L * (1 - m) + 88 * m), Math.min(255, base[2] * L * (1 - m) + 42 * m), 255], i * 4);
    hf[i] = h; rough[i] = ro + m * 0.1;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 2.2), roughnessMap: greyTex(rough, n, n) };
}

// ---- a ground detail map with no joints (sand, grass, gravel: the colour comes from the ground's vertex colours) ----
export function detail(seed = 13) {
  const n = 128, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 0.86 + fbm(x / 16, y / 16, 8, seed, 3) * 0.2 + (hash(x, y, seed) - 0.5) * 0.1; img.data.set([255 * v, 255 * v, 255 * v, 255], (y * n + x) * 4); hf[y * n + x] = hash(x, y, seed); }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 0.8) };
}

// ---- plain brickwork that repeats (towers, chimneys): one tile = 8 courses by 4 bricks ----
export function bricks(seed = 17, base = [150, 70, 52]) {
  const n = 128, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const row = Math.floor(y / 16), off = row % 2 ? 16 : 0, mortar = y % 16 < 2 || (x + off) % 32 < 2;
    const L = mortar ? 1.45 : 0.86 + hash(Math.floor((x + off) / 32), row, seed) * 0.26 + (fbm(x / 20, y / 20, 6.4, seed, 2) - 0.5) * 0.15;
    img.data.set([Math.min(255, base[0] * L), Math.min(255, base[1] * L), Math.min(255, base[2] * L), 255], (y * n + x) * 4); hf[y * n + x] = mortar ? 0 : 1;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 1.5) };
}

// ---- asphalt: one tile covers 6 m. Aggregate (the stone chips in the bitumen, paler where traffic has worn the
// binder off them), a soft unevenness in the tone, hairline cracks that wander and branch, a repair or two (a patch
// of darker, newer tarmac with a slightly raised edge). Colour, relief and roughness (the worn stone smoother than the
// binder round it). Tiling is broken by the material's own large-scale mottle (weather()), not here. ----
export function asphalt({ size = 512, seed = 23, tint = [122, 122, 118] } = {}) {
  const n = size, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n), ro = new Float32Array(n * n);
  let st = seed * 2654435761 >>> 0; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  // repairs: one or two patches a tile, darker and slightly raised (their position hashed by seed)
  const patches = []; for (let k = 0; k < 2; k++) if (rnd() < 0.7) patches.push([rnd() * n, rnd() * n, (0.12 + rnd() * 0.2) * n, (0.08 + rnd() * 0.15) * n]);
  const inPatch = (x, y) => { let v = 0; for (const [px, py, pw, ph] of patches) { const dx = Math.abs(((x - px + n * 1.5) % n) - n / 2) - pw / 2, dy = Math.abs(((y - py + n * 1.5) % n) - n / 2) - ph / 2; const d = Math.max(dx, dy); v = Math.max(v, 1 - Math.max(0, Math.min(1, (d + 3) / 4))); } return v; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = y * n + x;
    const agg = hash(x, y, seed), agg2 = hash(x >> 1, y >> 1, seed + 1), tone = fbm(x / 64, y / 64, n / 64, seed + 2, 3), wear = fbm(x / 160, y / 160, n / 160, seed + 3, 2);
    // a chip shows pale where the binder is worn: more of them where the wear noise is high (wheel tracks, roughly)
    const chip = agg2 > 0.72 && agg > 0.35 ? 0.35 + 0.45 * Math.max(0, wear - 0.35) * 2 : 0;
    const patch = inPatch(x, y);
    let L = 0.8 + (tone - 0.5) * 0.3 + (agg - 0.5) * 0.18 + chip;
    L = L * (1 - patch * 0.16); // (a repair is darker: newer bitumen)
    img.data.set([Math.min(255, tint[0] * L), Math.min(255, tint[1] * L), Math.min(255, tint[2] * L * 0.98), 255], k * 4);
    hf[k] = 0.5 + (agg - 0.5) * 0.25 + (chip ? 0.12 : 0) + patch * 0.08; ro[k] = 0.9 - chip * 0.35 - patch * 0.08 + (agg - 0.5) * 0.08;
  }
  // cracks: wandering dark lines, a branch or two, darker and lower
  const crack = (x, y, a, len, w) => { for (let i = 0; i < len; i++) { a += (rnd() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a); const xi = ((Math.round(x) % n) + n) % n, yi = ((Math.round(y) % n) + n) % n; for (let d = -w; d <= w; d++) for (let e = -w; e <= w; e++) { const q = (((yi + e) % n + n) % n) * n + ((xi + d) % n + n) % n, f = 1 - Math.hypot(d, e) / (w + 1); if (f <= 0) continue; img.data[q * 4] *= 1 - 0.32 * f; img.data[q * 4 + 1] *= 1 - 0.32 * f; img.data[q * 4 + 2] *= 1 - 0.32 * f; hf[q] -= 0.15 * f; } if (i > 20 && rnd() < 0.015) crack(x, y, a + (rnd() < 0.5 ? 0.9 : -0.9), len * 0.4, Math.max(1, w - 1)); } };
  for (let k = 0; k < 3; k++) crack(rnd() * n, rnd() * n, rnd() * Math.PI * 2, 100 + rnd() * 180, 1);
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 1.6), roughnessMap: greyTex(ro, n, n) };
}

// ---- turf: one tile covers 2 m. Short grass as a fine grain of blades (strokes a little lighter and darker than the
// ground), worn patches where the grass thins to earth, clover and daisies as the odd speck; the blades' relief for
// the normal map. Drawn near mid-grey so the ground's own tint (vertex colour) decides the green. ----
export function turf({ size = 256, seed = 29 } = {}) {
  const n = size, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n);
  let st = seed * 2654435761 >>> 0; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = y * n + x, wear = fbm(x / 90, y / 90, n / 90, seed, 3), fine = fbm(x / 6, y / 6, n / 6, seed + 1, 2), grain = hash(x, y, seed + 2);
    const bare = Math.max(0, Math.min(1, (wear - 0.62) * 5)); // (earth showing through)
    let L = 0.48 + (fine - 0.5) * 0.3 + (grain - 0.5) * 0.22;
    // colour: the tint comes later; here a touch of yellow in the lit blades and brown in the bare patches
    let r = L * (1 + bare * 0.35), gg = L * (1 - bare * 0.15), b = L * (0.9 - bare * 0.25);
    img.data.set([Math.min(255, r * 255), Math.min(255, gg * 255), Math.min(255, b * 255), 255], k * 4);
    hf[k] = 0.5 + (fine - 0.5) * 0.3 + (grain - 0.5) * 0.3 - bare * 0.15;
  }
  // blades: short strokes
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 2600; i++) { const x = rnd() * n, y = rnd() * n, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, L = 3 + rnd() * 6, lit = rnd() < 0.5; g.strokeStyle = lit ? "rgba(170,180,120,0.45)" : "rgba(60,70,40,0.45)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); for (let t = 0; t < L; t++) { const q = (((y + Math.sin(a) * t) | 0) % n + n) % n * n + (((x + Math.cos(a) * t) | 0) % n + n) % n; hf[q] += lit ? 0.08 : -0.05; } }
  // the odd daisy and clover leaf
  for (let i = 0; i < 40; i++) { const x = rnd() * n, y = rnd() * n; g.fillStyle = rnd() < 0.4 ? "rgba(235,235,225,0.9)" : "rgba(70,110,60,0.8)"; g.beginPath(); g.arc(x, y, 1 + rnd() * 1.2, 0, Math.PI * 2); g.fill(); }
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 1.2) };
}

// ---- photographed surfaces (public/textures/, Poly Haven CC0, cut down by source-assets/prepare_textures.py) ----
// Loaded once each and shared; a material that uses one shows its drawn look until it has arrived (or if it can't).
export const TEX_BASE = ((typeof window !== "undefined" && window.__fdAssetBase) || "") + "/textures/";
const photos = new Map();
export function photoTex(name, { srgb = true } = {}) {
  if (typeof document === "undefined") return null;
  if (!photos.has(name)) {
    const t = new THREE.TextureLoader().load(TEX_BASE + name + ".jpg");
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    photos.set(name, t);
  }
  return photos.get(name);
}

// ---- weathering noise: one small tiling texture every weathered material shares ----
// r: fine mottle (zinc spangle, grain in paint), g: soft blotches (patina, dirt, damp), b: streaks running down
// (stretched tall: rain and rust runs)
let weatherNoise = null;
export function weatherTex() {
  if (weatherNoise || typeof document === "undefined") return weatherNoise;
  const n = 256, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n;
    const r = fbm(u * 32, v * 32, 32, 41, 3) * 0.75 + hash(x, y, 43) * 0.25;
    const gg = fbm(u * 5, v * 5, 5, 45, 4);
    const b = fbm(u * 48, v * 3, 48, 47, 3) * 0.7 + fbm(u * 96, v * 6, 96, 49, 2) * 0.3;
    img.data.set([r * 255, gg * 255, b * 255, 255], (y * n + x) * 4);
  }
  g.putImageData(img, 0, 0);
  return (weatherNoise = toTex(c, { srgb: false }));
}

// ---- weathered timber: silvered grain with dark open cracks along it, one tile = 1 m along the grain by 0.25 m ----
// grey-brown, multiplied over the material's colour; a = 1 (the grain's height comes from its brightness)
let woodTexC = null;
export function woodTex() {
  if (woodTexC || typeof document === "undefined") return woodTexC;
  const w = 256, h = 128, c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const warp = fbm(u * 2, v * 4, 2, 51, 3) * 2.2 + noise2(u * 8, v * 2, 8, 52) * 0.25;
    const ring = 0.5 + 0.5 * Math.sin((v * 26 + warp * 3) * Math.PI); // the growth rings, seen as lines along the board
    const fine = hash(x >> 1, y, 53) * 0.5 + fbm(u * 64, v * 2, 64, 54, 2) * 0.5; // fibres
    const crack = Math.abs(fbm(u * 3, v * 9, 3, 55, 3) - 0.5) < 0.012 && noise2(u * 4, v * 2, 4, 56) > 0.5 ? 1 : 0;
    const silver = fbm(u * 3, v * 3, 3, 57, 3); // weathered silver-grey patches, browner where the boards keep damp
    let L = 0.78 + ring * 0.14 + (fine - 0.5) * 0.16 - crack * 0.45;
    const warm = (0.5 - silver) * 26;
    img.data.set([Math.min(255, 196 * L + warm), Math.min(255, 188 * L + warm * 0.5), Math.min(255, 176 * L - warm * 0.2), 255], (y * w + x) * 4);
  }
  g.putImageData(img, 0, 0);
  return (woodTexC = toTex(c));
}

// ---- weather(material, options): age a material in its own shader, without a uv map ----
// The surface is sampled by position (world space, or for wood the object's own axes times its instance scale, so a
// stretched rail keeps its grain the right size) and blended across the three axes, so nothing stretches.
//   scale: metres a tile; mottle: colour variation; bump: relief from the texture's brightness (light catches it);
//   rust: [amount, r, g, b] chips and runs, more where grime is; grime: [y0, y1, amount] darker towards the foot
//   (splashes, damp, dirt), world heights; streaks: [yTop, length, amount] runs down from a top edge;
//   rough: [lo, hi] roughness range over the blotches; wood: "x" or "y" (the grain's axis) for the timber map;
//   wet: a { value } uniform (0 dry to 1 in rain: darker and shinier).
export function weather(mat, o = {}) {
  const noise = weatherTex(); if (!noise) return mat;
  const wood = o.wood ? woodTex() : null, local = !!o.wood;
  const S = o.scale || 1;
  const rust = o.rust || [0, 0.36, 0.17, 0.07], grime = o.grime || [0, 0, 0], streaks = o.streaks || [0, 1, 0], rough = o.rough || [1, 1];
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.fdNoise = { value: noise }; sh.uniforms.fdWet = o.wet || { value: 0 };
    // (the amounts are uniforms, not numbers written into the shader: written in, every surface with its own mottle,
    // grime or rust was a shader program of its own to build, several dozen of them as a place loaded. Only what
    // changes the shader's shape, the timber map, streaks, rust and relief being there at all, makes a new one)
    Object.assign(sh.uniforms, { fdScale: { value: S }, fdMottle: { value: o.mottle ?? 0.3 }, fdGrime: { value: new THREE.Vector3(...grime) }, fdStreaks: { value: new THREE.Vector3(...streaks) },
      fdRust: { value: new THREE.Vector4(...rust) }, fdRough: { value: new THREE.Vector2(...rough) }, fdBump: { value: o.bump || 0 } });
    if (wood) sh.uniforms.fdWood = { value: wood };
    sh.vertexShader = "varying vec3 vFdW;\nvarying vec3 vFdP;\nvarying vec3 vFdN;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
      {
        vec4 fw = vec4(transformed, 1.0); vec3 fn = objectNormal;
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw; fn = mat3(instanceMatrix) * fn;
        #endif
        fw = modelMatrix * fw; vFdW = fw.xyz;
        ${local ? `vec3 sc = vec3(1.0);
        #ifdef USE_INSTANCING
          sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #endif
        vFdP = transformed * sc; vFdN = objectNormal;${o.wood === "y" ? " vFdP = vFdP.yxz; vFdN = vFdN.yxz;" : ""}` : "vFdP = fw.xyz; vFdN = normalize(mat3(modelMatrix) * fn);"}
      }`);
    sh.fragmentShader = `uniform sampler2D fdNoise;\nuniform float fdWet;\nuniform float fdScale;\nuniform float fdMottle;\nuniform vec3 fdGrime;\nuniform vec3 fdStreaks;\nuniform vec4 fdRust;\nuniform vec2 fdRough;\nuniform float fdBump;\n${wood ? "uniform sampler2D fdWood;\n" : ""}varying vec3 vFdW;\nvarying vec3 vFdP;\nvarying vec3 vFdN;
      vec4 fdTri(sampler2D t, vec3 p, vec3 n, vec2 k) { vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5); return texture2D(t, p.zy * k) * w.x + texture2D(t, p.xz * k) * w.y + texture2D(t, p.xy * k) * w.z; }
      vec3 fdPerturb(vec3 sp, vec3 sn, vec2 dh, float fd) { vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp)); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx); float det = dot(sx, r1) * fd; return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2)); }
      ` + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 fdN = normalize(vFdN); vec3 fdP = vFdP / fdScale;
        vec4 fdT = fdTri(fdNoise, fdP, fdN, vec2(1.0));
        float fdH = fdT.r;
        diffuseColor.rgb *= 1.0 + (fdT.r - 0.5) * fdMottle + (fdT.g - 0.5) * (fdMottle * 1.4);
        ${wood ? `{ vec4 wd = fdTri(fdWood, fdP, fdN, vec2(1.0, 4.0)); diffuseColor.rgb *= wd.rgb * 1.25; fdH = dot(wd.rgb, vec3(0.33)) * 1.6; }` : ""}
        float fdG = fdGrime.z * (1.0 - smoothstep(fdGrime.x, fdGrime.y, vFdW.y)) * (0.55 + fdT.g * 0.9);
        float fdS = 0.0;
        ${streaks[2] ? `{ float run = clamp((fdStreaks.x - vFdW.y) / fdStreaks.y, 0.0, 1.0); float st = texture2D(fdNoise, vec2((vFdW.x + vFdW.z) * 0.9, vFdW.y * 0.06)).b; fdS = fdStreaks.z * smoothstep(0.5, 0.75, st) * (1.0 - run) * step(0.0, fdStreaks.x - vFdW.y); }` : ""}
        float fdR = 0.0;
        ${rust[0] ? `{ vec4 q = fdTri(fdNoise, fdP * 2.7 + 0.31, fdN, vec2(1.0)); fdR = smoothstep(0.62, 0.7, q.g + fdG * 0.6 + fdS * 0.5 + (fdT.r - 0.5) * 0.2) * fdRust.x; }` : ""}
        diffuseColor.rgb *= (1.0 - fdG) * (1.0 - fdS);
        diffuseColor.rgb = mix(diffuseColor.rgb, fdRust.yzw * (0.7 + fdT.r * 0.6), fdR);
        diffuseColor.rgb *= 1.0 - fdWet * 0.28;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(fdRough.x, fdRough.y, fdT.g) + fdR * 0.35 + fdG * 0.1, 0.05, 1.0) * (1.0 - fdWet * 0.45);`)
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n        metalnessFactor *= 1.0 - fdR;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        ${o.bump ? `normal = fdPerturb(-vViewPosition, normal, vec2(dFdx(fdH), dFdy(fdH)) * fdBump + vec2(dFdx(fdR), dFdy(fdR)) * (fdBump * 0.5), faceDirection);` : ""}`);
  };
  const key = `fdw2:${o.wood || 0}${streaks[2] ? "s" : ""}${rust[0] ? "r" : ""}${o.bump ? "b" : ""}`;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : "") + key;
  mat.needsUpdate = true;
  return mat;
}

// ---- decals: stains laid over the deck and the wall cap, four to a texture (2 x 2) ----
// [0] a rust ring round a post's foot, [1] a rust run down from a fitting, [2] an old dark stain (bait, oil, fish),
// [3] a soft damp patch (round a drain, under a bench). Transparent: colour over the concrete, faded at the edges.
export const DECAL = { rustRing: 0, rustRun: 1, stain: 2, damp: 3 };
let decalC = null;
export function decalTex() {
  if (decalC || typeof document === "undefined") return decalC;
  const T = 128, c = canvas(T * 2), g = c.getContext("2d"), img = g.createImageData(T * 2, T * 2);
  for (let y = 0; y < T * 2; y++) for (let x = 0; x < T * 2; x++) {
    const cell = (y < T ? 0 : 2) + (x < T ? 0 : 1), u = (x % T) / T - 0.5, v = (y % T) / T - 0.5, r = Math.hypot(u, v) * 2;
    const nz = fbm(x / 18, y / 18, 256 / 18, 61, 3), fine = hash(x, y, 62);
    let col = [0, 0, 0], a = 0;
    if (cell === 0) { // rust ring: strongest just round the post, ragged outer edge
      a = Math.max(0, 1 - r / (0.55 + nz * 0.5)) ** 1.4 * (0.4 + fine * 0.2); col = [92 + nz * 26, 54 + nz * 14, 32];
    } else if (cell === 1) { // a run: narrow at the top, spreading and fading downwards (v = -0.5 is the top)
      const t = v + 0.5, w = 0.05 + t * 0.22 + (nz - 0.5) * 0.06, s = Math.max(0, 1 - Math.abs(u + (nz - 0.5) * 0.08) / Math.max(0.02, w));
      a = s ** 1.2 * (1 - t) ** 0.8 * (0.6 + fbm(x / 6, y / 40, 256 / 6, 63, 2) * 0.6); col = [104 + nz * 30, 54 + nz * 14, 26];
    } else if (cell === 2) { // a dark stain, blotchy
      a = Math.max(0, 1 - r / (0.45 + nz * 0.6)) ** 0.8 * (0.35 + fbm(x / 9, y / 9, 256 / 9, 64, 3) * 0.45); col = [52, 47, 40];
    } else { // damp: a soft dark patch
      a = Math.max(0, 1 - r / (0.6 + nz * 0.4)) ** 1.6 * 0.55; col = [70, 72, 66];
    }
    img.data.set([col[0], col[1], col[2], Math.min(255, a * 255)], (y * T * 2 + x) * 4);
  }
  g.putImageData(img, 0, 0);
  return (decalC = toTex(c, { repeat: false }));
}

// ---- a cast-iron drain grate in its frame: slots across, a raised rim, rust in the slots (opaque, 0.5 x 0.35 m) ----
let grateC = null;
export function grateTex() {
  if (grateC || typeof document === "undefined") return grateC;
  const w = 128, h = 96, c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rim = x < 7 || x >= w - 7 || y < 7 || y >= h - 7, slot = !rim && (x - 7) % 10 > 5 && y > 12 && y < h - 12;
    const nz = fbm(x / 12, y / 12, 128 / 12, 71, 3), rust = fbm(x / 6, y / 6, 128 / 6, 72, 2) > 0.62;
    let L = slot ? 0.12 : rim ? 0.42 + nz * 0.12 : 0.32 + nz * 0.14;
    const col = slot ? [24, 22, 20] : rust ? [96 * (0.6 + nz), 54 * (0.6 + nz), 30] : [140 * L, 136 * L, 130 * L];
    img.data.set([col[0], col[1], col[2], 255], (y * w + x) * 4);
  }
  g.putImageData(img, 0, 0);
  return (grateC = toTex(c, { repeat: false }));
}
