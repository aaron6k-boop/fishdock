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
      // weathering: rain runs down the wall (more towards the foot of each storey) and dirt splashed up at the bottom
      L *= 1 - smoothstep01((fbm((x0 + x) / 3, y / 48, 512 / 3, seed + 21, 2) - 0.5) * 4) * 0.1 * (0.3 + y / T) - (y > T * 0.88 ? (y - T * 0.88) / (T * 0.12) * 0.07 : 0);
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
      // grime run off the sill's ends and under it
      const run = g.createLinearGradient(0, y + h + 9, 0, y + h + 34); run.addColorStop(0, "rgba(40,36,30,.22)"); run.addColorStop(1, "rgba(40,36,30,0)");
      g.fillStyle = run; g.fillRect(x - 6, y + h + 9, 5, 25); g.fillRect(x + w + 1, y + h + 9, 5, 25); g.fillRect(x + 2, y + h + 9, w - 4, 10);
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
    const lich = kind !== "felt" && hash(x >> 1, y >> 1, seed + 3) > 0.985 ? 0.35 : 0; // (lichen: pale yellow-grey spots)
    const L = (kind === "felt" ? 0.9 + hash(x, y, seed) * 0.15 : tileV) * edge * gap * (0.92 + fbm(x / 20, y / 64, 128 / 20, seed + 5, 2) * 0.16) + lich;
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

// ---- photographed surfaces (public/textures/, Poly Haven CC0, cut down by source-assets/prepare_textures.py) ----
// Loaded once each and shared; a material that uses one shows its drawn look until it has arrived (or if it can't).
export const TEX_BASE = "/textures/";
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
  const f = (v) => (+v).toFixed(4), S = o.scale || 1;
  const rust = o.rust || [0, 0.36, 0.17, 0.07], grime = o.grime || [0, 0, 0], streaks = o.streaks || [0, 1, 0], rough = o.rough || [1, 1];
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.fdNoise = { value: noise }; sh.uniforms.fdWet = o.wet || { value: 0 };
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
    sh.fragmentShader = `uniform sampler2D fdNoise;\nuniform float fdWet;\n${wood ? "uniform sampler2D fdWood;\n" : ""}varying vec3 vFdW;\nvarying vec3 vFdP;\nvarying vec3 vFdN;
      vec4 fdTri(sampler2D t, vec3 p, vec3 n, vec2 k) { vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5); return texture2D(t, p.zy * k) * w.x + texture2D(t, p.xz * k) * w.y + texture2D(t, p.xy * k) * w.z; }
      vec3 fdPerturb(vec3 sp, vec3 sn, vec2 dh, float fd) { vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp)); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx); float det = dot(sx, r1) * fd; return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2)); }
      ` + sh.fragmentShader
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 fdN = normalize(vFdN); vec3 fdP = vFdP / ${f(S)};
        vec4 fdT = fdTri(fdNoise, fdP, fdN, vec2(1.0));
        float fdH = fdT.r;
        diffuseColor.rgb *= 1.0 + (fdT.r - 0.5) * ${f(o.mottle ?? 0.3)} + (fdT.g - 0.5) * ${f((o.mottle ?? 0.3) * 1.4)};
        ${wood ? `{ vec4 wd = fdTri(fdWood, fdP, fdN, vec2(1.0, 4.0)); diffuseColor.rgb *= wd.rgb * 1.25; fdH = dot(wd.rgb, vec3(0.33)) * 1.6; }` : ""}
        float fdG = ${f(grime[2])} * (1.0 - smoothstep(${f(grime[0])}, ${f(grime[1])}, vFdW.y)) * (0.55 + fdT.g * 0.9);
        float fdS = 0.0;
        ${streaks[2] ? `{ float run = clamp((${f(streaks[0])} - vFdW.y) / ${f(streaks[1])}, 0.0, 1.0); float st = texture2D(fdNoise, vec2((vFdW.x + vFdW.z) * 0.9, vFdW.y * 0.06)).b; fdS = ${f(streaks[2])} * smoothstep(0.5, 0.75, st) * (1.0 - run) * step(0.0, ${f(streaks[0])} - vFdW.y); }` : ""}
        float fdR = 0.0;
        ${rust[0] ? `{ vec4 q = fdTri(fdNoise, fdP * 2.7 + 0.31, fdN, vec2(1.0)); fdR = smoothstep(0.62, 0.7, q.g + fdG * 0.6 + fdS * 0.5 + (fdT.r - 0.5) * 0.2) * ${f(rust[0])}; }` : ""}
        diffuseColor.rgb *= (1.0 - fdG) * (1.0 - fdS);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${f(rust[1])}, ${f(rust[2])}, ${f(rust[3])}) * (0.7 + fdT.r * 0.6), fdR);
        diffuseColor.rgb *= 1.0 - fdWet * 0.28;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(${f(rough[0])}, ${f(rough[1])}, fdT.g) + fdR * 0.35 + fdG * 0.1, 0.05, 1.0) * (1.0 - fdWet * 0.45);`)
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n        metalnessFactor *= 1.0 - fdR;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        ${o.bump ? `normal = fdPerturb(-vViewPosition, normal, vec2(dFdx(fdH), dFdy(fdH)) * ${f(o.bump)} + vec2(dFdx(fdR), dFdy(fdR)) * ${f(o.bump * 0.5)}, faceDirection);` : ""}`);
  };
  const key = "fdw1:" + JSON.stringify(o, (k, v) => (k === "wet" ? !!v : v));
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
