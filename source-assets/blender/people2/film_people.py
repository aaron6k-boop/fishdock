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
  init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'%s'}));localStorage.setItem('fishdock.look',%s);}catch(e){}" % (cam, json.dumps(json.dumps({k: v for k, v in look.items() if not k.startswith("_")})))
  ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
  ws.call("Page.navigate", {"url": URL}); t1 = time.time(); tries = 0; t2 = time.time()
  while time.time() - t1 < 300:
    time.sleep(3); s2 = ws.ev("!!(window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head) && /Hold Cast|Cast/.test(document.body.innerText)")
    if s2 is True: break
    # (a part of the game that failed to load (it happened once, on a fresh copy of the build): load the page again)
    bad = ws.ev("(window.__errs || []).some((e) => /Failed to fetch|Importing a module/.test(e))")
    if (bad is True or time.time() - t2 > 100) and tries < 2:
      tries += 1; t2 = time.time(); print("reloading the page:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True); ws.call("Page.navigate", {"url": URL})
  time.sleep(14)
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
# relative to his eyes), or at his hands (dist, side). Either way the camera is first checked for a clear view: a ray
# from what it looks at to where it would stand must not pass through anything (the rod rest's legs, the chair, the
# angler's own body: on 18 November the hands' camera stood behind the tripod and once inside the jacket), so it is
# swung round in steps either way until it has one
CLEAR = """window.__fdClear = window.__fdClear || ((W, look, cands, skipNear) => { const T = W.THREE, rc = new W.Raycaster(); const meshes = [];
  W.scene.traverse((o) => { if (!o.isMesh || !o.visible || o.isSkinnedMesh && !o.parent) return; if (o.material && (o.material.transparent && o.material.opacity < 0.5)) return; if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r = o.geometry.boundingSphere.radius * o.getWorldScale(new T.Vector3()).x; if (c.distanceTo(look) - r < 4 && r < 40) meshes.push(o); });
  for (const c of cands) { const d = c.clone().sub(look), L = d.length(); d.normalize(); rc.set(look.clone().addScaledVector(d, skipNear), d); rc.far = L - skipNear; const hit = rc.intersectObjects(meshes, false).find((h) => !/line|Line|fdLine|water|sea/i.test(h.object.name || '') && h.object.type !== 'Line' && h.object.type !== 'LineSegments'); if (!hit) return c; }
  return null; });"""
CAM = CLEAR + """((yawDeg, dy, dist, ly) => { const W = window.__fdWorld, p = window.__fdProbe, T = W.THREE; const [ex, ey, ez] = p.head, [fx, , fz] = p.feet, t = p.tip || p.seat;
  let ax = t[0] - fx, az = t[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; const look = new T.Vector3(ex, ey + ly, ez), cands = [];
  for (const dd of [0, 12, -12, 25, -25, 40, -40, 60, -60]) { const a = (yawDeg + dd) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); cands.push(new T.Vector3(ex + (ax * c - az * s) * dist, ey + dy, ez + (ax * s + az * c) * dist)); }
  const pick = window.__fdClear(W, look, cands, 0.25) || cands[0]; W.at(pick.x, pick.y, pick.z, [look.x, look.y, look.z]); W.step(60); return pick === cands[0] ? 0 : 1; })(%s)"""
HANDS = CLEAR + """((dist, side) => { const W = window.__fdWorld, p = window.__fdProbe, T = W.THREE; const hs = (p.hands || []).filter(Boolean); if (!hs.length) return -1;
  const m = hs.reduce((a, h) => [a[0] + h[0] / hs.length, a[1] + h[1] / hs.length, a[2] + h[2] / hs.length], [0, 0, 0]); const [fx, , fz] = p.feet;
  let ax = m[0] - fx, az = m[2] - fz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l; const look = new T.Vector3(m[0], m[1], m[2]), cands = [];
  for (const yd of [0, 30, -30, 60, -60, 90, -90, 120, -120]) { const a = Math.atan2(side, dist * 0.6) + yd * Math.PI / 180, r = Math.hypot(side, dist * 0.6), c = Math.cos(a), s = Math.sin(a);
    const ox = ax * c - az * s, oz = ax * s + az * c; for (const up of [0.12, 0.3]) cands.push(new T.Vector3(m[0] + ox * r, m[1] + up, m[2] + oz * r)); }
  const pick = window.__fdClear(W, look, cands, 0.09); if (!pick) return -2; W.at(pick.x, pick.y, pick.z, m); W.step(60); return 1; })(%s)"""
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
      for label, at in (("cast_windup", 0.35), ("cast_release", 0.9), ("reel", 3.5), ("strike", 6.2), ("fight", 8.5), ("fight2", 11.0), ("net", 17.0), ("pick", 21.0), ("hold", 26.0), ("hold2", 29.0)):
        n = int((at - t) * 60); t = at
        ws.ev("(() => { const W = window.__fdWorld; for (let i = 0; i < %d; i++) W.step(1000 / 60, true); return 1; })()" % n)
        ws.ev(CAM % "60, -0.3, 3.0, -0.6"); time.sleep(0.8); shot(ws, f"{name}_{label}_body", 0.75)
        hv = ws.ev(HANDS % "0.75, 0.25")
        if hv == 1: time.sleep(0.8); shot(ws, f"{name}_{label}_hands", 0.75)
        else: print(label, "hands: no clear view" if hv == -2 else "hands: none", flush=True)
        print(label, "stage", ws.ev("window.__fdProbe && window.__fdProbe.stage"), flush=True)
  except Exception:
    import traceback; print(name, "stopped:", traceback.format_exc()[-800:], flush=True)
  finally:
    close(proc, ws)
# the catch in real time from behind, as the game films it, and walking (for each look named in LIVE, or the first)
first = next(iter(LOOKS.values())) if LOOKS else {}
for lname in (globals().get("LIVE") or [next(iter(LOOKS), None)]):
  proc, ws = page(LOOKS.get(lname, first))
  try:
    env(ws)
    # walking first (the Walk about button is there only while nothing is being fished), then E to fish here again
    ok = ws.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Walk about/.test(x.getAttribute('aria-label') || x.textContent || '')); if (!b) return 'no walk button'; b.click(); return 'walking'; })()")
    print("walk:", ok, flush=True); time.sleep(1.5); t3 = time.time()
    while time.time() - t3 < 7: ws.ev("(window.__fdWorld.walkInput(0, 1), 1)"); shot(ws, f"live_{lname}_walk", 0.5); time.sleep(0.1)
    ws.ev("(window.__fdWorld.walkInput(0, 0), 1)"); time.sleep(1)
    for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "e", "code": "KeyE", "windowsVirtualKeyCode": 69, "text": "e" if typ == "keyDown" else ""})
    time.sleep(3)
    ws.ev("(() => { const W = window.__fdWorld; %s; let last = performance.now(); const loop = (t) => { const d = Math.min(100, Math.max(1, t - last)); last = t; W.step(d, true); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return 1; })()" % SEQ)
    t3 = time.time()
    while time.time() - t3 < 34: shot(ws, f"live_{lname}_catch", 0.5); time.sleep(0.12)
  except Exception:
    import traceback; print("live stopped:", traceback.format_exc()[-800:], flush=True)
  finally:
    close(proc, ws)
