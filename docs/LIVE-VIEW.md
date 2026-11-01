# Live Fishing View

Family and friends open a private link and watch an animated reconstruction of a fishing session as it happens:
the place's photo with moving water, the angler's rod and line, casts, bites, fish on, the landing of the actual
species, and the catches so far. No camera, no video, no account for viewers.

## What is real and what is drawn

| Shown | Comes from |
| --- | --- |
| Casts, bites, fish on, lost, snags, catches, pauses | Buttons the angler presses (Smart Bite alerts are labelled Beta and counted apart from bites) |
| Species, length, weight, released, bait, photo | The catch the angler logged (sizes and photos only on links that allow them) |
| Wind, waves, temperature, rain, cloud, tide | The same live data as the rest of FishDock, sent by the angler's phone |
| Light of the hour, sun and moon glitter | The real sun and moon at the place (astro.js); glitter placed by the direction the angler says they face |
| The backdrop | The angler's own photo (best), a free-licensed photo taken near the place ("Photo near here"), or a representative scene, labelled as such |
| Rod, line, splashes, the fish's movement | Drawn by FishDock. Labelled everywhere as an animated reconstruction, not video |

Nothing is invented to fill gaps: when the angler's phone goes quiet (screen locked, no signal) viewers see the last
state and a note saying so.

## Privacy

- Private by default; nothing reaches Community unless the angler posts it through the normal Community sheet.
- Each link has its own expiry (4 hours to 7 days), optional passcode and permissions. Defaults: approximate location
  (the region only), catch photos off, sizes on, the session so far on. Exact location is only sent while a link
  allows it, and only that link sees it. Hidden location shows a representative scene, never the angler's photo.
- Never shared: the GPS track, marks, notes, conditions snapshots. Place labels that look like coordinates, grid
  references, postcodes or map links are dropped by the server.
- Photos are re-encoded on the phone and stripped of EXIF, GPS and every other metadata segment on the server.
- Nearby photos are looked up with a 1 km square only. Viewer counts use a hash of (link, random browser id).
- Stopping sharing deletes the server copy at once; shares are otherwise deleted a day after their last link ends.

## How it fits together

```
Angler's phone                         Cloudflare Worker + D1                  Viewer's browser
session.js (events, on the phone) ──►  POST /api/live/shares/:id/push   ◄──── GET /api/live/view?after=<seq>
liveShare.js (outbox, retries)          server/live.js: whitelist, seq,         Watch.jsx: merge by seq, play
FishingScene (same renderer)            per-link filtering, expiry               FishingScene a few seconds behind
```

- **Events, not video.** The phone sends small events (`cast`, `bite`, `smartbite`, `missed`, `hooked`, `lost`,
  `snag`, `catch`, `pause`, `resume`, `end`) and a state summary. The server gives each a sequence number in the
  same transaction that stores it; a retry of an event it already has is ignored (unique per share and event id).
- **Reconnects.** Viewers ask for events after the last sequence number they hold, so a dropped connection never
  repeats or loses a catch. The phone keeps an outbox of unconfirmed events and resends after a drop, with back-off.
- **Playback.** The scene is a pure function of the events and a time (`liveEvents.phaseAt`), so live viewing, late
  joiners, replays and scrubbing all land on the same picture. Viewers run 4.5 seconds behind the angler (like any
  live stream), so every cast and landing plays in full and in order.
- **Polling.** Viewers poll every 3 seconds while the angler's phone is connected, 8 seconds when it's quiet, 60
  seconds after the session ends, and at most every 30 seconds in the background. Writes are kept low (a viewer's
  "watching" row is refreshed at most every 25 seconds) to suit D1's free allowance.

### Durable Objects and WebSockets

Investigated. A Durable Object per share with hibernating WebSockets would push events to viewers within about a
second and save D1 reads, and SQLite-backed Durable Objects are on the Workers free plan. It isn't used yet because:
FishDock still has to run on the Pages set-up (Pages can't define a Durable Object class), events are rare (a few a
minute), and polling by sequence number already gives exact, duplicate-free delivery within a few seconds that
survives phones suspending the page. The client keeps all transport in `Watch.jsx`'s `poll` and `liveShare.js`'s
`push`, so a Durable Object transport can be added behind the same event and sequence model later: add a
`durable_objects` binding and migration in `wrangler.jsonc`, export the class from `worker/index.js`, and have the
push route forward each stored event to the share's object.

## Rendering

