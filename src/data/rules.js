// ---- FishDock rules data: from /home/claude/research/reference.json (checked 2026-10-31) ----
// Data only; the engine is src/lib/rules.js. Facts were checked on official pages (GOV.UK, NRW, gov.scot, nidirect,
// IFCAs, legislation.gov.uk) unless a record says otherwise. Local byelaws can be stricter, so the app always links out.

export const RULES_CHECKED = "2026-10-31";

const EW_SOURCES = [
  "https://www.gov.uk/fishing-licences/buy-a-fishing-licence",
  "https://www.gov.uk/fishing-licences/when-you-need-a-licence",
  "https://www.gov.uk/fishing-licences/types-of-licences-and-rod-limits",
];

export const LICENCES = {
  "England": {
    needed: true,
    prices: [
      { label: "Trout and coarse (2 rods), 1 day", price: "£7.30" },
      { label: "8 days", price: "£14.70" },
      { label: "12 months", price: "£36.80" },
      { label: "12 months concession", price: "£24.50" },
      { label: "Trout and coarse (3 rods), 12 months", price: "£55.30" },
      { label: "Salmon and sea trout, 1 day", price: "£13.50" },
      { label: "Salmon and sea trout, 8 days", price: "£30.50" },
      { label: "Salmon and sea trout, 12 months", price: "£93.10" },
      { label: "Junior (13 to 16)", price: "free" },
    ],
    buy: "https://www.gov.uk/fishing-licences/buy-a-fishing-licence",
    note: "Anyone aged 13 or over needs an Environment Agency rod licence to fish for freshwater fish, trout, salmon, sea trout, smelt or eel, including on private waters. Under 13s need none; ages 13 to 16 need a free junior licence. Concessions (66 or over, or disabled) are on 12-month licences only. Sea fishing for sea species needs no licence. Fine for fishing without one: up to £2,500.",
    sources: [...EW_SOURCES, "https://anglingtrust.net/sea/getting-started-sea/"],
  },
  "Wales": {
    needed: true,
    prices: [
      { label: "Trout and coarse (2 rods), 1 day", price: "£7.30" },
      { label: "8 days", price: "£14.70" },
      { label: "12 months", price: "£36.80" },
      { label: "12 months concession", price: "£24.50" },
      { label: "Trout and coarse (3 rods), 12 months", price: "£55.30" },
      { label: "Salmon and sea trout, 1 day", price: "£13.50" },
      { label: "Salmon and sea trout, 8 days", price: "£30.50" },
      { label: "Salmon and sea trout, 12 months", price: "£93.10" },
      { label: "Junior (13 to 16)", price: "free" },
    ],
    buy: "https://www.gov.uk/fishing-licences/buy-a-fishing-licence",
    note: "Wales uses the same rod licences as England, bought through GOV.UK. Every salmon caught in Wales must be returned alive, and sea trout over 60 cm must be released on all rivers. Sea fishing for sea species needs no licence.",
    sources: [...EW_SOURCES, "https://naturalresources.wales/permits-and-permissions/buy-a-fishing-rod-licence?lang=en", "https://naturalresources.wales/guidance-and-advice/business-sectors/fisheries/angling-byelaws/minimum-fish-size-and-catch-limits/?lang=en"],
  },
  "Scotland": {
    needed: false,
    prices: [],
    buy: "https://www.gov.scot/policies/salmon-and-recreational-fisheries/recreational-fishing/",
    note: "No rod licence is needed, except in the Border Esk region, which needs an England and Wales licence. You need a permit or written permission from the owner of the fishing rights, and in Protection Order waters fishing without one is a criminal offence. No salmon fishing on Sundays.",
    sources: ["https://www.gov.scot/policies/salmon-and-recreational-fisheries/recreational-fishing/", "https://fms.scot/?p=5420"],
  },
  "Northern Ireland": {
    needed: true,
    prices: [
      { label: "DAERA game or coarse season (19 to 59)", price: "£17" },
      { label: "Juvenile (12 to 18)", price: "£2" },
      { label: "Concession (60 or over, or disabled)", price: "£5" },
      { label: "Game or coarse, 3 days", price: "£3.50" },
      { label: "Game or coarse, 14 days", price: "£9" },
    ],
    buy: "https://www.nidirect.gov.uk/articles/angling-licences-and-permits",
    note: "Freshwater fishing needs a rod licence and a permit or day ticket; GB and Republic of Ireland licences are not valid. In the DAERA area anyone over 12 needs a licence; in Loughs Agency areas (Foyle and Carlingford) every age does. Prices are as listed on nidirect in October 2026, which gives no effective year. Sea angling needs no licence unless you fish for salmon or sea trout.",
    sources: ["https://www.nidirect.gov.uk/articles/angling-licences-and-permits", "https://www.nidirect.gov.uk/articles/game-rod-licence-prices-daera", "https://www.nidirect.gov.uk/articles/coarse-rod-licence-prices-daera"],
  },
};

