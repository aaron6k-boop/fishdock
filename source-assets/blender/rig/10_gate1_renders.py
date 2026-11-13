for _f in ("riglib", "griplib", "posing_v3"): exec(open("C:/Users/aaron/Documents/FishDock-assets/scripts/" + _f + ".py").read())
# FishDock rig rebuild, Gate 1 renders of the fixed hold (rig/gate1_v12.blend) with the jacket's cuffs (second try).
bpy.ops.wm.open_mainfile(filepath=RIGDIR + "/gate1_v12.blend")
PREFIX = "G1n"; exec(open(ROOT + "/scripts/render_g1_v1.py").read()); exec(open(ROOT + "/scripts/render_fp_v1.py").read())
