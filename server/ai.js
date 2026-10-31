// AI (Beta): POST /api/ai/cast (Cast Advisor: where to cast in a photo of the water) and POST /api/ai/identify
// (which fish is this). GET /api/ai/status: the caller's allowance, which never counts.
//
// - Gemini vision, called from the server with GEMINI_API_KEY (never sent to the app); GEMINI_MODEL overrides the
//   model. As DetectDock's identify: JSON-only output, low temperature, strict prompts, and the server checks
//   every field of the answer (known values only, bounded text, positions clamped to the image).
// - The model is told to describe only what it can see: never fish, depths or hidden underwater structure,
//   and everything as a possibility. The server also drops any sentence that states a depth or claims fish are
//   there, and marks every feature as potential.
// - Photos: a base64 JPEG of at most 1.6 MB, re-validated and stripped of EXIF / GPS and every other metadata
//   segment (jpeg.js) before it leaves for Google. Sent for this one answer and never stored or logged.
//   Context text that looks like a location (coordinates, grid references, postcodes) is dropped, not sent.
// - Daily allowances (UK day: they reset at midnight UK time), counted in ai_usage with single atomic updates:
//     signed-in accounts AI_DAILY_USER_LIMIT (default 30), guests 5 per network (the day's keyed hash, ipKey.js),
//     and everyone together AI_DAILY_GLOBAL_LIMIT (default 600). Cast and identify share them.
//   A request uses one only when it reaches the AI. A failed AI call, or an answer that can't be read, gives it
//   back. Used up: 429 { error: "rate_limited", kind: "daily", resetAt, scope } with a Retry-After header.
// - The castAdvisor and identify feature flags (admin panel) switch each route off.

import { json, err, guard, readJson, toResponse, fail, limitError, cleanLine, noDashes, posInt, toBase64, fromBase64 } from "./http.js";
import { needDb, enforce, hashedId } from "./db.js";
import { accountFrom, hasToken, noteActive } from "./account.js";
import { networkKey, noteNetwork } from "./throttle.js";
import { sanitizeJpeg } from "./jpeg.js";
import { looksLikeLocation } from "./locationText.js";
import { getFlags } from "./flags.js";
import { upstreamCtx, upstreamJson, recordHealth, UpstreamError } from "./upstream.js";
import { ukDay, ukDayEnd } from "./time.js";

export const AI_LIMITS = { perUserPerDay: 30, perGuestPerDay: 5, globalPerDay: 600, burstPerMinute: 6, imageBytes: 1_600_000, maxDim: 4096, minDim: 64, bodyBytes: 2_300_000 };
export const DEFAULT_MODEL = "gemini-3.8-flash"; // as DetectDock; override with GEMINI_MODEL
// A vision answer takes longer than a data lookup: this is the one outside call allowed more than 8 seconds.
export const AI_TIMEOUT_MS = 30e3;

export function limitsFor(env) {
  return {
    user: posInt(env?.AI_DAILY_USER_LIMIT, AI_LIMITS.perUserPerDay),
    global: posInt(env?.AI_DAILY_GLOBAL_LIMIT, AI_LIMITS.globalPerDay),
    guest: AI_LIMITS.perGuestPerDay,
  };
}

export const AI_WORDS = {
  user: "You've used today's AI allowance. It's back tomorrow; everything else in FishDock still works.",
  guest: "You've used today's free AI tries on this network. Sign in for a bigger daily allowance, or try again tomorrow.",
  everyone: "Today's AI for everyone on FishDock has all been used, so it's resting until tomorrow. Everything else still works.",
  slow: "Just a moment: one AI request at a time.",
  failed: "The AI isn't available right now. This didn't use your allowance.",
  unreadable: "The AI's answer couldn't be read this time. This didn't use your allowance. Try again.",
};

// ---- allowance (ai_usage) ----

