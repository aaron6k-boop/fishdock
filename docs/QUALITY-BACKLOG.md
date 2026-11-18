# FishDock quality backlog

The permanent list of what looks or feels wrong, from Aaron's improvement programme of 14 November 2026, highest impact
first. Each item says what's wrong and why, how it compares with the target (Call of the Wild: The Angler for places and
atmosphere, Fishing Planet for tackle and fish behaviour, current AAA games for hands, materials and light), what to do,
what it should look like after, what it costs to draw, and how it will be checked. Updated at the end of every session;
done items move to the log at the bottom with their evidence.

**What this workspace can and can't do.** It can change the game's code and shaders, draw the game in software to
check what's drawn (not how fast), measure counts (shaders built, textures sent, triangles), and read the repo's
models. It can't run Blender, download from asset libraries (Poly Haven, ambientCG, Sketchfab, Freesound: its network
reaches only package registries and GitHub) or time a real graphics card. Blender work and downloads happen when this
chat is linked to Aaron's PC, as the rig, rod kit and nets were made. Nothing is bought without asking.

## The ten biggest opportunities

### 1. Your arms and hands when you look down (hauling the drop net, putting a fish back)
- **Wrong:** sleeves cut open near the eye showed as hollow rings round the forearms; the hands become blob-like fists
  on the rope; the far hand sits on your line of sight, so you look down your own arm.
- **Why:** the jacket is a two-layer cloth and the near-eye cut exposed its lining; the haul pose is placed by code
  (hands on the line to the net), not authored.
- **Target:** first-person arms in AAA games never show their insides; hands read as hands at any angle, gripping
  hand over hand with the rope running through the fingers.
- **Do:** (done) drop the lining when the rig is built, and leave the jacket's body (chest, shoulders, hips) out when
  looking down, where the cut made ragged flaps across the bottom of the picture; (next, needs Blender on the PC) author the haul and
  lowering as clips on the rig, hands off the eye line, fingers wrapped round the rope, IK for the rope contact.
- **Benefit:** the drop net, the moment of every pier catch, stops looking broken.
- **Cost:** the lining drop removes 39% of the jacket's triangles (cheaper); clips cost nothing per frame.
- **Done (14 Nov):** taking the hoop as it swung up off the deck and back over the rail, the hand followed it at up to
  12 cm a frame (7 m/s), and an arm let go of it dropped at 11 cm. Hands on the hoop now go no quicker than 2.5 m/s and
  a let-go arm drops in 0.45 s: lifting the net 118 to 56 mm a frame at most, bringing it in 113 to 44.
- **Check:** the fixed drop-net film (`haul_frames`) before and after; `tools/rail-test.mjs dropnet`; `tools/arm-steady.mjs`.
- **Still open:** looking down, the sleeve nearest your eye is cut away by the sphere round the camera, and through the
  opening you see the water: clean-edged now, but a hollow look. The fix is first-person arms authored to end outside
  the view (Blender on the PC, with the haul clips above).
