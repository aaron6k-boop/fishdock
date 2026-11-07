// Production build for Cloudflare Pages: dist/ with hashed, code-split assets, the public/ files, index.html,
// precache.json and build.json for the service worker (the same outputs DetectDock's Vite build makes).
// esbuild does the bundling so the build is the one tested here; `npm run build:vite` remains for Vite users.
// Usage: node tools/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const BUILD_ID = Date.now().toString(36);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "assets"), { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });

// Leaflet and Firebase come from npm install (Cloudflare's build installs them). Where they're missing, as in this
// offline workspace, they're replaced by stubs so the rest of the app can still be built and tested.
import { existsSync } from "node:fs";
const missing = ["leaflet", "firebase"].filter((m) => !existsSync(join(root, "node_modules", m)));
if (missing.length) console.warn(`build: ${missing.join(", ")} not installed, using stubs (maps show the sonar view, accounts stay off)`);
const stubs = {
  name: "stubs",
  setup(b) {
    if (missing.includes("leaflet")) b.onResolve({ filter: /^leaflet(\/|$)/ }, () => ({ path: join(root, "tools/stubs/leaflet.js") }));
    if (missing.includes("firebase")) b.onResolve({ filter: /^firebase\// }, () => ({ path: join(root, "tools/stubs/firebase.js") }));
  },
};

const res = await build({
  plugins: [stubs],
  entryPoints: [join(root, "src/main.jsx")],
  bundle: true, splitting: true, format: "esm", minify: true, sourcemap: false,
  target: ["es2020", "safari15", "chrome100"], jsx: "automatic", loader: { ".js": "jsx", ".png": "file", ".svg": "file" },
  outdir: join(out, "assets"), entryNames: "[name]-[hash]", chunkNames: "chunk-[hash]", assetNames: "[name]-[hash]",
  metafile: true, legalComments: "none", logLevel: "warning",
  nodePaths: [join(root, "node_modules"), "/opt/npm-tools/node_modules"],
  define: { __FD_FILM__: process.env.FISHDOCK_FILM === "1" ? "true" : "false", __PREVIEW__: "false", __BUILD_ID__: JSON.stringify(BUILD_ID), __APP_VERSION__: JSON.stringify(pkg.version), "process.env.NODE_ENV": '"production"' },
});

const outputs = Object.entries(res.metafile.outputs);
const entry = outputs.find(([, o]) => o.entryPoint && o.entryPoint.endsWith("src/main.jsx"));
const entryJs = "/" + relative(out, join(root, entry[0])).split("\\").join("/");
const entryCss = entry[1].cssBundle ? "/" + relative(out, join(root, entry[1].cssBundle)).split("\\").join("/") : null;

let html = readFileSync(join(root, "index.html"), "utf8");
html = html.replace(/<script type="module" src="\/src\/main\.jsx"><\/script>/, `<script type="module" src="${entryJs}"></script>`);
if (entryCss) html = html.replace("</head>", `  <link rel="stylesheet" href="${entryCss}" />\n  </head>`);
writeFileSync(join(out, "index.html"), html);

// every built file, so the app can start offline (public/sw.js reads this)
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push("/" + relative(out, p).split("\\").join("/")); } };
walk(join(out, "assets"));
files.push("/index.html", "/manifest.webmanifest", "/icon.svg", "/theme-init.js");
// the small fish drawings, so lists and cards have their pictures offline from the start (the large ones are kept once seen)
for (const f of readdirSync(join(out, "fish"))) if (f.endsWith("-s.webp")) files.push("/fish/" + f);
writeFileSync(join(out, "precache.json"), JSON.stringify({ build: BUILD_ID, files }));
writeFileSync(join(out, "build.json"), JSON.stringify({ build: BUILD_ID }));

const kb = (f) => (statSync(join(out, f)).size / 1024).toFixed(0);
console.log(`dist/ built (${BUILD_ID}): ${files.length} files; entry ${entryJs} ${kb(entryJs.slice(1))} KB${entryCss ? `, css ${kb(entryCss.slice(1))} KB` : ""}`);
