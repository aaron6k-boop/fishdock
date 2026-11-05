// Exercise the real controls; the existing demo Testing panel skips only the long fight.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const base = process.argv[2] || "http://127.0.0.1:5173", out = process.argv[3] || "audit";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const report = { errors: [], stages: [], checks: [] };
page.on("pageerror", e => report.errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && /shader|WebGLProgram/i.test(m.text())) report.errors.push(m.text()); });
await page.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "performance", landCam2: true })); let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); });
try {
  await page.goto(base + "/#try/gorleston-south-pier/cod/3d");
  await page.waitForFunction(() => window.__fdWorld?.me);
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Cast: hold to build power, let go to cast" }).click();
  const strike = page.getByRole("button", { name: "Strike", exact: true });
  await strike.waitFor({ timeout: 35000 }); await page.waitForTimeout(1000); await strike.click();
  const reel = page.getByRole("button", { name: /^Reel: tap/ }); await reel.waitFor();
  for (let i = 0; i < 8; i++) { await reel.click(); await page.waitForTimeout(160); }
  await page.waitForTimeout(150);
  const fight = await page.evaluate(() => window.__fdWorld.fight);
  report.checks.push({ name: "eight taps register eight times", pass: fight.taps === 8, taps: fight.taps, turns: fight.turns });
  await page.screenshot({ path: join(out, "reeling.png") });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fish, place and weather" }).click();
  await page.getByRole("button", { name: "Land it now", exact: true }).click();
  const start = Date.now();
  while (Date.now() - start < 45000) {
    const state = await page.evaluate(() => window.__fdWorld.me);
    const stage = state?.land?.stage;
    if (stage && !report.stages.includes(stage)) { report.stages.push(stage); await page.screenshot({ path: join(out, `landing-${stage}.png`) }); }
    if (await page.getByRole("button", { name: /Your fish is landed/ }).isVisible()) break;
    await page.waitForTimeout(350);
  }
  await page.getByRole("button", { name: /Your fish is landed/ }).click();
  await page.waitForTimeout(1000); await page.screenshot({ path: join(out, "inspect-transition.png") });
  await page.waitForTimeout(2000); await page.screenshot({ path: join(out, "inspect.png") });
  await page.getByRole("button", { name: "Put it back", exact: true }).click();
  await page.waitForTimeout(3000); await page.screenshot({ path: join(out, "release.png") });
  await page.getByRole("button", { name: "Cast: hold to build power, let go to cast" }).waitFor({ timeout: 40000 });
  report.checks.push({ name: "landing, inspection and release return to casting", pass: true });
} catch (e) { report.errors.push(e.stack); }
writeFileSync(join(out, "fishing-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
await browser.close();
if (report.errors.length || report.checks.some(c => !c.pass)) process.exitCode = 1;