/** Atomically uses one unit of `k` if it's under `max`. False (and nothing changed) at the limit. */
export async function take(db, k, day, max) {
  if (max <= 0) return false;
  const row = await db.prepare(
    `INSERT INTO ai_usage (k, day, n) VALUES (?1, ?2, 1)
     ON CONFLICT(k) DO UPDATE SET n = ai_usage.n + 1 WHERE ai_usage.n < ?3
     RETURNING n`
  ).bind(k, day, max).first();
  return Boolean(row);
}
export const refund = (db, k) => db.prepare(`UPDATE ai_usage SET n = MAX(0, n - 1) WHERE k = ?1`).bind(k).run();
const usedOf = async (db, k) => (await db.prepare(`SELECT n FROM ai_usage WHERE k = ?1`).bind(k).first())?.n ?? 0;
async function count(db, k, day) {
  await db.prepare(`INSERT INTO ai_usage (k, day, n) VALUES (?1, ?2, 1) ON CONFLICT(k) DO UPDATE SET n = ai_usage.n + 1`).bind(k, day).run();
}

async function quotaOf(db, who, now) {
  const [mine, all] = await Promise.all([usedOf(db, who.key), usedOf(db, `all:${who.day}`)]);
  return { limit: who.limit, used: Math.min(mine, who.limit), remaining: Math.max(0, who.limit - mine), siteAvailable: all < who.global, resetsAt: ukDayEnd(now), guest: who.guest };
}

// ---- species (ids as in src/data/species.js; keep the two lists in step) ----

export const SPECIES = {
  bass: "Bass", cod: "Cod", pollack: "Pollack", coalfish: "Coalfish (saithe)", mackerel: "Mackerel", whiting: "Whiting",
  pouting: "Pouting (bib)", "poor-cod": "Poor cod", ling: "Ling", "conger-eel": "Conger eel", haddock: "Haddock",
  "ballan-wrasse": "Ballan wrasse", "corkwing-wrasse": "Corkwing wrasse", "cuckoo-wrasse": "Cuckoo wrasse",
  "thornback-ray": "Thornback ray", "small-eyed-ray": "Small-eyed ray", "undulate-ray": "Undulate ray", "blonde-ray": "Blonde ray", "spotted-ray": "Spotted ray",
  "lesser-spotted-dogfish": "Lesser spotted dogfish", "bull-huss": "Bull huss", smoothhound: "Smoothhound", tope: "Tope", spurdog: "Spurdog",
  plaice: "Plaice", flounder: "Flounder", dab: "Dab", sole: "Dover sole", turbot: "Turbot", brill: "Brill",
  "black-bream": "Black bream", "gilthead-bream": "Gilthead bream", "red-gurnard": "Red gurnard", "tub-gurnard": "Tub gurnard", "grey-gurnard": "Grey gurnard",
  garfish: "Garfish", scad: "Scad (horse mackerel)", "thick-lipped-grey-mullet": "Thick-lipped grey mullet", "thin-lipped-grey-mullet": "Thin-lipped grey mullet",
  "golden-grey-mullet": "Golden grey mullet", herring: "Herring", "lesser-weever": "Lesser weever", "sea-scorpion": "Sea scorpion", rockling: "Rockling",
  "common-carp": "Common carp", "mirror-carp": "Mirror carp", "crucian-carp": "Crucian carp", tench: "Tench", "common-bream": "Common bream",
  roach: "Roach", rudd: "Rudd", perch: "Perch", pike: "Pike", zander: "Zander", chub: "Chub", barbel: "Barbel", dace: "Dace", ide: "Ide",
  grayling: "Grayling", "brown-trout": "Brown trout", "rainbow-trout": "Rainbow trout", "sea-trout": "Sea trout", salmon: "Atlantic salmon",
  eel: "European eel", gudgeon: "Gudgeon", ruffe: "Ruffe", bleak: "Bleak", "wels-catfish": "Wels catfish", minnow: "Minnow",
};
const slug = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** The species id for the model's answer, when it maps to a known one (its id, or its common name). */
export function speciesIdFor(id, name, ids = Object.keys(SPECIES)) {
  const known = new Set(ids);
  if (typeof id === "string" && known.has(id)) return id;
  const s = slug(name);
  if (known.has(s)) return s;
  for (const [k, label] of Object.entries(SPECIES)) if (known.has(k) && slug(label) === s) return k;
  return null;
}

// ---- prompts ----

const CAST_KINDS = ["seam", "eddy", "slack", "gully", "rocks", "weed", "colour-change", "surf", "overhang", "drop-off", "structure", "inflow", "reeds"];
const SCENES = ["beach", "rocks", "harbour", "estuary", "river", "lake", "canal", "other"];
const CONF = ["low", "medium", "high"];
const WATER = ["sea", "river", "lake", "canal"];
const TIDE = ["flooding", "ebbing", "high", "low"];