const CS_EW = ["https://www.gov.uk/freshwater-rod-fishing-rules/when-and-where-you-can-fish", "https://www.gov.uk/government/publications/environment-agency-rod-fishing-byelaws-full-national-byelaws-for-england", "https://anglingtrust.net/2025/03/17/coarse-close-season/"];

export const CLOSE_SEASONS = [
  {
    nation: "England", applies: "rivers", from: "03-15", to: "06-15",
    text: "Coarse fish close season on rivers, streams and drains, to protect spawning fish. It also covers most stillwater SSSIs, some canals and most of the Norfolk and Suffolk Broads. Breaches can bring a fine of up to £50,000.",
    exceptions: "Most stillwaters and most canals are open, though the fishery may close them. Eels can be fished all year where there is no coarse close season. Game fishing can continue, with methods that vary by region.",
    sources: CS_EW,
  },
  {
    nation: "Wales", applies: "rivers", from: "03-15", to: "06-15",
    text: "Coarse fish close season on rivers, streams and drains, to protect spawning fish. It also covers most stillwater SSSIs and some canals.",
    exceptions: "Most stillwaters and most canals are open, though the fishery may close them. Game fishing follows local byelaws.",
    sources: [...CS_EW, "https://naturalresources.wales/guidance-and-advice/business-sectors/fisheries/angling-byelaws/when-what-and-where-you-can-fish/sea-trout-open-seasons-and-method-restrictions?lang=en"],
  },
  {
    nation: "England", applies: "salmon", from: null, to: null,
    text: "Salmon seasons vary by river and region. Nationally, no salmon may be killed before 16 June; any caught must be released at once, using only artificial fly or lure before that date.",
    exceptions: "Some local byelaws set a later date.",
    sources: ["https://www.gov.uk/freshwater-rod-fishing-rules/when-and-where-you-can-fish", "https://www.gov.uk/government/collections/local-fishing-byelaws"],
  },
  {
    nation: "England", applies: "trout", from: null, to: null,
    text: "Brown trout close seasons on rivers vary by region, so check the regional byelaws.",
    exceptions: "Brown trout may be fished all year in fully enclosed stillwaters, and rainbow trout all year in any stillwater.",
    sources: ["https://www.gov.uk/freshwater-rod-fishing-rules/when-and-where-you-can-fish", "https://www.gov.uk/government/collections/local-fishing-byelaws"],
  },
  {
    nation: "Wales", applies: "salmon", from: null, to: null,
    text: "On most Welsh rivers the sea trout fly and spinning season runs 20 March to 17 October. All salmon caught in Wales must be returned.",
    exceptions: "Some west Wales rivers run 1 April to 17 October, Anglesey 1 May to 17 November, and the Llŷn Peninsula 1 May to 31 October. Bait fishing dates vary by river.",
    sources: ["https://naturalresources.wales/guidance-and-advice/business-sectors/fisheries/angling-byelaws/when-what-and-where-you-can-fish/sea-trout-open-seasons-and-method-restrictions?lang=en"],
  },
  {
    nation: "Scotland", applies: "trout", from: "10-07", to: "03-14",
    text: "Brown trout close season across Scotland, subject to local rules. There is no weekly close time.",
    exceptions: null,
    sources: ["https://www.gov.scot/policies/salmon-and-recreational-fisheries/recreational-fishing/"],
  },
  {
    nation: "Scotland", applies: "salmon", from: null, to: null,
    text: "Salmon and sea trout close times vary by district. Open periods include Tay 15 Jan to 15 Oct, Tweed 1 Feb to 30 Nov, Aberdeenshire Dee 1 Feb to 15 Oct, Spey 11 Feb to 30 Sep, Clyde and Leven 11 Feb to 31 Oct, and Forth 1 Feb to 31 Oct. No salmon fishing on Sundays, and catch and release is compulsory until 1 April.",
    exceptions: "Some rivers within a district differ, such as the Earn (1 Feb to 31 Oct). Rivers graded poor are catch and release all season. There is no coarse close season in Scotland.",
    sources: ["https://fms.scot/?p=5420", "https://www.gov.scot/policies/salmon-and-recreational-fisheries/conservation/"],
  },
  {
    nation: "Northern Ireland", applies: "salmon", from: null, to: null,
    text: "In the DAERA area the game season generally runs 1 March to the end of October. Catch and release of salmon is required by law in the DAERA area, except on Lough Melvin.",
    exceptions: "Lough Melvin 1 Feb to end Sep; Lough Erne system 1 Mar to end Sep; River Bush 1 Mar to 20 Oct; Foyle salmon 1 Apr to 20 Oct; Carlingford 1 Apr to 31 Oct. Coarse species generally have no close season.",
    sources: ["https://www.nidirect.gov.uk/articles/angling-regulations"],
  },
];

