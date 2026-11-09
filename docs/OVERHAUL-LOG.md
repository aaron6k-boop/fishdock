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
