// ---- playRoute: the game's addresses ----
// #play                       the game, at Gorleston South Pier
// #play/<place>               at one of FishDock's places (a different fish each cast)
// #play/<place>/<fish>        with a fish chosen on the map, so that's the one you'll catch
// #play/<place>[/<fish>]/p<n> starting at that place's fishing position n (1 to 4)
// #play/map[/<place>]         the game's map for choosing a place (not a place itself)

/** The game at a place ({ place, species, fish, view3d, point }), or null if the address isn't one. */
export function parsePlay(hash) {
  const m = (hash || "").match(/^#\/?play(?!\/map(?:\/|$))(?:\/([a-z0-9-]+))?(?:\/(?!p[1-4]$)([a-z0-9-]+))?(?:\/p([1-4]))?$/);
  return m ? { place: m[1] || null, species: m[2] || null, fish: !!m[2], view3d: true, point: m[3] ? +m[3] : null } : null;
}
/** The game's map ({ spot }), or null. */
export function parsePlayMap(hash) {
  const m = (hash || "").match(/^#\/?play\/map(?:\/([a-z0-9-]+))?$/);
  return m ? { spot: m[1] || null } : null;
}