/** Only known, bounded context fields (never coordinates). */
export function cleanContext(c = {}) {
  const line = (v, n) => { const s = cleanLine(v, n); return s && !looksLikeLocation(s) ? s : null; };
  return {
    waterType: WATER.includes(c?.waterType) ? c.waterType : null,
    spotName: line(c?.spotName, 60),
    species: line(c?.species, 40),
    tide: TIDE.includes(c?.tide) ? c.tide : null,
    timeOfDay: line(c?.timeOfDay, 20),
    region: line(c?.region, 40),
    verified: (Array.isArray(c?.verified) ? c.verified : []).slice(0, 8).map((v) => line(v, 100)).filter(Boolean),
  };
}

export function castPrompt(ctx) {
  return `You are FishDock's Cast Advisor (Beta) for UK anglers. Look at the photo of the water the angler is facing.
Context from the app (may be empty; "verified" lists checked facts about the spot): ${JSON.stringify(ctx)}.
Rules:
- Describe ONLY features you can actually see in the photo: current seams, eddies, slack water behind obstructions, riffles and pool tails, outside bends, overhanging trees, weed beds, lily pads, reeds, rocks and ledges, gullies between rocks, breaking waves and surf tables, visible colour changes, harbour walls and piers, inflows, sheltered corners.
- Never claim fish are present. Never state or estimate depths. Never describe structure you cannot see (nothing under the surface unless it is visible). Every feature is only a possibility: use "may", "often holds fish", "worth a cast".
- Do not invent anything that is not in the photo or the context.
- Give each feature a position as fractions of image width (x) and height (y), 0 to 1 from the top-left, pointing at where to land the bait or lure on the water.
- Flag anything unsafe that is visible (wet or weedy rocks, steep shingle, big swell, fast or flooded water, overhead power lines, cut-off by the tide).
- UK English, plain sentences, no em dashes, no markdown.
Reply with JSON only:
{"summary": "one or two sentences", "scene": one of ${JSON.stringify(SCENES)},
 "features": [{"x": 0.4, "y": 0.6, "kind": one of ${JSON.stringify(CAST_KINDS)}, "label": "short name", "why": "why fish may hold here, one sentence", "how": "cast placement and approach, one sentence", "confidence": "low|medium|high"}],
 "avoid": [{"x": 0.1, "y": 0.8, "label": "short", "why": "one sentence"}],
 "safety": ["short"]}
Give 0 to 5 features, best first. If the photo doesn't clearly show water, return "features": [] and say so in the summary.`;
}

export function identifyPrompt(ctx, ids) {
  return `You are FishDock's fish identifier (Beta) for UK waters. Identify the fish in the photo from what is visible.
Context from the app (may be empty): ${JSON.stringify({ waterType: ctx.waterType, region: ctx.region })}.
Known species ids: ${ids.join(", ")}.
Rules:
- Base every candidate only on features visible in the photo (fin shape and position, markings, mouth, scales, colour). Name those features in "why".
- Do not guess wildly: low confidence is fine. Never invent features you cannot see. If no fish is visible, return "candidates": [] and say so in "note".
- UK English, plain sentences, no em dashes, no markdown.
Reply with JSON only:
{"candidates": [{"species": "common name", "id": "an id from the list, or null", "confidence": "low|medium|high", "why": "visible features that support it"}],
 "lookalikes": ["a species to rule out, and how"], "note": "anything that limits the identification (angle, blur, juvenile)"}
Give at most 3 candidates, most likely first.`;
}

// ---- checking the model's answer ----

