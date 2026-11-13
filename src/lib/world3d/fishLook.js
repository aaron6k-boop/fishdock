// ---- fishLook: how a fish's skin looks in the 3D view: wet, scaled, with thin fins and the species' own colouring ----
// FishDock's sea fish wear their own picture (fishart.js) over a body modelled from it; this adds what a picture
// can't: a wet clearcoat that catches the light at a glancing angle, a fine relief of scales (the size drawn per
// species), a silver species' thin-film shimmer, and fins you can see light through. Freshwater species without a
// picture borrow the body of a sea fish of a similar build and are painted in their own known colouring (darker on
// the back, pale on the belly, with their markings), keeping the borrowed picture's fine detail (eye, gill cover, fin
// rays) so they never look like a plain tube. All of it is drawing; nothing here is shown to anglers as a fact.
import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- the skin, per species ----
// scales: about how many scales along the body (0: smooth skin, as a dogfish, an eel or a ray), rough: the skin's
// roughness under its wet coat, silver: how much a bright silver flank shimmers (thin-film), slime: how wet it looks.
// Defaults suit a middling round fish
const LOOK = {
  cod: { scales: 95, rough: 0.5, silver: 0.05, slime: 0.75 }, pollack: { scales: 95, rough: 0.42, silver: 0.18 }, coalfish: { scales: 95, rough: 0.42, silver: 0.15 },
  whiting: { scales: 90, rough: 0.38, silver: 0.3 }, pouting: { scales: 80, rough: 0.45, silver: 0.12 }, bass: { scales: 70, rough: 0.3, silver: 0.45 },
  mackerel: { scales: 140, rough: 0.26, silver: 0.6, slime: 0.85 }, garfish: { scales: 150, rough: 0.28, silver: 0.5 }, "thick-lipped-mullet": { scales: 45, rough: 0.34, silver: 0.35 },
  "black-bream": { scales: 60, rough: 0.34, silver: 0.3 }, "ballan-wrasse": { scales: 42, rough: 0.48, silver: 0.05 }, gurnard: { scales: 80, rough: 0.45, silver: 0.1 },
  plaice: { scales: 0, rough: 0.5, silver: 0, slime: 0.9 }, flounder: { scales: 0, rough: 0.55, silver: 0, slime: 0.85 }, dab: { scales: 0, rough: 0.6, silver: 0, slime: 0.8 }, sole: { scales: 0, rough: 0.55, silver: 0, slime: 0.85 },
  "thornback-ray": { scales: 0, rough: 0.6, silver: 0, slime: 0.7 }, "lesser-spotted-dogfish": { scales: 0, rough: 0.7, silver: 0, slime: 0.4 }, smoothhound: { scales: 0, rough: 0.5, silver: 0.05 }, tope: { scales: 0, rough: 0.5, silver: 0.05 },
  conger: { scales: 0, rough: 0.35, silver: 0, slime: 1 }, eel: { scales: 0, rough: 0.3, silver: 0, slime: 1 }, perch: { scales: 70, rough: 0.45, silver: 0.1 },
  carp: { scales: 36, rough: 0.42, silver: 0.15 }, "crucian-carp": { scales: 32, rough: 0.42, silver: 0.15 }, roach: { scales: 45, rough: 0.32, silver: 0.45 }, rudd: { scales: 42, rough: 0.34, silver: 0.35 },
  bream: { scales: 52, rough: 0.4, silver: 0.25, slime: 0.95 }, tench: { scales: 110, rough: 0.35, silver: 0.05, slime: 1 }, pike: { scales: 120, rough: 0.4, silver: 0.1, slime: 0.85 },
  zander: { scales: 85, rough: 0.42, silver: 0.2 }, barbel: { scales: 65, rough: 0.4, silver: 0.15 }, chub: { scales: 45, rough: 0.38, silver: 0.3 }, dace: { scales: 50, rough: 0.3, silver: 0.5 },
  ide: { scales: 55, rough: 0.36, silver: 0.3 }, gudgeon: { scales: 40, rough: 0.45, silver: 0.15 }, grayling: { scales: 48, rough: 0.36, silver: 0.3 },
  "brown-trout": { scales: 130, rough: 0.4, silver: 0.15, slime: 0.85 }, "rainbow-trout": { scales: 130, rough: 0.36, silver: 0.35, slime: 0.85 }, "sea-trout": { scales: 120, rough: 0.3, silver: 0.55 },
  salmon: { scales: 120, rough: 0.3, silver: 0.55 }, "wels-catfish": { scales: 0, rough: 0.4, silver: 0, slime: 1 },
};
const LOOK_BASE = { scales: 70, rough: 0.4, silver: 0.2, slime: 0.7 };
export const lookOf = (species) => ({ ...LOOK_BASE, ...(LOOK[species] || {}) });

