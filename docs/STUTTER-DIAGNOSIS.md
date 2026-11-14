# Stutter: what was measured, what caused it, what was changed

Branch `smooth-and-hands`. Started 11 November 2026 from the brief "Critical performance fix and complete hand/arm
rebuild". This file is the record for Part 1 (stutter). Nothing in it is estimated.

## What could and could not be measured here

The work was done on a machine with no graphics card: the browser draws in software, so **frame times measured here
mean nothing** and none are quoted. What can be measured exactly, and is the same on any device, is the *work the game
asks for at each moment*: shaders built, textures and render targets sent to the graphics card, files fetched, and how
often the page redraws itself. A hitch on a real device is one of those happening in the middle of play.

Real frame times (p50, p95, p99, 1% low, long frames, GPU time) have to come from the devices themselves. For that
there is now **Record a catch** (below), which measures exactly the sequence the brief lists.

## The recording (iPhone, live build, 11 November 00:47)

The 55-second screen recording arrived afterwards and was measured with `tools/recording-stalls.py`. A phone records
at 60 frames a second whatever the game manages; where the game missed a frame the recording holds the same picture
twice, and since the sea never stops moving, a repeated frame of sea is a frame the game did not draw.

    1206x2622, 54.6 s, 3259 recorded frames, 2745 new game frames, 514 repeats
    game frame interval: p50 16.7 ms, p95 33.3 ms, p99 66.7 ms, worst 850 ms; average 50.3 frames a second
    gaps over 50 ms: 34; over 100 ms: 20; over 200 ms: 10

So the phone is mostly at 60 and the trouble is stalls, not a low frame rate. The stalls, against what was on screen:

| When | Stall | What was happening | Cause |
| --- | --- | --- | --- |
| 13.0 s | 367 ms | the strike | the fish being made (picture read, shape, skin): cause 2 |
| 21.2 s | 850 ms, then 250 ms | mid-fight, the fish first coming into view | its shaders built on first sight: cause 2 |
| 24.0 s | 167 ms | fight | not identified |
| 31.6 to 35.0 s | eleven of 83 to 467 ms | the landing: the view turns to the deck, net and box appear | twelve shaders built at the landing: cause 2 (but see below) |
| 39.9 and 40.5 s | 400 and 500 ms | "have a look", the panel opening | **not confirmed** (see below) |

A caution on the last two rows: once the view is on the deck there is no moving sea in it, and a camera holding
still over concrete also gives repeated frames. Those two rows may overstate. The stalls while the view is on the sea
(the strike, the fight) are sound. Nothing was found in the code that loads or builds anything when the panel opens;
Record a catch on the phone will say whether a frame really ran long there and what was built in it.

The same script on a new recording of this branch is the before-and-after for the phone.

## The probe

`tools/phase-probe.mjs` plays one whole catch in a browser: stand, cast, wait, bite,
strike, fight with repeated taps on Reel, landing, the fish on the mat. It counts, by phase, every `linkProgram` (a
shader built) with the shader's kind, every texture and buffer sent, every framebuffer made, every file fetched, and
every time React committed a redraw of the page. Same script against the live build (d479bc8) and this branch.

## Confirmed causes

### 1. The whole page was redrawn 24 times a second through every fight

The fight steps twenty times a second on a timer, and every step set two pieces of React state at the top of the
page. Each one made React work through the whole screen again: the 3D stage, the controls, the fish and place lists
of the settings sheet. That ran between frames and never in step with them.

| During the fight | Live build | This branch |
| --- | --- | --- |
| React redraws | 483 in 20.0 s | 255 in 20.7 s |
| Changes made to the page | 9,439 | 4,276 |

**Fix**: the 3D view now reads the fight directly, the frame each step arrives (`fightLive`, a ref). The page hears
about it on every third step, or at once when something it shows as a word changes (the fish running, the line
slipping, near the net). The redraws that remain are mostly the taps on Reel themselves.

### 2. Shaders were built, and the fish model fetched, in the middle of the catch

| Shaders built | Live build | This branch |
| --- | --- | --- |
| While waiting for a bite | 0 | 5 (the coming fish, on purpose) |
| During the fight | 0 to 7 (varied by run) | 0 |
| During the landing | 12 | 1 |
| `fish.glb` fetched | at the landing | with the place, under the loading screen |

The twelve at the landing were the fish's own materials, the landing net, the splash, and the rod-tip light's bulb
and glow (added on 10 November, and so a cause of stutter that was introduced the same week).

There were three separate reasons, all fixed:

