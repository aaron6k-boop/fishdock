// sceneRecordings: the real recordings under the drawn sound (src/lib/sceneRecordings.js)
import test from "node:test";
import assert from "node:assert/strict";
import { statSync, readFileSync } from "node:fs";
import { RECORDINGS, recordedLevels, nextVoiceIn } from "../src/lib/sceneRecordings.js";
import { ambiencePlan } from "../src/lib/sceneAudio.js";

test("every recording the game asks for is in public/sounds, small enough to fetch on a phone, and registered", () => {
  let total = 0;
  const reg = JSON.parse(readFileSync(new URL("../source-assets/ASSET-LICENCES.json", import.meta.url), "utf8")).assets.filter((a) => a.id.startsWith("bigsoundbank:"));
  for (const n of RECORDINGS) {
    const st = statSync(new URL(`../public/sounds/${n}.mp3`, import.meta.url)); total += st.size;
    assert.ok(st.size > 5000, `${n}.mp3 is ${st.size} bytes`);
    assert.ok(reg.some((a) => a.use.includes(`public/sounds/${n}.mp3`)), `${n}.mp3 in the licence register`);
  }
  assert.ok(total < 7e6, `${(total / 1e6).toFixed(1)} MB in all`);
  for (const a of reg) assert.equal(a.licence, "CC0 1.0");
});

test("the sea: water lapping in a calm, the breaking sea taking over as the wind gets up", () => {
  const calm = recordedLevels(ambiencePlan({ kind: "sea", wind: 0.05, venue: "pier" }), { kind: "sea", wind: 0.05, venue: "pier" });
  const windy = recordedLevels(ambiencePlan({ kind: "sea", wind: 0.7, venue: "pier" }), { kind: "sea", wind: 0.7, venue: "pier" });
  assert.ok(calm.sea_lap > calm.sea_waves, JSON.stringify(calm));
  assert.ok(windy.sea_waves > windy.sea_lap, JSON.stringify(windy));
  assert.ok(windy.wind > calm.wind);
});

test("the harbour and its gulls at a pier or an estuary only, quieter after dark; rain only when it rains", () => {
  const c = { kind: "sea", wind: 0.3 };
  assert.ok(recordedLevels(ambiencePlan({ ...c, venue: "pier" }), { ...c, venue: "pier" }).harbour > 0);
  assert.equal(recordedLevels(ambiencePlan({ ...c, venue: "beach" }), { ...c, venue: "beach" }).harbour, 0);
  const day = recordedLevels(ambiencePlan({ ...c, venue: "pier" }), { ...c, venue: "pier" }).harbour, night = recordedLevels(ambiencePlan({ ...c, venue: "pier", night: 1 }), { ...c, venue: "pier", night: 1 }).harbour;
  assert.ok(night < day * 0.5);
  const dry = recordedLevels(ambiencePlan({ ...c, venue: "pier" }), { ...c, venue: "pier" });
  assert.equal(dry.rain_light + dry.rain_heavy, 0);
  const pour = recordedLevels(ambiencePlan({ ...c, venue: "pier", rain: 0.9 }), { ...c, venue: "pier", rain: 0.9 });
  assert.ok(pour.rain_heavy > pour.rain_light && pour.rain_heavy > 0);
});

test("a bed's next voice starts a second and a half before the last one ends", () => {
  assert.equal(nextVoiceIn(50, 0), 48.5);
  assert.equal(nextVoiceIn(50, 49.9), 0);
});
