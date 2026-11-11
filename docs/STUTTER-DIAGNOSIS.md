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

The 55-second screen recording mentioned in the brief did not arrive with the message (only the text did), so it has
not been used as a reference yet.

## The probe

`phaseprobe.mjs` (kept with the session's working files) plays one whole catch in a browser: stand, cast, wait, bite,
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

### 4. The shadow map was drawn twice a frame

Found and fixed on 10 November (PR #94): 741,506 triangles in 175 draw calls into a 4096 map every frame on Ultra, now
371,946 in 89.

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
