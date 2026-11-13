// Builds the rig test page (tools/rig-preview/) into one self-contained HTML file with the model inside it:
// dist-preview/rig-preview.html. The same rig code and data as the game (src/lib/world3d/fpRig.js), no install needed.
//   node tools/build-rig-preview.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-preview"); mkdirSync(out, { recursive: true });
const res = await build({
  entryPoints: [join(root, "tools/rig-preview/main.js")], bundle: true, minify: true, format: "iife", target: ["es2020", "safari15"], write: false, legalComments: "none",
  nodePaths: [join(root, "node_modules"), "/opt/npm-tools/node_modules"], define: { __BUILD_ID__: '"rig"', __FD_FILM__: "false", __PREVIEW__: "true" }, logLevel: "warning",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const glb = readFileSync(join(root, "public/models/fp_rig.glb")).toString("base64");
const page = readFileSync(join(root, "tools/rig-preview/page.html"), "utf8");
const html = page + `\n<script>window.__fdRigGlb = "data:model/gltf-binary;base64,${glb}";</script>\n<script>${js}</script>\n`;
writeFileSync(join(out, "rig-preview.html"), html);
console.log(`rig-preview.html: ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB (${(Buffer.byteLength(js) / 1024).toFixed(0)} KB script)`);
