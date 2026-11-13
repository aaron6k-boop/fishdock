// ---- fp-film: the first-person arms filmed through a whole catch, frame by frame, in the game itself ----
// Gate 4 of the rig rebuild (docs/CHARACTER-REBUILD.md): the hold and looking about, the cast, winding the reel in a
// fight, and the landing with the drop net, each played through the game's own code on the film clock (the same every
// run) and drawn a frame at a time, then put together as a video. Also reads what posing the arms cost each frame.
// Drawn in software here: right for checking the shapes and the motion, not proof of how smoothly a phone runs it.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/fp-film.mjs out/fp-film http://localhost:8820 [wide|phone] [fps]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [out = "out/fp-film", base = "http://localhost:8820", shape = "wide", fpsArg = "12"] = process.argv.slice(2);
const FPS = +fpsArg, STEP = 1000 / FPS;
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }
const VP = shape === "phone" ? { width: 390, height: 780 } : { width: 1280, height: 720 };
const dir = `${out}/${shape}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { window.__fdFilm = true; window.__fdPerfOn = true; localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "high", fishCam: "first" })); });
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
const errors = []; page.on("pageerror", (e) => { errors.push(e.message); console.log("ERR", e.message); });
await page.goto(`${base}/#play/gorleston-south-pier`);
await page.waitForFunction(() => window.__fdWorld && window.__fdWorld.play, null, { timeout: 150000 }); await page.waitForTimeout(15000);
const DAY = [{ sunAlt: 38, sunAz: 190 }, { cloudPct: 25, windKph: 14, windDir: 40 }];
await page.evaluate((env) => { const W = window.__fdWorld; W.freeze(); W.env(env[0], env[1]); W.step(8000); W.at(null); }, DAY);
let n = 0;
const snap = async () => { const r = await page.evaluate(() => { const c = document.querySelector(".w3d canvas"); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }); const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88, clip: { ...r, scale: 1 } }); writeFileSync(`${dir}/${String(n++).padStart(4, "0")}.jpg`, Buffer.from(data, "base64")); };
const shoot = async (seconds, each) => { for (let i = 0; i < Math.round(seconds * FPS); i++) { await page.evaluate(([s, i, f]) => { const W = window.__fdWorld; if (f) (0, eval)(f)(W, i); W.step(s); }, [STEP, i, each ? each.toString() : null]); await snap(); } };
const yaw0 = await page.evaluate(() => (window.__fdWorld.yaw ?? 0) * 180 / Math.PI);
// 1. the hold, then looking about: down at the reel, up, to each side
await page.evaluate((y) => { const W = window.__fdWorld; W.play([["cast", -30]], { species: "cod", lengthCm: 55 }); W.step(1500); W.view(y, -0.12); }, yaw0);
await shoot(1.5);
await shoot(5, `(W, i) => { const u = i / ${5 * FPS}; W.view(${yaw0} + 28 * Math.sin(u * Math.PI * 2), -0.12 - 0.5 * Math.sin(u * Math.PI)); }`);
await page.evaluate((y) => window.__fdWorld.view(y, -0.12), yaw0);
// 2. the cast
await page.evaluate(() => { const W = window.__fdWorld; W.play([["cast", 0]], { species: "cod", lengthCm: 55 }); });
await shoot(3.2);
// 3. a fish on: winding the reel (the handle turned steadily, as repeated taps turn it)
await page.evaluate(() => { const W = window.__fdWorld; window.__fdSpinRate = 7; W.play([["cast", -30], ["hooked", -0.5]], { species: "cod", lengthCm: 55 }); W.fightIn({ progress: 0.3, tension: 0.8, turns: 3, dir: 0.2 }); W.step(300); });
await shoot(4, "(W, i) => W.fightIn({ progress: 0.3 + i * 0.002, tension: 0.8, turns: 3 + i, dir: 0.2 })");
await page.evaluate(() => { window.__fdSpinRate = 0; });
// 4. landing it with the drop net
await page.evaluate(() => { const W = window.__fdWorld; W.play([["cast", -40], ["hooked", -20], ["catch", 0, { species: "cod", lengthCm: 62 }]], { species: "cod", lengthCm: 62 }); });
await shoot(11);
const perf = await page.evaluate(() => window.__fdPerf || null);
await browser.close();
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", `${dir}/%04d.jpg`, "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", `${out}/fp-film-${shape}.mp4`]);
console.log(`${n} frames, ${out}/fp-film-${shape}.mp4; posing the arms: ${perf ? `${(perf.ms / perf.n).toFixed(3)} ms a frame on average, ${perf.max.toFixed(2)} ms at most, over ${perf.n} frames` : "not measured"}; page errors: ${errors.length}`);
