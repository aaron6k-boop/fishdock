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

## Stage 3 (19 November): the catch without stops, a hand's skin, the cast out of your face

Stage 1's footage showed two things its own notes had put down to the test: the picture stopping for seconds at a time
through a first catch, and scratches for creases on the hands. Both were real.

### The stops

A job on the PC played two catches with no pictures taken (taking them can itself stall the page) and logged every
frame that took over 70 ms, then again with every graphics call timed. In a first two-minute session 35 seconds went in
one call, three.js waiting for the driver to finish a shader the first time something drawn needed it, about a quarter
of a second each. Four causes, each fixed:

| Cause | How it showed | Fix |
|---|---|---|
| Anything drawn before its shader was built made the page wait for it | One to two seconds when a fish was hooked, netted or held up; 22 and 10 seconds in the middle of one fight | Every draw is checked: a thing whose shader isn't ready is left out until it is, and appears a moment late |
| Late arrivals were handed over in the background, but after 1.5 s the page waited for whatever was left | 16 seconds for the pier's furniture soon after the place appeared | It waits in the background for as long as it takes (half a minute at most) |
| A lamp's light was hidden by day and shown at dusk, and the number of lights is written into every lit shader | 63 shaders rebuilt on the spot at Whitby, 15.5 s, each time the lamps came on or went off; then more stops as you first looked at each thing with its new shader | The light stays, at nothing, by day |
| three.js made and threw away a material every time the sky's reflection map was refreshed | 1.3 to 1.8 s whenever the light or the cloud changed a step | The reflection scene has a background of its own, so that material is never made |

Measured on the PC (Edge, RTX 3090, a new browser profile each run, so every shader is built from nothing: the worst
case, a first visit). Time the picture stood still, frames over 100 ms added up:

| | Before (main) | After |
|---|---|---|
| Wide screen, Ultra: looking round at rest | 0.3 s | 0 |
| first catch | 43.8 s in 16 stops, the longest 22 s | 3.6 s in 3 stops, the longest 3.3 s |
| second catch | 1.1 s | 1.1 s |
| walking off, then rain | 5.4 s | 2.2 s |
| Phone-shaped, Balanced: looking round at rest | 12.9 s in 5 stops | 0 |
| first catch | 19.7 s in 12 stops, the longest 4.2 s | 3.6 s in 3 stops, the longest 1.8 s |
| second catch | 0 | 1.1 s |
| walking off, then rain | 4.4 s | 2.4 s |

The after column is the build that was merged (run h270 on the PC); two earlier runs of the same fixes gave 3.8 and
5.3 s for the first catch.

Frame rate, from the game's meter in these and the filmed runs. Phone-shaped at rest: 165 to 175 before, 158 to 179
after. Wide in rain, late in each run: 85 to 88 before, 77 to 91 after. Wide at rest, read a few seconds after the
place appears: 83 to 86 before, 70 to 83 over seven runs after. That last reading is lower and more scattered than it
was. Late shaders are now built in the background for some seconds after the place appears instead of stopping the
page, which may be what pulls it down; that is not confirmed. A change to pass over lamps that are off in the light
loop was tried for it and taken out again: it showed no gain.

Still there: one stop of one and a half to three and a half seconds the first time a landed fish is held up for a look
("fish inspect"). No
script or graphics call on the page is waiting during it; the time is in the browser's own graphics process. Not found.

### Hands

The skin's maps were one dark line per crease and a pink square per nail, drawn at 1024 and then made five times
stronger between the painter and the game. Painted again from the rig at 2048 (a fifth of a millimetre a texel): fields
of fine wrinkles over each joint, nails with a cuticle's curve, a rounded tip, a pale edge and a fold of skin round
them, pinker palms, pads and knuckles, tendons and veins as soft swells, skin's own net of tiny creases; used by the
game as painted. `source-assets/hands/bake_hand_maps.py`.

### The cast, and a leap's zoom

