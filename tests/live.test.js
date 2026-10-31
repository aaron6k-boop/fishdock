// /api/live: private Live Fishing View links. Owner keys and link tokens, event sequence numbers with no duplicates
// on retries, per-link permissions (location exact / area / hidden, photos, sizes, history; new ones default off),
// passcodes, expiry, revoking, stopping sharing, viewer counts, photos stripped of metadata, and the feature flag.
import test from "node:test";
import assert from "node:assert/strict";
import { handleLive, cleanState, cleanEvent, LINK_PERMS, resetLiveForTests, LIVE } from "../server/live.js";
import { handleAdmin } from "../server/admin.js";
import { handleScene, shapeScenes, sceneUrl, niceTitle } from "../server/scene.js";
import { setup, stubFetch, jpeg, b64, T0 } from "./helpers/fishdock.js";

function lSetup(t, env = {}) {
  stubFetch(t, []);
  resetLiveForTests();
  const s = setup({ env: { ADMIN_EMAILS: "boss@fishdock.example", ...env } });
  return { s, c: s.call(handleLive, "/api/live/"), admin: s.call(handleAdmin, "/api/admin/") };
}
const state = (extra = {}) => ({
  status: "running", startedAt: T0 - 600e3, name: "Aaron", target: { id: "cod", name: "Cod" },
  place: { label: "Gorleston South Pier", area: "Norfolk", kind: "sea" }, counts: { casts: 3, bites: 1, catches: 0 },
  cond: { windKph: 22, waveM: 0.8, tide: "Flooding", secret: "x" },
  scene: { kind: "own", view: { horizon: 0.4, water: [[0, 0.4], [1, 0.4], [1, 1], [0, 1]], cast: [0.5, 0.55] } },
  track: [{ lat: 52.57, lon: 1.73 }], notes: "the gully by the third light", ...extra,
});
const ev = (id, type, data, t = T0 - 60e3) => ({ id, type, t, data });
async function makeShare(c, body = {}) {
  const r = await c("POST", "shares", { body: { state: state(), events: [ev("ev_cast1", "cast"), ev("ev_bite1", "bite")], ...body } });
  assert.equal(r.status, 201, r.text);
  const own = { "x-fishdock-owner": r.body.ownerKey };
  return { id: r.body.share.id, own, key: r.body.ownerKey, r };
}
async function makeLink(c, sh, extra = {}) {
  const r = await c("POST", `shares/${sh.id}/links`, { headers: sh.own, body: { label: "Mum", expiry: "24h", ...extra } });
  assert.equal(r.status, 201, r.text);
  return { token: r.body.token, id: r.body.link.id, link: r.body.link, h: { "x-fishdock-link": r.body.token, "x-fishdock-viewer": "viewer-abc123" } };
}

test("state and events are rebuilt from a whitelist: tracks, notes and unknown fields never reach the server", () => {
  const st = cleanState(state(), T0);
  assert.equal(st.track, undefined);
  assert.equal(st.notes, undefined);
  assert.equal(st.cond.secret, undefined);
  assert.equal(st.place.label, "Gorleston South Pier");
  assert.equal(cleanState(state({ place: { label: "52.5733, 1.7375", area: "TG 532 040", kind: "sea" } }), T0).place.label, null, "coordinates as a label are dropped");
  assert.equal(cleanState(state({ place: { label: "x", area: "TG 532 040", kind: "sea" } }), T0).place.area, null, "a fine grid reference is dropped");
  assert.equal(cleanEvent(ev("ev_mark1", "mark", { label: "secret" }), T0), null, "marks are never shared");
  assert.equal(cleanEvent(ev("ev_note1", "note", { text: "x" }), T0), null);
  const c = cleanEvent(ev("ev_c1", "catch", { species: "cod", name: "Cod", lengthCm: 62, weightKg: 2.4, released: false, bait: "Lugworm", photo: "ph_1", lat: 52.5, notes: "x" }), T0);
  assert.deepEqual(c.data, { species: "cod", name: "Cod", lengthCm: 62, weightKg: 2.4, released: false, bait: "Lugworm", photo: "ph_1" });
  assert.equal(cleanEvent(ev("ev_c2", "catch", { bait: "50.61, -2.45" }), T0).data.bait, null);
  assert.equal(cleanEvent({ id: "ev_old", type: "cast", t: T0 - 30 * 86400e3 }, T0), null, "far-off times are refused");
  assert.deepEqual(LINK_PERMS, { location: "area", photos: false, sizes: true, history: true });
});

