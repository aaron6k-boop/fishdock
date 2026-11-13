# The first-person character rig (Blender)

The first-person arms and hands are a rig made in Blender, and the game poses it (`src/lib/world3d/fpRig.js`; see
`docs/CHARACTER-REBUILD.md`, seventh and eighth stages). These scripts make it. They run in Blender 5.2 on Aaron's PC against the
working folder `Documents\FishDock-assets` (`rig/` for the `.blend` files, `renders/rig/` for the checks). Each one is
written to be dropped into that folder's `queue/` and run by the queue watcher there, in name order; they read the
helpers in `lib/` from the working folder's `scripts/` (copy them there first).

| Script | Makes |
| --- | --- |
| `01a/01b_measure_joints.py` | The joints measured from the Blender Studio realistic male (CC0): shoulders, elbows, wrists, every finger's centre line (`rig/joints.json`) |
| `02_build_rig.py` | A Rigify human rig fitted to those joints, the skin bound to its deform bones (`rig/fp_character.blend`) |
| `03_jacket.py` | The jacket, made from the rigged body itself, so the same bones bend it |
| `04_finger_hinges_roll.py`, `05_finger_hinges_axis.py` | The fix for the fingers: every finger bends about its own X axis, laid along the knuckles' line (they bent sideways before) |
| `06/07_jacket_chest_*.py` | The jacket's chest smoothed and held just outside the body |
| `08a/08b_*mixamo*.py` | The Mixamo fishing idle (already used by the third-person anglers) retargeted onto the rig for the spine, chest and shoulders (`rig/mocap_idle.blend`) |
| `09_gate1_grips.py` | Gate 1: the static hold. Grasp search on the hand's real skin (each finger scored on touching and on curling round the handle), the reel's hang round the handle searched with the middle and ring fingers parting round the stem, the rod placed within reach and in view, both arms by IK, the crank and the left hand's grip chosen together (`rig/gate1_v11.blend`, `rig/gate1_v11.json`) |
| `11_gate1_left_fingers.py` | The left hand's ring and little fingers curled as a relaxed hand curls them, clear of the knob, crank and reel (`rig/gate1_v12.blend`) |
| `12_jacket_cuffs.py` | The last 3.5 cm of each sleeve made a cuff standing 4 mm proud |
| `10_gate1_renders.py` | The Gate 1 renders: first person as the game frames it, front, side, over the shoulder, each hand from five sides |
| `check_finger_hinges.py` | Which way each finger moves when its knuckle bends |
| `13_gate2_reel.py` | Gate 2: ten uninterrupted turns of the handle, one a second. The knob turns in the fingers, the hand turning about it only as far as keeps the wrist comfortable, the shoulder rising and falling a little; contact measured every frame; videos from first person, the side and close to the knob (`rig/gate2_reel.blend`, `rig/gate2_rows.json`) |
| `14_grips.py` | The other grips, searched the Gate 1 way on both hands: the drop net's rope and ring, the landing net's pole, the rod's butt, a fish's tail; a relaxed hand and one cupped under a fish (`rig/grips.json`) |
| `15_gate3_cast.py` | Gate 3: the two-handed overhead cast of the 12 ft rod. The body's turn from the Mixamo "Fishing Cast" capture; the rod's place at five moments searched for both arms in reach with the wrists in range, the elbows where the wrists are most comfortable, the left hand anywhere along the butt's first 25 cm; the rod turned rigidly from the hold (never rolled as it passes upright); every frame measured; videos (`rig/gate3_cast.blend`, `rig/gate3_cast.json`) |
| `16_export.py` | The export: the deform skeleton, the hands and forearms, the jacket (made lighter), and the clips hold, reel, cast and grips (`export/fp_rig.glb`, copied to `public/models/`, and `rig/fp_rig_meta.json`) |
| `data/` | What the jobs wrote that the game's numbers are made from: `node tools/fp-rig-data.mjs` turns them into `src/lib/world3d/fpRigData.js` |

Every solve prints what it measured: the gap between each finger bone's skin and the equipment, the wrist's bend
(towards the palm or back, towards the thumb or the little finger), the forearm's turn from palm-in, the elbow's angle
and both arm bones' lengths against their rest length (they must stay at 1.000: an arm is never stretched).

The libraries in `lib/`: `riglib`, `griplib`, `posing_v3`, `skin_v2` (the rig, the equipment, the hand's skin in numpy),
`gatelib_v1` (the wrist's angles, the bone lengths, the limits), `grasplib_v3` (the grasp search as a library),
`render_g1_v1`, `render_fp_v1` and `scene_v1` (the look for renders and videos).

Credits: Blender Studio Human Base Meshes (CC0); Rigify (Blender); Mixamo fishing idle and fishing cast (Adobe's terms:
royalty free in games; the `.fbx` files stay in the working folder, only their turn of the body is carried onto the rig).
