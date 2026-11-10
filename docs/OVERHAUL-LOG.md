# The Gorleston overhaul: stage log

One entry per stage, with what was wrong, what changed, how it was checked and what is left. Pictures and footage
are sent in the conversation and attached to the pull request; the regression pictures come from `tools/scenes.mjs`.

## Stage 1 (9 November 2026, branch `overhaul-gorleston`, PR #72)

**Place.** The pier's footprint, head and lookout were measured against aerial imagery and photographs
(`docs/GORLESTON-VALIDATION.md`): arm 21 m against 23 m real, head 39 m against 41 m, lookout 15 × 6.5 m against
13 × 6.7 m. No rebuild needed; the south-side apron is the one missing piece, and the deck's freeboard is unmeasured.

**Sea (Ultra).** The wind sea from a JONSWAP spectrum, inverse FFT on the graphics card (`src/lib/world3d/fftSea.js`),
two cascades, Gerstner chop, whitecaps from the Jacobian with foam that lingers. Checked by a CPU DFT of the transform
(error 7e-14), by reading the maps back at 18, 34 and 45 kph (heights ±0.45, ±1.0, ±1.2 m; Jacobian below 0.7 on 0.5%,
4% and 5.6% of the surface), and by eye at 8, 18 and 34 kph against the old sea from the same camera. The sine-train
swell stays underneath and on the CPU for the float, fish and net.

**People.** Third person at a pier rail while waiting now holds the rod on the rail as first person does; the fight's
rod angle 54° → 47°. Probe: both hands at the reel seat's station (0.457 m along the rod), wrists 9 cm off it.

**Tools.** `tools/scenes.mjs` (the ten fixed scenes), `benchrun`-style checks for the benchmark, a sea debug view.

**Measured performance.** None yet: no graphics card here. To be taken on the PC with the Graphics panel's benchmark at
1080p, 1440p and 4K, Ultra with Sea: Waves and Sea: Spectrum, and added here.

**Left.** Foam fractions tuned by eye; the far glitter is a sheen; the swell trains' crossing pattern; the fight pose is
procedural; the lookout's roof equipment; the south apron; cascaded shadows; the dune (branch `graphics-2`).

## Stage 2a (9 November 2026, branch `overhaul-2`, PR #73)

**Sea against the wall.** A 6 m band at any wall where the surface heaves up to 1.45 times (a wave coming back off
a vertical wall) and the crests' horizontal pinch dies out; spray bursts up and back over the wall when a crest tops
a mark set by the swell (your own angler on a pier, three points along the wall, at most every 1.6 s each, only once
the sea is up). Filmed at 38 kph in first person.

**Fix.** The anglers' CPU wave takes the chop share the shader uses under the spectrum sea (stage 1 added it to
`waveState()` and the angler dropped it), so the float sits on the drawn water at Ultra.

**Whitecaps against measurement.** Monahan and O'Muircheartaigh's whitecap fraction, W = 3.84e-6 U^3.41, gives
0.009% at 5 m/s, 0.8% at 9.4 m/s and 2.1% at 12.5 m/s. The spectrum sea's fold fraction (Jacobian below 0.7, with the
foam steepness factor 2.6) reads 0.5%, 4% and 5.6% at the same winds; the wind gate, the edge noise and the break-up
noise bring the drawn cover to roughly a third of that, so the drawn whitecaps are in the right order at a fresh
breeze and a little generous at a light one. Tuned by eye beyond that; no photograph of the real sea at Gorleston
at a known wind was available to compare against.

## Stage 3 (9 November 2026, branch `overhaul-3`)

**Survey.** The ten scenes and six close views of the town from the pier and the gardens, against photographs of
Marine Parade and Pier Gardens. The largest visual gap after the sea was the town itself: every building a flat box
with a painted window pattern, roofs a single flat colour, no trees on the 2.2 ha of lawns and gardens the map has in the box
(Pier Gardens and the cliff lawns) nor on the cliff bank.

