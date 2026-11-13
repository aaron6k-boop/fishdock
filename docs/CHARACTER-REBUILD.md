# First-person character rebuild: what was wrong, what has been rebuilt, what is left

Branch `fp-character-2`. This is the working record for the rebuild brief of 11 November 2026. It is kept honest:
anything not done is listed as not done.

## What was wrong (measured, not guessed)

The arms model the game used (`fp_body.glb`, third build) was measured and rendered at rest in Blender
(`source-assets/blender/make_fp_body_v4.py` starts from the same file).

| Finding | Evidence |
| --- | --- |
| The hand itself is normally proportioned. | Wrist to middle fingertip 20.4 cm, across the knuckles 7.1 cm, palm 5.2 cm deep. It is Blender Studio's realistic male hand (Human Base Meshes 1.1.0, CC0), all quads. |
| The sleeves were not sleeves. | They were the MakeHuman jacket's, cut off round the arm: a stepped, torn edge for a cuff, one skin thick, open at both ends. |
| The skin's colour was blotchy. | It was carried across from the MakeHuman body's texture: pale patches on the back of the hand, no nail colour. |
| The skin ended in steps up the forearm. | Its top edge followed the old mesh's faces. |
| The hands filled a third of the view on a phone. | Held upright the view is only 37 degrees across. A hand 10 cm wide and 60 cm from the eye takes 9.5 degrees of it. |
| The reeling wrist was bent 40 to 50 degrees sideways. | The knob lay square across the fingers while the forearm came in from 41 degrees out to the side. |
| The upper arm ended in mid-air when you reached over the rail. | It is laid back from the elbow at its own length, and the elbow was then further from the shoulder than that. |
| Hands on the net's rope were open claws; a fish held head-to-right crossed the forearms. | Fixed in PR #97, already merged. |

So the "swollen" look came from the view, the wrist's bend, the sleeves and the colour, not from the hand's own shape.

## What has been rebuilt

- **Sleeves** made for the arm: lofted ring by ring from just above the wrist to past the shoulder, an elastic cuff
  with a tab that turns in on itself (a lining inside), folds above the cuff and at the elbow, mapped in metres.
- **Skin colour and roughness maps** repainted from the model's own relief (`paint_fp_skin.py`): one even tone,
  darker creases, redder knuckles and fingertips, a paler palm, nails.
- **Grips made in Blender** on the model (`source-assets/blender/grips/`): the rod at the reel, the reel's knob (on a
  slant, so the wrist is straight), a fist for the net's rope and hoop.
- **The view** on an upright phone is wider (1.27 of the base, from 1.15).
- **The skin** ends on a clean line inside the sleeve; a twist bone is in each forearm (not yet driven).

## Second stage (11 November, evening): grip, cast, reeling, landing, rig

What the second brief asked for, in its order, and what was done about each.

1. **The right hand on the rod.** Made again in Blender on the game's own rod, reel seat and reel
   (`tools/export-seat-geometry.js` writes every triangle round the seat in the seat's frame; `make_seat_grip.py`
   closes the hand on them). The handle lies higher in the palm so the fingers pass under it, the reel's stem between
   the second and third fingers, the thumb along the top. The hand is the same size. The grip says where its forearm
   comes from and the forearm keeps to that within about 13 degrees. The reel is held 47 cm ahead of the eye and
   13.5 cm below it (it was 54 and 10, further than the arms reach).
2. **The cast** is two-handed and overhead. The left hand holds the butt in a grip made for it
   (`make_butt_grip.py`, `grips.js` `butt_l`). The rod goes back over the right shoulder, the reel beside the right
   temple and the butt out in front of the chest; the right hand punches forward and up while the left pulls in to
   the ribs; both hands stay on through the follow-through, then the left goes to the reel's handle and a turn closes
   the bail. The rod bends away from the swing and springs back past straight at the release. The first finger lets
   the line go at the release and stays out over the spool until the lead is down. The third-person cast follows the
   same path (it was a low side swing with the rod never above the shoulder).
   References: Sea Angler, "Understand your beach fishing rod and cast further" (push and pull with both arms, the
   left pulling harder; the reel's stalk between the second and third fingers; the first finger trapping the leader
   with the bale arm open) and John Holden, "How to hit a great beach cast" (the body turn, then the arms; aimed
   about 40 degrees up).
