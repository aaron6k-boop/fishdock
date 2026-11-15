// ---- arm-steady: do your arms shake or jump? ----
// The game opened and a whole catch played through at a phone's 60 frames a second on the film clock (the same every
// run), frames made without drawing them (only every 60th is drawn), so it's quick even in software. Every frame: each
// hand and forearm from the eye. Checks:
//   - holding the rod as the game opens: the hands never reverse direction frame after frame (the 13 November
//     vibration: the rod put down 2% and picked up again every other frame);
//   - nowhere outside the cast does a hand or forearm move more than 10 cm in one frame (6 m/s: a snap, not a motion);
//   - the cast itself: under 15 cm a frame;
//   - the rod itself (its butt and middle), outside the cast: under 10 cm a frame, in your hands or put down;
//   - a 77 cm thornback ray landed with the drop net: no hand flicking back and forth on the rope (the 14 November
//     flicker: 4 cm every frame for seconds, two ways of holding the rope each chosen in turn).
// Only frames where your arms are drawn count: a put-away arm can't be seen to move.
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
const errors = [];
async function catchRows(species, lengthCm, seconds) {
const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.frames, null, { timeout: 300000 });
await p.evaluate(() => { window.__fdWorld.freeze(); window.__rows = []; window.__fi = 0; });
const run = (n, scene) => p.evaluate(([n, ms, scene]) => { const W = window.__fdWorld; W.frames(n, ms, () => {
  window.__fi++;
  if (window.__catch && window.__fi % 3 === 0) { const k = window.__fi * ms / 1000; W.fightIn({ progress: Math.min(1, Math.max(0, (k - 8.2) / 6.8)), tension: 0.55 + 0.25 * Math.sin(k * 1.7), turns: Math.max(0, (k - 8.2) * 2.2), dir: 0.2 * Math.sin(k * 0.6) }); }
  const P = window.__fdProbe, L = P?.local; (window.__rodRows ||= []).push(L?.rod ? { scene, st: P.stage, rod: [L.rod[0], L.rod[Math.floor(L.rod.length / 2)]] } : null); window.__rows.push(L && L.arms && L.shown !== false ? { scene, st: P.stage, eye: L.eye, arms: L.arms.map((a) => ({ H: a.H, F: a.F })) } : null); }); }, [n, MS, scene]);
// the opening: until the arms are there, then six seconds holding the rod
for (let i = 0; i < 60 && !(await p.evaluate(() => window.__fdProbe?.local?.arms)); i++) { await run(30, "load"); await p.waitForTimeout(500); }
await p.evaluate(() => { window.__rows = []; });
for (let s = 0; s < 6; s++) { await run(FPS, "hold"); await p.waitForTimeout(200); }
// a whole catch: cast, waiting with the rod in its rest, a bite, the fight, landed
await p.evaluate(([sp, cm]) => { window.__catch = true; window.__fi = 0; window.__fdWorld.play([["cast", 0.5], ["bite", 7], ["hooked", 8.2], ["catch", 15, { species: sp, lengthCm: cm }]], { species: sp, lengthCm: cm }); }, [species, lengthCm]);
for (let s = 0; s < seconds; s++) { await run(FPS, "catch"); await p.waitForTimeout(200); }
const rows = await p.evaluate(() => window.__rows); rows.rod = await p.evaluate(() => window.__rodRows.filter((r) => r && r.scene !== "load")); await p.close(); return rows;
}
const rows = await catchRows("bass", 44, 24), ray = await catchRows("thornback-ray", 77, 30); await b.close();
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
// the drop net: a hand moving over a centimetre a frame that turns straight back the next, on the rope
let flicks = 0, ropeFrames = 0, rayWorst = { mm: 0 };
for (let i = 2; i < ray.length; i++) {
  const a = ray[i - 2], c = ray[i - 1], d = ray[i]; if (!a || !c || !d || !/^(lower|lead|haul)$/.test(d.st)) continue; ropeFrames++;
  for (const s of [0, 1]) for (const k of ["H", "F"]) { const v1 = sub(rel(c, s, k), rel(a, s, k)), v2 = sub(rel(d, s, k), rel(c, s, k)); if (len(v1) > 0.01 && len(v2) > 0.01 && dot(v1, v2) < -0.5 * len(v1) * len(v2)) flicks++; if (len(v2) * 1000 > rayWorst.mm) Object.assign(rayWorst, { mm: len(v2) * 1000, at: `frame ${i}, ${d.st}, ${s ? "right" : "left"} ${k === "H" ? "hand" : "forearm"}` }); }
}
// the rod itself (its butt and its middle, in your own frame): never a jump, in your hands or put down, outside the cast
// (the rod put down to land a fish in first person went 30 cm in a frame, 13 November)
let rodWorst = { mm: 0 };
for (const [name, rr] of [["bass", rows.rod], ["ray", ray.rod]]) for (let i = 1; i < rr.length; i++) { const a = rr[i - 1], d = rr[i]; if (!a || !d || d.st === "cast" || a.st === "cast") continue;
  for (const k of [0, 1]) { const mm = len(sub(d.rod[k], a.rod[k])) * 1000; if (mm > rodWorst.mm) Object.assign(rodWorst, { mm, at: `${name} frame ${i}, ${d.st}, its ${k ? "middle" : "butt"}` }); } }
let fails = 0; const ok = (c, what) => { console.log(`${c ? "PASS" : "FAIL"}  ${what}`); if (!c) fails++; };
ok(holdFrames > 100 && reversals === 0, `holding the rod as the game opens: ${reversals} reversals in ${holdFrames / 4} frames (the hands don't shake)`);
ok(worst.mm < 100, `outside the cast, the biggest move in one frame: ${worst.mm.toFixed(0)} mm (${worst.at})`);
ok(worstCast.mm < 150, `in the cast, the biggest move in one frame: ${worstCast.mm.toFixed(0)} mm (${worstCast.at})`);
ok(rodWorst.mm < 100, `the rod outside the cast, the biggest move in one frame: ${rodWorst.mm.toFixed(0)} mm (${rodWorst.at})`);
ok(ropeFrames > 200 && flicks <= 10, `the drop net's rope: ${flicks} flicks back and forth in ${ropeFrames} frames (biggest move there ${rayWorst.mm.toFixed(0)} mm, ${rayWorst.at})`);
ok(!errors.length, `no page errors${errors.length ? `: ${errors[0]}` : ""}`);
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks passed"); process.exit(fails ? 1 : 0);
