# FishDock reference data (src/data/*.js)

Plain ES modules, hand-checked, every record with `sources` (URLs actually read) and a `verification`
of `"verified" | "partial" | "unverified"`. UK English, no em dashes in any text shown to users, paraphrased
(never copied) wording, concise strings. Unknown values are `null`, never guessed.

## spots.js
```js
export const SPOTS = [{
  id: "chesil-beach",            // kebab-case, unique
  name: "Chesil Beach", region: "Dorset", nation: "England" | "Wales" | "Scotland" | "Northern Ireland",
  kind: "sea" | "river" | "lake" | "canal" | "fishery",
  subtype: "beach" | "pier" | "rocks" | "breakwater" | "estuary" | "harbour" | "river" | "lake" | "reservoir" | "canal" | "fishery",
  lat: 50.6050, lon: -2.5420, coordsVerified: true | false,   // false = approximate, shown as "approximate position"
  species: [{ id: "bass", name: "Bass", level: "common" | "seasonal" | "occasional", note: "summer and autumn" }],
  best: "When it fishes best (tide, time, conditions), one or two sentences",
  tidePref: "high" | "low" | "flood" | "ebb" | "moving" | null,   // sea only
  baits: ["peeler crab", "lugworm"],
  access: "Access, parking, permits, fees, who to ask; 'check locally' where unsure",
  safety: "One short safety note or null",
  sources: ["https://..."], verification: "verified" | "partial",
  checked: "2026-10-31",
}];
export const spotById = (id) => SPOTS.find((s) => s.id === id) || null;
```
Species ids must match species.js ids.

## scenes.js (the 3D place check, run ahead of time)
```js
export const SCENE_CHECKS = {
  "deal-pier": {
    result: "passed" | "failed",      // osmPlace.buildPlace + checkLayout on the saved /api/place answer
    venue: "pier" | "beach" | "estuary" | "river" | "lake",   // as the 3D game opens it (scene.js venueOf)
    points: [{ name: "On the pier", face: 359 }],              // the four checked positions, compass degrees; [] if failed
    approx: false,                     // true when the 3D view used the mark's approximate listed position
    why: "only when failed",
    data: "2026-11-02", checked: "2026-11-04", sources: ["https://www.openstreetmap.org/"], verification: "verified",
  },
};
```
The UK spot map (src/lib/spotMap.js) reads every map spot from spots.js and this file; nothing is copied. Its
scene states: `exact` (passed, not approximate), `representative` (failed), `reconstructed` (everything else: built
and checked when you arrive, Beta). Positions are never stored: they come from the map data on the day, and every
arrival is checked again on the phone (src/lib/world3d/spawn.js).

