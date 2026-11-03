# FishDock: download the approved CC0 assets (Poly Haven, ambientCG) and record each in the licence manifest
import json, os, urllib.request, zipfile, hashlib, datetime
BASE = "C:/Users/aaron/Documents/FishDock-assets"; DL = BASE + "/downloads"
H = {"User-Agent": "FishDock-asset-pipeline"}
import time
LOG = open(BASE + "/download-log.txt", "a", encoding="utf-8")
def log(*a): print(*a); LOG.write(" ".join(map(str, a)) + "\n"); LOG.flush()
def opener(u, timeout):
    for k in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=timeout)
        except Exception as e:
            log("retry", k, u, repr(e)[:160]); time.sleep(2 + 3 * k)
    raise RuntimeError("could not fetch " + u)
get = lambda u: json.load(opener(u, 60))
def fetch(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.exists(dest):
        data = opener(url, 300).read(); open(dest, "wb").write(data)
    return {"file": os.path.relpath(dest, BASE).replace("\\", "/"), "bytes": os.path.getsize(dest), "sha256": hashlib.sha256(open(dest, "rb").read()).hexdigest(), "url": url}
man_path = BASE + "/ASSET-LICENCES.json"
man = json.load(open(man_path)) if os.path.exists(man_path) else {"note": "Every third-party asset used for FishDock: where it came from, who made it, its licence and what it is used for.", "assets": []}
have = {a["id"] for a in man["assets"]}
def record(entry):
    if entry["id"] in have: return
    man["assets"].append(entry); have.add(entry["id"])
today = datetime.date.today().isoformat()
# ---- Poly Haven (all CC0) ----
PH = {"concrete_floor_worn_001": ("textures", None, "1k", "pier deck (worn concrete)"), "concrete_floor_02": ("textures", None, "1k", "pier deck (alternative)"), "concrete_wall_004": ("textures", None, "1k", "pier wall caps")}
for pid, (kind, fmt, res, use) in PH.items():
  try:
      info = get(f"https://api.polyhaven.com/info/{pid}"); files = get(f"https://api.polyhaven.com/files/{pid}"); got = []
      if kind == "hdris":
          f = files["hdri"][res]["hdr"]; got.append(fetch(f["url"], f"{DL}/polyhaven/{pid}/{os.path.basename(f['url'])}"))
      else:
          g = files.get("gltf", {}).get(res, {}).get("gltf")
          if g:
              got.append(fetch(g["url"], f"{DL}/polyhaven/{pid}/{os.path.basename(g['url'])}"))
              for rel, inc in g.get("include", {}).items(): got.append(fetch(inc["url"], f"{DL}/polyhaven/{pid}/{rel}"))
          else:
              for m in ["Diffuse", "nor_gl", "Rough", "AO", "Displacement", "arm"]:
                  x = files.get(m, {}).get(res, {}).get("jpg") or files.get(m, {}).get(res, {}).get("png")
                  if x: got.append(fetch(x["url"], f"{DL}/polyhaven/{pid}/{os.path.basename(x['url'])}"))
      record({"id": "polyhaven:" + pid, "name": info.get("name"), "source": f"https://polyhaven.com/a/{pid}", "author": ", ".join((info.get("authors") or {}).keys()), "licence": "CC0 1.0", "attribution": "Not required (credited anyway in CREDITS)", "type": kind, "resolution": res, "use": use, "downloaded": today, "files": got})
      log("polyhaven", pid, len(got))
  except Exception as e: log("FAILED", pid, repr(e)[:200])
json.dump(man, open(man_path, "w"), indent=1)
log("DOWNLOADS DONE", len(man["assets"]), sum(f["bytes"] for a in man["assets"] for f in a["files"]) // 1e6, "MB")