test("a share is made without an account; only the owner key can push, and pushes keep a sequence with no duplicates", async (t) => {
  const { c } = lSetup(t);
  const sh = await makeShare(c);
  assert.equal(sh.r.body.lastSeq, 2);
  assert.match(sh.key, /^[A-Za-z0-9_-]{40,}$/);
  // no key, a wrong key, or another site
  assert.equal((await c("POST", `shares/${sh.id}/push`, { body: { events: [] } })).status, 403);
  assert.equal((await c("POST", `shares/${sh.id}/push`, { headers: { "x-fishdock-owner": "nope" }, body: { events: [] } })).status, 403);
  assert.equal((await c("POST", `shares/${sh.id}/push`, { headers: sh.own, origin: "https://evil.example", body: {} })).status, 403);
  assert.equal((await c("POST", `shares/${sh.id}/push`, { headers: sh.own, fishdock: false, body: {} })).status, 403);
  // a retry of the same events (the phone lost the answer) adds nothing; new ones continue the sequence
  const again = await c("POST", `shares/${sh.id}/push`, { headers: sh.own, body: { events: [ev("ev_cast1", "cast"), ev("ev_bite1", "bite"), ev("ev_hook1", "hooked"), ev("ev_mark9", "mark")] } });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.lastSeq, 3);
  assert.deepEqual(again.body.accepted, ["ev_cast1", "ev_bite1", "ev_hook1"]);
  const more = await c("POST", `shares/${sh.id}/push`, { headers: sh.own, body: { events: [ev("ev_land1", "catch", { species: "cod", lengthCm: 58 })] } });
  assert.equal(more.body.lastSeq, 4);
});

test("viewers need a live link; they see events after the sequence they have, and nothing of the track or notes", async (t) => {
  const { s, c } = lSetup(t);
  const sh = await makeShare(c);
  assert.equal((await c("GET", "view")).status, 404);
  assert.equal((await c("GET", "view", { headers: { "x-fishdock-link": "x".repeat(43) } })).status, 404);
  const L = await makeLink(c, sh);
  assert.deepEqual(L.link.perms, LINK_PERMS, "a link starts with the private defaults");
  const v = await c("GET", "view?after=0", { headers: L.h });
  assert.equal(v.status, 200, v.text);
  assert.deepEqual(v.body.events.map((e) => [e.seq, e.type]), [[1, "cast"], [2, "bite"]]);
  assert.equal(v.body.share.name, "Aaron");
  assert.equal(v.body.share.place.label, null, "approximate by default: no place label");
  assert.equal(v.body.share.place.area, "Norfolk");
  assert.equal(v.body.share.pos, null);
  assert.equal(JSON.stringify(v.body).includes("gully"), false);
  assert.equal(JSON.stringify(v.body).includes("52.57"), false);
  assert.equal(v.body.share.connected, true);
  // reconnecting with the last sequence seen: only what's new, once
  await c("POST", `shares/${sh.id}/push`, { headers: sh.own, body: { events: [ev("ev_h", "hooked"), ev("ev_c", "catch", { species: "cod", name: "Cod", lengthCm: 61, photo: "ph_1" })] } });
  const v2 = await c("GET", "view?after=2", { headers: L.h });
  assert.deepEqual(v2.body.events.map((e) => e.type), ["hooked", "catch"]);
  assert.equal(v2.body.events[1].data.lengthCm, 61);
  assert.equal(v2.body.events[1].data.photo, null, "photos are off unless the link allows them");
  assert.equal((await c("GET", "view?after=4", { headers: L.h })).body.events.length, 0);
  // the angler's phone goes quiet (Safari suspended): viewers keep the last state, marked not connected
  s.tick(LIVE.staleMs + 1000);
  const v3 = await c("GET", "view?after=4", { headers: L.h });
  assert.equal(v3.body.share.connected, false);
  assert.equal(v3.body.share.counts.casts, 3);
});

