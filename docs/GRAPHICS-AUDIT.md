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
   the temporal antialiasing). **Still:** the left forearm crosses the lower part of the picture in the wind-up (as a
   real angler's does, the butt hand coming up in front of the chest) and the right hand passes close; moving the cast's moments or forcing the elbow down put the wrist past its range
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
22. **The photographed rock armour cost far more than it showed.** On Aaron's PC the live game after #153 drew 6.6
   million triangles a frame on Ultra at Gorleston, against 2.4 million after #151: every stone within the sun's
   shadows' reach (125 m on Ultra) was the fine 2,000-triangle scan, drawn again in each pass (the picture, the ambient
   occlusion's depth, two shadow maps, the reflection), though from the fishing spots the nearest stones are 75 m away
   and a few tens of pixels across. **Changed** (`realPlace.js` `ARMOUR_LOD`, `source-assets/blender/build_armour.py`):
   a middling 600-triangle version of each stone, made in Blender like the others; the fine stone only within 20 m of
   you, the middling to 60 m, the 300-triangle one beyond, each casting shadows while inside their reach. Filmed from
   10, 28, 45 and 90 m: no visible change. Measured on Aaron's PC (the two ways in turn on one run, three and two
   times, Ultra, 3D view full screen): triangles a frame 6.65 million down to 2.5 million; the frame rate within the
   run's own spread either way (1080p 67 to 77 fps with the bands, 80 to 82 without; 1440p 66 to 81 and 78 to 79; the
   graphics card 10.9 to 12.9 ms a frame either way, the first run at each size the slowest). The RTX 3090 had
   triangles to spare, so this is for weaker graphics cards (laptops, High on a modest card), not a faster frame on his.
   His graphics card was 22 to 36% busy with other work all evening (the run waited 28 minutes for it to go idle), so
   these frame rates don't compare with item 20's.

23. **The fish's skins were FishDock's 480 by 320 pictures stretched over the rebuilt bodies.** **Changed**
   (`source-assets/fish-skins/skins.py`, `public/fish/skin/`): 17 species wear a skin made from one photograph each
   (Wikimedia Commons, every one CC BY or CC BY-SA, chosen for a whole fish seen side on; credited in Settings, 3D
   fish skin credits, in `public/models/CREDITS.txt` and in `source-assets/ASSET-LICENCES.json` with the hash of the
   copy used, kept on Aaron's PC). Each photograph is cut out, turned level and warped onto the frame of FishDock's own
   picture (which the models' uvs follow), along the body between marks matched in both (the snout, the eye, the gill
   cover's edge, the peduncle) and across it between the body's edges, at four times the old size (1920 by 1280 on
   High and Ultra, 960 by 640 below); fins the photograph shows folded or cut off are redrawn in its own fin colours
   with rays; its highlights and colour cast are evened out, since the game lights the fish. A normal map goes with
   each: the photograph's fine detail as relief, overlapping scales where the species has them (rows following the
   body, none on the head or fins), the fins' rays and a shark's rasp. The gurnard, tope, lesser-spotted dogfish,
   conger and eel (no photograph good enough: fins spread, or a museum mount) have skins drawn the same way from
   FishDock's own pictures alone. The pectoral fin is a plate standing off the flank: its picture is now painted in
   the skin's empty corner and the plates pointed there (`angler.js` `pecToCorner`), and the photograph's own fin
   cleared from the flank under it, which showed through as a second fin. Filmed close up in the game on the mat and
   in the net (cod, bass, mackerel, pouting, black bream). `tests/fishSkins.test.js`.
24. **Spray off the rock armour was round soft puffs** (item 5 of the list below, until now): from the pier they read
   as cotton wool on the stones, and the foam they left was more puffs lying on the water. **Changed**
   (`rockSpray.js`): a break comes in stages as a wave's does on a breakwater. First sheets of water thrown up and
   back over the stones, each drawn out along the way it goes and narrow across it, made of strands and torn at its
   edges, see-through where thin, so a break is many overlapping; they slow, stall and burst into drops, which fall
   back; a fine mist is left hanging where they broke and drifts off with the wind; and the water running back leaves
   foam lying on the sea, flat on its surface, which spreads, drifts and opens out into a fine, irregular lace of
   bubbles over several seconds. The same crest reaches each stone a moment apart, so a break runs along the armour.
   How high and how hard follows the sea that is running (nothing on a flat calm, sheets about a metre in a light sea,
   three or four in a big one). A crest against the wall's piling slaps up its face as sheets instead of throwing a
   ring, and a rig, a fish or a net going in leaves a patch of foam. Spray and foam take the haze like everything else.
   On the first footage from Aaron's PC the foam's lace drew as white star-shaped grids seen from the rail (too coarse
   and regular): it is fine and broken now. `tests/rockSpray.test.js`.
25. **The harbour wall's steel piling was a bright orange-brown, and its concrete capping beam a thin slab.** From the
   water the piling read as new timber boards. Gorleston South Pier's piling is near black in every photograph
   (Geograph 1605191, 2491438), under a deep, weathered capping beam. **Changed** (`textures3d.js` `sheetPiling`,
   `realPlace.js`): the piling a deep weathered brown, near black in its pans, with runs of orange rust here and there;
   the capping beam 0.85 m deep (was 0.45), its top falling a little to the water, rain running down its face in darker
   streaks, a little rust from its fittings, its foot dark with spray and weed, longer rust runs below each railing
   post and the mooring rings lower on its face; the ladders' rungs round bar. **Not done:** at Gorleston the railings
   stand back a metre or more from the edge with a sloping concrete margin outside them (Geograph 2491438 and others);
   here they stand 22 cm from it. Moving them moves every fishing spot, the cast over the rail and the drop net, so it
   is left for a change of its own.
26. **The first-person cast's wind-up** (item 18's "Still"): at its top the reel was 20 cm from your eye and your left
   elbow at the middle of the picture's left side, 27 cm away, the forearm across the picture. **Changed**
   (`tools/fp-cast-view.mjs`, `tools/fp-rig-data.mjs`): the wind-up's three moments were searched again with your view
   as a condition, as the follow-through was: each arm kept out of the middle of the picture and away from your eye,
   both hands on the rod, no arm stretched, every wrist inside its range (the gates' own measure, checked by
   `tests/fpRig.test.js`), the rod still back past 130 degrees at the top. The left elbow now stays in the lower third
   and the reel a third of a metre from your eye; filmed through a whole catch in first person.
