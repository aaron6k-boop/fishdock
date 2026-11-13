// ---- SpotMapView: the UK map of fishing spots for the virtual 3D game, with clustered, typed markers ----
// The same Leaflet (loaded only when the map opens, leafletLoader.js) and the same licensed base tiles as MapView.
// Markers are grouped by spotMap.js's clustering and redrawn as the map moves, only those in view, so the map stays
// quick however many spots there are. A tap on a group zooms in until it splits; a tap on a spot picks it. A green
// number on a marker or group: how many are fishing there in the game now (here: { spot id: n }).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BASES } from "./MapView.jsx";
import { clusterSpots, clusterType, expandZoom } from "../lib/spotMap.js";

// the UK and Ireland's coasts, with a little sea round them
export const UK_BOUNDS = [[49.8, -8.4], [59.2, 2.0]];

// ---- small line icons for each kind of spot (24 x 24, drawn in white on the marker's colour) ----
export const TYPE_GLYPH = {
  pier: "M3 9h18 M6 9v8 M12 9v8 M18 9v8 M3 19c2 1.2 3.5 1.2 5 0s3-1.2 4 0 3 1.2 4 0 3-1.2 5 0",
  beach: "M12 4a7 7 0 0 1 7 7H5a7 7 0 0 1 7-7z M12 11v7 M3 20c2-1.2 4-1.2 6 0s4 1.2 6 0 4-1.2 6 0",
  harbour: "M12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12 7.5V21 M8 11.5h8 M5 14.5a7 7 0 0 0 14 0",
  rocks: "M2.5 19.5l5-8 3 3.5 4-7.5 7 12z",
  estuary: "M3 4c4 1 5 4 7 7s5 5 11 5.5 M3 10c3 .5 4 2.5 5.5 5S12 19 16 20",
  river: "M6 3c4 3-2 6 2 9s-2 6 2 9 M14 3c4 3-2 6 2 9s-2 6 2 9",
  lake: "M12 19c5 0 9-2.7 9-6.5S17 6 12 6 3 8.8 3 12.5 7 19 12 19z M8 12.5h3.5 M12.5 15h3.5",
};
const svg = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

const SpotMapView = forwardRef(function SpotMapView({ spots, selectedId = null, here = null, onPick, onFail, onMove }, ref) {
  const el = useRef(null), map = useRef(null), layer = useRef(null);
  const cb = useRef({}); cb.current = { onPick, onMove };
  const data = useRef({ spots, selectedId, here }); data.current = { spots, selectedId, here };
  const [failed, setFailed] = useState(false), [noTiles, setNoTiles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let L;
      try { L = (await import("../lib/leafletLoader.js")).default; if (!L?.map) throw new Error("no leaflet"); } catch { if (!cancelled) { setFailed(true); onFail?.(); } return; }
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true, minZoom: 4, maxZoom: 17, maxBounds: [[44, -20], [64, 12]], maxBoundsViscosity: 0.8, tap: true, zoomSnap: 0.5 });
      m.fitBounds(UK_BOUNDS, { padding: [8, 8] });
      L.control.zoom({ position: "bottomright" }).addTo(m);
      const b = BASES.map;
      // map pictures that can't load (offline, blocked) leave the spots usable, and say so
      let bad = 0, good = 0;
      L.tileLayer(b.url, { attribution: b.attribution, maxZoom: b.maxZoom, keepBuffer: 3, updateWhenIdle: true }).on("tileerror", () => { if (++bad >= 4 && !good && !cancelled) setNoTiles(true); }).on("tileload", () => { good++; if (!cancelled) setNoTiles(false); }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = { L, m };
      m.on("zoomend moveend", () => { draw(); cb.current.onMove?.({ zoom: m.getZoom() }); });
      draw();
    })();
    return () => { cancelled = true; map.current?.m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the markers: only the groups in view (with a margin), rebuilt as the map moves or the list changes ----
  function draw() {
    const mm = map.current; if (!mm || !layer.current) return;
    const { L, m } = mm, z = m.getZoom(), view = m.getBounds().pad(0.25), { spots: list, selectedId: sel, here: now } = data.current;
    const badge = (n) => (n ? `<i class="smk-now" aria-hidden="true">${n}</i>` : "");
    layer.current.clearLayers();
    for (const g of clusterSpots(list, Math.floor(z))) {
      if (!view.contains([g.lat, g.lon])) continue;
      if (g.spots.length === 1) {
        const s = g.spots[0], on = s.id === sel;
        const n = now?.[s.id] || 0;
        const icon = L.divIcon({ className: `smk t-${s.type}${on ? " on" : ""}${s.scene === "exact" ? " exact" : ""}${n ? " busy" : ""}`, html: `<span class="smk-in">${svg(TYPE_GLYPH[s.type] || TYPE_GLYPH.beach, on ? 18 : 15)}</span>${badge(n)}`, iconSize: on ? [42, 42] : [32, 32], iconAnchor: on ? [21, 21] : [16, 16] });
        const mk = L.marker([s.lat, s.lon], { icon, keyboard: true, title: n ? `${s.short}: ${n} fishing now` : s.short, alt: s.short, zIndexOffset: on ? 1000 : n ? 500 : 0, riseOnHover: true });
        mk.on("click", () => cb.current.onPick?.(s));
        layer.current.addLayer(mk);
      } else {
        const n = g.spots.length, size = n < 5 ? 38 : n < 15 ? 44 : 50, has = g.spots.some((s) => s.id === sel), busy = g.spots.reduce((a, s) => a + (now?.[s.id] || 0), 0);
        const icon = L.divIcon({ className: `smk-c t-${clusterType(g.spots)}${has ? " on" : ""}${busy ? " busy" : ""}`, html: `<span>${n}</span>${badge(busy)}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        const mk = L.marker([g.lat, g.lon], { icon, keyboard: true, title: `${n} spots${busy ? `, ${busy} fishing now` : ""}: zoom in`, alt: `${n} spots`, zIndexOffset: busy ? 500 : 0, riseOnHover: true });
        mk.on("click", () => { m.flyTo([g.lat, g.lon], expandZoom(g, z), { duration: 0.45 }); });
        layer.current.addLayer(mk);
      }
    }
  }
  useEffect(() => { draw(); }, [spots, selectedId, here]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Move to a spot, close enough to see where it is, keeping it above the card at the bottom. */
  const show = (s, zoom = 12) => { const mm = map.current; if (!mm) return; const z = Math.max(mm.m.getZoom(), zoom), p = mm.m.project([s.lat, s.lon], z).add([0, Math.round(mm.m.getSize().y * 0.2)]); mm.m.flyTo(mm.m.unproject(p, z), z, { duration: 0.5 }); };
  useImperativeHandle(ref, () => ({
    show,
    fit(list) { const mm = map.current; if (!mm || !list.length) return; if (list.length === 1) { show(list[0], 11); return; } mm.m.flyToBounds(list.map((s) => [s.lat, s.lon]), { padding: [40, 40], maxZoom: 11, duration: 0.5 }); },
    reset() { map.current?.m.flyToBounds(UK_BOUNDS, { padding: [8, 8], duration: 0.5 }); },
    get zoom() { return map.current?.m.getZoom() ?? null; },
  }), []);

  if (failed) return null;
  return (
    <>
      <div ref={el} className="smap-map" role="application" aria-label="Map of the UK's fishing spots: tap a marker for its card, tap a numbered group to zoom in" />
      {noTiles ? <p className="smap-tiles" role="status">The map pictures can't load just now. The spots still work: tap one, or use the list.</p> : null}
    </>
  );
});
export default SpotMapView;
