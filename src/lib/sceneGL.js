// ---- sceneGL: the moving water of the Live Fishing View, drawn over a real photo (WebGL, no libraries) ----
// Photo-based 2.5D compositing, as cinemagraph apps do: inside the water area the photo's own pixels are moved
// along the flow (towards the shore for the sea, across for a river) and refracted by animated wave slopes, with
// glints under the sun or moon, whitecaps in wind, rings where the line enters, cloud shadows, mist and the light
// of the hour graded over the picture. Nothing tries to turn one photo into 3D geometry. Without a photo it draws
// a representative scene (sky, far bank or open sea) that the app labels as representative.
//
// Coordinates: the scene is composed in a 3:2 reference frame ("ref", 0..1, y down). The angler lines up the photo,
// horizon, water area and cast point in that frame (SceneEditor); any screen shape shows it cover-fitted.

export const REF_ASPECT = 1.5;

const VS = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uFrame, uMask, uSky, uBlur, uShore;
uniform vec4 uMap;
uniform vec2 uRes;
uniform vec3 uWaterCol;
uniform float uTime, uHorizon, uWind, uFlowX, uRiver, uStill, uProc, uHasPhoto, uOct, uFlow;
uniform float uNight, uDusk, uDay, uRain, uFog, uCloud, uSunX, uSun, uMoonX, uMoon, uSunUp, uSunGlow, uMoonUp, uMoonDisc;
uniform vec4 uRip[6];
uniform vec4 uDist[2];
uniform float uSwell;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.;
  for (int i = 0; i < 5; i++){ if (float(i) >= uOct) break; s += a*noise(p); p = p*2.02 + vec2(1.7, 9.2); a *= .5; }
  return s; }

// height of the water surface at plane point w (x across, y = distance out)
float waves(vec2 w, float t){
  float sea = 1. - max(uRiver, uStill);
  float h = sea*(sin(w.y*1.15 + t*1.25 + sin(w.x*.35)*1.3)*.45 + sin(w.y*2.4 - w.x*.7 + t*2.05)*.2);
  vec2 drift = mix(vec2(0., -t*.28), vec2(t*.35*uFlowX, 0.), uRiver);
  h += (fbm(w*vec2(1.5, 2.1) + drift) - .5)*(.55 + uWind*1.2);
  return h;
}

float treeTop(float x){ return .012 + .028*fbm(vec2(x*5., 7.)) + .02*pow(noise(vec2(x*58., 1.)), 1.5) + .008*noise(vec2(x*150., 2.)); }

vec3 skyColour(float y, float hz){
  float k = clamp((hz - y)/max(hz, .05), 0., 1.);
  vec3 dayTop = vec3(.33,.55,.80), dayLow = vec3(.76,.84,.90);
  vec3 duskTop = vec3(.22,.24,.42), duskLow = vec3(.96,.62,.40);
  vec3 nightTop = vec3(.02,.04,.09), nightLow = vec3(.07,.10,.17);
  vec3 top = dayTop*uDay + duskTop*uDusk + nightTop*uNight;
  vec3 low = dayLow*uDay + duskLow*uDusk + nightLow*uNight;
  vec3 c = mix(low, top, pow(k, .55));
  vec3 grey = vec3(dot(c, vec3(.3,.59,.11)));
  return mix(c, grey*1.05, uCloud*.65);
}

// the sky (or cliff, or far bank) a water face reflects: from the photo, mirrored about the horizon, or drawn
vec3 reflSky(vec3 R, float x){
  float el = clamp(R.y/max(length(R.xz), .001), 0., 1.2);
  vec2 q = vec2(clamp(x, .01, .99), clamp(uHorizon - .004 - el*.7, .004, max(uHorizon - .004, .005)));
  if (uHasPhoto > .5) return texture2D(uBlur, q).rgb;
  vec3 c = skyColour(q.y, uHorizon);
  if (max(uRiver, uStill) > .5) {
    float tt = uHorizon - treeTop(q.x);
    c = mix(c, mix(vec3(.08,.12,.07), vec3(.02,.03,.05), uNight)*(uDay + uDusk*.55 + uNight*.2), smoothstep(tt - .014, tt + .006, q.y));
  }
  return c;
}

