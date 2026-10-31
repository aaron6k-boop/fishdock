// Cloudflare Pages Function: POST /api/ai/cast, POST /api/ai/identify, GET /api/ai/status (Gemini; GEMINI_API_KEY). Requires the D1 database bound as `DB`.
import { handleAi } from "../../../server/ai.js";

export const onRequest = ({ request, env }) => handleAi(request, env);