Through the wind-up and release the reel crossed 25 cm in front of your eye and the rod stood up the middle of the
screen. The cast's four middle moments are now set for the view: the reel low and to the right, 35 to 45 cm away, the
rod swung back over your right shoulder about its own handle, 45 degrees past upright at most; a test holds it there
with both wrists in their range.
When the view zooms in to follow a leaping fish your hands were magnified with it, up to two and a half times. They
now drop out of the bottom of the picture as it zooms and come back as it widens.

### A page left open across an update

The live check after stage 2 opened Cromer from a page loaded before the update: the old page asked for a code file
the new build no longer serves, and the screen stayed black. Every screen loaded on demand, and the 3D world's code,
now load the page again once when that happens (`src/lib/staleReload.js`).

### Still wrong after stage 3

- The stop when a fish is first held up, and the wide screen's lower reading at rest (both above).
- The leap's zoom is in but not yet seen: no fish leapt in the filmed catches.
- The hands are the same model: its shapes are sound but its fingers are thick and its grip on the rod is loose (the
  first two fingers of the right hand).
- In the cast's wind-up your left sleeve still fills the lower left of the picture for about half a second.
- Everything listed after stage 1 that isn't named here.

## Stage 4, first part (19 November): Gorleston's ground at its surveyed heights

The same survey and tool as Cromer and Brixham (`terrain_from_dtm.py`, the Environment Agency's 1 m LIDAR), for the
second place on the brief's list.

| What | Before | After | Seen on the PC |
|---|---|---|---|
| The cliff south of the pier's root | A slope shaped by hand to about 15 m, with roads draped over it as dark slabs | The survey's cliff: 9 m high in 30 m, Marine Parade at 13 to 16 m | Yes, eight cameras |
| The spit across the harbour mouth | A sand bank about 8 m above the quay, estimated from one photograph | The survey's 5 to 6.5 m above datum (2 to 2.5 m above the pier's head) with marram hummocks on top; no scattered trees on it or on the port's yards | Yes |
| The pier's head | Flat | Flat (set 0.3 m proud by the first attempt, it came through its own deck as sand: caught on the PC, fixed by taking the ground's usual level as 4.0 m) | Yes |

This changes little that you see from the pier: the spit is lower and truer, and the cliff is the right height. The town
is still two photographs standing on bare ground, with no buildings drawn and nowhere to walk past the pier's root.
That is Gorleston's real fault and the next piece of work: its buildings drawn as Whitby's are, on this ground.

Measured (Ultra, 1920x1080, read a few seconds after the place appears): 66 frames a second before, 67 to 68 after;
loading 21 s, then 22 s; no page errors.

## The recording of 19 November (16:10) and the second brief

Aaron's 75 second recording on his iPhone at Whitby (uploads/ScreenRecording_11-19-2026_16-10-01_1.mp4), with a brief
that sets a new order: running and character movement first, then grass and vegetation, houses, cliffs and terrain,
pier materials, then fishing animation, lighting and consistency. What the recording shows, frame by frame:

- **Frame rate: 33 to 42 on the phone's own counter.** It showed 50 to 57 before stage 1. Stage 1 put the 1 m
  hillside on Balanced; that is the first suspect and has to be measured, not guessed.
- **Running:** the character (the woman with the ponytail) sprints along the pier carrying the rod upright at her
  right side. There is a red glow on the ground at her feet.
- **The hillside:** on the phone it is a smooth pale green surface with flat grey smears where paths are, one flight
  of steps as a brown strip, a zig-zag fence and a single round tree. Balanced has no grass clumps, no clutter.
- **Houses:** a row of plain boxes with painted-on windows.
- **First person:** the cast's wind-up still shows the rod upright in the middle of a phone's narrow picture.

The same movement filmed on the PC before any change (job h277, Ultra, from behind, the side, the front and close; in
renders/footage_loco0_1615.zip):

