// the launch screen's bridge to the app: three safe calls, nothing else
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("fishdock", {
  play: (route) => ipcRenderer.send("fd:play", route),
  quit: () => ipcRenderer.send("fd:quit"),
  info: () => ipcRenderer.invoke("fd:info"),
});
