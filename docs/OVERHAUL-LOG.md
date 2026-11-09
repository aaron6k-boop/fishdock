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
