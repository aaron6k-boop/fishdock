// Calendar files (src/lib/ics.js), "in 3 h 10 min" wording, "here" for distances, and season words.
import test from "node:test";
import assert from "node:assert/strict";
import { icsEvent } from "../src/lib/ics.js";
import { hoursUntil } from "../src/lib/time.js";
import { fmtKm, setDistanceUnit } from "../src/lib/geo.js";
import { seasonWord } from "../src/lib/catchhere.js";
import { speciesById } from "../src/data/species.js";
import { tideWindows } from "../src/lib/tides.js";

test("ics: a valid VEVENT in UTC with escaping, a reminder and folded lines", () => {
  const start = Date.UTC(2026, 9, 31, 17, 30), end = Date.UTC(2026, 9, 31, 21, 0);
  const t = icsEvent({ title: "Fishing for cod at Cromer Pier", start, end, where: "Cromer Pier, Norfolk", notes: "Peak 88; bring squid, lug", now: Date.UTC(2026, 9, 31, 14) });
  assert.match(t, /^BEGIN:VCALENDAR\r\n/);
  assert.match(t, /\r\nDTSTART:20261031T173000Z\r\n/);
  assert.match(t, /\r\nDTEND:20261031T210000Z\r\n/);
  assert.match(t, /\r\nLOCATION:Cromer Pier\\, Norfolk\r\n/);
  assert.ok(t.includes("DESCRIPTION:Peak 88\\; bring squid\\, lug"), "commas and semicolons escaped");
  assert.match(t, /BEGIN:VALARM\r\nTRIGGER:-PT60M/);
  assert.match(t, /END:VCALENDAR\r\n$/);
  for (const line of t.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const long = icsEvent({ title: "x", start, end, notes: "A very long note ".repeat(20), now: start });
  assert.match(long, /\r\n [^\r]/, "long lines are folded with a leading space");
  assert.doesNotMatch(icsEvent({ title: "x", start, end, alarmMin: 0 }), /VALARM/);
});

test("time until: minutes, then hours and minutes", () => {
  const now = Date.UTC(2026, 9, 31, 14, 0);
  assert.equal(hoursUntil(now + 25 * 60e3, now), "25 min");
  assert.equal(hoursUntil(now + 192 * 60e3, now), "3 h 12 min");
  assert.equal(hoursUntil(now + 120 * 60e3, now), "2 h");
});

test("distance: 'here' for the place itself", () => {
  setDistanceUnit("mi");
  assert.equal(fmtKm(0), "here");
  assert.equal(fmtKm(0.02), "here");
  assert.equal(fmtKm(0.05), "50 yd");
});

test("season words for real species", () => {
  assert.equal(seasonWord(speciesById("cod")), "Winter");
  assert.equal(seasonWord(speciesById("mackerel")), "Summer");
  assert.equal(seasonWord({ peak: [], present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }), "All year");
  assert.equal(seasonWord({ peak: [5, 6, 7, 10, 11, 12], present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }), "Summer and winter");
  assert.equal(seasonWord(null), "");
});

test("tide windows: high water, the flood and the ebb as clock windows", () => {
  const H = 3600e3, t0 = Date.UTC(2026, 9, 31, 0);
  const tide = { events: [{ type: "LW", t: t0 + 3 * H }, { type: "HW", t: t0 + 9 * H }, { type: "LW", t: t0 + 15 * H }, { type: "HW", t: t0 + 21 * H }] };
  assert.deepEqual(tideWindows(tide, "high", t0, t0 + 24 * H).map((w) => [w.start - t0, w.end - t0].map((x) => x / H)), [[7, 11], [19, 23]]);
  assert.deepEqual(tideWindows(tide, "flood", t0, t0 + 24 * H).map((w) => [w.start - t0, w.end - t0].map((x) => x / H)), [[3, 9], [15, 21]]);
  assert.deepEqual(tideWindows(tide, "ebb", t0, t0 + 24 * H).map((w) => [w.start - t0, w.end - t0].map((x) => x / H)), [[9, 15]]);
  assert.deepEqual(tideWindows(tide, "moving", t0, t0 + 24 * H), []);
  assert.deepEqual(tideWindows(null, "high", t0, t0 + 24 * H), []);
  // only windows overlapping the range
  assert.equal(tideWindows(tide, "high", t0 + 12 * H, t0 + 24 * H).length, 1);
});
