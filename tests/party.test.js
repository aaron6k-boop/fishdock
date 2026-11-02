// Fish Together (server/party.js): starting and joining parties, privacy of invitations, the rules for virtual and
// real events, host controls, chat, voice signalling, reconnecting, and the shared leaderboards.
import test from "node:test";
import assert from "node:assert/strict";
import { handleParty, PartyRoom, standings, validCode, makeCode, PARTY } from "../server/party.js";
import { setup, O, jpeg } from "./helpers/fishdock.js";
import { localPartyNamespace } from "./helpers/party.js";

function harness(t) {
  const s = setup();
  const P = localPartyNamespace(() => s.now());
  s.env.PARTY = P;
  const c = s.call(handleParty, "/api/party");
  // a member's socket that collects everything sent to it
  const sock = async (code, key) => {
    const got = []; const ws = { send: (t) => got.push(JSON.parse(t)), close: () => { ws.closed = true; } };
    const conn = await P.connect(code, key, ws);
    return conn && { ...conn, got, ws, last: (type) => [...got].reverse().find((m) => m.t === type) };
  };
  return { ...s, P, c, sock };
}
const start = (c, body = {}) => c("POST", "", { body: { mode: "virtual", venue: "pier", name: "Aaron", place: { label: "Norfolk coast" }, ...body } });

test("starting a party: a six-character code, a private link secret, and the host fishing at the first spot", async (t) => {
  const h = harness(t);
  const r = await start(h.c);
  assert.equal(r.status, 200, r.text);
  assert.ok(validCode(r.body.code)); assert.ok(r.body.secret.length >= 12); assert.ok(r.body.member.key.length >= 30);
  const me = await h.sock(r.body.code, r.body.member.key);
  const hello = me.last("hello");
  assert.equal(hello.party.mode, "virtual"); assert.equal(hello.party.venue, "pier"); assert.equal(hello.party.secret, r.body.secret, "the host sees the link secret");
  assert.equal(hello.members[0].name, "Aaron"); assert.equal(hello.members[0].spot, 1); assert.equal(hello.members[0].role, "host");
  // no coordinates anywhere: only the kind of place and the host's label
  assert.doesNotMatch(JSON.stringify(hello), /lat|lon|"pos"/);
  assert.equal(new Set(Array.from({ length: 200 }, makeCode)).size > 190, true);
  // without the Durable Object binding (the Pages set-up), it says so
  delete h.env.PARTY; assert.equal((await start(h.c)).status, 503);
});

test("joining: with the link, or the short code while the host allows it; never with a wrong or old secret", async (t) => {
  const h = harness(t);
  const { code, secret, member } = (await start(h.c)).body;
  assert.equal((await h.c("GET", `/${code}?s=wrong`)).status, 404);
  const pv = await h.c("GET", `/${code}?s=${secret}`);
  assert.equal(pv.status, 200); assert.equal(pv.body.party.host, "Aaron"); assert.equal(pv.body.party.spotsFree, 3);
  assert.equal((await h.c("GET", `/${code}?via=code`)).status, 200, "the short code works by default");
  const j = await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } });
  assert.equal(j.status, 200, j.text); assert.equal(j.body.role, "angler");
  const host = await h.sock(code, member.key);
  // the host turns the short code off and makes a new link: the old link and the code stop working
  await host.send({ t: "settings", codeOn: false }); await host.send({ t: "newLink" });
  const fresh = host.last("settings").secret;
  assert.notEqual(fresh, secret);
  assert.equal((await h.c("GET", `/${code}?via=code`)).status, 404);
  assert.equal((await h.c("POST", `/${code}/join`, { body: { secret, name: "Old link" } })).status, 404);
  assert.equal((await h.c("POST", `/${code}/join`, { body: { secret: fresh, name: "New link" } })).status, 200);
  // locked: nobody new, even with the link
  await host.send({ t: "settings", locked: true });
  assert.equal((await h.c("POST", `/${code}/join`, { body: { secret: fresh, name: "Late" } })).status, 403);
  // a code that was never made, and nonsense
  assert.equal((await h.c("GET", "/ZZZZZZ?via=code")).status, 404);
  assert.equal((await h.c("GET", "/nope")).status, 404);
});

