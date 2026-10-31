// Cloudflare Pages Function: POST /api/feedback (guests allowed, rate-limited). Requires the D1 database bound as `DB`.
import { handleFeedback } from "../../../server/feedback.js";

export const onRequest = ({ request, env }) => handleFeedback(request, env);
