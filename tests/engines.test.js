// ---- engine tests: astronomy, tides, BiteScore, rules, What Can I Catch Here, advisor, geo ----
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ASTRO from "../src/lib/astro.js";
import { tideModel, nearestPort } from "../src/lib/tides.js";
import { biteDay, band, bestWindows } from "../src/lib/bitescore.js";
import { rulesFor } from "../src/lib/rules.js";
import { catchHere, coastOf } from "../src/lib/catchhere.js";
import { buildAdvice, methodsFor } from "../src/lib/advisor.js";
import { nationAt, coarseCell, distanceKm } from "../src/lib/geo.js";
import { ukDayStart, fmtTime } from "../src/lib/time.js";
import { SPOTS } from "../src/data/spots.js";
import { SPECIES, speciesById } from "../src/data/species.js";
import { RIGS } from "../src/data/rigs.js";

const D = Date.UTC(2026, 9, 31); // Sat 31 Oct 2026, UK on GMT
const minutes = (a, b) => Math.abs(a - b) / 60000;

test("sunrise and sunset in London on 31 Oct 2026 are within a few minutes of the published times", () => {
  const s = ASTRO.sunDay(D, 51.5074, -0.1278);
  assert.ok(minutes(s.sunrise, Date.UTC(2026, 9, 31, 6, 54)) < 6, `sunrise ${fmtTime(s.sunrise)}`);
  assert.ok(minutes(s.sunset, Date.UTC(2026, 9, 31, 16, 35)) < 6, `sunset ${fmtTime(s.sunset)}`);
});

test("moon phases: new moon about 9 Nov 2026 and full moon about 24 Nov 2026", () => {
  assert.ok(ASTRO.moonIllum(Date.UTC(2026, 10, 9, 12)).fraction < 0.03);
  assert.ok(ASTRO.moonIllum(Date.UTC(2026, 10, 24, 12)).fraction > 0.97);
});

test("UK day start follows BST and GMT", () => {
  assert.equal(ukDayStart(Date.UTC(2026, 6, 1, 12)), Date.UTC(2026, 5, 30, 23)); // BST midnight is 23:00 UTC
  assert.equal(ukDayStart(Date.UTC(2026, 10, 1, 12)), Date.UTC(2026, 10, 1, 0));
});

test("tide estimate reproduces the published high waters it was calibrated on to within about 40 minutes", () => {
  const rows = JSON.parse(readFileSync(new URL("../research/tides-2026-10-31.json", import.meta.url), "utf8"));
  let worst = 0, n = 0;
  for (const r of rows) {
    const port = nearestPort(r.lat, r.lon, 1);
    if (!port || port.spreadH > 0.8) continue;
    const [y, m, d] = r.date.split("-").map(Number);
    const hws = ASTRO.highWaters(Date.UTC(y, m - 1, d) - 864e5, Date.UTC(y, m - 1, d) + 2 * 864e5, port.lon, port.li);
    for (const h of r.high_waters) {
      const [hh, mm] = h.time.split(":").map(Number);
      const t = Date.UTC(y, m - 1, d, hh, mm);
      const err = Math.min(...hws.map((x) => minutes(x, t)));
      worst = Math.max(worst, err); n++;
    }
  }
  assert.ok(n > 60, `checked ${n} high waters`);
  assert.ok(worst < 45, `worst error ${worst.toFixed(0)} min`);
});

test("official tide events take priority over the estimate and give heights", () => {
  const api = { source: "admiralty", station: { name: "Dover" }, events: [
    { type: "HighWater", t: "2026-10-31T01:47:00Z", heightM: 6.4 }, { type: "LowWater", t: "2026-10-31T09:11:00Z", heightM: 1.4 },
    { type: "HighWater", t: "2026-10-31T14:15:00Z", heightM: 6.2 }, { type: "LowWater", t: "2026-10-31T21:35:00Z", heightM: 1.7 } ] };
  const tm = tideModel({ lat: 51.12, lon: 1.31, kind: "sea" }, api, D);
  assert.equal(tm.source, "admiralty");
  assert.equal(tm.confidence, "high");
  assert.ok(Math.abs(tm.heightAt(Date.parse("2026-10-31T14:15:00Z")) - 6.2) < 0.01);
  assert.equal(tm.stateAt(Date.parse("2026-10-31T12:00:00Z")).flooding, true);
  const est = tideModel({ lat: 51.12, lon: 1.31, kind: "sea" }, { source: null }, D);
  assert.equal(est.source, "estimate");
  assert.equal(est.confidence, "low");
});

test("BiteScore stays within 0 to 100, marks the day's best windows, and lowers confidence without live data", () => {
  const spot = SPOTS.find((s) => s.kind === "sea");
  const sp = speciesById(spot.species[0].id);
  const tm = tideModel(spot, null, D);
  const day = biteDay({ place: spot, species: sp, dayStart: D, tide: tm, cond: null, now: D + 9 * 3600e3 });
  assert.equal(day.slots.length, 48);
  for (const s of day.slots) assert.ok(s.score >= 0 && s.score <= 100);
  assert.ok(day.windows.length >= 1 && day.windows.length <= 2);
  assert.equal(day.confidence, "low");
  assert.ok(day.missing.includes("weather"));
});

