// ---- fatLine: a fishing line as a fine, lit thread rather than a hard one-pixel hairline ----
// A ribbon facing the camera, built from the same points a THREE.Line would use (read from the shared array each
// frame, so whatever moves the line moves this). Its width is the line's real thickness as it would show at that
// distance, never less than about a pixel; where the real line would be thinner than a pixel it fades instead of
// shrinking, as fine line does to the eye (close by it reads as a thread, far out a faint trace you can still follow).
// The edges are softened over a pixel, so it never crawls or steps as it moves.
// It is lit as a thin fibre is: clear monofilament takes a little of the sky's light and the sun's, and throws back a
// narrow highlight wherever it lies square to the light (a cylinder's highlight runs round it, so it shows as glints
// along the line, not a glow over it). The glints sit on the line itself and travel with it as it's wound in or let
// out (uFeed: metres of line through the rings), so you can see the line moving through the rings as you reel.
import * as THREE from "three";

const VS = /* glsl */`
  attribute vec3 aN; attribute vec3 aV; attribute float aS; attribute float aU;
  uniform vec2 uRes; uniform float uThick, uMin, uFade;
  varying float vD, vHalf, vA, vU; varying vec3 vT, vP;
  void main(){
    mat4 mvp = projectionMatrix*modelViewMatrix;
    vec4 c = mvp*vec4(position, 1.), n = mvp*vec4(aN, 1.), p = mvp*vec4(aV, 1.);
    vec2 sn = n.xy/max(n.w, 1e-4), sp = p.xy/max(p.w, 1e-4);
    vec2 d = (sn - sp)*uRes; float L = length(d); d = L > 1e-5 ? d/L : vec2(1., 0.);
    vec2 nrm = vec2(-d.y, d.x);
    // the real thickness in pixels at this distance (projectionMatrix[1][1]: the view's vertical scale)
    float px = uThick*uRes.y*projectionMatrix[1][1]/(2.*max(c.w, 1e-3));
    float w = max(px, uMin);
    vA = clamp(px/uMin, uFade, 1.);
    vHalf = w*.5; vD = aS*(vHalf + 1.);
    // (for the light: the line's direction and this point, in the camera's space)
    vec3 tv = (modelViewMatrix*vec4(aN - aV, 0.)).xyz; vT = length(tv) > 1e-6 ? normalize(tv) : vec3(1., 0., 0.);
    vP = (modelViewMatrix*vec4(position, 1.)).xyz; vU = aU;
    c.xy += nrm*vD/uRes*2.*c.w;
    gl_Position = c;
  }`;
