// ---- localDetail: what a documented mark looks like beyond its map outlines, taken from photographs ----
// OpenStreetMap gives the outlines (the pier, its walls and fences, the buildings); this adds what only photographs
// show: which fence stands where, the style of the lamps, and the one building every angler there knows. Sizes are
// estimates from photographs (the info panel says so). Nothing here moves a mapped outline.
// (No three.js here: the info panel reads the note before the 3D view loads. The builders are in landmarks3d.js.)

export const LOCAL = {
  // Gorleston South Pier (photographs: the pier from its landward gate, the lighthouse from the deck, an aerial view)
  "gorleston-south-pier": {
    // plain modern lighting columns along the pier (not Victorian lanterns)
    lamps: "column",
    // round the pier head by the lighthouse: grey vertical-bar railings; along the sea (south) side of the arm: a heavy
    // timber post-and-rail fence; along the river side: galvanised two-rail railings (the default)
    fence(x, z, nx, nz) { if (nz < -0.3) return "rail"; if (Math.hypot(x - 8, z - 12) < 24) return "bars"; return nz > 0.35 ? "timber" : "rail"; },
    // the lighthouse and coastwatch station (OSM way 223803033): built from photographs, not as a generic building
    landmarks: { 223803033: "gorlestonLighthouse", 182378351: "pierHotel", 182663241: "pavilion", 172370482: "bandstand", 223804728: "cliffHotel" },
    // the Gorleston riverside up the river from the pier (Quay Road and Riverside Road, the old brick lighthouse among
    // the houses), from a photograph taken on the pier 15 m from the mark: "View into the harbour from South Pier,
    // Gorleston-on-Sea" by Christopher Hilton, 8 October 2023, CC BY-SA 2.0 (Geograph 7618525, via Wikimedia Commons).
    // Lined up on the map by the lighthouse (bearing 274.9 from the camera) and the lifeboat station (323): 21.35 pixels
    // a degree, the picture's left edge at 263.5. The frontage's distances are read off the map.
    backdrop: [{ tex: "gorleston_riverside.webp", cam: [-8.7, -12.4], bearing0: 263.5, pxPerDeg: 21.35, px: [1600, 132], waterline: [107, 100],
      dist: [[263.5, 285], [275, 300], [290, 360], [305, 430], [323, 500], [338.5, 540]],
      credit: { by: "Christopher Hilton", licence: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:View_into_the_harbour_from_South_Pier,_Gorleston-on-Sea_-_geograph.org.uk_-_7618525.jpg" } },
    // and the town at the landward end of the pier (the Pier Hotel, the Pavilion Theatre, Pier Gardens and the houses on
    // the cliff top along Marine Parade), from "Gorleston South Pier" by habiloid, CC BY-SA 2.0 (Geograph 6234922, via
    // Wikimedia Commons), taken on the pier about 65 m from the mark. It is a dusk photograph: its colours have been
    // lifted to match the daylight one above (measured on the stretch of riverside both show), so the real lamps that
    // were lit that evening still show in it. Lined up by the Pier Hotel (bearing 246.1) and the old lighthouse (272.9):
    // 21.5 pixels a degree, left edge at 219.6. Distances from the map.
    { tex: "gorleston_pierhead.webp", cam: [61.5, -18.8], bearing0: 219.6, pxPerDeg: 21.5, px: [950, 91], waterline: [91, 95],
      dist: [[219.6, 520], [232, 520], [238, 300], [246, 250], [252, 250], [256, 320], [263.8, 320]],
      credit: { by: "habiloid", licence: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Gorleston_South_Pier_-_geograph.org.uk_-_6234922.jpg" } },
    // the lamps and lit windows of the whole town after dark: the bright points of that same dusk photograph, its full
    // width (round to bearing 312.6), hung just in front of the two sheets above
    { lights: "gorleston_town_lights.webp", cam: [61.5, -18.8], bearing0: 219.6, pxPerDeg: 21.5, px: [2000, 91], waterline: [91, 99.4],
      dist: [[219.6, 520], [232, 520], [238, 300], [246, 250], [252, 250], [256, 320], [263.8, 352], [273, 370], [286, 425], [300, 486], [312.6, 520]] },
    // across the river: the port's sheds and offices on the north bank, from "The River Yare seen from Gorleston South
    // Pier" by habiloid, CC BY-SA 2.0 (Geograph 6235518, via Wikimedia Commons), taken on the pier about 90 m west of the
    // mark at dusk on the same evening. Colours lifted to daylight by the same measure; the cranes and jack-up rigs moored
    // behind the sheds that day are cut away at the roofs. Lined up by the green light on the north pier's end (bearing
    // 65.6 from the camera, the map's seamark) at the same 21.5 pixels a degree, which puts the mapped sheds within a
    // degree or two of where the picture shows them: left edge at 346.1. Its own lamps light it after dark.
    { tex: "gorleston_northbank.webp", lights: "gorleston_northbank_lights.webp", cam: [-89.4, 3.2], bearing0: 346.1, pxPerDeg: 21.5, px: [1130, 114], waterline: [120, 120],
      dist: [[346.1, 250], [360, 245], [375, 270], [398.7, 270]],
      credit: { by: "habiloid", licence: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:The_River_Yare_seen_from_Gorleston_South_Pier_-_geograph.org.uk_-_6235518.jpg" } }],
    // none of the map's buildings are drawn in a generic style here (Aaron, 10 November 2026: the generated houses and
    // the shed across the river were not the real ones). The town is the two photographs above; the lighthouse and
    // coastwatch station on the pier is the one building modelled
    // (the same goes for the map's fences and garden walls: the pole fence mapped along the pier was being drawn as a
    // garden's close-boarded fence, a brown board wall down the deck. Aaron had it removed)
    generated: false,
    // across the harbour mouth: the bank north of the river is a low dune grown over with marram grass (photographs),
    // kept clear of the road and the buildings behind it
    // across the river is the port's South Denes estate: sheds, stores and tanks (the photographs from the pier and from
    // Gorleston's quay on Wikimedia Commons: Geograph 7618525, 6235518, 7615101, 6235530). Its buildings are drawn as
    // port sheds, not as houses
    sheds: (x, z) => z < -70,
    // (only at the harbour mouth, seaward of x -35: up the river from there the north bank is a low flat quay, brown
    // piling with grass on top, as Christopher Hilton's photograph from the pier shows (Geograph 7618525, bearing 338
    // from the camera meets that bank at about x -44). The dune used to run on to x -140 and hid the town behind it)
    dunes: (x, z) => z < -85 && z > -175 && x > -35 && x < 80,
    // (the pier-head photograph Aaron shared, John Ellis, April 2018: across the harbour mouth the dune is a tall bank, about 8 m, estimated)
    duneH: 8,
    // and along its foot a bank of dark granite boulders in the water, from the end of the north pier round to the sea
    rocks: (x, z) => z < -70 && z > -190 && x > -40 && x < 90,
    // beyond the mapped square, north of the harbour mouth: the South Denes port and industrial estate (low sheds)
    industry: (x, z) => z < -120 && x > -450,
    // the town round the harbour mouth (photographs from the pier, the harbour and Pier Road): Victorian and Edwardian
    // houses and hotels, most of them painted render in white and cream, three storeys and more, some brick
    town: { render: 0.68, tall: true, buff: 0.3 }, // (buff: pale "Suffolk white" gault brick, common in the Yarmouth area's Victorian building)
    // the ground the town stands on: the quay, Pier Gardens and the beach are low; from the foot of the grassy cliff
    // behind them it rises to Cliff Hill, Marine Parade and the old town, about 15 m up (approximate, from the map's
    // streets and photographs: no survey heights)
    hill: gorlestonHill,
    // where you can walk: the length of the pier, as far as its root at the quay (x -95, where the quay and Pier Gardens
    // begin). The town past it is the photographs above, taken on the pier 250 m and more from it: walked up to, a
    // photograph is flat and soft, so you see the buildings only from where they hold up (16 November 2026)
    walkArea: (x) => x > -95,
    // (landmarks, above, also: the Pier Hotel; Pavilion Theatre: red brick and terracotta, copper roofs, four domed corner towers at its south end;
    // the bandstand in Pier Gardens; the Cliff Hotel on the cliff top)
    note: "The lighthouse, lamps, fences, the height of the cliff and the dune across the harbour mouth at Gorleston are modelled from photographs and descriptions; their sizes are estimates. The town is shown by two photographs of it; no other buildings are drawn, and you can walk the pier but not on into the town.",
  },
  // Cromer Pier (photographs on Wikimedia Commons, 2008 to 2025: the pier from the beach and the cliff, along its deck,
  // its Pavilion Theatre and lifeboat station, and the town from the pier; their authors are listed in
  // docs/REFERENCE-PHOTOS.md). The pier (1901, Grade II listed) is "a short structure, on iron girders, with a small
  // pavilion with shaped roof at the sea end ... a modern lifeboat house immediately behind the pavilion" (its listing,
  // Historic England 1049005); the lifeboat station of 1999 at its end (Wikipedia, Cromer Lifeboat Station)
  "cromer-pier": {
    // an open pier: a timber deck on cast-iron columns over the beach and the sea (openPier.js), its outline OSM way
    // 29146061 (surface wood). The deck's height, 6 m over the sea at mid-tide, is an estimate from photographs
    pier: {
      open: true, id: 29146061,
      // where anglers fish: from the railings either side of the pier's main arm, between the shelters and the pavilion;
      // not on the slipway past the lifeboat station, nor by the gates at its root
      fishFrom: [[-27, 78], [-15, 84]], noFish: (x, z) => z < 66 || z > 96,
      // the deck slopes down to the promenade at its root, and the lifeboat's slipway runs down into the sea past the
      // station (from its doors at the deck to under the water: about 1 in 5, estimated)
      ramps: [{ a: [-45.6, 168], b: [-40.2, 147], ya: "land", yb: "deck" }, { a: [14.8, -44.8], b: [7.4, -17.1], ya: "under", yb: "deck" }],
      slip: (x, z) => (x - 4.3) * 0.307 + (z + 18.1) * -0.952 > -0.3,
    },
    // its buildings, each built from photographs on its own outline: the Pavilion Theatre, the lifeboat station, the
    // two domed kiosks at the gates, the glazed shelters on the deck, the Hotel de Paris on the cliff above the pier,
    // and the parish church's tower (48 m, the tallest in Norfolk: Norfolk Heritage Explorer, NHER 6475)
    landmarks: { 345723596: "cromerPavilion", 345720938: "cromerLifeboat", 1105720160: "cromerGates", 1105721360: "pierShelter", 1105721359: "pierShelter", 345720803: "hotelDeParis", 30047775: "cromerChurch" },
    // the town on the cliff: Victorian and Edwardian, most of it red brick, some painted render, three storeys and more
    town: { render: 0.3, tall: true, buff: 0.06 }, // (Cromer's brick is mostly red, with flint)
    // the cliff behind the promenade: the retaining walls along its foot (OSM), the town on top about 12 m up
    // (estimated: no survey heights)
    hill: cromerHill,
    note: "Cromer Pier's iron legs, its deck, railings and lamps, the Pavilion Theatre, the lifeboat station and its slipway, the Hotel de Paris and the church tower are modelled from photographs and descriptions; their sizes, the deck's height and the cliff's are estimates. The other buildings of the town are drawn in a general style from their outlines on the map.",
  },
  // Great Yarmouth's beach north of Britannia Pier (added 18 November 2026; photographs on Wikimedia Commons, 2005 to
  // 2026, their authors listed in docs/REFERENCE-PHOTOS.md). The pier (1901, about 250 m: Wikipedia) stands open on short
  // legs over a wide beach, only its far end reaching the sea at high water (the photographs), its outline OSM way
  // 37588977; the anglers on the sand 150 m north of it, by the water's edge
  "great-yarmouth-beach": {
    pier: { open: true, id: 37588977 },
    // its buildings, each on its own outline: the Britannia Theatre (1958), the amusement sheds along the deck, the
    // entrance on Marine Parade and the fair's stalls at the end (landmarksYarmouth.js)
    landmarks: { 175867380: "britanniaTheatre", 175867379: "britanniaShed", 175867381: "britanniaShed", 207940131: "britanniaEntrance", 638488925: "fairStall", 638488926: "fairStall", 638488927: "fairStall", 638488928: "fairStall", 638488932: "fairStall", 638488933: "fairStall", 638488939: "fairStall" },
    // a wide sandy beach, rising gently from the water to the promenade (realPlace.js beach): its sand a pale gold
    beach: { slope: 0.03, tint: [0.56, 0.46, 0.31] },
    // the town behind: Marine Parade's hotels and arcades, most of them painted white or cream (the photographs)
    town: { render: 0.65, buff: 0.3 },
    note: "Britannia Pier, its theatre, sheds and entrance are modelled from photographs and OpenStreetMap's outlines; their sizes and the beach's slope are estimates. The rest of the town is drawn from the map, not modelled building by building.",
  },
  // Lowestoft's South Pier (added 18 November 2026): the solid southern arm of the harbour mouth, about 400 m from the
  // beach out to its rounded head (OSM way 798430532, Wikipedia), the outer harbour to its north and the open sea and
  // the South Beach to its south. Anglers fish from both sides of its outer half
  // (photographs on Wikimedia Commons, 2005 to 2026, listed in docs/REFERENCE-PHOTOS.md: the pier along its length,
  // its head and light, the plaza at its root, the yacht club, the pavilion, the beach and its groynes)
  "lowestoft-south-pier": {
    town: { buff: 0.35 }, // (the pale "Suffolk white" gault brick of much of Lowestoft's Victorian building)
    pier: { fishFrom: [[0, -3], [12, 14]] },
    // its sides: plain concrete walls with a solid concrete parapet along both edges, not railings (the photographs
    // along the pier and from the beach)
    concrete: () => ({ h: 1.1, t: 0.45, tint: 0.92 }),
    fence: () => "none",
    // and rock armour in the sea along its south side by the root, where it meets the beach (the photographs from the
    // beach; not along the whole inner half of the pier, where no photograph shows them)
    rocks: (x, z) => z > 8 && x < -150 && x > -240,
    // the buildings at its root, each on its own outline: the South Pier Family Entertainment Centre, the Royal Norfolk
    // and Suffolk Yacht Club and the East Point Pavilion (landmarksLowestoft.js)
    landmarks: { 211742397: "southPierFEC", 1473914181: "yachtClub", 1065924544: "eastPointPavilion" },
    // the light towers on the two pier heads, which the map has no outline for: where the photographs put them, the
    // North Pier's lit green (the South Pier's is listed as discontinued)
    extras: [{ kind: "harbourLight", at: [72, 2] }, { kind: "harbourLight", at: [99, -62], lit: "green" }],
    note: "The South Pier's walls and parapets, its light, the North Pier's light, the entertainment centre, the yacht club and the East Point Pavilion are modelled from photographs and descriptions on OpenStreetMap's outlines; their sizes are estimates. The rest of the town is drawn from the map, not modelled building by building.",
  },
  // Whitby's piers (added 18 November 2026; photographs on Wikimedia Commons listed in docs/REFERENCE-PHOTOS.md). Two
  // sandstone piers guard the mouth of the Esk, the West Pier (1814, its lighthouse 1831) and the East Pier (1854, its
  // lighthouse 1855), each carried on another 150 m by an extension of 1912 to 1914: a timber deck on a timber frame over
  // a concrete base, with a beacon at its end, green on the west, red on the east (Wikipedia, Piers of Whitby). Casting
  // into the harbour entrance between the piers is banned, so the anglers here stand on the East Pier's seaward side
  // facing out to sea over the rocky ground under the East Cliff (the mark's sources)
  "whitby-piers": {
    pier: {
      fishFrom: [44, -32],
      // the extensions (OSM ways 288861504, west, and 162295173, east): open timber decks on their frames, not solid arms
      open: "trestle", id: [288861504, 162295173],
      // the decks' heights over the sea at mid-tide: the stone piers stand about 9 to 10 m above low water (Wikipedia),
      // so about 5 m at mid-tide (estimated); the extensions level with them (the photographs)
      heights: { 288861500: 5, 288861502: 5, 288861504: 4.8, 162295173: 4.8 },
    },
    // the stone piers: honey-coloured sandstone blocks, their walls leaning back as they rise, dark and weedy towards
    // the sea, white-painted railings along both sides (the photographs)
    // (kit: the stonework modelled in Blender and baked, source-assets/blender/build_whitby_stone.py; coping: the
    // edge's course of big stones, h tall, d deep, standing out over the wall's face and up from the deck)
    stone: { batter: 0.14, kit: "whitby", wallTile: 2.4, deckTile: 3.0, tint: 0xf6e4c4, deckTint: 0xe9e1d2, coping: { h: 0.42, d: 0.78, out: 0.12, up: 0.05 } },
    // (the West Pier's own lamps are modelled below; none of the usual ones along the stone piers' edges, and none on the
    // East Pier, where the photographs show none)
    pierLamps: false,
    railPaint: 0xf0efe8,
    // the East Pier has no railing along its seaward side, only the edge of its flags (where the anglers stand), and a
    // railing along its harbour side; the West Pier has them along both (the photographs)
    fence: (x, z) => (nearLine(x, z, WHITBY_EAST_SEAWARD) < 3 ? "none" : "rail"),
    // and rock armour heaped either side of the East Pier's root, where it meets the foot of the East Cliff
    rocks: (x, z) => x > 75 && z > 15 && z < 100,
    // the two lighthouses on the stone piers' heads and the beacons at the extensions' ends, on the map's points for
    // them; the Abbey's ruins on the map's outline of them (OSM way 98740802), up on the East Cliff (landmarksWhitby.js)
    extras: [
      { kind: "westPierLight", at: [-114.9, -192.4], r: 2.4 },
      { kind: "eastPierLight", at: [-46.9, -192.0], r: 2.2 },
      { kind: "pierBeacon", at: [-138.0, -348.3], colour: "green" },
      { kind: "pierBeacon", at: [-78.0, -334.0], colour: "red" },
      // (and the footbridges from the stone piers' heads to the extensions, walked over: the West Pier's timber one, the
      // East Pier Bridge of steel, 2020; OSM ways 288861501 and 840870516)
      { kind: "footbridge", at: [-139.2, -206.4], a: [-135.6, -204.1], b: [-142.8, -208.6], w: 2.4, deck: "timber", base: 4.9, walk: true },
      { kind: "footbridge", at: [-32.1, -202.4], a: [-44.5, -198.4], b: [-19.6, -206.3], w: 2.6, deck: "steel", base: 4.9, walk: true },
      // (the West Pier's lamps: a line down it 3 m in from its harbour side, from its root to the lighthouse)
      { kind: "lampRow", at: [-165, -40], base: 5, r: 0.5, line: [[-198.8, 56.8], [-163.1, -32.5], [-124.6, -125.5], [-105.2, -174.3]], inset: 3, every: 24, from: 12, side: -1 },
      { kind: "whitbyAbbey", at: [233, 308], ring: [[188.3, 312.3], [190.4, 293.5], [231.5, 299.8], [233.0, 288.0], [247.6, 289.9], [246.4, 302.0], [277.7, 304.7], [276.1, 324.7], [242.7, 320.9], [242.1, 327.5], [226.9, 326.0], [227.7, 317.2]] },
    ],
    // the ground: the East Cliff and the West Cliff at their surveyed heights (terrain3d.js: the Environment Agency's
    // LIDAR survey of the bare ground, Open Government Licence)
    terrain: "whitby",
    // (the cliffs' slopes are open grass and scrub, a few bushes: the usual scattering of trees on a bank read from the
    // piers as lollipops dotted over the East Cliff, which the photographs don't show)
    bankTrees: 0.15,
    // (the cliffs' own surface, realPlace.js: photoscanned grass on the slopes and photoscanned rock showing through on
    // the steep faces, laid from three sides)
    cliff: { grass: "grass_leafy", rock: "cliff_rock", grassTile: 2, rockTile: 4, rockTint: [0.17, 0.152, 0.125], rockFaces: [0.707, -0.707] }, // (rockFaces: the East Cliff faces the sea to the north-east; its slopes over the harbour are grassed)
    // St Mary's Church on its outline, at the top of the 199 Steps
    landmarks: { 158276579: "stMarys" },
    // the old town under the cliffs: brick, stone and painted render under red pantile roofs (the photographs from the
    // cliffs and the piers); up on the Abbey's headland, Cholmley House, the mansion and the farm are stone under slate
    town: { render: 0.4, clay: 0.75, buff: 0, stoneAt: (x, z) => (x > 100 && z > 280) || (x > 260 && z > 150) },
    note: "Whitby's piers, their lighthouses and beacons, the timber extensions, the Abbey's ruins and St Mary's Church are modelled from photographs and descriptions on OpenStreetMap's outlines; their sizes and the decks' heights are estimates. The cliffs stand at their surveyed heights (Environment Agency LIDAR, Open Government Licence). The rest of the town is drawn from the map, not modelled building by building.",
  },
};
export const localFor = (id) => LOCAL[id] || null;

// ---- Whitby's East Pier: its seaward edge (OSM way 288861500, the side facing the open sea), left without railings ----
const WHITBY_EAST_SEAWARD = [[-41.4, -197.1], [-28.2, -125.7], [-21.8, -117.5], [-4.0, -105.4], [61.4, -11.0], [99.6, 36.3]];
function nearLine(x, z, line) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ---- the cliff behind Cromer's promenade ----
// The foot of the slope (z for a given x, metres round the pier head), along the retaining walls at the back of the
// promenade (OpenStreetMap), and up to the cliff top over about 14 m: the town about 12 m above the promenade
// (estimated from photographs: no survey heights).
const CROMER_FOOT = [[-900, -40], [-700, 0], [-450, 72], [-300, 108], [-200, 158], [-143, 175], [-80, 197], [-50, 203], [-32, 222], [0, 245], [22, 262], [64, 292], [130, 330], [200, 352], [300, 410], [700, 560], [1200, 760]];
const lerpX = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, v0] = tab[i - 1], [x1, v1] = tab[i]; return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0); } return tab[tab.length - 1][1]; };
/** metres above the promenade's level at (x, z): 0 seaward of the cliff's foot */
export function cromerHill(x, z) {
  const d = z - lerpX(CROMER_FOOT, x); if (d <= 0) return 0;
  const t = Math.min(1, d / 14), s = t * t * (3 - 2 * t);
  return 12 * s;
}

// ---- the cliff behind Gorleston's sea front ----
// The foot of the slope (x for a given z, in metres round the pier head): along Pavilion Road and Quay Road, behind
// Pier Gardens, then the retaining walls behind the Lower Esplanade. West of it the ground climbs over about 50 m to
// the cliff top: about 15 m above the quay behind the beach, less to the north, where Cliff Hill comes down to Pier
// Walk and the river.
const FOOT = [[-1400, -440], [-400, -470], [-230, -470], [-100, -468], [0, -462], [60, -432], [160, -418], [290, -456], [400, -475], [600, -480], [1600, -410]];
const TOP = [[-1400, 0], [-900, 2], [-400, 3], [-230, 6], [-60, 11], [60, 15], [3000, 15]];
const lerpAt = (tab, z) => { if (z <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (z <= tab[i][0]) { const [z0, v0] = tab[i - 1], [z1, v1] = tab[i]; return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0); } return tab[tab.length - 1][1]; };
/** metres above the quay's level at (x, z): 0 east of the cliff's foot */
export function gorlestonHill(x, z) {
  const d = lerpAt(FOOT, z) - x; if (d <= 0) return 0;
  const t = Math.min(1, d / 50), s = t * t * (3 - 2 * t);
  return lerpAt(TOP, z) * s;
}

