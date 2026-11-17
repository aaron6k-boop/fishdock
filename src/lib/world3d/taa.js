// ---- taa: temporal antialiasing, the picture steadied over frames without ghosts ----
// Multisampling smooths an edge within one frame, but a railing, the line or a ripple thinner than a pixel still lands
// on different samples from frame to frame as the view moves, and crawls. Here each frame is drawn from a slightly
// different point within the pixel (a jitter of under half a pixel, in a fixed order of eight), and blended with what
// that same point of the world looked like last frame: over a few frames that is many samples a pixel, and still.
// Where last frame is found: every pixel's depth gives its point in the world; last frame's camera says where that
// point was on the screen then. FishDock's sea, sky, skin and line are drawn by their own shaders, which give no
// motion of their own, so anything that moved by itself (the sea's waves, the fish, the rod, your hands, rain) is held
// to this frame's colours round the pixel (the history is clipped to the 3 x 3 neighbourhood's spread of colour,
// in YCoCg): last frame's colour is only kept where it is one this pixel could have now. That is what stops ghosts
// and smears. Blending is weighted by brightness (on tone-mapped values), so a single bright glint doesn't flare.
// A jump of the camera (a cut in the landing shot, a teleport) starts the history again.
// The depth is the ambient occlusion pass's own (drawn without multisampling, this frame, with this frame's jitter):
// the multisampled picture's depth, resolved into a texture after every pass, halved the frame rate on Aaron's PC
// (ANGLE on Direct3D resolves multisampled depth by drawing it). So it runs after the ambient occlusion, and only with
// it on (High and Ultra): without, the picture goes through as it is.
import * as THREE from "three";
import { Pass, FullScreenQuad } from "./vendor/three-post/postprocessing/Pass.js";

// the jitter: the Halton sequence in base 2 and 3, eight points round the pixel's middle (in pixels)
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
export const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

const TAAShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tHistory: { value: null }, uCurInv: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uReset: { value: 1 }, uBlend: { value: 0.1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }",
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tDepth, tHistory; uniform mat4 uCurInv, uPrevVP; uniform vec2 uTexel; uniform float uReset, uBlend; varying vec2 vUv;
    vec3 tm(vec3 c){ return c/(1. + max(c.r, max(c.g, c.b))); }
    vec3 itm(vec3 c){ return c/max(1e-4, 1. - max(c.r, max(c.g, c.b))); }
    vec3 toY(vec3 c){ return vec3(.25*c.r + .5*c.g + .25*c.b, .5*c.r - .5*c.b, -.25*c.r + .5*c.g - .25*c.b); }
    vec3 fromY(vec3 y){ return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
    // last frame's picture, sharp: a Catmull-Rom sample (five taps), not the bilinear blur that softens a still view
    vec3 histAt(vec2 uv){
      vec2 sz = 1./uTexel, p = uv*sz - .5, f = fract(p), c = floor(p) + .5;
      vec2 w0 = f*(-.5 + f*(1. - .5*f)), w1 = 1. + f*f*(-2.5 + 1.5*f), w2 = f*(.5 + f*(2. - 1.5*f)), w3 = f*f*(-.5 + .5*f);
      vec2 w12 = w1 + w2, o12 = w2/w12;
      vec2 t0 = (c - 1.)*uTexel, t3 = (c + 2.)*uTexel, t12 = (c + o12)*uTexel;
      vec3 r = texture2D(tHistory, vec2(t12.x, t0.y)).rgb*w12.x*w0.y + texture2D(tHistory, vec2(t0.x, t12.y)).rgb*w0.x*w12.y
        + texture2D(tHistory, t12).rgb*w12.x*w12.y + texture2D(tHistory, vec2(t3.x, t12.y)).rgb*w3.x*w12.y + texture2D(tHistory, vec2(t12.x, t3.y)).rgb*w12.x*w3.y;
      float wsum = w12.x*w0.y + w0.x*w12.y + w12.x*w12.y + w3.x*w12.y + w12.x*w3.y;
      return max(r/wsum, 0.);
    }
    void main(){
      vec4 cur4 = texture2D(tDiffuse, vUv); vec3 cur = toY(tm(cur4.rgb));
      // the neighbourhood: its mean and spread of colour, and its nearest depth (so an edge moves with what's in front)
      vec3 m1 = vec3(0.), m2 = vec3(0.); float dMin = 1.;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y))*uTexel; vec3 c = toY(tm(texture2D(tDiffuse, vUv + o).rgb)); m1 += c; m2 += c*c;
        dMin = min(dMin, texture2D(tDepth, vUv + o).x);
      }
      m1 /= 9.; m2 /= 9.; vec3 sd = sqrt(max(m2 - m1*m1, 0.));
      // where this point of the world was on the screen last frame
      vec4 wp = uCurInv*vec4(vUv*2. - 1., dMin*2. - 1., 1.); wp /= wp.w;
      vec4 pc = uPrevVP*wp; vec2 pUv = pc.xy/pc.w*.5 + .5;
      if (uReset > .5 || pc.w <= 0. || pUv.x < 0. || pUv.y < 0. || pUv.x > 1. || pUv.y > 1.) { gl_FragColor = cur4; return; }
      vec3 h = toY(tm(histAt(pUv)));
      // held to what this pixel could be now (clipped towards the neighbourhood's mean, inside its spread)
      vec3 lo = m1 - sd*1.25, hi = m1 + sd*1.25, ctr = .5*(hi + lo), ext = .5*(hi - lo) + 1e-4;
      vec3 dv = h - ctr; vec3 a3 = abs(dv/ext); float am = max(a3.x, max(a3.y, a3.z)); if (am > 1.) h = ctr + dv/am;
      // faster to this frame where the view moved a lot (more of last frame is a guess)
      float vel = length((pUv - vUv)/uTexel), k = mix(uBlend, .4, clamp(vel/12., 0., 1.));
      vec3 o = mix(h, cur, k);
      gl_FragColor = vec4(itm(fromY(o)), cur4.a);
    }`,
};

export class TAAPass extends Pass {
  constructor(camera, w, h) {
    super();
    this.camera = camera; this.needsSwap = true; this.frame = 0; this.reset = true; this.on = true;
    this.mat = new THREE.ShaderMaterial({ ...TAAShader, uniforms: THREE.UniformsUtils.clone(TAAShader.uniforms), depthTest: false, depthWrite: false });
    this.copy = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: TAAShader.vertexShader, fragmentShader: "uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }", depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
    const mk = () => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.hist = [mk(), mk()];
    this.prevVP = new THREE.Matrix4(); this.prevPos = new THREE.Vector3(); this.prevDir = new THREE.Vector3(); this.P0 = new THREE.Matrix4();
    this.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }
  setSize(w, h) { for (const t of this.hist) t.setSize(w, h); this.mat.uniforms.uTexel.value.set(1 / w, 1 / h); this.reset = true; }
  /** before the scene is drawn: this frame's jitter (w, h: the picture's size in pixels) */
  jitter(w, h) {
    const c = this.camera; c.updateMatrixWorld(); this.P0.copy(c.projectionMatrix);
    if (!this.on) return;
    const [jx, jy] = JITTER[this.frame % JITTER.length];
    c.setViewOffset(w, h, jx, jy, w, h);
  }
  /** after: the camera back as it was, and its view kept for next frame */
  unjitter() {
    const c = this.camera; if (this.on) c.clearViewOffset();
    // (a cut or a jump: the history is started again)
    const dir = c.getWorldDirection(new THREE.Vector3());
    if (c.position.distanceTo(this.prevPos) > 1.5 || dir.dot(this.prevDir) < 0.94) this.reset = true;
    this.prevPos.copy(c.position); this.prevDir.copy(dir);
    this.prevVP.multiplyMatrices(this.P0, c.matrixWorldInverse);
    this.frame++;
  }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.mat.uniforms, c = this.camera;
    const depth = this.depthSource ? this.depthSource() : readBuffer.depthTexture;
    if (!this.on || !depth) { this.copy.uniforms.t.value = readBuffer.texture; this.quad.material = this.copy; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer); this.reset = true; return; }
    const src = this.hist[this.frame % 2], dst = this.hist[(this.frame + 1) % 2];
    U.tDiffuse.value = readBuffer.texture; U.tDepth.value = depth; U.tHistory.value = src.texture;
    // (the depth was drawn with the jittered camera: undone with the same)
    U.uCurInv.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).invert();
    U.uPrevVP.value.copy(this.prevVP); U.uReset.value = this.reset ? 1 : 0;
    this.quad.material = this.mat; renderer.setRenderTarget(dst); this.quad.render(renderer);
    this.copy.uniforms.t.value = dst.texture; this.quad.material = this.copy; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
    this.reset = false;
  }
  dispose() { this.mat.dispose(); this.copy.dispose(); this.quad.dispose(); for (const t of this.hist) t.dispose(); }
}
