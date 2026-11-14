// ---- the visual regression suite: ten fixed scenes at Gorleston South Pier, drawn the same way every time ----
// Each scene fixes the camera, the light, the weather and the moment in the fishing (a cast, a fight, a landing), so
// two builds can be put side by side and judged by eye (docs/QUALITY-STANDARD section 8). Nothing here passes or
// fails on its own: the pictures are for a person to look at.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/scenes.mjs out/scenes http://localhost:8820 [ultra|high|balanced|performance]
// Needs Playwright with Chromium (found through NODE_PATH or a global install). Drawn in software here, so the
// pictures show what the engine draws, not how fast a PC draws it.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

const [out = "out/scenes", base = "http://localhost:8820", gfx = "ultra"] = process.argv.slice(2);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }
mkdirSync(out, { recursive: true });

const DAY = [{ sunAlt: 38, sunAz: 190 }, { cloudPct: 25, windKph: 14, windDir: 40 }];
const SUNSET = [{ sunAlt: 3, sunAz: 250 }, { cloudPct: 35, windKph: 10, windDir: 60 }];
const RAIN = [{ sunAlt: 20, sunAz: 200 }, { cloudPct: 100, windKph: 28, windDir: 30, precipMm: 2.5 }];
const NIGHT = [{ sunAlt: -15, sunAz: 330, moonAlt: 35, moonAz: 150, moonIllum: 0.8 }, { cloudPct: 20, windKph: 8 }];
const FRET = [{ sunAlt: 30, sunAz: 190 }, { cloudPct: 100, windKph: 6, windDir: 40, fog: 0.85 }];
const STORM = [{ sunAlt: 12, sunAz: 220 }, { cloudPct: 100, windKph: 58, windDir: 30, precipMm: 6, thunder: true }];
// camera: [x, y, z, lookX, lookY, lookZ] in the world (the fishing spot is the origin, the sea to -z); rel: the same
// from the angler's feet (the anglers face -z);
// or fp: first person at the given pitch; play: the scripted events (seconds from now) and the fight to run
const SCENES = [
  { name: "01-daylight", env: DAY, cam: [-55, 3.8, -8, -20, 3, -4] },
  { name: "02-sunset", env: SUNSET, cam: [15, 3.6, 2, -100, 4, 2] },
  { name: "03-rain-wet-concrete", env: RAIN, cam: [-6, 2.2, 12, -18, 2.4, -6], settle: 30000 },
  { name: "04-night", env: NIGHT, cam: [-30, 4.5, 14, -12, 2.5, -2] },
  { name: "05-first-person-fishing", env: DAY, fp: -0.12, play: [["cast", -30]] },
  { name: "06-rod-and-reel-close", env: DAY, fp: -0.62, play: [["cast", -30]] },
  { name: "07-casting", env: DAY, third: true, me: { side: 1.6, fwd: -0.6, h: 1.6, lf: 0.8, lh: 1.4 }, play: [["cast", -0.5]] },
  { name: "08-fish-fighting", env: DAY, third: true, me: { side: 1.4, fwd: 0.6, h: 1.4, lf: 0.4, lh: 1.1 }, play: [["cast", -30], ["hooked", -6]], fight: { progress: 0.3, tension: 0.9, turns: 3, dir: 0.3 } },
  // (the landing is seen through the game's own landing camera, as a player sees it: no camera is set here)
  { name: "09-drop-net-landing", env: DAY, play: [["cast", -40], ["hooked", -20], ["catch", -7, { species: "cod", lengthCm: 62 }]], hint: { species: "cod", lengthCm: 62 }, step: 2500 },
  { name: "10-third-person-walking", env: DAY, third: true, walk: true, me: { side: 2.0, fwd: 1.5, h: 1.6, lf: 0.5, lh: 1.0 } },
  // (the weather added 13 November: a sea fret from the daylight view, and a storm caught in a lightning flash)
  { name: "11-sea-fret", env: FRET, cam: [-55, 3.8, -8, -20, 3, -4], settle: 20000 },
  { name: "12-storm-lightning", env: STORM, cam: [-55, 3.8, -8, -20, 3, -4], settle: 20000, flash: true },
];

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((g) => { window.__fdFilm = true; localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: g, fishCam: "first" })); }, gfx);
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
page.on("pageerror", (e) => console.log("ERR", e.message));
await page.goto(`${base}/#play/gorleston-south-pier`);
await page.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 150000 }); await page.waitForTimeout(20000);
// (the 3D view alone, not the panel beside it)
const snap = async (name) => { const r = await page.evaluate(() => { const c = document.querySelector(".w3d canvas"); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90, clip: { ...r, scale: 1 } }); writeFileSync(`${out}/${name}.jpg`, Buffer.from(data, "base64")); };
const setThird = async (on) => { await page.getByRole("button", { name: /menu/i }).first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(400); await page.getByText(on ? "Third person" : "First person", { exact: true }).click({ timeout: 5000 }).catch(() => {}); await page.keyboard.press("Escape").catch(() => {}); await page.evaluate(() => window.__fdWorld.step(1200)); };
let third = false;
// (ONLY=<pattern> draws just the scenes whose names match, e.g. ONLY=fret)
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const sc of SCENES.filter((s) => !ONLY || ONLY.test(s.name))) {
  if (!!sc.third !== third) { await setThird(!!sc.third); third = !!sc.third; }
  await page.evaluate(([env, settle]) => { const W = window.__fdWorld; W.freeze(); W.env(env[0], env[1]); W.step(settle); W.at(null); }, [sc.env, sc.settle || 8000]);
  if (sc.walk) await page.evaluate(() => { const W = window.__fdWorld; document.querySelector(".w3d-walkbtn")?.click(); W.step(600); W.walkInput(0, 1); W.step(1800); });
  if (sc.play) await page.evaluate((sc) => { const W = window.__fdWorld; W.play(sc.play, sc.hint || { species: "cod", lengthCm: 55 }); if (sc.fight) { for (let i = 0; i < 5; i++) { W.fightIn(sc.fight); W.step(200); } } else W.step(sc.step || 1200); }, sc);
  await page.evaluate((sc) => {
    const W = window.__fdWorld, P = window.__fdProbe;
    if (sc.cam) W.at(sc.cam[0], sc.cam[1], sc.cam[2], [sc.cam[3], sc.cam[4], sc.cam[5]]);
    else if (sc.fp != null) { W.at(null); W.view((W.yaw * 180) / Math.PI, sc.fp); }
    else if (sc.rel && P) { const f = P.feet; W.at(f[0] + sc.rel.cam[0], f[1] + sc.rel.cam[1], f[2] + sc.rel.cam[2], [f[0] + sc.rel.at[0], f[1] + sc.rel.at[1], f[2] + sc.rel.at[2]]); }
    else if (sc.me && P) { const f = P.feet, r = P.rod, n = r.length - 1; let fx = r[n][0] - f[0], fz = r[n][2] - f[2]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; const rx = -fz, rz = fx, m = sc.me;
      W.at(f[0] + rx * m.side + fx * m.fwd, f[1] + m.h, f[2] + rz * m.side + fz * m.fwd, [f[0] + fx * m.lf, f[1] + m.lh, f[2] + fz * m.lf]); }
    W.step(100);
    // (a storm: the clock run on until the lightning flashes, and the picture taken in it)
    if (sc.flash) { W.environment.strike(); W.step(16, true); }
  }, sc);
  await snap(sc.name); console.log("drawn", sc.name);
  if (sc.walk) await page.evaluate(() => { const W = window.__fdWorld; W.walkInput(0, 0); document.querySelector(".walk-pill[aria-label='Stop walking']")?.click(); W.step(500); });
}
await browser.close();
console.log(`${SCENES.length} scenes in ${out}`);
