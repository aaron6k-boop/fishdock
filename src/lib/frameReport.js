// ---- frameReport: what the worst frame was: shaders built, textures sent, the game's own code, and where the rest of the time went
// (the page's thread held up by something else, or the graphics card or browser; the page hidden; the resolution
// changed). Shown on the FPS display so a phone recording says what each stutter was ----
export function spikeParts(sp) {
  const out = [];
  if (sp.hidden) out.push("page hidden");
  if (sp.resized) out.push("resolution changed");
  if (sp.shaders) out.push(`${sp.shaders} shader${sp.shaders > 1 ? "s" : ""}`);
  if (sp.tex) out.push(`${sp.tex} texture${sp.tex > 1 ? "s" : ""}`);
  out.push(`JS ${sp.js} ms`);
  if (sp.main != null && !sp.hidden) { const rest = sp.ms - sp.js; if (sp.main >= 30) out.push(`page busy ${sp.main} ms`); else if (rest >= 60) out.push(`GPU or browser ${Math.round(rest)} ms`); }
  return out;
}
