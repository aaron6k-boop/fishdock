// ---- MapView: documented marks, depth shading and sea marks, plus the angler's private marks (only on this phone) ----
import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";

// Licensed layers only. Depth shading is coarse modelled bathymetry, not a chart: never for navigation.
export const BASES = {
  map: { label: "Map", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 },
  satellite: { label: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Imagery © Esri, Maxar, Earthstar Geographics", maxZoom: 19 },
};
export const OVERLAYS = {
  depth: { label: "Depth shading (EMODnet)", wms: "https://ows.emodnet-bathymetry.eu/wms", layers: "emodnet:mean_multicolour", attribution: "Bathymetry © EMODnet Bathymetry Consortium", opacity: 0.55, note: "Modelled seabed depth on a coarse grid (about 115 m). Shows broad channels, banks and drop-offs, not small features. Not for navigation." },
  seamarks: { label: "Sea marks (OpenSeaMap)", url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", attribution: "Sea marks © OpenSeaMap contributors", opacity: 1, note: "Buoys, beacons, harbour features. Community data." },
};

export default function MapView({ spots, marks = [], center, onPick, overlays, base = "map", onFail }) {
  const el = useRef(null), map = useRef(null), layers = useRef({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let L, cancelled = false;
    (async () => {
      try {
        L = (await import("../lib/leafletLoader.js")).default;
        if (!L?.map) throw new Error("no leaflet");
      } catch { if (!cancelled) { setFailed(true); onFail?.(); } return; }
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lon], 9);
      map.current = { L, m };
      L.control.zoom({ position: "bottomright" }).addTo(m);
      draw();
    })();
    return () => { cancelled = true; map.current?.m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const mm = map.current; if (!mm) return;
    const { L, m } = mm;
    for (const k of Object.keys(layers.current)) { m.removeLayer(layers.current[k]); delete layers.current[k]; }
    const b = BASES[base] || BASES.map;
    layers.current.base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: b.maxZoom, keepBuffer: 4 }).addTo(m);
    for (const k of overlays || []) {
      const o = OVERLAYS[k]; if (!o) continue;
      layers.current[k] = o.wms ? L.tileLayer.wms(o.wms, { layers: o.layers, format: "image/png", transparent: true, opacity: o.opacity, attribution: o.attribution }).addTo(m)
        : L.tileLayer(o.url, { opacity: o.opacity, attribution: o.attribution }).addTo(m);
    }
    const g = L.layerGroup();
    for (const s of spots) {
      const mk = L.circleMarker([s.lat, s.lon], { radius: 8, weight: 2, color: "#ffffff", fillColor: s.kind === "sea" ? "#3fb7e8" : "#45d3a0", fillOpacity: 0.95 });
      mk.bindTooltip(s.name + (s.coordsVerified === false ? " (approximate)" : ""));
      mk.on("click", () => onPick?.(s));
      g.addLayer(mk);
    }
    for (const p of marks) {
      const mk = L.circleMarker([p.lat, p.lon], { radius: 5, weight: 2, color: "#ffc861", fillColor: "#1b1f24", fillOpacity: 1 });
      mk.bindTooltip(`${p.label} (private)`);
      g.addLayer(mk);
    }
    layers.current.pins = g.addTo(m);
  }
  useEffect(() => { draw(); }, [spots, marks, overlays, base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { map.current?.m.setView([center.lat, center.lon], map.current.m.getZoom()); }, [center.lat, center.lon]);

  if (failed) return null;
  return (
    <div className="map-wrap">
      <div ref={el} className="map" role="application" aria-label="Map of fishing marks" />
      <button type="button" className="map-btn" onClick={() => map.current?.m.setView([center.lat, center.lon], 11)} aria-label="Centre on your place"><Icon name="locate" /></button>
    </div>
  );
}
