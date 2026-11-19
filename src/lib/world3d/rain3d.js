// ---- rain3d: rain as it is seen from a pier: streaks, curtains in the distance, splashes on the deck ----
// Three layers, as the eye sees rain:
//  - near drops, as streaks: each drop a thin ribbon along its path (a falling drop is seen drawn out over the time the
//    eye takes it in), turned to face you about that path, as thin as a drop where it covers a pixel and fainter where
//    it is further off than a pixel shows (so the rain has depth: bold close by, a fine grey further out). Each lies
//    in the world, not on the screen, and falls and drifts with the wind on the graphics card (nothing per drop on the
//    processor), slanting as the wind blows. A drop is clear water: it shows the light of the sky behind you, bright
//    against the dark sea and the deck, almost lost against a bright sky; looking towards the sun it glints, and after
//    dark it is invisible except in a lamp's light or your head torch, where it shines (brightest between you and the
//    lamp, where it throws the light forward).
//  - the rain further off, as curtains round you at 16 and 42 metres: fine streaks falling in columns, slanted the
//    same way, and gathered into sheets that drift through on the wind (rain does not fall evenly: it comes in veils),
//    with a faint grey haze of their own in heavy rain.
//  - splashes where the drops land on the deck round you: a little crown of droplets thrown up and out, gone in a
//    third of a second, as many as the rain is heavy. (On the water, the rings and roughening are the sea's own:
//    environment.js. The deck's darkening, its puddles and their rings are wetLook.js.)
// None of it is measured at Gorleston: it is how rain looks in general (drop sizes and speeds after Gunn and Kinzer:
// light rain's small drops fall at 4 to 6 m/s, heavy rain's at 8 to 9).
import * as THREE from "three";
import { SCATTER } from "./fogScatter.js";

/** How the rain is drawn for an amount (0 dry to 1 a downpour), the wind (0 to 1 of a near gale) and a quality (0.5
 * Performance, 1 Balanced, 2 High and Ultra). Pure. */
export function rainPlan(amount = 0, wind = 0, q = 1) {
  const a = Math.max(0, Math.min(1, Number(amount) || 0)), w = Math.max(0, Math.min(1, Number(wind) || 0)), Q = Math.max(0.5, Math.min(2, Number(q) || 1));
  const drops = Math.round(2600 * Q * (Q > 1 ? 1.9 : 1)), on = a <= 0.02 ? 0 : Math.min(1, 0.1 + 0.9 * a * a); // (a drizzle is a few drops about you, a downpour fills the air)
  const fall = 4.6 + 4.2 * a; // m/s: light rain's small drops to a downpour's big ones
  return {
    drops, on, fall,
    drift: 12.5 * w * 0.8, // m/s across the ground: the wind's own speed (45 km/h is 12.5 m/s) less a little
    // (short: at 0.055 to 0.085 s a drop near you drew a line a sixth of the screen long, and the rain read as white
    // scratches over the picture (Aaron's phone screenshots, 19 November); each fainter too)
    len: 0.028 + 0.016 * a, // seconds of travel a streak shows (the eye's blur as much as the drop's speed)
    width: 0.003 + 0.002 * a, // m: a drop and the blur round it
    curtains: Q < 1.5 ? 1 : 2, // (one on a phone: each is a pass over the whole picture)
    sheet: on ? 0.05 + 0.32 * a * a : 0, // how much the curtains show
    splashes: Math.round((Q < 0.75 ? 60 : Q < 1.5 ? 150 : 320) * (a <= 0.02 ? 0 : 1)),
    every: a <= 0.02 ? Infinity : 0.25 + 1.6 * (1 - a) * (1 - a), // s between a splash place's splashes
  };
}

const LIGHT_GLSL = /* glsl */`
  uniform vec3 uLight, uSunD, uSunC, uLampC, uTorchP, uTorchD, uTorchC; uniform vec4 uLamps[4];
  // the light a drop at p shows to an eye looking along view (unit, from the eye): the sky's, the sun's glint when you
  // look towards it, the lamps' (strongest with the lamp behind the drop, which throws its light on towards you) and the
  // head torch's in its beam
  vec3 dropLight(vec3 p, vec3 view) {
    vec3 c = uLight + uSunC * (pow(max(0.0, dot(view, uSunD)), 10.0) * 0.9);
    for (int i = 0; i < 4; i++) {
      vec3 L = p - uLamps[i].xyz; float d2 = dot(L, L), d = sqrt(d2);
      c += uLampC * uLamps[i].w * (0.35 + 3.5 * pow(max(0.0, dot(L / max(d, 1e-3), -view)), 5.0)) / (1.0 + d2 * 0.22);
    }
    vec3 T = p - uTorchP; float dt = length(T), cs = dot(T / max(dt, 1e-3), uTorchD);
    c += uTorchC * smoothstep(0.9, 0.975, cs) * (1.2 + 1.5 * pow(max(0.0, cs), 30.0)) / (1.0 + dt * dt * 0.06);
    return c;
  }`;