**Facades** (`textures3d.js: facade()`). Each wall kind drawn at 85 px a metre, with a
height field beside the colour so the normal map and the roughness map come from the same drawing: brick in 65 mm
courses, stretcher bond with dark headers; ashlar; cladding; render with trowel sweeps. Five bays a strip (window,
wide window, door, shop, plain) picked per storey and bay by the building's style and a seeded choice. Windows are
sashes set back 12 mm into a reveal, with a box frame, a sill that stands out, a soldier arch or lintel, and glass
that is smooth (roughness 0.06, metalness up) under a sky gradient and curtains, so it reflects the sky and the sun
where the wall around it does not. Doors have a case, fanlight, panels, step and number plate. Shops a fascia,
pilasters and a stall riser. Plain bays carry a downpipe and an air brick. Weathering: streaks under sills and from
the eaves, dirt at the foot, lighter on render.

**Roofs** (`textures3d.js: roof()`). Slates in 0.5 × 0.25 m courses with tone and twist, a lap shadow and moss;
pantiles in an S-profile at 0.34 m, 0.3 m courses; felt. Normal and roughness maps as the facades. Ridge tiles along
each ridge line.

**Trees** (`trees3d.js`). Placed on the map's grass cells (parks and verges from OpenStreetMap landuse) and on the
cliff's grassy bank, never on a road, a building, the pier or within 20 m of a fishing spot; 7 to 12 m in the parks,
3 to 5.5 m on verges and the bank; three crossed planes with a drawn canopy, normals up so they light as a mass,
instanced, casting shadows. Count by quality (Ultra all, Balanced three quarters, Performance under half).

**Sea colour.** The sunny shallows moved off teal: shallow tint and crest light toward grey-green.

**Checked.** `node --test` 313 passing; the ten scenes before (main 65d3fb4) and after, and close town views, sent
with the PR. Nothing here was measured on a graphics card: the trees are one instanced draw and the facades are the
same draw count as before with two more texture reads a pixel, so the cost should be small, but that is a claim to
test on the PC, not a number.

**Left.** The buildings are still generic Gorleston (the right heights, footprints and roof shapes from the map and
the right materials for the street, not the actual elevations); the Coastwatch building is already photograph-based.
Chimneys stand but have no pots. Shop fronts have no signs. Trees are cards, not models. Lighting audit, weather,
hands and rig, animations, equipment and the PC measurements are the following stages.
## Stage 4 (9 November 2026, branch `overhaul-4`): the light

**Audit.** The pier head and the deck at sun heights of 5, 15, 35, 38 and 55 degrees, overcast and a hazy low sun,
from four cameras (`tools/scenes.mjs` views and close ones), measured as well as looked at. Findings:
- Shadows in sun were faint. On a 35 degree day the deck in the Coastwatch building's shadow measured 0.31 of the
  sunlit deck beside it (display-linear luminance from the render). Outdoors it is about a fifth: a horizontal surface
  gets four to five times as much light from the sun as from the whole sky. The cause was the balance of the lights
  (sun 2.5 against sky 0.72 plus reflections 0.6) and a shadow strength of 0.85, which let 15% of the sun into every
  shadow.
- A 5 degree sun lit the deck almost as a noon one: the sky's light did not fall with the sun, so the deck's light was
  nearly all sky, flat and white, while the sky itself had gone gold.
- Shadows were being drawn correctly: a fresh white plane dropped into the scene showed the lamp post, a bench and a box
  as crisp shadows, so the maps, biases and receivers were right; they only read weakly on the pale concrete under
  the heavy fill.
- Wall spray flew round the angler at 16 kph of wind (a near-calm day): the threshold was swell plus half the wind
  above 0.5, which 16 kph reaches.

**Changes** (`skyLook.js`, `angler.js`): sun 3.4 against sky 0.5 and reflections 0.42 on a clear day; the shadow
strength 1 in sun (the sky alone fills it), 0.32 under cloud as before; the sky's light and the reflections fall by
up to two fifths as the sun gets low, and the exposure comes up a quarter to match the eye; overcast, rain, dusk and
night totals unchanged. Spray from a fresh breeze (about 24 kph) up.