- `src/lib/sceneGL.js`: one WebGL shader (no libraries). The water area is found in the photo itself (from the
  bottom of each column up while it stays water-coloured, then the far water beyond a pier end; piers, walls and rocks
  stay still) and replaced by a moving surface worked out in perspective on the water plane: long swells in drifting
  groups (bigger with the forecast wave height), wind waves running the way the wind blows relative to where the
  angler faces, their steepness easing off at the small end as real water's does, and fine ripples across them, so
  nothing repeats and nothing looks like beaten metal (how much is reflected comes from a calmer version of the
  surface, calmer still near the camera). Each kind of place moves its own way: open sea and pier swell, surf lines
  rolling onto a beach, slicks and boils drifting down an estuary or river, a still lake. Each facet reflects the
  photo above it mirrored about the real waterline, sharp in a calm and smeared in a blow; the body colour is the
  photo's own water, averaged over a wide patch so its frozen waves don't show. A darker contact line and working
  foam where it meets walls and rocks, torn whitecaps in a blow, sun and moon paths, haze along the horizon. Rings
  spread where the lead lands, at a bite, where a fish rolls or breaks the surface, under drips and, drop-sized,
  wherever rain falls; broken water and foam where a hooked fish thrashes. Without a photo it draws a representative
  sea, river or lake with the same light and weather.
- Weather and light come from one set of conditions (`sceneEnv` in `FishingScene.jsx`), so the sky, the water, the
  rain, the mist and the sound agree. Dusk warms the photo; night darkens it and takes the colour out with only a
  slight coolness (not a blue wash over a daytime photo); a clouded-over day fills the photo's sky with grey cloud
  drifting with the wind, greys its reflection in the water and flattens the light; light rain is a few fine drops,
  heavy rain many more, longer and faster near the camera, slanting with the wind, with a mist that thickens.
- `src/lib/sceneActors.js`: the rod, line, reel, float, lead, splashes, drips and rain on a 2D canvas over the water.
  - The rod is FishDock's own design: a black carbon blank with the FishDock name, whippings in the rod's colour
    at every guide, lined guides, black shrink grips either side of a chrome-collared reel seat, and a black and
    silver reel with line in the rod's colour. It comes up from the bottom corner of the view with the reel fully in
    frame and moves with the angler's hands and the wind. Each kind of place has its rod: a beach caster (gold,
    stiffest, thickest), a pier rod (blue), a float rod for rivers (red, bends most) and a feeder rod for lakes
    (green); the demo can pick any. The tip light is on, off or automatic (only after dark).
  - The rod is a chain of segments bent progressively towards the tip, with three springs (blank, soft tip, angle),
    so it overshoots and settles: a hand's small movements and the wind at idle; back, forward and a tip whip on the
    cast; tip taps for a light bite and a pull-over for a proper take; a load that follows the fish's pull in a
    fight (and its weight when lifted), then springs back when a fish is lost.
  - Each species has a fight profile (pull, tempo, darting, splashing, body flex, fight length, flat or eel body):
    cod heavy and slow, bass lively and splashy, whiting and mackerel quick and erratic, flatfish and rays flat,
    conger and eels sinuous. Weight is the logged one or estimated from length (for the animation only, never shown).
  - The fish are light 3D models built in the browser from FishDock's own cut-out pictures (`src/lib/fish3d.js`):
    the outline gives the body (lofted round the spine, as thick as the species usually is) and finds the tail and
    the fins on the outline, which become separate flat pieces that flutter and beat on their own; the picture is
    the skin, so each species keeps its own shape, fins and markings. The spine bends side to side and up and down,
    the fish rolls, turns towards or away from the viewer, and a small WebGL renderer (no libraries) lights it for
    the hour with a wet highlight and a rim of sky light. Under 1,400 triangles each. The eel and the conger are
    drawn curled in their pictures, so they (and any phone without WebGL) keep the flat picture bent along a curve.
    Sizes follow the logged length: about a ninth of the view's height for a 55 cm cod hanging near the angler.
  - The landing is one sequence: up from where the fight had got to, through the surface rolling and splashing,
    then landed the way that place does it (`landingTech`): a small fish lifted straight up a pier wall, a bigger one
    (45 cm or 1.1 kg and up) into a drop net hauled up on its ropes, a landing net on a river, lake or for a good
    estuary fish, and on a beach the fish is walked up the sand on the back of a wave. A lifted fish comes head first
    with the tail leaving the water last and hangs under the rod tip as a damped pendulum with a few weakening kicks
    and drips, then swings in; the camera eases in, and the catch card follows. Timings grow a little with the fish's
    weight (`landingTimes`), and each event's variation is seeded, so a replay or a clip plays the same while the
    next cast differs.
  - The camera: a small shake on strong pulls and a slow push in on the landed fish (none with reduced motion).
  - In the demo the fish can show during the fight; in a real session the species isn't known until the catch is
    logged, so the fight shows the rod and the water, not a guessed fish.
