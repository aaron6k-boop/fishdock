// ---- the loading gate: how far along a 3D place is, and when it is fit to show ----
// A place arrives in three parts: its data and code (the world is built), its files (models and textures, counted by
// the loader), and the warm-up (the graphics card building its shaders and taking the textures, seen as the counts of
// programs, textures and shapes still changing from frame to frame). The picture is held back until all three are
// done, so the first thing you see is the finished place running smoothly, not one still filling in.
// No three.js here: World3D feeds it the numbers.

export const LOAD_PARTS = { built: 15, files: 70, warm: 15 }; // (their shares of the bar, in percent)

/**
 * @param {object} o  now(): ms; quietMs: how long the files must have been all in; stillMs and stillFrames: how long,
 *   and for how many frames, the graphics card's counts must have stopped changing; maxMs: show it anyway after this
 *   long from the world being built (a file that never arrives must not keep you out)
 */
export function createLoadGate({ now = () => performance.now(), quietMs = 700, stillMs = 600, stillFrames = 8, maxMs = 25000 } = {}) {
  let builtAt = null, loaded = 0, total = 0, itemAt = 0, sig = "", stillAt = 0, frames = 0, top = 0, done = false;
  const filesIn = () => loaded >= total && now() - itemAt >= quietMs;
  return {
    /** The world exists: its files are now on their way. */
    built() { if (builtAt == null) { builtAt = itemAt = stillAt = now(); } },
    /** From the loader: files finished, files asked for so far. */
    files(l, t) { if (l !== loaded || t !== total) { loaded = l; total = t; itemAt = now(); } },
    /** Once a frame: the graphics card's counts ({ programs, textures, geometries }). */
    frame(info) {
      const s = info ? `${info.programs}|${info.textures}|${info.geometries}` : "";
      if (s !== sig) { sig = s; stillAt = now(); frames = 0; } else frames++;
    },
    /** Files in, and files asked for so far. */
    get counts() { return [Math.min(loaded, total), total]; },
    /** 0 to 100, never going back. */
    get pct() {
      if (done) return 100;
      let p = 0;
      if (builtAt != null) {
        p = LOAD_PARTS.built + LOAD_PARTS.files * (total ? Math.min(1, loaded / total) : filesIn() ? 1 : 0);
        if (filesIn()) p = LOAD_PARTS.built + LOAD_PARTS.files + LOAD_PARTS.warm * Math.min(0.99, Math.min((now() - stillAt) / stillMs, frames / stillFrames));
      }
      top = Math.max(top, Math.min(99, Math.floor(p)));
      return top;
    },
    /** Fit to show: everything in and settled, or it has simply been too long. */
    get ready() {
      if (done) return true;
      if (builtAt == null) return false;
      if ((filesIn() && now() - stillAt >= stillMs && frames >= stillFrames) || now() - builtAt >= maxMs) done = true;
      return done;
    },
  };
}
