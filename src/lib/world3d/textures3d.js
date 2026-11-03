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
export function concrete({ size = 256, seed = 3, tint = [196, 186, 166] } = {}) { // sun-bleached, warm pale concrete (as Gorleston's deck)
  const n = size, col = canvas(n), g = col.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n), rough = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const stain = fbm(u * 6, v * 6, 6, seed, 4), blotch = fbm(u * 2, v * 2, 2, seed + 9, 2);
    const grit = hash(x, y, seed), pit = 0; // (no pock marks: at this scale they read as a pattern of holes)
    // joints: a shallow groove every half tile, slightly wavy so it doesn't read as a drawn grid
    const jx = Math.abs(((u * 2 + noise2(v * 4, 0.5, 4, seed + 4) * 0.004) % 1 + 1) % 1 - 0.5), jy = Math.abs(((v * 2 + noise2(u * 4, 0.3, 4, seed + 5) * 0.004) % 1 + 1) % 1 - 0.5);
    const joint = Math.max(0, 1 - Math.min(jx, jy) * n / 1.6) * (Math.min(jx, jy) > 0.48 ? 1 : 0);
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

// ---- facades: an atlas of four bays, each one storey (about 3 m) high and one bay (about 3.2 m) wide ----
// [0] a sash window, [1] a front door with a fanlight, [2] a shop front, [3] plain wall. Pane areas go in an
// emissive map too, so windows glow after dark.
export const FACADE_TILE = { window: 0, door: 1, shop: 2, plain: 3 };
export function facade(kind = "brick", seed = 7) {
  const T = 128, c = canvas(T * 4, T), g = c.getContext("2d"), e = canvas(T * 4, T), ge = e.getContext("2d");
  ge.fillStyle = "#000"; ge.fillRect(0, 0, T * 4, T);
  const base = kind === "brick" ? [150, 78, 58] : kind === "cladding" ? [116, 128, 120] : kind === "stone" ? [176, 168, 150] : [238, 232, 218];
  for (let t = 0; t < 4; t++) {
    const x0 = t * T;
    // the wall itself
    const img = g.createImageData(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let L = 0.94 + (fbm((x0 + x) / 40, y / 40, 512 / 40, seed, 2) - 0.5) * 0.18 - (y > T - 3 ? 0.1 : 0);
      if (kind === "brick") { const row = Math.floor(y / 5), off = row % 2 ? 6 : 0, mortar = y % 5 === 0 || (x + off) % 12 === 0; L *= mortar ? 1.35 : 0.9 + hash(Math.floor((x + off) / 12), row, seed) * 0.22; }
      if (kind === "cladding") { const p = (x % 10) / 10; L *= p < 0.2 ? 0.8 : 1.02; }
      if (kind === "render") L *= 0.97 + hash(x >> 2, y >> 2, seed) * 0.04;
      img.data.set([Math.min(255, base[0] * L), Math.min(255, base[1] * L), Math.min(255, base[2] * L), 255], (y * T + x) * 4);
    }
    g.putImageData(img, x0, 0);
    const trim = kind === "brick" ? "#efe9dc" : kind === "cladding" ? "#5d6a63" : "#ffffff";
    const glass = (x, y, w, h) => { g.fillStyle = "#28333d"; g.fillRect(x, y, w, h); const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, "rgba(160,190,215,.55)"); gr.addColorStop(0.5, "rgba(60,80,100,.1)"); gr.addColorStop(1, "rgba(140,170,200,.35)"); g.fillStyle = gr; g.fillRect(x, y, w, h); ge.fillStyle = "#c08a40"; ge.fillRect(x, y, w, h); };
    if (t === FACADE_TILE.window && kind !== "cladding") {
      const w = T * 0.36, h = T * 0.52, x = x0 + (T - w) / 2, y = T * 0.2;
      g.fillStyle = trim; g.fillRect(x - 4, y - 4, w + 8, h + 8); glass(x, y, w, h);
      g.fillStyle = trim; g.fillRect(x, y + h / 2 - 2, w, 4); g.fillRect(x + w / 2 - 1.5, y, 3, h); // sash bars
      g.fillStyle = kind === "brick" ? "#d8d2c4" : "#d6d0c4"; g.fillRect(x - 7, y + h + 4, w + 14, 5); // sill
      if (kind === "brick") { g.fillStyle = "#8a4636"; for (let k = 0; k < 6; k++) g.fillRect(x - 4 + (k * (w + 8)) / 6, y - 10, (w + 8) / 6 - 1, 6); } // lintel
    } else if (t === FACADE_TILE.window) { glass(x0 + T * 0.3, T * 0.35, T * 0.4, T * 0.18); }
    if (t === FACADE_TILE.door) {
      const w = T * 0.32, h = T * 0.66, x = x0 + (T - w) / 2, y = T - h - 2;
      g.fillStyle = trim; g.fillRect(x - 5, y - 16, w + 10, h + 18);
      glass(x, y - 12, w, 9); // fanlight
      const doorCol = ["#1f3a5f", "#5b1f24", "#23402e", "#2b2b2b"][seed % 4]; g.fillStyle = doorCol; g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x + 4, y + 6, w - 8, h * 0.38); g.fillRect(x + 4, y + h * 0.5, w - 8, h * 0.42);
      g.fillStyle = "#c8a24a"; g.fillRect(x + w - 8, y + h * 0.5, 3, 3);
    }
    if (t === FACADE_TILE.shop) {
      const y = T * 0.18; g.fillStyle = ["#1f3a5f", "#5b1f24", "#23402e", "#3d3d46"][(seed + 1) % 4]; g.fillRect(x0, y - 14, T, 14); // fascia
      glass(x0 + 6, y + 4, T - 12, T * 0.62); g.fillStyle = trim; g.fillRect(x0 + T / 2 - 2, y + 4, 4, T * 0.62); g.fillRect(x0 + 4, y + T * 0.66, T - 8, 5);
    }
    if (kind === "cladding" && t === FACADE_TILE.door) { g.fillStyle = "#6e7670"; g.fillRect(x0 + 10, T * 0.2, T - 20, T * 0.8); for (let k = 0; k < 20; k++) { g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(x0 + 10, T * 0.2 + k * 5, T - 20, 1); } }
  }
  return { map: toTex(c), emissiveMap: toTex(e) };
}

