// plays one whole catch and logs, by phase, the work that causes hitches whatever the graphics card:
// shaders built, textures and buffers sent, files fetched, React commits, memory churn, and the page's own busiest code
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url); const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:8818", tag = process.argv[3] || "base"; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
await ctx.addInitScript(() => {
  localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "high" })); localStorage.setItem("fishdock.demoFish", "pick"); localStorage.setItem("fishdock.reel", JSON.stringify({ assisted: true, advanced: false, holdReel: true })); // (assisted: one tap winds steadily, so the probe always lands its fish)
  const L = window.__log = []; const T = () => Math.round(performance.now());
  const P = WebGL2RenderingContext.prototype;
  const wrap = (name, fn) => { const f = P[name]; P[name] = function (...a) { try { fn.apply(this, a); } catch {} return f.apply(this, a); }; };
  const who = () => (new Error().stack || "").split("\n").slice(3, 12).map((l) => (l.match(/at ([\w.$<>]+)/) || [])[1]).filter((x) => x && !/^(Object|Array|P\.|WebGL2)/.test(x)).slice(0, 7).join("<");
  wrap("linkProgram", function (p) { let nm = "?"; try { const fs = this.getAttachedShaders(p).map((x) => this.getShaderSource(x)).find((x) => /SHADER_TYPE/.test(x)) || ""; const d = (k) => (fs.match(new RegExp("#define " + k + " (\\S+)")) || [])[1] || ""; nm = `${d("SHADER_TYPE")}/${d("SHADER_NAME")}` + ["USE_SKINNING", "USE_INSTANCING", "USE_MAP", "USE_NORMALMAP", "USE_SHADOWMAP", "USE_TRANSMISSION", "USE_MORPHTARGETS", "USE_ALPHAHASH", "USE_ENVMAP", "DOUBLE_SIDED", "USE_COLOR"].filter((k) => fs.includes("#define " + k)).map((k) => k.slice(4, 8)).join(","); } catch {} L.push([T(), "shader", nm]); });
  const ss = WebGL2RenderingContext.prototype; void ss;
  wrap("texImage2D", function (...a) { const w = a.length >= 9 ? a[3] : (a[5]?.width || a[5]?.videoWidth || 0), h = a.length >= 9 ? a[4] : (a[5]?.height || 0); L.push([T(), "tex", w * h]); });
  wrap("texStorage2D", (t, lv, f, w, h) => L.push([T(), "tex", w * h]));
  wrap("texSubImage2D", function (...a) { const s = a[a.length - 1]; const w = typeof a[4] === "number" && a.length >= 9 ? a[4] : s?.width || 0, h = typeof a[5] === "number" && a.length >= 9 ? a[5] : s?.height || 0; if (w * h > 4096) L.push([T(), "texsub", w * h]); });
  wrap("bufferData", (t, d) => { const n = typeof d === "number" ? d : d?.byteLength || 0; if (n > 2048) L.push([T(), "buf", n]); });
  wrap("createFramebuffer", () => L.push([T(), "fbo", who()]));
  { const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width'); Object.defineProperty(HTMLCanvasElement.prototype, 'width', { get: d.get, set(v) { if (this.classList?.contains('w3d-canvas')) L.push([T(), 'canvasw', v + ' ' + who()]); d.set.call(this, v); } }); }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onCommitFiberRoot() { L.push([T(), 'commit']); }, checkDCE() {} };
  const of = window.fetch; window.fetch = function (u, ...r) { L.push([T(), "fetch", String(u?.url || u).split("/").slice(-2).join("/").slice(0, 60)]); return of.call(this, u, ...r); };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (/\.(glb|jpg|webp|png|js)(\?|$)/.test(e.name)) L.push([Math.round(e.startTime), "file", e.name.split("/").slice(-2).join("/").slice(0, 60)]); }).observe({ type: "resource", buffered: false });
  // React commits: every DOM mutation batch under the app root
  addEventListener("DOMContentLoaded", () => { let n = 0; new MutationObserver((m) => { n += m.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setInterval(() => { if (n) { L.push([T(), "dom", n]); n = 0; } }, 500); });
  // frames as the page sees them
  let p = 0; const fr = (ts) => { if (p) L.push([Math.round(ts), "f", +(ts - p).toFixed(1)]); p = ts; requestAnimationFrame(fr); }; requestAnimationFrame(fr);
});
const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
await page.goto(`${base}/#try/gorleston-south-pier/cod/3d`);
await page.waitForSelector(".w3d.is-ready", { timeout: 200000 }); await sleep(4000);
const marks = []; const mark = async (name) => { marks.push([await page.evaluate(() => Math.round(performance.now())), name]); console.log("  ..", name); };
const label = () => page.evaluate(() => document.querySelector(".ft-label")?.textContent || "");
const has = (s) => page.evaluate((s) => !!document.querySelector(s), s);
const pdown = (s) => page.evaluate((s) => { const b = document.querySelector(s); if (b) { b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 })); b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })); } return !!b; }, s);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); await cdp.send("Profiler.start");
await mark("idle"); await sleep(5000);
await mark("cast"); { const b = await page.locator(".ft-cast").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(800); await page.mouse.up(); }
await sleep(5000); await mark("waiting"); await sleep(3000);
await page.evaluate(() => { const c = Array.from(document.querySelectorAll("button.chip")).find((x) => /bite/i.test(x.textContent)); c?.click(); });
let hooked = false; for (let i = 0; i < 400 && !hooked; i++) { if (await has(".ft-strike")) { if (!marks.some((m) => m[1] === "bite")) await mark("bite"); await pdown(".ft-strike"); } if (await has(".ft-reel")) hooked = true; else { if (i % 40 === 39 && await has(".ft-cast")) { const b = await page.locator(".ft-cast").boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(800); await page.mouse.up(); await sleep(4000); await page.evaluate(() => { const c = Array.from(document.querySelectorAll("button.chip")).find((x) => /bite/i.test(x.textContent)); c?.click(); }); } await sleep(150); } }
if (!hooked) { console.log("never hooked"); await browser.close(); process.exit(2); }
await mark("hooked-fight"); let landed = false, landing = false;
await pdown(".ft-reel");
for (let i = 0; i < 1500 && !landed; i++) {
  if (await has(".ft-land")) { if (!landing) { landing = true; await mark("landing"); } await pdown(".ft-land"); }
  const lab = await label();
  if (!landing && /Landing/i.test(lab)) { landing = true; await mark("landing"); }
  if (await has(".walk-prompt")) landed = true;
  if (!landing && !(await has(".ft-reel")) && !(await has(".ft-land")) && /cast again/i.test(lab)) { console.log("lost the fish:", lab); break; }
  if (i % 12 === 11 && await has(".ft-reel")) await pdown(".ft-reel");
  await sleep(250);
}
await mark(landed ? "on-the-mat" : "ended"); await sleep(5000);
if (landed) { await page.evaluate(() => document.querySelector(".walk-prompt")?.click()); await mark("look-and-panel"); await sleep(9000);
  console.log("  panel:", await page.evaluate(() => (document.querySelector(".catch-card")?.innerText || "none").replace(/\n/g, " / ").slice(0, 140)));
  await page.evaluate(() => Array.from(document.querySelectorAll(".catch-card button")).find((b) => /Put it back/i.test(b.textContent))?.click()); await mark("put-back"); await sleep(8000); }
