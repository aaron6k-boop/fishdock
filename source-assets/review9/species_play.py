PATCHES = ["fdp_p1.zip", "fdp_p2.zip", "fdp_p3.zip", "fdp_p4.zip", "fdp_p5.zip", "fdp_p6.zip", "fdp_p7.zip", "fdp_p8.zip", "fdp_p8b.zip", "fdp_p9.zip", "fdp_p10.zip", "fdp_p11.zip", "fdp_p12.zip", "fdp_p13.zip", "fdp_p14.zip", "fdp_p15.zip", "fdp_p16.zip", "fdp_p17.zip", "fdp_p18.zip", "fdp_p19.zip", "fdp_p20.zip", "fdp_p21.zip", "fdp_p22.zip", "fdp_p23.zip", "fdp_p24.zip", "fdp_p25.zip", "fdp_p26.zip"]
LABEL = "species"
# FishDock quality stage 1: a whiting, a bass and a smooth-hound each played for real in first person (run on Aaron's
# PC from FishDock-assets/queue). The fish chosen in the game's own settings sheet; then played with the keys as a
# person plays: Space held and let go to cast, struck on the pull, held to reel and let go while the fish runs, Space
# to land; the landed fish looked at and put back with the card's button. Logged: how long each fight took from the
# strike to "It's close", how many runs it made, every message in order; frames through each fight. Ultra 1920x1080.
import json, time, base64, os, sys, random, zipfile, re
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
LABEL = LABEL + "_" + time.strftime("%H%M")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/#play/gorleston-south-pier"
frames = []
proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/sp-{int(time.time())}-{random.randint(0, 999)}")
ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
init = "window.__fdFilm = true; window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message)));"
init += "try{localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'first'}));}catch(e){}"
ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
ws.call("Page.navigate", {"url": URL}); t1 = time.time()
while time.time() - t1 < 300:
  time.sleep(3)
  if ws.ev("!!(window.__fdWorld && window.__fdProbe && window.__fdProbe.head) && !!document.querySelector('.ft-main')") is True: break
time.sleep(12); print("loaded in", round(time.time() - t1), "s | build:", ws.ev("fetch('/build.json').then(r=>r.text())"), flush=True)
ws.ev("(() => { const W = window.__fdWorld; W.env({ sunAlt: 30, sunAz: 205 }, { cloudPct: 35, windKph: 14, precipMm: 0, waveM: 0.7 }); return 1; })()"); time.sleep(3)
STATE = """JSON.stringify((() => { const b = document.querySelector('.ft-main'), l = document.querySelector('.ft-label'), w = document.querySelector('.walk-prompt'), p = window.__fdProbe;
  return { btn: b ? (b.className.match(/ft-(cast|strike|reel|land|wait)/) || [0, b.className])[1] : null, label: l ? l.textContent : null, prompt: w ? w.textContent : null, stage: p && p.stage, tip: p && p.tip, fps: (document.querySelector('.fps-meter') || {}).innerText || null }; })())"""
def key(typ, k=" ", code="Space", vk=32):
  ev = {"type": typ, "key": k, "code": code, "windowsVirtualKeyCode": vk}
  if typ == "keyDown" and k == " ": ev["text"] = " "
  ws.call("Input.dispatchKeyEvent", ev)
def grab(tag):
  d = ws.call("Page.captureScreenshot", {"format": "jpeg", "quality": 80, "clip": {"x": 0, "y": 0, "width": 1896, "height": 988, "scale": 0.5}}).get("result", {}).get("data")
  if d: frames.append((f"{len(frames):05d}_{tag}.jpg", base64.b64decode(d)))
def choose(name):
  r = ws.ev("""(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const q = (s) => [...document.querySelectorAll(s)];
    const chip = q('.fs-top button.fs-chip').find((b) => /fish|cm/i.test(b.textContent)) || q('button[aria-label="Game settings"]')[0]; if (!chip) return 'no chip'; chip.click(); await w(900);
    const f = q('.try-fish-b').find((b) => b.textContent.trim().toLowerCase() === %s); if (!f) return 'none: ' + q('.try-fish-b').map((b) => b.textContent.trim()).join(', ');
    f.click(); await w(500); const x = q('button[aria-label="Close settings"]')[0]; if (x) x.click(); await w(600); return 'ok: ' + (q('.fs-top button.fs-chip').map((b) => b.textContent).join(' | ')); })()""" % json.dumps(name.lower()))
  print("choose", name, "->", r, flush=True)
def play(tag, limit=240):
  t0 = time.time(); holding = False; last_cast = 0; struck = None; close_at = None; runs = 0; was_run = False; labels = []; n = 0
  while time.time() - t0 < limit:
    st = json.loads(ws.ev(STATE) or "{}"); b = st.get("btn"); lab = st.get("label") or ""
    if not labels or labels[-1][1] != lab: labels.append([round(time.time() - t0, 1), lab])
    if b == "cast" and time.time() - last_cast > 4 and struck is None:
      key("keyDown"); time.sleep(1.0); key("keyUp"); last_cast = time.time()
    elif b == "strike" and re.search(r"strike!|Strike now", lab):
      key("keyDown"); key("keyUp"); struck = struck or time.time()
    elif b == "reel":
      struck = struck or time.time()
      run = bool(re.search(r"running|ease off|Too tight", lab))
      if run and not was_run: runs += 1
      was_run = run
      if run and holding: key("keyUp"); holding = False
      elif not run and not holding: key("keyDown"); holding = True
    elif b == "land":
      if holding: key("keyUp"); holding = False
      close_at = close_at or time.time()
      for _ in range(3): grab(tag + "_close"); time.sleep(0.1)
      key("keyDown"); key("keyUp")
    elif st.get("prompt") and "landed" in st.get("prompt"):
      grab(tag + "_landed"); ws.ev("document.querySelector('.walk-prompt').click(), 1"); time.sleep(1.5)
      for _ in range(4): grab(tag + "_look"); time.sleep(0.3)
      print(tag, "put back:", ws.ev("(() => { const b = [...document.querySelectorAll('button')].find((x) => /Put it back/.test(x.textContent)); if (!b) return 'none'; b.click(); return 'ok'; })()"), flush=True)
      for _ in range(20): time.sleep(0.5); grab(tag + "_back")
      break
    if struck and n % 2 == 0: grab(tag + "_" + (b or "x"))
    n += 1; time.sleep(0.08)
  if holding: key("keyUp")
  fight = round(close_at - struck, 1) if (close_at and struck) else None
  print(tag, json.dumps({"fight_s": fight, "runs": runs, "total_s": round(time.time() - t0)}), flush=True)
  print(tag, "messages:", json.dumps(labels)[:3000], flush=True)
try:
  for sp in ("Whiting", "Bass", "Smoothhound"):
    choose(sp); time.sleep(2)
    play(sp.lower())
    time.sleep(4)
  print("errors:", ws.ev("JSON.stringify(window.__errs || [])"), flush=True)
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
