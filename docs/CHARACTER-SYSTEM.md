# FishDock character system: audit and plan

Aaron's brief of 17 November 2026 (with his reference sheet: a bearded man in a beanie and a black waterproof
jacket, a woman in a cap, body types, the cast, the reel, the net and the catch held, first-person hands, LODs, the
skeleton): replace the simple anglers with realistic, rigged, customisable people, without breaking the fishing.
This is the working record. Anything not done is listed as not done.

## Phase 1: what there is now (audited 17 November)

| Part | What it is | Files |
| --- | --- | --- |
| Third-person people | 19 Microsoft Rocketbox avatars (MIT), men and women of several ages and skin tones, everyday clothes; each 0.6 to 1.5 MB with 1024 px maps, and an `_hd` file with the library's 2048 px maps for High and Ultra. About 34,000 points each. | `public/people/*.glb`, `src/lib/world3d/human3d.js`, `people.js` |
| The skeleton | Rocketbox's Biped (`Bip01_*`): pelvis, three spine bones, neck, head, clavicles, arms, hands, five fingers of three bones each, legs, feet, toes, and 28 face bones (jaw, lips, cheeks, brows, eyelids, eyes). No twist bones. Every person shares it. | |
| The angler in fishing clothes | One of them (`angler1`, the man with short hair, `m05`) in a jacket, trousers and wellies made in Blender from his own body, skinned to his bones. Plain cloth, few folds, no seams or pockets, about 40,000 points with the body. | `source-assets/blender/make_angler_clothes.py` |
| Customisation | Choose one of the 19 people; jacket, trousers and boot colours; boots, wellies in three colours; beanie, cap, bucket hat, hood down or up; a life jacket; gloves. Saved on the phone (`fishdock.look`) and sent to a party you join. Anyone who hasn't chosen gets a steady look from their id. | `src/components/LookPicker.jsx`, `people.js` `cleanLook`, `lookFor` |
| Animation | Rocketbox's own motion capture (walks for men and women at four speeds, a jog, idle, looking round, cheering, clapping) and Mixamo moves retargeted onto the same skeleton in Blender (the fishing idle, the cast, crouching, kneeling, inspecting, picking up, pulling a rope, turning, a run). Blended by speed; the walk's phase driven by distance walked. | `public/people/anims.glb`, `anims2.glb`, `source-assets/blender/retarget_mixamo.py` |
| IK and posing | Two-bone arm IK to wherever the angler code puts each hand (the rod, the reel's knob, the net's rope or pole, a fish), fingers curled to the grip; leg IK holding a planted foot and keeping feet on the ground; the chest leans and turns, the head watches the rod tip, the float or the fish; blinking; the jaw moves in voice chat. | `human3d.js` |
| First person | Your own arms: the Blender Studio realistic male (CC0) rigged with Rigify, its hands and forearms and a jacket made from it; grips, the reel's turn and the cast solved in Blender; your skin colour and jacket colour carried over. | `public/models/fp_rig.glb`, `fpRig.js`, `source-assets/blender/rig/` |
| Other anglers | The same people, chosen by id or by their own choice, posed by the same code. | `world.js`, `spawn.js` |
| Levels of detail | None for people: every person is drawn whole at any distance. | |
| Assets on Aaron's PC | Blender 5.2 with MPFB (MakeHuman, CC0 output); MakeHuman's system assets (CC0); the Blender Studio Human Base Meshes (CC0: realistic male and female bodies, heads, hands, feet); the Rocketbox sources used; the Mixamo moves. | `FishDock-assets/downloads` |

What works and is kept: the shared skeleton and every animation and IK on it, the save and party sharing, the
first-person grips. What falls short of the brief: the faces and bodies are 2015 game quality; the fishing clothes
are plain shells with no seams, pockets, zips or weathering; hair, beards and hats are not modular; there are no
body types; nothing is lighter at a distance.

## The plan, in stages (each one live and seen in the game before the next)

The new people are built on the same `Bip01` skeleton, so every walk, move, grip and IK already in the game carries
over unchanged and nothing that works is broken. Faces and bodies start from licensed realistic sources (Rocketbox,
MIT; the Blender Studio base meshes and MakeHuman assets, CC0); everything added (clothes, hats, beards, boots, the
body types, the levels of detail) is made in Blender for FishDock, original, and recorded in the licence register.

1. **The main male angler.** The reference's look: a weathered man with a short beard, a knitted beanie, a black
   waterproof jacket (hood down at the collar, storm flap and zip, chest pockets with flaps, hand-warmer pockets,
   cuffs with tabs, a drawcord hem, yoke and sleeve seams, folds at the elbows and waist), waterproof trousers
   (knee seams, a cargo pocket, tucked into the boots) and green wellington boots (tread, heel, top band, side
   strap). Physically based materials: coated nylon with a ripstop weave, wet sheen, salt and dirt at the hems;
   rubber; knit. Three levels of detail (about 60,000, 25,000 and 8,000 triangles), switched by distance. Your own
   first-person sleeves in the same jacket.
