// POST /api/ai/cast and /api/ai/identify: Gemini answers checked field by field, positions clamped, photos stripped,
// allowances per account, per guest network and for everyone (429 when used up), refunds when the AI fails.
import test from "node:test";
import assert from "node:assert/strict";
import { handleAi, buildCast, buildIdentify, frac, withoutOverclaims, speciesIdFor, cleanContext, castPrompt } from "../server/ai.js";
import { handleAdmin } from "../server/admin.js";
import { setup, stubFetch, jpeg, b64 } from "./helpers/fishdock.js";

const GEMINI = /generativelanguage\.googleapis\.com\/v1beta\/models\/[^:]+:generateContent/;
const reply = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] });
const CAST = {
  summary: "A rocky point with a clear seam where the current meets slack water — worth a cast.",
  scene: "rocks",
  features: [
    { x: 0.42, y: 0.55, kind: "seam", label: "Current seam", why: "Bass often patrol seams. The water here is 4 m deep.", how: "Cast just upstream and let it drift.", confidence: "medium" },
    { x: 1.7, y: -0.2, kind: "gully", label: "Gully", why: "Food collects in gullies.", confidence: "certain" },
    { x: "0.3", y: 0.9, kind: "treasure", label: "Weed line", why: "There are definitely fish here." },
    { x: "left", y: 0.5, label: "No position" },
    { y: 0.5, label: "Missing x" },
  ],
  avoid: [{ x: 0.1, y: 1.4, label: "Wet rocks", why: "Slippery weed." }, { label: "nowhere" }],
  safety: ["Weedy rocks are slippery", "Weedy rocks are slippery", "Watch the tide"],
};

test("frac clamps to 0..1 and refuses what isn't a number", () => {
  assert.equal(frac(0.4567), 0.457);
  assert.equal(frac(-3), 0);
  assert.equal(frac(7), 1);
  assert.equal(frac("0.25"), 0.25);
  assert.equal(frac("left"), null);
  assert.equal(frac(null), null);
  assert.equal(frac(NaN), null);
});

