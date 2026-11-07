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
    // across the harbour mouth: the bank north of the river is a low dune grown over with marram grass (photographs),
    // kept clear of the road and the buildings behind it
    dunes: (x, z) => z < -85 && z > -175 && x > -140 && x < 80,
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
    note: "The lighthouse, lamps, fences, the Pier Hotel, Pavilion Theatre, bandstand, Cliff Hotel and the height of the cliff at Gorleston are modelled from photographs and descriptions; their sizes are estimates.",
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

