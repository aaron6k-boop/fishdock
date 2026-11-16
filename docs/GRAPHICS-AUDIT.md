# Graphics audit, 16 November 2026

Aaron's brief: a major photorealistic upgrade of the existing game, PC first, with the same viewpoints compared before
and after and the costs recorded. This is what was looked at, what was found, what was changed in PR #149, and what
is left. Read with `docs/PC-ARCHITECTURE.md` (what WebGL 2 through three.js can and can't do) and `docs/BENCHMARK.md`
(how to measure frame rates on a real PC).

## How it was looked at

- The same viewpoints, before (production, `main` at 6b1c93b) and after (this branch), drawn by the film build in a
  1280 by 720 window on Ultra: first person over the sea, first person looking down at your hands, first person
  towards the town, a camera behind the angler, and along the pier, each by day, at dusk, at night and in rough
  weather (95% cloud, 42 kph wind, rain, 1.8 m waves). The script is `tools/graphics-audit.mjs`.
- `tools/scenes.mjs` (the twelve fixed scenes: casting, a fight, the landing net, walking in third person, sea fret,
  storm) is the fuller regression set for judging by eye.
- The pictures are drawn by a software graphics card (SwiftShader). They show what the engine draws, not how fast a
  real card draws it: frame rates here would mean nothing. What a frame costs in work is recorded instead (three.js's
  own counters, every pass of one frame: the shadow maps, the mirrored scene, ambient occlusion, the picture and the
  post effects). Frame rates and GPU times come from the benchmark on Aaron's PC (`docs/BENCHMARK.md`).

## What the picture is made of (as found)

three.js r170 on WebGL 2 (Direct3D 11 through ANGLE on Windows). Physically based materials throughout; the sky
rendered into an environment map that lights everything; a half-float picture with the Neutral tone curve, bloom,
a colour grade with contrast-adaptive sharpening; 4x MSAA; ground-truth ambient occlusion (GTAO) on High and Ultra;
the scene drawn a second time, mirrored, for the water's reflections; on Ultra a wave spectrum simulated on the
graphics card (FFT) for the sea, elsewhere seven wave trains with detail normal maps, foam on crests and at the
walls, depth and silt colour, Fresnel; haze that glows towards the sun; one sun shadow map (2048 to 4096 pixels, 30 to
80 m round you, soft PCF); 16x anisotropic filtering; instanced railings, guides and pier furniture; trees with
distance levels; shaders compiled while the place loads; frame pacing that steps the resolution down when frames run
late. The deck is a photographed concrete over drawn bays and joints, with wear, stains, damp along the walls, salt,
rust round the posts, puddles in rain, and a baked contact shade round what stands on it.

## What a frame costs on Ultra (1280 by 720, 2 pixels per pixel)

| View | Draw calls before | after | Triangles before | after |
|---|---|---|---|---|
| First person over the sea | 370 | 458 | 1.95 M | 2.36 M |
| Behind the angler | 428 | 516 | 1.97 M | 2.38 M |
| Along the pier | 534 | 590 | 1.88 M | 2.17 M |

Before: 237 geometries, 123 textures (about 138 MB of texture memory by their sizes, uncompressed, with mipmaps; the
render targets come on top), 261 shader programs. After: 240 geometries, 125 textures (the near shadow map among them), the same 138 MB by size, 261 shader programs. The near shadow map is what adds the draw calls and triangles: 56 to 88 more draws and about 0.3 to 0.4 million more triangles a frame on Ultra, every one of them a depth-only draw into the 2048 map. Its memory is 16 MB (2048 by 2048, four bytes a pixel). The clouds' shadows add no draws.

## The biggest weaknesses, and why

1. **Shadows at your feet were soft on Ultra.** One shadow map has to cover everything: Ultra's 80 m each way at 4096
   pixels is 3.9 cm a pixel, so the rod's, the railing's and your own shadow were grey smears. Cause: no cascades.
   **Changed:** a second shadow map, 2048 pixels over the 26 m round you (1.3 cm a pixel), taken where it covers and
   blended into the far one over its last metres; the far map now leans a third of its width ahead of you, where you
   look. On a computer, with High shadow detail and a shadow distance of Far or Furthest (Ultra's default). Cost: one
   more shadow pass over what is near you, and a second shadow lookup for the pixels near you.
2. **A day of broken cloud was lit like a clear one.** The sky had drifting cumulus, but every part of the pier, sea
   and town was in full sun. **Changed:** the clouds' shadows, patches a few hundred metres across drifting at the
   sky's own speed and way, as much of the ground in shade as the sky has cloud, none under a clear sky, a full
   overcast or at night. In shade only the sky lights things (no hard shadows, no glitter on the sea, the water's
   sunlit colour darker). Cost: a few noise lookups a pixel; no extra pass. On the land it needs shadows on (it works
   from the sun's shadow coordinates); the sea has it whatever the settings.
3. **Hands.** The fingers were thick and the wrists thin, the skin plastic, and the right middle finger pressed into
   the reel's foot. **Changed** (this PR, earlier commits and this one): slimmer fingers, fuller wrists, a skin
   shader with pores, creases, rim light and arm hair, glossier nails, and the finger opened clear of the reel, checked
   point by point against the reel's surfaces in every hold.
4. **Shimmer in motion** on thin bright things (railings, the line, rod guides, the sea's glitter): 4x MSAA smooths
   edges in a still frame but not from frame to frame. Temporal anti-aliasing needs motion vectors from every
   material, and FishDock's sea, sky, skin, deck and line are custom shaders. **Not done:** about a week's work; the
   glitter and joint lines already fade where they'd be smaller than a pixel.
5. **Texture memory and loading.** Textures are JPEG and WebP, decoded to raw pixels on the card (about 140 MB at
   Gorleston). KTX2 with BC7 (PC) and ASTC (phone) would cut that by four to six and load faster. **Not done:** it
   needs an encoder (toktx or basisu) and three's KTX2 loader and transcoder, none of which are in this workspace
   without installing new tools; the asset pipeline change is worth its own PR.
6. **Reflections.** The mirrored scene is right for calm water and is broken up by the waves; screen-space
   reflections would add the pier wall's reflection close by. **Not done:** the planar reflection already covers what
   you see at Gorleston; SSR would cost a full-screen pass for little there.

Looked at and found sound: tone mapping and exposure (one Neutral curve, exposure eased with the light), colour
management (sRGB textures marked as such, linear lighting), anisotropic filtering, instancing, shader precompiling,
level of detail on trees, frame pacing, the sea's multiple wave scales and wind response.

## What is left, in order of what it would add

1. Temporal anti-aliasing (motion vectors for the custom shaders), for the shimmer in motion.
2. KTX2 textures, and with them the 2K texture sets the PC launcher could carry (`docs/PC-ARCHITECTURE.md` section 4).
3. The town: it is shown by photographs, as Aaron chose (10 November); modelled buildings would need his say.
4. Frame rates for every preset at 1080p, 1440p and 4K on Aaron's PC, before and after (the benchmark), to confirm
   the near shadow map's cost.
