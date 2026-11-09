// ---- fftSea: the wind sea as a wave spectrum, turned into the water's shape on the graphics card ----
// The Ultra sea. Instead of a handful of sine trains, the short waves (a third of a metre to forty metres long) come
// from a JONSWAP spectrum for the wind over a North Sea fetch, with Hasselmann's directional spread: thousands of
// components at once, each at its deep-water speed, so the surface has the broken, crowding texture of real wind sea,
// with sharp crests (Gerstner-style horizontal displacement) and whitecaps where the crests fold (the Jacobian of the
// displacement goes negative). It is the standard method of film and simulator water (Tessendorf 2001).
//
// All of it runs in fragment shaders: a spectrum pass gives h(k, t) for every wave number, an inverse FFT (Stockham
// radix-2, ping-pong between two float targets, log2(N) passes across then down) turns it into displacement, and a
// derive pass takes slopes and the Jacobian from that. Two cascades of different size cover long and short waves
// without the tiling showing. Per frame at N = 256 that is 2 × (1 + 16 + 1) passes of 65k pixels: well under a
// millisecond on a PC card. The long swell stays the analytic trains in environment.js (angler.js rides those on the
// CPU); the spectrum here is band-limited to the wind sea above them.
import * as THREE from "three";

const G = 9.81;
const GLSL_COMMON = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
  vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
