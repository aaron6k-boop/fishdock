// FishDock service worker (adapted from DetectDock's): offline copy of the app shell, never caches /api.
const BUILD = new URL(location).searchParams.get("v") || "dev";
const CACHE = `fishdock-v1-${BUILD}`;
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
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // tiles and outside hosts: network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__/")) return; // live data is never cached here
  if (url.pathname.startsWith("/assets/")) {
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
