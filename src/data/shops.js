// ---- shops: where to buy ready-tied rigs, bait and kit ----
// Links open a search on each shop's own site for the item, so they keep working as stock changes. FishDock doesn't
// sell anything, isn't paid for these links (no affiliate tags), and doesn't check the products or prices: the app
// says so wherever the links appear. Search addresses checked on 31 October 2026 (each returned matching products
// for "pulley rig"). Only the search words are sent, nothing about the angler.

export const SHOPS_CHECKED = "2026-10-31";
const enc = (q) => encodeURIComponent(q).replace(/%20/g, "+");
export const SHOPS = [
  { id: "amazon", name: "Amazon", short: "Amazon", url: (q) => `https://www.amazon.co.uk/s?k=${enc(q)}` },
  { id: "go-outdoors", name: "GO Outdoors", short: "GO Outdoors", url: (q) => `https://www.gooutdoors.co.uk/search?q=${enc(q)}` },
  { id: "gac", name: "Glasgow Angling Centre", short: "Glasgow Angling", url: (q) => `https://www.fishingmegastore.com/view.php?module=productsnew&search=${enc(q)}` },
];

// What shops call each rig when they sell it ready-tied (or the parts, for rigs nobody sells made up).
export const RIG_SEARCH = {
  pulley: "pulley rig", "pulley-pennell": "pulley pennell rig", "two-hook-flapper": "2 hook flapper rig",
  "one-up-one-down": "one up one down rig", "clipped-down": "clipped down rig", pennell: "pennell rig sea fishing",
  "running-ledger": "running ledger rig sea fishing", "rotten-bottom": "rotten bottom rig", "sliding-float": "sliding sea float",
  "rock-float-bait": "sea fishing float", "weightless-soft-plastic": "weedless soft plastic lure", "sea-spinner": "sea fishing spinner",
  feathers: "mackerel feathers", freeline: "sea fishing hooks", "running-ledger-fresh": "running ledger rig",
  "bolt-hair-rig": "ready tied hair rigs carp", "method-feeder": "method feeder", "cage-feeder": "cage feeder",
  "maggot-feeder": "maggot feeder", helicopter: "helicopter rig", waggler: "waggler float", "stick-float": "stick float",
  "freeline-fresh": "hooks to nylon", "pike-float": "pike float", "pike-paternoster": "pike paternoster rig",
  "pike-lure": "pike lure wire trace", "drop-shot": "drop shot rig", spinner: "fishing spinners", fly: "trout flies",
};
export const rigQuery = (rig) => RIG_SEARCH[rig?.id] || `${rig?.name || "fishing rig"}`.replace(/\s*\(.*?\)/g, "");

// Bait as the shops sell it: most sea baits frozen or preserved; live worms and maggots best from a local tackle shop.
export const BAIT_SEARCH = {
  ragworm: "ragworm bait", lugworm: "frozen lugworm bait", "peeler-crab": "frozen peeler crab bait", squid: "frozen squid bait",
  "mackerel-strip": "frozen mackerel bait", sandeel: "frozen sandeel bait", "razor-clam": "frozen razor clam bait",
  mussel: "frozen mussel bait", prawn: "frozen prawn bait", maggots: "fishing maggots", casters: "fishing casters",
  worms: "dendrobaena worms fishing", sweetcorn: "fishing sweetcorn", bread: "bread punch fishing", boilies: "boilies",
  pellets: "fishing pellets", "luncheon-meat": "luncheon meat fishing bait", deadbait: "frozen deadbait", lures: "fishing lures", flies: "trout flies",
};
/** Search words for one of a species' sourced baits (its own wording when it isn't a stock bait). */
export function baitQuery(b, sp) {
  if (b?.id && BAIT_SEARCH[b.id]) return BAIT_SEARCH[b.id];
  const words = String(b?.name || "").replace(/\s*\(.*?\)|,.*$|\d+(\.\d+)?\s*(mm|cm|in)\b.*$/gi, "").trim();
  return `${words} ${sp?.type === "fresh" ? "fishing" : "sea fishing"}`.trim();
}
