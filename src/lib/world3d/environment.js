// ---- environment: the representative 3D place round the anglers (sky, light, water, ground, scenery) ----
// Drawn, not photographed, and labelled so on screen. One sky for the sun, moon, cloud and stars; the water's waves
// follow the wind and the kind of place; the ground and scenery are built for a pier, beach, estuary quay, river
// bank or lake. All conditions come in through setEnv, so the sky, light, water, rain and fog agree.
import * as THREE from "three";
import { layoutFor, drawnGround } from "./spots.js";
import { buildRealPlace } from "./realPlace.js";
import { concrete } from "./textures3d.js";
import { createWildlife } from "./wildlife.js";
import { SHORE, SHORE_FINE, shoreDistances, shoreBytes, drawnLand } from "./shoreMap.js";
import { lightingFor, lampPools, poolLight, lookQuality } from "./skyLook.js";

// ---- shared shader pieces: noise and the sky's colour in any direction ----
export const GLSL_NOISE = /* glsl */`
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a*noise(p); p = p*2.03 + 17.1; a *= .5; } return s*1.14; }
// value noise and its slope (x: value, yz: d/dx, d/dy), for the water's fine ripples without extra samples
vec3 noised(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f), du = 6.*f*(1. - f);
  float a = hash(i), b = hash(i + vec2(1., 0.)), c = hash(i + vec2(0., 1.)), d = hash(i + vec2(1., 1.));
  return vec3(a + (b - a)*u.x + (c - a)*u.y + (a - b - c + d)*u.x*u.y, du*(vec2(b - a, c - a) + (a - b - c + d)*u.yx)); }
`;
// (SKYQ 1 shades the clouds, lit on the sun's side and grey beneath; 0, for Performance, leaves that out)
const GLSL_SKY = /* glsl */`
uniform vec3 uSunDir, uMoonDir;
uniform float uDay, uDusk, uNight, uCloud, uRain, uTime, uMoonLight;
// ---- the clear sky in a direction, with the haze along the horizon (no sun disc, no clouds) ----
// skyLook.js's horizonColour mirrors the horizon here: the land's haze is the same colour
vec3 skyBase(vec3 d){
  float hp = max(d.y, 0.), t = sqrt(hp);
  float sd = max(dot(normalize(d), uSunDir), 0.);
  float ts = dot(normalize(d.xz + vec2(1e-4)), normalize(uSunDir.xz + vec2(1e-4)))*.5 + .5; // 1 towards the sun
  // day: a deep blue overhead, paling to a milky haze at the horizon, brighter round the sun
  vec3 day = mix(vec3(.68, .78, .87), vec3(.19, .40, .76), t) + vec3(.10, .09, .06)*pow(sd, 4.)*(1. - t*.6);
  // dusk: blue overhead, a pale gold glow low towards the sun, lilac-grey away from it (not an orange wash)
  vec3 dusk = mix(mix(vec3(.50, .50, .62), vec3(.96, .70, .48), ts*ts), vec3(.15, .20, .40), pow(hp, .38));
  dusk += vec3(.55, .32, .16)*pow(sd, 8.)*(1. - hp);
  // night: near black overhead, the glow of the town and the moon low down
  vec3 night = mix(vec3(.050, .060, .088), vec3(.010, .016, .036), t) + vec3(.05, .06, .08)*pow(max(dot(normalize(d), uMoonDir), 0.), 6.)*uMoonLight;
  vec3 c = day*uDay + dusk*uDusk + night*uNight;
  // overcast: a soft grey, a little brighter overhead; darker and cooler in rain
  vec3 grey = mix(vec3(.60, .63, .66), vec3(.66, .69, .72), t)*(uDay + uDusk*.5 + uNight*.06)*(1. - uRain*.38);
  grey *= mix(vec3(1.), vec3(.92, .96, 1.04), uRain);
  return mix(c, grey, smoothstep(.5, 1., uCloud)*.9);
}
// ---- clouds on a high layer, drifting with the wind: rgb their colour, a how much they cover ----
// (q 1: full detail and shading, for the sky; 0: a cheaper, softer version, for reflections)
vec4 cloudAt(vec3 d, float q){
  vec2 cp = d.xz/(d.y + .1)*.75 + vec2(uTime*.004, uTime*.0016);
  float n1, shade = .6;
  if (q > .5) {
    vec2 warp = vec2(fbm3(cp*.5), fbm3(cp*.5 + 5.2))*.7;
    n1 = fbm(cp*1.2 + warp);
    #if SKYQ > 0
      // lit on the side towards the sun, grey beneath and on the far side (the cloud is thicker between you and the sun)
      shade = clamp(.55 + (n1 - fbm3(cp*1.2 + warp + normalize(uSunDir.xz + vec2(1e-4))*.16))*3.2, 0., 1.);
    #endif
  } else n1 = fbm3(cp*1.2);
  float thr = mix(.66, .30, uCloud);
  float cover = max(smoothstep(thr, thr + .2, n1), smoothstep(.78, 1., uCloud));
  float thick = smoothstep(thr, thr + .5, n1);
  vec3 lit = vec3(.98, .97, .95)*uDay + vec3(1., .80, .66)*uDusk*.85 + vec3(.11, .12, .15)*uNight*(.3 + uMoonLight);
  vec3 dark = vec3(.58, .62, .70)*uDay + vec3(.36, .33, .42)*uDusk + vec3(.025, .028, .04)*uNight;
  vec3 cc = mix(dark, lit, shade*(1. - thick*.45));
  // a grey deck: mottled, darker the thicker; darker still in rain
  cc *= mix(1., .48 + .55*smoothstep(.25, .75, n1), smoothstep(.55, 1., uCloud))*(1. - uRain*.35);
  // far off they melt into the haze along the horizon
  cc = mix(cc, skyBase(d), exp(-d.y*7.)*.55);
  return vec4(cc, cover*smoothstep(0., .06, d.y));
}
vec3 skyColour(vec3 d){
  vec3 c = skyBase(d);
  float sd = max(dot(d, uSunDir), 0.), md = max(dot(d, uMoonDir), 0.);
  c += vec3(1., .95, .85)*smoothstep(.9994, .9998, sd)*(uDay + uDusk)*3.;
  c += vec3(.85, .88, .95)*smoothstep(.9996, .99985, md)*uNight*uMoonLight*1.6;
  if (d.y > 0.) {
    #ifndef ENV_PASS
      // stars on a clear night: small points of different brightness, fewer low down, twinkling a little
      vec2 sp = d.xz/(d.y + .3)*260.; float sh = hash(floor(sp));
      float st = step(.9972, sh)*smoothstep(.42, .05, length(fract(sp) - .5))*(.3 + .7*fract(sh*913.))*(.8 + .2*sin(uTime*3. + sh*80.));
      c += vec3(.9, .93, 1.)*st*uNight*(1. - smoothstep(.5, .9, uCloud))*smoothstep(.04, .25, d.y)*1.3;
    #endif
    vec4 cl = cloudAt(d, 1.);
    c = mix(c, cl.rgb, cl.a);
    // the sun's glow through thin cloud
    c += vec3(1., .86, .68)*pow(sd, 16.)*(uDay + uDusk*.7)*cl.a*(1. - smoothstep(.7, 1., uCloud))*.3;
  }
  return c;
}
// the sky as the water mirrors it: the same colours, with cheaper, softer clouds
vec3 skyReflect(vec3 d){
  vec3 c = skyBase(d);
  float sd = max(dot(d, uSunDir), 0.);
  vec4 cl = cloudAt(d, 0.);
  return mix(c, cl.rgb, cl.a) + vec3(1., .86, .68)*pow(sd, 12.)*(uDay + uDusk*.6)*(1. - smoothstep(.6, 1., uCloud))*.2;
}`;

