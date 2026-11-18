// ---- rockSpray: broken water: spray off the rock armour and the wall, foam on the water, and every splash ----
// A crest arriving at the seaward edge of the boulders breaks on them in stages, as a wave does on a breakwater:
// first tongues of solid water thrown up and back over the stones (sheets: white, streaked along the way they go,
// torn at their edges), which slow, stall and burst into drops; the drops fall back; a fine mist is left hanging
// where the sheets broke, drifting off with the wind; and the water running back off the stones leaves foam lying on
// the sea in front of them, a lace of bubbles that spreads, drifts and breaks up over several seconds. The same crest
// arrives at each stone a moment apart, so a breaking wave runs along the armour rather than going off all at once.
// A crest arriving at the wall's steel piling slaps up its face as a sheet, falls back and leaves foam at its foot.
// A rig, a fish or a net going into the water throws a crown of drops out and up, a few straight up the middle, and
// leaves a patch of foam where it went in.
// Three kinds of point in one draw call (sheets, drops and mist) and the foam in a second (flat patches on the
// water). All take the light of the hour, and the haze, so broken water is white at noon, grey at dusk and dark at
// night like everything round it.
// How hard a crest breaks follows the sea that is running: nothing on a flat calm, a low wash in a light breeze,
// sheets a couple of metres high once the sea is up and more in a gale. Nothing here is measured at Gorleston: it is
// how breaking water, spray and splashes behave in general.
// (Before 17 November the breaks were round soft white puffs that grew and hung: from the pier they read as cotton
// wool on the rocks, and the foam they left was more puffs, lying on the water.)
import * as THREE from "three";

export const SPRAY = { max: 1600, gap: 3.2, foam: 96 };

/** The height (m above the water's rest) a crest has to reach at the rocks before it breaks on them, for this sea's energy. Pure. */
export const breakHeight = (energy) => 0.08 + 0.16 * Math.max(0, energy);

/** How hard a crest breaks (0 nothing to 1): rise is how fast the water is coming up at the rocks as it passes the
 * breaking height (m/s), energy the sea's (swell + half the wind, about 0 to 1.5), r a random 0 to 1 (no two bursts alike). Pure. */
export function burstStrength(rise, energy, r = 0.5) {
  const e = Math.max(0, energy);
  if (!(rise > 0) || e < 0.12) return 0;
  return Math.min(1, (0.15 + 0.85 * Math.min(1, e)) * (0.55 + 0.45 * r) * Math.min(1, 0.35 + rise / (0.3 + 0.5 * e)));
}

/** What a break on the rocks of strength s (0 to 1) throws, and when (s after the crest arrives): sheets of water
 * first, the drops they burst into, the mist left hanging, and the foam the water leaves when it runs back. Pure. */
export function burstPlan(s) {
  const k = Math.max(0.05, Math.min(1, s));
  return {
    sheets: Math.round(8 + 26 * k), sheetUp: 2.2 + 6.4 * k, sheetSize: 0.16 + 0.3 * k, // (m/s up; m across)
    drops: Math.round(10 + 40 * k), mist: Math.round(2 + 6 * k), foam: k > 0.25 ? 2 : 1,
    // (the moments: sheets over the first quarter second, drops as the sheets burst, mist after them, foam as it runs back)
    at: { sheets: [0, 0.22], drops: [0.12, 0.45], mist: [0.3, 0.75], foam: [0.45, 0.9] },
  };
}

/** What a splash of this size throws: how many drops in its crown, how many up the middle, how many puffs of fine
 * spray inside the crown, how many patches of foam it leaves, and how fast the crown leaves (m/s). size: a rig about
 * .6, a landed fish .9, a big one 1.4; mult: more of it. Pure. */
export function splashPlan(size = 0.6, mult = 1) {
  const s = Math.max(0.1, Math.min(2, size)), m = Math.max(0.2, Math.min(4, mult));
  // (13 November: about twice the water. From the rail a splash was a few dots and a faint puff; a lead going in throws
  // a crown you can see from 30 m, a fine sheet of spray inside it, and leaves a patch of white on the water)
  return { crown: Math.min(360, Math.round((30 + 52 * s) * m)), jet: Math.round((4 + 8 * s) * Math.min(m, 2)), mist: Math.round((4 + 6 * s) * Math.min(m, 2)), foam: s > 0.3 ? 1 : 0, speed: 1.7 + 2.2 * Math.sqrt(s) };
}

