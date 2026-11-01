// ---- fish3d: FishDock's species pictures made into light 3D fish ----
// Each fish is built in the browser from its own cut-out picture, so its outline, fins and markings are the picture's:
// the body is lofted from the outline (round in section, as thick as the species usually is), and the tail and the
// fins on the outline are separate flat pieces that move on their own. The spine bends side to side (swimming) and
// up and down (arching), the fish can roll and face either way, and a small WebGL renderer lights it for the hour.
// Pectoral fins are painted on the flank in the pictures, so they stay part of the body. No libraries.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** How thick a species' body is against its depth (side view), or for flatfish and rays (pictured from above) how
 *  thin. Geometry for the animation only; nothing here is shown to anglers. */
const WIDTH = {
  cod: 0.6, bass: 0.42, whiting: 0.45, pouting: 0.45, mackerel: 0.6, garfish: 0.85, pollack: 0.5, coalfish: 0.5,
  "ballan-wrasse": 0.5, "black-bream": 0.34, "thick-lipped-mullet": 0.6, gurnard: 0.75, perch: 0.45,
  plaice: 0.13, flounder: 0.13, dab: 0.13, sole: 0.12, "thornback-ray": 0.1,
  conger: 0.9, eel: 0.9, "lesser-spotted-dogfish": 0.8, smoothhound: 0.75, tope: 0.75,
};
export const bodyWidth = (species) => WIDTH[species] ?? 0.5;
/** Pictures that don't suit a straight spine (the eel and the conger are drawn curled): they keep the flat bent
 *  picture. */
export const CURLED = new Set(["eel", "conger"]);

// ---- the outline, the body, the fins and the tail, from the picture's alpha ----
/**
 * Reads a cut-out's alpha (w x h, 0..255, head on the left) and finds the fish's length, the body's top and bottom
 * edges with the fins taken off (a 1D closing of the top edge and opening of the bottom edge: fins are bumps on the
 * outline narrower than the window, the body's own curve is far wider), the tail (behind the narrowest point near the
 * back, the caudal peduncle) and each fin as its own piece. `ok` is false for pictures this can't model well (a
 * curled eel, for instance), which then keep the flat bent picture.
 */