- At a full push of the stick the character walks at 1.4 m/s: there is no jog. Sprint is 3.2 m/s.
- Walking, both hands hold the rod in front of the body, so neither arm swings and the chest does not turn.
- Sprinting, the body is bent well forward with both knees deeply bent and the hips low: a crouched scurry, not a run.
- The clothes are near black from head to knee, so the limbs are hard to read against each other.

Order of work on movement: (1) the rod carried in one hand at the side so the other arm swings and the chest turns;
(2) three paces, walk, jog and sprint, each at the speed its motion capture was filmed at; (3) the sprint's posture;
(4) turns, stops and starts; (5) feet on slopes and steps; then both sexes and every build, filmed again the same way.

### Movement, first step (19 November): three paces, and the sprint stood up

Four ways of running were filmed side by side on the PC (job h278: the live settings, the motion-captured jog at its
own 2.4 m/s, the jog lengthened to 3 m/s, and the retargeted full run at its own 3.35 m/s). The crouch is in the
retargeted full run itself, at its own speed as much as blended; the jog is upright at both speeds. So:

- **Three paces.** The first six tenths of the stick walk, up to 1.4 m/s; a full push jogs at 2.4 m/s, the speed that
  clip was filmed at; Sprint runs at 3.1 m/s on the same clip with a longer stride. A full push used to be the walk.
- **The retargeted full run is retired** (`human3d.js` SPRINT_CLIP) until a run is retargeted properly.
- **Setting off** is eased for the faster paces, so a jog or a run builds over about half a second without a jolt.

Seen on the PC (job h279, Ultra): walk, jog and sprint from the lit side, behind and in front, a stop, and turns right,
left and back at a jog. Upright at every pace; no page errors.

Not done yet: the rod is still carried upright at the chest with the right forearm held still; only the man was
filmed; slopes and steps were not; foot placement, turning on the spot and the third-person camera are as they were.

### The phone's frame rate, first step (19 November): a lighter hillside on Balanced

Measured on the phone setting on the PC (390x844 at 3x, Balanced, job h281), looking where the recording looks: 2.98
million triangles a frame towards the town and never fewer than 2.2 million whichever way you look. Hiding one thing
at a time: the 1 m hillside is 0.9 million of them (it is drawn three times a frame: the picture, the water's mirror
and a depth pass), the grass 0.67 million, the chimney caps 96 thousand.

The hillside is now drawn in 2 m squares on Balanced wherever four of its 1 m cells lie flat enough to make one (their
shared edges straight within 3 cm, so no crack opens against 1 m neighbours); paths, walls and gullies keep their 1 m
cells. Its own triangles: 298 thousand, then 132 thousand. A frame towards the town: 2.98 million, then 2.20 million.
Seen on the PC at the phone's size: no cracks, the relief as before. Ultra and High are unchanged.

What this does for Aaron's phone is not known until he reads its counter again: the PC's graphics card is not slowed
by triangles the way a phone's is. Still to look at: the grass's 0.67 million, the chimney caps, and why nothing is
left out of a frame when you look out to sea.

### Walking in first person: your own body, and the rod in view (19 November)

Aaron's recording of 17:19 (Gorleston, iPhone, 18 s) showed walking and jogging in first person with a dark, shapeless
mass over the lower left half of the screen and neither rod nor hands in sight. The cause: walking in first person drew
the fishing view's arms (`fpRig.js`) at the camera, and since the movement step a full push of the stick is a jog, at
which those arms' "carried at a run" pose brings the jacket's sleeve up across the view. The movement step was filmed
from outside only before it was published; first person was not looked at. It is now part of the filming.

What walking in first person draws now is your own body, as everyone else sees it, from your own eyes:

- **The whole body, less the head** (`human3d.js` setHeadless). Each of your meshes gets its own list of triangles
  with the head's at the end, drawn short of them; the sun's shadow pass draws the whole list, so your shadow keeps its
  head. A hat and glasses go the same way. Nothing is scaled or hidden by a shader, and no new shader is built.