2. **The female angler**, the same clothes fitted to her, a cap and hair tied back.
3. **Body types** (lean, average, stocky) for both, the clothes following them.
4. **Modular choices**: heads, hair and beards, hats (beanie, cap, bucket hat, head torch), jackets (four colours
   and patterns), trousers, boots, gloves, a snood, glasses, a rucksack; the picker rebuilt for them; saved and
   shared as now.
5. **Animation**: the cast's wind-up and release, playing a fish, the landing net and holding the catch, from the
   reference's poses, blended with what is there; foot IK on uneven ground; the head looking at what you are doing.
6. **The other anglers** on the pier in the new people, varied, with lighter levels of detail and their animation
   updated less often far away.
7. **Benchmark and film** on Aaron's PC on High and Ultra; fix what shows; publish.

## Progress

Stage 1 started 17 November, 23:15.

**The main angler (`angler2`), 18 November, 00:05.** Built by three scripts in `source-assets/blender/people2`:

- `a_build.py` (Blender, on Aaron's PC): the Rocketbox man with short hair (`m05`), his texture seams joined and one
  level of Catmull-Clark subdivision applied under the skeleton (about 5,000 points to 23,000, so the head, hands and
  every garment are round, not faceted). The garments are cut from his own surface and shaped into cloth: the jacket
  stands 1.6 cm off the body (2.8 at the hem, 1.4 to 2.1 down the sleeves), the trousers 1.6 (1.2 where they go into
  the boots), the boots 1.2 at the foot and 2.7 round the calf, outside the trousers. Folds are displaced into the cloth
  inside the elbows, at the armpits, round the waist and at the knees and boot tops. Every edge is cut by a plane once
  the cloth has its shape (the hem, a neckline lower at the front, the sleeves 3 cm short of the wrist, the boot tops),
  so it runs straight. Parts are cut from the garments by planes and stand off them with a thickness: the storm flap,
  two chest and two hand-warmer pockets, the cuffs, the hem band, the trousers' cargo pockets, the boots' top band.
  The collar is a band built round the neckline (7 cm at the back, 5 at the front, open at the zip); the hood is
  rolled behind it; press studs down the flap, toggles on the hem, a buckle on each boot. The beard is a shell lifted
  1.5 to 5 mm off his jaw, chin, cheeks and upper lip, with only the lips left bare (an oval measured from the lip and
  mouth-corner bones). Everything carries his own bone weights.
- `textures.py`: each garment's texture drawn on its own surface (every texel found on the garment in 3D): coated
  nylon with a ripstop grid, seams with stitching, stitched part edges, creases, salt marks, dirt at the hem and cuffs,
  worn edges; the trousers rougher with knee darts and mud; rubber with moulding lines, a tread and mud for the boots;
  short strands for the beard. Colour (in grey, so the game colours it as the kit), normal and roughness maps.
- `b_finish.py`: materials, the body taken away under the clothes where it can never show, three levels of detail
  (about 60,000 to 74,000, 23,000 and 7,000 triangles), exported as `angler2_hd.glb` (7.6 MB, 2048 maps, all three
  levels) and `angler2.glb` (3.1 MB, 1024 maps, the two lighter levels), and rendered to check.

In the game (`human3d.js`): the levels of detail switch by distance from the camera (13 and 36 m, with a margin);
the clothes take the kit's colours ("as they come": black jacket, charcoal trousers, green wellies); the beard takes
the colour chosen in the picker, thinned to stubble or left off.

**Body types (Slim, Medium, Broad) for every person**, 18 November: one morph worked out in the browser from each
mesh's own bind pose (`buildMorph`), the same for the body and everything worn because each garment point carries the
bones of the body under it: wider at the chest and sides, fuller at the belly, thicker arms, legs and neck, the arms
and legs a little out with them; the head, hands and feet unchanged. Tested: a garment 2 cm outside the body stays
outside it at every build (`tests/bodyBuild.test.js`).

**Glasses and a head torch** for every person (thin frames with clear lenses, or sunglasses; a band round the head or
over the hat with a lamp at the front), placed from the face measured at the eyes.

**Animation and IK carried over.** Every walk, the cast, playing a fish (the body braced, leaning back and crouching
with the line's tension, pumping and giving to surges), the landing net, holding the catch, foot planting, the head
watching the rod tip or the fish, the hands on the rod, reel handle, net or fish: all on the shared skeleton, so the new
people use them unchanged. No new motion-captured animation has been made.

## Not done (so far), and why

- **Faces and bodies are still Rocketbox's** (2015 game quality, made smoother by one level of subdivision). Replacing
  them with the Blender Studio base meshes or MakeHuman would mean new faces, skin textures, eyes, hair and a new rig
  fitted to the shared skeleton for every person: not attempted in this pass.
- **Hairstyles are not modular**: each person's hair is part of their head's texture and mesh. The hair colour chosen
  colours the main angler's beard; hats, the hood and the head torch go over any head.
- **Face presets** (separate from choosing a person) are not made.
- **Jackets**: one cut (the waterproof), in any of the kit's colours; no hoodie, gilet or patterned jackets yet.
- **No new motion capture or keyframed animation**: the existing moves and IK carry over (above). The reference
  sheet's poses are what the game already does with them; nothing was matched pose by pose.
