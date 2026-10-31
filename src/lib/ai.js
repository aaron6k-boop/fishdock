// ---- ai: Cast Advisor and fish identification (Beta) ----
// Deployed app: the server calls the vision model with keys kept server-side (/api/ai/*), as DetectDock does.
// Phone preview: the claude.ai artifact runtime can ask Claude directly, with the viewer's consent.
import { PREVIEW, postJSON } from "./api.js";

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

let samplerP = null;
function sampler() {
  if (!PREVIEW || typeof window === "undefined" || !window.claude?.use) return Promise.resolve(null);
  if (!samplerP) samplerP = window.claude.use("sample").catch(() => null);
  return samplerP;
}
export async function aiAvailable() {
  if (!PREVIEW) return true;
  const s = await sampler();
  if (!s) return false;
  try { const lim = await s.limits(); return !!lim.images; } catch { return false; }
}

export const CAST_PROMPT = (ctx) => `You are FishDock's Cast Advisor (Beta) for UK anglers. Look at the photo of the water the angler is facing.
Context from the app (may be empty): ${JSON.stringify(ctx)}.
Rules:
- For each feature, "for" lists up to 3 fish from the context's "likely" list that suit it; only names from that list.
- Describe ONLY features you can actually see in the photo: current seams, eddies, slack water behind obstructions, riffles and pool tails, outside bends, overhanging trees, weed beds, lily pads, reeds, rocks and ledges, gullies between rocks, breaking waves and surf tables, rips, visible colour changes, sandbars shown by wave breaks, harbour walls and piers, inflows and outfalls, sheltered corners.
- Never claim fish are present, never state depths or hidden underwater structure. Use "may", "often holds fish", "worth a cast".
- Give each feature a position as fractions of image width (x) and height (y), 0..1 from the top-left, pointing at where to land the bait or lure on the water.
- Flag anything unsafe that is visible (wet rocks, steep shelving shingle, big swell, fast or flooded water, overhead lines).
Reply with ONLY JSON:
{"summary": "one or two sentences", "scene": "beach|rocks|harbour|estuary|river|lake|canal|other",
 "features": [{"n": 1, "x": 0.4, "y": 0.6, "kind": "seam|eddy|slack|gully|rocks|weed|colour-change|surf|overhang|drop-off|structure|inflow|reeds", "label": "short name", "why": "why fish may hold here, one sentence", "how": "how to fish it: cast placement and approach, one sentence", "for": ["fish name from likely"], "confidence": "low|medium|high"}],
 "avoid": [{"x": 0.1, "y": 0.8, "label": "short", "why": "one sentence"}],
 "safety": ["short"]}
Give 2 to 5 features, best first. If the photo doesn't show water, return features: [] and say so in summary.`;

export const ID_PROMPT = (ctx, names) => `You are FishDock's fish identifier (Beta) for UK waters. Identify the fish in the photo.
Context: ${JSON.stringify(ctx || {})}. Known UK species ids: ${names}.
Reply with ONLY JSON: {"candidates": [{"species": "common name", "id": "matching id from the list or null", "confidence": "low|medium|high", "why": "visible features that support it"}], "lookalikes": ["species to rule out and how"], "note": "anything that limits the ID (angle, blur, juvenile)"}.
Give at most 3 candidates. If no fish is visible, return candidates: [] and explain in note. Do not guess wildly; low confidence is fine.`;

async function viaSample(prompt, image) {
  const s = await sampler();
  if (!s) return { error: "unavailable", message: "AI isn't available in this preview." };
  try {
    return await s.json(prompt, { images: [image], modelTier: "default" });
  } catch (e) {
    const code = e?.code || "upstream_error";
    const msg = code === "not_granted" ? "AI wasn't allowed for this page. You can allow it from the artifact's Permissions menu."
      : code === "rate_limited" ? "Too many AI requests just now. Try again in a minute."
      : code === "image_rejected" ? "That photo couldn't be read. Try another."
      : "The AI couldn't answer this time. Try again.";
    return { error: code, message: msg };
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
function cleanCast(r, likely = []) {
  if (!r || r.error) return r;
  const allowed = new Map(likely.map((n) => [n.toLowerCase(), n]));
  const features = (Array.isArray(r.features) ? r.features : []).slice(0, 6).map((f, i) => ({
    n: i + 1, x: clamp01(f.x), y: clamp01(f.y), kind: String(f.kind || "structure"), label: String(f.label || "Feature").slice(0, 60),
    why: String(f.why || "").slice(0, 240), how: String(f.how || "").slice(0, 240), confidence: ["low", "medium", "high"].includes(f.confidence) ? f.confidence : "low",
    for: [...new Set((Array.isArray(f.for) ? f.for : []).slice(0, 3).map((x) => allowed.get(String(x || "").toLowerCase().trim())).filter(Boolean))],
  }));
  const avoid = (Array.isArray(r.avoid) ? r.avoid : []).slice(0, 3).map((a) => ({ x: clamp01(a.x), y: clamp01(a.y), label: String(a.label || "Avoid").slice(0, 60), why: String(a.why || "").slice(0, 200) }));
  return { summary: String(r.summary || "").slice(0, 400), scene: r.scene || "other", features, avoid, safety: (Array.isArray(r.safety) ? r.safety : []).slice(0, 4).map((s) => String(s).slice(0, 160)), model: r.model || (PREVIEW ? "Claude (preview)" : "") };
}

export async function castAdvice(imageBlob, ctx) {
  if (PREVIEW) return cleanCast(await viaSample(CAST_PROMPT(ctx), imageBlob), ctx.likely || []);
  return cleanCast(await postJSON("/api/ai/cast", { image: await blobToBase64(imageBlob), context: ctx }), ctx.likely || []);
}

export async function identifyFish(imageBlob, ctx, speciesIds) {
  const r = PREVIEW ? await viaSample(ID_PROMPT(ctx, speciesIds.join(", ")), imageBlob) : await postJSON("/api/ai/identify", { image: await blobToBase64(imageBlob), context: ctx });
  if (r?.error) return r;
  return {
    candidates: (Array.isArray(r.candidates) ? r.candidates : []).slice(0, 3).map((c) => ({ species: String(c.species || "Unknown"), id: speciesIds.includes(c.id) ? c.id : null, confidence: ["low", "medium", "high"].includes(c.confidence) ? c.confidence : "low", why: String(c.why || "").slice(0, 240) })),
    lookalikes: (Array.isArray(r.lookalikes) ? r.lookalikes : []).slice(0, 3).map(String),
    note: String(r.note || "").slice(0, 300),
  };
}