void main(){
  vec2 ref = vUv*uMap.xy + uMap.zw;
  float t = uTime;
  float hz = uHorizon;
  float photo = uHasPhoto;
  float m = photo > .5 ? texture2D(uMask, ref).r : smoothstep(hz, hz + .003, ref.y);
  float sk = photo > .5 ? texture2D(uSky, ref).r : 1. - smoothstep(hz - .003, hz, ref.y);
  float d = clamp((ref.y - hz)/max(1. - hz, .05), 0., 1.);
  float above = clamp((hz - ref.y)/max(hz, .05), 0., 1.);
  float lit = uDay + uDusk*.8 + uNight*.25;
  float wdir = uFlowX >= 0. ? 1. : -1.;
  vec3 col;
  vec3 sunCol = mix(vec3(1., .93, .78), vec3(1., .58, .30), uDusk);

  if (photo > .5) {
    col = texture2D(uFrame, ref).rgb;
    // the photo's own clouds drift with the wind: two offsets cross-faded, staggered across the sky so it never pulses
    if (sk > .01) {
      float st = noise(ref*vec2(3., 5.))*.6;
      float q0 = fract(t*.03 + st), q1 = fract(t*.03 + st + .5);
      float qw = 1. - abs(2.*q0 - 1.);
      float amt = .035*(.4 + uWind)*uFlow;
      vec2 b0 = ref - vec2(wdir*amt*(q0 - .5), 0.), b1 = ref - vec2(wdir*amt*(q1 - .5), 0.);
      b0.y = min(b0.y, hz - .004); b1.y = min(b1.y, hz - .004);
      vec3 drifted = texture2D(uFrame, b0).rgb*qw + texture2D(uFrame, b1).rgb*(1. - qw);
      col = mix(col, drifted, sk);
    }
  } else {
    // representative sky: gradient, layered cloud drifting with the wind
    col = skyColour(ref.y, hz);
    float cl = fbm(vec2(ref.x*3. - t*.008*wdir, ref.y*7.) + vec2(fbm(ref*3. + t*.01)*.5, 0.));
    col = mix(col, mix(vec3(.94), vec3(.35,.38,.45), uNight + uCloud*.4)*lit, smoothstep(.5, .85, cl)*(.35 + uCloud*.5)*step(ref.y, hz));
    // far bank for rivers and lakes: hazy hills, then a tree line with crowns
    if (max(uRiver, uStill) > .5 && ref.y < hz) {
      float hill = hz - .045 - .06*fbm(vec2(ref.x*2.1, 11.));
      vec3 haze = mix(vec3(.46,.54,.58), vec3(.06,.08,.11), uNight)*(uDay*.95 + uDusk*.7 + uNight*.35);
      col = mix(col, haze, smoothstep(hill - .002, hill + .002, ref.y)*.6);
      float top = hz - treeTop(ref.x);
      vec3 tree = mix(vec3(.10,.15,.09), vec3(.20,.26,.14), noise(ref*vec2(110., 70.)))*(uDay + uDusk*.55 + uNight*.18);
      tree *= mix(1.15, .62, clamp((ref.y - top)/max(hz - top, .001), 0., 1.));
      float tm = smoothstep(top - .0025, top + .0025, ref.y);
      col = mix(col, tree, tm);
      sk *= 1. - tm;
    }
  }

  // ---- the sky's mood: high wisps on the wind, the colour of the hour, the sun's glow and rays, stars ----
  if (sk > .01) {
    float wisp = fbm(vec2(ref.x*2.2 - t*.012*wdir, ref.y*7.5 + 3.) + vec2(fbm(ref*4. + t*.02)*.6, 0.));
    float wa = smoothstep(.55, .88, wisp)*(.10 + .16*(1. - uCloud))*(1. - uNight*.75);
    col = mix(col, mix(vec3(1.), vec3(1., .74, .56), uDusk)*lit, wa*sk*(.35 + .65*above));
    col = mix(col, col*vec3(.86,.94,1.12), uDay*above*.4*sk*(1. - uCloud*.6));
    col = mix(col, col*vec3(1.2,.9,.74) + vec3(.07,.025,0.), uDusk*(1. - above)*.65*sk);
    col = mix(col, col*vec3(.84,.76,1.14), uDusk*above*.5*sk);
    col = mix(col, col*vec3(.7,.8,1.15), uNight*.5*sk);
    vec2 spos = vec2(uSunX, hz - .03 - .55*uSunUp);
    vec2 dv = (ref - spos)*vec2(1.5, 1.);
    float sl0 = length(dv);
    // soft rays only when the sun is low; a gentle glow when it's high
    float rays = pow(noise(vec2(atan(dv.y, dv.x)*4.5, t*.04)), 2.)*exp(-sl0*2.6)*(1. - uSunUp);
    col += sunCol*(exp(-sl0*11.)*(.5 - .25*uSunUp) + exp(-sl0*3.)*(.14 - .06*uSunUp) + rays*.16)*uSunGlow*sk;
    vec2 cell = floor(ref*vec2(520., 340.));
    float star = step(.9968, hash(cell))*(.55 + .45*sin(t*2.6 + hash(cell + 7.)*40.));
    col += vec3(star)*uNight*.6*(1. - uCloud)*sk*step(.15, above);
    // the moon, when it's up
    vec2 mp = (ref - vec2(uMoonX, hz - .08 - .5*uMoonUp))*vec2(1.5, 1.);
    float ml = length(mp);
    col += vec3(.92,.94,1.)*(smoothstep(.024, .019, ml)*.85 + exp(-ml*14.)*.22 + exp(-ml*4.)*.06)*uMoonDisc*sk;
  }

  // ---- the water: a moving surface in perspective over the real scene ----
  // Worked out on the flat water plane (waves shrink and slow towards the horizon). Long swells in drifting groups,
  // wind waves from several directions and fine ripples riding on them, so nothing repeats. Each facet reflects
  // what's above it in the photo, mirrored about the real waterline at that point (walls, rocks and cliffs show in
  // the water right under them), sharp in calm and smeared in a blow. The body colour is the photo's own water.
  if (m > .002) {
    float dd = max(ref.y - hz, .0012);
    float z = .06/dd;
    vec2 P = vec2((ref.x - .5)*z*1.8, z);
    float fp = z*z/.06/max(uRes.y/uMap.y, 1.);
    float seaN = (1. - uRiver)*(1. - uStill);
    float wamp = (.5 + uWind*.85)*mix(1., .38, uStill)*mix(1., .7, uRiver);
    float shore = photo > .5 ? max(texture2D(uShore, vec2(ref.x, .5)).r, hz) : hz;
    float below = max(ref.y - shore, 0.);
    vec2 Pw = P + (vec2(noise(P*2.3 + t*.07), noise(P*2.3 - t*.06 + 7.)) - .5)*.05;
    // wave groups: patches of bigger and smaller waves drifting across
    float grp = .45 + 1.1*noise(P*vec2(1.6, 1.1) + vec2(t*.04, -t*.07));
    vec2 g = vec2(0.);
    float hgt = 0.;
    // long swell rolling in (sea), bigger with the sea state
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      vec2 dir = normalize(vec2(.18 - fi*.35, -1.));
      float f = 16. + fi*9.;
      float a = (.0035 + .004*uSwell)*seaN/(1. + fi*.6);
      float aa = clamp(1.7 - f*fp*.45, 0., 1.);
      float ph = dot(Pw, dir)*f + t*(1.1 + fi*.35) + fi*2.1;
      hgt += a*aa*sin(ph);
      g += a*aa*f*cos(ph)*dir;
    }
    // wind waves from many directions, in groups
    vec2 gw = vec2(0.);
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      vec2 dir = normalize(mix(vec2(sin(fi*2.4 + .5)*1.15, -1.), vec2(uFlowX >= 0. ? 1. : -1., sin(fi*2.1)*.6), uRiver));
      float f = 55.*pow(1.45, fi);
      float a = .0016/pow(1.33, fi);
      float aa = clamp(1.7 - f*fp*.45, 0., 1.);
      float ph = dot(Pw, dir)*f + t*1.9*sqrt(f/55.) + fi*1.7 + sin(dot(Pw, dir.yx)*f*.31 + fi)*.6;
      hgt += a*aa*sin(ph)*wamp*grp;
      gw += a*aa*f*cos(ph)*dir;
    }
    g += gw*wamp*grp;
    // fine wind ripples riding on the waves (carried along by them)
    vec2 rp = (P + g*.012)*vec2(170., 230.) + vec2(t*.35*(uFlowX >= 0. ? 1. : -1.), -t*1.2);
    float r0 = noise(rp), rx = noise(rp + vec2(.5, 0.)), ry = noise(rp + vec2(0., .5));
    g += vec2(rx - r0, ry - r0)*.3*clamp(1.7 - 230.*fp*.35, 0., 1.)*(.35 + uWind*.8)*(1. - .55*uStill)*(.7 + .6*grp);
    // rings: the cast landing, a bite at the line, a fish at the surface
    float ring = 0.;
    for (int i = 0; i < 6; i++){
      vec4 r = uRip[i];
      if (r.w <= 0.) continue;
      float rd = clamp((r.y - hz)/max(1. - hz, .05), .05, 1.);
      vec2 q = (ref - r.xy)/vec2(1., .28 + .5*rd);
      float dist = length(q);
      float front = r.z*.045*(.35 + rd);
      float f = (dist - front)*(170./(.4 + rd));
      ring += sin(f)*exp(-pow(f*.18, 2.))*exp(-r.z*.9)*r.w;
    }
    g.y -= ring*.6;
    // turbulence where a hooked fish thrashes: broken water and foam
    float churnFoam = 0.;
    for (int i = 0; i < 2; i++){
      vec4 D = uDist[i];
      if (D.w <= 0.) continue;
      float rd = clamp((D.y - hz)/max(1. - hz, .05), .05, 1.);
      float r = length((ref - D.xy)/vec2(1., .3 + .45*rd))/max(D.z, .001);
      if (r > 1.6) continue;
      float k = (1. - smoothstep(.2, 1.4, r))*D.w;
      vec2 tp = ref*vec2(260., 520.) + vec2(t*2.3, -t*3.1);
      g += (vec2(noise(tp), noise(tp + 3.7)) - .5)*1.6*k;
      churnFoam += smoothstep(.45, .8, noise(ref*vec2(180., 360.) + t*1.7))*k;
    }
    vec3 N = normalize(vec3(-g.x, 1., -g.y));
    vec3 V = normalize(vec3(P.x, -.06, z));
    vec3 R = reflect(V, N), R0 = reflect(V, vec3(0., 1., 0.));
    float F = .02 + .98*pow(1. - max(dot(N, -V), 0.), 5.);
    vec3 refl;
    if (photo > .5) {
      // the mirror image, stretched into streaks and wobbled by the tilt of each facet. A wall or rocks standing
      // in the water reflect about their own waterline, as tall as they stand; beyond that, and on open water, what
      // is reflected is far off (cliffs, the sky), mirrored about the horizon
      float near = .25 + d;
      vec2 off = vec2(N.x*.035, -N.z*.035 + (R.y - R0.y)*.05)*near;
      float reach = (shore - hz)*1.15 + .004;
      float qy = mix(shore - below*.92, hz - (ref.y - hz)*.92, smoothstep(reach*.8, reach*1.15, below)) - off.y;
      vec2 q = vec2(clamp(ref.x + clamp(off.x, -.03, .03), .01, .99), clamp(qy, .003, max(shore - .006, .004)));
      float rough = clamp(.4 + uWind*.6 + d*.2, 0., 1.);
      vec3 soft = texture2D(uBlur, q).rgb*.5 + (texture2D(uBlur, q + vec2(0., .014)).rgb + texture2D(uBlur, q - vec2(0., .014)).rgb)*.25;
      refl = mix(texture2D(uFrame, q).rgb, soft, rough);
      // where the tilt would look past the waterline into the water itself, it sees the far sky's haze instead
      vec3 hazeR = texture2D(uBlur, vec2(q.x, max(hz - .025, .01))).rgb;
      refl = mix(refl, hazeR, smoothstep(shore - .01, shore + .004, qy));
    } else {
      float sx = (R.x/max(length(R.yz), .001) - R0.x/max(length(R0.yz), .001))*.12;
      refl = reflSky(R, ref.x + clamp(sx, -.05, .05));
    }
    // the water's own colour: the photo's water (or a sea, river or lake colour), with patches of depth and silt
    vec3 body = photo > .5 ? uWaterCol : mix(vec3(.04,.16,.20), vec3(.10,.14,.09), max(uRiver, uStill)*.7)*(uDay*1. + uDusk*.6 + uNight*.15);
    body *= mix(.78, 1., 1. - d)*(.88 + .24*noise(P*vec2(.9, .6) + vec2(t*.015, 0.)));
    body *= 1. + hgt*(14. + 10.*d);
    float Fv = clamp(F*1.7 + .07, 0., .93);
    vec3 water = mix(body, refl, Fv);
    // the sun and moon on the water: a broad soft path plus sharp glints on the facets that catch them
    vec3 Ls = normalize(vec3((uSunX - .5)*2.2, .05 + uSunUp*.9, 1.));
    vec3 Lm = normalize(vec3((uMoonX - .5)*2.2, .05 + uMoonUp*.9, 1.));
    float ss = max(dot(R, Ls), 0.), sm = max(dot(R, Lm), 0.);
    water += sunCol*(pow(ss, 40.)*.2 + pow(ss, 500.)*1.5)*uSun + vec3(.8,.86,1.)*(pow(sm, 50.)*.15 + pow(sm, 600.)*1.1)*uMoon;
    // where the water meets walls and rocks: a darker contact line and a little working foam
    float contact = exp(-below*420.)*step(.0005, below);
    float wash = smoothstep(.42, .78, noise(P*vec2(70., 95.) + vec2(t*.5, -t*.8))*noise(ref*vec2(120., 50.) - t*.3)*1.6);
    float shoreFoam = wash*exp(-below*70.)*(.2 + uWind*.9)*(1. - uStill*.7)*step(.0005, below)*(photo > .5 ? 1. : 0.);
    water *= 1. - .22*contact;
    // whitecaps in a blow (sea only)
    float foam = smoothstep(.62, .92, hgt/max(.006*wamp, .0005)*.5 + .5 + (noise(P*vec2(140., 200.) + t*.2) - .5)*.5)*smoothstep(.35, .85, uWind)*seaN;
    vec3 foamC = vec3(.9,.93,.95)*lit;
    water = mix(water, foamC, clamp(foam*(.2 + .4*d) + shoreFoam*.55 + churnFoam*.7, 0., .85));
    water += vec3(.9)*max(ring, 0.)*.05;
    col = mix(col, clamp(water, 0., 1.), m);
  }
  // a soft haze along the horizon, from the sky's own colour
  vec3 hazeC = photo > .5 ? texture2D(uBlur, vec2(ref.x, max(hz - .03, .01))).rgb : skyColour(hz - .02, hz);
  col = mix(col, hazeC, .14*exp(-abs(ref.y - hz)*32.)*(1. - uNight*.5));

  // the light of the hour over the photo (the representative scene is already lit)
  if (photo > .5) {
    float l = dot(col, vec3(.3,.59,.11));
    vec3 nightC = mix(vec3(l)*vec3(.30,.38,.56), col*vec3(.32,.38,.58), .35) + vec3(.012,.016,.03);
    col = mix(col, col*vec3(1.08,.86,.70)*.86 + vec3(.05,.01,0.)*(1. - ref.y), uDusk*.75);
    col = mix(col, nightC, uNight*.9);
    col = mix(col, vec3(l)*.95, uCloud*.28);
  }
  // cloud shadows drifting over everything, a little mist and rain dulling
  float cs = fbm(ref*vec2(1.6, 2.8) + vec2(t*.008*wdir, 0.));
  col *= 1. - uCloud*.16*smoothstep(.42, .7, cs)*(uDay + uDusk);
  float mistAt = 1. - smoothstep(hz - .25, 1.05, ref.y);
  vec3 mistC = mix(vec3(.80,.83,.86), vec3(.10,.12,.16), uNight)*(uDay + uDusk*.8 + uNight*.6);
  col = mix(col, mistC, clamp(uFog*(.15 + .75*mistAt), 0., .85));
  col *= 1. - uRain*.12;
  // finishing: a gentle filmic curve, a touch more colour, cool shadows and warm highlights
  col = clamp(col, 0., 1.);
  float lum = dot(col, vec3(.3,.59,.11));
  col = mix(vec3(lum), col, 1.1);
  col = mix(col, col*col*(3. - 2.*col), .22);
  col += vec3(-.012, .004, .016)*(1. - lum) + vec3(.016, .006, -.012)*lum;
  // lens: soft vignette and fine grain so the moving parts sit inside the photo
  vec2 vc = vUv - .5;
  col *= 1. - dot(vc, vc)*.42;
  col += (hash(vUv*uRes + fract(t)*13.) - .5)*.025;
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log || "shader"); }
  return s;
}

