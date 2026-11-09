// the launch screen: Play goes to the game's home; the other buttons straight to a place
document.getElementById("play").addEventListener("click", () => window.fishdock.play(""));
for (const b of document.querySelectorAll(".alt")) b.addEventListener("click", () => window.fishdock.play(b.dataset.route));
document.getElementById("quit").addEventListener("click", () => window.fishdock.quit());
const LOC = { ask: "ask each time", allow: "allowed", deny: "not allowed" };
const info = document.getElementById("info"), loc = document.getElementById("loc"), locBtn = document.getElementById("locbtn");
let locNow = "ask";
const showLoc = () => { loc.textContent = `Location: ${LOC[locNow] || locNow}`; locBtn.textContent = locNow === "allow" ? "Stop sharing" : locNow === "deny" ? "Ask again" : "Allow"; };
locBtn.addEventListener("click", () => { locNow = locNow === "allow" ? "deny" : locNow === "deny" ? "ask" : "allow"; window.fishdock.location(locNow); showLoc(); });
window.fishdock.info().then((i) => {
  if (!i) return;
  // what the window is really drawing with. "Hardware acceleration" is Chromium's own word for it; the device is the
  // one it chose, which on a laptop with two may still be the onboard chip: that is reported, not assumed
  const f = i.features || {}, accel = /enabled/.test(f.webgl2 || f.webgl || "") ? "hardware acceleration on" : "software drawing (no hardware acceleration)";
  const dev = i.device ? (i.device.name || i.device.vendor || `device ${i.device.vendorId}:${i.device.deviceId}`) : "graphics device not reported";
  info.textContent = `FishDock for Windows ${i.version} · ${accel} · ${dev}`;
  locNow = i.location || "ask"; showLoc();
}).catch(() => {});