// ---- roofs: slate (grey-blue) or clay tiles (red-brown), one tile = about 3 m square ----
export function roof(kind = "slate", seed = 11) {
  const n = 128, c = canvas(n), g = c.getContext("2d"), img = g.createImageData(n, n), hf = new Float32Array(n * n);
  const base = kind === "slate" ? [78, 84, 92] : kind === "felt" ? [62, 62, 60] : [150, 72, 50];
  const rows = kind === "felt" ? 1 : 16, cols = kind === "slate" ? 10 : 14;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.floor((y / n) * rows), off = r % 2 ? 0.5 : 0, cIdx = Math.floor((x / n) * cols + off), fy = ((y / n) * rows) % 1;
    const tileV = kind === "felt" ? 0 : 0.85 + hash(cIdx, r, seed) * 0.3;
    const edge = kind === "felt" ? 0 : fy < 0.12 ? 0.6 : 1, gap = kind === "felt" ? 1 : ((x / n) * cols + off) % 1 < 0.04 ? 0.7 : 1;
    const moss = fbm(x / 32, y / 32, 4, seed, 2) > 0.68 ? 0.25 : 0;
    const L = (kind === "felt" ? 0.9 + hash(x, y, seed) * 0.15 : tileV) * edge * gap;
    img.data.set([base[0] * L * (1 - moss) + 70 * moss, base[1] * L * (1 - moss) + 86 * moss, base[2] * L * (1 - moss) + 40 * moss, 255], (y * n + x) * 4);
    hf[y * n + x] = fy * (kind === "felt" ? 0 : 1) * gap;
  }
  g.putImageData(img, 0, 0);
  return { map: toTex(c), normalMap: normalFrom(hf, n, n, 2.5) };
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
