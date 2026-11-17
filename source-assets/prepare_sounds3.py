# FishDock (17 Nov): the third set of recorded sounds (BigSoundBank, CC0, all by Joseph Sardin): thunder (three claps,
# near to far), a small bell's single strike for the rod-tip bell, drops of water for a lifted net draining, water
# swirling for the net going in, and slaps for a fish's tail on the mat. Trimmed, faded, levelled, mono MP3.
import subprocess, numpy as np, os, sys
RAW, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True) # the originals (FishDock-assets/downloads/bigsoundbank) and public/sounds
SR = 44100
def load(f):
  r = subprocess.run(["ffmpeg", "-v", "error", "-i", f"{RAW}/{f}", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True); return np.frombuffer(r.stdout, np.float32).copy()
def save(a, name, kbps=96):
  tmp = f"/tmp/fd3_{name}.f32"; a.astype(np.float32).tofile(tmp)
  subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", tmp, "-c:a", "libmp3lame", "-b:a", f"{kbps}k", f"{OUT}/{name}.mp3"], check=True); os.remove(tmp)
def fade(a, fi=0.004, fo=0.03):
  a = a.copy(); i, o = max(1, int(fi * SR)), max(1, int(fo * SR)); a[:i] *= np.linspace(0, 1, i); a[-o:] *= np.linspace(1, 0, o); return a
def peak(a, db=-3.0): return a * (10 ** (db / 20) / (np.abs(a).max() + 1e-9))
def cut(a, t0, t1): return a[int(t0 * SR):int(t1 * SR)]
def lowpass(a, hz):
  # (a gentle one-pole low-pass, twice: duller, as a slap on a wet rubber mat is next to a hand's)
  k = np.exp(-2 * np.pi * hz / SR)
  for _ in range(2):
    y = np.empty_like(a); s = 0.0
    for i in range(len(a)): s = (1 - k) * a[i] + k * s; y[i] = s
    a = y
  return a
def env_db(a, w=441): e = np.sqrt(np.convolve(a ** 2, np.ones(w) / w, "same")); return 20 * np.log10(e + 1e-9)
def onsets(a, below=15, gap=0.15):
  db = env_db(a); pk = db.max(); on = np.where((db[1:] > pk - below) & (db[:-1] <= pk - below))[0]; out, last = [], -1e9
  for o in on:
    if o - last > SR * gap: out.append(o); last = o
  return out
meta = {}
# thunder: a short near clap and roll, a longer one, and a long rolling one for a storm further off
for name, f, t1 in (("thunder_a", "3113.flac", 5.0), ("thunder_b", "3114.flac", 11.2), ("thunder_c", "3116.flac", 21.0)):
  a = load(f); o = onsets(a, 25)[0] / SR; a = peak(fade(cut(a, max(0, o - 0.15), t1), 0.05, 1.5), -2); save(a, name, 64); meta[name] = round(len(a) / SR, 2)
# the rod-tip bell: one strike of a small bell (about 2.7 kHz, as a rod bell is), its ring left to die away
a = load("0292.ogg"); o = onsets(a)[0]; a = peak(fade(a[max(0, o - int(0.002 * SR)):o + int(1.6 * SR)], 0.001, 0.4), -3); save(a, "bell_tip", 96); meta["bell_tip"] = round(len(a) / SR, 2)
# drops: four bursts of many drops (water running out of a lifted net's mesh), each from its onset for 0.6 s, 0.7 s apart
a = load("1384.flac"); ds = [peak(fade(a[max(0, o - int(0.01 * SR)):o + int(0.6 * SR)], 0.005, 0.15), -4) for o in onsets(a, 20, 1.0)[:4]]
gap = int(0.7 * SR); buf = np.zeros(gap * len(ds))
for i, d in enumerate(ds): buf[i * gap:i * gap + len(d)] += d
save(buf, "drops", 96); meta["drops"] = {"n": len(ds), "every": 0.7, "len": 0.6}
# water swirling: the net going into the water and filling
a = peak(fade(cut(load("0245.ogg"), 0.75, 2.6), 0.01, 0.4), -4); save(a, "swirl", 96); meta["swirl"] = round(len(a) / SR, 2)
# slaps: single slaps, duller (a fish's tail on the wet mat), each 0.25 s, 0.3 s apart
a = load("0597.ogg"); ss = [peak(fade(lowpass(a[max(0, o - int(0.004 * SR)):o + int(0.25 * SR)], 2600), 0.002, 0.08), -4) for o in onsets(a, 20, 0.5)[:12]]
gap = int(0.3 * SR); buf = np.zeros(gap * len(ss))
for i, d in enumerate(ss): buf[i * gap:i * gap + len(d)] += d
save(buf, "slaps", 96); meta["slaps"] = {"n": len(ss), "every": 0.3, "len": 0.25}
print(meta)
