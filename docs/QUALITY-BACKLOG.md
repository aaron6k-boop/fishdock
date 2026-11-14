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
- **Do:** (done here) drop the lining when the rig is built; (next, needs Blender on the PC) author the haul and
  lowering as clips on the rig, hands off the eye line, fingers wrapped round the rope, IK for the rope contact.
- **Benefit:** the drop net, the moment of every pier catch, stops looking broken.
- **Cost:** the lining drop removes 39% of the jacket's triangles (cheaper); clips cost nothing per frame.
- **Check:** the fixed drop-net film (`haul_frames`) before and after; `tools/rail-test.mjs dropnet`; `tools/arm-steady.mjs`.

### 2. Skin and fingers close up
- **Wrong:** the hands are one flat colour with no creases, knuckles or nails; at dusk they read as a pale model.
- **Why:** no skin textures at all (the material is a plain colour); the warm light round shadow edges and the tone
  variation (done 14 November) help but can't make creases.
- **Target:** visible knuckle creases, nails, slight redness at the knuckles and fingertips, a soft sheen.
- **Do:** bake an albedo, normal and roughness map (1024 px) for the Human Base Mesh hands in Blender, from its own UVs.
- **Benefit:** the biggest thing on screen through every cast and fight.
- **Cost:** three 1k textures (~1.5 MB of memory with compression), no extra draws.
- **Check:** close-ups of the hold and the look at the fish from the same film frames.

### 3. Frame-time stability on a phone
- **Wrong:** a 1,551 ms frame lowering a thornback ray back (Ultra, 1.5x) with only 6 ms of the game's code and no
  shaders or textures; the cause isn't the game's code (profiled here: nothing heavy on the page at release).
- **Why:** unknown: the graphics card (a heavy view straight down at the net and splash at Ultra), the browser, or the
  page paused for a screenshot.
- **Target:** a steady 60 on PC, 30 to 60 on a phone with no hitch over 100 ms in a catch.
- **Do:** (done here) the FPS display now says whether the page was busy, the graphics card or browser held it up, the
  page was hidden or the resolution changed; then fix what it names. Measure the software renderer's cost per frame
  through a release (`step_cost.mjs`) to find any view many times heavier than the rest.
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

### 7. Fish models
- **Wrong:** six species have their own bodies (bass, cod, mackerel, plaice, pollack, whiting); rays, dogfish, conger
  and others use simpler shapes, though they're among the commonest pier catches.
- **Do:** model a thornback ray, a lesser spotted dogfish and a conger in Blender from references (wet materials as the
  others). **Cost:** ~5k triangles each, loaded when that fish is on. **Check:** the look at each fish.

### 8. Sound
- **Wrong:** every sound is made by synthesis in the browser; waves, gulls, reel clicks and drag sound synthetic.
- **Do:** licensed field recordings (CC0 checked per file, or Aaron's own): waves on a pier, gulls, a fixed-spool
  reel's clicks and drag, rope and net. Needs the PC link to download. **Check:** listen on the phone.

### 9. Fishing gameplay
- **Was wrong:** the rod already showed each species' bite (knocks then a pull for cod, a rattle for whiting), but the
  strike went by one rule for every fish. **Done (14 Nov):** strike on the pull, not the knock (`bitePlan`), the Strike
  button saying where the bite is and marking the moment in green.
- **Still to do:** a slack-liner (a fish swimming towards you: the line falls slack, wind down then strike); bites by
  tide and time of day per place where the sources say so. **Check:** `tests/bite.test.js` and play.

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