test("permissions per link: exact location only when chosen; hidden hides the place and the scene; sizes and history", async (t) => {
  const { s, c } = lSetup(t);
  const sh = await makeShare(c, { pos: { lat: 52.57331, lon: 1.73752, acc: 6 } });
  await c("PUT", `shares/${sh.id}/scene`, { headers: sh.own, body: { photo: b64(jpeg()) } });
  await c("POST", `shares/${sh.id}/push`, { headers: sh.own, body: { events: [ev("ev_c", "catch", { species: "cod", lengthCm: 61, weightKg: 2.1, photo: "ph_1" })] } });
  const exact = await makeLink(c, sh, { label: "Dad", perms: { location: "exact", photos: true } });
  const hidden = await makeLink(c, sh, { label: "Club", perms: { location: "hidden", sizes: false, history: false } });
  const ve = (await c("GET", "view", { headers: exact.h })).body;
  assert.deepEqual(ve.share.pos, { lat: 52.57331, lon: 1.73752, acc: 6 });
  assert.equal(ve.share.place.label, "Gorleston South Pier");
  assert.equal(ve.share.scene.kind, "own");
  assert.equal(ve.events.at(-1).data.photo, "ph_1");
  s.tick(180e3);
  const vh = (await c("GET", "view", { headers: hidden.h })).body;
  assert.equal(vh.share.pos, null);
  assert.deepEqual([vh.share.place.label, vh.share.place.area], [null, null]);
  assert.equal(vh.share.scene.kind, "representative", "hidden location: never the angler's photo");
  assert.equal((await c("GET", "scene", { headers: hidden.h })).status, 404);
  assert.equal(vh.events.length, 0, "no history: only what happens from now on");
  // the angler changes a link's permissions: the next poll follows
  await c("PUT", `shares/${sh.id}/links/${hidden.id}`, { headers: sh.own, body: { perms: { location: "area", history: true, sizes: false } } });
  const vh2 = (await c("GET", "view", { headers: hidden.h })).body;
  assert.equal(vh2.share.place.area, "Norfolk");
  assert.equal(vh2.events.at(-1).data.lengthCm, null, "sizes off");
  // scene photo: stripped of EXIF/GPS and comments
  const sc = await c("GET", "scene", { headers: exact.h });
  assert.equal(sc.status, 200);
  assert.equal(Buffer.from(sc.raw).toString("binary").includes("GPSLatitude"), false);
  assert.equal(Buffer.from(sc.raw).toString("binary").includes("Secret mark"), false);
});

test("catch photos are stripped and only reach links that allow photos", async (t) => {
  const { c } = lSetup(t);
  const sh = await makeShare(c);
  assert.equal((await c("PUT", `shares/${sh.id}/photos/ph_1`, { headers: sh.own, body: { photo: "not a photo" } })).status, 400);
  assert.equal((await c("PUT", `shares/${sh.id}/photos/ph_1`, { headers: sh.own, body: { photo: b64(jpeg()) } })).status, 200);
  const plain = await makeLink(c, sh);
  const pics = await makeLink(c, sh, { perms: { photos: true } });
  assert.equal((await c("GET", "photo/ph_1", { headers: plain.h })).status, 404);
  const p = await c("GET", "photo/ph_1", { headers: pics.h });
  assert.equal(p.status, 200);
  assert.equal(p.headers.get("content-type"), "image/jpeg");
  assert.equal(Buffer.from(p.raw).toString("binary").includes("GPSLongitude"), false);
});

test("passcodes: the link needs it, wrong tries are throttled, the grant opens it", async (t) => {
  const { c } = lSetup(t);
  const sh = await makeShare(c);
  assert.equal((await c("POST", `shares/${sh.id}/links`, { headers: sh.own, body: { expiry: "24h", passcode: "12" } })).status, 400);
  const L = await makeLink(c, sh, { passcode: "4821" });
  assert.equal(L.link.hasPasscode, true);
  const v = await c("GET", "view", { headers: L.h });
  assert.equal(v.status, 401);
  assert.equal(v.body.error, "passcode_required");
  assert.equal((await c("POST", "unlock", { headers: L.h, body: { passcode: "0000" } })).status, 403);
  const ok = await c("POST", "unlock", { headers: L.h, body: { passcode: "4821" } });
  assert.equal(ok.status, 200);
  assert.equal((await c("GET", "view", { headers: { ...L.h, "x-fishdock-grant": ok.body.grant } })).status, 200);
  for (let i = 0; i < LIVE.unlockTries; i++) await c("POST", "unlock", { headers: L.h, body: { passcode: "9999" } });
  assert.equal((await c("POST", "unlock", { headers: L.h, body: { passcode: "4821" } })).status, 429);
});

test("expiry, revoking and stopping sharing all work at once; the fishing session isn't touched", async (t) => {
  const { s, c } = lSetup(t);
  const sh = await makeShare(c);
  const a = await makeLink(c, sh, { expiry: "4h" });
  const b = await makeLink(c, sh, { label: "Gran", expiry: "7d" });
  assert.equal((await c("POST", `shares/${sh.id}/links`, { headers: sh.own, body: { expiry: "1y" } })).status, 400);
  await c("GET", "view", { headers: a.h });
  await c("GET", "view", { headers: { ...b.h, "x-fishdock-viewer": "viewer-gran01" } });
  const info = await c("GET", `shares/${sh.id}`, { headers: sh.own });
  assert.equal(info.body.watching, 2);
  assert.deepEqual(info.body.links.map((l) => [l.label, l.watching]), [["Mum", 1], ["Gran", 1]]);
  // revoke Mum's link: refused on the very next request
  assert.equal((await c("DELETE", `shares/${sh.id}/links/${a.id}`, { headers: sh.own })).status, 200);
  assert.equal((await c("GET", "view", { headers: a.h })).status, 404);
  assert.equal((await c("GET", "view", { headers: b.h })).status, 200);
  // Gran's link expires after its time
  s.tick(7 * 86400e3 + 1000);
  assert.equal((await c("GET", "view", { headers: b.h })).status, 404);
  // stop sharing: everything goes
  const sh2 = await makeShare(c);
  const L = await makeLink(c, sh2);
  assert.equal((await c("DELETE", `shares/${sh2.id}`, { headers: sh2.own })).status, 200);
  assert.equal((await c("GET", "view", { headers: L.h })).status, 404);
  assert.equal((await c("POST", `shares/${sh2.id}/push`, { headers: sh2.own, body: {} })).status, 404);
  const left = await s.db.prepare(`SELECT (SELECT COUNT(*) FROM live_events WHERE share_id = ?1) + (SELECT COUNT(*) FROM live_links WHERE share_id = ?1) AS n`).bind(sh2.id).first();
  assert.equal(left.n, 0);
});