- **The camera is at the model's eyes** and turns a little about the neck: looking down brings your eyes a few
  centimetres forward and down (`world.js` NECK_EYE). A real head's 9 cm and 12 cm were tried first and brought the
  camera down to the collar, where the near edge of the view cut through the front of the jackets that stand proud of
  the chest (seen as torn cloth on the people in orange, h295), so it is kept small.
- **You can look down at yourself.** At your eyes the view tips from 69 degrees down to 52 up (`look.js` EYES_PITCH; it
  was 43 down, 6 up, the range that suits the camera behind you) and stays where you leave it. Looking down you see
  your chest, your free hand swinging, your legs and wellies, and the reel at your side. No steeper than 69: past
  that the bottom of the picture looks back into your own collar, where your neck ends.
- **Where you look is yours.** The camera no longer comes round after your body in first person (it turned you in a
  circle when you pushed the stick sideways). Standing, your body comes round after your look once your head has
  turned about 45 degrees, at 3.2 radians a second. Pull the stick back and you back away at
  1.1 m/s facing the way you look, the stride run backwards, rather than turning to walk into your own eyes
  (`walker.js` lookYaw, back).
- **The rod is in the picture.** Carried at your right side as from outside, but leaning a little in across you and
  rising less at a run, so it stands in the right of a phone's narrow picture at a walk, a jog and a sprint.
- **A free hand hangs half closed** while you walk or run (the walks held it out flat), for everyone.
- **People cast shadows again.** Looking for my own shadow from my own eyes there was none, from outside either: the
  rule that stops specks casting shadows (`world.js` trimCasters) measured a mesh by its own place in the scene, and
  the newer people's meshes are in metres under a skeleton a hundredth the size, so a whole jacket measured 7 mm and
  every part of every such person was struck off (job h288 listed them: ten meshes, none casting). A person's meshes
  are now never struck off. This is for everyone you can see, in every view.

