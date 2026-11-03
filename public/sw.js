// FishDock service worker (adapted from DetectDock's): offline copy of the app shell, never caches /api.
const BUILD = new URL(location).searchParams.get("v") || "dev";
const CACHE = `fishdock-v1-${BUILD}`;
// Fish photos from Wikimedia Commons: kept across app updates, so a fish seen once still has its photo offline.
// Only CORS responses are kept (the app asks for them), never opaque ones, and only the newest PHOTO_MAX.
const PHOTOS = "fishphotos-v1";
const PHOTO_HOST = "https://upload.wikimedia.org/wikipedia/commons/";
const PHOTO_MAX = 160;
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const list = await (await fetch("/precache.json", { cache: "no-store" })).json();
      await c.addAll(["/", ...list.files.filter((f) => !f.endsWith(".map"))]);
    } catch { await c.add("/").catch(() => {}); }
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("fishdock-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "GET" && e.request.mode === "cors" && e.request.url.startsWith(PHOTO_HOST)) { e.respondWith(photo(e.request)); return; }
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // tiles and outside hosts: network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__/")) return; // live data is never cached here
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fish/") || url.pathname.startsWith("/people/") || url.pathname.startsWith("/models/")) { // (the 3D people and the Blender models: kept once seen)
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    })));
    return;
  }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/")));
  }
});

async function photo(req) {
  const c = await caches.open(PHOTOS);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "cors") {
    await c.put(req, res.clone());
    const keys = await c.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - PHOTO_MAX))) await c.delete(k);
  }
  return res;
}
