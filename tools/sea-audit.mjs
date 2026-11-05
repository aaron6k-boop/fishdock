// Capture the sea at fixed viewpoints in several conditions. Local preview only.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const base = process.argv[2], out = process.argv[3], quality = process.argv[4] || "balanced";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 780, height: 844 }, deviceScaleFactor: 1 });
const report = { base, quality, errors: [], scenes: [] };
page.on("pageerror", e => report.errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && /shader|WebGLProgram/i.test(m.text())) report.errors.push(m.text()); });
await page.addInitScript(q => {
  window.__fdFilm = true;
  let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: q }));
}, quality);
try {
  await page.goto(base + "/#try/gorleston-south-pier/cod/3d");
  await page.waitForFunction(() => window.__fdWorld?.me);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__fdWorld.freeze(); window.__fdWorld.at(-12, 3.5, -15, [-35, 0, -55]); });
  for (const [name, sunAlt, windKph, cloudPct, waveM] of [["day", 35, 20, 25, .8], ["rough", 18, 40, 85, 1.5], ["dusk", 3, 18, 35, .6], ["night", -18, 15, 20, .4]]) {
    await page.evaluate(({ sunAlt, windKph, cloudPct, waveM }) => {
      const w = window.__fdWorld;
      w.env({ sunAlt, sunAz: 220, moonAlt: 35, moonAz: 220, moonIllum: .8 }, { windKph, windDir: 240, cloudPct, waveM, precipMm: 0 });
      w.step(8000);
    }, { sunAlt, windKph, cloudPct, waveM });
    await page.screenshot({ path: join(out, `${name}.png`) });
    report.scenes.push({ name, stats: await page.evaluate(() => window.__fdWorld.stats) });
  }
  await page.evaluate(() => { const w = window.__fdWorld; w.at(null); w.view(90, -.48); w.env({ sunAlt: 25, sunAz: 210 }, { windKph: 20, cloudPct: 35, waveM: .8 }); w.step(8000); });
  await page.screenshot({ path: join(out, "deck.png") });
} catch (e) { report.errors.push(e.stack); }
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
await browser.close(); if (report.errors.length) process.exitCode = 1;