const pick = (a, i) => a[((i % a.length) + a.length) % a.length];
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, base, spread, n = 2600, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = (Math.random() - 0.5) * spread; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
}

export function createEnvironment(scene, { venue = "pier", quality = 1, real = null, pano = null } = {}) {
  const L = layoutFor(venue);
  const group = new THREE.Group(); scene.add(group);
  const U = {
    uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.4, -0.8).normalize() },
    uDay: { value: 1 }, uDusk: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0.3 }, uRain: { value: 0 }, uMoonLight: { value: 0.5 },
  };

  // ---- sky ----
  const LQ = lookQuality(quality);
  const skyShader = (defines) => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { ...U, uEnvGround: { value: new THREE.Color(0.05, 0.06, 0.06) } }, defines,
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }",
    fragmentShader: GLSL_NOISE + GLSL_SKY + `uniform vec3 uEnvGround; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); vec3 c = skyColour(d);
        #ifdef ENV_PASS
          // (for the environment map: below the horizon, the dark of the sea and the land)
          if (d.y < 0.) c = mix(skyBase(vec3(d.x, 0., d.z))*.6, uEnvGround, smoothstep(0., -.25, d.y));
        #endif
        gl_FragColor = vec4(c, 1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyShader({ SKYQ: LQ.skyDetail }));
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);
  // the same sky (no stars) for world.js's environment map, so reflections and the sky's light match what you see
  const envSky = skyShader({ SKYQ: 0, ENV_PASS: 1 });

  // ---- light ----
  const hemi = new THREE.HemisphereLight(0xbfd6e8, 0x40382c, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 40, -40);
  // (the shadows' box follows the camera, a 2 m step at a time so their edges don't crawl)
  if (quality >= 1) { sun.castShadow = true; sun.shadow.mapSize.set(LQ.shadowMap, LQ.shadowMap); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; }
  group.add(hemi, sun, sun.target);
  scene.fog = new THREE.FogExp2(0xb8c8d4, 0.0006);

  // ---- water ----
  const wU = {
    ...U, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.3, -1).normalize() }, uSwell: { value: 0.3 }, uKind: { value: 0 },
    uShoreZ: { value: venue === "beach" && !real ? 0 : -1e4 }, uWater: { value: new THREE.Color(0x1d4a56) }, uCam: { value: new THREE.Vector3() },
    uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uFogC: { value: new THREE.Color(0xb8c8d4) }, uFogD: { value: 0.0006 },
    uLamps: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uShore: { value: null }, uShoreOn: { value: 0 }, uShoreHalf: { value: SHORE.half },
    uShoreF: { value: null }, uShoreFHalf: { value: SHORE_FINE.half },
  };
  const kind = { pier: 0, beach: 0, estuary: 1, river: 2, lake: 3 }[venue] ?? 0;
  wU.uKind.value = kind;
  wU.uWater.value.set([0x1b4752, 0x1b4752, 0x34463a, 0x2b3d33, 0x17302c][[0, 0, 1, 2, 3][kind] ?? 0]);
  const wGeo = new THREE.PlaneGeometry(1600, 1600, LQ.waterGrid, LQ.waterGrid);
  wGeo.rotateX(-Math.PI / 2);
  // denser near the middle (the camera), so near waves are smooth and far ones cheap
  { const p = wGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / 800, k = r < 1e-6 ? 1 : Math.pow(r, 1.8) / r; p.setX(i, x * k); p.setZ(i, z * k); } }
  // ---- the waves: the same sum of trains for the mesh's shape (vertex) and its shading (fragment) ----
  // Seven trains at odd angles and lengths, each at the deep-water speed for its length (long swells run faster than
  // short chop), so the pattern never lines up and repeats. A slow, broad wander in their phase and size brings groups
  // of bigger waves through and then quieter spells, and bends the crests, so it isn't one animated sheet.
  const GLSL_WAVES = /* glsl */`
    uniform float uWind, uSwell, uKind; uniform vec2 uWindDir;
    vec3 train(vec2 p, vec2 d, float k, float a, float ph){ float x = dot(p, d)*k - uTime*sqrt(9.81*k) + ph; return vec3(a*sin(x), a*k*cos(x)*d); }
    // x: height; yz: slope
    vec3 seaWaves(vec2 p){
      vec2 wd = uWindDir, wx = vec2(-wd.y, wd.x);
      float sea = uKind < .5 ? 1. : uKind < 1.5 ? .5 : 0.;
      float g1 = noise(p*.011 + vec2(uTime*.021, -uTime*.013)), g2 = noise(p*.017 + 31. - vec2(uTime*.017, uTime*.024));
      float ph = (g1 - .5)*5.;
      float A = (.16 + .5*uSwell)*sea, B = .045 + .13*uWind;
      vec3 s = train(p, normalize(vec2(.2, -1.)), .085, A*(.55 + .9*g1), ph);
      s += train(p, normalize(vec2(-.42, -1.)), .131, A*.55*(.5 + g2), ph*.7 + 1.3);
      s += train(p, normalize(vec2(.65, -1.)), .207, A*.25*(.4 + 1.2*g1), 4.1 - ph*.5);
      s += train(p, normalize(wd + wx*.28), .41, B*(.6 + .8*g2), ph*1.3);
      s += train(p, normalize(wd - wx*.43), .63, B*.6*(.5 + g1), 2.2 - ph);
      s += train(p, normalize(wd + wx*.77), .97, B*.32*(.4 + 1.2*g2), ph*1.7 + 5.);
      s += train(p, normalize(wd - wx*1.1), 1.46, B*.18, .7 - ph*2.);
      return s;
    }`;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: wU, transparent: false, defines: { WQ: LQ.waterDetail, SKYQ: 0 },
    vertexShader: GLSL_NOISE + "uniform float uTime; uniform vec3 uCam;" + GLSL_WAVES + /* glsl */`
      varying vec3 vW;
      void main(){
        vec3 w = position + vec3(uCam.x, 0., uCam.z);
        float fade = 1. - smoothstep(60., 500., length(w.xz - uCam.xz));
        vec3 s = seaWaves(w.xz);
        // in a blow the crests pinch together (water drawn towards each crest), so they look sharp, not smooth
        w.xz += s.yz*(.4 + 2.*uWind)*fade;
        w.y += s.x*fade;
        vW = w;
        gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.);
      }`,
    fragmentShader: GLSL_NOISE + GLSL_SKY + GLSL_WAVES + /* glsl */`
      uniform float uShoreZ, uFogD, uShoreOn, uShoreHalf; uniform vec3 uWater, uCam, uFogC; uniform vec4 uRip[8]; uniform vec4 uLamps[4];
      uniform sampler2D uShore, uShoreF; uniform float uShoreFHalf;
      // metres to the nearest land (from the shore maps: the fine one close round the anglers, the coarse one further
      // out), or far when off the map
      float shoreDist(vec2 p){ vec2 uv = p/(2.*uShoreHalf) + .5; if (uShoreOn < .5 || uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) return 99.;
        float far = texture2D(uShore, uv).r*40.;
        vec2 fv = p/(2.*uShoreFHalf) + .5;
        if (fv.x > 0. && fv.y > 0. && fv.x < 1. && fv.y < 1.) { float f = texture2D(uShoreF, fv).r*8.; return f < 7.8 ? f : max(far, f); }
        return far; }
      varying vec3 vW;
      #if WQ > 0
        #define RAIN_LAYERS 2
      #else
        #define RAIN_LAYERS 1
      #endif
      void main(){
        vec2 p = vW.xz;
        vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 v = toCam/dist;
        vec2 wd = uWindDir, wx = vec2(-wd.y, wd.x);
        vec3 s = seaWaves(p);
        float h = s.x;
        vec2 g = s.yz;
        // ---- fine ripples, carried by the wind (a river's by its current) ----
        // in patches: a gust ruffles one stretch and leaves the next calm, so no one pattern shows across the water.
        // Further out they're smaller than a pixel and are left out rather than shimmer
        float footprint = max(length(dFdx(p)), length(dFdy(p)));
        vec2 flow = uKind > 1.5 && uKind < 2.5 ? vec2(-uTime*.6, 0.) : -wd*uTime*.35;
        float gust = .45 + 1.1*noise(p*.021 - flow*.12 + 7.);
        vec3 r1 = noised(mat2(.8, -.6, .6, .8)*p*vec2(1.9, 2.6) + flow);
        g += (mat2(.8, .6, -.6, .8)*(r1.yz*vec2(1.9, 2.6)))*(.5 + .5*(1. - smoothstep(.12, .5, footprint)))*(.024 + .05*uWind)*gust*(1. - smoothstep(30., 220., dist));
        #if WQ > 0
          vec3 r2 = noised(mat2(.47, .88, -.88, .47)*p*6.1 + flow*1.6);
          g += (mat2(.47, -.88, .88, .47)*r2.yz)*6.1*(1. - smoothstep(.04, .16, footprint))*(.004 + .011*uWind)*gust*(1. - smoothstep(14., 90., dist));
        #endif
        #if WQ > 1
          vec3 r3 = noised(p*13.7 - flow*2.1 + 3.);
          g += r3.yz*13.7*(1. - smoothstep(.018, .075, footprint))*(.0016 + .004*uWind)*(1. - smoothstep(8., 45., dist));
        #endif
        vec3 n = normalize(vec3(-g.x, 1., -g.y));
        // rain: a scatter of drop rings, each kept inside its own cell (cut off at the cell's edge they showed as
        // squares), and only close by: further out they're smaller than a pixel and alias into blocks
        float near = 1. - smoothstep(6., 24., dist);
        if (uRain > .01 && near > 0.) for (int k = 0; k < RAIN_LAYERS; k++) {
          vec2 rc = p*(2.2 + float(k)*1.3) + float(k)*7.;
          vec2 ci = floor(rc), cf = fract(rc) - .5;
          float hc = hash(ci);
          if (hc < uRain*.8) { float ph = fract(uTime*(1.2 + hc) + hc*9.); float rr = length(cf); float fr = (rr - ph*.36)*30.;
            n.xz += normalize(cf + .001)*sin(fr)*exp(-fr*fr*.05)*(1. - ph)*.2*near*(1. - smoothstep(.36, .48, rr)); }
        }
        // heavy rain roughens the whole surface close by
        n.xz += (vec2(noise(p*9. + uTime*3.), noise(p*9.7 - uTime*3.1)) - .5)*uRain*.18*(1. - smoothstep(8., 50., dist));
        // ---- rings where a rig lands or a fish breaks the surface ----
        // small rings, as a fish, a net or a rig really makes them: a short train of wavelets running out at a walking
        // pace and slowing (waterFx.js: about a metre and a half at most before they're gone), broken up by the chop so
        // they're never perfect circles, and only a slight tilt of the surface (a strong one mirrored a patch of bright
        // sky into every ring: the big pale loops). A little churned water at the middle, in ragged bits, for a moment
        float churn = 0.;
        for (int i = 0; i < 8; i++) { vec4 r = uRip[i]; if (r.w <= 0.) continue;
          vec2 o = p - r.xy; float d = length(o), age = r.z;
          if (d > 2.4) continue;
          float R = .55*age/(1. + age*.35), k = 22./(1. + age*.9);
          float dn = d + (noise(p*1.7 + r.xy*3.1) - .5)*(.12 + .25*R);
          float fr = (dn - R)*k;
          float env = fr > 0. ? exp(-fr*fr*.35) : exp(fr*.55);
          n.xz += (o/(d + .05))*sin(fr)*env*r.w*.3/(1. + R*1.4)*(1. - smoothstep(1.6, 2.4, d));
          float bits = smoothstep(.5, .8, noise(p*6.3 + r.xy + uTime*.7)*.65 + noise(p*15.1 - uTime*.9)*.35);
          churn += min(1., r.w*1.6)*(1. - smoothstep(.05, 1.6, age))*(1. - smoothstep(.2 + age*.35, .45 + age*.6, dn))*bits; }
        n = normalize(n);
        // ---- colour: the sky mirrored, the water's own colour seen through it ----
        vec3 rd = reflect(-v, n); rd.y = abs(rd.y);
        float F = .02 + .98*pow(1. - max(dot(n, v), 0.), 5.);
        vec3 refl = skyReflect(normalize(rd));
        // Unresolved wavelets scatter the reflected sky rather than leaving an oily mirror.
        // Reuse the cheap sky gradient; no reflection render target or extra texture fetch.
        float roughWater = (.06 + .22*uWind)*smoothstep(.015, .3, footprint);
        refl = mix(refl, skyBase(normalize(vec3(rd.x, max(rd.y, .16), rd.z))), roughWater);
        float lit = uDay + uDusk*.55 + uNight*.12, dim = 1. - .25*smoothstep(.5, 1., uCloud) - .15*uRain;
        float sd = shoreDist(p), shallow = 1. - smoothstep(0., 16., sd);
        // looking down into it you see the deep colour; at a low angle more of the light scattered back out; the
        // shallows by the land are lighter and greener
        vec3 body = mix(uWater*1.25 + vec3(0., .012, .01), uWater*.72, pow(clamp(v.y, 0., 1.), .6));
        body = mix(body, uWater*1.55 + vec3(.012, .03, .018), shallow*.7)*lit*dim;
        // Broad, restrained variations of depth/current colour, not a repeating surface tile.
        float waterMass = noise(p*.018 + flow*.025);
        body *= .9 + .2*waterMass;
        body += vec3(.003, .018, .014)*shallow*(1. - F)*lit*dim;
        // light through the thin water at the crests, more so looking towards the sun
        float crest = smoothstep(-.05, .4, h)*(1. - uNight);
        float toward = pow(max(dot(-v, normalize(vec3(uSunDir.x, 0., uSunDir.z))), 0.), 3.);
        body += vec3(.010, .042, .036)*crest*(.5 + 1.1*toward)*lit*dim;
        // close below you, light comes back up out of the water: the foreground isn't a black pool
        body *= 1. + .35*(1. - smoothstep(3., 26., dist));
        body += vec3(.004, .008, .014)*uNight;
        // the dark of a wall or bank mirrored close to it
        refl = mix(refl, vec3(.16, .15, .13)*lit, (1. - smoothstep(0., 7., sd))*.45*(1. - rd.y));
        vec3 col = mix(body, refl, clamp(F*1.05, 0., .9));
        // after dark the water still catches the glow of the sky and the town, enough to see the swell move
        col += vec3(.016, .020, .034)*uNight*(.4 + F*1.6)*(.8 + .4*smoothstep(-.3, .4, h));
        // the sun's glitter (a gold path at dusk, never a red one) and the moon's
        float sunVis = (uDay + uDusk)*(1. - smoothstep(.55, .95, uCloud));
        float sp = max(dot(rd, uSunDir), 0.);
        col += mix(vec3(1., .93, .8), vec3(1., .74, .48), uDusk)*(pow(sp, mix(600., 100., smoothstep(.015, .22, footprint)))*mix(5., .84, smoothstep(.015, .22, footprint)) + pow(sp, 60.)*.16)*sunVis;
        float mp = max(dot(rd, uMoonDir), 0.); col += vec3(.8, .85, 1.)*pow(mp, 200.)*1.4*uNight*uMoonLight*(1. - smoothstep(.6, 1., uCloud));
        // lamps on piers and promenades after dark: warm streaks broken up by the waves
        for (int i = 0; i < 4; i++) { vec4 L = uLamps[i]; if (L.w <= 0.) continue; vec3 ld = normalize(L.xyz - vW); float s2 = max(dot(rd, ld), 0.); vec2 o = L.xz - vW.xz; float fall = 1./(1. + dot(o, o)*.003);
          col += vec3(1., .78, .45)*(pow(s2, 90.)*2.4 + pow(s2, 14.)*.08)*L.w*fall; }
        // ---- foam ----
        float sea = uKind < .5 ? 1. : 0.;
        // whitecaps once the wind is up (about force 4): on the higher crests, in patches that come and go, drawn
        // out down wind
        vec2 pf = vec2(dot(p, wd), dot(p, wx));
        float capPatch = smoothstep(.36, .7, noise(p*.09 - flow*.3)*.6 + noise(p*.31 + vec2(uTime*.13, -uTime*.09))*.4);
        // Break only the exposed crests, not every bright contour of the swell.
        float crestHeight = h/(.12 + .5*uSwell + .2*uWind);
        float capGrain = noise(pf*vec2(.8, 2.8) - vec2(uTime*.65, 0.));
        float cap = smoothstep(.38, .78, crestHeight)*smoothstep(.35, .8, uWind)*sea*capPatch;
        cap *= smoothstep(.26, .66, capGrain)*(.45 + .55*smoothstep(.02, .18, length(s.yz)));
        cap *= 1. - smoothstep(120., 430., dist);
        float streak = 0.;
        #if WQ > 0
          // old foam lying in streaks along the wind, broken into short lengths and thin patches (unbroken, they read as
          // long pale lines drawn across the sea)
          streak = smoothstep(.74, .92, noise(pf*vec2(.07, 1.1) + vec2(-uTime*.15, 0.)))*smoothstep(.45, .75, noise(p*.45 + 5.)*.6 + noise(p*1.7 - uTime*.1)*.4)*smoothstep(.55, 1., uWind)*sea*.22*(1. - smoothstep(40., 200., dist));
        #endif
        float shore = uShoreZ > -1e3 ? smoothstep(-26., 0., p.y - uShoreZ) : 0.;
        float band = smoothstep(.5, .9, sin((p.y - uShoreZ)*.45 + uTime*1.3 + noise(vec2(p.x*.05, uTime*.1))*3.))*shore;
        float wash = smoothstep(-3., .5, p.y - uShoreZ + noise(vec2(p.x*.2, uTime*.4))*2.)*(uShoreZ > -1e3 ? 1. : 0.);
        // foam washing against walls, piers and banks, pulsing as each wave arrives
        float pulse = sin(uTime*1.1 + dot(p, uWindDir)*.25 + noise(p*.08)*4.)*(.5 + .7*uSwell + .4*uWind);
        // small ragged patches of bubbles in a narrow band hard against the wall, thickest right at it, the band
        // breathing in and out as each wave arrives and drains (two noises at small scales thresholded into clumps,
        // a third opening gaps between them, the clumps sparser away from the wall). The band reaches a metre or two
        // out (further as bigger waves arrive), on the fine shore map, and fades with distance so it never shimmers
        // Foam drifts along the wind instead of boiling in place; subpixel bubbles blend out.
        vec2 foamFlow = -wd*uTime*.12 + wx*sin(uTime*.35)*.08;
        float en1 = noise(p*vec2(4.3, 3.7) + foamFlow), en2 = mix(noise(p*9.1 + foamFlow*1.7), .5, smoothstep(.025, .12, footprint));
        float clump = smoothstep(.45 + .1*sd, .72 + .1*sd, en1*.6 + en2*.4)*smoothstep(.2, .5, noise(p*1.1 + uTime*.06));
        float eband = 1. - smoothstep(.05, 1.2 + max(pulse, 0.)*.6, sd + (en2 - .5)*.5);
        float edge = eband*(clump*(.35 + .65*eband)*.8 + eband*.12*en2)*(1. - smoothstep(35., 90., dist));
        float foam = cap*.6 + streak + band*.6 + wash*.75*smoothstep(.35, .65, noise(p*vec2(1.5, 3.) + uTime*.5)) + edge*.8*uShoreOn + churn*.7;
        // foam is never paper white: bubbles over water take on its colour, more so thin; the light on it is the day's
        foam = clamp(foam, 0., .8);
        vec3 foamC = mix(uWater*2.2 + vec3(.3, .33, .34), vec3(.8, .83, .84), smoothstep(.2, .7, foam));
        col = mix(col, foamC*(lit*dim + uNight*.05), foam*(.75 + .2*smoothstep(.2, .7, foam)));
        // ---- haze: the same as the land's close in (three's exponential fog), the sky's own horizon far out ----
        float fogK = 1. - exp(-uFogD*uFogD*dist*dist);
        vec3 hz = mix(uFogC, skyBase(normalize(vec3(-v.x, .02, -v.z))), smoothstep(.5, 1., fogK));
        col = mix(col, hz, fogK);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const water = new THREE.Mesh(wGeo, waterMat); water.frustumCulled = false; water.renderOrder = -5; group.add(water);

  // ---- materials ----
  const stoneMaps = concrete({ size: 256, seed: 3, tint: [160, 155, 145] });
  const sandTex = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, "#c9b48a", 0.22, 5000, 1.5), [60, 30]);
  const grassTex = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, "#4d6b33", 0.25, 6000, 2); }, [80, 40]);
  const M = {
    stone: new THREE.MeshStandardMaterial({ ...stoneMaps, normalScale: new THREE.Vector2(.45, .45), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x6f6b63, roughness: 0.95 }),
    weed: new THREE.MeshStandardMaterial({ color: 0x2f3a24, roughness: 1 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x2a5a7a, roughness: 0.5, metalness: 0.4 }),
    sand: new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
    cliff: new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1, flatShading: true }),
    far: new THREE.MeshStandardMaterial({ color: 0x5f6f58, roughness: 1, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3a5a2c, roughness: 1, flatShading: true }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb8312b, roughness: 0.6 }),
    reed: new THREE.MeshStandardMaterial({ color: 0x7a7a3e, roughness: 1 }),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe0a0 }),
  };
  // solid things the camera mustn't pass through (anything at least 30 cm across: walls, decks, buildings, posts
  // left out); the camera also keeps above floorAt()
  const solids = [];
  let floorAt = () => 0;
  const box = (w, h, d, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
    if (mat === M.stone) {
      // Metres, not one tile stretched over an entire slab. Project each box face onto its own plane.
      const p = m.geometry.attributes.position, n = m.geometry.attributes.normal, uv = m.geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const a = Math.abs(n.getY(i)) > .5 ? p.getX(i) + x : Math.abs(n.getX(i)) > .5 ? p.getZ(i) + z : p.getX(i) + x;
        const b = Math.abs(n.getY(i)) > .5 ? p.getZ(i) + z : p.getY(i) + y;
        uv.setXY(i, a / 8, b / 8);
      }
    }
    m.castShadow = m.receiveShadow = true; parent.add(m); if (Math.min(w, h, d) >= 0.3) solids.push(m); return m; };
  const lamps = [], pointLights = [], lampSpots = []; // (lampSpots: where lamps hang, for their reflections on the water)
  const buildings = (x0, x1, z0, z1, n, seed = 1) => {
    // a town's worth of simple houses and flats, roofs and lit windows at night
    const win = canvasTex(64, 64, (g) => { g.fillStyle = "#cfc7b8"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#3a4450"; for (let y = 8; y < 64; y += 20) for (let x = 8; x < 64; x += 20) g.fillRect(x, y, 10, 12); });
    const cols = [0xd8d0c0, 0xc9b8a0, 0xe6e0d6, 0xb79c84, 0xd2c6b4, 0xa89888];
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) {
      const w = 7 + rnd() * 9, d = 7 + rnd() * 8, h = 6 + rnd() * (rnd() < 0.15 ? 18 : 8);
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      const mat = new THREE.MeshStandardMaterial({ color: pick(cols, i), map: win, roughness: 0.9, emissive: 0xffc070, emissiveIntensity: 0, emissiveMap: win });
      mat.map.repeat.set(Math.round(w / 3), Math.round(h / 3));
      const b = box(w, h, d, mat, x, h / 2 + 2, z); lamps.push(mat); b.castShadow = false;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 3, 4), new THREE.MeshStandardMaterial({ color: 0x6a3a2c, roughness: 0.9 }));
      roof.position.set(x, h + 3.5, z); roof.rotation.y = Math.PI / 4; group.add(roof);
    }
  };
  const tree = (x, z, s = 1, y = 0) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 3 * s, 6), M.trunk); t.position.set(x, y + 1.5 * s, z); group.add(t);
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 * s, 0), M.leaf); c.position.set(x, y + 4 * s, z); c.scale.y = 1.2; c.castShadow = true; group.add(c);
  };
  const ridge = (x0, x1, z, h, mat, seed = 3, depth = 120) => {
    // a far headland or line of hills: a jagged extruded profile
    const sh = new THREE.Shape(); sh.moveTo(x0, -2);
    let s = seed; const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    for (let x = x0; x <= x1; x += (x1 - x0) / 40) sh.lineTo(x, h * (0.55 + 0.45 * Math.sin((x - x0) / (x1 - x0) * Math.PI)) * (0.85 + rnd() * 0.3));
    sh.lineTo(x1, -2);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); const m = new THREE.Mesh(g, mat); m.position.z = z - depth; group.add(m);
  };
  const reeds = (x0, x1, z, y = 0) => { const g = new THREE.CylinderGeometry(0.015, 0.02, 1.4, 3); for (let x = x0; x < x1; x += 0.35) { if (Math.random() < 0.35) continue; const r = new THREE.Mesh(g, M.reed); r.position.set(x + Math.random() * 0.3, y + 0.5, z + (Math.random() - 0.5) * 1.2); r.rotation.z = (Math.random() - 0.5) * 0.3; group.add(r); } };

  // ---- a real 360° photo all round (Mapillary): it shows the place, the sky and the water as they were ----
  if (pano) {
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
    const t = loader.load(pano.url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const geo = new THREE.SphereGeometry(3500, 96, 48); geo.scale(-1, 1, 1);
    const ph = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, fog: false, depthWrite: false, toneMapped: false }));
    const h = ((pano.heading || 0) * Math.PI) / 180;
    ph.rotation.y = Math.atan2(-Math.cos(h), -Math.sin(h)); // the photo's middle towards the way the camera faced
    ph.renderOrder = -9; ph.frustumCulled = false; group.add(ph);
    sky.visible = false; water.visible = false;
  }
  // ---- the place itself: the real one from map data when there is one, otherwise a representative one ----
  if (pano) { /* the photo is the place */ }
  else if (real) {
    floorAt = buildRealPlace(group, real, M, solids, quality) || floorAt; if (real.buildingGlow) lamps.push(...real.buildingGlow);
    // a lamp over the anglers after dark (piers, quays and promenades are lit), like the drawn pier's
    const sp = real.spots || [];
    if (sp.length) {
      const c = sp.reduce((a, q) => [a[0] + q.at[0] / sp.length, a[1] + q.at[1] / sp.length, a[2] + q.at[2] / sp.length], [0, 0, 0]); const pl = new THREE.PointLight(0xffd9a0, 0, 48, 1.2); pl.position.set(c[0], c[1] + 8, c[2]); pl.userData.cd = 30; group.add(pl); pointLights.push(pl); // (a soft wash along the fishing stretch)
      // the lamp posts nearest the anglers cast warm pools on the deck round them: a light at each of the nearest few
      // (none on Performance, two on Balanced, three on High quality), and the nearest four shine on the water
      lampPools(real.perches || [], [c[0], c[2]], 4).forEach((q, i) => {
        const at = [q[0], q[1] + 0.8, q[2]]; lampSpots.push(at);
        if (i < LQ.lampLights) { const pk = poolLight(at[1] - c[1]), l = new THREE.PointLight(0xffc98a, 0, pk.distance, 2); l.position.set(at[0], at[1], at[2]); l.userData.cd = pk.intensity; group.add(l); pointLights.push(l); }
      });
      if (!lampSpots.length) lampSpots.push(pl.position.toArray());
    }
  }
  else if (venue === "pier") {
    const len = L.from - L.to, mid = (L.from + L.to) / 2;
    box(L.width, 1, len, M.stone, 0, L.deck - 0.5, mid);
    box(L.width + 0.6, L.deck + 3, len, M.wall, 0, (L.deck - 3) / 2 - 0.5, mid);
    box(L.width + 0.7, 1.2, len, M.weed, 0, -0.2, mid); // the weedy band at the waterline
    for (const side of [-1, 1]) {
      for (let z = L.to + 1; z < L.from; z += 2.4) box(0.08, 1.1, 0.08, M.rail, side * (L.width / 2 - 0.15), L.deck + 0.55, z);
      for (const y of [0.55, 1.05]) box(0.05, 0.05, len - 2, M.rail, side * (L.width / 2 - 0.15), L.deck + y, mid);
    }
    for (let z = L.to + 8; z < L.from; z += 16) { // lamp posts
      const p = box(0.14, 4.5, 0.14, M.rail, -L.width / 2 + 0.6, L.deck + 2.25, z);
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.lampGlow); g.position.set(-L.width / 2 + 0.9, L.deck + 4.5, z); group.add(g); lamps.push(g); p.castShadow = false;
      if (z < 0 && z > -50) { const pl = new THREE.PointLight(0xffd9a0, 0, 26, 1.6); pl.position.set(-L.width / 2 + 0.9, L.deck + 4.3, z); group.add(pl); pointLights.push(pl); }
    }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 6, 12), M.white); beacon.position.set(-3, L.deck + 3, L.to + 2.5); beacon.castShadow = true; group.add(beacon);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.4, 12), M.red); top.position.set(-3, L.deck + 6.7, L.to + 2.5); group.add(top);
    // the beach beside the pier, the town behind, a far headland and the harbour wall opposite
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(600, 160, 60, 16), M.sand); beach.rotation.x = -Math.PI / 2;
    { const p = beach.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const zz = -p.getY(i); p.setZ(i, Math.max(-2.5, (zz + 10) * 0.045)); } beach.geometry.computeVertexNormals(); }
    beach.position.set(-305, 0, 90); beach.receiveShadow = true; group.add(beach);
    buildings(-260, 200, 130, 260, 60, 7);
    ridge(-2200, -600, -200, 70, M.cliff, 5, 400);
    box(240, 3, 8, M.wall, 140, 1.5, 30); // the other side of the harbour mouth
    { const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 260), M.grass); g.rotation.x = -Math.PI / 2; g.position.set(200, 2.9, 160); group.add(g); }
  } else if (venue === "beach") {
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(900, 120, 90, 30), M.sand); beach.rotation.x = -Math.PI / 2;
    // the water's edge runs along z = 0 (where the shader's foam line is), a few metres in front of the anglers; the
    // beach shelves up behind them (0.9 m where they stand, at z = 6) and on under the water in front
    { const p = beach.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const z = 40 - p.getY(i); p.setZ(i, Math.max(-2.5, Math.min(5, z * 0.15 + Math.sin(p.getX(i) * 0.05) * 0.1))); } beach.geometry.computeVertexNormals(); }
    beach.position.set(0, 0, 40); beach.receiveShadow = true; group.add(beach);
    for (let x = -360; x <= 360; x += 72) { for (let z = -14; z < 30; z += 1.1) box(0.35, 1.4 - Math.max(0, -z) * 0.04, 0.35, M.wood, x, 0.4 + z * 0.06, z); box(0.15, 0.5, 44, M.wood, x, 0.9, 8); }
    const dunes = new THREE.Mesh(new THREE.PlaneGeometry(900, 60, 60, 8), M.grass); dunes.rotation.x = -Math.PI / 2; { const p = dunes.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 4 + Math.sin(p.getX(i) * 0.08) * 1.5 + Math.random() * 0.6); dunes.geometry.computeVertexNormals(); } dunes.position.set(0, 0, 120); group.add(dunes);
    ridge(-1600, -500, -260, 90, M.cliff, 9, 500); ridge(700, 1800, -400, 50, M.far, 4, 400);
  } else if (venue === "estuary") {
    box(500, L.deck + 3, 50, M.stone, 0, (L.deck - 3) / 2, 25);
    box(500, 1.2, 0.8, M.weed, 0, -0.2, -0.2);
    for (let x = -240; x < 240; x += 14) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10), M.wall); b.position.set(x, L.deck + 0.3, 1.0); group.add(b); }
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 400), M.grass); far.rotation.x = -Math.PI / 2; far.position.set(0, 1.2, L.farBank - 200); group.add(far);
    box(2000, 2.2, 6, M.wall, 0, 0.1, L.farBank);
    buildings(-300, 300, L.farBank - 60, L.farBank - 20, 26, 3); buildings(-300, 300, 70, 160, 40, 11);
    for (let x = -120; x <= 120; x += 80) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 8), x % 160 ? M.red : new THREE.MeshStandardMaterial({ color: 0x2f8a3a })); b.position.set(x, 0.6, -60); group.add(b); }
    ridge(-1800, 1800, -900, 60, M.far, 2, 300);
  } else if (venue === "river") {
    const near = new THREE.Mesh(new THREE.PlaneGeometry(800, 120), M.grass); near.rotation.x = -Math.PI / 2; near.position.set(0, L.deck, 60.5); near.receiveShadow = true; group.add(near);
    box(800, L.deck + 2, 1, new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 }), 0, L.deck / 2 - 1, 0.3);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(800, 200), M.grass); far.rotation.x = -Math.PI / 2; far.position.set(0, 0.9, L.farBank - 100); group.add(far);
    box(800, 2.6, 1, new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 1 }), 0, -0.4, L.farBank);
    for (let x = -300; x < 300; x += 9 + Math.random() * 12) tree(x, L.farBank - 4 - Math.random() * 30, 1 + Math.random() * 0.8, 0.9);
    for (let x = -300; x < 300; x += 14 + Math.random() * 16) if (Math.abs(x) > 6) tree(x, 9 + Math.random() * 30, 0.9 + Math.random() * 0.8, L.deck);
    reeds(-300, 300, L.farBank + 1.5, 0); reeds(-300, -16, 0.8, 0); reeds(16, 300, 0.8, 0);
    ridge(-1500, 1500, -700, 80, M.far, 6, 300);
  } else {
    const near = new THREE.Mesh(new THREE.PlaneGeometry(900, 140), M.grass); near.rotation.x = -Math.PI / 2; near.position.set(0, L.deck, 70.5); near.receiveShadow = true; group.add(near);
    box(900, L.deck + 1.5, 1, new THREE.MeshStandardMaterial({ color: 0x55462f, roughness: 1 }), 0, L.deck / 2 - 0.75, 0.4);
    for (const s of L.spots) box(3.2, 0.12, 2.4, M.wood, s.at[0], L.deck - 0.055, s.at[2] - 0.6); // wooden swims (their tops level with the bank, where you stand: they were 12 cm proud, over your boots and the mat)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 500), M.grass); far.rotation.x = -Math.PI / 2; far.position.set(0, 1, L.farBank - 250); group.add(far);
    for (let x = -700; x < 700; x += 7 + Math.random() * 10) tree(x, L.farBank - 2 - Math.random() * 40, 1.2 + Math.random(), 1);
    for (let x = -260; x < 260; x += 16 + Math.random() * 20) if (Math.abs(x) > 8) tree(x, 10 + Math.random() * 40, 1 + Math.random() * 0.6, L.deck);
    reeds(-240, -15, 0.6, 0); reeds(15, 240, 0.6, 0);
    ridge(-2000, 2000, -1000, 120, M.far, 8, 300);
  }

  if (!real) for (const pl of pointLights) lampSpots.push(pl.position.toArray());

  // ---- walking about (walker.js): the real place's own ground, or the drawn place's deck, quay, bank or beach ----
  let ground = null;
  if (!pano && real?.ground) ground = real.ground;
  else if (!pano) ground = drawnGround(venue);

  // ---- the shore map for the water's foam and shallows (real places from their land; drawn places from their layout) ----
  if (!pano && venue !== "beach") {
    const piersNear = (real?.piers || []).filter((pr) => pr.line);
    const near = (x, z, line, half) => { for (let k = 0; k < line.length - 1; k++) { const [x1, z1] = line[k], [x2, z2] = line[k + 1], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / l2)); if (Math.hypot(x - x1 - dx * t, z - z1 - dz * t) < half) return true; } return false; };
    const isLand = real ? (x, z) => floorAt(x, z) > 0 || piersNear.some((pr) => near(x, z, pr.line, pr.width / 2 + 0.3)) : drawnLand(venue, L);
    if (isLand) {
      const tex = new THREE.DataTexture(shoreBytes(shoreDistances(isLand)), SHORE.n, SHORE.n, THREE.RedFormat, THREE.UnsignedByteType);
      tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
      const fine = new THREE.DataTexture(shoreBytes(shoreDistances(isLand, SHORE_FINE), SHORE_FINE.cap), SHORE_FINE.n, SHORE_FINE.n, THREE.RedFormat, THREE.UnsignedByteType);
      fine.magFilter = fine.minFilter = THREE.LinearFilter; fine.needsUpdate = true;
      wU.uShore.value = tex; wU.uShoreF.value = fine; wU.uShoreOn.value = 1;
    }
  }

  // ---- rain: streaks falling round the camera ----
  const RAIN_N = Math.round(1800 * Math.max(0.4, quality));
  const rainGeo = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rp.set([x, y, z, x, y - 0.5, z], i * 6); }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; group.add(rain);

  let rainAmt = 0, wind = 0.3, windDir = [0.3, -1];
  // gulls and a few boats at the coast (wildlife.js): where the anglers are, the water to put boats on, lamps to perch on
  const spotsNow = real ? real.spots || [] : L?.spots || [];
  const centre = spotsNow.length ? [spotsNow.reduce((a, q) => a + q.at[0], 0) / spotsNow.length, spotsNow.reduce((a, q) => a + q.at[2], 0) / spotsNow.length] : [0, -20];
  const wildlife = pano ? null : createWildlife(group, { venue, waterAt: real ? real.waterAt : (x, z) => z < -25, perches: real ? real.perches || [] : [], centre, seed: Math.round(Math.abs(centre[0] * 13 + centre[1] * 7)) + 3 });
  // ---- conditions: worked out once (setEnv), then eased towards every frame, so a change of weather or light
  // comes in over a few seconds instead of jumping (the first one, as the view opens, is applied at once) ----
  let target = null, cur = null;
  const EASE = 0.7; // per second
  const lightDir = new THREE.Vector3(0.3, 0.5, -0.8), shadowAt = new THREE.Vector3();
  let look = lightingFor({ day: 1, dusk: 0, night: 0, cloud: 0.3, rain: 0, moonLight: 0 });
  function apply(st) {
    U.uDay.value = st.day; U.uDusk.value = st.dusk; U.uNight.value = st.night; U.uCloud.value = st.cloud; U.uRain.value = st.rain; U.uMoonLight.value = st.moonLight;
    U.uSunDir.value.copy(st.sunDir); U.uMoonDir.value.copy(st.moonDir);
    wind = st.wind; windDir = [st.windDir.x, st.windDir.y];
    wU.uWind.value = st.wind; wU.uWindDir.value.copy(st.windDir).normalize(); wU.uSwell.value = st.swell;
    // ---- light (skyLook.js): the sun by day, the moon at night, gold and low at dusk; cloud hides it and the sky's
    // own light takes over, so overcast and rain are soft and even, never a glare ----
    look = lightingFor(st);
    lightDir.copy(st.night > 0.6 ? st.moonDir : st.sunDir);
    sun.position.copy(shadowAt).addScaledVector(lightDir, 80); sun.target.position.copy(shadowAt);
    sun.color.setRGB(...look.sunColour); sun.intensity = look.sunIntensity;
    if (sun.castShadow) sun.shadow.intensity = look.shadow;
    hemi.color.setRGB(...look.skyColour); hemi.groundColor.setRGB(...look.groundColour); hemi.intensity = look.skyIntensity;
    // ---- haze: the horizon's colour, the same exponential haze for the land and the water (thicker in rain) ----
    scene.fog.color.setRGB(...look.fogColour); scene.fog.density = look.fogDensity;
    wU.uFogC.value.copy(scene.fog.color); wU.uFogD.value = look.fogDensity;
    // (the environment map's lower half: the dark of the sea)
    envSky.uniforms.uEnvGround.value.copy(wU.uWater.value).multiplyScalar(0.8 * (st.day + st.dusk * 0.5 + st.night * 0.08));
    // ---- lamps after dark: the pools by the anglers, the lanterns and windows, their streaks on the water ----
    const lampOn = look.lampOn;
    // (switched off altogether by day: an unlit light still costs every pixel it might reach)
    for (const pl of pointLights) { pl.intensity = lampOn * (pl.userData.cd || 60); pl.visible = lampOn > 0.02; }
    for (const m of lamps) { if (m.emissiveIntensity != null) m.emissiveIntensity = st.night * 0.9 + st.dusk * 0.3; else m.visible = st.night + st.dusk > 0.3; }
    for (let i = 0; i < 4; i++) { const q = lampSpots[i]; wU.uLamps.value[i].set(q ? q[0] : 0, q ? q[1] : 0, q ? q[2] : 0, q ? lampOn : 0); }
    M.stone.color.setScalar(1 - st.rain*.25);
    M.stone.roughness = 1 - st.rain*.35;
    if (real?.deckWet) real.deckWet.value = Math.min(1, st.rain * 1.4); // the deck darkens and shines in the rain (wetLook.js)
    rainAmt = st.rain; rain.visible = st.rain > 0.02; rain.material.opacity = 0.18 + st.rain * 0.3;
  }
  return {
    group, water, uniforms: U, waterUniforms: wU, layout: L, materials: M, solids,
    /** The sky (no stars, the sea below the horizon) for world.js's environment map. */
    envSky,
    /** The conditions as shown right now (eased) and their light (skyLook.js lightingFor). */
    get current() { return cur ? { day: cur.day, dusk: cur.dusk, night: cur.night, cloud: cur.cloud, rain: cur.rain, moonLight: cur.moonLight } : null; },
    get light() { return look; },
    floorAt: (x, z) => floorAt(x, z),
    ground,
    /** The waves as the water shows them right now (eased), so floats and fish ride the same sea. */
    waveState: () => ({ swell: wU.uSwell.value, wind: wU.uWind.value, windDir: [wU.uWindDir.value.x, wU.uWindDir.value.y] }),
    /** light: { sunAlt, sunAz, moonAlt, moonAz, moonIllum } (degrees); cond: { windKph, windDir, cloudPct, precipMm, waveM }; facing: bearing of -z */
    setEnv({ light = {}, cond = {}, facing = 180 } = {}) {
      const toDir = (alt, az) => { const a = (alt * Math.PI) / 180, b = (((az ?? 180) - facing) * Math.PI) / 180; return new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(a), -Math.cos(b) * Math.cos(a)); };
      const sa = light.sunAlt ?? 35, ma = light.moonAlt ?? -10;
      const day = THREE.MathUtils.smoothstep(sa, -2, 12), night = 1 - THREE.MathUtils.smoothstep(sa, -12, -3), dusk = Math.max(0, 1 - day - night);
      const cloud = cond.cloudPct != null ? cond.cloudPct / 100 : 0.35, r = cond.precipMm > 0 ? Math.min(1, 0.25 + cond.precipMm / 3) : 0;
      const w = Math.min(1, Math.max(0, (cond.windKph ?? 12) / 45));
      // the waves run the way the wind blows (it comes from windDir)
      const wb = cond.windDir != null ? (((cond.windDir + 180) - facing) * Math.PI) / 180 : 0.4;
      target = {
        day, dusk, night, cloud, rain: r, wind: w, moonLight: (light.moonIllum ?? 0.5) * (ma > 0 ? 1 : 0),
        sunDir: toDir(Math.max(sa, -6), light.sunAz), moonDir: toDir(Math.max(ma, 2), light.moonAz), windDir: new THREE.Vector2(Math.sin(wb), -Math.cos(wb)),
        swell: venue === "river" || venue === "lake" ? 0 : cond.waveM != null ? Math.min(1, cond.waveM / 1.5) : Math.min(1, 0.15 + w * 0.6),
      };
      if (!cur) { cur = { ...target, sunDir: target.sunDir.clone(), moonDir: target.moonDir.clone(), windDir: target.windDir.clone() }; apply(cur); }
      return { day, dusk, night, cloud, rain: r, wind: w, moonLight: target.moonLight };
    },
    /** ripples: up to 8 [x, z, age seconds, strength] */
    setRipples(list) { for (let i = 0; i < 8; i++) { const r = list[i]; wU.uRip.value[i].set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, r ? r[3] : 0); } },
    update(t, dt, cam) {
      real?.skyline?.update(t);
      if (real?.beacons) { const nt = cur ? Math.min(1, cur.night + cur.dusk * 0.6) : 0; for (const b of real.beacons) b(t, nt); }
      U.uTime.value = t; wU.uCam.value.set(Math.round(cam.position.x / 4) * 4, 0, Math.round(cam.position.z / 4) * 4);
      // the shadows' box round the camera, moved a 2 m step at a time
      const sx = Math.round(cam.position.x / 2) * 2, sz = Math.round(cam.position.z / 2) * 2;
      if (sx !== shadowAt.x || sz !== shadowAt.z) { shadowAt.set(sx, 0, sz); sun.position.copy(shadowAt).addScaledVector(lightDir, 80); sun.target.position.copy(shadowAt); }
      if (target && cur) {
        const k = 1 - Math.exp(-dt * EASE);
        let moved = false;
        for (const key of ["day", "dusk", "night", "cloud", "rain", "wind", "swell", "moonLight"]) { const d = target[key] - cur[key]; if (Math.abs(d) > 1e-4) { cur[key] += d * k; moved = true; } }
        for (const key of ["sunDir", "moonDir", "windDir"]) { if (cur[key].distanceTo(target[key]) > 1e-4) { cur[key].lerp(target[key], k); moved = true; } }
        if (moved) apply(cur);
      }
      wildlife?.update(t, dt, { night: cur?.night ?? 0, swell: cur?.swell ?? 0.3 });
      if (rainAmt > 0.02) {
        const p = rainGeo.attributes.position, sp = (14 + rainAmt * 10) * dt, sx = -windDir[0] * wind * 6 * dt, sz = -windDir[1] * wind * 6 * dt;
        for (let i = 0; i < RAIN_N; i++) { let y = p.getY(i * 2) - sp; let x = p.getX(i * 2) + sx, z = p.getZ(i * 2) + sz; if (y < -1) { y = 25 + Math.random() * 5; x = (Math.random() - 0.5) * 60; z = (Math.random() - 0.5) * 60; } p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x + windDir[0] * wind * 0.3, y - 0.45 - rainAmt * 0.3, z + windDir[1] * wind * 0.3); }
        p.needsUpdate = true; rain.position.set(cam.position.x, cam.position.y - 8, cam.position.z);
      }
    },
    dispose() { envSky.dispose(); scene.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.normalMap?.dispose?.(); m.roughnessMap?.dispose?.(); m.dispose?.(); }); }); scene.fog = null; },
  };
}
