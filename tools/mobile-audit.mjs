// ---- mobile audit ----
// Opens the live (or any) FishDock in phone-sized Chromium and records what a phone user sees: the photo view's whole
// catch (cast, bite, fight and landing, frame by frame, with where the controls and the catch card sit), the 3D view
// at real and drawn places, each camera mode, dragging to look round, and timings. Writes audit/*.png and
// audit/report.json.
//   node tools/mobile-audit.mjs https://fishdock.aaron6k.workers.dev
// Frame rates here come from software graphics on a server, so they are a floor, not what a phone's GPU manages.
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const base = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
mkdirSync("audit", { recursive: true });
const report = { base, at: new Date().toISOString(), pages: [] };
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function fps(page, ms = 3000) {
  return page.evaluate((ms) => new Promise((res) => { let f = 0; const s = performance.now(); const tick = () => { f++; if (performance.now() - s < ms) requestAnimationFrame(tick); else res(Math.round((f * 1000) / ms)); }; requestAnimationFrame(tick); }), ms);
}
// where the on-screen controls are, so a frame can be checked for anything covering the fishing
async function boxes(page) {
  return page.evaluate(() => {
    const out = {};
    for (const [k, sel] of Object.entries({ tray: ".fish-tray:not(.is-busy)", card: ".catch-card", topbar: ".fs-top, .w3d-top, .watch-top", label: ".w3d-label" })) {
      const el = document.querySelector(sel); if (!el) continue;
      const r = el.getBoundingClientRect(); if (r.width && r.height) out[k] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    }
    return out;
  });
}
async function tapUncovered(page, loc) {
  await loc.waitFor({ timeout: 20000 });
  const covered = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top && !el.contains(top) ? String(top.className || top.tagName).slice(0, 80) : null; });
  await loc.tap({ force: true });
  return covered;
}