- **Shaders were being built for the wrong target.** With post-processing on (Balanced, High, Ultra) the scene is
  drawn into an off-screen target, and three.js builds a different shader for that than for the screen. The start-up
  step that builds everything ahead of time was building for the screen. Every shader was therefore built twice: once
  at start-up, never used, and again on the frame its object first appeared. `warm()` in `world.js` now builds for the
  target the scene is really drawn into.
- **Things that did not exist yet could not be built ahead.** The fish's shape, skin and materials were made at the
  bite. They are now made when the bait goes out (the demo and a party both know the coming fish then), and sent to
  the graphics card at once.
- **Nothing was built after the files arrived.** The one ahead-of-time pass ran when the world was created, before
  most models had loaded. The loading screen now runs it again once every file is in, and waits for it.

### 3. A step in drawing resolution rebuilds every render target

Caught in the probe: when the frame pacing lowers the resolution, 18 framebuffers and about 8 megapixels of render
targets are thrown away and made again in one frame. That cannot be avoided for a step, so the steps have to be rare:

- frames during loading no longer count towards a step (merged on 10 November);
- a device's settled resolution is remembered, so a phone does not step down again on every visit (merged 10 November);
- a step no longer reallocates the drawing buffer twice (merged 10 November).

### 4. Every control over the 3D view blurred the picture behind it

The chips, buttons and labels drawn over the 3D view each used a background blur. Over a picture that changes every
frame, each one makes the phone read that part of the picture back and blur it again, every frame. They now have a
slightly more solid dark fill and no blur. This is a known cost of that effect rather than one measured here.

### 5. The shadow map was drawn twice a frame

Found and fixed on 10 November (PR #94): 741,506 triangles in 175 draw calls into a 4096 map every frame on Ultra, now
371,946 in 89.

### 6. Things that arrived after start-up were readied only when first seen (14 November)

Aaron's recording of 14 November (iPhone, Medium, 1.50x) dropped to a 1% low of 10 fps at the cast and again at 16 to
22 s, turning round to the lookout while waiting for a bite. Probed on the film clock (the same every run) through
that sequence at Medium, counting every shader built, texture sent and large buffer sent after the start, by phase.
Main (`bde759c`) against this branch, 80 film steps after the start before the cast:

| Phase | Main | This branch |
|---|---|---|
| The first seconds after the loading screen | 5 textures | none |
| The cast, as the view swings round | 12 shaders, 16 textures | none |
| Looking all the way round | 5 textures | 1 shadow shader, 1 texture |
| The bite | 1 shadow shader, 1 texture | none |
| Fight, landing, the look at the fish, putting it back, the next cast | none | none |

On the branch all of it is done under the loading screen instead.

What they were: the pier's lifebuoys, benches, signs and lamp posts (`pierprops.glb`), someone walking on the pier,
the drop net's bag, and their textures. All of them arrived after the warm-up at 85% loaded, which only ran again
for anglers' own gear, so each was built and sent on the first frame it came into view. Now (`world.js warm`):

- the scene is counted every half second and anything new is readied once it stops arriving, and again as the
  loading screen goes: shaders compiled where the browser can do it in the background (the parallel-compile
  extension), then every model drawn once into a single pixel and the sun's shadow map, so its buffers, every
  texture slot (not only five) and its shadow shader are sent;
- a texture gets its sharpness (anisotropy) before it's sent, not just after, when it was sent a second time.

The remaining shadow shader and texture on the look round are the next fish's model, sent as it arrives. Counts, not
timings: what each costs on the iPhone is for its own FPS display to show (the "worst" line, below).

## Not yet done from Part 1

- **Real frame-time numbers.** None exist yet for either device. They need Record a catch run on the iPhone and on the
  PC, on the live build and on this branch.
- One shader (the fish's shadow, which needs its picture for its outline) is still built at the landing.
- Garbage collection and per-frame allocations: the page's own code took under 1% of the time in the profile, and the
  collector 215 ms over a five-minute run, so nothing pointed there. To be looked at again with real device numbers.
- Fixed-step simulation with interpolation, and animation blending between states: these belong with the hand and
  arm rebuild (Part 4 and Part 6) and have not been started.

## Record a catch

Settings, Graphics, Developer diagnostics (open the game once with `?dev=1` on the address to see them), **Record a
catch**. Start it, close the panel, fish as usual, come back and stop. It gives one row per phase:

    phase | secs | frames | avg fps | p50 ms | p95 ms | p99 ms | 1% low fps | worst ms | over 33 ms | over 50 | over 100 | shaders built | textures sent | GPU ms

then the slowest frames with what was built or sent in each, the long tasks the browser reported, memory at the start
and end where the browser gives it, and a header naming the GPU, the browser, the window, the drawing resolution and
the preset. "Copy recording" puts it on the clipboard.
