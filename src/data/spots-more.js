// ---- FishDock spots, second batch (researched 2026-10-31) ----
// Found with web search only, which returned page titles and links but no page text. So species are listed only
// where a page title names them for that mark, river or venue. That is fewer than the marks really hold, and
// What Can I Catch Here adds nearby records and habitat on top. Every position is approximate (coordsVerified
// false) and shown as such. Marks with one source, or whose source covers a whole river or area, are "partial".
// To add more, follow docs/DATA-SCHEMA.md and run node tools/check-data.mjs.

export const MORE_SPOTS = [
  {
    id: "roker-pier",
    name: "Roker Pier, Sunderland",
    region: "Tyne and Wear, North East England",
    nation: "England",
    kind: "sea",
    subtype: "pier",
    lat: 54.9214,
    lon: -1.3606,
    coordsVerified: false,
    species: [
      {
        id: "cod",
        name: "Cod",
        level: "common",
        note: "Named with whiting as the main targets in Sea Angler's Roker Pier guide"
      },
      {
        id: "whiting",
        name: "Whiting",
        level: "common",
        note: "Named with cod in Sea Angler's Roker Pier guide"
      },
      {
        id: "mackerel",
        name: "Mackerel",
        level: "seasonal",
        note: "Summer, reported off Roker by the Sunderland Echo in late June"
      }
    ],
    best: "Sources name cod and whiting as the pier's main fish, and mackerel show off Roker in early summer. Check locally for the best tides.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/fishing-tips/marks/cod-and-whiting-fishing-off-roker-pier-in-sunderland",
      "https://www.seaangler.co.uk/spot/roker-pier-sea-fishing-mark/",
      "https://www.pressreader.com/uk/sunderland-echo/20120628/283369059116458",
      "https://nesa.co.uk/forums/forum/nesa/shore-fishing/15170-roker-pier"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "reculver-towers",
    name: "Reculver Towers (Reculver to Herne Bay shore)",
    region: "Kent (north coast), South East England",
    nation: "England",
    kind: "sea",
    subtype: "beach",
    lat: 51.3802,
    lon: 1.1995,
    coordsVerified: false,
    species: [
      {
        id: "bass",
        name: "Bass",
        level: "common",
        note: "Named as a main target on the Reculver to Herne Bay stretch"
      },
      {
        id: "thornback-ray",
        name: "Thornback ray",
        level: "common",
        note: "Source says rays"
      },
      {
        id: "smoothhound",
        name: "Smoothhound",
        level: "common",
        note: "Source says smoothhounds"
      }
    ],
    best: "Sea Angler says most anglers on this stretch of the north Kent coast are after bass, rays and smoothhounds. The sources found give no tide or season detail, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally for parking and the walk to the beach.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/spot/reculver-herne-bay/",
      "https://www.seaangler.co.uk/spot/reculver-towers-sea-fishing-mark/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "isle-of-sheppey-shore",
    name: "Isle of Sheppey shore marks",
    region: "Kent (Isle of Sheppey), Thames Estuary",
    nation: "England",
    kind: "sea",
    subtype: "beach",
    lat: 51.4382,
    lon: 0.7758,
    coordsVerified: false,
    species: [
      {
        id: "thornback-ray",
        name: "Thornback ray",
        level: "common",
        note: "Sea Angler report of excellent thornback ray sport on the island"
      },
      {
        id: "flounder",
        name: "Flounder",
        level: "common",
        note: "Named in the same Sea Angler report"
      },
      {
        id: "eel",
        name: "Eel",
        level: "common",
        note: "Named in the same Sea Angler report"
      }
    ],
    best: "A Sea Angler report picks out thornback rays, flounder and eels as the island's standout catches. No tide or season detail was found, so check locally.",
    tidePref: null,
    baits: [],
    access: "Sea Angler describes a wide choice of venues around the island. The map point is on the Sheerness seafront and is approximate. Check locally for parking and access.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/fishing-news/isle-of-sheppey-offering-excellent-thornback-ray-flounder-and-eel-action/",
      "https://www.seaangler.co.uk/spot/isle-of-sheppey/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "eastbourne-pier",
    name: "Eastbourne Pier",
    region: "East Sussex, South East England",
    nation: "England",
    kind: "sea",
    subtype: "pier",
    lat: 50.7655,
    lon: 0.2912,
    coordsVerified: false,
    species: [
      {
        id: "mackerel",
        name: "Mackerel",
        level: "common",
        note: "Named in a Sea Angler pier report"
      },
      {
        id: "garfish",
        name: "Garfish",
        level: "common",
        note: "Named in a Sea Angler pier report"
      },
      {
        id: "bass",
        name: "Bass",
        level: "common",
        note: "Named in a Sea Angler pier report"
      }
    ],
    best: "A Sea Angler report singles out mackerel, garfish and bass from the pier. No tide or season detail was found, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally for opening times, any fee and the pier's angling rules.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/fishing-news/eastbourne-pier-promising-top-mackerel-garfish-and-bass-action/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "newhaven-west-breakwater",
    name: "Newhaven Breakwater",
    region: "East Sussex, South East England",
    nation: "England",
    kind: "sea",
    subtype: "breakwater",
    lat: 50.7805,
    lon: 0.0572,
    coordsVerified: false,
    species: [
      {
        id: "sole",
        name: "Sole",
        level: "common",
        note: "From a Sea Angler feature on Newhaven sole; the title names the town, not the breakwater itself"
      }
    ],
    best: "A Sea Angler feature highlights sole fishing at Newhaven. No tide or season detail was found in the sources, so check locally.",
    tidePref: null,
    baits: [],
    access: "Newhaven Port publishes guidance for anyone fishing within the harbour. Read it and check locally for current access to the breakwater before you go.",
    safety: null,
    sources: [
      "https://gb.readly.com/magazines/sea-angler/2023-08-18/64d8210eecc9a60003fca161",
      "https://www.ournewhaven.org.uk/?p=42061",
      "https://newhavenport.com/are-you-fishing-within-newhaven-harbour/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "seaford-bay-newhaven-east-arm",
    name: "Seaford Bay (Seaford to Newhaven East Arm)",
    region: "East Sussex, South East England",
    nation: "England",
    kind: "sea",
    subtype: "beach",
    lat: 50.7775,
    lon: 0.0782,
    coordsVerified: false,
    species: [
      {
        id: "flounder",
        name: "Flounder",
        level: "common",
        note: "Source says the stretch is noted for flounder"
      }
    ],
    best: "Sea Angler notes the stretch between Seaford and the Newhaven east arm for flounder and golden grey mullet (golden grey mullet has no profile in the app). No tide or season detail was found, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally for parking and beach access along the bay.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/?p=4078"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "portland-bill-pulpit-rock",
    name: "Pulpit Rock, Portland Bill",
    region: "Dorset (Isle of Portland), South West England",
    nation: "England",
    kind: "sea",
    subtype: "rocks",
    lat: 50.5127,
    lon: -2.4587,
    coordsVerified: false,
    species: [
      {
        id: "ballan-wrasse",
        name: "Ballan wrasse",
        level: "common",
        note: "Source says wrasse"
      }
    ],
    best: "Sea Angler features Pulpit Point at Portland as a rock mark for wrasse. No tide or season detail was found, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally for parking and the route down to the rocks at Portland Bill.",
    safety: "Rock mark: take care on the rocks, especially in any swell.",
    sources: [
      "https://www.seaangler.co.uk/fishing-tips/marks/rock-fishing-for-wrasse-off-pulpit-point-on-portland/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "three-cliffs-bay-gower",
    name: "Three Cliffs Bay, Gower",
    region: "Swansea (Gower), South Wales",
    nation: "Wales",
    kind: "sea",
    subtype: "beach",
    lat: 51.568,
    lon: -4.113,
    coordsVerified: false,
    species: [
      {
        id: "bass",
        name: "Bass",
        level: "common",
        note: "Described as superb surf fishing for bass"
      }
    ],
    best: "A surf beach known for bass, so it fishes best when there is a surf running.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/spot/three-cliffs-bay-swansea-wales/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "traeth-penbryn",
    name: "Traeth Penbryn",
    region: "Ceredigion (Cardigan Bay), Mid Wales",
    nation: "Wales",
    kind: "sea",
    subtype: "beach",
    lat: 52.1445,
    lon: -4.486,
    coordsVerified: false,
    species: [
      {
        id: "bass",
        name: "Bass",
        level: "seasonal",
        note: "Autumn"
      }
    ],
    best: "A storm beach that can give good bass fishing in autumn, when rough weather puts a surf on it.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/spot/traeth-penbryn-sea-fishing-mark/",
      "https://fishingwales.net/bass-fishing-wales-lure-and-fly-cardigan-bay"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "aberdaron-beach",
    name: "Aberdaron Beach",
    region: "Gwynedd (Llŷn Peninsula), North Wales",
    nation: "Wales",
    kind: "sea",
    subtype: "beach",
    lat: 52.804,
    lon: -4.7125,
    coordsVerified: false,
    species: [
      {
        id: "bass",
        name: "Bass",
        level: "common",
        note: "School bass, all year round"
      }
    ],
    best: "A shallow storm beach at the tip of the Llŷn that gives school bass all year, best with some surf.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://www.seaangler.co.uk/spot/aberdaron-beach-sea-fishing-mark/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "cleveleys-beach",
    name: "Cleveleys Beach",
    region: "Lancashire (Fylde coast), North West England",
    nation: "England",
    kind: "sea",
    subtype: "beach",
    lat: 53.8786,
    lon: -3.0472,
    coordsVerified: false,
    species: [
      {
        id: "whiting",
        name: "Whiting",
        level: "seasonal",
        note: "Winter"
      },
      {
        id: "cod",
        name: "Cod",
        level: "seasonal",
        note: "Source says codling; winter"
      }
    ],
    best: "A long, shallow beach that fishes best in winter, when anglers target whiting and codling.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://seaangler.co.uk/spot/cleveleys-sea-fishing-mark"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "fife-ness",
    name: "Fife Ness",
    region: "Fife, East Scotland",
    nation: "Scotland",
    kind: "sea",
    subtype: "rocks",
    lat: 56.2779,
    lon: -2.5866,
    coordsVerified: false,
    species: [
      {
        id: "cod",
        name: "Cod",
        level: "common",
        note: ""
      }
    ],
    best: "Described as rough ground with plenty of cod among the snags. The source gives no best tide or season, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: "Fishing is over rough, snaggy rock, so take care with footing.",
    sources: [
      "https://www.seaangler.co.uk/spot/fife-ness-sea-fishing-mark/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "north-berwick-rocks",
    name: "North Berwick rock marks",
    region: "East Lothian, South East Scotland",
    nation: "Scotland",
    kind: "sea",
    subtype: "rocks",
    lat: 56.0614,
    lon: -2.718,
    coordsVerified: false,
    species: [
      {
        id: "cod",
        name: "Cod",
        level: "seasonal",
        note: "Source says winter codling"
      }
    ],
    best: "Winter is the main season, with codling the mainstay from the rocky marks.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: "Fishing is from rocks, so take care with footing.",
    sources: [
      "https://www.seaangler.co.uk/spot/north-berwick-sea-fishing-mark/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "isle-of-whithorn",
    name: "Isle of Whithorn",
    region: "Dumfries and Galloway (Solway coast), South West Scotland",
    nation: "Scotland",
    kind: "sea",
    subtype: "harbour",
    lat: 54.698,
    lon: -4.365,
    coordsVerified: false,
    species: [
      {
        id: "bass",
        name: "Bass",
        level: "occasional",
        note: "Named in an angler's report; how often is not stated"
      }
    ],
    best: "The sources give no best tide or season, so check locally.",
    tidePref: null,
    baits: [],
    access: "Check locally.",
    safety: null,
    sources: [
      "https://www.nesa.co.uk/threads/isle-of-whithorn-bass.47009",
      "https://www.nesa.co.uk/threads/isle-of-whithorn-info.178824"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "chew-valley-lake",
    name: "Chew Valley Lake",
    region: "Somerset, South West England",
    nation: "England",
    kind: "lake",
    subtype: "reservoir",
    lat: 51.336,
    lon: -2.616,
    coordsVerified: false,
    species: [
      {
        id: "pike",
        name: "Pike",
        level: "common",
        note: "Written up as a big pike water, fished on organised pike days"
      }
    ],
    best: "Pike are fished on organised pike days, and anglers write up late autumn sessions such as November. An Orvis report gives the main fishing season as 8 March to the end of October.",
    tidePref: null,
    baits: [],
    access: "Bristol Water owns the lake and runs the fishing; check its Chew Valley Lake page for permits, pike day dates and rules. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://bristolwater.co.uk/chewvalleylake",
      "https://tokyoflyfishing.com/en/reports/report-2011/pike-day-chew-valley-lake-somerset/amp/",
      "https://drennantackle.com/?p=20136",
      "https://fishingreports.orvis.com/united-kingdom/chew-valley-lake",
      "https://www.anglingdirect.co.uk/community/november-chew-phil-spinks/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "grafham-water",
    name: "Grafham Water",
    region: "Cambridgeshire, East of England",
    nation: "England",
    kind: "lake",
    subtype: "reservoir",
    lat: 52.292,
    lon: -0.323,
    coordsVerified: false,
    species: [
      {
        id: "rainbow-trout",
        name: "Rainbow trout",
        level: "common",
        note: "Weekly catch reports; best fish of one April 2023 week was a 5lb rainbow"
      }
    ],
    best: "Anglian Water's weekly reports show trout caught from early March right through to December. Rod averages vary a lot from week to week, so check the latest report before you go.",
    tidePref: null,
    baits: [],
    access: "Anglian Water runs the fishery and sells permits through its Anglian Water Parks website, where it also posts weekly catch reports counting fish kept and released. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://anglianwaterparks.co.uk/news/grafham-water-week-ending-16th-april-2023",
      "https://anglianwaterparks.co.uk/node/1341",
      "https://anglianwaterparks.co.uk/news/grafham-water-week-ending-20-december",
      "https://anglianwaterparks.co.uk/node/2764"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "tyne-green-hexham",
    name: "River Tyne at Tyne Green Country Park, Hexham",
    region: "Northumberland, North East England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 54.978,
    lon: -2.105,
    coordsVerified: false,
    species: [
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: "Source covers sea trout fishing on the Tyne as a whole, not Tyne Green alone"
      }
    ],
    best: "Sources found do not say when this stretch fishes best. Check locally, and check the Environment Agency north east byelaws for seasons.",
    tidePref: null,
    baits: [],
    access: "Northumberland County Council controls the fishing at the country park and publishes its own fishery terms, conditions and rules. Check with the council for permits. An Environment Agency rod licence is required, and the north east regional rod byelaws apply.",
    safety: null,
    sources: [
      "https://www.northumberland.gov.uk/Local/Country-parks-visitor-centres-coastal-sitesPubl/Tyne-Green-Country-Park-Hexham.aspx",
      "https://www.northumberland.gov.uk/NorthumberlandCountyCouncil/media/Neigbourhood-and-Local-Services/NCC-Country-Park-Fishery-general-terms-conditions-and-rules.pdf",
      "https://seatrout-fishing.com/river-tyne.htm",
      "https://www.gov.uk/guidance/regional-rod-fishing-byelaws-north-east-region"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-swale-topcliffe",
    name: "River Swale at Topcliffe",
    region: "North Yorkshire, North East England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 54.178,
    lon: -1.388,
    coordsVerified: false,
    species: [
      {
        id: "barbel",
        name: "Barbel",
        level: "common",
        note: "Swale barbel to 12lb reported; sources cover the Swale in general"
      }
    ],
    best: "The Swale is best known for barbel, with fish to 12lb reported. Sources found give no timings, so check locally.",
    tidePref: null,
    baits: [],
    access: "Topcliffe is a known Swale fishery, but sources found do not name the controlling club or ticket. Check locally. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://www.fishingmagic.com/?p=12242",
      "https://www.drennantackle.com/?p=16321",
      "https://anglingtimes.co.uk/advice/tips/how-to-fish-the-river-swale",
      "https://www.yorkshireeveningpost.co.uk/sport/angling-unhappy-ending-to-topcliffe-seal-saga-582715"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-ure-boroughbridge",
    name: "River Ure at Boroughbridge",
    region: "North Yorkshire, North East England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 54.0985,
    lon: -1.397,
    coordsVerified: false,
    species: [
      {
        id: "chub",
        name: "Chub",
        level: "common",
        note: "Named in a specimen Ure chub catch report; source covers the Ure in general"
      }
    ],
    best: "The Ure is known for specimen chub. Sources found give no timings, so check locally.",
    tidePref: null,
    baits: [],
    access: "Boroughbridge's town website has an angling page; check it or ask locally for the controlling club and day tickets. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://www.drennantackle.com/?p=16392",
      "https://www.boroughbridge.org.uk/Angling_43012.aspx",
      "https://canalrivertrust.org.uk/canals-and-rivers/river-ure"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-ribble-hurst-green",
    name: "River Ribble at Hurst Green",
    region: "Lancashire (Ribble Valley), North West England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 53.829,
    lon: -2.478,
    coordsVerified: false,
    species: [
      {
        id: "chub",
        name: "Chub",
        level: "common",
        note: "Ribble chub fish-ins written up by Fishing Magic; sources cover the Ribble in general"
      }
    ],
    best: "The Ribble has hosted several chub fish-ins written up by Fishing Magic. Sources found give no timings, so check locally.",
    tidePref: null,
    baits: [],
    access: "Warrington Anglers Association lists Hurst Green as one of its Ribble waters; check with the club for membership or ticket terms. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://warrington-anglers.org.uk/waters/01K47TDM8GGPF3D7XYXPHTB3Z5",
      "https://www.fishingmagic.com/forums/threads/fm-ribble-chub-fish-in-iii.12109/post-193211",
      "https://fishingmagic.com/?p=11408"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-lune-halton",
    name: "River Lune at Halton",
    region: "Lancashire, North West England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 54.072,
    lon: -2.757,
    coordsVerified: false,
    species: [
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: "Source covers sea trout fishing on the Lune as a whole"
      }
    ],
    best: "Sources found do not give timings for this beat. Check FishPal and the Lune Rivers Trust for beat details.",
    tidePref: null,
    baits: [],
    access: "The Halton Upper Beat is listed on FishPal, the online permit service, and the Lune Rivers Trust publishes a list of fishing beats. Check there for tickets and rules. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://www.fishpal.com/england/cumbria/haltonupperbeat/",
      "https://seatrout-fishing.com/river-lune.htm",
      "https://luneriverstrust.org.uk/fishing-beats/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-eden-carlisle",
    name: "River Eden at Carlisle (Carlisle Angling Association)",
    region: "Cumbria, North West England",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 54.9005,
    lon: -2.935,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: "FishPal sells salmon fishing on the Eden"
      }
    ],
    best: "Sources found give no timings for Carlisle itself. FishPal publishes a when and where to fish guide for Cumbrian rivers.",
    tidePref: null,
    baits: [],
    access: "Carlisle Angling Association controls the water and sells permits through FishPal. Check its FishPal page for prices and rules. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://fishpal.com/England/Cumbria/CarlisleAnglingAssociation/",
      "https://blog.fishpal.com/2012/03/09/salmon-fishing-for-the-river-eden-cumbria-is-now-on-fishpal/",
      "https://www.fishpal.com/england/cumbria/whenandwheretofish.html",
      "https://fishingmagic.com/forums/threads/river-eden-carlisle.2521/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-derwent-belper",
    name: "River Derwent at Belper (Belper Angling Club)",
    region: "Derbyshire, East Midlands",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 53.027,
    lon: -1.485,
    coordsVerified: false,
    species: [
      {
        id: "chub",
        name: "Chub",
        level: "common",
        note: "Club reports a brace of 4lb Derwent chub"
      }
    ],
    best: "The club reports chub to 4lb from the Derwent. Sources found give no timings, so check locally.",
    tidePref: null,
    baits: [],
    access: "Belper Angling Club fishes the Derwent here; check with the club for membership or day ticket terms. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://www.belperanglingclub.uk/coarse-carp-fishing/chub/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-trent-nottingham",
    name: "River Trent at Nottingham",
    region: "Nottinghamshire, East Midlands",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 52.932,
    lon: -1.144,
    coordsVerified: false,
    species: [
      {
        id: "barbel",
        name: "Barbel",
        level: "common",
        note: "Angling Times covers barbel fishing on the Trent in general"
      },
      {
        id: "carp",
        name: "Carp",
        level: "occasional",
        note: "River-wide: Trent carp to over 30lb are reported; not a record for this stretch"
      }
    ],
    best: "Sources found give no timings for the Nottingham stretch. Angling Times has a guide to the best Trent stretches and to Trent barbel fishing.",
    tidePref: null,
    baits: [],
    access: "Nottingham Anglers Association (Notts AA) runs Let's Fish and regional events on the Trent at Nottingham. Sources found do not say who controls each peg, so check with Notts AA or locally for tickets. An Environment Agency rod licence is required.",
    safety: null,
    sources: [
      "https://www.anglingtimes.co.uk/advice/tips/barbel-fishing-on-the-river-trent",
      "https://www.pressreader.com/uk/angling-times-uk/20210629/283506503954336",
      "https://happeningnext.com/event/lets-fish-nottingham-river-trent-notts-aa-15-08-2026-eid1ef0l2ijoisa",
      "https://www.anglingtimes.co.uk/news/stories/perfect-rig-placement-fools-30lb-plus-warrior-trent-carp/",
      "https://www.anglingtimes.co.uk/advice/tips/how-to-catch-carp-on-the-river-trent/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-clyde-ucapa",
    name: "River Clyde, UCAPA water near Lanark",
    region: "South Lanarkshire, Central Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 55.671,
    lon: -3.803,
    coordsVerified: false,
    species: [
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: "Reported as trout in local angling columns"
      },
      {
        id: "grayling",
        name: "Grayling",
        level: "common",
        note: "FishPal says grayling were first brought to the Clyde in 1855"
      }
    ],
    best: "Local angling reports show heavy summer rain can upset the river, though July rain has also brought good sport. Check the level before you go.",
    tidePref: null,
    baits: [],
    access: "United Clyde Angling Protective Association (UCAPA) water. Permits and conditions are sold through FishPal. Check which stretches are covered, parking and rules locally.",
    safety: null,
    sources: [
      "https://www.universityrooms.com/en-GB/vendor/fishpal_clga",
      "https://blog.fishpal.com/2017/02/17/lets-go-fishing-river-clyde/",
      "https://www.pressreader.com/uk/hamilton-advertiser/20160630/283016874017785",
      "https://www.fishpal.com/grayling.html",
      "https://www.pressreader.com/uk/hamilton-advertiser/20170803/283029759691978"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-teviot-roxburgh",
    name: "River Teviot at Roxburgh",
    region: "Scottish Borders",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 55.5705,
    lon: -2.472,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: "Guided trout and grayling trips are run on the Teviot"
      },
      {
        id: "grayling",
        name: "Grayling",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Fished by beat, including the Upper Roxburgh water. Check permits, parking and who sells the fishing locally.",
    safety: null,
    sources: [
      "https://trout-salmon-fishing.com/scotland-river-teviot.htm",
      "https://albagamefishing.com/our-packages/trout-and-grayling-fishing-river-teviot",
      "https://fishprep.com/water/upper-roxburgh-river-teviot"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-dee-ballater",
    name: "River Dee at Ballater",
    region: "Aberdeenshire (Royal Deeside), North East Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 57.047,
    lon: -3.0395,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      }
    ],
    best: "The river's weekly fishing reports run from February into the autumn, so read the latest one before booking.",
    tidePref: null,
    baits: [],
    access: "Ballater Angling Association offers fishing near the village. Check its visitor permits and rules locally. The riverdee.org.uk site has a guide to fishing the river.",
    safety: null,
    sources: [
      "https://visitballater.com/listings/ballater-angling-association/",
      "https://riverdee.org.uk/fish-the-river-dee/",
      "https://trout-salmon-fishing.com/scotland-river-dee.htm"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-don-inverurie",
    name: "River Don at Inverurie",
    region: "Aberdeenshire, North East Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 57.277,
    lon: -2.372,
    coordsVerified: false,
    species: [
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: "Wild brown trout on the Don"
      },
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      }
    ],
    best: "FishPal posts River Don updates through the season. Check the latest before going.",
    tidePref: null,
    baits: [],
    access: "Inverurie water is sold through FishPal. Check boundaries, parking and rules there or locally.",
    safety: null,
    sources: [
      "https://fishpal.com/Scotland/Don/Inverurie/",
      "https://albagamefishing.com/our-packages/wild-brown-trout-fishing-river-don-aberdeenshire/",
      "https://trout-salmon-fishing.com/scotland-river-don.htm"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-nith-dumfries",
    name: "River Nith, Dumfries Common Good water",
    region: "Dumfries and Galloway, South West Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 55.0702,
    lon: -3.6148,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: "Nith District conservation policy applies"
      },
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      },
      {
        id: "grayling",
        name: "Grayling",
        level: "common",
        note: "Separate grayling rules apply on this water"
      }
    ],
    best: "Sources give no timing detail. Read the council's current regulations before fishing.",
    tidePref: null,
    baits: [],
    access: "Dumfries Common Good fishing is run by Dumfries and Galloway Council. Permits are on FishPal, and the council's regulations, grayling rules and the Nith District conservation policy apply.",
    safety: null,
    sources: [
      "https://www.fishpal.com/Scotland/Nith/DumfriesBurgh/",
      "https://dumfriesandgalloway.gov.uk/publications/fishing-regulations-documents/dumfries-common-good-fishing-regulations-2024-including-grayling-rules-nith-district-conservation-policy",
      "https://trout-salmon-fishing.com/scotland-river-nith.htm",
      "https://www.seatrout-fishing.com/river-nith.htm"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-annan-hoddom",
    name: "River Annan at Hoddom",
    region: "Dumfries and Galloway, South West Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 55.0425,
    lon: -3.315,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      }
    ],
    best: "A river camera at Hoddom shows current conditions, so check it before travelling.",
    tidePref: null,
    baits: [],
    access: "Hoddom water is listed on FishPal, and Hoddom Castle lists fishing among its activities. Check permits and parking locally.",
    safety: null,
    sources: [
      "https://www.fishpal.com/scotland/annan/hoddom/",
      "https://www.seatrout-fishing.com/river-annan.htm",
      "https://scotlandstartshere.com//fishing/salmon-fishing/salmon-fishing-on-the-river-annan/",
      "https://farsondigitalwatercams.com/locations/hoddom",
      "https://www.hoddomcastle.co.uk/activities"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-earn-crieff",
    name: "River Earn at Crieff",
    region: "Perth and Kinross, Central Scotland",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 56.3665,
    lon: -3.844,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: "Written up as night fishing at Crieff"
      },
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: ""
      }
    ],
    best: "Sea trout fishing on the Earn at Crieff is written up as a night fishery.",
    tidePref: null,
    baits: [],
    access: "Crieff Angling Club water. Permits and the club's rules for anglers are on FishPal.",
    safety: null,
    sources: [
      "https://www.fishpal.com/Scotland/Tay/CrieffAnglingClub/",
      "https://seatrout-fishing.com/sea-trout-nights/on-the-earn-at-crieff/",
      "https://www.trout-salmon-fishing.com/scotland-river-earn.htm",
      "https://albagamefishing.com/our-packages/salmon-fishing-near-gleneagles/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-tummel-pitlochry",
    name: "River Tummel at Pitlochry",
    region: "Perth and Kinross (Highland Perthshire)",
    nation: "Scotland",
    kind: "river",
    subtype: "river",
    lat: 56.7005,
    lon: -3.734,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: ""
      },
      {
        id: "grayling",
        name: "Grayling",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "The Portnacraig beat at Pitlochry sells fishing through FishPal. Check other stretches and permits locally.",
    safety: null,
    sources: [
      "https://www.fishpal.com/scotland/tay/portnacraigpitlochry/",
      "https://albagamefishing.com/our-packages/salmon-fishing-river-tummel/",
      "https://albagamefishing.com/?p=8534",
      "https://www.crerarhotels.com/inspiration/blog/salmon-fishing-near-pitlochry/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "loch-lomond-balloch",
    name: "Loch Lomond, Balloch end",
    region: "West Dunbartonshire (Loch Lomond and the Trossachs)",
    nation: "Scotland",
    kind: "lake",
    subtype: "lake",
    lat: 56.017,
    lon: -4.596,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      }
    ],
    best: "The association posts weekly Lomond system news in season. Read it for current sport.",
    tidePref: null,
    baits: [],
    access: "Loch Lomond Angling Improvement Association (LLAIA) controls the fishing. Get its permit and check its rules before fishing.",
    safety: null,
    sources: [
      "https://www.lochlomondangling.com/?p=34",
      "https://visitscotland.com/info/see-do/loch-lomond-angling-improvement-association-p1500821",
      "https://www.trout-salmon-fishing.com/scotland-loch-lomond.htm",
      "https://www.seatrout-fishing.com/loch-lomond.htm",
      "https://www.cameronhouse.co.uk/blog/your-guide-to-fishing-in-loch-lomond/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "loch-leven-kinross",
    name: "Loch Leven, Kinross",
    region: "Perth and Kinross, Central Scotland",
    nation: "Scotland",
    kind: "lake",
    subtype: "lake",
    lat: 56.2035,
    lon: -3.416,
    coordsVerified: false,
    species: [
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: "Sources list it as trout fishing"
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Run by Loch Leven Fisheries at Kinross. Check booking, boats and rules locally.",
    safety: null,
    sources: [
      "https://trout-salmon-fishing.com/scotland-loch-leven.htm",
      "https://wanderlog.com/place/details/10275405/loch-leven-fisheries",
      "https://www.kinrosshouse.com/the-estate/sporting-pursuits/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "lake-of-menteith",
    name: "Lake of Menteith",
    region: "Stirling (Trossachs), Central Scotland",
    nation: "Scotland",
    kind: "lake",
    subtype: "lake",
    lat: 56.1795,
    lon: -4.2845,
    coordsVerified: false,
    species: [
      {
        id: "rainbow-trout",
        name: "Rainbow trout",
        level: "common",
        note: "Fly fishery"
      }
    ],
    best: "The season opens in March with an opening day event. Sources give no other timing detail.",
    tidePref: null,
    baits: [
      "flies"
    ],
    access: "Menteith Fisheries runs the fishing from Port of Menteith and offers fly fishing and boat handling tuition. Check booking and rules locally.",
    safety: null,
    sources: [
      "https://menteith-fisheries.co.uk/",
      "https://menteith-fisheries.co.uk/guiding-tuition/",
      "https://www.thescottishfarmer.co.uk/lifestyle/23362032.scenic-scottish-lake-casts-spell-anglers",
      "https://alynsmith.scot/2024/03/19/reel-fun-mp-attends-lake-of-menteith-opening-day/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "loch-ken",
    name: "Loch Ken",
    region: "Dumfries and Galloway, South West Scotland",
    nation: "Scotland",
    kind: "lake",
    subtype: "lake",
    lat: 55.0012,
    lon: -4.0698,
    coordsVerified: false,
    species: [
      {
        id: "pike",
        name: "Pike",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Check permits, bank access and parking locally.",
    safety: null,
    sources: [
      "https://toolkit.visitscotland.org/asset-page/106466-pike-fishing-on-loch-ken",
      "https://scotlandstartshere.com/point-of-interest/loch-ken/",
      "https://fishingmagic.com/forums/threads/all-information-on-pike-fishing-lochs-in-dumfries-and-galloway.390990/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-teifi-llandysul",
    name: "River Teifi at Llandysul",
    region: "Ceredigion, West Wales",
    nation: "Wales",
    kind: "river",
    subtype: "river",
    lat: 52.0402,
    lon: -4.3085,
    coordsVerified: false,
    species: [
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      },
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "seasonal",
        note: "Spring"
      }
    ],
    best: "Spring is written up as a good time for brown trout on the Teifi.",
    tidePref: null,
    baits: [],
    access: "Llandysul Angling Association water. Permits are sold through FishPal. Check rod licence, parking and rules locally.",
    safety: null,
    sources: [
      "https://www.fishpal.com/wales/welshrivers/llandysulanglingassociation/",
      "https://www.seatrout-fishing.com/river-teifi.htm",
      "https://fishingwales.net/spring-trouting-on-the-teifi/",
      "https://llandysul-ponttyweli.co.uk/supplier-details/Llandysul-Angling-Association"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-towy-llandeilo",
    name: "River Towy at Llandeilo",
    region: "Carmarthenshire, South West Wales",
    nation: "Wales",
    kind: "river",
    subtype: "river",
    lat: 51.8822,
    lon: -3.9925,
    coordsVerified: false,
    species: [
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: "Called sewin in Wales"
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Llandeilo Angling Association water, with stretches listed for booking on Fishing Passport. Check rod licence and rules locally.",
    safety: null,
    sources: [
      "https://fishingpassport.co.uk/fishing/towy/llandeilo",
      "https://fishingwales.net/fishing-locations/llandeilo-angling-association/",
      "https://mail.seatrout-fishing.com/river-towy.htm",
      "https://business.senedd.wales/documents/s38884/NRW%202015%20-%2062%20Llandeilo%20Angling%20Association%20Ltd.pdf"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-taff-cardiff",
    name: "River Taff, Bute Park, Cardiff",
    region: "Cardiff, South Wales",
    nation: "Wales",
    kind: "river",
    subtype: "river",
    lat: 51.4891,
    lon: -3.1898,
    coordsVerified: false,
    species: [
      {
        id: "barbel",
        name: "Barbel",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "City centre river through Bute Park. Check club permits, rod licence and rules locally.",
    safety: null,
    sources: [
      "https://fishingwales.net/barbel-fishing-in-wales/",
      "https://www.tapatalk.com/groups/barbelfishingworld/is-cardiff-unique-t3704.html",
      "https://bute-park.com/attraction/river-taff/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-conwy-llanrwst",
    name: "River Conwy at Llanrwst",
    region: "Conwy, North Wales",
    nation: "Wales",
    kind: "river",
    subtype: "river",
    lat: 53.1378,
    lon: -3.798,
    coordsVerified: false,
    species: [
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      },
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Natural Resources Wales publishes a yearly Know Your River report for the Conwy.",
    tidePref: null,
    baits: [],
    access: "Llanrwst Anglers Club water. Check tickets, rod licence and rules locally.",
    safety: null,
    sources: [
      "https://fishingwales.net/fishing-locations/llanrwst-anglers-club-river-conwy/",
      "https://fishingwales.net/fishing-clubs-of-wales-llanwrst-angling-club/",
      "https://www.seatrout-fishing.com/river-conway.htm",
      "https://cdn.cyfoethnaturiol.cymru/2k3d5chi/complete-accessible-conwy-kyr-2024.pdf"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "river-wye-builth-wells",
    name: "Rivers Wye and Irfon at Builth Wells",
    region: "Powys, Mid Wales",
    nation: "Wales",
    kind: "river",
    subtype: "river",
    lat: 52.1502,
    lon: -3.4038,
    coordsVerified: false,
    species: [
      {
        id: "grayling",
        name: "Grayling",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Groe Park and Irfon Angling Club has water at Builth Wells, including the River Irfon. Check tickets, rod licence and rules locally.",
    safety: null,
    sources: [
      "https://fishingwales.net/fishing-locations/groe-park-and-irfon-angling-club/",
      "https://fishingwales.net/fishing-locations/groe-park-and-irfon-angling-club-river-irfon/",
      "https://anglingtimes.co.uk/advice/fishing-lakes/where-to-fish-for-grayling"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "llyn-brenig",
    name: "Llyn Brenig",
    region: "Conwy and Denbighshire, North Wales",
    nation: "Wales",
    kind: "lake",
    subtype: "reservoir",
    lat: 53.086,
    lon: -3.543,
    coordsVerified: false,
    species: [
      {
        id: "rainbow-trout",
        name: "Rainbow trout",
        level: "common",
        note: "Sources list it as trout fishing"
      }
    ],
    best: "Sources give no best time. A half season permit covers January to June.",
    tidePref: null,
    baits: [],
    access: "Season permits and fishing boat hire, including afternoon sessions, are booked online through the Llyn Brenig visitor centre. Rhyl and St Asaph Anglers also have a Brenig page. Check rules locally.",
    safety: null,
    sources: [
      "https://widget.eola.co/940/7dbe6ee9-b0e1-4220-bcbe-f3ed9581efef/2cp3t",
      "https://eola.co/spotlight/llyn-brenig-visitor-centre",
      "https://www.rhylandstasaphanglers.co.uk/brenig",
      "https://fishingwales.net/fishing-locations/llyn-brenig/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "llyn-clywedog",
    name: "Llyn Clywedog",
    region: "Powys (near Llanidloes), Mid Wales",
    nation: "Wales",
    kind: "lake",
    subtype: "reservoir",
    lat: 52.478,
    lon: -3.623,
    coordsVerified: false,
    species: [
      {
        id: "rainbow-trout",
        name: "Rainbow trout",
        level: "common",
        note: "Sources describe trout fly and bank fishing"
      }
    ],
    best: "Bank fishing at the back end of the season (autumn) is written up as productive here.",
    tidePref: null,
    baits: [
      "flies"
    ],
    access: "A Natural Resources Wales rod licence is needed: anglers have been fined for fishing here without one. Llanidloes and District Angling Association is the local club. Check permits locally.",
    safety: null,
    sources: [
      "https://www.naturalresourceswales.gov.uk/about-us/news-and-blogs/news/five-men-fined-for-fishing-without-licences-at-clywedog-reservoir/?lang=en",
      "https://fishingwales.net/reservoir-bank-fishing-in-wales-back-end-bonanza",
      "https://flyfishingscience.co.uk/portfolio/llyn-clywedog/",
      "https://fishingwales.net/fishing-locations/llanidloes-district-angling-association/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "llangorse-lake",
    name: "Llangorse Lake (Llyn Syfaddan)",
    region: "Powys (Bannau Brycheiniog), Mid Wales",
    nation: "Wales",
    kind: "lake",
    subtype: "lake",
    lat: 51.934,
    lon: -3.264,
    coordsVerified: false,
    species: [
      {
        id: "pike",
        name: "Pike",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Check permits, rod licence, boat and bank access locally.",
    safety: null,
    sources: [
      "https://fishingwales.net/fishing-locations/llangorse-lake/",
      "https://fishingwales.net/?p=16341",
      "https://www.visitwales.com/things-do/adventure-and-activities/fishing/five-welsh-lakes-coarse-and-game-fishing",
      "https://bannaubrycheiniog.org/thingstodo/fishing/"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "lower-bann-portglenone",
    name: "Lower Bann at Portglenone (Glenone)",
    region: "County Antrim and County Londonderry (Lower Bann)",
    nation: "Northern Ireland",
    kind: "river",
    subtype: "river",
    lat: 54.8705,
    lon: -6.484,
    coordsVerified: false,
    species: [
      {
        id: "bream",
        name: "Bream",
        level: "common",
        note: ""
      },
      {
        id: "roach",
        name: "Roach",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Portglenone has hosted European coarse fishing championships.",
    tidePref: null,
    baits: [],
    access: "Mid Ulster lists the Glenone coarse angling facility here. Check rod licence and permit needs locally.",
    safety: null,
    sources: [
      "https://www.visitmidulster.com/things-to-do/glenone-coarse-angling-facility-p763931",
      "https://www.newsletter.co.uk/lifestyle/portglenone-preps-for-euro-coarse-fishing-championships-967393",
      "https://www.midulstercouncil.org/leisure/sport/angling-and-fishing"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-mourne-sion-mills",
    name: "River Mourne at Sion Mills",
    region: "County Tyrone (Foyle system)",
    nation: "Northern Ireland",
    kind: "river",
    subtype: "river",
    lat: 54.7845,
    lon: -7.474,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "The Mourne is part of the Foyle system, where Loughs Agency angling permits can be bought online. FishPal has Mourne fishing information. Check who controls each stretch and the licence you need.",
    safety: null,
    sources: [
      "https://afloat.ie/watersport/angling/item/49971-loughs-agency-angling-permits-now-available-online-for-foyle-system",
      "https://www.fishpal.com/Ireland/Mourne/whenandwheretofish.html",
      "https://www.travelextra.ie/fishing-in-irelands-county-tyrone"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "river-faughan",
    name: "River Faughan near Drumahoe",
    region: "County Londonderry (Foyle area)",
    nation: "Northern Ireland",
    kind: "river",
    subtype: "river",
    lat: 54.9861,
    lon: -7.2702,
    coordsVerified: false,
    species: [
      {
        id: "salmon",
        name: "Salmon",
        level: "common",
        note: ""
      },
      {
        id: "sea-trout",
        name: "Sea trout",
        level: "common",
        note: ""
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "River Faughan Anglers Ltd controls the fishing and publishes its rules and permits on FishPal. Check Loughs Agency licence needs locally.",
    safety: null,
    sources: [
      "https://www.fishpal.com/vendor/riverfaughananglersltd",
      "https://fishpal.com/Ireland/Faughan/Faughan-Cressebelle/"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
  {
    id: "lough-melvin-garrison",
    name: "Lough Melvin at Garrison",
    region: "County Fermanagh",
    nation: "Northern Ireland",
    kind: "lake",
    subtype: "lake",
    lat: 54.419,
    lon: -8.092,
    coordsVerified: false,
    species: [
      {
        id: "brown-trout",
        name: "Brown trout",
        level: "common",
        note: "Reported as trout; the lough holds open trout championships"
      }
    ],
    best: "Sources give no timing detail. Check locally.",
    tidePref: null,
    baits: [],
    access: "Fish from the Northern Ireland end at Garrison. The lough is shared with County Leitrim in the Republic. Check licence, permit and boat hire needs locally.",
    safety: null,
    sources: [
      "https://www.fishandfly.com/?p=5746",
      "https://afloat.ie/watersport/angling/item/23131-lough-melvin-crowns-four-time-open-trout-champ",
      "https://en.wikipedia.org/wiki/Lough_Melvin",
      "https://www.fisheriesireland.ie/sites/default/files/2023-02/fish_stock_survey_melvin_2021.pdf"
    ],
    verification: "verified",
    checked: "2026-10-31"
  },
  {
    id: "bristol-avon-claverton",
    name: "Bristol Avon at Claverton (Bathampton AA)",
    region: "Somerset, near Bath",
    nation: "England",
    kind: "river",
    subtype: "river",
    lat: 51.3786,
    lon: -2.3049,
    coordsVerified: false,
    species: [
      {
        id: "carp",
        name: "Carp",
        level: "occasional",
        note: "River-wide: a Bristol Avon carp caught on luncheon meat after dark was reported; not a record for this stretch"
      },
      {
        id: "barbel",
        name: "Barbel",
        level: "common",
        note: "River-wide: the Environment Agency has written about Bristol Avon barbel"
      }
    ],
    best: "The carp report was an after-dark capture. Sources found give no other timings, so check locally.",
    tidePref: null,
    baits: [
      "luncheon meat"
    ],
    access: "Bathampton Angling Association water: a club or day permit is needed (check the club). An Environment Agency rod licence is required.",
    safety: "Banks can be steep and slippery after rain.",
    sources: [
      "https://www.anglingtimes.co.uk/news/stories/rolling-meat-after-dark-fools-superb-bristol-avon-carp/",
      "https://www.gethooked.co.uk/fishing-venue/682/bathampton-angling-association-bristol-avon-claverton?page=18",
      "https://www.gov.uk/government/news/be-on-the-lookout-for-bristol-avons-blue-bellied-barbel"
    ],
    verification: "partial",
    checked: "2026-10-31"
  },
];
