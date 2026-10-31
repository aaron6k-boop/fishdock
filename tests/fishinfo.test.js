// GET /api/fishinfo: a free-licensed Commons photo and the Wikipedia summary for one FishDock species.
// Shapes follow the Wikipedia REST summary and the Commons imageinfo/extmetadata API, written from their docs.
import test from "node:test";
import assert from "node:assert/strict";
import { handleFishInfo, shapeInfo, commonsFile } from "../server/fishinfo.js";
import { setup, stubFetch } from "./helpers/fishdock.js";

const SUMMARY = {
  title: "Thornback ray", extract: "The thornback ray (Raja clavata) is a species of ray fish. It grows to about 1 m long.",
  content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Thornback_ray" } },
  thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Raja_clavata.jpg/320px-Raja_clavata.jpg" },
  originalimage: { source: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Raja_clavata.jpg" },
};
const meta = (licence, artist = '<a href="//commons.wikimedia.org/wiki/User:Someone">Some One</a>') => ({ query: { pages: { "123": { imageinfo: [{
  url: "https://upload.wikimedia.org/wikipedia/commons/4/4f/Raja_clavata.jpg",
  thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Raja_clavata.jpg/640px-Raja_clavata.jpg", thumbwidth: 640, thumbheight: 427,
  descriptionurl: "https://commons.wikimedia.org/wiki/File:Raja_clavata.jpg",
  extmetadata: { LicenseShortName: { value: licence }, Artist: { value: artist }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" } },
}] } } } });

test("fishinfo: Commons file names only", () => {
  assert.equal(commonsFile("https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Raja_clavata.jpg/320px-Raja_clavata.jpg"), "Raja_clavata.jpg");
  assert.equal(commonsFile("https://upload.wikimedia.org/wikipedia/commons/4/4f/Raja%20clavata.jpg"), "Raja clavata.jpg");
  assert.equal(commonsFile("https://upload.wikimedia.org/wikipedia/en/4/4f/Fair_use.jpg"), null, "English Wikipedia files may be non-free");
  assert.equal(commonsFile(null), null);
});

test("fishinfo: free licences give a credited photo; anything else gives none", () => {
  const ok = shapeInfo(SUMMARY, meta("CC BY-SA 3.0"));
  assert.equal(ok.photo.url, "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Raja_clavata.jpg/640px-Raja_clavata.jpg");
  assert.equal(ok.photo.author, "Some One");
  assert.equal(ok.photo.licence, "CC BY-SA 3.0");
  assert.equal(ok.photo.filePage, "https://commons.wikimedia.org/wiki/File:Raja_clavata.jpg");
  assert.match(ok.extract, /grows to about 1 m/);
  assert.equal(ok.page, "https://en.wikipedia.org/wiki/Thornback_ray");
  for (const l of ["CC0", "Public domain", "CC BY 4.0", "CC BY-SA 4.0"]) assert.ok(shapeInfo(SUMMARY, meta(l)).photo, l);
  for (const l of ["All rights reserved", "Fair use", "", "CC BY-NC 2.0", "CC BY-ND 4.0"]) assert.equal(shapeInfo(SUMMARY, meta(l)).photo, null, l || "blank");
  assert.equal(shapeInfo(SUMMARY, null).photo, null);
  assert.equal(shapeInfo({}, null).extract, null);
});

test("fishinfo: GET looks up only FishDock species, credits the photo and caches it", async (t) => {
  const s = setup();
  const net = stubFetch(t, [
    [/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/Raja_clavata/, () => SUMMARY],
    [/commons\.wikimedia\.org\/w\/api\.php\?.*titles=File%3ARaja_clavata\.jpg/, () => meta("CC BY-SA 3.0")],
  ]);
  const r = await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=thornback-ray");
  assert.equal(r.status, 200);
  assert.equal(r.body.id, "thornback-ray");
  assert.equal(r.body.photo.licence, "CC BY-SA 3.0");
  assert.match(net.calls[0].headers.get("user-agent"), /^FishDock\//);
  await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=thornback-ray");
  assert.equal(net.calls.length, 2, "the second request came from the cache");
  assert.equal((await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=../../etc")).status, 404);
  assert.equal((await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=thornback-ray", { fishdock: false })).status, 403);
});

test("fishinfo: sea trout uses its own page; Commons failure still returns the text", async (t) => {
  const s = setup();
  stubFetch(t, [
    [/page\/summary\/Sea_trout/, () => ({ ...SUMMARY, title: "Sea trout", extract: "Sea trout are anadromous brown trout." })],
    [/commons\.wikimedia\.org/, () => new Response("down", { status: 503 })],
  ]);
  const r = await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=sea-trout");
  assert.equal(r.status, 200);
  assert.equal(r.body.title, "Sea trout");
  assert.equal(r.body.photo, null);
  assert.match(r.body.extract, /anadromous/);
});

test("fishinfo: a Commons outage isn't remembered; a broken file URL doesn't crash", async (t) => {
  const s = setup();
  let commonsUp = false;
  const net = stubFetch(t, [
    [/page\/summary\/Raja_clavata/, () => SUMMARY],
    [/commons\.wikimedia\.org/, () => (commonsUp ? meta("CC BY 4.0") : new Response("down", { status: 503 }))],
  ]);
  const r1 = await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=thornback-ray");
  assert.equal(r1.body.photo, null);
  commonsUp = true;
  const r2 = await s.call(handleFishInfo, "/api/fishinfo")("GET", "?id=thornback-ray");
  assert.equal(r2.body.photo.licence, "CC BY 4.0", "the photo comes back once Commons answers");
  assert.equal(net.count(/page\/summary/), 1, "the summary itself was kept");
  assert.equal(commonsFile("https://upload.wikimedia.org/wikipedia/commons/4/4f/Bad%E0%A4%A.jpg"), null);
});
