// ---- a frame log: one catch, measured frame by frame and summed up by what you were doing ----
// (Settings, Graphics, Developer diagnostics, "Record a catch". The benchmark measures a still scene; stutter is in
// the changes: the strike, the fight, the landing, the fish on the mat. This keeps every frame's time with the phase
// it fell in and what the graphics card was given during it, so a hitch can be put down to its cause. No three.js.)

const pct = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(a.length * q) - 1))];

/** One row per phase, in the order first met: { phase, secs, frames, fps, p50, p95, p99, low1, worst, over33, over50, over100, shaders, textures, gpu } */
export function summarise(frames) {
  const order = [], by = new Map();
  for (const f of frames) { if (!by.has(f.phase)) { by.set(f.phase, []); order.push(f.phase); } by.get(f.phase).push(f); }
  return order.map((phase) => {
    const fs = by.get(phase), a = fs.map((f) => f.ms).sort((x, y) => x - y), sum = a.reduce((s, v) => s + v, 0), g = fs.map((f) => f.gpu).filter((v) => v != null);
    return {
      phase, secs: +(sum / 1000).toFixed(1), frames: a.length, fps: Math.round(1000 / (sum / a.length)),
      p50: +pct(a, 0.5).toFixed(1), p95: +pct(a, 0.95).toFixed(1), p99: +pct(a, 0.99).toFixed(1), low1: Math.round(1000 / pct(a, 0.99)), worst: +a[a.length - 1].toFixed(1),
      over33: a.filter((v) => v > 33.4).length, over50: a.filter((v) => v > 50).length, over100: a.filter((v) => v > 100).length,
      shaders: fs.reduce((s, f) => s + (f.shaders || 0), 0), textures: fs.reduce((s, f) => s + (f.textures || 0), 0),
      gpu: g.length ? +(g.reduce((s, v) => s + v, 0) / g.length).toFixed(1) : null,
    };
  });
}

/** The slowest frames, with what happened in each: [{ at (s into the recording), ms, phase, shaders, textures }] */
export function worstFrames(frames, n = 8) {
  let t = 0; const all = frames.map((f) => { t += f.ms; return { at: +(t / 1000).toFixed(1), ms: +f.ms.toFixed(1), phase: f.phase, shaders: f.shaders || 0, textures: f.textures || 0 }; });
  return all.sort((a, b) => b.ms - a.ms).slice(0, n);
}

/** A log to feed: frame(ms, { phase, programs, textures, gpu }) once a frame (the counts are running totals). */
export function createFrameLog() {
  const frames = []; let progWas = null, texWas = null;
  return {
    frame(ms, { phase = "-", programs = null, textures = null, gpu = null } = {}) {
      const shaders = progWas != null && programs != null ? Math.max(0, programs - progWas) : 0, tex = texWas != null && textures != null ? Math.max(0, textures - texWas) : 0;
      if (programs != null) progWas = programs; if (textures != null) texWas = textures;
      if (ms > 0 && ms < 60000) frames.push({ ms, phase, shaders, textures: tex, gpu });
    },
    get frames() { return frames; },
    report() { return { rows: summarise(frames), worst: worstFrames(frames) }; },
  };
}

/** The report as text to copy: a header saying what it was measured on, a row per phase, then the slowest frames. */
export function reportText(head, { rows, worst }, extra = "") {
  const lines = [head, "phase | secs | frames | avg fps | p50 ms | p95 ms | p99 ms | 1% low fps | worst ms | over 33 ms | over 50 | over 100 | shaders built | textures sent | GPU ms"];
  for (const r of rows) lines.push(`${r.phase} | ${r.secs} | ${r.frames} | ${r.fps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.low1} | ${r.worst} | ${r.over33} | ${r.over50} | ${r.over100} | ${r.shaders} | ${r.textures} | ${r.gpu ?? "n/a"}`);
  lines.push("slowest frames: " + worst.map((w) => `${w.ms} ms at ${w.at} s (${w.phase}${w.shaders ? `, ${w.shaders} shader${w.shaders > 1 ? "s" : ""} built` : ""}${w.textures ? `, ${w.textures} texture${w.textures > 1 ? "s" : ""} sent` : ""})`).join("; "));
  if (extra) lines.push(extra);
  return lines.join("\n");
}
