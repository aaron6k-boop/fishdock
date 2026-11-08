// the launch screen: Play goes to the game's home; the other buttons straight to a place
document.getElementById("play").addEventListener("click", () => window.fishdock.play(""));
for (const b of document.querySelectorAll(".alt")) b.addEventListener("click", () => window.fishdock.play(b.dataset.route));
document.getElementById("quit").addEventListener("click", () => window.fishdock.quit());
window.fishdock.info().then((i) => {
  // which graphics card the window got (the whole point of the launcher: the proper card, not the onboard chip)
  const gpu = i.gpu || {}, accel = gpu.webgl2 || gpu.webgl || "";
  document.getElementById("info").textContent = `FishDock for Windows ${i.version} · graphics ${/enabled/.test(accel) ? "on the graphics card" : accel || "unknown"}`;
}).catch(() => {});