27. **The ambient occlusion's cost**, measured on Aaron's PC (Ultra, Gorleston, 3D view full screen; the four ways in
   turn, three times each, at two window sizes; the graphics card's own milliseconds a frame, the mean of the last two
   rounds, the first being just after loading):

   | Shade | 1896 by 988 window (drawn 3792 by 1976) | 2536 by 1348 (drawn 3951 by 2100) |
   |---|---|---|
   | off | 9.6 ms, 90 fps | 9.5 ms, 94 fps |
   | half size, nothing past 120 m (realism-8) | 11.2 ms, 84 fps | 11.3 ms, 84 fps |
   | half size, everything (as live) | 11.7 ms, 83 fps | 10.7 ms, 86 fps |
   | full size, everything | 11.3 ms, 87 fps | 11.6 ms, 83 fps |

   So the shade costs about 1.5 ms of an 11 ms frame (about 10 fps at 90); since #153 worked it out at half size the
   rest of its cost is drawing the scene a second time for its depth, not the shading, and nothing more is gained
   from it on this card: the half-size and 120 m cut are within the runs' own spread (half a millisecond either way).
   **Changed** all the same: the shade's own picture of the scene leaves out anything wholly further than 120 m (the
   shade there is a few pixels across and less), for weaker graphics cards. The graphics card was 25 to 44% busy with
   other work throughout (it never went idle in the 10 minutes the run waited), so the frame rates are coloured by it.
28. **High against Ultra**, the in-game benchmark on the same run (average fps, slowest 1%, graphics card ms):
   1896 by 988: High 87, 42, 9.7 ms; Ultra 72, 41, 13.0 ms (its measure caught only 55 frames). 2536 by 1348: High 87, 42, 10.3 ms; Ultra 80, 43, 11.2 ms.
   3816 by 2068: High 127, 70, 6.9 ms; Ultra 99, 69, 9.5 ms. The 4K run happened to fall while the other work on the
   PC eased (Low there ran 246 fps, its frames 3.6 ms apart, against about 105 at the other sizes), so it is the
   nearest to a clean figure: on the RTX 3090 Ultra costs about a third more than High at the same window, both well
   over 60 fps at 4K. Not clean figures: see item 27.
