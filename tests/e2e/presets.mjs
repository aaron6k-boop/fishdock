// ---- graphics presets: changed again and again while fishing and while walking, without an exception ----
// Changing the preset tears the whole 3D world down and builds it again, with the angler (rod, line, fish, net)
// disposed and recreated under a live fishing session. This loads Gorleston South Pier, casts, cycles every preset
// twice while the cast is out and the fish is being reeled, then walks about with the W key and cycles them again,
// and fails on any uncaught page error (the dispose bug showed as "line is not defined" on the first change).
//   node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &   then   node tests/e2e/presets.mjs http://localhost:8820
// Needs Playwright with Chromium (not an npm dependency of FishDock: it's found through NODE_PATH or a global install).
import { createRequire } from "node:module";

const base = (process.argv[2] || "http://localhost:8820").replace(/\/$/, "");
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }

let fails = 0;
const ok = (cond, what, extra) => { console.log(`${cond ? "PASS" : "FAIL"}  ${what}${!cond && extra !== undefined ? `  -> ${String(extra).slice(0, 600)}` : ""}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// software drawing is slow: a rebuild that takes a second on a PC takes several here
const SETTLE = +(process.env.SETTLE || 7000);
const PRESETS = ["Low", "Medium", "High", "Ultra"];

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
await ctx.addInitScript(() => { localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "performance" })); });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR|404/.test(m.text())) errors.push("console: " + m.text()); });

// a click by the element itself: the panel scrolls and the frame is slow, so the pointer path can time out here
const press = (sel, text) => page.evaluate(([sel, text]) => { const b = Array.from(document.querySelectorAll(sel)).find((x) => !text || x.textContent.trim().startsWith(text) || x.getAttribute("aria-label")?.startsWith(text)); if (!b) return false; b.click(); return true; }, [sel, text]);
const canvasAlive = async () => page.evaluate(() => { const c = document.querySelector(".w3d canvas"); return !!c && c.width > 0 && c.height > 0; });
const pressed = async () => page.evaluate(() => document.querySelector(".gfx-presets button[aria-pressed='true']")?.textContent.trim() || null);

await page.goto(`${base}/#play/gorleston-south-pier`);
await page.waitForSelector(".w3d canvas", { timeout: 150000 });
await page.waitForSelector(".w3d.is-ready", { timeout: 150000 }); // (the loading screen has gone: the place is in and settled)
await sleep(12000);
ok(await canvasAlive(), "the pier is drawn");

// ---- fishing: cast, then change preset at every step of the fight ----
const cast = page.locator(".ft-cast");
ok(await cast.count() === 1, "the Cast button is there");
const box = await cast.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await sleep(700); await page.mouse.up();
await sleep(2500);
// the graphics panel: Menu, then Graphics
ok(await press("button[aria-label='Menu']"), "the menu opens");
await sleep(400);
ok(await press(".w3d-menu button", "Graphics:"), "the Graphics panel opens");
await sleep(1000);
ok((await pressed()) === "Low", "starts on Low", await pressed());

let round = 0;
const cycle = async (label) => {
  for (const p of PRESETS) {
    round++;
    const before = errors.length;
    ok(await press(".gfx-presets button", p), `${label}: pick ${p}`);
    await sleep(SETTLE);
    // keep the fight going between changes: a few taps on Reel if it's there
    for (let i = 0; i < 3; i++) { await press(".ft-reel"); await sleep(120); }
    ok(await canvasAlive(), `${label}: the world is drawn again on ${p}`);
    ok((await pressed()) === p, `${label}: ${p} is the preset`, await pressed());
    ok(errors.length === before, `${label}: no page error changing to ${p}`, errors.slice(before).join(" | "));
  }
};
await cycle("fishing, first pass");
await cycle("fishing, second pass");

// ---- walking: W held down, presets cycled again ----
// (the panel is closed and opened again so the walk button is reachable; the walk carries on under the panel)
await page.keyboard.press("Escape"); await sleep(300);
const walkBtn = await press(".w3d-walkbtn");
ok(walkBtn, "Walk about is offered");
await sleep(1500);
await page.keyboard.down("KeyW"); await sleep(800);
ok(await press("button[aria-label='Menu']") && (await sleep(400), await press(".w3d-menu button", "Graphics:")), "the Graphics panel opens while walking");
await sleep(800);
await cycle("walking");
await page.keyboard.up("KeyW");

ok(errors.length === 0, `no uncaught errors over ${round} preset changes`, errors.join(" | "));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
