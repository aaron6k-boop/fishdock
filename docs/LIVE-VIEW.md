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

- `src/lib/sceneGL.js`: one WebGL shader (no libraries). Inside the water area the photo's own pixels flow towards
  the shore (sea) or across (river) and are refracted by animated wave slopes; wind drives speed, chop and
  whitecaps; rings spread where the line enters, where the lead lands and where a fish breaks the surface; glitter
  under the sun or moon; cloud shadows, mist, rain dulling; the light of the hour graded over the photo. Without a
  photo it draws a representative sea, river or lake (tree line and reflections) with the same light and weather.
- `src/lib/sceneActors.js`: the rod (bending from the tip under load), guides, reel (handle turns while playing a
  fish), line (slack or taut), float, lead in flight, splashes, drips and rain, on a 2D canvas over the water. The
  fish is FishDock's own cut-out species picture, bent along its body as it wriggles, scaled to the logged length
  (or a typical length, with no number shown). Species without a cut-out get the splash and the close-up only.
- `src/components/FishingScene.jsx`: puts them together, with quality Auto / Battery Saver / Balanced / High. Auto
  picks from the phone's memory and cores, drops to Battery Saver below 30% battery when unplugged, and steps down if
  frames run slow. Nothing is drawn while the scene is off screen or the page is in the background. Browsers without
  WebGL get a still photo with the animated rod. Reduced motion picks Battery Saver.
- Highlight clips: a catch's landing replayed and recorded from the canvas (MediaRecorder) with the close-up and the
  angler's photo, watermarked "animated reconstruction of a logged catch, not video".

## Phone limits

Phones pause web apps when the screen locks or another app is in front: no GPS, no events, no pushes. FishDock
doesn't promise background tracking. The fishing screen keeps the screen awake while open (Wake Lock), the phone
catches up the moment FishDock is open again, and viewers are told the phone has gone quiet in the meantime.

## Tests

- `tests/live.test.js`: the whitelist, owner keys, sequence numbers and retries, permissions per link, passcodes,
  expiry, revoking, stopping, clean-up, throttles, the feature flag, nearby photo selection.
- `tests/liveEvents.test.js`: phases, counts (Smart Bite apart), what leaves the phone.
- Browser flows (Playwright, against `tests/e2e/server.mjs --dist`): angler and viewer together, passcode, the
  angler offline then back (each event arrives once), phone portrait and landscape, tablet, a highlight clip.

## Next

- A Durable Object transport for instant updates (above).
- Cut-out pictures for the freshwater species, so pike, carp and the rest lift out of the water too.
- Panoramas: a wider photo the view can pan across as the angler changes where they cast.
- Posting a replay moment to Community (needs accounts, and a public replay format with its own privacy review).
