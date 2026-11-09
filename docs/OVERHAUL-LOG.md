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
