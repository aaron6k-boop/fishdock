// Apply the saved theme before first paint (as DetectDock's theme-init.js), dark first. "system" leaves it to CSS.
try {
  var s = JSON.parse(localStorage.getItem("fishdock.settings.v1") || "{}");
  var t = s.theme || "dark";
  if (t === "dark" || t === "light") { document.documentElement.dataset.theme = t; document.documentElement.dataset.fdTheme = t; }
} catch (e) { document.documentElement.dataset.theme = "dark"; }