export const BASS_RULES = {
  minCm: 42, year: 2026,
  periods: [
    { from: "01-01", to: "01-31", rule: "retain", bag: null },
    { from: "02-01", to: "03-31", rule: "catch-and-release", bag: null },
    { from: "04-01", to: "12-31", rule: "retain", bag: 3 },
  ],
  text: "From 1 April to 31 December 2026 you may keep up to 3 bass per angler per day, shore or boat. From 1 February to 31 March, rod and line fishing is catch and release only. The 3-fish limit came into force on 27 February 2026 (SI 2026/105); in January 2026 the limit was 2, and the January 2027 limit is not yet set. Shore-caught bass cannot be sold. The 2027 rules are set each December.",
  sources: ["https://www.gov.uk/government/publications/bass-industry-guidance-2026", "https://www.legislation.gov.uk/uksi/2026/105/made", "https://www.legislation.gov.uk/eur/2020/123/article/10", "https://www.nw-ifca.gov.uk/news/bass-catch-limit-increase", "https://www.gov.wales/sites/default/files/publications/2026-01/bass-fishing-2026-guidance.pdf"],
  verification: "verified",
};

const MCRS = "https://anglingtrust.net/minimum-conservation-reference-sizes-mcrss/";

// cm is the highest legal size the Angling Trust found across IFCA districts, so following it complies everywhere.
export const MIN_SIZES = [
  { id: "bass", cm: 42, text: "42 cm nationally. The Angling Trust suggests keeping only fish over 48 cm.", source: "https://www.legislation.gov.uk/eur/2020/123/article/10" },
  { id: "cod", cm: 35, text: "35 cm in Kent and Essex and North West IFCA districts; sizes vary by district. The Angling Trust suggests 60 cm.", source: MCRS },
  { id: "whiting", cm: 27, text: "27 cm in Kent and Essex and North West IFCA districts; sizes vary by district.", source: MCRS },
  { id: "pollack", cm: 30, text: "30 cm in Kent and Essex and North West IFCA districts; sizes vary by district. The Angling Trust suggests 50 cm.", source: MCRS },
  { id: "coalfish", cm: 35, text: "35 cm in the North West IFCA district; sizes vary by district.", source: MCRS },
  { id: "mackerel", cm: 30, text: "30 cm in Kent and Essex north of 51°N; 20 cm south of 51°N and in the North West IFCA district.", source: MCRS },
  { id: "plaice", cm: 27, text: "27 cm in Kent and Essex and North West IFCA districts; sizes vary by district.", source: MCRS },
  { id: "dab", cm: 23, text: "Up to 23 cm, depending on district; 15 cm in North West IFCA and Cornwall.", source: MCRS },
  { id: "flounder", cm: 27, text: "Up to 27 cm, depending on district; 25 cm in North West IFCA and Cornwall.", source: MCRS },
  { id: "sole", cm: 24, text: "24 cm for Dover sole in Kent and Essex and North West IFCA districts.", source: MCRS },
  { id: "thick-lipped-mullet", cm: 42, text: "Varies widely: 20 cm in North West IFCA and Cornwall, up to 42 cm in some districts.", source: MCRS },
  { id: "black-bream", cm: 23, text: "23 cm in North West IFCA and Cornwall.", source: MCRS },
  { id: "conger", cm: 58, text: "58 cm in North West IFCA and Cornwall.", source: MCRS },
  { id: "ballan-wrasse", cm: 18, text: "Set in some districts only, up to 18 cm. The Angling Trust suggests returning wrasse under 30 cm.", source: MCRS },
  { id: "thornback-ray", cm: 45, text: "45 cm measured wing tip to wing tip, in the North West IFCA district.", source: MCRS },
  { id: "grayling", cm: 30, text: "England and Wales rivers: keep up to 2 a day, only between 30 and 38 cm.", source: "https://www.gov.uk/freshwater-rod-fishing-rules/fish-size-and-catch-limits" },
  { id: "brown-trout", cm: 23, text: "Wales: 23 cm minimum (21 cm in the Gwynedd district). Other areas set their own sizes.", source: "https://naturalresources.wales/guidance-and-advice/business-sectors/fisheries/angling-byelaws/minimum-fish-size-and-catch-limits/?lang=en" },
  { id: "sea-trout", cm: 23, text: "Wales: 23 cm minimum, and sea trout over 60 cm must be released.", source: "https://naturalresources.wales/guidance-and-advice/business-sectors/fisheries/angling-byelaws/minimum-fish-size-and-catch-limits/?lang=en" },
];

