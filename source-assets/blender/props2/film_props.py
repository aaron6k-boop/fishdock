# FishDock pier furniture, the check in the game itself (run on Aaron's PC from FishDock-assets/queue): the film build
# served from FishDock-assets/build (fdist_a1 and its patches), Ultra at 1920x1080, the 3D view full screen. Every
# piece of the pier's furniture found in the scene (the instanced benches, lifebuoy stations, bollards, lamps,
# ladders, mooring rings; the angler's chair, seat box, bucket and tripod), the nearest of each to the fishing spot
# filmed close from the front, three-quarter and side, by day and by the lamps after dark; a log of every instanced
# piece and its materials. Writes renders/footage_<label>.zip and this log.
import json, time, base64, os, sys, random, zipfile
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
PATCHES = globals().get("PATCHES") or []
LABEL = globals().get("LABEL", "props") + "_" + time.strftime("%H%M")
PLACE = globals().get("PLACE", "gorleston-south-pier")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/#play/{PLACE}"
frames = []
def page():
  proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/pr-{int(time.time())}-{random.randint(0, 999)}")
  ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
  init = "window.__fdFilm = true; window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message)));"
  init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'third'}));}catch(e){}"
  ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
  ws.call("Page.navigate", {"url": URL}); t1 = time.time(); tries = 0; t2 = time.time()
  while time.time() - t1 < 300:
    time.sleep(3); s2 = ws.ev("!!(window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head) && /Hold Cast|Cast/.test(document.body.innerText)")
    if s2 is True: break
    bad = ws.ev("(window.__errs || []).some((e) => /Failed to fetch|Importing a module/.test(e))")
    if (bad is True or time.time() - t2 > 100) and tries < 2:
      tries += 1; t2 = time.time(); print("reloading the page", flush=True); ws.call("Page.navigate", {"url": URL})
  time.sleep(14)
  for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "f", "code": "KeyF", "windowsVirtualKeyCode": 70, "text": "f" if typ == "keyDown" else ""})
  time.sleep(5); print("loaded in", round(time.time() - t1), "s | build:", ws.ev("fetch('/build.json').then(r=>r.text())"), flush=True)
  return proc, ws
def shot(ws, label, scale=0.75):
  d = ws.call("Page.captureScreenshot", {"format": "jpeg", "quality": 90, "clip": {"x": 0, "y": 0, "width": 1920, "height": 1080, "scale": scale}}).get("result", {}).get("data")
  if d: frames.append((f"{len(frames):05d}_{label}.jpg", base64.b64decode(d)))
# every instanced piece: its materials, count, and the instance nearest the fishing spot (position and turn)
FIND = """(() => { const W = window.__fdWorld, T = W.THREE, p = window.__fdProbe, f = new T.Vector3(...p.feet), out = [], m4 = new T.Matrix4(), pos = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3();
  W.scene.traverse((o) => { if (!o.isInstancedMesh) return; const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.name || m.type); let best = null, bd = 1e9;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); m4.decompose(pos, q, sc); const d = pos.distanceTo(f); if (d < bd) { bd = d; best = { at: pos.toArray(), ry: new T.Euler().setFromQuaternion(q, 'YXZ').y }; } }
    o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; out.push({ name: o.name, mats, n: o.count, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, near: best, dist: +bd.toFixed(1), h: +(bb.max.y - bb.min.y).toFixed(2) }); });
  return JSON.stringify(out); })()"""
LOOK = """((x, y, z, ry, yaw, dist, h, ly) => { const W = window.__fdWorld; const a = ry + yaw * Math.PI / 180; W.at(x + Math.sin(a) * dist, y + h, z + Math.cos(a) * dist, [x, y + ly, z]); W.step(60); return 1; })(%s)"""
def env(ws, sun):
  ws.ev("(() => { const W = window.__fdWorld; W.env({ sunAlt: %s, sunAz: 205 }, { cloudPct: 30, windKph: 10, precipMm: 0, waveM: 0.6 }); W.freeze(); W.step(1200); return 1; })()" % sun); time.sleep(2)