// ---- the colouring of a species without a FishDock picture (the freshwater fish), from what it's known to look like:
// back, flank and belly colours; spots (pale on a pike, dark on a trout), bars (a zander's), a band (a rainbow
// trout's), red spots (a brown trout's), blotches (a gudgeon's, a catfish's), the fins' colour (the red fins of a roach
// or rudd), and a visible lateral line ----
export const FISH_SKINS = {
  carp: { back: [74, 62, 30], side: [168, 132, 60], belly: [226, 204, 150], net: 0.5 }, "crucian-carp": { back: [70, 62, 28], side: [170, 140, 62], belly: [222, 200, 140], net: 0.45 },
  roach: { back: [62, 78, 84], side: [196, 202, 204], belly: [236, 236, 232], fin: [196, 70, 50], net: 0.25 }, rudd: { back: [86, 82, 52], side: [204, 180, 110], belly: [236, 226, 196], fin: [214, 64, 40], net: 0.25 },
  bream: { back: [62, 58, 46], side: [150, 136, 104], belly: [210, 200, 180], net: 0.3 }, tench: { back: [44, 58, 30], side: [96, 112, 52], belly: [170, 164, 90], fin: [52, 62, 34] },
  pike: { back: [44, 62, 36], side: [96, 116, 60], belly: [222, 218, 190], spots: [214, 206, 150], spotN: 120, spotR: [2.2, 4.2] }, zander: { back: [60, 70, 66], side: [150, 156, 150], belly: [230, 230, 222], bars: 8 },
  barbel: { back: [86, 74, 50], side: [160, 140, 96], belly: [220, 206, 170], fin: [150, 92, 60], net: 0.2 }, chub: { back: [56, 62, 60], side: [176, 172, 158], belly: [228, 224, 214], net: 0.45 },
  dace: { back: [70, 80, 86], side: [200, 204, 206], belly: [238, 238, 236], net: 0.2 }, ide: { back: [60, 66, 70], side: [184, 180, 170], belly: [232, 230, 222], fin: [200, 96, 60], net: 0.3 },
  gudgeon: { back: [92, 86, 64], side: [168, 160, 130], belly: [222, 216, 196], blotch: 8 }, grayling: { back: [70, 74, 82], side: [160, 162, 170], belly: [222, 222, 226], spotN: 24, spots: [40, 40, 44], spotR: [1.4, 2.4] },
  "brown-trout": { back: [70, 64, 36], side: [176, 150, 90], belly: [232, 220, 180], spots: [60, 40, 26], spotN: 90, red: true }, "rainbow-trout": { back: [56, 76, 64], side: [190, 190, 180], belly: [236, 234, 226], spots: [40, 40, 36], spotN: 140, band: [200, 110, 120] },
  salmon: { back: [52, 66, 80], side: [202, 206, 210], belly: [240, 240, 238], spots: [36, 40, 46], spotN: 26 }, "sea-trout": { back: [58, 70, 82], side: [200, 204, 206], belly: [240, 240, 236], spots: [40, 44, 50], spotN: 36 },
  "wels-catfish": { back: [46, 48, 40], side: [92, 92, 74], belly: [196, 190, 170], blotch: 16 },
};
// a fish we can't name (no species given): a plain grey-silver round fish
const UNKNOWN_SKIN = { back: [70, 80, 88], side: [170, 176, 180], belly: [230, 230, 228], net: 0.15 };

/** Whose body a species without a picture borrows (a sea fish of a similar build: a deep carp a wrasse's, a slim
 *  salmon a mullet's with its two well spaced dorsal fins), and how much deeper or slimmer it is than that body. */
export const DONORS = {
  carp: ["ballan-wrasse", 1.05], "crucian-carp": ["ballan-wrasse", 1.15], bream: ["black-bream", 1.25], roach: ["black-bream", 0.85], rudd: ["black-bream", 0.88], ide: ["black-bream", 0.8],
  dace: ["black-bream", 0.68], chub: ["thick-lipped-mullet", 1.0], grayling: ["black-bream", 0.75], tench: ["ballan-wrasse", 0.9], pike: ["pollack", 0.72], zander: ["bass", 0.85],
  barbel: ["thick-lipped-mullet", 0.82], gudgeon: ["thick-lipped-mullet", 0.78], "brown-trout": ["thick-lipped-mullet", 0.92], "rainbow-trout": ["thick-lipped-mullet", 0.95],
  "sea-trout": ["thick-lipped-mullet", 0.9], salmon: ["thick-lipped-mullet", 0.9], "wels-catfish": ["cod", 0.78],
};
export const donorOf = (species) => DONORS[species] || (FISH_SKINS[species] ? null : ["whiting", 1]);
export const hasSkin = (species) => !!FISH_SKINS[species];

