// ---- files: hand the angler a file (export). The phone preview uses the artifact's downloads capability. ----
import { PREVIEW } from "./api.js";

export async function exportFile(filename, text, type) {
  if (PREVIEW) {
    try {
      const dl = await window.claude?.use?.("downloads");
      if (!dl) return { ok: false, message: "Exports aren't available in this preview" };
      await dl.save({ filename, data: new Blob([text], { type }) });
      return { ok: true };
    } catch { return { ok: false, message: "Export cancelled" }; }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch { return { ok: false, message: "Couldn't export on this device" }; }
}