export function fishShape(alpha, w, h, { thr = 110 } = {}) {
  const top = new Int16Array(w).fill(-1), bot = new Int16Array(w).fill(-1), runs = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let inRun = false;
    for (let y = 0; y < h; y++) {
      const on = alpha[y * w + x] > thr;
      if (on) { if (top[x] < 0) top[x] = y; bot[x] = y; if (!inRun) { runs[x]++; inRun = true; } } else inRun = false;
    }
  }
  let x0 = 0, x1 = w - 1;
  while (x0 < w && (top[x0] < 0 || bot[x0] - top[x0] < 2)) x0++;
  while (x1 > x0 && (top[x1] < 0 || bot[x1] - top[x1] < 2)) x1--;
  const L = x1 - x0;
  if (L < 20) return { ok: false, why: "no fish in the picture" };
  // fill any gaps in the outline (a column with nothing between two that have something)
  for (let x = x0 + 1; x < x1; x++) if (top[x] < 0) { top[x] = top[x - 1]; bot[x] = bot[x - 1]; }
  // the peduncle: the narrowest point between 65% and 93% of the length
  let xp = Math.round(x0 + L * 0.85), best = Infinity;
  for (let x = Math.round(x0 + L * 0.65); x <= Math.round(x0 + L * 0.93); x++) { const d = bot[x] - top[x]; if (d < best) { best = d; xp = x; } }
  // the body's edges without the fins: closing (top) and opening (bottom) over a window of 7% of the length
  const r = Math.max(2, Math.round(L * 0.07));
  const filt = (src, fn, a, b) => { const o = new Float32Array(w); for (let x = a; x <= b; x++) { let v = src[x]; for (let k = Math.max(a, x - r); k <= Math.min(b, x + r); k++) v = fn(v, src[k]); o[x] = v; } return o; };
  const btop = filt(filt(top, Math.max, x0, xp), Math.min, x0, xp);
  const bbot = filt(filt(bot, Math.min, x0, xp), Math.max, x0, xp);
  for (let x = x0; x <= xp; x++) { btop[x] = clamp(btop[x], top[x], bot[x]); bbot[x] = clamp(bbot[x], btop[x], bot[x]); }
  // a light smoothing so the body's edge has no steps
  const sm = (a) => { const o = Float32Array.from(a); for (let x = x0 + 1; x < xp; x++) o[x] = (a[x - 1] + 2 * a[x] + a[x + 1]) / 4; return o; };
  const T = sm(btop), B = sm(bbot);
  // the pieces: 1 a fin, 2 the tail; each fin found as its own connected patch
  const part = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) {
    if (alpha[y * w + x] <= thr) continue;
    if (x > xp) part[y * w + x] = 2;
    else if (y < T[x] - 1.5 || y > B[x] + 1.5) part[y * w + x] = 1;
  }
  const fins = [], seen = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w * h; i++) {
    if (part[i] !== 1 || seen[i]) continue;
    let bx0 = w, by0 = h, bx1 = 0, by1 = 0, n = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j / w) | 0;
      n++; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      for (const k of [j - 1, j + 1, j - w, j + w]) if (k >= 0 && k < w * h && part[k] === 1 && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
    if (n < 14) { for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (part[y * w + x] === 1) part[y * w + x] = 0; continue; }
    const cx = Math.round((bx0 + bx1) / 2);
    fins.push({ box: [bx0, by0, bx1, by1], area: n, side: by1 <= T[clamp(cx, x0, xp)] + 2 ? "top" : "bottom" });
  }
  let ty0 = h, ty1 = 0;
  for (let y = 0; y < h; y++) for (let x = xp + 1; x <= x1; x++) if (part[y * w + x] === 2) { ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
  // can it be modelled? a body seen side on (or from above) with one run of fish per column, longer than deep
  let multi = 0;
  for (let x = Math.round(x0 + L * 0.1); x <= xp; x++) if (runs[x] > 1 && bot[x] - top[x] > (B[x] - T[x]) * 1.6) multi++;
  let maxH = 0; for (let x = x0; x <= xp; x++) maxH = Math.max(maxH, B[x] - T[x]);
  const ok = multi < (xp - x0) * 0.2 && L > maxH * 1.25;
  // the spine's height in the picture: the middle of the body, on average
  let ys = 0; for (let x = x0; x <= xp; x++) ys += (T[x] + B[x]) / 2;
  return { ok, why: ok ? "" : multi ? "the body curls in the picture" : "not long enough to model", w, h, x0, x1, xp, L, top: T, bot: B, spineY: ys / (xp - x0 + 1), fins, tail: ty1 >= ty0 ? [xp, ty0, x1, ty1] : null, part };
}

// ---- the mesh ----
/**
 * Lofts the body (rings round the spine, as wide as the species usually is, narrowing at the head and to the tail)
 * and lays the tail and each fin as a flat textured patch on the fish's middle plane. Everything is in units of the
 * fish's length: u along the spine from the snout (0) to the tail tip (1), y up, z out of the picture. Each vertex
 * keeps its picture coordinates for the texture, and a flex weight for the fins' and tail's own movement.
 */
