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
