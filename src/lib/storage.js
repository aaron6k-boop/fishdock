// ---- storage: catches, sessions, marks and photos on the phone (IndexedDB, with a memory fallback) ----
// Private by default: nothing here leaves the phone unless the angler turns on backup or shares a record.

const DB_NAME = "fishdock";
const STORES = ["catches", "sessions", "marks", "photos"];
let dbp = null;
const mem = Object.fromEntries(STORES.map((s) => [s, new Map()]));
let memoryOnly = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no idb");
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { memoryOnly = true; resolve(null); };
      req.onblocked = () => { memoryOnly = true; resolve(null); };
    } catch { memoryOnly = true; resolve(null); }
  });
  return dbp;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const isMemoryOnly = () => memoryOnly;

export async function all(store) {
  const db = await open();
  if (!db) return [...mem[store].values()];
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, "readonly");
      const r = t.objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  } catch { return [...mem[store].values()]; }
}

export async function put(store, rec, { keepUpdatedAt = false } = {}) {
  const row = { ...rec, updatedAt: keepUpdatedAt && rec.updatedAt ? rec.updatedAt : Date.now() };
  mem[store].set(row.id, row);
  const db = await open();
  if (db) { try { await tx(db, store, "readwrite", (s) => s.put(row)); } catch { memoryOnly = true; } }
  emit(store);
  return row;
}

export async function get(store, id) {
  const db = await open();
  if (!db) return mem[store].get(id) || null;
  try {
    return await new Promise((resolve) => {
      const r = db.transaction(store, "readonly").objectStore(store).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(mem[store].get(id) || null);
    });
  } catch { return mem[store].get(id) || null; }
}

export async function remove(store, id) {
  mem[store].delete(id);
  const db = await open();
  if (db) { try { await tx(db, store, "readwrite", (s) => s.delete(id)); } catch { /* ignore */ } }
  emit(store);
}

export async function clearAll() {
  for (const s of STORES) mem[s].clear();
  const db = await open();
  if (db) for (const s of STORES) { try { await tx(db, s, "readwrite", (st) => st.clear()); } catch { /* ignore */ } }
  for (const s of STORES) emit(s);
}

export async function exportAll() {
  const out = { app: "FishDock", exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = await all(s);
  return out;
}

// ---- change listeners so screens refresh ----
const listeners = new Set();
function emit(store) { for (const l of listeners) l(store); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Shrink a photo for storage: JPEG, longest side `max` px, EXIF dropped by the canvas redraw. */
export async function shrinkImage(file, max = 1280, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
    const dataUrl = c.toDataURL("image/jpeg", quality);
    return { blob, dataUrl, width: c.width, height: c.height };
  } finally { URL.revokeObjectURL(url); }
}