test("old shares are cleared away, share-making is throttled per network, and the liveShare flag switches it off", async (t) => {
  const { s, c, admin } = lSetup(t);
  const sh = await makeShare(c);
  s.tick(LIVE.idleKeepMs + 11 * 60e3);
  await c("GET", "view", { headers: { "x-fishdock-link": "y".repeat(43) } }); // any request runs the sweep
  assert.equal((await s.db.prepare(`SELECT COUNT(*) AS n FROM live_shares WHERE id = ?1`).bind(sh.id).first()).n, 0);
  for (let i = 0; i < LIVE.sharesPerNetworkPerDay; i++) assert.equal((await c("POST", "shares", { body: { state: state() } })).status, 201);
  assert.equal((await c("POST", "shares", { body: { state: state() } })).status, 429);
  assert.equal((await c("POST", "shares", { ip: "198.51.100.7", body: { state: state() } })).status, 201);
  assert.equal((await admin("PUT", "flags", { tok: "tok-admin", body: { flags: { liveShare: false } } })).status, 200);
  const off = await c("POST", "shares", { ip: "198.51.100.8", body: { state: state() } });
  assert.equal(off.status, 503);
});

test("scene photos near a place: free licences and landscape views of water only, best first, rounded position", async (t) => {
  const page = (title, { w = 2000, h = 1333, lic = "CC BY-SA 2.0", dist = 500, mime = "image/jpeg", desc = "" } = {}) => ({
    title: "File:" + title, coordinates: [{ dist }],
    imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/9/90/${encodeURIComponent(title.replace(/ /g, "_"))}`, width: w, height: h, mime,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:" + title, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: "<a href='x'>Bob Jenkins</a>" }, ImageDescription: { value: desc } } }],
  });
  const answer = { query: { pages: {
    1: page("Gorleston South Pier - geograph.org.uk - 6234922.jpg", { desc: "Looking along the pier out to sea" }),
    2: page("Coastguard Lookout Station - geograph.org.uk - 1.jpg", { dist: 100 }),
    3: page("Turnstone 'Arenaria interpres' in winter plumage.jpg", { dist: 50 }),
    4: page("River Yare entering the North Sea.jpg", { lic: "CC BY-NC 2.0" }),
    5: page("Fishing off the pier.jpg", { w: 800, h: 1200 }),
    6: page("The Pier Gorleston-on-Sea.jpg", { w: 640, h: 427, dist: 900 }),
  } } };
  const list = shapeScenes(answer);
  assert.deepEqual(list.map((p) => p.title), ["Gorleston South Pier", "The Pier Gorleston-on-Sea", "Coastguard Lookout Station"]);
  assert.equal(list[0].url, "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Gorleston_South_Pier_-_geograph.org.uk_-_6234922.jpg/1280px-Gorleston_South_Pier_-_geograph.org.uk_-_6234922.jpg");
  assert.equal(list[1].url.includes("/thumb/"), false, "a small original is used as it is");
  assert.equal(list[0].author, "Bob Jenkins");
  assert.equal(sceneUrl("https://example.com/x.jpg", 2000), null);
  assert.equal(niceTitle("File:Gorleston, end of the pier - geograph.org.uk - 1605193.jpg"), "Gorleston, end of the pier");
  const { s } = lSetup(t);
  const calls = stubFetch(t, [[/commons\.wikimedia\.org\/w\/api\.php/, () => answer]]);
  const r = await s.call(handleScene, "/api/scene")("GET", "?lat=52.57331&lon=1.73752");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.photos.length, 3);
  assert.match(calls.calls[0].url, /ggscoord=52\.57%7C1\.74&/, "only a 1 km square goes to Wikimedia");
  assert.equal((await s.call(handleScene, "/api/scene")("GET", "?lat=40.1&lon=1.7")).status, 400);
});
