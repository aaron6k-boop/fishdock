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
uniform sampler2D uFrame, uMask;
uniform vec4 uMap;
uniform vec2 uRes;
uniform float uTime, uHorizon, uWind, uFlowX, uRiver, uStill, uProc, uHasPhoto, uOct, uFlow;
uniform float uNight, uDusk, uDay, uRain, uFog, uCloud, uSunX, uSun, uMoonX, uMoon;
uniform vec4 uRip[6];

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
  h += (fbm(w*vec2(1.5, 2.1) + drift) - .5)*(.35 + uWind*1.3);
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

void main(){
  vec2 ref = vUv*uMap.xy + uMap.zw;
  float t = uTime;
  float hz = uHorizon;
  float m = uHasPhoto > .5 ? texture2D(uMask, ref).r : smoothstep(hz, hz + .003, ref.y);
  float d = clamp((ref.y - hz)/max(1. - hz, .05), 0., 1.);
  vec3 col;
  vec3 sunCol = mix(vec3(1., .93, .78), vec3(1., .62, .32), uDusk);

  if (uHasPhoto > .5) col = texture2D(uFrame, ref).rgb;
  else {
    // representative sky: gradient, a soft sun or moon, drifting cloud
    col = skyColour(ref.y, hz);
    float cl = fbm(vec2(ref.x*3. + t*.006, ref.y*7.)) ;
    col = mix(col, mix(vec3(.92), vec3(.35,.38,.45), uNight + uCloud*.4)*(uDay + uDusk*.8 + uNight*.25), smoothstep(.5, .85, cl)*(.35 + uCloud*.5)*step(ref.y, hz));
    vec2 sp = vec2(uSunX, hz - .06 - .5*uSun);
    float sd = length((ref - sp)*vec2(1.5, 1.));
    col += sunCol*(exp(-sd*40.)*1.2 + exp(-sd*6.)*.25)*uSun*step(ref.y, hz);
    // a few stars on a clear night
    col += vec3(step(.9965, hash(floor(ref*vec2(520., 340.)))))*uNight*.55*(1. - uCloud)*step(ref.y, hz - .02);
    // far bank for rivers and lakes: hazy hills, then a tree line with crowns
    if (max(uRiver, uStill) > .5 && ref.y < hz) {
      float hill = hz - .045 - .06*fbm(vec2(ref.x*2.1, 11.));
      vec3 haze = mix(vec3(.46,.54,.58), vec3(.06,.08,.11), uNight)*(uDay*.95 + uDusk*.7 + uNight*.35);
      col = mix(col, haze, smoothstep(hill - .002, hill + .002, ref.y)*.6);
      float top = hz - treeTop(ref.x);
      vec3 tree = mix(vec3(.10,.15,.09), vec3(.20,.26,.14), noise(ref*vec2(110., 70.)))*(uDay + uDusk*.55 + uNight*.18);
      tree *= mix(1.15, .62, clamp((ref.y - top)/max(hz - top, .001), 0., 1.));
      col = mix(col, tree, smoothstep(top - .0025, top + .0025, ref.y));
    }
  }

  if (m > .002) {
    float z = 1./(d + .035);
    vec2 w = vec2((ref.x - .5)*z*1.6, z);
    float e = .06;
    float h0 = waves(w, t), hx = waves(w + vec2(e, 0.), t), hy = waves(w + vec2(0., e), t);
    vec2 sl = vec2(hx - h0, hy - h0)/e*(.22 + uWind*.8);
    // rings where the line enters, where a fish breaks the surface, or the cast lands
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
    sl.y += ring*.9;
    vec3 water;
    if (uHasPhoto > .5) {
      vec2 uvw = ref + vec2(sl.x*.0035, sl.y*.0028)*(.25 + d);
      vec2 fdir = mix(vec2(0., 1.), vec2(uFlowX, .05), uRiver)*(1. - uStill*.85);
      float sp = uFlow*.014*(.45 + uWind)*(.2 + d);
      float p0 = fract(t*.09), p1 = fract(t*.09 + .5);
      float w0 = 1. - abs(2.*p0 - 1.);
      vec2 a0 = uvw - fdir*sp*(p0 - .5), a1 = uvw - fdir*sp*(p1 - .5);
      a0.y = max(a0.y, hz + .004); a1.y = max(a1.y, hz + .004);
      water = texture2D(uFrame, a0).rgb*w0 + texture2D(uFrame, a1).rgb*(1. - w0);
      water *= 1. + sl.y*.05 - sl.x*.015;
    } else {
      // representative water: sky reflection at a glancing angle, deep colour close in
      vec3 deep = mix(vec3(.04,.16,.20), vec3(.10,.14,.09), max(uRiver, uStill)*.7)*(uDay*1. + uDusk*.6 + uNight*.15);
      float fres = pow(1. - d, 2.5)*.85 + .1;
      vec3 refl = skyColour(hz - (ref.y - hz)*.8 + sl.y*.03, hz);
      if (max(uRiver, uStill) > .5) {
        float yb = hz + treeTop(ref.x + sl.x*.004)*1.1;
        refl = mix(refl, mix(vec3(.08,.12,.07), vec3(.02,.03,.05), uNight)*(uDay + uDusk*.55 + uNight*.2), smoothstep(yb + .004, yb - .004, ref.y));
      }
      water = mix(deep, refl, clamp(fres + sl.y*.08, 0., 1.));
      water *= 1. + sl.y*.08;
    }
    // glitter under the sun (or moon): a path that widens towards the viewer
    float glintN = fbm(w*vec2(2.6, 4.2) + vec2(0., t*.6)) + sl.y*.25;
    float pathS = exp(-pow((ref.x - uSunX)/(.04 + .3*d), 2.))*uSun;
    float pathM = exp(-pow((ref.x - uMoonX)/(.03 + .22*d), 2.))*uMoon;
    float g = smoothstep(.62, .9, glintN);
    water += sunCol*g*pathS*(.55 + .6*(1. - d)) + vec3(.75,.82,.95)*g*pathM*.55;
    // whitecaps in a blow (sea only)
    float foam = smoothstep(.66, .86, h0*.5 + .5 + (fbm(w*3.4 + t*.1) - .5)*.5)*smoothstep(.32, .85, uWind)*(1. - uRiver)*(1. - uStill);
    water = mix(water, vec3(.92,.95,.97)*(uDay + uDusk*.7 + uNight*.2), foam*(.25 + .45*d));
    water += vec3(.9)*max(ring, 0.)*.06;
    col = mix(col, water, m);
  }

  // the light of the hour over the photo (the representative scene is already lit)
  if (uHasPhoto > .5) {
    float l = dot(col, vec3(.3,.59,.11));
    vec3 nightC = mix(vec3(l)*vec3(.24,.31,.48), col*vec3(.26,.32,.50), .35);
    col = mix(col, col*vec3(1.08,.86,.70)*.86 + vec3(.05,.01,0.)*(1. - ref.y), uDusk*.75);
    col = mix(col, nightC, uNight*.9);
    col = mix(col, vec3(l)*.95, uCloud*.28);
  }
  // cloud shadows drifting over everything, a little mist and rain dulling
  float cs = fbm(ref*vec2(1.6, 2.8) + vec2(t*.008, 0.));
  col *= 1. - uCloud*.16*smoothstep(.42, .7, cs)*(uDay + uDusk);
  float mistAt = 1. - smoothstep(hz - .25, 1.05, ref.y);
  vec3 mistC = mix(vec3(.80,.83,.86), vec3(.10,.12,.16), uNight)*(uDay + uDusk*.8 + uNight*.6);
  col = mix(col, mistC, clamp(uFog*(.15 + .75*mistAt), 0., .85));
  col *= 1. - uRain*.12;
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
  for (const n of ["uFrame", "uMask", "uMap", "uRes", "uTime", "uHorizon", "uWind", "uFlowX", "uRiver", "uStill", "uProc", "uHasPhoto", "uOct", "uFlow", "uNight", "uDusk", "uDay", "uRain", "uFog", "uCloud", "uSunX", "uSun", "uMoonX", "uMoon", "uRip"]) U[n] = gl.getUniformLocation(prog, n);
  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 22, 32, 255]));
    return t;
  };
  const tFrame = tex(0), tMask = tex(1);
  gl.uniform1i(U.uFrame, 0); gl.uniform1i(U.uMask, 1);
  let hasPhoto = 0, horizon = 0.42, lost = false;
  const P = { wind: 0.3, flowX: 0.6, river: 0, still: 0, night: 0, dusk: 0, day: 1, rain: 0, fog: 0, cloud: 0.3, sunX: 0.62, sun: 0.6, moonX: 0.4, moon: 0, oct: 4, flow: 1 };
  const rip = new Float32Array(24);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });

  const upload = (t, unit, source) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
  return {
    gl: true,
    get lost() { return lost; },
    /** A composed reference frame (or null for the representative scene) and its water mask. */
    setScene(frame, mask, h) {
      horizon = h ?? 0.42;
      hasPhoto = frame ? 1 : 0;
      try {
        if (frame) upload(tFrame, 0, frame);
        if (mask) upload(tMask, 1, mask);
      } catch (e) { hasPhoto = 0; console.warn("FishDock scene: photo texture refused", e?.message); }
    },
    set(params) { Object.assign(P, params); },
    render(time, ripples = []) {
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
      for (const [u, k] of [["uWind", "wind"], ["uFlowX", "flowX"], ["uRiver", "river"], ["uStill", "still"], ["uNight", "night"], ["uDusk", "dusk"], ["uDay", "day"], ["uRain", "rain"], ["uFog", "fog"], ["uCloud", "cloud"], ["uSunX", "sunX"], ["uSun", "sun"], ["uMoonX", "moonX"], ["uMoon", "moon"], ["uOct", "oct"], ["uFlow", "flow"]]) gl.uniform1f(U[u], P[k]);
      rip.fill(0);
      ripples.slice(0, 6).forEach((r, i) => { rip[i * 4] = r.x; rip[i * 4 + 1] = r.y; rip[i * 4 + 2] = r.age; rip[i * 4 + 3] = r.s; });
      gl.uniform4fv(U.uRip, rip);
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
