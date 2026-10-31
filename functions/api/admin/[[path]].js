// Cloudflare Pages Function: all /api/admin/* routes (ADMIN_EMAILS / ADMIN_UIDS). Requires the D1 database bound as `DB`; anyone else gets 404.
import { handleAdmin } from "../../../server/admin.js";

export const onRequest = ({ request, env }) => handleAdmin(request, env);
