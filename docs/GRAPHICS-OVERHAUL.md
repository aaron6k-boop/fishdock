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
| The East Cliff one smooth brown wall | Its rock shows on the sea face: dark shale under buff sandstone, ledge shadows | Yes |
| Flights of steps drawn straight from their first point to their last | Each follows its mapped line and the ground, tread by tread; a line too steep to be stairs isn't drawn | Yes (the 199 Steps and Henrietta Street's views unchanged) |

### Measured (PC, 1920x1080, the same spot, the same script; before is the live code)

| | Before | After |
|---|---|---|
| Whitby, first person at rest, Ultra | 86 frames a second, slowest 1% 56 | 85, 56 |
| after landing a fish | 69, 47 | 75, 47 |
| heavy rain | 86, 56 | 87, 56 |
| Phone-shaped screen on Balanced, at rest | 165 | 139 with the hillside in the shadow pass; 190 as shipped, without |
| the same, heavy rain | 202 | 184; 197 as shipped |

The phone-shaped figures are from the PC's graphics card, not a phone, and vary by a tenth from run to run. They
showed the fine hillside costing a sixth of the frame rate on Balanced while it was also drawn for the shadows; it
throws no shadow on Balanced now, and the cost is within the run-to-run difference. Aaron's iPhone showed 50 to 57
before; its own reading after this stage is the one that counts.
Other places on the same build, third person on Ultra: Great Yarmouth 90 to 99, Gorleston 88 to 92, Lowestoft 82 to 88,
Cromer 84 to 85, Whitby 75 to 77; loading 21 to 26 s, as before. No page or shader errors in any run.

### Still wrong after stage 1 (seen in the PC's footage)

- Hands: no fingernails to speak of, the knuckles soft, the skin even. The right hand's first two fingers lift off the
  rod when the hand gives to it. A new hand model or sculpt is the fix, not more map work.
- Through the cast's wind-up and release (about half a second) the reel passes close in front of the eye and the
  left sleeve crosses the lower left of the picture.
- Reaching down for the drop net the left sleeve is seen from inside, cut open near the eye.
- Playing a fish with the hands drawn in, the left forearm comes in level from the left edge instead of from below.
- A stall of one to three seconds when the catch card opens ("fish inspect" on the game's meter). It was there before
  this stage.
- A dark patch about 10 m wide down the East Cliff's sea face, seen only from the camera 480 m out at sea off the
  harbour mouth (not from the piers, nor from the sea to the east). It was there before this stage. A ray through it
  meets nothing but the fine hillside (229 to 249 m east, 93 to 121 m south of the mark), whose heights, colours and
  soil there are ordinary; it is not a wall, a flight of steps or a path, each of which was tried. So it is in the
  lighting or the shadows from that one direction, not in the ground. Not found yet.
- Trees are still leaf cards on simple branches.
- Balanced still has no clutter (rocks, plants) and no windows in depth.

## Stage 2, first part (19 November): Cromer and Brixham at their surveyed heights

The environment system applied to the next two places: the Environment Agency's 1 m LIDAR made into each place's 5 m
terrain and 1 m hillside by `source-assets/tools/terrain_from_dtm.py`.

| Place | Before | After | Seen on the PC |
|---|---|---|---|
| Cromer Pier | The cliff an even 12 m bank, estimated | The cliff behind the promenade with its paths, terraces and retaining walls; the cliffs to the west at their real 39 m | Yes, six cameras |
| Brixham Breakwater | The harbour on a flat | The town climbing its hills, to 59 m | Yes, six cameras |

Measured (Ultra, 1920x1080, before and after): Cromer 81 frames a second, then 79 to 82 (2.26 to 3.36 million
triangles a frame); Brixham 100, then 89 to 92 (3.46 to 4.05 million); loading 22 to 26 s, as before.

Tried and taken out: four more photoscanned rock sets, for boulders at cliff feet and outcrops on steep faces. Placed
and pictured on the PC they stood on the faces as brown lumps on grey rock. Rock on the cliffs wants to come from the
cliff's own material and shape (as the East Cliff's beds now do), not from loose scans set on it.

Still to do for these two: their own buildings from photographs (Brixham has none yet), Brixham's breakwater in its
limestone, the harbour's quays, and trees.

## The phases, and where each stands

1. Graphics engine audit: not started as a written audit. Measured so far: Whitby on Ultra 76 to 85 frames a second.
2. Environment assets: Whitby rebuilt (PR #166); Cromer and Brixham at their surveyed heights (stage 2). Surveyed 1 m
   heights also fetched for Gorleston and Chesil, not yet used; shrub and street-furniture scans exported from Blender,
   not yet placed.
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
