// ---- leafletLoader: loads Leaflet only when a map is opened (as DetectDock lazy-loads its map) ----
// The phone-preview build swaps this file for a stub, because the artifact sandbox can't load map tiles.
// Leaflet's stylesheet is imported once in main.jsx, because CSS in a lazily loaded chunk isn't applied by esbuild.
import L from "leaflet";
export default L;