proc, ws = page()
try:
  env(ws, 32)
  inv = json.loads(ws.ev(FIND) or "[]")
  for r in inv: print("instanced:", json.dumps(r), flush=True)
  KEYS = [("bench", "bench_wood|bench"), ("station", "housing|lifebuoy"), ("bollard", "^cast_iron$"), ("lamp", "street_lamp"), ("ladder", "ladder|rung"), ("ring", "ring")]
  import re
  picks = []
  for key, pat in KEYS:
    c = [r for r in inv if r["near"] and any(re.search(pat, m) for m in r["mats"])]
    if key == "bollard": c = [r for r in c if len(r["mats"]) == 1 and r["h"] < 1.0]
    if not c: print(key, ": none found", flush=True); continue
    r = min(c, key=lambda r: r["dist"]); picks.append((key, r)); print(key, "->", r["mats"], r["near"], flush=True)
  for sun, tag in ((32, "day"), (-8, "night")):
    env(ws, sun)
    for key, r in picks:
      x, y, z = r["near"]["at"]; ry = r["near"]["ry"]; h = max(0.6, r["h"])
      views = (("front", 0, 2.1 + h * 0.6, h * 0.55, h * 0.45), ("q", 40, 2.0 + h * 0.6, h * 0.65, h * 0.45), ("side", 90, 2.0 + h * 0.5, h * 0.5, h * 0.45), ("close", 15, 0.9 + h * 0.25, h * 0.6, h * 0.55)) if tag == "day" else (("q", 35, 2.4 + h * 0.6, h * 0.6, h * 0.45),)
      for lab, yaw, dist, hh, ly in views:
        ws.ev(LOOK % ",".join(str(v) for v in (x, y, z, ry, yaw, dist, hh, ly))); time.sleep(0.9); shot(ws, f"{key}_{tag}_{lab}")
    # the angler's own kit by the spot: chair, seat box, bucket, tripod (the spot's own frame from the probe)
    ws.ev("""(() => { const W = window.__fdWorld, p = window.__fdProbe; const [fx, fy, fz] = p.feet, t = p.tip || p.seat; let ax = t[0] - fx, az = t[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      W.at(fx - ax * 2.2 + az * 1.2, fy + 1.3, fz - az * 2.2 - ax * 1.2, [fx - ax * 0.4, fy + 0.35, fz - az * 0.4]); W.step(60); return 1; })()"""); time.sleep(0.9); shot(ws, f"kit_{tag}_behind")
    ws.ev("""(() => { const W = window.__fdWorld, p = window.__fdProbe; const [fx, fy, fz] = p.feet, t = p.tip || p.seat; let ax = t[0] - fx, az = t[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      W.at(fx + ax * 0.2 - az * 2.4, fy + 1.0, fz + az * 0.2 + ax * 2.4, [fx - ax * 0.2, fy + 0.4, fz - az * 0.2]); W.step(60); return 1; })()"""); time.sleep(0.9); shot(ws, f"kit_{tag}_side")
  # a wide look along the pier from the spot, by day
  env(ws, 32)
  ws.ev("""(() => { const W = window.__fdWorld, p = window.__fdProbe; const [fx, fy, fz] = p.feet, t = p.tip || p.seat; let ax = t[0] - fx, az = t[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
    W.at(fx - ax * 1.5 - az * 3, fy + 1.7, fz - az * 1.5 + ax * 3, [fx - ax * 1.5 + az * 20, fy + 0.8, fz - az * 1.5 - ax * 20]); W.step(60); return 1; })()"""); time.sleep(1); shot(ws, "pier_along", 1.0)
except Exception:
  import traceback; print("stopped:", traceback.format_exc()[-800:], flush=True)
finally:
  print("page errors:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True)
  try: ws.call("Browser.close", timeout=10)
  except Exception: pass
  time.sleep(2)
  try: proc.kill()
  except Exception: pass
zp = f"{A}/renders/footage_{LABEL}.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_STORED) as z:
  for n, d in frames: z.writestr(n, d)
print("DONE", LABEL, {"zip": zp, "frames": len(frames), "bytes": os.path.getsize(zp)}, flush=True)
httpd.shutdown()
