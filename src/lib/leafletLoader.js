// ---- leafletLoader: loads Leaflet only when a map is opened (as DetectDock lazy-loads its map) ----
// The phone-preview build swaps this file for a stub, because the artifact sandbox can't load map tiles.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default L;
