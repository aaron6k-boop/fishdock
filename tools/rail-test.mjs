// ---- rail-test: do your arms, hands and rod stay out of the pier's railing? Measured, every frame ----
// Through a fight right at the rail (looking ahead, round to each side and down over it), a small fish lifted up the
// wall, and a drop-net landing: how far the arms' joints and fingertips and the rod go into the top and middle rails,
// in centimetres, by part, from the film-only probe (angler.js __fdProbe.local). Saves a picture of each stage's worst
// frame. Prints, per stage, the frames with anything over 1 cm into a rail and the worst.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/rail-test.mjs out/rail http://localhost:8820 [fight|lift|dropnet]
import { createRequire } from "node:module"; import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }
const [out, base = "http://localhost:8820", only = ""] = process.argv.slice(2);
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "low", fishCam: "first" })); });
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
const errors = []; p.on("pageerror", (e) => { errors.push(e.message); console.log("ERR", e.message); });
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 300000 }); await p.waitForTimeout(12000);
await p.waitForFunction(() => !document.body.innerText.includes("Loading "), null, { timeout: 120000 }).catch(() => {});
await p.evaluate(() => { const W = window.__fdWorld; W.freeze(); W.env({ sunAlt: 38, sunAz: 190 }, { cloudPct: 25, windKph: 14, windDir: 40 }); W.step(6000); W.at(null); });
const yaw0 = await p.evaluate(() => (window.__fdWorld.yaw ?? 0) * 180 / Math.PI);
const snap = async (name) => { const r = await p.evaluate(() => { const c = document.querySelector(".w3d canvas"); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 85, clip: { ...r, scale: 1 } }); writeFileSync(`${out}/${name}.jpg`, Buffer.from(data, "base64")); };
// (in the page: the deepest any part goes into the top or middle rail this frame)
const measure = () => p.evaluate(() => {
  const L = window.__fdProbe?.local; if (!L || !L.rail) return null;
  const rails = [[L.rail.y, L.rail.z, 0.026, "top"], [L.rail.y * 0.5, L.rail.z, 0.018, "middle"]];
  const segD = (a, b, py, pz) => { const ay = a[1], az = a[2], by = b[1], bz = b[2], dy = by - ay, dz = bz - az, l2 = dy * dy + dz * dz; let t = l2 ? ((py - ay) * dy + (pz - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ay + dy * t - py, az + dz * t - pz); };
  let worst = { pen: -1, what: "" };
  const test = (a, b, r, what) => { for (const [ry, rz, rr, rn] of rails) { const pen = rr + r - segD(a, b, ry, rz); if (pen > worst.pen) worst = { pen, what: `${what} / ${rn} rail` }; } };
  if (L.arms) for (const A of L.arms) { test(A.U, A.F, 0.05, `${A.S} upper arm`); test(A.F, A.H, 0.04, `${A.S} forearm`); for (const t of A.tips) test(A.H, t, 0.022, `${A.S} hand`); }
  for (let i = 0; i + 1 < L.rod.length; i++) test(L.rod[i], L.rod[i + 1], i < 3 ? 0.014 : 0.008, i < 3 ? "rod butt" : "rod");
  return { pen: +(worst.pen * 100).toFixed(1), what: worst.what, stage: window.__fdProbe.stage };
});
const stats = {}; const note = (stage, m, i) => { if (!m) return; const s = (stats[stage] ||= { frames: 0, over1: 0, worst: -99, what: "", at: 0 }); s.frames++; if (m.pen > 1) s.over1++; if (m.pen > s.worst) { s.worst = m.pen; s.what = m.what; s.at = i; } };
const report = (k) => { const s = stats[k]; if (s) console.log(`${k}: ${s.frames} frames, ${s.over1} with something over 1 cm into a rail; worst ${s.worst} cm (${s.what}) at frame ${s.at}`); };
const run = async (stage, frames, each) => { for (let i = 0; i < frames; i++) { await p.evaluate(([f, i]) => { const W = window.__fdWorld; if (f) (0, eval)(f)(W, i); W.step(100); }, [each ? each.toString() : null, i]); const m = await measure(); note(stage, m, i); if (m && stats[stage].at === i && m.pen > 1) await snap(`${stage}-worst`); } };
if (!only || only === "fight") {
// 1. a fight at the rail: looking ahead, round to each side, and down over the rail at the water below
await p.evaluate((y) => { const W = window.__fdWorld; W.view(y, -0.12); W.play([["cast", -30], ["hooked", -5]], { species: "cod", lengthCm: 55 }); W.fightIn({ progress: 0.85, tension: 0.7, turns: 0, dir: 0.1 }); W.step(1500); }, yaw0);
await run("fight-looking-about", 50, `(W, i) => { const u = i / 50; W.fightIn({ progress: 0.85, tension: 0.7, turns: i * 0.08, dir: 0.1 }); W.view(${yaw0} + 30 * Math.sin(u * Math.PI * 2), -0.12 - 0.95 * Math.sin(u * Math.PI)); }`); report("fight-looking-about");
}
if (!only || only === "lift") {
// 2. a small fish lifted up the wall (bass, 30 cm), looking where the game looks
await p.evaluate((y) => { const W = window.__fdWorld; W.view(y, -0.3); W.play([["cast", -40], ["hooked", -20], ["catch", 0, { species: "bass", lengthCm: 30 }]], { species: "bass", lengthCm: 30 }); }, yaw0);
await run("lift-landing", 85); report("lift-landing");
}
if (!only || only === "dropnet") {
// 3. a drop-net landing (cod, 62 cm)
await p.evaluate((y) => { const W = window.__fdWorld; W.view(y, -0.3); W.play([["cast", -40], ["hooked", -20], ["catch", 0, { species: "cod", lengthCm: 62 }]], { species: "cod", lengthCm: 62 }); }, yaw0);
await run("dropnet-landing", 110); report("dropnet-landing");
}
console.log("page errors", errors.length);
await b.close();
