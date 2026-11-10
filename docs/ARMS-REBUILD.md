# First-person arms, hands and animation: rebuild notes

Branch `arms-rebuild`. Aaron's brief of 10 November 2026 asks for the arms, hands and their animation to be rebuilt
to the standard of a current big-studio game, in stages, each shown before the next. This file records what was
found and decided. Nothing here is merged or deployed without Aaron's approval.

## 1. Diagnosis of what the game has now (10 November 2026)

Measured from `public/models/fp_body.glb` (as on branch `hands-hd`, PR #87) and `src/lib/world3d/fpHands.js`, and
from posing the hand in Blender on Aaron's PC (`FishDock-assets/renders/diag_*.png`).

**Mesh.** MakeHuman's base mesh, cut at the forearm: 3,418 points, 3,396 quads for both hands and wrists. It is real
geometry with sound proportions overall (wrist to middle fingertip 20.1 cm, 7.2 cm across the knuckle joints), but
it is a smooth general-purpose body mesh. There are no knuckle forms, tendons, skin folds at the joints or modelled
nail beds; those exist only as paint in the colour map, and since PR #87 as a baked normal map.

**Skeleton.** MPFB's "game engine" rig: collar bone, upper arm, lower arm, hand, and three bones for each finger and
the thumb (19 arm bones a side). No forearm twist bones, no metacarpals, no corrective bones or shapes.
- The first finger bone does not start at the knuckle. The index finger's first joint is 11.4 cm from the wrist and
  its first segment is 2.8 cm long (then 2.6 and 2.9 cm). On a real hand of this size that segment is about 4.5 cm.
  The fingers therefore fold from a point beyond the knuckle, with three near-equal segments: the "claw" look.
- With no twist bones, turning the hand turns the whole forearm as one piece or pinches the wrist.

**Skin weights.** MPFB's automatic weights, 1.9 bones a point on average. Posed in a fist, the fingers fold like
tubes, the back of the hand stays a smooth mitten with no knuckles rising, and the creases collapse inwards.

**Animation.** There are no animation clips and no body. `fpHands.js` (1,164 lines) places each hand from what it
holds, lays the forearm back from the wrist to an elbow fixed in the view, and lays the upper arm from that elbow to
a point beside and below the eye. Fingers curl about one axis per bone by rule. Casting, striking and reeling move
the rod; the hands follow it. The shoulders, chest and head take no part. Third person uses a different person
(Rocketbox) on a different skeleton with different clothes.

**Verdict.** The mesh and rig cannot reach the standard asked for. Better maps (PR #87) improve the surface but not
the joints, the forms or the movement. They need replacing, and the animation needs a body to hang from.

## 2. What a replacement needs

- A hand and arm modelled for close first-person view: knuckles, tendons, nails and joint folds in the geometry,
  with normal, roughness and (ideally) displacement maps at 4096 px.
- A skeleton with the finger joints at the knuckles, a metacarpal or palm bone for the thumb and little finger,
  forearm twist bones, and weights painted for a closed grip.
- One body rig for first and third person, so the same shoulders and chest drive both.

## 3. Foundations considered

| Foundation | Licence as understood | What Aaron would need to do | Notes |
| --- | --- | --- | --- |
| MetaHuman (Epic) | Since June 2025 usable in other engines; free under 1 million US dollars a year revenue (as reported by CG Channel; the licence itself to be read before shipping) | Make and export a character with his Epic account | Whole body, clothes and a full rig; heavy, needs reducing for the web |
| A bought first-person arms model (for example "FPS Arms 01" by Davlet, 15 US dollars, royalty free, 13,292 triangles, 4096 px maps, Blender rig) | Marketplace royalty-free licence, to be read before buying | Buy and download it into `FishDock-assets/downloads` | Made for exactly this view; hands and forearms only, sleeves to be added |
| MakeHuman (what we have) | CC0 | Nothing | Shown above not to be good enough |

Claude cannot buy things, make accounts or sign in, so either of the first two needs Aaron to fetch the files.

## 3a. Foundation chosen (10 November 2026)

Aaron first chose a bought model, then said he would not pay and asked for a free one. A bought model cannot be used
without buying it, so that route is closed.

**Blender Studio's Human Base Meshes bundle, version 1.1.0, licence CC0** (as reported by CG Channel, 28 June 2023;
the bundle itself carries no licence file). Fetched from Blender's own server to
`FishDock-assets/downloads/blender_human_base_meshes/` (47 MB):
`https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.1.0.zip`

What it has, measured in Blender: `GEO-body_male_realistic`, a whole male body of 10,582 points in quads with UVs
and three levels of sculpted detail (about 677,000 points at the finest), 1.69 m tall, arms at the sides; and
`Hand  - Realistic`, a separate hand of 831 points with one finer level. Rendered in plain clay
(`FishDock-assets/renders/hbm2_*.png`), the body's hand has knuckles, tendons across the back, modelled nails and
tapered fingers in a relaxed pose, and the forearm has its muscle forms: the geometry the MakeHuman hand lacks.

What it does not have: a skeleton, skin weights, colour or any other texture, or clothes. Those are to be made:
a skeleton with joints at the knuckles, palm bones and forearm twist bones; weights; normal and ambient-occlusion
maps baked from the finest sculpt level onto a game mesh; a skin colour map (painted by rule from those bakes, since
there is no photograph-based one that fits its UVs); and the jacket sleeves fitted to it. One body, so first and
third person can share it.

## 4. Order of work once a foundation is chosen (from the brief)

1. A test scene in the game: neutral light, orbit camera, the real rod and reel, optional bone and contact overlays.
2. One hand, rigged and weighted, gripping the real rod: shown for review.
3. The arm rig (collar bone to fingers, twist bones, two-bone IK with a pole) and ten turns of the reel: shown.
4. Only then: casting, striking and fighting, landing and handling a fish, walking, the camera, third person.
5. Frame-time measurements on a real PC at 30, 60 and 120 frames a second.