3. **Reeling.** The knob's own transform still drives the hand each frame, and tap-to-reel is untouched. The ring and
   little fingers are folded into the palm (they stood up beside the reel). The grip itself is still a fingertip
   hold on the knob: see "Not done".
4. **Landing.** The drop net crosses the rail with its bag slumped over it, the hoop lifted to about 1.35 m
   (measured: the eye is at 1.5 to 1.6 m then), where hanging its full depth it had to be lifted to 1.58 m, level
   with your face. Hauling the rope, one hand slides out along it with loose fingers while the other pulls in
   towards your chest, and you see one hand beyond the other with the rope between them (both were on your line of
   sight to the net and read as one lump, half off the edge of the screen). As the rod is laid down the left hand
   goes to the net (it hung open in the picture).
5. **The rig.** Every arm's elbow is now found from its shoulder (two bones of fixed length; the point of that circle
   nearest where the hold wants the elbow). The shoulder comes forward up to 7 cm with a long reach and rises as the
   hand goes above it. The forearm's twist bone is driven: the forearm bone takes half the turn between the elbow's
   hinge and the palm, the twist bone most of the rest, so the sleeve stays on the arm while the wrist turns in the
   cuff. No bones were added. Cloth within 17 cm of the eye is not drawn (an upper arm passing your face blacked the
   picture out for a frame).
6. **The model, looked at again** (`source-assets/blender/verify_fp_body.py`; renders in the PR): 10,748 skin points
   and 13,184 triangles as exported (quads in the Blender source), 5,934 points in the sleeves, 55 bones, 36 of them
   moving skin; every point's weights add up to one; at most four bones a point. The wrist and the forearm's turn
   deform cleanly. In a bare tight fist the knuckles come out angular and the web between thumb and first finger
   stretches flat, because the palm's skin is shared between the first finger bones (there are no palm bones), and
   the palm's colour map shows square patches close up. It has been kept, as asked, and those are listed under
   "Not done" rather than hidden.
7. **Cost.** Measured in headless Chrome on a two-core cloud machine with a software renderer, so these are not
   phone or PC frame times: posing both arms takes 0.24 to 0.31 ms a frame on average (holding, casting, reeling,
   hauling), the worst single frame 4.7 ms. The arms are two skinned meshes on one 55-bone skeleton. A whole frame
   of the game allocates about 70 to 76 KB here; `main` measured between 70 and 185 KB in the same test, too
   scattered to say the arms changed it. Nothing has been measured on an iPhone or a PC with a graphics card.

## Third stage (12 November): checked against other games and real anglers

Aaron's phone screenshot showed the rod arm's sleeve end on, like a stump, and an open hand under the reel. Frames
were then looked at in the browser from *Call of the Wild: The Angler* (a no-commentary gameplay video on YouTube:
waiting, reeling and playing a fish in first person) and from "Spinning from the Pier - Sea Fishing UK" (a real angler
casting and retrieving, filmed from the side). What they show, and what was changed to match:

| Seen in the references | In the game before | Now |
| --- | --- | --- |
| The right forearm comes up from the bottom right corner and the rod carries on its line; the elbow is below the hand. | The elbow was held level with your eye, 11 cm above the wrist; the sleeve came at you end on. | The elbow is by the ribs, 9 cm below the wrist; the forearm lies along the butt. |
| The left forearm comes up from the bottom left to meet the reel; the left hand is closed on the knob, its back and thumb to you. | The knob lay across two hooked fingers, the forearm came from straight below, four fingers stood up beside the reel. | The knob is held by its sides between the thumb and first two fingers, the palm towards the reel, the other two fingers folded (`make_knob_grip.py`). |
| Hands only show when they are doing something. | Stooping for the net, both hands were held up half closed on a rope that isn't drawn there. | The hands go out to the hoop's rim as far as the arms reach and take hold of it; well out of reach they come away. |

