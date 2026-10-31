// ---- sync: private backup of catches, sessions and marks for signed-in anglers (never shared) ----
import { all, put, onChange } from "./storage.js";
import { callJSON } from "./api.js";
import { idToken, onUser, accountsEnabled } from "./account.js";

const LAST = "fishdock.sync.last";
let timer = null, running = false, started = false;
const status = { state: "off", at: null, error: null };
const subs = new Set();
const emit = () => { for (const f of subs) f({ ...status }); };
export const onSync = (f) => { subs.add(f); f({ ...status }); return () => subs.delete(f); };

async function run() {
  if (running) return;
  const token = await idToken();
  if (!token) { status.state = "off"; emit(); return; }
  running = true; status.state = "syncing"; emit();
  try {
    let since = 0;
    try { since = Number(localStorage.getItem(LAST) || 0); } catch { /* ignore */ }
    const records = [];
    for (const kind of ["catches", "sessions"]) for (const r of await all(kind)) if ((r.updatedAt || 0) > since) records.push({ kind, id: r.id, updatedAt: r.updatedAt || Date.now(), data: r });
    if (records.length) {
      const res = await callJSON("PUT", "/api/sync", token, { records });
      if (res.error) throw new Error(res.message);
    }
    const pulled = await callJSON("GET", `/api/sync?since=${since}`, token);
    if (pulled.error) throw new Error(pulled.message);
    for (const r of pulled.records || []) {
      if (r.deleted || !r.data || !["catches", "sessions"].includes(r.kind)) continue;
      await put(r.kind, { ...r.data, updatedAt: r.updatedAt }, { keepUpdatedAt: true });
    }
    const now = Date.now();
    try { localStorage.setItem(LAST, String(now)); } catch { /* ignore */ }
    status.state = "ok"; status.at = now; status.error = null;
  } catch (e) {
    status.state = "error"; status.error = e?.message || "Backup failed";
  } finally { running = false; emit(); }
}

/** Start backing up once someone signs in; changes are sent a few seconds after they happen. */
export function startSync() {
  if (started || !accountsEnabled()) return;
  started = true;
  onUser((u) => { if (u) run(); else { status.state = "off"; emit(); } });
  onChange((store) => { if (store === "catches" || store === "sessions") { clearTimeout(timer); timer = setTimeout(run, 5000); } });
}
export const syncNow = run;
