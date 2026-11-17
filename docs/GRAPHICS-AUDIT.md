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

7. **Rain looked drawn on** (Aaron, 17 November: "it looks bad"). It was 1,800 one-pixel white lines in a 60 m box,
   all the same length and brightness, falling straight down whatever the wind, unlit, so as bright at night as by
   day, and moved one by one on the processor every frame. **Changed** (`src/lib/world3d/rain3d.js`): near drops are
   ribbons along their paths, moved on the graphics card (nothing per drop on the processor), slanted by the wind,
   each its own size and speed, bold close by and finer further off (a drop narrower than a pixel is drawn a pixel
   wide and fainter by as much), showing the sky's light, glinting towards the sun, and after dark seen only in a
   lamp's light (brightest with the lamp behind it) or your head torch; curtains of rain at 16 and 42 m (one on a
   phone) falling in drifting sheets, faded out towards the deck and the water; splashes on the deck round you.
   A drop streak was first invisible: drawn down its path from the drop it turned its back to the camera and was
   culled, found by drawing markers at the drops' places and testing each part of the ribbon in turn. Cost when it
   rains: three or four more draws, about 20,000 more triangles on a computer, and one or two passes of the curtains'
   shading over the picture. `tests/rain3d.test.js`.
8. **A fish swung up on the line was out of your own view** when standing: it hung about a metre above your eye and
   the first-person view was held looking down at the rail (18 of 40 checks a quarter second apart). **Changed:** the
   view may look up a little to it, and as it swings in it aims between the fish and your hand.