export function buildFishMesh(shape, { width = 0.5, flat = false } = {}) {
  const { w, h, x0, xp, L, top: T, bot: B, spineY } = shape;
  const pos = [], uv = [], nrm = [], kind = [], flex = [], idx = [], finIdx = [];
  const toU = (x) => (x - x0) / L, toY = (y) => -(y - spineY) / L;
  // rings, closer together at the snout and the peduncle
  const K = 34, M = 16;
  for (let i = 0; i < K; i++) {
    const t = i / (K - 1), x = x0 + (xp - x0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    const xi = clamp(Math.round(x), x0, xp), u = toU(x);
    const tp = T[xi], bt = B[xi], c = (tp + bt) / 2, a = (bt - tp) / 2;
    // a fish is narrower at the snout and laterally flattened towards the tail; flatfish keep an even thinness
    const taper = flat ? 0.6 + 0.4 * smooth(0, 0.12, u) : (0.55 + 0.45 * smooth(0, 0.3, u)) * (1 - 0.55 * smooth(0.5, 1, toU(x) / Math.max(0.01, toU(xp))));
    const b = a * width * taper;
    for (let j = 0; j < M; j++) {
      const th = (j / M) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const yImg = c - a * cs;
      pos.push(u, toY(yImg), (b * sn) / L);
      uv.push(x / w, yImg / h);
      const ny = cs / Math.max(a, 0.5), nz = sn / Math.max(b, 0.5), nl = Math.hypot(ny, nz) || 1;
      nrm.push(0, ny / nl, nz / nl);
      kind.push(0); flex.push(0);
    }
  }
  for (let i = 0; i < K - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = a + M, d = b + M;
    idx.push(a, c, b, b, c, d);
  }
  // flat pieces: a grid over each one's box, a little into the body so there's no gap at the root
  const patch = (box, k, nx, ny, flexOf) => {
    const base = pos.length / 3;
    const [bx0, by0, bx1, by1] = box;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const x = lerp(bx0 - 1, bx1 + 1, i / nx), y = lerp(by0 - 1, by1 + 1, j / ny);
      pos.push(toU(x), toY(y), 0); uv.push(x / w, y / h); nrm.push(0, 0, 1); kind.push(k); flex.push(flexOf(x, y));
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      finIdx.push(a, c, b, b, c, d);
    }
  };
  if (shape.tail) {
    const [, ty0, tx1, ty1] = shape.tail;
    patch([xp - 3, ty0, tx1, ty1], 2, 8, 6, (x) => clamp((x - xp) / Math.max(1, tx1 - xp), 0, 1));
  }
  for (const f of shape.fins) {
    const [fx0, fy0, fx1, fy1] = f.box;
    const root = f.side === "top" ? fy1 : fy0, span = Math.max(1, fy1 - fy0);
    const xc = clamp(Math.round((fx0 + fx1) / 2), x0, xp), edge = f.side === "top" ? T[xc] : B[xc];
    const box = f.side === "top" ? [fx0, fy0, fx1, Math.max(fy1, edge + 3)] : [fx0, Math.min(fy0, edge - 3), fx1, fy1];
    patch(box, 1, 5, 3, (x, y) => clamp(Math.abs(y - root) / span, 0, 1) * (0.6 + 0.4 * clamp((x - fx0) / Math.max(1, fx1 - fx0), 0, 1)));
  }
  let ymax = 0; for (let i = 1; i < pos.length; i += 3) ymax = Math.max(ymax, Math.abs(pos[i]));
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), nrm: new Float32Array(nrm), kind: new Float32Array(kind), flex: new Float32Array(flex), idx: new Uint16Array(idx), finIdx: new Uint16Array(finIdx), ymax, mouthU: 0.03, mouthY: toY((T[clamp(Math.round(x0 + L * 0.03), x0, xp)] + B[clamp(Math.round(x0 + L * 0.03), x0, xp)]) / 2) };
}

// ---- moving it ----
const NS = 40;
/**
 * Bends and places the mesh for one frame. pose: anchor [x, y] (where the mouth goes, in pixels), rot (the direction
 * from head to tail on screen), flip (facing the other way), twist (roll about the spine), yaw (turned towards or
 * away from the viewer), len (pixels per fish
 * length), lat(u) and dv(u) (bend angles side to side and up and down along the body), t (seconds), fin (fin and
 * tail beat strength), wing (a ray's wing beat). Writes screen positions (x, y, depth) and normals into out.
 */