console.log("  buttons now:", (await page.evaluate(() => Array.from(document.querySelectorAll("button")).filter((b) => b.offsetParent).map((b) => (b.textContent.trim() || b.getAttribute("aria-label") || "").slice(0, 24)).filter(Boolean).join(" | "))).slice(0, 400));
await mark("end"); const { profile } = await cdp.send("Profiler.stop");
const log = await page.evaluate(() => window.__log);
writeFileSync(`phase-${tag}.json`, JSON.stringify({ marks, log, errs }));
// per phase summary
const byId = new Map(profile.nodes.map((n) => [n.id, n])); const t0p = profile.startTime;
console.log("\nphase            secs frames shaders  texMpx bufMB files fetch fbo domMut commits  worstFrames(ms)");
for (let i = 0; i < marks.length - 1; i++) { const [a, name] = marks[i], b = marks[i + 1][0]; const ev = log.filter((e) => e[0] >= a && e[0] < b); const n = (k) => ev.filter((e) => e[1] === k); const fr = n("f").map((e) => e[2]).sort((x, y) => y - x);
  console.log(`${name.padEnd(15)} ${((b - a) / 1000).toFixed(1).padStart(5)} ${String(fr.length).padStart(6)} ${String(n("shader").length).padStart(7)} ${((n("tex").reduce((s, e) => s + e[2], 0) + n("texsub").reduce((s, e) => s + e[2], 0)) / 1e6).toFixed(2).padStart(7)} ${(n("buf").reduce((s, e) => s + e[2], 0) / 1e6).toFixed(2).padStart(6)} ${String(n("file").length).padStart(5)} ${String(n("fetch").length).padStart(5)} ${String(n("fbo").length).padStart(3)} ${String(n("dom").reduce((s, e) => s + e[2], 0)).padStart(6)} ${String(n("commit").length).padStart(7)}  ${fr.slice(0, 4).join(", ")}`);
  const files = [...new Set([...n("file"), ...n("fetch")].map((e) => e[2]))]; if (files.length) console.log("     files:", files.slice(0, 10).join(", "));
  if (n("shader").length) console.log("     shaders:", n("shader").map((e) => e[2]).join(" ; "));
  const tx = [...n("tex"), ...n("texsub")].filter((e) => e[2] > 60000).map((e) => (e[2] / 1e6).toFixed(2)); if (tx.length) console.log("     textures (Mpx):", tx.join(" "));
  const fb = n("fbo").map((e) => e[2]); if (fb.length) console.log("     framebuffers by:", [...new Set(fb)].map((k) => `${fb.filter((x) => x === k).length}x ${k}`).join(" || ").slice(0, 600));
  const cw = n("canvasw").map((e) => e[2]); if (cw.length) console.log("     canvas resized:", cw.slice(0, 6).join(" || ").slice(0, 600));
}
// JS self time overall (top), excluding idle/program/gc buckets shown separately
const self = new Map(); let total = 0; for (let i = 0; i < profile.samples.length; i++) { const nd = byId.get(profile.samples[i]); const k = `${nd.callFrame.functionName || "(anon)"} ${nd.callFrame.url.split("/").pop().slice(0, 28)}:${nd.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + profile.timeDeltas[i]); total += profile.timeDeltas[i]; }
console.log(`\nJS self time over the whole run (${(total / 1e6).toFixed(1)} s sampled):`); for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`${(v / 1000).toFixed(0).padStart(7)} ms ${(v / total * 100).toFixed(1).padStart(5)}%  ${k.slice(0, 100)}`);
console.log("errors:", errs.slice(0, 3).join(" | ") || "none"); await browser.close();
