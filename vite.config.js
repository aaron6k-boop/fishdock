import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const APP_VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

// A build id for the service worker (a new id installs a fresh offline copy), as in DetectDock.
const BUILD_ID = Date.now().toString(36);

/** Writes precache.json: every file of this build, so the app can start offline. */
function precacheList() {
  return {
    name: "fishdock-precache",
    apply: "build",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map")).map((f) => "/" + f);
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify({ build: BUILD_ID, files }) });
      this.emitFile({ type: "asset", fileName: "build.json", source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheList()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __APP_VERSION__: JSON.stringify(APP_VERSION), __PREVIEW__: "false" },
});
