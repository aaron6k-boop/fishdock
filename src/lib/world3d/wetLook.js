// ---- wetLook: how rain shows on the ground (GLSL pieces for a MeshStandardMaterial's onBeforeCompile) ----
// Everything darkens in rain. Only level, hard ground close by gets the shine, and most of all in shallow puddles,
// which mirror the sky (the environment map). Slopes, grass (the dune across the harbour) and the far side stay matt:
// a low roughness on all of it caught the sun as a large white patch. Needs vertex colours, vMapUv and uWet; the rings
// of rain in the puddles need #define FD_WET_RINGS and uWetT (seconds).

import * as THREE from "three";

// ---- wet patches on the deck ----
// Where a dripping drop net or a fish is put down, the concrete under it goes dark with water and dries over several
// minutes, from the edge in. Four at most (the oldest or driest goes). x, z: where (world, m); r: how far it spreads (m);
// w: how wet (1 just put down, to 0 dry). The shader reads them through WET_SPOTS (uWetSpots).
export const WET_SPOTS = { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) };
/** a wet patch at (x, z), r across: a new one, or the one already there kept wet and as wide as either */
export function wetSpotAt(x, z, r) {
  const L = WET_SPOTS.value; let near = null, low = L[0];
  for (const v of L) { if (v.w > 0 && Math.hypot(v.x - x, v.y - z) < Math.max(v.z, r) * 0.5) near = v; if (v.w < low.w) low = v; }
  if (near) { near.z = Math.max(near.z, r); near.w = 1; return near; }
  low.set(x, z, r, 1); return low;
}
/** each frame: dt (s). A patch loses about half its water in two minutes (wet concrete on a dry day), gone in ten */
export function dryWetSpots(dt) {
  for (const v of WET_SPOTS.value) if (v.w > 0) { v.w *= Math.exp(-(dt || 0) / 180); if (v.w < 0.03) v.w = 0; }
}

// (after map_fragment: works out fdWet, how wet it looks, and fdShine, how much it shines)
export const WET_PREP = /* glsl */`
  float fdWet = 0., fdShine = 0., fdPud = 0.; vec2 fdRip = vec2(0.);
  {
    vec3 fdUpV = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
    float fdLevel = smoothstep(.86, .97, dot(normalize(vNormal), fdUpV));
    float fdNear = 1. - smoothstep(30., 110., length(vViewPosition));
    #ifdef USE_COLOR
      float fdGrass = smoothstep(.06, .14, (vColor.r + vColor.g) * .5 - vColor.b);
    #else
      float fdGrass = 0.;
    #endif
    // shallow puddles: broad patches where the deck dips, with smaller ones round them and ragged edges (one tile of
    // uv is 8 m). They spread as it gets wetter: a few hand-sized ones in light rain, a third of the deck in a downpour
    #define FDH(o) fract(sin(dot(fi + o, vec2(127.1, 311.7))) * 43758.5453)
    vec2 fq = vMapUv * 1.7;
    vec2 fi = floor(fq), ff = fract(fq), fu = ff * ff * (3. - 2. * ff);
    float fn = mix(mix(FDH(vec2(0., 0.)), FDH(vec2(1., 0.)), fu.x), mix(FDH(vec2(0., 1.)), FDH(vec2(1., 1.)), fu.x), fu.y);
    fq = vMapUv * 6.3 + 3.7; fi = floor(fq); ff = fract(fq); fu = ff * ff * (3. - 2. * ff);
    float fn2 = mix(mix(FDH(vec2(0., 0.)), FDH(vec2(1., 0.)), fu.x), mix(FDH(vec2(0., 1.)), FDH(vec2(1., 1.)), fu.x), fu.y);
    fq = vMapUv * 23. + 9.1; fi = floor(fq); ff = fract(fq); fu = ff * ff * (3. - 2. * ff);
    float fn3 = mix(mix(FDH(vec2(0., 0.)), FDH(vec2(1., 0.)), fu.x), mix(FDH(vec2(0., 1.)), FDH(vec2(1., 1.)), fu.x), fu.y);
    float fdDip = fn * .62 + fn2 * .3 + fn3 * .08, fdEdge = mix(.68, .56, uWet);
    fdPud = smoothstep(fdEdge, fdEdge + .035, fdDip);
    // raindrops landing in them: rings that spread and die in about a second, two sizes of drop (wetLook.js WET_NORMAL
    // tilts the puddle's mirror by fdRip)
    #ifdef FD_WET_RINGS
    if (uWet * fdPud > .02) {
      vec2 wp = vMapUv * 8.;
      for (int l = 0; l < 2; l++) {
        vec2 q = wp * (l == 0 ? 3.3 : 5.9) + float(l) * 17.3; fi = floor(q); vec2 cf = fract(q);
        float h1 = FDH(vec2(0.)), h2 = FDH(vec2(7.7, 1.9));
        float tt = fract(uWetT * (.75 + .5 * h2) + h1);
        vec2 dv = cf - (vec2(.3) + .4 * vec2(FDH(vec2(1.3, 5.1)), FDH(vec2(4.1, 2.7)))); float dd = length(dv);
        float w = (dd - tt * .4) * 30., live = step(h2, .35 + uWet * .6); // (fewer drops in light rain)
        fdRip += dv / max(dd, 1e-3) * sin(w) * exp(-w * w * .22) * (1. - tt) * (1. - tt) * live;
      }
      fdRip *= .55;
    }
    #endif
    #undef FDH
    fdWet = uWet * (1. - fdGrass * .5);
    fdShine = uWet * fdLevel * fdNear * (1. - fdGrass);
    // wet patches where a dripping net or a fish was put down (wetSpotAt, below): darker, with a satin sheen, a ragged
    // edge, drying from the edge in (needs #define FD_WET_SPOTS and uWetSpots; the deck's uv is metres over 8)
    #ifdef FD_WET_SPOTS
    {
      vec2 fdW = vMapUv * 8.; float fdSp = 0.;
      for (int i = 0; i < 4; i++) {
        vec4 S = uWetSpots[i]; if (S.w <= 0.) continue;
        float d = length(fdW - S.xy) / max(S.z * (.45 + .55 * sqrt(S.w)), .05);
        fdSp = max(fdSp, (1. - smoothstep(.55, 1., d + (fn2 - .5) * .45 + (fn3 - .5) * .3)) * min(1., S.w * 1.6));
      }
      fdWet = max(fdWet, fdSp * (1. - fdGrass * .5)); fdShine = max(fdShine, fdSp * fdLevel * fdNear * .7);
    }
    #endif
  }
`;
// (a factor for diffuseColor: wet concrete is darker, puddles darker still)
export const WET_DARKEN = "(1.0 - fdWet * (0.3 + 0.22 * fdPud))";
// (the new roughnessFactor, given the dry one: unchanged when dry; satin when wet; puddles close to a mirror)
export const wetRough = (dry) => `mix(${dry}, mix(${dry} * 0.6, 0.045, fdPud), fdShine)`;
// (after normal_fragment_maps: standing water is flat whatever the concrete under it, and rings from the rain tilt it.
// The deck's uv runs along world x and z, so the rings' slope goes straight into view space)
export const WET_NORMAL = /* glsl */`
  if (fdShine * fdPud > 0.01) {
    float fdK = fdShine * fdPud;
    normal = normalize(mix(normal, normalize(vNormal), fdK * 0.94));
    normal = normalize(normal + (viewMatrix * vec4(fdRip.x, 0., fdRip.y, 0.)).xyz * fdK);
  }
`;