/** The photo, lined up as the angler set it (pan, zoom, level), cover-fitted into the 3:2 reference frame. */
export function composeFrame(img, view, w = 1200) {
  const h = Math.round(w / REF_ASPECT);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1620"; g.fillRect(0, 0, w, h);
  if (img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const k = Math.max(w / iw, h / ih) * (view?.zoom || 1);
    g.save();
    g.translate(w / 2 + (view?.x || 0) * w * 0.5, h / 2 + (view?.y || 0) * h * 0.5);
    g.rotate(((view?.rot || 0) * Math.PI) / 180);
    g.drawImage(img, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    g.restore();
  }
  return c;
}

/** The water area as a soft-edged mask in the reference frame. */
export function composeMask(view, w = 600) {
  const h = Math.round(w / REF_ASPECT);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const pts = view?.water?.length >= 3 ? view.water : [[0, view?.horizon ?? 0.42], [1, view?.horizon ?? 0.42], [1, 1], [0, 1]];
  const blur = Math.max(2, Math.round(w / 220));
  // feathered by drawing the shape a few times, slightly shrunk, rather than a blur filter Safari may lack
  for (let i = 0; i < 4; i++) {
    const inset = (3 - i) * blur;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length * w, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length * h;
    g.beginPath();
    pts.forEach((p, j) => {
      let x = p[0] * w, y = p[1] * h;
      const dx = cx - x, dy = cy - y, len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * inset; y += (dy / len) * inset;
      j ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.fillStyle = `rgba(255,255,255,${i === 3 ? 1 : 0.28})`;
    g.fill();
  }
  return c;
}

/** The waterline in each column (the top of the water area), as a 256 x 1 texture: reflections mirror about it, and
 *  foam and the contact line sit along it. */
export function composeShore(mask, horizon = 0.42) {
  const w = 256, h = 120;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(mask, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas"); out.width = w; out.height = 1;
  const og = out.getContext("2d");
  const img = og.createImageData(w, 1);
  const tops = [];
  for (let x = 0; x < w; x++) {
    let top = -1;
    for (let y = Math.max(0, Math.floor(h * horizon)); y < h; y++) if (d[(y * w + x) * 4] > 140) { top = y / h; break; }
    tops.push(top < 0 ? 1 : top);
  }
  // a narrow gap up to the horizon (a lamp post, a gap in a railing) is closed over: dilate then erode
  const win = (a, r, fn) => a.map((v, x) => { let o = v; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) o = fn(o, a[k]); return o; });
  const closed = win(win(tops.map((v) => Math.max(horizon, v)), 6, Math.max), 6, Math.min);
  const med = closed.map((v, x) => { const near = closed.slice(Math.max(0, x - 3), x + 4).sort((a, b) => a - b); return near[near.length >> 1]; });
  // where the waterline steps (the end of a wall), ramp up to the open water's line instead, so the reflections
  // don't change at a hard upright edge
  med.forEach((v, x) => {
    let s = 0, n = 0;
    for (let k = -7; k <= 7; k++) { const q = med[Math.min(w - 1, Math.max(0, x + k))], wt = 8 - Math.abs(k); s += q * wt; n += wt; }
    img.data[x * 4] = Math.round(Math.min(v, s / n) * 255); img.data[x * 4 + 3] = 255;
  });
  og.putImageData(img, 0, 0);
  return out;
}

/** The photo's own water colour (the average over the water area), so the drawn water matches the picture. */
export function waterColour(frame, mask, horizon = 0.42) {
  try {
    const w = 80, h = Math.round(w / REF_ASPECT);
    const read = (src) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
    const f = read(frame), m = read(mask);
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < w * h; i++) {
      const y = Math.floor(i / w) / h;
      if (m[i * 4] < 160 || y < horizon + 0.03) continue;
      r += f[i * 4]; gg += f[i * 4 + 1]; b += f[i * 4 + 2]; n++;
    }
    if (n < 20) return [0.14, 0.24, 0.27];
    return [r / n / 255, gg / n / 255, b / n / 255];
  } catch { return [0.14, 0.24, 0.27]; }
}

/** A soft, blurred copy of the frame: the water's colour without its fine detail, and the sky it reflects. */
export function composeBlur(frame) {
  const steps = [[120, 80], [30, 20], [120, 80], [360, 240]];
  let src = frame;
  for (const [w, h] of steps) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, w, h); src = c;
  }
  return src;
}