test("four anglers at most, each at their own spot; a fifth watches; spectators don't fish", async (t) => {
  const h = harness(t);
  const { code, secret } = (await start(h.c, { venue: "beach" })).body;
  const roles = [];
  for (const n of ["B", "C", "D", "E"]) roles.push((await h.c("POST", `/${code}/join`, { body: { secret, name: n, role: "angler" } })).body);
  assert.deepEqual(roles.map((r) => r.role), ["angler", "angler", "angler", "spectator"]);
  const spec = await h.sock(code, roles[3].member.key);
  const spots = spec.last("hello").members.map((m) => m.spot).filter(Boolean);
  assert.deepEqual(spots.sort(), [1, 2, 3, 4]);
  await spec.send({ t: "event", ev: { type: "cast" } });
  assert.equal(spec.last("error").code, "not_angler");
});

test("virtual fishing follows the rules: no strike before a bite, no landing before a fish is on; catches are simulated", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c)).body;
  const me = await h.sock(code, member.key);
  const friend = await h.sock(code, (await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } })).body.member.key);
  await me.send({ t: "event", ev: { type: "catch", data: { species: "cod", lengthCm: 60 } } });
  assert.equal(me.last("error").code, "order", "no catch from nothing");
  for (const type of ["cast", "bite", "hooked"]) { h.tick(1000); await me.send({ t: "event", ev: { type, cid: `c-${type}` } }); }
  await me.send({ t: "event", ev: { type: "hooked", cid: "c-hooked" } }); // a resend after a dropped connection: not doubled
  h.tick(5000);
  await me.send({ t: "event", ev: { type: "catch", cid: "c-catch", data: { species: "bass", name: "Bass", lengthCm: 48, weightKg: 1.4, simulated: false } } });
  const evs = friend.got.filter((m) => m.t === "event").map((m) => m.ev);
  assert.deepEqual(evs.map((e) => e.type), ["cast", "bite", "hooked", "catch"], "the friend sees each step once, in order");
  assert.equal(evs[3].data.simulated, true, "a virtual catch is always simulated");
  assert.equal(evs[3].data.photo, null);
  assert.ok(evs.every((e) => e.who === me.member && e.seq > 0));
  // reactions to a catch go to everyone
  await friend.send({ t: "react", r: "nice", seq: evs[3].seq });
  assert.equal(me.last("react").r, "nice");
});

test("real fishing: people log what happened, a photo only from someone fishing, and nothing is marked simulated", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c, { mode: "real" })).body;
  const me = await h.sock(code, member.key);
  await me.send({ t: "presence", presence: "water" });
  assert.equal(me.last("members").members[0].presence, "water");
  const up = await h.c("POST", `/${code}/photo?m=${member.key}`, { body: undefined, headers: { "content-type": "image/jpeg" } });
  assert.equal(up.status, 400, "no photo, no upload");
  const req = new Request(`${O}/api/party/${code}/photo?m=${member.key}`, { method: "POST", headers: { "x-fishdock": "1", origin: O, "cf-connecting-ip": "203.0.113.5" }, body: jpeg() });
  const photo = await (await handleParty(req, h.env, h.now())).json();
  assert.ok(photo.photo);
  await me.send({ t: "event", ev: { type: "catch", data: { species: "cod", lengthCm: 61, photo: photo.photo } } });
  const ev = me.last("event").ev;
  assert.equal(ev.data.simulated, false); assert.equal(ev.data.photo, photo.photo);
  // a spectator can see the photo; someone without a key can't
  const spec = (await h.c("POST", `/${code}/join`, { body: { secret, name: "Mum", role: "spectator" } })).body.member;
  assert.equal((await h.c("GET", `/${code}/photo/${photo.photo}?m=${spec.key}`)).status, 200);
  assert.equal((await h.c("GET", `/${code}/photo/${photo.photo}?m=nope`)).status, 404);
});

