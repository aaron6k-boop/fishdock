// Haptics (src/lib/haptics.js): the patterns for each fishing moment, by species and size; the Vibration API's timings
// for each strength; what the phone can do (iPhone Safari can't vibrate); and the rules: settings, what to feel,
// battery saver, real trips only feeling what was recorded, no repeats after reconnecting, gaps and a minute's budget.
import test from "node:test";
import assert from "node:assert/strict";
import { patternFor, toVibration, hapticSupport, createHaptics, sizeClass, RECORDED, BUDGET_MS } from "../src/lib/haptics.js";

const total = (p) => p.reduce((a, x) => a + x.ms, 0);
const peak = (p) => Math.max(...p.map((x) => x.power));

function phone({ vibrate = true, ios = false, settings = {}, hidden = false, tapped = true } = {}) {
  const calls = []; let t = 1e6;
  const nav = { userAgent: ios ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" : "Mozilla/5.0 (Linux; Android 14)", userActivation: { hasBeenActive: tapped }, ...(vibrate ? { vibrate: (v) => { calls.push(v); return true; } } : {}) };
  const doc = { visibilityState: hidden ? "hidden" : "visible", body: null };
  const h = createHaptics({ nav, win: {}, doc, now: () => t, settings });
  return { h, calls, tick: (ms) => { t += ms; } };
}

test("bites feel like the fish: small light taps, medium a double pulse, large a stronger pattern; species have their own rhythm", () => {
  assert.equal(sizeClass({ lengthCm: 22 }), "small"); assert.equal(sizeClass({ lengthCm: 45 }), "medium"); assert.equal(sizeClass({ lengthCm: 70 }), "large");
  const small = patternFor("bite", { lengthCm: 20 }), med = patternFor("bite", { lengthCm: 45 }), large = patternFor("bite", { lengthCm: 80 });
  assert.ok(small.length <= 2 && peak(small) < 0.5, "one or two light taps");
  assert.equal(med.length, 2, "a double pulse");
  assert.ok(peak(large) > peak(med) && total(large) > total(med), "stronger and longer");
  const whiting = patternFor("bite", { species: "whiting" }), cod = patternFor("bite", { species: "cod" }), mackerel = patternFor("bite", { species: "mackerel" });
  assert.ok(total(whiting) < 40 && whiting.every((p) => p.sharp > 0.8), "whiting: gentle, quick taps");
  assert.ok(total(cod) > 150 && cod.every((p) => p.sharp < 0.3), "cod: heavier and slower");
  assert.ok(mackerel.length >= 3, "mackerel: rapid, irregular");
  const flat = patternFor("bite", { species: "plaice" }); assert.ok(peak(flat) <= 0.3, "flatfish: subtle");
  const ray = patternFor("pull", { species: "thornback-ray", tension: 1.3 }); assert.equal(ray.length, 1, "rays: one stronger pulse, not a buzz");
  const bassBurst = patternFor("pull", { species: "bass", surge: 0.95 }), bassSmall = patternFor("pull", { species: "bass", surge: 0.65 });
  assert.ok(total(bassBurst) > total(bassSmall) * 3, "bass: occasional powerful bursts");
  assert.ok(peak(patternFor("pull", { tension: 1.4 })) > peak(patternFor("pull", { tension: 0.5 })), "more tension, stronger");
  assert.notDeepEqual(patternFor("hooked"), patternFor("missed")); assert.ok(peak(patternFor("missed")) < peak(patternFor("hooked")), "a miss is softer than a strike");
  assert.notDeepEqual(patternFor("landed"), patternFor("lost"));
  assert.equal(patternFor("tap", { a: 0.005, b: 0 }), null, "a faint flicker of the tip isn't felt");
});

test("the Vibration API gets on/off timings; strength changes length and count, not motor power", () => {
  const p = patternFor("bite", { lengthCm: 45 });
  const n = toVibration(p, "normal"), s = toVibration(p, "subtle"), st = toVibration(p, "strong");
  assert.equal(n.length, 3); assert.ok(st[0] > n[0] && n[0] > s[0]);
  assert.deepEqual(toVibration(p, "off"), []);
  assert.ok(toVibration(patternFor("landed"), "normal").every((x) => x >= 10 && x <= 400));
});

test("what the phone can do: Android vibrates; iPhone Safari can't (no navigator.vibrate) and gets a visual pulse instead; a native app is used when present", () => {
  assert.equal(hapticSupport({ userAgent: "Android", vibrate() {} }, {}).kind, "vibration");
  assert.equal(hapticSupport({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" }, {}).kind, "none");
  assert.equal(hapticSupport({ userAgent: "Mozilla/5.0 (iPhone)", vibrate() {} }, {}).kind, "none", "even if something defines vibrate on iPhone, it isn't relied on");
  assert.equal(hapticSupport({ userAgent: "x" }, { FishDockNative: { haptics: { play() {} } } }).kind, "native");
  const { h, calls } = phone({ ios: true, vibrate: false });
  assert.equal(h.feel("bite", { lengthCm: 40 }).done, false, "nothing to vibrate (and no page to pulse in a test)");
  assert.equal(calls.length, 0);
});

test("the rules: off, what to feel, friends' activity, battery saver, the background, needing a tap first", () => {
  assert.equal(phone({ settings: { on: false } }).h.feel("bite").why, "off");
  assert.equal(phone({ settings: { strength: "off" } }).h.feel("bite").why, "off");
  assert.equal(phone({ settings: { scope: "bites" } }).h.feel("pull", { tension: 1 }).why, "not chosen");
  assert.equal(phone({ settings: { scope: "bites" } }).h.feel("bite").done, true);
  assert.equal(phone({ settings: { scope: "catches" } }).h.feel("landed").done, true);
  assert.equal(phone({ settings: { party: false } }).h.feel("friendHooked").why, "party off");
  assert.equal(phone({ settings: { saver: true } }).h.feel("tap", { a: 0.08 }).why, "battery saver");
  assert.equal(phone({ settings: { saver: true } }).h.feel("pull", { tension: 0.6 }).why, "battery saver");
  assert.equal(phone({ hidden: true }).h.feel("bite").why, "hidden");
  assert.equal(phone({ tapped: false }).h.feel("bite").why, "no tap yet");
});

test("a real trip only feels what someone recorded, never the taps and surges the animation fills in", () => {
  const { h } = phone();
  assert.equal(h.feel("pull", { real: true, tension: 1.2 }).why, "real trip: not recorded");
  assert.equal(h.feel("tap", { real: true, a: 0.09 }).why, "real trip: not recorded");
  assert.equal(h.feel("bite", { real: true }).why, "real trip: not recorded", "a bite drawn but not marked as logged");
  assert.equal(h.feel("bite", { real: true, recorded: true }).done, true);
  assert.ok(["pull", "tap", "run", "reel", "release", "splashdown"].every((n) => !RECORDED.has(n)));
});

test("no repeats after reconnecting, no buzzing: gaps between the same moment, and a minute's budget", () => {
  const { h, calls, tick } = phone();
  assert.equal(h.feel("landed", { key: "p1|s7|landed" }).done, true);
  tick(5000); assert.equal(h.feel("landed", { key: "p1|s7|landed" }).why, "already felt");
  assert.equal(h.feel("pull", { tension: 1 }).done, true);
  tick(300); assert.equal(h.feel("pull", { tension: 1 }).why, "too soon");
  // a long fight: pulls as often as allowed for a minute never add up to more than the budget
  let felt = 0; const before = calls.length;
  for (let i = 0; i < 60; i++) { tick(1250); if (h.feel("pull", { tension: 1.5, species: "cod" }).done) felt++; }
  const ms = calls.slice(before).flat().filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  assert.ok(ms <= BUDGET_MS.normal + 400, `${ms} ms of vibration in about a minute`);
  assert.ok(felt < 60, "some pulls are left out once the budget's used");
  // other anglers' activity is spaced out too
  const p = phone(); p.h.feel("friendHooked"); p.tick(2000); assert.equal(p.h.feel("friendHooked").why, "too soon");
});
