# FishDock: download MakeHuman's CC0 system assets pack (approved) and load it into MPFB
import bpy, os, json, urllib.request, hashlib, datetime
BASE = "C:/Users/aaron/Documents/FishDock-assets"; dest = BASE + "/downloads/makehuman/makehuman_system_assets_cc0.zip"
url = "https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"
os.makedirs(os.path.dirname(dest), exist_ok=True)
if not os.path.exists(dest) or os.path.getsize(dest) < 1e8:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FishDock-asset-pipeline"}), timeout=900) as r, open(dest, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
print("zip", os.path.getsize(dest) // 1e6, "MB")
print("load_pack", bpy.ops.mpfb.load_pack(filepath=dest))
man_path = BASE + "/ASSET-LICENCES.json"; man = json.load(open(man_path))
if not any(a["id"] == "makehuman:system_assets" for a in man["assets"]):
    h = hashlib.sha256(); [h.update(c) for c in iter(lambda f=open(dest, "rb"): f.read(1 << 20), b"")]
    man["assets"].append({"id": "makehuman:system_assets", "name": "MakeHuman system assets (skins, eyes, eyebrows, eyelashes, teeth, tongue)", "source": "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html", "author": "MakeHuman team (makehuman_system)", "licence": "CC0 1.0", "attribution": "Not required (credited anyway in CREDITS)", "type": "character assets", "use": "anglers' skin, eyes, brows", "downloaded": datetime.date.today().isoformat(), "files": [{"file": "downloads/makehuman/makehuman_system_assets_cc0.zip", "bytes": os.path.getsize(dest), "sha256": h.hexdigest(), "url": url}]})
    man["assets"].append({"id": "mpfb:extension", "name": "MPFB (MakeHuman plugin for Blender), installed from extensions.blender.org", "source": "https://extensions.blender.org/add-ons/mpfb/", "author": "MakeHuman team", "licence": "GPL-3.0 (the tool); the humans it makes are CC0 1.0", "attribution": "Not required for the models it produces", "type": "tool", "use": "makes and rigs the anglers", "downloaded": datetime.date.today().isoformat(), "files": []})
    json.dump(man, open(man_path, "w"), indent=1)
print("PACK DONE")
