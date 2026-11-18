# FishDock people v2: the in-game benchmark (every preset) with the new anglers on screen, on Aaron's PC's graphics
# card, in the film build served from FishDock-assets/build (fdist_a1 and its patches), Edge with its own profile,
# the 3D view full screen at 1920x1080. For each run (a look and a camera): the game's own benchmark from the
# graphics panel (each preset: 6 s to settle, 8 s measured frame by frame; average fps, percentiles, GPU ms, draws,
# triangles), so the new people's cost can be read against a Rocketbox person in the same scene. Writes
# renders/bench_<label>.json and this log.
import json, time, base64, os, sys, random
A = "C:/Users/aaron/Documents/FishDock-assets"
sys.path.insert(0, A + "/scripts")
from fdfilm_f import unpack, serve
from cdp_lib import launch
PATCHES = globals().get("PATCHES") or []
RUNS = globals().get("RUNS") or []
LABEL = globals().get("LABEL", "people_bench") + "_" + time.strftime("%H%M")
root = unpack("fdist_a1.zip", PATCHES); PORT = 8950 + random.randint(0, 40); httpd = serve(root, PORT)
URL = f"http://127.0.0.1:{PORT}/?dev=1#play/gorleston-south-pier"
out = {"label": LABEL, "runs": []}
for name, look, cam in RUNS:
  proc, ws = launch(1920, 1080, port=9500 + random.randint(0, 300), profile=f"{A}/edge-film/bench-{int(time.time())}-{random.randint(0, 999)}")
  try:
    ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.setBypassServiceWorker", {"bypass": True})
    init = "try{localStorage.setItem('fishdock.dev','1');localStorage.setItem('fishdock.playerName','Aaron');localStorage.setItem('fishdock.view3d.v1',JSON.stringify({gfx:'ultra',fishCam:'%s'}));localStorage.setItem('fishdock.look',%s);}catch(e){}" % (cam, json.dumps(json.dumps(look)))
    ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": init})
    gpu = ws.ev("(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'none'})()")
    ws.call("Page.navigate", {"url": URL}); t0 = time.time()
    while time.time() - t0 < 300:
      time.sleep(3); s = ws.ev("!!document.querySelector('canvas') && !/Loading /.test(document.body.innerText) && /Cast/.test(document.body.innerText)")
      if s is True: break
    print(name, "loaded in", round(time.time() - t0), "s on", gpu, flush=True); time.sleep(15)
    for typ in ("keyDown", "keyUp"): ws.call("Input.dispatchKeyEvent", {"type": typ, "key": "f", "code": "KeyF", "windowsVirtualKeyCode": 70, "text": "f" if typ == "keyDown" else ""})
    time.sleep(5)
    shot = ws.call("Page.captureScreenshot", {"format": "jpeg", "quality": 88}).get("result", {}).get("data")
    if shot: open(f"{A}/renders/bench_{LABEL}_{name}.jpg", "wb").write(base64.b64decode(shot))
    r = ws.ev("""(async()=>{const w=(ms)=>new Promise(r=>setTimeout(r,ms));const q=(s)=>[...document.querySelectorAll(s)];
      q('button.w3d-menubtn')[0]?.click(); await w(700);
      const g=q('button[role=menuitem]').find(b=>/Preset, resolution/.test(b.title||'')); if(!g) return 'no graphics item'; g.click(); await w(1500);
      const b=q('button').find(x=>/Run benchmark/.test(x.textContent)); if(!b) return 'no benchmark button'; b.scrollIntoView(); b.click(); return 'started'})()""")
    print(name, "benchmark", r, flush=True); t1 = time.time(); txt = None
    while time.time() - t1 < 480:
      time.sleep(5)
      txt = ws.ev("(()=>{const p=[...document.querySelectorAll('pre.gfx-pre')].find(x=>/FishDock benchmark/.test(x.textContent));const b=[...document.querySelectorAll('button')].find(x=>/Benchmarking/.test(x.textContent));return p&&!b?p.textContent:null})()")
      if txt: break
    print(txt, flush=True); out["runs"].append({"name": name, "cam": cam, "look": look, "gpu": gpu, "result": txt})
    json.dump(out, open(f"{A}/renders/bench_{LABEL}.json", "w"), indent=1)
  except Exception:
    import traceback; print(name, "stopped:", traceback.format_exc()[-800:], flush=True)
  finally:
    try: ws.call("Browser.close", timeout=10)
    except Exception: pass
    time.sleep(2)
    try: proc.kill()
    except Exception: pass
print("DONE", LABEL, flush=True)
httpd.shutdown()
