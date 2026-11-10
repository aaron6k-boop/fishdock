# FishDock: runs the build scripts dropped into FishDock-assets/queue, one at a time, and writes each one's log
# beside it (<name>.log, then <name>.done). Started once from Blender's Python console; stops when Blender closes
# or when a file called STOP appears in the queue folder.
import bpy, os, io, glob, traceback, contextlib, time
Q = "C:/Users/aaron/Documents/FishDock-assets/queue"
os.makedirs(Q, exist_ok=True)
def _tick():
    try:
        if os.path.exists(os.path.join(Q, "STOP")): print("fishdock watcher: stopped"); return None
        for f in sorted(glob.glob(os.path.join(Q, "*.py"))):
            base = f[:-3]
            if os.path.basename(f) == "watcher.py" or os.path.exists(base + ".done"): continue
            buf = io.StringIO(); t0 = time.time()
            try:
                src = open(f, encoding="utf-8").read()
                with contextlib.redirect_stdout(buf): exec(compile(src, f, "exec"), {"__name__": "__main__", "__file__": f})
                buf.write("\nOK %.1fs\n" % (time.time() - t0))
            except Exception:
                buf.write("\nFAILED\n" + traceback.format_exc())
            open(base + ".log", "w", encoding="utf-8").write(buf.getvalue()); open(base + ".done", "w").write("1")
            break
    except Exception: traceback.print_exc()
    return 1.0
bpy.app.timers.register(_tick, first_interval=1.0, persistent=True)
print("fishdock watcher: running on", Q)
