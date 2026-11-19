# The graphics, realism and game quality overhaul

Aaron's brief of 19 November 2026 asks for FishDock to be rebuilt as a modern, realistic UK fishing simulator in
thirteen phases, starting with the first-person rod, hands, pier paving, rain and Whitby. This page is the running
record: what each stage changed, how it was checked, and what is still wrong. Nothing here is called done unless it
was seen in the game itself (Microsoft Edge on Aaron's PC, RTX 3090, the real controls).

How a stage is checked:
- The game is played on the PC by a script that presses the same keys a player does (cast, strike, reel, land), on a
  wide screen on Ultra (1920x1080) and on a phone-shaped screen on Balanced (390x844 at 3x), with a picture every
  quarter second through the cast and every 0.6 s after. Source: `FishDock-assets/queue/h23*_fp*.py` on the PC.
- Twenty fixed cameras at Whitby, the same light and weather every time, before and after.
- The frame rate, slowest 1%, draw calls and triangles read from the game's own meter, same place, same settings.
- `node --test tests/*.test.js`.

## Stage 1 (19 November): first person, paving, rain, Whitby on a phone

| What was wrong | What changed | Seen in the game |
|---|---|---|
| The rod stood upright in the middle of the screen | A resting hold: the rod comes in from the lower right at 34 degrees and leans across the view, its tip in the picture, both hands on it. The hands give to the rod's turn so both wrists stay in their natural range | Yes, wide and phone |
| After every cast the rod stood upright again for over a second | The follow-through is the resting hold with the rod a little higher; the left hand goes to the reel's handle | Yes |
| Playing a fish the rod pointed below the view, far left, hands open | The fight is held about 46 degrees up and a little nearer; a surge, a pump and a run stay inside what both wrists reach (a test over the whole range) | Yes |
| Landing a fish the rod lay along your line of sight | Kept a little above the resting angle | Yes (a fish lifted in; the drop net's own moves are below) |
| Hands flat and plastic | The baked skin marks stronger, uneven colour and fine relief over them, arm hair fair and fine | Yes; still short of the brief (see below) |
| Pier paving a chequerboard | Whitby's deck re-baked in Blender: a 4.8 m tile of some fifty close-jointed flags near each other's shade | Yes |
| The pier's edge course cut at an angle, yellow | One course of whole stones laid along the edge, toned nearer the deck | Yes |
| Rain as long white lines | Streaks under half as long, each its own brightness, lit at about three quarters of the sky's light, sized by the screen's own pixels, drawn ahead of you where you look | Yes |
| The deck dry in rain | Whitby's flags darken, take a sheen and hold puddles with the rain's rings | Yes |
| The East Cliff smooth green ramps on a phone | The 1 m surveyed hillside is drawn on Balanced too | Yes, phone-shaped screen on the PC |
| Dark slabs on the hillside | Walls, fences and hedges follow the ground in short lengths | Yes |
| The East Cliff one smooth brown wall | Its rock shows on the sea face: dark shale under buff sandstone, ledge shadows | See the measurements below |

### Still wrong after stage 1 (seen in the PC's footage)

- Hands: no fingernails to speak of, the knuckles soft, the skin even. The right hand's first two fingers lift off the
  rod when the hand gives to it. A new hand model or sculpt is the fix, not more map work.
- Through the cast's wind-up and release (about half a second) the reel passes close in front of the eye and the
  left sleeve crosses the lower left of the picture.
- Reaching down for the drop net the left sleeve is seen from inside, cut open near the eye.
- Playing a fish with the hands drawn in, the left forearm comes in level from the left edge instead of from below.
- A stall of one to three seconds when the catch card opens ("fish inspect" on the game's meter). It was there before
  this stage.
- Trees are still leaf cards on simple branches.
- Balanced still has no clutter (rocks, plants) and no windows in depth.

## The phases, and where each stands

1. Graphics engine audit: not started as a written audit. Measured so far: Whitby on Ultra 76 to 85 frames a second.
2. Environment assets: Whitby rebuilt (PR #166); the other places not yet. Surveyed 1 m heights fetched for Brixham,
   Cromer, Gorleston and Chesil; cliff, rock, shrub and street-furniture scans exported from Blender, not yet placed.
3. Textures and materials: Whitby's stone, grass, sand, soil; others not yet.
4. Water and weather: rain and the wet deck (this stage). Waves at walls and rocks, spray, sky and cloud not yet.
5. First-person fishing: this stage. Rod and reel detail not yet.
6. Characters and animation: not started.
7. Fish and fishing physics: not started.
8. UK places: Whitby first; Gorleston, Cromer and Brixham next.
9. Loading and performance: not started. The frame rate lost to the Whitby rebuild is still to be won back.
10. Interface: not started.
11. Immersion: not started.
12. Automated picture checks: the twenty fixed cameras and the played catch exist as PC jobs; no automatic comparison
    against approved pictures yet.
13. Release process: branches, a PR per stage, checked on the PC before merging and on the live site after.
