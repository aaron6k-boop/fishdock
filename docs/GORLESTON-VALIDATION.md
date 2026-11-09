# Gorleston South Pier: the reconstruction checked against the real place

Written 9 November 2026 (overhaul stage 1). What was measured, against what, and what is still uncertain. The 3D
place is built from OpenStreetMap (`src/lib/world3d/osmPlace.js`, `realPlace.js`), so most of the footprint comes
from survey data rather than from anyone's memory; this note checks that data against aerial imagery and photographs.

## Sources

- OpenStreetMap extract round 52.5721 N, 1.7383 E (ODbL): the coastline (which draws the pier as land), the
  `man_made=breakwater` area (the Outer Harbour breakwater), the lighthouse node and the Coastwatch Lookout Station way,
  the Pier Hotel, Pier Head toilets, shelters, the lifeboat station and the streets behind.
- Aerial imagery viewed in Bing Maps at zoom 18.3 (0.30 m a pixel, calibrated by moving the map a known 101.5 m):
  used only to measure, nothing copied from it.
- Geograph photographs (CC BY-SA, viewed on Wikimedia Commons): 1605191 (Coastwatch lookout from the pier, 2009),
  1605193 (the pier head), 433470 (the pier from the north side of the harbour mouth), 6234922 (looking back along
  the pier from the head), 6288139, 5946589, 5946610.
- Wikipedia, "Gorleston South Pier Lighthouse": the 1955 building, 8 m high, light 11 m above the water, white below
  and brick above, Fl R 3 s.

## Measurements

| Feature | Real (aerial / photo) | In FishDock (from the built layout) | Verdict |
|---|---|---|---|
| Pier arm width near the head | 23 m main deck, plus a lower apron on the south side further back | 21 m (z -10 to +11 at x -30..-10) | within 2 m; the south apron is missing |
| Pier head, north to south | about 41 m, rounded, bulging south of the arm's line | 39 m (z -11 to +27.7 at x 5..10), bulging south | matches |
| Head's east extent | rounded end | land to x = 20.7 m, rounded | matches |
| Lookout building footprint | 13 m by 6.7 m (aerial) | 15 m by 6.5 m (OSM way 223803033), its east corner on the lighthouse node | matches to a metre |
| Lookout height and form | two storeys, white lower, brick upper with a continuous window band, roof rail, masts | landmarks3d.js: 3.25 m ground storey, slab, 3.0 m lookout storey with the window band and the black Coastwatch plate, roof rail, mast | matches the photographs |
| River-side wall | rusted steel sheet piling under a concrete cap, tubular railing on top | sheet piling, cap, galvanised tube railing | matches |
| Pier deck | concrete, with yellow line along it (6234922) | photographed concrete, yellow line | matches |
| Opposite side | Great Yarmouth's north pier, timber landing stage (433470) | OSM pier line 224208346 (290 m, curved) drawn as a timber jetty | plausible; its construction is uncertain |
| Shore south of the pier | beach, then the promenade and the town | beach, dune line, town from building footprints | the dune's look is a work in progress (branch graphics-2) |

## Not yet right, or not known

- **The south-side apron**: the aerial shows a lower, angled platform along the south side of the arm, west of the
  head, where anglers also fish. It is not in OSM and not in the model. Needs a measured footprint and its height
  above the deck (unknown).
- **Deck height above the water and the wall's height**: taken from the layout's defaults (GROUND.land 2.2 m), not
  measured. The tide at Gorleston ranges about 2 m; the photographs suggest 3 to 4 m freeboard at mid tide.
- **Railing type by side**: 6234922 shows red-painted railings on the south side and grey on the river side, with
  a short timber-topped section at the landward end. The model has grey tube railings throughout.
- **Roof equipment on the lookout**: the light, fog signal and aerials are approximated (a mast and lanterns).
- **The north pier's construction** (timber versus steel and concrete) is not confirmed.

Nothing was invented to fill these gaps: where the data runs out the model stays plain rather than guessing at
cliffs, lighthouses or landmarks that are not there.
