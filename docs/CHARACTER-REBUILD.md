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

## Not done

- The hand mesh is the same one. Its measurements are right and it bends cleanly at the wrist, so it was kept. Its
  weak points are a bare tight fist (the knuckles are still somewhat angular and the thumb's web still stretches,
  after the weights were eased) and blocky colour on the palm; no corrective shapes or palm bones have been added.
- Other games show less arm than this does on an upright phone: The Angler's hands take up about a third of a wide
  screen's height. The view here has not been changed again.
- With an arm at full stretch, or where a wrist would have to bend too far, the upper arm's top end still comes away
  from the shoulder (by 20 to 35 cm in places while landing). It is out of the picture when it happens.
- The left hand is below the picture at the moment of release: looking ahead you see it on the butt in the wind-up
  and not again until it comes to the reel.
- Line is not drawn from the spool to the first finger and up through the rings at the reel.
- For a frame or so as the hands change over on the rope a dark patch of sleeve shows at the left edge.
- No torso or legs in first person: looking straight down you see the deck, not your body.
- The first-person arms and the third-person angler are still separate models. The cast now moves the rod the same
  way in both; other moves are not shared.
- No breathing or weight shift. The older hand solver is still in the code for holds without a made grip.
- No frame times from a real phone or PC. The recordings are from a software renderer and show shape and movement
  only, not smoothness.
