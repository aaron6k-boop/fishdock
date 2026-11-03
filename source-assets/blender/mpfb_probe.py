# FishDock: try MPFB's API: make an adult man, add the game-engine rig, render a look
import bpy, os, json, traceback
OUT = "C:/Users/aaron/Documents/FishDock-assets"
info = {}
try:
    import bl_ext.blender_org.mpfb as M
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    info["humanservice"] = [n for n in dir(HumanService) if not n.startswith("_")]
    from bl_ext.blender_org.mpfb.services import rigservice, targetservice
    info["targetservice"] = [n for n in dir(targetservice.TargetService) if not n.startswith("_")][:80]
    info["rigservice"] = [n for n in dir(rigservice.RigService) if not n.startswith("_")][:80]
    info["ops"] = sorted(n for n in dir(bpy.ops.mpfb))[:200]
except Exception: info["err"] = traceback.format_exc()
json.dump(info, open(OUT + "/mpfb_api.json", "w"), indent=1)
print("PROBE DONE", list(info))