9. **The reel was built from simple shapes** (Aaron, 17 November: "replace simplistic fishing rods and reels with detailed,
   accurately proportioned models"). **Changed** (`source-assets/blender/build_rodkit.py`, `public/models/rodkit.glb`):
   a front-drag spinning reel modelled part by part in Blender: a lofted gearbox body with its side
   covers and trim rings, a swept stem down to the foot, the rotor's cup and arms with their bosses, a bail wire that
   runs round in one curve to the line roller and its cover, a spool with a grooved skirt and blue braid on it, a
   knurled drag knob with its cap, and a handle whose arm is one lofted piece out to a shaped knob. 27,000 triangles,
   623 kB (the old file's points where the hand, the line and the game hold it are kept exactly, checked by
   `tests/rodkitModel.test.js`). Filmed in first person through a cast and a fight.
10. **The deck's concrete was a smooth, plain grey.** **Changed:** Poly Haven's broom-finished "Concrete Floor 03"
   (photographed, 2.5 m a tile; 1K, and 2K on High and Ultra), its colour, roughness and relief laid along the pier so
   the brush lines run across it as they do on a slab, under the drawn bays, joints, wear and stains.
11. **Railings and the rod's tip crawled and flickered as you looked about** (item 4 above). **Changed**
   (`src/lib/world3d/thinAA.js`): a tube that would be drawn thinner than a pixel and a half is widened to that on the
   screen and made fainter by as much, through the multisampled picture's own samples (alpha to coverage), so a
   distant rail is a steady faint line rather than broken dashes. On the railings, their joints and the rod's blank.
   No extra draws. Temporal anti-aliasing is still not done (see item 4).
12. **The cast, the drag, the drop net's rope and footsteps were drawn sounds.** **Changed:** real recordings from
   BigSoundBank (CC0 1.0): three rods and sticks swept through the air, single clicks of a ratchet, a rope run through
   the hands, and shoes on concrete, cut into short pieces and each played a little differently every time
   (`source-assets/prepare_sounds2.py`). Checked in the game: the recordings are fetched, decoded and played on the
   cast. Later the same day (#152): the rod-tip bell (a small bell's strike), thunder (three claps, near to far),
   the drop net going in and draining, a fish's tail on the mat and another angler's reel running, recorded too.
   Still drawn: the fish laid on the mat, the line under strain, and the bite alarm by a river or lake (an electronic
   beeper, which is what a real one is).
13. **The rod rest's heads drew as black torn shapes** against the sea, seen on Aaron's PC (1920 by 1080, Ultra): each
   was two half tori left open at their ends, so from most places you saw into the tube past its own back faces.
   **Changed:** each U's ends rounded off, the tube smoother, and the rubber a real black rubber's dark grey with a
   soft sheen rather than near-black, so its shape shows.

Looked at and found sound: tone mapping and exposure (one Neutral curve, exposure eased with the light), colour
management (sRGB textures marked as such, linear lighting), anisotropic filtering, instancing, shader precompiling,
level of detail on trees, frame pacing, the sea's multiple wave scales and wind response.

14. **The fish were a cut-out picture wrapped on a smooth loft** (Aaron, 17 November: "rebuild the existing British
   fish species with accurate anatomy"). **Changed** (`source-assets/blender/build_fish3.py`,
   `public/models/fish2/<species>.glb`, all twenty sea fish): each body lofted finely over its picture's own outline,
   its cross-section by kind of fish (a round fish's narrower back, a bream's deep flat sides, a shark's flat belly, a
   gurnard's bony wedge of a head, a flatfish domed and thin to its fringe); the gill cover's edge and the
   preopercle's line as grooves with the cover's flap standing proud; the mouth a lipped slit; each eye a dome with a
   cornea's bulge in its socket; a shark's five gill slits; the fins' rays as ridges fading to the edge; the pelvic
   fins a pair turned out from the belly; the pectoral fins, which the pictures paint on the flank, stood off it as a
   rayed pair; a shark's pectorals turned out flat as its wings are. Two shape keys the game plays: the jaw drops and
   the gill covers lift (slowly in the water, half open on the hook, gasping out of it). Each kind swims its own way
   (an eel's long wave, a shark's, a mackerel's stiff body), a hooked fish shakes its head now and then, and a landed
   fish flaps in bursts and tires. Filmed close on Aaron's PC. **Still:** the skins are the 480 by 320 pictures; no
   larger licensed photographs of these species were found to replace them.
15. **Shimmer in motion** (item 4). **Changed** (`src/lib/world3d/taa.js`): temporal anti-aliasing on High and Ultra
   ("4x + temporal" in Settings, Graphics). Each frame is drawn from a slightly different point inside the pixel
   (eight, in a fixed order) and blended with where that point of the world was last frame, found from the depth and
   last frame's camera; anything that moved by itself (the sea, the fish, the rod, your hands, rain) is held to this
   frame's colours round the pixel, which is what stops ghosts and smears; a cut or a jump starts it afresh. It reads
   the ambient occlusion pass's own depth: resolving the multisampled picture's depth into a texture every frame
   halved the frame rate on Direct3D (Aaron's PC), so with the ambient occlusion off it passes the picture through.
   The sea's sharp glints are also widened to the turn of the reflected ray across the pixel (steadier glitter with
   nothing carried over from earlier frames).
16. **The rock armour was drawn stones.** **Changed** (`source-assets/blender/build_armour.py`, `public/models/armour.glb`):
   four scanned boulders from Poly Haven (CC0), turned down to 2,000 triangles near and 300 far, their photographs
   laid in one atlas and turned towards a grey granite's colour, put in the drawn stones' places, turns and sizes.
17. **The harbour wall's piling was a flat sheet with its pans drawn on**: from out on the water it read as a painted
   board. **Changed:** within 300 m of the marks on a computer, each 0.6 m of piling is a trapezoid 9 cm deep, each
   face lit flat, on the drawn pans' own places; the waterline zigzags along it as it does on real sheet piling.
18. **In your own view the cast's follow-through held your hands at the foot of the picture or below it** while the
   lead flew, the rod standing straight up the middle (Aaron's PC, 17 November). **Changed:** the follow-through is
   held out in front at chest height, the rod pointing up the lead's line a little right of your eye's, both hands in
   view. Through the wind-up your left arm, holding the butt, came up across the lower left of the picture, its sleeve
   17 to 23 cm from your eye: the sleeve within about 24 cm of your eye now dissolves (dithered over 6 cm, smoothed by
   the temporal antialiasing). **Still:** the left forearm crosses the lower part of the picture in the wind-up and the
   right hand passes close; moving the cast's moments or forcing the elbow down put the wrist past its range
   (`tests/fpRig.test.js`), so a cleaner wind-up needs the cast solved again in Blender with the view as a condition.
19. **The wellies were straight tubes.** **Changed:** each leg a moulded shape: a little flare at the top, full over
   the calf, narrowing to the ankle, a raised band near the top.
20. **The slowest frames at 1440p Ultra (47 fps for the slowest 1%).** Measured on Aaron's PC, 17 November, at
   Gorleston with the 3D view full screen, one thing off at a time (Ultra; each run repeats to within about 5 fps):

   | Ultra with | 1080p avg fps | slowest 1% | 1440p avg fps | slowest 1% |
   |---|---|---|---|---|
   | everything | 95 | 56 | 83 | 47 |
   | no temporal antialiasing | 101 | 56 | 91 | 56 |
   | no multisampling or temporal antialiasing | 114 | 72 | 113 | 92 |
   | no ambient occlusion | 129 | 93 | 127 | 92 |
   | no spectrum sea | 100 | 56 | 92 | 56 |
   | no reflections | 102 | 56 | 92 | 56 |
   | lighter shadows | 98 | 54 | 89 | 47 |

   The ambient occlusion was the costliest part of the frame and the slowest frames came with it. **Changed:** on a
   big picture (High and Ultra on a computer draw at up to twice the window's size) it is worked out at half size, still
   a sample for every pixel of the window. Measured again on the PC while it was busy with other work (its graphics
   card already at 49% before the run), so those numbers don't compare with these; the live game is measured again
   below.
21. **A hooked or landed shark's jaw tip vanished** as it gaped: its swimming wave was not a number a little ahead of
   the snout, where a dropped jaw reaches. **Fixed**, with a check for every kind of swimming.

## What is left, in order of what it would add

1. Temporal anti-aliasing: done on High and Ultra (item 15), from depth and the camera's own motion; motion vectors from
   the custom shaders would let it keep more of last frame on moving things (it holds them to this frame instead).
2. KTX2 textures, and with them the 2K texture sets the PC launcher could carry (`docs/PC-ARCHITECTURE.md` section 4).
3. The town: it is shown by photographs, as Aaron chose (10 November); modelled buildings would need his say.
4. Frame rates at 4K on Aaron's PC. Done for 1080p and 1440p (17 November, the live game after #151, Microsoft Edge
   with its 3D view full screen, RTX 3090, Direct3D 11; average frames a second and GPU milliseconds a frame):

   | Preset | 1920 by 1080 | drawn at | 2560 by 1440 | drawn at |
   |---|---|---|---|---|
   | Low | 273 fps, 1.6 ms | 1920 by 1080 | 272 fps, 1.6 ms | 2560 by 1440 |
   | Medium | 200 fps, 4.7 ms | 1920 by 1080 | 202 fps, 5.1 ms | 2560 by 1440 |
   | High | 144 fps, 6.7 ms | 3360 by 1890 | 110 fps, 8.9 ms | 4480 by 2520 |
   | Ultra | 117 fps, 8.5 ms | 3840 by 2160 | 74 fps, 13.5 ms | 5120 by 2880 |

   High and Ultra draw at up to twice the window's size and scale it down (supersampling); the slowest 1% of frames
   on Ultra at 1440p ran at 47 fps. Headless, so no monitor's refresh rate capped them.