**Measured.** The same deck patch: shadow 0.19 of lit (was 0.31); sunlit deck 0.38 (was 0.34). The 5 and 15 degree
renders show the bench's long shadow and warmer lit faces where before there was almost none. Overcast renders are
the same before and after. `tests/skyLook.test.js` pins the ratio (0.15 to 0.3 at 35 degrees) and the low-sun dimming.

**Left.** Cascaded shadow maps (the installed copy of three.js has no CSM addon and installs are off here), so the
one 4096 map at 80 m stays; shadows from the trees and the town are coarse at that distance. Specular on wet concrete
and the facades' glass were not re-tuned. Night and dusk looked at only through the ten scenes.

**Five conditions (after review).** The same deck view at midday (sun 55 degrees), sunset (3 degrees), overcast,
rain and moonless night, before and after, with the lit deck and the building's shadow read at fixed patches
(display-linear luminance; the patches are the same in every picture, so the sun's own angle moves what falls in
them and the ratios are a guide, not a law):

| condition | before: deck, shadow, ratio | after: deck, shadow, ratio |
|---|---|---|
| midday | 0.388, 0.177, 0.46 | 0.444, 0.175, 0.39 |
| sunset | 0.146, 0.085, 0.58 | 0.136, 0.080, 0.59 |
| overcast | 0.255, 0.167, 0.66 | 0.274, 0.183, 0.67 |
| rain | 0.156, 0.129, 0.82 | 0.157, 0.135, 0.86 |
| night | 0.078, 0.049, 0.63 | 0.074, 0.056, 0.76 |

The change bites only where it should: in sun. Shadows under cloud, in rain and at night keep their soft fill (the
shadow strength is 0.32 under cloud and the sky light rises with it), sunset is lifted by its exposure and reads the
same, and nothing is crushed: the darkest shadow patch in any condition is 0.049 (night, unchanged). Pictures in
`stage4-five-conditions.jpg`.
## Stage 5 (9 November 2026, branch `overhaul-5`): the land

**Finding.** Every piece of land the map did not mark as beach, grass, bank or dune was drawn as the pier's concrete,
slab joints and yellow lines included, from the quay out to the horizon: the town stood on one grey slab.

**Change** (`realPlace.js`). Land more than 26 m from a harbour wall and outside every pier and quay footprint is the
town's ground: worn grass over earth, duller and browner than a park's lawn, bare in patches, with a little of the
rough-ground photograph in it. The streets lay their own tarmac and pavements over it as before. Edge triangles stay
on the concrete side, tinted, so the join is a short fade and not a pale saw-edge (the first attempt had one).
Pavements: their end overlaps cut from 1.5 m to 0.6 m (they stuck out as teeth along a bending street) and a duller
tone.

**Checked.** Four views before and after from main 65d3fb4 (`stage5-land-before-after.jpg`); `node --test` 313 pass.
No unit test: the ground is built with the DOM and the map together.

**Left.** The large quay apron at the pier root is still one concrete sheet (it is a car park and a quay in reality,
but with no kerbs, bays or the Pavilion). The town ground is one tone everywhere: no hedges or garden walls between
plots, and it rises with the hill but has no banks between streets.

## Stage 6 (9 November 2026, branch `overhaul-6`, on top of stage 5): more of the map

**Finding.** The map round the pier has 115 footways, 37 flights of steps, 25 walls, 12 fences, 5 hedges, 4 car
parks, a wood, a garden and allotments, and none of it was drawn: only the streets, the buildings, the grass and the
beach. The quay apron at the pier root is a car park on the map.

