// ---- mapBases: the licensed base maps under FishDock's maps (MapView, SpotMapView), and their tile options ----
// (retina: on a phone's high-density screen, ask for the next zoom's tiles at half size, so the picture is as sharp as
// the screen; only on Esri's servers, which are built for it. OpenStreetMap's own tile servers are run by volunteers and
// ask apps not to multiply their load, so its street map stays at its normal detail. maxNativeZoom: the deepest tiles
// the source has; past it Leaflet enlarges them)
export const BASES = {
  map: { label: "Map", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery © Esri, Maxar, Earthstar Geographics", maxZoom: 19, maxNativeZoom: 19, retina: true },
  // (Esri's ocean basemap: the sea shaded by depth, the land in relief, with its labels on top. Round Great Britain and
  // Ireland its depths are OceanWise's to about 1:9,000 (zoom 16), elsewhere GEBCO's: modelled, never for navigation,
  // as GEBCO's terms say. Service details checked 15 November 2026: Ocean/World_Ocean_Base, levels 0 to 16)
  chart: { label: "Sea chart", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}", attribution: "Esri, Garmin, GEBCO, NOAA NGDC, and other contributors · depths modelled, never for navigation", maxZoom: 19, maxNativeZoom: 16, retina: true },
};
/** A base's Leaflet tile options, sharp on a high-density screen where the source allows it (L: Leaflet). */
export function baseTileOptions(b, L, extra = {}) {
  const retina = !!(b.retina && L?.Browser?.retina);
  return { attribution: b.attribution, maxZoom: b.maxZoom, ...(b.maxNativeZoom ? { maxNativeZoom: b.maxNativeZoom - (retina ? 1 : 0) } : {}), detectRetina: retina, ...extra };
}
