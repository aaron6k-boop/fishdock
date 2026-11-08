# FishDock on the PC: what draws the picture, and what it can and can't do

Written 8 November 2026 for the PC-first plan. Facts about the code are from reading it; facts about browsers and
graphics APIs are as of Chromium 130 (the one inside Electron 33). Nothing here is a measurement: measured figures
come from the benchmark in the Graphics panel (developer diagnostics), run on real hardware.

## 1. What the launcher is

The Windows launcher (`desktop/`) is an Electron window that loads the live website. Electron is Chromium plus Node,
so the game is drawn by exactly the engine Chrome uses: **three.js r170 on WebGL 2**, through ANGLE, which on Windows
translates WebGL to **Direct3D 11** (or Vulkan where Chromium chooses it). It is, today, a website in a frame.

What the launcher adds over a browser tab:

- **The right graphics card.** `force_high_performance_gpu` asks Windows for the discrete card on a machine that also
  has an onboard one. In a browser tab that is a Windows setting the player has to find.
- **Its own window, full screen, an installer, an icon.** No address bar, no tabs, no extensions, no browser updates
  changing behaviour under the game.
- **A fixed, known engine version.** Every player on the launcher runs the same Chromium.
- **Room to grow:** a local asset pack (section 4) and, later, Node-side features a browser can't have (saving
  screenshots and recordings to a folder, reading a game controller, a local cache that survives).

What it does not add: any drawing capability a browser doesn't have. Electron's page runs in the same sandbox as a
tab, with the same WebGL 2 and the same WebGPU.

## 2. What WebGL 2 through three.js can do, and what the game already does

| Capability | Available | In FishDock now |
|---|---|---|
| Physically based materials (metal/roughness, clearcoat, sheen, transmission) | Yes (MeshStandard/PhysicalMaterial) | Yes: rod, reel, railings, deck, clothes, skin |
| Normal, roughness, AO maps, anisotropic filtering | Yes | Yes, on most surfaces (16x anisotropy at High/Ultra) |
| Image-based lighting (environment map) | Yes | Yes: the sky is rendered to an environment map and lights everything |
| Directional shadow maps, PCF soft shadows, cascades | Shadow maps yes; cascades by hand | One sun shadow map, 2048 at High (no cascades) |
| Screen-space ambient occlusion (GTAO) | Yes (three's GTAOPass) | Yes at High and Ultra |
| Bloom, tone mapping, colour grading | Yes | Yes (half-float buffer, UnrealBloom, Neutral tone map) |
| MSAA anti-aliasing | Yes (multisampled render targets) | Yes, 4x |
| Temporal anti-aliasing (TAA) | Not built in; can be written (needs motion vectors) | No |
| Planar reflections (render the scene again, mirrored) | Yes | Yes: "Scene" reflections draw the place a second time, smaller |
| Screen-space reflections (SSR) | Yes (three has SSRPass; or custom) | No |
| Refraction / underwater | Yes | No |
| Volumetric fog, god rays | Shader work; feasible | Analytic haze with forward scatter only |
| Instanced drawing, GPU skinning, morph targets | Yes | Yes (guides, railings; people; the net and fish) |
| Compute shaders, GPU-driven culling, mesh shaders | **No** in WebGL 2 | — |
| Hardware ray tracing, DLSS/FSR | **No** in any browser API | — |
| Bindless textures, 64-bit floats | No | — |
| Texture compression (BC/ASTC via KTX2) | Yes | Not yet (JPEG/WebP textures, decoded to raw) |
| Draw-call cost | Higher than native (each call crosses the JS and ANGLE layers) | Low preset 88 calls, Ultra 445: well within budget |

Where the picture falls short today, the cause is **content and shader work, not the API**: the sea has one wave
spectrum and a coarse normal, the dune is a tinted photograph, the town is extruded footprints, the hands come from a
general-purpose body model. Everything in the "Available: Yes" rows can be done without changing engine.

## 3. WebGPU: the next step up inside the same architecture

Chromium ships **WebGPU** on Windows (Direct3D 12 underneath), and three.js r170 has a `WebGPURenderer`. WebGPU adds
compute shaders, storage buffers, indirect draws and much cheaper draw calls, which is what a GPU-simulated sea,
particle spray, GPU culling of a detailed town and a proper TAA want. It is the route to the "advanced graphics" a
native engine would give, without leaving the codebase.

Cost of moving: FishDock's custom shaders (sky, sea, deck, dune, skin, line) are GLSL written into three's material
system; WebGPURenderer wants them as TSL (three's node language), which compiles to WGSL. That is a port of perhaps
3,000 lines of shader, done material by material, and WebGPURenderer can fall back to WebGL 2 on machines without it.
Recommendation: **not yet.** Do the content work first on WebGL 2 (it carries over), move the sea to WebGPU compute
when its simulation needs it, and keep WebGL 2 as the phone path.

## 4. The real limits on the PC, in order of how much they hold the picture back

1. **Asset size over the network.** The website keeps textures around 200 KB and models under 2 MB so a phone loads
   in seconds. A PC has a disk. The launcher can ship a local asset pack (hundreds of MB: 2K and 4K PBR sets, dense
   meshes, more species) and tell the site to use it. This is the single biggest quality lever the desktop gives us,
   and it costs nothing in rendering.
2. **One shadow map, no cascades.** Crisp shadows at your feet or long shadows across the pier, not both. Cascaded
   shadow maps are a day's work.
3. **No temporal anti-aliasing.** Fine detail (the line, railings, the sea's glitter) shimmers in motion. TAA needs
   motion vectors from every material; feasible, a week.
4. **Reflections.** Planar reflection of the whole scene is correct for calm water and costs a second scene draw;
   it needs blurring by wave slope for rough water (the "Scene, smooth" option is a start). SSR is cheaper and
   handles the pier wall; it misses what's off screen. The right answer is both, chosen by sea state, and measured.
5. **Memory per page.** Chromium limits a tab (and an Electron window) to a few GB of GPU memory in practice; a
   4K-texture world needs texture compression (KTX2/BC7) to fit, which also speeds loading. Not yet used.
6. **JavaScript per frame.** Animation, the line, the fight model and the camera run on the main thread. At 60 fps on a
   PC this is well within budget today (the line is 56 µs a frame); a far denser scene would move the sea and the
   crowd simulation to workers or the GPU.

Things a native engine would give that no browser path will: hardware ray tracing, DLSS/FSR upscaling, mesh shaders,
unbounded memory. None of them is what the current picture lacks.

## 5. Decision

Keep three.js. Spend the effort on content (accurate Gorleston geometry from references, PBR asset standard,
rigged hands and rod, a proper sea), the local asset pack for the launcher, then cascaded shadows, TAA and measured
reflections at Ultra. Revisit WebGPU for the sea simulation once the content is in place. Measure every step with the
Graphics panel's benchmark on real hardware; this document has no numbers of its own on purpose.
