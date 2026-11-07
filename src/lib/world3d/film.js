// ---- film: the visual-check hooks (window.__fdWorld, __fdProbe, tuning overrides ...) ----
// On only in a build made for testing (FISHDOCK_FILM=1 node tools/build.mjs: __FD_FILM__ true) and then only when the
// test page sets window.__fdFilm. Production builds define __FD_FILM__ false, so none of it can be switched on there,
// whatever a page sets. (Unbuilt, as in the unit tests, it follows window.__fdFilm.)
/* global __FD_FILM__ */
export const FILM = (typeof __FD_FILM__ === "undefined" || __FD_FILM__ === true) && typeof window !== "undefined" && !!window.__fdFilm;
