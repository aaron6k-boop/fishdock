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
      credit: { by: "habiloid", licence: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Gorleston_South_Pier_-_geograph.org.uk_-_6234922.jpg" } }],
    // none of the map's buildings are drawn in a generic style here (Aaron, 10 November 2026: the generated houses and
    // the shed across the river were not the real ones). The town is the two photographs above; the lighthouse and
    // coastwatch station on the pier is the one building modelled
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
    town: { render: 0.68, tall: true },
    // the ground the town stands on: the quay, Pier Gardens and the beach are low; from the foot of the grassy cliff
    // behind them it rises to Cliff Hill, Marine Parade and the old town, about 15 m up (approximate, from the map's
    // streets and photographs: no survey heights)
    hill: gorlestonHill,
    // (landmarks, above, also: the Pier Hotel; Pavilion Theatre: red brick and terracotta, copper roofs, four domed corner towers at its south end;
    // the bandstand in Pier Gardens; the Cliff Hotel on the cliff top)
    note: "The lighthouse, lamps, fences, the height of the cliff and the dune across the harbour mouth at Gorleston are modelled from photographs and descriptions; their sizes are estimates. The town is shown by two photographs of it; no other buildings are drawn.",
  },
};
export const localFor = (id) => LOCAL[id] || null;

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

