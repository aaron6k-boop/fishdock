// Local-only visual regression check. Start the baseline on 4173 and changed app on 5173.
// Usage: node tools/polish-audit.mjs <base-url> <output-dir> [--baseline]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const base = process.argv[2] || "http://127.0.0.1:5173";
const out = process.argv[3] || "audit"; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const report = { base, errors: [], checks: [] };
page.on("pageerror", e => report.errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && /shader|WebGLProgram/i.test(m.text())) report.errors.push(m.text()); });
await page.addInitScript(() => {
  window.__fdFilm = true;
  let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "balanced", landCam2: true }));
});
try {
  await page.goto(base + "/#try/gorleston-south-pier/cod/3d");
  await page.waitForFunction(() => window.__fdWorld?.me, { timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const w = window.__fdWorld; w.freeze(); w.view(90, -0.48); w.step(1000); });
  await page.screenshot({ path: join(out, "water.png") });
  report.stats = await page.evaluate(() => window.__fdWorld.stats);
  // Repeat exactly the same tiny frame steps; software renderer timings are not phone FPS.
  report.stepMs = await page.evaluate(() => { const times = []; for (let i = 0; i < 30; i++) { const t = performance.now(); window.__fdWorld.step(16.667); times.push(performance.now() - t); } times.sort((a,b) => a-b); return { median: times[15], p95: times[28] }; });
  await page.getByRole("button", { name: "Walk about", exact: true }).click();
  await page.evaluate(() => window.__fdWorld.step(1500));
  const canvas = page.locator("canvas.w3d-canvas");
  await canvas.focus(); await page.keyboard.down("s"); await page.evaluate(() => window.__fdWorld.step(1500));
  const before = await page.evaluate(() => window.__fdWorld.walker);
  // Move focus to a real control while S is down, then release it outside the canvas.
  await page.getByRole("button", { name: "Menu", exact: true }).focus(); await page.keyboard.up("s");
  await page.evaluate(() => window.__fdWorld.step(2000));
  const after = await page.evaluate(() => window.__fdWorld.walker);
  report.checks.push({ name: "walking stops after focus loss", pass: after.speed === 0, before, after });
  await page.screenshot({ path: join(out, "walking.png") });
  report.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
} catch (e) { report.errors.push(e.stack); }
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report)); await browser.close();
if (report.errors.length || (!process.argv.includes("--baseline") && report.checks.some(c => !c.pass))) process.exitCode = 1;