## species.js
```js
export const SPECIES = [{
  id: "bass", name: "Bass", latin: "Dicentrarchus labrax", type: "sea" | "fresh" | "both",
  group: "sea-predator" | "sea-bottom" | "flatfish" | "ray-shark" | "rock" | "pelagic" | "coarse" | "coarse-night" | "predator" | "game",
  art: { shape: "torpedo" | "long" | "deep" | "chunky" | "eel" | "flat" | "ray" | "shark", back: "#hex", body: "#hex", belly: "#hex", fins: "#hex",
         pattern: null | "bars" | "waves" | "spots" | "spots-red" | "speckle" | "line" | "stripes" | "scales" | "thorns" | "spots-white", dorsal: null | "double" | "long" | "back", barbels: false },
  peak: [months 1-12], present: [months incl. peak],
  range: ["uk"] or coasts ["south","southwest","wales","northwest","northeast","east","scotland-west","scotland-east","ni"],
  waters: ["beach","pier","rocks","breakwater","estuary","harbour"] or ["river","lake","reservoir","canal","fishery"],
  methods: ["beachcasting","rock-float","shore-ledger","sea-lure","feathers","float","ledger","feeder","method-feeder","carp","fresh-lure","deadbait","fly","freeline"],
  habitat, depth, behaviour, bestTimes: strings,
  tempC: null | { text: "plain sentence with the figure", source: "url" },
  baits: { natural: [{ id: "peeler-crab", name: "Peeler crab", seasons: ["spring","summer"] | null, scent: true|false, natural: true|false, note }],
           artificial: [{ name: "Soft plastic sandeel, 4-6 in", note }] },
  baitSize: "how much bait / bait size", hooks: { range: "2/0–4/0", pattern: "Aberdeen or Viking", small: "...", specimen: "...", why: "..." },
  barbless: "rule or advice" | null, rigs: ["pulley-pennell", ...rig ids, best first],
  presentation: { zone: "bottom" | "mid" | "surface" | "varies", text, moving: "static" | "moving" | "either", offBottom: string|null, missed: "what to change when bites are missed" },
  line: "mainline / hooklength / leader", weights: "lead or float sizes", distance: "how far to cast, when sources say" | null, where: "general features to target",
  tackle: { [method]: { hook, pattern, baitSize, zone, presentation, line, weight, distance, rough, clear, coloured, snaggy } }  // optional per-method overrides
  minSize: null | { cm: 42, text: "who sets it and where", source: "url" },
  conservation, idTip, lookalikes,
  bite: optional BiteScore overrides { light: {twilight, night, day}, tide: "flood"|..., waves: [lo,hi], seaTemp: [lo,hi], airTemp: [lo,hi], flow: "fining"|"normal" },
  sources: [], verification,
}];
export const speciesById = (id) => SPECIES.find((s) => s.id === id) || null;
```

## rigs.js
```js
export const RIGS = [{
  id: "pulley-pennell", name: "Pulley Pennell rig", type: "sea" | "fresh",
  methods: [method ids as above], species: [species ids], snaggy: true|false|null, heavyFlow: true|false, calm: true|false,
  diagram: [ { k: "line" | "leader" | "bead" | "stop" | "swivel" | "float" | "shot" | "lead" | "snood" | "clip" | "wire" | "hooklength" | "dropper" | "hook" | "lure" | "trebles", label?, kind?: "grip"|"bomb"|"feeder"|"method", boom?: true, hair?: true, bait?: false } ],   // in order, mainline (left) to hook (right)
  components: ["plain list, top to bottom"], hook: "size range", line: "mainline / leader / hooklength", weight: "lead or float",
  bait: "bait placement", steps: ["4-8 short steps"], best: "conditions it suits", mistakes: [{ m: "mistake", fix: "fix" }],
  sources: [], verification,
}];
export const rigById = (id) => RIGS.find((r) => r.id === id) || null;
```

## knots.js
`export const KNOTS = [{ id, name, use, steps: [..], strength: string|null, sources, verification }]`

## baits.js
`export const BAITS = [{ id, name, type: "sea" | "fresh" | "both", kind: "natural" | "artificial", species: [ids], hooking: "how to hook or mount it", where: "where to get or collect it", storage: "how to keep it", scent: bool, natural: bool, sources }]`

## rules.js (data only; the engine is src/lib/rules.js)
```js
export const RULES_CHECKED = "2026-10-31";
export const LICENCES = { "England": { needed, prices: [{ label, price }], buy: "https://www.gov.uk/fishing-licences", note, sources }, "Wales": {...}, "Scotland": {...}, "Northern Ireland": {...} };
export const CLOSE_SEASONS = [{ nation, applies: "rivers" | "all-coarse" | "salmon" | "trout", from: "03-15", to: "06-15", text, exceptions, sources }];
export const BASS_RULES = { minCm: 42, year: 2026, periods: [{ from: "MM-DD", to: "MM-DD", rule: "catch-and-release" | "retain", bag: n|null }], text, sources, verification };
export const MIN_SIZES = [{ id: species id, cm, text, source }];   // IFCA/national sizes; note they vary by district
export const SAFETY = [{ title, text, source }];
export const CONSERVATION = [{ title, text, source }];
export const EVIDENCE = [{ factor, text, source }];   // what drives bite times
```
