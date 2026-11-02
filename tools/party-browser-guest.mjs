// ---- party browser guest ----
// A second, separate browser (Chromium, phone-sized, touch) that joins a live Fish Together party through the app
// itself and fishes, chats, reloads (reconnects) and then waits to be removed, logging what it sees and saving
// screenshots. Used with a host in another browser to test a real party end to end:
//   node tools/party-browser-guest.mjs "<party link>" [minutes]
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const link = process.argv[2], minutes = Number(process.argv[3]) || 6;
if (!link) { console.error("usage: node tools/party-browser-guest.mjs <party link> [minutes]"); process.exit(2); }
mkdirSync("shots", { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`console ${m.type()}:`, m.text().slice(0, 200)); });
page.on("pageerror", (e) => log("page error:", e.message.slice(0, 200)));
page.on("websocket", (ws) => { log("socket opened"); ws.on("close", () => log("socket closed")); });
const shot = async (name) => { await page.screenshot({ path: `shots/${name}.png` }).catch((e) => log("screenshot failed", e.message)); log(`screenshot ${name}`); };
const text = async () => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
const visible = (loc) => loc.isVisible().catch(() => false);

try {
  // ---- join ----
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Shown to the others").fill("Guest Browser", { timeout: 20000 });
  await shot("01-join-screen");
  log("join screen:", await text());
  await page.getByRole("button", { name: "Join the party" }).click();
  await page.getByRole("group", { name: "Fishing controls" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot("02-joined");
  log("joined:", await text());

  // ---- fish: cast, strike, reel ----
  const tray = page.getByRole("group", { name: "Fishing controls" });
  await tray.getByRole("button", { name: "Cast" }).click();
  log("cast");
  await page.waitForTimeout(2500); await shot("03-cast");
  const strike = tray.getByRole("button", { name: "Strike" });
  await strike.waitFor({ timeout: 90000 });
  log("bite showing"); await shot("04-bite");
  await strike.click(); log("struck");
  const reel = tray.locator(".ft-reel");
  await reel.waitFor({ timeout: 15000 });
  const box = await reel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); log("reeling (holding)");
  for (let i = 0; i < 90 && (await visible(reel)); i++) await page.waitForTimeout(1000);
  await page.mouse.up();
  log("reel finished:", await text());
  await page.waitForTimeout(6000); await shot("05-landed");

  // ---- chat ----
  await page.getByRole("tab", { name: "Chat" }).click().catch(async () => { await page.getByRole("button", { name: /people|chat/i }).first().click(); await page.getByRole("tab", { name: "Chat" }).click(); });
  await page.getByLabel("Message").fill("Hello from the guest browser");
  await page.getByLabel("Message").press("Enter");
  await page.waitForTimeout(2000); await shot("06-chat");
  log("chat tab:", await text());

  // ---- reconnect: reload the page ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("group", { name: "Fishing controls" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(4000); await shot("07-after-reload");
  log("after reload:", await text());
  await page.getByRole("tab", { name: "Catches" }).click().catch(() => log("no Catches tab visible"));
  await page.waitForTimeout(1000); await shot("08-catches");
  log("catches tab:", await text());

  // ---- wait for the host (more fishing, lock, removal); log what changes ----
  let last = "", n = 0;
  while (Date.now() - t0 < minutes * 60e3) {
    await page.waitForTimeout(8000);
    const now = await text();
    if (now !== last) { log("now:", now); last = now; }
    if (++n % 4 === 0) await shot(`09-wait-${n}`);
    if (/removed|ended|closed/i.test(now) && !(await visible(page.getByRole("group", { name: "Fishing controls" })))) { log("party gone for this guest"); break; }
  }
  await shot("10-end");
  // the frame rate this phone-sized browser manages (software graphics on a CI machine, so only a floor)
  const fps = await page.evaluate(() => new Promise((res) => { let f = 0; const s = performance.now(); const tick = () => { f++; if (performance.now() - s < 3000) requestAnimationFrame(tick); else res(Math.round(f / 3)); }; requestAnimationFrame(tick); }));
  log(`frames per second here: ${fps}`);
} catch (e) {
  log("stopped:", e.message.split("\n")[0]);
  await shot("99-stopped");
  log("page:", await text());
  process.exitCode = 1;
} finally {
  await browser.close();
}
