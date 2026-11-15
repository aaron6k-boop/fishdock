// The base maps (src/lib/mapBases.js): sharp on a high-density phone screen where the source is built for it, never
// asking for tiles deeper than the source has.
import test from "node:test";
import assert from "node:assert/strict";
import { BASES, baseTileOptions } from "../src/lib/mapBases.js";

const phone = { Browser: { retina: true } }, old = { Browser: { retina: false } };

test("the sea chart and the satellite photo are sharp on a phone's screen, one zoom deeper at half size", () => {
  for (const k of ["chart", "satellite"]) {
    const o = baseTileOptions(BASES[k], phone);
    assert.equal(o.detectRetina, true);
    // (Leaflet adds one to the zoom it asks for: so the deepest asked for is still the source's own deepest)
    assert.equal(o.maxNativeZoom + 1, BASES[k].maxNativeZoom, `${k} never asks past zoom ${BASES[k].maxNativeZoom}`);
  }
  assert.equal(BASES.chart.maxNativeZoom, 16, "Esri's ocean basemap stops at level 16");
});

test("OpenStreetMap's volunteer-run tiles are never multiplied; an ordinary screen gets ordinary tiles", () => {
  assert.equal(baseTileOptions(BASES.map, phone).detectRetina, false);
  for (const k of Object.keys(BASES)) { const o = baseTileOptions(BASES[k], old); assert.equal(o.detectRetina, false); if (BASES[k].maxNativeZoom) assert.equal(o.maxNativeZoom, BASES[k].maxNativeZoom); }
});

test("every base says whose it is; the sea chart says its depths aren't for navigation", () => {
  for (const b of Object.values(BASES)) assert.ok(b.attribution && b.label);
  assert.match(BASES.chart.attribution, /GEBCO/); assert.match(BASES.chart.attribution, /never for navigation/);
  assert.ok(!/[—–]/.test(BASES.chart.attribution), "no dashes in what users see");
});
