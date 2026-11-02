// ---- environment: the representative 3D place round the anglers (sky, light, water, ground, scenery) ----
// Drawn, not photographed, and labelled so on screen. One sky for the sun, moon, cloud and stars; the water's waves
// follow the wind and the kind of place; the ground and scenery are built for a pier, beach, estuary quay, river
// bank or lake. All conditions come in through setEnv, so the sky, light, water, rain and fog agree.
import * as THREE from "three";
import { layoutFor } from "./spots.js";
import { buildRealPlace } from "./realPlace.js";

// ---- shared shader pieces: noise and the sky's colour in any direction ----
export const GLSL_NOISE = /* glsl */`
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
`;
const GLSL_SKY = /* glsl */`
uniform vec3 uSunDir, uMoonDir;
uniform float uDay, uDusk, uNight, uCloud, uRain, uTime, uMoonLight;
vec3 skyBase(vec3 d){
  float h = clamp(d.y, -.2, 1.);
  vec3 dayTop = vec3(.25, .48, .80), dayHor = vec3(.70, .80, .88);
  vec3 duskTop = vec3(.20, .24, .45), duskHor = vec3(.98, .58, .34);
  vec3 nightTop = vec3(.016, .024, .05), nightHor = vec3(.08, .09, .13);
  float t = pow(max(h, 0.), .45);
  vec3 c = mix(dayHor, dayTop, t)*uDay + mix(duskHor, duskTop, pow(max(h, 0.), .35))*uDusk + mix(nightHor, nightTop, t)*uNight;
  // the warm glow round a low sun
  float sd = max(dot(d, uSunDir), 0.);
  c += vec3(1., .55, .25)*pow(sd, 6.)*uDusk*.8 + vec3(1., .9, .7)*pow(sd, 40.)*uDay*.25;
  // overcast: flatter and greyer, darker in rain
  vec3 grey = vec3(.62, .65, .68)*(uDay + uDusk*.55 + uNight*.06)*(1. - uRain*.35);
  return mix(c, grey, smoothstep(.55, 1., uCloud)*.85);
}
vec3 skyColour(vec3 d){
  vec3 c = skyBase(d);
  float sd = max(dot(d, uSunDir), 0.), md = max(dot(d, uMoonDir), 0.);
  float clear = 1. - smoothstep(.6, 1., uCloud);
  c += vec3(1., .95, .85)*smoothstep(.9994, .9998, sd)*(uDay + uDusk)*clear*3.;
  c += vec3(.85, .88, .95)*smoothstep(.9996, .99985, md)*uNight*uMoonLight*clear*1.6;
  // clouds on a high layer, drifting with the wind
  if (d.y > 0.) {
    vec2 cp = d.xz/(d.y + .12)*.9 + vec2(uTime*.004, uTime*.0015);
    float cl = fbm(cp*1.3 + fbm(cp*.7)*.6);
    float cover = smoothstep(1.05 - uCloud*.75, 1.25 - uCloud*.6, cl + uCloud*.35);
    vec3 cloudC = mix(vec3(.96, .96, .97), vec3(.55, .58, .62), uCloud*.6 + uRain*.4)*(uDay + uDusk*.75 + uNight*.05);
    cloudC += vec3(1., .5, .25)*uDusk*.35*(1. - cl);
    c = mix(c, cloudC, cover*smoothstep(0., .08, d.y));
    // stars on a clear night
    vec2 sp = d.xz/(d.y + .3)*180.;
    float st = step(.9965, hash(floor(sp)))*uNight*clear*(1. - cover);
    c += vec3(st)*.8;
  }
  return c;
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }",
    fragmentShader: GLSL_NOISE + GLSL_SKY + "varying vec3 vD; void main(){ gl_FragColor = vec4(skyColour(normalize(vD)), 1.); }",
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);

  // ---- light ----
  const hemi = new THREE.HemisphereLight(0xbfd6e8, 0x40382c, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 40, -40);
  if (quality >= 1) { sun.castShadow = true; sun.shadow.mapSize.set(quality > 1 ? 2048 : 1024, quality > 1 ? 2048 : 1024); Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 }); sun.shadow.bias = -0.0005; }
  group.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xb8c8d4, 260, 2600);

  // ---- water ----
  const wU = {
    ...U, uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.3, -1).normalize() }, uSwell: { value: 0.3 }, uKind: { value: 0 },
    uShoreZ: { value: venue === "beach" && !real ? 0 : -1e4 }, uWater: { value: new THREE.Color(0x1d4a56) }, uCam: { value: new THREE.Vector3() },
    uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uFogC: { value: new THREE.Color(0xb8c8d4) }, uFogFar: { value: 2600 },
  };
  const kind = { pier: 0, beach: 0, estuary: 1, river: 2, lake: 3 }[venue] ?? 0;
  wU.uKind.value = kind;
  wU.uWater.value.set([0x1b4752, 0x1b4752, 0x34463a, 0x2b3d33, 0x17302c][[0, 0, 1, 2, 3][kind] ?? 0]);
  const wGeo = new THREE.PlaneGeometry(1600, 1600, quality > 1 ? 280 : quality >= 1 ? 200 : 120, quality > 1 ? 280 : quality >= 1 ? 200 : 120);
  wGeo.rotateX(-Math.PI / 2);
  // denser near the middle (the camera), so near waves are smooth and far ones cheap
  { const p = wGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) / 800, k = r < 1e-6 ? 1 : Math.pow(r, 1.8) / r; p.setX(i, x * k); p.setZ(i, z * k); } }
  const waterMat = new THREE.ShaderMaterial({
    uniforms: wU, transparent: false,
    vertexShader: GLSL_NOISE + /* glsl */`
      uniform float uTime, uWind, uSwell, uKind; uniform vec2 uWindDir; uniform vec3 uCam;
      varying vec3 vW; varying float vH;
      float wave(vec2 p, vec2 d, float f, float a, float s){ return a*sin(dot(p, d)*f + uTime*s); }
      void main(){
        vec3 w = position + vec3(uCam.x, 0., uCam.z);
        float fade = 1. - smoothstep(60., 500., length(w.xz - uCam.xz));
        float sea = uKind < .5 ? 1. : uKind < 1.5 ? .5 : 0.;
        vec2 wd = uWindDir, wx = vec2(-wd.y, wd.x);
        float h = 0.;
        h += wave(w.xz, normalize(vec2(.2, -1.)), .09, (.18 + .55*uSwell)*sea, .9);
        h += wave(w.xz, normalize(vec2(-.35, -1.)), .14, (.10 + .3*uSwell)*sea, 1.15);
        h += wave(w.xz, normalize(wd + wx*.3), .45, .05 + .14*uWind, 1.9);
        h += wave(w.xz, normalize(wd - wx*.4), .7, .03 + .08*uWind, 2.4);
        h += wave(w.xz, normalize(wd + wx*.8), 1.2, .015 + .04*uWind, 3.1);
        vH = h; w.y += h*fade;
        vW = w;
        gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.);
      }`,
    fragmentShader: GLSL_NOISE + GLSL_SKY + /* glsl */`
      uniform float uWind, uSwell, uKind, uShoreZ, uFogFar; uniform vec2 uWindDir; uniform vec3 uWater, uCam, uFogC; uniform vec4 uRip[8];
      varying vec3 vW; varying float vH;
      float hgt(vec2 p){
        vec2 wd = uWindDir, wx = vec2(-wd.y, wd.x);
        float sea = uKind < .5 ? 1. : uKind < 1.5 ? .5 : 0.;
        float h = (.18 + .55*uSwell)*sea*sin(dot(p, normalize(vec2(.2, -1.)))*.09 + uTime*.9)
          + (.10 + .3*uSwell)*sea*sin(dot(p, normalize(vec2(-.35, -1.)))*.14 + uTime*1.15)
          + (.05 + .14*uWind)*sin(dot(p, normalize(wd + wx*.3))*.45 + uTime*1.9)
          + (.03 + .08*uWind)*sin(dot(p, normalize(wd - wx*.4))*.7 + uTime*2.4)
          + (.015 + .04*uWind)*sin(dot(p, normalize(wd + wx*.8))*1.2 + uTime*3.1);
        // fine ripples carried along by the wind; a river's current drifts them downstream
        vec2 flow = uKind > 1.5 && uKind < 2.5 ? vec2(-uTime*.6, 0.) : -wd*uTime*.35;
        h += (noise(p*vec2(2.6, 3.4) + flow) - .5)*(.03 + .06*uWind) + (noise(p*7.3 + flow*1.6) - .5)*(.008 + .02*uWind);
        return h;
      }
      void main(){
        vec2 p = vW.xz;
        float dist = length(vW - cameraPosition);
        float e = max(.04, dist*.004);
        vec3 n = normalize(vec3(hgt(p - vec2(e, 0.)) - hgt(p + vec2(e, 0.)), 2.*e, hgt(p - vec2(0., e)) - hgt(p + vec2(0., e))));
        // rain: a scatter of drop rings
        if (uRain > .01) for (int k = 0; k < 2; k++) {
          vec2 rc = p*(2.2 + float(k)*1.3) + float(k)*7.;
          vec2 ci = floor(rc), cf = fract(rc) - .5;
          float hc = hash(ci);
          if (hc < uRain*.8) { float ph = fract(uTime*(1.2 + hc) + hc*9.); float rr = length(cf); float fr = (rr - ph*.45)*30.;
            n.xz += normalize(cf + .001)*sin(fr)*exp(-fr*fr*.05)*(1. - ph)*.25*(1. - smoothstep(10., 60., dist)); }
        }
        // rings where a rig lands or a fish breaks the surface
        for (int i = 0; i < 8; i++) { vec4 r = uRip[i]; if (r.w <= 0.) continue; float d = length(p - r.xy); float fr = (d - r.z*1.4)*7.; n.xz += normalize(p - r.xy + .001)*sin(fr)*exp(-fr*fr*.08)*r.w*.35; }
        n = normalize(n);
        vec3 v = normalize(cameraPosition - vW);
        vec3 r = reflect(-v, n); r.y = abs(r.y);
        float F = .02 + .98*pow(1. - max(dot(n, v), 0.), 5.);
        vec3 refl = skyColour(normalize(r));
        float lit = uDay + uDusk*.6 + uNight*.16;
        vec3 body = uWater*lit*(.75 + .35*smoothstep(-.3, .4, vH));
        vec3 col = mix(body, refl, clamp(F*1.1, 0., .9));
        // the sun's (or moon's) glitter
        float sp = max(dot(r, uSunDir), 0.); col += vec3(1., .9, .7)*(pow(sp, 300.)*2.5 + pow(sp, 40.)*.15)*(uDay + uDusk)*(1. - smoothstep(.6, 1., uCloud));
        float mp = max(dot(r, uMoonDir), 0.); col += vec3(.8, .85, 1.)*pow(mp, 200.)*1.4*uNight*uMoonLight*(1. - smoothstep(.6, 1., uCloud));
        // whitecaps in a blow (open water), foam where waves break on a beach
        float sea = uKind < .5 ? 1. : 0.;
        float cap = smoothstep(.55, .9, vH/(.25 + .6*uSwell)*.5 + .5)*smoothstep(.45, .9, uWind)*sea*smoothstep(.35, .7, noise(p*1.7 + uTime*.3));
        float shore = uShoreZ > -1e3 ? smoothstep(-26., 0., p.y - uShoreZ) : 0.;
        float band = smoothstep(.5, .9, sin((p.y - uShoreZ)*.45 + uTime*1.3 + noise(vec2(p.x*.05, uTime*.1))*3.))*shore;
        float wash = smoothstep(-3., .5, p.y - uShoreZ + noise(vec2(p.x*.2, uTime*.4))*2.)*(uShoreZ > -1e3 ? 1. : 0.);
        float foam = clamp(cap*.7 + band*.6 + wash*.75*smoothstep(.35, .65, noise(p*vec2(1.5, 3.) + uTime*.5)), 0., .9);
        col = mix(col, vec3(.92, .94, .95)*lit, foam);
        // the far water fades into the haze at the horizon
        float fogK = smoothstep(uFogFar*.12, uFogFar, dist);
        col = mix(col, uFogC, fogK);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const water = new THREE.Mesh(wGeo, waterMat); water.frustumCulled = false; water.renderOrder = -5; group.add(water);

  // ---- materials ----
  const stoneTex = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, "#8e8b84", 0.18, 3000); g.strokeStyle = "rgba(40,36,30,.35)"; g.lineWidth = 2; for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 64) % 2 ? 0 : 64; x < w; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } } }, [4, 30]);
  const sandTex = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, "#c9b48a", 0.22, 5000, 1.5), [60, 30]);
  const grassTex = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, "#4d6b33", 0.25, 6000, 2); }, [80, 40]);
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92 }),
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
  const box = (w, h, d, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const lamps = [], pointLights = [];
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
  else if (real) { buildRealPlace(group, real, M); if (real.buildingMat) lamps.push(real.buildingMat); }
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
    { const p = beach.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const zz = -p.getY(i); p.setZ(i, Math.min(5, zz * 0.06 + 0.4 + Math.sin(p.getX(i) * 0.05) * 0.1)); } beach.geometry.computeVertexNormals(); }
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
    for (const s of L.spots) box(3.2, 0.12, 2.4, M.wood, s.at[0], L.deck + 0.06, s.at[2] - 0.6); // wooden swims
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 500), M.grass); far.rotation.x = -Math.PI / 2; far.position.set(0, 1, L.farBank - 250); group.add(far);
    for (let x = -700; x < 700; x += 7 + Math.random() * 10) tree(x, L.farBank - 2 - Math.random() * 40, 1.2 + Math.random(), 1);
    for (let x = -260; x < 260; x += 16 + Math.random() * 20) if (Math.abs(x) > 8) tree(x, 10 + Math.random() * 40, 1 + Math.random() * 0.6, L.deck);
    reeds(-240, -15, 0.6, 0); reeds(15, 240, 0.6, 0);
    ridge(-2000, 2000, -1000, 120, M.far, 8, 300);
  }

  // ---- rain: streaks falling round the camera ----
  const RAIN_N = Math.round(1800 * Math.max(0.4, quality));
  const rainGeo = new THREE.BufferGeometry(); const rp = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rp.set([x, y, z, x, y - 0.5, z], i * 6); }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; group.add(rain);

  let rainAmt = 0, wind = 0.3, windDir = [0.3, -1];
  return {
    group, water, uniforms: U, waterUniforms: wU, layout: L, materials: M,
    /** light: { sunAlt, sunAz, moonAlt, moonAz, moonIllum } (degrees); cond: { windKph, windDir, cloudPct, precipMm, waveM }; facing: bearing of -z */
    setEnv({ light = {}, cond = {}, facing = 180 } = {}) {
      const toDir = (alt, az) => { const a = (alt * Math.PI) / 180, b = (((az ?? 180) - facing) * Math.PI) / 180; return new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.sin(a), -Math.cos(b) * Math.cos(a)); };
      const sa = light.sunAlt ?? 35, ma = light.moonAlt ?? -10;
      const day = THREE.MathUtils.smoothstep(sa, -2, 12), night = 1 - THREE.MathUtils.smoothstep(sa, -12, -3), dusk = Math.max(0, 1 - day - night);
      const cloud = cond.cloudPct != null ? cond.cloudPct / 100 : 0.35, r = cond.precipMm > 0 ? Math.min(1, 0.25 + cond.precipMm / 3) : 0;
      wind = Math.min(1, Math.max(0, (cond.windKph ?? 12) / 45));
      U.uDay.value = day; U.uDusk.value = dusk; U.uNight.value = night; U.uCloud.value = cloud; U.uRain.value = r; U.uMoonLight.value = (light.moonIllum ?? 0.5) * (ma > 0 ? 1 : 0);
      U.uSunDir.value.copy(toDir(Math.max(sa, -6), light.sunAz)); U.uMoonDir.value.copy(toDir(Math.max(ma, 2), light.moonAz));
      // the waves run the way the wind blows (it comes from windDir)
      const wb = cond.windDir != null ? (((cond.windDir + 180) - facing) * Math.PI) / 180 : 0.4;
      windDir = [Math.sin(wb), -Math.cos(wb)];
      wU.uWind.value = wind; wU.uWindDir.value.set(windDir[0], windDir[1]).normalize();
      wU.uSwell.value = venue === "river" || venue === "lake" ? 0 : cond.waveM != null ? Math.min(1, cond.waveM / 1.5) : Math.min(1, 0.15 + wind * 0.6);
      // light: the sun by day, the moon at night, warm and low at dusk; overcast softens and dims it
      const lightDir = night > 0.6 ? U.uMoonDir.value : U.uSunDir.value;
      sun.position.copy(lightDir).multiplyScalar(80); sun.target.position.set(0, 0, 0);
      sun.color.setRGB(1, 0.92 - dusk * 0.3, 0.82 - dusk * 0.45).lerp(new THREE.Color(0.55, 0.62, 0.8), night);
      sun.intensity = (2.4 * day + 1.2 * dusk + 0.25 * night * U.uMoonLight.value) * (1 - cloud * 0.6) * (1 - r * 0.3);
      hemi.intensity = 0.25 + 0.75 * day + 0.35 * dusk; hemi.color.setRGB(0.7 + 0.1 * day, 0.8, 0.95).multiplyScalar(1 - 0.2 * cloud); hemi.groundColor.setRGB(0.25, 0.22, 0.18);
      if (night > 0.6) hemi.intensity = 0.32 + 0.18 * U.uMoonLight.value; // enough to see by: moonlight, the town's glow, the pier's lamps
      // the haze matches the horizon's colour, closer in rain
      const hz = new THREE.Color().setRGB(0.70, 0.8, 0.88).multiplyScalar(day).add(new THREE.Color(0.95, 0.6, 0.4).multiplyScalar(dusk)).add(new THREE.Color(0.04, 0.05, 0.08).multiplyScalar(night)).lerp(new THREE.Color(0.6, 0.63, 0.66).multiplyScalar(day + dusk * 0.5 + night * 0.06), cloud > 0.55 ? (cloud - 0.55) * 1.6 : 0);
      scene.fog.color.copy(hz); scene.fog.far = 2600 - r * 1900; scene.fog.near = 200 - r * 150; wU.uFogC.value.copy(hz); wU.uFogFar.value = scene.fog.far;
      for (const pl of pointLights) pl.intensity = (night * 1 + dusk * 0.3) * 60;
      for (const m of lamps) { if (m.emissiveIntensity != null) m.emissiveIntensity = night * 0.9 + dusk * 0.3; else m.visible = night + dusk > 0.3; }
      rainAmt = r; rain.visible = r > 0; rain.material.opacity = 0.18 + r * 0.3;
      return { day, dusk, night, cloud, rain: r, wind };
    },
    /** ripples: up to 8 [x, z, age seconds, strength] */
    setRipples(list) { for (let i = 0; i < 8; i++) { const r = list[i]; wU.uRip.value[i].set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0, r ? r[3] : 0); } },
    update(t, dt, cam) {
      U.uTime.value = t; wU.uCam.value.set(Math.round(cam.position.x / 4) * 4, 0, Math.round(cam.position.z / 4) * 4);
      if (rainAmt > 0) {
        const p = rainGeo.attributes.position, sp = (14 + rainAmt * 10) * dt, sx = -windDir[0] * wind * 6 * dt, sz = -windDir[1] * wind * 6 * dt;
        for (let i = 0; i < RAIN_N; i++) { let y = p.getY(i * 2) - sp; let x = p.getX(i * 2) + sx, z = p.getZ(i * 2) + sz; if (y < -1) { y = 25 + Math.random() * 5; x = (Math.random() - 0.5) * 60; z = (Math.random() - 0.5) * 60; } p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x + windDir[0] * wind * 0.3, y - 0.45 - rainAmt * 0.3, z + windDir[1] * wind * 0.3); }
        p.needsUpdate = true; rain.position.set(cam.position.x, cam.position.y - 8, cam.position.z);
      }
    },
    dispose() { scene.remove(group); group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); }); scene.fog = null; },
  };
}
