// ---- viewpoint: where a nearby photo was taken from, read from its title and description ----
// Shared by the server (scoring Wikimedia Commons photos) and the phone (ranking them). A photo taken from high up
// (a town from the abbey, an aerial view) doesn't suit a rod held at the water's edge, so it ranks last; one that
// says it was taken from the pier, the beach or the bank ranks first. Words only: the phone also looks at the
// picture itself (src/lib/scene.js).

export const VIEWPOINTS = { pier: "Pier", beach: "Beach", harbour: "Harbour", riverbank: "Riverbank", lake: "Lakeside", boat: "From a boat" };

const ELEVATED = /\b(aerial|from (the )?(air|above|abbey|castle|church|tower|hill|hilltop|cliffs?|cliff ?top|top|steps|headland|monument|viewpoint)|199 steps|bird'?s[- ]eye|panoramas?|panoramic|overlooking|skyline|roof ?tops|over the (town|harbour|rooftops)|from high|drone|view over|looking down|from up)\b/i;
const BOAT = /\b(from (a|the) (boat|ferry|ship|yacht|launch)|aboard|on board|from the water|from offshore)\b/i;
const LEVEL = /\b(from the (pier|beach|jetty|breakwater|quay|shore|bank|towpath|harbour wall|slipway)|on the (beach|pier|shore|breakwater)|along the (pier|beach|shore|breakwater)|out to sea|end of the (pier|breakwater)|anglers?|angling|fishing|water'?s edge|shoreline)\b/i;
const KINDS = [
  ["pier", /\b(piers?|jetty|breakwater|groynes?|harbour wall|harbor wall|mole)\b/i],
  ["harbour", /\b(harbour|harbor|quay|quayside|marina|docks?)\b/i],
  ["beach", /\b(beach|sands?|shore|surf|strand|shingle)\b/i],
  ["riverbank", /\b(river|canal|weir|towpath|riverside|riverbank)\b/i],
  ["lake", /\b(lake|loch|lough|reservoir|mere|broad|pond|lakeside)\b/i],
];

/** { kind: pier | beach | harbour | riverbank | lake | boat | null, elevated, level } from a photo's words. */
export function viewpointFromWords(text) {
  const s = String(text || "");
  const elevated = ELEVATED.test(s), level = LEVEL.test(s);
  let kind = BOAT.test(s) ? "boat" : null;
  for (const [k, re] of KINDS) if (!kind && re.test(s)) kind = k;
  return { kind, elevated: elevated && !level, level };
}

/** Whether a photo's viewpoint suits the kind of place the angler stands at (null when we can't tell). */
export function suitsVenue(kind, venue) {
  if (!kind || !venue) return null;
  const ok = { pier: ["pier", "harbour"], beach: ["beach"], estuary: ["harbour", "riverbank", "beach", "pier"], river: ["riverbank"], lake: ["lake"] }[venue];
  return ok ? ok.includes(kind) : null;
}
