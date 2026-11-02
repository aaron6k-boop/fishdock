import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { PREVIEW } from "./lib/api.js";
import "leaflet/dist/leaflet.css";
import "./styles/base.css";
import "./styles/app.css";
import "./styles/livefishing.css";

/* global __BUILD_ID__ */
// controls on the right for a right thumb, if this phone chose that (the 3D view's camera menu)
try { if (JSON.parse(localStorage.getItem("fishdock.view3d.v1") || "{}").hand === "right") document.documentElement.dataset.hand = "right"; } catch { /* no storage */ }
createRoot(document.getElementById("root")).render(<App />);

// Offline copy (production only, never in the phone preview), as DetectDock does.
if (!PREVIEW && "serviceWorker" in navigator && typeof __BUILD_ID__ !== "undefined" && location.hostname !== "localhost") {
  window.addEventListener("load", () => navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`).catch(() => {}));
}

// Stay current. When FishDock comes back to the front (a phone may keep an old page in memory for hours), and every
// 10 minutes, it checks for a newer build. The live view pages (#watch, #try) reload straight away; the app shows a
// small bar, so a fishing session is never interrupted.
if (!PREVIEW && typeof __BUILD_ID__ !== "undefined") {
  let shown = false;
  const check = async () => {
    try {
      const b = await (await fetch("/build.json", { cache: "no-store" })).json();
      if (!b?.build || b.build === __BUILD_ID__) return;
      if (/^#\/?(watch|try)/.test(location.hash)) { location.reload(); return; }
      if (shown) return;
      shown = true;
      const bar = document.createElement("div");
      bar.className = "update-bar";
      bar.setAttribute("role", "status");
      bar.innerHTML = '<span>A new version of FishDock is ready.</span><button type="button">Reload</button>';
      bar.querySelector("button").onclick = () => location.reload();
      document.body.append(bar);
    } catch { /* offline: try again later */ }
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  addEventListener("pageshow", (e) => { if (e.persisted) check(); });
  addEventListener("focus", check);
  setInterval(check, 10 * 60e3);
}