export const SAFETY = [
  { title: "Emergency at the coast", text: "Call 999 or 112 and ask for the Coastguard.", source: "https://rnli.org/safety/float" },
  { title: "Wear a lifejacket", text: "Wear one on rocks, piers, breakwaters and boats. The RNLI says many of the 41 anglers who died on the UK coast between 2019 and 2024 might have survived with one.", source: "https://rnli.org/safety/choose-your-activity/angling" },
  { title: "Tides and cut-off", text: "Check tide times and the forecast before you go, know when the tide turns, and leave plenty of time to get off rocks, sandbanks and causeways.", source: "https://rnli.org/news-and-media/2025/april/09/rnli-safety-warning-research-reveals-10m-people-in-danger-of-tidal-cut-off" },
  { title: "Rock and shore fishing", text: "Wear grippy footwear and carry a rope, a first-aid kit and more than one light at night. Watch for big waves, avoid fishing alone at night in remote spots, and tell someone where you are going.", source: "https://anglingtrust.net/sea/advice-for-anglers/sea-angling-safety-guidelines/" },
  { title: "A way to call for help", text: "Keep a charged phone in a waterproof pouch on you. Boat and remote anglers should consider a VHF radio or a Personal Locator Beacon.", source: "https://rnli.org/safety/choose-your-activity/angling" },
  { title: "If you fall in, float to live", text: "Don't thrash or swim hard. Lean back with your ears under water, control your breathing and float, then call for help or swim to safety. Cold water shock can happen below 15°C.", source: "https://rnli.org/safety/float" },
  { title: "Boats", text: "Carry lifejackets for everyone, a VHF, spare fuel, an anchor and rope, oars or a spare engine, a compass and first aid. Watch for sea mist, avoid shipping lanes, and don't overload the boat.", source: "https://anglingtrust.net/sea/advice-for-anglers/sea-angling-safety-guidelines/" },
  { title: "Overhead power lines", text: "Carbon rods conduct electricity and contact can kill. Look up, keep rods and poles at least 6 m from power lines, and carry rods level. If line snags on a power line, leave it and call 105.", source: "https://customer.nationalgrid.co.uk/advice-and-guidance/staying-safe/angling-safety" },
  { title: "River levels and floods", text: "Rivers rise fast after rain. Check river levels before you go, keep off undercut or slippery banks, and never wade in floodwater.", source: "https://check-for-flooding.service.gov.uk/river-and-sea-levels" },
  { title: "Weil's disease", text: "Cover cuts with waterproof plasters, wash your hands before eating, and don't drink untreated water. If you get flu-like symptoms after fishing, see a GP and mention the water contact.", source: "https://www.nhs.uk/conditions/leptospirosis/" },
  { title: "Hook injuries", text: "Only remove a hook yourself if it is shallow. Get medical help if it is deep or near a joint, tendon, artery or eye; a hook in the eye is an emergency. Keep tetanus jabs up to date.", source: "https://medlineplus.gov/ency/article/000055.htm" },
  { title: "Fish in distress", text: "Report dead or gasping fish, or pollution, to the Environment Agency incident line on 0800 80 70 60 (England).", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
];

export const CONSERVATION = [
  { title: "Tackle for release", text: "Use single barbless or crushed-barb hooks, actively fished lures, and line strong enough to land fish quickly. Keep fights short, especially in warm water.", source: "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/634689/Impact_of_catch_and_release_angling_practices_on_survival_of_salmon_-_summary.pdf" },
  { title: "Handling", text: "Keep fish in the water as much as you can and limit air time to a few seconds. Wet your hands, support the belly, and keep fingers away from the gills and eyes.", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
  { title: "Deep hooks", text: "Use forceps or a disgorger. If the hook is deep, cut the line close to it rather than dig.", source: "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/634689/Impact_of_catch_and_release_angling_practices_on_survival_of_salmon_-_summary.pdf" },
  { title: "Release", text: "Hold fish upright, facing into the current, and let go only once they swim off strongly. This can take several minutes.", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
  { title: "Hot weather", text: "Consider not fishing when river water is above about 19 to 21°C, or fish early when it is cooler.", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
  { title: "Deep-water fish", text: "Wreck pollack and cod suffer barotrauma and often die after release, so fish shallower if you plan to release them.", source: "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/634689/Impact_of_catch_and_release_angling_practices_on_survival_of_salmon_-_summary.pdf" },
  { title: "Nets, mats and keepnets", text: "Landing nets must have knotless, non-metal mesh in England and Wales. Use an unhooking mat, and avoid keepnets in hot weather. Keepnets must meet EA mesh and size rules.", source: "https://www.gov.uk/freshwater-rod-fishing-rules/tackle-you-can-use" },
  { title: "Lead weights", text: "In freshwater in England and Wales, lead is only allowed at 0.06 g or lighter (shot 14 to 8) or over 1 oz; anything in between must be non-toxic. Gaffs and tailers are banned.", source: "https://www.gov.uk/freshwater-rod-fishing-rules/tackle-you-can-use" },
  { title: "Eels go back", text: "In England and Wales every European eel must be returned alive, including in coastal waters. Conger are exempt.", source: "https://www.gov.uk/government/publications/environment-agency-rod-fishing-byelaws-full-national-byelaws-for-england" },
  { title: "Foul-hooked fish", text: "In England and Wales, fish hooked anywhere other than the mouth or throat must be released.", source: "https://www.gov.uk/government/publications/environment-agency-rod-fishing-byelaws-full-national-byelaws-for-england" },
  { title: "Never move fish", text: "Never move fish between waters or release pet fish into the wild; introductions need an EA permit. Bait fish may only be used in the water they came from, and crayfish may not be used as bait.", source: "https://www.gov.uk/guidance/permission-to-move-live-fish-to-or-from-a-fishery" },
  { title: "Check, Clean, Dry", text: "Check kit for mud, plants and animals, clean nets, waders and mats, and dry everything for as long as you can, because some invaders survive two weeks in damp kit.", source: "https://www.nonnativespecies.org/what-can-i-do/check-clean-dry/anglers" },
  { title: "Take your line home", text: "Take all line, hooks, packaging and lead home, and recycle old line through ANLRS bins in tackle shops. Don't leave bait waste, which rots and uses up oxygen.", source: "https://www.rspca.org.uk/AdviceAndWelfare/Litter/Fishing" },
  { title: "Tope must go back", text: "Rod-caught tope may not be landed in England, and landing is also banned in Scotland. Release them quickly.", source: "https://www.legislation.gov.uk/uksi/2008/691/made" },
  { title: "Protected sharks, skates and rays", text: "Return angel shark, common and white skate, porbeagle, spurdog and undulate ray. In Scotland it is illegal to land these and several others when rod-caught.", source: "https://www.legislation.gov.uk/ssi/2012/63/made" },
  { title: "Shad and gobies", text: "Allis and twaite shad must be returned. Giant and Couch's gobies must not be killed, taken or disturbed.", source: "https://www.cornwall-ifca.gov.uk/Recreational" },
  { title: "Bass nursery areas", text: "In listed estuaries and harbours, fishing for bass from a boat, or fishing from a boat for any sea fish with sandeel bait, is banned at set times of year. Bass may not be taken with fixed or drift nets.", source: "https://www.devonandsevernifca.gov.uk/enforcement-and-legislation/bass-compliance-direction/" },
  { title: "Bait gathering", text: "Size rules also apply to crabs, lobsters and molluscs gathered for bait, and some MCZs and harbours restrict bait digging. Check the local IFCA.", source: "https://www.devonandsevernifca.gov.uk/enforcement-and-legislation/minimum-conservation-reference-sizes/" },
];

export const EVIDENCE = [
  { factor: "Tide state", text: "Moving water carries food, and many coastal anglers favour the flood and the first of the ebb. The best phase depends on the mark; formal evidence is limited and species-specific.", source: "https://www.vliz.be/imisdocs/publications/ocrd/418049.pdf" },
  { factor: "Springs and neaps", text: "Spring tides come around new and full moon with bigger ranges and stronger flows; neaps come about a week later. Springs suit estuaries and storm beaches, neaps can suit fast rock marks.", source: "https://oceanservice.noaa.gov/facts/springtide.html" },
  { factor: "Dawn and dusk", text: "Many predators, including bass, pollack, perch, pike, zander and sea trout, feed more in low light. Wrasse and garfish feed by day. This is practitioner consensus.", source: null },
  { factor: "Air pressure", text: "Anglers often report better sport on falling pressure, but a 2020 pike tracking study found the link was not statistically significant. Treat it as a weak signal.", source: "https://static02.nmbu.no/mina/studier/moppgaver/2020-Roste.pdf" },
  { factor: "Water temperature", text: "Activity rises with temperature up to a limit, but warm water holds less oxygen. EA advice: consider not fishing for salmon, trout or grayling above 19°C, or big chub, barbel or pike above 21°C.", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
  { factor: "Summer oxygen", text: "Algae can strip oxygen overnight, so stillwater oxygen is often lowest at first light in hot weather.", source: "https://ifm.org.uk/wp-content/uploads/2025/08/Fishing-during-hot-weather.pdf" },
  { factor: "Water colour", text: "A little colour often helps bait anglers (cod, barbel, chub, eels). Clear water suits sight-feeding lure fish. Heavy weed or floodwater usually hurts.", source: null },
  { factor: "Onshore wind", text: "An onshore blow that builds surf stirs up food and colours the water, often bringing bass, cod and flatfish close for a day or two. On lakes, carp often follow a warm wind.", source: null },
  { factor: "After rain on rivers", text: "Rising, colouring water often sets barbel, chub and eels feeding, and spates draw salmon and sea trout upriver. The link is real but varies between rivers.", source: "https://openpolar.no/Record/crwiley:10.1111%2Ffme.12011" },
  { factor: "Moon and solunar tables", text: "Evidence is mixed and mostly not significant for catch rates. The moon matters on the coast mainly through spring and neap tides, so FishDock gives it little weight.", source: "https://ncseagrant.ncsu.edu/hooklinescience/how-does-the-moon-phase-affect-fish/" },
  { factor: "Season", text: "Irish bass monitoring found about 78% of sampled bass were caught May to September.", source: "https://www.fisheriesireland.ie/sites/default/files/2021-12/ifi-national-bass-programme-angler-data-report-2018-2020.pdf" },
];
