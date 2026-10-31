// Pins (src/lib/pins.js), distances in miles (src/lib/geo.js), month ranges (src/lib/time.js) and the generic "sea"
// habitat fix in What Can I Catch Here. Pure functions: no browser needed.
import test from "node:test";
import assert from "node:assert/strict";
import { parseCoords, inUk, makePin, savePin, removePin, placeFromPin, defaultPinName, nearestSpot, WATERS, MAX_PINS } from "../src/lib/pins.js";
import { fmtKm, setDistanceUnit, areaSize } from "../src/lib/geo.js";
import { monthsText } from "../src/lib/time.js";
import { catchHere } from "../src/lib/catchhere.js";

test("pins: reads positions as people paste them", () => {
  assert.deepEqual(parseCoords("52.5730, 1.7390"), { lat: 52.573, lon: 1.739 });
  assert.deepEqual(parseCoords("  50.6132 -2.4999 "), { lat: 50.6132, lon: -2.4999 });
  assert.deepEqual(parseCoords("50.6132N 2.4999W"), { lat: 50.6132, lon: -2.4999 });
  assert.deepEqual(parseCoords("2.4999W, 50.6132N"), { lat: 50.6132, lon: -2.4999 });
  assert.deepEqual(parseCoords("-2.4999, 50.6132"), { lat: 50.6132, lon: -2.4999 }, "clearly the wrong way round for the UK");
  assert.deepEqual(parseCoords(`50°36'47.5"N 2°29'59.6"W`), { lat: 50.61319, lon: -2.49989 });
  assert.deepEqual(parseCoords("https://www.google.com/maps/@52.5731,1.7392,17z"), { lat: 52.5731, lon: 1.7392 });
  assert.deepEqual(parseCoords("https://www.google.com/maps/search/?api=1&query=52.57305%2C1.73901"), { lat: 52.57305, lon: 1.73901 });
  assert.deepEqual(parseCoords("https://maps.google.com/?q=55.9533,-3.1883"), { lat: 55.9533, lon: -3.1883 });
  assert.deepEqual(parseCoords("https://www.google.com/maps/place/50%C2%B036'47.5%22N+2%C2%B029'59.6%22W/@50.61,-2.50,15z"), { lat: 50.61, lon: -2.5 });
  for (const junk of ["", "Gorleston", "SY 67 77", "999, 999", "0, 0", "52.57", null]) assert.equal(parseCoords(junk), null, String(junk));
});

test("pins: UK check", () => {
  assert.equal(inUk(52.57, 1.74), true);
  assert.equal(inUk(54.6, -5.9), true); // Belfast Lough
  assert.equal(inUk(49.45, -2.55), true); // Guernsey, generously
  assert.equal(inUk(48.85, 2.35), false); // Paris
  assert.equal(inUk(40.4, -3.7), false);
});

test("pins: a pin record, named after the nearest documented mark when it's close", () => {
  const now = Date.UTC(2026, 9, 31, 12);
  const p = makePin({ lat: 52.9311, lon: 1.30134, water: "pier", now });
  assert.equal(p.kind, "sea");
  assert.equal(p.subtype, "pier");
  assert.equal(p.nation, "England");
  assert.equal(p.name, "Pin near Cromer Pier");
  assert.match(p.id, /^pin-/);
  assert.equal(p.createdAt, now);
  assert.equal(makePin({ lat: 52.9, lon: 1.3, water: "swamp" }), null);
  assert.equal(makePin({ lat: "x", lon: 1.3, water: "river" }), null);
  // long names are capped, blank ones replaced, and positions kept to 5 places
  const q = makePin({ lat: 57.123456789, lon: -4.5, water: "river", name: "  A   very long name for a pool on a Highland river, too long  ", now });
  assert.equal(q.name.length, 40);
  assert.equal(q.lat, 57.12346);
  assert.equal(defaultPinName(58.5, -3.5), "Pinned spot");
  assert.ok(nearestSpot(52.93, 1.3).spot.id);
  // the freshwater kinds keep their own kind
  assert.deepEqual(WATERS.map((w) => w.kind), ["sea", "sea", "sea", "sea", "river", "lake", "canal", "fishery"]);
});

test("pins: save replaces by id, newest first, capped; remove; place", () => {
  const a = { id: "pin-a", name: "A" }, b = { id: "pin-b", name: "B" };
  let pins = savePin([], a);
  pins = savePin(pins, b);
  assert.deepEqual(pins.map((p) => p.id), ["pin-b", "pin-a"]);
  pins = savePin(pins, { ...a, name: "A2" });
  assert.deepEqual(pins.map((p) => p.name), ["A2", "B"]);
  assert.deepEqual(removePin(pins, "pin-a").map((p) => p.id), ["pin-b"]);
  assert.equal(savePin(Array.from({ length: MAX_PINS }, (_, i) => ({ id: `p${i}` })), { id: "new" }).length, MAX_PINS);
  assert.deepEqual(savePin(undefined, a), [a]);
  const p = makePin({ lat: 52.9311, lon: 1.30134, water: "beach" });
  assert.deepEqual(placeFromPin(p), { name: p.name, lat: p.lat, lon: p.lon, kind: "sea", subtype: "beach", nation: "England", pinId: p.id });
});

test("distances: miles by default, yards when close, km when chosen", () => {
  setDistanceUnit("mi");
  assert.equal(fmtKm(32), "20 mi");
  assert.equal(fmtKm(5), "3.1 mi");
  assert.equal(fmtKm(25, true), "16 miles");
  assert.equal(fmtKm(1.609344, true), "1 mile");
  assert.equal(fmtKm(0.2), "220 yd");
  assert.equal(fmtKm(null), "");
  assert.equal(areaSize(), "6 miles");
  setDistanceUnit("km");
  assert.equal(fmtKm(32), "32 km");
  assert.equal(fmtKm(5.04), "5 km");
  assert.equal(fmtKm(0.32), "320 m");
  assert.equal(areaSize(), "10 km");
  setDistanceUnit("anything else");
  assert.equal(fmtKm(32), "20 mi");
});

test("months as words", () => {
  assert.equal(monthsText([10, 11, 12, 1, 2]), "Oct to Feb");
  assert.equal(monthsText([6, 7, 8, 12]), "Jun to Aug and Dec");
  assert.equal(monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "all year");
  assert.equal(monthsText([3]), "Mar");
  assert.equal(monthsText([]), "");
});

test("catch here: a pin's sea habitat lists sea species, and a plain 'sea' no longer filters everything out", () => {
  const offNorfolk = { id: "pin", lat: 52.573, lon: 1.739, kind: "sea", verified: false };
  const pier = catchHere({ ...offNorfolk, subtype: "pier" }, 11);
  const plain = catchHere({ ...offNorfolk, subtype: "sea" }, 11);
  assert.ok(pier.some((r) => r.level === "possible"), "habitat matches for a pier");
  assert.ok(plain.filter((r) => r.level === "possible").length >= pier.filter((r) => r.level === "possible").length);
  assert.ok(plain.every((r) => r.species.type !== "fresh"));
  const river = catchHere({ id: "pin", lat: 52.05, lon: -2.72, kind: "river", subtype: "river", verified: false }, 7);
  assert.ok(river.length && river.every((r) => r.species.type !== "sea"));
});
