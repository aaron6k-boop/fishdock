// Cloudflare Pages Function: POST /api/metrics (whitelisted daily counters only). Requires the D1 database bound as `DB`.
import { handleMetrics } from "../../../server/metrics.js";

export const onRequest = ({ request, env }) => handleMetrics(request, env);
