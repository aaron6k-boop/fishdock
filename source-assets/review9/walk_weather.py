PATCHES = ["fdp_p1.zip", "fdp_p2.zip", "fdp_p3.zip", "fdp_p4.zip", "fdp_p5.zip", "fdp_p6.zip", "fdp_p7.zip", "fdp_p8.zip", "fdp_p8b.zip", "fdp_p9.zip", "fdp_p10.zip", "fdp_p11.zip", "fdp_p12.zip", "fdp_p13.zip", "fdp_p14.zip", "fdp_p15.zip", "fdp_p16.zip", "fdp_p17.zip", "fdp_p18.zip", "fdp_p19.zip", "fdp_p20.zip", "fdp_p21.zip", "fdp_p22.zip", "fdp_p23.zip", "fdp_p24.zip", "fdp_p25.zip"]
LABEL = "walkweather"
# FishDock review, the part of the game not yet filmed for the quality brief (run on Aaron's PC from FishDock-assets/
# queue): walking round Gorleston South Pier in real time (the game's own clock, not the film's), held keys as a
# player presses them, then the weather and the light from the fishing spot: clear noon, grey overcast, a squall with
# heavy rain, sea fog, dusk and night, each looking out to sea, along the pier and down at the water; once in first
# person and once in third. Ultra at 1920x1080, the 3D view full screen. Writes renders/footage_<label>.zip.
import json, time, base64, os, sys, random, zipfile
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
LABEL = LABEL + "_" + time.strftime("%H%M")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/#play/gorleston-south-pier"
frames = []
def page(cam):
  proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/ww-{int(time.time())}-{random.randint(0, 999)}")
  ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
  init = "window.__fdFilm = true; window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message)));"
  init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:%s}));}catch(e){}" % json.dumps(cam)
  ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
  ws.call("Page.navigate", {"url": URL}); t1 = time.time(); tries = 0; t2 = time.time()
  while time.time() - t1 < 300:
    time.sleep(3); s2 = ws.ev("!!(window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head) && /Hold Cast|Cast/.test(document.body.innerText)")
    if s2 is True: break
    bad = ws.ev("(window.__errs || []).some((e) => /Failed to fetch|Importing a module/.test(e))")
    if (bad is True or time.time() - t2 > 100) and tries < 2:
      tries += 1; t2 = time.time(); print("reloading the page", flush=True); ws.call("Page.navigate", {"url": URL})
  time.sleep(14)
  key(ws, "KeyF", "f", 70); time.sleep(5)
  print(cam, "loaded in", round(time.time() - t1), "s | build:", ws.ev("fetch('/build.json').then(r=>r.text())"), flush=True)
  return proc, ws
def key(ws, code, k, vk, typ=None):
  for t in ([typ] if typ else ("keyDown", "keyUp")):
    ws.call("Input.dispatchKeyEvent", {"type": t, "key": k, "code": code, "windowsVirtualKeyCode": vk, **({"text": k} if t == "keyDown" and len(k) == 1 else {})})
def shot(ws, label, scale=0.5):
  d = ws.call("Page.captureScreenshot", {"format": "jpeg", "quality": 88, "clip": {"x": 0, "y": 0, "width": 1896, "height": 988, "scale": scale}}).get("result", {}).get("data")
  if d: frames.append((f"{len(frames):05d}_{label}.jpg", base64.b64decode(d)))
def fps(ws): return ws.ev("(document.querySelector('.fps-meter') || {}).textContent || ''")
def walk(ws, tag):
  # (W held; half way, turned 50 degrees by the view; then Shift held to run; then S to come back a little)
  key(ws, "KeyW", "w", 87, "keyDown")
  for i in range(14):
    time.sleep(0.45); shot(ws, f"{tag}_walk")
    if i == 6: ws.ev("(() => { const W = window.__fdWorld; const y = (W.yaw || 0) * 180 / Math.PI; W.view(y + 50, -0.1); return 1; })()")
  key(ws, "ShiftLeft", "Shift", 16, "keyDown")
  for i in range(8): time.sleep(0.45); shot(ws, f"{tag}_run")
  key(ws, "ShiftLeft", "Shift", 16, "keyUp"); key(ws, "KeyW", "w", 87, "keyUp")
  for i in range(3): time.sleep(0.4); shot(ws, f"{tag}_stop")
  ws.ev("(() => { const W = window.__fdWorld; const y = (W.yaw || 0) * 180 / Math.PI; W.view(y + 170, -0.12); return 1; })()")
  key(ws, "KeyA", "a", 65, "keyDown")
  for i in range(5): time.sleep(0.45); shot(ws, f"{tag}_side")
  key(ws, "KeyA", "a", 65, "keyUp")
  print(tag, "walked:", fps(ws), flush=True)
  # (back to the spot: the walk's own button)
  print(tag, "back:", ws.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Back to my spot|Stop walking/i.test(x.textContent + ' ' + (x.getAttribute('aria-label') || ''))); if (!b) return 'none'; b.click(); return b.textContent || b.getAttribute('aria-label'); })()"), flush=True)
  time.sleep(6); shot(ws, f"{tag}_back")
WEATHER = [
  ("noon", {"sunAlt": 52, "sunAz": 180}, {"cloudPct": 10, "windKph": 10, "precipMm": 0, "waveM": 0.5}),
  ("overcast", {"sunAlt": 30, "sunAz": 160}, {"cloudPct": 100, "windKph": 18, "precipMm": 0, "waveM": 0.8}),
  ("squall", {"sunAlt": 25, "sunAz": 200}, {"cloudPct": 100, "windKph": 45, "precipMm": 6, "waveM": 2.2}),
  ("fog", {"sunAlt": 18, "sunAz": 120}, {"cloudPct": 90, "windKph": 4, "precipMm": 0, "waveM": 0.3, "visibilityM": 400}),
  ("dusk", {"sunAlt": -2, "sunAz": 250}, {"cloudPct": 40, "windKph": 12, "precipMm": 0, "waveM": 0.6}),
  ("night", {"sunAlt": -25, "sunAz": 320}, {"cloudPct": 30, "windKph": 12, "precipMm": 0, "waveM": 0.6}),
]
def weather(ws, tag):
  y0 = ws.ev("(window.__fdWorld.yaw || 0) * 180 / Math.PI") or 0
  for name, light, cond in WEATHER:
    print(tag, name, ws.ev("(() => { const W = window.__fdWorld; W.env(%s, %s); return 1; })()" % (json.dumps(light), json.dumps(cond))), flush=True)
    time.sleep(5)
    for v, (dy, p) in (("sea", (0, -0.05)), ("pier", (75, -0.1)), ("down", (10, -0.75))):
      ws.ev("window.__fdWorld.view(%f, %f)" % (y0 + dy, p)); time.sleep(1.6); shot(ws, f"{tag}_{name}_{v}", 0.6)
    print(tag, name, fps(ws), flush=True)
for cam in ("first", "third"):
  proc, ws = page(cam)
  try:
    t = "F" if cam == "first" else "T"
    shot(ws, f"{t}_start", 0.6)
    walk(ws, t)
    weather(ws, t)
    print(cam, "errors:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True)
  finally:
    try: ws.call("Browser.close", timeout=10)
    except Exception: pass
    time.sleep(2)
    try: proc.kill()
    except Exception: pass
httpd.shutdown()
out = f"{A}/renders/footage_{LABEL}.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
  for n, b in frames: z.writestr(n, b)
print("FILMED", LABEL, len(frames), "frames ->", out, round(os.path.getsize(out) / 1e6, 1), "MB", flush=True)