**Change** (`osmPlace.js`, `realPlace.js`). Footpaths and cycleways as narrow paving (no kerbs); car parks as a
sheet of tarmac on the ground (no bays: their direction is not on the map, and I will not guess it); garden walls,
retaining walls, fences and hedges as runs of boxes along the map's lines at the map's height where it gives one
(1.4, 1.3 and 1.5 m otherwise), none within 25 m of a fishing spot, on a pier or in the water, nothing to collide
with (a player walks through a hedge rather than being caught in a garden). Tarmac lightened from 0x46484b to
0x7c7b78: at the old tone the car park measured (53, 64, 81) sRGB in sun, blue from the sky's reflection over a near-
black diffuse, where dry asphalt is a mid grey; now (84, 92, 104). Woods, gardens and allotments count as green
ground (the trees of stage 3 will stand close together in a wood once #74 is in; the hook is parsed here).

**Second pass (after review).** Asphalt of its own (`textures3d.js: asphalt()`): aggregate, worn chips, hairline
cracks, a repair patch, as colour, relief and roughness at 6 m a tile, its repeat broken by a 9 m mottle in the
material; the deck's concrete map is no longer used for tarmac. Kerbs have a face (road level up to the pavement's)
and a gully every 20 to 30 m against them. Garden walls are brick with a coping; fences are close-boarded panels
between posts. Steps are drawn from the map's `highway=steps` where the ground falls (17 cm risers), but the ground
model has no survey heights, only the town's modelled slope, so of 28 flights only one has a drop to draw: the rest
are flat on our ground and are left out rather than drawn as a ramp of fake risers. Lawns and the town's ground are
drawn turf (`turf()`: blades, worn patches, the odd daisy), the deck's relief taken out from under them (it read as a
weave).

**Checked.** Views of the car park, the street through it, the lawns (`stage6-roads-after.jpg`); `node --test`
313 pass.

**Left.** Car park bays (direction unknown); survey heights for the cliff's steps; walls in one brick.

## Integration (9 November 2026, branch `overhaul-all`, PR #78): the cost

Draw calls read from `renderer.info` for one frame of the pier-head view at Ultra, 1280 x 720, same procedure on
both builds (the sun and weather set, the camera placed, 600 ms stepped, one frame counted); shadows on, then off.

| build | calls | without the shadow pass | meshes drawn | shadow casters |
|---|---|---|---|---|
| production main | 1025 | 704 | 370 | 252 |
| integration, first cut | 1169 | 787 | 403 | 282 |
| integration, trees merged | 908 | 607 | 364 | 244 |

The first cut's increase was the trees: four species by three variants, wood and leaves apart, twenty-four meshes,
each drawn in the shadow, reflection, occlusion and main passes. Now the near trees' wood is one merged mesh (built
again only when the near set changes, at most twice a second) and every leaf cluster in the town is one instanced
mesh; both are culled by their own bounds and left out of the water's reflection pass (trees 200 m off add nothing a
player sees in the water), and a tree changes level with 12 m of hysteresis. The walls, fences, hedges, copings,
posts and steps are one mesh each. Geometry in memory 27.9 MB against 28.8; texture pixels 13.2 M against 24.0 M.
Frame times are not claimed: they need the PC (Settings, Graphics, Benchmark at 1080p, 1440p and 4K, Ultra and High),
and the numbers above are counts, not speed.

## Integration, second pass (9 November 2026): what the walkthrough recording showed

The first normal-speed recording (third person along the pier, then a cast, a fight, the landing, the fish held up
and put back, all in first person) was looked through frame by frame. What it showed, and what was done:

- **The rod stood with no hands on it for the first frames of a cast.** Taking a grip from nothing, the hands eased
  up from where they hang out of sight below the view, over 0.3 s. Now a grip taken from nothing starts its blend
  just under the grip, in both the simple and the real (MPFB) arms.
- **The forearm filled the right half of the picture at the top of the wind-up.** The rod went back to 2.05 rad,
  past upright, with the reel in front of the eye, so the butt, and the forearm along it, pointed down across the
  middle of the view. The wind-up now stops at 1.55 rad, the hands go out to the right rather than back towards
  the eye, the seat grip's wrist can bend 0.95 rad (was 0.6) so the forearm comes from the elbow out at the side,
  and the elbow is placed as if the rod pointed at least a little forward.
