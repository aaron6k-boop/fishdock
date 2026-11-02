// ---- spots: the representative 3D places and where anglers stand in them (pure, no three.js) ----
// World units are metres. y is up and the water is at y = 0. Looking out to sea (or across the river or lake) is
// towards -z. Each kind of place has a layout: where the ground is and how high, and up to four fishing positions
// spaced so rods, people and tackle never overlap, each with the way it faces and where its line lands.

export const LAYOUTS = {
  // a stone harbour pier running out to sea: fish over either side or off the end
  pier: {
    label: "Representative pier",
    deck: 4.2, width: 9, from: 70, to: -48, // the deck: height, width, from the shore (z) to the end
    spots: [
      { id: 1, name: "Left side of the pier", at: [-3.6, 4.2, -6], face: -Math.PI / 2, cast: 26 },
      { id: 2, name: "Right side of the pier", at: [3.6, 4.2, -14], face: Math.PI / 2, cast: 26 },
      { id: 3, name: "Further along the pier", at: [-3.6, 4.2, -26], face: -Math.PI / 2, cast: 28 },
      { id: 4, name: "End of the pier", at: [0.5, 4.2, -46.2], face: 0, cast: 34 },
    ],
  },
  // a shelving sand and shingle beach: rods on tripods at the water's edge
  beach: {
    label: "Representative beach",
    deck: 0.9, shore: 0,
    spots: [
      { id: 1, name: "On the beach, left", at: [-12, 0.9, 6], face: 0, cast: 70 },
      { id: 2, name: "On the beach, right", at: [12, 0.9, 6], face: 0, cast: 70 },
      { id: 3, name: "Further along, left", at: [-36, 0.9, 6], face: 0, cast: 70 },
      { id: 4, name: "Further along, right", at: [36, 0.9, 6], face: 0, cast: 70 },
    ],
  },
  // an estuary or harbour quay: a wall above tidal water, the far bank across the channel
  estuary: {
    label: "Representative estuary quay",
    deck: 2.6, wall: 0, farBank: -170,
    spots: [
      { id: 1, name: "On the quay, left", at: [-9, 2.6, 1.2], face: 0, cast: 30 },
      { id: 2, name: "On the quay, right", at: [9, 2.6, 1.2], face: 0, cast: 30 },
      { id: 3, name: "Further along, left", at: [-27, 2.6, 1.2], face: 0, cast: 30 },
      { id: 4, name: "Further along, right", at: [27, 2.6, 1.2], face: 0, cast: 30 },
    ],
  },
  // a river bank: grass and trees, the far bank 40 m across, the current running left to right
  river: {
    label: "Representative river bank",
    deck: 0.7, bank: 0, farBank: -42,
    spots: [
      { id: 1, name: "On the bank, upstream", at: [-10, 0.7, 2.2], face: 0, cast: 14 },
      { id: 2, name: "On the bank, downstream", at: [10, 0.7, 2.2], face: 0, cast: 14 },
      { id: 3, name: "Further upstream", at: [-30, 0.7, 2.2], face: 0, cast: 14 },
      { id: 4, name: "Further downstream", at: [30, 0.7, 2.2], face: 0, cast: 14 },
    ],
  },
  // a lake or reservoir: a grassy bank and a wooden swim, trees round the far shore
  lake: {
    label: "Representative lake",
    deck: 0.6, bank: 0, farBank: -260,
    spots: [
      { id: 1, name: "Swim 1", at: [-11, 0.6, 2], face: 0, cast: 30 },
      { id: 2, name: "Swim 2", at: [11, 0.6, 2], face: 0, cast: 30 },
      { id: 3, name: "Swim 3", at: [-33, 0.6, 2], face: 0.05, cast: 30 },
      { id: 4, name: "Swim 4", at: [33, 0.6, 2], face: -0.05, cast: 30 },
    ],
  },
};
export const layoutFor = (venue) => LAYOUTS[venue] || LAYOUTS.pier;
export const MAX_ANGLERS = 4;

/** Which way a heading points: 0 is out to sea (-z), positive turns to the right (towards +x). */
export const dirOf = (face) => [Math.sin(face), -Math.cos(face)];

/** Where a spot's line lands: `cast` metres out the way it faces, on the water. */
export function castPoint(spot, dist = spot.cast) {
  const [dx, dz] = dirOf(spot.face);
  return [spot.at[0] + dx * dist, 0, spot.at[2] + dz * dist];
}

/** The spots for anglers in order of joining, or as the host assigned them (spot ids); never two in one spot. */
export function assignSpots(venue, anglers, wanted = {}) {
  const L = layoutFor(venue), free = new Set(L.spots.map((s) => s.id)), out = {};
  for (const a of anglers) { const w = wanted[a]; if (w && free.has(w)) { out[a] = w; free.delete(w); } }
  for (const a of anglers) { if (out[a]) continue; const s = [...free][0]; if (s == null) break; out[a] = s; free.delete(s); }
  return out;
}
export const spotById = (venue, id) => layoutFor(venue).spots.find((s) => s.id === id) || layoutFor(venue).spots[0];
