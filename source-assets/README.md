# FishDock source assets

The 3D models FishDock loads from `public/models/` are made in Blender (5.2 LTS) by the scripts in `blender/`. They run
in Blender's Python console on Aaron's PC, against a working folder outside the repository
(`Documents\FishDock-assets`: `downloads/` for third-party assets, `source/` for the editable `.blend` files,
`exports/` for the `.glb` files, `renders/` for checks). Source and production files are kept apart: only the optimised
`.glb` exports are copied into `public/models/`.

- `ASSET-LICENCES.json`: every third-party asset used: where it came from, its author, licence, attribution, the
  files (with sizes and SHA-256) and what it's used for. Only CC0 (or similarly unrestricted) assets go into the public
  app. A free download isn't the same as a licence to use something commercially; Mixamo animations (Adobe's terms)
  may be used in the app but their raw files aren't redistributed, so they stay in the working folder.
- The people are made with MPFB (MakeHuman for Blender); the humans it makes are CC0.

Conventions: metres; built in three.js's frame (y up) through a `P(x, y, z)` helper, so exports drop straight into the
app; attachment points are empties named `att_*`; parts that move have their own nodes (`rotor`, `crank`, ...).

To rebuild in Blender's Python console:

    R = 'C:/Users/aaron/Documents/FishDock-assets/scripts/'
    run = lambda n: exec(open(R + n, encoding='utf-8').read(), {'__name__': '__main__'})
    run('build_reel.py')
