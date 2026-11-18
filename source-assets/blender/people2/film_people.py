# FishDock people v2, the check in the game itself (run on Aaron's PC from FishDock-assets/queue): the anglers on this
# PC's graphics card in the film build served from FishDock-assets/build (fdist_a1 and its patches), Ultra at
# 1920x1080 with the 3D view full screen. For each look: close stills of the face (front, three-quarter, side) and of
# the body from four sides, the boots, and from 15 m and 45 m (the lighter levels of detail); then the catch, stepped
# through and stopped at the cast, playing the fish, the net and holding it, with a close look at the hands each
# time; then the catch again in real time from behind as the game films it; walking; first person. Every camera is set
# from where the angler stands and which way the rod points. Writes renders/footage_<label>.zip and this log.
import json, time, base64, os, sys, random, zipfile
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
PATCHES = globals().get("PATCHES") or ["fdp_p1.zip", "fdp_p2.zip", "fdp_p3.zip", "fdp_p4.zip", "fdp_p5.zip", "fdp_p6.zip", "fdp_p7.zip", "fdp_p8.zip", "fdp_p8b.zip", "fdp_p9.zip", "fdp_p10.zip", "fdp_p11.zip", "fdp_p12.zip"]
LOOKS = globals().get("LOOKS") or {}
LABEL = globals().get("LABEL", "people") + "_" + time.strftime("%H%M")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/#play/gorleston-south-pier"
frames = []
def page(look, cam="third"):
  proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/pp-{int(time.time())}-{random.randint(0, 999)}")
  ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
  init = "window.__fdFilm = true; window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));"
  init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'%s'}));localStorage.setItem('fishdock.look',%s);}catch(e){}" % (cam, json.dumps(json.dumps(look)))
  ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
  ws.call("Page.navigate", {"url": URL}); t1 = time.time()
  while time.time() - t1 < 240:
    time.sleep(3); s2 = ws.ev("!!(window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head)")
    if s2 is True: break
  time.sleep(8)
  for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "f", "code": "KeyF", "windowsVirtualKeyCode": 70, "text": "f" if typ == "keyDown" else ""})
  time.sleep(5); print("loaded in", round(time.time() - t1), "s | build:", ws.ev("fetch('/build.json').then(r=>r.text())"), flush=True)
  return proc, ws