test("BiteScore follows species habits: wrasse by day, not at night", () => {
  const wrasse = SPECIES.find((s) => /wrasse/.test(s.id));
  if (!wrasse) return;
  const place = { lat: 50.33, lon: -4.2, kind: "sea", id: "t" };
  const day = biteDay({ place, species: wrasse, dayStart: Date.UTC(2026, 6, 15) - 3600e3, tide: null, cond: null });
  const noon = day.slots[25].f.light, midnight = day.slots[2].f.light;
  assert.ok(noon > midnight + 0.4, `light noon ${noon} night ${midnight}`);
});

test("out-of-season species are capped", () => {
  const sp = { id: "x", group: "coarse", peak: [7], present: [6, 7, 8] };
  const day = biteDay({ place: { lat: 52, lon: -1, kind: "lake" }, species: sp, dayStart: Date.UTC(2026, 0, 10), tide: null, cond: null });
  assert.ok(Math.max(...day.slots.map((s) => s.score)) <= 35);
});

test("bands and windows", () => {
  assert.equal(band(85).label, "Prime");
  assert.equal(band(10).label, "Poor");
  const slots = Array.from({ length: 48 }, (_, i) => ({ t: i * 1800e3 + 900e3, score: i >= 10 && i <= 13 ? 80 : 30 }));
  const w = bestWindows(slots);
  assert.equal(w.length, 1);
  assert.equal(w[0].start, 10 * 1800e3);
});

test("2026 bass rules: catch and release in February, retention in May, 42 cm", () => {
  const feb = rulesFor({ nation: "England", kind: "sea", date: Date.UTC(2026, 1, 15), speciesId: "bass" });
  assert.match(feb[0].title, /catch and release/i);
  const may = rulesFor({ nation: "England", kind: "sea", date: Date.UTC(2026, 4, 15), speciesId: "bass" });
  assert.match(may[0].title, /keep 3/);
  assert.match(may[0].text, /42 cm/);
});

test("coarse close season applies on English rivers, not lakes", () => {
  const river = rulesFor({ nation: "England", kind: "river", date: Date.UTC(2026, 3, 20), speciesId: "chub", place: { subtype: "river" } });
  assert.ok(river.some((r) => /close season/i.test(r.title)));
  const lake = rulesFor({ nation: "England", kind: "lake", date: Date.UTC(2026, 3, 20), speciesId: "carp", place: { subtype: "lake" } });
  assert.ok(!lake.some((r) => r.level === "danger"));
  assert.ok(lake.some((r) => /licence/i.test(r.title)));
});

test("What Can I Catch Here never calls a species common at a place with no records", () => {
  const custom = { id: "custom", lat: 54.2, lon: -9.9, kind: "sea", verified: false }; // off the west of Ireland: no marks nearby
  const list = catchHere(custom, 10);
  assert.ok(list.every((r) => r.level === "possible"));
  const spot = { ...SPOTS[0], verified: true };
  const own = catchHere(spot, 10);
  assert.ok(own.some((r) => r.level !== "possible"));
});

test("every species and rig referenced by spots and species exists", () => {
  const ids = new Set(SPECIES.map((s) => s.id)), rigs = new Set(RIGS.map((r) => r.id));
  for (const s of SPOTS) for (const x of s.species || []) assert.ok(ids.has(x.id), `${s.id} -> ${x.id}`);
  for (const s of SPECIES) for (const r of s.rigs || []) assert.ok(rigs.has(r), `${s.id} -> rig ${r}`);
});

test("the advisor builds a full recommendation from the database for each species", () => {
  for (const sp of SPECIES) {
    const place = sp.type === "fresh" ? { id: "t", lat: 52.6, lon: -1.1, kind: "river", subtype: "river", verified: false } : { id: "t", lat: 50.6, lon: -2.5, kind: "sea", subtype: "beach", verified: false };
    const a = buildAdvice({ place, species: sp, method: "auto", cond: { clarity: "coloured", sea: "rough" }, nation: "England", date: D });
    assert.ok(a, sp.id);
    assert.ok(methodsFor(sp, place).length > 0 || sp.methods?.length === 0, `${sp.id} has methods`);
    assert.ok(a.adjust.some((x) => /coloured|rough|strong/i.test(x.if)), `${sp.id} adapts`);
  }
});

test("nations and privacy rounding", () => {
  assert.equal(nationAt(51.5, -0.12), "England");
  assert.equal(nationAt(51.48, -3.18), "Wales");
  assert.equal(nationAt(55.95, -3.19), "Scotland");
  assert.equal(nationAt(54.6, -5.93), "Northern Ireland");
  const c = coarseCell(50.6123, -2.4567);
  assert.ok(distanceKm({ lat: 50.6123, lon: -2.4567 }, c) < 12);
  assert.ok(!String(c.label).includes("50.61"));
  assert.equal(coastOf(50.6, -2.5), "south");
});
