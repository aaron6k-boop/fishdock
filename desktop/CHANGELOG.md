# FishDock for Windows: changes

## 0.1.0 (unreleased)

The first launcher. A small launch screen, then the live game (fishdock.aaron6k.workers.dev) full screen in its own
window, asking Windows for the high-performance graphics card.

- Only FishDock's own site, by exact origin, and the bundled launch screen can ever be shown; any other link opens
  in the normal browser if it is a web link and is dropped otherwise. No new windows, no webviews, no downloads.
- The page has no Node access; the launch screen alone has a small bridge, and every call is checked to have come
  from it.
- Full screen and pointer lock are allowed for the site. Location is asked once in a dialog, the answer kept and
  changeable on the launch screen. Nothing else (camera, microphone, notifications, USB, serial) is ever granted.
- The launch screen reports what the window is really drawing with (Chromium's acceleration state and the device
  it chose), not a promise.
- The website shows its developer diagnostics (frame times, draw calls, memory, a benchmark of every preset) when
  it is running inside the launcher.
- Dependencies pinned by lockfile; the installer is unsigned (SmartScreen warns on first run) and its SHA-256 is
  published next to it.
