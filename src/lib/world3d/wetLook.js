// ---- wetLook: how rain shows on the ground (GLSL pieces for a MeshStandardMaterial's onBeforeCompile) ----
// Everything darkens in rain. Only level, hard ground close by gets the shine, and most of all in shallow puddles,
// which mirror the sky (the environment map). Slopes, grass (the dune across the harbour) and the far side stay matt:
// a low roughness on all of it caught the sun as a large white patch. Needs vertex colours, vMapUv and uWet; the rings
// of rain in the puddles need #define FD_WET_RINGS and uWetT (seconds).

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
