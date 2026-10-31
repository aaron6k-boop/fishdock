import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { PREVIEW } from "./lib/api.js";
import "./styles/base.css";
import "./styles/app.css";

/* global __BUILD_ID__ */
createRoot(document.getElementById("root")).render(<App />);

// Offline copy (production only, never in the phone preview), as DetectDock does.
if (!PREVIEW && "serviceWorker" in navigator && typeof __BUILD_ID__ !== "undefined" && location.hostname !== "localhost") {
  window.addEventListener("load", () => navigator.serviceWorker.register(`/sw.js?v=${__BUILD_ID__}`).catch(() => {}));
}
