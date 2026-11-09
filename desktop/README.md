# FishDock for Windows

The game in its own window, on the computer's proper graphics card. It is the live website (fishdock.aaron6k.workers.dev)
inside an Electron window with a launch screen, so it stays up to date by itself and plays with phones in Fish Together.

- `main.cjs`: the window. Asks Windows for the high-performance graphics card, hides the menu bar, F11 for full screen,
  outside links open in the normal browser. Tells the site it is the desktop app (user agent `FishDockDesktop/<version>`),
  which starts the 3D view on the Ultra preset.
- `launcher/`: the launch screen (Play, straight to Gorleston, Fish Together, Live Fishing, Quit).
- `build/`: the icon, made from `public/icon.svg`.

Building: `.github/workflows/desktop.yml` builds `FishDock-Setup-<version>.exe` on a Windows runner when a tag
`desktop-v<version>` is pushed (or by hand from the Actions tab) and attaches it to a GitHub release. Locally on Windows:
`cd desktop && npm install && npm run dist` (the installer lands in `desktop/out/`).

The installer is unsigned, so Windows SmartScreen warns on first run ("More info", then "Run anyway"). Signing needs a
code-signing certificate, which costs money; worth it only if the app is shared widely.

Electron and electron-builder are development dependencies of this folder only; the website's own package.json is
unchanged.