/**
 * Paints a species' own colouring over a borrowed picture (an ImageData of the donor, head left, its alpha the fish's
 * outline) using the donor's shape (fish3d.js fishShape: top and bottom of the body per column, the tail beyond xp).
 * The donor's fine detail (eye, gill cover, fin rays, scale rows) is kept as light and shade over the new colours.
 */
export function paintSkin(img, shape, species) {
  const S = FISH_SKINS[species] || UNKNOWN_SKIN, { w, h, x0, xp, L, top: T, bot: B } = shape, px = img.data;
  let seed = 7; for (const ch of species || "fish") seed = (seed * 31 + ch.charCodeAt(0)) % 9973; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the donor's own light and shade, divided by a blur of it: only the fine detail is left (its colours go)
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]) / 255;
  const blur = boxBlur(lum, w, h, 9);
  const finCol = S.fin || mix(S.side, S.back, 0.45);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x; if (px[k * 4 + 3] < 8) continue;
    const xi = clamp(x, x0, xp), tp = T[xi], bt = B[xi], body = x <= xp && y >= tp - 1 && y <= bt + 1;
    let col;
    if (body) {
      const v = clamp((y - tp) / Math.max(1, bt - tp), 0, 1), u = (x - x0) / L; // (v: 0 on the back, 1 at the belly)
      col = v < 0.5 ? mix(S.back, S.side, smooth(0.04, 0.5, v)) : mix(S.side, S.belly, smooth(0.5, 0.85, v));
      if (S.bars) { const b = Math.max(0, Math.sin(u * Math.PI * S.bars * 1.1 + 0.6)) ** 3 * (1 - smooth(0.35, 0.7, v)); col = mix(col, S.back, b * 0.7); }
      if (S.band) col = mix(col, S.band, Math.exp(-((v - 0.48) ** 2) / 0.006) * 0.55);
      // a lateral line: a fine pale line following the back's curve, a third of the way down
      { const ll = 0.36 + 0.06 * Math.sin(u * Math.PI); const d = Math.abs(v - ll) * (bt - tp); if (d < 0.9) col = mix(col, [236, 232, 220], 0.35 * (1 - d / 0.9)); }
      // the scale net of a carp or a roach: each scale's edge a shade darker
      if (S.net) { const sx = ((x - x0) / Math.max(3, L / 38) + (Math.floor((y - tp) / Math.max(3, L / 52)) % 2) * 0.5) % 1, sy = ((y - tp) / Math.max(3, L / 52)) % 1; const e = Math.min(1, Math.hypot(sx - 0.5, sy - 0.5) * 2); col = col.map((c) => c * (1 - S.net * 0.22 * e ** 4)); }
    } else col = mix(finCol, S.side, 0.15); // (fins and tail)
    // the donor's detail over it
    const d = clamp(lum[k] / Math.max(0.04, blur[k]), 0.45, 1.6), dd = body ? Math.pow(d, 0.4) : Math.pow(d, 0.85); // (softly on the body: the borrowed fish's own stripes or spots mustn't show)
    px[k * 4] = clamp(col[0] * dd, 0, 255); px[k * 4 + 1] = clamp(col[1] * dd, 0, 255); px[k * 4 + 2] = clamp(col[2] * dd, 0, 255);
  }
  // the markings, on the body only
  const onBody = (x, y) => { const xi = clamp(Math.round(x), x0, xp); return x >= x0 + L * 0.08 && x <= xp && y > T[xi] + 1 && y < B[xi] - 1 ? (y - T[xi]) / Math.max(1, B[xi] - T[xi]) : -1; };
  const dot = (x, y, r, rgb, a) => { const r2 = r * r; for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) { if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = ((xx - x) ** 2 + ((yy - y) / 0.8) ** 2) / r2; if (q > 1) continue; const k = (yy * w + xx) * 4; if (px[k + 3] < 8 || onBody(xx, yy) < 0) continue; const f = a * (1 - q * q); for (let c = 0; c < 3; c++) px[k + c] += (rgb[c] - px[k + c]) * f; } };
  const sprinkle = (n, rgb, r0, r1, vMax, a = 0.85) => { for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) { const x = x0 + rnd() * (xp - x0), y = rnd() * h, v = onBody(x, y); if (v < 0 || v > vMax) continue; dot(x, y, r0 + rnd() * (r1 - r0), rgb, a); i++; } };
  if (S.spots) sprinkle(S.spotN, S.spots, ...(S.spotR || [1.3, 2.4]), species === "pike" ? 0.8 : 0.62);
  if (S.red) sprinkle(22, [176, 40, 30], 1.4, 2.2, 0.6);
  if (S.blotch) sprinkle(S.blotch * 3, S.back, 3, 7, 0.75, 0.45);
  return img;
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let x = -r; x < w; x++) { if (x + r < w) { s += src[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= src[y * w + x - r - 1]; n--; } if (x >= 0) tmp[y * w + x] = s / n; } }
  for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < h; y++) { if (y + r < h) { s += tmp[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= tmp[(y - r - 1) * w + x]; n--; } if (y >= 0) out[y * w + x] = s / n; } }
  return out;
}

