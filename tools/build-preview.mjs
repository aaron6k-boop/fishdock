// Builds one self-contained HTML file of FishDock for phone previews (a claude.ai artifact) and local browser tests.
// Production builds use Vite (npm run build); this uses esbuild because it runs with no npm install.
// Usage: node tools/build-preview.mjs [--server]   (--server: talks to /api like production, for local e2e tests)
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = process.argv.includes("--server");
const out = join(root, "dist-preview");
mkdirSync(out, { recursive: true });
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /leafletLoader\.js$/ }, () => (server ? undefined : { path: join(root, "tools/stubs/leaflet.js") }));
    b.onResolve({ filter: /^firebase\// }, () => ({ path: join(root, "tools/stubs/firebase.js") }));
    b.onResolve({ filter: /^leaflet/ }, () => ({ path: join(root, "tools/stubs/leaflet.js") }));
    b.onResolve({ filter: /^leaflet\/dist\/leaflet\.css$/ }, () => ({ path: join(root, "tools/stubs/leaflet.js") }));
  },
};
const res = await build({
  entryPoints: [join(root, "src/main.jsx")], bundle: true, minify: true, format: "iife", target: ["es2020", "safari15"],
  jsx: "automatic", loader: { ".js": "jsx" }, outdir: out, write: false, legalComments: "none",
  nodePaths: [join(root, "node_modules"), "/opt/npm-tools/node_modules"],
  define: { __PREVIEW__: server ? "false" : "true", __BUILD_ID__: JSON.stringify(Date.now().toString(36)), __APP_VERSION__: JSON.stringify(pkg.version), "process.env.NODE_ENV": '"production"' },
  plugins: [stubs], logLevel: "warning",
});
const js = res.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = res.outputFiles.find((f) => f.path.endsWith(".css"))?.text || "";
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const head = `<title>FishDock</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="theme-color" content="#070c10">\n<style>${css}</style>\n`;
const body = `<div id="root"></div>\n<script>${safeJs}</script>\n`;
const name = server ? "fishdock-e2e.html" : "fishdock-preview.html";
writeFileSync(join(out, name), server ? `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${body}</body></html>` : head + body);
console.log(`${name}: ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB js, ${(Buffer.byteLength(css) / 1024).toFixed(0)} KB css`);
