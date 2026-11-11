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

## Not done

- The hand mesh is the same one. It measured as correct, so it was kept; it has not been replaced.
- No clavicle or shoulder movement, no palm bones, no corrective shapes. The twist bones are not driven.
- The cast is still one-handed, which is wrong for a 12 ft pier rod.
- No torso or legs in first person: looking straight down you see the deck, not your body.
- The first-person arms and the third-person angler are separate models with separate animation.
- The rod, reel and line routing have not been audited against real tackle.
- No breathing or weight shift. The older hand solver is still in the code for holds without a made grip.
- No frame times from a real phone or PC with the new model. The films are from a software renderer.
