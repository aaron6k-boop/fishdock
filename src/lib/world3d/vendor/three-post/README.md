# three.js post-processing (vendored)

These files are copied unchanged from three.js r170 (`examples/jsm/postprocessing`, `examples/jsm/shaders` and
`examples/jsm/math/SimplexNoise.js`, tag `r170`), the same package and version as the `three` dependency, under its
MIT licence (`LICENSE`). They live here because they are not a separate dependency: they only import from `three`.

Used by `../../post.js`: EffectComposer, RenderPass, GTAOPass (ambient occlusion), UnrealBloomPass, ShaderPass and
OutputPass, with the shaders they need.