test("host controls: chat off, remove someone, move people between spots, a challenge, and closing the party", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c)).body;
  const host = await h.sock(code, member.key);
  const j = (await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } })).body.member;
  const james = await h.sock(code, j.key);
  await james.send({ t: "chat", text: "Hello all" });
  assert.equal(host.last("chat").c.text, "Hello all");
  await james.send({ t: "settings", chatOn: false }); // not the host: ignored
  await james.send({ t: "chat", text: "still here" });
  assert.equal(host.last("chat").c.text, "still here");
  await host.send({ t: "settings", chatOn: false });
  await james.send({ t: "chat", text: "now?" });
  assert.equal(james.last("error").code, "chat_off");
  await host.send({ t: "assign", who: james.member, spot: 4 });
  assert.equal(host.last("members").members.find((m) => m.id === james.member).spot, 4);
  await host.send({ t: "challenge", kind: "biggest", minutes: 60 });
  assert.equal(james.last("settings").challenge.kind, "biggest");
  await host.send({ t: "kick", who: james.member });
  assert.equal(james.last("kicked").t, "kicked"); assert.equal(james.ws.closed, true);
  assert.equal(await h.P.connect(code, j.key, { send() {} }), null, "a removed member can't come back with their key");
  await host.send({ t: "close" });
  assert.equal(host.last("closed").why, "closed");
  assert.equal((await h.c("GET", `/${code}?s=${secret}`)).status, 410, "a closed party says it has ended");
  assert.equal((await h.c("POST", `/${code}/join`, { body: { secret, name: "Late" } })).status, 410);
});

test("voice set-up is relayed only between members, and only while voice is on; reports are kept for the host", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c)).body;
  const host = await h.sock(code, member.key);
  const j = (await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } })).body.member;
  const james = await h.sock(code, j.key);
  await host.send({ t: "signal", to: james.member, data: { sdp: "offer" } });
  assert.deepEqual(james.last("signal"), { t: "signal", from: host.member, data: { sdp: "offer" } });
  await host.send({ t: "signal", to: "someone-else", data: {} });
  await host.send({ t: "signal", to: james.member, data: { sdp: "x".repeat(PARTY.signalBytes + 10) } });
  assert.equal(james.got.filter((m) => m.t === "signal").length, 1, "nothing to strangers, nothing huge");
  await host.send({ t: "settings", voiceOn: false });
  await host.send({ t: "signal", to: james.member, data: { sdp: "again" } });
  assert.equal(james.got.filter((m) => m.t === "signal").length, 1);
  await james.send({ t: "report", who: host.member, reason: "Shouting" });
  assert.equal(james.last("reported").who, host.member);
});

test("dropping out and coming back: the spot is kept for a while, the events are caught up, and the party ends on time", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c, { hours: 2 })).body;
  const host = await h.sock(code, member.key);
  const j = (await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } })).body.member;
  let james = await h.sock(code, j.key);
  await james.send({ t: "event", ev: { type: "cast", cid: "a" } });
  await james.close();
  h.tick(3 * 60e3);
  await host.send({ t: "event", ev: { type: "cast", cid: "h1" } });
  james = await h.sock(code, j.key);
  const hello = james.last("hello");
  assert.equal(hello.members.find((m) => m.id === james.member).spot, 2, "the spot was kept");
  assert.deepEqual(hello.events.map((e) => e.type), ["cast", "cast"], "everything that happened meanwhile");
  // leaving frees the spot
  await james.send({ t: "leave" });
  assert.equal(host.last("members").members.some((m) => m.id === james.member), false);
  // past its hours the party has ended
  h.tick(2 * 3600e3 + 1000);
  await host.send({ t: "event", ev: { type: "cast" } });
  assert.equal(host.last("closed").why, "ended");
  assert.equal((await h.c("GET", `/${code}?s=${secret}`)).status, 410);
});