29. **KTX2 texture compression.** Aaron's PC has no KTX2 or Basis encoder (no `toktx`, `ktx` or `basisu` on its path
   or in its program folders; searched read-only, 17 November); the only Basis file on it is three.js's decoder inside
   another project. three.js r170's KTX2 loader reads Basis textures only through that decoder, and of the raw
   compressed formats only ASTC (phones), not the BC formats desktop cards use. Making KTX2 files needs KTX-Software
   or Basis Universal installed; that is a new program on Aaron's PC and left for him to agree. Not done.
30. **Seen in the footage on Aaron's PC** (a whole catch, walking, overcast, rain, dusk, night and morning, filmed
   in real time on his graphics card at 1080p Ultra) and **fixed**: the foam's lace drawn as white grids (item 24);
   after dark a light over the fishing stretch with no lamp to account for it lit 40 m of deck evenly orange, like a
   stage (now faint, so the lamps' own pools show); and walking away from a landed fish, the drop net was drawn on the
   deck beside you all the way, its rope trailing (now left out while you walk).

31. **Filmed again on Aaron's PC after those fixes** (17 November, 23:25, the same scenes at 1080p Ultra, 497 frames):
   the foam is a soft, broken lace on the water, not a grid; at night the deck is lit in pools by its own lamps and the
   coastwatch's windows; the net is gone from the deck while you walk. The game's benchmark in the same run (the graphics
   card again busy with other work beforehand, 21 to 42%, so not clean figures): Low 212 fps, Medium 102 (one
   100 ms hitch as its textures loaded), High 120 fps with the slowest 1% at 70 and 8.1 ms of graphics card a frame,
   drawn at 3318 by 1729. **Not done:** a frame-by-frame check of the temporal antialiasing against none for ghosting
   on moving things (the line, the rod tip, a fish swinging up). It was started here in software rendering and was
   too slow to finish; in the PC's footage nothing trails, but that footage wasn't made to show it.

## What is left, in order of what it would add

1. Temporal anti-aliasing: done on High and Ultra (item 15), from depth and the camera's own motion; motion vectors from
   the custom shaders would let it keep more of last frame on moving things (it holds them to this frame instead).
2. The 2K texture sets the PC launcher could carry (`docs/PC-ARCHITECTURE.md` section 4): with KTX2 (item 29).
3. The town: it is shown by photographs, as Aaron chose (10 November); modelled buildings would need his say.
4. Clean frame rates on Aaron's PC. The live game after #153, measured with its own benchmark at three window sizes on
   17 November at 19:08 (Microsoft Edge, headless, its 3D view full screen; RTX 3090, Direct3D 11): average frames a
   second, the slowest 1% of frames, and the graphics card's milliseconds a frame:

   | Preset | 1896 by 988 | 2536 by 1348 | 3816 by 2068 |
   |---|---|---|---|
   | Low | 108 fps, 1% 51, 3.8 ms | 94, 50, 3.7 ms | 105, 51, 4.0 ms |
   | Medium | 111, 52, 6.0 ms | 111, 50, 7.3 ms | 99, 49, 8.9 ms |
   | High | 79, 47, 8.6 ms | 96, 47, 8.7 ms | 73, 41, 10.0 ms |
   | Ultra | 82, 43, 10.6 ms | 74, 38, 12.2 ms | 84, 49, 11.4 ms |

   Ultra draws at most 3840 by 2160 at every size (the pixel budget), so its rows are much alike. The graphics card was
   already 22 to 32% busy with other work before each size, and Low and Medium sat at about 118 frames a second
   whatever their load (frames 8.5 ms apart), so these are what the game managed beside that work, not clean figures:
   on the same PC at 17:24 (item 20), Ultra ran 95 fps at 1080p and 83 at 1440p. The figures after
   #151 (117 fps on Ultra at 1080p, 74 at 1440p) came before #153's pixel budget, temporal antialiasing and half-size
   shade, so they don't compare directly either. A clean run waits for the graphics card to be idle
   (`FishDock-assets/queue`, h005); it has not been idle on any evening run so far (items 27 and 28 have the latest).
5. The sloping concrete margin outside Gorleston's railings, and the railings set back a metre from the edge (item 25).
6. KTX2 textures, once Aaron agrees to KTX-Software or Basis Universal being installed (item 29).
