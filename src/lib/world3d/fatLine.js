// ---- fatLine: a fishing line as a fine, smooth thread rather than a hard one-pixel hairline ----
// A ribbon facing the camera, built from the same points a THREE.Line would use (read from the shared array each
// frame, so whatever moves the line moves this). Its width is the line's real thickness as it would show at that
// distance, never less than about a pixel; where the real line would be thinner than a pixel it fades instead of
// shrinking, as fine line does to the eye (close by it reads as a thread, far out a faint trace you can still follow).
// The edges are softened over a pixel, so it never crawls or steps as it moves.
import * as THREE from "three";

const VS = /* glsl */`
  attribute vec3 aN; attribute vec3 aV; attribute float aS;
  uniform vec2 uRes; uniform float uThick, uMin;
  varying float vD, vHalf, vA;
  void main(){
    mat4 mvp = projectionMatrix*modelViewMatrix;
    vec4 c = mvp*vec4(position, 1.), n = mvp*vec4(aN, 1.), p = mvp*vec4(aV, 1.);
    vec2 sc = c.xy/max(c.w, 1e-4), sn = n.xy/max(n.w, 1e-4), sp = p.xy/max(p.w, 1e-4);
    vec2 d = (sn - sp)*uRes; float L = length(d); d = L > 1e-5 ? d/L : vec2(1., 0.);
    vec2 nrm = vec2(-d.y, d.x);
    // the real thickness in pixels at this distance (projectionMatrix[1][1]: the view's vertical scale)
    float px = uThick*uRes.y*projectionMatrix[1][1]/(2.*max(c.w, 1e-3));
    float w = max(px, uMin);
    vA = clamp(px/uMin, .38, 1.);
    vHalf = w*.5; vD = aS*(vHalf + 1.);
    c.xy += nrm*vD/uRes*2.*c.w;
    gl_Position = c;
  }`;
const FS = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity;
  varying float vD, vHalf, vA;
  void main(){
    float a = 1. - smoothstep(vHalf - .5, vHalf + .5, abs(vD));
    gl_FragColor = vec4(uColor, uOpacity*a*vA);
    #include <colorspace_fragment>
  }`;

/**
 * A line mesh drawn from `src` (a Float32Array of xyz points, `count` of them, or `count()` for a changing number).
 * thick: the real line's diameter in metres. Add it where the THREE.Line was; call mesh.userData.sync() whenever its points change.
 */
export function fatLine(src, count, { color = 0xe8eef2, opacity = 0.85, thick = 0.0006, minPx = 1.1 } = {}) {
  const N = src.length / 3;
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(N * 2 * 3), Nx = new Float32Array(N * 2 * 3), Vx = new Float32Array(N * 2 * 3), S = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { S[i * 2] = 1; S[i * 2 + 1] = -1; }
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("aN", new THREE.BufferAttribute(Nx, 3));
  geo.setAttribute("aV", new THREE.BufferAttribute(Vx, 3)); geo.setAttribute("aS", new THREE.BufferAttribute(S, 1));
  geo.setIndex(idx);
  const res = new THREE.Vector2(1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
    uniforms: { uRes: { value: res }, uThick: { value: thick }, uMin: { value: minPx }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const n = () => Math.max(2, Math.min(N, typeof count === "function" ? count() : count));
  mesh.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(res); };
  // (called where the points change, the same frame: done in onBeforeRender, the geometry had already gone up for that
  // frame, so the line trailed a frame behind the rod tip)
  mesh.userData.sync = () => {
    const k = n();
    for (let i = 0; i < k; i++) {
      const j = i * 3, jn = Math.min(k - 1, i + 1) * 3, jv = Math.max(0, i - 1) * 3;
      for (let s = 0; s < 2; s++) { const o = (i * 2 + s) * 3; for (let c = 0; c < 3; c++) { P[o + c] = src[j + c]; Nx[o + c] = src[jn + c]; Vx[o + c] = src[jv + c]; } }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aN.needsUpdate = true; geo.attributes.aV.needsUpdate = true;
    geo.setDrawRange(0, (k - 1) * 6);
  };
  return mesh;
}
