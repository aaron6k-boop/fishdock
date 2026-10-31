// Cloudflare Pages Function: GET/PUT/DELETE /api/sync, GET /api/sync/export (private per-account backup). Requires the D1 database bound as `DB`.
import { handleSync } from "../../../server/sync.js";

export const onRequest = ({ request, env }) => handleSync(request, env);
