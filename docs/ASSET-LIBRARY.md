# FishDock asset library

Written by `node tools/asset-library.mjs` from the licence register (`source-assets/ASSET-LICENCES.json`) and the game-ready
files themselves: every number here is measured from the file. Run it again after adding or changing an asset.

Licences are as recorded in the register when each asset was downloaded; anything new is checked asset by asset before
it goes in (an asset site's other assets may be under other terms).

## Game-ready models (`public/models/`)

| File | What | Drawn | Size | Triangles | Textures inside | Animations |
|---|---|---|---|---|---|---|
| fish.glb | Fish bodies, fins and eyes | close (in the hand) to mid (in the water) | 628 KB | 33,896 | none | none |
| fp_rig.glb | Your arms, hands and jacket in first person, skeleton and clips | close (first person), one level | 1.5 MB | 37,414 | none | 4 |
| nets.glb | Drop net and landing net | close to mid | 491 KB | 6,692 | 512x512, 512x512, 512x512, 512x512 | none |
| pierprops.glb | Lamps, lifebuoy stations, bollards, benches | all distances, instanced along the pier | 692 KB | 5,786 | 512x512, 512x512, 512x512, 512x512, 512x512, 512x512, 512x512 | none |
| reel.glb | The reel, older single model | close | 175 KB | 7,384 | none | none |
| rodkit.glb | The rod (handle, seat, guides, blank) and the spinning reel | close; the 3D view hides it past a few metres | 401 KB | 17,456 | none | none |

## Game-ready textures (`public/textures/`)

| File | Size | Pixels | Format |
|---|---|---|---|
| brick_red_diff.jpg | 269 KB | 1024x1024 | jpeg |
| brick_red_nor.jpg | 47 KB | 512x512 | jpeg |
| brick_red_rough.jpg | 11 KB | 256x256 | jpeg |
| cap_concrete_diff.jpg | 17 KB | 512x512 | jpeg |
| cap_concrete_nor.jpg | 33 KB | 512x512 | jpeg |
| cap_concrete_rough.jpg | 1 KB | 256x256 | jpeg |
| deck_worn_diff.jpg | 20 KB | 512x512 | jpeg |
| gorleston_northbank.webp | 40 KB | 2260x228 | webp |
| gorleston_northbank_lights.webp | 3 KB | 2260x228 | webp |
| gorleston_pierhead.webp | 145 KB | 3800x364 | webp |
| gorleston_riverside.webp | 74 KB | 3200x264 | webp |
| gorleston_town_lights.webp | 4 KB | 4000x182 | webp |
| ground_rough_diff.jpg | 193 KB | 1024x1024 | jpeg |
| ground_rough_nor.jpg | 84 KB | 512x512 | jpeg |
| pier_concrete_diff.jpg | 334 KB | 1024x1024 | jpeg |
| pier_concrete_nor.jpg | 184 KB | 1024x1024 | jpeg |
| pier_concrete_rough.jpg | 28 KB | 512x512 | jpeg |
| plaster_diff.jpg | 227 KB | 1024x1024 | jpeg |
| plaster_nor.jpg | 18 KB | 512x512 | jpeg |
| plaster_rough.jpg | 1 KB | 256x256 | jpeg |
| rock_granite_diff.jpg | 100 KB | 512x512 | jpeg |
| rock_granite_nor.jpg | 206 KB | 512x512 | jpeg |
| rock_granite_rough.jpg | 18 KB | 256x256 | jpeg |
| wall_moss_diff.jpg | 29 KB | 512x512 | jpeg |
| wall_rust_diff.jpg | 77 KB | 1024x1024 | jpeg |
| wall_rust_nor.jpg | 50 KB | 1024x1024 | jpeg |
| wall_rust_rough.jpg | 5 KB | 256x256 | jpeg |
| water_normal.jpg | 66 KB | 512x512 | jpeg |

## Third-party sources (the licence register)

| Asset | Author | Source | Licence | Attribution | Used for | Original files kept |
|---|---|---|---|---|---|---|
| Gray Pier | Sergey Rudavin | https://polyhaven.com/a/gray_pier | CC0 1.0 | Not required (credited anyway in CREDITS) | sky and light for piers | `gray_pier_2k.hdr` (5.8 MB) |
| Concrete Pavement | Charlotte Baglioni | https://polyhaven.com/a/concrete_pavement | CC0 1.0 | Not required (credited anyway in CREDITS) | pier deck | `concrete_pavement_2k.gltf` (3 KB), `concrete_pavement_arm_2k.jpg` (3.3 MB), `concrete_pavement_nor_gl_2k.jpg` (4.9 MB), `concrete_pavement_diff_2k.jpg` (3.6 MB), `concrete_pavement.bin` (2.3 MB) |
| Concrete Moss | Rob Tuytel | https://polyhaven.com/a/concrete_moss | CC0 1.0 | Not required (credited anyway in CREDITS) | weed on the harbour wall round the waterline (public/textures/wall_moss_diff.jpg, 512 px) | `concrete_moss_2k.gltf` (3 KB), `concrete_moss_nor_gl_2k.jpg` (3.5 MB), `concrete_moss_diff_2k.jpg` (2.6 MB), `concrete_moss.bin` (2.3 MB), `concrete_moss_arm_2k.jpg` (1.4 MB) |
| Rusty Painted Metal | Amal Kumar | https://polyhaven.com/a/rusty_painted_metal | CC0 1.0 | Not required (credited anyway in CREDITS) | rust runs and pitting on the harbour wall's steel piling (public/textures/wall_rust_*.jpg, 1024 px colour and normal, 256 px roughness) | `rusty_painted_metal_2k.gltf` (3 KB), `rusty_painted_metal_nor_gl_2k.jpg` (2.2 MB), `rusty_painted_metal_diff_2k.jpg` (1.8 MB), `rusty_painted_metal_arm_2k.jpg` (1.5 MB), `rusty_painted_metal.bin` (2.3 MB) |
| Lifebuoy | Hank Kaamura | https://polyhaven.com/a/lifebuoy | CC0 1.0 | Not required (credited anyway in CREDITS) | the lifebuoy in the pier lifebuoy stations (public/models/pierprops.glb) | `lifebuoy_1k.gltf` (3 KB), `lifebuoy_nor_gl_1k.jpg` (886 KB), `lifebuoy_diff_1k.jpg` (821 KB), `lifebuoy_arm_1k.jpg` (600 KB), `lifebuoy.bin` (249 KB) |
| Coast Rocks 01 | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/coast_rocks_01 | CC0 1.0 | Not required (credited anyway in CREDITS) | rocks at the foot of the pier | `coast_rocks_01_1k.gltf` (3 KB), `coast_rocks_01.bin` (18.4 MB), `coast_rocks_01_nor_gl_1k.jpg` (897 KB), `coast_rocks_01_arm_1k.jpg` (589 KB), `coast_rocks_01_diff_1k.jpg` (820 KB) |
| Plastic Crate 01 | PierreB3D | https://polyhaven.com/a/plastic_crate_01 | CC0 1.0 | Not required (credited anyway in CREDITS) | bait crate prop | `plastic_crate_01_1k.gltf` (3 KB), `plastic_crate_01_nor_gl_1k.jpg` (864 KB), `plastic_crate_01_diff_1k.jpg` (506 KB), `plastic_crate_01_arm_1k.jpg` (970 KB), `plastic_crate_01.bin` (771 KB) |
| Street Lamp 01 | Josh Dean | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Not required (credited anyway in CREDITS) | pier lamps (public/models/pierprops.glb, textures cut to 512 px) | `street_lamp_01_1k.gltf` (6 KB), `street_lamp_01_arm_1k.jpg` (649 KB), `street_lamp_01_diff_1k.jpg` (301 KB), `street_lamp_01_nor_gl_1k.jpg` (428 KB), `street_lamp_01.bin` (731 KB) |
| Net001A | Lennart Demes (ambientCG) | https://ambientcg.com/view?id=Net001A | CC0 1.0 | Not required (credited anyway in CREDITS) | drop net and landing net mesh | `Net001A_2K-JPG.zip` (12.3 MB) |
| Net002A | Lennart Demes (ambientCG) | https://ambientcg.com/view?id=Net002A | CC0 1.0 | Not required (credited anyway in CREDITS) | fine knotless net mesh | `Net002A_2K-JPG.zip` (15.5 MB) |
| Rope001 | Lennart Demes (ambientCG) | https://ambientcg.com/view?id=Rope001 | CC0 1.0 | Not required (credited anyway in CREDITS) | drop-net rope | `Rope001_2K-JPG.zip` (11.6 MB) |
| Fabric085 | Lennart Demes (ambientCG) | https://ambientcg.com/view?id=Fabric085 | CC0 1.0 | Not required (credited anyway in CREDITS) | waterproof jacket fabric | `Fabric085_2K-JPG.zip` (30.9 MB) |
| MakeHuman system assets (skins, eyes, eyebrows, eyelashes, teeth, tongue) | MakeHuman team (makehuman_system) | https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html | CC0 1.0 | Not required (credited anyway in CREDITS) | anglers' skin, eyes, brows | `makehuman_system_assets_cc0.zip` (267.7 MB) |
| Human Base Meshes bundle, version 1.1.0 (the realistic male body) | Blender Studio | https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.1.0.zip (listed at https://www.blender.org/download/demo-files/) | CC0 1.0, as announced at its release (reported by CG Channel, 28 June 2023); the bundle itself carries no licence file | Not required; credited in public/models/CREDITS.txt | your arms, hands and jacket in first person (public/models/fp_rig.glb): the body rigged with Rigify, its hands and forearms and a jacket made from it (source-assets/blender/rig/). Before 13 November 2026, the hands and wrists of fp_body.glb |  |
| MPFB (MakeHuman plugin for Blender), installed from extensions.blender.org | MakeHuman team | https://extensions.blender.org/add-ons/mpfb/ | GPL-3.0 (the tool); the humans it makes are CC0 1.0 | Not required for the models it produces | makes and rigs the anglers |  |
| Concrete Floor Worn 001 | Dimitrios Savva, Rico Cilliers | https://polyhaven.com/a/concrete_floor_worn_001 | CC0 1.0 | Not required (credited anyway in CREDITS) | worn patches on the pier deck (public/textures/deck_worn_diff.jpg, 512 px) | `concrete_floor_worn_001_1k.gltf` (3 KB), `concrete_floor_worn_001_diff_1k.jpg` (116 KB), `concrete_floor_worn_001.bin` (2.3 MB), `concrete_floor_worn_001_rough_1k.jpg` (178 KB), `concrete_floor_worn_001_nor_gl_1k.jpg` (108 KB) |
| Concrete Floor 02 | Rob Tuytel | https://polyhaven.com/a/concrete_floor_02 | CC0 1.0 | Not required (credited anyway in CREDITS) | the pier deck (public/textures/pier_concrete_*.jpg) | `concrete_floor_02_1k.gltf` (4 KB), `concrete_floor_02_rough_1k.jpg` (311 KB), `concrete_floor_02_diff_1k.jpg` (758 KB), `concrete_floor_02.bin` (2.3 MB), `concrete_floor_02_nor_gl_1k.jpg` (188 KB) |
| Concrete Wall 004 | Dario Barresi, Charlotte Baglioni | https://polyhaven.com/a/concrete_wall_004 | CC0 1.0 | Not required (credited anyway in CREDITS) | the harbour wall's concrete cap (public/textures/cap_concrete_*.jpg, 512 px colour and normal, 256 px roughness) | `concrete_wall_004_1k.gltf` (3 KB), `concrete_wall_004_rough_1k.jpg` (228 KB), `concrete_wall_004_nor_gl_1k.jpg` (970 KB), `concrete_wall_004_diff_1k.jpg` (520 KB), `concrete_wall_004.bin` (2.3 MB) |
| Water normals | three.js authors | https://github.com/mrdoob/three.js/blob/dev/examples/textures/waternormals.jpg | MIT (the three.js repository's licence) | Copyright 2010-2025 three.js authors, MIT licence | the sea's fine ripples (public/textures/water_normal.jpg) | `water_normal.jpg` (NaN KB) |
| Red Brick 03 | Poly Haven | https://polyhaven.com/a/red_brick_03 | CC0 1.0 | Not required (credited anyway in CREDITS) | the coastwatch building's brick (public/textures/brick_red_*.jpg, 1024 px colour, 512 px normal, 256 px roughness) | `red_brick_03_diff_1k.jpg` (678 KB), `red_brick_03_nor_gl_1k.jpg` (933 KB), `red_brick_03_rough_1k.jpg` (280 KB) |
| Painted Plaster Wall | Poly Haven | https://polyhaven.com/a/painted_plaster_wall | CC0 1.0 | Not required (credited anyway in CREDITS) | the coastwatch building's white paint and render (public/textures/plaster_*.jpg) | `painted_plaster_wall_diff_1k.jpg` (671 KB), `painted_plaster_wall_nor_gl_1k.jpg` (879 KB), `painted_plaster_wall_rough_1k.jpg` (346 KB) |
| Coast Sand Rocks 02 | Poly Haven | https://polyhaven.com/a/coast_sand_rocks_02 | CC0 1.0 | Not required (credited anyway in CREDITS) | rough ground on the cliff's face and the dune at Gorleston (public/textures/ground_rough_*.jpg) | `coast_sand_rocks_02_diff_1k.jpg` (820 KB), `coast_sand_rocks_02_nor_gl_1k.jpg` (1.2 MB) |
| Granite (generated) | FishDock (made from seeded noise) | source-assets/make_granite.py | Made for FishDock: no outside image | None needed | the rock armour's boulders (public/textures/rock_granite_*.jpg) |  |
| View into the harbour from South Pier, Gorleston-on-Sea | Christopher Hilton | https://commons.wikimedia.org/wiki/File:View_into_the_harbour_from_South_Pier,_Gorleston-on-Sea_-_geograph.org.uk_-_7618525.jpg (Geograph photo 7618525) | CC BY-SA 2.0 | Required: photo by Christopher Hilton, CC BY-SA 2.0. The adapted image is itself CC BY-SA 2.0 (share-alike). | the Gorleston riverside as the far shore in the 3D view at Gorleston South Pier (public/textures/gorleston_riverside.webp), its sky and near foreground made transparent |  |
| Gorleston South Pier | habiloid | https://commons.wikimedia.org/wiki/File:Gorleston_South_Pier_-_geograph.org.uk_-_6234922.jpg (Geograph photo 6234922) | CC BY-SA 2.0 | Required: photo by habiloid, CC BY-SA 2.0. The adapted image is itself CC BY-SA 2.0 (share-alike). | the town at the landward end of the pier in the 3D view at Gorleston South Pier (public/textures/gorleston_pierhead.webp), its sky and near foreground made transparent, its colours and contrast lifted from dusk to daylight, its shadows lightened, the lit lamps painted out, lightly sharpened, its cut end thinned to a stipple (source-assets/backdrop_day.py) |  |
| The River Yare seen from Gorleston South Pier | habiloid | https://commons.wikimedia.org/wiki/File:The_River_Yare_seen_from_Gorleston_South_Pier_-_geograph.org.uk_-_6235518.jpg (Geograph photo 6235518) | CC BY-SA 2.0 | Required: photo by habiloid, CC BY-SA 2.0. The adapted images are themselves CC BY-SA 2.0 (share-alike). | the port's sheds on the north bank in the 3D view at Gorleston South Pier (public/textures/gorleston_northbank.webp) and their lamps after dark (gorleston_northbank_lights.webp); the town's lamps after dark (gorleston_town_lights.webp) come from Geograph 6234922, listed above |  |
| Mixamo "Fishing Cast" motion capture | Adobe Mixamo | https://www.mixamo.com (downloaded by Aaron as fishing_cast.fbx; kept on his PC, not in the repository) | Adobe's Mixamo terms: characters and animations may be used royalty free for personal, commercial and non-profit projects, video games included (https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Not required; credited in public/models/CREDITS.txt and Settings | the body's turn through the first-person cast: the chest's turn against the hips, retargeted onto the Rigify rig and baked into fp_rig.glb's cast clip (source-assets/blender/rig/15_gate3_cast.py) |  |
| First-person arms, hands and jacket, rigged (derived) | FishDock | source-assets/blender/rig/ (Rigify on Blender Studio's realistic male, see blender:human-base-meshes; the cast's body turn from adobe:mixamo-fishing-cast) | CC0 1.0 (as its sources allow) | Not required | your arms and hands in first person (public/models/fp_rig.glb), replacing fp_body.glb and fp_arms.glb |  |

Made for FishDock in Blender (no outside assets): the rod kit, the reel, the nets' frames, the fish bodies, the bench,
bollard and lifebuoy housing; their scripts and sources are in `source-assets/blender/`. Attribution owed under CC BY-SA
(the Gorleston photographs) is given in the app and in `public/models/CREDITS.txt`.

