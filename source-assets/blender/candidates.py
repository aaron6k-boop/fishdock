# FishDock: look up candidate CC0 assets (metadata only, nothing downloaded): Poly Haven and ambientCG
import json, urllib.request, os
H = {"User-Agent": "FishDock-asset-pipeline"}
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30))
out = {}
for t in ["textures", "hdris", "models"]:
    a = get(f"https://api.polyhaven.com/assets?t={t}")
    out["ph_" + t] = {k: {"name": v.get("name"), "cat": v.get("categories"), "tags": v.get("tags")} for k, v in a.items()}
for q in ["concrete", "metal", "rust", "paintedmetal", "rope", "fabric", "leather", "plastic", "asphalt", "wood"]:
    try:
        j = get(f"https://ambientcg.com/api/v2/full_json?type=Material&q={q}&limit=12&include=downloadData")
        out["acg_" + q] = [{"id": f["assetId"], "dl": [(d["attribute"], d.get("size")) for c in f.get("downloadFolders", {}).values() for cat in c.get("downloadFiletypeCategories", {}).values() for d in cat.get("downloads", [])][:8]} for f in j.get("foundAssets", [])]
    except Exception as e: out["acg_" + q] = repr(e)
json.dump(out, open("C:/Users/aaron/Documents/FishDock-assets/candidates.json", "w"))
print("CANDIDATES DONE", {k: len(v) for k, v in out.items()})