# first person (for each look named in FP, or the first): walking about, then the catch stepped and stopped
for lname in (globals().get("FP") or [next(iter(LOOKS), None)]):
  proc, ws = page(LOOKS.get(lname, first), cam="first")
  try:
    env(ws)
    ok = ws.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Walk about/.test(x.getAttribute('aria-label') || x.textContent || '')); if (!b) return 'no walk button'; b.click(); return 'walking'; })()")
    print("first person walk:", ok, flush=True); time.sleep(1.5); t3 = time.time()
    while time.time() - t3 < 6: ws.ev("(window.__fdWorld.walkInput(0, 1), 1)"); shot(ws, f"fp_{lname}_walk", 0.5); time.sleep(0.25)
    ws.ev("(window.__fdWorld.walkInput(0, 0), 1)"); time.sleep(1)
    for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "e", "code": "KeyE", "windowsVirtualKeyCode": 69, "text": "e" if typ == "keyDown" else ""})
    time.sleep(3)
    ws.ev("(() => { const W = window.__fdWorld; W.freeze(); %s; return 1; })()" % SEQ); t = 0.0
    for label, at in (("cast", 0.4), ("cast2", 0.9), ("reel", 3.5), ("strike", 6.2), ("fight", 9.0), ("fight2", 12.0), ("net", 17.0), ("pick", 21.0), ("hold", 26.0), ("hold2", 29.0)):
      if at < t: continue
      n = int((at - t) * 60); t = at
      ws.ev("(() => { const W = window.__fdWorld; for (let i = 0; i < %d; i++) W.step(1000 / 60, true); return 1; })()" % n); time.sleep(0.8); shot(ws, f"fp_{lname}_{label}", 0.75)
      print("first person", label, "stage", ws.ev("window.__fdProbe && window.__fdProbe.stage"), flush=True)
  except Exception:
    import traceback; print("first person stopped:", traceback.format_exc()[-800:], flush=True)
  finally:
    close(proc, ws)
zp = f"{A}/renders/footage_{LABEL}.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_STORED) as z:
  for n, d in frames: z.writestr(n, d)
print("DONE", LABEL, {"zip": zp, "frames": len(frames), "bytes": os.path.getsize(zp)}, flush=True)
httpd.shutdown()
