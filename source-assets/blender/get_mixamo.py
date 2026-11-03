# FishDock: save the Mixamo exports (signed links made a moment ago in the browser, valid 5 minutes) into downloads/mixamo
import json, os, urllib.request
OUT = "C:/Users/aaron/Documents/FishDock-assets/downloads/mixamo"; os.makedirs(OUT, exist_ok=True)
L = json.load(open(OUT + "/urls.json"))
for name, url in L:
    try:
        with urllib.request.urlopen(url, timeout=60) as r, open(f"{OUT}/{name}.fbx", "wb") as f: f.write(r.read())
        print("OK", name, os.path.getsize(f"{OUT}/{name}.fbx"))
    except Exception as e: print("FAIL", name, e)
print("MIXAMO DONE")