`;
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

// ---- h0(k): the spectrum's amplitude for every wave number, with a gaussian draw per component ----
// JONSWAP (Hasselmann et al. 1973) for wind speed U at 10 m over fetch F, in wave-number space (S(k) = S(ω) dω/dk / k
// for the 2D spectrum), directional spreading cos^2 about the wind with a little energy running the other way, and
// a smooth band: nothing longer than uLongest (the swell trains have that) or shorter than two texels (aliasing).
const H0_FRAG = GLSL_COMMON + /* glsl */`
  uniform float uN, uL, uWindSpeed, uFetch, uSeed, uLongest, uShortest, uGain; uniform vec2 uWindDir;
  const float PI = 3.14159265, GRAV = 9.81;
  float jonswap(float om, float U, float F){
    if (U < .3 || om < 1e-3) return 0.;
    float x = GRAV*F/(U*U);
    float alpha = .076*pow(x, -.22);
    float omp = 22.*pow(GRAV*GRAV/(U*F), 1./3.);
    float sig = om <= omp ? .07 : .09;
    float r = exp(-(om - omp)*(om - omp)/(2.*sig*sig*omp*omp));
    return alpha*GRAV*GRAV/pow(om, 5.)*exp(-1.25*pow(omp/om, 4.))*pow(3.3, r);
  }
  float spread(vec2 kd){ float c = dot(kd, uWindDir); float f = c > 0. ? c*c : .08*c*c; return f*2./PI*1.1; }
  vec2 gauss(vec2 p){ float u1 = max(hash(p), 1e-6), u2 = hash(p + 17.3); float r = sqrt(-2.*log(u1)); return r*vec2(cos(6.2831853*u2), sin(6.2831853*u2)); }
  vec2 amp(vec2 k, vec2 cell){
    float kl = length(k); if (kl < 1e-4) return vec2(0.);
    float om = sqrt(GRAV*kl), dom = GRAV/(2.*om);
    float S = jonswap(om, uWindSpeed, uFetch)*spread(k/kl)*dom/kl;
    float lam = 6.2831853/kl;
    float band = smoothstep(uLongest*1.3, uLongest*.7, lam)*smoothstep(uShortest*.8, uShortest*1.6, lam);
    float dk = 6.2831853/uL;
    // (variance per bin S dk^2, shared between h0(k) and h0(-k): E|h0|^2 = S dk^2 / 2, with E|gauss|^2 = 2)
    return gauss(cell + uSeed)*sqrt(S*dk*dk*band*uGain)*.5;
  }
  void main(){
    vec2 ij = floor(vUv*uN);
    vec2 kk = ij - step(uN*.5, ij)*uN; // FFT order: 0..N/2-1 then -N/2..-1
    vec2 k = kk*6.2831853/uL;
    vec2 ijm = mod(uN - ij, uN); // the texel of -k
    gl_FragColor = vec4(amp(k, ij), amp(-k, ijm));
  }`;

// ---- h(k, t): the spectrum now, packed for one FFT of two signals (rg: height + i·dx, ba: dz + i·0) ----
const SPEC_FRAG = GLSL_COMMON + /* glsl */`
  uniform sampler2D uH0; uniform float uN, uL, uTime, uLambda;
  void main(){
    vec4 h0 = texture2D(uH0, vUv);
    vec2 ij = floor(vUv*uN), kk = ij - step(uN*.5, ij)*uN, k = kk*6.2831853/uL;
    float kl = max(length(k), 1e-5), om = sqrt(9.81*kl), ph = om*uTime;
    vec2 e = vec2(cos(ph), sin(ph));
    vec2 h = cmul(h0.xy, e) + cmul(vec2(h0.z, -h0.w), vec2(e.x, -e.y)); // h0(k)e^{iwt} + conj(h0(-k))e^{-iwt}
    // horizontal displacement: -i (k/|k|) h, scaled by the choppiness
    vec2 dx = vec2(h.y, -h.x)*(k.x/kl)*uLambda, dz = vec2(h.y, -h.x)*(k.y/kl)*uLambda;
    // height + i·dx (both real after the inverse transform, so they ride in one complex signal)
    gl_FragColor = vec4(h + vec2(-dx.y, dx.x), dz);
  }`;

// ---- one Stockham radix-2 pass (inverse: e^{+iθ}), across (uDir 0) or down (uDir 1), on both signals at once ----
const FFT_FRAG = GLSL_COMMON + /* glsl */`
  uniform sampler2D uIn; uniform float uN, uNs, uDir;
  void main(){
    vec2 ij = floor(vUv*uN);
    float x = uDir < .5 ? ij.x : ij.y;
    float ns2 = uNs*2.;
    float blk = floor(x/ns2), pos = x - blk*ns2, k = mod(pos, uNs), sgn = pos < uNs ? 1. : -1.;
    float j = blk*uNs + k;
    float ang = 6.2831853*k/ns2;
    vec2 tw = vec2(cos(ang), sin(ang));
    vec2 a = uDir < .5 ? vec2(j, ij.y) : vec2(ij.x, j);
    vec2 b = uDir < .5 ? vec2(j + uN*.5, ij.y) : vec2(ij.x, j + uN*.5);
    vec4 v0 = texture2D(uIn, (a + .5)/uN), v1 = texture2D(uIn, (b + .5)/uN);
    vec4 t = vec4(cmul(v1.xy, tw), cmul(v1.zw, tw));
    gl_FragColor = v0 + sgn*t;
  }`;

// ---- the displacement map: (dx, dy, dz) in metres, from the transform's real and imaginary parts ----
const DISP_FRAG = GLSL_COMMON + /* glsl */`
  uniform sampler2D uIn; uniform float uN;
  // (no 1/N^2: the amplitudes already carry the bin size, h(x) = sum of h(k) e^{ikx})
  void main(){ vec4 v = texture2D(uIn, vUv); gl_FragColor = vec4(v.y, v.x, v.z, 0.); }`;

// ---- slopes and the Jacobian, by central differences over the displaced grid ----
// r, g: the surface's slope (dy/dx, dy/dz, with the horizontal displacement's stretch taken into account); b: the
// Jacobian of the horizontal displacement (below about .5 the crest has folded over itself: foam); a: the height
const DERIVE_FRAG = GLSL_COMMON + /* glsl */`
  uniform sampler2D uDisp; uniform float uN, uL, uJK;
  void main(){
    float e = 1./uN, d = uL/uN;
    vec3 c = texture2D(uDisp, vUv).xyz;
    vec3 xp = texture2D(uDisp, vUv + vec2(e, 0.)).xyz, xm = texture2D(uDisp, vUv - vec2(e, 0.)).xyz;
    vec3 zp = texture2D(uDisp, vUv + vec2(0., e)).xyz, zm = texture2D(uDisp, vUv - vec2(0., e)).xyz;
    float dxdx = (xp.x - xm.x)/(2.*d), dzdz = (zp.z - zm.z)/(2.*d), dxdz = (zp.x - zm.x)/(2.*d), dzdx = (xp.z - xm.z)/(2.*d);
    float dydx = (xp.y - xm.y)/(2.*d), dydz = (zp.y - zm.y)/(2.*d);
    // (uJK: the Jacobian taken as if the crests were drawn together uJK times more than they are displaced, so
    // whitecaps appear at the steepness a real sea breaks at while the drawn sea keeps a size the pier can live with)
    float J = (1. + uJK*dxdx)*(1. + uJK*dzdz) - uJK*uJK*dxdz*dzdx;
    gl_FragColor = vec4(dydx/max(1. + dxdx, .2), dydz/max(1. + dzdz, .2), J, c.y);
  }`;

// ---- foam that lingers: born where the Jacobian folds, fading over a few seconds (a whitecap's bubbles outlast the
// crest that made them, and drift off as a streak behind it) ----
const FOAM_FRAG = GLSL_COMMON + /* glsl */`
  uniform sampler2D uDer, uPrev; uniform float uDecay, uBirth;
  void main(){
    float J = texture2D(uDer, vUv).b, prev = texture2D(uPrev, vUv).r;
    float born = smoothstep(.72, .42, J)*uBirth;
    gl_FragColor = vec4(max(born, prev*uDecay), 0., 0., 1.);
  }`;

/**
 * @param renderer THREE.WebGLRenderer
 * @param o.N texture size (power of two); o.cascades [{ L (metres a tile), longest, shortest (metres) }]
 * @returns { cascades: [{ disp, der, L }], update(renderer, t, { windKph, windDir:[x,z], fetchKm }), dispose(), ok }
 */
export function createFftSea(renderer, { N = 256, cascades = [{ L: 256, longest: 64, shortest: 3 }, { L: 24, longest: 3.6, shortest: 0.25 }], seed = 7 } = {}) {
  const gl2 = renderer.capabilities.isWebGL2;
  const floatOk = gl2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.get("EXT_color_buffer_float"));
  if (!gl2) return null;
  const T = floatOk ? THREE.FloatType : THREE.HalfFloatType;
  const rt = (type, filter = THREE.NearestFilter, mips = false) => new THREE.WebGLRenderTarget(N, N, { type, format: THREE.RGBAFormat, minFilter: mips ? THREE.LinearMipmapLinearFilter : filter, magFilter: filter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: mips, depthBuffer: false, stencilBuffer: false });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const scene = new THREE.Scene(); scene.add(quad);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const run = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(scene, cam); };
  const log2N = Math.round(Math.log2(N));
  const C = cascades.map((c, i) => {
    const h0 = rt(T), ping = rt(T), pong = rt(T);
    const disp = rt(THREE.HalfFloatType, THREE.LinearFilter, false), der = rt(THREE.HalfFloatType, THREE.LinearFilter, true);
    der.texture.anisotropy = 4;
    const foamA = rt(THREE.HalfFloatType, THREE.LinearFilter, true), foamB = rt(THREE.HalfFloatType, THREE.LinearFilter, true);
    return {
      L: c.L, longest: c.longest, shortest: c.shortest, h0, ping, pong, disp: disp, der, foamA, foamB, foamOut: foamA, seed: seed + i * 31,
      mFoam: mat(FOAM_FRAG, { uDer: { value: der.texture }, uPrev: { value: null }, uDecay: { value: 0.9 }, uBirth: { value: 1 } }),
      mH0: mat(H0_FRAG, { uN: { value: N }, uL: { value: c.L }, uWindSpeed: { value: 0 }, uFetch: { value: 80000 }, uSeed: { value: seed + i * 31 }, uLongest: { value: c.longest }, uShortest: { value: Math.max(c.shortest, (2.2 * c.L) / N) }, uGain: { value: 1 }, uWindDir: { value: new THREE.Vector2(0, -1) } }),
      mSpec: mat(SPEC_FRAG, { uH0: { value: h0.texture }, uN: { value: N }, uL: { value: c.L }, uTime: { value: 0 }, uLambda: { value: 1.1 } }),
      mDisp: mat(DISP_FRAG, { uIn: { value: null }, uN: { value: N } }),
      mDer: mat(DERIVE_FRAG, { uDisp: { value: disp.texture }, uN: { value: N }, uL: { value: c.L }, uJK: { value: 2.6 } }),
      windKey: "",
    };
  });
  const mFft = mat(FFT_FRAG, { uIn: { value: null }, uN: { value: N }, uNs: { value: 1 }, uDir: { value: 0 } });
  let frame = 0, lastT = null;
  function update(t, { windKph = 12, windDir = [0, -1], fetchKm = 80, gain = 1, lambda = 1.1, foamK = 2.6, foamLife = 5 } = {}) {
    const dt = lastT == null ? 0.016 : Math.max(0, Math.min(0.5, t - lastT)); lastT = t;
    const prevT = renderer.getRenderTarget(), prevAuto = renderer.autoClear; renderer.autoClear = false;
    const U = Math.max(0, windKph) / 3.6, dl = Math.hypot(windDir[0], windDir[1]) || 1;
    for (const c of C) {
      // the spectrum's amplitudes change only when the wind does (rounded, so eased wind doesn't redraw every frame)
      const key = `${Math.round(U * 4)}|${Math.round(windDir[0] / dl * 20)}|${Math.round(windDir[1] / dl * 20)}|${fetchKm}|${gain}`;
      if (key !== c.windKey) { c.windKey = key; const u = c.mH0.uniforms; u.uWindSpeed.value = U; u.uFetch.value = fetchKm * 1000; u.uGain.value = gain; u.uWindDir.value.set(windDir[0] / dl, windDir[1] / dl); run(c.mH0, c.h0); }
      c.mSpec.uniforms.uTime.value = t; c.mSpec.uniforms.uLambda.value = lambda; run(c.mSpec, c.ping);
      let src = c.ping, dst = c.pong;
      for (let dir = 0; dir < 2; dir++) for (let s = 0; s < log2N; s++) { mFft.uniforms.uIn.value = src.texture; mFft.uniforms.uNs.value = 1 << s; mFft.uniforms.uDir.value = dir; run(mFft, dst); [src, dst] = [dst, src]; }
      c.mDisp.uniforms.uIn.value = src.texture; run(c.mDisp, c.disp);
      c.mDer.uniforms.uJK.value = foamK; run(c.mDer, c.der);
      // the foam: this frame's births over what was left of last frame's (only the long cascade: a wavelet's fold is not a whitecap)
      if (c === C[0]) { const prev = c.foamOut, next = prev === c.foamA ? c.foamB : c.foamA; c.mFoam.uniforms.uPrev.value = prev.texture; c.mFoam.uniforms.uDecay.value = Math.exp(-dt / foamLife); run(c.mFoam, next); c.foamOut = next; }
    }
    renderer.setRenderTarget(prevT); renderer.autoClear = prevAuto; frame++;
  }
  return {
    ok: true, N, floatOk: !!floatOk,
    _c: C, // (checks only)
    cascades: C.map((c) => ({ L: c.L, disp: c.disp.texture, der: c.der.texture })),
    /** the lingering foam of the long cascade (r), the texture to sample this frame */
    get foam() { return C[0].foamOut.texture; },
    update, get frames() { return frame; },
    dispose() { for (const c of C) { for (const k of ["h0", "ping", "pong", "disp", "der", "foamA", "foamB"]) c[k].dispose(); for (const k of ["mH0", "mSpec", "mDisp", "mDer", "mFoam"]) c[k].dispose(); } mFft.dispose(); quad.geometry.dispose(); },
  };
}
