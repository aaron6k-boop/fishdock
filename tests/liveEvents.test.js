// The Live Fishing View's event logic (src/lib/liveEvents.js): one pure function of the events and a time, so the
// angler, viewers and replays all show the same thing; only shareable events and fields leave the phone.
import test from "node:test";
import assert from "node:assert/strict";
import { phaseAt, countsAt, toShareEvents, sceneEvents, notable, timelineRows, activityText, DUR } from "../src/lib/liveEvents.js";

const T = 1_800_000_000_000;
const ev = (type, s, data = {}) => ({ id: `ev_${type}_${s}`, type, t: T + s * 1000, data });

test("phase follows the events: cast, waiting, bite, fish on until landed, lost or a snag", () => {
  const evs = [ev("cast", 0), ev("bite", 60), ev("hooked", 62), ev("catch", 120, { species: "Cod", speciesId: "cod" })];
  const at = (s) => phaseAt(evs, T + s * 1000).phase;
  assert.equal(phaseAt([], T).phase, "idle");
  assert.equal(at(1), "cast");
  assert.equal(at(DUR.cast / 1000 + 1), "waiting");
  assert.equal(at(61), "bite");
  assert.equal(at(70), "hooked");
  assert.equal(at(110), "hooked", "fish on lasts until the angler says how it ended");
  assert.equal(at(121), "landing");
  assert.equal(at(140), "waiting");
  assert.equal(phaseAt([ev("hooked", 0), ev("lost", 30)], T + 31000).phase, "lost");
  assert.equal(phaseAt([ev("hooked", 0), ev("snag", 30)], T + 31000).phase, "missed");
  assert.equal(phaseAt([ev("hooked", 0), ev("bite", 10)], T + 11000).phase, "hooked", "a bite while playing a fish doesn't cancel it");
  assert.equal(phaseAt(evs, T + 70000, { status: "paused" }).phase, "paused");
  assert.equal(phaseAt([...evs, ev("end", 200)], T + 201000).phase, "ended");
});

test("counts, notable moments and the timeline", () => {
  const evs = [ev("cast", 0), ev("cast", 30), ev("bite", 60), ev("smartbite", 70, { kind: "run" }), ev("missed", 71), ev("hooked", 90), ev("lost", 95), ev("catch", 200)];
  assert.deepEqual(countsAt(evs), { casts: 2, bites: 1, alerts: 1, missed: 1, hooked: 1, lost: 1, catches: 1 }, "Smart Bite alerts aren't counted as bites");
  assert.deepEqual(countsAt(evs, T + 65000), { casts: 2, bites: 1, alerts: 0, missed: 0, hooked: 0, lost: 0, catches: 0 });
  assert.deepEqual(notable(evs).map((m) => m.label), ["First cast", "Bite", "Smart Bite alert (Beta)", "Missed bite", "Fish on", "Fish lost", "Landed"]);
  assert.equal(timelineRows(evs).filter((e) => e.type === "cast").length, 1, "only the first cast is listed");
  assert.match(activityText({ phase: "waiting" }, { who: "Aaron", target: "Cod" }), /Aaron is waiting for a bite \(fishing for cod\)/);
});

test("only shareable events and fields leave the phone; catches carry the species id and name", () => {
  const s = { startedAt: T, events: [ev("conditions", 0, { windKph: 20 }), ev("mark", 1, { label: "secret gully" }), ev("note", 2, { text: "x" }), ev("cast", 3),
    ev("catch", 4, { catchId: "catch_abc.1", species: "Cod", speciesId: "cod", lengthCm: 60, weightKg: 2.2, released: true, bait: "Lugworm", photo: true, notes: "by the pipe" })] };
  const out = toShareEvents(s);
  assert.deepEqual(out.map((e) => e.type), ["cast", "catch"]);
  assert.deepEqual(out[1].data, { species: "cod", name: "Cod", lengthCm: 60, weightKg: 2.2, released: true, bait: "Lugworm", photo: "catch_abc1" });
  assert.equal(JSON.stringify(out).includes("gully"), false);
  const sc = sceneEvents({ ...s, endedAt: T + 9000 });
  assert.deepEqual(sc.map((e) => e.type), ["start", "cast", "catch", "end"]);
  assert.equal(sc[2].data.species, "cod");
  assert.equal(sc[2].data.name, "Cod");
});
