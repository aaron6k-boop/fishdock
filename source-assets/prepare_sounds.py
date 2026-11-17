# ---- prepare_sounds: FishDock's recorded sounds (public/sounds/), from BigSoundBank's CC0 recordings ----
# The beds cut to a seamless loop (the tail crossfaded into the head over 3 s), the one-shots trimmed of their silence;
# everything mono but the harbour; the beds at -20 dB RMS (sceneRecordings.js matches them to the drawn beds' levels),
# the one-shots peaking at -3 dB; MP3, which every browser decodes. The originals are listed with their hashes in
# ASSET-LICENCES.json (bigsoundbank:*). Run with the folder of the originals and the repository's public/sounds:
#   python prepare_sounds.py "C:/Users/aaron/Documents/FishDock-assets/downloads/bigsoundbank" ../public/sounds
import subprocess, json, os, sys
import numpy as np
RAW, OUT = sys.argv[1], sys.argv[2]
def load(f, ch):
  r = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", str(ch), "-ar", "44100", "-f", "f32le", "-"], capture_output=True, check=True)
  a = np.frombuffer(r.stdout, np.float32).reshape(-1, ch); return a
def save(a, name, kbps):
  ch = a.shape[1]; tmp = f"/tmp/fd_{name}.f32"; a.astype(np.float32).tofile(tmp)
  subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", "44100", "-ac", str(ch), "-i", tmp, "-c:a", "libmp3lame", "-b:a", f"{kbps}k", os.path.join(OUT, name + ".mp3")], check=True); os.remove(tmp)
def rms_db(a): return 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-12)
def limit(a, knee=0.7, ceil=0.95):
  # (a soft limiter: untouched below the knee, the peaks above it rounded off towards the ceiling, so levelling a peaky
  # recording up to -20 dB never clips it)
  m = np.abs(a); over = m > knee; out = a.copy(); r = ceil - knee
  out[over] = np.sign(a[over]) * (knee + r * np.tanh((m[over] - knee) / r)); return out
def norm(a, target_db):
  for _ in range(3): a = limit(a * (10 ** ((target_db - rms_db(a)) / 20)))  # (levelled, limited, levelled again)
  return a
def loop(a, start, secs, xf=3.0):
  sr = 44100; s = int(start * sr); n = int(secs * sr); x = int(xf * sr)
  seg = a[s:s + n + x].copy()
  head, tail = seg[:x], seg[n:n + x]
  t = np.linspace(0, 1, x)[:, None]; w_in, w_out = np.sin(t * np.pi / 2), np.cos(t * np.pi / 2)
  out = seg[:n].copy(); out[:x] = head * w_in + tail * w_out  # (the loop's end runs into its start with no seam)
  return out
def trim(a, thr=-50):
  e = np.abs(a).max(1); lvl = 10 ** (thr / 20); idx = np.where(e > lvl)[0]
  b = a[max(0, idx[0] - 200):idx[-1] + 2000].copy(); f = np.linspace(0, 1, min(2000, len(b)))[:, None]; b[-len(f):] *= f[::-1]; return b
meta = {}
def bed(src, name, ch, start, secs, db, kbps):
  a = norm(loop(load(os.path.join(RAW, src), ch), start, secs), db); save(a, name, kbps); meta[name] = {"from": src, "seconds": round(len(a) / 44100, 2), "rmsDb": round(float(rms_db(a)), 1)}
def shot(src, name, db_peak=-3, kbps=96, start=0, secs=None):
  a = load(os.path.join(RAW, src), 1)
  if secs: a = a[int(start * 44100):int((start + secs) * 44100)]
  a = trim(a); a = a * (10 ** (db_peak / 20) / (np.abs(a).max() + 1e-9)); save(a, name, kbps); meta[name] = {"from": src, "seconds": round(len(a) / 44100, 2), "rmsDb": round(float(rms_db(a)), 1)}
bed("bsb_0266_sea_waves_moderate.ogg", "sea_waves", 1, 2, 50, -20, 80)
bed("bsb_1444_marina_ripples.flac", "sea_lap", 1, 10, 60, -20, 80)
bed("bsb_2573_gulls_harbour.flac", "harbour", 2, 4, 100, -20, 112)
bed("bsb_1289_rain_concrete.flac", "rain_light", 1, 4, 60, -20, 80)
bed("bsb_1290_rain_puddle.flac", "rain_heavy", 1, 4, 60, -20, 80)
bed("bsb_0595_wind_foley.flac", "wind", 1, 6, 70, -20, 80)
bed("bsb_0155_wind_whistle.ogg", "wind_whistle", 1, 2, 38, -20, 80)
def reel(src, name):
  # (the reel's turning levelled by its loudness, not its peaks: its clicks are sharp, so peak-levelled it was 37 dB down)
  a = load(os.path.join(RAW, src), 1)[int(1 * 44100):int(10 * 44100)]; a = norm(a, -18); save(a, name, 96); meta[name] = {"from": src, "seconds": round(len(a) / 44100, 2), "rmsDb": round(float(rms_db(a)), 1)}
for n, s in (("reel_fast", "bsb_1435_reel_fast.flac"), ("reel_medium", "bsb_1436_reel_medium.flac"), ("reel_slow", "bsb_1437_reel_slow.flac")): reel(s, n)
for n, s in (("splash_small_1", "bsb_1529_splash_small_1.flac"), ("splash_small_2", "bsb_1531_splash_small_3.flac"), ("splash_big", "bsb_1519_splash_big_1.flac")): shot(s, n)
print(json.dumps(meta, indent=1))
