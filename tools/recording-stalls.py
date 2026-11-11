#!/usr/bin/env python3
"""How smooth was a screen recording of FishDock? Measured from the recording itself.

    python3 tools/recording-stalls.py recording.mp4 [crop=W:H:X:Y]

A phone records its screen at 60 frames a second whatever the game manages. Where the game missed a frame, the
recording holds the same picture twice. The sea never stops moving, so inside the 3D picture two identical frames in a
row mean the game drew nothing new: this counts them. It prints the game's own frame intervals (p50, p95, p99, worst),
how many gaps ran over 50, 100 and 200 ms, a line every three seconds, and every stall over 80 ms with its time, so each
can be matched to what was happening on screen.

Needs ffmpeg and ffprobe. The crop (default: the middle of a portrait phone recording) should cover moving 3D picture
and no fixed controls. A moment when the picture really is still (a panel covering it) would read as a stall.
"""
import re, subprocess, sys, tempfile, os

def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    video = sys.argv[1]; crop = next((a.split("=", 1)[1] for a in sys.argv[2:] if a.startswith("crop=")), None)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip().split(",")
    w, h = int(probe[0]), int(probe[1])
    if not crop: crop = f"{int(w * 0.83)}:{int(h * 0.57)}:{int(w * 0.083)}:{int(h * 0.19)}"
    with tempfile.TemporaryDirectory() as d:
        diff = os.path.join(d, "diff.txt")
        subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"crop={crop},scale=250:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file={diff}", "-f", "null", "-"], check=True)
        vals = [float(x) for x in re.findall(r"YAVG=([\d.]+)", open(diff).read())]
    pts = [float(x.strip().strip(",")) for x in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", video], capture_output=True, text=True).stdout.split("\n") if x.strip()][1:]
    n = min(len(vals), len(pts)); vals, pts = vals[:n], pts[:n]
    # a repeated frame differs from the one before only by compression noise; a new one by the moving sea
    TH = 0.25
    new = [i for i, v in enumerate(vals) if v >= TH]
    iv = [(pts[new[k]] - pts[new[k - 1]]) * 1000 for k in range(1, len(new))]
    s = sorted(iv); p = lambda q: s[min(len(s) - 1, int(len(s) * q))]
    print(f"{video}: {w}x{h}, {pts[-1]:.1f} s, {n} recorded frames, {len(new)} new game frames, {n - len(new)} repeats (crop {crop})")
    print(f"game frame interval: p50 {p(.5):.1f} ms, p95 {p(.95):.1f} ms, p99 {p(.99):.1f} ms, worst {s[-1]:.0f} ms; average {1000 / (sum(iv) / len(iv)):.1f} frames a second")
    print(f"gaps over 50 ms: {sum(1 for x in iv if x > 50)}; over 100 ms: {sum(1 for x in iv if x > 100)}; over 200 ms: {sum(1 for x in iv if x > 200)}")
    rows = []
    for a in range(0, int(pts[-1]) + 1, 3):
        ks = [k for k in range(1, len(new)) if a <= pts[new[k]] < a + 3]
        rows.append(f"{a}s {len(ks) / 3:.0f}fps worst {max(((pts[new[k]] - pts[new[k - 1]]) * 1000 for k in ks), default=0):.0f}ms")
    print("every 3 s: " + " | ".join(rows))
    print("stalls over 80 ms: " + ("; ".join(f"{(pts[new[k]] - pts[new[k - 1]]) * 1000:.0f} ms at {pts[new[k]]:.1f} s" for k in range(1, len(new)) if (pts[new[k]] - pts[new[k - 1]]) * 1000 > 80) or "none"))

if __name__ == "__main__":
    main()
