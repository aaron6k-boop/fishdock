// ---- wetLook: how rain shows on the ground (GLSL pieces for a MeshStandardMaterial's onBeforeCompile) ----
// Everything darkens in rain. Only level, hard ground close by gets the shine, and most of all in shallow puddles,
// which mirror the sky (the environment map). Slopes, grass (the dune across the harbour) and the far side stay matt:
// a low roughness on all of it caught the sun as a large white patch. Needs vertex colours, vMapUv and uWet.

// (after map_fragment: works out fdWet, how wet it looks, and fdShine, how much it shines)
export const WET_PREP = /* glsl */`
  float fdWet = 0., fdShine = 0., fdPud = 0.;
  {
    vec3 fdUpV = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
    float fdLevel = smoothstep(.86, .97, dot(normalize(vNormal), fdUpV));
    float fdNear = 1. - smoothstep(30., 110., length(vViewPosition));
    #ifdef USE_COLOR
      float fdGrass = smoothstep(.06, .14, (vColor.r + vColor.g) * .5 - vColor.b);
    #else
      float fdGrass = 0.;
    #endif
    // shallow puddles: broad patches where the deck dips, broken up at their edges (one tile of uv is 8 m)
    vec2 fq = vMapUv * 1.7;
    vec2 fi = floor(fq), ff = fract(fq), fu = ff * ff * (3. - 2. * ff);
    #define FDH(o) fract(sin(dot(fi + o, vec2(127.1, 311.7))) * 43758.5453)
    float fn = mix(mix(FDH(vec2(0., 0.)), FDH(vec2(1., 0.)), fu.x), mix(FDH(vec2(0., 1.)), FDH(vec2(1., 1.)), fu.x), fu.y);
    #undef FDH
    fdPud = smoothstep(.6, .78, fn);
    fdWet = uWet * (1. - fdGrass * .5);
    fdShine = uWet * fdLevel * fdNear * (1. - fdGrass);
  }
`;
// (a factor for diffuseColor: wet concrete is darker, puddles darker still)
export const WET_DARKEN = "(1.0 - fdWet * (0.3 + 0.16 * fdPud))";
// (the new roughnessFactor, given the dry one: unchanged when dry; satin when wet; puddles close to a mirror)
export const wetRough = (dry) => `mix(${dry}, ${dry} * mix(0.6, 0.12, fdPud), fdShine)`;
