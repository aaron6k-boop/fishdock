# FishDock native (Unreal Engine 5): Gorleston South Pier

The browser game stays as the phone version. This folder is the start of a separate Windows game built in Unreal
Engine 5, which can draw what a browser cannot: ray-traced global illumination and reflections (Lumen), film-quality
shadows, a simulated ocean (the Water plugin), dense geometry (Nanite) and a full character and animation system.

## What exists so far

- `tools/export-scene.mjs` writes the reconstructed place as one `.glb`: ground, pier, harbour walls, breakwater,
  buildings, trees, fences, steps and props, with plain PBR materials and the textures the web game draws. The sea,
  sky, lights and people are left out, as Unreal brings its own. Tested: Gorleston exports as a valid glTF 2.0 file
  (about 36 MB, 10,000 nodes, 830,000 triangles, 79 textures).
- `setup_level.py` (below) is an editor script that adds the sun, sky, clouds and fog. **It has not been run:** there
  is no Unreal Engine where this was written. Treat it as a first draft.

Nothing here has been opened in Unreal yet. No frame rates or visual results are claimed.

## To make the export

    FISHDOCK_FILM=1 node tools/build.mjs
    node tests/e2e/server.mjs 8816 --dist
    node tools/export-scene.mjs http://localhost:8816 gorleston.glb

## First steps on the PC

1. Install the Epic Games Launcher, then Unreal Engine 5.4 or later from its Library tab (free; about 60 GB).
2. New project: Games, Blank, Blueprint, Desktop, Maximum quality, Ray tracing on. Name it `FishDockNative`.
3. Edit, Plugins: enable **Water** and **Interchange glTF** (on by default in 5.4). Restart the editor.
4. File, New Level, Empty Open World (or Basic). Then File, Import Into Level, choose `gorleston.glb`, destination
   `/Game/Gorleston`. Units are converted by the importer (metres, y up to centimetres, z up).
5. Tools, Execute Python Script, choose `native/unreal/setup_level.py` (needs the Python Editor Script plugin).
6. Add a Water Body Ocean (Place Actors, search "Water Body Ocean") at height 0 and enlarge it to cover the harbour.

## What is not ported yet

The fishing itself (cast, bite, fight, landing, the drop net), the first-person hands and rod rig, the fish, sound,
weather and time of day, catch logging and Fish Together. The web game's rules live in plain JavaScript modules
(`src/lib/fishing/` and `src/lib/world3d/angler.js`); they have to be rewritten in Blueprint or C++.

Sources: the map data is OpenStreetMap (ODbL: credit "© OpenStreetMap contributors" in the game); photo textures are
Poly Haven (CC0); the people are MakeHuman/MPFB (CC0). No proprietary assets, as in the web game.
