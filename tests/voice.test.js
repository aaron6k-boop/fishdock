// Proximity chat (src/lib/voice.js): voices are as loud as the angler is near, and come from their side.
import test from "node:test";
import assert from "node:assert/strict";
import { proximityOf, PROXIMITY, createVoice, micProblem } from "../src/lib/voice.js";

test("near anglers are heard fully, far ones fade to silence, smoothly", () => {
  const me = { x: 0, z: 0 };
  assert.equal(proximityOf(me, { x: 3, z: 0 }).near, 1, "side by side at the rail");
  assert.equal(proximityOf(me, { x: PROXIMITY.silent + 5, z: 0 }).near, 0, "right along the pier");
  const mid = proximityOf(me, { x: 17, z: 0 }).near; assert.ok(mid > 0.2 && mid < 0.8, `halfway: ${mid}`);
  let last = 1; for (let d = 0; d <= 35; d += 1) { const n = proximityOf(me, { x: d, z: 0 }).near; assert.ok(n <= last + 1e-9, "never louder further away"); last = n; }
  assert.deepEqual(proximityOf(null, { x: 1, z: 1 }), { near: 1, pan: 0 }, "no position: full volume");
});

test("someone to your right is in your right ear, behind or ahead is in the middle; it turns with you", () => {
  const me = { x: 0, z: 0 };
  assert.ok(proximityOf(me, { x: 5, z: 0 }, 0).pan > 0.5, "looking north, someone to the east is on the right");
  assert.ok(proximityOf(me, { x: -5, z: 0 }, 0).pan < -0.5);
  assert.ok(Math.abs(proximityOf(me, { x: 0, z: -8 }, 0).pan) < 0.01, "straight ahead");
  assert.ok(proximityOf(me, { x: 5, z: 0 }, Math.PI).pan < -0.5, "turn round and they're on your left");
});

// ---- the call set-up, with a stand-in for the browser's WebRTC (a real browser run is tests/e2e/together.mjs) ----
function fakeBrowser() {
  const made = [];
  class PC {
    constructor() { this.signalingState = "stable"; this.connectionState = "new"; this.senders = []; this.localDescription = null; made.push(this); }
    // (as browsers do: a change while an offer is being answered is negotiated by that answer, no event)
    addTrack(t) { this.senders.push(t); if (this.signalingState === "stable" && !this.remote) queueMicrotask(() => this.onnegotiationneeded?.()); }
    async setLocalDescription() { const type = this.signalingState === "have-remote-offer" ? "answer" : "offer"; this.localDescription = { type, sdp: `${type} audio x${this.senders.length}`, toJSON() { return { type: this.type, sdp: this.sdp }; } }; this.signalingState = type === "offer" ? "have-local-offer" : "stable"; }
    async setRemoteDescription(d) { this.remote = d; this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable"; }
    async addIceCandidate() { if (!this.remote) throw new Error("no remote description"); }
    close() { this.closed = true; }
  }
  globalThis.RTCPeerConnection = PC;
  globalThis.Audio = class { play() { return Promise.resolve(); } };
  globalThis.window = globalThis.window || {};
  const track = { enabled: true, stop() {} };
  Object.defineProperty(globalThis, "navigator", { value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } }, configurable: true });
  return made;
}
const flush = () => new Promise((r) => setTimeout(r, 5));

test("voice: of two people, only one starts the call, so two phones turning voice on together never both offer", async (t) => {
  const made = fakeBrowser();
  const sent = { a: [], b: [] };
  const a = createVoice({ me: "aaa", send: (m) => sent.a.push(m) }), b = createVoice({ me: "bbb", send: (m) => sent.b.push(m) });
  t.after(() => { a.leave(); b.leave(); });
  await a.join(["bbb"]); await b.join(["aaa"]);
  a.meet("bbb"); b.meet("aaa"); // each also hears the other turned voice on
  await flush();
  const offers = (s) => s.filter((m) => m.t === "signal" && m.data.sdp?.type === "offer");
  assert.equal(offers(sent.a).length, 0, "aaa sorts first, so aaa waits to be called");
  assert.equal(offers(sent.b).length, 1, "bbb calls, once");
  assert.ok(sent.a.some((m) => m.t === "signal" && m.to === "bbb" && m.data.call), "aaa asks to be called, in case bbb missed that aaa joined");
  // the offer reaches aaa, which answers with its microphone on the same line
  await a.signal("bbb", offers(sent.b)[0].data); await flush();
  const answer = sent.a.find((m) => m.t === "signal" && m.data.sdp?.type === "answer");
  assert.ok(answer, "aaa answers"); assert.equal(answer.data.sdp.sdp, "answer audio x1", "with its microphone");
  await b.signal("aaa", answer.data); await flush();
  assert.equal(offers(sent.a).length, 0, "and doesn't start a second negotiation of its own");
  assert.equal(made.filter((p) => !p.closed).length, 2, "one connection each");
  // a stray candidate from someone not in a call is ignored, not turned into a new call
  await a.signal("zzz", { ice: { candidate: "x" } });
  assert.equal(made.length, 2);

});

test("voice: a refused or missing microphone is explained in plain words", () => {
  assert.match(micProblem({ name: "NotAllowedError" }), /blocked.*allow the microphone.*Text chat still works/);
  assert.match(micProblem({ name: "NotFoundError" }), /No microphone was found/);
  assert.match(micProblem({ name: "NotReadableError" }), /busy/);
  assert.match(micProblem({ name: "unsupported" }), /can't do voice chat/);
  assert.match(micProblem(new Error("?")), /try again/);
  for (const n of ["NotAllowedError", "NotFoundError", "NotReadableError", "unsupported", ""]) assert.doesNotMatch(micProblem({ name: n }), /[–—]/, "no dashes");
});
