# FishDock (17 Nov): the second set of recorded sounds (BigSoundBank, CC0): the cast's whoosh (three), single clicks of
# a ratchet for the reel's drag and clicker, a rope through hands. Trimmed, faded, peak -3 dB, mono MP3.
import subprocess, numpy as np, json, os, sys
RAW, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True) # the originals (FishDock-assets/downloads/bigsoundbank) and public/sounds
SR = 44100
def load(f):
  r = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{RAW}/{f}", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True); return np.frombuffer(r.stdout, np.float32).copy()
def save(a, name, kbps=96):
  tmp = f"/tmp/fd2_{name}.f32"; a.astype(np.float32).tofile(tmp)
  subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", tmp, "-c:a", "libmp3lame", "-b:a", f"{kbps}k", f"{OUT}/{name}.mp3"], check=True); os.remove(tmp)
def fade(a, fi=0.004, fo=0.03):
  a = a.copy(); i, o = int(fi * SR), int(fo * SR); a[:i] *= np.linspace(0, 1, i); a[-o:] *= np.linspace(1, 0, o); return a
def peak(a, db=-3.0): return a * (10 ** (db / 20) / (np.abs(a).max() + 1e-9))
def cut(a, t0, t1): return a[int(t0 * SR):int(t1 * SR)]
meta = {}
# whooshes: a long stick, a metal tube, a long rope swung through the air
for name, f, t0, t1 in (("whoosh_a", "1797.flac", 0.12, 0.5), ("whoosh_b", "1801.flac", 0.16, 0.7), ("whoosh_c", "1796.flac", 0.14, 0.75)):
  a = peak(fade(cut(load(f), t0, t1), 0.01, 0.08), -4); save(a, name); meta[name] = round(len(a) / SR, 3)
# clicks: single ratchet clicks, each found at its onset and kept for 45 ms, laid 0.1 s apart in one file
clicks = []
for f in ("0794.ogg", "0795.ogg"):
  a = load(f); env = np.sqrt(np.convolve(a ** 2, np.ones(220) / 220, "same")); db = 20 * np.log10(env + 1e-9); pk = db.max()
  on = np.where((db[1:] > pk - 14) & (db[:-1] <= pk - 14))[0]; last = -1e9
  for o in on:
    if o - last < SR * 0.08: continue
    last = o; seg = a[max(0, o - int(0.003 * SR)):o + int(0.045 * SR)]
    if len(seg) > 0.04 * SR and np.abs(seg).max() > 0.05: clicks.append(peak(fade(seg, 0.002, 0.02), -3))
    if len(clicks) >= 8 * (1 if f == "0794.ogg" else 2): break
gap = int(0.1 * SR); buf = np.zeros(gap * len(clicks))
for i, c in enumerate(clicks): buf[i * gap:i * gap + len(c)] += c
save(buf, "clicks", 128); meta["clicks"] = {"n": len(clicks), "every": 0.1, "len": 0.048}
# a rope run through the hands (the drop net's rope going down and coming up)
a = peak(fade(cut(load("1821.flac"), 0.3, 4.6), 0.02, 0.2), -4); save(a, "rope_run"); meta["rope_run"] = round(len(a) / SR, 2)
# footsteps: single steps of a shoe on concrete, each from its onset for 0.3 s, levelled to the same peak, 0.35 s apart
a = load("0514.flac"); env = np.sqrt(np.convolve(a ** 2, np.ones(220) / 220, "same")); db = 20 * np.log10(env + 1e-9); pk = db.max()
on = np.where((db[1:] > pk - 18) & (db[:-1] <= pk - 18))[0]; ons, last = [], -1e9
for o in on:
  if o - last > SR * 0.25: ons.append(o); last = o
steps = [peak(fade(a[max(0, o - int(0.008 * SR)):o + int(0.3 * SR)], 0.002, 0.08), -6) for o in ons[:24]]
gap = int(0.35 * SR); buf = np.zeros(gap * len(steps))
for i, c in enumerate(steps): buf[i * gap:i * gap + len(c)] += c
save(buf, "steps", 96); meta["steps"] = {"n": len(steps), "every": 0.35, "len": 0.3}
print(meta)