- **Both hands ran off the top of the picture when the drop net's rope was first taken.** Before the net is over
  the wall the hands were placed at a fixed offset below and ahead of the eye; looking steeply down at the net on
  the deck put that point at the top edge. They are now placed from the view's own axes: low and to the left of
  wherever you look.
- **Straight arms on the rope.** Once the net is over the wall the hands sat 0.72 m along the line of sight, at
  the arm's full reach; now 0.52 m, so the elbows bend.
- **Hard cuts into the landing shot.** The cut itself is kept (gliding there from your own eyes looked into dark
  water for two seconds), but the picture now comes up from black over 0.35 s on each cut (`uFade` on the grade
  pass), so it reads as a cut rather than a jump.
- **The third-person segment walked into the railing.** A fault of the filming script, not the game: it walked
  the way the angler faced, at the sea. It now turns west along the pier first.

Frame-by-frame checks of the cast's first 1.2 s and the landing are in the PR. Frame times are still not claimed.

## Stage 7 (9 November 2026, branch `realism-7`): the water at your feet, and three faults the stills showed

- **Near ripples.** From the pier the sea within 30 m was a smooth sheet with broad soft shapes: the spectrum and
  the two normal layers stop at wrinkles of about half a metre. A third look-up of the same normal map at 1.2 m a
  tile adds the hand-width ripples the wind raises, in patches with the gusts, faded out by 30 m (where they would
  be under a pixel). One texture read a pixel; its cost on a graphics card is not measured here.
- **Brick at brick size.** Garden walls mapped their 0.9 m by 0.6 m brick tile at 2 m: bricks half a metre long.
- **Retaining walls are no longer stood up as garden walls** (one ran along the quay's edge on top of the piling).
- **Lifting the drop net over the rail in first person**, with the hoop beyond arm's reach: both hands now hold
  the rope, one below the other in front of you, and the rope runs to them. Before, each hand reached towards its
  own side of the rim: two open hands at the edges of the picture and the rope hanging between them from nothing.

**Checked.** The ten scenes at Ultra before and after; `node --test` 314 pass.

## Stage 8 (10 November 2026, branch `photo-backdrop`): the far shore is a photograph of it

Up the river from the pier the Gorleston riverside (Quay Road and Riverside Road, the old brick lighthouse among the
houses) was rows of generated houses from the map's footprints: repetitive and not that town. It is now a photograph
of that shore, taken on the pier 15 m from the mark: "View into the harbour from South Pier, Gorleston-on-Sea" by
Christopher Hilton, 8 October 2023, CC BY-SA 2.0 (Geograph 7618525, found through Wikimedia Commons' search; chosen
from 271 openly licensed candidates). `backdrop3d.js`:

- **Where it hangs.** The town's band of the picture (1600 by 132 pixels, enlarged to twice that), its sky cut away
  along its own roofline and the near jetty and quay cut off its foot, on a curved sheet centred on where the
  photographer stood. Lined up on the map by two things in the picture: the lighthouse (bearing 274.9 from the
  camera) and the lifeboat station (323), which give 21.35 pixels a degree and the left edge at 263.5. Each column
  stands at that stretch of frontage's distance off the map (285 m at the left to 540 m at the right), each row at
  its angle above the far waterline.
- **Depth.** One sheet, at the frontage's real distance: the game's own jetty, quay and boats in front slide across
  it as you walk the pier (checked from two places 57 m apart). The picture is not split into nearer and further
  rows of houses: at this distance and resolution that could not be done honestly.
- **Light.** Unlit by the scene's lamps and tinted from the hour's sun and sky, fogged with the scene. Checked at
  midday, dusk, night and overcast. At night it is a dark shape with no lit windows: none are invented.
- **What it replaces.** The map's buildings and trees behind the sheet are not built. Measured in one session, same
  camera, Ultra: 3,980,911 triangles a frame without it, 3,752,217 with (5.7% fewer); draw calls 1,048 and 1,047
  (the houses were already merged). Texture: one 3200 by 264 image, 76 kB to download.
- **Credit.** On the 3D view's label and its About text, in `public/models/CREDITS.txt` and
  `source-assets/ASSET-LICENCES.json`. CC BY-SA is share-alike: the adapted image carries the same licence.

**Not done.** The houses to the south-west (the Pier Hotel side, nearer than 285 m and left of the picture) are still
generated; a daylight photograph of that side from the pier is needed. The harbour's north side and the ships are
untouched. Draw calls from this camera are 1,047 where the integration branch measured 908 on 9 November: not
explained yet, and not caused by the backdrop.

## Stage 9 (10 November 2026, branch `night-fix`): what Aaron's phone screenshots showed at night

- **Every window of every building was lit**, a grid of identical yellow squares. About one in three is lit now, the
  same ones each time for a building (`buildings3d.js`: a dark window's bay is mapped one turn along the facade
  sheet and its glow switched off).
- **The north bank's buildings were drawn as houses and brick mills** with a window in every bay. Across the river
  is the port's South Denes estate; the photographs from the pier show sheds, stores and tanks. They are drawn as
  port sheds now: profiled steel, one tall storey, no windows (`localDetail.js` `sheds`, `architecture.js`).
- **The boats were boxes.** `vessels3d.js`: an inshore fishing boat and a harbour workboat, each one mesh with a
  lofted hull (raked stem, flare, sheer, transom, antifouling under a boot-top line), a wheelhouse with windows, a
  mast, navigation lights that glow after dark and a wake astern. They keep 320 to 650 m out (they were as near as
  180 m) and go round a long narrow beat at 2 to 3.5 m/s instead of sliding back and forth. Generic working boats,
  not models of named vessels; no engine sound yet.

Still generated: the houses on the Pier Hotel side to the south-west.

## Stage 10 (10 November 2026, branch `no-generated-buildings`): no generated buildings at Gorleston

Aaron's phone screenshots still showed generated houses on the Pier Hotel side and a generated shed across the river.

- **None of the map's buildings are drawn in a generic style at Gorleston now** (`generated: false` in `localDetail.js`,
  read in `realPlace.js`), and the indicative far town beyond the mapped square is off there too (`skyline.js`,
  `town: false`). The real far landmarks placed from published positions stay.
