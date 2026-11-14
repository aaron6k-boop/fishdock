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

### 2. Skin and fingers close up
- **Was wrong:** the hands were one flat colour with no creases, knuckles or nails; at dusk they read as a pale model.
- **Done (14 Nov):** maps baked from the rig itself (`source-assets/hands/bake_hand_maps.py`, no outside textures; three
  1024 maps, 77 KB in all): fine wrinkles across the back of each finger joint, a firm crease on the palm side, nails
  (paler, glossier, a lighter free edge), redder knuckles and fingertip pads. Laid over the skin as a multiplier, so the
  player's skin colour stays theirs. Subtle at arm's length, as it should be.
- **Still to do:** the palm's own creases (heart, head and life lines), veins on the back of the hand, a little hair on
  the forearm, a slightly sweaty sheen in the cold. **Check:** close-ups of the hold and the look at a fish, same frames.

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
- **Still to look at:** the perch has no cut-out picture; a ray with a properly raised back and thorns along its tail
  would want modelling by hand rather than lofting. **Check:** a ray and a dogfish landed and looked at
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
