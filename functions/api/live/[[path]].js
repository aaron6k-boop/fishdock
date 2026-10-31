// Cloudflare Pages Function: all /api/live/* routes (Live Fishing View private sharing). Requires the D1 database bound as `DB`.
import { handleLive } from "../../../server/live.js";

export const onRequest = ({ request, env }) => handleLive(request, env);
