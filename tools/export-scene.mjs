// ---- export-scene: the reconstructed place as one .glb, for a game engine (native/unreal) ----
// node tools/export-scene.mjs <base url of a FILM build> <out.glb> [place]
// Opens the game's own 3D view in headless Chromium, waits for the place to build, and writes its static meshes
// (ground, pier, walls, buildings, trees, props) with plain PBR materials and their drawn textures. Left out: the
// sea, the sky, lights, people, rods and anything drawn by a custom shader: the engine brings its own.
// Units: metres, y up, north along -z (glTF's own convention; Unreal's importer converts to centimetres, z up).
import { createRequire } from "node:module"; import { writeFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import path from "node:path";
const require = createRequire(import.meta.url); const { chromium } = require("playwright"); const esbuild = require("esbuild");
const base = process.argv[2], outFile = process.argv[3], place = process.argv[4] || "gorleston-south-pier";
if (!base || !outFile) { console.error("usage: node tools/export-scene.mjs <base url> <out.glb> [place]"); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = await esbuild.build({ entryPoints: [path.join(here, "export-scene-entry.mjs")], bundle: true, format: "iife", write: false, logLevel: "error" });
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript(() => { window.__fdFilm = true; localStorage.setItem("fishdock.view3d.v1", JSON.stringify({ gfx: "ultra", fishCam: "first" })); });
const page = await ctx.newPage();
await page.goto(`${base}/#try/${place}/cod/3d`); await page.waitForFunction(() => window.__fdWorld?.play, null, { timeout: 180000 }); await page.waitForTimeout(25000);
await page.evaluate(() => { const W = window.__fdWorld; W.freeze(); W.step(1000); });
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const r = await page.evaluate(() => window.__fdExport());
writeFileSync(outFile, Buffer.from(r.b64, "base64"));
console.log(JSON.stringify({ out: outFile, bytes: Buffer.from(r.b64, "base64").length, ...r.stats }));
await b.close();