test("cast answers: known kinds only, positions clamped, depth and fish claims dropped, em dashes removed, all potential", () => {
  const out = buildCast(CAST, "gemini-test");
  assert.equal(out.features.length, 3);
  assert.deepEqual(out.features.map((f) => [f.n, f.x, f.y]), [[1, 0.42, 0.55], [2, 1, 0], [3, 0.3, 0.9]]);
  assert.equal(out.features[1].confidence, "low");
  assert.equal(out.features[2].kind, "structure");
  assert.ok(out.features.every((f) => f.potential === true));
  assert.equal(out.features[0].why, "Bass often patrol seams."); // the depth sentence is gone
  assert.equal(out.features[2].why, ""); // "definitely fish" is gone
  assert.doesNotMatch(out.summary, /—/);
  assert.match(out.summary, /slack water, worth a cast/);
  assert.deepEqual(out.avoid, [{ x: 0.1, y: 1, label: "Wet rocks", why: "Slippery weed." }]);
  assert.deepEqual(out.safety, ["Weedy rocks are slippery", "Watch the tide"]);
  assert.equal(out.scene, "rocks");
  assert.match(out.note, /can't see depth/);
  assert.deepEqual(buildCast("nonsense", "m").features, []);
  assert.equal(buildCast({ scene: "volcano" }, "m").scene, "other");
  assert.equal(withoutOverclaims("Cast here. It drops to 10 metres. Fish the edge."), "Cast here. Fish the edge.");
});

test("identify answers: ids mapped to known species, at most 3, unknown confidence is low", () => {
  const out = buildIdentify({
    candidates: [
      { species: "Bass", id: "bass", confidence: "high", why: "Two dorsal fins, spiny first dorsal, silver flanks." },
      { species: "Ballan Wrasse", id: "wrasse", confidence: "medium", why: "Thick lips." },
      { species: "Mystery fish", id: "xyz", confidence: "sure" },
      { species: "Bass", id: "bass" },
      { species: "Pollack", id: null },
    ],
    lookalikes: ["Spotted bass: spots on the flanks", { species: "Mullet" }],
    note: "Side-on photo — good.",
  }, "m", undefined);
  assert.deepEqual(out.candidates.map((c) => [c.species, c.id, c.confidence]), [["Bass", "bass", "high"], ["Ballan Wrasse", "ballan-wrasse", "medium"], ["Mystery fish", null, "low"]]);
  assert.deepEqual(out.lookalikes, ["Spotted bass: spots on the flanks", "Mullet"]);
  assert.equal(out.note, "Side-on photo, good.");
  assert.equal(speciesIdFor(null, "Thornback Ray"), "thornback-ray");
  assert.equal(speciesIdFor("cod", "anything", ["cod"]), "cod");
  assert.equal(speciesIdFor(null, "Bass", ["cod"]), null);
});

test("context: known fields only; anything that looks like a location is dropped before the prompt", () => {
  const c = cleanContext({ waterType: "sea", spotName: "Mark at 50.6123, -2.4567", species: "bass", tide: "flooding", verified: ["Shingle beach", "SY 6781 7654"], lat: 50.6, lon: -2.4 });
  assert.equal(c.spotName, null);
  assert.deepEqual(c.verified, ["Shingle beach"]);
  assert.equal("lat" in c, false);
  const p = castPrompt(c);
  assert.match(p, /Never state or estimate depths/);
  assert.match(p, /Never claim fish are present/);
  assert.match(p, /JSON only/);
  assert.doesNotMatch(p, /50\.6123|SY 6781/);
});

function aiSetup(t, env = {}, gemini = () => reply(CAST)) {
  const s = setup({ env: { GEMINI_API_KEY: "gem-secret", GEMINI_MODEL: "gemini-test", ...env } });
  const net = stubFetch(t, [[GEMINI, gemini]]);
  const ai = s.call(handleAi, "/api/ai/");
  return { s, net, ai };
}
const photo = () => ({ image: b64(jpeg()), context: { waterType: "sea", species: "bass" } });

test("POST /api/ai/cast: Gemini gets a metadata-free JPEG with the key in a header; the answer is checked", async (t) => {
  const { net, ai } = aiSetup(t);
  const r = await ai("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(r.status, 200);
  assert.equal(r.body.model, "gemini-test");
  assert.equal(r.body.features.length, 3);
  assert.ok(r.body.features.every((f) => f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1));
  assert.equal(r.body.quota.used, 1);
  assert.equal(r.body.quota.limit, 30);
  assert.doesNotMatch(r.text, /gem-secret/);
  const call = net.calls[0];
  assert.equal(call.headers.get("x-goog-api-key"), "gem-secret");
  assert.doesNotMatch(call.url, /gem-secret/);
  assert.match(call.url, /models\/gemini-test:generateContent/);
  const sent = JSON.parse(call.init.body);
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  const img = Buffer.from(sent.contents[0].parts[1].inline_data.data, "base64");
  assert.equal(img.includes(Buffer.from("GPSLatitude")), false);
  assert.equal(img.includes(Buffer.from("Secret mark")), false);
  assert.equal(img[0], 0xff);
});

test("bad model output (not JSON) is a 502 that gives the allowance back", async (t) => {
  const { s, ai } = aiSetup(t, {}, () => reply("Sure! Here are some spots: the seam on the left."));
  const r = await ai("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, "ai_unavailable");
  assert.match(r.body.message, /didn't use your allowance/);
  assert.equal(r.body.quota.used, 0);
  assert.equal((await s.db.prepare(`SELECT n FROM ai_usage WHERE k LIKE 'all:%'`).first()).n, 0);
  const h = await s.db.prepare(`SELECT last_error FROM source_health WHERE upstream = 'gemini'`).first();
  assert.equal(h.last_error, "bad_output");
});

test("Gemini errors never leak; the allowance is given back", async (t) => {
  const { ai } = aiSetup(t, {}, () => new Response('{"error":{"code":400,"message":"API key not valid gem-secret","status":"INVALID_ARGUMENT"}}', { status: 400 }));
  const r = await ai("POST", "identify", { tok: "tok-alice", body: photo() });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.text, /gem-secret|INVALID_ARGUMENT|API key/);
  assert.equal(r.body.quota.used, 0);
});

test("allowances: per account (AI_DAILY_USER_LIMIT), 429 daily with Retry-After; back after UK midnight", async (t) => {
  const { s, ai } = aiSetup(t, { AI_DAILY_USER_LIMIT: "2" });
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: photo() })).status, 200);
  s.tick(61e3);
  assert.equal((await ai("POST", "identify", { tok: "tok-alice", body: photo() })).status, 200);
  s.tick(61e3);
  const r = await ai("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(r.status, 429);
  assert.equal(r.body.error, "rate_limited");
  assert.equal(r.body.kind, "daily");
  assert.equal(r.body.scope, "account");
  assert.equal(r.body.resetAt, Date.UTC(2026, 10, 1, 0, 0)); // UK midnight (winter: UTC)
  assert.ok(Number(r.headers.get("retry-after")) > 0);
  assert.equal((await ai("POST", "cast", { tok: "tok-bob", body: photo() })).status, 200); // someone else is fine
  s.tick(12 * 3600e3);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: photo() })).status, 200);
});