export function deformFish(mesh, pose, out) {
  const n = mesh.pos.length / 3;
  if (!out.p || out.p.length !== n * 3) { out.p = new Float32Array(n * 3); out.n = new Float32Array(n * 3); out.spine = new Float32Array((NS + 1) * 2); }
  const { lat = () => 0, dv = () => 0, twist = 0, yaw = 0, flip = false, len = 100, rot = 0, anchor = [0, 0], t = 0, fin = 1, wing = 0 } = pose;
  // the spine: heading angles integrated along the body
  const P = new Float32Array((NS + 1) * 3), F = new Float32Array((NS + 1) * 9);
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i <= NS; i++) {
    const u = i / NS, yaw = lat(u), pit = dv(u);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
    // tangent, up (dorsal) and side
    const tx = cp * cy, ty = sp, tz = cp * sy;
    const ux = -sp * cy, uy = cp, uz = -sp * sy;
    const sx = ty * uz - tz * uy, s2 = tz * ux - tx * uz, sz = tx * uy - ty * ux;
    P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
    F.set([tx, ty, tz, ux, uy, uz, sx, s2, sz], i * 9);
    px += tx / NS; py += ty / NS; pz += tz / NS;
  }
  const ct = Math.cos(twist), st = Math.sin(twist), cw = Math.cos(yaw), sw = Math.sin(yaw);
  const ra = flip ? rot - Math.PI : rot, cr = Math.cos(ra), sr = Math.sin(ra);
  const place = (x, y, z, o, k) => {
    // roll about the spine, then turn round if facing the other way, then onto the screen
    let yy = y * ct - z * st, zz = y * st + z * ct, xx = x;
    // turned towards or away from the viewer (about the fish's own up)
    const x2 = xx * cw + zz * sw; zz = -xx * sw + zz * cw; xx = x2;
    if (flip) { xx = -xx; zz = -zz; }
    o[k] = len * (xx * cr + yy * sr); o[k + 1] = len * (xx * sr - yy * cr); o[k + 2] = len * zz;
  };
  const tmp = new Float32Array(3);
  for (let v = 0; v < n; v++) {
    const u = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1];
    let z = mesh.pos[v * 3 + 2];
    const kd = mesh.kind[v], fx = mesh.flex[v];
    if (kd === 1) z += 0.035 * fin * fx * Math.sin(t * 7 + u * 14);
    if (kd === 2) z += 0.02 * fin * fx * Math.sin(t * 9 + fx * 3);
    if (wing) z += wing * Math.pow(Math.abs(y) / Math.max(0.01, mesh.ymax), 1.6);
    const f = clamp(u, 0, 1) * NS, i = Math.min(NS - 1, Math.floor(f)), a = f - i;
    const q = (k) => lerp(F[i * 9 + k], F[(i + 1) * 9 + k], a);
    const bx = lerp(P[i * 3], P[(i + 1) * 3], a) + (u - clamp(u, 0, 1)) * F[i * 9];
    const by = lerp(P[i * 3 + 1], P[(i + 1) * 3 + 1], a), bz = lerp(P[i * 3 + 2], P[(i + 1) * 3 + 2], a);
    place(bx + y * q(3) + z * q(6), by + y * q(4) + z * q(7), bz + y * q(5) + z * q(8), out.p, v * 3);
    // the normal turns with the body (rest normals are (0, ny, nz) round the spine; flat pieces face out of the plane)
    const nx0 = mesh.nrm[v * 3], ny0 = mesh.nrm[v * 3 + 1], nz0 = mesh.nrm[v * 3 + 2];
    tmp[0] = nx0 * q(0) + ny0 * q(3) + nz0 * q(6); tmp[1] = nx0 * q(1) + ny0 * q(4) + nz0 * q(7); tmp[2] = nx0 * q(2) + ny0 * q(5) + nz0 * q(8);
    place(tmp[0], tmp[1], tmp[2], out.n, v * 3);
  }
  // put the mouth on the anchor
  const m = new Float32Array(3);
  const mf = mesh.mouthU * NS, mi = Math.floor(mf), ma = mf - mi;
  place(lerp(P[mi * 3], P[(mi + 1) * 3], ma) + mesh.mouthY * F[mi * 9 + 3], lerp(P[mi * 3 + 1], P[(mi + 1) * 3 + 1], ma) + mesh.mouthY * F[mi * 9 + 4], lerp(P[mi * 3 + 2], P[(mi + 1) * 3 + 2], ma) + mesh.mouthY * F[mi * 9 + 5], m, 0);
  const ox = anchor[0] - m[0], oy = anchor[1] - m[1];
  for (let v = 0; v < n; v++) { out.p[v * 3] += ox; out.p[v * 3 + 1] += oy; out.p[v * 3 + 2] /= len; out.n[v * 3] /= len; out.n[v * 3 + 1] /= len; out.n[v * 3 + 2] /= len; }
  for (let i = 0; i <= NS; i++) { place(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], m, 0); out.spine[i * 2] = m[0] + ox; out.spine[i * 2 + 1] = m[1] + oy; }
  return out;
}

// ---- drawing it ----
const VS = `attribute vec3 aP; attribute vec3 aN; attribute vec2 aT; attribute float aK;
uniform vec4 uBox; varying vec3 vN; varying vec2 vT; varying float vK;
void main(){ vN = aN; vT = aT; vK = aK;
  gl_Position = vec4((aP.x - uBox.x)/uBox.z*2. - 1., 1. - (aP.y - uBox.y)/uBox.w*2., clamp(-aP.z*.8, -.99, .99), 1.); }`;
const FS = `precision mediump float;
varying vec3 vN; varying vec2 vT; varying float vK;
uniform sampler2D uTex, uPart; uniform vec3 uAmb, uDif, uRim, uL; uniform float uSpec, uFin;
void main(){
  vec4 c = texture2D(uTex, vT);
  float part = texture2D(uPart, vT).r;
  if (vK < .5) { if (c.a < .45) discard; }
  else { if (part < .5 || c.a < .3) discard; }
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  // screen space: x right, y down, z towards the viewer
  float d = vK > .5 ? abs(dot(N, uL))*.8 + .2 : max(dot(N, uL), 0.);
  vec3 H = normalize(uL + vec3(0., 0., 1.));
  float sp = pow(max(dot(N, H), 0.), 36.)*uSpec*(vK > .5 ? .3 : 1.);
  float rim = pow(1. - abs(N.z), 2.5)*(vK > .5 ? .3 : 1.);
  vec3 col = c.rgb*(uAmb + uDif*d) + sp*vec3(1.) + rim*uRim;
  float a = vK > .5 ? c.a*uFin : c.a;
  gl_FragColor = vec4(col*a, a);
}`;

