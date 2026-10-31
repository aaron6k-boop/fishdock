// ---- MapView: documented marks, depth shading and sea marks, plus the angler's private marks and pins (only on this phone) ----
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store.js";
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

const PIN_SVG = '<svg viewBox="0 0 34 42" aria-hidden="true"><path d="M17 40S3 27 3 17a14 14 0 0 1 28 0c0 10-14 23-14 23z" fill="currentColor" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="17" r="5" fill="#fff"/></svg>';

/**
 * spots: documented marks (onPick on tap). marks: private session marks. pins: saved pins (onPickPin on tap).
 * dropped: the pin being placed ({ lat, lon } or null); with onDrag it can be dragged. onTap(lat, lon): a tap on
 * open map (not on a marker). focus: { lat, lon, zoom, key } moves the map whenever key changes.
 */
export default function MapView({ spots = [], marks = [], pins = [], dropped = null, center, zoom = 9, focus = null, onPick, onPickPin, onTap, onDrag, overlays, base = "map", onFail, hint, short = false, label = "Map of fishing marks" }) {
  const el = useRef(null), map = useRef(null), tiles = useRef({}), pinLayer = useRef(null), meLayer = useRef(null);
  const app = useApp();
  const [me, setMe] = useState(null); // where the phone is, shown on this map only and never sent anywhere
  const [locating, setLocating] = useState(false);
  const cb = useRef({});
  cb.current = { onPick, onPickPin, onTap, onDrag };
  const draw = useRef({}); // this render's draw functions, so the first draw after Leaflet loads uses the latest props
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let L, cancelled = false, tapTimer = 0;
    (async () => {
      try {
        L = (await import("../lib/leafletLoader.js")).default;
        if (!L?.map) throw new Error("no leaflet");
      } catch { if (!cancelled) { setFailed(true); onFail?.(); } return; }
      if (cancelled || !el.current) return;
      const start = focus || center;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lon], focus?.zoom || zoom);
      map.current = { L, m };
      L.control.zoom({ position: "bottomright" }).addTo(m);
      // A tap drops a pin; wait briefly so the first tap of a double-tap zoom doesn't.
      m.on("click", (e) => {
        if (!cb.current.onTap) return;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => cb.current.onTap?.({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) }), 280);
      });
      m.on("dblclick", () => clearTimeout(tapTimer));
      draw.current.tiles(); draw.current.pins();
    })();
    return () => { cancelled = true; clearTimeout(tapTimer); map.current?.m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function drawTiles() {
    const mm = map.current; if (!mm) return;
    const { L, m } = mm;
    for (const k of Object.keys(tiles.current)) { m.removeLayer(tiles.current[k]); delete tiles.current[k]; }
    const b = BASES[base] || BASES.map;
    tiles.current.base = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: b.maxZoom, keepBuffer: 4 }).addTo(m);
    for (const k of overlays || []) {
      const o = OVERLAYS[k]; if (!o) continue;
      tiles.current[k] = o.wms ? L.tileLayer.wms(o.wms, { layers: o.layers, format: "image/png", transparent: true, opacity: o.opacity, attribution: o.attribution }).addTo(m)
        : L.tileLayer(o.url, { opacity: o.opacity, attribution: o.attribution }).addTo(m);
    }
  }

  function drawPins() {
    const mm = map.current; if (!mm) return;
    const { L, m } = mm;
    if (pinLayer.current) m.removeLayer(pinLayer.current);
    const g = L.layerGroup();
    for (const s of spots) {
      const mk = L.circleMarker([s.lat, s.lon], { radius: 8, weight: 2, color: "#ffffff", fillColor: s.kind === "sea" ? "#3fb7e8" : "#45d3a0", fillOpacity: 0.95, bubblingMouseEvents: false });
      mk.bindTooltip(s.name + (s.coordsVerified === false ? " (approximate)" : ""));
      mk.on("click", () => cb.current.onPick?.(s));
      g.addLayer(mk);
    }
    for (const p of marks) {
      const mk = L.circleMarker([p.lat, p.lon], { radius: 5, weight: 2, color: "#ffc861", fillColor: "#1b1f24", fillOpacity: 1, bubblingMouseEvents: false });
      mk.bindTooltip(`${p.label} (private)`);
      g.addLayer(mk);
    }
    if (L.divIcon) {
      for (const p of pins) {
        if (dropped?.id && dropped.id === p.id) continue;
        const mk = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "fd-pin saved", html: PIN_SVG, iconSize: [26, 32], iconAnchor: [13, 31] }), keyboard: false, title: `${p.name} (your pin)` });
        mk.on("click", () => cb.current.onPickPin?.(p));
        g.addLayer(mk);
      }
      if (dropped) {
        const mk = L.marker([dropped.lat, dropped.lon], { icon: L.divIcon({ className: "fd-pin", html: PIN_SVG, iconSize: [34, 42], iconAnchor: [17, 41] }), draggable: !!cb.current.onDrag, keyboard: false, zIndexOffset: 1000, title: "Your pin" });
        mk.on("dragend", () => { const ll = mk.getLatLng(); cb.current.onDrag?.({ lat: +ll.lat.toFixed(5), lon: +ll.lng.toFixed(5) }); });
        g.addLayer(mk);
      }
    }
    pinLayer.current = g.addTo(m);
  }
  // ---- where am I: a blue dot with its accuracy circle ----
  function findMe() {
    if (!("geolocation" in navigator)) { app?.say?.("This browser can't share its location"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const pt = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.min(p.coords.accuracy || 0, 2000) };
        setMe(pt);
        map.current?.m.setView([pt.lat, pt.lon], Math.max(map.current.m.getZoom(), 14));
      },
      (e) => { setLocating(false); app?.say?.(e.code === 1 ? "Location is blocked. Allow it in your browser settings." : "Couldn't get a location fix"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 },
    );
  }
  useEffect(() => {
    const mm = map.current; if (!mm || !me) return;
    const { L, m } = mm;
    if (meLayer.current) m.removeLayer(meLayer.current);
    const g = L.layerGroup();
    if (me.acc > 15) g.addLayer(L.circle([me.lat, me.lon], { radius: me.acc, weight: 1, color: "#1d4ed8", fillColor: "#1d4ed8", fillOpacity: 0.1, interactive: false }));
    const dot = L.circleMarker([me.lat, me.lon], { radius: 8, weight: 4, color: "#ffffff", fillColor: "#1d4ed8", fillOpacity: 1, bubblingMouseEvents: false });
    dot.bindTooltip("You are here (only on this phone)");
    g.addLayer(L.circleMarker([me.lat, me.lon], { radius: 13, weight: 0, fillColor: "#1d4ed8", fillOpacity: 0.25, interactive: false }));
    g.addLayer(dot);
    meLayer.current = g.addTo(m);
  }, [me]);
  draw.current = { tiles: drawTiles, pins: drawPins };
  useEffect(() => { drawTiles(); }, [overlays, base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { drawPins(); }, [spots, marks, pins, dropped?.lat, dropped?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { map.current?.m.setView([center.lat, center.lon], map.current.m.getZoom()); }, [center.lat, center.lon]);
  useEffect(() => { if (focus && map.current) map.current.m.setView([focus.lat, focus.lon], focus.zoom || Math.max(map.current.m.getZoom(), 14)); }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  return (
    <div className="map-wrap">
      <div ref={el} className={`map${short ? " short" : ""}`} role="application" aria-label={label} />
      {hint ? <div className="map-hint" aria-hidden="true"><span>{hint}</span></div> : null}
      <button type="button" className={`map-btn${locating ? " busy" : ""}`} onClick={findMe} aria-label="Show where I am" title="Show where I am"><Icon name="locate" /></button>
      <button type="button" className="map-btn two" onClick={() => map.current?.m.setView([center.lat, center.lon], 11)} aria-label="Back to your fishing place" title="Back to your fishing place"><Icon name="pin" /></button>
    </div>
  );
}
