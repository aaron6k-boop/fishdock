# FishDock review (18 Nov, the big brief): the current game played on this PC's graphics card, Ultra at 1920x1080, the
# 3D view full screen, filmed in real time (1280x720 frames, about six a second) with what the fishing button said and
# the fight's state logged against every frame:
#   A. third person, the man: playing for real with the keys (Space: hold and let go to cast, strike on the pull, hold
#      to reel and let go through a run, Space to land), then the landed fish looked at, two catches;
#   B. the same in first person;
#   C. the woman, third person, one catch;
#   D. the fights compared: a whiting, a bass and a smooth-hound played through by the film hook, third person;
#   E. walking: third and first person, forward and turning;
#   F. the weather and the hour: overcast, rain, mist, dusk, night, morning.
# The film build from FishDock-assets/build (fdist_a1 and its patches). Results: renders/footage_<label>.zip (frames
# and log.json), this log.
import json, time, base64, os, sys, random, zipfile
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
PATCHES = globals().get("PATCHES") or []
LABEL = globals().get("LABEL", "review9") + "_" + time.strftime("%H%M")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/#play/gorleston-south-pier"
MAN = {"skin": 0, "hair": 1, "hat": 3, "beard": 2, "build": 1, "person": 19, "coat": 0, "legs": 0, "boots": 0, "life": 0, "gloves": 0, "glasses": 0, "torch": 0}
WOMAN = {"skin": 1, "hair": 1, "hat": 0, "beard": 0, "build": 1, "person": 20, "coat": 0, "legs": 0, "boots": 0, "life": 0, "gloves": 0, "glasses": 0, "torch": 0}
frames, log = [], []
def page(look, cam):
  proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/rv-{int(time.time())}-{random.randint(0, 999)}")
  ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
  init = "window.__fdFilm = true; window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message))); addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));"
  init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'%s'}));localStorage.setItem('fishdock.look',%s);}catch(e){}" % (cam, json.dumps(json.dumps(look)))
  ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
  ws.call("Page.navigate", {"url": URL}); t1 = time.time(); tries = 0; t2 = time.time()
  while time.time() - t1 < 300:
    time.sleep(3)
    if ws.ev("!!(window.__fdWorld && window.__fdWorld.play && window.__fdProbe && window.__fdProbe.head) && !!document.querySelector('.ft-main')") is True: break
    bad = ws.ev("(window.__errs || []).some((e) => /Failed to fetch|Importing a module/.test(e))")
    if (bad is True or time.time() - t2 > 100) and tries < 2:
      tries += 1; t2 = time.time(); print("reloading the page", flush=True); ws.call("Page.navigate", {"url": URL})
  time.sleep(12)
  for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "f", "code": "KeyF", "windowsVirtualKeyCode": 70, "text": "f" if typ == "keyDown" else ""})
  time.sleep(4); print("loaded in", round(time.time() - t1), "s | build:", ws.ev("fetch('/build.json').then(r=>r.text())"), flush=True)
  return proc, ws
def close(proc, ws):
  print("page errors:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True)
  print("memory:", ws.ev("JSON.stringify((() => { const W = window.__fdWorld, m = W.renderer.info.memory, pm = performance.memory; return { geometries: m.geometries, textures: m.textures, programs: (W.renderer.info.programs || []).length, jsHeapMB: pm ? Math.round(pm.usedJSHeapSize / 1048576) : null }; })())"), flush=True)
  try: ws.call("Browser.close", timeout=10)
  except Exception: pass
  time.sleep(2)
  try: proc.kill()
  except Exception: pass
STATE = """JSON.stringify((() => { const b = document.querySelector('.ft-main'), l = document.querySelector('.ft-label'), w = document.querySelector('.walk-prompt'), p = window.__fdProbe;
  return { btn: b ? (b.className.match(/ft-(cast|strike|reel|land|wait)/) || [0, b.className])[1] : null, label: l ? l.textContent : null, prompt: w ? w.textContent : null, stage: p && p.stage, fps: (document.querySelector('.fps-meter') || {}).innerText || null }; })())"""
def key(typ, k=" ", code="Space", vk=32):
  ev = {"type": typ, "key": k, "code": code, "windowsVirtualKeyCode": vk}
  if typ == "keyDown" and k == " ": ev["text"] = " "
  ws_now.call("Input.dispatchKeyEvent", ev)
def grab(tag, st=None):
  d = ws_now.call("Page.captureScreenshot", {"format": "jpeg", "quality": 78, "clip": {"x": 0, "y": 0, "width": 1920, "height": 1080, "scale": 0.6667}}).get("result", {}).get("data")
  if d: n = f"{len(frames):05d}_{tag}.jpg"; frames.append((n, base64.b64decode(d))); log.append([n, round(time.time() - T0, 2), st])
def play_catches(tag, n=2, limit=150):
  # (playing as a person would: Space held about a second and let go to cast; strike when it says to; hold Space to
  # reel, letting go while the fish runs; Space to land; then the landed fish opened and looked at)
  got = 0; t0 = time.time(); holding = False; last_cast = 0; looked = 0
  while got < n and time.time() - t0 < limit:
    st = json.loads(ws_now.ev(STATE) or "{}"); b = st.get("btn"); lab = st.get("label") or ""
    if b == "cast" and time.time() - last_cast > 4:
      if holding: key("keyUp"); holding = False
      key("keyDown"); 
      for _ in range(5): time.sleep(0.2); grab(tag + "_cast", st)
      key("keyUp"); last_cast = time.time()
    elif b == "strike" and re.search(r"strike!|Strike now", lab):
      key("keyDown"); key("keyUp")
    elif b == "reel":
      run = bool(re.search(r"running|ease off|Too tight", lab))
      if run and holding: key("keyUp"); holding = False
      elif not run and not holding: key("keyDown"); holding = True
    elif b == "land":
      if holding: key("keyUp"); holding = False
      key("keyDown"); key("keyUp")
    elif st.get("prompt") and "landed" in st.get("prompt") and time.time() - looked > 20:
      # the catch looked at: the card
      for _ in range(6): grab(tag + "_landed", st); time.sleep(0.15)
      ws_now.ev("document.querySelector('.walk-prompt').click(), 1"); looked = time.time()
      for _ in range(36): time.sleep(0.15); grab(tag + "_look", json.loads(ws_now.ev(STATE) or "{}"))
      ws_now.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27}); ws_now.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
      got += 1; print(tag, "catch", got, "after", round(time.time() - t0), "s", flush=True); time.sleep(2)
    grab(tag + ("_" + (b or st.get("stage") or "x")), st)
    time.sleep(0.06)
  if holding: key("keyUp")
  print(tag, "done:", got, "catches in", round(time.time() - t0), "s", flush=True)