Also in this stage: the skin's weights round each knuckle and across the thumb's web were averaged with their
neighbours (`ease_fp_weights.py`; 1,850 of the hand's 6,640 places). A bare fist's knuckles are a little less angular
for it. It is a small change, shown before and after in the PR; the mesh, bones and maps are the same.

A second screenshot from Aaron's phone showed the sleeve was still a stump after the elbow was lowered: the forearm
still pointed almost straight back at the eye. A shoulder in its real place, beside and behind the eye, can only reach
a hand held ahead of the face with an arm that comes straight at you. So while a hand is on the rod, the reel or the
butt, the arms are set as first-person games set them: the shoulders are 45 cm below the eye, 10 cm ahead of it and
26 cm out to each side (eased in and out), the rod elbow swings out as well as down, and the reel is held 56 cm ahead
of the eye and 20 cm below it (it was 47 and 13.5). The forearm now comes in from the bottom corner and is seen from
the side. This is a viewmodel placement, not anatomy. On the rope and the net the shoulders go back to their real
place, because the forward position put the upper arm up the side of the picture there.

After this change `tests/e2e/presets.mjs` was run again (all 56 checks passed) and every recording was made again.

## Fourth stage (12 November, after it went live): the hold reworked

Aaron's verdict on the live build was that the arm and hand were worse. At full phone size he was right: the left hand
pinched the knob with the first finger and thumb arched in a ring, the right hand read as a lump, and the forearm came
in level from the right edge. Frames from *The Angler* were looked at again at full size. There the rod is held well
up, you see the backs of both hands, and each forearm runs up from a bottom corner in line with what it holds.

- The rod is held at about 40 degrees (it was 11). At 11 its butt, and the forearm along it, pointed at the eye.
- The rod-hold shoulders and elbows are set in the view's own frame, so the arms keep their place as you look up and down.
- The left hand on the knob is the fist made for the rope, moved 3 cm along the knob. From your own eye it is the back of a closed hand. The pinch grip is no longer used.
- The cast's wind-up takes the hands back out past the right edge of the picture; held in beside the eye, the elbow and upper arm crossed the picture.
- Fists are closed further at the first finger and thumb.

Hauling the net's rope: the fists made for the rope had the thumb standing off the first finger, and from the thumb's
side, which is the side you see, the two made a ring. The thumb is now turned in across the first finger (in the game's
code, on top of the grip made in Blender; the Blender grip itself has not been made again). A hand sliding along the
rope to a new hold still opens with its fingers spread.

## Fifth stage (12 November, evening): different hands

Aaron's phone screenshots of the live hold still showed poor hands, and asked whether a free model would do better.
The Blender Studio hand looks good open but does not close: in a fist its fingers leave a hollow and the knuckles
splay. Three free hands were posed the same way beside it (`hand_candidates.jpg`); all three close into a solid fist.

The hands are now the Godot XR Tools hand models (CC0, by DigitalN8m4r3, Miodrag Sejic; github.com/GodotVR/godot-xr-tools,
`addons/godot-xr-tools/hands`). `source-assets/tools/retarget_fp_hands.py` fits them to this game's own arm skeleton:
each Godot finger bone is laid along the matching bone of ours and stretched to its length, the palm is stretched in
its own plane so the knuckles land on ours, the heel is drawn in to meet the wrist, the flat cap above the wrist is
taken off and the open edge carried up the forearm into the cuff. The bones, their rest places, the sleeve and every
grip are unchanged. The skin picture is Godot's, brought to the old skin's overall colour with its wrinkles and relief
turned down. 4,312 points and 7,340 triangles for the pair (the old skin was 11,085 and 13,184).

Also in this stage: the winding hand is thumb up with the knob between thumb and curled first finger; the skin's
shading of folds, veins and freckles is turned down; skin under the cuff is cut 5 cm above the wrist.

Not done in this stage: the grips were made for the old, thinner fingers and have not been made again, so fingertips
sink a little into the rod and reel in places; the forearm between wrist and cuff is one plain colour; the Godot glove
mesh is not used (Gloves in the look picker recolours this hand).

## Sixth stage (13 November): arms made for first person

The Godot hands stopped at the wrist, and the forearm built for them read as a pale lump on a phone. The arms are now
based on "Fists (2025) | First Person Animations" by 1Matzh
(https://sketchfab.com/3d-models/fists-2025-first-person-animations-c7e8f959c4094be991b02213d4e66c20), licensed under
CC BY 4.0, downloaded by Aaron: realistic hands with their own wrists and forearms. `source-assets/tools/retarget_fp_arms.py`
lays each of its bones along the matching bone of ours and keeps the hand and 14 cm of forearm (4,752 points, 8,202
triangles); the bones, sleeve and grips are unchanged. Its colour picture is brought part of the way to the old skin's
overall colour, because the game tints skin from that. The credit is in Settings, with the other sources, and in the
model file itself. The hand on the reel's knob sits 1.5 cm further on to it, so the knob no longer shows through.

Not done: the grips were made for an earlier hand and have not been made again; fingertips are a little short (the
last joint of each finger is laid on our shorter one); the leather-glove model also downloaded ("Fps arms" by DJMaesen,
CC BY 4.0) is not used yet, as it has no bones and needs binding.

## Seventh stage (13 November): a proper rig in Blender instead of hand patches

Aaron asked for the procedural fixes to stop and for the arms and hands to be rigged and animated in Blender, with
the equipment driving the hand contact. Work so far, all of it in Blender on Aaron's PC (the files are in
`~/Documents/FishDock-assets/rig`, the scripts that make them in `~/Documents/FishDock-assets/queue` and `scripts`):

- **Character.** The Blender Studio Human Base Meshes realistic male (CC0), the same body family as the hands, at
  full size with its shape keys removed and one level of its sculpted detail applied (42,342 points).
- **Rig.** A Rigify human rig fitted to that body from measured joint positions: spine, chest, neck, head,
  clavicles, upper arms, elbows, two forearm segments that share the twist, wrists, palms, three joints for every
  finger and the thumb. 410 bones, 73 that bend the skin; skin weights from the bones and checked by closing a fist.
  Each finger's hinge is set from that finger's own curl, so every finger closes straight into the palm. Arm IK with
  stretch switched off, so an arm can never be pulled longer than it is, and an elbow target for each arm.
- **Jacket.** Made from the rigged body itself (cut at the waist and 6 cm above each wrist, given a 3 mm thickness),
  so it bends with the same bones and nothing has to be stuck on by the camera.
- **Equipment.** The game's own rod handle and reel (`rodkit.blend`) at full size on a 12 ft rod, reel seat 45 cm from
  the butt, the handle's crank turning about its real axis, knob 5.8 cm from it.
- **Motion capture.** Three Mixamo clips already used by the third-person anglers (fishing idle, cast, pulling a
  rope) are retargeted to the rig bone by bone, correcting for the two skeletons' different rest poses. The idle gives
  the spine, chest and shoulders a natural stance; the cast is the base for Gate 3.
- **Two rig faults found and fixed on the way.** (1) The fingers' hinges: Rigify works out a finger's bend axis from
  its resting curve, and this body's fingers are nearly straight at rest, so a knuckle bent a finger largely sideways
  (up to 96% of the movement on the left hand). Every finger and thumb chain now bends about the bone's own X axis,
  laid along the knuckles' line; each knuckle now moves its finger into the palm (sideways drift 0.2 or less) and a
  closed hand is a proper fist. This, not the grip code, is why every earlier grip looked like a claw. (2) Stretch:
  Rigify's IK bones keep a small stretch value of their own even with the arm's stretch setting off, so an arm could
  be pulled about 10% longer to reach a target out of reach. That value is now zero, and every solve measures both arm
  bones against their rest length (1.000 on every run since).
- **Grips (Gate 1, in progress).** The rod is put where the first-person view holds it and within reach: reel seat
  about 33 cm ahead of the eye and 30 cm below it, rod up 35 to 45 degrees, so the reel and both hands sit at the
  bottom of the picture at the game's own field of view on a phone and on a wide screen. Each arm reaches its grip by
  IK from its own shoulder with the elbow bent (about 110 to 135 degrees). The grips come from a search over the hand's
  real skin, deformed by the same bone weights the game uses: the handle tried across the palm at many angles and
  places, every finger closed at each, and the place kept where the palm and fingers wrap it with nothing going inside;
  likewise the knob across the first two fingers with the thumb opposite. Each finger is scored on touching and on
  curling round (a finger laid straight against the handle doesn't count as gripping it); which way round the handle
  the reel hangs is searched too, with the middle and ring fingers parting round its stem. Every candidate is scored
  on contact and on the wrist and forearm staying inside natural limits (bend towards the palm up to 55 degrees, back
  45, towards the thumb 15, towards the little finger 30; the forearm turned no more than 85 degrees palm down or 75
  palm up).

Gate 1 as it stands (`rig/gate1_v12.blend`): all four right fingers curl round the reel seat (middle joints 40 to 106
degrees), the stem between the middle and ring fingers with 7 mm to spare, the thumb along the top; the left hand's
first two fingers wrap the knob, the ring and little fingers curl into the hand behind it; nothing goes into the
equipment by more than about 1 mm. Right wrist 34 degrees back and 12 towards the little finger, forearm turned 53
palm up, elbow 107; left wrist nearly straight, forearm turned 52 palm down, elbow 144. Still to come: the jacket has
cuffs but no folds; on a wide screen the hands sit just under the frame at the game's current first-person view angle
(7 degrees down), so when the rig goes into the game the first-person view should start about 15 degrees down.

Pipeline the game will use once the rig is exported (one path, replacing `createFpHands` behind the same interface):
authored clip for the state, blended between states, then the equipment's attachment points (right hand on the reel
seat, left hand on the knob as the crank turns it), arm IK from the shoulders with the elbow targets, the finger pose
for the grip, and the final skeleton. The older hand solvers stay in the code until the new rig passes the same
end-to-end checks; then they are removed.

Gates, each shown to Aaron before the next starts: 1 static grip, 2 ten reel turns, 3 the two-handed cast, 4 a full
catch in the game.

## Eighth stage (13 November): the rig in the game

Gates 2 and 3 were made in Blender, the rig exported, and it now draws your arms in first person in place of the old
hands. The old hand code (`fpHands.js`, `grips.js`) and its models (`fp_body.glb`, `fp_arms.glb`) are gone.

- **Gate 2, ten turns of the reel** (`source-assets/blender/rig/13_gate2_reel.py`). The crank is keyframed through ten
  uninterrupted turns at one a second, forwards over the top as a spinning reel winds, and the knob drives the left
  hand: the knob turns in the fingers and the hand turns about it only as far as keeps the wrist comfortable (between
  -2 and 8 degrees), the shoulder rising and falling a little with it, the elbow following by IK. Every frame: the first
  two fingers on the knob (their skin 0.8 and 1.1 mm into it, as fingertips press), the thumb 4 mm off it, the ring and
  little fingers curled behind; nothing deeper into the knob, crank, reel or rod than 1.1 mm; wrist bend 7 to 30 degrees
  towards the palm and 5 to 30 towards the little finger, forearm turned 44 to 54 degrees, elbow 99 to 152 degrees; both
  arm bones at 1.0000 of their length on every frame; the ninth and tenth turns identical. Videos from first person, the
  side and close to the knob.
- **The other grips** (`14_grips.py`), searched the Gate 1 way on both hands: the drop net's rope and ring, the landing
  net's pole, the rod's butt and a fish's tail; a relaxed hand and one cupped under a fish. No finger's skin goes into
  what it holds by more than 1.2 mm. On the thicker handles (the pole, the butt, the tail) the palm's skin at the base of
  the fingers goes 6 to 16 mm into the handle where the fingers fold over it; it is inside the fist.
- **Gate 3, the cast** (`15_gate3_cast.py`). Two-handed and overhead, as a 12 ft pier rod is cast. The body's turn is the
  Mixamo "Fishing Cast" motion capture (the chest's turn against the hips, up to 23 degrees in the wind-up), retimed to
  the game's cast. The rod's place is searched at five moments (0.3 s, the wind-up at 0.6 s, 0.72 s, the release at
  0.85 s, the follow-through at 1.25 s) for the place where both arms reach without stretching, the wrists inside
  their range, each elbow where its wrist is most comfortable and hands and arms at least 15 cm from the eye; the left
  hand may hold the butt anywhere along its first 25 cm. The path runs smoothly through those moments, still at the
  hold, the top of the wind-up and the follow-through. One fault found and fixed: the game squared the rod to the
  world's up, so as it went past upright it rolled half a turn about itself and took the right hand round with it (the
  wrist bent 120 degrees). The rod now turns rigidly from the hold, in Blender and in the game (`fpRig.js rodFrame`),
  and the whole cast stays inside the natural range: right wrist 16 to 44 degrees back, 7 to 22 towards the little
  finger, forearm turned up to 55 degrees, elbow 61 to 127; left wrist 42 back to 14 forward, within 17 either side,
  elbow 99 to 149. Both arms at 1.0000 of their length on every frame. Videos from first person, the side and over the
  shoulder.
- **Export** (`16_export.py`, `public/models/fp_rig.glb`, 1.6 MB): the 73 deform bones, the hands and forearms (7,230
  points) and the jacket made lighter (12,000 points), and four clips sampled from the rig: the hold, one turn of the
  reel, the cast, and every grip's fingers. `node tools/fp-rig-data.mjs` makes the numbers that go with it
  (`src/lib/world3d/fpRigData.js`) from what the Blender jobs wrote (`source-assets/blender/rig/data/`).
- **In the game** (`src/lib/world3d/fpRig.js`, the same interface as before). Each frame: the base clip (the hold, the
  cast's body turn at the cast's moment, the reel's shoulder at the knob's angle); the body under the camera with its
  eye at the camera, turning with the view, level when the view looks down by an angle set from the field of view (so
  the held reel sits half way from the middle of the picture to the bottom on a wide screen or a phone); a target for
  each hand from what it holds (the reel seat and the knob by the grips made in Blender, the other handles by the
  cylinder grips, turned about the handle for the most comfortable wrist); two-bone IK from each shoulder, never
  stretching (out of reach the collar bone brings the shoulder forward a little and the body leans towards it over a
  few frames, never snapping), the forearm's twist shared with its lower half; the elbow where Blender's IK put it for
  the hold and the knob and where the wrist is most comfortable anywhere else, kept over the rail when reaching for the
  rope; the fingers set to the grip's pose. Repeated taps to reel are unchanged.
- **Checked against Blender** (`tests/fpRig.test.js`, the rig posed in Node as the game poses it): the hold puts the
  right hand and elbow where Gate 1 has them to within 0.1 mm; the left hand goes round the knob exactly as in Gate 2's
  last turn (within 1 mm) looking ahead, down 43 degrees and up 20, turned either way; the cast keeps the right hand on
  the reel seat (within 2 mm) and the left on the butt (within 5 mm) all the way, no bone ever longer or shorter, the
  wrists and elbows inside their range while both hands are on the rod (the left elbow goes nearly straight for about
  a sixth of a second as that hand goes back to the knob); the other grips reach what they hold with their own finger
  shapes.
- **Test page** (`tools/rig-preview/`, `node tools/build-rig-preview.mjs`): the rig on its own with the same code and
  data: the hold, winding, the cast, the other grips and looking about, from first person, the front, the side, over
  the shoulder or freely, with the skeleton, the IK targets and joints and the attachment points drawn over it and the
  joint angles read out live.
- **Cost.** Posing the arms each frame, measured on the film clock over the same catch (hold, cast, winding, landing)
  in the software-rendered browser here: the rig 0.17 to 0.45 ms a frame on average at a phone's size (the old hands
  0.31 to 0.51), 0.21 to 0.56 ms at a wide screen's (old 0.09 to 0.46); the cast costs most, both hands' grips being
  searched for comfort each frame. The model is 1.55 MB with 18,753 points, against 1.07 MB for the old arms. Not
  measured on a real phone.
