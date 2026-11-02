// ---- qr: a small QR code maker for invite links (byte mode, error correction level M, versions 1 to 6) ----
// No library and no outside service: the link never leaves the phone to be drawn.

// Reed-Solomon over GF(256) with the QR polynomial 0x11d
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
export function rsEcc(data, n) {
  const g = rsGen(n), r = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
  return r.slice(data.length);
}

// level M: [ecc per block, [[blocks, data codewords per block], ...]], alignment centres
const SPEC = [null,
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42]];
const dataCap = (v) => SPEC[v][1].reduce((s, [b, d]) => s + b * d, 0);

/** The QR code for `text` as a matrix of booleans (true is dark), or null if it's too long (over 106 bytes). */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  // versions 1 to 6 (an invite link is about 70 characters, version 5); 7 and 8 are kept in the tables for later
  let v = 1; while (v <= 6 && 4 + 8 + bytes.length * 8 > dataCap(v) * 8) v++;
  if (v > 6) return null;
  // the data bits: byte mode, length, the bytes, terminator, padding
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  const cap = dataCap(v) * 8;
  put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0; data.length < dataCap(v); p++) data.push(p % 2 ? 0x11 : 0xec);
  // split into blocks, add error correction, interleave
  const [ecN, groups] = SPEC[v], blocks = [], eccs = [];
  let k = 0; for (const [n, d] of groups) for (let i = 0; i < n; i++) { const b = data.slice(k, k + d); k += d; blocks.push(b); eccs.push(rsEcc(b, ecN)); }
  const out = [], maxD = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecN; i++) for (const e of eccs) out.push(e[i]);
  // the grid
  const size = 17 + 4 * v, M = Array.from({ length: size }, () => new Array(size).fill(null));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => { M[r][c] = dark; fixed[r][c] = true; };
  const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const rr = r + i, cc = c + j; if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue; const d = Math.max(Math.abs(i - 3), Math.abs(j - 3)); set(rr, cc, d !== 2 && d !== 4 && i >= 0 && i <= 6 && j >= 0 && j <= 6); } };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[v];
  for (const r of al) for (const c of al) { if (fixed[r][c]) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1); }
  set(size - 8, 8, true); // the dark module
  for (let i = 0; i < 9; i++) { if (!fixed[8][i]) fixed[8][i] = true; if (!fixed[i][8]) fixed[i][8] = true; }
  for (let i = 0; i < 8; i++) { fixed[8][size - 1 - i] = true; fixed[size - 1 - i][8] = true; }
  if (v >= 7) { for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { fixed[i][size - 11 + j] = true; fixed[size - 11 + j][i] = true; } }
  // place the codewords in the zigzag
  const cw = []; for (const b of out) for (let i = 7; i >= 0; i--) cw.push((b >> i) & 1);
  let bi = 0, up = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    for (let n = 0; n < size; n++) { const r = up ? size - 1 - n : n; for (let j = 0; j < 2; j++) { const cc = c - j; if (fixed[r][cc]) continue; M[r][cc] = bi < cw.length ? cw[bi] === 1 : false; bi++; } }
    up = !up;
  }
  // try each mask, keep the one with the lowest penalty
  const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  let best = null, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    const G = M.map((row, r) => row.map((d, c) => (fixed[r][c] ? d : d !== MASKS[m](r, c))));
    drawFormat(G, size, m, v);
    const p = penalty(G, size);
    if (p < bestP) { bestP = p; best = G; }
  }
  return best;
}
function bch(data, poly, shift) { let d = data << shift; const top = 31 - Math.clz32(poly); while (31 - Math.clz32(d) >= top) d ^= poly << (31 - Math.clz32(d) - top); return (data << shift) | d; }
function drawFormat(G, size, mask, v) {
  const f = bch((0 << 3) | mask, 0x537, 10) ^ 0x5412; // level M is 00
  const bit = (i) => ((f >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) G[8][i] = bit(14 - i);
  G[8][7] = bit(8); G[8][8] = bit(7); G[7][8] = bit(6);
  for (let i = 9; i < 15; i++) G[14 - i][8] = bit(14 - i);
  for (let i = 0; i < 8; i++) G[size - 1 - i][8] = bit(14 - i);
  for (let i = 7; i < 15; i++) G[8][size - 15 + i] = bit(14 - i);
  G[size - 8][8] = true;
  if (v >= 7) { const vi = bch(v, 0x1f25, 12); for (let i = 0; i < 18; i++) { const d = ((vi >> i) & 1) === 1, a = Math.floor(i / 3), b = (i % 3) + size - 11; G[a][b] = d; G[b][a] = d; } }
}
function penalty(G, n) {
  let p = 0;
  for (let r = 0; r < n; r++) for (const line of [G[r], G.map((row) => row[r])]) {
    let run = 1; for (let i = 1; i < n; i++) { if (line[i] === line[i - 1]) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
    for (let i = 0; i + 10 < n; i++) { const s = line.slice(i, i + 11).map((x) => (x ? 1 : 0)).join(""); if (s === "10111010000" || s === "00001011101") p += 40; }
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const d = G[r][c]; if (G[r][c + 1] === d && G[r + 1][c] === d && G[r + 1][c + 1] === d) p += 3; }
  let dark = 0; for (const row of G) for (const d of row) if (d) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}
/** An SVG string for the matrix (with the quiet zone). */
export function qrSvg(text, { dark = "#0a141b", light = "#ffffff" } = {}) {
  const M = qrMatrix(text); if (!M) return null;
  const n = M.length, q = 4; let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (M[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
