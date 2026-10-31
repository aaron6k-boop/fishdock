// Cloudflare Pages Function: GET /api/health (public status check: sources switched on, database answering).
import { handleHealth } from "../../../server/health.js";

export const onRequest = ({ request, env }) => handleHealth(request, env);