const FS = /* glsl */`
  uniform vec3 uColor, uSunDir, uSunCol, uAmb; uniform float uOpacity, uFeed, uGloss;
  varying float vD, vHalf, vA, vU; varying vec3 vT, vP;
  float h1(float x){ return fract(sin(x*12.9898)*43758.5453); }
  void main(){
    float a = 1. - smoothstep(vHalf - .5, vHalf + .5, abs(vD));
    // a thin cylinder lit by the sun (Kajiya-Kay: how square the line lies to the light, and to the half-way direction)
    vec3 T = normalize(vT), V = normalize(-vP), Ld = normalize((viewMatrix*vec4(uSunDir, 0.)).xyz), H = normalize(Ld + V);
    float tl = dot(T, Ld), th = dot(T, H);
    float diff = sqrt(max(0., 1. - tl*tl))*.55 + .2;
    float sth = sqrt(max(0., 1. - th*th));
    // (the highlight broken up a little along the line, as a real line's twists and drops of water break it: these
    // marks are on the line, so they ride in or out through the rings with it)
    float u = vU + uFeed, k = floor(u*7.); // (a mark on the line: wound in, it moves towards the reel)
    float spark = mix(.55, 1., h1(k))*(.8 + .2*sin(u*41.));
    float spec = (pow(sth, 90.)*.9 + pow(sth, 14.)*.06)*uGloss*spark;
    vec3 col = uColor*(uAmb + uSunCol*diff*.5) + uSunCol*spec;
    float alpha = a*(uOpacity*vA + min(.6, spec*.5)*mix(vA, 1., .6));
    gl_FragColor = vec4(col, clamp(alpha, 0., 1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// the scene's sun and sky, found once (the lights live as long as the scene), read every frame
const SUN = new THREE.Vector3(), SUNC = new THREE.Color(), AMB = new THREE.Color(), tmpC = new THREE.Color();
let lightScene = null, sunLight = null, hemi = null, amb = null;
function readLights(scene) {
  if (scene !== lightScene) {
    lightScene = scene; sunLight = null; hemi = null; amb = null;
    scene.traverse((o) => { if (o.isDirectionalLight && (!sunLight || o.castShadow)) sunLight = o; else if (o.isHemisphereLight && !hemi) hemi = o; else if (o.isAmbientLight && !amb) amb = o; });
  }
  if (sunLight) { SUN.copy(sunLight.position).sub(sunLight.target.position).normalize(); SUNC.copy(sunLight.color).multiplyScalar(sunLight.intensity); } else { SUN.set(0.3, 0.8, 0.2).normalize(); SUNC.setRGB(1, 1, 1); }
  AMB.setRGB(0, 0, 0);
  if (hemi) AMB.add(tmpC.copy(hemi.color).lerp(hemi.groundColor, 0.4).multiplyScalar(hemi.intensity));
  if (amb) AMB.add(tmpC.copy(amb.color).multiplyScalar(amb.intensity));
  if (!hemi && !amb) AMB.setRGB(0.5, 0.55, 0.6);
}

/**
 * A line mesh drawn from `src` (a Float32Array of xyz points, `count` of them, or `count()` for a changing number).
 * thick: the real line's diameter in metres. Call mesh.userData.sync() whenever its points change, and set
 * mesh.userData.feed (metres of line wound in) to move the glints with the line.
 */
export function fatLine(src, count, { color = 0xc3ced6, opacity = 0.68, thick = 0.00035, minPx = 1, fade = 0.24, gloss = 1 } = {}) {
  const N = src.length / 3;
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(N * 2 * 3), Nx = new Float32Array(N * 2 * 3), Vx = new Float32Array(N * 2 * 3), S = new Float32Array(N * 2), U = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { S[i * 2] = 1; S[i * 2 + 1] = -1; }
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("aN", new THREE.BufferAttribute(Nx, 3));
  geo.setAttribute("aV", new THREE.BufferAttribute(Vx, 3)); geo.setAttribute("aS", new THREE.BufferAttribute(S, 1)); geo.setAttribute("aU", new THREE.BufferAttribute(U, 1));
  for (const k of ["position", "aN", "aV", "aU"]) geo.attributes[k].setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(idx);
  const res = new THREE.Vector2(1, 1);
  const uni = {
    uRes: { value: res }, uThick: { value: thick }, uMin: { value: minPx }, uFade: { value: fade }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
    uSunDir: { value: SUN }, uSunCol: { value: SUNC }, uAmb: { value: AMB }, uFeed: { value: 0 }, uGloss: { value: gloss },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, uniforms: uni });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  const n = () => Math.max(2, Math.min(N, typeof count === "function" ? count() : count));
  mesh.userData.feed = 0;
  mesh.onBeforeRender = (renderer, scene) => { renderer.getDrawingBufferSize(res); readLights(scene); uni.uFeed.value = mesh.userData.feed; };
  // (called where the points change, the same frame: done in onBeforeRender, the geometry had already gone up for that
  // frame, so the line trailed a frame behind the rod tip)
  mesh.userData.sync = () => {
    const k = n(); let along = 0;
    for (let i = 0; i < k; i++) {
      const j = i * 3, jn = Math.min(k - 1, i + 1) * 3, jv = Math.max(0, i - 1) * 3;
      if (i > 0) along += Math.hypot(src[j] - src[jv], src[j + 1] - src[jv + 1], src[j + 2] - src[jv + 2]);
      U[i * 2] = U[i * 2 + 1] = along;
      for (let s = 0; s < 2; s++) { const o = (i * 2 + s) * 3; for (let c = 0; c < 3; c++) { P[o + c] = src[j + c]; Nx[o + c] = src[jn + c]; Vx[o + c] = src[jv + c]; } }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aN.needsUpdate = true; geo.attributes.aV.needsUpdate = true; geo.attributes.aU.needsUpdate = true;
    geo.setDrawRange(0, (k - 1) * 6);
  };
  return mesh;
}