- **The town at the landward end of the pier is a second photograph** (`gorleston_pierhead.webp`): the Pier Hotel, the
  Pavilion Theatre and the cliff-top houses, cut from "Gorleston South Pier" by habiloid (CC BY-SA 2.0, Geograph
  6234922), credited on screen and in `public/models/CREDITS.txt`. It is a dusk photograph with its colours lifted to
  match the daylight one, so the lamps lit that evening still show in it. The modelled Pier Hotel, Pavilion, bandstand
  and Cliff Hotel stand behind that sheet and are no longer built; the lighthouse and coastwatch station on the pier is.
- Not done: across the river north of the dune there is now only the ground, the quay and the far landmarks. No openly
  licensed photograph of that bank from the pier has been lined up yet.
- Checked: 314 unit tests pass, the end-to-end presets pass, and the views south-west, west, north-west and north from
  the mark were rendered by day and at night (software renderer in the build container, not a phone).

## Stage 11 (10 November 2026, branch `night-lights`): real lamps at night, the north bank, the board fence

- **Lights at night from a real photograph.** The bright points of the dusk photograph of the town (Geograph 6234922:
  street lamps, lit windows, signs) are hung just in front of the town's sheets and come on as the light goes
  (`backdrop3d.js`, a def's `lights`). They are the lights that were on in that photograph, no more.
- **The north bank is a photograph too** (`gorleston_northbank.webp`, Geograph 6235518, habiloid, CC BY-SA 2.0): the
  port's sheds and offices, with their own lamps after dark. The cranes and jack-up rigs moored there that day are cut
  away. Lined up by one point (the north pier's light) and the scale of the same camera's other picture: the sheds sit
  within a degree or two of the map, not exactly.
- **The brown board wall down the pier is gone.** It was the map's pole fence drawn as a garden's close-boarded fence.
  None of the map's fences or garden walls are drawn at Gorleston now.
- Limits: the photographs are about 21 pixels a degree, so the town is soft close up, and walking to the landward end
  of the pier brings you up to a flat picture. Checked in the build container's software renderer, not on a phone.

## Stage 12 (10 November 2026, branch `realism-pass`): the dune, spray off the rocks, the town by day, your angler

Aaron asked for a better texture on the hill, spray coming off the rocks, a more realistic town at the back, and the
hands and characters redone.

- **The dune is drawn from the ground itself** (`realPlace.js`, the soft ground's shader). It was a tiled photograph of
  pebbly ground tinted yellow, which from the pier read as an even stipple. Now: pale sand, marram grass in drifts
  metres across (straw where dry, grey-green where not), thick on the top and thin on the steep face, darker patches
  of low scrub, and runs where sand has slipped. Each layer fades out before it gets smaller than a pixel. This is how
  a marram dune looks in general, with the bare face under a grown-over top that the pier-head photograph shows; the
  clumps are not surveyed.
- **Spray off the rocks** (`rockSpray.js`, new). Where a crest reaches the seaward edge of the rock armour it throws a
  burst of white water up and back over the stones, which drifts with the wind and falls. How hard depends on the sea
  that is running: nothing in a calm, more as wind and swell rise. One draw call, up to 900 soft puffs. Spray off the
  wall at your feet gets the same white as well as its drops. Not measured at Gorleston: general behaviour.
- **The town at the landward end by day** (`source-assets/backdrop_day.py`). The dusk photograph's sheet still read as
  evening: now its contrast is lifted again, shadows lightened, the lit lamps painted out of the daytime sheet (they
  stay on the night sheet), and it is twice the size with a light sharpening. Its cut left end, which stopped at a
  straight edge, thins out in a stipple. No new detail exists in it: it is the same 2000 pixel photograph.
- **Your angler is the Rocketbox man in his own clothes** (`people.js` `OWN_DEFAULT`): a modelled gilet with pockets
  and a zip over a long-sleeved top, coloured as your jacket. The jacket made in Blender for "Angler, fishing jacket"
  was the suit's surface let out and smoothed, and looked melted; that person is still in the list but is no longer
  the default. The gilet's hem line is lower (0.455), so its last few centimetres no longer stay beige.
- **Tried and not kept:** three ways of rebuilding the jacket in Blender on Aaron's PC (the suit's surface with a
  nearest-surface clearance; a voxel-remeshed body; rings cast round the body and arms). The first two kept lumps or
  grew rolled rims at the suit's openings; the third showed that the model's own gilet was already better than any of
  them. None of those meshes shipped and `make_angler_clothes.py` is unchanged.
- **Not done:** the first-person hands and arms are the same models as before. New hands and a new character with their
  own skeleton and animations are a separate, larger job (the earlier 17-phase brief).
- Checked: unit tests and the end-to-end presets; stills by day from the mark, close to the rocks and in third person
  (software renderer in the build container, not a phone; no frame rates measured).

## Stage 13 (10 November 2026, branch `splashes`): splashes

Aaron asked for the splashes to be more realistic.

- **Every splash on the water** (a rig going in, a fish at the surface, a leap, the net) is now a crown of fine drops
  thrown steeply out and up, a few straight up the middle, and a short puff of white where it went in
  (`rockSpray.js` `splash`, `splashPlan`). They were 260 round white dots of one size, 9 cm across, thrown out in a
  fan. Drops fall as a stone falls and are gone where they meet the water, waves and all.
- **In the light of the hour.** Drops and mist take the day's light, so a splash is white at noon, grey at dusk and
  dark at night. The old dots were as bright at midnight as at noon.
- **Spray off the rocks and the wall** has ragged puffs (each with its own pattern, lit from above) in place of smooth
  discs, and heavier drops flung higher and further than the mist.
- One draw call for all of it (up to 1,600 points), in place of two. How splashes behave in general: nothing measured.
- Checked: unit tests, the end-to-end presets, and stills of a small and a large splash at four moments (software
  renderer in the build container, not a phone; no frame rates measured).
