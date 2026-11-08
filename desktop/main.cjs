// FishDock for Windows: the game in its own window, on the computer's graphics card.
// A small launch screen (launcher/index.html), then the live game. The game is the same one the website serves, so
// it stays up to date by itself and plays with phones in Fish Together; nothing here changes how it works.
const { app, BrowserWindow, shell, ipcMain, screen, session } = require("electron");
const path = require("node:path");

const SITE = "https://fishdock.aaron6k.workers.dev";

// the graphics card: on a PC with an onboard chip as well as a proper card, Windows often gives a browser the onboard
// one. This asks for the high-performance one, and for the graphics card to do the drawing of the page too
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

let win = null;
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, width), height: Math.min(1000, height), minWidth: 900, minHeight: 600,
    backgroundColor: "#070c10", title: "FishDock", icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "launcher", "preload.cjs") },
  });
  win.once("ready-to-show", () => win.show());
  // (the game tells the website it's the desktop app: the website then starts it on the Ultra preset)
  win.webContents.setUserAgent(win.webContents.getUserAgent() + " FishDockDesktop/" + app.getVersion());
  win.loadFile(path.join(__dirname, "launcher", "index.html"));
  // links to other sites open in the normal browser, never inside the game's window
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(SITE)) { shell.openExternal(url); return { action: "deny" }; } return { action: "allow" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(SITE) && !url.startsWith("file:")) { e.preventDefault(); shell.openExternal(url); } });
  // F11 toggles the window's own full screen (the game's F key does the same inside it)
  win.webContents.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
}

// the launch screen's buttons: play (a route into the site), full screen, quit
ipcMain.on("fd:play", (e, route) => { if (!win) return; const r = typeof route === "string" && /^#[\w\/-]*$/.test(route) ? route : ""; win.setFullScreen(true); win.loadURL(SITE + "/" + r); });
ipcMain.on("fd:quit", () => app.quit());
ipcMain.handle("fd:info", () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, gpu: app.getGPUFeatureStatus() }));

app.whenReady().then(() => {
  // what the page may ask for: the game's own site may use your location (to fish where you are) and full screen;
  // nothing else (camera, microphone, notifications, MIDI, clipboard reading) is ever granted, by any site
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    const own = (details?.requestingUrl || wc.getURL() || "").startsWith(SITE);
    cb(own && (permission === "geolocation" || permission === "fullscreen" || permission === "pointerLock"));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => origin.startsWith(SITE) && (permission === "geolocation" || permission === "fullscreen" || permission === "pointerLock"));
  // nothing is ever downloaded through the game's window
  session.defaultSession.on("will-download", (e) => e.preventDefault());
  createWindow();
});
// no second window of any kind, and no new webviews
app.on("web-contents-created", (e, wc) => { wc.on("will-attach-webview", (ev) => ev.preventDefault()); });
app.on("window-all-closed", () => app.quit());