- `src/components/FishingScene.jsx`: puts them together, with quality Auto / Battery Saver / Balanced / High. Auto
  picks from the phone's memory and cores, drops to Battery Saver below 30% battery when unplugged, and steps down if
  frames run slow. Nothing is drawn while the scene is off screen or the page is in the background. Browsers without
  WebGL get a still photo with the animated rod. Reduced motion picks Battery Saver.
- Highlight clips: a catch's landing replayed and recorded from the canvas (MediaRecorder) with the close-up and the
  angler's photo, watermarked "animated reconstruction of a logged catch, not video" (the demo's say "FishDock demo,
  animated, not a real catch").
- `src/lib/sceneAudio.js`: sound made on the phone, no files. The water (waves at the sea, a softer lap inland), the
  wind in gusts and rain follow the same conditions as the picture; gulls now and then by the sea in daylight; a tip
  bell for a bite on a sea rod and an electronic bite alarm on a river or lake rod; the reel's ratchet while a fish
  is played; the cast and the splashes. Off until tapped; one level control.

## Backdrop photos

Nearby photos come from Wikimedia Commons (`server/scene.js`), each with its author, licence and file page shown on
the scene. A photo has to suit a rod held at the water's edge:

- Its words (`src/lib/viewpoint.js`) say where it was taken from: a pier, beach, harbour, riverbank, lake or boat,
  and whether from high up (the town from the abbey, a cliff top, an aerial view). The server ranks views from high
  up last and ones said to be from the pier, beach or bank first.
- The phone then looks at each small copy (`viewFeatures` and `judgeView` in `src/lib/scene.js`): is the horizon
  there and level, is there water in the middle where the line lands (all that a phone held upright shows of a wide
  photo), is the foreground blocked (sand counts as ground on a beach), does the camera look down from high up, is it
  too dark. The best photo is used only if it passes; otherwise the scene is the representative one, labelled so.
  The demo's picker shows each photo's verdict.
- A slightly tilted horizon (1.5 to 4 degrees) is levelled, with just enough zoom to keep the corners filled, and the
  water, the cast point and the rod line up with the horizon found.
- An angler's own photo of where the rod points is still the best backdrop. In the demo a visitor can try their own;
  it's re-encoded on the phone (no EXIF or GPS) and never leaves it.
- If a photo fails to load, the scene says so and draws the representative scene instead.

## The phone screens

The scene fills the screen on a phone. A tap on the water hides or shows the controls (the photo credit stays). The
demo has one controller that only offers steps that make sense (no landing before a bite) and says plainly that
nothing is caught or logged; its settings come up in a sheet. A viewer sees what's happening, a mini timeline of
casts, bites and catches, and buttons for the catches and the full timeline, which open in a sheet without stopping
the live scene. Safe areas are respected, so nothing sits under the iPhone's bars.

## Phone limits

Phones pause web apps when the screen locks or another app is in front: no GPS, no events, no pushes. FishDock
doesn't promise background tracking. The fishing screen keeps the screen awake while open (Wake Lock), the phone
catches up the moment FishDock is open again, and viewers are told the phone has gone quiet in the meantime.

## Tests

- `tests/live.test.js`: the whitelist, owner keys, sequence numbers and retries, permissions per link, passcodes,
  expiry, revoking, stopping, clean-up, throttles, the feature flag, nearby photo selection.
- `tests/liveEvents.test.js`: phases, counts (Smart Bite apart), what leaves the phone.
- `tests/fish3d.test.js`: finding the body, fins and tail in an outline; the mesh; placing, bending, rolling and
  turning the fish.
- `tests/sceneMotion.test.js`: every pictured species has a fight profile; rod load by size and weight; demo fight
  lengths; the landing's beats in order and always within the landing phase at every kind of place; each place's
  way of landing a fish.
- `tests/viewpoint.test.js`: where a photo was taken from; which viewpoints suit each place; real photos'
  measurements judged (a level open view passes; a town seen from above, a view looking down and a tilted field
  don't); levelling.
- Browser flows (Playwright, against `tests/e2e/server.mjs --dist`): angler and viewer together, passcode, the
  angler offline then back (each event arrives once), phone portrait and landscape, tablet, a highlight clip.

## Next

- A Durable Object transport for instant updates (above).
- Cut-out pictures for the freshwater species, so pike, carp and the rest lift out of the water too.
- Pectoral fins: they're painted on the flank in the pictures, so they move with the body; separate pectoral fin
  pictures would let them move on their own. Sculpted models (with real head shapes and open mouths) would need new
  3D art.
- Panoramas: a wider photo the view can pan across as the angler changes where they cast.
- Judging photos by their pictures is rough (it reads level lines and smooth patches as water); the words and the
  horizon carry most of the weight. A small on-device model could tell water, sand, buildings and sky apart better.
- Posting a replay moment to Community (needs accounts, and a public replay format with its own privacy review).