/** Thin a list of [x, z, ox, oz] (a point on the rocks' seaward edge and the way out to sea from it) to one every `gap` metres. Pure. */
export function thinEdge(points, gap = 3) {
  const seen = new Set(), out = [];
  for (const p of points) { const k = Math.round(p[0] / gap) + "," + Math.round(p[1] / gap); if (seen.has(k)) continue; seen.add(k); out.push(p); }
  return out;
}

// (a point's kind is in its seed: mist 0 to 1, drops 2 to 3, sheets 4 to 5; the shader reads it from there)
const MIST = 0, DROP = 1, SHEET = 2;

export function createRockSpray(scene, edge = []) {
  const N = SPRAY.max, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N), size = new Float32Array(N), fade = new Float32Array(N), seed = new Float32Array(N), kind = new Uint8Array(N), grow = new Float32Array(N);
  const burstAt = new Float32Array(N); // (a sheet: the share of its life at which it bursts into drops; 0 once it has)
  for (let i = 0; i < N; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); geo.setAttribute("aFade", new THREE.BufferAttribute(fade, 1)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1)); geo.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 600 }, uBlur: { value: 1 / 40 } }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      attribute float aSize, aFade, aSeed; attribute vec3 aVel; uniform float uScale, uBlur; varying float vFade, vSeed, vStretch; varying vec2 vDir;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; vSeed = aSeed;
        float px = aSize * uScale / max(0.3, -mvPosition.z);
        // (a drop too far off to cover a pixel is drawn as one pixel, fainter by as much: a far splash still glitters)
        vFade = aFade * min(1.0, px / 1.5); vStretch = 1.0; vDir = vec2(0.0, 1.0);
        // (and nothing within arm's length of your eye: a drop or a sheet thrown up past the camera, looking down over
        // the rail at the drop net, was drawn as a white flake the size of a hand across the picture, 18 November)
        vFade *= smoothstep(0.45, 1.3, -mvPosition.z);
        if (aSeed >= 2.0) {
          // drops and sheets moving fast are seen drawn out along their path, as the eye and a camera both see them:
          // how far it goes on the screen in about a fortieth of a second (a sheet: a tenth, it is water pouring out
          // behind its front), in pixels, against its own size
          float blur = aSeed >= 4.0 ? uBlur * 6.0 : uBlur;
          vec4 q = projectionMatrix * (mvPosition + modelViewMatrix * vec4(aVel * blur, 0.0));
          float hPx = uScale * 2.0 / projectionMatrix[1][1], aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
          vec2 d = (q.xy / q.w - gl_Position.xy / gl_Position.w) * 0.5 * vec2(hPx * aspect, hPx);
          float len = length(d); vStretch = aSeed >= 4.0 ? clamp(1.3 + len / max(px, 1.5), 1.3, 4.0) : clamp(1.0 + len / max(px, 1.5), 1.0, 5.0); if (len > 1e-4) vDir = d / len;
        }
        gl_PointSize = clamp(px * vStretch, 1.5, 320.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; varying float vFade, vSeed, vStretch; varying vec2 vDir;
      #include <fog_pars_fragment>
      float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0, a, shade;
        // (gl_PointCoord runs down the screen, the direction up it)
        vec2 cc = vec2(c.x, -c.y); float al = dot(cc, vDir), ac = dot(cc, vec2(-vDir.y, vDir.x));
        if (vSeed >= 4.0) {
          // a sheet of water: a tongue thrown off the stone, drawn out along the way it goes and narrow across it, made
          // of strands along that way (the water pouring through the air), its edges torn into the strands and its tail
          // thinning; see-through where it is thin, so a break is many of them overlapping, densest in the middle
          float w = ac * vStretch * 2.0 * mix(1.15, 2.1, fract(vSeed * 7.31)), l = al * 2.0; // (some broad, some a single strand)
          float torn = vn(cc * 5.0 + vSeed * 11.0) * 0.6 + vn(cc * 13.0 - vSeed * 7.0) * 0.4;
          float taper = mix(0.45, 1.0, smoothstep(-0.9, 0.5, l));
          float rr = length(vec2(l, w / taper));
          float body = 1.0 - smoothstep(0.2 + 0.35 * torn, 1.0, rr);
          float strand = vn(vec2(w * 3.2 + vSeed * 17.0, l * 0.9 + vSeed * 3.0)) * 0.6 + vn(vec2(w * 7.5 - vSeed * 5.0, l * 1.6)) * 0.4;
          float dens = body * smoothstep(0.3, 0.72, strand * 0.8 + body * 0.32);
          a = dens * vFade * 0.62; shade = mix(0.76, 1.03, smoothstep(0.1, 0.8, dens)) * (1.0 + 0.06 * (0.5 - gl_PointCoord.y));
        } else if (vSeed >= 2.0) {
          // a drop: small, bright where it catches the sky, and clear water rather than paint: three quarters at most,
          // a streak along its path when it's moving fast, as thin as the drop and fainter as it's drawn out (until
          // 15 November every drop was a near-solid white disc, and a net coming up out of the water stood in a halo
          // of snow)
          r = length(vec2(al, ac * vStretch)) * 2.0;
          a = (1.0 - smoothstep(0.45, 1.0, r)) * vFade * 0.75 / mix(1.0, vStretch, 0.6); shade = 1.0 + 0.12 * (0.5 - gl_PointCoord.y);
        } else {
          // mist: fine spray, thin and torn into wisps by its own pattern (no two alike), never a solid ball; lit
          // from above, a little shaded underneath
          vec2 q = gl_PointCoord * 2.6 + vSeed * 37.0; float n = vn(q) * 0.55 + vn(q * 2.7 + 9.0) * 0.3 + vn(q * 6.1 - 4.0) * 0.15;
          a = pow(max(0.0, 1.0 - r), 1.6) * smoothstep(0.3, 0.78, n * 0.9 + (1.0 - r) * 0.35) * vFade * 0.55;
          shade = mix(0.78, 1.0, smoothstep(0.85, 0.2, gl_PointCoord.y)) * (0.94 + 0.12 * n);
        }
        if (a < 0.012) discard;
        gl_FragColor = vec4(uLight * shade, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4; points.name = "fdRockSpray"; points.userData.kind = "spray and splashes";
  scene.add(points);

  // ---- foam lying on the water: flat patches riding the surface, a lace of bubbles that spreads and breaks up ----
  const F = SPRAY.foam, fx = new Float32Array(F), fz = new Float32Array(F), fvx = new Float32Array(F), fvz = new Float32Array(F), fr = new Float32Array(F), fage = new Float32Array(F), flife = new Float32Array(F), fgrow = new Float32Array(F), frot = new Float32Array(F), fmul = new Float32Array(F);
  const fAttr = new THREE.InstancedBufferAttribute(new Float32Array(F * 4), 4); // (its age as a share of its life, seed, strength, stretch)
  const fGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); fGeo.setAttribute("aFoam", fAttr);
  const fMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: new THREE.Color(1, 1, 1) } }]),
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      attribute vec4 aFoam; varying vec2 vUv; varying vec4 vF;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vF = aFoam; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLight; varying vec2 vUv; varying vec4 vF;
      #include <fog_pars_fragment>
      vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
      float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
      // (the lace: where two bubbles' cells meet, the walls between them; F2 - F1 of a cell pattern)
      float lace(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = h22(i + g); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return 1.0 - smoothstep(0.0, 0.2, d2 - d1); }
      void main() {
        float u = vF.x, sd = vF.y * 13.0; vec2 c = (vUv - 0.5) * 2.0; c.x *= mix(1.0, 0.7, vF.w);
        float r = length(c) + (vn(c * 2.2 + sd) - 0.5) * 0.55;
        // fresh, it is dense white water; as it ages it opens out into a lace of bubbles with holes between, thinning
        // from its edge in, and goes. The lace is fine (a bubble raft's cells are a hand's breadth and less) and never
        // regular: its cells warped, its strands broken and of every thickness, two sizes over each other
        float edge = 1.0 - smoothstep(0.35, 0.82, r); // (inside the square it is drawn on, ragged edge and all)
        vec2 q = c * 9.0 + sd + vec2(vn(c * 2.6 + sd), vn(c * 2.6 - sd + 5.0)) * 2.4;
        float l = lace(q) * (0.35 + 0.65 * vn(c * 7.0 + sd * 2.0)) * 0.75 + lace(q * 2.2 + 7.0) * (0.3 + 0.7 * vn(c * 13.0 - sd)) * 0.45;
        float holes = smoothstep(0.25 + 0.45 * u, 0.7 + 0.25 * u, vn(c * 3.4 + sd * 1.7) * 0.7 + vn(c * 8.0 - sd) * 0.3);
        float dens = mix(0.85 * (0.55 + 0.45 * holes), (0.22 + 0.6 * l) * holes, smoothstep(0.0, 0.45, u)) * edge;
        float a = dens * vF.z * pow(1.0 - u, 1.4) * smoothstep(0.0, 0.06, u + 0.02);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uLight * mix(0.78, 0.96, dens), a * 0.75);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const foam = new THREE.InstancedMesh(fGeo, fMat, F); foam.frustumCulled = false; foam.renderOrder = 3; foam.name = "fdFoam"; foam.userData.kind = "foam on the water"; foam.userData.noAO = true; foam.noReflect = true;
  { const z0 = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < F; i++) foam.setMatrixAt(i, z0); }
  scene.add(foam);
  let fHead = 0;
  /** foam on the water at (x, z): r its radius to start (m), it spreads by grow (m a second, slowing), drifts at (vx, vz) */
  const putFoam = (x, z, r, lf, gr = 0.5, vx = 0, vz = 0, mul = 1, delay = 0) => { const i = fHead++ % F; fx[i] = x; fz[i] = z; fr[i] = r; flife[i] = lf; fage[i] = -delay; fgrow[i] = gr; fvx[i] = vx; fvz[i] = vz; frot[i] = Math.random() * 6.28; fmul[i] = mul; fAttr.array[i * 4 + 1] = Math.random(); fAttr.array[i * 4 + 3] = Math.random() * 0.6; };

  let head = 0;
  // (delay: seconds before it appears; it waits, unseen, where it will start)
  const put = (k, x, y, z, vx, vy, vz, sz, lf, gr = 0, delay = 0) => { const i = head++ % N; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; age[i] = -delay; life[i] = lf; size[i] = sz; kind[i] = k; grow[i] = gr; seed[i] = Math.random() + k * 2; fade[i] = 0; burstAt[i] = k === SHEET ? 0.45 + 0.3 * Math.random() : 0; return i; };
  const R = (a, b) => a + (b - a) * Math.random();

  /** A crest breaking on the rocks at (x, y, z): strength 0 to 1; (dx, dz) the way the water was going (landward: the
   *  sheets go up and on that way); spread how wide the break is along the stones (m). */
  function burst(x, y, z, strength, dx = 0, dz = 0, spread = 1.1) {
    const s = Math.max(0.05, Math.min(1, strength)), P = burstPlan(s), y0 = Math.max(0, y), w = Math.min(2.2, spread * 1.2);
    const ax = -dz, az = dx; // (along the stones)
    // the sheets: thrown up off the stone's seaward face, leaning landward, fanning a little either way; the first
    // ones off fastest. One in four stays low: the white water boiling over the stones' tops
    for (let q = 0; q < P.sheets; q++) {
      const along = (Math.random() - 0.5) * w, low = q % 4 === 3, f = 0.6 + 0.4 * Math.random();
      const up = (low ? 0.25 : 1) * P.sheetUp * f, fwd = (0.6 + 1.6 * s) * (low ? 1.3 : 0.6 + 0.6 * Math.random()), side = (Math.random() - 0.5) * (0.6 + 1.2 * s);
      put(SHEET, x + ax * along, y0 + R(0, 0.25), z + az * along, dx * fwd + ax * side, up, dz * fwd + az * side, P.sheetSize * R(0.7, 1.25) * (low ? 1.4 : 1), (low ? 0.6 : 0.5 + 0.55 * s) * R(0.8, 1.2), 0.5, R(...P.at.sheets));
    }
    // the drops: the heavier water, flung higher and further than the mist, coming down round it
    for (let q = 0; q < P.drops; q++) {
      const a = Math.random() * Math.PI * 2, side = (0.4 + 2.2 * s) * Math.random(), up = (3 + 7 * s) * R(0.35, 1), fwd = (0.6 + 2.2 * s) * Math.random(), along = (Math.random() - 0.5) * w;
      put(DROP, x + ax * along, y0 + R(0.2, 0.6) * s, z + az * along, dx * fwd + Math.cos(a) * side, up, dz * fwd + Math.sin(a) * side, 0.04 + 0.08 * Math.random() * (0.5 + s), 4, 0, R(...P.at.drops));
    }
    // the mist left hanging where the sheets broke, a metre or two up, drifting off with the wind as it thins
    for (let q = 0; q < P.mist; q++) {
      const along = (Math.random() - 0.5) * w, h = P.sheetUp * P.sheetUp / 19.6 * R(0.35, 0.9);
      put(MIST, x + ax * along + dx * R(0.2, 1), y0 + h, z + az * along + dz * R(0.2, 1), dx * 0.6 * s, R(0.1, 0.5), dz * 0.6 * s, (0.6 + 1.2 * s) * R(0.7, 1.2), R(1.4, 2.6) * (0.7 + 0.5 * s), 0.9 + 0.8 * s, R(...P.at.mist));
    }
    // the foam the water leaves as it runs back off the stones: on the sea in front of them, carried out a little
    for (let q = 0; q < P.foam; q++) {
      const along = (Math.random() - 0.5) * w;
      putFoam(x + ax * along - dx * R(0.4, 1.6), z + az * along - dz * R(0.4, 1.6), (0.6 + 0.9 * s) * R(0.8, 1.2), R(5, 9) * (0.7 + 0.4 * s), 0.25 + 0.3 * s, -dx * R(0.15, 0.4), -dz * R(0.15, 0.4), 0.7 + 0.3 * s, R(...P.at.foam));
    }
  }
  /** A crest slapping against the wall's face at (x, y, z): its water runs up the face in a sheet and falls back,
   *  thrown over the top only in a big sea; (bx, bz) the way back over the wall (landward). */
  function slap(x, y, z, strength, bx = 0, bz = 0) {
    const s = Math.max(0.05, Math.min(1, strength)), y0 = Math.max(0, y), ax = -bz, az = bx;
    const n = Math.round(3 + 7 * s), up = 2.2 + 5.5 * s;
    for (let q = 0; q < n; q++) {
      const along = (Math.random() - 0.5) * 2.4, f = R(0.55, 1);
      // (up the face, kept off it: a sheet leans out from a wall as it climbs, and only the biggest go back over)
      put(SHEET, x + ax * along - bx * 0.15, y0 + R(0, 0.2), z + az * along - bz * 0.15, -bx * R(0.2, 0.7) + bx * 1.6 * Math.max(0, s - 0.6) + ax * (Math.random() - 0.5) * 0.6, up * f, -bz * R(0.2, 0.7) + bz * 1.6 * Math.max(0, s - 0.6) + az * (Math.random() - 0.5) * 0.6, (0.3 + 0.45 * s) * R(0.8, 1.2), 0.45 + 0.4 * s, 0.4, R(0, 0.18));
    }
    for (let q = 0; q < Math.round(8 + 22 * s); q++) {
      const along = (Math.random() - 0.5) * 2.6, a = Math.random() * Math.PI * 2;
      put(DROP, x + ax * along - bx * 0.2, y0 + R(0.3, 1.2) * s, z + az * along - bz * 0.2, -bx * R(0.3, 1.5) + Math.cos(a) * 0.6 + bx * 2.5 * Math.max(0, s - 0.6), up * R(0.6, 1.25), -bz * R(0.3, 1.5) + Math.sin(a) * 0.6 + bz * 2.5 * Math.max(0, s - 0.6), 0.04 + 0.07 * Math.random(), 4, 0, R(0.1, 0.4));
    }
    for (let q = 0; q < Math.round(1 + 3 * s); q++) put(MIST, x + ax * (Math.random() - 0.5) * 2 - bx * 0.4, y0 + up * up / 19.6 * R(0.4, 0.9), z + az * (Math.random() - 0.5) * 2 - bz * 0.4, bx * 0.3, R(0.1, 0.4), bz * 0.3, (0.5 + 0.9 * s) * R(0.7, 1.2), R(1.2, 2.2), 0.8, R(0.3, 0.6));
    putFoam(x - bx * 0.9, z - bz * 0.9, (0.8 + 0.8 * s), R(4, 7), 0.35, -bx * 0.25, -bz * 0.25, 0.8, R(0.5, 0.8));
  }
  /** A splash on the water at (x, y, z): a crown of drops out and up, a few straight up the middle, fine spray inside,
   * and a patch of foam where it went in. size: a rig about .6, a landed fish .9; mult: more of it; up: { x, z } the
   * way back over a wall, for a crest slapping against one (world.js), which slaps instead. */
  function splash(x, y, z, sizeS = 0.6, mult = 1, up = null) {
    if (up) { slap(x, y, z, Math.min(1, sizeS * 0.7), up.x, up.z); return; }
    const P = splashPlan(sizeS, mult), s = Math.max(0.1, Math.min(2, sizeS)), y0 = y + 0.03, k = 0.7 + 0.5 * s;
    for (let q = 0; q < P.crown; q++) {
      // (the crown leaves steeply, 55 to 80 degrees up, from a ring a hand's breadth out: not a flat spray of dots)
      const a = Math.random() * Math.PI * 2, el = (55 + 25 * Math.random()) * Math.PI / 180, sp = P.speed * (0.45 + 0.75 * Math.random()), r0 = 0.05 + 0.12 * s * Math.random();
      // (most drops a centimetre or two, a few bigger: at 3 to 10 cm every one, a fish splashing at the foot of the wall
      // threw a ball of white flakes like confetti, Aaron's footage of 18 November)
      put(DROP, x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp, (0.016 + 0.06 * Math.pow(Math.random(), 3)) * k, 3);
    }
    for (let q = 0; q < P.jet; q++) put(DROP, x + (Math.random() - 0.5) * 0.06, y0, z + (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.35, P.speed * (1.15 + 0.5 * Math.random()), (Math.random() - 0.5) * 0.35, (0.035 + 0.04 * Math.random()) * k, 3, 0, 0.05);
    // the crown's wall itself: short sheets going up and out round the hole, for anything bigger than a lead
    if (s > 0.5) for (let q = 0; q < Math.round(3 + 4 * s); q++) { const a = (q / (3 + 4 * s) + Math.random() * 0.1) * Math.PI * 2, sp = P.speed * R(0.5, 0.8); put(SHEET, x + Math.cos(a) * 0.12 * s, y0, z + Math.sin(a) * 0.12 * s, Math.cos(a) * sp * 0.35, sp, Math.sin(a) * sp * 0.35, 0.12 + 0.12 * s, 0.25 + 0.15 * s, 0.3); }
    // the fine spray inside the crown: going up and a little out, hanging a moment
    for (let q = 0; q < P.mist; q++) { const a = Math.random() * Math.PI * 2, sp = 0.4 + 0.8 * Math.random(); put(MIST, x + Math.cos(a) * 0.1 * s, y0 + 0.05, z + Math.sin(a) * 0.1 * s, Math.cos(a) * sp, (1.2 + 2.2 * Math.random()) * Math.sqrt(s), Math.sin(a) * sp, (0.16 + 0.18 * Math.random()) * Math.sqrt(s), 0.35 + 0.3 * Math.random(), 1.2 * s, 0.04); }
    // the white it leaves: a patch of foam spreading out from where it went in, lasting a few seconds
    for (let q = 0; q < P.foam; q++) putFoam(x, z, 0.12 + 0.22 * s, R(2.5, 4) * (0.6 + 0.4 * s), 0.25 * s, 0, 0, Math.min(1, 0.5 + 0.4 * s), 0.12);
  }
  /** Water running out of a net lifted out of the sea: drops falling from under its mesh and a thin stream or two from
   * its lowest point. (x, y, z) the middle of the net's bottom, r its radius (m), amount 0 to 1 (1 just out of the
   * water, 0 drained). Called a few times a second while it comes up. (It was a splash, a crown of drops thrown up
   * from the net in mid-air every eighth of a second, which hung round the net as it was hauled like a cloud of white
   * confetti: Aaron's footage of 18 November) */
  function drip(x, y, z, r = 0.3, amount = 1) {
    const a0 = Math.max(0, Math.min(1, amount)), n = Math.round(2 + 9 * a0);
    for (let q = 0; q < n; q++) { const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random()) * 0.85;
      put(DROP, x + Math.cos(a) * d, y - R(0, 0.06), z + Math.sin(a) * d, R(-0.08, 0.08), -R(0.1, 0.8), R(-0.08, 0.08), 0.008 + 0.014 * Math.random(), 3); }
    if (a0 > 0.4) for (let q = 0; q < 2; q++) put(DROP, x + R(-0.04, 0.04), y - 0.04, z + R(-0.04, 0.04), 0, -R(0.9, 1.6), 0, 0.014 + 0.01 * a0, 3);
  }
  let E = [];
  const setEdge = (list) => { E = thinEdge(list || [], SPRAY.gap).map((p) => ({ x: p[0], z: p[1], ox: p[2], oz: p[3], was: 0, last: -9, wait: 2 + Math.random() * 3 })); };
  setEdge(edge);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fv = new THREE.Vector3(), fs = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  return {
    points, foam, burst, slap, splash, drip, setEdge, get count() { return E.length; },
    /** how many points are in the air now (checks) */
    get live() { let n = 0; for (let i = 0; i < N; i++) if (life[i] > 0) n++; return n; },
    /** how many patches of foam are on the water now (checks) */
    get foamLive() { let n = 0; for (let i = 0; i < F; i++) if (flife[i] > 0) n++; return n; },
    /** each frame: t, dt (s); sea { swell, wind, windDir }; heightAt(x, z) the water's height now; light (a Color, the day's) ; view height in px and fov for the puffs' size */
    update(t, dt, sea, heightAt, light, pxH = 800, fovDeg = 60) {
      const energy = (sea.swell || 0) + (sea.wind || 0) * 0.5;
      if (dt > 0 && heightAt) for (const e of E) {
        // (the water a metre and a half out from the stone: the crest about to arrive)
        const h = heightAt(e.x + e.ox * 1.5, e.z + e.oz * 1.5), lim = breakHeight(energy);
        if (h > lim && e.was <= lim && t - e.last > e.wait) {
          const s = burstStrength((h - e.was) / dt, energy, Math.random());
          // (in a moderate sea a stone takes a wave white now and then, not every few seconds: along the far armour in a
          // 13 mph breeze the bursts every second or two, each leaving white lying on the water, read as a row of cotton
          // wool on the rocks, seen on Aaron's PC, 17 November)
          if (s > 0) { e.last = t; e.wait = (1.2 + Math.random() * 2.2) * (1 + 2.2 * (1 - Math.min(1, energy))); burst(e.x + e.ox * 1.3, h, e.z + e.oz * 1.3, s, -e.ox, -e.oz); } // (on the stone's seaward face, where it shows)
        }
        e.was = h;
      }
      const wl = Math.hypot(sea.windDir?.[0] || 0, sea.windDir?.[1] || 0) || 1, wx = ((sea.windDir?.[0] || 0) / wl) * (sea.wind || 0) * 4, wz = ((sea.windDir?.[1] || 0) / wl) * (sea.wind || 0) * 4;
      const dragM = Math.exp(-1.6 * dt), dragD = Math.exp(-0.18 * dt), dragS = Math.exp(-0.9 * dt);
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        if (age[i] < 0) { age[i] += dt; fade[i] = 0; continue; } // (not yet: waiting its moment)
        age[i] += dt;
        // (a drop or a sheet is gone when it meets the water; mist when it has thinned away)
        const falls = kind[i] !== MIST;
        const floor = falls ? (heightAt && vel[i * 3 + 1] < 0 && pos[i * 3 + 1] < 1.2 ? heightAt(pos[i * 3], pos[i * 3 + 2]) - 0.03 : -1.5) : -0.3;
        if (age[i] >= life[i] || pos[i * 3 + 1] < floor) {
          // (a sheet that comes down on the water, or runs its time, leaves its drops behind it, on its way)
          if (kind[i] === SHEET && burstAt[i] > 0) { burstAt[i] = 0; const n = 2 + Math.floor(size[i] * 5); for (let q = 0; q < n; q++) put(DROP, pos[i * 3], Math.max(pos[i * 3 + 1], 0.05), pos[i * 3 + 2], vel[i * 3] + R(-0.8, 0.8), Math.max(0.5, vel[i * 3 + 1] * 0.3 + R(0.4, 1.6)), vel[i * 3 + 2] + R(-0.8, 0.8), 0.04 + 0.06 * Math.random(), 3); }
          life[i] = 0; fade[i] = 0; pos[i * 3 + 1] = -50; continue;
        }
        const u = age[i] / life[i];
        if (kind[i] === DROP) {
          // a drop: a stone's fall, hardly slowed, pushed a little by the wind
          vel[i * 3] = (vel[i * 3] - wx * 0.25) * dragD + wx * 0.25; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz * 0.25) * dragD + wz * 0.25; vel[i * 3 + 1] -= 9.81 * dt;
          fade[i] = Math.min(1, age[i] * 30) * Math.min(1, (life[i] - age[i]) * 4);
        } else if (kind[i] === SHEET) {
          // a sheet: thrown water, falling nearly as a stone falls, the air tearing at it; it stretches as it goes and,
          // past its top, bursts into drops and is gone
          vel[i * 3] = (vel[i * 3] - wx * 0.15) * dragS + wx * 0.15; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz * 0.15) * dragS + wz * 0.15; vel[i * 3 + 1] -= 8.6 * dt;
          size[i] += dt * grow[i];
          if (burstAt[i] > 0 && u > burstAt[i]) {
            burstAt[i] = 0; const n = 3 + Math.floor(size[i] * 8);
            for (let q = 0; q < n; q++) put(DROP, pos[i * 3] + R(-0.3, 0.3) * size[i], pos[i * 3 + 1] + R(-0.2, 0.3) * size[i], pos[i * 3 + 2] + R(-0.3, 0.3) * size[i], vel[i * 3] + R(-1.2, 1.2), vel[i * 3 + 1] + R(0, 1.8), vel[i * 3 + 2] + R(-1.2, 1.2), 0.04 + 0.08 * Math.random(), 3);
            if (size[i] > 0.35) put(MIST, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], vel[i * 3] * 0.3, 0.3, vel[i * 3 + 2] * 0.3, size[i] * 1.6, R(0.9, 1.6), 0.8);
          }
          // (in at once, gone over its last third as it breaks up)
          fade[i] = Math.min(1, age[i] * 25) * Math.min(1, (1 - u) * 3);
        } else {
          // mist: soon stopped by the air, then sinking slowly and going with the wind as it spreads and thins
          vel[i * 3] = (vel[i * 3] - wx) * dragM + wx; vel[i * 3 + 2] = (vel[i * 3 + 2] - wz) * dragM + wz; vel[i * 3 + 1] = vel[i * 3 + 1] * dragM - 0.6 * dt;
          size[i] += dt * grow[i]; fade[i] = Math.min(1, age[i] * 4) * Math.pow(1 - u, 1.5) * 0.9;
        }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aVel.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aFade.needsUpdate = true; geo.attributes.aSeed.needsUpdate = true;
      // the foam: riding the water where it lies, spreading (fast at first, then slower), drifting with the water
      // running back and then the wind, ageing
      let fLive = false;
      for (let i = 0; i < F; i++) {
        if (flife[i] <= 0) continue;
        fage[i] += dt; fLive = true;
        if (fage[i] >= flife[i]) { flife[i] = 0; foam.setMatrixAt(i, fm.makeScale(0, 0, 0)); fAttr.array[i * 4 + 2] = 0; continue; }
        if (fage[i] < 0) { foam.setMatrixAt(i, fm.makeScale(0, 0, 0)); continue; }
        const k = Math.exp(-0.5 * dt); fvx[i] = (fvx[i] - wx * 0.03) * k + wx * 0.03; fvz[i] = (fvz[i] - wz * 0.03) * k + wz * 0.03;
        fx[i] += fvx[i] * dt; fz[i] += fvz[i] * dt;
        const r = fr[i] + fgrow[i] * Math.sqrt(fage[i]) * 1.6, y = (heightAt ? heightAt(fx[i], fz[i]) : 0) + 0.05;
        foam.setMatrixAt(i, fm.compose(fv.set(fx[i], y, fz[i]), fq.setFromAxisAngle(yAxis, frot[i] + fage[i] * 0.04), fs.set(r * 2, 1, r * 2)));
        fAttr.array[i * 4] = fage[i] / flife[i]; fAttr.array[i * 4 + 2] = fmul[i];
      }
      if (fLive) { foam.instanceMatrix.needsUpdate = true; fAttr.needsUpdate = true; }
      if (light) { mat.uniforms.uLight.value.copy(light); fMat.uniforms.uLight.value.copy(light); }
      mat.uniforms.uScale.value = pxH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },
    dispose() { scene.remove(points); scene.remove(foam); geo.dispose(); mat.dispose(); fGeo.dispose(); fMat.dispose(); foam.dispose(); },
  };
}