- **Looked at again (15 Nov): the sleeve wasn't missing.** Painted flat by bone in the cast's frame 48, what read as a
  bare forearm is your right hand seen edge on from 25 cm as the rod goes back, then about 6 cm of wrist, then the
  sleeve, exactly where the skinning puts it (4.7 cm out from the forearm's axis, as on the left). Two real faults
  made it look wrong: a dark line across the wrist (item 2) and the cuff's edge, a sawtooth where the lining was
  left out. Both fixed. **Check:** `fpbones.mjs`-style bone paint of the cast's frame 48; the cuff before and after.
- **Open (15 Nov): the drop net's landing, leaning out.** For 3 frames (0.3 s) of `tools/rail-test.mjs dropnet` the
  right upper arm still measures 6.7 to 7.3 cm into the top rail (main: 8 frames, 7.1 cm). You lean out past the wall's
  top to work the rope; most likely the shoulder is then so near the rail that turning the elbow can't take the upper arm clear.
  From your eye the worst frame reads as the arm over the rail. The fix is the authored haul clip above, or a lean
  that stops the shoulders short of the rail while the hands go over.
- **Open (15 Nov): the strike, in `tools/arm-steady.mjs`.** The rod's middle moves fastest in the frame after the
  strike, and how fast varies from run to run on the same build: 72 to 139 mm in a frame over 7 runs of this branch's
  last commits (over the check's 100 mm in 4), 77 to 84 mm in 3 runs of the commits before 15 November's landing work. The
  code changed in between runs only on the drop net's rope and for the ray, not at a bass's strike, so the likeliest
  cause is timing (the film clock is exact, but pictures and models arrive in real time). Not settled: needs a run
  that loads everything before the catch starts, then the strike's sweep (about 6 frames, up to 9 cm a frame) judged
  on its own.

### 2. Skin and fingers close up
- **Was wrong:** the hands were one flat colour with no creases, knuckles or nails; at dusk they read as a pale model.
- **Done (14 Nov):** maps baked from the rig itself (`source-assets/hands/bake_hand_maps.py`, no outside textures; three
  1024 maps, 77 KB in all): fine wrinkles across the back of each finger joint, a firm crease on the palm side, nails
  (paler, glossier, a lighter free edge), redder knuckles and fingertip pads. Laid over the skin as a multiplier, so the
  player's skin colour stays theirs. Subtle at arm's length, as it should be.
- **Since:** the palm's own creases (under the fingers, across the middle, round the ball of the thumb) and a few faint
  veins over the back of the hand. Wrist creases were tried and taken out (15 Nov): the wrist is its own small,
  squeezed patch of the map, and two faint creases there came out as one dark broken line, a scar across the wrist in
  the cast. The skin's patches of colour are now worked out from the skin at rest, so they stay on it as the arm
  moves (they were worked out after skinning, and the arm slid through them). In rain your skin and coat wet through
  in about a minute, glossier and a little darker, and dry over a few once it stops.
- **Still to do:** a little hair on the forearm and the back of the hand. **Check:** close-ups of the hold
  and the look at a fish, same frames.

### 3. Frame-time stability on a phone
- **Wrong:** a 1,551 ms frame lowering a thornback ray back (Ultra, 1.5x) with only 6 ms of the game's code and no
  shaders or textures; the cause isn't the game's code (profiled here: nothing heavy on the page at release).
- **Why:** unknown: the graphics card (a heavy view straight down at the net and splash at Ultra), the browser, or the
  page paused for a screenshot.
- **Target:** a steady 60 on PC, 30 to 60 on a phone with no hitch over 100 ms in a catch.
- **Do:** (done here) the FPS display now says whether the page was busy, the graphics card or browser held it up, the
  page was hidden or the resolution changed; then fix what it names. Measure the software renderer's cost per frame
  through a release (`step_cost.mjs`) to find any view many times heavier than the rest.
- **Found (14 Nov, software renderer, Medium, a ray landed and put back):** the coming fish and net were readied all
  at once mid-landing, 7.2 s on the page there; now in the background (worst frame 3.6 s there, which can't build
  shaders in parallel; off the page where the browser can). The other slow frames, at the look and the release, had
  no warm-up and no new shader, and fell at different moments in each of four runs: the software renderer building its
  own pipelines, most likely, which says nothing certain about a phone. The phone's worst-frame line is the next
  evidence.
- **Benefit:** no freezes at the best moment of a catch.
- **Cost:** a 50 ms timer for the measure.
- **Check:** Aaron's phone recordings with the new line; `tools/phase-probe.mjs` counts.

### 4. The water by the pier
- **Already in:** an FFT sea with whitecaps and lingering foam streaks (`fftSea.js`), foam washing against walls,
  piers and banks from each place's shore map (`shoreMap.js`, `environment.js`), ripples, reflections.
- **To check first, at eye level against photographs of the pier:** whether the wash against the piles reads at the
  distance you see it from the deck, how the water's colour changes with depth by the wall, and how the near water
  looks looking straight down (where the drop net goes in).
- **Do:** only what that inspection finds missing. **Check:** the fixed scenes (`tools/scenes.mjs`) before and after.
- **Looked at (15 Nov):** the white specks on the water looking down over the rail after a cast. They are the sun's
  glitter on the chop's facets, there only when the sun is ahead of you: with the camera put where a facet need lean
  only 13 degrees to send the sun to it, the water there is covered in them, as real water is. Glints are now only
  drawn where a facet would lean no further than a wind sea's slopes do (15 to 25 degrees, more in more wind).
  Nothing else to change there.

### 5. The pier at eye level
- **Already in:** photographed concrete for the deck (with worn patches), rust and weed on the wall, weathering drawn
  on the railings, lamp columns and furniture (`textures3d.js`).
- **To check first:** the deck and railings at the fishing spot from standing height against photographs: tiling,
  wear at the railing feet and joints, what lies on a working pier's deck.
- **Do:** what that finds: wear masks, a few decals, a second deck texture blended in. **Cost:** decals as a few
  instanced quads. **Check:** before and after at the fishing spot, the same camera.

### 6. Tackle around you
- **Wrong:** the tripod, seat box, bucket and unhooking mat are made by code (simple shapes, drawn textures). The mat's
  quilting read as a green pyramid pattern looking down: redrawn 14 November as padded, stitched diamonds.
- **Do:** model them in Blender (tripod with screw legs and rest heads, seat box, bucket, mat with real quilting and a
  ruler), PBR textures at 512 to 1k, one LOD each. **Cost:** modest triangles, replaces the code shapes.
- **Check:** close-ups at the landing, looking down.
- **Done (15 Nov):** the tripod's leg locks have their levers and its head the hook sea tripods carry for a bag or a
  weight.
- **Done (14 Nov), the tripod's fit:** the rod lies in the cradle and comes out of it without going through anything
  (`tools/tripod-check.mjs`). The shapes themselves are still made by code.

### 7. Fish models
- **Was wrong:** six species have Blender bodies (bass, cod, mackerel, plaice, pollack, whiting); the rest are lofted
  from FishDock's own picture of them. The conger and the eel are drawn curled, so theirs came out as deep as the whole
  curl, a third of the fish's length at the tail, with the curl painted over it.
- **Done (14 Nov):** straight pictures of both made from their own (sampled along the spine:
  `source-assets/fish-straight/straighten.py`) and modelled in Blender from them like the others
  (`source-assets/blender/build_eels.py`, `eels.glb`, about 5,200 triangles each).
- **Done (14 Nov):** the other fourteen species with a cut-out picture modelled in Blender the same way
  (`source-assets/blender/build_fish2.py`, `public/models/fish2/`, one file each so only the fish hooked is fetched):
  ballan wrasse, black bream, coalfish, dab, flounder, garfish, gurnard, lesser spotted dogfish, pouting, smoothhound,
  sole, thick-lipped mullet, thornback ray and tope. Close up the difference is modest (a rounder body, eyes standing
  proud), as the lofted ones were already shaped by the same pictures.
- **Done (15 Nov), the thornback ray (`fishRay.js`):** its lofted back was an even lens and its tail a flat strip a few
  millimetres thick. Shaped when it loads: a hump along the spine with the wings thinning away from it, a flatter belly,
  the body running into a round tail, and the thorns a thornback has: a row of pale hooked thorns down the middle of the
  back and tail, a row down each side of the tail and ten bucklers on the disc, part of its own mesh so they bend with
  it. Other rays drawn from its picture get the back and tail, not the thorns.
- **Done (15 Nov):** the plain stand-in shown before a fish's picture is ready is a mid tone of its colours, not pale
  grey (a cod coming up to the net in the first moments read as a white plastic fish).
- **Still to look at:** the perch has no cut-out picture. **Check:** a ray and a dogfish landed and looked at
  (`conger_look`), before and after.

### 8. Sound
- **Wrong:** every sound is made by synthesis in the browser; waves, gulls, reel clicks and drag sound synthetic.
- **Do:** licensed field recordings (CC0 checked per file, or Aaron's own): waves on a pier, gulls, a fixed-spool
  reel's clicks and drag, rope and net. Needs the PC link to download. **Check:** listen on the phone.

### 9. Fishing gameplay
- **Was wrong:** the rod already showed each species' bite (knocks then a pull for cod, a rattle for whiting), but the
  strike went by one rule for every fish. **Done (14 Nov):** strike on the pull, not the knock (`bitePlan`), the Strike
  button saying where the bite is and marking the moment in green.
  **Done (14 Nov):** a slack-liner now and then from a strong biter (the tip springs back as the fish swims towards
  you, then the line tightens; the Strike button says to wait for it).
- **Still to do:** bites by tide and time of day per place where the sources say so. **Check:** `tests/bite.test.js`
  and play.

### 10. New places
- **Wrong:** Gorleston South Pier is the only place built to this standard.
- **Do:** research first (the brief's candidates: Cromer Pier, Lowestoft, Great Yarmouth, the Broads); build a small,
  accurate section of one before more. Reuses the place pipeline (`realPlace.js`, `osmPlace.js`). **Check:** against
  photographs (`docs/GORLESTON-VALIDATION.md` is the pattern).

## Done (with evidence)

| Date | What | Evidence |
|---|---|---|
| 14 Nov | Stalls at the cast and looking round: things arriving after start-up readied under the loading screen | `docs/STUTTER-DIAGNOSIS.md` §6 (12 shaders and 16 textures at the cast on main, none after) |
| 14 Nov | Hand in the rail on the drop net's rope | railing test: 6 frames up to 6.3 cm on main, none after |
| 14 Nov | The Reel button as the reel; rhythm, holding, pauses | `tests/reelModel.test.js`; before and after of every state |
| 14 Nov | The jacket's lining left out (rings round the forearm) | drop-net film before and after; `tests/fpRig.test.js` |
| 14 Nov | Cast, Strike and the side buttons as one set with the reel; Strike's bite clock; the cast's distance | phone-width screenshots before and after |
| 14 Nov | The worst-frame line says where the time went | `tests/frameReport.test.js` |
| 14 Nov | Strike on the pull, not the knock; the Strike button shows where the bite is | `tests/bite.test.js`; screenshots of each stage |
| 14 Nov | The game updates itself between catches (no more old copies) | by hand: the update check in `src/main.jsx` |
| 14 Nov | The unhooking mat as padded, stitched quilting instead of pyramids | before and after of the texture and the mat in the catch film |
| 14 Nov | Slack-liners: the tip springs back, then the line tightens, and Strike waits for it | `tests/bite.test.js` |
| 14 Nov | Looking down, the jacket's body is left out (no ragged flaps across the bottom of the picture) | drop-net film before and after; `tests/fpRig.test.js` |
| 14 Nov | The drop net's rope: the left hand no longer flicks 4 cm every frame between two grips; an arm put away comes up from your side instead of appearing mid-picture | `tools/arm-steady.mjs` (rope flicks 258 to 0 in the logged landing, 5 in the test's own); frame log of a 77 cm ray |
| 14 Nov | A new fish and net readied in the background, not all at once mid-landing | film warm-up timing: 7.2 s on the page in software before, worst frame 3.6 s after |
| 14 Nov | The conger and the eel as long bodies (Blender, from straightened pictures) | the conger in the net and in the hands, before and after |
| 14 Nov | Hands on the drop net's hoop at a hand's pace; a fish swung in taken once within reach | frame logs of a 77 cm ray and a 44 cm bass; `tools/arm-steady.mjs` |
| 14 Nov | Knuckle creases, nails and fingertip pads on your hands | close-ups of the hold before and after; `tests/fpRig.test.js` (the hands' uvs) |
| 14 Nov | The rod in its tripod: the cradle square to the rod (it went 7.3 mm through its rubber), the head's bar under it, still in its rest (it swayed 4 cm in a breeze), lifted out of the cup and the cradle; the front feet clear of the railing; bank sticks with rest heads | `tools/tripod-check.mjs`; `tests/tripod.test.js` |
| 14 Nov | Camera: the fish kept in view while you lay the rod on the rail (first person); the net set down and the fish on the deck shot with the railing behind you, not across you (third person) | `tools/landing-view.mjs` (rod on the rail: fish seen 14% of the time before, 100% after); before and after pictures |
| 14 Nov | The rod no longer jumps: laid on the rail to land a ray (1.2 m in a frame: its easing had been switched off since 13 Nov), brought up to land (47 cm), the strike (17 to 49 cm) | `tools/arm-steady.mjs` (now watches the rod too: 79 mm at most outside the cast) |
| 15 Nov | The pier wall's rust no longer repeats pan by pan (a second, shifted copy blended in in slow patches) | the wall from the water, before and after |
| 15 Nov | Rows of white dots along the far railings (on the pier wall seen from the water, and over you seen close): the weathering's relief came out as not a number on the thin rails' ends | the bright pixels in that patch of the wall: 41 before, 0 after; 0 with the rails hidden |
| 15 Nov | Your line's glint as one soft thread instead of evenly spaced white dashes | the line from where it glints, 6 m and 18 m off, before and after |
| 15 Nov | Faint wrist creases (they read as a scar across the forearm close up in the cast) | the cast's frame 48, before and after |
| 15 Nov | The "bare right forearm" was the hand seen edge on from 25 cm; the cuff's sawtooth edge made whole (the hem's half-squares kept when the lining is left out); the wrist creases taken out (still a scar) | bone paint and the cast's frame 48, before and after; `tests/fpRig.test.js` |
| 15 Nov | Skin patches stay on the skin as the arm moves | `tests/fpRig.test.js` (taken before skinning) |
| 15 Nov | Your arms wet in the rain: skin and coat glossier and darker, wet through in a minute, dry over a few | the coat's roughness 0.80 dry, 0.44 after 90 s of rain; the cast in rain at the start and after; `tests/fpRig.test.js` |
| 15 Nov | Looking down at the drop net, the sleeve near your eye no longer a screen of dots (the cut's dither band 5 cm to 1.2 cm; the cast unchanged) | the landing and the cast's frame 48 with the band as it was, hard and 1.2 cm; `tests/fpRig.test.js` |
| 15 Nov | Your head torch shines from your head in third person (it came from the camera and lit the railing beside it red), and not at all by day | third person at night, torch off, white and red, and red by day, before and after; `tests/nightKit.test.js` |
| 15 Nov | Splash drops drawn as clear streaks along their path, not near-solid white discs (the net coming up stood in a halo of snow) | the net coming out of the water, before and after; `tests/rockSpray.test.js` |
| 15 Nov | A wet patch on the deck where your dripping net and your fish are put down: darker, a satin sheen, a ragged edge; half dry in two minutes, gone in ten | third person, the net down, 6 s and 4 min later; `tests/wetLook.test.js` |
| 15 Nov | Hauling the drop net in first person: your hands at arm's length on the rope (58 cm along your sight, not 46), so the elbows sit out past the shoulders (35 to 44 cm from the eye, not 25) and the sleeves aren't cut open in front of you or the forearms bunched up under your eye; the trousers below the knee left out looking down (scraps of navy along the bottom) | the haul at 34, 42, 46 and 50 frames, before and after, with each joint's distance from the eye; `tests/fpRig.test.js` |
| 15 Nov | The drop net's landing: fewer frames with an arm into the top rail (8 on main, now 3; the right upper arm about 7 cm in on both, measured with the arm as a 5 cm tube and the rail 2.6 cm): where the elbow's eased turn would put the upper arm or forearm into the rail, it is turned clear by the least turn that does it, followed at up to 14 radians a second (turned at once, the forearm snapped 21 cm in a frame); each hand kept 7 cm off the rail; the rope kept at arm's length (lifting the hands to clear the rail brought the sleeves back into the camera) | `tools/rail-test.mjs dropnet` on main and after (3 frames, 6.7 to 7.3 cm over runs; the worst frame's picture reads as the arm over the rail from your eye); `tools/arm-steady.mjs` (rope: 1 flick, 83 to 92 mm at most) |
| 15 Nov | The thornback ray's hump, round tail and thorns; the stand-in fish's colour; the tripod's levers and hook | the ray landed and held up, on the mat from above and the side; `tests/fishRay.test.js` |
| 15 Nov | A fish's size eased over a third of a second when its modelled shape comes in mid-fight, and a thornback's thorns left out of it (counted, the ray came in half as thick again and the fish, line and rod jumped 13 cm) | found in `tools/arm-steady.mjs`'s frame log of the ray (10 to 13 cm in a frame as its model came in); not yet measured on its own after |
| 16 Nov | Your fishing chair: a levelling chair behind where you stand (black tube frame, legs slid out on mud feet, olive cushions quilted in channels, the back leaning back), and you sit in it once the cast has settled and the rod is in its rest, leaning back, hands on your thighs or arms folded, feet on the deck; you lean forwards and get up when a bite comes, to reel in, or to walk off. First person, your eye goes 38 cm lower and back over the chair. Settings: Sit while you wait (on). The bait bucket moved beside the seat box, clear of the chair's legs | third person from the front, side, behind and above; sitting down and getting up in frames; first person sitting and at the bite; a pier and a river bank; `tests/chair.test.js` |
| 16 Nov | Your fingers kept out of what they hold in first person: holding the reel seat, the index finger lay 4.2 mm inside the lock nut with the far blue trim through it and the thumb 2.4 mm in (as Aaron's screenshot showed); now each finger opens a few degrees at the joint nearest its tip that can lift it, its outer joints curling back so it still wraps the handle, and none of the skin is in the metal. The same for the reel's knob (the beach reel's, 1.3 times the size, was 3 mm into the fingers). Worked out once while the hand holds still, once per few degrees of the knob while winding (0.05 ms a frame on a desktop) | measured against rodkit.glb's handle and knob, skinned as drawn; close-ups from above and the side before and after; `tests/fpRig.test.js` |
| 16 Nov | The pier's lamp posts: a modern LED street light (a tapered galvanised pole into a swan-neck bracket, a slim lantern lit only at its lens, bright enough to bloom), not a plain pole with a glowing grey brick on top; a soft pool of lamplight on the deck under every lamp after dark (one draw for all of them), so the pier reads lit along its length, not only round the anglers; the lights near the anglers now come from the lantern, a little beyond its lens | close-ups and along the pier by day, at dusk and at night, before and after; `tests/lamps3d.test.js` |
| 16 Nov | The sky's clouds: the cloud layer's field was so coarse that the whole sky overhead fell inside one patch of it, and the cover threshold was set high, so 45 per cent cover drew a cloudless sky above 30 degrees with a few clouds on the horizon (measured: 0.1 per cent of the sky looking up at 35 degrees, at every cover up to 60). Now heaps of cumulus come out overhead too, as much cloud as the cover says (15, 36, 46 and 51 per cent of that view at 15, 30, 45 and 60), shaded underneath, drifting at the speed they did, the same cost | looking up and out to sea before and after at five covers; the field worked out in JavaScript from the shader's own numbers, `tests/sky.test.js` |
| 16 Nov | Lamp posts placed once and not glowing: at the pier head's bend two pairs of lamp posts stood 11 and 27 cm apart (double lanterns lighting each other's poles), and two mooring rings and a bollard were doubled, as the walk along the walls passed a mark twice at each corner; now nothing is placed within 3 m of another of its kind (25 columns to 23, 43 rings to 41, 23 bollards to 22, nothing else changed). A lantern's light from steeply above reaches its own pole at 15 per cent (the upper pole was several times as bright as the deck under the lamp, a cream tube at dusk and at night). The rock armour beyond the sun's shadow reach drawn with 80 facets, not 320 (third person at the default spot, Balanced: 890k to 733k triangles a frame, the same draws) | `tests/lamps3d.test.js`, `tests/placedApart.test.js`; Gorleston counted before and after; lamp and breakwater renders before and after |
| 16 Nov | The pier stays wet after rain: the deck and beach dried the moment the rain stopped; now the last hours' rain from the live forecast keeps them wet a while (each finished hour's rain counted less the longer ago it fell, halving about every 1.4 hours, a rough guide), with no rings in the puddles once the rain has stopped (deck brightness 134 dry, 120 a while after a millimetre, 100 in rain). The moon drawn with its phase (lit on the sun's side by as much of the disc as the phase lights; a half moon was a full disc at half the brightness, and stars showed through it), its seas placed by their selenographic positions, Tycho, earthshine on the dark part, warmer and dimmer low down, a crisper edge | `tests/groundWet.test.js`; the deck dry, after rain and in rain; the moon full, half and crescent before and after |
| 16 Nov | From Aaron's recording and review: running with the rod it flailed round the screen (a 3.6 m rod carried at 36 degrees swung rigidly with a body turning at a run, its tip at up to 19 m/s); now held near upright at a run, raised through a turn and coming round after the body (peak tip sweep 14.4/18.9/14.6 m/s sprinting left/right/back on main, 7.7/12.7/9.9 now). Putting a small fish back by hand it hung in the air 0.6 to 0.7 m beyond your hands (held 40 to 60 cm past the rail while you knelt by the mat); now you stand, step to the rail, hold it out over the water in your right hand closed round it and let it go (the hand reaches 0.99 of 1.00 m out). A small fish looked at is gripped behind the gills, not laid on two open palms. The drop net's rope lies coiled on the deck and stays on the net while it waits, its cords flat (+4 draws, +5k triangles) | the rod's tip measured per frame on the film clock; the hands' targets against where they got to; release films third and first person; `tools/walk-check.mjs` all pass |
| 16 Nov | The town at Gorleston: walking off the pier into the town put you among buildings that are photographs taken from the pier 250 m and more away, flat and smeared close to (from the Pier Hotel's foot it was a smudge). You now walk the length of the pier as far as its root at the quay (x -95), where the photographs still hold up; the info note says so. The photographs' last faults put right (source-assets/backdrop_tidy.py, nothing added): the evening sky seen through a bare tree's twigs, lifted to a white cloud on the roofs, is now see-through; the last lit lamp on the cliff path and the north bank's lit street lamps are painted out by day (they light up after dark on their own sheets). The photographs are at their full resolution already and no sharper ones from the pier exist on Wikimedia Commons; a panorama taken on the pier would sharpen the town further. | The walk map, and a sprint along the pier (stops at x -95 and slides along the line); views towards the town from five points along the pier; both photographs before and after through a narrow lens in the game; `tools/walk-check.mjs` |
| 18 Nov | The dark blotches on the water below the pier: old stains painted on the deck round each fishing spot, placed in any direction up to 3.3 m from it, so about half hung out past the wall at the deck's height. Each stain now lies wholly on the deck, at its own level | found on Aaron's PC by hiding each of the scene's 173 parts in turn in a frozen view with the antialiasing off (h108); the same view after, with and without the water (h110) |
| 18 Nov | Hauling the drop net in first person: the elbows no longer winged up 120 degrees or swinging round the arm every few pulls. The rope grip and the elbow's turn are chosen together (they were fitted to each other in turn, frame by frame), an elbow's eased pointing no longer freezes on a big change (the turn towards it was worked out after the old value was overwritten), and the rope's top sits nearer your middle | arms measured every 100 ms through the haul on the PC before (h107) and after (h110, h112); `tests/fpRig.test.js` (hauling hand over hand: fails on the old code) |
| 18 Nov | Bringing the drop net in over the rail in first person (and the empty net back after letting a fish go), your hands stay on the rope: they let go as it came out of reach, and the net came over by itself | h112 frames |
| 18 Nov | Walking off in first person: the camera stays at your eyes from the first step (a glide from where you stood left it behind you for half a second, the back of your own jacket filling the picture), follows your eyes as you lean into a stride and sits at each person's own eye height; the rod is carried upright by your side, out of view (carried tip first it came up from the bottom of the view with no hand on it) | h126 live check; h133 footage, man and woman |
| 18 Nov | First-person sleeves looking down: drawn whole to the edges of the picture and cut crisply only right by the eye, two-sided past the cut (faded over the elbow and dissolving into dots near the eye, they looked as if melting; kept whole but one-sided, an arm crossing in front putting a fish back showed as a black fin). Chosen from four treatments filmed on the PC | h131, h136, h142 |
| 18 Nov | Loading: every shader handed to the driver together while a place loads and nothing drawn until they are built (192 to 224 programs, built one at a time as first used: 21 s of the first visit on the PC); people's light models first, their detailed ones swapped in after (the 8.4 MB detailed fisherman held the loading screen to its 25 s limit); the scene check's rays against a grid of nearby triangles (1.7 s); both animation files asked for at once. First visit to Gorleston on the PC, local server, back to back: shown at 35.3 and 34.6 s before, 15.7 and 17.4 s after; the page stood still 31.8 and 31.2 s before, 14.7 and 11.4 s after | h129, h134, h137, h140 |
| 18 Nov | Cromer Pier rebuilt (localDetail.js, openPier.js, landmarksCromer.js): an open Victorian pier, a plank deck on braced iron columns over the sea, white railings with benches, double lanterns, glazed shelters, the gate kiosks, the Pavilion Theatre, the lifeboat station and its slipway (not walkable), the Hotel de Paris and the church tower on a 12 m cliff behind the promenade; anglers either side of the main arm. It was a solid block on the water with a shed for a pavilion | h125 audit; h139, h141, h143 footage; tests/cromerPier.test.js |
| 18 Nov | Loading on a slower line: the people's files, the rod and the nets asked for before the world is built (they were asked for after it, 7 s in); the sound's recordings and the people's detailed files held until the place is shown (they shared the line with what the loading screen waits for). On the PC with the line held to 20 Mbit/s, fresh profiles, alternately: shown at 25.7, 24.3 and 23.7 s before (Gorleston, Cromer, Gorleston), 21.0, 20.4 and 20.2 s after. A first visit still fetches about 34 MB | h146, h148, h152 |
| 18 Nov | Great Yarmouth's beach, a new mark (spots-more.js, localDetail.js, landmarksYarmouth.js): Britannia Pier open on its legs, its theatre, sheds, entrance and stalls modelled from photographs; the beach rising from the water, steeper where the waves run up, its sand from photographs, wet below the last waves; the anglers on the sand facing the sea | h147 map data; h151 photographs; h154, h155 footage on the PC; tests/greatYarmouth.test.js |
| 18 Nov | The surf on real beaches (environment.js, shoreMap.js beachNearest): waves square to the shore, steepening and breaking at a line further out the bigger the swell, white water running up the sand and draining back, the open sea's waves dying down over the last few metres. Before, a real beach had no shore foam at all (its shore map wasn't built) | h154, h155 footage |
| 18 Nov | A mark's own type decides its venue before its name: eight marks were opening as the wrong kind of place (Great Yarmouth's beach "by Britannia Pier", Rossall Point, the Isle of Sheppey shore and Penbryn as piers; three estuary marks as a beach or a pier; Ballycastle's rocks as a beach) | tests/greatYarmouth.test.js |
