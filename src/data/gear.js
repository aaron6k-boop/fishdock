// ---- gear: useful kit beyond the rig, by water, method and fish ----
// General kit that anglers commonly carry, with the reason for each. Standard practice rather than figures from a
// source, so every item is "unverified" and the app labels the list "General kit ideas". No sizes, prices or rules.
// water: "sea" | "fresh" | "any"; methods / species narrow an item to those (missing means any).

export const GEAR = [
  { id: "head-torch", name: "Head torch", q: "fishing head torch", water: "any", why: "Dusk, dawn and night are the best times for many fish; it keeps your hands free." },
  { id: "unhooking-tool", name: "Disgorger or forceps", q: "fishing disgorger forceps", water: "any", why: "Unhooks a fish quickly, so it goes back in good shape." },
  { id: "tripod", name: "Tripod or rod rest", q: "beach fishing tripod", water: "sea", methods: ["beachcasting", "shore-ledger"], why: "Holds the rod tip high, clear of the surf, so you see every bite." },
  { id: "rig-wallet", name: "Rig wallet", q: "rig wallet sea fishing", water: "sea", methods: ["beachcasting", "shore-ledger", "feathers"], why: "Keeps ready-tied rigs tidy, so you can change one in the dark." },
  { id: "bait-cool-box", name: "Bait cool box", q: "bait cool box fishing", water: "sea", methods: ["beachcasting", "shore-ledger", "rock-float"], why: "Keeps worms and crab alive and fresh through the session." },
  { id: "drop-net", name: "Drop net", q: "drop net fishing pier", water: "sea", methods: ["shore-ledger", "rock-float", "feathers"], why: "Lifts a good fish up a pier or harbour wall without breaking the line." },
  { id: "lifejacket", name: "Lifejacket or buoyancy aid", q: "fishing lifejacket", water: "sea", methods: ["rock-float", "shore-ledger", "sea-lure"], why: "For rock marks, piers and harbour walls, where a slip means deep water." },
  { id: "lure-box", name: "Lure box", q: "fishing lure box", water: "any", methods: ["sea-lure", "fresh-lure"], why: "Carries a few sizes and colours to change with the light and water." },
  { id: "polarised", name: "Polarised glasses", q: "polarised fishing sunglasses", water: "any", methods: ["sea-lure", "fresh-lure", "fly", "rock-float", "float"], why: "Cut the glare, so you see fish, weed and drop-offs, and protect your eyes from hooks." },
  { id: "bucket", name: "Bucket and bait board", q: "fishing bait board", water: "sea", methods: ["feathers", "rock-float"], why: "Somewhere to cut bait and keep a catch for the table cool." },
  { id: "landing-net", name: "Landing net", q: "coarse fishing landing net", water: "fresh", why: "Lands a fish without lifting it on the line." },
  { id: "catapult", name: "Bait catapult", q: "fishing bait catapult", water: "fresh", methods: ["float", "feeder", "method-feeder", "ledger"], why: "Loose-feeds a little and often, to keep fish in your swim." },
  { id: "unhooking-mat", name: "Unhooking mat", q: "unhooking mat", water: "fresh", species: ["carp", "pike", "barbel", "tench", "bream", "wels-catfish", "zander"], why: "Protects big fish on the bank while you unhook them; many fisheries ask for one." },
  { id: "long-forceps", name: "Long forceps", q: "pike forceps", water: "fresh", species: ["pike", "zander", "wels-catfish"], why: "Reach hooks well back in a toothy mouth safely." },
  { id: "wire-trace", name: "Wire traces", q: "pike wire trace", water: "fresh", species: ["pike"], why: "Pike teeth cut through nylon and leave the hook in the fish." },
  { id: "bite-alarms", name: "Bite alarms and rod pod", q: "bite alarms rod pod", water: "fresh", species: ["carp", "wels-catfish"], why: "For long sessions with the rods set: you hear the run." },
  { id: "hair-tools", name: "Baiting needle and hair stops", q: "baiting needle hair stops", water: "fresh", species: ["carp", "tench", "barbel"], methods: ["carp", "method-feeder", "ledger"], why: "Threads boilies and pellets onto a hair rig." },
  { id: "flatfish-attractors", name: "Beads and sequins", q: "fishing beads sequins flatfish", water: "sea", species: ["plaice", "flounder", "dab", "sole"], why: "Flatfish come to colour and flash just above the bait." },
  { id: "ray-cloth", name: "Wet towel or gloves", q: "fish handling gloves", water: "sea", species: ["thornback-ray", "lesser-spotted-dogfish", "smoothhound", "tope"], why: "Thorns and rough skin cut hands; a wet cloth also protects the fish." },
];

export function gearFor(species, method) {
  const water = species?.type === "fresh" ? "fresh" : species?.type === "both" ? null : "sea";
  return GEAR.filter((g) => (g.water === "any" || !water || g.water === water)
    && (!g.species || g.species.includes(species?.id))
    && (!g.methods || !method || g.methods.includes(method)))
    // the fish's own kit first, then the method's, then the general items
    .sort((a, b) => (b.species ? 2 : b.methods ? 1 : 0) - (a.species ? 2 : a.methods ? 1 : 0))
    .slice(0, 6);
}
