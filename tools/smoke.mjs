// Phone-size smoke test: opens the single-file build in Chromium at iPhone and small-Android sizes, visits every
// screen, opens the main sheets and fails on any page error, console error or horizontal overflow.
// Usage: node tools/build-preview.mjs --server && node tests/e2e/server.mjs & node tools/smoke.mjs http://localhost:8792 [--shots dir]
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const arg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "dist-preview/fishdock-preview.html";
const target = /^https?:/.test(arg) ? arg : `file://${resolve(arg)}`;
const shotsAt = process.argv.indexOf("--shots");
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const sizes = [{ name: "iphone-14", width: 390, height: 844 }, { name: "small-android", width: 360, height: 740 }];
const exe = process.env.CHROME || "/usr/bin/google-chrome";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
let failures = 0;

const outside = new Set();
for (const size of sizes) {
  for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
    // Outside hosts (map tiles, depth shading) are answered empty, so a machine with no internet gives the same result.
    // The hosts asked for are listed once at the end, to spot anything unexpected.
    await page.route((url) => /^https?:/.test(url.href) && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (r) => { outside.add(new URL(r.request().url()).hostname); r.fulfill({ status: 204, body: "" }); });
    const html = target;
    await page.addInitScript((t) => { try { localStorage.setItem("fishdock.settings.v1", JSON.stringify({ onboarded: true, theme: t })); } catch {} }, theme);
    await page.goto(html);
    await page.waitForTimeout(700);
    const visit = async (label, fn) => {
      try { await fn(); await page.waitForTimeout(350); } catch (e) { problems.push(`${label}: ${e.message.split("\n")[0]}`); }
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) problems.push(`${label}: page is ${over}px wider than the screen`);
      if (shots) await page.screenshot({ path: `${shots}/${size.name}-${theme}-${label}.png` });
    };
    const tab = (name) => page.locator(`.tabbar .tab[data-tab="${name}"]`).click();
    const close = () => page.locator(".sheet .xbtn").last().click();
    await visit("home", async () => {});
    await visit("home-catch-sheet", async () => { await page.getByRole("button", { name: "What can I catch here?" }).first().click(); });
    await visit("home-catch-close", close);
    await visit("home-how", async () => { await page.getByRole("button", { name: "How it works" }).first().click(); });
    await visit("home-how-close", close);
    await visit("checklist", async () => { await page.getByRole("button", { name: "Before you go" }).click(); });
    await visit("checklist-close", close);
    await visit("explore", () => tab("explore"));
    await visit("explore-species", () => page.getByRole("tab", { name: "Fish species" }).click());
    await visit("species-sheet", () => page.locator(".sp-card").first().click());
    await visit("species-close", close);
    await visit("tackle", () => tab("tackle"));
    await visit("tackle-rigs", () => page.getByRole("tab", { name: "Rigs" }).click());
    await visit("rig-sheet", () => page.locator(".rig-card").first().click());
    await visit("rig-close", close);
    await visit("tackle-knots", () => page.getByRole("tab", { name: "Knots" }).click());
    await visit("tackle-baits", () => page.getByRole("tab", { name: "Baits" }).click());
    await visit("catches", () => tab("catches"));
    await visit("catch-form", () => page.getByRole("button", { name: "Log a catch" }).first().click());
    await visit("catch-form-close", close);
    await visit("community", () => tab("community"));
    await visit("live", async () => { await tab("home"); await page.getByRole("button", { name: /Start fishing/ }).first().click(); });
    await visit("live-start", () => page.getByRole("button", { name: "Start fishing" }).last().click());
    await visit("live-bite", () => page.locator(".counter.bite").click());
    await visit("live-end", async () => { await page.getByRole("button", { name: "End" }).click(); await page.getByRole("button", { name: "End and save" }).click(); });
    await visit("cast", () => page.evaluate(() => { location.hash = "cast"; }));
    await visit("settings", () => page.evaluate(() => { location.hash = "settings"; }));
    if (problems.length) { failures += problems.length; console.log(`✗ ${size.name} ${theme}:\n  ${problems.join("\n  ")}`); }
    else console.log(`✓ ${size.name} ${theme}: every screen opened with no errors or overflow`);
    await ctx.close();
  }
}
await browser.close();
if (outside.size) console.log(`outside hosts asked for (answered empty): ${[...outside].sort().join(", ")}`);
process.exit(failures ? 1 : 0);
