// ---- the graphics audit: the same viewpoints before and after a change, and what each frame costs ----
// First person over the sea, down at your hands and towards the town, a camera behind the angler, and along the pier,
// by day, at dusk, at night and in rough weather, in a 1280 by 720 window on a preset; and three.js's own counters for
// one frame of three of those views (draw calls and triangles over every pass, geometries, textures and their size
// uncompressed, shader programs). docs/GRAPHICS-AUDIT.md. NOCLOUD=1 leaves out the clouds' shadows, which move, so
// two builds can be compared in the same light; ONLY=day,dusk draws only those.
//   FISHDOCK_FILM=1 node tools/build.mjs && node tests/e2e/server.mjs 8820 --dist &
//   node tools/graphics-audit.mjs http://localhost:8820 out/audit ultra
// Needs Playwright with Chromium (found through NODE_PATH or a global install). Drawn in software here: the counters are
// the work a frame asks for, not how fast a PC does it (that is docs/BENCHMARK.md).
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP  Playwright isn't installed here (set NODE_PATH to a folder that has it)"); process.exit(0); }
const [base = "http://localhost:8820", out = "out/audit", gfx = "ultra", W0 = "1280", H0 = "720"] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: +W0, height: +H0 }, deviceScaleFactor: 1 });
await ctx.addInitScript(([gfx, nc]) => { window.__fdFilm = true; if (nc) window.__fdNoCloudShade = true; localStorage.setItem("fishdock.playerName", "Aaron"); localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx, fishCam: "first", fps2: false })); }, [gfx, !!process.env.NOCLOUD]);
const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && /shader|WebGL|THREE/i.test(m.text())) errs.push(m.text().slice(0, 300)); });
await p.goto(`${base}/#play/gorleston-south-pier`);
await p.waitForFunction(() => window.__fdWorld && window.__fdWorld.play && !/Loading /.test(document.body.innerText), null, { timeout: 900000, polling: 2000 }); await p.waitForTimeout(15000);
await p.addStyleTag({ content: "body * { visibility: hidden !important; } canvas { visibility: visible !important; }" });
const shot = async (f) => { const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90 }); writeFileSync(`${out}/${f}.jpg`, Buffer.from(r.data, "base64")); };
const stats = () => p.evaluate(() => {
  const W = window.__fdWorld, R = W.renderer, I = R.info; I.autoReset = false; I.reset(); W.step(50); const r = { ...I.render }; I.autoReset = true;
  const seen = new Set(); let bytes = 0;
  const add = (t) => { if (!t || !t.isTexture || seen.has(t)) return; seen.add(t); const im = t.image; const w = im?.width || im?.data?.width || 0, h = im?.height || im?.data?.height || 0, d = im?.depth || 1; bytes += w * h * d * 4 * (t.generateMipmaps !== false && !t.isDataTexture ? 1.33 : 1); };
  W.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) { for (const k in m) add(m[k]); for (const u of Object.values(m.uniforms || {})) add(u?.value); } });
  add(W.scene.background); add(W.scene.environment);
  return { calls: r.calls, triangles: r.triangles, lines: r.lines, points: r.points, geometries: I.memory.geometries, textures: I.memory.textures, programs: I.programs?.length, sceneTextureMB: +(bytes / 1048576).toFixed(1), gfx: W.gfx() };
});
const L = { day: [{ sunAlt: 32, sunAz: 200 }, { cloudPct: 30, windKph: 12 }], dusk: [{ sunAlt: 1, sunAz: 245 }, { cloudPct: 30, windKph: 10 }], night: [{ sunAlt: -18, sunAz: 300 }, { cloudPct: 20, windKph: 8 }], rough: [{ sunAlt: 22, sunAz: 200 }, { cloudPct: 95, windKph: 42, precipMm: 2, waveM: 1.8, groundWet: 1 }] };
const out2 = {};
for (const [lt, [light, cond]] of Object.entries(L)) {
  if (only && !only.includes(lt)) continue;
  await p.evaluate(([light, cond]) => { const W = window.__fdWorld; W.freeze(); W.at(null); W.env(light, cond); for (let i = 0; i < 12; i++) W.step(1000); }, [light, cond]);
  for (const [nm, yaw, pitch] of [["fp_sea", 20, -0.1], ["fp_hands", 300, -0.4], ["fp_town", 250, -0.05]]) { await p.evaluate(([y, pt]) => { const W = window.__fdWorld; W.at(null); W.view(y, pt); W.step(400); }, [yaw, pitch]); await shot(`${lt}_${nm}`); if (lt === "day" && nm === "fp_sea") out2.fp_sea = await stats(); }
  const s = await p.evaluate(() => window.__fdProbe.seat);
  await p.evaluate((s) => { const W = window.__fdWorld; W.at(s[0] - 2.2, s[1] + 0.4, s[2] + 2.6, [s[0], s[1] - 0.3, s[2]]); W.step(300); }, s); await shot(`${lt}_tp_angler`); if (lt === "day") out2.tp = await stats();
  await p.evaluate(() => { const W = window.__fdWorld; W.at(-40, 3.85, 3, [40, 3, -10]); W.step(300); }); await shot(`${lt}_pier`); if (lt === "day") out2.pier = await stats();
}
writeFileSync(`${out}/stats.json`, JSON.stringify(out2, null, 1)); console.log(JSON.stringify(out2));
console.log("errors", JSON.stringify(errs.slice(0, 5))); await b.close();
