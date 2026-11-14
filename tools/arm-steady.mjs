// ---- arm-steady: do your arms shake or jump? ----
// The game opened and a whole catch played through at a phone's 60 frames a second on the film clock (the same every
// run), frames made without drawing them (only every 60th is drawn), so it's quick even in software. Every frame: each
// hand and forearm from the eye. Checks:
//   - holding the rod as the game opens: the hands never reverse direction frame after frame (the 13 November
//     vibration: the rod put down 2% and picked up again every other frame);
//   - nowhere outside the cast does a hand or forearm move more than 10 cm in one frame (6 m/s: a snap, not a motion);
//   - the cast itself: under 15 cm a frame.
// Drawn in software here: right for the motion, not proof of how smoothly a phone runs it.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/arm-steady.mjs http://localhost:8820
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here"); process.exit(0); }
const base = (process.argv[2] || "http://localhost:8820").replace(/\/$/, "");
const FPS = 60, MS = 1000 / FPS;
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.playerName", "Tester"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: "first" })); });
const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.frames, null, { timeout: 300000 });
await p.evaluate(() => { window.__fdWorld.freeze(); window.__rows = []; window.__fi = 0; });
const run = (n, scene) => p.evaluate(([n, ms, scene]) => { const W = window.__fdWorld; W.frames(n, ms, () => {
  window.__fi++;
  if (window.__catch && window.__fi % 3 === 0) { const k = window.__fi * ms / 1000; W.fightIn({ progress: Math.min(1, Math.max(0, (k - 8.2) / 6.8)), tension: 0.55 + 0.25 * Math.sin(k * 1.7), turns: Math.max(0, (k - 8.2) * 2.2), dir: 0.2 * Math.sin(k * 0.6) }); }
  const P = window.__fdProbe, L = P?.local; window.__rows.push(L && L.arms ? { scene, st: P.stage, eye: L.eye, arms: L.arms.map((a) => ({ H: a.H, F: a.F })) } : null); }); }, [n, MS, scene]);
// the opening: until the arms are there, then six seconds holding the rod
for (let i = 0; i < 60 && !(await p.evaluate(() => window.__fdProbe?.local?.arms)); i++) { await run(30, "load"); await p.waitForTimeout(500); }
await p.evaluate(() => { window.__rows = []; });
for (let s = 0; s < 6; s++) { await run(FPS, "hold"); await p.waitForTimeout(200); }
// a whole catch: cast, waiting with the rod in its rest, a bite, the fight, landed
await p.evaluate(() => { window.__catch = true; window.__fi = 0; window.__fdWorld.play([["cast", 0.5], ["bite", 7], ["hooked", 8.2], ["catch", 15, { species: "bass", lengthCm: 44 }]], { species: "bass", lengthCm: 44 }); });
for (let s = 0; s < 24; s++) { await run(FPS, "catch"); await p.waitForTimeout(200); }
const rows = await p.evaluate(() => window.__rows); await b.close();
const sub = (a, c) => a.map((v, i) => v - c[i]), len = (a) => Math.hypot(...a), dot = (a, c) => a.reduce((s, v, i) => s + v * c[i], 0);
const rel = (r, s, k) => sub(r.arms[s][k], r.eye);
let reversals = 0, holdFrames = 0, worst = { mm: 0 }, worstCast = { mm: 0 };
for (let i = 2; i < rows.length; i++) {
  const a = rows[i - 2], c = rows[i - 1], d = rows[i]; if (!a || !c || !d) continue;
  for (const s of [0, 1]) for (const k of ["H", "F"]) {
    const v1 = sub(rel(c, s, k), rel(a, s, k)), v2 = sub(rel(d, s, k), rel(c, s, k)), mm = len(v2) * 1000;
    if (d.scene === "hold") { holdFrames++; if (len(v1) > 0.0005 && len(v2) > 0.0005 && dot(v1, v2) < -0.5 * len(v1) * len(v2)) reversals++; }
    const w = d.st === "cast" ? worstCast : worst; if (mm > w.mm) Object.assign(w, { mm, at: `${d.scene} frame ${i}, ${d.st}, ${s ? "right" : "left"} ${k === "H" ? "hand" : "forearm"}` });
  }
}
let fails = 0; const ok = (c, what) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++; };
ok(holdFrames > 100 && reversals === 0, `holding the rod as the game opens: ${reversals} reversals in ${holdFrames / 4} frames (the hands don't shake)`);
ok(worst.mm < 100, `outside the cast, the biggest move in one frame: ${worst.mm.toFixed(0)} mm (${worst.at})`);
ok(worstCast.mm < 150, `in the cast, the biggest move in one frame: ${worstCast.mm.toFixed(0)} mm (${worstCast.at})`);
ok(!errors.length, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