test("the leaderboard: from the party's catches only, by count, species, weight or length, within the challenge's time", () => {
  const ev = (who, t, species, cm, kg) => ({ type: "catch", who, t, data: { species, lengthCm: cm, weightKg: kg } });
  const evs = [ev("a", 10, "cod", 60, null), ev("a", 20, "whiting", 30, 0.3), ev("b", 30, "bass", 70, 3.4), ev("b", 40, "bass", 40, null), ev("b", 5000, "cod", 90, null), { type: "cast", who: "c", t: 50 }];
  const M = { a: { name: "Aaron" }, b: { name: "James" } };
  assert.deepEqual(standings(evs, M, { kind: "most", to: 1000 }).map((s) => [s.name, s.score]), [["Aaron", 2], ["James", 2]]);
  assert.equal(standings(evs, M, { kind: "species", to: 1000 })[0].name, "Aaron");
  assert.equal(standings(evs, M, { kind: "biggest", to: 1000 })[0].name, "James");
  assert.equal(standings(evs, M, { kind: "longest" })[0].score, 90);
  assert.equal(new PartyRoom().ready, false);
});

test("the live connection is checked by origin: a page elsewhere can't open a party's socket", async (t) => {
  const h = harness(t);
  const { code } = (await start(h.c)).body;
  const r = await h.c("GET", `/${code}/ws?m=x`, { headers: { upgrade: "websocket" }, origin: "https://evil.example", fishdock: false });
  assert.equal(r.status, 403);
});

test("only the host can use the host's controls, whatever a guest's phone sends", async (t) => {
  const h = harness(t);
  const { code, member, secret } = (await start(h.c)).body;
  const host = await h.sock(code, member.key);
  const j = (await h.c("POST", `/${code}/join`, { body: { secret, name: "James", role: "angler" } })).body.member;
  const james = await h.sock(code, j.key);
  const before = JSON.stringify((await h.c("GET", `/${code}?s=${secret}`)).body);
  for (const m of [{ t: "kick", who: member.id }, { t: "assign", who: member.id, spot: 3 }, { t: "settings", locked: true, codeOn: false, chatOn: false, voiceOn: false, anglersOn: false, light: "night" }, { t: "newLink" }, { t: "challenge", kind: "biggest", minutes: 60 }, { t: "close" }]) await james.send(m);
  assert.equal(JSON.stringify((await h.c("GET", `/${code}?s=${secret}`)).body), before, "nothing about the party changed");
  assert.equal((await h.c("GET", `/${code}?s=${secret}`)).status, 200, "the old link still works: no new link was made");
  assert.ok(!host.got.some((m) => m.t === "kicked" || m.t === "closed"));
  assert.ok(!james.got.some((m) => m.t === "settings" && m.secret), "a guest never receives the invite secret");
  // and a guest can't fish as someone else: events are always theirs
  await james.send({ t: "event", ev: { type: "cast", cid: "x1", who: member.id } });
  assert.equal(host.last("event").ev.who, james.member);
});

test("asking about codes, joining and starting parties are limited per connection", async (t) => {
  const h = harness(t);
  const { code, secret } = (await start(h.c)).body;
  let last;
  for (let i = 0; i <= PARTY.lookupsPerMinute; i++) last = await h.c("GET", `/ZZZZZ${"23456789ABCDEFGHJKMNPQRSTUVWXYZ"[i % 31]}?via=code`);
  assert.equal(last.status, 429, "guessing codes is slowed down");
  for (let i = 0; i <= PARTY.joinsPerMinute; i++) last = await h.c("POST", `/${code}/join`, { body: { secret: `wrong${i}xxxxxx`, name: "x" } });
  assert.equal(last.status, 429, "guessing invite secrets is slowed down");
  h.advance?.(70e3);
});

