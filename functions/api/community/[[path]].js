// Cloudflare Pages Function: all /api/community/* routes (feed, posts, reports, blocks, follows). Requires the D1 database bound as `DB`.
import { handleCommunity } from "../../../server/community.js";

export const onRequest = ({ request, env }) => handleCommunity(request, env);