import re
T0 = time.time()
# ---- A, B, C: real play ----
for tag, look, cam, n in (("A_man_third", MAN, "third", 2), ("B_man_first", MAN, "first", 2), ("C_woman_third", WOMAN, "third", 1)):
  proc, ws_now = page(look, cam)
  try:
    ws_now.ev("(() => { const W = window.__fdWorld; W.env({ sunAlt: 30, sunAz: 205 }, { cloudPct: 35, windKph: 16, precipMm: 0, waveM: 0.8 }); return 1; })()"); time.sleep(3)
    play_catches(tag, n)
  except Exception:
    import traceback; print(tag, "stopped:", traceback.format_exc()[-600:], flush=True)
  finally:
    close(proc, ws_now)
# ---- D, E, F: the film hook's fights compared, walking, the weather ----
proc, ws_now = page(MAN, "third")
def realtime(secs, tag, every=0.12, each=None):
  t3 = time.time()
  while time.time() - t3 < secs:
    if each: ws_now.ev(each(time.time() - t3))
    grab(tag); time.sleep(max(0, every - 0.08))
try:
  ws_now.ev("(() => { const W = window.__fdWorld; W.env({ sunAlt: 30, sunAz: 205 }, { cloudPct: 35, windKph: 16, precipMm: 0, waveM: 0.8 }); return 1; })()"); time.sleep(3)
  for sp, cm in (("whiting", 27), ("bass", 58), ("smoothhound", 95)):
    ws_now.ev("(() => { const W = window.__fdWorld; W.play([['cast', -0.05], ['hooked', 8], ['catch', 34, { species: '%s', lengthCm: %d }]], { species: '%s', lengthCm: %d }); let last = performance.now(); window.__rt = true; const loop = (t) => { if (!window.__rt) return; const d = Math.min(100, Math.max(1, t - last)); last = t; W.step(d, true); requestAnimationFrame(loop); }; requestAnimationFrame(loop); return 1; })()" % (sp, cm, sp, cm))
    realtime(46, "D_" + sp); ws_now.ev("window.__rt = false, 1"); time.sleep(1)
  ok = ws_now.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Walk about/.test(x.getAttribute('aria-label') || x.textContent || '')); if (!b) return 'no walk button'; b.click(); return 'walking'; })()")
  print("walk:", ok, flush=True); time.sleep(1.5)
  realtime(7, "E_walk_third", each=lambda t: "(window.__fdWorld.walkInput(0, 1), 1)")
  realtime(4, "E_turn_third", each=lambda t: "(window.__fdWorld.walkInput(0.8, 0.6), 1)")
  ws_now.ev("(window.__fdWorld.walkInput(0, 0), 1)")
  for name, light, cond in (("overcast", "{ sunAlt: 25, sunAz: 210 }", "{ cloudPct: 95, windKph: 30, precipMm: 0, waveM: 1.3 }"),
                            ("rain", "{ sunAlt: 22, sunAz: 215 }", "{ cloudPct: 100, windKph: 34, precipMm: 3, waveM: 1.6 }"),
                            ("mist", "{ sunAlt: 15, sunAz: 140 }", "{ cloudPct: 100, windKph: 4, precipMm: 0, waveM: 0.2, visKm: 0.6 }"),
                            ("dusk", "{ sunAlt: 1.5, sunAz: 245 }", "{ cloudPct: 40, windKph: 12, precipMm: 0, waveM: 0.6 }"),
                            ("night", "{ sunAlt: -18, sunAz: 300, moonAlt: 25, moonAz: 140, moonIllum: 0.8 }", "{ cloudPct: 20, windKph: 10, precipMm: 0, waveM: 0.5 }"),
                            ("morning", "{ sunAlt: 12, sunAz: 110 }", "{ cloudPct: 15, windKph: 8, precipMm: 0, waveM: 0.3 }")):
    ws_now.ev("(() => { const W = window.__fdWorld; W.env(%s, %s); return 1; })()" % (light, cond)); time.sleep(3)
    realtime(4, "F_" + name, each=lambda t: "window.__fdWorld.view(%f, -0.06) && 1" % (120 + 25 * t))
except Exception:
  import traceback; print("D-F stopped:", traceback.format_exc()[-600:], flush=True)
finally:
  close(proc, ws_now)
zp = f"{A}/renders/footage_{LABEL}.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_STORED) as z:
  for n, d in frames: z.writestr(n, d)
  z.writestr("log.json", json.dumps(log))
print("DONE", LABEL, {"zip": zp, "frames": len(frames), "bytes": os.path.getsize(zp)}, flush=True)
httpd.shutdown()