test("allowances: guests get 5 per network a day; everyone together is capped by AI_DAILY_GLOBAL_LIMIT", async (t) => {
  const { s, ai } = aiSetup(t, { AI_DAILY_GLOBAL_LIMIT: "7" });
  for (let i = 0; i < 5; i++) {
    const r = await ai("POST", "identify", { body: photo(), ip: "198.51.100.1" });
    assert.equal(r.status, 200, `guest try ${i + 1}`);
    s.tick(15e3);
  }
  const g = await ai("POST", "identify", { body: photo(), ip: "198.51.100.1" });
  assert.equal(g.status, 429);
  assert.equal(g.body.scope, "guest");
  assert.match(g.body.message, /Sign in/);
  // An account whose email isn't confirmed counts as a guest on its network.
  assert.equal((await ai("POST", "identify", { tok: "tok-dave", body: photo(), ip: "198.51.100.1" })).status, 429);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: photo() })).status, 200);
  assert.equal((await ai("POST", "cast", { tok: "tok-bob", body: photo() })).status, 200);
  const all = await ai("POST", "cast", { tok: "tok-carol", body: photo() });
  assert.equal(all.status, 429);
  assert.equal(all.body.scope, "everyone");
  assert.equal(all.body.quota.used, 0); // carol's own allowance was given back
  // A burst of taps is a short "slow" pause, not the daily allowance.
  const b = aiSetup(t);
  for (let i = 0; i < 6; i++) await b.ai("POST", "cast", { tok: "tok-alice", body: photo() });
  const slow = await b.ai("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(slow.status, 429);
  assert.equal(slow.body.kind, "slow");
  assert.ok(slow.body.retryAfter > 0);
});

test("requests that never reach the AI don't count: bad photos, too large, no key, flag off, expired sign-in", async (t) => {
  const { s, net, ai } = aiSetup(t);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: { image: "not base64!!" } })).status, 400);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: { image: b64(new Uint8Array([1, 2, 3, 4])) } })).status, 400);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: { image: b64(jpeg({ w: 10, h: 10 })) } })).status, 400);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: { image: "A".repeat(2_200_000) } })).status, 413);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: { image: "A".repeat(2_400_000) } })).status, 413);
  assert.equal((await ai("POST", "cast", { tok: "tok-expired", body: photo() })).status, 401);
  assert.equal((await ai("GET", "cast", { tok: "tok-alice" })).status, 405);
  assert.equal((await ai("POST", "nope", { tok: "tok-alice", body: photo() })).status, 404);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: photo(), origin: "https://evil.example" })).status, 403);
  assert.equal((await ai("POST", "cast", { tok: "tok-alice", body: photo(), fishdock: false })).status, 403);
  // castAdvisor flag off (admin), identify still on
  const admin = s.call(handleAdmin, "/api/admin/");
  s.env.ADMIN_EMAILS = "boss@fishdock.example";
  assert.equal((await admin("PUT", "flags", { tok: "tok-admin", body: { flags: { castAdvisor: false } } })).status, 200);
  const off = await ai("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(off.status, 503);
  assert.equal(off.body.error, "feature_off");
  const status = await ai("GET", "status", { tok: "tok-alice" });
  assert.equal(status.body.quota.used, 0);
  assert.equal(status.body.flags.castAdvisor, false);
  assert.equal(net.calls.length, 0);
  // No key: 503, nothing counted.
  const nk = aiSetup(t, { GEMINI_API_KEY: "" });
  assert.equal((await nk.ai("POST", "identify", { tok: "tok-alice", body: photo() })).body.error, "not_configured");
});

test("without the database AI answers 503", async (t) => {
  stubFetch(t, []);
  const s = setup({ db: false, env: { GEMINI_API_KEY: "k" } });
  const r = await s.call(handleAi, "/api/ai/")("POST", "cast", { tok: "tok-alice", body: photo() });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "not_configured");
});
