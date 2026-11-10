# Character, hands and arms: what is actually there (10 November 2026)

Phase 1 of the character rebuild: an inspection of the code and assets on `main`, before anything is changed.
Close-up renders of the grips from five angles (first person, both sides, above, below) were taken in three states
(waiting, reeling, fighting) at Ultra and are referred to below.

## What draws a person today: four separate systems

| | Where | What it is | Skeleton |
|---|---|---|---|
| 1 | `fpHands.js` `buildHand` | A hand built from code (tapered tubes and a palm block). The fallback until the model loads. | Its own, 3 joints a finger |
| 2 | `fpHands.js` `realArms` + `public/models/fp_arms.glb` | Your first-person forearms and hands: cut from a MakeHuman (MPFB, CC0) person in Blender. 4,140 vertices for both arms, one colour texture. | 34 bones: `lowerarm`, `hand`, and 3 bones for each finger and thumb, each side |
| 3 | `figure3d.js` | A whole person built from code. The stand-in until a real person loads, and for some other anglers. | Its own, with its own arm IK |
| 4 | `human3d.js` + `public/people/*.glb` | The third-person people: Microsoft Rocketbox avatars (MIT), with motion-captured walks and retargeted Mixamo poses. | Rocketbox's |

First person (2) and third person (4) are different people, from different libraries, on different skeletons, in
different clothes: the first-person sleeve is a tube coloured from the chosen coat, the third-person jacket is the
Rocketbox model's own.

## Why the hands look wrong

1. **There is no arm.** `fp_arms.glb` stops at the forearm. It has no upper arm, shoulder or collar bone. The elbow
   is a point the code guesses each frame; the sleeve and the upper arm are two separate tubes drawn round it. From
   the side the upper arm is a cylinder floating free of the forearm, and nothing connects either to a body. This is
   why the forearms swing across the view and why they read as props rather than your arms.
2. **The palm cannot cup and the forearm cannot twist.** There are no metacarpal bones (the palm is rigid, so it
   cannot close round a handle) and no forearm twist bones (turning the palm over twists the skin at the wrist joint
   alone). Each finger joint bends about one axis only: there is no spread at the knuckle and no true thumb
   opposition.
3. **No grip is authored. Every grip is solved by code at run time.** `wrap()` bends each finger joint in 0.06 rad
   steps until the end of the segment meets a cylinder standing in for the handle (rod radius 14.5 mm, the knob a
   2 cm cylinder). The real rod, reel stem, reel foot and knob shapes are not used. The result depends on exactly
   where the hand was put and on a scoring search with a dozen hand-tuned weights (`solveGrip`). Changing one weight
   to fix one view moves the answer in the others, which is what the repeated finger adjustments have been doing.
   (Correction, 10 November: the first version of this note cited the fight renders, where the right hand lies flat
   over the rod and the left is open under the reel, as a broken grip. That frame is the rod still in its rest with
   the hands held ready to strike, which is intended. The waiting and reeling grips do close on the handle and knob.)
4. **Several systems write the same transforms.** The hand's place comes from the equipment (`sock`), is clamped by
   a wrist limit, blended from the last grip over 0.3 s (twice: once in the simple hands' state, once in the real
   arms'), rolled with the reel handle (`CRANK.follow`), then the elbow is placed by rule, then the sleeve follows the
   forearm. Hands arriving late, snapping or flipping at the top of a turn come from these layers disagreeing.
5. **The reeling hand follows the knob's position, not its shape.** The left hand is placed from the knob's centre
   with a fixed overhand rotation plus a partial roll. From below it cups under the reel body rather than holding
   the knob between thumb and fingers.
6. **Detail is added by subdivision, not modelling.** The mesh is subdivided once or twice at load (about 66,000
   points on Ultra). That smooths the blocks but adds no knuckles, tendons or nails: those exist only as colour in
   the 1024 px texture.

Not a cause: handedness or coordinate systems. The bones, the rod kit and the scene agree (metres, y up); the grips
are wrong because of how they are made, not because of a flipped axis.

## What follows from that

Small corrections cannot fix 1 to 3: the asset has to be rebuilt in Blender and the grips authored against the real
rod and reel meshes.

- **One person, one skeleton.** A full upper body (collar, upper arm, forearm with twist bones, hand with metacarpals,
  fingers) from the MPFB angler already on the PC (`source/people/angler_man.blend`), in the same jacket in both
  views. First person draws the arms of that body; third person draws all of it.
- **Authored grip poses**, made in Blender on `rodkit.glb` itself: rod grip at the reel seat (stem between middle and
  ring fingers), knob grip, rope grip, fish hold, open and relaxed. Exported as poses; the game blends between them.
- **At run time only two things move the arm:** two-bone IK from the shoulder to the grip's place on the equipment,
  and the pose blend. No per-frame finger solving.
- **The knob drives the hand:** the knob grip is authored in the knob's own frame, so the hand turns with the handle
  and the wrist and forearm absorb the turn.

Needs Blender (5.2 is installed on the PC; there is none in the cloud workspace). Nothing in Blender has been
changed yet.

## Done so far on `character-rebuild`

- **`public/models/fp_body.glb` replaces `fp_arms.glb` in first person** (`source-assets/blender/make_fp_body.py`,
  built in Blender 5.2 on the PC from the same MPFB angler): the arm from the shoulder (upper arm, forearm, hand,
  fingers) with a jacket sleeve modelled on the arm and skinned to the same bones, a turned-in cuff and soft folds.
  3,844 vertices of skin, 4,860 of sleeve, 665 kB.
- **The upper arm is a bone now.** `fpHands.js` lays it from a shoulder (beside and below the eye, turning with your
  heading) to the elbow at its own length, then the forearm from it. The drawn sleeve tube, cuff and upper-arm
  cylinder are not used when this model loads; `fp_arms.glb` and they remain as the fallback.
- Not done yet: palm and twist bones, authored grip poses, one person across first and third person, the casting,
  fighting, walking and landing animation work, skin and cloth shading beyond what was there.