def close(proc, ws):
  print("page errors:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True)
  try: ws.call("Browser.close", timeout=10)
  except Exception: pass
  time.sleep(2)
  try: proc.kill()
  except Exception: pass
def shot(ws, label, scale=1.0):
  d = ws.call("Page.captureScreenshot", {"format": "jpeg", "quality": 88, "clip": {"x": 0, "y": 0, "width": 1920, "height": 1080, "scale": scale}}).get("result", {}).get("data")
  if d: frames.append((f"{len(frames):05d}_{label}.jpg", base64.b64decode(d)))
# the camera from the angler: (yaw from the way he faces, degrees; height above his eyes; distance; aim height
# relative to his eyes), or at his hands (dist, side)
CAM = """((yawDeg, dy, dist, ly) => { const W = window.__fdWorld, p = window.__fdProbe; const [ex, ey, ez] = p.head, [fx, , fz] = p.feet, t = p.tip || p.seat;
  let ax = t[0] - fx, az = t[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; const a = yawDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const bx = ax * c - az * s, bz = ax * s + az * c; W.at(ex + bx * dist, ey + dy, ez + bz * dist, [ex, ey + ly, ez]); W.step(60); return 1; })(%s)"""
HANDS = """((dist, side) => { const W = window.__fdWorld, p = window.__fdProbe; const hs = (p.hands || []).filter(Boolean); if (!hs.length) return 0;
  const m = hs.reduce((a, h) => [a[0] + h[0] / hs.length, a[1] + h[1] / hs.length, a[2] + h[2] / hs.length], [0, 0, 0]); const [fx, , fz] = p.feet;
  let ax = m[0] - fx, az = m[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; const rx = -az, rz = ax;
  W.at(m[0] + ax * dist * 0.6 + rx * side, m[1] + 0.12, m[2] + az * dist * 0.6 + rz * side, m); W.step(60); return 1; })(%s)"""
SEQ = "W.play([['cast', -0.05], ['hooked', 6], ['catch', 24, { species: 'bass', lengthCm: 58 }]], { species: 'bass', lengthCm: 58 })"
def env(ws):
  ws.ev("(() => { const W = window.__fdWorld; W.env({ sunAlt: 30, sunAz: 205 }, { cloudPct: 35, windKph: 14, precipMm: 0, waveM: 0.7 }); return 1; })()"); time.sleep(2)
for name, look in LOOKS.items():
  proc, ws = page(look)
  try:
    env(ws); ws.ev("(() => { const W = window.__fdWorld; W.freeze(); W.step(1500); return 1; })()")
    for lab, args in (("face", "0, 0.0, 0.7, -0.03"), ("face_q", "35, 0.0, 0.7, -0.03"), ("face_side", "80, 0.0, 0.75, -0.03"),
                      ("front", "0, -0.45, 2.7, -0.7"), ("q", "40, -0.4, 2.7, -0.7"), ("side", "90, -0.4, 2.7, -0.7"), ("back", "180, -0.3, 2.8, -0.7"),
                      ("boots", "25, -1.25, 1.3, -1.45"), ("lod1_15m", "30, 0.5, 15, -0.8"), ("lod2_45m", "30, 3, 45, -0.8")):
      r = ws.ev(CAM % args); time.sleep(1.0); shot(ws, f"{name}_{lab}", 0.75 if "lod" in lab else 1.0)
    if look.get("_catch"):
      # the catch, stepped and stopped: the cast's wind-up and release, playing the fish, the net, holding it up
      ws.ev("(() => { const W = window.__fdWorld; %s; return 1; })()" % SEQ)
      t = 0.0
      for label, at in (("cast_windup", 0.35), ("cast_release", 0.9), ("reel", 3.5), ("fight", 8.5), ("fight2", 11.0), ("net", 17.0), ("hold", 26.0), ("hold2", 29.0)):
        n = int((at - t) * 60); t = at
        ws.ev("(() => { const W = window.__fdWorld; for (let i = 0; i < %d; i++) W.step(1000 / 60, true); return 1; })()" % n)
        ws.ev(CAM % "60, -0.3, 3.0, -0.6"); time.sleep(0.8); shot(ws, f"{name}_{label}_body", 0.75)
        if ws.ev(HANDS % "0.9, 0.25"): time.sleep(0.8); shot(ws, f"{name}_{label}_hands", 0.75)
        print(label, "stage", ws.ev("window.__fdProbe && window.__fdProbe.stage"), flush=True)
  except Exception:
    import traceback; print(name, "stopped:", traceback.format_exc()[-800:], flush=True)
  finally:
    close(proc, ws)
# the catch in real time from behind, as the game films it, and walking
first = next(iter(LOOKS.values())) if LOOKS else {}
proc, ws = page(first)
try:
  env(ws)
  ws.ev("(() => { const W = window.__fdWorld; %s; let last = performance.now(); const loop = (t) => { const d = Math.min(100, Math.max(1, t - last)); last = t; W.step(d, true); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return 1; })()" % SEQ)
  t3 = time.time()
  while time.time() - t3 < 34: shot(ws, "live_catch", 0.5); time.sleep(0.12)
  ok = ws.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Walk about/.test(x.getAttribute('aria-label') || x.textContent || '')); if (!b) return 'no walk button'; b.click(); return 'walking'; })()")
  print("walk:", ok, flush=True); time.sleep(1.5); t3 = time.time()
  while time.time() - t3 < 6: ws.ev("(window.__fdWorld.walkInput(0, 1), 1)"); shot(ws, "live_walk", 0.5); time.sleep(0.1)
  ws.ev("(window.__fdWorld.walkInput(0, 0), 1)")
except Exception:
  import traceback; print("live stopped:", traceback.format_exc()[-800:], flush=True)
finally:
  close(proc, ws)
# first person
proc, ws = page(first, cam="first")
try:
  env(ws); ws.ev("(() => { const W = window.__fdWorld; W.freeze(); %s; return 1; })()" % SEQ); t = 0.0
  for label, at in (("cast", 0.4), ("cast2", 0.9), ("reel", 3.5), ("fight", 9.0), ("net", 17.0), ("hold", 26.0)):
    n = int((at - t) * 60); t = at
    ws.ev("(() => { const W = window.__fdWorld; for (let i = 0; i < %d; i++) W.step(1000 / 60, true); return 1; })()" % n); time.sleep(0.8); shot(ws, f"fp_{label}", 0.75)
except Exception:
  import traceback; print("first person stopped:", traceback.format_exc()[-800:], flush=True)
finally:
  close(proc, ws)
zp = f"{A}/renders/footage_{LABEL}.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_STORED) as z:
  for n, d in frames: z.writestr(n, d)
print("DONE", LABEL, {"zip": zp, "frames": len(frames), "bytes": os.path.getsize(zp)}, flush=True)
httpd.shutdown()
