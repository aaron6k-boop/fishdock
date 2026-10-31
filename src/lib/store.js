// ---- store: settings and the current place, kept on the phone (per-device conveniences) ----
import { createContext, useContext } from "react";
import { PREVIEW } from "./api.js";

const KEY = "fishdock.settings.v1";

export const DEFAULT_SETTINGS = {
  theme: PREVIEW ? "system" : "dark", // "dark" | "light" | "system" (dark first, as DetectDock; the preview follows the viewer)
  units: { length: "cm", weight: "lb" },
  placeId: "chesil-beach-ferry-bridge", // a spot id, or "custom"
  custom: null,               // { name, lat, lon, kind } when placeId === "custom"
  target: "auto",             // species id or "auto" (best in season here)
  method: "auto",
  onboarded: false,
  favourites: [],             // spot ids
  nation: "auto",
  privacy: { approxShare: true, saveGps: true, analytics: true },
  beta: { smartBite: true, castAdvisor: true, community: true },
  savedSetups: [],            // saved bait + rig combinations
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s, units: { ...DEFAULT_SETTINGS.units, ...(s.units || {}) }, privacy: { ...DEFAULT_SETTINGS.privacy, ...(s.privacy || {}) }, beta: { ...DEFAULT_SETTINGS.beta, ...(s.beta || {}) } };
    }
  } catch { /* storage blocked: defaults */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* non-fatal */ }
}

/** "system" leaves the attribute alone so the CSS follows the phone (and, in the preview, the viewer's own theme). */
export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === "dark" || pref === "light") { root.dataset.theme = pref; root.dataset.fdTheme = pref; }
  else if (root.dataset.fdTheme) { delete root.dataset.theme; delete root.dataset.fdTheme; }
}

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