async function audit(name, path, device, fn) {
  const ctx = await browser.newContext({ ...devices[device] });
  const page = await ctx.newPage();
  const P = { name, path, device, errors: [], notes: [], frames: [] };
  page.on("pageerror", (e) => P.errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") P.errors.push(m.text().slice(0, 200)); });
  const t0 = Date.now();
  try {
    await page.goto(base + path, { waitUntil: "load", timeout: 45000 });
    P.loadMs = Date.now() - t0;
    await fn(page, P);
    const perf = await page.evaluate(() => { const r = performance.getEntriesByType("resource"); return { requests: r.length, kb: Math.round(r.reduce((a, x) => a + (x.transferSize || 0), 0) / 1024), heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
    Object.assign(P, perf);
  } catch (e) {
    P.notes.push(`stopped: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `audit/${name}-stopped.png` }).catch(() => {});
  }
  report.pages.push(P);
  console.log(JSON.stringify(P));
  await ctx.close();
}

// a whole catch: cast, bite, strike, hold to reel, then the landing frame by frame
async function oneCatch(page, P, prefix) {
  const tray = page.getByRole("group", { name: "Fishing controls" });
  const c1 = await tapUncovered(page, tray.getByRole("button", { name: "Cast" }));
  if (c1) P.notes.push(`Cast button covered by ${c1}`);
  await page.waitForTimeout(1200); await page.screenshot({ path: `audit/${prefix}-1-cast.png` });
  const strike = tray.getByRole("button", { name: "Strike" });
  await strike.waitFor({ timeout: 90000 });
  await page.screenshot({ path: `audit/${prefix}-2-bite.png` }); P.frames.push({ f: "bite", ...(await boxes(page)) });
  const c2 = await tapUncovered(page, strike); if (c2) P.notes.push(`Strike button covered by ${c2}`);
  const reel = tray.locator(".ft-reel"); await reel.waitFor({ timeout: 15000 });
  const b = await reel.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  let shot = 0; const tr = Date.now();
  while (await reel.isVisible().catch(() => false)) { if (Date.now() - tr > 90000) break; if (shot < 2 && Date.now() - tr > 1500 + shot * 2500) await page.screenshot({ path: `audit/${prefix}-3-fight${shot++}.png` }); await page.waitForTimeout(250); }
  await page.mouse.up();
  P.reelSeconds = Math.round((Date.now() - tr) / 100) / 10;
  const tl = Date.now();
  for (let i = 0; i < 26; i++) {
    const at = ((Date.now() - tl) / 1000).toFixed(1);
    await page.screenshot({ path: `audit/${prefix}-4-land-${String(i).padStart(2, "0")}.png` });
    P.frames.push({ f: `land ${at}s`, ...(await boxes(page)) });
    await page.waitForTimeout(220);
  }
}

// ---- the photo view (the 2D Live Fishing View) on a typical and a small phone ----
await audit("photo-pixel7", "/#try/gorleston-south-pier/cod", "Pixel 7", async (page, P) => {
  await page.waitForTimeout(6000); await page.screenshot({ path: "audit/photo-pixel7-0.png" });
  P.fps = await fps(page);
  await oneCatch(page, P, "photo-pixel7");
});
await audit("photo-se", "/#try/whitby-piers/cod", "iPhone SE", async (page, P) => {
  await page.waitForTimeout(6000); await page.screenshot({ path: "audit/photo-se-0.png" });
  await oneCatch(page, P, "photo-se");
});

// ---- the 3D view: a real place, camera modes, dragging, a catch ----
await audit("3d-gorleston", "/#try/gorleston-south-pier/cod/3d", "Pixel 7", async (page, P) => {
  await page.waitForTimeout(12000); await page.screenshot({ path: "audit/3d-gorleston-0.png" });
  P.fps = await fps(page);
  P.label = await page.locator(".w3d-label").innerText().catch(() => null);
  // the rendered-geometry check (sceneCheck.js): ok, failed (the drawn place is shown instead) or drawn
  P.sceneCheck = await page.locator("canvas.w3d-canvas").getAttribute("data-check").catch(() => null);
  // drag to look round (a finger swipe, as mouse moves on the canvas)
  const vp = page.viewportSize();
  await page.mouse.move(vp.width * 0.7, vp.height * 0.45); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(vp.width * (0.7 - i * 0.04), vp.height * 0.45, { steps: 2 });
  await page.mouse.up(); await page.waitForTimeout(1500);
  await page.screenshot({ path: "audit/3d-gorleston-1-dragged.png" });
  P.uiAfterDrag = await page.getByRole("group", { name: "Fishing controls" }).isVisible().catch(() => false);
  await oneCatch(page, P, "3d-gorleston"); // in the view it starts in
  await page.getByRole("button", { name: "Look at my rod" }).tap({ force: true }); await page.waitForTimeout(1500);
  await page.screenshot({ path: "audit/3d-gorleston-2-rod.png" });
  for (const m of ["Third person", "Cinematic", "Free look", "First person"]) {
    await page.getByRole("button", { name: "Camera" }).tap({ force: true }); await page.waitForTimeout(400);
    if (m === "Third person") await page.screenshot({ path: "audit/3d-gorleston-3-menu.png" });
    await page.getByRole("menuitemradio", { name: m }).tap({ force: true }); await page.waitForTimeout(2500);
    await page.screenshot({ path: `audit/3d-gorleston-4-${m.replace(/\s/g, "").toLowerCase()}.png` });
  }
});
for (const [name, path] of [["3d-whitby", "/#try/whitby-piers/cod/3d"], ["3d-cromer", "/#try/cromer-pier/cod/3d"], ["3d-mumbles", "/#try/mumbles-head/bass/3d"], ["3d-deal", "/#try/deal-pier/cod/3d"], ["3d-wye", "/#try/river-wye-ross/barbel/3d"], ["3d-rutland", "/#try/rutland-water/pike/3d"], ["3d-chesil", "/#try/chesil-beach-ferry-bridge/cod/3d"]]) {
  await audit(name, path, "Pixel 7", async (page, P) => {
    await page.waitForTimeout(12000); await page.screenshot({ path: `audit/${name}-0.png` });
    P.fps = await fps(page);
    P.label = await page.locator(".w3d-label").innerText().catch(() => null);
    P.sceneCheck = await page.locator("canvas.w3d-canvas").getAttribute("data-check").catch(() => null);
    await page.getByRole("button", { name: "Camera" }).tap({ force: true }); await page.waitForTimeout(400);
    await page.getByRole("menuitemradio", { name: "Third person" }).tap({ force: true }); await page.waitForTimeout(2500);
    await page.screenshot({ path: `audit/${name}-1-third.png` });
  });
}

writeFileSync("audit/report.json", JSON.stringify(report, null, 2));
await browser.close();