- **Gate 4, a whole catch in the game** (`tools/fp-film.mjs`): the hold and looking about, the cast, winding in a
  fight and landing with the drop net, filmed frame by frame from the game on a wide screen and an upright phone (198
  frames each, no page errors). Both hands stay on the reel looking about; at the top of the wind-up the right hand is
  beside your face and fills a corner of the picture; through the follow-through the hands drop to the bottom edge; on
  the drop net the arms reach over the rail to the ring and the rope.

## Ninth stage (13 November, after it went live): the hands turned round what they hold

Aaron's phone showed both hands in the right places but not holding anything: the right hand beside the reel seat
with its fingers away from it, the left hand's fingers hanging off the knob, and so the left hand looked as if it
didn't go round with the handle. Measured with the rig in Node: each hand was turned 90 degrees from Blender's (the
right 90.0 at the hold, the left 96 on the knob), about its own length. The positions were right, which is all the
tests checked.

The cause was in `tools/fp-rig-data.mjs`, carrying Blender's turns into the game. Blender's glTF exporter turns the
whole skeleton from z up to y up once, at its root, and leaves each bone's own axes as Blender has them. So a bone's
turn in the game is that one turn applied to Blender's (C R). The data was written as if the bones' axes had been
turned too (C R C⁻¹), and the palm and grip frames inside each hand (`loc`, `cyl`, `flat`) were turned the
same wrong way. They are now carried over as the exporter carries them; the hand frames stay in Blender's own bone
axes. Nothing else changed: same model, same clips, same code.

- `tests/fpRig.test.js` now also holds each hand's turn to Blender's, not only its place: the right hand at the hold
  within 1 degree of Gate 1 (both the hold clip and the rod grip Blender measured); the left hand within 1 degree of
  Gate 2 at every angle of the knob, looking ahead, down, up and to each side. With the old data these fail at 90
  degrees.
- Filmed in the game at a phone's size, holding and winding with taps (half a turn a tap, four a second): the right
  hand round the reel seat, the left hand's fingers on the knob, going round with it turn after turn.

## Not done

- Not looked at on a real phone or PC: the films are from a software renderer and show shape and movement, not
  smoothness.
- The jacket has cuffs but no folds, and no cloth movement.
- The left thumb sits 4 mm off the knob rather than on it.
- The palm's skin goes into the thicker handles at the base of the fingers (see the grips above); it is inside the fist.
- The landing net's pole, the fish and the rope use the general grips searched in Blender for those sizes, placed in
  the game by the comfort search, not a pose made for each moment; while landing with the drop net the arms reach for
  the rope and ring where the game puts them, leaning when they are further than the arms reach.
- No breathing or weight shift beyond the cast's body turn.
- The third-person angler is a separate model.