Seen on the PC (jobs h284 to h298; a phone-shaped screen on the phone setting at Gorleston, a wide one on Ultra at
Whitby): standing, walking, jogging and sprinting looking ahead and down; a look to the side; the body coming round;
backing away; a sideways push; back to the fishing spot (the fishing view's arms return); and from behind, where the
head is there as before. Then as six people (h298, h299): the bearded angler, the woman angler at two builds, the
woman with her hair tied back, the angler in the fishing jacket and the man with stubble at the slight build, each
standing, walking and jogging, looking ahead and down. Your shadow lies on the ground ahead of you with its head on. No page errors. (Three of some forty runs
came up as a blank page that never loaded, each a different person and each fine when run again: the filming
harness, which has done it before on older builds.)

What it costs, measured on the PC with the live build and this one run in turn, twice (jobs h291 to h294; the PC was
running slower that evening than in the afternoon for both, so only readings from the same hour are compared):

| Standing in the walking view | Live build | This build |
| --- | --- | --- |
| Phone-shaped, phone setting, first person: GPU time a frame | 5.9 to 6.5 ms | 4.9 to 6.7 ms |
| the same: draws a frame | 149 to 171 | 171 to 191 |
| Phone-shaped, phone setting, from behind: GPU time a frame | 5.2 to 6.4 ms | 5.7 to 6.4 ms |
| the same: draws a frame | 207 to 227 | 217 to 237 |
| Wide, Ultra, first person: frames a second | 52 to 60 at 1.5x and 1.75x | 49 to 57 at 2x |

So about twenty more draws a frame for your body and its shadow, and no difference in GPU time that these runs can
tell from their own scatter. On Ultra the game's own resolution scale settled at a different step in each run, so the
GPU times are not comparable there; the frame rate held about level at the higher scale. With the body's shadow
switched on and off in one session (h290) the GPU time moved by less than the scatter between readings.

Not done: fishing in first person still draws only your arms (look down while fishing and there is no body); your feet
slide a little when your body comes round on the spot faster than the turning steps; backing away uses the walk run
backwards, not a filmed backwards walk; at the steepest look down the collar of some jackets shows a ragged edge at
the very bottom of the picture, and the jackets are plainly faceted that close; fifteen of the twenty-one people
were not filmed in this view.

### Vegetation, first step: scrub on the banks, a tree on the far card, grass that stands in clumps (19 November, night)

The brief's second priority. The same fourteen cameras at Whitby and Gorleston were photographed on the phone setting
and on Ultra (job h304) to see what is wrong before changing anything:

- Past the reach of the grass blades (12 m on the phone setting, 30 m on Ultra) a hillside was a smooth painted
  green on both settings. That is nearly all of what you see of it from a pier. Gorleston's cliff read as a golf
  course.
- A tree at a distance, and every tree on the phone setting, was a round ball of green dabs on a stick.
- On the phone setting a lawn close to was rows of little rectangular hedges: each card of grass is a strip cut square
  at its ends, and they stand thinly there.
- Half the far trees stood black beside green ones.

What changed:

- **Scrub** (`scrub.js`, `scrubPlan.js`): mounds of bramble and thorn, gorse, and stands of bracken on the banks,
  cliffs and rough grass within 500 m of where people fish (650 m on Ultra). Each is two crossed cards with its
  picture from the side and one lying flat with its picture from above, drawn in the page, three instanced meshes for
  the place. Where they stand comes from the ground: only where grass is drawn, never on a road, a building, a pier
  or a dune; in thickets, by a slow noise; more on a slope than on the flat. Bracken is russet from October to March
  and green otherwise; gorse carries a little flower all year and most from March to May. Phone setting and up.
- **The far tree** (`trees3d.js` cardTexture): a crown in separate masses of leaf, lit from above and dark beneath, on
  limbs that show between them, with sky through its edge.
- **Cards lit from above on both sides** (trees and scrub): drawn double-sided, the half seen from behind had their
  normals turned over and were lit from underneath. Each card is now two front faces.
- **Grass in clumps** (`grassField.js`): the blades shorten towards each end of a card.

Two things found on the way, both fixed before anything was published:

- The first version asked the ground "is this a road?" for every candidate, each against every stretch of every
  road: Whitby's loading went from 19 s to 70 s on the PC. Roads, buildings, car parks and piers are now drawn once
  into a mask of 2 m squares and looked up; the scrub's placing takes 0.13 s on the PC.
- The ground's grid runs out for kilometres, so the first version found 242,000 places for a bush and its cap kept
  3% of them, spread too thin to see. It now tries only the ground within reach of the spots.
- Tussocks of rough grass were a fourth kind and were taken out: flat on the ground from above they read as starfish.

## The phases, and where each stands

1. Graphics engine audit: not started as a written audit. Measured so far: Whitby on Ultra 76 to 85 frames a second.
2. Environment assets: Whitby rebuilt (PR #166); Cromer, Brixham (stage 2) and Gorleston (stage 4) at their surveyed
   heights. Surveyed 1 m heights also fetched for Chesil, not yet used; shrub and street-furniture scans exported from Blender,
   not yet placed.
3. Textures and materials: Whitby's stone, grass, sand, soil; others not yet.
4. Water and weather: rain and the wet deck (this stage). Waves at walls and rocks, spray, sky and cloud not yet.
5. First-person fishing: stages 1 and 3. Rod and reel detail and a new hand model not yet.
6. Characters and animation: not started.
7. Fish and fishing physics: not started.
8. UK places: Whitby first; Gorleston, Cromer and Brixham next.
9. Loading and performance: the stops through a first catch (stage 3). Loading time, the stop when a fish is first
   held up and the frame rate lost to the Whitby rebuild are still to do.
10. Interface: not started.
11. Immersion: not started.
12. Automated picture checks: the twenty fixed cameras and the played catch exist as PC jobs, and since stage 3 a job
    that plays two catches and adds up every stop; no automatic comparison against approved pictures yet.
13. Release process: branches, a PR per stage, checked on the PC before merging and on the live site after; a page
    left open across an update now loads itself again (stage 3).
