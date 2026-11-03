# FishDock asset pipeline: what this Blender can do (writes audit.json next to this script)
import bpy, sys, json, os, urllib.request, addon_utils, platform
out = {"blender": bpy.app.version_string, "python": sys.version.split()[0], "os": platform.platform()}
out["addons_enabled"] = sorted(a.module for a in bpy.context.preferences.addons)
out["gltf_io"] = any("io_scene_gltf2" in m.__name__ for m in addon_utils.modules())
try:
    cp = bpy.context.preferences.addons["cycles"].preferences
    cp.refresh_devices()
    out["cycles_devices"] = [(d.name, d.type) for d in cp.devices]
except Exception as e:
    out["cycles_devices"] = str(e)
net = {}
for u in ["https://api.polyhaven.com/types", "https://ambientcg.com/api/v2/full_json?limit=1", "https://api.github.com"]:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "FishDock-asset-pipeline"}), timeout=15) as r: net[u] = r.status
    except Exception as e: net[u] = repr(e)[:120]
out["network"] = net
base = r"C:\Users\aaron\Documents\FishDock-assets"
for d in ["source", "exports", "downloads", "renders", "scripts"]: os.makedirs(os.path.join(base, d), exist_ok=True)
json.dump(out, open(os.path.join(base, "audit.json"), "w"), indent=1)
print("AUDIT DONE", out["blender"])