// ---- the scales' relief: one small tile of overlapping scales (each row offset by half a scale, each scale's free
// edge towards the tail standing a little proud), as a normal map repeated along the body ----
let scaleTex = null;
function scaleNormalMap() {
  if (scaleTex || typeof document === "undefined") return scaleTex;
  const N = 128, CW = 16, RH = 8, R = CW * 0.62, hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = null;
    for (let j = Math.floor(y / RH) - 2; j <= Math.floor(y / RH) + 2; j++) {
      const off = (((j % 2) + 2) % 2) * CW * 0.5;
      for (let i = Math.floor((x - off) / CW) - 1; i <= Math.floor((x - off) / CW) + 2; i++) {
        const cx = i * CW + off, cy = j * RH, dx = x - cx, dy = (y - cy) * 1.25, d = Math.hypot(dx, dy);
        if (d < R && (!best || cx < best.cx)) best = { cx, dx, d }; // (the scale nearer the head lies over the next)
      }
    }
    hgt[y * N + x] = best ? 0.45 + 0.55 * clamp(best.dx / R, -1, 1) * (1 - (best.d / R) ** 6) : 0;
  }
  const c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"), im = g.createImageData(N, N);
  const H = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const nx = -(H(x + 1, y) - H(x - 1, y)) * 1.6, ny = (H(x, y + 1) - H(x, y - 1)) * 1.6, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
    im.data[k] = (nx / l * 0.5 + 0.5) * 255; im.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  scaleTex = new THREE.CanvasTexture(c); scaleTex.wrapS = scaleTex.wrapT = THREE.RepeatWrapping; scaleTex.colorSpace = THREE.NoColorSpace;
  return scaleTex;
}

// ---- the materials ----
/**
 * The three materials of a fish: its body (wet: a clearcoat over the skin, the scales' relief, a silver species'
 * shimmer), its fins and tail (thin: light comes through, the picture's own colours a little see-through) and its
 * eyes (glassy). `map` is the skin (picture or painted); `aspect` the picture's height over its width (the scales are
 * drawn round, not stretched); `len` the fish's length in metres (a small fish's scales are fine enough not to show).
 */
export function fishMaterials(species, { map = null, aspect = 320 / 480, len = 0.45, look = null } = {}) {
  const K = { ...lookOf(species), ...(look || {}) }; // (look: to make a given kind of skin, for building its shaders ahead)
  const body = new THREE.MeshPhysicalMaterial({
    map, color: map ? 0xffffff : 0xb8c0c4, roughness: K.rough, metalness: 0.05 + K.silver * 0.3, side: THREE.DoubleSide, alphaTest: 0.5,
    clearcoat: 0.35 + 0.6 * K.slime, clearcoatRoughness: 0.08 + 0.1 * (1 - K.slime), // (the wet sheen, brightest at a glancing angle)
    iridescence: K.silver * 0.8, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    specularIntensity: 0.6 + 0.4 * K.silver, envMapIntensity: 1,
  });
  const nm = K.scales > 0 && len > 0.12 ? scaleNormalMap() : null;
  if (nm) {
    // (one tile has 8 scales across: the picture's width is a little more than the fish's length)
    const t = nm.clone(); t.needsUpdate = true; const across = K.scales * 1.1 / 8;
    t.repeat.set(across, across * aspect * 1.25); body.normalMap = t; body.normalScale.set(0.32, 0.32);
    body.clearcoatNormalMap = t; body.clearcoatNormalScale = new THREE.Vector2(0.12, 0.12);
  }
  const fin = new THREE.MeshPhysicalMaterial({
    map, color: map ? 0xffffff : 0xb8c0c4, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.86, alphaTest: 0.22,
    depthWrite: false, clearcoat: 0.5, clearcoatRoughness: 0.15, emissive: 0x000000,
  });
  // light through a thin fin: lit a little from either side, so a fin held against the sky glows rather than going black
  fin.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight += diffuseColor.rgb * 0.18 * (totalEmissiveRadiance + vec3(0.6));\n#include <opaque_fragment>"); };
  const eye = new THREE.MeshPhysicalMaterial({ map, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
  return { body, fin, eye };
}
