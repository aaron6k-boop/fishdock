// the launch screen's bridge to the app: four safe calls, and only on the launch screen itself. The same preload runs
// for the game's site too (one window, one preload), so here it checks where it is and gives the site nothing
const { contextBridge, ipcRenderer } = require("electron");
const here = (() => { try { return new URL(location.href); } catch { return null; } })();
const onLauncher = !!here && here.protocol === "file:" && /\/launcher\/index\.html$/.test(here.pathname);
if (onLauncher) {
  contextBridge.exposeInMainWorld("fishdock", {
    play: (route) => ipcRenderer.send("fd:play", String(route || "")),
    quit: () => ipcRenderer.send("fd:quit"),
    info: () => ipcRenderer.invoke("fd:info"),
    location: (choice) => ipcRenderer.send("fd:location", String(choice)),
  });
}