/** True while the water area is still the untouched default (the whole width below the horizon). */
export function defaultWater(view) {
  const w = view?.water, h = view?.horizon ?? 0.42;
  return !w || (w.length === 4 && w.every((p, i) => Math.abs(p[0] - [0, 1, 1, 0][i]) < 0.002 && Math.abs(p[1] - [h, h, 1, 1][i]) < 0.002));
}

/** Where the water is in a lined-up photo, found from the photo itself: from just below the horizon down each
 *  column while it stays water-coloured and smooth. A pier, rocks, a bank or a boat stops it, so they stay still. */
export function composeWaterAuto(frame, horizon = 0.42) {
  const w = 160, h = Math.round(w / REF_ASPECT);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(frame, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = (p) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const hzRow = Math.round(h * horizon);
  // From the bottom of the picture up each column (the near water is the biggest, plainest part of a fishing
  // view), while it stays water-coloured: a wall, rocks, a pier or the far bank stops it, so they stay still.
  // Each column starts from the middle value of its bottom few rows, so a glint or a speck of foam doesn't count.
  const med3 = (ps) => [0, 1, 2].map((k) => ps.map((p) => p[k]).sort((a, b) => a - b)[ps.length >> 1]);
  const bottom = []; for (let x = 0; x < w; x++) bottom.push(med3([2, 3, 4, 5, 6, 7].map((dy) => px(x, h - dy))));
  const med = med3(bottom);
  // how far the water's colour wanders along the bottom sets how strict to be: a plain sea is told from a grey pier
  // by a little, a choppy, foamy one needs more room
  const spread = bottom.map((p) => dist(p, med)).sort((a, b) => a - b)[w >> 1];
  const thr = Math.min(95, Math.max(40, spread * 2.5 + 28));
  const tint = (p) => p[2] - p[0]; // blue against red: water and stone, sand or grass mostly differ in it
  const tops = [];
  for (let x = 0; x < w; x++) {
    const ref = bottom[x].slice();
    if (dist(ref, med) > thr || Math.abs(tint(ref) - tint(med)) > 48) { tops.push(-1); continue; }
    let y = h - 2, odd = 0, last = h - 2;
    for (; y > hzRow; y--) {
      const p = px(x, y);
      if (dist(p, ref) > 80 || Math.abs(lum(p) - lum(px(x, y + 1))) > 34) { if (++odd >= 3) break; continue; }
      odd = 0; last = y;
      for (let k = 0; k < 3; k++) ref[k] = ref[k] * 0.9 + p[k] * 0.1;
    }
    // water that runs up nearly to the horizon is open water: take it all the way
    tops.push(last <= hzRow + (h - hzRow) * 0.08 ? hzRow + 1 : last);
  }
  // smooth the edge, and fill a lone column or two that a speck threw out when its neighbours are all water
  const edge = tops.map((v, x) => {
    const nb = tops.slice(Math.max(0, x - 4), x + 5);
    const near = nb.filter((u) => u >= 0).sort((a, b) => a - b);
    if (v < 0 && near.length < nb.length - 2) return -1;
    return near.length ? near[near.length >> 1] : -1;
  });
  const cols = edge.filter((v) => v >= 0 && v < h - 4).length;
  if (cols < w * 0.3) return null; // not confident: the angler's water corners (or the default) are used instead
  // water shows mostly level lines; a deck, a beach or a wall mostly doesn't
  let dx = 0, dy = 0;
  edge.forEach((top, x) => { if (top < 0 || x < 1 || x > w - 2) return; for (let y = top + 1; y < h - 1; y++) { dx += Math.abs(lum(px(x + 1, y)) - lum(px(x - 1, y))); dy += Math.abs(lum(px(x, y + 1)) - lum(px(x, y - 1))); } });
  if (dy / Math.max(1, dx + dy) < 0.45) return null;
  const out = g.createImageData(w, h);
  const set = (x, y) => { const o = (y * w + x) * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = out.data[o + 3] = 255; };
  edge.forEach((top, x) => { if (top < 0) return; for (let y = top; y < h; y++) set(x, y); });
  // Beyond the end of a pier or a rock (a column that starts on it at the bottom), the far water is still water:
  // from the horizon down while it matches the water found in the same row elsewhere.
  const rowCol = [];
  for (let y = hzRow + 1; y < h; y++) { const ps = []; edge.forEach((top, x) => { if (top >= 0 && y >= top) ps.push(px(x, y)); }); rowCol[y] = ps.length >= 8 ? med3(ps) : null; }
  edge.forEach((top, x) => {
    const stop = top < 0 ? h : top;
    for (let y = hzRow + 1, miss = 0; y < stop; y++) {
      const rc = rowCol[y];
      if (!rc || dist(px(x, y), rc) > thr * 0.9) { if (++miss >= 2) break; continue; }
      miss = 0; set(x, y);
    }
  });
  g.clearRect(0, 0, w, h); g.putImageData(out, 0, 0);
  const f = document.createElement("canvas"); f.width = w; f.height = h;
  const fg = f.getContext("2d");
  fg.fillStyle = "#000"; fg.fillRect(0, 0, w, h);
  fg.globalAlpha = 0.35;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) fg.drawImage(c, ox, oy);
  fg.globalAlpha = 1;
  fg.drawImage(c, 0, 0);
  return f;
}