const HASH_GLSL = /* glsl */`
  float rh(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float rn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(rh(i), rh(i + vec2(1.0, 0.0)), f.x), mix(rh(i + vec2(0.0, 1.0)), rh(i + vec2(1.0, 1.0)), f.x), f.y); }`;

export function createRain(parent, { quality = 1, floorAt = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = "fdRain"; group.visible = false; parent.add(group);
  const P0 = rainPlan(1, 0, quality), N = P0.drops;
  const BOX = new THREE.Vector3(22, 14, 22);
  const shared = {
    uLight: { value: new THREE.Color(0.5, 0.5, 0.5) }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(0, 0, 0) },
    uLampC: { value: new THREE.Color(1.0, 0.72, 0.42) }, uLamps: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
    uTorchP: { value: new THREE.Vector3() }, uTorchD: { value: new THREE.Vector3(0, 0, -1) }, uTorchC: { value: new THREE.Color(0, 0, 0) },
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uFall: { value: 7 }, uWind: { value: new THREE.Vector2() },
  };
  const fogU = () => ({ ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), fdSunDir: { value: SCATTER.dir }, fdSunCol: { value: SCATTER.col } });

  // ---- the near drops ----
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute("aCorner", new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
  quad.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3)); // (unused: three wants one)
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(N * 4); for (let i = 0; i < N; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = (i + Math.random()) / N; }
  quad.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4)); quad.instanceCount = N;
  const dropMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...fogU(), uBox: { value: BOX }, uLen: { value: 0.05 }, uWidth: { value: 0.002 }, uPix: { value: 0.0012 }, uAlpha: { value: 0.5 } },
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, // (a streak drawn down its path from the drop turns its back to you: both faces drawn)
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aSeed;
      uniform float uTime, uAmount, uFall, uLen, uWidth, uPix, uAlpha; uniform vec3 uCam, uBox; uniform vec2 uWind;
      varying vec2 vC; varying float vA; varying vec3 vCol;
      ${LIGHT_GLSL}
      #include <fog_pars_vertex>
      void main() {
        if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float r1 = fract(aSeed.w * 97.13 + aSeed.x * 7.1), r2 = fract(aSeed.w * 53.71 + aSeed.y * 3.3), r3 = fract(aSeed.w * 31.17 + aSeed.z * 5.9);
        // (each drop its own size: the big ones fall faster and are carried less by the wind)
        float sz = 0.7 + 0.6 * r1;
        vec3 vel = vec3(uWind.x * (1.15 - 0.3 * r1), -uFall * (0.8 + 0.3 * r1), uWind.y * (1.15 - 0.3 * r1));
        vec3 lo = uCam - uBox * vec3(0.5, 0.42, 0.5);
        vec3 p = mod(aSeed.xyz * uBox + vel * uTime - lo, uBox) + lo;
        // (a little sway from the gusts, each drop out of step with its neighbours)
        p.xz += vec2(sin(uTime * 1.3 + r2 * 6.28), cos(uTime * 1.1 + r3 * 6.28)) * length(uWind) * 0.02;
        vec3 toC = p - cameraPosition; float d = length(toC);
        vec3 ax = normalize(vel), side = normalize(cross(ax, toC));
        float len = length(vel) * uLen * (0.75 + 0.5 * r2);
        float w = max(uWidth * sz, d * uPix * 1.15), thin = pow(uWidth * sz / w, 0.65);
        vec3 wp = p + ax * len * aCorner.y + side * w * aCorner.x * 0.5;
        // (faint within a couple of metres of your eye, where a streak crosses half the view in a blink, and none within a
        // hand's length; thinned out towards the box's edges, so the drops never show it)
        float hz = length(toC.xz), fade = smoothstep(1.0, 4.2, d) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.48, hz)) * (1.0 - smoothstep(uBox.y * 0.3, uBox.y * 0.46, abs(p.y - uCam.y - uBox.y * 0.08)));
        vec3 view = toC / max(d, 1e-3);
        // (a drop is clear water, not paint: it shows about three quarters of the sky's light, each its own share of it, so
        // against a dark sea or cliff the rain is a fine grey and against the sky it is nearly lost, as rain is)
        vCol = dropLight(p, view) * (0.6 + 0.3 * r2); vA = uAlpha * fade * thin * (0.45 + 0.55 * r3); vC = aCorner;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vC; varying float vA; varying vec3 vCol;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        // (soft across, as a drop's edge is; tapered at both ends, the trailing end longest, as the eye's streak is)
        float a = vA * exp(-vC.x * vC.x * 2.8) * smoothstep(0.0, 0.12, vC.y) * (1.0 - smoothstep(0.4, 1.0, vC.y));
        if (a < 0.002) discard;
        gl_FragColor = vec4(vCol, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const drops = new THREE.Mesh(quad, dropMat); drops.frustumCulled = false; drops.renderOrder = 6; drops.name = "fdRainDrops"; group.add(drops);

  // ---- the curtains further off ----
  const curtains = [];
  const RADII = P0.curtains > 1 ? [16, 42] : [24];
  for (const R of RADII) {
    const H = R * 1.6, geo = new THREE.CylinderGeometry(R, R, H, Math.round(24 + R), 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, ...fogU(), uR: { value: R }, uSheet: { value: 0 }, uPix: { value: 0.0012 }, uDrawn: { value: 1 } },
      transparent: true, depthWrite: false, fog: true, side: THREE.BackSide,
      vertexShader: /* glsl */`
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uFall, uR, uSheet, uPix, uDrawn; uniform vec3 uCam; uniform vec2 uWind;
        varying vec3 vW;
        ${LIGHT_GLSL}
        ${HASH_GLSL}
        #include <common>
        #include <fog_pars_fragment>
        // one set of falling streaks: columns sp metres apart along the curtain, each with its own streak length, gap and speed
        float streaks(float s, float y, float sp, float seed) {
          float cx = s / sp, ci = floor(cx), h = rh(vec2(ci, seed)), h2 = rh(vec2(ci, seed + 7.0));
          float fx = fract(cx) - 0.5 - (h - 0.5) * 0.6, aa = max(fwidth(cx) * uDrawn, 1e-4); // (a screen pixel across, however many are drawn for it)
          float per = 2.2 + 3.0 * h2, len = 0.35 + 0.5 * h, yy = (y + uTime * uFall * (0.85 + 0.3 * h2) + h * 31.0) / per;
          float fy = fract(yy), seg = smoothstep(0.0, 0.05, fy) * (1.0 - smoothstep(len / per - 0.05, len / per, fy));
          float line = 1.0 - smoothstep(0.0, aa * 1.2, abs(fx));
          return line * seg * min(1.0, 0.006 / (aa * sp)) * step(0.25, rh(vec2(ci, floor(yy) + seed)));
        }
        void main() {
          vec3 rel = vW - uCam; float ang = atan(rel.z, rel.x);
          // (slanted with the wind's part across your line of sight there)
          vec2 tg = vec2(-sin(ang), cos(ang)); float lean = dot(uWind, tg) / max(uFall, 0.5);
          float s = ang * uR + rel.y * lean, y = rel.y;
          float a = streaks(s, y, 0.11, 1.0) + streaks(s + 0.05, y + 1.3, 0.17, 4.0) * 0.8;
          // rain comes in sheets: denser and thinner patches drifting through on the wind
          vec2 dw = uWind * uTime; float sh = rn(vec2((s - dot(dw, tg)) * 0.035, (y + uTime * uFall * 0.5) * 0.02)) * 0.65 + rn(vec2(s * 0.09 + 3.0, y * 0.05 - uTime * 0.3)) * 0.35;
          float sheet = smoothstep(0.22, 0.85, sh);
          // (and a faint grey of its own, thickest low down, where you look through the most of it)
          float haze = uSheet * 0.3 * (0.45 + 0.55 * sheet) * (1.0 - smoothstep(-2.0, uR * 0.6, y));
          // (gone towards the ground: where the curtain meets the water or the deck it would draw a hard line across it;
          // from a little under your feet, so a curtain fades in from the deck up and never shows where it meets the sea)
          float fadeY = (1.0 - smoothstep(uR * 0.25, uR * 0.75, y)) * smoothstep(-2.3, 0.6, y);
          vec3 col = dropLight(vW, normalize(rel));
          float al = (a * uSheet * (0.35 + 0.9 * sheet) * 0.85 + haze * smoothstep(-0.8, 1.5, y)) * fadeY; // (the haze only from about your eye up: below, it showed where the curtain met the deck)
          if (al < 0.002) discard;
          gl_FragColor = vec4(col, al);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5; m.name = "fdRainCurtain"; group.add(m); curtains.push(m);
  }

  // ---- splashes on the deck ----
  const S = P0.splashes, sGeo = new THREE.InstancedBufferGeometry();
  sGeo.setAttribute("aCorner", new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  sGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const sPos = new Float32Array(S * 4); for (let i = 0; i < S; i++) { sPos[i * 4 + 1] = -999; sPos[i * 4 + 3] = -99; }
  const sAttr = new THREE.InstancedBufferAttribute(sPos, 4); sAttr.setUsage(THREE.DynamicDrawUsage);
  const sSeed = new Float32Array(S); for (let i = 0; i < S; i++) sSeed[i] = Math.random();
  sGeo.setAttribute("aSp", sAttr); sGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sSeed, 1)); sGeo.instanceCount = S;
  const sMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, ...fogU(), uDur: { value: 0.32 }, uSize: { value: 0.07 }, uAlphaS: { value: 0.6 } },
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aSp; attribute float aSeed;
      uniform float uTime, uDur, uSize;
      varying vec2 vUv; varying float vAge, vSeed; varying vec3 vCol;
      ${LIGHT_GLSL}
      #include <fog_pars_vertex>
      void main() {
        float age = (uTime - aSp.w) / uDur;
        if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float sz = uSize * (0.7 + 0.6 * aSeed);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // (stood on the deck: its foot where the drop hit, whichever way you look at it)
        vec3 c = aSp.xyz + up * sz * 0.85;
        vec3 wp = c + right * aCorner.x * sz + up * aCorner.y * sz;
        vUv = aCorner; vAge = age; vSeed = aSeed; vCol = dropLight(aSp.xyz + vec3(0.0, 0.05, 0.0), normalize(aSp.xyz - cameraPosition));
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlphaS; varying vec2 vUv; varying float vAge, vSeed; varying vec3 vCol;
      ${HASH_GLSL}
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float a = vAge, acc = 0.0;
        // a crown of droplets thrown up and out from where the drop hit (the quad's foot), falling back as they go
        for (int k = 0; k < 7; k++) {
          float fk = float(k), h = rh(vec2(vSeed * 91.0, fk)), h2 = rh(vec2(fk, vSeed * 37.0));
          float an = (fk / 6.0 - 0.5) * 2.3 + (h - 0.5) * 0.5, sp = 0.55 + 0.55 * h2;
          vec2 dp = vec2(sin(an) * sp * a * 0.95, -0.85 + cos(an) * sp * a * 2.1 - 1.9 * a * a);
          vec2 q = vUv - dp; float r = 0.07 * (1.0 - 0.4 * a) * (0.7 + 0.6 * h);
          acc += exp(-dot(q, q) / (r * r));
        }
        // the sheet of water that leaves first, low and wide, gone in a moment
        float sheet = exp(-pow((vUv.y + 0.82 - a * 0.5) * 9.0, 2.0)) * exp(-pow(vUv.x / (0.25 + a * 1.2), 2.0)) * (1.0 - smoothstep(0.0, 0.35, a));
        float al = (min(1.0, acc) * 0.6 + sheet * 0.8) * pow(1.0 - a, 1.4) * uAlphaS;
        if (al < 0.004) discard;
        gl_FragColor = vec4(vCol, al);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const splashes = new THREE.Mesh(sGeo, sMat); splashes.frustumCulled = false; splashes.renderOrder = 6; splashes.name = "fdRainSplashes"; group.add(splashes);
  const sNext = new Float32Array(S); for (let i = 0; i < S; i++) sNext[i] = Math.random() * 1.5; // (staggered: not all at once when the rain starts)

  let plan = rainPlan(0, 0, quality), amount = 0, windV = new THREE.Vector2(), tw = 0, lastTw = 0;
  const baseLight = new THREE.Color(0.5, 0.5, 0.5);
  const fwd = new THREE.Vector3();
  const api = {
    group, plan: () => plan,
    /** The rain's amount (0 to 1), the wind (0 to 1) and the way it blows (unit [x, z], downwind). */
    set(a, wind = 0, dir = [0, -1]) {
      amount = a; plan = rainPlan(a, wind, quality);
      const l = Math.hypot(dir[0], dir[1]) || 1; windV.set((dir[0] / l) * plan.drift, (dir[1] / l) * plan.drift);
      group.visible = plan.on > 0;
      shared.uAmount.value = plan.on; shared.uFall.value = plan.fall; shared.uWind.value.copy(windV);
      dropMat.uniforms.uLen.value = plan.len; dropMat.uniforms.uWidth.value = plan.width; dropMat.uniforms.uAlpha.value = 0.5 + 0.35 * amount;
      for (const c of curtains) c.material.uniforms.uSheet.value = plan.sheet;
      sMat.uniforms.uAlphaS.value = 0.2 + 0.25 * amount;
    },
    /** light: the sky's light on a drop (a Color, scene linear); sun: { d: Vector3 towards it, c: Color }; lamps: up to
     * four [x, y, z, on]; lampColour: a Color */
    light(light, sun = null, lamps = [], lampColour = null) {
      baseLight.copy(light); shared.uLight.value.copy(light);
      if (sun) { shared.uSunD.value.copy(sun.d).normalize(); shared.uSunC.value.copy(sun.c); }
      for (let i = 0; i < 4; i++) { const q = lamps[i]; shared.uLamps.value[i].set(q ? q[0] : 0, q ? q[1] : -999, q ? q[2] : 0, q ? q[3] : 0); }
      if (lampColour) shared.uLampC.value.copy(lampColour);
    },
    /** a lightning flash (0 none, about 1 a near one): every drop lit by it */
    flash(k = 0) { shared.uLight.value.copy(baseLight).multiplyScalar(1 + 3 * k); },
    /** your head torch (nightKit.js's SpotLight), or null */
    torch(spot) {
      if (!spot || !(spot.intensity > 0.01)) { shared.uTorchC.value.setRGB(0, 0, 0); return; }
      shared.uTorchP.value.copy(spot.position); shared.uTorchD.value.copy(spot.target.position).sub(spot.position).normalize();
      shared.uTorchC.value.copy(spot.color).multiplyScalar(spot.intensity * 0.05);
    },
    /** the screen's height in its own pixels, how many are drawn for each, and the camera (for how wide a pixel is at a distance) */
    update(t, dt, cam, hPx = 900, drawn = 1) {
      if (!group.visible || !cam) return;
      tw = t % 600; shared.uTime.value = tw; shared.uCam.value.copy(cam.position);
      if (tw < lastTw) { for (let i = 0; i < S; i++) { sNext[i] = tw + Math.random() * 0.5; sPos[i * 4 + 3] = -99; } } lastTw = tw; // (the clock comes round every ten minutes)
      const pix = (2 * Math.tan(((cam.fov || 60) * Math.PI) / 360)) / Math.max(200, hPx);
      dropMat.uniforms.uPix.value = pix;
      for (const c of curtains) { c.position.set(cam.position.x, cam.position.y, cam.position.z); c.material.uniforms.uPix.value = pix; c.material.uniforms.uDrawn.value = drawn; }
      // the splashes: each place, when its last splash is over, waits its turn and then splashes somewhere new on the
      // deck round you, more of them ahead where you look, none on the water
      if (S && plan.every < Infinity) {
        cam.getWorldDirection(fwd); const fa = Math.atan2(fwd.x, -fwd.z); let changed = false;
        for (let i = 0; i < S; i++) {
          if (tw < sNext[i]) continue;
          const ahead = Math.random() < 0.75, an = ahead ? fa + (Math.random() - 0.5) * 1.9 : Math.random() * Math.PI * 2, r = 0.7 + 9 * Math.pow(Math.random(), 0.8);
          const x = cam.position.x + Math.sin(an) * r, z = cam.position.z - Math.cos(an) * r, y = floorAt(x, z);
          const wait = plan.every * (0.5 + Math.random());
          if (!(y > 0.05) || y > cam.position.y + 0.5) { sPos[i * 4 + 3] = -99; sNext[i] = tw + wait * 0.5; changed = true; continue; }
          sPos[i * 4] = x; sPos[i * 4 + 1] = y + 0.004; sPos[i * 4 + 2] = z; sPos[i * 4 + 3] = tw; sNext[i] = tw + sMat.uniforms.uDur.value + wait; changed = true;
        }
        if (changed) sAttr.needsUpdate = true;
      }
    },
    dispose() { parent.remove(group); quad.dispose(); dropMat.dispose(); sGeo.dispose(); sMat.dispose(); for (const c of curtains) { c.geometry.dispose(); c.material.dispose(); } },
  };
  return api;
}
