// FishDock for Windows: the game in its own window, on the computer's graphics card.
// A small launch screen (launcher/index.html), then the live game. The game is the same one the website serves, so
// it stays up to date by itself and plays with phones in Fish Together; nothing here changes how it works.
//
// Security model: the window may only ever show FishDock's own site (an exact origin allowlist) or the launch screen
// bundled here. Anything else, from a link, a redirect or a script, opens in the normal browser if it's a web link
// and is dropped otherwise. The page has no Node access; the launch screen alone gets a three-call bridge, and the
// main process checks that each call really came from the launch screen. The site can ask for full screen and
// pointer lock; location is granted only after the player has said yes in a dialog, and that answer is kept.
const { app, BrowserWindow, shell, ipcMain, screen, session, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

// ---- where the game lives: exact origins, nothing like them ----
const SITE = "https://fishdock.aaron6k.workers.dev";
const ALLOWED_ORIGINS = new Set([SITE]);
const LAUNCHER_URL = pathToFileURL(path.join(__dirname, "launcher", "index.html")).href;
const parse = (u) => { try { return new URL(u); } catch { return null; } };
/** FishDock's own site: https and an exact origin from the allowlist. */
const isOwn = (u) => { const p = parse(u); return !!p && p.protocol === "https:" && ALLOWED_ORIGINS.has(p.origin); };
/** The launch screen itself (the one file, nothing else on disk). */
const isLauncher = (u) => { const p = parse(u); return !!p && p.protocol === "file:" && p.href.split("#")[0].split("?")[0] === LAUNCHER_URL; };
/** A web link safe to hand to the normal browser: http(s) or mailto, nothing that could run a program. */
const isSafeExternal = (u) => { const p = parse(u); return !!p && (p.protocol === "https:" || p.protocol === "http:" || p.protocol === "mailto:"); };
const openOutside = (u) => { if (isSafeExternal(u)) shell.openExternal(u).catch(() => {}); };

// ---- the player's own choices, kept between runs (a small JSON file in the app's data folder) ----
const prefsPath = () => path.join(app.getPath("userData"), "launcher-prefs.json");
let prefs = {};
const loadPrefs = () => { try { prefs = JSON.parse(fs.readFileSync(prefsPath(), "utf8")) || {}; } catch { prefs = {}; } };
const savePrefs = () => { try { fs.writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2)); } catch { /* read-only disk: the choice lasts this run */ } };

// ---- the graphics card ----
// On a PC with an onboard chip as well as a proper card, Windows often gives a browser the onboard one. This asks for
// the high-performance one. It is a request: Windows and the driver decide, and the launch screen reports what was
// actually used (app.getGPUInfo), so nobody is told they're on the card when they aren't. The GPU blocklist is left
// in force: on drivers Chromium knows to be broken, software drawing beats crashes.
app.commandLine.appendSwitch("force_high_performance_gpu");

let win = null;
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, width), height: Math.min(1000, height), minWidth: 900, minHeight: 600,
    backgroundColor: "#070c10", title: "FishDock", icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, preload: path.join(__dirname, "launcher", "preload.cjs") },
  });
  win.once("ready-to-show", () => win.show());
  // (the game tells the website it's the desktop app: the website then offers its developer diagnostics)
  win.webContents.setUserAgent(win.webContents.getUserAgent() + " FishDockDesktop/" + app.getVersion());
  win.loadURL(LAUNCHER_URL);
  const wc = win.webContents;
  // navigation: only the site or the launch screen, whether from a link, a script or a redirect
  wc.on("will-navigate", (e, url) => { if (!isOwn(url) && !isLauncher(url)) { e.preventDefault(); openOutside(url); } });
  wc.on("will-redirect", (e, url) => { if (!isOwn(url)) { e.preventDefault(); } });
  // no new windows of any kind: a link that wants one is opened outside if it's a web link, or loaded here if it's ours
  wc.setWindowOpenHandler(({ url }) => { if (isOwn(url)) wc.loadURL(url); else openOutside(url); return { action: "deny" }; });
  // F11 toggles the window's own full screen (the game's F key does the same inside it)
  wc.on("before-input-event", (e, input) => { if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  win.on("closed", () => { win = null; });
}

// ---- the launch screen's bridge: each call checked to have come from the launch screen, not from the site ----
const fromLauncher = (e) => !!e.senderFrame && e.senderFrame === e.sender.mainFrame && isLauncher(e.senderFrame.url);
ipcMain.on("fd:play", (e, route) => {
  if (!fromLauncher(e) || !win) return;
  const r = typeof route === "string" && /^#[\w\/-]{0,80}$/.test(route) ? route : "";
  win.setFullScreen(true); win.loadURL(SITE + "/" + r);
});
ipcMain.on("fd:quit", (e) => { if (fromLauncher(e)) app.quit(); });
ipcMain.handle("fd:info", async (e) => {
  if (!fromLauncher(e)) return null;
  // what the window is really drawing with: the features Chromium has turned on, and the device it chose
  let gpu = null; try { gpu = await app.getGPUInfo("basic"); } catch { gpu = null; }
  const dev = (gpu?.gpuDevice || []).find((d) => d.active) || (gpu?.gpuDevice || [])[0] || null;
  return { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, features: app.getGPUFeatureStatus(), device: dev ? { vendorId: dev.vendorId, deviceId: dev.deviceId, vendor: dev.vendorString || null, name: dev.deviceString || null, active: !!dev.active } : null, devices: (gpu?.gpuDevice || []).length, location: prefs.location || "ask" };
});
ipcMain.on("fd:location", (e, choice) => { if (!fromLauncher(e)) return; if (choice === "allow" || choice === "deny" || choice === "ask") { prefs.location = choice; savePrefs(); } });

app.whenReady().then(() => {
  loadPrefs();
  const ses = session.defaultSession;
  // what the page may ask for. The site may use full screen and pointer lock (the view). Location is a question for
  // the player: a dialog the first time, with the answer kept (and changeable on the launch screen). Nothing else
  // (camera, microphone, notifications, MIDI, clipboard reading, USB, serial) is ever granted, by any site
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const url = details?.requestingUrl || wc.getURL() || "";
    if (!isOwn(url)) return cb(false);
    if (permission === "fullscreen" || permission === "pointerLock") return cb(true);
    if (permission === "geolocation") {
      if (prefs.location === "allow") return cb(true);
      if (prefs.location === "deny") return cb(false);
      const { response, checkboxChecked } = dialog.showMessageBoxSync(win, {
        type: "question", buttons: ["Allow", "Don't allow"], defaultId: 1, cancelId: 1, title: "Your location",
        message: "Let FishDock use your location?",
        detail: "It's used to show fishing spots and conditions near you. Your position stays on this computer: anything shared with other anglers shows an area, never the exact place. You can change this on the launch screen.",
        checkboxLabel: "Remember my answer", checkboxChecked: true,
      });
      const ok = response === 0; if (checkboxChecked) { prefs.location = ok ? "allow" : "deny"; savePrefs(); }
      return cb(ok);
    }
    cb(false);
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => ALLOWED_ORIGINS.has(origin) && (permission === "fullscreen" || permission === "pointerLock" || (permission === "geolocation" && prefs.location === "allow")));
  // nothing is ever downloaded through the game's window
  ses.on("will-download", (e) => e.preventDefault());
  createWindow();
});
// no second window of any kind, from anything that gets created
app.on("web-contents-created", (e, wc) => {
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  if (!win || wc !== win.webContents) wc.setWindowOpenHandler(() => ({ action: "deny" }));
});
app.on("window-all-closed", () => app.quit());