/** Where the sky is in a lined-up photo: from the top of each column down, while it stays smooth and sky-coloured.
 *  A building, a cliff, a pier light or a tree stops it, so only the sky's clouds drift. Soft-edged. */
export function composeSkyMask(frame, horizon = 0.42) {
  const w = 160, h = Math.round(w / REF_ASPECT);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(frame, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const lum = (p) => 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2];
  const out = g.createImageData(w, h);
  const stopAt = Math.round(h * horizon) - 1;
  for (let x = 0; x < w; x++) {
    let ref = px(x, 0);
    if (lum(ref) < 55 || ref[1] - ref[2] > 22) continue; // not sky at the very top (a dark night photo, a tree)
    for (let y = 0; y < stopAt; y++) {
      const p = px(x, y);
      const dist = Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
      const step = y ? Math.abs(lum(p) - lum(px(x, y - 1))) : 0;
      if (dist > 75 || step > 20) break;
      for (let k = 0; k < 3; k++) ref[k] = ref[k] * 0.85 + p[k] * 0.15;
      const o = (y * w + x) * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = 255; out.data[o + 3] = 255;
    }
  }
  g.clearRect(0, 0, w, h); g.putImageData(out, 0, 0);
  // soften: shrink a little from the edges and feather
  const f = document.createElement("canvas"); f.width = w; f.height = h;
  const fg = f.getContext("2d");
  fg.fillStyle = "#000"; fg.fillRect(0, 0, w, h);
  // a soft halo first, then the area itself at full strength
  fg.globalAlpha = 0.35;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) fg.drawImage(c, ox, oy);
  fg.globalAlpha = 1;
  fg.drawImage(c, 0, 0);
  return f;
}

