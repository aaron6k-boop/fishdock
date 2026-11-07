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
    landmarks: { 223803033: "gorlestonLighthouse" },
    // across the harbour mouth: the bank north of the river is a low dune grown over with marram grass (photographs),
    // kept clear of the road and the buildings behind it
    dunes: (x, z) => z < -85 && z > -175 && x > -140 && x < 80,
    // beyond the mapped square, north of the harbour mouth: the South Denes port and industrial estate (low sheds)
    industry: (x, z) => z < -120 && x > -450,
    // the town round the harbour mouth (photographs from the pier, the harbour and Pier Road): Victorian and Edwardian
    // houses and hotels, most of them painted render in white and cream, three storeys and more, some brick
    town: { render: 0.68, tall: true },
    note: "The lighthouse, lamps and fences at Gorleston are modelled from photographs; their sizes are estimates.",
  },
};
export const localFor = (id) => LOCAL[id] || null;