// A sentence that states a depth, or claims fish are definitely there, is dropped whatever the model wrote.
const DEPTH_RE = /\b(?:deep|depth|deeper|shallow(?:er)?|drops? (?:off )?to)\b[^.!?]*\b\d+(?:\.\d+)?\s*(?:m|metres?|meters?|ft|feet|foot|fathoms?)\b|\b\d+(?:\.\d+)?\s*(?:m|metres?|meters?|ft|feet|foot|fathoms?)\s+(?:deep|of water|depth)\b/i;
const FISH_CLAIM_RE = /\b(?:there (?:are|is) (?:definitely )?(?:fish|bass|mullet|trout|carp|pike)\b|fish (?:are|is) (?:definitely )?(?:present|there|holding here)|(?:i|you) can see (?:a |the |some )?fish|guaranteed|definitely (?:holds?|has) fish|will (?:definitely )?catch)\b/i;
export const overclaims = (s) => DEPTH_RE.test(s) || FISH_CLAIM_RE.test(s);
/** Text with any sentence that states a depth or claims fish are there removed. */
export function withoutOverclaims(text) {
  const t = String(text ?? "");
  if (!overclaims(t)) return t;
  return t.split(/(?<=[.!?])\s+/).filter((x) => !overclaims(x)).join(" ").trim();
}
const say = (v, n) => cleanLine(withoutOverclaims(noDashes(typeof v === "string" ? v : "")), n);
/** A position as a fraction of the image (clamped to 0..1), or null if it isn't a number. */
export function frac(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : null;
}
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n * 3) : []);

export const CAST_NOTE = "Possible features read from your photo by AI (Beta). It can't see depth, fish or anything under the surface: check the water and stay safe before you cast.";

export function buildCast(raw, model) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const features = [];
  for (const f of list(r.features, 6)) {
    const x = frac(f?.x), y = frac(f?.y);
    if (x == null || y == null) continue; // a feature that can't be placed isn't shown
    const label = say(f?.label, 60);
    if (!label) continue;
    features.push({
      n: features.length + 1, x, y,
      kind: CAST_KINDS.includes(f?.kind) ? f.kind : "structure",
      label, why: say(f?.why, 240), how: say(f?.how, 240),
      confidence: CONF.includes(f?.confidence) ? f.confidence : "low",
      potential: true,
    });
    if (features.length >= 6) break;
  }
  const avoid = [];
  for (const a of list(r.avoid, 3)) {
    const x = frac(a?.x), y = frac(a?.y);
    const label = say(a?.label, 60);
    if (x == null || y == null || !label) continue;
    avoid.push({ x, y, label, why: say(a?.why, 200) });
    if (avoid.length >= 3) break;
  }
  return {
    summary: say(r.summary, 400),
    scene: SCENES.includes(r.scene) ? r.scene : "other",
    features,
    avoid,
    safety: [...new Set(list(r.safety, 4).map((s) => say(s, 160)).filter(Boolean))].slice(0, 4),
    model,
    note: CAST_NOTE,
  };
}

export function buildIdentify(raw, model, ids) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const seen = new Set();
  const candidates = [];
  for (const c of list(r.candidates, 3)) {
    const species = say(c?.species, 60);
    if (!species || seen.has(species.toLowerCase())) continue;
    seen.add(species.toLowerCase());
    candidates.push({ species, id: speciesIdFor(c?.id, species, ids), confidence: CONF.includes(c?.confidence) ? c.confidence : "low", why: say(c?.why, 240) });
    if (candidates.length >= 3) break;
  }
  return {
    candidates,
    lookalikes: list(r.lookalikes, 3).map((s) => say(typeof s === "string" ? s : s?.species, 160)).filter(Boolean).slice(0, 3),
    note: say(r.note, 300),
    model,
    unverified: true,
  };
}

// ---- Gemini ----

export async function askGemini(ctx, { key, model, prompt, image64 }) {
  const j = await upstreamJson(ctx, "gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: image64 } }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
    timeoutMs: AI_TIMEOUT_MS,
  });
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  try {
    const v = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v;
  } catch {
    await recordHealth(ctx.db, "gemini", false, "bad_output", ctx.now);
    throw Object.assign(new Error("unreadable"), { unreadable: true });
  }
}

// ---- handler ----

async function caller(db, env, request, now, deps) {
  const me = await accountFrom(request, env, now, deps);
  if (!me && hasToken(request)) throw fail(401, "sign_in_required", "Your sign-in has expired. Sign in again to use AI.");
  const lim = limitsFor(env);
  const day = ukDay(now);
  // Accounts whose email isn't confirmed yet use the guest allowance.
  if (me && !me.unverified) {
    await noteActive(db, env, me.uid, now);
    const h = await hashedId(env, me.uid);
    return { guest: false, id: "u:" + h, key: `u:${h}:${day}`, limit: lim.user, global: lim.global, day, words: AI_WORDS.user };
  }
  const net = await networkKey(db, env, request, now);
  await noteNetwork(db, net, now);
  return { guest: true, id: "g:" + net, key: `g:${net}:${day}`, limit: lim.guest, global: lim.global, day, words: AI_WORDS.guest };
}

