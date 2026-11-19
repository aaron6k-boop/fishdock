// ---- staleReload: a page left open across an update asks for code files the new build no longer serves ----
// Each build names its code files afresh, and the service worker drops the last build's copies when the next one takes
// over. A page from before the update that then opens a screen it hadn't loaded yet (the game, the map) asks for a
// file that is gone: the screen stayed black (the live check after the 19 November update, at Cromer). Loading the
// page again fetches the new build, so that is what happens, once: a second failure inside half a minute is shown as
// the ordinary error instead of reloading for ever.
const KEY = "fishdock.staleReload", AGAIN_MS = 30e3;
/** is this the error a browser gives when a code file can't be fetched? (Chrome, Firefox and Safari word it differently) */
export const moduleGone = (err) => /dynamically imported module|Importing a module script failed|module script|Failed to fetch/i.test(String(err?.message || err || ""));
/** load a code file (f: () => import(...)); if it can't be fetched, load the page again once. env: for the tests */
export function fresh(f, env = null) {
  return f().catch((err) => {
    const e = env || { now: () => Date.now(), store: typeof sessionStorage !== "undefined" ? sessionStorage : null, reload: () => location.reload() };
    let last = 0; try { last = Number(e.store?.getItem(KEY)) || 0; } catch { /* no storage */ }
    if (!moduleGone(err) || !e.store || e.now() - last < AGAIN_MS) throw err;
    try { e.store.setItem(KEY, String(e.now())); } catch { throw err; }
    e.reload();
    return new Promise(() => {}); // (the page is going: nothing more to show from this one)
  });
}
