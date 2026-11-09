# Benchmarking FishDock on a PC

The same scene, the same settings, measured frame by frame, on production and on a pull request's preview, so the
two can be compared. Nothing here is estimated: the numbers come from the PC that runs it.

## What the benchmark does

Settings, Graphics, Developer diagnostics, "Run benchmark: every preset". It puts the world into a fixed scene
(Gorleston, a clear afternoon, sun 28 degrees up at 200 degrees, 30% cloud, 16 kph wind, no rain, looking out over
the rod from your spot), then for each preset in turn: Performance, Balanced, High, Ultra, with no custom settings
and no battery saver, it waits for the world to rebuild and settle (about 6 s), then records every frame for 8 s.
Everything you had set is put back afterwards. "Copy results" puts a table on the clipboard, one row a preset:

    preset | frames | fps | p50 ms | p95 ms | p99 ms | 1% low fps | GPU ms | draw calls | triangles | texture MB | drawn at

The header line names the GPU the browser reports, the window size and device pixel ratio, so a result says what it
was measured on. "Drawn at" is the rendering resolution after the preset's own scaling.

## Turning the diagnostics on in a browser

The diagnostics show in the desktop launcher and in film builds. In an ordinary browser, open the game with
`dev=1` on the address once, for example `https://fishdock.aaron6k.workers.dev/?dev=1#try/gorleston-south-pier/cod/3d`;
that is remembered for that site in that browser (`fishdock.dev = 1` in its storage). A pull request's preview has its
own address, so do the same there.

## The procedure for 1080p, 1440p and 4K

1. Close other GPU users (other browser tabs with video or 3D, games, overlays). Plug in; set Windows to a performance
   power plan. Let the PC idle a minute.
2. Make the browser window the size to be tested. The simplest is a window maximised on a display set to that
   resolution, with the browser at 100% zoom (so the device pixel ratio is 1 and the window is 1920x1080, 2560x1440 or
   3840x2160 less the browser's own bars; the header line records the actual size). Alternatively, in Chrome's
   developer tools, the device toolbar lets you type an exact size.
3. Open production, go to Gorleston South Pier, the 3D view, and wait until the pier is drawn and the first frames
   settle (shaders compile on the first look round; give it 20 s).
4. Settings, Graphics, scroll to Developer diagnostics, "Run benchmark: every preset". Do not move the mouse over the
   game or change windows while it runs (about a minute). "Copy results"; paste into a note under the heading
   "production, 1080p" (or 1440p, 4K).
5. Open the PR preview at the same window size and repeat; paste under "PR, 1080p".
6. Repeat for the other two sizes. Paste all six tables into the PR as a comment.

## Reading the results

- fps is the mean; p95 and p99 are the frame times most frames beat; the 1% low is the frame rate at the slowest
  frame in a hundred. Smoothness is p95 and p99 close to p50, not a high mean.
- GPU ms is the GPU's own time for a frame where the browser reports it (the `EXT_disjoint_timer_query_webgl2`
  extension; Chrome on Windows does). If it is near the frame time, the GPU is the limit; if it is well under, the
  CPU (JavaScript, draw submission) is.
- Draw calls and triangles should be the same on every run of the same build at the same preset; if they differ,
  something else was in the scene (a walker, a boat) and the run is still fine but not identical.
- A run whose 1% low is far below its mean had stutters: shader compiles (the first run after opening), another
  program, or a thermal step. Run it again before drawing conclusions.