test("a party's saved record can't grow without limit: reports are capped, and so is everyone who ever joined", async (t) => {
  const room = new PartyRoom(null), now = Date.now();
  const host = await room.init({ code: "ABCDEF", mode: "virtual", venue: "pier", name: "H", hours: 2 }, now);
  const g = await room.join({ secret: room.s.secret, name: "G", role: "spectator" }, now);
  for (let i = 0; i < PARTY.maxReports + 50; i++) room.message(g.member.id, { t: "report", who: host.id, reason: `r${i}` }, now + i * 1000);
  assert.ok(room.s.reports.length <= PARTY.maxReports, `${room.s.reports.length} reports kept`);
  let full = 0;
  for (let i = 0; i < PARTY.maxEverMembers + 5; i++) { const r = await room.join({ secret: room.s.secret, name: `p${i}`, role: "spectator" }, now); if (r.error === "full") full++; else room.s.members[r.member.id].left = true; }
  assert.ok(Object.keys(room.s.members).length <= PARTY.maxEverMembers && full > 0);
  const codes = Array.from({ length: 2000 }, makeCode); assert.ok(codes.every(validCode));
});

test("a party started from the 3D demo can be at a documented FishDock mark, never an arbitrary place, and never on a real trip", async () => {
  const { cleanPlace } = await import("../server/party.js");
  assert.deepEqual(cleanPlace({ label: "Gorleston South Pier", mark: "gorleston-south-pier" }, "virtual"), { label: "Gorleston South Pier", mark: "gorleston-south-pier" });
  assert.deepEqual(cleanPlace({ label: "Somewhere", mark: "52.57,1.73" }, "virtual"), { label: "Somewhere" }, "a position isn't a mark");
  assert.deepEqual(cleanPlace({ label: "x", mark: "not-a-real-mark-anywhere" }, "virtual"), { label: "x" });
  assert.deepEqual(cleanPlace({ label: "Gorleston", mark: "gorleston-south-pier" }, "real"), { label: "Gorleston" }, "a real trip never names a mark");
  assert.deepEqual(cleanPlace({ label: "  " }, "virtual"), { label: null });
});

test("walking about in a virtual party: poses go to the others only, cleaned, never saved, with their own limit", async () => {
  const { cleanPose } = await import("../server/party.js");
  assert.deepEqual(cleanPose({ x: 1.234, y: 2.2, z: -7.5, face: 0.4, air: 1, extra: "x" }), { x: 1.23, y: 2.2, z: -7.5, face: 0.4, air: true });
  assert.equal(cleanPose(null), null, "back at their spot");
  assert.equal(cleanPose({ x: 1e6, y: 0, z: 0, face: 0 }), undefined, "out of the place");
  assert.equal(cleanPose({ x: "1", y: 0, z: 0, face: 0 }), undefined);
  assert.equal(cleanPose("hi"), undefined);
  const room = new PartyRoom();
  await room.init({ code: "ABC234", mode: "virtual", venue: "pier", place: { label: "x" }, name: "Host" }, 1000);
  const host = Object.values(room.s.members)[0];
  host.spot = host.spot || 1;
  const r = room.message(host.id, { t: "pose", p: { x: 3, y: 2.2, z: -7, face: 0.4 } }, 2000);
  assert.equal(r.save, false); assert.deepEqual(r.out, [{ to: "others", msg: { t: "pose", who: host.id, p: { x: 3, y: 2.2, z: -7, face: 0.4, air: false } } }]);
  let sent = 0; for (let i = 0; i < 80; i++) sent += room.message(host.id, { t: "pose", p: { x: i, y: 2, z: 0, face: 0 } }, 3000 + i).out.length;
  assert.ok(sent <= PARTY.posesPer10s, `${sent} poses in a burst`);
  assert.equal(room.message(host.id, { t: "chat", text: "still fine" }, 3200).out.length, 1, "walking doesn't use up the chat and cast limit");
  const real = new PartyRoom(); await real.init({ code: "DEF234", mode: "real", venue: "pier", place: { label: "x" }, name: "Host" }, 1000);
  const rh = Object.values(real.s.members)[0]; rh.spot = rh.spot || 1;
  assert.equal(real.message(rh.id, { t: "pose", p: { x: 3, y: 2.2, z: -7, face: 0.4 } }, 2000).out.length, 0, "no walking on a real trip");
});