export async function handleAi(request, env, now = Date.now(), deps = {}) {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/ai\/?/, "").split("/").filter(Boolean);
    const route = path.length === 1 ? path[0] : null;
    if (!["cast", "identify", "status"].includes(route)) return err(404, "not_found", "Unknown AI route.");
    if (route === "status" ? request.method !== "GET" : request.method !== "POST") return err(405, "method", route === "status" ? "Use GET." : "Use POST.");
    const db = await needDb(env, now, "AI");
    const who = await caller(db, env, request, now, deps);
    const flags = await getFlags(db);
    if (route === "status") {
      return json({ configured: Boolean(env.GEMINI_API_KEY), flags: { castAdvisor: flags.castAdvisor, identify: flags.identify }, quota: await quotaOf(db, who, now) });
    }
    if (route === "cast" && !flags.castAdvisor) return err(503, "feature_off", "The Cast Advisor is switched off for now. Everything else still works.");
    if (route === "identify" && !flags.identify) return err(503, "feature_off", "Fish identification is switched off for now. Everything else still works.");
    if (!env.GEMINI_API_KEY) return err(503, "not_configured", "AI isn't switched on for this site yet.");

    const body = await readJson(request, AI_LIMITS.bodyBytes);
    const bytes = fromBase64(body.image);
    if (!bytes) return err(400, "bad_image", "Send a photo (a JPEG).");
    if (bytes.length > AI_LIMITS.imageBytes) return err(413, "too_large", "That photo is too large. Try a smaller one (1.6 MB at most).");
    const img = sanitizeJpeg(bytes, { maxBytes: AI_LIMITS.imageBytes, maxDim: AI_LIMITS.maxDim, minDim: AI_LIMITS.minDim });
    if (!img) return err(400, "bad_image", "That photo couldn't be read. Try another (a JPEG).");
    const ctxIn = cleanContext(body.context);
    const ids = Array.isArray(body.context?.speciesIds)
      ? body.context.speciesIds.filter((s) => typeof s === "string" && /^[a-z0-9-]{2,40}$/.test(s)).slice(0, 200)
      : Object.keys(SPECIES);

    // A burst guard against repeated taps or scripts (separate from the daily allowance).
    await enforce(db, "aiburst:" + who.id, AI_LIMITS.burstPerMinute, now, { windowMs: 60e3 }, AI_WORDS.slow);
    const siteKey = `all:${who.day}`;
    if (!(await take(db, who.key, who.day, who.limit))) {
      throw limitError("daily", ukDayEnd(now), who.words, { scope: who.guest ? "guest" : "account", quota: await quotaOf(db, who, now) });
    }
    if (!(await take(db, siteKey, who.day, who.global))) {
      await refund(db, who.key); // everyone's allowance, not this caller's
      throw limitError("daily", ukDayEnd(now), AI_WORDS.everyone, { scope: "everyone", quota: await quotaOf(db, who, now) });
    }

    const model = String(env.GEMINI_MODEL || DEFAULT_MODEL).trim().slice(0, 80) || DEFAULT_MODEL;
    const ctx = upstreamCtx(db, now, deps);
    let raw;
    try {
      raw = await askGemini(ctx, {
        key: env.GEMINI_API_KEY, model,
        prompt: route === "cast" ? castPrompt(ctxIn) : identifyPrompt(ctxIn, ids),
        image64: toBase64(img),
      });
    } catch (e) {
      // A failed call, or an answer that can't be read, gives the allowance back.
      await refund(db, who.key);
      await refund(db, siteKey);
      if (!(e instanceof UpstreamError) && !e?.unreadable) throw e;
      return json({ error: "ai_unavailable", message: e?.unreadable ? AI_WORDS.unreadable : AI_WORDS.failed, quota: await quotaOf(db, who, now) }, 502);
    }
    await count(db, `${route}:${who.day}`, who.day);
    const out = route === "cast" ? buildCast(raw, model) : buildIdentify(raw, model, ids);
    return json({ ...out, quota: await quotaOf(db, who, now) });
  } catch (e) {
    return toResponse(e, now, "ai");
  }
}
