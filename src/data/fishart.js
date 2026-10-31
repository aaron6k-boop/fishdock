// ---- fishart: FishDock's own picture of a species, where it has one ----
// Pictures chosen for FishDock by Aaron, fitted by tools/fit-fish.mjs into public/fish/<id>.webp (1200 x 800, fish
// pages, the fish in its setting) and <id>-s.webp (480 x 320, lists and cards: the fish cut out where we have a
// cut-out, which is every sea fish). A species without one shows its Wikimedia Commons photo
// (src/data/photos.js). The small ones are kept for use offline from the start, the large ones once seen.

export const ART_IDS = new Set([
  "perch", "bass", "cod", "whiting", "flounder", "plaice", "dab", "sole", "mackerel", "pollack", "coalfish", "ballan-wrasse", "thornback-ray", "smoothhound", "lesser-spotted-dogfish", "tope", "conger", "black-bream", "thick-lipped-mullet", "garfish", "gurnard", "pouting", "eel",
]);

export const hasArt = (id) => ART_IDS.has(id);
export const artUrl = (id, size = "s") => `/fish/${id}${size === "s" ? "-s" : ""}.webp`;
export const artSrcSet = (id) => `${artUrl(id, "s")} 480w, ${artUrl(id, "l")} 1200w`;