/** A small WebGL renderer for one fish at a time, drawing into its own canvas; null without WebGL. */
export function createFishRenderer() {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn("FishDock fish: 3D unavailable", e?.message); return null; }
  gl.useProgram(prog);
  const A = {}, U = {};
  for (const n of ["aP", "aN", "aT", "aK"]) A[n] = gl.getAttribLocation(prog, n);
  for (const n of ["uBox", "uTex", "uPart", "uAmb", "uDif", "uRim", "uL", "uSpec", "uFin"]) U[n] = gl.getUniformLocation(prog, n);
  const buf = { p: gl.createBuffer(), n: gl.createBuffer(), t: gl.createBuffer(), k: gl.createBuffer(), i: gl.createBuffer(), f: gl.createBuffer() };
  const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const tTex = tex(0), tPart = tex(1);
  gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uPart, 1);
  let mesh = null, nIdx = 0, nFin = 0;
  const out = {};
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); mesh = null; });
  return {
    canvas,
    get ready() { return !!mesh; },
    /** The species picture (image or canvas), its shape (fishShape) and mesh (buildFishMesh). */
    setFish(img, shape, m) {
      mesh = m;
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const pm = new Uint8Array(shape.w * shape.h * 4);
      for (let i = 0; i < shape.part.length; i++) { const v = shape.part[i] ? 255 : 0; pm[i * 4] = v; pm[i * 4 + 3] = 255; }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPart); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shape.w, shape.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pm);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.t); gl.bufferData(gl.ARRAY_BUFFER, m.uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.k); gl.bufferData(gl.ARRAY_BUFFER, m.kind, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW); nIdx = m.idx.length;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.f); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.finIdx, gl.STATIC_DRAW); nFin = m.finIdx.length;
    },
    /**
     * Draws the fish for one frame. light: { amb, dif, rim: [r, g, b], dir: [x, y, z] (screen, y down), spec }.
     * Returns where it went on screen ({ x, y, w, h }; the picture is the canvas's top-left w x h, from row sy) and
     * the spine on screen (the mouth first), or null if there's nothing to draw.
     */
    render(pose, light) {
      if (!mesh || gl.isContextLost()) return null;
      deformFish(mesh, pose, out);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < out.p.length; i += 3) { x0 = Math.min(x0, out.p[i]); x1 = Math.max(x1, out.p[i]); y0 = Math.min(y0, out.p[i + 1]); y1 = Math.max(y1, out.p[i + 1]); }
      x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2;
      const fw = Math.ceil(x1 - x0) + 3, fh = Math.ceil(y1 - y0) + 3;
      if (!(fw > 1 && fh > 1) || fw > 2048 || fh > 2048) return null;
      if (canvas.width < fw || canvas.height < fh) { canvas.width = Math.max(canvas.width, fw); canvas.height = Math.max(canvas.height, fh); }
      gl.viewport(0, canvas.height - fh, fw, fh);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      gl.uniform4f(U.uBox, x0, y0, fw, fh);
      gl.uniform3fv(U.uAmb, light.amb); gl.uniform3fv(U.uDif, light.dif); gl.uniform3fv(U.uRim, light.rim);
      const L = light.dir, ll = Math.hypot(L[0], L[1], L[2]) || 1; gl.uniform3f(U.uL, L[0] / ll, L[1] / ll, L[2] / ll);
      gl.uniform1f(U.uSpec, light.spec); gl.uniform1f(U.uFin, 0.92);
      const attr = (b, a, data, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0); };
      attr(buf.p, A.aP, out.p, 3); attr(buf.n, A.aN, out.n, 3); attr(buf.t, A.aT, null, 2); attr(buf.k, A.aK, null, 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tTex); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tPart);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.i); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0);
      // fins and tail after the body, blended over it and each other
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.f); gl.drawElements(gl.TRIANGLES, nFin, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      // (the viewport sits at the top-left of the canvas's picture: GL counts rows from the bottom)
      return { x: x0, y: y0, w: fw, h: fh, sy: 0, spine: out.spine };
    },
  };
}
