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