/** Stage uv -> reference uv for a stage of aspect `a` (cover fit). Returns [sx, sy, ox, oy]. */
export function coverMap(a) {
  if (a >= REF_ASPECT) { const sy = REF_ASPECT / a; return [1, sy, 0, (1 - sy) / 2]; }
  const sx = a / REF_ASPECT; return [sx, 1, (1 - sx) / 2, 0];
}

export function createWaterRenderer(canvas) {
  let gl = null;
  try { gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" }) || canvas.getContext("experimental-webgl"); } catch { gl = null; }
  if (!gl) return null;
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  } catch (e) {
    console.warn("FishDock scene: WebGL water unavailable", e?.message);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ["uFrame", "uMask", "uMap", "uRes", "uTime", "uHorizon", "uWind", "uFlowX", "uRiver", "uStill", "uProc", "uHasPhoto", "uOct", "uFlow", "uNight", "uDusk", "uDay", "uRain", "uFog", "uCloud", "uSunX", "uSun", "uMoonX", "uMoon", "uSunUp", "uSunGlow", "uMoonUp", "uMoonDisc", "uSky", "uBlur", "uWaterCol", "uShore", "uSwell", "uDist", "uRip"]) U[n] = gl.getUniformLocation(prog, n);
  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 22, 32, 255]));
    return t;
  };
  const tFrame = tex(0), tMask = tex(1), tSky = tex(2), tBlur = tex(3), tShore = tex(4);
  gl.uniform1i(U.uFrame, 0); gl.uniform1i(U.uMask, 1); gl.uniform1i(U.uSky, 2); gl.uniform1i(U.uBlur, 3); gl.uniform1i(U.uShore, 4);
  let hasPhoto = 0, horizon = 0.42, lost = false, tint = null;
  const P = { wind: 0.3, flowX: 0.6, river: 0, still: 0, night: 0, dusk: 0, day: 1, rain: 0, fog: 0, cloud: 0.3, sunX: 0.62, sun: 0.6, moonX: 0.4, moon: 0, sunUp: 0.3, sunGlow: 0, moonUp: 0.3, moonDisc: 0, swell: 0.3, oct: 4, flow: 1 };
  const rip = new Float32Array(24), dist = new Float32Array(8);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });

  const upload = (t, unit, source) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
  return {
    gl: true,
    get lost() { return lost; },
    /** A composed reference frame (or null for the representative scene) and its water mask. */
    setScene(frame, mask, h, sky) {
      horizon = h ?? 0.42;
      hasPhoto = frame ? 1 : 0;
      tint = null;
      if (frame && mask) { const wc = waterColour(frame, mask, horizon); tint = wc; gl.uniform3f(U.uWaterCol, wc[0], wc[1], wc[2]); }
      try {
        if (frame) upload(tFrame, 0, frame);
        if (mask) upload(tMask, 1, mask);
        if (sky) upload(tSky, 2, sky);
        if (frame) upload(tBlur, 3, composeBlur(frame));
        if (frame && mask) upload(tShore, 4, composeShore(mask, horizon));
      } catch (e) { hasPhoto = 0; console.warn("FishDock scene: photo texture refused", e?.message); }
    },
    set(params) { Object.assign(P, params); },
    /** The photo's own water colour (0..1 RGB), or null for the drawn scene: fish under the surface take this tint. */
    get tint() { return tint; },
    render(time, ripples = [], dists = []) {
      if (lost) return;
      const w = canvas.width, h = canvas.height;
      gl.viewport(0, 0, w, h);
      const [sx, sy, ox, oy] = coverMap(w / h);
      gl.uniform4f(U.uMap, sx, sy, ox, oy);
      gl.uniform2f(U.uRes, w, h);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uHorizon, horizon);
      gl.uniform1f(U.uHasPhoto, hasPhoto);
      gl.uniform1f(U.uProc, hasPhoto ? 0 : 1);
      for (const [u, k] of [["uWind", "wind"], ["uFlowX", "flowX"], ["uRiver", "river"], ["uStill", "still"], ["uNight", "night"], ["uDusk", "dusk"], ["uDay", "day"], ["uRain", "rain"], ["uFog", "fog"], ["uCloud", "cloud"], ["uSunX", "sunX"], ["uSun", "sun"], ["uMoonX", "moonX"], ["uMoon", "moon"], ["uSunUp", "sunUp"], ["uSunGlow", "sunGlow"], ["uMoonUp", "moonUp"], ["uMoonDisc", "moonDisc"], ["uSwell", "swell"], ["uOct", "oct"], ["uFlow", "flow"]]) gl.uniform1f(U[u], P[k]);
      rip.fill(0);
      ripples.slice(0, 6).forEach((r, i) => { rip[i * 4] = r.x; rip[i * 4 + 1] = r.y; rip[i * 4 + 2] = r.age; rip[i * 4 + 3] = r.s; });
      gl.uniform4fv(U.uRip, rip);
      dist.fill(0);
      dists.slice(0, 2).forEach((q, i) => { dist[i * 4] = q.x; dist[i * 4 + 1] = q.y; dist[i * 4 + 2] = q.r; dist[i * 4 + 3] = q.s; });
      gl.uniform4fv(U.uDist, dist);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() { try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* ignore */ } },
  };
}

/** Sky light for the hour from the sun's and moon's altitude: { day, dusk, night } summing to 1. */
export function skyLight(sunAlt) {
  if (sunAlt == null) return { day: 1, dusk: 0, night: 0 };
  const night = Math.min(1, Math.max(0, (-sunAlt - 2) / 8));
  const day = Math.min(1, Math.max(0, (sunAlt - 4) / 10));
  const dusk = Math.max(0, 1 - night - day);
  return { day, dusk, night };
}
