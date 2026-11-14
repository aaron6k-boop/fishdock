# FishDock game: development roadmap and checkpoint

The working backlog for the game overhaul (Aaron's master brief of 13 November 2026), in the brief's priority order.
Each stage goes on its own branch as a draft PR; nothing is merged or deployed until Aaron approves it. Updated at the
end of each working session, so the next one can carry on from here.

## Ground rules

- Realistic British fishing at real places; first person by default, third person and the landing camera kept;
  repeated tap-to-reel kept. Levels and XP never lock a place or a fish. No microtransactions, gambling or pay-to-win.
- Only original or properly licensed assets, with their licences recorded.
- Never invent measurements: performance on Aaron's PC and phone is his to take (`docs/BENCHMARK.md`); the build
  container draws in software, so its pictures show what the engine draws, not how fast.
- What this workspace can't do: download sound recordings, 3D models or textures (its network reaches only package
  registries and GitHub), run Blender, or run a real GPU. Licensed recordings and models have to be added to the repo
  (or attached in the conversation) to be used.

## Merged with Aaron's approval (14 November 2026)

#118 sound at the first tap, #119 steady arms, #120 levels and the logbook, #121 sea fret and storms, #122 phone
performance (Auto is Medium on a phone, the step-down ladder, gulls drawn together, small things cast no shadow).

## Draft PR waiting for Aaron

| Branch | What |
|---|---|
| `play-polish` (#123) | From the 14 November recording: things that arrived after start-up (pier props, a passer-by, the drop net) readied before they're seen, not on the frame they first come into view (12 shaders and 16 textures at the cast on main, none on the branch); the frame-rate panel names the worst frame's cause on the phone and no longer made a WebGL context twice a second; the sleeves no longer magenta at dusk; the fish rests in your palms; warmer skin; one reward card instead of a pile of toasts |

## Backlog, in priority order

1. **Stable performance and critical bugs.** Done this session: the arm vibration (#119). Waiting: Aaron's iPhone
   "Record a catch" (`?dev=1#play`) for the real stalls at a catch; the gameplay frame-time spikes on a phone are not
   yet measured there.
2. **Hands, arms and character animation.** Done: steady hold, no snaps (#119). Next: the landing's left forearm still
   swings 5 to 8 cm a frame for a few frames taking the fish; the third-person walk (foot planting, stopping, turning);
   the idle (breathing, weight shifts).
3. **Rods, reels, line and nets.** Next: rod bend under load per fish and drag, the reel's bail opening for the cast and
   closing after it, line slack and tension between guides, the drop net's rope swing and bag sag with a fish in it.
4. **Water and weather.** Done: sea fret and storms (this branch). Next: tide height moving the waterline on the pier
   wall through the day; the sea state following the real wave height where the marine forecast has it (it does, as
   `waveM`); wind gusts moving the rain.
5. **Fish models and behaviour.** Next: per-species fight styles (a bass's runs, a cod's dogged weight, a flatfish
   flapping flat, a mackerel's quick darts) in `reelModel.js`; fatigue; a big fish's surge at the net.
6. **Catching and landing gameplay.** Done: medals and fish drawn by place (#120). Next: bite variety (taps, pulls, a
   slack-liner); hookholds that can come out if the line goes slack.
7. **Lighting and nearby textures.** Next: before-and-after of the deck and rail materials at the fixed scenes.
8. **Audio realism.** Done: #118 (synthesised). Needs: licensed field recordings (waves on a pier wall, gulls, reel
   clicks, drag) added to the repo to go further than synthesis.
9. **Gameplay depth.** Done: three daily challenges worth XP (#120). Next: a tide-and-time bite table per place
   (more bites on the flood at dusk where the sources say so), bite variety by species.
10. **XP, achievements and statistics.** Done: #120. Next: session history (a visit's catches and XP), statistics
    page.
11. **Boats, wildlife and NPCs.** Next: gulls diving at bait fish, a fishing boat leaving the harbour now and then.
12. **Distant scenery.** Low priority.
13. **Shop.** Later: game credits from fishing, cosmetic gear only, nothing that locks places.

## Next action

Wait for Aaron's review of `play-polish`, and his iPhone recording of the same sequence on it: the FPS display's
"worst" line now names what the slowest frame was doing. Then: authored Blender clips for putting the rod in the rest
and picking it up, and for the drop-net haul (needs this chat linked to Aaron's PC, where Blender is), which should also end the sleeve
showing as a hollow ring round your forearm as you haul looking down over the rail (the far hand sits on your line of
sight, so you look down the sleeve where it's cut near the eye; a dark inside and a soft fade were tried and weren't
better); bite variety
(taps, pulls, a slack-liner) by species (6, 9); tide height on the pier wall (4).

## Evidence kept

- `tools/arm-steady.mjs`: the arms at 60 frames a second (all checks pass on #119).
- `tools/scenes.mjs`: the fixed scenes, now 12 (11 sea fret, 12 storm caught in a lightning flash); `ONLY=<pattern>`
  draws a few.
- `tools/party-smoke.mjs`: public places and the map's fishing-now count, in workerd.
